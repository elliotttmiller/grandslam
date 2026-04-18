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

import { buildBracketFromDraw, advancePlayer } from './bracket-utils';
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
export const MADRID_2025_TEST_POOL_OPTION_ID = 'madrid-2025-official-test-pool';
export const MADRID_2025_TEST_POOL_OPTION_NAME = 'Madrid 2025 (Official Draw)';

/** Total rounds in an ATP Masters 1000 bracket (64-player draw). */
const MASTERS_TOTAL_ROUNDS = 6;

// ─── Player Data ─────────────────────────────────────────────────────────────

/**
 * Official 32 seeds for the 2025 Mutua Madrid Open (ATP Masters 1000, Clay).
 * Source: ATP official draw, April–May 2025.
 * Sinner (world #1) withdrew before the draw; Zverev promoted to seed 1.
 * Alcaraz (seed 2) withdrew before the tournament; replaced by Lucky Loser Gabriel Diallo.
 */
export const MADRID_2025_SEEDS: Array<{ seed: number; name: string; country: string }> = [
  { seed:  1, name: 'Alexander Zverev',              country: 'GER' },
  { seed:  2, name: 'Carlos Alcaraz',                country: 'ESP' }, // withdrew; LL Diallo in his spot
  { seed:  3, name: 'Taylor Fritz',                  country: 'USA' },
  { seed:  4, name: 'Novak Djokovic',                country: 'SRB' },
  { seed:  5, name: 'Jack Draper',                   country: 'GBR' },
  { seed:  6, name: 'Alex de Minaur',                country: 'AUS' },
  { seed:  7, name: 'Andrey Rublev',                 country: 'RUS' },
  { seed:  8, name: 'Holger Rune',                   country: 'DEN' },
  { seed:  9, name: 'Daniil Medvedev',               country: 'RUS' },
  { seed: 10, name: 'Lorenzo Musetti',               country: 'ITA' },
  { seed: 11, name: 'Tommy Paul',                    country: 'USA' },
  { seed: 12, name: 'Ben Shelton',                   country: 'USA' },
  { seed: 13, name: 'Arthur Fils',                   country: 'FRA' },
  { seed: 14, name: 'Casper Ruud',                   country: 'NOR' }, // champion
  { seed: 15, name: 'Grigor Dimitrov',               country: 'BUL' },
  { seed: 16, name: 'Frances Tiafoe',                country: 'USA' },
  { seed: 17, name: 'Stefanos Tsitsipas',            country: 'GRE' },
  { seed: 18, name: 'Félix Auger-Aliassime',         country: 'CAN' },
  { seed: 19, name: 'Tomáš Macháč',                  country: 'CZE' },
  { seed: 20, name: 'Francisco Cerúndolo',           country: 'ARG' },
  { seed: 21, name: 'Ugo Humbert',                   country: 'FRA' },
  { seed: 22, name: 'Jakub Menšík',                  country: 'CZE' },
  { seed: 23, name: 'Sebastian Korda',               country: 'USA' },
  { seed: 24, name: 'Karen Khachanov',               country: 'RUS' },
  { seed: 25, name: 'Alexei Popyrin',                country: 'AUS' },
  { seed: 26, name: 'Jiří Lehečka',                  country: 'CZE' },
  { seed: 27, name: 'Hubert Hurkacz',                country: 'POL' },
  { seed: 28, name: 'Alejandro Davidovich Fokina',   country: 'ESP' },
  { seed: 29, name: 'Denis Shapovalov',              country: 'CAN' },
  { seed: 30, name: 'Matteo Berrettini',             country: 'ITA' },
  { seed: 31, name: 'Brandon Nakashima',             country: 'USA' },
  { seed: 32, name: 'Sebastián Báez',                country: 'ARG' },
];

// ─── Real 2025 Madrid Draw ────────────────────────────────────────────────────

