import { useState, useEffect, useMemo, useRef, useCallback, PointerEvent, TouchEvent } from 'react';
import { tournaments } from './lib/mock-data';
import { fetchTournamentPlayers, clearPlayerCache } from './services/geminiService';
import { generateBracket, advancePlayer, Match, Player } from './lib/bracket-utils';
import { assetUrl, APP_BACKGROUND_COLOR } from './lib/utils';
import { BracketTree } from './components/Bracket';
import { Button } from './components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import {
  RefreshCw, ZoomIn, ZoomOut, Share2, Download,
  ChevronLeft, ChevronRight, MoreHorizontal, Menu, X, Trophy, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Loading Skeleton ──────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-muted-foreground select-none">
      <motion.div
        className="relative"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      >
        <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary" />
      </motion.div>
      <motion.p
        className="text-sm font-medium tracking-widest uppercase"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        Generating Bracket…
      </motion.p>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedTournament, setSelectedTournament] = useState(tournaments[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // `players` holds the last successfully fetched/cached player list.
  // Keeping it in state lets "Reset Picks" regenerate the bracket without any
  // network round-trip.
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [zoom, setZoom] = useState(0.75);
  const [loading, setLoading] = useState(false);
  // Incremented only on an explicit "Refresh Players" user action.
  // Normal tournament switches use the cache.
  const [fetchKey, setFetchKey] = useState(0);
  // When true, the next fetch should bypass the cache (user triggered a refresh).
  const forceRefreshRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);

  // ─── Touch / pointer panning ────────────────────────────────────────────────
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startScroll = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, [role="button"]')) return;
    isDragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    startScroll.current = {
      x: containerRef.current?.scrollLeft ?? 0,
      y: containerRef.current?.scrollTop ?? 0,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !containerRef.current) return;
    const dx = startPos.current.x - e.clientX;
    const dy = startPos.current.y - e.clientY;
    containerRef.current.scrollLeft = startScroll.current.x + dx;
    containerRef.current.scrollTop = startScroll.current.y + dy;
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // ─── Pinch-to-zoom ─────────────────────────────────────────────────────────
  const lastPinchDist = useRef<number | null>(null);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (lastPinchDist.current !== null) {
      const delta = dist - lastPinchDist.current;
      setZoom(z => Math.max(0.25, Math.min(2, z + delta * 0.003)));
    }
    lastPinchDist.current = dist;
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  // ─── Keyboard pan / zoom ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!containerRef.current) return;
      const step = 200;
      if (e.key === 'ArrowLeft') containerRef.current.scrollLeft -= step;
      if (e.key === 'ArrowRight') containerRef.current.scrollLeft += step;
      if (e.key === 'ArrowUp') containerRef.current.scrollTop -= step;
      if (e.key === 'ArrowDown') containerRef.current.scrollTop += step;
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.15, 2));
      if (e.key === '-') setZoom(z => Math.max(z - 0.15, 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.max(0.25, Math.min(2, z + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ─── Load bracket ─────────────────────────────────────────────────────────
  // Triggered by tournament switch OR explicit user refresh (fetchKey increment).
  // For tournament switches the service returns cached data immediately (no AI
  // call). Only a forceRefresh bypasses the cache.
  useEffect(() => {
    let cancelled = false;
    async function initBracket() {
      setLoading(true);

      // Consume the forceRefresh flag atomically so subsequent renders don't
      // re-trigger a fresh fetch accidentally.
      const doForceRefresh = forceRefreshRef.current;
      forceRefreshRef.current = false;

      try {
        const tournament = tournaments.find(t => t.id === selectedTournament);
        const tournamentName = tournament?.name ?? 'Tennis Tournament';

        const aiPlayers = await fetchTournamentPlayers(tournamentName, {
          forceRefresh: doForceRefresh,
        });
        if (cancelled) return;

        const fetchedPlayers: Player[] = aiPlayers.map((p, i) => ({
          id: `p${i + 1}`,
          name: p.name,
          seed: p.seed,
          country: p.country,
        }));

        // Fill up to 128 with qualifiers
        for (let i = fetchedPlayers.length; i < 128; i++) {
          fetchedPlayers.push({ id: `p${i + 1}`, name: `Qualifier ${i - 31}` });
        }

        setPlayers(fetchedPlayers);
        setMatches(generateBracket(fetchedPlayers));
        setZoom(0.75);

        // Auto-scroll bracket to centre after render
        requestAnimationFrame(() => {
          if (containerRef.current && bracketRef.current) {
            const bw = bracketRef.current.scrollWidth * 0.75;
            const vw = containerRef.current.clientWidth;
            containerRef.current.scrollLeft = Math.max(0, (bw - vw) / 2);
          }
        });
      } catch (error) {
        console.error('Failed to generate bracket:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initBracket();
    return () => { cancelled = true; };
  // fetchKey is included so that an explicit refresh triggers a re-run even
  // when the selected tournament hasn't changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournament, fetchKey]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectWinner = useCallback((matchId: string, winnerId: string | null) => {
    setMatches(prev => advancePlayer(prev, matchId, winnerId));
  }, []);

  /**
   * Reset Picks — clears all winner selections and regenerates the bracket from
   * the already-cached player list.  No network call is made.
   */
  const handleResetPicks = useCallback(() => {
    if (players.length > 0) {
      setMatches(generateBracket(players));
    }
  }, [players]);

  /**
   * Refresh Players — clears the cache for the current tournament and re-fetches
   * live data from Gemini.  Only this action should trigger a real AI call after
   * the initial load.
   */
  const handleRefreshPlayers = useCallback(() => {
    const tournament = tournaments.find(t => t.id === selectedTournament);
    if (tournament) {
      clearPlayerCache(tournament.name);
    }
    forceRefreshRef.current = true;
    setFetchKey(k => k + 1);
  }, [selectedTournament]);

  const handleShare = useCallback(() => {
    const encoded = btoa(JSON.stringify(matches));
    const url = `${window.location.origin}${window.location.pathname}?bracket=${encoded}`;
    navigator.clipboard.writeText(url).then(() => alert('Bracket link copied!')).catch(() => {
      prompt('Copy this link:', url);
    });
  }, [matches]);

  const handleExport = useCallback(async (format: 'image' | 'pdf') => {
    if (!bracketRef.current) return;
    try {
      // Dynamically import heavy export libraries to keep initial bundle small
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(bracketRef.current, { scale: 2, backgroundColor: APP_BACKGROUND_COLOR });
      if (format === 'image') {
        const link = document.createElement('a');
        link.download = 'bracket.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'px', [canvas.width, canvas.height]);
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save('bracket.pdf');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  }, []);

  const finalMatch = useMemo(() => matches.find(m => m.nextMatchId === null), [matches]);
  const currentTournament = tournaments.find(t => t.id === selectedTournament);
  const champion = useMemo(() => {
    if (!finalMatch?.winnerId) return null;
    return finalMatch.player1?.id === finalMatch.winnerId ? finalMatch.player1 : finalMatch.player2;
  }, [finalMatch]);

  const scroll = (dir: 'left' | 'right') => {
    if (!containerRef.current) return;
    containerRef.current.scrollBy({ left: dir === 'left' ? -400 : 400, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex-none border-b border-white/5 bg-card/60 backdrop-blur-2xl px-4 py-3 shadow-xl z-30">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-4">
          {/* Left — Hamburger */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open tournaments"
            className="text-white/70 hover:text-white shrink-0 h-11 w-11"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>

          {/* Centre — Logos */}
          <div className="flex items-center gap-3 sm:gap-6 flex-1 justify-center min-w-0">
            <img
              src={assetUrl('logos/tennis.svg')}
              alt="Grand Slam"
              className="h-9 sm:h-12 w-auto transition-transform duration-500 hover:scale-110 shrink-0"
            />
            <AnimatePresence mode="wait">
              {currentTournament?.logo && (
                <motion.div
                  key={currentTournament.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center"
                >
                  <img
                    src={assetUrl(currentTournament.logo)}
                    alt={currentTournament.name}
                    className="h-8 sm:h-11 w-auto max-w-[140px] sm:max-w-[220px] object-contain"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right — Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Actions"
                className="text-white/70 hover:text-white shrink-0 h-11 w-11"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-48">
              <DropdownMenuItem onClick={handleResetPicks}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset Picks
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRefreshPlayers}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh Players
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" /> Share Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('image')}>
                <Download className="mr-2 h-4 w-4" /> Export PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                <Download className="mr-2 h-4 w-4" /> Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Champion Banner ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {champion && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-none bg-gradient-to-r from-yellow-500/20 via-amber-400/20 to-yellow-500/20 border-b border-yellow-500/30 px-4 py-2 text-center"
          >
            <p className="text-sm font-bold tracking-widest uppercase text-yellow-300 flex items-center justify-center gap-2">
              <Trophy className="h-4 w-4" />
              Champion: {champion.name}
              {champion.country && (
                <span className="text-yellow-300/70">({champion.country})</span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 left-0 bottom-0 w-72 sm:w-80 bg-card border-r border-white/10 shadow-2xl z-50 p-5 flex flex-col gap-4 safe-area-inset"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-black uppercase tracking-widest">Grand Slams</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  className="h-10 w-10"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <nav className="flex flex-col gap-2">
                {tournaments.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTournament(t.id); setIsSidebarOpen(false); }}
                    className={`flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200 ${
                      selectedTournament === t.id
                        ? 'bg-white/10 ring-1 ring-white/20'
                        : 'hover:bg-white/5 active:bg-white/10'
                    }`}
                  >
                    {t.logo && (
                      <img
                        src={assetUrl(t.logo)}
                        alt={t.name}
                        className="h-10 w-10 object-contain shrink-0"
                      />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-base truncate">{t.name}</span>
                      {selectedTournament === t.id && (
                        <span className="text-xs text-muted-foreground">Currently viewing</span>
                      )}
                    </div>
                  </button>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Bracket Canvas ──────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">

        {/* Horizontal scroll arrows */}
        <button
          aria-label="Scroll left"
          onClick={() => scroll('left')}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-20 hidden sm:flex items-center justify-center h-20 w-7 rounded-full bg-background/60 backdrop-blur border border-white/10 shadow-lg opacity-60 hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <button
          aria-label="Scroll right"
          onClick={() => scroll('right')}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-20 hidden sm:flex items-center justify-center h-20 w-7 rounded-full bg-background/60 backdrop-blur border border-white/10 shadow-lg opacity-60 hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
        </button>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1 bg-background/80 backdrop-blur-sm p-1.5 rounded-xl border border-white/10 shadow-lg">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            className="h-9 w-9"
            onClick={() => setZoom(z => Math.min(z + 0.15, 2))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="text-[10px] text-center font-mono text-muted-foreground select-none py-0.5">
            {Math.round(zoom * 100)}%
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            className="h-9 w-9"
            onClick={() => setZoom(z => Math.max(z - 0.15, 0.25))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable/pannable bracket area */}
        <div
          ref={containerRef}
          className="w-full h-full overflow-auto custom-scrollbar touch-pan-x touch-pan-y"
          style={{ cursor: 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {loading ? (
            <LoadingState />
          ) : finalMatch ? (
            <div
              className="p-6 sm:p-10 inline-block"
              style={{ minWidth: 'max-content' }}
            >
              <div
                ref={bracketRef}
                className="origin-top-left transition-transform duration-200 ease-out"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
              >
                <BracketTree
                  matchId={finalMatch.id}
                  matches={matches}
                  onSelectWinner={handleSelectWinner}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No bracket data available.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
