/**
 * Shared tournament colour tokens used across PoolHub, PoolLeaderboard, and the sidebar.
 * Keeps a single source of truth so colour updates propagate everywhere automatically.
 */

const TOURNAMENT_COLORS: Record<string, string> = {
  ao:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  rg:  'text-orange-400 bg-orange-500/10 border-orange-500/20',
  wim: 'text-green-400 bg-green-500/10 border-green-500/20',
  uso: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  // ATP Masters 1000 — amber gold theme
  'indian-wells': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'miami':        'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'monte-carlo':  'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'madrid':       'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'rome':         'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'canada':       'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'cincinnati':   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'shanghai':     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'paris':        'text-amber-400 bg-amber-500/10 border-amber-500/20',
};

export function tournamentColor(id: string): string {
  const key = Object.keys(TOURNAMENT_COLORS).find(k => id.toLowerCase().startsWith(k));
  return key ? TOURNAMENT_COLORS[key] : 'text-primary bg-primary/10 border-primary/20';
}