/**
 * Stable player records for all 64 bracket participants.
 *
 * Seeds (s1–s32): the 32 real seeded players.  s2 = Alcaraz, who withdrew; his
 *   bracket slot is filled by Lucky Loser Gabriel Diallo (u29) so "s2 vs u29"
 *   in App R1 models the walkover.
 *
 * R1 winners (u01–u32): the 32 unseeded/lower-ranked players who won their real
 *   R1 match and therefore entered the 64-player bracket (App R1).
 *
 * Draw structure — 8 sections of 8 players each:
 *   Section A (0–7):  Zverev[1], Davidovich Fokina[28], Cerúndolo[20], Fils[13]
 *   Section B (8–15): Rublev[7], Popyrin[25], Menšík[22], Shelton[12]
 *   Section C (16–23):Fritz[3], Hurkacz[27], Ruud[14], Korda[23]
 *   Section D (24–31):Medvedev[9], FAA[18], Nakashima[31], Rune[8]
 *   Section E (32–39):Draper[5], Berrettini[30], Khachanov[24], Paul[11]
 *   Section F (40–47):Djokovic[4], Humbert[21], Tiafoe[16], Báez[32]
 *   Section G (48–55):de Minaur[6], Shapovalov[29], Musetti[10], Tsitsipas[17]
 *   Section H (56–63):Alcaraz[2], Macháč[19], Dimitrov[15], Lehečka[26]
 *
 * Section winners cascade to:
 *   QF1 = Sections A & B → Cerúndolo[20] def. Menšík[22]
 *   QF2 = Sections C & D → Ruud[14] def. Medvedev[9]
 *   QF3 = Sections E & F → Draper[5] def. Arnaldi
 *   QF4 = Sections G & H → Musetti[10] def. Diallo LL
 *   SF1 = Ruud[14] def. Cerúndolo[20]; SF2 = Draper[5] def. Musetti[10]
 *   Final = Ruud[14] def. Draper[5]  (7–5, 3–6, 6–4)  ← CHAMPION
 */
const p = (id: string, name: string, seed?: number, country?: string): Player => ({
  id, name, ...(seed !== undefined ? { seed } : {}), ...(country ? { country } : {}),
});

// 32 seeds
const s1  = p('s1',  'Alexander Zverev',             1,  'GER');
const s2  = p('s2',  'Carlos Alcaraz',               2,  'ESP'); // withdrew
const s3  = p('s3',  'Taylor Fritz',                 3,  'USA');
const s4  = p('s4',  'Novak Djokovic',               4,  'SRB');
const s5  = p('s5',  'Jack Draper',                  5,  'GBR');
const s6  = p('s6',  'Alex de Minaur',               6,  'AUS');
const s7  = p('s7',  'Andrey Rublev',                7,  'RUS');
const s8  = p('s8',  'Holger Rune',                  8,  'DEN');
const s9  = p('s9',  'Daniil Medvedev',              9,  'RUS');
const s10 = p('s10', 'Lorenzo Musetti',              10, 'ITA');
const s11 = p('s11', 'Tommy Paul',                   11, 'USA');
const s12 = p('s12', 'Ben Shelton',                  12, 'USA');
const s13 = p('s13', 'Arthur Fils',                  13, 'FRA');
const s14 = p('s14', 'Casper Ruud',                  14, 'NOR');
const s15 = p('s15', 'Grigor Dimitrov',              15, 'BUL');
const s16 = p('s16', 'Frances Tiafoe',               16, 'USA');
const s17 = p('s17', 'Stefanos Tsitsipas',           17, 'GRE');
const s18 = p('s18', 'Félix Auger-Aliassime',        18, 'CAN');
const s19 = p('s19', 'Tomáš Macháč',                 19, 'CZE');
const s20 = p('s20', 'Francisco Cerúndolo',          20, 'ARG');
const s21 = p('s21', 'Ugo Humbert',                  21, 'FRA');
const s22 = p('s22', 'Jakub Menšík',                 22, 'CZE');
const s23 = p('s23', 'Sebastian Korda',              23, 'USA');
const s24 = p('s24', 'Karen Khachanov',              24, 'RUS');
const s25 = p('s25', 'Alexei Popyrin',               25, 'AUS');
const s26 = p('s26', 'Jiří Lehečka',                 26, 'CZE');
const s27 = p('s27', 'Hubert Hurkacz',               27, 'POL');
const s28 = p('s28', 'Alejandro Davidovich Fokina',  28, 'ESP');
const s29 = p('s29', 'Denis Shapovalov',             29, 'CAN');
const s30 = p('s30', 'Matteo Berrettini',            30, 'ITA');
const s31 = p('s31', 'Brandon Nakashima',            31, 'USA');
const s32 = p('s32', 'Sebastián Báez',               32, 'ARG');

