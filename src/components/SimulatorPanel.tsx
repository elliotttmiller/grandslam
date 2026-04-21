/**
 * SimulatorPanel — full test/simulation workflow panel for the Madrid 2025 pool.
 *
 * Accessible from the sidebar nav "Simulator" item and the floating Simulate button.
 * Guides users through a complete tournament pool simulation:
 *   1. Create / reset the test pool (5 simulated participants).
 *   2. Auto-run or step through official results round-by-round (R1 → Final).
 *   3. Watch the live leaderboard update as results come in.
 *   4. View final standings and clean up the simulation.
 */

import { useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, X, Play, RotateCcw, Trophy, Trash2,
  ChevronRight, Users, CheckCircle2, Circle, Zap, SkipForward,
  Loader2, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getRoundFullName } from '@/lib/bracket-utils';
import type { Match } from '@/lib/bracket-utils';
import {
  MADRID_2025_TEST_POOL_OPTION_ID,
  MADRID_TEST_POOL_ID,
  setupTestMadridPool,
  setupTestMadridLeagueRun,
  updateTestPoolResults,
  updatePoolResultsFake,
  clearTestPool,
} from '@/lib/test-tournament-data';
import { getPool } from '@/lib/pool-storage';
import { getLeagues, getLeague } from '@/lib/league-storage';
import { calculatePoolEntryScore } from '@/lib/scoring';
import type { Pool } from '@/lib/pool-types';
import type { League } from '@/lib/league-types';
import type { AppView } from '@/App';
import type { User } from 'firebase/auth';
import {
  syncSavePool,
  syncUpdateOfficialMatches,
  syncDeletePool,
} from '@/services/poolSyncService';
import { syncSaveLeague } from '@/services/leagueSyncService';

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

/** Delay between auto-run rounds in ms */
const AUTO_RUN_DELAY = 700;

function stepLabel(round: number): string {
  return ROUNDS.find(r => r.round === round)?.fullLabel ?? `Round ${round}`;
}

function isMadridOfficialReplayPool(pool: Pool | null, poolId: string): boolean {
  return poolId === MADRID_TEST_POOL_ID || pool?.tournamentId === MADRID_2025_TEST_POOL_OPTION_ID;
}

// ─── SimulatorPanel ─────────────────────────────────────────────────────────

