import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Plus, Users, Globe, Lock, ChevronRight, Calendar, Shield, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLeagues } from '@/lib/league-storage';
import { calculatePoolEntryScore } from '@/lib/scoring';
import { getPool } from '@/lib/pool-storage';
import type { League } from '@/lib/league-types';
import type { AppView } from '@/App';
import type { User } from 'firebase/auth';

interface MyLeaguesProps {
  onNavigate: (view: AppView) => void;
  authUser: User | null;
}

export function MyLeagues({ onNavigate, authUser }: MyLeaguesProps) {
  const [leagues, setLeagues] = useState<League[]>([]);

  const refreshLeagues = useCallback(() => {
    if (!authUser) return;
    const all = getLeagues();
    // Show leagues where the user is a member
    setLeagues(all.filter(l => l.members.some(m => m.userId === authUser.uid)));
  }, [authUser]);

  useEffect(() => {
    refreshLeagues();
  }, [refreshLeagues]);

  const userId = authUser?.uid ?? '';
  const myCreated = leagues.filter(l => l.createdBy === userId);
  const myJoined = leagues.filter(l => l.createdBy !== userId);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  if (leagues.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-5 py-12 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <p className="font-semibold text-foreground mb-1">No leagues yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Create or join a league to start competing year-long.
          </p>
          <Button
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
            onClick={() => onNavigate({ page: 'leagues' })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Browse Leagues
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <motion.div
        className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-8">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight mb-1">My Leagues</h1>
          <p className="text-sm text-muted-foreground">
            {leagues.length} league{leagues.length !== 1 ? 's' : ''} · your year-long competitions
          </p>
        </motion.div>

        {/* Created */}
        {myCreated.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground/50 mb-3 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5" /> Leagues I Created
            </h2>
            <div className="space-y-3">
              {myCreated.map(league => (
                <MyLeagueCard
                  key={league.id}
                  league={league}
                  userId={userId}
                  onClick={() => onNavigate({ page: 'league-detail', leagueId: league.id })}
                  itemVariants={itemVariants}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Joined */}
        {myJoined.length > 0 && (
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground/50 mb-3 flex items-center gap-2">
              <Star className="h-3.5 w-3.5" /> Leagues I Joined
            </h2>
            <div className="space-y-3">
              {myJoined.map(league => (
                <MyLeagueCard
                  key={league.id}
                  league={league}
                  userId={userId}
                  onClick={() => onNavigate({ page: 'league-detail', leagueId: league.id })}
                  itemVariants={itemVariants}
                />
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface MyLeagueCardProps {
  league: League;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any;
  onClick: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemVariants: any;
}

function MyLeagueCard({ league, userId, onClick, itemVariants }: MyLeagueCardProps) {
  const isOwner = league.createdBy === userId;
  const memberCount = league.members.length;
  const poolIds = Object.values(league.tournamentPoolIds);
  const poolCount = poolIds.length;

  // Compute this user's total points across all league pools
  const myTotalPoints = poolIds.reduce((sum, poolId) => {
    const pool = getPool(poolId);
    if (!pool) return sum;
    const entry = pool.entries.find(e => e.userId === userId);
    if (!entry) return sum;
    const score = calculatePoolEntryScore(entry.matches, pool.officialMatches);
    return sum + score.total;
  }, 0);

  return (
    <motion.button
      variants={itemVariants}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="w-full text-left bg-card/50 border border-white/8 rounded-2xl p-4 sm:p-5 hover:border-white/15 hover:bg-card/70 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-foreground">{league.name}</span>
            {league.isPrivate ? (
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full border border-amber-500/25">
                <Lock className="h-2.5 w-2.5" /> Private
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                <Globe className="h-2.5 w-2.5" /> Public
              </span>
            )}
            {isOwner && (
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-violet-400 bg-violet-500/15 px-1.5 py-0.5 rounded-full border border-violet-500/25">
                <Shield className="h-2.5 w-2.5" /> Creator
              </span>
            )}
          </div>
          {league.description && (
            <p className="text-xs text-muted-foreground/70 mb-2">{league.description}</p>
          )}
          <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {league.year}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </span>
            {poolCount > 0 && (
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                {poolCount} pool{poolCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {myTotalPoints > 0 && (
            <span className="text-sm font-black text-emerald-400">
              {myTotalPoints} <span className="text-xs font-semibold text-muted-foreground/50">pts</span>
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </motion.button>
  );
}