// 32 R1 winners (unseeded players who advanced from Real R1 to Real R2 = App R1)
const u01 = p('u01', 'Roberto Bautista Agut',    undefined, 'ESP');
const u02 = p('u02', 'Nuno Borges',              undefined, 'POR');
const u03 = p('u03', 'Harold Mayot',             undefined, 'FRA');
const u04 = p('u04', 'Francisco Comesaña',       undefined, 'ARG');
const u05 = p('u05', 'Gaël Monfils',             undefined, 'FRA'); // won R1, withdrew before App R1
const u06 = p('u06', 'Alexander Bublik',         undefined, 'KAZ');
const u07 = p('u07', 'Ethan Quinn',              undefined, 'USA');
const u08 = p('u08', 'Mariano Navone',           undefined, 'ARG');
const u09 = p('u09', 'Christopher O\'Connell',   undefined, 'AUS');
const u10 = p('u10', 'Benjamin Bonzi',           undefined, 'FRA');
const u11 = p('u11', 'Arthur Rinderknech',       undefined, 'FRA');
const u12 = p('u12', 'Federico Cinà',            undefined, 'ITA');
const u13 = p('u13', 'Laslo Đere',               undefined, 'SRB');
const u14 = p('u14', 'Juan Manuel Cerúndolo',    undefined, 'ARG');
const u15 = p('u15', 'Sebastian Ofner',          undefined, 'AUT');
const u16 = p('u16', 'Flavio Cobolli',           undefined, 'ITA');
const u17 = p('u17', 'Tallon Griekspoor',        undefined, 'NED');
const u18 = p('u18', 'Marcos Giron',             undefined, 'USA');
const u19 = p('u19', 'Reilly Opelka',            undefined, 'USA');
const u20 = p('u20', 'João Fonseca',             undefined, 'BRA');
const u21 = p('u21', 'Matteo Arnaldi',           undefined, 'ITA');
const u22 = p('u22', 'Alexandre Müller',         undefined, 'FRA');
const u23 = p('u23', 'Luciano Darderi',          undefined, 'ITA');
const u24 = p('u24', 'Damir Džumhur',            undefined, 'BIH');
const u25 = p('u25', 'Lorenzo Sonego',           undefined, 'ITA');
const u26 = p('u26', 'Kei Nishikori',            undefined, 'JPN');
const u27 = p('u27', 'Tomás Martín Etcheverry',  undefined, 'ARG');
const u28 = p('u28', 'Jan-Lennard Struff',       undefined, 'GER');
const u29 = p('u29', 'Gabriel Diallo',           undefined, 'CAN'); // LL replacing Alcaraz [2]
const u30 = p('u30', 'Jacob Fearnley',           undefined, 'GBR');
const u31 = p('u31', 'Nicolás Jarry',            undefined, 'CHI');
const u32 = p('u32', 'Cameron Norrie',           undefined, 'GBR');

/**
 * Hardcoded 64-player draw for the 2025 Mutua Madrid Open.
 * Positions 2k and 2k+1 form App R1 match k+1.
 * Arrangement exactly mirrors the real ATP bracket section-by-section.
 */
