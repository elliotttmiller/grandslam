import React, { memo } from 'react';
import { Match, Player } from '../lib/bracket-utils';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface MatchCardProps {
  match: Match;
  onSelectWinner: (matchId: string, winnerId: string | null) => void;
}

const PlayerRow = memo(function PlayerRow({
  player,
  isTop,
  isWinner,
  isLoser,
  canSelect,
  onClick,
}: {
  player: Player | null;
  isTop: boolean;
  isWinner: boolean;
  isLoser: boolean;
  canSelect: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!canSelect}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between px-3 py-2.5 text-sm transition-all duration-200 text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isTop ? 'border-b border-border/40' : '',
        isWinner ? 'bg-primary/15 font-semibold text-primary' : '',
        isLoser ? 'opacity-40' : '',
        canSelect ? 'hover:bg-muted/70 cursor-pointer active:bg-muted' : 'cursor-default',
        !player ? 'text-muted-foreground italic' : '',
      )}
    >
      <span className="flex items-center gap-2 overflow-hidden min-w-0">
        {player?.seed != null && (
          <span className="shrink-0 text-[10px] text-muted-foreground w-5 text-right font-mono leading-none">
            {player.seed}
          </span>
        )}
        <span className="truncate max-w-[130px]">
          {player ? player.name : 'TBD'}
        </span>
        {player?.country && (
          <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
            {player.country}
          </span>
        )}
      </span>
      {isWinner && (
        <span className="shrink-0 ml-1 text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
          W
        </span>
      )}
    </button>
  );
});

export const MatchCard = memo(function MatchCard({ match, onSelectWinner }: MatchCardProps) {
  const canSelect = Boolean(match.player1 && match.player2);

  const handleClick = (player: Player | null) => {
    if (!player || !canSelect) return;
    // Clicking the current winner unselects it; clicking the other player changes the selection
    const newWinnerId = player.id === match.winnerId ? null : player.id;
    onSelectWinner(match.id, newWinnerId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="py-1.5 relative group"
    >
      {/* Round badge */}
      <span className="absolute -top-1.5 left-2 text-[9px] font-bold tracking-wider uppercase text-muted-foreground bg-background px-1.5 py-0.5 rounded-full border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
        R{match.round}
      </span>

      <div
        className={cn(
          'w-56 overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300',
          'border-l-4',
          match.winnerId
            ? 'border-l-primary/80 shadow-md shadow-primary/5'
            : 'border-l-border/40 group-hover:border-l-primary/30 group-hover:shadow-md',
        )}
      >
        <PlayerRow
          player={match.player1}
          isTop
          isWinner={match.winnerId === match.player1?.id}
          isLoser={Boolean(match.winnerId && match.winnerId !== match.player1?.id)}
          canSelect={canSelect}
          onClick={() => handleClick(match.player1)}
        />
        <PlayerRow
          player={match.player2}
          isTop={false}
          isWinner={match.winnerId === match.player2?.id}
          isLoser={Boolean(match.winnerId && match.winnerId !== match.player2?.id)}
          canSelect={canSelect}
          onClick={() => handleClick(match.player2)}
        />
      </div>
    </motion.div>
  );
});

// ─── Connector line ──────────────────────────────────────────────────────────
function Connector() {
  return <div className="w-5 h-px bg-border/40 shrink-0" />;
}

// ─── Recursive tree ──────────────────────────────────────────────────────────
interface BracketTreeProps {
  matchId: string;
  matches: Match[];
  onSelectWinner: (matchId: string, winnerId: string | null) => void;
}

export function BracketTree({ matchId, matches, onSelectWinner }: BracketTreeProps) {
  const match = matches.find(m => m.id === matchId);
  if (!match) return null;

  const children = matches
    .filter(m => m.nextMatchId === matchId)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="flex items-center">
      {children.length === 2 && (
        <>
          <div className="flex flex-col justify-center">
            <BracketTree matchId={children[0].id} matches={matches} onSelectWinner={onSelectWinner} />
            <BracketTree matchId={children[1].id} matches={matches} onSelectWinner={onSelectWinner} />
          </div>
          <Connector />
        </>
      )}
      <MatchCard match={match} onSelectWinner={onSelectWinner} />
    </div>
  );
}
