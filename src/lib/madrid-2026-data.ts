/**
 * Official 2026 Mutua Madrid Open (ATP Masters 1000) men's singles draw data.
 * Source: protennislive.com/posting/2026/1536/mds.pdf (released 2026-04-20)
 *         Wikipedia – 2026 Mutua Madrid Open – Men's singles
 *         tennisuptodate.com – Madrid Open ATP 2026 draw
 *
 * 96-player draw with 32 seeds (all receive first-round byes).
 * Represented as 64 entries for the app's bracket engine.
 *
 * Notable: Carlos Alcaraz (ATP #2), Novak Djokovic (ATP #4), Taylor Fritz (ATP #7),
 * Frances Tiafoe (ATP #19), and Jack Draper (seed 24) all withdrew before the draw.
 * Alex Michelsen (ATP #37) received the bye vacated by Draper.
 */

import type { Player } from './bracket-utils';

// ─── Helper ─────────────────────────────────────────────────────────────────

const p = (id: string, name: string, seed?: number, country?: string): Player => ({
  id,
  name,
  ...(seed !== undefined ? { seed } : {}),
  ...(country ? { country } : {}),
});

/** Creates a "Winner: A vs B" placeholder for an unplayed first-round match. */
const w = (id: string, a: string, b: string): Player =>
  p(id, `Winner: ${a} vs ${b}`);

// Qualifier placeholders are numbered to match the official Madrid 2026 draw structure.
// This makes the hardcoded bracket easier to validate against the published bracket.

// ─── Seeds (32) ──────────────────────────────────────────────────────────────

const s1  = p('m26s1',  'Jannik Sinner',               1,  'ITA');
const s2  = p('m26s2',  'Alexander Zverev',             2,  'GER');
const s3  = p('m26s3',  'Félix Auger-Aliassime',        3,  'CAN');
const s4  = p('m26s4',  'Ben Shelton',                  4,  'USA');
const s5  = p('m26s5',  'Alex de Minaur',               5,  'AUS');
const s6  = p('m26s6',  'Lorenzo Musetti',              6,  'ITA');
const s7  = p('m26s7',  'Daniil Medvedev',              7,  'RUS');
const s8  = p('m26s8',  'Alexander Bublik',             8,  'KAZ');
const s9  = p('m26s9',  'Andrey Rublev',                9,  'RUS');
const s10 = p('m26s10', 'Flavio Cobolli',              10,  'ITA');
const s11 = p('m26s11', 'Jiří Lehečka',                11,  'CZE');
const s12 = p('m26s12', 'Casper Ruud',                 12,  'NOR');
const s13 = p('m26s13', 'Karen Khachanov',             13,  'RUS');
const s14 = p('m26s14', 'Valentin Vacherot',           14,  'MON');
const s15 = p('m26s15', 'Tommy Paul',                  15,  'USA');
const s16 = p('m26s16', 'Francisco Cerúndolo',         16,  'ARG');
const s17 = p('m26s17', 'Learner Tien',                17,  'USA');
const s18 = p('m26s18', 'Luciano Darderi',             18,  'ITA');
const s19 = p('m26s19', 'Cameron Norrie',              19,  'GBR');
const s20 = p('m26s20', 'Alejandro Davidovich Fokina', 20,  'ESP');
const s21 = p('m26s21', 'Arthur Fils',                 21,  'FRA');
const s22 = p('m26s22', 'Arthur Rinderknech',          22,  'FRA');
const s23 = p('m26s23', 'Jakub Menšík',                23,  'CZE');
// Seed 24 (Jack Draper) withdrew; Alex Michelsen (ATP #37) received the bye
const sMichelsen = p('m26sLL', 'Alex Michelsen',       undefined, 'USA');
const s25 = p('m26s25', 'Tomás Martín Etcheverry',     25,  'ARG');
const s26 = p('m26s26', 'Corentin Moutet',             26,  'FRA');
const s27 = p('m26s27', 'João Fonseca',                27,  'BRA');
const s28 = p('m26s28', 'Brandon Nakashima',           28,  'USA');
const s29 = p('m26s29', 'Tallon Griekspoor',           29,  'NED');
const s30 = p('m26s30', 'Ugo Humbert',                 30,  'FRA');
const s31 = p('m26s31', 'Denis Shapovalov',            31,  'CAN');
const s32 = p('m26s32', 'Gabriel Diallo',              32,  'CAN');

// ─── First-round opponent placeholders ───────────────────────────────────────
// "Winner: A vs B" — the two non-seeded players whose R1 match winner will face the adjacent seed.
// Q = qualifier (qualifying draw completed 2026-04-20/21; actual names mapped where known).

