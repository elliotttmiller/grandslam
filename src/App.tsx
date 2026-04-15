import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useBracketCanvas } from './hooks/useBracketCanvas';
import { fetchTournamentPlayers, fetchTournamentsWithDates, fetchMastersDrawPlayers, TournamentData, CACHE_KEY_TOURNAMENTS } from './services/geminiService';
import { generateBracket, generateMastersBracket, advancePlayer, Match, Player, getRoundName, getRoundFullName } from './lib/bracket-utils';
import { BracketTree } from './components/Bracket';
import { calculateBracketScore, calculateCalendarSlamBonus, calculateSeasonScore, BracketScore } from './lib/scoring';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Button } from './components/ui/button';
import { RefreshCw, ZoomIn, ZoomOut, Share2, Download, MoreHorizontal, Menu, X, Trophy, Calendar, Lock, Users, Maximize2, LayoutGrid, ChevronUp, ChevronDown, LogIn, LogOut, UserCircle, LayoutDashboard, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PoolHub } from './components/pools/PoolHub';
import { PoolLeaderboard } from './components/pools/PoolLeaderboard';
import { PoolBracketEditor } from './components/pools/PoolBracketEditor';
import { MatchPickCard } from './components/pools/MatchPickCard';
import { AuthModal } from './components/AuthModal';
import { AccountMenu } from './components/AccountMenu';
import { Dashboard } from './components/Dashboard';
import { cn } from './lib/utils';
import { createPool, addEntry, getPool, updateEntry, submitEntry, importPool, importEntry, generateId, POOL_CODE_LENGTH } from './lib/pool-storage';
import { setAuthStorageUserId, authGetItem, authSetItem, authRemoveItem } from './lib/auth-storage';
import { syncCreatePool, syncAddEntry, syncUpdateEntry } from './services/poolSyncService';
import { onAuthStateChanged, signOut, signInAnonymously } from './services/authService';
import { getUserId, setUserName } from './lib/user-identity';
import { AnimatedNumber } from './components/AnimatedNumber';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { BracketLoadingSkeleton, RoundListSkeleton } from './components/BracketLoadingSkeleton';
import { MastersTournamentModal } from './components/MastersTournamentModal';
import { MASTERS_TOURNAMENTS, GRAND_SLAM_STATIC_INFO, type MastersTournament } from './lib/masters-tournaments';
import type { User } from 'firebase/auth';

export type AppView =
  | { page: 'dashboard' }
  | { page: 'bracket' }
  | { page: 'pools' }
  | { page: 'pool'; poolId: string }
  | { page: 'pool-entry'; poolId: string; entryId: string };