export function SimulatorPanel({ authUser, onNavigate, onPoolChanged, onClose }: SimulatorPanelProps) {
  const [pool, setPool] = useState<Pool | null>(() => getPool(MADRID_TEST_POOL_ID));
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [stepRunning, setStepRunning] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [existingLeagueId, setExistingLeagueId] = useState('');
  const [existingPoolId, setExistingPoolId] = useState('');
  const [existingSimulationRunning, setExistingSimulationRunning] = useState(false);
  const autoRunRef = useRef(false);

  const refresh = useCallback(() => {
    const updated = getPool(MADRID_TEST_POOL_ID);
    setPool(updated);
    onPoolChanged?.();
    return updated;
  }, [onPoolChanged]);

  const flash = (msg: string, ok = true) => {
    setStatus({ msg, ok });
    setTimeout(() => setStatus(null), 3500);
  };

  // ── Derived state ──
  const resultsThrough: number = pool
    ? pool.officialMatches.reduce((max: number, m: Match) => (m.winnerId ? Math.max(max, m.round) : max), 0)
    : 0;

  const isFinalized = resultsThrough === 6;
  const nextRound = Math.min(resultsThrough + 1, 6);
  const hasPool = pool !== null;
  const leagues = getLeagues();
  const selectedLeague: League | null = existingLeagueId
    ? leagues.find(league => league.id === existingLeagueId) ?? null
    : null;
  const selectedPool = existingPoolId ? getPool(existingPoolId) : null;
  const existingTotalRounds = selectedPool
    ? selectedPool.officialMatches.reduce((max: number, m: Match) => Math.max(max, m.round), 0)
    : 0;
  const existingResultsThrough = selectedPool
    ? selectedPool.officialMatches.reduce((max: number, m: Match) => (m.winnerId ? Math.max(max, m.round) : max), 0)
    : 0;
  const existingNextRound = existingTotalRounds > 0
    ? Math.min(existingResultsThrough + 1, existingTotalRounds)
    : 0;

  const getExistingRoundLabel = (round: number) =>
    existingTotalRounds > 0 ? getRoundFullName(round, existingTotalRounds) : `Round ${round}`;

  // ── Setup ──
  const handleSetup = () => {
    const userId = authUser?.uid ?? null;
    setupTestMadridPool(userId);
    const createdPool = getPool(MADRID_TEST_POOL_ID);
    if (createdPool) void syncSavePool(createdPool);
    refresh();
    flash('Test pool ready — 5 simulated users created ✅');
  };

  // ── Apply a single round ──
  const applyRound = (round: number): Pool | null => {
    const updated = updateTestPoolResults(round);
    refresh();
    if (updated) void syncUpdateOfficialMatches(MADRID_TEST_POOL_ID, updated.officialMatches);
    return updated;
  };

  // ── Next Round shortcut ──
  const handleNextRound = () => {
    if (!pool || isFinalized) return;
    setStepRunning(true);
    setTimeout(() => {
      const updated = applyRound(nextRound);
      setStepRunning(false);
      if (!updated) {
        flash('⚠️ No pool found — create one first', false);
        return;
      }
      if (nextRound === 6) {
        flash('🏆 Tournament complete! Check final standings.');
      } else {
        flash(`${stepLabel(nextRound)} results applied ✅`);
      }
    }, 280);
  };

  // ── Auto-run all remaining rounds ──
  const handleAutoRun = async () => {
    if (!pool) {
      flash('⚠️ Create a pool first before running simulation', false);
      return;
    }
    if (isFinalized) {
      flash('Tournament is already complete — reset results to re-run', false);
      return;
    }

    setAutoRunning(true);
    autoRunRef.current = true;

    let round = resultsThrough + 1;
    while (round <= 6 && autoRunRef.current) {
      await new Promise(res => setTimeout(res, AUTO_RUN_DELAY));
      if (!autoRunRef.current) break;
      applyRound(round);
      round++;
    }

    autoRunRef.current = false;
    setAutoRunning(false);
    if (round > 6) {
      flash('🏆 Full simulation complete! View final standings below.');
    }
  };

  const handleStopAutoRun = () => {
    autoRunRef.current = false;
    setAutoRunning(false);
    flash('Simulation paused');
  };

  // ── Apply through a specific round ──
  const handleSimulateThrough = (round: number) => {
    setStepRunning(true);
    setTimeout(() => {
      const updated = updateTestPoolResults(round);
      setStepRunning(false);
      if (!updated) {
        flash('⚠️ No pool found — create one first', false);
        return;
      }
      void syncUpdateOfficialMatches(MADRID_TEST_POOL_ID, updated.officialMatches);
      refresh();
      if (round === 0) {
        flash('Results cleared — pool reset to start');
      } else {
        flash(`Results applied through ${stepLabel(round)} ✅`);
      }
    }, 280);
  };

  // ── Clear results ──
  const handleClearResults = () => {
    handleSimulateThrough(0);
  };

  // ── Remove pool ──
  const handleClear = () => {
    clearTestPool();
    void syncDeletePool(MADRID_TEST_POOL_ID);
    setPool(null);
    onPoolChanged?.();
    flash('Simulation cleared', true);
  };

  // ── Navigate to pool ──
  const handleGoToPool = () => {
    if (pool) {
      onNavigate({ page: 'pool', poolId: pool.id });
      onClose();
    }
  };

  // ── League test simulator ──
  const handleLeagueSimulation = () => {
    setStepRunning(true);
    setTimeout(() => {
      const userId = authUser?.uid ?? null;
      const leagueId = setupTestMadridLeagueRun(userId);
      const leaguePool = getPool(MADRID_TEST_POOL_ID);
      const league = getLeague(leagueId);
      if (leaguePool) void syncSavePool(leaguePool);
      if (league) void syncSaveLeague(league);
      refresh();
      setStepRunning(false);
      flash('League simulation complete — opening league view ✅');
      onNavigate({ page: 'league-detail', leagueId });
      onClose();
    }, 280);
  };

  // ── Full end-to-end workflow (Pool UI -> Sim -> League UI) ──
  const handleRunFullPipeline = async () => {
    if (autoRunning || stepRunning || pipelineRunning) return;
    setPipelineRunning(true);
    setStepRunning(true);
    autoRunRef.current = false;
    setAutoRunning(false);
    try {
      const userId = authUser?.uid ?? null;

      const poolId = setupTestMadridPool(userId);
      if (!poolId) throw new Error(`Failed to create test pool for user ${userId ?? 'null'}`);
      const createdPool = getPool(MADRID_TEST_POOL_ID);
      if (createdPool) void syncSavePool(createdPool);
      refresh();
      onNavigate({ page: 'pool', poolId: MADRID_TEST_POOL_ID });
      flash('Step 1/4: Test pool created — opening Pool interface ✅');
      await new Promise(res => setTimeout(res, 450));

      flash('Step 2/4: Simulating tournament rounds in Pool leaderboard…');
      for (const round of ROUNDS) {
        const updated = updateTestPoolResults(round.round);
        if (!updated) throw new Error(`Failed to simulate round ${round.fullLabel} for pool ${poolId}`);
        void syncUpdateOfficialMatches(MADRID_TEST_POOL_ID, updated.officialMatches);
        refresh();
        await new Promise(res => setTimeout(res, 260));
      }

      flash('Step 3/4: Pool simulation complete — generating league…');
      await new Promise(res => setTimeout(res, 400));

      const leagueId = setupTestMadridLeagueRun(userId);
      if (!leagueId) throw new Error(`Failed to create test league for user ${userId ?? 'null'} with pool ${poolId}`);
      const pipelineLeaguePool = getPool(MADRID_TEST_POOL_ID);
      const pipelineLeague = getLeague(leagueId);
      if (pipelineLeaguePool) void syncSavePool(pipelineLeaguePool);
      if (pipelineLeague) void syncSaveLeague(pipelineLeague);
      refresh();
      onNavigate({ page: 'league-detail', leagueId });
      flash('Step 4/4: League ready — opening League interface ✅');
      await new Promise(res => setTimeout(res, 450));
      onClose();
    } catch (error) {
      console.error('Failed to run simulator pipeline:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      flash(`⚠️ Full workflow failed: ${message}`, false);
    } finally {
      setPipelineRunning(false);
      setStepRunning(false);
    }
  };

  // ── Existing league + real-user pool simulation ──
  const handleSimulateExistingLeague = async () => {
    if (!existingLeagueId || !existingPoolId) {
      flash('⚠️ Select an existing league and linked pool first', false);
      return;
    }
    if (existingSimulationRunning || stepRunning || autoRunning || pipelineRunning) return;

    const currentPool = getPool(existingPoolId);
    if (!currentPool) {
      flash('⚠️ Selected pool was not found', false);
      return;
    }

    const totalRounds = currentPool.officialMatches.reduce((max: number, m: Match) => Math.max(max, m.round), 0);
    const throughRound = currentPool.officialMatches.reduce(
      (max: number, m: Match) => (m.winnerId ? Math.max(max, m.round) : max),
      0,
    );

    if (throughRound >= totalRounds) {
      flash('Tournament is already complete — clear results to replay', false);
      return;
    }

    // Use the real 2025 Madrid results when replaying the Madrid test pool;
    // fall back to fake (lower-seed-wins) logic for any other pool.
    const applyRoundFn = isMadridOfficialReplayPool(currentPool, existingPoolId)
      ? (round: number) => updateTestPoolResults(round, existingPoolId)
      : (round: number) => updatePoolResultsFake(existingPoolId, round);

    setExistingSimulationRunning(true);
    try {
      for (let round = throughRound + 1; round <= totalRounds; round++) {
        await new Promise(res => setTimeout(res, AUTO_RUN_DELAY));
        const updated = applyRoundFn(round);
        onPoolChanged?.();
        if (!updated) {
          throw new Error(`Failed to simulate ${getRoundFullName(round, totalRounds)} for pool ${existingPoolId}`);
        }
        void syncUpdateOfficialMatches(existingPoolId, updated.officialMatches);
        flash(`Live replay: ${getRoundFullName(round, totalRounds)} complete ✅`);
      }
      flash('Live league simulation complete — opening league view ✅');
      onNavigate({ page: 'league-detail', leagueId: existingLeagueId });
      onClose();
    } catch (error) {
      console.error('Failed to simulate existing league pool:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      flash(`⚠️ Existing league simulation failed: ${message}`, false);
    } finally {
      setExistingSimulationRunning(false);
    }
  };

  const handleResetExistingLeagueSimulation = () => {
    if (!existingPoolId) {
      flash('⚠️ Select an existing linked pool first', false);
      return;
    }
    const currentPool = getPool(existingPoolId);
    const updated = isMadridOfficialReplayPool(currentPool, existingPoolId)
      ? updateTestPoolResults(0, existingPoolId)
      : updatePoolResultsFake(existingPoolId, 0);
    onPoolChanged?.();
    if (!updated) {
      flash('⚠️ Could not reset selected pool results', false);
      return;
    }
    void syncUpdateOfficialMatches(existingPoolId, updated.officialMatches);
    flash('Existing pool results cleared — ready to replay');
  };

  // ── Ranked leaderboard rows ──
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
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-90"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.div
        key="sim-panel"
        initial={{ opacity: 0, x: 340 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 340 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="fixed top-0 right-0 h-full w-full max-w-sm bg-zinc-950 border-l border-white/8 shadow-2xl z-91 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Tournament Simulator"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/12 border border-amber-500/20 flex items-center justify-center shrink-0">
              <FlaskConical className="h-4 w-4 text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-white">Tournament Simulator</h2>
              <p className="text-[10px] text-white/35 font-medium leading-tight">
                Madrid 2025 · ATP Masters 1000
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center hover:bg-white/[0.07] transition-colors text-white/40 hover:text-white/80 shrink-0"
            aria-label="Close simulator"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Status banner */}
          <AnimatePresence mode="wait">
            {status && (
              <motion.div
                key={status.msg}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.18 }}
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

          {/* ══ STEP 1: Create Pool ══ */}
          <StepSection
            number={1}
            label="Set Up Test Pool"
            done={hasPool}
          >
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              Creates a <strong className="text-white/70">Madrid 2025</strong> pool with
              {' '}<strong className="text-white/70">5 simulated users</strong> — each with a different
              bracket prediction: Zverev wins, Draper wins, Ruud dark horse, Medvedev deep run, and a partial entry.
            </p>

            <div className="flex gap-2">
              <Button
                onClick={handleSetup}
                className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl h-9 border-0 transition-colors"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {hasPool ? 'Reset Pool' : 'Create Test Pool'}
              </Button>
              {hasPool && (
                <Button
                  variant="outline"
                  onClick={handleGoToPool}
                  className="text-xs rounded-xl h-9 border-white/15 text-white/60 hover:text-white hover:border-white/30 px-3 gap-1"
                  aria-label="Open test pool leaderboard"
                >
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                  View
                  <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                </Button>
              )}
            </div>

            {hasPool && (
              <div className="flex items-center gap-2 mt-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[10px] text-emerald-400/70 font-medium">
                  {pool!.entries.length} participants ·{' '}
                  {pool!.entries.filter((e: { isSubmitted: boolean }) => e.isSubmitted).length} submitted
                </span>
              </div>
            )}
          </StepSection>

          {/* ══ STEP 2: Run Simulation ══ */}
          <StepSection
            number={2}
            label="Simulate Results"
            done={resultsThrough > 0}
            disabled={!hasPool}
            badge={resultsThrough > 0 ? `${stepLabel(resultsThrough)}` : undefined}
          >
            {/* Progress bar */}
            <div className="space-y-1.5 mb-4">
              <div className="flex gap-1" role="progressbar" aria-valuenow={resultsThrough} aria-valuemin={0} aria-valuemax={6} aria-label="Simulation progress">
                {ROUNDS.map(r => (
                  <div
                    key={r.round}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-all duration-500',
                      r.round <= resultsThrough
                        ? autoRunning && r.round === resultsThrough
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-emerald-500'
                        : 'bg-white/10',
                    )}
                    title={r.fullLabel}
                  />
                ))}
              </div>
              <p className="text-[10px] text-white/30">
                {!hasPool
                  ? 'Create a pool first to simulate results'
                  : resultsThrough === 0
                  ? 'No results yet — click a round or auto-run below'
                  : isFinalized
                  ? '🏆 Tournament complete'
                  : `${resultsThrough} of 6 rounds complete · next: ${stepLabel(nextRound)}`
                }
              </p>
            </div>

            {/* Auto-run / Next Round primary actions */}
            <div className="flex gap-2 mb-3">
              {!isFinalized && (
                autoRunning ? (
                  <Button
                    onClick={handleStopAutoRun}
                    className="flex-1 bg-amber-600/20 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-xl h-10 hover:bg-amber-600/30 transition-colors"
                  >
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                    Running… (tap to pause)
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleAutoRun}
                      disabled={!hasPool || stepRunning}
                      className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl h-10 border-0 transition-colors disabled:opacity-40"
                      aria-label="Auto-run all remaining rounds"
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                      {resultsThrough === 0 ? 'Auto-Run All Rounds' : 'Continue Auto-Run'}
                    </Button>
                    {hasPool && resultsThrough < 6 && (
                      <Button
                        onClick={handleNextRound}
                        disabled={stepRunning || autoRunning}
                        variant="outline"
                        className="text-xs rounded-xl h-10 border-white/15 text-white/60 hover:text-white hover:border-white/30 px-3 gap-1 transition-colors disabled:opacity-40"
                        aria-label={`Simulate next round: ${stepLabel(nextRound)}`}
                      >
                        {stepRunning
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          : <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                        }
                        {stepLabel(nextRound)}
                      </Button>
                    )}
                  </>
                )
              )}

              {isFinalized && hasPool && (
                <Button
                  onClick={handleGoToPool}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl h-10 border-0 transition-colors"
                >
                  <Trophy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  View Final Standings
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
                </Button>
              )}
            </div>

            {/* Manual round selector */}
            <details className="group">
              <summary className="text-[10px] font-semibold text-white/30 hover:text-white/50 cursor-pointer select-none flex items-center gap-1.5 list-none mb-2 transition-colors">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden="true" />
                Jump to specific round
              </summary>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {ROUNDS.map(({ label, round }) => (
                  <button
                    key={round}
                    onClick={() => handleSimulateThrough(round)}
                    disabled={stepRunning || autoRunning || !hasPool}
                    className={cn(
                      'text-[11px] font-semibold rounded-xl h-9 border transition-all disabled:opacity-30 disabled:cursor-not-allowed',
                      resultsThrough === round
                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                        : round <= resultsThrough
                        ? 'border-white/10 text-white/40 bg-white/3 hover:border-white/20 hover:text-white/60'
                        : 'border-white/10 text-white/55 hover:border-emerald-500/30 hover:text-emerald-300 hover:bg-emerald-500/5',
                    )}
                    aria-label={`Jump to ${label}`}
                    aria-pressed={resultsThrough === round}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleClearResults}
                disabled={stepRunning || autoRunning || resultsThrough === 0 || !hasPool}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold rounded-xl h-7 border border-red-500/20 text-red-400/50 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Clear all simulated results"
              >
                <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                Clear All Results
              </button>
            </details>
          </StepSection>

          {/* ══ STEP 3: Live Leaderboard ══ */}
          {hasPool && (
            <StepSection
              number={3}
              label="Live Leaderboard"
              done={resultsThrough > 0}
              icon={resultsThrough > 0 ? <Zap className="h-3 w-3" /> : undefined}
            >
              {rankedEntries.length === 0 ? (
                <p className="text-xs text-white/30 py-2">
                  Simulate at least one round to see scores.
                </p>
              ) : (
                <>
                  <div className="rounded-2xl border border-white/6 overflow-hidden">
                    <div className="divide-y divide-white/4">
                      {rankedEntries.map(({ entry, score }, idx) => (
                        <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="text-xs font-black w-5 shrink-0 tabular-nums text-center">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white/80 truncate">{entry.userName}</p>
                            <p className="text-[10px] text-white/30 truncate">{entry.bracketName}</p>
                          </div>
                          <div className="shrink-0">
                            {entry.isSubmitted
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-400/60" aria-label="Submitted" />
                              : <Circle className="h-3 w-3 text-white/20" aria-label="Not submitted" />
                            }
                          </div>
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
                    {resultsThrough > 0 && (
                      <div className="px-4 py-2.5 border-t border-white/4 bg-white/1.5">
                        <p className="text-[10px] text-white/25">
                          R1=1pt · R2=2 · R3=4 · QF=8 · SF=16 · Final=32 · upset bonuses applied
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleGoToPool}
                    className="w-full mt-3 text-xs rounded-xl h-8 border-white/12 text-white/50 hover:text-white hover:border-white/25 gap-1.5 transition-colors"
                  >
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    Open Full Pool View
                    <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                  </Button>
                </>
              )}
            </StepSection>
          )}

          {/* ══ Remove simulation ══ */}
          {hasPool && (
            <div className="pt-1">
              <Button
                variant="outline"
                onClick={handleClear}
                className="w-full text-xs rounded-xl h-8 border-red-500/20 text-red-400/40 hover:text-red-400 hover:border-red-500/40 transition-colors"
                aria-label="Remove test pool from storage"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Remove Simulation
              </Button>
            </div>
          )}

          {/* ══ STEP 4: League Simulation ══ */}
          <StepSection
            number={4}
            label="League Test Simulator"
            icon={<Trophy className="h-3 w-3" />}
          >
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              Creates a <strong className="text-white/70">test league</strong>, links the Madrid test pool,
              auto-simulates through the final, and opens the league interface.
            </p>
              <Button
                onClick={handleLeagueSimulation}
                disabled={stepRunning || autoRunning || pipelineRunning}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl h-9 border-0 transition-colors disabled:opacity-40"
              >
              {stepRunning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trophy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              )}
                Run League Simulator
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
              </Button>
              <Button
                onClick={handleRunFullPipeline}
                disabled={stepRunning || autoRunning || pipelineRunning}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl h-9 border-0 transition-colors disabled:opacity-40"
              >
                {pipelineRunning ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                )}
                Run Full E2E Workflow
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </StepSection>

          {/* ══ STEP 5: Existing League Replay ══ */}
          <StepSection
            number={5}
            label="Live Replay Existing League"
            icon={<Users className="h-3 w-3" />}
          >
            <p className="text-xs text-white/50 leading-relaxed mb-3">
              Uses an <strong className="text-white/70">already created league</strong> with real users/pools and
              simulates official results round-by-round. When a Madrid 2025 official-draw pool is selected,{' '}
              <strong className="text-white/70">real match results</strong> are applied; otherwise a seeded fallback is used.
            </p>

            <div className="space-y-2.5">
              <label className="block">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">League</span>
                <select
                  value={existingLeagueId}
                  onChange={(e) => {
                    setExistingLeagueId(e.target.value);
                    setExistingPoolId('');
                  }}
                  className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-emerald-500/40"
                >
                  <option value="">Select league…</option>
                  {leagues.map(league => (
                    <option key={league.id} value={league.id}>
                      {league.name} ({league.id})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wide">Linked pool</span>
                <select
                  value={existingPoolId}
                  onChange={(e) => setExistingPoolId(e.target.value)}
                  disabled={!selectedLeague}
                  className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-emerald-500/40 disabled:opacity-40"
                >
                  <option value="">Select pool…</option>
                  {selectedLeague && Object.entries(selectedLeague.tournamentPoolIds).map(([tournamentId, poolId]) => {
                    const linkedPool = getPool(poolId);
                    if (!linkedPool) return null;
                    return (
                      <option key={poolId} value={poolId}>
                        {linkedPool.tournamentName || tournamentId} · {linkedPool.entries.length} entries
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            {selectedPool && (
              <p className="text-[10px] text-emerald-400/70 mt-2">
                Progress: {existingResultsThrough} / {existingTotalRounds} rounds
                {existingTotalRounds > 0 && existingResultsThrough < existingTotalRounds
                  ? ` · next ${getExistingRoundLabel(existingNextRound)}`
                  : ''}
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <Button
                onClick={handleSimulateExistingLeague}
                disabled={!existingLeagueId || !existingPoolId || existingSimulationRunning || stepRunning || autoRunning || pipelineRunning}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl h-9 border-0 transition-colors disabled:opacity-40"
              >
                {existingSimulationRunning ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                )}
                Run Live Replay
              </Button>
              <Button
                variant="outline"
                onClick={handleResetExistingLeagueSimulation}
                disabled={!existingPoolId || existingSimulationRunning}
                className="text-xs rounded-xl h-9 border-white/15 text-white/60 hover:text-white hover:border-white/30 px-3 gap-1 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </Button>
            </div>
          </StepSection>
          </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-white/5 shrink-0">
          <p className="text-[10px] text-white/20 text-center">
            Syncs to Firestore in real time · real 2025 Madrid results applied
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── StepSection helper ─────────────────────────────────────────────────────

interface StepSectionProps {
  number: number;
  label: string;
  done?: boolean;
  disabled?: boolean;
  badge?: string;
  icon?: ReactNode;
  children: ReactNode;
}

function StepSection({ number, label, done, disabled, badge, icon, children }: StepSectionProps) {
  return (
    <section className={cn(disabled && 'opacity-40 pointer-events-none')}>
      <div className="flex items-center gap-2 mb-2.5">
        <div className={cn(
          'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black border shrink-0',
          done
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
            : 'bg-white/5 border-white/10 text-white/30',
        )}>
          {done ? (icon ?? <CheckCircle2 className="h-3 w-3" />) : number}
        </div>
        <p className="text-[11px] font-black uppercase tracking-widest text-white/40 flex-1 min-w-0">
          {label}
        </p>
        {badge && (
          <span className="text-[10px] font-semibold text-emerald-400/70 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
            {badge}
          </span>
        )}
      </div>
      <div className="bg-white/2.5 border border-white/6 rounded-2xl p-4">
        {children}
      </div>
    </section>
  );
}

// ─── Trigger button (floating FAB) ──────────────────────────────────────────

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
        'fixed bottom-6 right-5 z-80 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border transition-colors',
        'bg-zinc-900/95 backdrop-blur-sm text-amber-400 border-amber-500/30 hover:border-amber-500/55 hover:bg-zinc-800/95',
      )}
      aria-label="Open tournament simulator"
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="text-[11px] font-black uppercase tracking-widest">Simulate</span>
      {hasPool && (
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-label="Pool active" />
      )}
    </motion.button>
  );
}