const MADRID_2025_DRAW: Player[] = [
  // ── Section A (0–7): winner → Cerúndolo [20] ──
  s1,  u01, // m1:  Zverev [1]             def. Bautista Agut
  s28, u02, // m2:  Davidovich Fokina [28] def. Borges
  s20, u03, // m3:  Cerúndolo [20]         def. Mayot
  u04, s13, // m4:  Comesaña               def. Fils [13]        ← UPSET

  // ── Section B (8–15): winner → Menšík [22] ──
  s7,  u05, // m5:  Rublev [7]             def. Monfils (walkover)
  u06, s25, // m6:  Bublik                 def. Popyrin [25]     ← UPSET
  s22, u07, // m7:  Menšík [22]            def. Quinn
  s12, u08, // m8:  Shelton [12]           def. Navone

  // ── Section C (16–23): winner → Ruud [14] ──
  s3,  u09, // m9:  Fritz [3]              def. O'Connell
  u10, s27, // m10: Bonzi                  def. Hurkacz [27]     ← UPSET
  s14, u11, // m11: Ruud [14]              def. Rinderknech
  s23, u12, // m12: Korda [23]             def. Cinà

  // ── Section D (24–31): winner → Medvedev [9] ──
  s9,  u13, // m13: Medvedev [9]           def. Đere (walkover)
  u14, s18, // m14: J.M. Cerúndolo         def. Auger-Aliassime [18] ← UPSET
  s31, u15, // m15: Nakashima [31]         def. Ofner
  u16, s8,  // m16: Cobolli                def. Rune [8] (ret.)  ← UPSET

  // ── Section E (32–39): winner → Draper [5] ──
  s5,  u17, // m17: Draper [5]             def. Griekspoor
  s30, u18, // m18: Berrettini [30]        def. Giron
  s24, u19, // m19: Khachanov [24]         def. Opelka
  u20, s11, // m20: Paul [11]              def. Fonseca

  // ── Section F (40–47): winner → Arnaldi ──
  s4,  u21, // m21: Arnaldi                def. Djokovic [4]     ← MAJOR UPSET
  u22, s21, // m22: Müller                 def. Humbert [21]     ← UPSET
  s16, u23, // m23: Tiafoe [16]            def. Darderi
  u24, s32, // m24: Džumhur                def. Báez [32]        ← UPSET

  // ── Section G (48–55): winner → Musetti [10] ──
  s6,  u25, // m25: de Minaur [6]          def. Sonego
  s29, u26, // m26: Shapovalov [29]        def. Nishikori
  s10, u27, // m27: Musetti [10]           def. Etcheverry
  s17, u28, // m28: Tsitsipas [17]         def. Struff

  // ── Section H (56–63): winner → Diallo LL ──
  s2,  u29, // m29: Diallo LL              def. Alcaraz [2] (withdrawal) ← UPSET
  u30, s19, // m30: Fearnley               def. Macháč [19]      ← UPSET
  s15, u31, // m31: Dimitrov [15]          def. Jarry
  u32, s26, // m32: Norrie                 def. Lehečka [26]     ← UPSET
];

/**
 * Returns all 64 bracket participants (32 seeds + 32 R1 winners).
 * The order matches MADRID_2025_DRAW so index i corresponds to draw position i.
 */
export function getMadrid2025Players(): Player[] {
  return [...MADRID_2025_DRAW];
}

/**
 * Generate a deterministic Madrid 2025 bracket from the real ATP draw.
 * The bracket structure is identical on every call — no shuffling.
 */
export function generateTestMadridBracket(): Match[] {
  return buildBracketFromDraw(MADRID_2025_DRAW);
}

// ─── Official Results (Real Match Outcomes) ──────────────────────────────────

/**
 * Canonical key for a match between two players. Order-independent.
 */
function matchKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
}

/**
 * All 63 real match outcomes from the 2025 Mutua Madrid Open.
 * Key = canonical "{lowerPlayerId}|{higherPlayerId}" string.
 * Value = winning player's ID.
 *
 * App round mapping:
 *   App R1 = Real R2  (top seeds' first match)
 *   App R2 = Real R3
 *   App R3 = Real R4  (Round of 16)
 *   App R4 = Real QF
 *   App R5 = Real SF
 *   App R6 = Real Final → Ruud [14] def. Draper [5]  (7–5, 3–6, 6–4)
 */
