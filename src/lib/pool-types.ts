import type { Match } from './bracket-utils';

export interface PoolEntry {
  id: string;
  userName: string;
  bracketName: string;
  matches: Match[];
  tiebreakerGames?: number;
  tiebreakerSets?: number;
  submittedAt?: string;
  isSubmitted: boolean;
}

export interface Pool {
  id: string;
  name: string;
  tournamentId: string;
  tournamentName: string;
  createdAt: string;
  officialMatches: Match[];
  entries: PoolEntry[];
}
