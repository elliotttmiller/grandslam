import React from 'react';
import { Match, Player, ROUND_NAMES } from '../lib/bracket-utils';
import { getBasePoints, getUpsetBonus } from '../lib/scoring';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

interface MatchCardProps {
  match: Match;
  onSelectWinner: (matchId: string, winnerId: string) => void;
  showScore?: boolean;
  readOnly?: boolean;
}

export function MatchCard({ match, onSelectWinner, showScore = true, readOnly = false }: MatchCardProps) {
  const handlePlayerClick = (player: Player | null) => {
    if (readOnly) return;
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
    const canSelect = !readOnly && match.player1 && match.player2 && !match.winnerId;
    const isQualifier = player?.name?.startsWith('Qualifier') || player?.name === 'TBD';

    return (
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2.5 text-[13px] transition-all duration-150 select-none",
          isTop ? "border-b border-border/30" : "",
          isWinner ? "bg-emerald-500/[0.12] font-semibold text-emerald-300" : "",
          isLoser ? "opacity-30" : "",
          canSelect ? "cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.07]" : "cursor-default",
          !player ? "text-muted-foreground/40 italic" : ""
        )}
        onClick={() => handlePlayerClick(player)}
        role={canSelect ? "button" : undefined}
        tabIndex={canSelect ? 0 : undefined}
        onKeyDown={canSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') handlePlayerClick(player); } : undefined}
        aria-label={canSelect ? `Select ${player?.name ?? 'TBD'} as winner` : undefined}
      >
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          {player?.seed ? (
            <span className="text-[10px] text-muted-foreground/70 w-[18px] text-center shrink-0 font-mono leading-none">
              {player.seed}
            </span>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          <span className={cn(
            "truncate leading-tight",
            isQualifier && !isWinner ? "text-muted-foreground/60 text-[12px]" : "",
            isWinner ? "text-emerald-300" : ""
          )}>
            {player ? player.name : 'TBD'}
          </span>
        </div>
        {isWinner && (
          <span className="text-[10px] ml-2 shrink-0 text-emerald-400 font-black">✓</span>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
      className="py-1 relative group"
    >
      <div className={cn(
        "w-[14rem] overflow-hidden transition-all duration-200 rounded-xl border",
        "bg-card/70 backdrop-blur-sm shadow-sm",
        match.winnerId
          ? "border-emerald-500/30 border-l-[3px] border-l-emerald-500 shadow-emerald-950/30 shadow-md"
          : "border-border/40 border-l-[3px] border-l-border/20",
        !match.winnerId ? "group-hover:border-border/70 group-hover:shadow-md" : ""
      )}>
        <div className="flex flex-col">
          {renderPlayer(match.player1, true)}
          {renderPlayer(match.player2, false)}
        </div>

        {/* Score & upset badges */}
        {showScore && winner && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-emerald-500/10 bg-emerald-500/[0.04]">
            <span className="text-[10px] font-bold text-emerald-400">
              +{earnedBase}{earnedUpset > 0 ? `+${earnedUpset}` : ''} pts
            </span>
            {isUpset && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">
                ⚡ upset
              </span>
            )}
          </div>
        )}
      </div>

      {/* Round label on hover */}
      <div className="absolute -top-1.5 left-2 text-[9px] font-bold tracking-tight text-muted-foreground/50 bg-background/90 px-1.5 py-0.5 rounded-md border border-border/30 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
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
  readOnly?: boolean;
}

export function BracketTree({ matchId, matches, onSelectWinner, showScore = true, readOnly = false }: BracketTreeProps) {
  const match = matches.find(m => m.id === matchId);
  if (!match) return null;

  const children = matches.filter(m => m.nextMatchId === matchId).sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="flex items-center gap-0">
      {children.length === 2 && (
        <div className="flex flex-col justify-center gap-2">
          <BracketTree matchId={children[0].id} matches={matches} onSelectWinner={onSelectWinner} showScore={showScore} readOnly={readOnly} />
          <BracketTree matchId={children[1].id} matches={matches} onSelectWinner={onSelectWinner} showScore={showScore} readOnly={readOnly} />
        </div>
      )}
      <div className="flex items-center">
        <div className="w-6 h-px bg-gradient-to-r from-border/20 to-border/50" />
        <MatchCard match={match} onSelectWinner={onSelectWinner} showScore={showScore} readOnly={readOnly} />
      </div>
    </div>
  );
}
