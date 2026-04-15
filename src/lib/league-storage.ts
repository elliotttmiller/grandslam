import type { League, LeagueMember } from './league-types';
import { authGetItem, authSetItem } from './auth-storage';

export const LEAGUES_STORAGE_KEY = 'gs_leagues_v1';

/** Length of the league invite code (same convention as pool codes). */
export const LEAGUE_CODE_LENGTH = 6;

function generateLeagueCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export function getLeagues(): League[] {
  try {
    const raw = authGetItem(LEAGUES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as League[];
  } catch {
    return [];
  }
}

export function getLeague(id: string): League | null {
  return getLeagues().find(l => l.id === id) ?? null;
}

export function saveLeague(league: League): void {
  const leagues = getLeagues();
  const idx = leagues.findIndex(l => l.id === league.id);
  if (idx >= 0) {
    leagues[idx] = league;
  } else {
    leagues.push(league);
  }
  authSetItem(LEAGUES_STORAGE_KEY, JSON.stringify(leagues));
}

export function deleteLeague(leagueId: string): void {
  const leagues = getLeagues().filter(l => l.id !== leagueId);
  authSetItem(LEAGUES_STORAGE_KEY, JSON.stringify(leagues));
}

export function createLeague(
  name: string,
  description: string,
  year: number,
  isPrivate: boolean,
  createdBy: string,
  createdByName: string,
): League {
  const league: League = {
    id: generateLeagueCode(),
    name,
    description: description || undefined,
    year,
    isPrivate,
    createdBy,
    createdByName,
    createdAt: new Date().toISOString(),
    members: [{ userId: createdBy, userName: createdByName, joinedAt: new Date().toISOString() }],
    memberIds: [createdBy],
    tournamentPoolIds: {},
  };
  saveLeague(league);
  return league;
}

export function addMember(leagueId: string, member: LeagueMember): boolean {
  const league = getLeague(leagueId);
  if (!league) return false;
  if (league.members.some(m => m.userId === member.userId)) return false; // already a member
  league.members.push(member);
  league.memberIds = [...new Set([...(league.memberIds ?? []), member.userId])];
  saveLeague(league);
  return true;
}

export function removeMember(leagueId: string, userId: string): void {
  const league = getLeague(leagueId);
  if (!league) return;
  league.members = league.members.filter(m => m.userId !== userId);
  league.memberIds = (league.memberIds ?? []).filter(id => id !== userId);
  saveLeague(league);
}

/** Register a pool for a specific tournament inside a league. */
export function setLeaguePool(leagueId: string, tournamentId: string, poolId: string): void {
  const league = getLeague(leagueId);
  if (!league) return;
  league.tournamentPoolIds[tournamentId] = poolId;
  saveLeague(league);
}

/** Returns all leagues where the given user is a member. */
export function getLeaguesByUser(userId: string): League[] {
  return getLeagues().filter(l => l.members.some(m => m.userId === userId));
}

/** Returns all leagues created by the given user. */
export function getLeaguesByCreator(userId: string): League[] {
  return getLeagues().filter(l => l.createdBy === userId);
}
