import { useState, useEffect, useMemo, useRef, PointerEvent } from 'react';
import { tournaments } from './lib/mock-data';
import { fetchTournamentPlayers } from './services/geminiService';
import { generateBracket, advancePlayer, Match, Player } from './lib/bracket-utils';
import { BracketTree } from './components/Bracket';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Button } from './components/ui/button';
import { RefreshCw, ZoomIn, ZoomOut, Share2, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Menu, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [selectedTournament, setSelectedTournament] = useState(tournaments[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [zoom, setZoom] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  // Initialize bracket with AI
  useEffect(() => {
    async function initBracket() {
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
        
        for (let i = players.length; i < 128; i++) {
          players.push({ id: `p${i + 1}`, name: `Qualifier ${i - 31}` });
        }
        
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
  }, [selectedTournament]);

  const handleSelectWinner = (matchId: string, winnerId: string) => {
    setMatches(prev => advancePlayer(prev, matchId, winnerId));
  };

  const handleReset = () => {
    // Re-trigger useEffect
    setSelectedTournament(prev => prev);
  };

  const handleShare = () => {
    const state = JSON.stringify(matches);
    const encoded = btoa(state);
    const url = `${window.location.origin}${window.location.pathname}?bracket=${encoded}`;
    navigator.clipboard.writeText(url);
    alert('Bracket link copied to clipboard!');
  };

  const handleExport = async (format: 'image' | 'pdf') => {
    if (!bracketRef.current) return;
    const canvas = await html2canvas(bracketRef.current);
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
      <header className="flex-none border-b border-white/5 bg-card/40 backdrop-blur-3xl px-4 sm:px-6 py-4 sm:py-8 shadow-2xl z-30 sticky top-0">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <div className="absolute left-4 sm:left-6">
            <Button variant="ghost" size="icon" className="text-white/70 hover:text-white" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="h-8 w-8" />
            </Button>
          </div>
          <div className="flex items-center gap-4 sm:gap-16">
            <img 
              src="/logos/tennis.svg" 
              alt="Tennis Bracket" 
              className="h-12 sm:h-24 w-auto dark:invert transition-transform hover:scale-110 duration-500" 
              referrerPolicy="no-referrer" 
            />
            <div className="hidden sm:block h-16 w-px bg-white/10 mx-6" />
            {currentTournament?.logo && (
              <img 
                src={currentTournament.logo} 
                alt={currentTournament.name} 
                className="h-12 w-auto max-w-[150px] sm:max-w-[300px] object-contain hidden sm:block transition-all duration-500" 
                referrerPolicy="no-referrer" 
              />
            )}
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
              className="fixed top-0 left-0 bottom-0 w-80 bg-card border-r border-white/10 shadow-2xl z-50 p-6 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black uppercase tracking-widest">Tournaments</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
                  <X className="h-6 w-6" />
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {tournaments.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTournament(t.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-colors ${selectedTournament === t.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    {t.logo && <img src={t.logo} alt={t.name} className="h-10 w-10 object-contain" referrerPolicy="no-referrer" />}
                    <span className="text-lg font-bold">{t.name}</span>
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
              Export
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
