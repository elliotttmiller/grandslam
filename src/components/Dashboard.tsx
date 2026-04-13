import { motion } from 'framer-motion';
import { Plus, Users, Trophy, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPools, getPool } from '@/lib/pool-storage';
import { calculateBracketScore } from '@/lib/scoring';
import { getUserId } from '@/lib/user-identity';
import type { AppView } from '@/App';
import type { Pool, PoolEntry } from '@/lib/pool-types';

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onCreatePool?: () => void;
}

export function Dashboard({ onNavigate, onCreatePool }: DashboardProps) {
  const userId = getUserId();
  const allPools = getPools();
  
  const handleCreatePoolClick = () => {
    if (onCreatePool) {
      onCreatePool();
    } else {
      onNavigate({ page: 'pools' });
    }
  };
  
  // Get pools where current user has entries
  const userPools = allPools.filter(pool => 
    pool.entries.some(entry => entry.userId === userId)
  );

  // Calculate metrics
  const totalPoolsJoined = userPools.length;
  const totalBracketsSubmitted = userPools.reduce((sum, pool) => {
    const userEntry = pool.entries.find(e => e.userId === userId);
    return sum + (userEntry?.isSubmitted ? 1 : 0);
  }, 0);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 },
    },
  };

  return (
    <div className="flex-1 overflow-auto">
      <motion.div
        className="min-h-full bg-linear-to-b from-background to-background p-6 sm:p-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mb-12"
          >
            <motion.div variants={itemVariants} className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
                Dashboard
              </h1>
              <p className="text-muted-foreground">
                Manage your pools and track your bracket performance
              </p>
            </motion.div>

            {/* Metrics Cards */}
            <motion.div
              variants={itemVariants}
              className="grid grid-cols-2 sm:grid-cols-3 gap-4"
            >
              <div className="bg-card/60 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
                  Pools Joined
                </div>
                <p className="text-3xl font-black text-emerald-400">{totalPoolsJoined}</p>
              </div>

              <div className="bg-card/60 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
                  Submitted
                </div>
                <p className="text-3xl font-black text-blue-400">{totalBracketsSubmitted}</p>
              </div>

              <div className="bg-card/60 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
                  Active
                </div>
                <p className="text-3xl font-black text-amber-400">
                  {totalPoolsJoined - totalBracketsSubmitted}
                </p>
              </div>
            </motion.div>
          </motion.div>

            {/* CTA Button */}
            <motion.div variants={itemVariants} className="mb-12">
              <Button
                size="lg"
                onClick={handleCreatePoolClick}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border-0 font-semibold px-6 py-3"
              >
                <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
                Create New Pool
              </Button>
            </motion.div>

          {/* Pools Section */}
          {userPools.length > 0 ? (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.h2
                variants={itemVariants}
                className="text-xl font-bold text-foreground mb-6"
              >
                Your Pools
              </motion.h2>

              <div className="space-y-6">
                {userPools.map((pool) => (
                  <PoolBracketList
                    key={pool.id}
                    pool={pool}
                    userId={userId}
                    onSelectBracket={(entryId) =>
                      onNavigate({ page: 'pool-entry', poolId: pool.id, entryId })
                    }
                    itemVariants={itemVariants}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              variants={itemVariants}
              className="text-center py-16"
            >
              <Trophy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" aria-hidden="true" />
              <p className="text-muted-foreground mb-4">
                No pools yet. Create or join a pool to get started!
              </p>
              <Button
                onClick={handleCreatePoolClick}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border-0 font-semibold"
              >
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Create Pool
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

interface PoolBracketListProps {
  pool: Pool;
  userId: string;
  onSelectBracket: (entryId: string) => void;
  itemVariants: any;
}

function PoolBracketList({
  pool,
  userId,
  onSelectBracket,
  itemVariants,
}: PoolBracketListProps) {
  const userEntry = pool.entries.find(e => e.userId === userId);

  if (!userEntry) return null;

  const score = calculateBracketScore(userEntry.matches);

  return (
    <motion.div
      variants={itemVariants}
      className="bg-card/40 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors"
    >
      {/* Pool Header */}
      <div className="bg-white/3 backdrop-blur-sm border-b border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-emerald-400" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-foreground">{pool.name}</h3>
              <p className="text-xs text-muted-foreground">{pool.tournamentName}</p>
            </div>
          </div>
          {userEntry.isSubmitted && (
            <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-xs font-semibold text-emerald-400">
              Submitted
            </div>
          )}
        </div>
      </div>

      {/* Bracket Card */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onSelectBracket(userEntry.id)}
        className="w-full p-6 hover:bg-white/5 transition-colors text-left group"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-foreground mb-1">{userEntry.bracketName}</p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground/80">
              <span>
                {score.picksCompleted} / {score.maxPossible} picks
              </span>
              {score.total > 0 && (
                <span className="text-emerald-400 font-medium">
                  {score.total} pts
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground/60 group-hover:translate-x-1 transition-all" aria-hidden="true" />
        </div>

        {/* Score Breakdown */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
            <div className="text-muted-foreground/60 mb-1">Base</div>
            <div className="font-semibold text-foreground">{score.basePoints}</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
            <div className="text-muted-foreground/60 mb-1">Upset Bonus</div>
            <div className="font-semibold text-amber-400">{score.upsetBonus > 0 ? '+' : ''}{score.upsetBonus}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
            <div className="text-emerald-400/60 mb-1">Total</div>
            <div className="font-bold text-emerald-400">{score.total}</div>
          </div>
        </div>
      </motion.button>
    </motion.div>
  );
}
