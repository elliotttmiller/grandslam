import { Player } from './bracket-utils';

export const top32Players = [
  { name: 'Jannik Sinner', country: 'ITA' },
  { name: 'Carlos Alcaraz', country: 'ESP' },
  { name: 'Novak Djokovic', country: 'SRB' },
  { name: 'Daniil Medvedev', country: 'RUS' },
  { name: 'Alexander Zverev', country: 'GER' },
  { name: 'Andrey Rublev', country: 'RUS' },
  { name: 'Holger Rune', country: 'DEN' },
  { name: 'Hubert Hurkacz', country: 'POL' },
  { name: 'Casper Ruud', country: 'NOR' },
  { name: 'Alex de Minaur', country: 'AUS' },
  { name: 'Stefanos Tsitsipas', country: 'GRE' },
  { name: 'Taylor Fritz', country: 'USA' },
  { name: 'Grigor Dimitrov', country: 'BUL' },
  { name: 'Tommy Paul', country: 'USA' },
  { name: 'Karen Khachanov', country: 'RUS' },
  { name: 'Ben Shelton', country: 'USA' },
  { name: 'Ugo Humbert', country: 'FRA' },
  { name: 'Frances Tiafoe', country: 'USA' },
  { name: 'Sebastian Baez', country: 'ARG' },
  { name: 'Alexander Bublik', country: 'KAZ' },
  { name: 'Adrian Mannarino', country: 'FRA' },
  { name: 'Francisco Cerundolo', country: 'ARG' },
  { name: 'A. Davidovich Fokina', country: 'ESP' },
  { name: 'Jan-Lennard Struff', country: 'GER' },
  { name: 'Lorenzo Musetti', country: 'ITA' },
  { name: 'Tallon Griekspoor', country: 'NED' },
  { name: 'Cameron Norrie', country: 'GBR' },
  { name: 'T. Martin Etcheverry', country: 'ARG' },
  { name: 'Felix Auger-Aliassime', country: 'CAN' },
  { name: 'Jiri Lehecka', country: 'CZE' },
  { name: 'Sebastian Korda', country: 'USA' },
  { name: 'Christopher Eubanks', country: 'USA' },
];

export function generatePlayers(tournamentName: string): Player[] {
  const players: Player[] = [];
  
  // Add top 32 seeds
  for (let i = 0; i < 32; i++) {
    players.push({
      id: `p${i + 1}`,
      name: top32Players[i].name,
      seed: i + 1,
      country: top32Players[i].country,
    });
  }
  
  // Add 96 unseeded players
  for (let i = 32; i < 128; i++) {
    players.push({
      id: `p${i + 1}`,
      name: `Qualifier / Unseeded ${i - 31}`,
    });
  }
  
  return players;
}

export const tournaments = [
  { id: 'ao', name: 'Australian Open', color: 'bg-blue-500', logo: '/logos/Australian-Open-Logo-360x225.svg' },
  { id: 'rg', name: 'French Open', color: 'bg-orange-600', logo: '/logos/Roland-Garros-Logo-1536x960.svg' },
  { id: 'wim', name: 'Wimbledon', color: 'bg-green-700', logo: '/logos/Wimbledon-Logo.svg' },
  { id: 'uso', name: 'US Open', color: 'bg-blue-700', logo: '/logos/US-Open-logo.svg' },
];