// Section A
const w1a = w('m26w1a', 'Q1', 'Q2');                                            // Sinner's R1 opponent
const w2a = w('m26w2a', 'Q3', 'Federico Cinà');                                   // Diallo's R1 opponent
const w3a = w('m26w3a', 'Tomáš Macháč', 'Francisco Comesaña');                   // Norrie's R1 opponent
const w4a = w('m26w4a', 'Roberto Bautista Agut', 'Thiago Agustín Tirante');      // Paul's R1 opponent

// Section B
const w1b = w('m26w1b', 'Zhang Zhizhen', 'Vít Kopřiva');                         // Rublev's R1 opponent
const w2b = w('m26w2b', 'Lorenzo Sonego', 'Q4');                                 // Rinderknech's R1 opponent
const w3b = w('m26w3b', 'Zizou Bergs', 'Marin Čilić');                           // Fonseca's R1 opponent
const w4b = w('m26w4b', 'Rafael Jódar', 'Jesper de Jong');                       // de Minaur's R1 opponent

// Section C
const w1c = w('m26w1c', 'Raphaël Collignon', 'Matteo Berrettini');               // Shelton's R1 opponent
const w2c = w('m26w2c', 'Q5', 'Sebastian Ofner');                                // Etcheverry's R1 opponent
const w3c = w('m26w3c', 'Ignacio Buse', 'Adrian Mannarino');                     // Fils's R1 opponent
const w4c = w('m26w4c', 'Jenson Brooksby', 'Emilio Nava');                       // Vacherot's R1 opponent

// Section D
const w1d = w('m26w1d', 'Alejandro Tabilo', 'Valentin Royer');                   // Lehečka's R1 opponent
const w2d = w('m26w2d', 'Alexandre Müller', 'Jan-Lennard Struff');               // Michelsen's R1 opponent
const w3d = w('m26w3d', 'Damir Džumhur', 'Mattia Bellucci');                     // Griekspoor's R1 opponent
const w4d = w('m26w4d', 'Q6', 'Hubert Hurkacz');                                  // Musetti's R1 opponent

// Section E
const w1e = w('m26w1e', 'Q7', 'Stefanos Tsitsipas');                              // Bublik's R1 opponent
const w2e = w('m26w2e', 'Q8', 'Q9');                                              // Moutet's R1 opponent
const w3e = w('m26w3e', 'Pablo Carreño Busta', 'Márton Fucsovics');              // Davidovich Fokina's R1 opponent
const w4e = w('m26w4e', 'Jaume Munar', 'Alexander Shevchenko');                  // Ruud's R1 opponent

// Section F
const w1f = w('m26w1f', 'Yannick Hanfmann', 'Marcos Giron');                     // Cerúndolo's R1 opponent
const w2f = w('m26w2f', 'Daniel Altmaier', 'Juan Manuel Cerúndolo');             // Darderi's R1 opponent
const w3f = w('m26w3f', 'Botic van de Zandschulp', 'Alexander Blockx');          // Nakashima's R1 opponent
const w4f = w('m26w4f', 'Q10', 'Sebastián Báez');                                 // Auger-Aliassime's R1 opponent

// Section G
const w1g = w('m26w1g', 'Fábián Marozsán', 'Ethan Quinn');                       // Medvedev's R1 opponent
const w2g = w('m26w2g', 'Q11', 'Reilly Opelka');                                 // Shapovalov's R1 opponent
const w3g = w('m26w3g', 'Q12', 'Grigor Dimitrov');                                // Tien's R1 opponent
const w4g = w('m26w4g', 'Camilo Ugo Carabelli', 'Gaël Monfils');                 // Cobolli's R1 opponent

// Section H
const w1h = w('m26w1h', 'Martín Landaluce', 'Adam Walton');                      // Khachanov's R1 opponent
const w2h = w('m26w2h', 'Alexei Popyrin', 'Q13');                                 // Menšík's R1 opponent
const w3h = w('m26w3h', 'Térence Atmane', 'Miomir Kecmanović');                  // Humbert's R1 opponent
const w4h = w('m26w4h', 'Nuno Borges', 'Mariano Navone');                        // Zverev's R1 opponent

