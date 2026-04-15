/**
 * Test Tournament Data — 2025 Mutua Madrid Open (ATP Masters 1000)
 *
 * Provides everything needed to spin up a realistic, self-contained test pool
 * that exercises the full workflow: bracket generation → picks → official
 * results entry (round-by-round) → scoring → leaderboard.
 *
 * Usage (from DevPanel or a setup script):
 *   const poolId = setupTestMadridPool(authUserId);
 *   updateTestPoolResults(1); // apply R1 results
 *   updateTestPoolResults(2); // advance to R2, etc.
 *   clearTestPool();          // tear down
 */

import { generateMastersBracket, advancePlayer } from './bracket-utils';
import type { Player, Match } from './bracket-utils';
import type { Pool, PoolEntry } from './pool-types';
import { savePool, getPool, deletePool, generateId } from './pool-storage';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MADRID_TEST_TOURNAMENT_ID = 'madrid';
export const MADRID_TEST_POOL_ID = 'TSTMDP';
export const MADRID_TEST_POOL_NAME = '🧪 Test: Madrid 2025';
export const MADRID_TEST_TOURNAMENT_NAME = 'Mutua Madrid Open';

/** Total rounds in an ATP Masters 1000 bracket (64-player draw). */
const MASTERS_TOTAL_ROUNDS = 6;

// ─── Player Data ─────────────────────────────────────────────────────────────

/**
 * Top-16 seeds for the 2025 Mutua Madrid Open (ATP Masters 1000, Clay).
 * Ordered by seed number 1–16.
 */
export const MADRID_2025_SEEDS: Array<{ seed: number; name: string; country: string }> = [
  { seed: 1,  name: 'Jannik Sinner',              country: 'ITA' },
  { seed: 2,  name: 'Carlos Alcaraz',             country: 'ESP' },
  { seed: 3,  name: 'Alexander Zverev',           country: 'GER' },
  { seed: 4,  name: 'Taylor Fritz',               country: 'USA' },
  { seed: 5,  name: 'Casper Ruud',                country: 'NOR' },
  { seed: 6,  name: 'Novak Djokovic',             country: 'SRB' },
  { seed: 7,  name: 'Daniil Medvedev',            country: 'RUS' },
  { seed: 8,  name: 'Andrey Rublev',              country: 'RUS' },
  { seed: 9,  name: 'Hubert Hurkacz',             country: 'POL' },
  { seed: 10, name: 'Grigor Dimitrov',            country: 'BUL' },
  { seed: 11, name: 'Ugo Humbert',                country: 'FRA' },
  { seed: 12, name: 'Alex de Minaur',             country: 'AUS' },
  { seed: 13, name: 'Stefanos Tsitsipas',         country: 'GRE' },
  { seed: 14, name: 'Tommy Paul',                 country: 'USA' },
  { seed: 15, name: 'Ben Shelton',                country: 'USA' },
  { seed: 16, name: 'Holger Rune',                country: 'DEN' },
];

/**
 * Returns the full 64-player draw: 16 seeded players + 48 qualifier placeholders.
 */
export function getMadrid2025Players(): Player[] {
  const players: Player[] = MADRID_2025_SEEDS.map((s, i) => ({
    id: `ms${i + 1}`,
    name: s.name,
    seed: s.seed,
    country: s.country,
  }));
  for (let i = 1; i <= 48; i++) {
    players.push({ id: `mq${i}`, name: `Qualifier ${i}` });
  }
  return players;
}

/**
 * Generate a fresh Madrid 2025 bracket using the same `generateMastersBracket`
 * function that the live app uses (seeded draw placement, 64 players, 6 rounds).
 * All `winnerId` values start as `null`.
 */
export function generateTestMadridBracket(): Match[] {
  return generateMastersBracket(getMadrid2025Players());
}

// ─── Official Results Simulation ─────────────────────────────────────────────

/**
 * Apply simulated official results up to (and including) `upToRound`.
 *
 * Strategy: the lower seed number (= higher ATP ranking) wins every match.
 * When both players are unseeded the match-winner defaults to `player1`.
 * This produces a clean, predictable result set that exercises the full
 * scoring pipeline without requiring real match data.
 *
 * @param matches  Starting matches array (may have existing winners).
 * @param upToRound  1–6 to apply through that round; 0 = return matches unchanged.
 */
export function applyOfficialResultsUpToRound(
  matches: Match[],
  upToRound: number,
): Match[] {
  if (upToRound === 0) return matches.map(m => ({ ...m }));

  let result = matches.map(m => ({ ...m }));

  for (let round = 1; round <= upToRound; round++) {
    const pending = result.filter(
      m => m.round === round && !m.winnerId && m.player1 !== null && m.player2 !== null,
    );
    for (const match of pending) {
      const s1 = match.player1?.seed ?? 999;
      const s2 = match.player2?.seed ?? 999;
      const winner = s1 <= s2 ? match.player1 : match.player2;
      if (winner) {
        result = advancePlayer(result, match.id, winner.id);
      }
    }
  }

  return result;
}

// ─── Test Entry Builders ─────────────────────────────────────────────────────

type PickProfile = 'sinner-wins' | 'alcaraz-wins' | 'djokovic-run' | 'zverev-wins' | 'partial';

