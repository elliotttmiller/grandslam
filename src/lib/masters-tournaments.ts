/**
 * Static ATP Masters 1000 men's singles tournament list for 2026.
 * Dates mirror ATP overview pages and are used as UI/default fallback values.
 */

export interface MastersTournament {
  id: string;
  name: string;
  shortName: string;
  location: string;
  country: string;
  surface: 'Hard' | 'Clay' | 'Indoor Hard' | 'Grass';
  /** Start date in YYYY-MM-DD format */
  approxStart: string;
  /** End date in YYYY-MM-DD format */
  approxEnd: string;
}

export const MASTERS_TOURNAMENTS: MastersTournament[] = [
  {
    id: 'indian-wells',
    name: 'BNP Paribas Open (Indian Wells)',
    shortName: 'Indian Wells',
    location: 'Indian Wells, California, USA',
    country: 'USA',
    surface: 'Hard',
    approxStart: '2026-03-04',
    approxEnd: '2026-03-15',
  },
  {
    id: 'miami',
    name: 'Miami Open',
    shortName: 'Miami Open',
    location: 'Miami, Florida, USA',
    country: 'USA',
    surface: 'Hard',
    approxStart: '2026-03-18',
    approxEnd: '2026-03-29',
  },
  {
    id: 'monte-carlo',
    name: 'Rolex Monte-Carlo Masters',
    shortName: 'Monte-Carlo',
    location: 'Monte-Carlo, Monaco',
    country: 'MON',
    surface: 'Clay',
    approxStart: '2026-04-05',
    approxEnd: '2026-04-12',
  },
  {
    id: 'madrid',
    name: 'Mutua Madrid Open',
    shortName: 'Madrid',
    location: 'Madrid, Spain',
    country: 'ESP',
    surface: 'Clay',
    approxStart: '2026-04-22',
    approxEnd: '2026-05-03',
  },
  {
    id: 'rome',
    name: "Internazionali BNL d'Italia (Rome)",
    shortName: 'Rome',
    location: 'Rome, Italy',
    country: 'ITA',
    surface: 'Clay',
    approxStart: '2026-05-06',
    approxEnd: '2026-05-17',
  },
  {
    id: 'canada',
    name: 'National Bank Open (Canada)',
    shortName: 'Canada',
    // Alternates between Montréal (even years) and Toronto (odd years); 2026 is in Montréal
    location: 'Montréal, Canada',
    country: 'CAN',
    surface: 'Hard',
    approxStart: '2026-08-02',
    approxEnd: '2026-08-13',
  },
  {
    id: 'cincinnati',
    name: 'Western & Southern Open (Cincinnati)',
    shortName: 'Cincinnati',
    location: 'Cincinnati, Ohio, USA',
    country: 'USA',
    surface: 'Hard',
    approxStart: '2026-08-13',
    approxEnd: '2026-08-23',
  },
  {
    id: 'shanghai',
    name: 'Rolex Shanghai Masters',
    shortName: 'Shanghai',
    location: 'Shanghai, China',
    country: 'CHN',
    surface: 'Hard',
    approxStart: '2026-10-07',
    approxEnd: '2026-10-18',
  },
  {
    id: 'paris',
    name: 'Rolex Paris Masters',
    shortName: 'Paris',
    location: 'Paris, France',
    country: 'FRA',
    surface: 'Indoor Hard',
    approxStart: '2026-11-02',
    approxEnd: '2026-11-08',
  },
];

export function getMastersTournamentById(id: string): MastersTournament | undefined {
  return MASTERS_TOURNAMENTS.find(t => t.id === id);
}

export interface GrandSlamStaticInfo {
  id: string;
  shortName: string;
  location: string;
  country: string;
  surface: 'Hard' | 'Clay' | 'Grass';
}

/** Static metadata for the four Grand Slam tournaments. */
export const GRAND_SLAM_STATIC_INFO: GrandSlamStaticInfo[] = [
  { id: 'ao',  shortName: 'Australian Open', location: 'Melbourne, Australia',   country: 'AUS', surface: 'Hard'  },
  { id: 'rg',  shortName: 'Roland Garros',   location: 'Paris, France',          country: 'FRA', surface: 'Clay'  },
  { id: 'wim', shortName: 'Wimbledon',        location: 'London, United Kingdom', country: 'GBR', surface: 'Grass' },
  { id: 'uso', shortName: 'US Open',          location: 'New York, USA',          country: 'USA', surface: 'Hard'  },
];

/** Surface colour token (Tailwind class string) */
export function surfaceColor(surface: MastersTournament['surface']): string {
  switch (surface) {
    case 'Clay':         return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    case 'Hard':         return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'Indoor Hard':  return 'text-violet-400 bg-violet-500/10 border-violet-500/20';
    case 'Grass':        return 'text-green-400 bg-green-500/10 border-green-500/20';
  }
}
