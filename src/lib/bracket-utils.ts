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

export const ROUND_NAMES: Record<number, string> = {
  1: '1st Rd', 2: '2nd Rd', 3: '3rd Rd', 4: 'Rd of 16', 5: 'Quarters', 6: 'Semis', 7: 'Championship'
};

export const ROUND_FULL_NAMES: Record<number, string> = {
  1: 'First Round', 2: 'Second Round', 3: 'Third Round', 4: 'Round of 16',
  5: 'Quarterfinals', 6: 'Semifinals', 7: 'Championship'
};

/**
 * Round name overrides for 6-round (64-player) brackets, e.g. ATP Masters 1000.
 * Rounds 1-5 match the Grand Slam names; round 6 is the Final.
 */
export const MASTERS_ROUND_NAMES: Record<number, string> = {
  1: '1st Rd', 2: '2nd Rd', 3: '3rd Rd', 4: 'Quarters', 5: 'Semis', 6: 'Final'
};

export const MASTERS_ROUND_FULL_NAMES: Record<number, string> = {
  1: 'First Round', 2: 'Second Round', 3: 'Third Round',
  4: 'Quarterfinals', 5: 'Semifinals', 6: 'Final'
};

/** Returns the short round label, respecting the total number of rounds in the bracket. */
export function getRoundName(round: number, totalRounds: number): string {
  if (totalRounds === 6) return MASTERS_ROUND_NAMES[round] ?? `R${round}`;
  return ROUND_NAMES[round] ?? `R${round}`;
}

/** Returns the full round label, respecting the total number of rounds in the bracket. */
export function getRoundFullName(round: number, totalRounds: number): string {
  if (totalRounds === 6) return MASTERS_ROUND_FULL_NAMES[round] ?? `Round ${round}`;
  return ROUND_FULL_NAMES[round] ?? `Round ${round}`;
}

export const BASE_POINTS: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Grand Slam 128-player seeded draw placement
// Seeded positions (0-indexed) follow standard ATP/WTA draw logic:
//   S1 → 0, S2 → 127
//   S3/S4 → randomly {32, 96}
//   S5-S8 → randomly {16, 48, 80, 112}
//   S9-S16 → randomly {8, 24, 40, 56, 72, 88, 104, 120}
//   S17-S32 → randomly {4,12,20,28,36,44,52,60,68,76,84,92,100,108,116,124}
export function getSeededDraw(players: Player[]): Player[] {
  const size = 128;

  const seeded = players
    .filter(p => p.seed && p.seed >= 1 && p.seed <= 32)
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));

  const unseeded = players.filter(p => !p.seed || p.seed > 32);

  // Auto-fill qualifiers if fewer than 96 unseeded provided
  const allUnseeded = [...unseeded];
  let qNum = 1;
  while (allUnseeded.length < 96) {
    allUnseeded.push({ id: `q${qNum}`, name: `Qualifier ${qNum}`, seed: undefined });
    qNum++;
  }

  // Build seeded-position map
  const seedPos: Record<number, number> = { 1: 0, 2: 127 };

  const s3s4 = shuffle([32, 96]);
  seedPos[3] = s3s4[0];
  seedPos[4] = s3s4[1];

  const s5s8 = shuffle([16, 48, 80, 112]);
  [5, 6, 7, 8].forEach((s, i) => { seedPos[s] = s5s8[i]; });

  const s9s16 = shuffle([8, 24, 40, 56, 72, 88, 104, 120]);
  [9, 10, 11, 12, 13, 14, 15, 16].forEach((s, i) => { seedPos[s] = s9s16[i]; });

  const s17s32 = shuffle([4, 12, 20, 28, 36, 44, 52, 60, 68, 76, 84, 92, 100, 108, 116, 124]);
  [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].forEach((s, i) => {
    seedPos[s] = s17s32[i];
  });

  const draw: (Player | null)[] = new Array(size).fill(null);

  for (const player of seeded) {
    const pos = player.seed !== undefined ? seedPos[player.seed] : undefined;
    if (pos !== undefined) draw[pos] = player;
  }

  const shuffledUnseeded = shuffle(allUnseeded);
  let ui = 0;
  for (let i = 0; i < size; i++) {
    if (draw[i] === null && ui < shuffledUnseeded.length) {
      draw[i] = shuffledUnseeded[ui++];
    }
  }

  return draw.map((p, i) => p ?? { id: `bye-${i}`, name: 'BYE' });
}

// ATP Masters 1000 64-player seeded draw placement
// Seeded positions (0-indexed) follow standard ATP draw logic scaled to 64:
//   S1 → 0, S2 → 63
//   S3/S4 → randomly {16, 48}
//   S5-S8 → randomly {8, 24, 40, 56}
//   S9-S16 → randomly {4, 12, 20, 28, 36, 44, 52, 60}
export function getSeededDrawMasters(players: Player[]): Player[] {
  const size = 64;

  const seeded = players
    .filter(p => p.seed && p.seed >= 1 && p.seed <= 16)
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));

  const unseeded = players.filter(p => !p.seed || p.seed > 16);

  // Auto-fill qualifiers if fewer than 48 unseeded provided
  const allUnseeded = [...unseeded];
  let qNum = 1;
  while (allUnseeded.length < 48) {
    allUnseeded.push({ id: `q${qNum}`, name: `Qualifier ${qNum}`, seed: undefined });
    qNum++;
  }

  const seedPos: Record<number, number> = { 1: 0, 2: 63 };

  const s3s4 = shuffle([16, 48]);
  seedPos[3] = s3s4[0];
  seedPos[4] = s3s4[1];

  const s5s8 = shuffle([8, 24, 40, 56]);
  [5, 6, 7, 8].forEach((s, i) => { seedPos[s] = s5s8[i]; });

  const s9s16 = shuffle([4, 12, 20, 28, 36, 44, 52, 60]);
  [9, 10, 11, 12, 13, 14, 15, 16].forEach((s, i) => { seedPos[s] = s9s16[i]; });

  const draw: (Player | null)[] = new Array(size).fill(null);

  for (const player of seeded) {
    const pos = player.seed !== undefined ? seedPos[player.seed] : undefined;
    if (pos !== undefined) draw[pos] = player;
  }

  const shuffledUnseeded = shuffle(allUnseeded);
  let ui = 0;
  for (let i = 0; i < size; i++) {
    if (draw[i] === null && ui < shuffledUnseeded.length) {
      draw[i] = shuffledUnseeded[ui++];
    }
  }

  return draw.map((p, i) => p ?? { id: `bye-${i}`, name: 'BYE' });
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

/**
 * Generate a 64-player ATP Masters 1000 bracket using Masters seeding positions.
 * Expects up to 16 seeded players; fills remaining spots with qualifiers.
 */
export function generateMastersBracket(players: Player[]): Match[] {
  const draw = getSeededDrawMasters(players);
  const matches: Match[] = [];
  const totalRounds = Math.log2(draw.length); // 6 for 64 players

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
