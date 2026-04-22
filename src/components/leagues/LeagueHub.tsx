import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Plus, Users, Globe, Lock, ChevronRight, X, Loader2, Calendar, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getLeagues,
  createLeague,
  addMember,
  getLeague,
  saveLeague,
  LEAGUE_CODE_LENGTH,
} from '@/lib/league-storage';
import {
  syncCreateLeague,
  syncGetLeague,
  syncAddLeagueMember,
} from '@/services/leagueSyncService';
import { getAuth } from '@/lib/firebase';
import type { League } from '@/lib/league-types';
import type { AppView } from '@/App';
import type { User } from 'firebase/auth';

interface LeagueHubProps {
  onNavigate: (view: AppView) => void;
  authUser: User | null;
  onRequireAuth: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_LEAGUE_YEAR = 2025;

export function LeagueHub({ onNavigate, authUser, onRequireAuth }: LeagueHubProps) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createYear, setCreateYear] = useState(CURRENT_YEAR);
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Join form state
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const isAuthed = authUser && !authUser.isAnonymous;
  const yearOptionCount = Math.max(CURRENT_YEAR + 1 - MIN_LEAGUE_YEAR + 1, 1);
  const createYearOptions = Array.from({ length: yearOptionCount }, (_, index) => MIN_LEAGUE_YEAR + index);

  const refreshLeagues = useCallback(() => {
    setLeagues(getLeagues());
  }, []);

  useEffect(() => {
    refreshLeagues();
  }, [refreshLeagues]);

  const requireAuth = (): boolean => {
    if (!isAuthed) {
      onRequireAuth();
      return false;
    }
    return true;
  };

  const handleCreateSubmit = async () => {
    if (!createName.trim() || !requireAuth()) return;
    setCreateError('');
    setIsCreating(true);
    try {
      // Debug: log current Firebase auth state to help diagnose permission issues
      try {
        const user = getAuth().currentUser;
        console.debug('Creating league - current auth state', { uid: user?.uid ?? null, isAnonymous: user?.isAnonymous ?? null, providerData: user?.providerData });
      } catch (e) {
        console.debug('Creating league - could not read auth state');
      }

      const displayName = authUser.displayName ?? authUser.email ?? 'Unknown';
      const league = createLeague(
        createName.trim(),
        createDescription.trim(),
        createYear,
        createPrivate,
        authUser.uid,
        displayName,
        false,
      );
      // Best-effort Firestore sync
      let syncedLeague = null;
      try {
        syncedLeague = await syncCreateLeague(league);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const msg = (err as { message?: string })?.message ?? String(err);
        console.error('League create error (UI):', code, msg);
        if (code === 'permission-denied') {
          setCreateError('Permission denied: make sure you are signed in with a full (non-anonymous) account.');
        } else {
          setCreateError(`League created locally but failed to save to server: ${msg}`);
        }
        return;
      }
      if (!syncedLeague) {
        setCreateError('League created locally but failed to save to the server. Check your connection and sign-in status.');
        return;
      }
      saveLeague(league);
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreateYear(CURRENT_YEAR);
      setCreatePrivate(false);
      refreshLeagues();
      onNavigate({ page: 'league-detail', leagueId: league.id });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSubmit = async () => {
    setJoinError('');
    const code = joinCode.trim().toUpperCase().slice(0, LEAGUE_CODE_LENGTH);
    if (!code || !requireAuth()) return;

    setIsJoining(true);
    try {
      // 1. Check local cache first
      let league = getLeague(code);

      // 2. Try Firestore
      if (!league) {
        try {
          league = await syncGetLeague(code);
          if (league) saveLeague(league);
        } catch (err) {
          console.error('League fetch error:', err);
          const errorCode = (err as { code?: string })?.code;
          if (errorCode === 'permission-denied') {
            setJoinError('Sign in with a full account to join leagues created by other users.');
          } else {
            setJoinError('Could not reach the server. Check your connection.');
          }
          return;
        }
      }

      if (!league) {
        setJoinError('League not found. Check the invite code and try again.');
        return;
      }

      // Already a member?
      if (league.members.some(m => m.userId === authUser.uid)) {
        setShowJoin(false);
        onNavigate({ page: 'league-detail', leagueId: league.id });
        return;
      }

      const member = {
        userId: authUser.uid,
        userName: authUser.displayName ?? authUser.email ?? 'Member',
        joinedAt: new Date().toISOString(),
      };

      addMember(league.id, member);
      await syncAddLeagueMember(league.id, member);

      setShowJoin(false);
      setJoinCode('');
      refreshLeagues();
      onNavigate({ page: 'league-detail', leagueId: league.id });
    } finally {
      setIsJoining(false);
    }
  };

  const publicLeagues = leagues.filter(l => !l.isPrivate);

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex-none px-4 sm:px-5 py-4 sm:py-5 border-b border-border/25">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">Leagues</h2>
            <p className="text-[12px] text-muted-foreground/70 mt-0.5">
              Year-long competitions across every tournament
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl col-span-2 sm:col-span-1 justify-center h-9"
              onClick={() => onNavigate({ page: 'my-leagues' })}
            >
              My Leagues
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl justify-center h-9 w-full sm:w-auto"
              onClick={() => {
                if (!requireAuth()) return;
                setShowJoin(true);
              }}
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Join
            </Button>
            <Button
              size="sm"
              className="rounded-xl justify-center h-9 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              onClick={() => {
                if (!requireAuth()) return;
                setShowCreate(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create League
            </Button>
          </div>
        </div>
      </div>

      {/* League list */}
      <div className="flex-1 px-5 py-6 max-w-4xl mx-auto w-full">
        {leagues.length === 0 && publicLeagues.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-14 sm:py-20 max-w-md mx-auto"
          >
            <Trophy className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="font-semibold text-foreground mb-1">No leagues yet</p>
            <p className="text-sm text-muted-foreground mb-6 text-balance">
              Create a year-long league and invite friends to compete across every tournament.
            </p>
            <Button
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              onClick={() => {
                if (!requireAuth()) return;
                setShowCreate(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create League
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {leagues.map(league => (
              <LeagueCard
                key={league.id}
                league={league}
                authUser={authUser}
                onClick={() => onNavigate({ page: 'league-detail', leagueId: league.id })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <Modal title="Create League" onClose={() => { setShowCreate(false); setCreateError(''); }}>
            <div className="space-y-4">
              <Field label="League Name" required>
                <input
                  type="text"
                  value={createName}
                  onChange={e => { setCreateName(e.target.value); setCreateError(''); }}
                  placeholder="e.g. Champions Circle 2026"
                  className={inputCls}
                  maxLength={60}
                  autoFocus
                />
              </Field>

              <Field label="Description (optional)">
                <textarea
                  value={createDescription}
                  onChange={e => setCreateDescription(e.target.value)}
                  placeholder="Tell members what this league is about…"
                  className={cn(inputCls, 'resize-none h-20')}
                  maxLength={200}
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Year">
                  <select
                    value={createYear}
                    onChange={e => setCreateYear(Number(e.target.value))}
                    className={inputCls}
                  >
                    {createYearOptions.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Visibility">
                  <button
                    type="button"
                    onClick={() => setCreatePrivate(p => !p)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
                      createPrivate
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                    )}
                  >
                    {createPrivate ? (
                      <><Lock className="h-4 w-4" /> Private</>
                    ) : (
                      <><Globe className="h-4 w-4" /> Public</>
                    )}
                  </button>
                </Field>
              </div>

              {createError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{createError}</p>
              )}

              <Button
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0 mt-2"
                disabled={!createName.trim() || isCreating}
                onClick={handleCreateSubmit}
              >
                {isCreating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</>
                ) : (
                  'Create League'
                )}
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoin && (
          <Modal title="Join a League" onClose={() => { setShowJoin(false); setJoinCode(''); setJoinError(''); }}>
            <div className="space-y-4">
              <Field label="League Invite Code">
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase().slice(0, LEAGUE_CODE_LENGTH)); setJoinError(''); }}
                  placeholder="e.g. AB12CD"
                  className={cn(inputCls, 'font-mono tracking-widest uppercase text-center text-lg')}
                  autoFocus
                />
              </Field>
              {joinError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{joinError}</p>
              )}
              <Button
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                disabled={joinCode.length < LEAGUE_CODE_LENGTH || isJoining}
                onClick={handleJoinSubmit}
              >
                {isJoining ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Joining…</>
                ) : (
                  'Join League'
                )}
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LeagueCardProps {
  league: League;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authUser: any;
  onClick: () => void;
}

function LeagueCard({ league, authUser, onClick }: LeagueCardProps) {
  const isOwner = authUser?.uid === league.createdBy;
  const memberCount = league.members.length;
  const poolCount = Object.keys(league.tournamentPoolIds).length;

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="w-full text-left bg-card/50 border border-white/8 rounded-2xl p-4 sm:p-5 hover:border-white/15 hover:bg-card/70 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-foreground truncate">{league.name}</span>
            {league.isPrivate ? (
              <span className="shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full border border-amber-500/25">
                <Lock className="h-2.5 w-2.5" /> Private
              </span>
            ) : (
              <span className="shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/25">
                <Globe className="h-2.5 w-2.5" /> Public
              </span>
            )}
            {isOwner && (
              <span className="shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-violet-400 bg-violet-500/15 px-1.5 py-0.5 rounded-full border border-violet-500/25">
                <Shield className="h-2.5 w-2.5" /> Creator
              </span>
            )}
          </div>
          {league.description && (
            <p className="text-xs text-muted-foreground truncate mb-2">{league.description}</p>
          )}
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {league.year}
            </span>
            {poolCount > 0 && (
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                {poolCount} pool{poolCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Utility UI helpers
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-50"
        onClick={onClose}
        aria-hidden="true"
      />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto bg-card border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[calc(100vh-2rem)] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={title}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl text-white/50 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </motion.div>
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/40 transition-all';