const REAL_MATCH_WINNERS = new Map<string, string>([
  // ── App R1 (32 matches) ──────────────────────────────────────────────────
  [matchKey('s1',  'u01'), 's1' ], // Zverev def. Bautista Agut
  [matchKey('s28', 'u02'), 's28'], // Davidovich Fokina def. Borges
  [matchKey('s20', 'u03'), 's20'], // Cerúndolo def. Mayot
  [matchKey('s13', 'u04'), 'u04'], // Comesaña def. Fils              [UPSET]
  [matchKey('s7',  'u05'), 's7' ], // Rublev def. Monfils (w/o)
  [matchKey('s25', 'u06'), 'u06'], // Bublik def. Popyrin             [UPSET]
  [matchKey('s22', 'u07'), 's22'], // Menšík def. Quinn
  [matchKey('s12', 'u08'), 's12'], // Shelton def. Navone
  [matchKey('s3',  'u09'), 's3' ], // Fritz def. O'Connell
  [matchKey('s27', 'u10'), 'u10'], // Bonzi def. Hurkacz              [UPSET]
  [matchKey('s14', 'u11'), 's14'], // Ruud def. Rinderknech
  [matchKey('s23', 'u12'), 's23'], // Korda def. Cinà
  [matchKey('s9',  'u13'), 's9' ], // Medvedev def. Đere (w/o)
  [matchKey('s18', 'u14'), 'u14'], // J.M. Cerúndolo def. FAA         [UPSET]
  [matchKey('s31', 'u15'), 's31'], // Nakashima def. Ofner
  [matchKey('s8',  'u16'), 'u16'], // Cobolli def. Rune (ret.)        [UPSET]
  [matchKey('s5',  'u17'), 's5' ], // Draper def. Griekspoor
  [matchKey('s30', 'u18'), 's30'], // Berrettini def. Giron
  [matchKey('s24', 'u19'), 's24'], // Khachanov def. Opelka
  [matchKey('s11', 'u20'), 's11'], // Paul def. Fonseca
  [matchKey('s4',  'u21'), 'u21'], // Arnaldi def. Djokovic           [MAJOR UPSET]
  [matchKey('s21', 'u22'), 'u22'], // Müller def. Humbert             [UPSET]
  [matchKey('s16', 'u23'), 's16'], // Tiafoe def. Darderi
  [matchKey('s32', 'u24'), 'u24'], // Džumhur def. Báez               [UPSET]
  [matchKey('s6',  'u25'), 's6' ], // de Minaur def. Sonego
  [matchKey('s29', 'u26'), 's29'], // Shapovalov def. Nishikori
  [matchKey('s10', 'u27'), 's10'], // Musetti def. Etcheverry
  [matchKey('s17', 'u28'), 's17'], // Tsitsipas def. Struff
  [matchKey('s2',  'u29'), 'u29'], // Diallo def. Alcaraz (withdrawal)[UPSET]
  [matchKey('s19', 'u30'), 'u30'], // Fearnley def. Macháč            [UPSET]
  [matchKey('s15', 'u31'), 's15'], // Dimitrov def. Jarry
  [matchKey('s26', 'u32'), 'u32'], // Norrie def. Lehečka             [UPSET]

  // ── App R2 (16 matches) ──────────────────────────────────────────────────
  [matchKey('s1',  's28'), 's1' ], // Zverev def. Davidovich Fokina
  [matchKey('s20', 'u04'), 's20'], // Cerúndolo def. Comesaña
  [matchKey('s7',  'u06'), 'u06'], // Bublik def. Rublev              [UPSET]
  [matchKey('s12', 's22'), 's22'], // Menšík def. Shelton
  [matchKey('s3',  'u10'), 's3' ], // Fritz def. Bonzi
  [matchKey('s14', 's23'), 's14'], // Ruud def. Korda
  [matchKey('s9',  'u14'), 's9' ], // Medvedev def. J.M. Cerúndolo
  [matchKey('s31', 'u16'), 's31'], // Nakashima def. Cobolli
  [matchKey('s30', 's5' ), 's5' ], // Draper def. Berrettini
  [matchKey('s11', 's24'), 's11'], // Paul def. Khachanov
  [matchKey('u21', 'u22'), 'u21'], // Arnaldi def. Müller
  [matchKey('s16', 'u24'), 's16'], // Tiafoe def. Džumhur
  [matchKey('s29', 's6' ), 's6' ], // de Minaur def. Shapovalov
  [matchKey('s10', 's17'), 's10'], // Musetti def. Tsitsipas
  [matchKey('u29', 'u30'), 'u29'], // Diallo def. Fearnley
  [matchKey('s15', 'u32'), 's15'], // Dimitrov def. Norrie

  // ── App R3 / Round of 16 (8 matches) ─────────────────────────────────────
  [matchKey('s1',  's20'), 's20'], // Cerúndolo def. Zverev           [UPSET]
  [matchKey('s22', 'u06'), 's22'], // Menšík def. Bublik
  [matchKey('s14', 's3' ), 's14'], // Ruud def. Fritz
  [matchKey('s31', 's9' ), 's9' ], // Medvedev def. Nakashima
  [matchKey('s11', 's5' ), 's5' ], // Draper def. Paul
  [matchKey('s16', 'u21'), 'u21'], // Arnaldi def. Tiafoe             [UPSET]
  [matchKey('s10', 's6' ), 's10'], // Musetti def. de Minaur
  [matchKey('s15', 'u29'), 'u29'], // Diallo def. Dimitrov            [UPSET]

  // ── App R4 / QF (4 matches) ──────────────────────────────────────────────
  [matchKey('s20', 's22'), 's20'], // Cerúndolo def. Menšík
  [matchKey('s14', 's9' ), 's14'], // Ruud def. Medvedev
  [matchKey('s5',  'u21'), 's5' ], // Draper def. Arnaldi
  [matchKey('s10', 'u29'), 's10'], // Musetti def. Diallo

  // ── App R5 / SF (2 matches) ──────────────────────────────────────────────
  [matchKey('s14', 's20'), 's14'], // Ruud def. Cerúndolo   (6–4, 7–5)
  [matchKey('s10', 's5' ), 's5' ], // Draper def. Musetti   (6–3, 7–6)

  // ── App R6 / Final (1 match) ─────────────────────────────────────────────
  [matchKey('s14', 's5' ), 's14'], // Ruud def. Draper      (7–5, 3–6, 6–4) ← CHAMPION
]);

