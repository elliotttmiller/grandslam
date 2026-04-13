import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Share2, Copy, Users, Trophy, Lock,
  ChevronRight, Check, X, Plus, Trash2, ClipboardCheck, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { calculateBracketScore } from '@/lib/scoring';
import {
  getPool, deletePool, exportPool, exportEntry, importEntry, savePool, generateId,
} from '@/lib/pool-storage';
import { subscribeToPool, syncAddEntry } from '@/services/poolSyncService';
import { getUserId } from '@/lib/user-identity';
import { tournamentColor } from '@/lib/tournament-colors';
import type { Pool, PoolEntry } from '@/lib/pool-types';
import type { AppView } from '@/App';

const TOTAL_BRACKET_MATCHES = 127;

interface RankedEntry extends PoolEntry {
  rank: number;
  score: ReturnType<typeof calculateBracketScore>;
}

interface PoolLeaderboardProps {
  pool: Pool;
  onNavigate: (view: AppView) => void;
  onPoolUpdate: () => void;
}

export function PoolLeaderboard({ pool, onNavigate, onPoolUpdate }: PoolLeaderboardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  // Keep a stable ref to onPoolUpdate so the SSE callback doesn't need it
  // as a dependency (avoids re-subscribing on every parent render).
  const onPoolUpdateRef = useRef(onPoolUpdate);
  onPoolUpdateRef.current = onPoolUpdate;

  // Subscribe to real-time pool updates via Firestore onSnapshot.
  // Whenever Firestore pushes an update we persist it to localStorage and
  // ask the parent to re-render with the fresh data.
  useEffect(() => {
    setIsLive(false);
    const unsubscribe = subscribeToPool(pool.id, (updatedPool) => {
      setIsLive(true);
      savePool(updatedPool);
      onPoolUpdateRef.current();
    });
    return unsubscribe;
  }, [pool.id]);

  const savedUserName = localStorage.getItem('gs_user_name') ?? '';

  const rankedEntries = useMemo((): RankedEntry[] => {
    const scored = pool.entries.map(e => ({
      ...e,
      score: calculateBracketScore(e.matches),
    }));
    scored.sort((a, b) => b.score.total - a.score.total);

    let rank = 1;
    return scored.map((e, i) => {
      if (i > 0 && e.score.total < scored[i - 1].score.total) {
        rank = i + 1;
      }
      return { ...e, rank };
    });
  }, [pool.entries]);

  const myEntries = rankedEntries.filter(e => e.userName === savedUserName);
  const leaderScore = rankedEntries[0]?.score.total ?? 0;

  // Pool-level stats
  const submittedCount = pool.entries.filter(e => e.isSubmitted).length;
  const avgCompletion = pool.entries.length > 0
    ? Math.round(
        pool.entries.reduce((sum, e) => {
          const s = calculateBracketScore(e.matches);
          return sum + (s.picksCompleted / TOTAL_BRACKET_MATCHES) * 100;
        }, 0) / pool.entries.length,
      )
    : 0;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleCopyInviteLink = () => {
    // Use the 6-char pool code only — encoding the full pool (127 matches) produces
    // a ~60 KB URL that gets truncated by email clients, SMS, and WhatsApp.
    const url = `${window.location.origin}${window.location.pathname}?join=${pool.id}`;
    copyToClipboard(url, 'invite');
  };

  const handleCopyPoolSnap = () => {
    const encoded = exportPool(pool);
    const url = `${window.location.origin}${window.location.pathname}?poolSnap=${encoded}`;
    copyToClipboard(url, 'snap');
  };

  const handleCopyEntryLink = (entry: PoolEntry) => {
    const encoded = exportEntry(entry);
    const url = `${window.location.origin}${window.location.pathname}?importEntry=${pool.id}&entry=${encoded}`;
    copyToClipboard(url, `entry-${entry.id}`);
  };

  const handleImportEntry = () => {
    setImportError('');
    const text = importText.trim();
    if (!text) return;

    // Try to parse as URL
    let encodedEntry = text;
    try {
      const url = new URL(text);
      const params = new URLSearchParams(url.search);
      encodedEntry = params.get('entry') ?? text;
    } catch {
      // treat as raw encoded entry
    }

    const imported = importEntry(pool.id, encodedEntry);
    if (!imported) {
      setImportError('Invalid entry data. Please paste a valid entry link.');
      return;
    }
    setShowImport(false);
    setImportText('');
    onPoolUpdate();
  };

  const handleDelete = () => {
    deletePool(pool.id);
    onNavigate({ page: 'pools' });
  };

  const handleCreateEntry = () => {
    const entryId = generateId();
    const bracketName = `${savedUserName}'s Bracket`;
    const freshPool = getPool(pool.id);
    if (!freshPool) return;

    const entry = {
      id: entryId,
      userId: getUserId(),
      userName: savedUserName || 'Anonymous',
      bracketName,
      matches: freshPool.officialMatches.map(m => ({ ...m, winnerId: null })),
      isSubmitted: false,
    };

    freshPool.entries.push(entry);
    savePool(freshPool);
    // Best-effort sync to server
    syncAddEntry(pool.id, entry);
    onPoolUpdate();
    onNavigate({ page: 'pool-entry', poolId: pool.id, entryId });
  };

  const rankBadge = (rank: number) => {
    if (rank === 1) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-black bg-yellow-500/20 text-yellow-400">🥇</span>;
    if (rank === 2) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-black bg-gray-400/20 text-gray-300">🥈</span>;
    if (rank === 3) return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-black bg-amber-700/20 text-amber-600">🥉</span>;
    return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold text-muted-foreground">#{rank}</span>;
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex-none px-5 py-4 border-b border-border/25 bg-card/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground/70 hover:text-foreground rounded-xl"
              onClick={() => onNavigate({ page: 'pools' })}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Pools
            </Button>
          </div>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight truncate">{pool.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                  tournamentColor(pool.tournamentId)
                )}>
                  {pool.tournamentName}
                </span>
                <span className="text-[12px] text-muted-foreground/60">
                  Code: <span className="font-mono font-bold text-foreground/80">{pool.id}</span>
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={handleCopyInviteLink}>
              {copied === 'invite' ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
              {copied === 'invite' ? 'Copied!' : 'Share / Invite'}
            </Button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-5 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[12px]">
              <Users className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="font-bold">{pool.entries.length}</span>
              <span className="text-muted-foreground/60">{pool.entries.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            {leaderScore > 0 && (
              <div className="flex items-center gap-1.5 text-[12px]">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-bold text-amber-400">{leaderScore}</span>
                <span className="text-muted-foreground/60">leader</span>
              </div>
            )}
            {/* Live sync indicator */}
            <div className={cn(
              'flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border',
              isLive
                ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                : 'text-muted-foreground/40 border-border/20 bg-muted/10',
            )}>
              <Radio className="h-2.5 w-2.5" aria-hidden="true" />
              {isLive ? 'Live' : 'Connecting…'}
            </div>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
              <span className="text-muted-foreground/60 truncate max-w-35">{pool.tournamentName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 py-5">
        <div className="max-w-4xl mx-auto flex flex-col gap-5">

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: 'Entries', value: pool.entries.length, color: '' },
              { label: 'Submitted', value: submittedCount, color: 'text-emerald-400' },
              { label: 'Leader', value: leaderScore > 0 ? `${leaderScore} pts` : '—', color: 'text-amber-400' },
              { label: 'Avg picks', value: `${avgCompletion}%`, color: '' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card/50 border border-border/25 rounded-2xl px-4 py-3 flex flex-col items-center text-center">
                <span className={cn('text-xl font-black tabular-nums', color)}>{value}</span>
                <span className="text-[10px] text-muted-foreground/55 font-medium mt-0.5">{label}</span>
              </div>
            ))}
          </div>

          {/* My entry spotlight */}
          {myEntries.length > 0 && (
            <div className="bg-emerald-500/6 border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70 mb-3">Your Bracket</p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-lg shrink-0">
                  {myEntries[0].rank === 1 ? '🥇' : myEntries[0].rank === 2 ? '🥈' : myEntries[0].rank === 3 ? '🥉' : `#${myEntries[0].rank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px] truncate">{myEntries[0].bracketName}</span>
                    {myEntries[0].isSubmitted
                      ? <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5"><Check className="h-2.5 w-2.5" aria-hidden="true" />Submitted</span>
                      : <span className="text-[10px] text-amber-400 font-semibold">In progress</span>
                    }
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-emerald-400 tabular-nums">{myEntries[0].score.total}</span>
                    <span className="text-[11px] text-muted-foreground/55">pts · {myEntries[0].score.picksCompleted}/{TOTAL_BRACKET_MATCHES} picks</span>
                  </div>
                  <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mt-1.5">
                    <motion.div
                      className="h-full bg-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(myEntries[0].score.picksCompleted / TOTAL_BRACKET_MATCHES) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white border-0 rounded-xl"
                  onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: myEntries[0].id })}
                >
                  {myEntries[0].isSubmitted ? 'View' : 'Edit Picks'}
                </Button>
              </div>
            </div>
          )}

          {/* My Entry CTA */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Leaderboard</span>
            <div className="flex gap-2">
              {myEntries.length === 0 ? (
                <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0" onClick={handleCreateEntry}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create My Entry
                </Button>
              ) : myEntries.some(e => !e.isSubmitted) ? (
                <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border-0" onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: myEntries.find(e => !e.isSubmitted)!.id })}>
                  Continue My Bracket
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: myEntries[0].id })}>
                  View My Bracket
                </Button>
              )}
            </div>
          </div>

          {/* Leaderboard entries */}
          {rankedEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground/60 text-sm">
              No entries yet. Be the first!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rankedEntries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-colors",
                    entry.userName === savedUserName
                      ? "bg-emerald-500/6 border-emerald-500/20"
                      : "bg-card/50 border-border/30 hover:border-border/50 hover:bg-card/70"
                  )}
                >
                  {/* Rank */}
                  <div className="shrink-0 w-7" aria-label={`Rank ${entry.rank}`}>{rankBadge(entry.rank)}</div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13px] truncate">{entry.userName}</span>
                      {entry.isSubmitted ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" aria-hidden="true" /> Done
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50">in progress</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground/55 truncate">{entry.bracketName}</div>
                    {/* Mobile stats row */}
                    <div className="flex items-center gap-3 mt-1 sm:hidden">
                      <span className="text-[11px] text-muted-foreground/50 tabular-nums">{entry.score.picksCompleted}/{TOTAL_BRACKET_MATCHES}</span>
                      {entry.score.upsetBonus > 0 && (
                        <span className="text-[11px] text-amber-400 font-bold tabular-nums">⚡+{entry.score.upsetBonus}</span>
                      )}
                    </div>
                    {/* Completion bar */}
                    <div className="h-1 bg-muted/20 rounded-full overflow-hidden mt-1.5">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          entry.score.picksCompleted === TOTAL_BRACKET_MATCHES ? 'bg-emerald-500' : 'bg-emerald-500/50',
                        )}
                        style={{ width: `${(entry.score.picksCompleted / TOTAL_BRACKET_MATCHES) * 100}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  {/* Desktop stats */}
                  <div className="hidden sm:flex items-center gap-4 shrink-0 text-[12px]">
                    <span className="text-muted-foreground/50 tabular-nums" title="Base points">{entry.score.basePoints}</span>
                    <span className={cn("tabular-nums", entry.score.upsetBonus > 0 ? "text-amber-400 font-bold" : "text-muted-foreground/40")} title="Upset bonus">
                      {entry.score.upsetBonus > 0 ? `+${entry.score.upsetBonus}` : '—'}
                    </span>
                    <span className="text-muted-foreground/50 tabular-nums" title="Picks completed">{entry.score.picksCompleted}/{TOTAL_BRACKET_MATCHES}</span>
                  </div>
                  {/* Gap from leader */}
                  {entry.rank > 1 && leaderScore > 0 && (
                    <div className="hidden sm:flex shrink-0 text-[11px] text-muted-foreground/35 tabular-nums w-10 text-right" title="Gap from leader">
                      -{leaderScore - entry.score.total}
                    </div>
                  )}
                  {entry.rank === 1 && leaderScore > 0 && (
                    <div className="hidden sm:flex shrink-0 text-[10px] font-bold text-amber-400/70 w-10 text-right" title="Leader">
                      Leader
                    </div>
                  )}
                  {/* Score */}
                  <div className="shrink-0 font-black text-base tabular-nums text-emerald-400" aria-label={`${entry.score.total} points`}>{entry.score.total}</div>
                  {/* Actions */}
                  <div className="shrink-0 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-[11px] rounded-lg text-muted-foreground/60 hover:text-foreground"
                      onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: entry.id })}
                      aria-label={`View ${entry.userName}'s bracket`}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg text-muted-foreground/50 hover:text-foreground"
                      aria-label={`Copy share link for ${entry.userName}'s bracket`}
                      onClick={() => handleCopyEntryLink(entry)}
                    >
                      {copied === `entry-${entry.id}` ? <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Invite section */}
          <div className="border border-border/30 rounded-2xl p-5 bg-card/30">
            <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 text-muted-foreground/60">Invite Others</h3>
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="font-mono text-2xl font-black tracking-[0.3em] bg-muted/15 px-4 py-2.5 rounded-xl border border-border/25" aria-label={`Pool code: ${pool.id}`}>
                {pool.id}
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={handleCopyInviteLink}>
                  {copied === 'invite' ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />}
                  {copied === 'invite' ? 'Copied!' : 'Copy Invite Link'}
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={handleCopyPoolSnap}>
                  {copied === 'snap' ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" aria-hidden="true" /> : <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />}
                  {copied === 'snap' ? 'Copied!' : 'Copy Pool Snapshot'}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/55 leading-relaxed">
              Share the invite link with participants. Each person fills out their bracket and sends you their entry link. Open the entry link to import it into this pool.
            </p>
          </div>

          {/* Pool management */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowImport(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Import Entry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete Pool
            </Button>
          </div>
        </div>
      </div>

      {/* Import Entry Modal */}
      <AnimatePresence>
        {showImport && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowImport(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-card border border-white/10 rounded-2xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Import Entry</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setShowImport(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Paste entry link or encoded data</span>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  rows={4}
                  placeholder="https://...?importEntry=...&entry=..."
                  className="bg-background border border-border/60 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-all resize-none"
                />
              </label>
              {importError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5 border border-red-500/20">{importError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>Cancel</Button>
                <Button size="sm" className="rounded-xl" disabled={!importText.trim()} onClick={handleImportEntry}>Import</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-sm bg-card border border-white/10 rounded-2xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <h3 className="text-sm font-bold text-red-400">Delete Pool?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This will permanently delete <span className="font-semibold text-foreground">{pool.name}</span> and all {pool.entries.length} entries. This cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" className="rounded-xl" onClick={handleDelete}>Delete</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
