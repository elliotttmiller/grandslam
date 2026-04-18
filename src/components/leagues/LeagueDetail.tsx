import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Trophy, Users, Calendar, Globe, Lock, Shield,
  Copy, Check, ChevronRight, Plus, Loader2, X, Medal, BarChart3, Sparkles, TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getLeague,
  saveLeague,
  setLeaguePool,
  addMember,
  removeMember,
  deleteLeague,
} from '@/lib/league-storage';
import {
  subscribeToLeague,
  syncAddLeagueMember,
  syncDeleteLeague,
  syncRemoveLeagueMember,
  syncSetLeaguePool,
} from '@/services/leagueSyncService';
import {
  createPool,
  addEntry as addPoolEntry,
  getPool,
  savePool,
} from '@/lib/pool-storage';
import { syncCreatePool, syncAddEntry } from '@/services/poolSyncService';
import { calculatePoolEntryScore } from '@/lib/scoring';
import type { League, LeagueStanding } from '@/lib/league-types';
import type { Pool } from '@/lib/pool-types';
import type { AppView } from '@/App';
import type { User } from 'firebase/auth';
import type { TournamentData } from '@/services/geminiService';

interface LeagueDetailProps {
  leagueId: string;
  onNavigate: (view: AppView) => void;
  authUser: User | null;
  tournaments: TournamentData[];
  /** Generates the official draw for a tournament (matches). */
  onGenerateOfficialDraw: (tournamentId: string, tournamentName: string) => Promise<import('@/lib/bracket-utils').Match[]>;
  /**
   * Incremented by the simulator panel whenever it writes new official results
   * to localStorage. Forces a re-render so `computeStandings` re-reads pool
   * data fresh and standings reflect the latest round.
   */
  poolVersion?: number;
}

