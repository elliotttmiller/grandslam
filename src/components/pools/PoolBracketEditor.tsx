import { useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ZoomIn, ZoomOut, Lock, Check, X, Maximize2, LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BracketTree } from '@/components/Bracket';
import { advancePlayer, ROUND_NAMES, ROUND_FULL_NAMES } from '@/lib/bracket-utils';
import { calculateBracketScore } from '@/lib/scoring';
import { useBracketCanvas } from '@/hooks/useBracketCanvas';
import { MatchPickCard } from './MatchPickCard';
import type { Match } from '@/lib/bracket-utils';
import type { Pool, PoolEntry } from '@/lib/pool-types';

const TOTAL_BRACKET_MATCHES = 127;

interface PoolBracketEditorProps {
  pool: Pool;
  entry: PoolEntry;
  onSave: (matches: Match[]) => void;
  onSubmit: (matches: Match[], tbGames?: number, tbSets?: number) => void;
  onBack: () => void;
  readOnly?: boolean;
}

export function PoolBracketEditor({
  pool,
  entry,
  onSave,
  onSubmit,
  onBack,
  readOnly = false,
}: PoolBracketEditorProps) {
  const [matches, setMatches] = useState<Match[]>(entry.matches);
  const [zoom, setZoom] = useState(0.4);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tbGamesInput, setTbGamesInput] = useState(String(entry.tiebreakerGames ?? ''));
  const [tbSetsInput, setTbSetsInput] = useState(String(entry.tiebreakerSets ?? ''));
  const [pendingMatches, setPendingMatches] = useState<Match[] | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // 0 = full bracket canvas, 1-7 = round-by-round card view
  // Initialise to the first round that still needs picks
  const [activeRound, setActiveRound] = useState<number>(() => {
    const initial = entry.matches;
    for (let r = 1; r <= 7; r++) {
      const roundMs = initial.filter(m => m.round === r && m.player1 && m.player2);
      if (roundMs.length > 0 && roundMs.some(m => !m.winnerId)) return r;
      if (roundMs.length > 0) continue; // round complete, check next
    }
    return 7; // all done, show final
  });

  const bracketRef = useRef<HTMLDivElement>(null);
  const { containerRef, handlePointerDown, handlePointerMove, handlePointerUp } = useBracketCanvas({
    zoom,
    onZoomChange: setZoom,
  });

  const score = useMemo(() => calculateBracketScore(matches), [matches]);
  const finalMatch = useMemo(() => matches.find(m => m.nextMatchId === null), [matches]);
  const totalMatches = matches.filter(m => m.player1 && m.player2).length;

  // Per-round completion tracking (rounds 1-7)
  const roundCompletion = useMemo(() => {
    const c: Record<number, { total: number; done: number }> = {};
    for (let r = 1; r <= 7; r++) {
      const rm = matches.filter(m => m.round === r && m.player1 && m.player2);
      c[r] = { total: rm.length, done: rm.filter(m => m.winnerId).length };
    }
    return c;
  }, [matches]);

  const isEffectivelyReadOnly = readOnly || entry.isSubmitted;

  const handleSelectWinner = useCallback((matchId: string, winnerId: string) => {
    if (isEffectivelyReadOnly) return;
    const updated = advancePlayer(matches, matchId, winnerId);
    setMatches(updated);
    onSave(updated);
    setLastSavedAt(new Date());
  }, [isEffectivelyReadOnly, matches, onSave]);

  const handleSubmitClick = () => {
    if (entry.isSubmitted) return;
    if (score.picksCompleted < totalMatches) {
      setShowSubmitModal(true);
    } else {
      setPendingMatches(matches);
      setShowTiebreaker(true);
    }
  };

  const handleConfirmPartial = () => {
    setShowSubmitModal(false);
    setPendingMatches(matches);
    setShowTiebreaker(true);
  };

  const handleConfirmTiebreaker = () => {
    const g = parseInt(tbGamesInput, 10);
    const s = parseInt(tbSetsInput, 10);
    onSubmit(pendingMatches ?? matches, isNaN(g) ? undefined : g, isNaN(s) ? undefined : s);
    setShowTiebreaker(false);
    setPendingMatches(null);
  };

  const progressPct = totalMatches > 0 ? (score.picksCompleted / totalMatches) * 100 : 0;

  const activeRoundMatches = useMemo(
    () => matches.filter(m => m.round === activeRound).sort((a, b) => a.matchNumber - b.matchNumber),
    [matches, activeRound],
  );

  const activeRoundCompletion = roundCompletion[activeRound] ?? { total: 0, done: 0 };
  const isRoundComplete = activeRoundCompletion.total > 0 && activeRoundCompletion.done === activeRoundCompletion.total;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-border/20 bg-card/50 backdrop-blur-xl px-4 py-2.5 z-20">
        <div className="flex items-center gap-2.5 min-h-[40px]">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground/70 hover:text-foreground shrink-0 rounded-lg"
            onClick={onBack}
            aria-label={`Back to ${pool.name}`}
          >
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            <span className="max-w-[80px] truncate text-[13px]">{pool.name}</span>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate leading-tight">{entry.bracketName}</div>
            <div className="text-[10px] text-muted-foreground/60">by {entry.userName}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isEffectivelyReadOnly && lastSavedAt && (
              <span className="text-[10px] text-muted-foreground/40 hidden sm:block" aria-live="polite">Saved</span>
            )}
            {score.total > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20" aria-label={`${score.total} points`}>
                {score.total} pts
              </span>
            )}
            {entry.isSubmitted && (
              <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <Check className="h-3 w-3" aria-hidden="true" /> Submitted
              </span>
            )}
            {!entry.isSubmitted && isEffectivelyReadOnly && (
              <span className="flex items-center gap-1 text-[11px] font-bold bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
                <Lock className="h-3 w-3" aria-hidden="true" /> Locked
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Round / view selector tabs */}
      <div className="flex-none border-b border-border/20 bg-card/20" role="tablist" aria-label="Bracket rounds">
        <div className="flex overflow-x-auto px-3 py-2 gap-1" style={{ scrollbarWidth: 'none' }}>
          {/* "All" tab — full canvas */}
          <button
            role="tab"
            aria-selected={activeRound === 0}
            onClick={() => setActiveRound(0)}
            className={cn(
              'flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all',
              activeRound === 0
                ? 'bg-white/[0.12] text-foreground'
                : 'text-muted-foreground/55 hover:text-foreground/80 hover:bg-white/[0.04]',
            )}
          >
            <LayoutGrid className="h-3 w-3" aria-hidden="true" />
            All
          </button>

          {/* Round 1-7 tabs */}
          {([1, 2, 3, 4, 5, 6, 7] as const).map(round => {
            const rc = roundCompletion[round];
            const isComplete = rc && rc.total > 0 && rc.done === rc.total;
            const isPartial = rc && rc.done > 0 && !isComplete;
            const isRound = activeRound === round;
            return (
              <button
                key={round}
                role="tab"
                aria-selected={isRound}
                onClick={() => setActiveRound(round)}
                className={cn(
                  'flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all',
                  isRound
                    ? 'bg-white/[0.12] text-foreground'
                    : 'text-muted-foreground/55 hover:text-foreground/80 hover:bg-white/[0.04]',
                )}
              >
                {ROUND_NAMES[round]}
                {isComplete && <Check className="h-3 w-3 text-emerald-400" aria-label="Complete" />}
                {isPartial && <span className="text-[9px] font-black text-amber-400 tabular-nums">{rc.done}/{rc.total}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 relative overflow-hidden bg-muted/5">
        {activeRound === 0 ? (
          /* ── Full bracket canvas ── */
          <>
            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1 bg-background/80 backdrop-blur-sm p-1.5 rounded-xl border border-border/40 shadow-md">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-white/10 touch-manipulation" onClick={() => setZoom(z => Math.min(z + 0.2, 2))} aria-label="Zoom in">
                <ZoomIn className="w-4 h-4" aria-hidden="true" />
              </Button>
              <div className="text-[10px] font-bold text-muted-foreground/70 tabular-nums w-8 text-center" aria-live="polite" aria-label={`Zoom ${Math.round(zoom * 100)}%`}>{Math.round(zoom * 100)}%</div>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-white/10 touch-manipulation" onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))} aria-label="Zoom out">
                <ZoomOut className="w-4 h-4" aria-hidden="true" />
              </Button>
              <div className="w-full h-px bg-border/30 my-0.5" aria-hidden="true" />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg hover:bg-white/10 touch-manipulation"
                onClick={() => {
                  setZoom(0.4);
                  if (containerRef.current) {
                    containerRef.current.scrollLeft = 0;
                    containerRef.current.scrollTop = 0;
                  }
                }}
                aria-label="Reset view to default zoom"
              >
                <Maximize2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Scrollable bracket */}
            <div
              ref={containerRef}
              className="bracket-canvas w-full h-full overflow-auto p-6 sm:p-10 cursor-grab touch-none custom-scrollbar"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {finalMatch && (
                <div className="min-w-max min-h-max">
                  <div
                    ref={bracketRef}
                    className="bracket-inner inline-block origin-top-left bg-background/50 p-8 rounded-2xl"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <BracketTree
                      matchId={finalMatch.id}
                      matches={matches}
                      onSelectWinner={handleSelectWinner}
                      readOnly={isEffectivelyReadOnly}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Round card list ── */
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 max-w-lg mx-auto">

              {/* Round header with completion ring */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">
                    {ROUND_FULL_NAMES[activeRound]}
                  </h3>
                  <p className="text-[12px] text-muted-foreground/60 mt-0.5 tabular-nums">
                    {activeRoundCompletion.done} / {activeRoundCompletion.total} picked
                  </p>
                </div>
                {/* Completion ring */}
                <div
                  className="h-10 w-10 rounded-full relative flex items-center justify-center"
                  style={{
                    background: `conic-gradient(rgb(16 185 129 / 0.7) ${(activeRoundCompletion.done / Math.max(activeRoundCompletion.total, 1)) * 360}deg, rgb(255 255 255 / 0.06) 0deg)`,
                  }}
                  aria-hidden="true"
                >
                  <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center">
                    <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                      {activeRoundCompletion.total > 0
                        ? Math.round((activeRoundCompletion.done / activeRoundCompletion.total) * 100)
                        : 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Match cards */}
              <div className="flex flex-col gap-3">
                {activeRoundMatches.map((match, idx) => (
                  <MatchPickCard
                    key={match.id}
                    match={match}
                    matchIndex={idx}
                    onSelectWinner={handleSelectWinner}
                    readOnly={isEffectivelyReadOnly}
                  />
                ))}
              </div>

              {/* CTA when round is complete */}
              <AnimatePresence>
                {isRoundComplete && activeRound < 7 && (
                  <motion.div
                    key="next-round"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mt-4"
                  >
                    <Button
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-2xl font-semibold text-[14px]"
                      onClick={() => setActiveRound(r => r + 1)}
                    >
                      Continue to {ROUND_FULL_NAMES[activeRound + 1]} →
                    </Button>
                  </motion.div>
                )}
                {isRoundComplete && activeRound === 7 && !entry.isSubmitted && !readOnly && (
                  <motion.div
                    key="submit-cta"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mt-4"
                  >
                    <Button
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-2xl font-semibold text-[14px]"
                      onClick={handleSubmitClick}
                    >
                      🎉 Submit My Picks
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-6" aria-hidden="true" />
            </div>
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <div className="flex-none border-t border-border/20 bg-card/70 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70 tabular-nums">{score.picksCompleted} / {TOTAL_BRACKET_MATCHES} picks</span>
            <span className="font-bold text-emerald-400 tabular-nums">{score.total} pts</span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {!entry.isSubmitted && !readOnly && (
          <Button
            size="sm"
            className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-xl h-9 px-4 font-semibold"
            onClick={handleSubmitClick}
          >
            Submit Picks
          </Button>
        )}
        {entry.isSubmitted && (
          <div className="shrink-0 flex items-center gap-1.5 text-[13px] font-bold text-emerald-400">
            <Check className="h-4 w-4" />
            Submitted
          </div>
        )}
      </div>

      {/* Partial submission warning */}
      <AnimatePresence>
        {showSubmitModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSubmitModal(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm bg-card border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Incomplete Bracket</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowSubmitModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You have <span className="font-semibold text-foreground">{TOTAL_BRACKET_MATCHES - score.picksCompleted} picks remaining</span>. You can still submit, but incomplete picks won't earn points.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowSubmitModal(false)}>Keep Editing</Button>
                <Button size="sm" onClick={handleConfirmPartial}>Submit Anyway</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Tiebreaker modal */}
      <AnimatePresence>
        {showTiebreaker && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTiebreaker(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[340px] bg-card border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-5 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Tiebreaker Picks</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowTiebreaker(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Predict the Final match totals to break ties. (Optional)
              </p>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Total games in Final</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={tbGamesInput}
                    onChange={e => setTbGamesInput(e.target.value)}
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                    placeholder="e.g. 23"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Total sets in Final</span>
                  <select
                    value={tbSetsInput}
                    onChange={e => setTbSetsInput(e.target.value)}
                    className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all"
                  >
                    <option value="">Select…</option>
                    <option value="3">3 sets</option>
                    <option value="5">5 sets</option>
                  </select>
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={handleConfirmTiebreaker}>Skip</Button>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white border-0" onClick={handleConfirmTiebreaker}>Submit Picks</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
