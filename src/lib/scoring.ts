import { Match } from './bracket-utils';

export interface BracketScore {
  basePoints: number;
  upsetBonus: number;
  total: number;
  picksCompleted: number;
  maxPossible: number; // 448 per slam
}

// Round multipliers for upset bonus
// R1-R2: ×1, R3-R4: ×2, QF-SF: ×3, Final: ×5
const UPSET_MULTIPLIERS: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 5
};

const BASE_PTS: Record<number, number> = {
  1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64
};

export function getBasePoints(round: number): number {
  return BASE_PTS[round] ?? 0;
}

// Returns upset bonus if lower seed (higher number) beats higher seed (lower number).
// Unseeded players use seed #33 for calculation.
export function getUpsetBonus(
  winnerSeed: number | undefined,
  loserSeed: number | undefined,
  round: number
): number {
  const wSeed = winnerSeed ?? 33;
  const lSeed = loserSeed ?? 33;
  if (wSeed <= lSeed) return 0;
  const multiplier = UPSET_MULTIPLIERS[round] ?? 1;
  return (wSeed - lSeed) * multiplier;
}

export function calculateBracketScore(matches: Match[]): BracketScore {
  let basePoints = 0;
  let upsetBonus = 0;
  let picksCompleted = 0;

  for (const match of matches) {
    if (!match.winnerId) continue;
    picksCompleted++;
    const winner = match.player1?.id === match.winnerId ? match.player1 : match.player2;
    const loser = match.player1?.id === match.winnerId ? match.player2 : match.player1;
    basePoints += getBasePoints(match.round);
    upsetBonus += getUpsetBonus(winner?.seed, loser?.seed, match.round);
  }

  return { basePoints, upsetBonus, total: basePoints + upsetBonus, picksCompleted, maxPossible: 448 };
}

// Calculate Calendar Slam Bonus given champion (final winner) per slam.
// champions: Record<slamId, winnerId | null>
export function calculateCalendarSlamBonus(
  champions: Record<string, string | null>
): { bonus: number; description: string } {
  const valid = Object.values(champions).filter(Boolean) as string[];
  if (valid.length < 2) return { bonus: 0, description: '' };

  const counts: Record<string, number> = {};
  for (const id of valid) counts[id] = (counts[id] ?? 0) + 1;

  let bonus = 0;
  const parts: string[] = [];

  for (const count of Object.values(counts)) {
    if (count >= 4) { bonus += 1000; parts.push('Calendar Grand Slam (+1,000)'); }
    else if (count === 3) { bonus += 400; parts.push('3 Slams (+400)'); }
    else if (count === 2) { bonus += 150; parts.push('2 Slams (+150)'); }
  }

  return { bonus, description: parts.join(', ') };
}

export function calculateSeasonScore(
  bracketScores: Record<string, BracketScore>,
  calendarBonus: number
): number {
  return Object.values(bracketScores).reduce((sum, s) => sum + s.total, 0) + calendarBonus;
}
