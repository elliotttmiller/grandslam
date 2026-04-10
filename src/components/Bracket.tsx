import React from 'react';
import { Match, Player } from '../lib/bracket-utils';
import { cn } from '../lib/utils';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import * as motion from 'motion/react-client';

interface MatchCardProps {
  match: Match;
  onSelectWinner: (matchId: string, winnerId: string) => void;
}

export function MatchCard({ match, onSelectWinner }: MatchCardProps) {
  const handlePlayerClick = (player: Player | null) => {
    if (!player || !match.player1 || !match.player2) return;
    onSelectWinner(match.id, player.id);
  };

  const renderPlayer = (player: Player | null, isTop: boolean) => {
    const isWinner = match.winnerId === player?.id;
    const isLoser = match.winnerId && match.winnerId !== player?.id;
    const canSelect = match.player1 && match.player2 && !match.winnerId;

    return (
      <motion.div 
        className={cn(
          "flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-default",
          isTop ? "border-b border-border/50" : "",
          isWinner ? "bg-primary/10 font-semibold" : "",
          isLoser ? "opacity-50" : "",
          canSelect ? "cursor-pointer hover:bg-muted" : "",
          !player ? "text-muted-foreground italic" : ""
        )}
        onClick={() => handlePlayerClick(player)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {player?.seed && (
            <span className="text-xs text-muted-foreground w-4 text-right font-mono">
              {player.seed}
            </span>
          )}
          <span className="truncate max-w-[120px]">
            {player ? player.name : 'TBD'}
          </span>
        </div>
        {isWinner && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">W</Badge>}
      </motion.div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-2 relative group"
    >
      <Card className={cn(
        "w-64 overflow-hidden shadow-sm transition-all duration-300 border-l-4",
        match.winnerId ? "border-l-primary shadow-md border-border" : "border-l-muted border-border",
        "group-hover:shadow-lg hover:border-l-primary/50"
      )}>
        <div className="flex flex-col bg-card">
          {renderPlayer(match.player1, true)}
          {renderPlayer(match.player2, false)}
        </div>
      </Card>
      
      <div className="absolute -top-1 left-2 text-[10px] font-bold tracking-wider text-muted-foreground bg-background px-1.5 py-0.5 rounded-full border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
        R{match.round}
      </div>
    </motion.div>
  );
}

interface BracketTreeProps {
  matchId: string;
  matches: Match[];
  onSelectWinner: (matchId: string, winnerId: string) => void;
}

export function BracketTree({ matchId, matches, onSelectWinner }: BracketTreeProps) {
  const match = matches.find(m => m.id === matchId);
  if (!match) return null;
  
  const children = matches.filter(m => m.nextMatchId === matchId).sort((a, b) => a.matchNumber - b.matchNumber);
  
  return (
    <div className="flex items-center gap-4">
      {children.length === 2 && (
        <div className="flex flex-col justify-center gap-4">
          <BracketTree matchId={children[0].id} matches={matches} onSelectWinner={onSelectWinner} />
          <BracketTree matchId={children[1].id} matches={matches} onSelectWinner={onSelectWinner} />
        </div>
      )}
      <div className="flex items-center">
        <div className="w-4 h-px bg-border/50" />
        <MatchCard match={match} onSelectWinner={onSelectWinner} />
      </div>
    </div>
  );
}
