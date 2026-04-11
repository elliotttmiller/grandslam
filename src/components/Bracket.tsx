import React from 'react';
import { Match, Player, ROUND_NAMES } from '../lib/bracket-utils';
import { getBasePoints, getUpsetBonus } from '../lib/scoring';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

interface MatchCardProps {
  match: Match;
  onSelectWinner: (matchId: string, winnerId: string) => void;
  showScore?: boolean;
}

export function MatchCard({ match, onSelectWinner, showScore = true }: MatchCardProps) {
  const handlePlayerClick = (player: Player | null) => {
    if (!player || !match.player1 || !match.player2) return;
    onSelectWinner(match.id, player.id);
  };

  const winner = match.winnerId
    ? (match.player1?.id === match.winnerId ? match.player1 : match.player2)
    : null;
  const loser = match.winnerId
    ? (match.player1?.id === match.winnerId ? match.player2 : match.player1)
    : null;

  const earnedBase = winner ? getBasePoints(match.round) : 0;
  const earnedUpset = winner ? getUpsetBonus(winner.seed, loser?.seed, match.round) : 0;
  const isUpset = earnedUpset > 0;

  const renderPlayer = (player: Player | null, isTop: boolean) => {
    const isWinner = match.winnerId === player?.id;
    const isLoser = match.winnerId && match.winnerId !== player?.id;
    const canSelect = match.player1 && match.player2 && !match.winnerId;

    return (
      <div
        className={cn(
          "flex items-center justify-between px-2 py-1.5 text-[11px] transition-colors cursor-default",
          isTop ? "border-b border-border/30" : "",
          isWinner ? "bg-primary/10 font-bold text-primary" : "",
          isLoser ? "opacity-40" : "",
          canSelect ? "cursor-pointer hover:bg-muted/50" : "",
          !player ? "text-muted-foreground/50 italic" : ""
        )}
        onClick={() => handlePlayerClick(player)}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          {player?.seed && (
            <span className="text-[9px] text-muted-foreground w-3 text-right font-mono opacity-70">
              {player.seed}
            </span>
          )}
          <span className="truncate max-w-[90px]">
            {player ? player.name : 'TBD'}
          </span>
        </div>
        {isWinner && (
          <span className="text-[8px] px-1 py-0 h-3 bg-primary/20 text-primary rounded flex items-center font-black">
            W
          </span>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-1 relative group"
    >
      <div className={cn(
        "w-44 overflow-hidden shadow-sm transition-all duration-300 border border-border/50 rounded-md bg-card/50 backdrop-blur-sm border-l-2",
        match.winnerId ? "border-l-primary shadow-md" : "border-l-muted",
        "group-hover:shadow-lg group-hover:border-border"
      )}>
        <div className="flex flex-col">
          {renderPlayer(match.player1, true)}
          {renderPlayer(match.player2, false)}
        </div>

        {/* Score & upset badges */}
        {showScore && winner && (
          <div className="flex items-center gap-1 px-2 py-0.5 border-t border-border/20 bg-background/30">
            <span className="text-[9px] font-bold bg-primary/20 text-primary px-1 rounded">
              +{earnedBase}{earnedUpset > 0 ? `+${earnedUpset}` : ''} pts
            </span>
            {isUpset && (
              <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded font-bold">
                ⚡ upset
              </span>
            )}
          </div>
        )}
      </div>

      {/* Round label on hover */}
      <div className="absolute -top-1 left-1.5 text-[8px] font-black tracking-tighter text-muted-foreground/50 bg-background/80 px-1 py-0 rounded border border-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
        {ROUND_NAMES[match.round] ?? `R${match.round}`}
      </div>
    </motion.div>
  );
}

interface BracketTreeProps {
  matchId: string;
  matches: Match[];
  onSelectWinner: (matchId: string, winnerId: string) => void;
  showScore?: boolean;
}

export function BracketTree({ matchId, matches, onSelectWinner, showScore = true }: BracketTreeProps) {
  const match = matches.find(m => m.id === matchId);
  if (!match) return null;

  const children = matches.filter(m => m.nextMatchId === matchId).sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="flex items-center gap-4">
      {children.length === 2 && (
        <div className="flex flex-col justify-center gap-4">
          <BracketTree matchId={children[0].id} matches={matches} onSelectWinner={onSelectWinner} showScore={showScore} />
          <BracketTree matchId={children[1].id} matches={matches} onSelectWinner={onSelectWinner} showScore={showScore} />
        </div>
      )}
      <div className="flex items-center">
        <div className="w-4 h-px bg-border/50" />
        <MatchCard match={match} onSelectWinner={onSelectWinner} showScore={showScore} />
      </div>
    </div>
  );
}
