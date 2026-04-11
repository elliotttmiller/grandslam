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
        const seededCount = players.length;
        for (let i = seededCount + 1; i <= 128; i++) {
          const qNum = i - seededCount;
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
    const seededCount = players.length;
    for (let i = seededCount + 1; i <= 128; i++) {
      const qNum = i - seededCount;
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
      <header className="flex-none border-b border-white/[0.06] bg-card/50 backdrop-blur-3xl px-4 sm:px-6 py-3 shadow-lg z-30 sticky top-0">
        <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[44px]">
          {/* Left: menu button (only in bracket view) */}
          <div className="absolute left-3 sm:left-5">
            {appView.page === 'bracket' ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-white/60 hover:text-white hover:bg-white/8 h-9 w-9 rounded-xl"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Open tournament selector"
              >
                <Menu className="h-[18px] w-[18px]" />
              </Button>
            ) : null}
          </div>

          {/* Center: logo + nav tabs */}
          <div className="flex items-center gap-3 sm:gap-5">
            <img
              src="/tennis_logo.png"
              alt="Grand Slam"
              className="h-7 w-7 transition-transform hover:rotate-12 duration-500 shrink-0"
              referrerPolicy="no-referrer"
            />
            <h1 className="text-[13px] font-black uppercase tracking-widest hidden sm:block text-white/80">Grand Slam</h1>
            <div className="hidden sm:block h-5 w-px bg-white/10" />
            {/* Nav tabs */}
            <div className="flex items-center gap-0.5 bg-white/[0.06] rounded-xl p-1">
              <button
                onClick={() => setAppView({ page: 'bracket' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                  appView.page === 'bracket'
                    ? 'bg-white/[0.12] text-foreground shadow-sm'
                    : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                My Bracket
              </button>
              <button
                onClick={() => setAppView({ page: 'pools' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                  appView.page !== 'bracket'
                    ? 'bg-white/[0.12] text-foreground shadow-sm'
                    : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Pools
              </button>
            </div>
            {/* Tournament name in bracket view */}
            {appView.page === 'bracket' && currentTournament && (
              <>
                <div className="hidden sm:block h-5 w-px bg-white/10" />
                <span className="text-[12px] font-semibold text-white/55 hidden sm:block truncate max-w-[160px]">{currentTournament.name}</span>
              </>
            )}
          </div>

          {/* Right: score + lock badge (bracket view only) */}
          <div className="absolute right-3 sm:right-5 flex items-center gap-2">
            {appView.page === 'bracket' && matches.length > 0 && score.total > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <Trophy className="h-3 w-3" />
                {score.total}
              </span>
            )}
            {appView.page === 'bracket' && currentTournament && (
              isLocked ? (
                <span className="flex items-center gap-1 text-[11px] font-bold bg-red-500/15 text-red-400 px-2.5 py-1 rounded-full border border-red-500/20">
                  <Lock className="h-3 w-3" />
                  <span className="hidden xs:inline">Locked</span>
                </span>
              ) : (
                <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-white/40 px-2 py-1">
                  ⏰ {new Date(currentTournament.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
              transition={{ duration: 0.2 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-50"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-card/95 backdrop-blur-xl border-r border-white/[0.08] shadow-2xl z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-white/40">Select Tournament</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white rounded-xl" onClick={() => setIsSidebarOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar px-3 pb-3">
                {loadingTournaments ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-xs text-white/40">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Loading tournaments…
                  </div>
                ) : tournaments.map((t, index) => {
                  const tScore = allTournamentScores[t.id];
                  const isSelected = selectedTournament === t.id;
                  return (
                    <button
                      key={`${t.id}-${t.startDate}-${index}`}
                      onClick={() => {
                        setSelectedTournament(t.id);
                        setIsSidebarOpen(false);
                      }}
                      className={`flex flex-col gap-1 p-3 rounded-xl transition-all text-left ${
                        isSelected
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/25'
                          : 'hover:bg-white/[0.05] active:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {t.logo ? (
                          <img
                            src={t.logo}
                            alt={t.name}
                            className="h-6 w-6 object-contain shrink-0"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Trophy className={`h-4 w-4 shrink-0 ${isSelected ? 'text-emerald-400' : 'opacity-40'}`} />
                        )}
                        <span className={`text-[13px] font-semibold truncate ${isSelected ? 'text-emerald-300' : 'text-white/80'}`}>
                          {t.name}
                        </span>
                        {tScore && tScore.total > 0 && (
                          <span className="ml-auto text-[10px] font-bold bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">
                            {tScore.total}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 pl-[34px] text-white/35">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span className="text-[11px]">
                          {new Date(t.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(t.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Season summary at bottom of sidebar */}
              {Object.keys(allTournamentScores).length > 0 && (
                <div className="px-4 pb-5 pt-3 border-t border-white/[0.07]">
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4 flex flex-col gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/35">Season Total</span>
                    <span className="text-2xl font-black text-emerald-400">{seasonTotal} <span className="text-sm font-semibold text-white/40">pts</span></span>
                    {calendarBonus.bonus > 0 && (
                      <span className="text-[11px] text-amber-400/80 font-medium">{calendarBonus.description}</span>
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
          <main className="h-full relative overflow-hidden bg-muted/5">
        {/* Floating Action Tools */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="absolute top-4 right-4 z-20 cursor-pointer rounded-xl shadow-lg h-9 w-9 opacity-70 hover:opacity-100 border border-border/40 bg-background/70 backdrop-blur-sm flex items-center justify-center p-0 transition-all duration-150"
            aria-label="Bracket actions"
          >
            <MoreHorizontal className="h-4.5 w-4.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={8} className="w-44">
            <DropdownMenuItem onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset Bracket
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Share Link
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
          className="absolute top-1/2 left-1.5 -translate-y-1/2 z-20 rounded-xl shadow-md h-20 w-7 p-0 opacity-50 hover:opacity-90 transition-all border border-border/40 bg-background/60 backdrop-blur-sm"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </Button>
        <Button
          variant="secondary"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 z-20 rounded-xl shadow-md h-20 w-7 p-0 opacity-50 hover:opacity-90 transition-all border border-border/40 bg-background/60 backdrop-blur-sm"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Button>
        <Button
          variant="secondary"
          className="absolute top-1.5 left-1/2 -translate-x-1/2 z-20 rounded-xl shadow-md h-7 w-20 p-0 opacity-50 hover:opacity-90 transition-all border border-border/40 bg-background/60 backdrop-blur-sm"
          onClick={() => scroll('up')}
          aria-label="Scroll up"
        >
          <ChevronUp className="h-4 w-4" strokeWidth={2} />
        </Button>
        <Button
          variant="secondary"
          className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 rounded-xl shadow-md h-7 w-20 p-0 opacity-50 hover:opacity-90 transition-all border border-border/40 bg-background/60 backdrop-blur-sm"
          onClick={() => scroll('down')}
          aria-label="Scroll down"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </Button>

        {/* Zoom Controls */}
        <div className="absolute bottom-5 right-4 z-10 flex flex-col items-center gap-1 bg-background/80 backdrop-blur-sm p-1.5 rounded-xl border border-border/40 shadow-md">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-white/10"
            onClick={() => setZoom(z => Math.min(z + 0.2, 2))}
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="text-[10px] text-center font-bold text-muted-foreground/70 w-8">
            {Math.round(zoom * 100)}%
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-white/10"
            onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))}
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable Canvas */}
        <div 
          ref={containerRef}
          className="w-full h-full overflow-auto p-6 sm:p-10 cursor-grab active:cursor-grabbing touch-none custom-scrollbar"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground/60">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              >
                <RefreshCw className="h-6 w-6" />
              </motion.div>
              <span className="text-sm font-medium">Building bracket…</span>
            </div>
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
                className="inline-block transition-transform duration-200 ease-out origin-top-left bg-background/50 p-8 rounded-2xl"
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
          <div className="absolute bottom-5 left-4 z-10 bg-background/90 backdrop-blur-md border border-border/50 rounded-xl px-3.5 py-3 shadow-xl text-xs flex flex-col gap-1.5 min-w-[148px]">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-0.5">Score</div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground/80">Base</span>
              <span className="font-bold tabular-nums">{score.basePoints}</span>
            </div>
            {score.upsetBonus > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-amber-400/90">Upset ⚡</span>
                <span className="font-bold text-amber-400 tabular-nums">+{score.upsetBonus}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-border/30 pt-1.5 mt-0.5">
              <span className="font-bold text-emerald-400">Total</span>
              <span className="font-black text-emerald-400 tabular-nums">{score.total}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/50 tabular-nums">
              {score.picksCompleted}/127 picks
            </div>
            {finalMatch?.winnerId && selectedTournament && (
              <button
                onClick={() => {
                  setTbGamesInput(String(tiebreakerGames[selectedTournament] ?? ''));
                  setTbSetsInput(String(tiebreakerSets[selectedTournament] ?? ''));
                  setShowTiebreakerModal(true);
                }}
                className="mt-0.5 text-[10px] text-emerald-400/60 hover:text-emerald-400 underline underline-offset-2 text-left transition-colors"
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
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.18 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[340px] bg-card border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-5 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">Tiebreaker Picks</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowTiebreakerModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Predict the Final match totals. Used to break ties if scores are equal.
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
