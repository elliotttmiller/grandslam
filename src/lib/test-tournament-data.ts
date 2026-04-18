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
 * How many app rounds each seeded player survived at the 2025 Mutua Madrid Open.
 * "Survived N rounds" means the player won their match in each of app rounds 1–N.
 *
 * Round mapping (app 6-round bracket → real tournament rounds):
 *   App R1 = Real R2 (top seeds' first match; Alcaraz/Djokovic/Rune/Fils eliminated)
 *   App R2 = Real R3 (Rublev & Shelton eliminated)
 *   App R3 = Real R4 / Round of 16 (Zverev, Fritz, De Minaur, Paul, Dimitrov, Tiafoe out)
 *   App R4 = Real Quarterfinals (Medvedev eliminated by Ruud)
 *   App R5 = Real Semifinals (Musetti eliminated by Draper; Cerundolo by Ruud)
 *   App R6 = Real Final (Ruud def. Draper 7–5, 3–6, 6–4)
 *
 * Source: ATP official 2025 Mutua Madrid Open draw & results.
 */
const MADRID_2025_SEED_SURVIVALS: Record<number, number> = {
  1:  2, // Zverev    — lost App R3 (Real R4, def. by Cerundolo)
  2:  0, // Alcaraz   — withdrew pre-tournament; modelled as App R1 loss
  3:  2, // Fritz     — lost App R3 (Real R4, def. by Ruud)
  4:  0, // Djokovic  — lost App R1 (Real R2)
  5:  5, // Draper    — runner-up; lost App R6 Final to Ruud
  6:  2, // De Minaur — lost App R3 (Real R4, def. by Musetti)
  7:  1, // Rublev    — lost App R2 (Real R3, def. by Bublik)
  8:  0, // Rune      — retired App R1 (Real R2)
  9:  3, // Medvedev  — lost App R4 QF (Real QF, def. by Ruud)
  10: 4, // Musetti   — lost App R5 SF (Real SF, def. by Draper)
  11: 2, // Paul      — lost App R3 (Real R4, def. by Draper)
  12: 1, // Shelton   — lost App R2 (Real R3, def. by Menšík)
  13: 0, // Fils      — lost App R1 (Real R2)
  14: 6, // Ruud      — CHAMPION (won all 6 app rounds)
  15: 2, // Dimitrov  — lost App R3 (Real R4)
  16: 2, // Tiafoe    — lost App R3 (Real R4)
};

/**
 * Determine the winner of a single match based on the actual 2025 Madrid Open results.
 *
 * Uses a draw-independent survival model: each seeded player has a fixed
 * `MADRID_2025_SEED_SURVIVALS[seed]` value representing the number of app rounds
 * they won.  A seeded player wins round R if and only if their survival depth >= R.
 * This guarantees the correct champion (Casper Ruud, seed 14) regardless of which
 * section of the randomised draw the seeds land in.
 *
 * Unseeded qualifiers act as stand-ins for the real unseeded players who caused
 * upsets (Cerundolo, Bublik, Menšík): they beat a seeded opponent whenever that
 * seed's survival depth has been exhausted.
 */
function getMadrid2025MatchWinner(
  player1: Player | null,
  player2: Player | null,
  round: number,
): Player | null {
  if (!player1 || !player2) return null;

  const s1 = player1.seed ?? 0;
  const s2 = player2.seed ?? 0;
  const surv1 = s1 >= 1 && s1 <= 16 ? (MADRID_2025_SEED_SURVIVALS[s1] ?? 0) : 0;
  const surv2 = s2 >= 1 && s2 <= 16 ? (MADRID_2025_SEED_SURVIVALS[s2] ?? 0) : 0;

  // Both players are seeded: higher survival wins; equal survival → lower seed number wins.
  if (s1 >= 1 && s1 <= 16 && s2 >= 1 && s2 <= 16) {
    if (surv1 !== surv2) return surv1 > surv2 ? player1 : player2;
    return s1 < s2 ? player1 : player2;
  }

  // One seeded, one unseeded qualifier: seeded wins only if they survived this round.
  if (s1 >= 1 && s1 <= 16) return surv1 >= round ? player1 : player2;
  if (s2 >= 1 && s2 <= 16) return surv2 >= round ? player2 : player1;

  // Both unseeded qualifiers: player1 wins by default.
  return player1;
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
 * champSeed      — the seed this user picks to win the whole tournament.
 * predictedExits — maps seed number → the app round in which this user predicts
 *                  that seed will be eliminated.  Applied only if the seed is
 *                  still alive in that round of the user's own bracket cascade.
 */
const PROFILE_CONFIG: Record<
  Exclude<PickProfile, 'partial'>,
  { champSeed: number; predictedExits: Map<number, number> }
> = {
  /**
   * Near-perfect bracket: predicts all real upsets and the true champion Ruud [14].
   * Should score highest against the official results.
   */
  'ruud-wins': {
    champSeed: 14,
    predictedExits: new Map([
      [2,  1], [4,  1], [8,  1], [13, 1],           // R1 exits — matches reality
      [7,  2], [12, 2],                               // R2 exits — matches reality
      [1,  3], [3,  3], [6,  3], [11, 3], [15, 3], [16, 3], // R3 exits — matches reality
      [9,  4],                                        // Medvedev QF exit — matches reality
      [10, 5],                                        // Musetti SF exit — matches reality
      [5,  6],                                        // Draper runner-up — matches reality
    ]),
  },

  /**
   * Runner-up picker: calls Draper [5] as champion; gets many real upsets correct
   * but misses the final (Ruud beats Draper in reality).
   */
  'draper-wins': {
    champSeed: 5,
    predictedExits: new Map([
      [2,  1], [4,  1], [8,  1], [13, 1],
      [7,  2], [12, 2],
      [1,  3], [3,  3], [6,  3], [11, 3],
      [9,  4],
      [10, 5],
      [14, 6],  // user predicts Ruud as runner-up (loses the final to Draper)
    ]),
  },

  /**
   * Medvedev run: picks Medvedev [9] to win; correctly calls early rounds but
   * picks the wrong player from QF onwards.
   */
  'medvedev-deep': {
    champSeed: 9,
    predictedExits: new Map([
      [2,  1], [4,  1], [8,  1], [13, 1],
      [7,  2], [12, 2],
      [3,  3], [6,  3], [11, 3],
      [14, 4],  // user predicts Ruud exits QF (Medvedev beats him in their bracket)
      [5,  5],  // user predicts Draper exits SF (Medvedev beats him in their bracket)
    ]),
  },

  /**
   * Chalk player: always picks the higher-ranked (lower seed number) player;
   * only calls the most widely expected R1 withdrawals/retirements.
   * Picks Zverev [1] to win the title.
   */
  'zverev-wins': {
    champSeed: 1,
    predictedExits: new Map([
      [2, 1], [4, 1], [8, 1], [13, 1],  // obvious R1 exits
    ]),
  },
};

/**
 * Build a bracket prediction for a test pool entry.
 *
 * For each round the winner is decided deterministically:
 *   1. If exactly one player's seed appears in `cfg.predictedExits` for the
 *      current round, the other player wins (the user "calls" that exit).
 *   2. In the final (round 6) the champSeed player wins if present; otherwise
 *      the lower seed number wins.
 *   3. Default: lower seed number wins (chalk; unseeded treated as seed 999).
 *
 * The `partial` profile uses chalk logic for rounds 1–2 only.
 */
function buildTestPicks(officialMatches: Match[], profile: PickProfile): Match[] {
  let picks = officialMatches.map(m => ({ ...m, winnerId: null as string | null }));

  const maxRound = profile === 'partial' ? 2 : MASTERS_TOTAL_ROUNDS;

  /** Lower seed number wins; unseeded treated as seed 999. */
  const chalkWinner = (m: Match): Player | null => {
    const s1 = m.player1?.seed ?? 999;
    const s2 = m.player2?.seed ?? 999;
    return s1 <= s2 ? m.player1 : m.player2;
  };

  if (profile === 'partial') {
    for (let round = 1; round <= maxRound; round++) {
      const pending = picks.filter(
        m => m.round === round && !m.winnerId && m.player1 !== null && m.player2 !== null,
      );
      for (const match of pending) {
        const winner = chalkWinner(match);
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
        // Final: champion seed wins if they made it here; otherwise chalk.
        winner =
          s1 === cfg.champSeed ? match.player1
          : s2 === cfg.champSeed ? match.player2
          : chalkWinner(match);
      } else {
        const p1ExitsHere = cfg.predictedExits.get(s1) === round;
        const p2ExitsHere = cfg.predictedExits.get(s2) === round;

        if (p1ExitsHere && !p2ExitsHere) {
          winner = match.player2;  // user calls p1 out this round
        } else if (p2ExitsHere && !p1ExitsHere) {
          winner = match.player1;  // user calls p2 out this round
        } else {
          winner = chalkWinner(match); // chalk default
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
 * Five simulated participants are created, each with a distinct deterministic bracket:
 *   1. Zverev Fan      — chalk picks (lower seed always wins); Zverev [1] as champion
 *   2. Draper Believer — calls many real upsets correctly; Draper [5] as champion
 *   3. Ruud Dark Horse — near-perfect: mirrors actual results, Ruud [14] as champion
 *   4. Medvedev Fan    — picks Medvedev [9] for a deep run; correct early rounds only
 *   5. Casual Player   — only R1 & R2 picks made (incomplete bracket)
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
 * Fake-simulate official results for any existing pool up to the requested
 * round. This does not create leagues, pools, users, or entries.
 *
 * Winner logic: lower seed wins (unseeded treated as seed 999).
 *
 * @param poolId Existing pool ID to update.
 * @param upToRound 0 = clear all results; otherwise applies through this round.
 */
export function updatePoolResultsFake(poolId: string, upToRound: number): Pool | null {
  const pool = getPool(poolId);
  if (!pool) return null;

  const totalRounds = pool.officialMatches.reduce((max, m) => Math.max(max, m.round), 0);
  const clampedRound = Math.max(0, Math.min(upToRound, totalRounds));

  // Reset all official results to blank first, then reapply up to the target round.
  const blank = pool.officialMatches.map(m => ({ ...m, winnerId: null as string | null }));
  let simulated = blank;

  for (let round = 1; round <= clampedRound; round++) {
    const pending = simulated.filter(
      m => m.round === round && !m.winnerId && m.player1 !== null && m.player2 !== null,
    );
    for (const match of pending) {
      const p1 = match.player1;
      const p2 = match.player2;
      if (!p1 || !p2) continue;
      const s1 = p1.seed ?? 999;
      const s2 = p2.seed ?? 999;
      const winner = s1 <= s2 ? p1 : p2;
      simulated = advancePlayer(simulated, match.id, winner.id);
    }
  }

  pool.officialMatches = simulated;
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