export function LeagueDetail({
  leagueId,
  onNavigate,
  authUser,
  tournaments,
  onGenerateOfficialDraw,
  poolVersion,
}: LeagueDetailProps) {
  const [league, setLeague] = useState<League | null>(getLeague(leagueId));
  const [activeTab, setActiveTab] = useState<'hub' | 'standings' | 'pools' | 'members'>('hub');
  const [copied, setCopied] = useState(false);
  const [joiningPool, setJoiningPool] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHubInsightsModal, setShowHubInsightsModal] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});

  const userId = authUser?.uid ?? '';
  const isOwner = league?.createdBy === userId;
  const isMember = league?.members.some(m => m.userId === userId) ?? false;

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeToLeague(leagueId, (updated) => {
      saveLeague(updated);
      setLeague(prevLeague => {
        if (prevLeague?.id === updated.id) {
          setPreviousRanks(buildRankMap(computeStandings(prevLeague)));
        } else {
          setPreviousRanks({});
        }
        return updated;
      });
    });
    return unsubscribe;
  }, [leagueId]);

  // Bump a local tick whenever the simulator applies a new round so that
  // computeStandings() (which reads getPool() from localStorage) re-runs
  // and standings reflect the latest results in real time.
  const [poolDataTick, setPoolDataTick] = useState(0);
  useEffect(() => {
    if (!poolVersion) return;
    setPoolDataTick(v => v + 1);
  }, [poolVersion]);

  const refreshLeague = useCallback(() => {
    setLeague(getLeague(leagueId));
  }, [leagueId]);

  const handleCopyCode = async () => {
    if (!league) return;
    try {
      await navigator.clipboard.writeText(league.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  };

  const handleJoinPool = async (tournamentId: string, tournamentName: string) => {
    if (!league || !authUser) return;
    setJoiningPool(tournamentId);
    try {
      let poolId = league.tournamentPoolIds[tournamentId];
      let pool: Pool | null = poolId ? getPool(poolId) : null;

      // Create pool if it doesn't exist yet
      if (!pool) {
        const officialMatches = await onGenerateOfficialDraw(tournamentId, tournamentName);
        const poolName = `${league.name} — ${tournamentName}`;
        pool = createPool(poolName, tournamentId, tournamentName, officialMatches, userId);
        pool.leagueId = league.id;
        savePool(pool);
        poolId = pool.id;

        // Persist pool link in the league
        setLeaguePool(league.id, tournamentId, poolId);
        await syncCreatePool(pool);
        await syncSetLeaguePool(league.id, tournamentId, poolId);
        refreshLeague();
      }

      // Check if the user already has an entry in this pool
      const existing = pool.entries.find(e => e.userId === userId);
      if (existing) {
        onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: existing.id });
        return;
      }

      // Add a blank entry for the user
      const entryId = `${userId.slice(0, 8)}-${Date.now()}`;
      const displayName = authUser.displayName ?? authUser.email ?? 'Member';
      const newEntry = {
        id: entryId,
        userId,
        userName: displayName,
        bracketName: `${displayName}'s Bracket`,
        matches: pool.officialMatches.map(m => ({ ...m, winnerId: null as string | null })),
        isSubmitted: false,
      };
      addPoolEntry(pool.id, newEntry);
      await syncAddEntry(pool.id, newEntry);

      onNavigate({ page: 'pool-entry', poolId: pool.id, entryId });
    } finally {
      setJoiningPool(null);
    }
  };

  const handleLeave = async () => {
    if (!league) return;
    setIsLeaving(true);
    try {
      removeMember(league.id, userId);
      await syncRemoveLeagueMember(league.id, userId);
      onNavigate({ page: 'my-leagues' });
    } finally {
      setIsLeaving(false);
    }
  };

  const handleDelete = async () => {
    if (!league) return;
    const deletedRemotely = await syncDeleteLeague(league.id);
    if (!deletedRemotely) {
      console.error(`League delete aborted: Firestore delete failed for ${league.id}.`);
      window.alert('Could not delete this league right now. Please try again.');
      return;
    }
    deleteLeague(league.id);
    onNavigate({ page: 'my-leagues' });
  };

  if (!league) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        League not found.
      </div>
    );
  }

  // Compute standings — useMemo re-runs when `league` changes (Firestore push)
  // or when `poolDataTick` increments (simulator writes a new round to localStorage),
  // ensuring computeStandings() re-reads getPool() with fresh data each time.
  const standings = useMemo(
    () => computeStandings(league),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, poolDataTick],
  );

  // Tournaments for this league's year
  const leagueTournaments = tournaments.filter(t => {
    const year = new Date(t.startDate).getFullYear();
    return year === league.year;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex-none border-b border-border/25">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground mb-4 -ml-2 rounded-xl"
            onClick={() => onNavigate({ page: 'my-leagues' })}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            My Leagues
          </Button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-black tracking-tight">{league.name}</h1>
                {league.isPrivate ? (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full border border-amber-500/25">
                    <Lock className="h-2.5 w-2.5" /> Private
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                    <Globe className="h-2.5 w-2.5" /> Public
                  </span>
                )}
              </div>
              {league.description && (
                <p className="text-sm text-muted-foreground/70 mb-2">{league.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground/60 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {league.year}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {league.members.length} member{league.members.length !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> {league.createdByName}
                </span>
              </div>
            </div>

            {/* Invite code */}
            <button
              onClick={handleCopyCode}
              className="shrink-0 w-full sm:w-auto justify-center sm:justify-start flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono font-bold hover:bg-white/8 transition-colors"
              aria-label="Copy invite code"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              {league.id}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {(['hub', 'standings', 'pools', 'members'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 sm:px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-all',
                  activeTab === tab
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-muted-foreground/60 hover:text-muted-foreground',
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'hub' && (
            <motion.div
              key="hub"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <HubTab
                league={league}
                standings={standings}
                leagueTournaments={leagueTournaments}
                onOpenInsights={() => setShowHubInsightsModal(true)}
              />
            </motion.div>
          )}
          {activeTab === 'standings' && (
            <motion.div
              key="standings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <StandingsTab standings={standings} userId={userId} previousRanks={previousRanks} />
            </motion.div>
          )}
          {activeTab === 'pools' && (
            <motion.div
              key="pools"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <PoolsTab
                league={league}
                leagueTournaments={leagueTournaments}
                userId={userId}
                joiningPool={joiningPool}
                onJoinPool={handleJoinPool}
                onNavigate={onNavigate}
              />
            </motion.div>
          )}
          {activeTab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <MembersTab league={league} userId={userId} standings={standings} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leave / Delete actions */}
        <div className="mt-10 pt-6 border-t border-white/5 flex flex-wrap gap-3">
          {!isOwner && isMember && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
              disabled={isLeaving}
              onClick={handleLeave}
            >
              {isLeaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Leave League
            </Button>
          )}
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete League
            </Button>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      <AnimatePresence>
        {showHubInsightsModal && (
          <LeagueInsightsModal
            league={league}
            standings={standings}
            leagueTournaments={leagueTournaments}
            onClose={() => setShowHubInsightsModal(false)}
          />
        )}
        {showDeleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-50"
              onClick={() => setShowDeleteConfirm(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto bg-card border border-white/10 rounded-2xl shadow-2xl p-6"
              role="dialog" aria-modal="true"
            >
              <h3 className="text-base font-bold mb-2">Delete League?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                This will remove the league from your device. Other members may still have a copy.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button size="sm" className="rounded-xl bg-red-600 hover:bg-red-500 text-white border-0" onClick={handleDelete}>Delete</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hub tab
// ---------------------------------------------------------------------------

interface HubTabProps {
  league: League;
  standings: LeagueStanding[];
  leagueTournaments: TournamentData[];
  onOpenInsights: () => void;
}

function HubTab({ league, standings, leagueTournaments, onOpenInsights }: HubTabProps) {
  const poolIds = Object.values(league.tournamentPoolIds);
  const now = new Date();
  const activeTournamentCount = leagueTournaments.filter(t => {
    const start = new Date(t.startDate);
    const end = new Date(t.endDate);
    return now >= start && now <= end;
  }).length;
  const completedResults = buildLeagueResults(league, leagueTournaments).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/40 mb-1">
            League dashboard
          </p>
          <h2 className="text-lg font-black tracking-tight text-foreground">Hub</h2>
        </div>
        <Button size="sm" variant="outline" className="rounded-xl w-full sm:w-auto justify-center" onClick={onOpenInsights}>
          <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
          View insights
        </Button>
      </div>

      <div className="space-y-2">
        <HubStatCard
          label="Leader"
          value={standings[0]?.userName ?? '—'}
          detail={standings[0] ? `${standings[0].totalPoints} pts` : '—'}
        />
        <HubStatCard label="Members" value={String(league.members.length)} detail="Competing this season" />
        <HubStatCard label="Tournament pools" value={String(poolIds.length)} detail={`${activeTournamentCount} active now`} />
        <HubStatCard label="Scheduled events" value={String(leagueTournaments.length)} detail={`Calendar year ${league.year}`} />
      </div>

      <div className="bg-card/40 border border-white/6 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <h3 className="text-sm font-bold">Recent tournament results</h3>
        </div>
        {completedResults.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-2">Completed results will appear here once pools finish.</p>
        ) : (
          <div className="space-y-2">
            {completedResults.map(result => (
              <div key={result.pool.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-background/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{result.tournamentName}</p>
                  <p className="text-[11px] text-muted-foreground/60">
                    Winner: <span className="text-emerald-300 font-semibold">{result.winnerName}</span>
                  </p>
                </div>
                <p className="text-xs font-black text-emerald-400 shrink-0">
                  {result.winnerPoints} pts
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HubStatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-card/35 border border-white/8 rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/45">{label}</p>
          <p className="text-[11px] text-muted-foreground/65 mt-0.5 truncate">{detail}</p>
        </div>
        <p className="text-sm sm:text-base font-black text-foreground text-right max-w-[55%] break-words leading-tight">{value}</p>
      </div>
    </div>
  );
}

function LeagueInsightsModal({
  league,
  standings,
  leagueTournaments,
  onClose,
}: {
  league: League;
  standings: LeagueStanding[];
  leagueTournaments: TournamentData[];
  onClose: () => void;
}) {
  const results = buildLeagueResults(league, leagueTournaments);
  const pointsTotal = standings.reduce((sum, s) => sum + s.totalPoints, 0);
  const averagePoints = standings.length > 0 ? Math.round(pointsTotal / standings.length) : 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-50"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-2xl mx-auto bg-card border border-white/10 rounded-2xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold">League Hub Insights</h3>
            <p className="text-xs text-muted-foreground/65">{league.name} · {league.year}</p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={onClose} aria-label="Close insights">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <HubStatCard label="Total points" value={String(pointsTotal)} detail="Across all members" />
          <HubStatCard label="Average points" value={String(averagePoints)} detail="Per member" />
          <HubStatCard label="Pools linked" value={String(Object.keys(league.tournamentPoolIds).length)} detail="Created so far" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/40 mb-2">Recent results</p>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground/70 py-3">No completed results yet.</p>
          ) : (
            results.slice(0, 8).map(result => (
              <div key={result.pool.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-background/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{result.tournamentName}</p>
                  <p className="text-[11px] text-muted-foreground/60">
                    {result.winnerName} won with {result.winnerPoints} pts
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground/55 shrink-0">
                  {result.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Standings tab
// ---------------------------------------------------------------------------

function StandingsTab({
  standings,
  userId,
  previousRanks,
}: {
  standings: LeagueStanding[];
  userId: string;
  previousRanks: Record<string, number>;
}) {
  if (standings.length === 0) {
    return (
      <div className="text-center py-16">
        <Medal className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No tournament pools have been played yet. Standings will appear once members start competing.
        </p>
      </div>
    );
  }

  const rankColors: Record<number, string> = {
    1: 'text-amber-400',
    2: 'text-zinc-300',
    3: 'text-orange-400',
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/40 mb-4">
        Year-long standings
      </p>
      {standings.map((s, i) => {
        const rank = i + 1;
        const isMe = s.userId === userId;
        return (
          <div
            key={s.userId}
            className={cn(
              'flex items-center gap-4 px-4 py-3 rounded-xl border transition-all',
              isMe
                ? 'bg-emerald-500/8 border-emerald-500/20'
                : 'bg-card/40 border-white/6 hover:border-white/12',
            )}
          >
            <span className={cn('text-sm font-black w-6 text-center', rankColors[rank] ?? 'text-muted-foreground/40')}>
              {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
            </span>
            <div className="flex-1 min-w-0">
              <p className={cn('font-semibold truncate text-sm', isMe ? 'text-emerald-300' : 'text-foreground')}>
                {s.userName}{isMe && <span className="ml-1.5 text-[10px] text-emerald-400/70">(you)</span>}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] text-muted-foreground/50">
                  {s.tournamentsPlayed} tournament{s.tournamentsPlayed !== 1 ? 's' : ''} played
                </p>
                <RankChangeBadge currentRank={rank} previousRank={previousRanks[s.userId]} />
              </div>
            </div>
            <span className="text-base font-black text-emerald-400">
              {s.totalPoints}
              <span className="text-xs font-semibold text-muted-foreground/40 ml-1">pts</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RankChangeBadge({ currentRank, previousRank }: { currentRank: number; previousRank?: number }) {
  if (previousRank === undefined) return null;
  const positionsGained = previousRank - currentRank;
  if (positionsGained === 0) return null;

  if (positionsGained > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-300/85 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-1.5 py-0.5">
        <TrendingUp className="h-2.5 w-2.5" />
        +{positionsGained}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-300/85 bg-amber-500/10 border border-amber-500/25 rounded-full px-1.5 py-0.5">
      <TrendingDown className="h-2.5 w-2.5" />
      {positionsGained}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pools tab
// ---------------------------------------------------------------------------

interface PoolsTabProps {
  league: League;
  leagueTournaments: TournamentData[];
  userId: string;
  joiningPool: string | null;
  onJoinPool: (tournamentId: string, tournamentName: string) => Promise<void>;
  onNavigate: (view: AppView) => void;
}

function PoolsTab({ league, leagueTournaments, userId, joiningPool, onJoinPool, onNavigate }: PoolsTabProps) {
  const now = new Date();

  return (
    <div className="space-y-3">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/40 mb-4">
        Tournament pools ({leagueTournaments.length} tournaments in {league.year})
      </p>
      {leagueTournaments.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No tournaments found for {league.year}.
        </p>
      )}
      {leagueTournaments.map(t => {
        const poolId = league.tournamentPoolIds[t.id];
        const pool = poolId ? getPool(poolId) : null;
        const myEntry = pool?.entries.find(e => e.userId === userId);
        const start = new Date(t.startDate);
        const end = new Date(t.endDate);
        const isLive = now >= start && now <= end;
        const isPast = end < now;
        const isUpcoming = start > now;
        const isJoining = joiningPool === t.id;

        return (
          <div
            key={t.id}
            className="bg-card/40 border border-white/6 rounded-xl px-4 py-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="font-semibold text-sm truncate">{t.name}</span>
                {isLive && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                    Live
                  </span>
                )}
                {isPast && !isLive && (
                  <span className="text-[9px] font-bold text-white/25 bg-white/4 px-1.5 py-0.5 rounded-full border border-white/8">
                    Past
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/50">
                {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' – '}
                {end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              {myEntry && pool && (
                <PoolEntryScore entry={myEntry} pool={pool} />
              )}
            </div>
            {myEntry && pool ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl shrink-0 w-full sm:w-auto justify-center"
                  onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: myEntry.id })}
                >
                <ChevronRight className="h-3.5 w-3.5" />
                View
              </Button>
            ) : (
                <Button
                  size="sm"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0 shrink-0 w-full sm:w-auto justify-center"
                  disabled={isJoining}
                  onClick={() => onJoinPool(t.id, t.name)}
                >
                {isJoining ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <><Plus className="h-3.5 w-3.5 mr-1" />Enter</>
                )}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members tab
// ---------------------------------------------------------------------------

function MembersTab({
  league,
  userId,
  standings,
}: {
  league: League;
  userId: string;
  standings: LeagueStanding[];
}) {
  const standingsMap = new Map(standings.map(s => [s.userId, s]));

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/40 mb-4">
        {league.members.length} member{league.members.length !== 1 ? 's' : ''}
      </p>
      {league.members.map(member => {
        const standing = standingsMap.get(member.userId);
        const isMe = member.userId === userId;
        const isOwner = member.userId === league.createdBy;
        return (
          <div
            key={member.userId}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl border',
              isMe ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-card/40 border-white/6',
            )}
          >
            <div className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-white/60">
                {member.userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn('text-sm font-semibold', isMe ? 'text-emerald-300' : 'text-foreground')}>
                  {member.userName}
                </span>
                {isOwner && (
                  <span className="text-[9px] font-black uppercase text-violet-400 bg-violet-500/15 px-1.5 py-0.5 rounded-full border border-violet-500/25">
                    Creator
                  </span>
                )}
                {isMe && !isOwner && (
                  <span className="text-[9px] text-emerald-400/60">(you)</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/40">
                Joined {new Date(member.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            {standing && standing.totalPoints > 0 && (
              <span className="text-sm font-black text-emerald-400 shrink-0">
                {standing.totalPoints}
                <span className="text-[10px] font-semibold text-muted-foreground/40 ml-0.5">pts</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score mini-display for pool entries in the pools tab
// ---------------------------------------------------------------------------

function PoolEntryScore({ entry, pool }: { entry: import('@/lib/pool-types').PoolEntry; pool: Pool }) {
  const score = calculatePoolEntryScore(entry.matches, pool.officialMatches);
  if (score.total === 0 && score.picksCompleted === 0) return null;
  return (
    <p className="text-[11px] text-emerald-400/80 mt-0.5 font-medium">
      {score.total} pts · {score.picksCompleted} correct pick{score.picksCompleted !== 1 ? 's' : ''}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Standings computation
// ---------------------------------------------------------------------------

function computeStandings(league: League): LeagueStanding[] {
  const poolIds = Object.values(league.tournamentPoolIds);
  const standingMap = new Map<string, LeagueStanding>();

  // Initialise with all members at 0
  for (const member of league.members) {
    standingMap.set(member.userId, {
      userId: member.userId,
      userName: member.userName,
      totalPoints: 0,
      pointsByPool: {},
      tournamentsPlayed: 0,
    });
  }

  for (const poolId of poolIds) {
    const pool = getPool(poolId);
    if (!pool) continue;

    for (const entry of pool.entries) {
      const standing = standingMap.get(entry.userId ?? '');
      if (!standing) continue;
      const score = calculatePoolEntryScore(entry.matches, pool.officialMatches);
      standing.totalPoints += score.total;
      standing.pointsByPool[poolId] = score.total;
      if (score.picksCompleted > 0 || entry.isSubmitted) {
        standing.tournamentsPlayed++;
      }
    }
  }

  return Array.from(standingMap.values()).sort((a, b) => b.totalPoints - a.totalPoints);
}

function buildRankMap(standings: LeagueStanding[]): Record<string, number> {
  const rankMap: Record<string, number> = {};
  standings.forEach((standing, i) => {
    rankMap[standing.userId] = i + 1;
  });
  return rankMap;
}

function buildLeagueResults(league: League, leagueTournaments: TournamentData[]) {
  const tournamentsById = new Map(leagueTournaments.map(t => [t.id, t]));
  return Object.entries(league.tournamentPoolIds)
    .map(([tournamentId, poolId]) => {
      const pool = getPool(poolId);
      const tournament = tournamentsById.get(tournamentId);
      if (!pool || !tournament) return null;

      const endDate = new Date(tournament.endDate);
      if (endDate > new Date()) return null;
      if (pool.entries.length === 0) return null;

      let winnerName = '—';
      let winnerPoints = -1;
      for (const entry of pool.entries) {
        const score = calculatePoolEntryScore(entry.matches, pool.officialMatches);
        if (score.total > winnerPoints) {
          winnerName = entry.userName;
          winnerPoints = score.total;
        }
      }

      return {
        pool,
        tournamentName: tournament.name,
        winnerName,
        winnerPoints,
        endDate,
      };
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
}
