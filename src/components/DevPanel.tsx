/**
 * DevPanel — developer / QA control panel for the test Madrid 2025 pool.
 *
 * Visible only when:
 *   • Vite is running in dev mode (`import.meta.env.DEV`), OR
 *   • the URL contains `?dev=1`.
 *
 * The panel lives in the bottom-left corner of the screen and is collapsible.
 * It lets testers:
 *   1. Create/reset the test pool (4 simulated participants).
 *   2. Simulate official results round-by-round (R1 → Final).
 *   3. Navigate directly to the test pool leaderboard.
 *   4. Tear down the test pool when done.
 */

import { useState, useCallback } from 'react';
import { FlaskConical, ChevronDown, ChevronUp, Play, RotateCcw, Trophy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface DevPanelProps {
  authUser: User | null;
  onNavigate: (view: AppView) => void;
  /** Called after any pool mutation so the rest of the app can re-sync. */
  onPoolChanged?: () => void;
}

// ─── Round definitions ────────────────────────────────────────────────────────

const ROUND_BUTTONS: Array<{ label: string; round: number; color?: string }> = [
  { label: 'Clear',  round: 0, color: 'border-red-500/30 text-red-400/60 hover:text-red-400 hover:border-red-500/40' },
  { label: 'R1',     round: 1 },
  { label: 'R2',     round: 2 },
  { label: 'R3',     round: 3 },
  { label: 'QF',     round: 4 },
  { label: 'SF',     round: 5 },
  { label: 'Final',  round: 6, color: 'border-amber-500/30 text-amber-400/60 hover:text-amber-400 hover:border-amber-500/40' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function DevPanel({ authUser, onNavigate, onPoolChanged }: DevPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pool, setPool] = useState<Pool | null>(() => getPool(MADRID_TEST_POOL_ID));

  const refresh = useCallback(() => {
    setPool(getPool(MADRID_TEST_POOL_ID));
    onPoolChanged?.();
  }, [onPoolChanged]);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  const handleSetup = () => {
    const userId = authUser?.uid ?? null;
    setupTestMadridPool(userId);
    refresh();
    flash('Test pool created ✅');
  };

  const handleApplyResults = (round: number) => {
    const updated = updateTestPoolResults(round);
    if (!updated) {
      flash('⚠️ No test pool found — set up first');
      return;
    }
    refresh();
    flash(round === 0 ? 'Results cleared' : `Results through ${ROUND_BUTTONS.find(r => r.round === round)?.label} applied ✅`);
  };

  const handleClear = () => {
    clearTestPool();
    setPool(null);
    onPoolChanged?.();
    flash('Test pool removed');
  };

  const handleGoToPool = () => {
    if (pool) {
      onNavigate({ page: 'pool', poolId: pool.id });
    }
  };

  // Compute how many official results have been entered
  const resultsThrough = pool
    ? pool.officialMatches.reduce((max: number, m: typeof pool.officialMatches[number]) =>
        m.winnerId ? Math.max(max, m.round) : max, 0)
    : 0;

  return (
    <div className="fixed bottom-4 left-4 z-[80] w-72">
      <div className="bg-zinc-950/95 border border-amber-500/30 rounded-2xl shadow-2xl backdrop-blur-sm overflow-hidden">

        {/* ── Header (toggle) ── */}
        <button
          onClick={() => setIsOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/4 transition-colors"
          aria-label={isOpen ? 'Collapse dev panel' : 'Expand dev panel'}
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">
              Dev Panel
            </span>
            {pool && (
              <span className="text-[9px] font-bold text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                pool active
              </span>
            )}
          </div>
          {isOpen
            ? <ChevronDown className="h-4 w-4 text-amber-400/60" aria-hidden="true" />
            : <ChevronUp   className="h-4 w-4 text-amber-400/60" aria-hidden="true" />
          }
        </button>

        {/* ── Body ── */}
        {isOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06]">

            {/* Status message */}
            {status && (
              <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mt-3">
                {status}
              </p>
            )}

            {/* ── Setup ── */}
            <div className={status ? '' : 'pt-3'}>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">
                Test Pool — {MADRID_TEST_POOL_NAME}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSetup}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-semibold rounded-lg h-8 border-0"
                >
                  {pool ? 'Reset Pool' : 'Create Pool'}
                </Button>
                {pool && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGoToPool}
                    className="text-[11px] rounded-lg h-8 border-white/15 text-white/60 hover:text-white hover:border-white/30"
                    aria-label="Open test pool leaderboard"
                  >
                    <Trophy className="h-3 w-3 mr-1" aria-hidden="true" />
                    View
                  </Button>
                )}
              </div>
            </div>

            {/* ── Official Results Simulation ── */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">
                Simulate Official Results
                {resultsThrough > 0 && (
                  <span className="ml-2 text-emerald-400/70 normal-case font-semibold">
                    (through {ROUND_BUTTONS.find(r => r.round === resultsThrough)?.label ?? `R${resultsThrough}`})
                  </span>
                )}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {ROUND_BUTTONS.map(({ label, round, color }) => (
                  <Button
                    key={round}
                    size="sm"
                    variant="outline"
                    onClick={() => handleApplyResults(round)}
                    className={cn(
                      'text-[10px] font-semibold rounded-lg h-7 border-white/10 text-white/55 hover:text-white transition-colors',
                      color,
                      resultsThrough === round && round > 0 && 'ring-1 ring-emerald-500/40 border-emerald-500/30 text-emerald-400',
                    )}
                    aria-label={round === 0 ? 'Clear all results' : `Apply results through ${label}`}
                  >
                    {round === 0 ? <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" /> : null}
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-[10px] text-white/25 mt-1.5 leading-relaxed">
                Strategy: lower seed number wins each match (entries vary the final winner).
              </p>
            </div>

            {/* ── Leaderboard preview ── */}
            {pool && pool.entries.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">
                  Live Scores ({pool.entries.length} entries)
                </p>
                <div className="space-y-1">
                  {[...pool.entries]
                    .map(entry => ({
                      entry,
                      score: calculatePoolEntryScore(entry.matches, pool.officialMatches),
                    }))
                    .sort((a, b) => b.score.total - a.score.total)
                    .map(({ entry, score }, idx) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.035]"
                      >
                        <span className="text-[10px] font-bold text-white/30 w-4 shrink-0">
                          {idx + 1}.
                        </span>
                        <span className="text-[11px] text-white/70 truncate flex-1">
                          {entry.userName}
                        </span>
                        {!entry.isSubmitted && (
                          <span className="text-[9px] text-white/30 shrink-0">partial</span>
                        )}
                        <span className="text-[11px] font-bold text-emerald-400 shrink-0 tabular-nums">
                          {score.total} pts
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── Remove pool ── */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleClear}
              className="w-full text-[11px] rounded-lg h-7 border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40"
              aria-label="Remove test pool from local storage"
            >
              <Trash2 className="h-3 w-3 mr-1.5" aria-hidden="true" />
              Remove Test Pool
            </Button>

          </div>
        )}
      </div>
    </div>
  );
}
