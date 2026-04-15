import type { Match } from './bracket-utils';

export interface PoolEntry {
  id: string;
  /** Persistent device-local user identifier (see user-identity.ts). */
  userId?: string;
  userName: string;
  bracketName: string;
  matches: Match[];
  tiebreakerGames?: number;
  tiebreakerSets?: number;
  submittedAt?: string;
  isSubmitted: boolean;
  /** ISO timestamp of last modification; used for last-write-wins conflict resolution. */
  updatedAt?: string;
}

export interface Pool {
  id: string;
  name: string;
  tournamentId: string;
  tournamentName: string;
  createdAt: string;
  officialMatches: Match[];
  entries: PoolEntry[];
  /** Persistent device-local user identifier of the pool creator. */
  createdBy?: string;
  /** ISO timestamp of last server-side modification. */
  updatedAt?: string;
  /** League ID this pool belongs to, if it was auto-created for a league. */
  leagueId?: string;
}
