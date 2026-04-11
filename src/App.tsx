import { useState, useEffect, useMemo, useRef, PointerEvent } from 'react';
import { fetchTournamentPlayers, fetchTournamentsWithDates, TournamentData } from './services/geminiService';
import { generateBracket, advancePlayer, Match, Player } from './lib/bracket-utils';
import { BracketTree } from './components/Bracket';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Button } from './components/ui/button';
import { RefreshCw, ZoomIn, ZoomOut, Share2, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Menu, X, Trophy, Calendar } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [zoom, setZoom] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  // Load bracket from localStorage on mount or tournament change
  useEffect(() => {
    if (!selectedTournament) return;
    const saved = localStorage.getItem(`bracket_state_${selectedTournament}`);
    if (saved) {
      setMatches(JSON.parse(saved));
    }
  }, [selectedTournament]);

  // Save bracket to localStorage whenever matches change
  useEffect(() => {
    if (selectedTournament && matches.length > 0) {
      localStorage.setItem(`bracket_state_${selectedTournament}`, JSON.stringify(matches));
    }
  }, [matches, selectedTournament]);

  // Fetch tournaments on mount
  useEffect(() => {
    async function initTournaments() {
      setLoadingTournaments(true);
      try {
        const data = await fetchTournamentsWithDates();
        // Sort by closest date to today
        const now = new Date();
        const sorted = data.sort((a, b) => {
          const dateA = new Date(a.startDate);
          const dateB = new Date(b.startDate);
          
          // If date is in the past, move it further down
          const diffA = dateA.getTime() - now.getTime();
          const diffB = dateB.getTime() - now.getTime();
          
          if (diffA < 0 && diffB >= 0) return 1;
          if (diffA >= 0 && diffB < 0) return -1;
          
          return Math.abs(diffA) - Math.abs(diffB);
        });
        
        setTournaments(sorted);
        
        // Handle shared bracket from URL
        const params = new URLSearchParams(window.location.search);
        const shared = params.get('shared');
        let initialTournamentId = sorted.length > 0 ? sorted[0].id : null;
        
        if (shared) {
          try {
            const decoded = decodeURIComponent(atob(shared));
            const parsed = JSON.parse(decoded);
            if (parsed.tournamentId && parsed.matches) {
              localStorage.setItem(`bracket_state_${parsed.tournamentId}`, JSON.stringify(parsed.matches));
              initialTournamentId = parsed.tournamentId;
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } catch (e) {
            console.error("Failed to parse shared bracket:", e);
          }
        }
        
        if (initialTournamentId) {
          setSelectedTournament(initialTournamentId);
        }
      } catch (error) {
        console.error("Failed to fetch tournaments:", error);
      } finally {
        setLoadingTournaments(false);
      }
    }
    initTournaments();
  }, []);

  // Initialize bracket with AI
  useEffect(() => {
    if (!selectedTournament) return;
    
    async function initBracket() {
      // If we already have matches for this tournament from localStorage, don't fetch from AI
      const saved = localStorage.getItem(`bracket_state_${selectedTournament}`);
      if (saved) {
        setMatches(JSON.parse(saved));
        return;
      }

      setLoading(true);
      try {
        const tournament = tournaments.find(t => t.id === selectedTournament);
        const aiPlayers = await fetchTournamentPlayers(tournament?.name || 'Tennis Tournament');
        
        // Add unseeded players to reach 128
        const players: Player[] = aiPlayers.map((p: any, i: number) => ({
          id: `p${i + 1}`,
          name: p.name,
          seed: p.seed,
          country: p.country,
        }));
        
        const initialMatches = generateBracket(players);
        setMatches(initialMatches);
        setZoom(0.8);
      } catch (error) {
        console.error("Failed to fetch players:", error);
      } finally {
        setLoading(false);
      }
    }
    initBracket();
  }, [selectedTournament, tournaments]);

  const handleSelectWinner = (matchId: string, winnerId: string) => {
    setMatches(prev => advancePlayer(prev, matchId, winnerId));
  };

  const handleReset = () => {
    if (selectedTournament) {
      localStorage.removeItem(`bracket_state_${selectedTournament}`);
      // Also clear the player cache for this tournament to force a fresh AI search
      const tournament = tournaments.find(t => t.id === selectedTournament);
      if (tournament) {
        const cacheKey = `tennis_players_cache_v5_${tournament.name.replace(/\s+/g, '_').toLowerCase()}`;
        localStorage.removeItem(cacheKey);
      }
      
      // Force a re-fetch by temporarily clearing the selected tournament
      setMatches([]);
      const current = selectedTournament;
      setSelectedTournament(null);
      setTimeout(() => setSelectedTournament(current), 10);
    }
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
    toast.className = `fixed bottom-6 right-6 ${bg} text-white px-4 py-3 rounded-lg shadow-xl z-50 transition-all duration-300 transform translate-y-0 opacity-100 font-medium text-sm flex items-center gap-2`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  };

  const handleShare = async () => {
    try {
      const state = JSON.stringify({
        tournamentId: selectedTournament,
        matches: matches
      });
      const encoded = btoa(encodeURIComponent(state));
      const url = `${window.location.origin}${window.location.pathname}?shared=${encoded}`;
      await navigator.clipboard.writeText(url);
      showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Bracket link copied to clipboard!', 'success');
    } catch (err) {
      console.error('Failed to copy link:', err);
      showToast('Failed to copy link. Please try again.', 'error');
    }
  };

  const handleExport = async (format: 'image' | 'pdf') => {
    if (!bracketRef.current) return;
    
    showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Generating export...', 'info');
    
    try {
      // Temporarily remove transform for clean export
      const originalTransform = bracketRef.current.style.transform;
      bracketRef.current.style.transform = 'none';
      
      const canvas = await html2canvas(bracketRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#09090b',
        logging: false
      });
      
      // Restore transform
      bracketRef.current.style.transform = originalTransform;

      if (format === 'image') {
        const link = document.createElement('a');
        link.download = `bracket-${selectedTournament}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'px', [canvas.width, canvas.height]);
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`bracket-${selectedTournament}.pdf`);
      }
      showToast('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Export complete!', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Please try again.', 'error');
    }
  };

  const finalMatch = useMemo(() => {
    return matches.find(m => m.nextMatchId === null);
  }, [matches]);

  const currentTournament = tournaments.find(t => t.id === selectedTournament);

  // Panning logic
  const handlePointerDown = (e: PointerEvent) => {
    setIsDragging(true);
    setStartPos({ x: e.clientX - scrollPos.x, y: e.clientY - scrollPos.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const newScrollPos = {
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y
    };
    setScrollPos(newScrollPos);
    if (containerRef.current) {
      containerRef.current.scrollLeft = -newScrollPos.x;
      containerRef.current.scrollTop = -newScrollPos.y;
    }
  };

  const handlePointerUp = (e: PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const scroll = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (!containerRef.current) return;
    const amount = 300;
    const scrollOptions: ScrollToOptions = { behavior: 'smooth' };
    
    switch (direction) {
      case 'up': scrollOptions.top = -amount; break;
      case 'down': scrollOptions.top = amount; break;
      case 'left': scrollOptions.left = -amount; break;
      case 'right': scrollOptions.left = amount; break;
    }
    
    containerRef.current.scrollBy(scrollOptions);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-white/5 bg-card/40 backdrop-blur-3xl px-4 sm:px-6 py-4 sm:py-6 shadow-2xl z-30 sticky top-0">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <div className="absolute left-4 sm:left-6">
            <Button variant="ghost" size="icon" className="text-white/70 hover:text-white h-8 w-8" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-4 sm:gap-8">
            <img 
              src="/tennis_logo.png" 
              alt="Tennis" 
              className="h-8 w-8 transition-transform hover:rotate-12 duration-500" 
              referrerPolicy="no-referrer" 
            />
            <h1 className="text-sm font-black uppercase tracking-widest hidden sm:block">Grand Slam Tracker</h1>
            <div className="hidden sm:block h-8 w-px bg-white/10 mx-2" />
            <span className="text-xs font-bold uppercase opacity-70">{currentTournament?.name}</span>
          </div>
        </div>
      </header>

      {/* Sidebar Tournament Selector */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-card border-r border-white/10 shadow-2xl z-50 p-4 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest opacity-50">Tournaments</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                {loadingTournaments ? (
                  <div className="p-4 text-xs text-center opacity-50">Searching for dates...</div>
                ) : tournaments.map((t, index) => (
                  <button
                    key={`${t.id}-${t.startDate}-${index}`}
                    onClick={() => {
                      setSelectedTournament(t.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`flex flex-col gap-1 p-3 rounded-lg transition-all text-left ${selectedTournament === t.id ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-3">
                      {t.logo ? (
                        <img 
                          src={t.logo} 
                          alt={t.name} 
                          className="h-6 w-6 object-contain" 
                          referrerPolicy="no-referrer" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const fallback = document.createElement('div');
                            fallback.className = 'h-6 w-6 flex items-center justify-center bg-white/5 rounded';
                            fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="opacity-50"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>';
                            (e.target as HTMLImageElement).parentNode?.insertBefore(fallback, e.target as HTMLImageElement);
                          }}
                        />
                      ) : (
                        <Trophy className="h-4 w-4 opacity-50" />
                      )}
                      <span className="text-xs font-bold uppercase tracking-tight">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 opacity-40">
                      <Calendar className="h-3 w-3" />
                      <span className="text-[10px] font-medium">
                        {new Date(t.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(t.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content - Bracket Viewer */}
      <main className="flex-1 relative overflow-hidden bg-muted/5 pt-4 sm:pt-8">
        {/* Floating Action Tools */}
        <DropdownMenu>
          <DropdownMenuTrigger className="absolute top-6 right-6 z-20 cursor-pointer rounded-full shadow-lg h-10 w-10 opacity-80 hover:opacity-100 border border-border/50 bg-background/60 backdrop-blur flex items-center justify-center p-0">
            <MoreHorizontal className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="w-40">
            <DropdownMenuItem onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('image')}>
              <Download className="mr-2 h-4 w-4" />
              Export Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('pdf')}>
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Floating Navigation Controls */}
        <Button 
          variant="secondary" 
          className="absolute top-1/2 left-2 -translate-y-1/2 z-20 rounded-full shadow-lg h-24 w-8 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" 
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button 
          variant="secondary" 
          className="absolute top-1/2 right-2 -translate-y-1/2 z-20 rounded-full shadow-lg h-24 w-8 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" 
          onClick={() => scroll('right')}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button 
          variant="secondary" 
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full shadow-lg h-8 w-24 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" 
          onClick={() => scroll('up')}
        >
          <ChevronUp className="h-5 w-5" strokeWidth={1.5} />
        </Button>
        <Button 
          variant="secondary" 
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 rounded-full shadow-lg h-8 w-24 p-0 opacity-60 hover:opacity-100 transition-all border border-border/50 bg-background/60 backdrop-blur" 
          onClick={() => scroll('down')}
        >
          <ChevronDown className="h-5 w-5" strokeWidth={1.5} />
        </Button>

        {/* Zoom Controls */}
        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-lg border shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z + 0.2, 2))}>
            <ZoomIn className="w-5 h-5" />
          </Button>
          <div className="text-xs text-center font-medium text-muted-foreground">
            {Math.round(zoom * 100)}%
          </div>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))}>
            <ZoomOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Scrollable Canvas */}
        <div 
          ref={containerRef}
          className="w-full h-full overflow-auto p-8 cursor-grab active:cursor-grabbing touch-none custom-scrollbar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Generating AI Bracket...</div>
          ) : finalMatch && (
            <div 
              className="min-w-max min-h-max"
              style={{ 
                width: bracketRef.current ? bracketRef.current.offsetWidth * zoom : 'auto',
                height: bracketRef.current ? bracketRef.current.offsetHeight * zoom : 'auto',
                transition: 'width 0.2s, height 0.2s'
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
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