// ─── Official 64-slot draw ───────────────────────────────────────────────────
//
// Each consecutive pair (draw[2k], draw[2k+1]) forms one Round-1 match:
//   draw[2k]   = seed with first-round bye
//   draw[2k+1] = "Winner: A vs B" placeholder (R1 match the seed faces in Round 2)
//
// Section structure (determines QF opponents):
//   QF1: Section A winner vs Section B winner  → Sinner/Paul side vs Rublev/de Minaur side
//   QF2: Section C winner vs Section D winner  → Shelton/Vacherot side vs Lehečka/Musetti side
//   QF3: Section E winner vs Section F winner  → Bublik/Ruud side vs Cerúndolo/FAA side
//   QF4: Section G winner vs Section H winner  → Medvedev/Cobolli side vs Khachanov/Zverev side

export const MADRID_2026_DRAW: Player[] = [
  // ── Section A (slots 0–7): QF → Sinner/Paul side vs Rublev/de Minaur side ──
  s1,  w1a, // m1:  Sinner [1]               vs Winner(Q vs Q)
  s32, w2a, // m2:  Diallo [32]              vs Winner(Q vs Federico Cinà)
  s19, w3a, // m3:  Norrie [19]              vs Winner(Macháč vs Comesaña)
  s15, w4a, // m4:  Paul [15]                vs Winner(Bautista Agut vs Tirante)

  // ── Section B (slots 8–15) ──────────────────────────────────────────────────
  s9,  w1b, // m5:  Rublev [9]               vs Winner(Zhang vs Kopřiva)
  s22, w2b, // m6:  Rinderknech [22]         vs Winner(Sonego vs Q)
  s27, w3b, // m7:  Fonseca [27]             vs Winner(Bergs vs Čilić)
  s5,  w4b, // m8:  de Minaur [5]            vs Winner(Jódar vs de Jong)

  // ── Section C (slots 16–23): QF → Shelton/Vacherot side vs Lehečka/Musetti side ──
  s4,  w1c, // m9:  Shelton [4]              vs Winner(Collignon vs Berrettini)
  s25, w2c, // m10: Etcheverry [25]          vs Winner(Q vs Ofner)
  s21, w3c, // m11: Fils [21]                vs Winner(Buse vs Mannarino)
  s14, w4c, // m12: Vacherot [14]            vs Winner(Brooksby vs Nava)

  // ── Section D (slots 24–31) ─────────────────────────────────────────────────
  s11,       w1d, // m13: Lehečka [11]       vs Winner(Tabilo vs Royer)
  sMichelsen, w2d, // m14: Michelsen (alt)   vs Winner(Müller vs Struff)
  s29,       w3d, // m15: Griekspoor [29]    vs Winner(Džumhur vs Bellucci)
  s6,        w4d, // m16: Musetti [6]         vs Winner(Q vs Hurkacz)

  // ── Section E (slots 32–39): QF → Bublik/Ruud side vs Cerúndolo/FAA side ──
  s8,  w1e, // m17: Bublik [8]               vs Winner(Q vs Tsitsipas)
  s26, w2e, // m18: Moutet [26]              vs Winner(Q vs Q)
  s20, w3e, // m19: Davidovich Fokina [20]   vs Winner(Carreño Busta vs Fucsovics)
  s12, w4e, // m20: Ruud [12]                vs Winner(Munar vs Shevchenko)

  // ── Section F (slots 40–47) ─────────────────────────────────────────────────
  s16, w1f, // m21: Cerúndolo [16]           vs Winner(Hanfmann vs Giron)
  s18, w2f, // m22: Darderi [18]             vs Winner(Altmaier vs J.M. Cerúndolo)
  s28, w3f, // m23: Nakashima [28]           vs Winner(Van de Zandschulp vs Blockx)
  s3,  w4f, // m24: Auger-Aliassime [3]      vs Winner(Q vs Báez)

  // ── Section G (slots 48–55): QF → Medvedev/Cobolli side vs Khachanov/Zverev side ──
  s7,  w1g, // m25: Medvedev [7]             vs Winner(Marozsán vs Quinn)
  s31, w2g, // m26: Shapovalov [31]          vs Winner(Q vs Opelka)
  s17, w3g, // m27: Tien [17]               vs Winner(Q vs Dimitrov)
  s10, w4g, // m28: Cobolli [10]             vs Winner(Ugo Carabelli vs Monfils)

  // ── Section H (slots 56–63) ─────────────────────────────────────────────────
  s13, w1h, // m29: Khachanov [13]           vs Winner(Landaluce vs Walton)
  s23, w2h, // m30: Menšík [23]              vs Winner(Popyrin vs Q)
  s30, w3h, // m31: Humbert [30]             vs Winner(Atmane vs Kecmanović)
  s2,  w4h, // m32: Zverev [2]               vs Winner(Borges vs Navone)
];

