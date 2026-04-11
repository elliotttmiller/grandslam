import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Plus, Users, ChevronRight, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPools, getPool, createPool, addEntry, generateId, importPool } from '@/lib/pool-storage';
import { calculateBracketScore } from '@/lib/scoring';
import type { Pool } from '@/lib/pool-types';
import type { TournamentData } from '@/services/geminiService';
import type { AppView } from '@/App';

const TOURNAMENT_COLORS: Record<string, string> = {
  ao: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  rg: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  wim: 'text-green-400 bg-green-500/10 border-green-500/20',
  uso: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

function tournamentColor(id: string): string {
  const key = Object.keys(TOURNAMENT_COLORS).find(k => id.toLowerCase().startsWith(k));
  return key ? TOURNAMENT_COLORS[key] : 'text-primary bg-primary/10 border-primary/20';
}

interface PoolHubProps {
  onNavigate: (view: AppView) => void;
  tournaments: TournamentData[];
  onCreatePool: (
    poolName: string,
    userName: string,
    bracketName: string,
    tournamentId: string,
    tournamentName: string
  ) => Promise<void>;
}

export function PoolHub({ onNavigate, tournaments, onCreatePool }: PoolHubProps) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Create pool form state
  const [createPoolName, setCreatePoolName] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createBracketName, setCreateBracketName] = useState('');
  const [createTournamentId, setCreateTournamentId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Join pool form state
  const [joinCode, setJoinCode] = useState('');
  const [joinUserName, setJoinUserName] = useState('');
  const [joinBracketName, setJoinBracketName] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    setPools(getPools());
    const savedName = localStorage.getItem('gs_user_name') ?? '';
    setCreateUserName(savedName);
    setJoinUserName(savedName);
  }, []);

  const refreshPools = () => setPools(getPools());

  const handleCreateSubmit = async () => {
    if (!createPoolName.trim() || !createUserName.trim() || !createTournamentId) return;
    const tournament = tournaments.find(t => t.id === createTournamentId);
    if (!tournament) return;

    localStorage.setItem('gs_user_name', createUserName.trim());
    setIsCreating(true);
    try {
      await onCreatePool(
        createPoolName.trim(),
        createUserName.trim(),
        createBracketName.trim() || `${createUserName.trim()}'s Bracket`,
        tournament.id,
        tournament.name
      );
      setShowCreate(false);
      refreshPools();
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSubmit = () => {
    setJoinError('');
    const code = joinCode.trim().toUpperCase();
    if (!code || !joinUserName.trim()) return;

    // Try to find pool locally by ID (pool IDs are the codes)
    const pool = getPool(code);
    if (!pool) {
      setJoinError('Pool not found. Ask the pool creator to share the invite link.');
      return;
    }

    localStorage.setItem('gs_user_name', joinUserName.trim());

    const entryId = generateId();
    const bracketName = joinBracketName.trim() || `${joinUserName.trim()}'s Bracket`;

    addEntry(pool.id, {
      id: entryId,
      userName: joinUserName.trim(),
      bracketName,
      matches: pool.officialMatches.map(m => ({ ...m, winnerId: null })),
      isSubmitted: false,
    });

    setShowJoin(false);
    onNavigate({ page: 'pool-entry', poolId: pool.id, entryId });
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex-none px-5 py-5 border-b border-border/25">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Bracket Pools</h2>
            <p className="text-[12px] text-muted-foreground/70 mt-0.5">Compete with friends on Grand Slam picks</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowJoin(true)}>
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Join
            </Button>
            <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 py-5">
        <div className="max-w-4xl mx-auto">
          {pools.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-20 gap-5 text-center"
            >
              <div className="h-16 w-16 rounded-2xl bg-muted/25 border border-border/30 flex items-center justify-center">
                <Trophy className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-semibold text-base">No pools yet</p>
                <p className="text-[13px] text-muted-foreground/70 mt-1.5 max-w-[220px]">
                  Create your first pool and invite friends to compete!
                </p>
              </div>
              <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Pool
              </Button>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pools.map((pool, i) => {
                const topEntries = [...pool.entries]
                  .map(e => ({ ...e, score: calculateBracketScore(e.matches) }))
                  .sort((a, b) => b.score.total - a.score.total)
                  .slice(0, 3);

                return (
                  <motion.div
                    key={pool.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                    className="bg-card/60 border border-border/40 rounded-2xl p-4 flex items-center justify-between gap-4 hover:border-border/70 hover:bg-card/80 transition-all duration-150"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14px] truncate">{pool.name}</span>
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                          tournamentColor(pool.tournamentId)
                        )}>
                          {pool.tournamentName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-[12px] text-muted-foreground/70 flex items-center gap-1">
                          <Users className="inline h-3 w-3" />
                          {pool.entries.length} {pool.entries.length === 1 ? 'entry' : 'entries'}
                        </span>
                        {topEntries.length > 0 && (
                          <div className="flex items-center gap-2">
                            {topEntries.map((e, rank) => (
                              <span key={e.id} className="text-[11px] text-muted-foreground/70 flex items-center gap-0.5">
                                {rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'}
                                <span className="ml-0.5">{e.userName}</span>
                                <span className="ml-0.5 font-bold text-foreground/80 tabular-nums">{e.score.total}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 rounded-xl text-muted-foreground/70 hover:text-foreground"
                      onClick={() => onNavigate({ page: 'pool', poolId: pool.id })}
                    >
                      View <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Pool Modal */}
      <AnimatePresence>
        {showCreate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isCreating && setShowCreate(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-card border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Create a Pool</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowCreate(false)} disabled={isCreating}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Pool Name <span className="text-red-400">*</span></span>
                  <input
                    type="text"
                    value={createPoolName}
                    onChange={e => setCreatePoolName(e.target.value)}
                    placeholder="e.g. Miller Family Pool"
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Your Name <span className="text-red-400">*</span></span>
                  <input
                    type="text"
                    value={createUserName}
                    onChange={e => setCreateUserName(e.target.value)}
                    placeholder="e.g. John Smith"
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Your Bracket Name <span className="text-muted-foreground/50 font-normal">(optional)</span></span>
                  <input
                    type="text"
                    value={createBracketName}
                    onChange={e => setCreateBracketName(e.target.value)}
                    placeholder={createUserName ? `${createUserName}'s Bracket` : "e.g. Dark Horse Picks"}
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Tournament <span className="text-red-400">*</span></span>
                  <select
                    value={createTournamentId}
                    onChange={e => setCreateTournamentId(e.target.value)}
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  >
                    <option value="">Select tournament…</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>

                <p className="text-[11px] text-muted-foreground/60 bg-muted/15 rounded-xl px-3 py-2.5 border border-border/20 leading-relaxed">
                  The tournament draw will be loaded and shared with all participants. You'll fill out your picks after creating the pool.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={isCreating}>Cancel</Button>
                <Button
                  size="sm"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                  disabled={!createPoolName.trim() || !createUserName.trim() || !createTournamentId || isCreating}
                  onClick={handleCreateSubmit}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Building draw…
                    </>
                  ) : 'Create Pool'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Join Pool Modal */}
      <AnimatePresence>
        {showJoin && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoin(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-sm bg-card border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Join a Pool</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowJoin(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Pool Code <span className="text-red-400">*</span></span>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="ABCXYZ"
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm font-mono tracking-[0.25em] uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Your Name <span className="text-red-400">*</span></span>
                  <input
                    type="text"
                    value={joinUserName}
                    onChange={e => setJoinUserName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Bracket Name <span className="text-muted-foreground/50 font-normal">(optional)</span></span>
                  <input
                    type="text"
                    value={joinBracketName}
                    onChange={e => setJoinBracketName(e.target.value)}
                    placeholder={joinUserName ? `${joinUserName}'s Bracket` : 'e.g. My Picks'}
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  />
                </label>

                {joinError && (
                  <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5 border border-red-500/20 leading-relaxed">
                    {joinError}
                  </p>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowJoin(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                  disabled={!joinCode.trim() || !joinUserName.trim()}
                  onClick={handleJoinSubmit}
                >
                  Join Pool
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Re-export for URL-based join handling
export { importPool };
