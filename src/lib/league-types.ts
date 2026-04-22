export interface LeagueMember {
  userId: string;
  userName: string;
  joinedAt: string; // ISO timestamp
}

/**
 * A year-long league grouping multiple tournament pools under one banner.
 * Members compete across all tournaments in the league's year.
 */
export interface League {
  /** 6-char uppercase invite code, doubles as the document ID. */
  id: string;
  name: string;
  /** Short invite code for league join/share. Matches the league ID. */
  joinCode: string;
  description?: string;
  /** Calendar year this league covers (e.g. 2026). */
  year: number;
  /** When true the league only appears in "My Leagues", not in the public browse list. */
  isPrivate: boolean;
  /** Firebase UID of the user who created the league. */
  createdBy: string;
  /** Canonical owner field used by Firestore security rules. */
  ownerId?: string;
  /** Display name of the creator (denormalised for UI convenience). */
  createdByName: string;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  members: LeagueMember[];
  /**
   * Flat list of member UIDs — kept in sync with `members` — enables efficient
   * Firestore `array-contains` queries without exact object matching.
   */
  memberIds: string[];
  /**
   * Maps each tournament ID to the Pool ID that was auto-created for that
   * tournament within this league.  Populated lazily as tournaments approach.
   */
  tournamentPoolIds: Record<string, string>;
}

/** Aggregated standing for one member inside a league. */
export interface LeagueStanding {
  userId: string;
  userName: string;
  totalPoints: number;
  /** Points earned per tournament pool (keyed by pool ID). */
  pointsByPool: Record<string, number>;
  tournamentsPlayed: number;
}