/**
 * The official top-32 seedings for the 2026 Mutua Madrid Open (as of 2026-04-20).
 * Carlos Alcaraz (ATP #2), Novak Djokovic (ATP #4), Taylor Fritz (ATP #7),
 * Frances Tiafoe (ATP #19), and Jack Draper (ATP #26) all withdrew pre-draw.
 * Seedings were resequenced accordingly.
 */
export const MADRID_2026_SEEDS = [
  { seed:  1, name: 'Jannik Sinner',               country: 'ITA', ranking:  1 },
  { seed:  2, name: 'Alexander Zverev',             country: 'GER', ranking:  3 },
  { seed:  3, name: 'Félix Auger-Aliassime',        country: 'CAN', ranking:  5 },
  { seed:  4, name: 'Ben Shelton',                  country: 'USA', ranking:  6 },
  { seed:  5, name: 'Alex de Minaur',               country: 'AUS', ranking:  8 },
  { seed:  6, name: 'Lorenzo Musetti',              country: 'ITA', ranking:  9 },
  { seed:  7, name: 'Daniil Medvedev',              country: 'RUS', ranking: 10 },
  { seed:  8, name: 'Alexander Bublik',             country: 'KAZ', ranking: 11 },
  { seed:  9, name: 'Andrey Rublev',                country: 'RUS', ranking: 12 },
  { seed: 10, name: 'Flavio Cobolli',               country: 'ITA', ranking: 13 },
  { seed: 11, name: 'Jiří Lehečka',                 country: 'CZE', ranking: 14 },
  { seed: 12, name: 'Casper Ruud',                  country: 'NOR', ranking: 15 },
  { seed: 13, name: 'Karen Khachanov',              country: 'RUS', ranking: 16 },
  { seed: 14, name: 'Valentin Vacherot',            country: 'MON', ranking: 17 },
  { seed: 15, name: 'Tommy Paul',                   country: 'USA', ranking: 18 },
  { seed: 16, name: 'Francisco Cerúndolo',          country: 'ARG', ranking: 20 },
  { seed: 17, name: 'Learner Tien',                 country: 'USA', ranking: 21 },
  { seed: 18, name: 'Luciano Darderi',              country: 'ITA', ranking: 22 },
  { seed: 19, name: 'Cameron Norrie',               country: 'GBR', ranking: 23 },
  { seed: 20, name: 'Alejandro Davidovich Fokina',  country: 'ESP', ranking: 24 },
  { seed: 21, name: 'Arthur Fils',                  country: 'FRA', ranking: 25 },
  { seed: 22, name: 'Arthur Rinderknech',           country: 'FRA', ranking: 26 },
  { seed: 23, name: 'Jakub Menšík',                 country: 'CZE', ranking: 27 },
  { seed: 24, name: 'Jack Draper',                  country: 'GBR', ranking: 28 }, // withdrew (knee injury)
  { seed: 25, name: 'Tomás Martín Etcheverry',      country: 'ARG', ranking: 29 },
  { seed: 26, name: 'Corentin Moutet',              country: 'FRA', ranking: 30 },
  { seed: 27, name: 'João Fonseca',                 country: 'BRA', ranking: 31 },
  { seed: 28, name: 'Brandon Nakashima',            country: 'USA', ranking: 32 },
  { seed: 29, name: 'Tallon Griekspoor',            country: 'NED', ranking: 33 },
  { seed: 30, name: 'Ugo Humbert',                  country: 'FRA', ranking: 34 },
  { seed: 31, name: 'Denis Shapovalov',             country: 'CAN', ranking: 35 },
  { seed: 32, name: 'Gabriel Diallo',               country: 'CAN', ranking: 36 },
];

/**
 * Returns the official 2026 Madrid draw as a 64-entry Player array
 * ready for use with buildBracketFromDraw().
 */
export function getMadrid2026Draw(): Player[] {
  return [...MADRID_2026_DRAW];
}

/**
 * Returns the official 2026 Madrid draw in the format expected by
 * fetchMastersOfficialDrawPlayers — 64 slot objects with name/seed/country.
 */
export function getMadrid2026OfficialDrawSlots(): Array<{ name: string; seed?: number; country?: string }> {
  return MADRID_2026_DRAW.map((player) => ({
    name: player.name,
    seed: player.seed,
    country: player.country,
  }));
}

/**
 * Returns the official 2026 Madrid seedings (top 16) for display in the
 * MastersTournamentModal, matching the MastersSeededPlayer interface.
 */
export function getMadrid2026Seedings(): Array<{ seed: number; name: string; country: string; ranking?: number }> {
  return MADRID_2026_SEEDS.slice(0, 16);
}
