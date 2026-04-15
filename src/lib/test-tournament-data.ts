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
import type { League, LeagueMember } from './league-types';
import { saveLeague } from './league-storage';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MADRID_TEST_TOURNAMENT_ID = 'madrid';
export const MADRID_TEST_POOL_ID = 'TSTMDP';
export const MADRID_TEST_POOL_NAME = '🧪 Test: Madrid 2025';
export const MADRID_TEST_TOURNAMENT_NAME = 'Mutua Madrid Open';
export const MADRID_TEST_LEAGUE_ID = 'TSTMDL';

/** Total rounds in an ATP Masters 1000 bracket (64-player draw). */
const MASTERS_TOTAL_ROUNDS = 6;

// ─── Player Data ─────────────────────────────────────────────────────────────

/**
 * Official top-16 seeds for the 2025 Mutua Madrid Open (ATP Masters 1000, Clay).
 * Source: ATP official draw, April–May 2025.
 * Note: Sinner (world #1) withdrew before the draw; Zverev was promoted to top seed.
 * Alcaraz (seed 2) also withdrew before the tournament began.
 * Ordered by seed number 1–16.
 */
export const MADRID_2025_SEEDS: Array<{ seed: number; name: string; country: string }> = [
  { seed: 1,  name: 'Alexander Zverev',           country: 'GER' },
  { seed: 2,  name: 'Carlos Alcaraz',             country: 'ESP' }, // withdrew pre-tournament
  { seed: 3,  name: 'Taylor Fritz',               country: 'USA' },
  { seed: 4,  name: 'Novak Djokovic',             country: 'SRB' },
  { seed: 5,  name: 'Jack Draper',                country: 'GBR' },
  { seed: 6,  name: 'Alex de Minaur',             country: 'AUS' },
  { seed: 7,  name: 'Andrey Rublev',              country: 'RUS' },
  { seed: 8,  name: 'Holger Rune',                country: 'DEN' },
  { seed: 9,  name: 'Daniil Medvedev',            country: 'RUS' },
  { seed: 10, name: 'Lorenzo Musetti',            country: 'ITA' },
  { seed: 11, name: 'Tommy Paul',                 country: 'USA' },
  { seed: 12, name: 'Ben Shelton',                country: 'USA' },
  { seed: 13, name: 'Arthur Fils',                country: 'FRA' },
  { seed: 14, name: 'Casper Ruud',                country: 'NOR' }, // champion
  { seed: 15, name: 'Grigor Dimitrov',            country: 'BUL' },
  { seed: 16, name: 'Frances Tiafoe',             country: 'USA' },
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
 * Determine the winner of a single match based on the actual 2025 Madrid Open results.
 *
 * Round mapping (app 6-round bracket → real tournament rounds):
 *   App R1 = Real R2 (seeds entered; Alcaraz/Djokovic/Rune/Fils were eliminated)
 *   App R2 = Real R3 (Rublev & Shelton eliminated)
 *   App R3 = Real R4 / Round of 16 (Zverev, Fritz→Ruud, De Minaur→Musetti, Paul→Draper, Dimitrov, Tiafoe)
 *   App R4 = Real QF (Ruud def. Medvedev; Draper & Musetti each beat an unseeded opponent)
 *   App R5 = Real SF (Ruud def. Cerundolo; Draper def. Musetti)
 *   App R6 = Real Final (Ruud def. Draper 7–5, 3–6, 6–4)
 */
function getMadrid2025MatchWinner(
  player1: Player | null,
  player2: Player | null,
  round: number,
): Player | null {
  if (!player1 || !player2) return null;

  const s1 = player1.seed ?? 999;
  const s2 = player2.seed ?? 999;

  /** Returns the player with the given seed number, or null if neither player has it. */
  const bySeed = (seed: number): Player | null =>
    s1 === seed ? player1 : s2 === seed ? player2 : null;

  /** Returns the player that is NOT the given seed. */
  const notSeed = (seed: number): Player | null =>
    s1 === seed ? player2 : s2 === seed ? player1 : null;

  // Default: lower seed (higher-ranked) wins; between two unseeded players, player1 wins.
  const defaultWinner = s1 <= s2 ? player1 : player2;

  switch (round) {
    case 1: {
      // Alcaraz [2] withdrew, Djokovic [4] lost R2, Rune [8] retired R2, Fils [13] lost R2.
      for (const seed of [2, 4, 8, 13]) {
        if (bySeed(seed)) return notSeed(seed)!;
      }
      return defaultWinner;
    }
    case 2: {
      // Rublev [7] lost R3 to Bublik; Shelton [12] lost R3 to Menšík.
      for (const seed of [7, 12]) {
        if (bySeed(seed)) return notSeed(seed)!;
      }
      return defaultWinner;
    }
    case 3: {
      // Seed-vs-seed upsets in R4 (round of 16):
      //   Fritz [3] lost to Ruud [14]
      //   De Minaur [6] lost to Musetti [10]
      //   Paul [11] lost to Draper [5]
      if (bySeed(3) && bySeed(14)) return bySeed(14)!;
      if (bySeed(6) && bySeed(10)) return bySeed(10)!;
      if (bySeed(5) && bySeed(11)) return bySeed(5)!;
      // Seeded players who lost to unseeded opponents in R4:
      //   Zverev [1] → Cerundolo (unseeded 20), Dimitrov [15], Tiafoe [16]
      for (const seed of [1, 15, 16]) {
        if (bySeed(seed)) {
          const opp = notSeed(seed)!;
          const oppSeed = opp === player1 ? s1 : s2;
          // Only apply the upset if the opponent is unseeded in the 1-16 bracket
          if (oppSeed > 16) return opp;
        }
      }
      return defaultWinner;
    }
    case 4: {
      // QF: Ruud [14] def. Medvedev [9]
      if (bySeed(9) && bySeed(14)) return bySeed(14)!;
      // Draper [5] and Musetti [10] each beat unseeded opponents — default handles it.
      // Unseeded vs unseeded (Cerundolo def. Menšík) — player1 wins by default.
      return defaultWinner;
    }
    case 5: {
      // SF: Draper [5] def. Musetti [10]; Ruud [14] def. Cerundolo (unseeded) → default
      if (bySeed(5) && bySeed(10)) return bySeed(5)!;
      return defaultWinner;
    }
    case 6: {
      // Final: Ruud [14] def. Draper [5]
      if (bySeed(5) && bySeed(14)) return bySeed(14)!;
      return defaultWinner;
    }
    default:
      return defaultWinner;
  }
}

/**
 * Apply real 2025 Mutua Madrid Open official results up to (and including) `upToRound`.
 *
 * Winner selection is based on the actual tournament outcomes:
 * champion Casper Ruud [14], runner-up Jack Draper [5], with accurate upsets
 * at every stage.
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
      const winner = getMadrid2025MatchWinner(match.player1, match.player2, round);
      if (winner) {
        result = advancePlayer(result, match.id, winner.id);
      }
    }
  }

  return result;
}

// ─── Test Entry Builders ─────────────────────────────────────────────────────

type PickProfile =
  | 'zverev-wins'
  | 'draper-wins'
  | 'ruud-wins'
  | 'medvedev-deep'
  | 'partial';

/**
 * Per-profile pick configuration.
 *
 * champSeed   — the seed this user picks to win the whole tournament.
 * earlyLosers — set of seed numbers this user predicts will be eliminated
 *               before the semis (upsets they "call" in their bracket).
 * upsetBias   — 0–1: probability that a seeded player loses to an unseeded
 *               opponent in rounds 1–3 (when not covered by earlyLosers).
 *               Higher = wilder bracket.
 */
const PROFILE_CONFIG: Record<
  Exclude<PickProfile, 'partial'>,
  { champSeed: number; earlyLosers: Set<number>; upsetBias: number }
> = {
  'zverev-wins': {
    champSeed: 1,
    // Very chalk — only expects the clear outliers to fall
    earlyLosers: new Set([4, 8]),
    upsetBias: 0.10,
  },
  'draper-wins': {
    champSeed: 5,
    // Expects Zverev to stumble and a couple of favorites to fall early
    earlyLosers: new Set([1, 4, 8, 13]),
    upsetBias: 0.20,
  },
  'ruud-wins': {
    champSeed: 14,
    // Dark-horse pick — predicts several favorites to crash out
    earlyLosers: new Set([1, 3, 4, 8, 11, 13, 16]),
    upsetBias: 0.30,
  },
  'medvedev-deep': {
    champSeed: 9,
    // Middle-ground prediction; Medvedev quietly takes the title
    earlyLosers: new Set([4, 8, 13, 15]),
    upsetBias: 0.18,
  },
};

/**
 * Build a bracket prediction for a test pool entry.
 *
 * Profiles:
 * - `zverev-wins`   — chalk picks, Zverev [1] lifts the trophy.
 * - `draper-wins`   — Draper [5] wins (the runner-up), upsets Zverev early.
 * - `ruud-wins`     — Dark horse! Ruud [14] goes all the way (the actual result).
 * - `medvedev-deep` — Medvedev [9] makes a surprise run to win.
 * - `partial`       — only R1 & R2 picks (simulates an incomplete entry).
 *
 * Each non-partial profile applies its `earlyLosers` as guaranteed upsets and
 * adds random variation (via `upsetBias`) in rounds 1–3 so that every
 * generated bracket is unique.
 */
function buildTestPicks(officialMatches: Match[], profile: PickProfile): Match[] {
  let picks = officialMatches.map(m => ({ ...m, winnerId: null as string | null }));

  const maxRound = profile === 'partial' ? 2 : MASTERS_TOTAL_ROUNDS;

  if (profile === 'partial') {
    for (let round = 1; round <= maxRound; round++) {
      const pending = picks.filter(
        m => m.round === round && !m.winnerId && m.player1 !== null && m.player2 !== null,
      );
      for (const match of pending) {
        const s1 = match.player1?.seed ?? 999;
        const s2 = match.player2?.seed ?? 999;
        const winner = s1 <= s2 ? match.player1 : match.player2;
        if (winner) picks = advancePlayer(picks, match.id, winner.id);
      }
    }
    return picks;
  }

  const cfg = PROFILE_CONFIG[profile];

  for (let round = 1; round <= maxRound; round++) {
    const pending = picks.filter(
      m => m.round === round && !m.winnerId && m.player1 !== null && m.player2 !== null,
    );

    for (const match of pending) {
      const s1 = match.player1?.seed ?? 999;
      const s2 = match.player2?.seed ?? 999;

      let winner: Player | null = null;

      if (round === MASTERS_TOTAL_ROUNDS) {
        // Final: pick the designated champion if present, else fall back to lower seed.
        const champ =
          s1 === cfg.champSeed ? match.player1
          : s2 === cfg.champSeed ? match.player2
          : null;
        winner = champ ?? (s1 <= s2 ? match.player1 : match.player2);
      } else {
        const lowerSeedPlayer = s1 <= s2 ? match.player1 : match.player2;
        const higherSeedPlayer = s1 <= s2 ? match.player2 : match.player1;
        const lowerSeedNum = Math.min(s1, s2);

        // If this user "calls" this seed to lose early, let the opponent win.
        if (cfg.earlyLosers.has(lowerSeedNum) && round <= 3) {
          winner = higherSeedPlayer;
        } else {
          // Random variation: seeded players can occasionally fall in rounds 1–3.
          const hasSeededPlayer = s1 <= 16 || s2 <= 16;
          const roll = Math.random();
          if (hasSeededPlayer && round <= 3 && roll < cfg.upsetBias) {
            winner = higherSeedPlayer;
          } else {
            winner = lowerSeedPlayer;
          }
        }
      }

      if (winner) picks = advancePlayer(picks, match.id, winner.id);
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
 * Five simulated participants are created, each with a unique randomized bracket:
 *   1. Zverev Fan     — chalk picks, Zverev [1] wins
 *   2. Draper Believer — Draper [5] goes all the way, calls Zverev out early
 *   3. Ruud Dark Horse — correctly predicts Ruud [14] to win it all
 *   4. Medvedev Deep Run — Medvedev [9] surprises everyone
 *   5. Casual Player  — only R1 & R2 picks made
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
      userName: 'Zverev Fan',
      bracketName: 'Sascha Takes Madrid',
      profile: 'zverev-wins',
      isSubmitted: true,
    },
    {
      userName: 'Draper Believer',
      bracketName: "Jack's Moment",
      profile: 'draper-wins',
      isSubmitted: true,
    },
    {
      userName: 'Ruud Dark Horse',
      bracketName: 'Casper Shocks Madrid',
      profile: 'ruud-wins',
      isSubmitted: true,
    },
    {
      userName: 'Medvedev Fan',
      bracketName: "Daniil's Clay Run",
      profile: 'medvedev-deep',
      isSubmitted: true,
    },
    {
      userName: 'Casual Player',
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

/**
 * Creates a completed test league run:
 *  - creates/resets the Madrid test pool
 *  - applies official results through the final
 *  - creates/updates a linked test league with members from the pool entries
 *
 * Returns the created league ID.
 */
export function setupTestMadridLeagueRun(createdByUserId: string | null): string {
  setupTestMadridPool(createdByUserId);
  const pool = updateTestPoolResults(MASTERS_TOTAL_ROUNDS);
  if (!pool) return MADRID_TEST_LEAGUE_ID;

  const nowIso = new Date().toISOString();

  const members: LeagueMember[] = pool.entries.map(entry => ({
    userId: entry.userId,
    userName: entry.userName,
    joinedAt: nowIso,
  }));

  if (createdByUserId && !members.some(m => m.userId === createdByUserId)) {
    members.unshift({
      userId: createdByUserId,
      userName: 'You',
      joinedAt: nowIso,
    });
  }

  const league: League = {
    id: MADRID_TEST_LEAGUE_ID,
    name: '🧪 Test League: Madrid 2025',
    description: 'Completed league simulation for Madrid 2025.',
    year: 2025,
    isPrivate: true,
    createdBy: createdByUserId ?? members[0]?.userId ?? 'test-user-1',
    createdByName: createdByUserId ? 'You' : members[0]?.userName ?? 'Test User',
    createdAt: nowIso,
    updatedAt: nowIso,
    members,
    memberIds: members.map(m => m.userId),
    tournamentPoolIds: {
      [MADRID_TEST_TOURNAMENT_ID]: pool.id,
    },
  };

  saveLeague(league);
  return league.id;
}
