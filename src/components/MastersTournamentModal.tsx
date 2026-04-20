import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar, Trophy, RefreshCw, AlertCircle, Layers, DollarSign, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, parseDateSafe } from '@/lib/utils';
import { fetchMastersTournamentDetails, CACHE_KEY_MASTERS_PREFIX, CACHE_KEY_MASTERS_DRAW_PREFIX, type MastersTournamentDetails } from '@/services/geminiService';
import { authRemoveItem } from '@/lib/auth-storage';
import { type MastersTournament, surfaceColor } from '@/lib/masters-tournaments';

interface MastersTournamentModalProps {
  tournament: MastersTournament | null;
  onClose: () => void;
}

export function MastersTournamentModal({ tournament, onClose }: MastersTournamentModalProps) {
  const [details, setDetails] = useState<MastersTournamentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tournament) return;
    setDetails(null);
    setError(null);
    setLoading(true);

    fetchMastersTournamentDetails(tournament.id, tournament.name)
      .then(d => {
        setDetails(d);
      })
      .catch(err => {
        console.error('Failed to load tournament details:', err);
        setError('Failed to load tournament details. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tournament]);

  const handleRefresh = () => {
    if (!tournament) return;
    // Clear both the tournament details cache and the draw cache so fresh data is fetched
    authRemoveItem(`${CACHE_KEY_MASTERS_PREFIX}${tournament.id}`);
    authRemoveItem(`${CACHE_KEY_MASTERS_DRAW_PREFIX}${tournament.id}`);
    setDetails(null);
    setError(null);
    setLoading(true);
    fetchMastersTournamentDetails(tournament.id, tournament.name)
      .then(setDetails)
      .catch(() => setError('Failed to refresh. Please try again.'))
      .finally(() => setLoading(false));
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try {
      return parseDateSafe(iso).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const isOpen = tournament !== null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60]"
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${tournament?.name} tournament details`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-[520px] max-h-[88vh] bg-card border border-white/10 rounded-2xl shadow-2xl z-[60] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07] shrink-0">
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Trophy className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    {tournament && ['ao', 'rg', 'wim', 'uso'].includes(tournament.id) ? 'Grand Slam' : 'ATP Masters 1000'}
                  </span>
                  {tournament && (
                    <span className={cn(
                      'text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border',
                      surfaceColor(tournament.surface),
                    )}>
                      {tournament.surface}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-black text-white leading-tight">
                  {details?.name ?? tournament?.name}
                </h2>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-white/40 hover:text-white/80"
                  onClick={handleRefresh}
                  disabled={loading}
                  aria-label="Refresh tournament data"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl text-white/40 hover:text-white/80"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loading && !details && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/40">
                  <RefreshCw className="h-6 w-6 animate-spin text-amber-400/60" />
                  <span className="text-sm">Fetching live tournament data…</span>
                </div>
              )}

              {error && !details && (
                <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400/70" />
                  <p className="text-sm text-red-300/80">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-white/10 text-white/60 hover:text-white"
                    onClick={handleRefresh}
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {details && (
                <div className="flex flex-col gap-0 pb-4">
                  {/* Key info cards */}
                  <div className="grid grid-cols-2 gap-2.5 px-5 pt-4 pb-2">
                    {/* Dates */}
                    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <div className="flex items-center gap-1.5 text-white/40 mb-0.5">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Dates</span>
                      </div>
                      <span className="text-[12px] font-semibold text-white/90 leading-snug">
                        {details.startDate ? formatDate(details.startDate) : '—'}
                      </span>
                      <span className="text-[11px] text-white/40">
                        to {details.endDate ? formatDate(details.endDate) : '—'}
                      </span>
                    </div>

                    {/* Location */}
                    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <div className="flex items-center gap-1.5 text-white/40 mb-0.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Location</span>
                      </div>
                      <span className="text-[12px] font-semibold text-white/90 leading-snug">{details.location}</span>
                      <span className="text-[11px] text-white/40 leading-snug">{details.venue}</span>
                    </div>

                    {/* Surface */}
                    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <div className="flex items-center gap-1.5 text-white/40 mb-0.5">
                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Surface</span>
                      </div>
                      <span className="text-[12px] font-semibold text-white/90">{details.surface}</span>
                      <span className="text-[11px] text-white/40">Draw: {details.drawSize} players</span>
                    </div>

                    {/* Prize money */}
                    <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                      <div className="flex items-center gap-1.5 text-white/40 mb-0.5">
                        <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Prize Money</span>
                      </div>
                      <span className="text-[12px] font-semibold text-white/90">
                        {details.prizeMoney ?? '—'}
                      </span>
                      <span className="text-[11px] text-white/40">Total purse</span>
                    </div>
                  </div>

                  {/* Notes */}
                  {details.notes && (
                    <div className="mx-5 mb-2 flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
                      <Info className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
                      <p className="text-[12px] text-amber-200/80 leading-relaxed">{details.notes}</p>
                    </div>
                  )}

                  {/* Seedings */}
                  <div className="px-5 pt-2 pb-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-white/40">
                        Top Seeds
                      </h3>
                      <span className={cn(
                        'text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border',
                        details.seedingsStatus === 'official'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                      )}>
                        {details.seedingsStatus === 'official' ? 'Official' : 'Predicted'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      {details.seedings.length === 0 && (
                        <p className="text-sm text-white/40 py-4 text-center">Seedings not yet available</p>
                      )}
                      {details.seedings.map((player, idx) => (
                        <div
                          key={`${player.seed}-${player.name}`}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                            idx % 2 === 0 ? 'bg-white/[0.025]' : '',
                          )}
                        >
                          {/* Seed number */}
                          <span className={cn(
                            'text-[11px] font-black tabular-nums w-5 text-center shrink-0',
                            player.seed === 1 ? 'text-amber-400' :
                            player.seed <= 4 ? 'text-white/70' :
                            'text-white/35',
                          )}>
                            {player.seed}
                          </span>

                          {/* Player name */}
                          <span className="text-[13px] font-semibold text-white/85 flex-1 min-w-0 truncate">
                            {player.name}
                          </span>

                          {/* Country */}
                          <span className="text-[11px] font-bold text-white/35 shrink-0 uppercase tracking-wide">
                            {player.country}
                          </span>

                          {/* ATP ranking */}
                          {player.ranking !== undefined && player.ranking !== null && (
                            <span className="text-[10px] text-white/25 shrink-0 tabular-nums">
                              #{player.ranking}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Data source notice */}
                  <p className="mx-5 mt-3 text-[10px] text-white/20 text-center leading-relaxed">
                    Seeding details are sourced via live AI search. Official ATP draw data is used when available in tournament brackets.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
