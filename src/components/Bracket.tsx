import { useEffect, useRef, useState } from 'react';
import { Match, Player, ROUND_NAMES } from '../lib/bracket-utils';
import { getBasePoints, getUpsetBonus } from '../lib/scoring';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const QUALIFIER_PREFIX = 'Qualifier';
const TBD_NAME = 'TBD';

interface MatchCardProps {
  match: Match;
  onSelectWinner: (matchId: string, winnerId: string) => void;
  showScore?: boolean;
  readOnly?: boolean;
  /** When false, users cannot change an existing pick (used to lock picks outside full-draw view) */
  allowChangingPicks?: boolean;
  officialWinnerId?: string | null;
}

export function MatchCard({
  match,
  onSelectWinner,
  showScore = true,
  readOnly = false,
  allowChangingPicks = true,
  officialWinnerId,
}: MatchCardProps) {
  // Track when the winner was just set to trigger animations
  const [justPicked, setJustPicked] = useState(false);
  const prevWinnerIdRef = useRef<string | null>(match.winnerId);

  useEffect(() => {
    if (!prevWinnerIdRef.current && match.winnerId) {
      setJustPicked(true);
      const t = setTimeout(() => setJustPicked(false), 900);
      return () => clearTimeout(t);
    }
    prevWinnerIdRef.current = match.winnerId;
  }, [match.winnerId]);

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

  // If this match contains a BYE (auto-advance), it should not be pickable and should not award points
  const playerIsBye = (p: Player | null) => !!p && ((p.name ?? '').toLowerCase?.() === 'bye' || (p.name ?? '').toLowerCase?.().startsWith('bye-') || p.id?.startsWith?.('bye-'));
  const isByeMatch = playerIsBye(match.player1) || playerIsBye(match.player2);

  const earnedBase = (!isByeMatch && winner) ? getBasePoints(match.round) : 0;
  const earnedUpset = (!isByeMatch && winner) ? getUpsetBonus(winner.seed, loser?.seed, match.round) : 0;
  const isUpset = earnedUpset > 0;
  const hasOfficialResult = officialWinnerId !== undefined && officialWinnerId !== null;
  const isCorrectPick = !!match.winnerId && hasOfficialResult && match.winnerId === officialWinnerId;
  const isIncorrectPick = !!match.winnerId && hasOfficialResult && match.winnerId !== officialWinnerId;

  const renderPlayer = (player: Player | null, isTop: boolean) => {
    const isWinner = match.winnerId === player?.id;
    const isLoser = match.winnerId && match.winnerId !== player?.id;
    const canSelect = !readOnly && allowChangingPicks !== false && match.player1 && match.player2 && !match.winnerId && !isByeMatch;
    const isQualifier = player?.name?.startsWith(QUALIFIER_PREFIX) || player?.name === TBD_NAME;
    const isWinnerIncorrect = isWinner && hasOfficialResult && player?.id !== officialWinnerId;

    return (
      <motion.div
        className={cn(
          "flex items-center justify-between px-3 py-3 text-[13px] select-none min-h-11",
          isTop ? "border-b border-border/30" : "",
          // Winner styling — official results use green/red, user picks (no official result yet) use white selection
          isWinner
            ? hasOfficialResult
              ? isWinnerIncorrect
                ? "bg-red-500/12 font-semibold text-red-300"
                : "bg-emerald-500/12 font-semibold text-emerald-300"
              : "bg-white font-semibold text-foreground"
            : "",
          isLoser ? "opacity-30" : "",
          canSelect ? "cursor-pointer" : "cursor-default",
          !player ? "text-muted-foreground/40 italic" : ""
        )}
        whileTap={canSelect ? { scale: 0.97, backgroundColor: 'rgba(255,255,255,0.06)' } : {}}
        transition={{ duration: 0.1 }}
        onClick={() => handlePlayerClick(player)}
        role={canSelect ? "button" : undefined}
        tabIndex={canSelect ? 0 : undefined}
        onKeyDown={canSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') handlePlayerClick(player); } : undefined}
        aria-label={
          canSelect
            ? `Select ${player?.name ?? 'TBD'}${player?.seed ? ` (seed ${player.seed})` : ''} as winner`
            : isWinner
            ? `${player?.name ?? 'TBD'} — winner`
            : undefined
        }
        aria-pressed={isWinner ? true : undefined}
      >
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          {player?.seed ? (
            <span className="text-[10px] text-muted-foreground/70 w-4.5 text-center shrink-0 font-mono leading-none">
              {player.seed}
            </span>
          ) : (
            <span className="w-4.5 shrink-0" aria-hidden="true" />
          )}
          <span className={cn(
            "truncate leading-tight",
            isQualifier && !isWinner ? "text-muted-foreground/60 text-[12px]" : "",
            isWinner
              ? isWinnerIncorrect
                ? "text-red-300"
                : "text-emerald-300"
              : ""
          )}>
              {player ? player.name : 'TBD'}
          </span>
        </div>
        {isWinner && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className={cn(
              "text-[10px] ml-2 shrink-0 font-black",
              isWinnerIncorrect ? "text-red-400" : "text-emerald-400",
            )}
            aria-hidden="true"
          >✓</motion.span>
        )}
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={justPicked
        ? { opacity: 1, scale: [1, 1.04, 1] }
        : { opacity: 1, scale: 1 }
      }
      transition={justPicked
        ? { duration: 0.28, ease: 'easeOut' }
        : { duration: 0.15 }
      }
      className="py-1 relative group"
      style={{ willChange: 'transform' }}
    >
      {/* Floating score badge — appears when a winner is first picked */}
      <AnimatePresence>
        {justPicked && match.winnerId && (earnedBase + earnedUpset) > 0 && (
          <motion.div
            key={`score-float-${match.id}`}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -40, scale: 0.85 }}
            transition={{ duration: 0.75, ease: [0.2, 0, 0.3, 1] }}
            className="absolute -top-1 right-8 z-20 pointer-events-none text-[11px] font-black text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-full"
          >
            +{earnedBase + earnedUpset} pts
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn(
        "w-56 overflow-hidden transition-all duration-200 rounded-xl border",
        "bg-card/70 backdrop-blur-sm shadow-sm",
        match.winnerId
          ? isIncorrectPick
            ? "border-red-500/30 border-l-[3px] border-l-red-500 shadow-red-950/20 shadow-md"
            : "border-emerald-500/30 border-l-[3px] border-l-emerald-500 shadow-emerald-950/30 shadow-md"
          : "border-border/40 border-l-[3px] border-l-border/20",
        !match.winnerId ? "group-hover:border-border/70 group-hover:shadow-md" : "",
        justPicked ? "shadow-emerald-500/20 shadow-lg" : ""
      )}>
        <div className="flex flex-col">
          {renderPlayer(match.player1, true)}
          {renderPlayer(match.player2, false)}
        </div>

        {/* Score & upset badges */}
        {showScore && winner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1.5 px-3 py-1.5 border-t border-emerald-500/10 bg-emerald-500/4"
          >
            <span className="text-[10px] font-bold text-emerald-400">
              +{earnedBase}{earnedUpset > 0 ? `+${earnedUpset}` : ''} pts
            </span>
            {isUpset && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
                className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-bold"
              >
                ⚡ upset
              </motion.span>
            )}
          </motion.div>
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
  allowChangingPicks?: boolean;
  officialWinnersByMatchId?: Record<string, string | null>;
}

export function BracketTree({
  matchId,
  matches,
  onSelectWinner,
  showScore = true,
  readOnly = false,
  allowChangingPicks = true,
  officialWinnersByMatchId,
}: BracketTreeProps) {
  const match = matches.find(m => m.id === matchId);
  if (!match) return null;

  const children = matches.filter(m => m.nextMatchId === matchId).sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="flex items-center gap-0">
      {children.length === 2 && (
        <div className="flex flex-col justify-center gap-2">
          <BracketTree
            matchId={children[0].id}
            matches={matches}
            onSelectWinner={onSelectWinner}
            showScore={showScore}
            readOnly={readOnly}
            allowChangingPicks={allowChangingPicks}
            officialWinnersByMatchId={officialWinnersByMatchId}
          />
          <BracketTree
            matchId={children[1].id}
            matches={matches}
            onSelectWinner={onSelectWinner}
            showScore={showScore}
            readOnly={readOnly}
            allowChangingPicks={allowChangingPicks}
            officialWinnersByMatchId={officialWinnersByMatchId}
          />
        </div>
      )}
      <div className="flex items-center">
        <div className="w-6 h-px bg-linear-to-r from-border/20 to-border/50" />
        <MatchCard
          match={match}
          onSelectWinner={onSelectWinner}
          showScore={showScore}
          readOnly={readOnly}
          allowChangingPicks={allowChangingPicks}
          officialWinnerId={officialWinnersByMatchId?.[match.id]}
        />
      </div>
    </div>
  );
}
