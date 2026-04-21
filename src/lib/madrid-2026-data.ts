/**
 * Official 2026 Mutua Madrid Open (ATP Masters 1000) men's singles draw data.
 * Source: protennislive.com/posting/2026/1536/mds.pdf (released 2026-04-20)
 *         ATP official draw table (ATP-data/madrid-bracket.md in this repository)
 *
 * 96-player draw: 32 seeds (all receive first-round byes) + 64 non-seeds.
 * Represented as 128 entries — 64 first-round matches, each with exactly 2 players.
 * Seeds are paired with a literal BYE in Round 1; non-seeds play actual first-round
 * matches against each other. applyByesToBracket() auto-advances all seeded players
 * through their Round-1 byes so Round 2 shows the real first played matches.
 *
 * Round mapping:
 *   App Round 1 → ATP R1 qualifying (seeds auto-advance via BYE)
 *   App Round 2 → ATP R2 (seeds vs R1 winners — first real match for seeds)
 *   App Round 3 → ATP R3
 *   App Round 4 → ATP Round of 16
 *   App Round 5 → ATP Quarterfinals
 *   App Round 6 → ATP Semifinals
 *   App Round 7 → ATP Final / Championship
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

const BYE = (id: string): Player => p(id, 'BYE');
const Q   = (id: string, label: string): Player => p(id, label);

// ─── Official 128-slot draw ──────────────────────────────────────────────────
//
// Slots are ordered per the official ATP draw published 2026-04-20.
// Each consecutive pair (slots[2k], slots[2k+1]) forms one Round-1 match.
// Seeds face BYE and are auto-advanced; non-seeds play real matches.
//
// Section structure (determines QF opponents — each QF is two 16-player sections):
//   QF1: Section A (slots 0–15)  vs Section B (slots 16–31) → Sinner/Paul vs Rublev/de Minaur
//   QF2: Section C (slots 32–47) vs Section D (slots 48–63) → Shelton/Vacherot vs Lehečka/Musetti
//   QF3: Section E (slots 64–79) vs Section F (slots 80–95) → Bublik/Ruud vs Cerúndolo/FAA
//   QF4: Section G (slots 96–111) vs Section H (slots 112–127) → Medvedev/Cobolli vs Khachanov/Zverev

export const MADRID_2026_DRAW: Player[] = [
  // ── Section A (slots 0–15): Sinner / Diallo / Norrie / Paul ─────────────────
  // ATP Match 1
  p('m26s1',  'Jannik Sinner',          1,  'ITA'), BYE('m26bye1'),
  // ATP Match 2
  Q('m26q1',  'Qualifier 1'),           Q('m26q2', 'Qualifier 2'),
  // ATP Match 3
  Q('m26q3',  'Qualifier 3'),           p('m26cina',    'Federico Cinà',       undefined, 'ITA'),
  // ATP Match 4
  p('m26s32', 'Gabriel Diallo',         32, 'CAN'), BYE('m26bye4'),
  // ATP Match 5
  p('m26s19', 'Cameron Norrie',         19, 'GBR'), BYE('m26bye5'),
  // ATP Match 6
  p('m26machac',   'Tomáš Macháč',      undefined, 'CZE'), p('m26comesana', 'Francisco Comesaña', undefined, 'ARG'),
  // ATP Match 7
  p('m26rba',      'Roberto Bautista Agut', undefined, 'ESP'), p('m26tirante', 'Thiago Agustín Tirante', undefined, 'ARG'),
  // ATP Match 8
  p('m26s15', 'Tommy Paul',             15, 'USA'), BYE('m26bye8'),

  // ── Section B (slots 16–31): Rublev / Rinderknech / Fonseca / de Minaur ─────
  // ATP Match 9
  p('m26s9',  'Andrey Rublev',          9,  'RUS'), BYE('m26bye9'),
  // ATP Match 10
  p('m26zhang',  'Zhang Zhizhen',       undefined, 'CHN'), p('m26kopriva',  'Vít Kopřiva',      undefined, 'CZE'),
  // ATP Match 11
  p('m26sonego', 'Lorenzo Sonego',      undefined, 'ITA'), Q('m26q4', 'Qualifier 4'),
  // ATP Match 12
  p('m26s22', 'Arthur Rinderknech',     22, 'FRA'), BYE('m26bye12'),
  // ATP Match 13
  p('m26s27', 'João Fonseca',           27, 'BRA'), BYE('m26bye13'),
  // ATP Match 14
  p('m26bergs',  'Zizou Bergs',         undefined, 'BEL'), p('m26cilic',    'Marin Čilić',      undefined, 'CRO'),
  // ATP Match 15
  p('m26jodar',  'Rafael Jódar',        undefined, 'ESP'), p('m26dejong',   'Jesper de Jong',   undefined, 'NED'),
  // ATP Match 16
  p('m26s5',  'Alex de Minaur',         5,  'AUS'), BYE('m26bye16'),

  // ── Section C (slots 32–47): Shelton / Etcheverry / Fils / Vacherot ──────────
  // ATP Match 17
  p('m26s4',  'Ben Shelton',            4,  'USA'), BYE('m26bye17'),
  // ATP Match 18
  p('m26collignon', 'Raphaël Collignon', undefined, 'BEL'), p('m26berrettini', 'Matteo Berrettini', undefined, 'ITA'),
  // ATP Match 19
  Q('m26q5',  'Qualifier 5'),           p('m26ofner',    'Sebastian Ofner',    undefined, 'AUT'),
  // ATP Match 20
  p('m26s25', 'Tomás Martín Etcheverry', 25, 'ARG'), BYE('m26bye20'),
  // ATP Match 21
  p('m26s21', 'Arthur Fils',            21, 'FRA'), BYE('m26bye21'),
  // ATP Match 22
  p('m26buse',     'Ignacio Buse',       undefined, 'PER'), p('m26mannarino', 'Adrian Mannarino', undefined, 'FRA'),
  // ATP Match 23
  p('m26brooksby', 'Jenson Brooksby',    undefined, 'USA'), p('m26nava',      'Emilio Nava',      undefined, 'USA'),
  // ATP Match 24
  p('m26s14', 'Valentin Vacherot',      14, 'MON'), BYE('m26bye24'),

  // ── Section D (slots 48–63): Lehečka / Michelsen / Griekspoor / Musetti ──────
  // ATP Match 25
  p('m26s11', 'Jiří Lehečka',           11, 'CZE'), BYE('m26bye25'),
  // ATP Match 26
  p('m26tabilo', 'Alejandro Tabilo',    undefined, 'CHI'), p('m26royer',   'Valentin Royer',    undefined, 'FRA'),
  // ATP Match 27
  p('m26muller', 'Alexandre Müller',    undefined, 'FRA'), p('m26struff',  'Jan-Lennard Struff', undefined, 'GER'),
  // ATP Match 28 — Alex Michelsen received the bye vacated by Draper (alternate, non-seeded)
  p('m26sLL', 'Alex Michelsen',         undefined, 'USA'), BYE('m26bye28'),
  // ATP Match 29
  p('m26s29', 'Tallon Griekspoor',      29, 'NED'), BYE('m26bye29'),
  // ATP Match 30
  p('m26dzumhur', 'Damir Džumhur',      undefined, 'BIH'), p('m26bellucci', 'Mattia Bellucci',  undefined, 'ITA'),
  // ATP Match 31
  Q('m26q6',  'Qualifier 6'),           p('m26hurkacz',  'Hubert Hurkacz',     undefined, 'POL'),
  // ATP Match 32
  p('m26s6',  'Lorenzo Musetti',        6,  'ITA'), BYE('m26bye32'),

  // ── Section E (slots 64–79): Bublik / Moutet / Davidovich / Ruud ─────────────
  // ATP Match 33
  p('m26s8',  'Alexander Bublik',       8,  'KAZ'), BYE('m26bye33'),
  // ATP Match 34
  Q('m26q7',  'Qualifier 7'),           p('m26tsitsipas', 'Stefanos Tsitsipas', undefined, 'GRE'),
  // ATP Match 35
  Q('m26q8',  'Qualifier 8'),           Q('m26q9', 'Qualifier 9'),
  // ATP Match 36
  p('m26s26', 'Corentin Moutet',        26, 'FRA'), BYE('m26bye36'),
  // ATP Match 37
  p('m26s20', 'Alejandro Davidovich Fokina', 20, 'ESP'), BYE('m26bye37'),
  // ATP Match 38
  p('m26careno',    'Pablo Carreño Busta', undefined, 'ESP'), p('m26fucsovics', 'Márton Fucsovics', undefined, 'HUN'),
  // ATP Match 39
  p('m26munar',     'Jaume Munar',         undefined, 'ESP'), p('m26shevchenko', 'Alexander Shevchenko', undefined, 'KAZ'),
  // ATP Match 40
  p('m26s12', 'Casper Ruud',            12, 'NOR'), BYE('m26bye40'),

  // ── Section F (slots 80–95): Cerúndolo / Darderi / Nakashima / FAA ───────────
  // ATP Match 41
  p('m26s16', 'Francisco Cerúndolo',    16, 'ARG'), BYE('m26bye41'),
  // ATP Match 42
  p('m26hanfmann', 'Yannick Hanfmann',  undefined, 'GER'), p('m26giron',     'Marcos Giron',      undefined, 'USA'),
  // ATP Match 43
  p('m26altmaier', 'Daniel Altmaier',   undefined, 'GER'), p('m26jmcerundolo', 'Juan Manuel Cerúndolo', undefined, 'ARG'),
  // ATP Match 44
  p('m26s18', 'Luciano Darderi',        18, 'ITA'), BYE('m26bye44'),
  // ATP Match 45
  p('m26s28', 'Brandon Nakashima',      28, 'USA'), BYE('m26bye45'),
  // ATP Match 46
  p('m26vandezandschulp', 'Botic van de Zandschulp', undefined, 'NED'), p('m26blockx', 'Alexander Blockx', undefined, 'BEL'),
  // ATP Match 47
  Q('m26q10', 'Qualifier 10'),          p('m26baez',     'Sebastián Báez',     undefined, 'ARG'),
  // ATP Match 48
  p('m26s3',  'Félix Auger-Aliassime',  3,  'CAN'), BYE('m26bye48'),

  // ── Section G (slots 96–111): Medvedev / Shapovalov / Tien / Cobolli ─────────
  // ATP Match 49
  p('m26s7',  'Daniil Medvedev',        7,  'RUS'), BYE('m26bye49'),
  // ATP Match 50
  p('m26marozsan', 'Fábián Marozsán',   undefined, 'HUN'), p('m26quinn',    'Ethan Quinn',       undefined, 'USA'),
  // ATP Match 51
  Q('m26q11', 'Qualifier 11'),          p('m26opelka',   'Reilly Opelka',     undefined, 'USA'),
  // ATP Match 52
  p('m26s31', 'Denis Shapovalov',       31, 'CAN'), BYE('m26bye52'),
  // ATP Match 53
  p('m26s17', 'Learner Tien',           17, 'USA'), BYE('m26bye53'),
  // ATP Match 54
  Q('m26q12', 'Qualifier 12'),          p('m26dimitrov', 'Grigor Dimitrov',    undefined, 'BUL'),
  // ATP Match 55
  p('m26ugocb',  'Camilo Ugo Carabelli', undefined, 'ARG'), p('m26monfils',  'Gaël Monfils',     undefined, 'FRA'),
  // ATP Match 56
  p('m26s10', 'Flavio Cobolli',         10, 'ITA'), BYE('m26bye56'),

  // ── Section H (slots 112–127): Khachanov / Menšík / Humbert / Zverev ─────────
  // ATP Match 57
  p('m26s13', 'Karen Khachanov',        13, 'RUS'), BYE('m26bye57'),
  // ATP Match 58
  p('m26landaluce', 'Martín Landaluce', undefined, 'ESP'), p('m26walton',   'Adam Walton',       undefined, 'AUS'),
  // ATP Match 59
  p('m26popyrin',   'Alexei Popyrin',   undefined, 'AUS'), Q('m26q13', 'Qualifier 13'),
  // ATP Match 60
  p('m26s23', 'Jakub Menšík',           23, 'CZE'), BYE('m26bye60'),
  // ATP Match 61
  p('m26s30', 'Ugo Humbert',            30, 'FRA'), BYE('m26bye61'),
  // ATP Match 62
  p('m26atmane',     'Térence Atmane',  undefined, 'FRA'), p('m26kecmanovic', 'Miomir Kecmanović', undefined, 'SRB'),
  // ATP Match 63
  p('m26borges',     'Nuno Borges',     undefined, 'POR'), p('m26navone',     'Mariano Navone',    undefined, 'ARG'),
  // ATP Match 64
  p('m26s2',  'Alexander Zverev',       2,  'GER'), BYE('m26bye64'),
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
 * Returns the official 2026 Madrid draw as a 128-entry Player array
 * ready for use with buildBracketFromDraw().  BYE entries are auto-advanced
 * by applyByesToBracket(), placing all 32 seeds into Round 2.
 */
export function getMadrid2026Draw(): Player[] {
  return [...MADRID_2026_DRAW];
}

/**
 * Returns the official 2026 Madrid draw in the format expected by
 * fetchMastersOfficialDrawPlayers — 128 slot objects with name/seed/country.
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
