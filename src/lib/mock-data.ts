import { Player } from './bracket-utils';

export function generatePlayers(tournamentName: string): Player[] {
  const players: Player[] = [];
  
  // Add 128 placeholder players
  for (let i = 0; i < 128; i++) {
    players.push({
      id: `p${i + 1}`,
      name: `TBD Player ${i + 1}`,
    });
  }
  
  return players;
}
