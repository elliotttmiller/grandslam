import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Share2, Copy, Users, Trophy, Lock,
  ChevronRight, Check, X, Plus, Trash2, ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { calculateBracketScore } from '@/lib/scoring';
import {
  getPool, deletePool, exportPool, exportEntry, importEntry, savePool, generateId,
} from '@/lib/pool-storage';
import type { Pool, PoolEntry } from '@/lib/pool-types';
import type { AppView } from '@/App';

const TOURNAMENT_COLORS: Record<string, string> = {
  ao: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  rg: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  wim: 'text-green-400 bg-green-500/10 border-green-500/20',
  uso: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
};

function tournamentColor(id: string): string {
  const key = Object.keys(TOURNAMENT_COLORS).find(k => id.toLowerCase().startsWith(k));
  return key ? TOURNAMENT_COLORS[key] : 'text-primary bg-primary/10 border-primary/20';
}

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

  const isLocked = new Date() >= new Date(pool.officialMatches.length > 0
    ? new Date().toISOString() // fallback
    : new Date().toISOString());

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
    const encoded = exportPool({ ...pool, entries: [] });
    const url = `${window.location.origin}${window.location.pathname}?joinPool=${encoded}`;
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
      userName: savedUserName || 'Anonymous',
      bracketName,
      matches: freshPool.officialMatches.map(m => ({ ...m, winnerId: null })),
      isSubmitted: false,
    };

    freshPool.entries.push(entry);
    savePool(freshPool);
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
      <div className="flex-none px-6 py-5 border-b border-border/30 bg-card/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => onNavigate({ page: 'pools' })}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Pools
            </Button>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-black tracking-tight">{pool.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded border',
                  tournamentColor(pool.tournamentId)
                )}>
                  {pool.tournamentName}
                </span>
                <span className="text-xs text-muted-foreground">
                  Code: <span className="font-mono font-bold text-foreground">{pool.id}</span>
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleCopyInviteLink} className="shrink-0">
              {copied === 'invite' ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
              {copied === 'invite' ? 'Copied!' : 'Share / Invite'}
            </Button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-bold">{pool.entries.length}</span>
              <span className="text-muted-foreground">{pool.entries.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            {leaderScore > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                <span className="font-bold">{leaderScore} pts</span>
                <span className="text-muted-foreground">leader</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{pool.tournamentName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">

          {/* My Entry CTA */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Leaderboard</span>
            <div className="flex gap-2">
              {myEntries.length === 0 ? (
                <Button size="sm" onClick={handleCreateEntry}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create My Entry
                </Button>
              ) : myEntries.some(e => !e.isSubmitted) ? (
                <Button size="sm" onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: myEntries.find(e => !e.isSubmitted)!.id })}>
                  Continue My Bracket
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: myEntries[0].id })}>
                  View My Bracket
                </Button>
              )}
            </div>
          </div>

          {/* Leaderboard table */}
          {rankedEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No entries yet. Be the first to create one!
            </div>
          ) : (
            <div className="border border-border/40 rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_5rem_auto] gap-2 px-4 py-2 bg-muted/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/30">
                <span>#</span>
                <span>Entry</span>
                <span className="text-right">Score</span>
                <span className="text-right">Base</span>
                <span className="text-right">Upset</span>
                <span className="text-right">Picks</span>
                <span className="text-center">Status</span>
                <span></span>
              </div>

              {rankedEntries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    "grid grid-cols-[2rem_1fr_5rem_4rem_4rem_4rem_5rem_auto] gap-2 px-4 py-3 items-center text-sm",
                    "border-b border-border/20 last:border-0",
                    entry.userName === savedUserName ? "bg-primary/5" : "hover:bg-muted/10",
                    "transition-colors"
                  )}
                >
                  <div>{rankBadge(entry.rank)}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{entry.userName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{entry.bracketName}</div>
                  </div>
                  <div className="text-right font-black text-primary">{entry.score.total}</div>
                  <div className="text-right text-xs text-muted-foreground">{entry.score.basePoints}</div>
                  <div className={cn("text-right text-xs", entry.score.upsetBonus > 0 ? "text-amber-400 font-bold" : "text-muted-foreground")}>
                    {entry.score.upsetBonus > 0 ? `+${entry.score.upsetBonus}` : '—'}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">{entry.score.picksCompleted}/127</div>
                  <div className="text-center">
                    {entry.isSubmitted ? (
                      <span className="text-[10px] font-bold text-green-400 flex items-center justify-center gap-0.5">
                        <Check className="h-3 w-3" /> Submitted
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">In Progress</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onNavigate({ page: 'pool-entry', poolId: pool.id, entryId: entry.id })}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      title="Copy entry share link"
                      onClick={() => handleCopyEntryLink(entry)}
                    >
                      {copied === `entry-${entry.id}` ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Invite section */}
          <div className="border border-border/40 rounded-xl p-5 bg-card/30">
            <h3 className="text-xs font-black uppercase tracking-widest mb-3">Invite Others</h3>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="font-mono text-2xl font-black tracking-[0.3em] bg-muted/20 px-4 py-2 rounded-lg border border-border/30">
                {pool.id}
              </div>
              <div className="flex flex-col gap-1.5">
                <Button variant="outline" size="sm" onClick={handleCopyInviteLink}>
                  {copied === 'invite' ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                  {copied === 'invite' ? 'Copied!' : 'Copy Invite Link'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyPoolSnap}>
                  {copied === 'snap' ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />}
                  {copied === 'snap' ? 'Copied!' : 'Copy Full Pool Snapshot'}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Share the invite link with participants. Each person fills out their bracket and sends you their entry link (copy via the button in each row above). Open the entry link to import it into this pool.
            </p>
          </div>

          {/* Pool management */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Import Entry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowImport(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border/50 rounded-xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest">Import Entry</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowImport(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold">Paste entry link or encoded data</span>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  rows={4}
                  placeholder="https://...?importEntry=...&entry=..."
                  className="bg-background border border-border/50 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </label>
              {importError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded px-3 py-2 border border-red-500/20">{importError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>Cancel</Button>
                <Button size="sm" disabled={!importText.trim()} onClick={handleImportEntry}>Import</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-border/50 rounded-xl shadow-2xl z-50 p-6 flex flex-col gap-4"
            >
              <h3 className="text-sm font-black uppercase tracking-widest text-red-400">Delete Pool?</h3>
              <p className="text-sm text-muted-foreground">
                This will permanently delete <span className="font-bold text-foreground">{pool.name}</span> and all {pool.entries.length} entries. This cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
