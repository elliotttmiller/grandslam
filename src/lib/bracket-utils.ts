export type Player = {
  id: string;
  name: string;
  seed?: number;
  country?: string;
};

export type Match = {
  id: string;
  round: number;
  matchNumber: number; // 1-indexed within the round
  player1: Player | null;
  player2: Player | null;
  winnerId: string | null;
  nextMatchId: string | null;
};

export type Tournament = {
  id: string;
  name: string;
  year: number;
  matches: Match[];
};

// Standard tennis seeding positions for a 32-player draw
export function getSeededDraw(players: Player[]): Player[] {
  // Pad to nearest power of 2
  const size = 32;
  const padded = [...players];
  while (padded.length < size) {
    padded.push({ id: `bye-${padded.length}`, name: 'Bye' });
  }
  
  // Sort by seed, then unseeded
  padded.sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    if (a.seed) return -1;
    if (b.seed) return 1;
    return 0;
  });

  // Fold array to create matchups
  let draw = [padded[0], padded[1]];
  
  // Expand the draw to 128
  // 2 -> 4 -> 8 -> 16 -> 32 -> 64 -> 128
  const rounds = Math.log2(size);
  for (let r = 1; r < rounds; r++) {
    const nextDraw: Player[] = [];
    const currentSize = draw.length;
    const sum = currentSize * 2 + 1;
    for (let i = 0; i < currentSize; i++) {
      nextDraw.push(draw[i]);
      // Find the player that should play against draw[i]
      const player1Index = padded.findIndex(p => p.id === draw[i].id);
      const player2Index = sum - (player1Index + 1) - 1;
      nextDraw.push(padded[player2Index]);
    }
    draw = nextDraw;
  }
  
  return draw;
}

export function generateBracket(players: Player[]): Match[] {
  const draw = getSeededDraw(players);
  const matches: Match[] = [];
  const totalRounds = Math.log2(draw.length);
  
  let matchIdCounter = 1;
  let previousRoundMatches: Match[] = [];
  
  for (let round = 1; round <= totalRounds; round++) {
    const numMatches = draw.length / Math.pow(2, round);
    const currentRoundMatches: Match[] = [];
    
    for (let i = 0; i < numMatches; i++) {
      const match: Match = {
        id: `m${matchIdCounter++}`,
        round,
        matchNumber: i + 1,
        player1: null,
        player2: null,
        winnerId: null,
        nextMatchId: null,
      };
      
      if (round === 1) {
        match.player1 = draw[i * 2];
        match.player2 = draw[i * 2 + 1];
      }
      
      currentRoundMatches.push(match);
      matches.push(match);
    }
    
    // Link previous round to this round
    if (round > 1) {
      for (let i = 0; i < previousRoundMatches.length; i++) {
        const prevMatch = previousRoundMatches[i];
        const nextMatchIndex = Math.floor(i / 2);
        prevMatch.nextMatchId = currentRoundMatches[nextMatchIndex].id;
      }
    }
    
    previousRoundMatches = currentRoundMatches;
  }
  
  return matches;
}

export function advancePlayer(matches: Match[], matchId: string, winnerId: string): Match[] {
  const newMatches = [...matches.map(m => ({ ...m, player1: m.player1 ? {...m.player1} : null, player2: m.player2 ? {...m.player2} : null }))];
  const matchIndex = newMatches.findIndex(m => m.id === matchId);
  if (matchIndex === -1) return newMatches;
  
  const match = newMatches[matchIndex];
  match.winnerId = winnerId;
  
  const winner = match.player1?.id === winnerId ? match.player1 : match.player2;
  
  if (match.nextMatchId && winner) {
    const nextMatchIndex = newMatches.findIndex(m => m.id === match.nextMatchId);
    if (nextMatchIndex !== -1) {
      const nextMatch = newMatches[nextMatchIndex];
      // Is this match coming from the top or bottom branch?
      // If matchNumber is odd, it goes to player1. If even, player2.
      if (match.matchNumber % 2 !== 0) {
        nextMatch.player1 = winner;
      } else {
        nextMatch.player2 = winner;
      }
      
      // If the next match already had a winner, we might need to reset it if the winner changed
      // For simplicity, let's just clear the winner of the next match if the participants change
      if (nextMatch.winnerId === winnerId) {
        // Winner is still the same, do nothing
      } else {
        nextMatch.winnerId = null;
        // Also recursively clear subsequent matches
        let curr = nextMatch;
        while (curr.nextMatchId) {
          const next = newMatches.find(m => m.id === curr.nextMatchId);
          if (next) {
            if (next.player1?.id === curr.winnerId) next.player1 = null;
            if (next.player2?.id === curr.winnerId) next.player2 = null;
            next.winnerId = null;
            curr = next;
          } else {
            break;
          }
        }
      }
    }
  }
  
  return newMatches;
}