/**
 * Return the official winner of a match using the real 2025 Madrid results.
 * Looks up the canonical player-ID pair in REAL_MATCH_WINNERS.
 * Falls back to player1 if the matchup isn't found (should not happen for the
 * test bracket, but prevents null crashes in edge cases).
 */
function getMadrid2025MatchWinner(
  player1: Player | null,
  player2: Player | null,
  _round: number,
): Player | null {
  if (!player1 || !player2) return null;
  const key = matchKey(player1.id, player2.id);
  const winnerId = REAL_MATCH_WINNERS.get(key);
  if (winnerId === player1.id) return player1;
  if (winnerId === player2.id) return player2;
  // Fallback: lower seed wins (covers any match not in the map)
  const s1 = player1.seed ?? 999;
  const s2 = player2.seed ?? 999;
  return s1 <= s2 ? player1 : player2;
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
 * champSeed      — seed this user picks to win the whole tournament.
 * predictedExits — maps seed number → app round in which the user predicts
 *                  that seed is eliminated.  When a seeded player's opponent
 *                  has no seed (unseeded), the default is chalk (lower seed
 *                  wins); setting predictedExits[seed]=R makes that seed's
 *                  opponent (whoever they face in round R) win instead.
 *
 * Expected leaderboard after full 2025 Madrid results applied:
 *   1. ruud-wins    — near-perfect; all real upsets called; Ruud [14] champion
 *   2. draper-wins  — calls most upsets but misses the Final winner
 *   3. medvedev-deep— gets early rounds partially right, goes wrong from QF
 *   4. zverev-wins  — chalk; misses most upsets; Zverev [1] as champion
 *   5. partial      — only R1–R2 chalk picks; incomplete bracket
 */
const PROFILE_CONFIG: Record<
  Exclude<PickProfile, 'partial'>,
  { champSeed: number; predictedExits: Map<number, number> }
> = {
  /**
   * Near-perfect bracket: predicts every real upset and the true champion Ruud [14].
   * Should score highest against the official results.
   */
  'ruud-wins': {
    champSeed: 14,
    predictedExits: new Map([
      // R1 upsets — all 11 correct
      [ 2,  1], [ 4,  1], [ 8,  1], [13,  1], [18,  1],
      [19,  1], [21,  1], [25,  1], [26,  1], [27,  1], [32,  1],
      // R2 upsets — both correct
      [ 7,  2], [12,  2],
      // R3 upsets — all 6 correct
      [ 1,  3], [ 3,  3], [ 6,  3], [11,  3], [15,  3], [16,  3],
      // QF — Medvedev eliminated by Ruud
      [ 9,  4],
      // SF — both correct
      [10,  5], [20,  5],
      // Final handled by champSeed = 14 (Ruud wins)
    ]),
  },

  /**
   * Runner-up picker: correctly calls Ruud's run but picks Draper [5] as champion.
   * Knows all the major upsets including Cerúndolo's run and Arnaldi's.
   */
  'draper-wins': {
    champSeed: 5,
    predictedExits: new Map([
      // R1 — most real upsets called
      [ 2,  1], [ 4,  1], [ 8,  1], [13,  1], [18,  1], [21,  1], [27,  1], [32,  1],
      // R2 — both correct
      [ 7,  2], [12,  2],
      // R3 — all six correct
      [ 1,  3], [ 3,  3], [ 6,  3], [11,  3], [15,  3], [16,  3],
      // QF — Medvedev out
      [ 9,  4],
      // SF — both correct (Ruud beats Cerúndolo; Draper beats Musetti)
      [10,  5], [20,  5],
      // Final: champSeed=5 picks Draper (but real winner = Ruud → miss)
    ]),
  },

  /**
   * Medvedev run: picks Medvedev [9] as champion; gets early rounds only partially
   * right and diverges from QF onwards.
   */
  'medvedev-deep': {
    champSeed: 9,
    predictedExits: new Map([
      // R1 — only the most widely expected exits
      [ 2,  1], [ 4,  1], [ 8,  1], [13,  1],
      // R2 — both correct
      [ 7,  2], [12,  2],
      // R3 — partially correct (de Minaur, Fritz, Paul exits; misses Zverev/Dimitrov/Tiafoe)
      [ 3,  3], [ 6,  3], [11,  3],
      // QF — user calls Ruud exit (Medvedev beats Ruud in user's bracket)
      [14,  4],
      // SF — Zverev exits to Medvedev; Musetti exits to Draper (user anticipates Draper final)
      [ 1,  5], [10,  5],
      // Final: champSeed=9 picks Medvedev to beat Draper (both Ruud facts wrong)
    ]),
  },

  /**
   * Chalk player: always picks the higher-ranked (lower seed number) player.
   * Only calls the most obvious R1 upsets. Picks Zverev [1] to win.
   */
  'zverev-wins': {
    champSeed: 1,
    predictedExits: new Map([
      [ 2,  1], [ 4,  1], [ 8,  1], [13,  1],  // obvious R1 exits only
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
 * @param poolId Pool to update (defaults to the fixed Madrid test pool).
 * @returns The updated pool, or `null` if the pool is not found.
 */
export function updateTestPoolResults(upToRound: number, poolId: string = MADRID_TEST_POOL_ID): Pool | null {
  const pool = getPool(poolId);
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