export default function App() {
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [zoom, setZoom] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  // 0 = full bracket canvas, 1-7 = round-by-round card view
  const [activeRound, setActiveRound] = useState<number>(0);
  const bracketRef = useRef<HTMLDivElement>(null);
  const { handlePointerDown, handlePointerMove, handlePointerUp, containerRef: canvasRef } = useBracketCanvas({
    zoom,
    onZoomChange: setZoom,
    enabled: activeRound === 0,
  });
  const [tiebreakerGames, setTiebreakerGames] = useState<Record<string, number>>({});
  const [tiebreakerSets, setTiebreakerSets] = useState<Record<string, number>>({});
  const [showTiebreakerModal, setShowTiebreakerModal] = useState(false);
  const [tbGamesInput, setTbGamesInput] = useState('');
  const [tbSetsInput, setTbSetsInput] = useState('');
  const [appView, setAppView] = useState<AppView>({ page: 'dashboard' });
  // Code from a `?join=POOL_CODE` URL param — passed to PoolHub to pre-fill the join modal.
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  // Set to true when a newly-created pool fails to sync to Firestore, so we can
  // warn the creator that others may not be able to join by code.
  const [poolSyncFailed, setPoolSyncFailed] = useState(false);

  // Masters 1000 tournament search state
  const [mastersSearchQuery, setMastersSearchQuery] = useState('');
  const [selectedMastersTournament, setSelectedMastersTournament] = useState<MastersTournament | null>(null);

  // Firebase Authentication state — tracked via onAuthStateChanged at root level
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalDefaultMode, setAuthModalDefaultMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  // Subscribe to auth state changes once on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      setAuthUser(user);
      
      // Scope storage to the current user's UID to prevent cache collision
      // when multiple users sign in on the same device
      if (user) {
        setAuthStorageUserId(user.uid);
      } else {
        setAuthStorageUserId(null);
      }
      
      if (!user) {
        // No existing session — user must either sign in/sign up with email,
        // or explicitly choose to continue as a guest (which triggers anonymous sign-in).
        // We mark auth as checked but let the user decide their auth method.
        setAuthError(false);
        setAuthChecked(true);
      } else {
        // Named user or existing session — auth is ready.
        setAuthError(false);
        setAuthChecked(true);
      }
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSignInClick = () => {
    setAuthModalDefaultMode('sign-in');
    setShowAuthModal(true);
  };

  const handleSignUpClick = () => {
    setAuthModalDefaultMode('sign-up');
    setShowAuthModal(true);
  };

  // App view ref — lets the celebration effect read current page without adding
  // appView as a dependency (which would re-run the effect on navigation)
  const appViewRef = useRef(appView.page);
  appViewRef.current = appView.page;

  // Champion celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationName, setCelebrationName] = useState<string | undefined>();
  const prevFinalWinnerRef = useRef<string | null>(null);
  // Framer Motion toast queue
  interface Toast { id: number; message: string; type: 'success' | 'info' | 'error' }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toastCounter = useRef(0);
  useEffect(() => {
    if (!selectedTournament) return;
    const saved = authGetItem(`bracket_state_${selectedTournament}`);
    if (saved) {
      setMatches(JSON.parse(saved));
    }
  }, [selectedTournament]);

  // Save bracket to localStorage whenever matches change
  useEffect(() => {
    if (selectedTournament && matches.length > 0) {
      authSetItem(`bracket_state_${selectedTournament}`, JSON.stringify(matches));
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
        // Tag Grand Slams and merge with static Masters 1000 entries
        const grandSlams: TournamentData[] = data.map(t => ({ ...t, type: 'grand-slam' as const }));
        const mastersTournaments: TournamentData[] = MASTERS_TOURNAMENTS.map(t => ({
          id: t.id,
          name: t.name,
          startDate: t.approxStart,
          endDate: t.approxEnd,
          type: 'masters' as const,
        }));
        // Sort all tournaments soonest to latest by start date
        const sorted = [...grandSlams, ...mastersTournaments].sort((a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
        
        setTournaments(sorted);
        
        // Handle shared bracket from URL
        const params = new URLSearchParams(window.location.search);
        const shared = params.get('shared');
        // Default to first Grand Slam (not a Masters) for the bracket viewer
        let initialTournamentId = grandSlams.length > 0 ? grandSlams[0].id : null;
        
        if (shared) {
          try {
            const decoded = decodeURIComponent(atob(shared));
            const parsed = JSON.parse(decoded);
            if (parsed.tournamentId && parsed.matches) {
              authSetItem(`bracket_state_${parsed.tournamentId}`, JSON.stringify(parsed.matches));
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
          const joinCodeParam = params.get('join');        // ?join=POOL_CODE  (short invite link)
          const joinPoolParam = params.get('joinPool');    // legacy encoded pool join
          const poolSnapParam = params.get('poolSnap');
          const importEntryPoolId = params.get('importEntry');
          const importEntryData = params.get('entry');

          if (joinCodeParam) {
            // Short invite link — just a 6-char pool code.
            // Navigate to the Pools page so PoolHub can auto-open the join modal.
            window.history.replaceState({}, document.title, window.location.pathname);
            setPendingJoinCode(joinCodeParam.toUpperCase().slice(0, POOL_CODE_LENGTH));
            setAppView({ page: 'pools' });
          } else if (joinPoolParam) {
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

  // Refresh Grand Slam tournament dates — clears user-scoped cache then re-fetches
  const handleRefreshTournaments = useCallback(async () => {
    authRemoveItem(CACHE_KEY_TOURNAMENTS);
    setLoadingTournaments(true);
    try {
      const data = await fetchTournamentsWithDates();
      const grandSlams: TournamentData[] = data.map(t => ({ ...t, type: 'grand-slam' as const }));
      const mastersTournaments: TournamentData[] = MASTERS_TOURNAMENTS.map(t => ({
        id: t.id,
        name: t.name,
        startDate: t.approxStart,
        endDate: t.approxEnd,
        type: 'masters' as const,
      }));
      const sorted = [...grandSlams, ...mastersTournaments].sort((a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      setTournaments(sorted);
    } catch (error) {
      console.error('Failed to refresh tournaments:', error);
    } finally {
      setLoadingTournaments(false);
    }
  }, []);

  // Initialize bracket with AI
  useEffect(() => {
    if (!selectedTournament) return;
    
    async function initBracket() {
      // If we already have matches for this tournament from localStorage, don't fetch from AI
      const saved = authGetItem(`bracket_state_${selectedTournament}`);
      if (saved) {
        setMatches(JSON.parse(saved));
        return;
      }

      setLoading(true);
      try {
        const tournament = tournaments.find(t => t.id === selectedTournament);
        const isMasters = tournament?.type === 'masters';

        if (isMasters) {
          // Masters 1000: 64-player bracket with 16 AI-predicted/official seeds
          const aiPlayers = await fetchMastersDrawPlayers(tournament!.id, tournament!.name);
          const players: Player[] = aiPlayers.map((p, i) => ({
            id: `p${i + 1}`,
            name: p.name,
            seed: p.seed,
            country: p.country,
          }));
          const initialMatches = generateMastersBracket(players);
          setMatches(initialMatches);
          setZoom(0.7);
        } else {
          // Grand Slam: 128-player bracket with 32 AI-predicted/official seeds
          const aiPlayers = await fetchTournamentPlayers(tournament?.name || 'Tennis Tournament');
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
          setZoom(0.7);
        }
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
    const isMasters = MASTERS_TOURNAMENTS.some(t => t.id === tournamentId);
    if (isMasters) {
      // Masters 1000: 64-player bracket with AI-predicted/official seedings
      const aiPlayers = await fetchMastersDrawPlayers(tournamentId, tournamentName);
      const players: Player[] = aiPlayers.map((p, i) => ({
        id: `p${i + 1}`,
        name: p.name,
        seed: p.seed,
        country: p.country,
      }));
      return generateMastersBracket(players);
    }
    // Grand Slam: 128-player bracket
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
    // Persist user name so subsequent joins pre-fill the field
    setUserName(userName);
    const entryId = generateId();
    const userId = getUserId();
    const pool = createPool(poolName, tournamentId, tournamentName, officialMatches, userId);
    const newEntry = {
      id: entryId,
      userId,
      userName,
      bracketName: bracketName || `${userName}'s Bracket`,
      matches: officialMatches.map(m => ({ ...m, winnerId: null })),
      isSubmitted: false,
    };
    addEntry(pool.id, newEntry);

    // Push pool and initial entry to the sync server (best-effort).
    // Only attempt sync if authentication is ready. If auth failed or is still
    // initializing, skip sync — the pool remains in localStorage but won't be
    // joinable from other devices. Awaiting ensures the pool exists in Firestore
    // before the creator navigates away, so other devices can immediately find
    // it by code.
    if (authChecked && !authError && authUser) {
      const synced = await syncCreatePool(pool);
      if (synced) {
        await syncAddEntry(pool.id, newEntry);
        setPoolSyncFailed(false);
      } else {
        // Pool was saved locally but not to Firestore — warn the creator.
        setPoolSyncFailed(true);
        console.warn('Pool sync failed — pool is accessible locally but may not be joinable from other devices.');
      }
    } else {
      // Auth is not ready — pool will remain local-only.
      setPoolSyncFailed(true);
      if (authError) {
        console.warn('Cannot sync pool — authentication failed. Pool is accessible locally only.');
      } else if (!authChecked) {
        console.warn('Cannot sync pool — authentication is still initializing. Pool is accessible locally only.');
      }
    }

    setAppView({ page: 'pool', poolId: pool.id });
  };

  const handleReset = () => {    if (selectedTournament) {
      authRemoveItem(`bracket_state_${selectedTournament}`);
      // Also clear the player cache for this tournament to force a fresh AI search
      const tournament = tournaments.find(t => t.id === selectedTournament);
      if (tournament) {
        const cacheKey = `tennis_players_cache_v5_${tournament.name.replace(/\s+/g, '_').toLowerCase()}`;
        localStorage.removeItem(cacheKey);
      }
      // Clear tiebreaker data for this tournament
      setTiebreakerGames(prev => { const next = { ...prev }; delete next[selectedTournament]; return next; });
      setTiebreakerSets(prev => { const next = { ...prev }; delete next[selectedTournament]; return next; });
      
      // Force a re-fetch by temporarily clearing the selected tournament
      setMatches([]);
      const current = selectedTournament;
      setSelectedTournament(null);
      setTimeout(() => setSelectedTournament(current), 10);
    }
  };

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  const handleShare = async () => {
    try {
      const state = JSON.stringify({
        tournamentId: selectedTournament,
        matches: matches
      });
      const encoded = btoa(encodeURIComponent(state));
      const url = `${window.location.origin}${window.location.pathname}?shared=${encoded}`;
      await navigator.clipboard.writeText(url);
      showToast('Bracket link copied to clipboard!', 'success');
    } catch (err) {
      console.error('Failed to copy link:', err);
      showToast('Failed to copy link. Please try again.', 'error');
    }
  };

  const handleExport = async (format: 'image' | 'pdf') => {
    if (!bracketRef.current) return;
    
    showToast('Generating export…', 'info');
    
    try {
      // Dynamically import heavy export libraries only when needed
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

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
      showToast('Export complete!', 'success');
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

  // Champion celebration — fires once when the final match winner is first set
  useEffect(() => {
    const prev = prevFinalWinnerRef.current;
    const current = finalMatch?.winnerId ?? null;
    if (!prev && current && appViewRef.current === 'bracket') {
      const winner = finalMatch
        ? (finalMatch.player1?.id === current ? finalMatch.player1 : finalMatch.player2)
        : null;
      setCelebrationName(winner?.name);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }
    prevFinalWinnerRef.current = current;
  }, [finalMatch?.winnerId]); // appView.page intentionally read via ref to avoid re-triggering on navigation

  const currentTournament = tournaments.find(t => t.id === selectedTournament);

  // Total rounds in the current bracket (7 for Grand Slams, 6 for Masters 1000)
  const totalRounds = useMemo(
    () => matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 7,
    [matches],
  );

  // Scoring for the current bracket
  const score = useMemo(() => calculateBracketScore(matches), [matches]);

  // Per-round completion tracking for home bracket view
  const roundCompletion = useMemo(() => {
    const c: Record<number, { total: number; done: number }> = {};
    for (let r = 1; r <= totalRounds; r++) c[r] = { total: 0, done: 0 };
    for (const m of matches) {
      if (m.round >= 1 && m.round <= totalRounds && m.player1 && m.player2) {
        c[m.round].total++;
        if (m.winnerId) c[m.round].done++;
      }
    }
    return c;
  }, [matches, totalRounds]);

  const activeRoundMatches = useMemo(
    () => matches.filter(m => m.round === activeRound).sort((a, b) => a.matchNumber - b.matchNumber),
    [matches, activeRound],
  );

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
        const saved = authGetItem(`bracket_state_${t.id}`);
        if (saved) {
          try { scores[t.id] = calculateBracketScore(JSON.parse(saved)); } catch { /* skip */ }
        }
      }
    }
    return scores;
  }, [tournaments, selectedTournament, score]);

  // Calendar slam champion per Grand Slam tournament (used for calendar slam bonus)
  const champions = useMemo((): Record<string, string | null> => {
    const champs: Record<string, string | null> = {};
    const grandSlamIds = ['ao', 'rg', 'wim', 'uso'];
    for (const t of tournaments.filter(t => grandSlamIds.includes(t.id))) {
      let tMatches: Match[];
      if (t.id === selectedTournament) {
        tMatches = matches;
      } else {
        const saved = authGetItem(`bracket_state_${t.id}`);
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

  return (
    <div className="bg-background text-foreground">
      {/* Champion celebration overlay */}
      <CelebrationOverlay visible={showCelebration} championName={celebrationName} />

      {/* Authentication modal */}
      <AuthModal
        open={showAuthModal}
        defaultMode={authModalDefaultMode}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(user) => {
          setAuthUser(user);
          setShowAuthModal(false);
        }}
        onContinueAsGuest={async () => {
          try {
            await signInAnonymously();
            setAuthError(false);
            setShowAuthModal(false);
          } catch (err) {
            console.warn('Anonymous sign-in failed:', err);
            setAuthError(true);
            throw err;
          }
        }}
      />

      {/* ATP Masters 1000 tournament detail modal */}
      <MastersTournamentModal
        tournament={selectedMastersTournament}
        onClose={() => setSelectedMastersTournament(null)}
      />

      {/* Framer Motion toast stack */}
      <div className="fixed bottom-6 right-4 z-90 flex flex-col gap-2 items-end pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.22 }}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white max-w-70 ${
                toast.type === 'success' ? 'bg-emerald-600' :
                toast.type === 'error'   ? 'bg-red-600' :
                                           'bg-zinc-700'
              }`}
            >
              {toast.type === 'success' && <span>✓</span>}
              {toast.type === 'error'   && <span>✕</span>}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header — 3-column flex: [left shrink-0] [center flex-1] [right shrink-0]
           This prevents the score/auth badges on the right from ever overlapping
           the centered nav tabs on narrow mobile screens. */}
      <header className="safe-top fixed top-0 left-0 right-0 border-b border-white/6 bg-card/80 backdrop-blur-3xl z-30 shadow-lg">
        <div className="flex items-center h-16 px-3 gap-2 max-w-7xl mx-auto">

          {/* Left: menu button */}
          <div className="flex items-center shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/8 h-9 w-9 rounded-xl"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isSidebarOpen}
              aria-haspopup="dialog"
            >
              <Menu className="h-4.5 w-4.5" aria-hidden="true" />
            </Button>
          </div>

          {/* Center: app logo */}
          <div className="flex-1 flex justify-center items-center">
            <img
              src="/grandslam/perfect-set-logo.png"
              alt="Perfect Set"
              className="h-14 w-14 object-contain drop-shadow-lg"
              draggable={false}
            />
          </div>

          {/* Right: auth account menu */}
          <div className="flex items-center gap-1.5 shrink-0">
            {appView.page === 'bracket' && matches.length > 0 && score.total > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20" aria-label={`Score: ${score.total} points`}>
                <Trophy className="h-3 w-3" aria-hidden="true" />
                <AnimatedNumber value={score.total} />
              </span>
            )}
            {appView.page === 'bracket' && currentTournament && (
              isLocked ? (
                <span className="hidden sm:flex items-center gap-1 text-[11px] font-bold bg-red-500/15 text-red-400 px-2.5 py-1 rounded-full border border-red-500/20" aria-label="Bracket locked">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  <span>Locked</span>
                </span>
              ) : (
                <span className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-white/40 px-2 py-1" aria-label={`Tournament starts ${new Date(currentTournament.startDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`}>
                  ⏰ {new Date(currentTournament.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )
            )}
            {/* Auth button — shown once the initial auth check is complete */}
            {authChecked && (
              <AccountMenu
                authChecked={authChecked}
                authUser={authUser}
                onSignOut={handleSignOut}
                onSignInClick={handleSignInClick}
                onSignUpClick={handleSignUpClick}
              />
            )}
          </div>
        </div>
      </header>

      {/* Sidebar Navigation */}
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
              aria-hidden="true"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 left-0 bottom-0 w-70 bg-card/95 backdrop-blur-xl border-r border-white/8 shadow-2xl z-50 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              <div className="safe-top flex items-center justify-between px-5 pt-5 pb-4">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-white/40">Menu</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white rounded-xl" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation menu">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Navigation Tabs */}
              <div className="px-3 pb-4 flex flex-col gap-1">
                <button
                  onClick={() => {
                    setAppView({ page: 'dashboard' });
                    setIsSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                    appView.page === 'dashboard'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25'
                      : 'text-white/70 hover:text-white/90 hover:bg-white/5'
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  Dashboard
                </button>

                <button
                  onClick={() => {
                    setAppView({ page: 'bracket' });
                    setIsSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                    appView.page === 'bracket'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25'
                      : 'text-white/70 hover:text-white/90 hover:bg-white/5'
                  }`}
                >
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                  Bracket Viewer
                </button>

                <button
                  onClick={() => {
                    setAppView({ page: 'pools' });
                    setIsSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-semibold transition-all ${
                    (appView.page === 'pools' || appView.page === 'pool' || appView.page === 'pool-entry')
                      ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25'
                      : 'text-white/70 hover:text-white/90 hover:bg-white/5'
                  }`}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  My Pools
                </button>
              </div>

              {/* Divider */}
              <div className="mx-3 h-px bg-white/8 mb-4" aria-hidden="true" />

              {/* Tournament Selector (only in bracket view) */}
              {appView.page === 'bracket' && (
                <>
                  <div className="px-5 pb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-white/40">Tournaments</h3>
                    <button
                      onClick={handleRefreshTournaments}
                      disabled={loadingTournaments}
                      className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                      aria-label="Refresh Grand Slam tournament dates"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingTournaments ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>
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
                  const now = new Date();
                  const start = new Date(t.startDate);
                  const end = new Date(t.endDate);
                  const isActive = now >= start && now <= end;
                  const isPast = now > end;
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
                          : 'hover:bg-white/5 active:bg-white/8'
                      }`}
                      aria-current={isSelected ? 'true' : undefined}
                    >
                      <div className="flex items-center gap-2.5">
                        {t.logo ? (
                          <img
                            src={t.logo}
                            alt=""
                            className="h-6 w-6 object-contain shrink-0"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Trophy className={`h-4 w-4 shrink-0 ${isSelected ? 'text-emerald-400' : 'opacity-40'}`} aria-hidden="true" />
                        )}
                        <span className={`text-[13px] font-semibold truncate flex-1 min-w-0 ${isSelected ? 'text-emerald-300' : 'text-white/80'}`}>
                          {t.name}
                        </span>
                        {isActive && (
                          <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                            Live
                          </span>
                        )}
                        {isPast && !isActive && (
                          <span className="shrink-0 text-[9px] font-bold text-white/25 bg-white/4 px-1.5 py-0.5 rounded-full border border-white/8">
                            Past
                          </span>
                        )}
                        {tScore && tScore.total > 0 && (
                          <span className="shrink-0 text-[10px] font-bold bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full">
                            {tScore.total}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 pl-8.5 text-white/35">
                        <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="text-[11px]">
                          {new Date(t.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(t.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  );
                })}
                  </div>
                </>
              )}

              {/* Tournament Search — always visible (Grand Slams + Masters 1000) */}
              <div className={cn('flex flex-col', appView.page === 'bracket' ? 'border-t border-white/[0.07] pt-4 mt-1 max-h-64 overflow-hidden' : 'flex-1 overflow-hidden')}>
                <div className="px-5 pb-2 shrink-0">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-white/40">Tournaments</h3>
                </div>
                {/* Search input */}
                <div className="px-3 pb-2 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Search tournaments…"
                      value={mastersSearchQuery}
                      onChange={e => setMastersSearchQuery(e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/[0.09] rounded-xl pl-8.5 pr-3 py-2 text-[12px] text-white/80 placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-amber-500/40 focus:border-amber-500/30 transition-all"
                      aria-label="Search all tournaments"
                    />
                  </div>
                </div>
                {/* Tournament list */}
                <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar px-3 pb-3">
                  {(() => {
                    const q = mastersSearchQuery.toLowerCase().trim();

                    // Build enriched Grand Slam entries using dynamic dates when available
                    const filteredSlams = GRAND_SLAM_STATIC_INFO.map(info => {
                      const dynamic = tournaments.find(t => t.id === info.id);
                      return {
                        ...info,
                        name: dynamic?.name ?? info.shortName,
                        startDate: dynamic?.startDate ?? '',
                        endDate: dynamic?.endDate ?? '',
                        logo: dynamic?.logo,
                      };
                    }).filter(t =>
                      !q ||
                      t.name.toLowerCase().includes(q) ||
                      t.shortName.toLowerCase().includes(q) ||
                      t.location.toLowerCase().includes(q)
                    );

                    const filteredMasters = MASTERS_TOURNAMENTS.filter(t =>
                      !q ||
                      t.name.toLowerCase().includes(q) ||
                      t.shortName.toLowerCase().includes(q) ||
                      t.location.toLowerCase().includes(q)
                    );

                    if (filteredSlams.length === 0 && filteredMasters.length === 0) {
                      return <p className="text-[12px] text-white/30 text-center py-6">No tournaments match "{mastersSearchQuery}"</p>;
                    }

                    return (
                      <>
                        {filteredSlams.length > 0 && (
                          <>
                            <p className="px-2 pt-1 pb-1 text-[10px] font-black uppercase tracking-widest text-white/25">Grand Slams</p>
                            {filteredSlams.map(t => {
                              const now = new Date();
                              const start = t.startDate ? new Date(t.startDate) : null;
                              const end = t.endDate ? new Date(t.endDate) : null;
                              const isActive = start && end ? now >= start && now <= end : false;
                              const isPast = end ? now > end : false;
                              const surfaceTag = t.surface === 'Clay'
                                ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                                : t.surface === 'Grass'
                                  ? 'text-green-400 bg-green-500/10 border-green-500/20'
                                  : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => {
                                    setSelectedMastersTournament({
                                      id: t.id,
                                      name: t.name,
                                      shortName: t.shortName,
                                      location: t.location,
                                      country: t.country,
                                      surface: t.surface,
                                      approxStart: t.startDate,
                                      approxEnd: t.endDate,
                                    });
                                    setIsSidebarOpen(false);
                                  }}
                                  className="flex flex-col gap-1 p-3 rounded-xl transition-all text-left hover:bg-white/5 active:bg-white/8"
                                  aria-label={`Open AI tournament details for ${t.name}`}
                                >
                                  <div className="flex items-center gap-2">
                                    {t.logo ? (
                                      <img src={t.logo} alt="" className="h-4 w-4 object-contain shrink-0" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                    ) : (
                                      <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400/60" aria-hidden="true" />
                                    )}
                                    <span className="text-[13px] font-semibold truncate flex-1 min-w-0 text-white/80">
                                      {t.shortName}
                                    </span>
                                    {isActive && (
                                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                                        Live
                                      </span>
                                    )}
                                    {isPast && !isActive && (
                                      <span className="shrink-0 text-[9px] font-bold text-white/25 bg-white/4 px-1.5 py-0.5 rounded-full border border-white/8">
                                        Past
                                      </span>
                                    )}
                                    <span className={cn('shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full border', surfaceTag)}>
                                      {t.surface}
                                    </span>
                                  </div>
                                  {start && end && (
                                    <div className="flex items-center gap-1.5 pl-[22px] text-white/30">
                                      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                                      <span className="text-[11px] truncate">
                                        {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        {' – '}
                                        {end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                      </span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </>
                        )}
                        {filteredMasters.length > 0 && (
                          <>
                            <p className="px-2 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-white/25">Masters 1000</p>
                            {filteredMasters.map(t => {
                              const now = new Date();
                              const start = new Date(t.approxStart);
                              const end = new Date(t.approxEnd);
                              const isActive = now >= start && now <= end;
                              const isPast = now > end;
                              const surfaceTag = t.surface === 'Clay'
                                ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                                : t.surface === 'Indoor Hard'
                                  ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
                                  : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => {
                                    setSelectedMastersTournament(t);
                                    setIsSidebarOpen(false);
                                  }}
                                  className="flex flex-col gap-1 p-3 rounded-xl transition-all text-left hover:bg-white/5 active:bg-white/8"
                                  aria-label={`View details for ${t.name}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400/60" aria-hidden="true" />
                                    <span className="text-[13px] font-semibold truncate flex-1 min-w-0 text-white/80">
                                      {t.shortName}
                                    </span>
                                    {isActive && (
                                      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                                        Live
                                      </span>
                                    )}
                                    {isPast && !isActive && (
                                      <span className="shrink-0 text-[9px] font-bold text-white/25 bg-white/4 px-1.5 py-0.5 rounded-full border border-white/8">
                                        Past
                                      </span>
                                    )}
                                    <span className={cn('shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full border', surfaceTag)}>
                                      {t.surface === 'Indoor Hard' ? 'Indoor' : t.surface}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 pl-[22px] text-white/30">
                                    <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    <span className="text-[11px] truncate">
                                      {new Date(t.approxStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      {' – '}
                                      {new Date(t.approxEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Season summary at bottom of sidebar */}
              {Object.keys(allTournamentScores).length > 0 && (
                <div className="safe-bottom px-4 pb-5 pt-3 border-t border-white/[0.07]">
                  <div className="rounded-xl bg-white/4 border border-white/7 p-4 flex flex-col gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/35">Season Total</span>
                    <span className="text-2xl font-black text-emerald-400">
                      <AnimatedNumber value={seasonTotal} /> <span className="text-sm font-semibold text-white/40">pts</span>
                    </span>
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
      <div className="fixed top-(--header-height) left-0 right-0 bottom-0 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {appView.page === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col"
            >
              <Dashboard
                onNavigate={setAppView}
                onCreatePool={() => setAppView({ page: 'pools' })}
              />
            </motion.div>
          )}
          {appView.page === 'pools' && (
            <motion.div
              key="pools"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col"
            >
              <PoolHub
                onNavigate={setAppView}
                tournaments={tournaments}
                onCreatePool={handleCreatePool}
                initialJoinCode={pendingJoinCode ?? undefined}
                onJoinHandled={() => setPendingJoinCode(null)}
                authError={authError}
              />
            </motion.div>
          )}
          {appView.page === 'pool' && (() => {
            const pool = getPool(appView.poolId);
            if (!pool) return <div className="p-8 text-muted-foreground text-sm">Pool not found.</div>;
            return (
              <motion.div
                key={appView.poolId}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute inset-0 overflow-y-auto overflow-x-hidden"
              >
                {poolSyncFailed && (
                  <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2.5 mx-4 mt-4">
                    ⚠️ This pool could not be saved to the cloud. Others may not be able to join by code until your connection is restored.
                  </p>
                )}
                <PoolLeaderboard
                  pool={pool}
                  onNavigate={setAppView}
                />
              </motion.div>
            );
          })()}
          {appView.page === 'pool-entry' && (() => {
            const pool = getPool(appView.poolId);
            const entry = pool?.entries.find(e => e.id === appView.entryId);
            if (!pool || !entry) return <div className="p-8 text-muted-foreground text-sm">Entry not found.</div>;
            return (
              <motion.div
                key={appView.entryId}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute inset-0 flex flex-col"
              >
                <PoolBracketEditor
                  pool={pool}
                  entry={entry}
                  onSave={(updatedMatches) => {
                    updateEntry(pool.id, entry.id, updatedMatches);
                    // Best-effort sync to server
                    syncUpdateEntry(pool.id, entry.id, { matches: updatedMatches });
                  }}
                  onSubmit={(updatedMatches, tbGames, tbSets) => {
                    updateEntry(pool.id, entry.id, updatedMatches);
                    submitEntry(pool.id, entry.id, tbGames, tbSets);
                    // Push final submission to server
                    syncUpdateEntry(pool.id, entry.id, {
                      matches: updatedMatches,
                      isSubmitted: true,
                      submittedAt: new Date().toISOString(),
                      ...(tbGames !== undefined ? { tiebreakerGames: tbGames } : {}),
                      ...(tbSets !== undefined ? { tiebreakerSets: tbSets } : {}),
                    });
                    setAppView({ page: 'pool', poolId: pool.id });
                  }}
                  onBack={() => setAppView({ page: 'pool', poolId: pool.id })}
                  readOnly={entry.isSubmitted || (entry.userId !== undefined && entry.userId !== getUserId())}
                />
              </motion.div>
            );
          })()}
          {appView.page === 'bracket' && (
            <motion.main
              key="bracket"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 overflow-hidden bg-muted/5 flex flex-col"
            >
          {/* Round / view selector tabs */}
          <div className="flex-none border-b border-border/20 bg-card/20" role="tablist" aria-label="Bracket rounds">
            <div className="flex overflow-x-auto px-3 py-2 gap-1" style={{ scrollbarWidth: 'none' }}>
              {/* Canvas/draw tab — icon only, replaces "All" */}
              <button
                role="tab"
                aria-label="Full bracket draw"
                aria-selected={activeRound === 0}
                onClick={() => setActiveRound(0)}
                className={cn(
                  'flex-none flex items-center justify-center px-3 py-1.5 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all',
                  activeRound === 0
                    ? 'bg-white/12 text-foreground'
                    : 'text-muted-foreground/55 hover:text-foreground/80 hover:bg-white/4',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {/* Round tabs — number of rounds depends on bracket size (7 for Grand Slams, 6 for Masters) */}
              {Array.from({ length: totalRounds }, (_, i) => i + 1).map(round => {
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
                        ? 'bg-white/12 text-foreground'
                        : 'text-muted-foreground/55 hover:text-foreground/80 hover:bg-white/4',
                    )}
                  >
                    {getRoundName(round, totalRounds)}
                    {isComplete && <span className="text-emerald-400 text-[10px]">✓</span>}
                    {isPartial && <span className="text-[9px] font-black text-amber-400 tabular-nums">{rc.done}/{rc.total}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horizontal toolbar — canvas mode only: score + view controls */}
          {activeRound === 0 && matches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-none border-b border-border/15 bg-card/20 backdrop-blur-sm px-2 py-1.5 flex items-center gap-2"
            >
              {/* Left: score info */}
              <div className="flex items-center gap-1.5 bg-background/60 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs min-w-0 overflow-hidden flex-1">
                <Trophy className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-black text-emerald-400 tabular-nums shrink-0">
                  <AnimatedNumber value={score.total} />
                </span>
                <span className="text-white/35 shrink-0">pts</span>
                {score.upsetBonus > 0 && (
                  <>
                    <span className="text-white/25 shrink-0">·</span>
                    <span className="text-amber-400 font-bold shrink-0">⚡<AnimatedNumber value={score.upsetBonus} /></span>
                  </>
                )}
                <span className="text-white/25 shrink-0">·</span>
                <span className="text-white/50 tabular-nums shrink-0">{score.picksCompleted}/{matches.filter(m => m.player1 && m.player2).length}</span>
                {finalMatch?.winnerId && selectedTournament && (
                  <button
                    onClick={() => {
                      setTbGamesInput(String(tiebreakerGames[selectedTournament] ?? ''));
                      setTbSetsInput(String(tiebreakerSets[selectedTournament] ?? ''));
                      setShowTiebreakerModal(true);
                    }}
                    className="text-[10px] text-emerald-400/50 hover:text-emerald-400 transition-colors shrink-0 ml-0.5"
                    aria-label="Set tiebreaker"
                  >
                    {tiebreakerGames[selectedTournament] ? '✓TB' : '+TB'}
                  </button>
                )}
              </div>

              {/* Right: view controls */}
              <div className="flex items-center gap-0.5 bg-background/60 border border-border/30 rounded-xl px-1.5 py-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-white/10 touch-manipulation"
                  onClick={() => canvasRef.current?.scrollBy({ top: -180, behavior: 'smooth' })}
                  aria-label="Scroll up"
                >
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-white/10 touch-manipulation"
                  onClick={() => canvasRef.current?.scrollBy({ top: 180, behavior: 'smooth' })}
                  aria-label="Scroll down"
                >
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <div className="w-px h-4 bg-border/40 mx-0.5" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-white/10 touch-manipulation"
                  onClick={() => setZoom(z => Math.max(z - 0.1, 0.2))}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-white/10 touch-manipulation"
                  onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <div className="w-px h-4 bg-border/40 mx-0.5" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:bg-white/10 touch-manipulation"
                  onClick={() => {
                    setZoom(0.7);
                    if (canvasRef.current) {
                      canvasRef.current.scrollLeft = 0;
                      canvasRef.current.scrollTop = 0;
                    }
                  }}
                  aria-label="Reset view to default zoom"
                >
                  <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg hover:bg-white/10 touch-manipulation"
                      aria-label="Bracket actions"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
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
              </div>
            </motion.div>
          )}

          {/* Main bracket content */}
          <div className="flex-1 relative overflow-hidden">
          {activeRound === 0 ? (
          <>
          {/* Scrollable Canvas */}
          <div 
            ref={canvasRef}
            className="bracket-canvas w-full h-full overflow-auto p-6 sm:p-10 cursor-grab custom-scrollbar"
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {loading ? (
              <BracketLoadingSkeleton />
            ) : finalMatch && (
              <div 
                className="min-w-max min-h-max"
                style={{ 
                  width: bracketRef.current ? bracketRef.current.offsetWidth * zoom : 'auto',
                  height: bracketRef.current ? bracketRef.current.offsetHeight * zoom : 'auto',
                }}
              >
                <div 
                  ref={bracketRef}
                  className="bracket-inner inline-block origin-top-left bg-background/50 p-8 rounded-2xl"
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

          </> /* end activeRound === 0 */
          ) : loading ? (
            <RoundListSkeleton />
          ) : (
            /* ── Round card list ── */
            <div
              className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar round-card-scroll"
            >
              <div className="px-4 py-4 max-w-lg mx-auto" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>

                {/* Round header with completion ring */}
                {(() => {
                  const rc = roundCompletion[activeRound] ?? { total: 0, done: 0 };
                  return (
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">
                          {getRoundFullName(activeRound, totalRounds)}
                        </h3>
                        <p className="text-[12px] text-muted-foreground/60 mt-0.5 tabular-nums">
                          {rc.done} / {rc.total} picked
                        </p>
                      </div>
                      {/* Completion ring */}
                      <div
                        className="h-10 w-10 rounded-full relative flex items-center justify-center"
                        style={{
                          background: `conic-gradient(rgb(16 185 129 / 0.7) ${(rc.done / Math.max(rc.total, 1)) * 360}deg, rgb(255 255 255 / 0.06) 0deg)`,
                        }}
                        aria-hidden="true"
                      >
                        <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center">
                          <span className="text-[10px] font-black tabular-nums text-muted-foreground">
                            {rc.total > 0 ? Math.round((rc.done / rc.total) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Match cards — Round 1 grouped in pairs to show which R2 match they feed */}
                {activeRound === 1 ? (
                  <div className="flex flex-col gap-4">
                    {Array.from({ length: Math.ceil(activeRoundMatches.length / 2) }, (_, pairIndex) => {
                      const m1 = activeRoundMatches[pairIndex * 2];
                      const m2 = activeRoundMatches[pairIndex * 2 + 1];
                      if (!m1) return null;
                      return (
                        <div key={`r1-group-${pairIndex}`} className="flex flex-col gap-1.5 rounded-2xl border border-border/15 bg-white/[0.02] p-2.5">
                          <MatchPickCard
                            match={m1}
                            matchIndex={pairIndex * 2}
                            onSelectWinner={handleSelectWinner}
                            readOnly={isLocked}
                          />
                          {m2 && (
                            <>
                              <div className="flex items-center gap-2 px-1" aria-hidden="true">
                                <div className="h-px flex-1 bg-border/20" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">winner advances</span>
                                <div className="h-px flex-1 bg-border/20" />
                              </div>
                              <MatchPickCard
                                match={m2}
                                matchIndex={pairIndex * 2 + 1}
                                onSelectWinner={handleSelectWinner}
                                readOnly={isLocked}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {activeRoundMatches.map((match, idx) => (
                      <MatchPickCard
                        key={match.id}
                        match={match}
                        matchIndex={idx}
                        onSelectWinner={handleSelectWinner}
                        readOnly={isLocked}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </div> {/* end flex-1 relative overflow-hidden */}

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
                  className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-85 bg-card border border-white/10 rounded-2xl shadow-2xl z-50 p-5 flex flex-col gap-4"
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
            </motion.main>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
