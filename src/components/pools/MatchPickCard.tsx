import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBasePoints, getUpsetBonus } from '@/lib/scoring';
import type { Match, Player } from '@/lib/bracket-utils';

interface MatchPickCardProps {
  match: Match;
  matchIndex: number;
  onSelectWinner: (matchId: string, winnerId: string) => void;
  readOnly?: boolean;
}

export function MatchPickCard({ match, matchIndex, onSelectWinner, readOnly = false }: MatchPickCardProps) {
  const { player1, player2, winnerId } = match;
  const hasPlayers = !!(player1 && player2);
  const canPick = !readOnly && hasPlayers && !winnerId;

  const winner = winnerId ? (player1?.id === winnerId ? player1 : player2) : null;
  const loser = winner ? (player1?.id === winner.id ? player2 : player1) : null;
  const earnedBase = winner ? getBasePoints(match.round) : 0;
  const earnedUpset = winner ? getUpsetBonus(winner.seed, loser?.seed, match.round) : 0;

  const renderPlayer = (player: Player | null, isTop: boolean) => {
    const isWinner = player ? winnerId === player.id : false;
    const isLoser = player ? (!!winnerId && winnerId !== player.id) : false;
    const isQualifier = !player || player.name.startsWith('Qualifier') || player.name === 'TBD';
    const isPickable = canPick && !!player && !isQualifier;

    return (
      <motion.div
        className={cn(
          'flex items-center gap-3 px-4 py-[15px] transition-all select-none min-h-[56px]',
          isTop ? 'border-b border-border/15' : '',
          isWinner ? 'bg-emerald-500/[0.14]' : '',
          isLoser ? 'opacity-30' : '',
          isPickable ? 'cursor-pointer hover:bg-white/[0.05] active:bg-white/[0.09]' : 'cursor-default',
        )}
        whileTap={isPickable ? { scale: 0.985 } : {}}
        onClick={() => { if (isPickable) onSelectWinner(match.id, player!.id); }}
        role={isPickable ? 'button' : undefined}
        tabIndex={isPickable ? 0 : undefined}
        onKeyDown={isPickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelectWinner(match.id, player!.id); } : undefined}
        aria-label={isPickable && player ? `Pick ${player.name} as winner` : undefined}
        aria-pressed={isWinner}
      >
        {/* Seed */}
        <span className={cn(
          'w-6 text-center text-[11px] font-mono shrink-0 tabular-nums',
          isWinner ? 'text-emerald-400/80' : 'text-muted-foreground/35',
        )}>
          {player?.seed ?? '—'}
        </span>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[15px] leading-snug font-medium truncate',
            isWinner ? 'text-emerald-300 font-semibold'
              : isQualifier ? 'text-muted-foreground/45 italic text-[13px]'
                : 'text-foreground/90',
          )}>
            {player ? player.name : 'TBD'}
          </p>
          {player?.country && !isQualifier && (
            <p className="text-[11px] text-muted-foreground/40 mt-0.5 leading-none">{player.country}</p>
          )}
        </div>

        {/* Winner check or pick indicator */}
        {isWinner ? (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="shrink-0 h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"
          >
            <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </motion.div>
        ) : isPickable ? (
          <div className="shrink-0 h-7 w-7 rounded-full border border-border/25 flex items-center justify-center opacity-40" aria-hidden="true">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          </div>
        ) : null}
      </motion.div>
    );
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: matchIndex * 0.02, duration: 0.18 }}
      className={cn(
        'rounded-2xl border overflow-hidden transition-all',
        winnerId
          ? 'bg-card/50 border-emerald-500/20'
          : hasPlayers
            ? 'bg-card/80 border-border/50 shadow-sm'
            : 'bg-card/30 border-border/15 opacity-50',
      )}
    >
      {renderPlayer(player1, true)}

      <div className="flex items-center px-4 py-1.5 gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border/15" />
        <span className="text-[10px] font-bold text-muted-foreground/25 uppercase tracking-widest">vs</span>
        <div className="h-px flex-1 bg-border/15" />
      </div>

      {renderPlayer(player2, false)}

      {/* Points earned footer */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 px-4 py-2 border-t border-emerald-500/10 bg-emerald-500/[0.04]"
        >
          <span className="text-[11px] font-bold text-emerald-400 tabular-nums">
            +{earnedBase}{earnedUpset > 0 ? ` +${earnedUpset}` : ''} pts
          </span>
          {earnedUpset > 0 && (
            <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-bold border border-amber-500/20">
              ⚡ Upset
            </span>
          )}
        </motion.div>
      )}
    </motion.article>
  );
}
