import { useState, useEffect, useMemo, useRef, PointerEvent } from 'react';
import { fetchTournamentPlayers, fetchTournamentsWithDates, TournamentData } from './services/geminiService';
import { generateBracket, advancePlayer, Match, Player } from './lib/bracket-utils';
import { BracketTree } from './components/Bracket';
import { calculateBracketScore, calculateCalendarSlamBonus, calculateSeasonScore, BracketScore } from './lib/scoring';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Button } from './components/ui/button';
import { RefreshCw, ZoomIn, ZoomOut, Share2, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Menu, X, Trophy, Calendar, Lock, Users } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { motion, AnimatePresence } from 'framer-motion';
import { PoolHub } from './components/pools/PoolHub';
import { PoolLeaderboard } from './components/pools/PoolLeaderboard';
import { PoolBracketEditor } from './components/pools/PoolBracketEditor';
import { createPool, addEntry, getPool, updateEntry, submitEntry, importPool, importEntry, generateId } from './lib/pool-storage';

export type AppView =
  | { page: 'bracket' }
  | { page: 'pools' }
  | { page: 'pool'; poolId: string }
  | { page: 'pool-entry'; poolId: string; entryId: string };

export default function App() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [zoom, setZoom] = useState(0.4);
  const [loading, setLoading] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });
  const [tiebreakerGames, setTiebreakerGames] = useState<Record<string, number>>({});
  const [tiebreakerSets, setTiebreakerSets] = useState<Record<string, number>>({});
  const [showTiebreakerModal, setShowTiebreakerModal] = useState(false);
  const [tbGamesInput, setTbGamesInput] = useState('');
  const [tbSetsInput, setTbSetsInput] = useState('');
  const [appView, setAppView] = useState<AppView>({ page: 'bracket' });
  const [poolRefreshKey, setPoolRefreshKey] = useState(0);

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

  // Load tiebreaker state from localStorage
  useEffect(() => {
    const savedGames = localStorage.getItem('tiebreaker_games');
    const savedSets = localStorage.getItem('tiebreaker_sets');
    if (savedGames) setTiebreakerGames(JSON.parse(savedGames));
    if (savedSets) setTiebreakerSets(JSON.parse(savedSets));
  }, []);

  // Save tiebreaker state to localStorage
  useEffect(() => {
    localStorage.setItem('tiebreaker_games', JSON.stringify(tiebreakerGames));
  }, [tiebreakerGames]);

  useEffect(() => {
    localStorage.setItem('tiebreaker_sets', JSON.stringify(tiebreakerSets));
  }, [tiebreakerSets]);

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

        // Handle pool URL params
        if (!shared) {
          const joinPoolParam = params.get('joinPool');
          const poolSnapParam = params.get('poolSnap');
          const importEntryPoolId = params.get('importEntry');
          const importEntryData = params.get('entry');

          if (joinPoolParam) {
            const imported = importPool(joinPoolParam);
            if (imported) {
              window.history.replaceState({}, document.title, window.location.pathname);
              setAppView({ page: 'pool', poolId: imported.id });
            }
          } else if (poolSnapParam) {
            const imported = importPool(poolSnapParam);
            if (imported) {
              window.history.replaceState({}, document.title, window.location.pathname);
              setAppView({ page: 'pool', poolId: imported.id });
            }
          } else if (importEntryPoolId && importEntryData) {
            const imported = importEntry(importEntryPoolId, importEntryData);
            if (imported) {
              window.history.replaceState({}, document.title, window.location.pathname);
              setAppView({ page: 'pool', poolId: importEntryPoolId });
            }
          }
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

        // Add 96 unseeded qualifiers to reach 128 total
        for (let i = players.length + 1; i <= 128; i++) {
          const qNum = i - 32;
          players.push({ id: `q${qNum}`, name: `Qualifier ${qNum}`, seed: undefined, country: '' });
        }

        const initialMatches = generateBracket(players);
        setMatches(initialMatches);
        setZoom(0.4);
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

  const generateOfficialDraw = async (tournamentId: string, tournamentName: string): Promise<Match[]> => {
    const aiPlayers = await fetchTournamentPlayers(tournamentName);
    const players: Player[] = aiPlayers.map((p: { name: string; seed?: number; country?: string }, i: number) => ({
      id: `p${i + 1}`,
      name: p.name,
      seed: p.seed,
      country: p.country,
    }));
    for (let i = players.length + 1; i <= 128; i++) {
      const qNum = i - 32;
      players.push({ id: `q${qNum}`, name: `Qualifier ${qNum}`, seed: undefined, country: '' });
    }
    return generateBracket(players);
  };

  const handleCreatePool = async (
    poolName: string,
    userName: string,
    bracketName: string,
    tournamentId: string,
    tournamentName: string
  ): Promise<void> => {
    const officialMatches = await generateOfficialDraw(tournamentId, tournamentName);
    const pool = createPool(poolName, tournamentId, tournamentName, officialMatches);
    const entryId = generateId();
    addEntry(pool.id, {
      id: entryId,
      userName,
      bracketName: bracketName || `${userName}'s Bracket`,
      matches: officialMatches.map(m => ({ ...m, winnerId: null })),
      isSubmitted: false,
    });
    setAppView({ page: 'pool', poolId: pool.id });
  };

  const handleReset = () => {    if (selectedTournament) {
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

  // Show tiebreaker modal when the final gets a winner and none is saved yet
  useEffect(() => {
    if (finalMatch?.winnerId && selectedTournament) {
      if (!tiebreakerGames[selectedTournament] || !tiebreakerSets[selectedTournament]) {
        setTbGamesInput(String(tiebreakerGames[selectedTournament] ?? ''));
        setTbSetsInput(String(tiebreakerSets[selectedTournament] ?? ''));
        setShowTiebreakerModal(true);
      }
    }
  }, [finalMatch?.winnerId, selectedTournament, tiebreakerGames, tiebreakerSets]);

  const currentTournament = tournaments.find(t => t.id === selectedTournament);

  // Scoring for the current bracket
  const score = useMemo(() => calculateBracketScore(matches), [matches]);

  // Bracket lock status
  const isLocked = useMemo(() => {
    if (!currentTournament) return false;
    return new Date() >= new Date(currentTournament.startDate);
  }, [currentTournament]);

  // All tournament scores (re-computes when current matches change)
  const allTournamentScores = useMemo((): Record<string, BracketScore> => {
    const scores: Record<string, BracketScore> = {};
    for (const t of tournaments) {
      if (t.id === selectedTournament) {
        scores[t.id] = score;
      } else {
        const saved = localStorage.getItem(`bracket_state_${t.id}`);
        if (saved) {
          try { scores[t.id] = calculateBracketScore(JSON.parse(saved)); } catch { /* skip */ }
        }
      }
    }
    return scores;
  }, [tournaments, selectedTournament, score]);

  // Calendar slam champion per tournament (the final match winner id)
  const champions = useMemo((): Record<string, string | null> => {
    const champs: Record<string, string | null> = {};
    for (const t of tournaments) {
      let tMatches: Match[];
      if (t.id === selectedTournament) {
        tMatches = matches;
      } else {
        const saved = localStorage.getItem(`bracket_state_${t.id}`);
        tMatches = saved ? (JSON.parse(saved) as Match[]) : [];
      }
      const finalM = tMatches.find(m => m.nextMatchId === null);
      champs[t.id] = finalM?.winnerId ?? null;
    }
    return champs;
  }, [tournaments, selectedTournament, matches]);

  const calendarBonus = useMemo(() => calculateCalendarSlamBonus(champions), [champions]);

  const seasonTotal = useMemo(
    () => calculateSeasonScore(allTournamentScores, calendarBonus.bonus),
    [allTournamentScores, calendarBonus]
  );

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
          {/* Left: menu button (only in bracket view) */}
          <div className="absolute left-4 sm:left-6">
            {appView.page === 'bracket' ? (
              <Button variant="ghost" size="icon" className="text-white/70 hover:text-white h-8 w-8" onClick={() => setIsSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            ) : null}
          </div>

          {/* Center: logo + nav tabs */}
          <div className="flex items-center gap-4 sm:gap-6">
            <img
              src="/tennis_logo.png"
              alt="Tennis"
              className="h-8 w-8 transition-transform hover:rotate-12 duration-500"
              referrerPolicy="no-referrer"
            />
            <h1 className="text-sm font-black uppercase tracking-widest hidden sm:block">Grand Slam Tracker</h1>
            <div className="hidden sm:block h-6 w-px bg-white/10" />
            {/* Nav tabs */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setAppView({ page: 'bracket' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  appView.page === 'bracket'
                    ? 'bg-white/15 text-foreground shadow-sm'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                My Bracket
              </button>
              <button
                onClick={() => setAppView({ page: 'pools' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  appView.page !== 'bracket'
                    ? 'bg-white/15 text-foreground shadow-sm'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Pools
              </button>
            </div>
            {/* Tournament name in bracket view */}
            {appView.page === 'bracket' && (
              <>
                <div className="hidden sm:block h-6 w-px bg-white/10" />
                <span className="text-xs font-bold uppercase opacity-70 hidden sm:block">{currentTournament?.name}</span>
              </>
            )}
          </div>

          {/* Right: score + lock badge (bracket view only) */}
          <div className="absolute right-4 sm:right-6 flex items-center gap-2">
            {appView.page === 'bracket' && matches.length > 0 && (
              <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold bg-primary/20 text-primary px-2 py-1 rounded-full">
                <Trophy className="h-3 w-3" />
                {score.total} pts
              </span>
            )}
            {appView.page === 'bracket' && currentTournament && (
              isLocked ? (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
              ) : (
                <span className="hidden sm:flex items-center gap-1 text-[10px] font-medium opacity-60 px-2 py-1">
                  ⏰ Locks {new Date(currentTournament.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )
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
                ) : tournaments.map((t, index) => {
                  const tScore = allTournamentScores[t.id];
                  return (
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
                        {tScore && (
                          <span className="ml-auto text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                            {tScore.total}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 opacity-40">
                        <Calendar className="h-3 w-3" />
                        <span className="text-[10px] font-medium">
                          {new Date(t.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(t.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Season summary at bottom of sidebar */}
              {Object.keys(allTournamentScores).length > 0 && (
                <div className="mt-auto pt-4 border-t border-white/10">
                  <div className="rounded-lg bg-white/5 p-3 flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Season Score</span>
                    <span className="text-lg font-black text-primary">{seasonTotal} pts</span>
                    {calendarBonus.bonus > 0 && (
                      <span className="text-[10px] text-amber-400">{calendarBonus.description}</span>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content - View Router */}
      <div className="flex-1 overflow-hidden relative">
        {appView.page === 'pools' && (
          <PoolHub
            onNavigate={setAppView}
            tournaments={tournaments}
            onCreatePool={handleCreatePool}
          />
        )}
        {appView.page === 'pool' && (() => {
          const pool = getPool(appView.poolId);
          if (!pool) return <div className="p-8 text-muted-foreground text-sm">Pool not found.</div>;
          return (
            <div key={appView.poolId + poolRefreshKey} className="h-full overflow-auto">
              <PoolLeaderboard
                pool={pool}
                onNavigate={setAppView}
                onPoolUpdate={() => setPoolRefreshKey(k => k + 1)}
              />
            </div>
          );
        })()}
        {appView.page === 'pool-entry' && (() => {
          const pool = getPool(appView.poolId);
          const entry = pool?.entries.find(e => e.id === appView.entryId);
          if (!pool || !entry) return <div className="p-8 text-muted-foreground text-sm">Entry not found.</div>;
          return (
            <div key={appView.entryId} className="h-full">
              <PoolBracketEditor
                pool={pool}
                entry={entry}
                onSave={(updatedMatches) => updateEntry(pool.id, entry.id, updatedMatches)}
                onSubmit={(updatedMatches, tbGames, tbSets) => {
                  updateEntry(pool.id, entry.id, updatedMatches);
                  submitEntry(pool.id, entry.id, tbGames, tbSets);
                  setAppView({ page: 'pool', poolId: pool.id });
                }}
                onBack={() => setAppView({ page: 'pool', poolId: pool.id })}
                readOnly={entry.isSubmitted}
              />
            </div>
          );
        })()}
        {appView.page === 'bracket' && (
          <main className="h-full relative overflow-hidden bg-muted/5 pt-4 sm:pt-8">
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

        {/* Score panel (bottom-left overlay) */}
        {matches.length > 0 && (
          <div className="absolute bottom-6 left-6 z-10 bg-background/90 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-lg text-xs flex flex-col gap-1 min-w-[140px]">
            <div className="font-black uppercase tracking-widest text-[9px] opacity-40 mb-1">Score</div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Base</span>
              <span className="font-bold">{score.basePoints} pts</span>
            </div>
            {score.upsetBonus > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-amber-400">Upset ⚡</span>
                <span className="font-bold text-amber-400">+{score.upsetBonus}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-1 mt-0.5">
              <span className="font-black text-primary">Total</span>
              <span className="font-black text-primary">{score.total} pts</span>
            </div>
            <div className="text-[10px] text-muted-foreground opacity-60">
              {score.picksCompleted}/127 picks
            </div>
            {finalMatch?.winnerId && selectedTournament && (
              <button
                onClick={() => {
                  setTbGamesInput(String(tiebreakerGames[selectedTournament] ?? ''));
                  setTbSetsInput(String(tiebreakerSets[selectedTournament] ?? ''));
                  setShowTiebreakerModal(true);
                }}
                className="mt-1 text-[9px] text-primary/70 hover:text-primary underline underline-offset-2 text-left"
              >
                {tiebreakerGames[selectedTournament] ? '✓ Tiebreaker set' : '+ Set tiebreaker'}
              </button>
            )}
          </div>
        )}

        {/* Tiebreaker modal */}
        <AnimatePresence>
          {showTiebreakerModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowTiebreakerModal(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-card border border-white/10 rounded-xl shadow-2xl z-50 p-5 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest">Tiebreaker Picks</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTiebreakerModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Predict the Final match totals. Used to break ties if scores are equal.
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
                  <Button variant="ghost" size="sm" onClick={() => setShowTiebreakerModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (selectedTournament) {
                        const g = parseInt(tbGamesInput, 10);
                        const s = parseInt(tbSetsInput, 10);
                        if (!isNaN(g)) setTiebreakerGames(prev => ({ ...prev, [selectedTournament]: g }));
                        if (!isNaN(s)) setTiebreakerSets(prev => ({ ...prev, [selectedTournament]: s }));
                      }
                      setShowTiebreakerModal(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
          </main>
        )}
      </div>
    </div>
  );
}
