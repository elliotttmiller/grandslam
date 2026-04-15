/**
 * SimulatorPanel — full test/simulation workflow panel for the Madrid 2025 pool.
 *
 * Always accessible via the floating "Simulate" button in the app.
 * Lets anyone:
 *   1. Create / reset the test pool (5 simulated participants).
 *   2. Simulate official results round-by-round (R1 → Final).
 *   3. View the live leaderboard with scoring details.
 *   4. Navigate directly to the test pool.
 *   5. Finalize / clear the simulation at any time.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, X, Play, RotateCcw, Trophy, Trash2,
  ChevronRight, Users, CheckCircle2, Circle, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Match } from '@/lib/bracket-utils';
import {
  MADRID_TEST_POOL_ID,
  MADRID_TEST_POOL_NAME,
  setupTestMadridPool,
  updateTestPoolResults,
  clearTestPool,
} from '@/lib/test-tournament-data';
import { getPool } from '@/lib/pool-storage';
import { calculatePoolEntryScore } from '@/lib/scoring';
import type { Pool } from '@/lib/pool-types';
import type { AppView } from '@/App';
import type { User } from 'firebase/auth';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SimulatorPanelProps {
  authUser: User | null;
  onNavigate: (view: AppView) => void;
  onPoolChanged?: () => void;
  onClose: () => void;
}

// ─── Round definitions ──────────────────────────────────────────────────────

const ROUNDS: Array<{ label: string; fullLabel: string; round: number }> = [
  { label: 'R1',    fullLabel: 'Round 1',         round: 1 },
  { label: 'R2',    fullLabel: 'Round 2',         round: 2 },
  { label: 'R3',    fullLabel: 'Round 3',         round: 3 },
  { label: 'QF',    fullLabel: 'Quarterfinals',   round: 4 },
  { label: 'SF',    fullLabel: 'Semifinals',      round: 5 },
  { label: 'Final', fullLabel: 'Final',           round: 6 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function stepLabel(round: number): string {
  return ROUNDS.find(r => r.round === round)?.fullLabel ?? `Round ${round}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SimulatorPanel({ authUser, onNavigate, onPoolChanged, onClose }: SimulatorPanelProps) {
  const [pool, setPool] = useState<Pool | null>(() => getPool(MADRID_TEST_POOL_ID));
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [simulating, setSimulating] = useState(false);

  const refresh = useCallback(() => {
    setPool(getPool(MADRID_TEST_POOL_ID));
    onPoolChanged?.();
  }, [onPoolChanged]);

  const flash = (msg: string, ok = true) => {
    setStatus({ msg, ok });
    setTimeout(() => setStatus(null), 3500);
  };

  // ── How far we've simulated ──
  const resultsThrough: number = pool
    ? pool.officialMatches.reduce((max: number, m: Match) => (m.winnerId ? Math.max(max, m.round) : max), 0)
    : 0;

  const isFinalized = resultsThrough === 6;

  // ── Actions ──

  const handleSetup = () => {
    const userId = authUser?.uid ?? null;
    setupTestMadridPool(userId);
    refresh();
    flash(`Test pool created with ${5} simulated users ✅`);
  };

  const handleSimulateThrough = (round: number) => {
    setSimulating(true);
    setTimeout(() => {
      const updated = updateTestPoolResults(round);
      setSimulating(false);
      if (!updated) {
        flash('⚠️ No pool found — create one first', false);
        return;
      }
      refresh();
      if (round === 0) {
        flash('Results cleared — pool reset to start');
      } else {
        flash(`Results simulated through ${stepLabel(round)} ✅`);
      }
    }, 300); // slight delay so the button feels responsive
  };

  const handleClear = () => {
    clearTestPool();
    setPool(null);
    onPoolChanged?.();
    flash('Simulation cleared', true);
  };

  const handleGoToPool = () => {
    if (pool) {
      onNavigate({ page: 'pool', poolId: pool.id });
      onClose();
    }
  };

  // ── Scoring rows ──
  const rankedEntries = pool && pool.entries.length > 0
    ? [...pool.entries]
        .map(entry => ({
          entry,
          score: calculatePoolEntryScore(entry.matches, pool.officialMatches),
        }))
        .sort((a, b) => b.score.total - a.score.total)
    : [];

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="sim-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.div
        key="sim-panel"
        initial={{ opacity: 0, x: 320 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 320 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 right-0 h-full w-full max-w-sm bg-zinc-950 border-l border-white/[0.08] shadow-2xl z-[91] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Tournament Simulator"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <FlaskConical className="h-4 w-4 text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-white">Tournament Simulator</h2>
              <p className="text-[10px] text-white/35 font-medium">
                {MADRID_TEST_POOL_NAME}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center hover:bg-white/[0.07] transition-colors text-white/40 hover:text-white/80"
            aria-label="Close simulator"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Status banner */}
          <AnimatePresence>
            {status && (
              <motion.div
                key="status"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  'text-[11px] font-medium rounded-xl px-3.5 py-2.5 border',
                  status.ok
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/25 text-amber-300',
                )}
              >
                {status.msg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 1: Create Pool ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn(
                'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black border',
                pool ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-white/5 border-white/10 text-white/30',
              )}>
                {pool ? <CheckCircle2 className="h-3 w-3" /> : '1'}
              </div>
              <p className="text-[11px] font-black uppercase tracking-widest text-white/40">Pool Setup</p>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
              <p className="text-xs text-white/50 leading-relaxed">
                Creates a realistic Madrid 2025 pool with <strong className="text-white/70">5 simulated users</strong>,
                each with different bracket predictions (Sinner wins, Alcaraz wins, Djokovic run, wild-card, and partial entry).
              </p>

              <div className="flex gap-2">
                <Button
                  onClick={handleSetup}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl h-9 border-0"
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  {pool ? 'Reset Pool' : 'Create Test Pool'}
                </Button>
                {pool && (
                  <Button
                    variant="outline"
                    onClick={handleGoToPool}
                    className="text-xs rounded-xl h-9 border-white/15 text-white/60 hover:text-white hover:border-white/30 px-3"
                    aria-label="Open test pool leaderboard"
                  >
                    <Trophy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    View Pool
                    <ChevronRight className="h-3.5 w-3.5 ml-1 opacity-50" aria-hidden="true" />
                  </Button>
                )}
              </div>

              {pool && (
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400/70 font-medium">
                    {pool.entries.length} participants · {pool.entries.filter((e: { isSubmitted: boolean }) => e.isSubmitted).length} submitted
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ── Step 2: Simulate Results ── */}
          <section className={cn(!pool && 'opacity-40 pointer-events-none')}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn(
                'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black border',
                resultsThrough > 0
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-white/5 border-white/10 text-white/30',
              )}>
                {resultsThrough > 0 ? <CheckCircle2 className="h-3 w-3" /> : '2'}
              </div>
              <p className="text-[11px] font-black uppercase tracking-widest text-white/40">
                Simulate Results
                {resultsThrough > 0 && (
                  <span className="ml-2 text-emerald-400/70 normal-case font-semibold">
                    through {stepLabel(resultsThrough)}
                  </span>
                )}
              </p>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
              <p className="text-xs text-white/50 leading-relaxed">
                Advances official results round by round. Lower-seeded players win every match — entries diverge in the Final, creating a realistic leaderboard spread.
              </p>

              {/* Progress bar */}
              {pool && (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {ROUNDS.map(r => (
                      <div
                        key={r.round}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors duration-300',
                          r.round <= resultsThrough ? 'bg-emerald-500' : 'bg-white/10',
                        )}
                        title={r.fullLabel}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-white/25">
                    {resultsThrough === 0 ? 'No results yet' : isFinalized ? 'Tournament complete 🏆' : `${resultsThrough} of 6 rounds complete`}
                  </p>
                </div>
              )}

              {/* Round buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                {ROUNDS.map(({ label, round }) => (
                  <button
                    key={round}
                    onClick={() => handleSimulateThrough(round)}
                    disabled={simulating}
                    className={cn(
                      'text-[11px] font-semibold rounded-xl h-9 border transition-all',
                      resultsThrough === round
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                        : round <= resultsThrough
                        ? 'border-white/10 text-white/40 bg-white/[0.03] hover:border-white/20 hover:text-white/60'
                        : 'border-white/10 text-white/55 hover:border-emerald-500/30 hover:text-emerald-300 hover:bg-emerald-500/5',
                    )}
                    aria-label={`Simulate through ${label}`}
                    aria-pressed={resultsThrough === round}
                  >
                    {simulating && resultsThrough < round ? (
                      <span className="opacity-50">…</span>
                    ) : (
                      label
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleSimulateThrough(0)}
                disabled={simulating || resultsThrough === 0}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold rounded-xl h-7 border border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Clear all simulated results"
              >
                <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                Clear Results
              </button>
            </div>
          </section>

          {/* ── Step 3: Live Leaderboard ── */}
          {pool && rankedEntries.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black border',
                  resultsThrough > 0
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    : 'bg-white/5 border-white/10 text-white/30',
                )}>
                  {resultsThrough > 0 ? <Zap className="h-3 w-3" /> : '3'}
                </div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white/40">Live Leaderboard</p>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="divide-y divide-white/[0.04]">
                  {rankedEntries.map(({ entry, score }, idx) => (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Rank */}
                      <span className={cn(
                        'text-xs font-black w-5 shrink-0 tabular-nums text-center',
                        idx === 0 ? 'text-amber-400' : 'text-white/25',
                      )}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                      </span>

                      {/* Name + status */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white/80 truncate">{entry.userName}</p>
                        <p className="text-[10px] text-white/30 truncate">{entry.bracketName}</p>
                      </div>

                      {/* Submission badge */}
                      <div className="shrink-0">
                        {entry.isSubmitted
                          ? <CheckCircle2 className="h-3 w-3 text-emerald-400/60" aria-label="Submitted" />
                          : <Circle className="h-3 w-3 text-white/20" aria-label="Not submitted" />
                        }
                      </div>

                      {/* Score */}
                      <div className="shrink-0 text-right">
                        <p className={cn(
                          'text-sm font-black tabular-nums',
                          score.total > 0 ? 'text-emerald-400' : 'text-white/30',
                        )}>
                          {score.total}
                        </p>
                        <p className="text-[9px] text-white/25 tabular-nums">
                          {score.picksCompleted} correct
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scoring legend */}
                {resultsThrough > 0 && (
                  <div className="px-4 py-2.5 border-t border-white/[0.04] bg-white/[0.015]">
                    <p className="text-[10px] text-white/25 leading-relaxed">
                      Points: R1=1 · R2=2 · R3=4 · QF=8 · SF=16 · Final=32 · upset bonus included
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Finalize / teardown ── */}
          {pool && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black border bg-white/5 border-white/10 text-white/30">
                  {isFinalized ? <Trophy className="h-3 w-3 text-amber-400" /> : '4'}
                </div>
                <p className="text-[11px] font-black uppercase tracking-widest text-white/40">
                  {isFinalized ? 'Tournament Finalized 🏆' : 'Finalize / Teardown'}
                </p>
              </div>

              {isFinalized && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 mb-3">
                  <p className="text-xs text-amber-300/70 leading-relaxed">
                    All 6 rounds are complete. The full scoring pipeline has been exercised —
                    check the pool leaderboard to see final standings.
                  </p>
                  <Button
                    onClick={handleGoToPool}
                    className="mt-3 w-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl h-9 border-0"
                  >
                    <Trophy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    View Final Standings
                  </Button>
                </div>
              )}

              <Button
                variant="outline"
                onClick={handleClear}
                className="w-full text-xs rounded-xl h-8 border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40"
                aria-label="Remove test pool from storage"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Remove Simulation
              </Button>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.05] shrink-0">
          <p className="text-[10px] text-white/20 text-center leading-relaxed">
            Simulation uses fixed seed-order wins · local storage only · no Firestore writes
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Trigger button ─────────────────────────────────────────────────────────

interface SimulatorButtonProps {
  onClick: () => void;
  hasPool: boolean;
}

export function SimulatorButton({ onClick, hasPool }: SimulatorButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'fixed bottom-6 right-6 z-[80] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border transition-colors',
        'bg-zinc-900/95 backdrop-blur-sm text-amber-400 border-amber-500/30 hover:border-amber-500/50 hover:bg-zinc-800/95',
      )}
      aria-label="Open tournament simulator"
      aria-expanded={false}
    >
      <Play className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="text-[11px] font-black uppercase tracking-widest">Simulate</span>
      {hasPool && (
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-label="Pool active" />
      )}
    </motion.button>
  );
}
