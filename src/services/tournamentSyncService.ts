import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, getAuth } from '@/lib/firebase';
import type { Match } from '@/lib/bracket-utils';

function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)]),
    ) as T;
  }
  return obj;
}

export interface TournamentState {
  tournamentId: string;
  tournamentName: string;
  officialMatches: Match[];
  drawStatus?: 'official' | 'predicted';
  lastRefreshedAt?: string;
  ownerId?: string;
  updatedAt?: string;
}

export interface ScraperStatus {
  tournamentId: string;
  tournamentName?: string;
  requestedBy: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  requestedAt: string;
  updatedAt?: string;
  message?: string;
}

export async function syncGetTournamentState(tournamentId: string): Promise<TournamentState | null> {
  try {
    const snap = await getDoc(doc(getDb(), 'tournaments', tournamentId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      ...(data as TournamentState),
      updatedAt: data['updatedAt']?.toDate?.()?.toISOString() ?? data['updatedAt'],
    };
  } catch (error) {
    console.error('Failed to fetch tournament state:', error);
    return null;
  }
}

export async function syncUpsertTournamentState(
  tournamentId: string,
  tournamentName: string,
  officialMatches: Match[],
  drawStatus: 'official' | 'predicted' = 'predicted',
): Promise<boolean> {
  try {
    const user = getAuth().currentUser;
    if (!user) {
      console.warn('Cannot upsert tournament state: user is not signed in.');
      return false;
    }

    const tournamentDoc = doc(getDb(), 'tournaments', tournamentId);
    const payload: TournamentState = {
      tournamentId,
      tournamentName,
      officialMatches: removeUndefined(officialMatches),
      drawStatus,
      lastRefreshedAt: new Date().toISOString(),
      ownerId: user.uid,
    };

    await setDoc(tournamentDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Failed to upsert tournament state:', error);
    return false;
  }
}

export function subscribeToTournamentState(
  tournamentId: string,
  onUpdate: (state: TournamentState | null) => void,
  canReadTournamentState: boolean,
): () => void {
  if (!canReadTournamentState) {
    return () => {}; // don't subscribe until the user is properly authenticated
  }
  const ref = doc(getDb(), 'tournaments', tournamentId);
  const unsubscribe = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onUpdate(null);
      return;
    }
    const data = snap.data();
    onUpdate({
      ...(data as TournamentState),
      updatedAt: data['updatedAt']?.toDate?.()?.toISOString() ?? data['updatedAt'],
    });
  }, (error) => {
    console.warn('Tournament state snapshot error:', error);
  });
  return unsubscribe;
}

export async function syncWriteScraperStatus(
  tournamentId: string,
  tournamentName: string,
  status: 'pending' | 'running' | 'complete' | 'failed',
  message?: string,
): Promise<boolean> {
  try {
    const user = getAuth().currentUser;
    if (!user) {
      console.warn('Cannot write scraper status: user is not signed in.');
      return false;
    }

    const statusDoc = doc(getDb(), 'system', `scraper_status_${tournamentId}`);
    const payload: ScraperStatus = {
      tournamentId,
      tournamentName,
      requestedBy: user.uid,
      status,
      requestedAt: new Date().toISOString(),
      message,
    };

    await setDoc(statusDoc, {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Failed to write scraper status:', error);
    return false;
  }
}

export async function requestTournamentRefresh(
  tournamentId: string,
  tournamentName: string,
): Promise<boolean> {
  try {
    const user = getAuth().currentUser;
    if (!user) {
      console.warn('Cannot request tournament refresh: user is not signed in.');
      return false;
    }

    const requestDoc = doc(getDb(), 'system', `refresh_request_${tournamentId}`);
    const existing = await getDoc(requestDoc);
    const currentStatus = existing.exists() ? existing.data()?.status : null;

    if (currentStatus === 'pending' || currentStatus === 'running') {
      return true;
    }

    await setDoc(requestDoc, {
      tournamentId,
      tournamentName,
      requestedBy: user.uid,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
      message: 'Refresh requested by user.',
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Failed to request tournament refresh:', error);
    return false;
  }
}

export function subscribeToScraperStatus(
  tournamentId: string,
  onUpdate: (status: ScraperStatus | null) => void,
): () => void {
  const ref = doc(getDb(), 'system', `scraper_status_${tournamentId}`);
  const unsubscribe = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onUpdate(null);
      return;
    }
    const data = snap.data();
    onUpdate({
      ...(data as ScraperStatus),
      updatedAt: data['updatedAt']?.toDate?.()?.toISOString() ?? data['updatedAt'],
    });
  }, (error) => {
    console.warn('Scraper status snapshot error:', error);
  });
  return unsubscribe;
}