/**
 * Build a bracket prediction (pool entry picks) from a blank bracket.
 *
 * Profiles:
 * - `sinner-wins`   — favorites advance every round; S1 wins the final.
 * - `alcaraz-wins`  — favorites advance every round; S2 wins the final.
 * - `djokovic-run`  — favorites advance through SF; S6 wins the final
 *                     (lower-seed strategy otherwise, so many QF/SF picks correct).
 * - `partial`       — only R1 & R2 picks are made (simulates an incomplete entry).
 */
function buildTestPicks(officialMatches: Match[], profile: PickProfile): Match[] {
  // Start with a blank copy of the bracket
  let picks = officialMatches.map(m => ({ ...m, winnerId: null as string | null }));

  const maxRound = profile === 'partial' ? 2 : MASTERS_TOTAL_ROUNDS;

  for (let round = 1; round <= maxRound; round++) {
    const pending = picks.filter(
      m => m.round === round && !m.winnerId && m.player1 !== null && m.player2 !== null,
    );

    for (const match of pending) {
      const s1 = match.player1?.seed ?? 999;
      const s2 = match.player2?.seed ?? 999;

      let winner: Player | null = null;

      if (round === MASTERS_TOTAL_ROUNDS) {
        // Final: pick the profile champion if they're present in the match
        const champSeed =
          profile === 'alcaraz-wins' ? 2
          : profile === 'djokovic-run' ? 6
          : profile === 'zverev-wins' ? 3
          : 1;
        const champPlayer =
          match.player1?.seed === champSeed
            ? match.player1
            : match.player2?.seed === champSeed
            ? match.player2
            : null;
        // Fall back to lower seed if the profile champion didn't reach the final
        winner = champPlayer ?? (s1 <= s2 ? match.player1 : match.player2);
      } else {
        // Non-final: always advance the lower-seeded (higher-ranked) player
        winner = s1 <= s2 ? match.player1 : match.player2;
      }

      if (winner) {
        picks = advancePlayer(picks, match.id, winner.id);
      }
    }
  }

  return picks;
}

// ─── Pool Setup / Teardown ───────────────────────────────────────────────────

/**
 * Create (or recreate) the test Madrid pool in localStorage.
 *
 * Always uses the fixed pool ID `MADRID_TEST_POOL_ID` so that calling this
 * function a second time simply replaces the previous test pool.
 *
 * Returns the pool ID.
 */
export function setupTestMadridPool(createdByUserId: string | null): string {
  const officialMatches = generateTestMadridBracket();

  const entryDefs: Array<{
    userName: string;
    bracketName: string;
    profile: PickProfile;
    isSubmitted: boolean;
  }> = [
    {
      userName: 'Sinner Fan',
      bracketName: 'Jannik All the Way',
      profile: 'sinner-wins',
      isSubmitted: true,
    },
    {
      userName: 'Alcaraz Believer',
      bracketName: 'Carlitos Forever',
      profile: 'alcaraz-wins',
      isSubmitted: true,
    },
    {
      userName: 'Novak Fan',
      bracketName: 'Nole on Clay',
      profile: 'djokovic-run',
      isSubmitted: true,
    },
    {
      userName: 'Zverev Supporter',
      bracketName: 'Sascha Takes Madrid',
      profile: 'zverev-wins',
      isSubmitted: true,
    },
    {
      userName: 'Busy Player',
      bracketName: 'Quick R1–R2 Picks',
      profile: 'partial',
      isSubmitted: false,
    },
  ];

  const entries: PoolEntry[] = entryDefs.map((def, idx) => ({
    id: generateId(),
    userId: `test-user-${idx + 1}`,
    userName: def.userName,
    bracketName: def.bracketName,
    matches: buildTestPicks(officialMatches, def.profile),
    isSubmitted: def.isSubmitted,
    submittedAt: def.isSubmitted ? new Date().toISOString() : undefined,
  }));

  const pool: Pool = {
    id: MADRID_TEST_POOL_ID,
    name: MADRID_TEST_POOL_NAME,
    tournamentId: MADRID_TEST_TOURNAMENT_ID,
    tournamentName: MADRID_TEST_TOURNAMENT_NAME,
    createdAt: new Date().toISOString(),
    officialMatches,
    entries,
    ...(createdByUserId ? { createdBy: createdByUserId } : {}),
  };

  savePool(pool);
  return MADRID_TEST_POOL_ID;
}

/**
 * Update the official results on the existing test pool up to a given round.
 *
 * @param upToRound  0 = clear all results; 1–6 = apply through that round.
 * @returns The updated pool, or `null` if no test pool exists.
 */
export function updateTestPoolResults(upToRound: number): Pool | null {
  const pool = getPool(MADRID_TEST_POOL_ID);
  if (!pool) return null;

  // Reset all official results to blank first, then reapply up to the target round.
  const blank = pool.officialMatches.map(m => ({ ...m, winnerId: null as string | null }));
  pool.officialMatches = applyOfficialResultsUpToRound(blank, upToRound);

  savePool(pool);
  return pool;
}

/**
 * Remove the test pool from localStorage.
 */
export function clearTestPool(): void {
  deletePool(MADRID_TEST_POOL_ID);
}
