import { useState, useRef, useMemo } from 'react';
import type { PointerEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ZoomIn, ZoomOut, Lock, Check, X,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BracketTree } from '@/components/Bracket';
import { advancePlayer } from '@/lib/bracket-utils';
import { calculateBracketScore } from '@/lib/scoring';
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
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tbGamesInput, setTbGamesInput] = useState(String(entry.tiebreakerGames ?? ''));
  const [tbSetsInput, setTbSetsInput] = useState(String(entry.tiebreakerSets ?? ''));
  const [pendingMatches, setPendingMatches] = useState<Match[] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);

  const score = useMemo(() => calculateBracketScore(matches), [matches]);
  const finalMatch = useMemo(() => matches.find(m => m.nextMatchId === null), [matches]);
  const totalMatches = matches.filter(m => m.player1 && m.player2).length;

  const isEffectivelyReadOnly = readOnly || entry.isSubmitted;

  const handleSelectWinner = (matchId: string, winnerId: string) => {
    if (isEffectivelyReadOnly) return;
    const updated = advancePlayer(matches, matchId, winnerId);
    setMatches(updated);
    onSave(updated);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setStartPos({ x: e.clientX - scrollPos.x, y: e.clientY - scrollPos.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const newScrollPos = { x: e.clientX - startPos.x, y: e.clientY - startPos.y };
    setScrollPos(newScrollPos);
    if (containerRef.current) {
      containerRef.current.scrollLeft = -newScrollPos.x;
      containerRef.current.scrollTop = -newScrollPos.y;
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const scroll = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (!containerRef.current) return;
    const amount = 300;
    const opts: ScrollToOptions = { behavior: 'smooth' };
    if (direction === 'up') opts.top = -amount;
    else if (direction === 'down') opts.top = amount;
    else if (direction === 'left') opts.left = -amount;
    else opts.left = amount;
    containerRef.current.scrollBy(opts);
  };

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-border/30 bg-card/40 backdrop-blur-3xl px-4 py-3 z-20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {pool.name}
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{entry.bracketName}</div>
            <div className="text-[10px] text-muted-foreground">in {pool.name}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold bg-primary/20 text-primary px-2 py-1 rounded-full">
              {score.total} pts
            </span>
            {entry.isSubmitted && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                <Check className="h-3 w-3" /> Submitted
              </span>
            )}
            {!entry.isSubmitted && isEffectivelyReadOnly && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
                <Lock className="h-3 w-3" /> Locked
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Bracket canvas */}
      <main className="flex-1 relative overflow-hidden bg-muted/5">
        {/* Floating nav controls */}
        <Button variant="secondary" className="absolute top-1/2 left-2 -translate-y-1/2 z-10 rounded-full shadow-lg h-24 w-8 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" onClick={() => scroll('left')}>
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button variant="secondary" className="absolute top-1/2 right-2 -translate-y-1/2 z-10 rounded-full shadow-lg h-24 w-8 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" onClick={() => scroll('right')}>
          <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button variant="secondary" className="absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded-full shadow-lg h-8 w-24 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" onClick={() => scroll('up')}>
          <ChevronUp className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button variant="secondary" className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 rounded-full shadow-lg h-8 w-24 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" onClick={() => scroll('down')}>
          <ChevronDown className="h-5 w-5" strokeWidth={1.5} />
        </Button>

        {/* Zoom controls */}
        <div className="absolute bottom-20 right-4 z-10 flex flex-col gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-lg border shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z + 0.2, 2))}>
            <ZoomIn className="w-5 h-5" />
          </Button>
          <div className="text-xs text-center font-medium text-muted-foreground">{Math.round(zoom * 100)}%</div>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))}>
            <ZoomOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Scrollable bracket */}
        <div
          ref={containerRef}
          className="w-full h-full overflow-auto p-8 cursor-grab active:cursor-grabbing touch-none custom-scrollbar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {finalMatch && (
            <div
              className="min-w-max min-h-max"
              style={{
                width: bracketRef.current ? bracketRef.current.offsetWidth * zoom : 'auto',
                height: bracketRef.current ? bracketRef.current.offsetHeight * zoom : 'auto',
                transition: 'width 0.2s, height 0.2s',
              }}
            >
              <div
                ref={bracketRef}
                className="inline-block transition-transform duration-200 ease-out origin-top-left bg-background p-8 rounded-xl border shadow-sm"
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
      </main>

      {/* Bottom bar */}
      <div className="flex-none border-t border-border/30 bg-card/60 backdrop-blur px-4 py-3 flex items-center gap-4">
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{score.picksCompleted} / {TOTAL_BRACKET_MATCHES} picks</span>
            <span className="font-bold text-primary">{score.total} pts</span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {!entry.isSubmitted && !readOnly && (
          <Button
            size="sm"
            className="shrink-0"
            onClick={handleSubmitClick}
          >
            Submit Picks
          </Button>
        )}
        {entry.isSubmitted && (
          <div className="shrink-0 flex items-center gap-1.5 text-sm font-bold text-green-400">
            <Check className="h-4 w-4" />
            Submitted
          </div>
        )}
      </div>

      {/* Partial submission warning */}
      <AnimatePresence>
        {showSubmitModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSubmitModal(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border/50 rounded-xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Incomplete Bracket</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSubmitModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                You have <span className="font-bold text-foreground">{TOTAL_BRACKET_MATCHES - score.picksCompleted} picks remaining</span>. You can still submit, but incomplete picks won't earn points.
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTiebreaker(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-card border border-white/10 rounded-xl shadow-2xl z-50 p-5 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Tiebreaker Picks</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTiebreaker(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Predict the Final match totals. Used to break ties if scores are equal. (Optional)
              </p>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold">Total games in Final (e.g., 23)</span>
                  <input
                    type="number"
                    min={0}
                    value={tbGamesInput}
                    onChange={e => setTbGamesInput(e.target.value)}
                    className="bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="e.g. 23"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold">Total sets in Final (3 or 5)</span>
                  <select
                    value={tbSetsInput}
                    onChange={e => setTbSetsInput(e.target.value)}
                    className="bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="">Select…</option>
                    <option value="3">3 sets</option>
                    <option value="5">5 sets</option>
                  </select>
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={handleConfirmTiebreaker}>Skip</Button>
                <Button size="sm" onClick={handleConfirmTiebreaker}>Submit Picks</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
