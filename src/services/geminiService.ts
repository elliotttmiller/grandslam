/// <reference types="vite/client" />
import { GoogleGenAI, Type } from "@google/genai";
import { authGetItem, authSetItem } from '@/lib/auth-storage';
import { collection, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { getMastersTournamentById, MASTERS_TOURNAMENTS } from '@/lib/masters-tournaments';
import { getMadrid2026OfficialDrawSlots, getMadrid2026Seedings } from '@/lib/madrid-2026-data';

// ── Vertex AI API configuration ───────────────────────────────────────────
// This app no longer supports a Gemini API key fallback in the browser.
// The @google/genai SDK must be configured with a browser-compatible
// Vertex AI API key via VITE_GOOGLE_CREDENTIALS_JSON.
const vertexAIProject = import.meta.env.VITE_GOOGLE_CLOUD_PROJECT;
const vertexAILocation = import.meta.env.VITE_GOOGLE_CLOUD_LOCATION || 'global';

function resolveApiKey(): string {
  const credentialsRaw = import.meta.env.VITE_GOOGLE_CREDENTIALS_JSON;
  if (!credentialsRaw) return '';
  const trimmed = credentialsRaw.trim();
  if (!trimmed) return '';
  // Accept a plain API key string or a JSON object with an "api_key" field.
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.api_key === 'string') return parsed.api_key;
  } catch { /* fall through */ }
  console.warn(
    'VITE_GOOGLE_CREDENTIALS_JSON appears to contain service-account JSON or unsupported browser credentials. ' +
    'Browser-based Vertex AI requires a plain Google Cloud API key string or a JSON object with an "api_key" field. ' +
    'Do not use service-account credentials in client-side builds.'
  );
  return '';
}

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

const resolvedApiKey = resolveApiKey();

if (!resolvedApiKey) {
  console.warn(
      'No API key configured for Vertex AI. ' +
      'Set VITE_GOOGLE_CREDENTIALS_JSON to a Google Cloud API key with the Vertex AI API enabled. ' +
      'For browser builds, this must be a browser-compatible API key string (or JSON object containing api_key).'
  );
}

// Initialize the SDK using Vertex AI.
const ai = new GoogleGenAI(
  {
    apiKey: resolvedApiKey || '',
    vertexai: true,
  }
);

function formatLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TODAY_STR = formatLocalDateIso(new Date());
const TODAY_DATE = new Date();
// Universal model for all AI inference (Vertex AI + Gemini API compatible).
const MODEL = "gemini-2.5-flash";
const MAX_MASTERS_SEEDS = 32;
let aiAvailable = true;

const inFlightRequests = new Map<string, Promise<unknown>>();

function cachedInflight<T>(key: string, executor: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = executor().finally(() => {
    if (inFlightRequests.get(key) === promise) {
      inFlightRequests.delete(key);
    }
  });
  inFlightRequests.set(key, promise);
  return promise;
}

function handleAiError(err: unknown) {
  try {
    const e = err as any;
    const msg = e?.message ?? '';
    const code = String(e?.code ?? e?.error?.code ?? '');
    if (code === '429' || String(code).includes('RESOURCE_EXHAUSTED') || /prepayment credits are depleted/i.test(msg) || /quota/i.test(msg)) {
      aiAvailable = false;
      console.error('Vertex AI quota exhausted — disabling AI calls for this session.');
    }
  } catch (e) {
    // ignore
  }
}

export const CACHE_KEY_TOURNAMENTS = 'tennis_tournaments_cache_v5';
const CACHE_KEY_PLAYERS_PREFIX = 'tennis_players_cache_v5_';
export const CACHE_KEY_MASTERS_PREFIX = 'tennis_masters_details_v2_';
export const CACHE_KEY_MASTERS_DRAW_PREFIX = 'tennis_masters_draw_v1_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const LIVE_DATA_CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour
const LIVE_DATA_CACHE_EXPIRY_SHORT = 15 * 60 * 1000; // 15 minutes — used near tournament start

/** Returns how many days from today until the given YYYY-MM-DD date (negative = past). */
function daysUntil(isoDate: string): number {
  const target = new Date(isoDate + 'T00:00:00');
  const diffMs = target.getTime() - TODAY_DATE.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Builds an urgency note for AI prompts when a tournament's draw is expected to be released.
 * When the start is ≤ 3 days away, it instructs the model to aggressively search for the
 * official draw and to label results as "official" whenever a live source is found.
 */
function buildDrawImminenceNote(startDate: string | undefined, daysToStart: number): string {
  if (!startDate || daysToStart > 3) return `Today is ${TODAY_STR}.`;
  return `IMPORTANT: Today is ${TODAY_STR} and this tournament's main draw starts on ${startDate}. ` +
    `The official draw has almost certainly been released already (ATP draws are published 1-2 days before the main draw begins). ` +
    `Please search live ATP Tour sources and mark the status as "official" if you find draw information from any source published in the last 14 days.`;
}

function isMastersImminent(startDate: string | undefined): boolean {
  if (!startDate) return false;
  return daysUntil(startDate) <= 7;
}

// ── Phase-aware cache TTL constants ────────────────────────────────────────────
const LIVE_DATA_CACHE_EXPIRY_DRAW_RELEASED = 10 * 60 * 1000; // 10 min — draw just released
const LIVE_DATA_CACHE_EXPIRY_LIVE = 3 * 60 * 1000;           // 3 min — tournament in progress

/**
 * Tournament phase driven by today's date relative to start/end dates.
 * Controls cache TTL and how aggressively AI is asked to search for official data.
 */
export type TournamentPhase = 'pre-draw' | 'draw-released' | 'live' | 'completed';

export function getTournamentPhase(
  approxStart: string | undefined,
  approxEnd: string | undefined,
): TournamentPhase {
  if (!approxStart) return 'pre-draw';
  const daysToStart = daysUntil(approxStart);
  const daysToEnd = approxEnd ? daysUntil(approxEnd) : daysToStart + 14;
  if (daysToEnd < 0) return 'completed';
  if (daysToStart <= 0) return 'live';
  if (daysToStart <= 2) return 'draw-released';
  return 'pre-draw';
}

function phaseCacheTtl(phase: TournamentPhase): number {
  switch (phase) {
    case 'live':           return LIVE_DATA_CACHE_EXPIRY_LIVE;
    case 'draw-released':  return LIVE_DATA_CACHE_EXPIRY_DRAW_RELEASED;
    case 'pre-draw':       return LIVE_DATA_CACHE_EXPIRY;
    case 'completed':      return CACHE_EXPIRY;
  }
}

function isOfficialDataExpectedPhase(phase: TournamentPhase): boolean {
  return phase !== 'pre-draw';
}

// ── Per-tournament authoritative URL registry ──────────────────────────────────
// Gives the AI specific, prioritised sources to search instead of guessing.
interface TournamentDrawUrls {
  /** Tournament code on protennislive.com, used in /posting/{year}/{code}/mds.pdf */
  protennisliveCode: string;
  /** ATP tour path segment used in atptour.com/en/scores/current/{atpPath}/draws */
  atpPath: string;
  /** Wikipedia article title prefix for {year}_{wikiTitle}_–_Men's_singles */
  wikiTitle: string;
}

const TOURNAMENT_DRAW_URLS: Record<string, TournamentDrawUrls> = {
  'madrid':       { protennisliveCode: '1536', atpPath: 'madrid/1536',       wikiTitle: 'Mutua_Madrid_Open' },
  'indian-wells': { protennisliveCode: '404',  atpPath: 'indian-wells/404',  wikiTitle: 'BNP_Paribas_Open' },
  'miami':        { protennisliveCode: '403',  atpPath: 'miami-open/403',    wikiTitle: 'Miami_Open_(tennis)' },
  'monte-carlo':  { protennisliveCode: '410',  atpPath: 'monte-carlo/410',   wikiTitle: 'Monte-Carlo_Masters' },
  'rome':         { protennisliveCode: '416',  atpPath: 'rome/416',          wikiTitle: 'Italian_Open_(tennis)' },
  'canada':       { protennisliveCode: '421',  atpPath: 'canada/421',        wikiTitle: 'Canadian_Open_(tennis)' },
  'cincinnati':   { protennisliveCode: '422',  atpPath: 'cincinnati/422',    wikiTitle: 'Western_%26_Southern_Open' },
  'shanghai':     { protennisliveCode: '5014', atpPath: 'shanghai/5014',     wikiTitle: 'Shanghai_Masters' },
  'paris':        { protennisliveCode: '341',  atpPath: 'paris/341',         wikiTitle: 'BNP_Paribas_Masters' },
};

/** Builds a numbered list of prioritised draw sources for inclusion in AI prompts. */
export function buildTournamentUrlHints(tournamentId: string, year: number): string {
  const urls = TOURNAMENT_DRAW_URLS[tournamentId];
  if (!urls) return '';
  return `Official draw sources (search in this order):
1. https://www.protennislive.com/posting/${year}/${urls.protennisliveCode}/mds.pdf
2. https://www.atptour.com/en/scores/current/${urls.atpPath}/draws
3. https://en.wikipedia.org/wiki/${year}_${urls.wikiTitle}_%E2%80%93_Men%27s_singles`;
}

/** Cache key with year-month suffix so keys auto-invalidate across tournament editions. */
function drawCacheKey(tournamentId: string, approxStart: string | undefined): string {
  const yearMonth = approxStart ? approxStart.slice(0, 7).replace('-', '') : '';
  return yearMonth
    ? `${CACHE_KEY_MASTERS_DRAW_PREFIX}${tournamentId}_${yearMonth}`
    : `${CACHE_KEY_MASTERS_DRAW_PREFIX}${tournamentId}`;
}

/**
 * Robust JSON object extraction from free-form text (e.g. grounded model responses).
 *
 * Grounded models often wrap the JSON in explanation text and citation footnotes.
 * This function uses balanced-brace counting to locate the outermost JSON object,
 * tolerating surrounding prose. Safer than indexOf('{') + lastIndexOf('}') because
 * it correctly handles nested objects and brace characters in surrounding text.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  // Strip markdown code fences, then try a direct parse first.
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
  try { return JSON.parse(stripped.trim()) as Record<string, unknown>; } catch {}
  // Balanced-brace scan for the outermost JSON object in the original text.
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') { i++; continue; } // skip escaped character
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return JSON.parse(text.substring(start, i + 1)) as Record<string, unknown>; } catch {}
        start = -1; // reset and try the next candidate object
      }
    }
  }
  return null;
}

export interface TournamentData {
  id: string;
  name: string;
  startDate: string; // ISO format
  endDate: string;
  logo?: string;
  /** Distinguishes Grand Slam from ATP Masters 1000 entries. */
  type?: 'grand-slam' | 'masters';
}

function readAuthCacheIfFresh<T>(key: string, maxAgeMs: number): T | null {
  const raw = authGetItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > maxAgeMs) return null;
    return parsed.data as T;
  } catch (error) {
    console.warn(`Failed to parse auth cache for key "${key}"`, error);
    return null;
  }
}

function writeAuthCacheWithTimestamp<T>(key: string, data: T): void {
  try {
    authSetItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (error) {
    console.warn(`Failed to write auth cache for key "${key}"`, error);
  }
}

function extractJsonArray(text: string): any[] {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.substring(start, end + 1));
    }
  } catch (e) {
    console.error("Failed to parse JSON array from text", e);
  }
  return [];
}

const BASE_URL = import.meta.env.BASE_URL || '/';

const TOURNAMENT_LOGOS: Record<string, string> = {
  'ao': `${BASE_URL}Australian-Open-Logo-360x225.png`,
  'rg': `${BASE_URL}Roland-Garros-Logo-1536x960.png`,
  'wim': `${BASE_URL}Wimbledon-Logo.png`,
  'uso': `${BASE_URL}new-US-Open-logo-png-large-size.png`,
};

const TOURNAMENTS_FIRESTORE_COLLECTION = 'tournaments';
const REQUIRED_GRAND_SLAM_IDS = ['ao', 'rg', 'wim', 'uso'];
const REQUIRED_MASTERS_IDS = MASTERS_TOURNAMENTS.map(t => t.id);
const KNOWN_TOURNAMENT_IDS = [...REQUIRED_GRAND_SLAM_IDS, ...REQUIRED_MASTERS_IDS];

function inferTournamentType(id: string, rawType?: unknown): 'grand-slam' | 'masters' {
  if (rawType === 'masters') return 'masters';
  if (rawType === 'grand-slam') return 'grand-slam';
  return REQUIRED_MASTERS_IDS.includes(id) ? 'masters' : 'grand-slam';
}

const MASTERS_TOURNAMENT_METADATA: TournamentData[] = MASTERS_TOURNAMENTS.map((tournament) => ({
  id: tournament.id,
  name: tournament.name,
  startDate: tournament.approxStart,
  endDate: tournament.approxEnd,
  logo: TOURNAMENT_LOGOS[tournament.id],
  type: 'masters' as const,
}));

async function loadTournamentMetadataFromFirestore(): Promise<TournamentData[] | null> {
  try {
    const snapshot = await getDocs(collection(getDb(), TOURNAMENTS_FIRESTORE_COLLECTION));
    const tournaments = snapshot.docs
      .map((docSnap) => {
        const raw = docSnap.data() as Record<string, unknown>;
        return {
          id: typeof raw.tournamentId === 'string' ? raw.tournamentId : typeof raw.id === 'string' ? raw.id : undefined,
          name: typeof raw.name === 'string' ? raw.name : typeof raw.tournamentName === 'string' ? raw.tournamentName : undefined,
          startDate: typeof raw.startDate === 'string' ? raw.startDate : undefined,
          endDate: typeof raw.endDate === 'string' ? raw.endDate : undefined,
          logo: typeof raw.logo === 'string' ? raw.logo : undefined,
          type: typeof raw.type === 'string' ? raw.type : undefined,
        } as { id?: string; name?: string; startDate?: string; endDate?: string; logo?: string; type?: string };
      })
      .filter((data): data is { id: string; name: string; startDate: string; endDate: string; logo?: string; type?: string } => {
        return typeof data.id === 'string'
          && typeof data.name === 'string'
          && typeof data.startDate === 'string'
          && typeof data.endDate === 'string'
          && KNOWN_TOURNAMENT_IDS.includes(data.id);
      })
      .map((data) => ({
        id: data.id,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        logo: data.logo ?? TOURNAMENT_LOGOS[data.id],
        type: inferTournamentType(data.id, data.type),
      }));
    if (tournaments.length >= REQUIRED_GRAND_SLAM_IDS.length) {
      return tournaments.sort((a, b) => {
        if (a.type === b.type) return 0;
        return a.type === 'grand-slam' ? -1 : 1;
      });
    }
  } catch (error) {
    console.warn('Failed to load tournament metadata from Firestore:', error);
  }
  return null;
}

async function persistTournamentMetadataToFirestore(tournaments: TournamentData[]): Promise<void> {
  try {
    await Promise.all(tournaments.map((tournament) => {
      return setDoc(doc(getDb(), TOURNAMENTS_FIRESTORE_COLLECTION, tournament.id),
        removeUndefined({
          tournamentId: tournament.id,
          name: tournament.name,
          tournamentName: tournament.name,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
          logo: tournament.logo ?? TOURNAMENT_LOGOS[tournament.id],
          type: tournament.type ?? 'grand-slam',
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    }));
  } catch (error) {
    console.warn('Failed to persist tournament metadata to Firestore:', error);
  }
}

export async function fetchTournamentsWithDates() {
  return cachedInflight('fetchTournamentsWithDates', async () => {
    // Check user-scoped cache first (short-lived so dates stay fresh).
    const cached = readAuthCacheIfFresh<TournamentData[]>(CACHE_KEY_TOURNAMENTS, LIVE_DATA_CACHE_EXPIRY);
    if (cached && cached.length > 0) {
      return cached;
    }

    const firestoreData = await loadTournamentMetadataFromFirestore();
    if (firestoreData && firestoreData.length > 0) {
      const fetchedIds = new Set(firestoreData.map(t => t.id));
      const missingMasters = MASTERS_TOURNAMENT_METADATA.filter(t => !fetchedIds.has(t.id));
      if (missingMasters.length > 0) {
        persistTournamentMetadataToFirestore([...firestoreData, ...missingMasters]).catch((error) => {
          console.warn('Failed to persist missing Masters metadata to Firestore:', error);
        });
      }
      writeAuthCacheWithTimestamp(CACHE_KEY_TOURNAMENTS, firestoreData);
      return firestoreData;
    }

    if (!aiAvailable) {
      const fallback: TournamentData[] = [
        { id: 'ao', name: 'Australian Open', startDate: '2026-01-12', endDate: '2026-01-25', logo: TOURNAMENT_LOGOS['ao'] },
        { id: 'rg', name: 'French Open', startDate: '2026-05-24', endDate: '2026-06-07', logo: TOURNAMENT_LOGOS['rg'] },
        { id: 'wim', name: 'Wimbledon', startDate: '2026-06-29', endDate: '2026-07-12', logo: TOURNAMENT_LOGOS['wim'] },
        { id: 'uso', name: 'US Open', startDate: '2026-08-31', endDate: '2026-09-13', logo: TOURNAMENT_LOGOS['uso'] },
      ];
      writeAuthCacheWithTimestamp(CACHE_KEY_TOURNAMENTS, fallback);
      return fallback;
    }

  const prompt = `Today is ${TODAY_STR}. Find the dates for the NEXT upcoming edition of the four Grand Slam tennis tournaments (Australian Open, French Open/Roland Garros, Wimbledon, US Open) relative to today. 
  Return a JSON array of exactly 4 objects with:
  - 'id': short string (e.g., 'ao', 'rg', 'wim', 'uso')
  - 'name': full tournament name including the year (e.g., 'Wimbledon 2026')
  - 'startDate': the start date of the main draw in YYYY-MM-DD format
  - 'endDate': the end date of the main draw in YYYY-MM-DD format
  - 'logo': a high-quality public URL for the tournament logo if possible, otherwise null
  
  Do not include any markdown formatting or extra text outside the JSON array.`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        startDate: { type: Type.STRING },
        endDate: { type: Type.STRING },
        logo: { type: Type.STRING, nullable: true },
      },
      required: ["id", "name", "startDate", "endDate"],
    },
  };

  let data: TournamentData[] = [];

  // If AI quota is known exhausted, skip model calls and fall back immediately
  if (aiAvailable) {
    // Tier 1: Grounded Search — real-time data via Google Search.
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      data = extractJsonArray(response.text || "");
    } catch (e) {
      handleAiError(e);
      console.warn("Tier 1 (Grounded) error:", e);
    }
  }

  // Tier 2: Structured output — reliable JSON from model knowledge.
  if ((!data || data.length === 0) && aiAvailable) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || "[]");
    } catch (e) {
      handleAiError(e);
      console.warn("Tier 2 (Structured) error:", e);
    }
  }

  const fallback: TournamentData[] = [
    { id: 'ao', name: 'Australian Open', startDate: '2026-01-12', endDate: '2026-01-25', logo: TOURNAMENT_LOGOS['ao'] },
    { id: 'rg', name: 'French Open', startDate: '2026-05-24', endDate: '2026-06-07', logo: TOURNAMENT_LOGOS['rg'] },
    { id: 'wim', name: 'Wimbledon', startDate: '2026-06-29', endDate: '2026-07-12', logo: TOURNAMENT_LOGOS['wim'] },
    { id: 'uso', name: 'US Open', startDate: '2026-08-31', endDate: '2026-09-13', logo: TOURNAMENT_LOGOS['uso'] },
  ];

  if (data && data.length > 0) {
    // Map reliable PNG logos
    data = data.map(t => ({
      ...t,
      logo: TOURNAMENT_LOGOS[t.id] || t.logo
    }));
    const allMetadata = [...data];
    for (const mastersTournament of MASTERS_TOURNAMENT_METADATA) {
      if (!allMetadata.some(t => t.id === mastersTournament.id)) {
        allMetadata.push(mastersTournament);
      }
    }
    persistTournamentMetadataToFirestore(allMetadata).catch((error) => {
      console.warn('Failed to persist tournaments to Firestore:', error);
    });
    // Ensure all four Grand Slams are present; backfill any missing from fallback
    const REQUIRED_IDS = ['ao', 'rg', 'wim', 'uso'];
    for (const fb of fallback) {
      if (!data.find(t => t.id === fb.id)) {
        data.push(fb);
      }
    }
    // Filter out unrecognised entries (keep only the four Grand Slams)
    data = data.filter(t => REQUIRED_IDS.includes(t.id));
    writeAuthCacheWithTimestamp(CACHE_KEY_TOURNAMENTS, data);
    return data as TournamentData[];
  }

  console.error("Vertex AI model failed to fetch tournaments with dates.");
    writeAuthCacheWithTimestamp(CACHE_KEY_TOURNAMENTS, fallback);
    persistTournamentMetadataToFirestore([
      ...fallback,
      ...MASTERS_TOURNAMENT_METADATA,
    ]).catch((error) => {
      console.warn('Failed to persist fallback tournament metadata to Firestore:', error);
    });
  // Fallback to basic list if all AI tiers fail
  return fallback;
  });
}

export async function fetchTournamentPlayers(tournamentName: string) {
  const cacheKey = `${CACHE_KEY_PLAYERS_PREFIX}${tournamentName.replace(/\s+/g, '_').toLowerCase()}`;
  
  return cachedInflight(`fetchTournamentPlayers:${cacheKey}`, async () => {
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_EXPIRY) {
        return data;
      }
    }

    if (!aiAvailable) {
      localStorage.setItem(cacheKey, JSON.stringify({ data: FALLBACK_PLAYERS, timestamp: Date.now() }));
      return FALLBACK_PLAYERS;
    }

    const prompt = `Today is ${TODAY_STR}. Search for the actual, real-time top 32 seeded players for the ${tournamentName} edition closest to today. 
    If official seedings aren't published yet, generate a professional pre-tournament predicted bracket from current world rankings with surface-based adjustments.
    Return the result strictly as a JSON array of exactly 32 objects, each with 'name' (string), 'seed' (number), and 'country' (string). Do not include any markdown formatting or extra text outside the JSON array.`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        seed: { type: Type.INTEGER },
        country: { type: Type.STRING },
      },
      required: ["name", "seed", "country"],
    },
  };

  let data: any[] = [];

  if (aiAvailable) {
    // Tier 1: Grounded Search — real-time seedings via Google Search.
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      data = extractJsonArray(response.text || "");
      if (data && data.length === 32) {
        localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
        return data;
      }
      console.warn(`Tier 1 (Grounded) failed: returned ${data?.length} players instead of 32.`);
    } catch (e) {
      handleAiError(e);
      console.warn("Tier 1 (Grounded) error:", e);
    }

    // Tier 2: Structured output — reliable JSON from model knowledge.
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || "[]");
      if (data && data.length === 32) {
        localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
        return data;
      }
      console.warn(`Tier 2 (Structured) failed: returned ${data?.length} players instead of 32.`);
    } catch (e) {
      handleAiError(e);
      console.warn("Tier 2 (Structured) error:", e);
    }
  }

  console.warn("Vertex AI model failed to generate exactly 32 players. Using fallback player list.");
  localStorage.setItem(cacheKey, JSON.stringify({ data: FALLBACK_PLAYERS, timestamp: Date.now() }));
  return FALLBACK_PLAYERS;
  });
}

// Fallback top-32 ATP seeds (approximate current rankings, updated periodically)
const FALLBACK_PLAYERS = [
  { name: "Jannik Sinner", seed: 1, country: "ITA" },
  { name: "Carlos Alcaraz", seed: 2, country: "ESP" },
  { name: "Alexander Zverev", seed: 3, country: "GER" },
  { name: "Taylor Fritz", seed: 4, country: "USA" },
  { name: "Casper Ruud", seed: 5, country: "NOR" },
  { name: "Novak Djokovic", seed: 6, country: "SRB" },
  { name: "Daniil Medvedev", seed: 7, country: "RUS" },
  { name: "Andrey Rublev", seed: 8, country: "RUS" },
  { name: "Hubert Hurkacz", seed: 9, country: "POL" },
  { name: "Grigor Dimitrov", seed: 10, country: "BUL" },
  { name: "Ugo Humbert", seed: 11, country: "FRA" },
  { name: "Alex de Minaur", seed: 12, country: "AUS" },
  { name: "Stefanos Tsitsipas", seed: 13, country: "GRE" },
  { name: "Tommy Paul", seed: 14, country: "USA" },
  { name: "Ben Shelton", seed: 15, country: "USA" },
  { name: "Holger Rune", seed: 16, country: "DEN" },
  { name: "Francisco Cerundolo", seed: 17, country: "ARG" },
  { name: "Sebastian Korda", seed: 18, country: "USA" },
  { name: "Arthur Fils", seed: 19, country: "FRA" },
  { name: "Flavio Cobolli", seed: 20, country: "ITA" },
  { name: "Karen Khachanov", seed: 21, country: "RUS" },
  { name: "Nicolas Jarry", seed: 22, country: "CHL" },
  { name: "Tomas Machac", seed: 23, country: "CZE" },
  { name: "Lorenzo Musetti", seed: 24, country: "ITA" },
  { name: "Felix Auger-Aliassime", seed: 25, country: "CAN" },
  { name: "Jiri Lehecka", seed: 26, country: "CZE" },
  { name: "Alejandro Davidovich Fokina", seed: 27, country: "ESP" },
  { name: "Jakub Mensik", seed: 28, country: "CZE" },
  { name: "Brandon Nakashima", seed: 29, country: "USA" },
  { name: "Tallon Griekspoor", seed: 30, country: "NED" },
  { name: "Nuno Borges", seed: 31, country: "POR" },
  { name: "Jacob Fearnley", seed: 32, country: "GBR" },
];

// ─── ATP Masters 1000 details ────────────────────────────────────────────────

export interface MastersSeededPlayer {
  seed: number;
  name: string;
  country: string;
  ranking?: number;
}

export interface MastersTournamentDetails {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  venue: string;
  surface: string;
  drawSize: number;
  prizeMoney?: string;
  seedings: MastersSeededPlayer[];
  /** Whether seedings are official or AI-predicted */
  seedingsStatus: 'official' | 'predicted';
  /** Any extra contextual notes returned by AI */
  notes?: string;
}

interface MastersOfficialDrawSlot {
  slot: number;
  /** Player name, or placeholder "Winner: A vs B" for unknown round-2 opponents. */
  name: string;
  seed?: number;
  /** ISO 3166-1 alpha-3 country code when available. */
  country?: string;
}

interface MastersOfficialDrawResponse {
  drawStatus: 'official' | 'predicted';
  notes?: string;
  drawPlayers: MastersOfficialDrawSlot[];
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function hasUsableValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !normalized.includes('unavailable') && normalized !== 'tbd' && normalized !== 'unknown';
}

function normalizeMastersSeedings(seedings: unknown): MastersSeededPlayer[] {
  if (!Array.isArray(seedings)) return [];
  const normalized = seedings
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      seed: typeof p.seed === 'number' ? p.seed : Number(p.seed),
      name: typeof p.name === 'string' ? p.name.trim() : '',
      country: typeof p.country === 'string' ? p.country.trim().toUpperCase() : '',
      ranking: typeof p.ranking === 'number' ? p.ranking : undefined,
    }))
    .filter(p => Number.isInteger(p.seed) && p.seed > 0 && p.seed <= MAX_MASTERS_SEEDS && p.name.length > 0);
  normalized.sort((a, b) => a.seed - b.seed);
  return normalized;
}

/**
 * Normalize the AI-returned draw slots into a clean 64-entry array.
 *
 * Tolerant of:
 *  - 96-player draws: AI may return up to 128 slots; we accept any with slot 1-128 and
 *    pick the first 64 by slot order (or re-index them sequentially when they are compact
 *    but not starting at 1).
 *  - Partial draws: if we receive ≥32 valid entries we fill the remaining slots with
 *    "Qualifier N" placeholders so the bracket can still be built from official data.
 *  - Minor slot-numbering gaps: missing positions are filled with qualifiers.
 *
 * Returns an empty array only when fewer than 32 valid entries are found.
 */
function normalizeMastersOfficialDrawSlots(drawPlayers: unknown): MastersOfficialDrawSlot[] {
  if (!Array.isArray(drawPlayers)) return [];

  // Accept slots up to 128 (covers 96-player Masters draws where AI may include all positions)
  const MAX_SLOT = 128;

  const normalized = drawPlayers
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      slot: typeof p.slot === 'number' ? p.slot : Number(p.slot),
      name: typeof p.name === 'string' ? p.name.trim() : '',
      seed: typeof p.seed === 'number' ? p.seed : (typeof p.seed === 'string' ? Number(p.seed) : NaN),
      country: typeof p.country === 'string' ? p.country.trim().toUpperCase() : undefined,
    }))
    .filter((p) => Number.isInteger(p.slot) && p.slot >= 1 && p.slot <= MAX_SLOT && p.name.length > 0)
    .filter((p) => {
      const looksLikeWinnerPlaceholder = /^Winner:/i.test(p.name);
      if (!looksLikeWinnerPlaceholder) return true;
      return /^Winner:\s*.+\s+vs\s+.+$/i.test(p.name);
    })
    .map((p) => ({
      slot: p.slot,
      name: p.name,
      seed: Number.isFinite(p.seed) && Number.isInteger(p.seed) && p.seed > 0 && p.seed <= 32 ? p.seed : undefined,
      country: typeof p.country === 'string' && p.country.length === 3 ? p.country : undefined,
    }))
    .sort((a, b) => a.slot - b.slot);

  // Deduplicate by slot, keeping first occurrence
  const uniqueBySlot = new Map<number, MastersOfficialDrawSlot>();
  for (const slot of normalized) {
    if (!uniqueBySlot.has(slot.slot)) uniqueBySlot.set(slot.slot, slot);
  }
  const unique = Array.from(uniqueBySlot.values()).sort((a, b) => a.slot - b.slot);

  // Require at least 32 real entries to be considered a usable draw
  if (unique.length < 32) return [];

  // If we have a full 128-slot draw (e.g. Madrid 96-player with BYEs), return all 128 slots.
  if (unique.length >= 128) {
    return unique.slice(0, 128).map((p, i) => ({ ...p, slot: i + 1 }));
  }

  // If all 64 slots (1-64) are present and sequential, return as-is
  if (unique.length >= 64) {
    const first64 = unique.slice(0, 64);
    // Re-index to sequential 1-64 regardless of original slot numbers
    return first64.map((p, i) => ({ ...p, slot: i + 1 }));
  }

  // Partial draw (32-63 entries): build a complete 64-slot array, filling gaps with qualifiers.
  // Re-index the received entries sequentially, then pad to 64.
  // Qualifier numbers always start at 1 to keep labelling consistent and unambiguous.
  const reindexed: MastersOfficialDrawSlot[] = unique.map((p, i) => ({ ...p, slot: i + 1 }));
  let qualifierNum = 1;
  while (reindexed.length < 64) {
    reindexed.push({ slot: reindexed.length + 1, name: `Qualifier ${qualifierNum++}`, seed: undefined, country: undefined });
  }
  return reindexed;
}

function normalizeMastersDetails(
  data: MastersTournamentDetails | null,
  tournamentId: string,
  tournamentName: string,
): MastersTournamentDetails {
  const staticTournament = getMastersTournamentById(tournamentId);

  const seedings = normalizeMastersSeedings(data?.seedings);

  // Trust explicit official/predicted status from the data source.
  const startDate = isIsoDate(data?.startDate) ? data!.startDate : (staticTournament?.approxStart ?? '');
  const seedingsStatus: 'official' | 'predicted' = data?.seedingsStatus === 'official' ? 'official' : 'predicted';

  const notes = hasUsableValue(data?.notes)
    ? (data?.notes as string)
    : seedingsStatus === 'official'
      ? undefined
      : 'Live official draw data is not available yet. Showing predicted seedings.';

  return {
    id: tournamentId,
    name: hasUsableValue(data?.name) ? (data?.name as string) : `2026 ${tournamentName}`,
    startDate,
    endDate: isIsoDate(data?.endDate) ? data!.endDate : (staticTournament?.approxEnd ?? ''),
    location: hasUsableValue(data?.location) ? (data?.location as string) : (staticTournament?.location ?? 'Location unavailable'),
    venue: hasUsableValue(data?.venue) ? (data?.venue as string) : 'Venue unavailable',
    surface: hasUsableValue(data?.surface) ? (data?.surface as string) : (staticTournament?.surface ?? 'Hard'),
    drawSize: typeof data?.drawSize === 'number' && data.drawSize > 0 ? data.drawSize : 96,
    prizeMoney: hasUsableValue(data?.prizeMoney) ? (data?.prizeMoney as string) : undefined,
    seedings: seedings.length > 0
      ? seedings
      : FALLBACK_PLAYERS.slice(0, MAX_MASTERS_SEEDS).map(p => ({ ...p, ranking: undefined })),
    seedingsStatus,
    notes,
  };
}

/**
 * Fetch comprehensive details for an ATP Masters 1000 tournament using the Gemini AI.
 *
 * Cache TTL is phase-driven: 24h pre-draw → 10 min draw-released → 3 min live → 24h completed.
 * Stale 'predicted' cache entries are skipped during draw-released and live phases so that
 * freshly-released official data is always fetched. As a last resort, if all AI tiers fail
 * for a tournament where hardcoded official data is available, that data is returned instead.
 */
export async function fetchMastersTournamentDetails(
  tournamentId: string,
  tournamentName: string,
): Promise<MastersTournamentDetails> {
  const cacheKey = `${CACHE_KEY_MASTERS_PREFIX}${tournamentId}`;
  const currentYear = Number(TODAY_STR.slice(0, 4));

  const staticTournament = getMastersTournamentById(tournamentId);
  const phase = getTournamentPhase(staticTournament?.approxStart, staticTournament?.approxEnd);
  const cacheExpiry = phaseCacheTtl(phase);

  const isMadrid2026 = tournamentId === 'madrid' && currentYear === 2026;

  // Check user-scoped cache first.
  const cached = readAuthCacheIfFresh<MastersTournamentDetails>(cacheKey, cacheExpiry);
  if (cached) {
    // Skip predicted cache when official data should exist so fresh official data is fetched.
    if (cached.seedingsStatus === 'predicted' && isOfficialDataExpectedPhase(phase)) {
      // fall through to re-fetch
    } else {
      return cached;
    }
  }

  if (isMadrid2026) {
    const hardcoded: MastersTournamentDetails = {
      id: 'madrid',
      name: '2026 Mutua Madrid Open',
      startDate: '2026-04-22',
      endDate: '2026-05-03',
      location: 'Madrid, Spain',
      venue: 'Caja Mágica',
      surface: 'Clay',
      drawSize: 96,
      prizeMoney: '€7,849,040',
      seedings: getMadrid2026Seedings(),
      seedingsStatus: 'official',
      notes: 'Defending champion: Casper Ruud. Withdrawals: Carlos Alcaraz (wrist), Novak Djokovic (shoulder), Taylor Fritz (knee), Frances Tiafoe, Jack Draper (knee).',
    };
    writeAuthCacheWithTimestamp(cacheKey, hardcoded);
    return hardcoded;
  }

  if (!aiAvailable) {
    const fallback = normalizeMastersDetails(null, tournamentId, tournamentName);
    writeAuthCacheWithTimestamp(cacheKey, fallback);
    return fallback;
  }

  const daysToStart = staticTournament?.approxStart ? daysUntil(staticTournament.approxStart) : 999;
  const drawReleaseContext = buildDrawImminenceNote(staticTournament?.approxStart, daysToStart);
  const urlHints = buildTournamentUrlHints(tournamentId, currentYear);

  const isImminent = isMastersImminent(staticTournament?.approxStart) || phase === 'live';

  if (!isImminent) {
    const fallback = normalizeMastersDetails(null, tournamentId, tournamentName);
    writeAuthCacheWithTimestamp(cacheKey, fallback);
    return fallback;
  }

  const prompt = `${drawReleaseContext} Find the most accurate and up-to-date information about the ${currentYear} ATP Masters 1000 men's singles tournament: "${tournamentName}".
${urlHints ? urlHints + '\n' : ''}
Return a JSON object with these fields:
- "id": "${tournamentId}"
- "name": full official tournament name including year (e.g. "2026 Mutua Madrid Open")
- "startDate": main draw start date in YYYY-MM-DD format
- "endDate": final date in YYYY-MM-DD format
- "location": city and country (e.g. "Madrid, Spain")
- "venue": full venue/stadium name (e.g. "Caja Mágica")
- "surface": court surface (e.g. "Clay")
- "drawSize": number of players in main draw (96 for most Masters 1000 events)
- "prizeMoney": total prize money string (e.g. "$7,849,040") or null if unknown
- "seedings": JSON array of the top 16 official seeds, each object with "seed" (number), "name" (string), "country" (3-letter ISO code), "ranking" (ATP ranking number or null). Use official seedings if the draw has been released, otherwise use current ATP rankings adjusted for surface.
- "seedingsStatus": MUST be "official" if you found this information from the official ATP draw or any reliable source published in the last 14 days; otherwise "predicted"
- "notes": one sentence of context (defending champion, notable withdrawals) or null

Do not include any markdown formatting. Return only the JSON object.`;

  const seedingSchema = {
    type: Type.OBJECT,
    properties: {
      seed: { type: Type.INTEGER },
      name: { type: Type.STRING },
      country: { type: Type.STRING },
      ranking: { type: Type.INTEGER, nullable: true },
    },
    required: ['seed', 'name', 'country'],
  };

  const schema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      name: { type: Type.STRING },
      startDate: { type: Type.STRING },
      endDate: { type: Type.STRING },
      location: { type: Type.STRING },
      venue: { type: Type.STRING },
      surface: { type: Type.STRING },
      drawSize: { type: Type.INTEGER },
      prizeMoney: { type: Type.STRING, nullable: true },
      seedings: { type: Type.ARRAY, items: seedingSchema },
      seedingsStatus: { type: Type.STRING },
      notes: { type: Type.STRING, nullable: true },
    },
    required: ['id', 'name', 'startDate', 'endDate', 'location', 'venue', 'surface', 'drawSize', 'seedings', 'seedingsStatus'],
  };

  let data: MastersTournamentDetails | null = null;

  // Tier 1: Grounded Search — real-time data via Google Search.
  // Uses extractJsonObject for robust extraction — the grounded model wraps JSON in prose.
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    data = extractJsonObject(response.text || '') as unknown as MastersTournamentDetails | null;
  } catch (e) {
    console.warn('Masters Tier 1 (Grounded) error:', e);
  }

  // Tier 2: Structured output — reliable JSON from model knowledge.
  if (!data || !data.seedings?.length) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || 'null');
    } catch (e) {
      console.warn('Masters Tier 2 (Structured) error:', e);
    }
  }

  const normalizedData = normalizeMastersDetails(data, tournamentId, tournamentName);

  // Last resort: if all AI tiers returned 'predicted' when official data should exist,
  // fall back to trusted hardcoded official data.
  if (normalizedData.seedingsStatus === 'predicted' && isOfficialDataExpectedPhase(phase)) {
    if (tournamentId === 'madrid' && currentYear === 2026) {
      const hardcoded: MastersTournamentDetails = {
        id: 'madrid',
        name: '2026 Mutua Madrid Open',
        startDate: '2026-04-22',
        endDate: '2026-05-03',
        location: 'Madrid, Spain',
        venue: 'Caja Mágica',
        surface: 'Clay',
        drawSize: 96,
        prizeMoney: '€7,849,040',
        seedings: getMadrid2026Seedings(),
        seedingsStatus: 'official',
        notes: 'Defending champion: Casper Ruud. Withdrawals: Carlos Alcaraz (wrist), Novak Djokovic (shoulder), Taylor Fritz (knee), Frances Tiafoe, Jack Draper (knee).',
      };
      writeAuthCacheWithTimestamp(cacheKey, hardcoded);
      return hardcoded;
    }
  }

  writeAuthCacheWithTimestamp(cacheKey, normalizedData);
  return normalizedData;
}

/**
 * Fetch the 64-player draw for an ATP Masters 1000 bracket.
 * Returns up to 32 seeded players (from AI/official seedings) plus qualifier slots.
 * Used by generateMastersBracket() to build the pool/bracket draw.
 */
export async function fetchMastersDrawPlayers(
  tournamentId: string,
  tournamentName: string,
): Promise<Array<{ name: string; seed?: number; country?: string }>> {
  const details = await fetchMastersTournamentDetails(tournamentId, tournamentName);
  const seeded = details.seedings.map(p => ({
    name: p.name,
    seed: p.seed,
    country: p.country,
  }));

  // Fill remaining spots to reach 64 with qualifier placeholders
  const players: Array<{ name: string; seed?: number; country?: string }> = [...seeded];
  const unseededCount = 64 - seeded.length;
  for (let i = 1; i <= unseededCount; i++) {
    players.push({ name: `Qualifier ${i}`, seed: undefined, country: '' });
  }
  return players;
}

/**
 * Fetch the official ATP Masters singles draw transformed into an ordered
 * 64-slot array (the app's Round-of-64 view: seed vs "winner of R1 pairing").
 *
 * For 96-player Masters draws (e.g. Madrid, Rome):
 *   - Top 32 seeds have first-round byes and occupy the odd-numbered bracket positions.
 *   - The even-numbered positions are filled by first-round match winners, represented
 *     as "Winner: Player A vs Player B" placeholders.
 *   - The AI may return up to 96 (or 128) draw entries; normalizeMastersOfficialDrawSlots
 *     will compact them into exactly 64 sequential slots.
 *
 * During draw-released and live phases the drawStatus gate is relaxed: if the AI labels
 * the response "predicted" but supplies ≥32 real player names, it is accepted as official.
 *
 * Returns null when no usable draw data can be extracted and no fallback is available.
 */
export async function fetchMastersOfficialDrawPlayers(
  tournamentId: string,
  tournamentName: string,
): Promise<Array<{ name: string; seed?: number; country?: string }> | null> {
  const currentYear = Number(TODAY_STR.slice(0, 4));
  const staticMeta = getMastersTournamentById(tournamentId);
  const phase = getTournamentPhase(staticMeta?.approxStart, staticMeta?.approxEnd);

  const daysToStartImminent = staticMeta?.approxStart ? daysUntil(staticMeta.approxStart) : 999;
  const isImminent = daysToStartImminent <= 7 || phase === 'live';

  // Versioned cache key includes year-month to auto-invalidate across tournament editions.
  const cacheKey = drawCacheKey(tournamentId, staticMeta?.approxStart);
  const drawCacheExpiry = phaseCacheTtl(phase);

  const isMadrid2026 = tournamentId === 'madrid' && currentYear === 2026;

  const cached = readAuthCacheIfFresh<MastersOfficialDrawResponse>(cacheKey, drawCacheExpiry);
  let cachedOfficialSlots: MastersOfficialDrawSlot[] | null = null;
  if (cached?.drawStatus === 'official') {
    const cachedSlots = normalizeMastersOfficialDrawSlots(cached.drawPlayers);
    if (cachedSlots.length >= 64) {
      cachedOfficialSlots = cachedSlots;
      // During draw-released/live we still re-fetch for freshness, but keep cached official
      // data as a fallback if the live fetch fails.
      if (phase !== 'draw-released' && phase !== 'live') {
        return cachedSlots.map((p) => ({
          name: p.name,
          seed: p.seed,
          country: p.country,
        }));
      }
    }
  }

  if (!isImminent) {
    if (cachedOfficialSlots?.length === 64) {
      return cachedOfficialSlots.map((p) => ({
        name: p.name,
        seed: p.seed,
        country: p.country,
      }));
    }
    return null;
  }

  if (tournamentId === 'madrid' && currentYear === 2026 && isOfficialDataExpectedPhase(phase)) {
    const drawSlots = getMadrid2026OfficialDrawSlots();
    const normalizedSlots = normalizeMastersOfficialDrawSlots(drawSlots);
    if (normalizedSlots.length >= 64) {
      const fallbackData: MastersOfficialDrawResponse = {
        drawStatus: 'official',
        notes: 'Official 2026 Mutua Madrid Open draw (hardcoded).',
        drawPlayers: normalizedSlots,
      };
      writeAuthCacheWithTimestamp(cacheKey, fallbackData);
      return normalizedSlots.map((p) => ({
        name: p.name,
        seed: p.seed,
        country: p.country,
      }));
    }
  }

  if (!aiAvailable) {
    if (cachedOfficialSlots?.length === 64) {
      return cachedOfficialSlots.map((p) => ({
        name: p.name,
        seed: p.seed,
        country: p.country,
      }));
    }
    return null;
  }

  const approxStart = staticMeta?.approxStart;
  const daysToStart = approxStart ? daysUntil(approxStart) : 999;
  const parsedYear = approxStart && /^\d{4}-\d{2}-\d{2}$/.test(approxStart)
    ? Number(approxStart.slice(0, 4))
    : currentYear;
  const year = parsedYear >= currentYear - 1 && parsedYear <= currentYear + 1
    ? parsedYear
    : currentYear;

  const drawImminentNote = buildDrawImminenceNote(approxStart, daysToStart);
  const urlHints = buildTournamentUrlHints(tournamentId, year);

  // 96-player draw format hint for tournaments that use it (Madrid, Rome).
  const is96PlayerDraw = tournamentId === 'madrid' || tournamentId === 'rome';
  const drawFormatNote = is96PlayerDraw
    ? `FORMAT NOTE: This is a 96-player draw where the top 32 seeds have first-round byes. Return the full 128-slot draw from round 1 through the final. In round 1, seeded players should be paired with BYE placeholders and non-seeded players should be paired with their actual first-round opponents.
If both players in a bracket slot are named (no bye), list both. For the paired qualifiers, use the actual matchup names rather than compressing the draw.`
    : '';

  const drawUrlConfig = TOURNAMENT_DRAW_URLS[tournamentId];
  const sourceHint = drawUrlConfig?.protennisliveCode
    ? `PREFER the official ATP posting PDF at https://www.protennislive.com/posting/${year}/${drawUrlConfig.protennisliveCode}/mds.pdf as the authoritative source for the draw ordering.`
    : '';

  const targetDrawSize = is96PlayerDraw ? 128 : 64;
  const drawSizeNote = is96PlayerDraw
    ? 'This tournament uses a 96-player Masters format. Return exactly 128 draw slots, including BYE placeholders for the seeded byes in round 1.'
    : 'Return exactly 64 draw slots.';

  const phaseInstruction = (phase === 'draw-released' || phase === 'live')
    ? `CRITICAL: Today is ${TODAY_STR}. The draw has been published — set "drawStatus" to "official". Do NOT return "predicted" if you find draw information from any source published in the last 14 days.`
    : '';

  const prompt = `${drawImminentNote}${phaseInstruction ? ' ' + phaseInstruction : ''} Find the official ATP men's singles main-draw bracket for "${tournamentName}" (${year}) and transform it into the app's ${targetDrawSize}-slot representation.

${urlHints}
${drawFormatNote}

${sourceHint}

${drawSizeNote}

Rules:
- If an official draw is published (even if released very recently), set "drawStatus" to "official".
- If genuinely not yet published, set "drawStatus" to "predicted" and return an empty "drawPlayers" array.
 - For "official", return exactly ${targetDrawSize} "drawPlayers" items ordered from slot 1 (top of bracket) to slot ${targetDrawSize} (bottom).
 - For 96-player Masters draws, preserve the official 128-slot order exactly as published in the ATP posting PDF. Seeded players must occupy BYE slots in round 1, and first-round matchups must appear in the official top-to-bottom sequence.
 - Each slot object must include:
   - "slot": integer 1..${targetDrawSize}
   - "name": player's full name, OR use the exact format "Winner: Player A vs Player B" only for unresolved placeholders when the first-round match winner is not yet known.
   - "seed": integer tournament seed when known (1-32), else null
   - "country": ISO 3166-1 alpha-3 3-letter code when known, else null
- Keep slot ordering aligned with the official bracket (top-to-bottom).
- Return only JSON (no markdown).

Output JSON object shape:
{
  "drawStatus": "official" | "predicted",
  "notes": string | null,
  "drawPlayers": [{ "slot": number, "name": string, "seed": number|null, "country": string|null }]
}`;

  const drawSlotSchema = {
    type: Type.OBJECT,
    properties: {
      slot: { type: Type.INTEGER },
      name: { type: Type.STRING },
      seed: { type: Type.INTEGER, nullable: true },
      country: { type: Type.STRING, nullable: true },
    },
    required: ['slot', 'name'],
  };

  const schema = {
    type: Type.OBJECT,
    properties: {
      drawStatus: { type: Type.STRING },
      notes: { type: Type.STRING, nullable: true },
      drawPlayers: { type: Type.ARRAY, items: drawSlotSchema },
    },
    required: ['drawStatus', 'drawPlayers'],
  };

  let data: MastersOfficialDrawResponse | null = null;

  // Tier 1: Grounded Search — uses extractJsonObject for robust extraction from prose-wrapped responses.
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    data = extractJsonObject(response.text || '') as unknown as MastersOfficialDrawResponse | null;
  } catch (e) {
    console.warn('Masters draw Tier 1 (Grounded) error:', e);
  }

  // Tier 2: Structured output — reliable JSON from model knowledge.
  if (!data || !Array.isArray(data.drawPlayers)) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || 'null');
    } catch (e) {
      console.warn('Masters draw Tier 2 (Structured) error:', e);
    }
  }

  if (!data || data.drawStatus !== 'official') {
    // Last resort for known tournaments with locally-available official data.
    if (tournamentId === 'madrid' && currentYear === 2026) {
      console.info('Masters draw: AI failed for madrid 2026 — using hardcoded official draw.');
      const drawSlots = getMadrid2026OfficialDrawSlots();
      const fallbackData: MastersOfficialDrawResponse = {
        drawStatus: 'official',
        notes: 'Official 2026 Mutua Madrid Open draw (hardcoded fallback from protennislive.com/posting/2026/1536/mds.pdf).',
        drawPlayers: drawSlots.map((p, i) => ({ slot: i + 1, name: p.name, seed: p.seed, country: p.country })),
      };
      writeAuthCacheWithTimestamp(cacheKey, fallbackData);
      return drawSlots;
    }
    if (cachedOfficialSlots?.length >= 64) {
      return cachedOfficialSlots.map((p) => ({
        name: p.name,
        seed: p.seed,
        country: p.country,
      }));
    }
    return null;
  }

  const normalizedSlots = normalizeMastersOfficialDrawSlots(data.drawPlayers);
  if (normalizedSlots.length < 64) {
    // Even normalization failed — try hardcoded last resort before giving up.
    if (tournamentId === 'madrid' && currentYear === 2026) {
      console.info('Masters draw: normalization failed for madrid 2026 — using hardcoded official draw.');
      const drawSlots = getMadrid2026OfficialDrawSlots();
      const fallbackData: MastersOfficialDrawResponse = {
        drawStatus: 'official',
        notes: 'Official 2026 Mutua Madrid Open draw (hardcoded fallback).',
        drawPlayers: drawSlots,
      };
      writeAuthCacheWithTimestamp(cacheKey, fallbackData);
      return drawSlots;
    }
    if (cachedOfficialSlots?.length >= 64) {
      return cachedOfficialSlots.map((p) => ({
        name: p.name,
        seed: p.seed,
        country: p.country,
      }));
    }
    return null;
  }

  const normalizedData: MastersOfficialDrawResponse = {
    drawStatus: 'official',
    notes: hasUsableValue(data.notes) ? data.notes : undefined,
    drawPlayers: normalizedSlots,
  };
  writeAuthCacheWithTimestamp(cacheKey, normalizedData);

  return normalizedSlots.map((p) => ({
    name: p.name,
    seed: p.seed,
    country: p.country,
  }));
}

// ── Live tournament results ────────────────────────────────────────────────────

/** A single completed match result from a live tournament. */
export interface LiveMatchResult {
  /** Round number (1=First Round, 2=Second Round, …, 6=Final for Masters). */
  round: number;
  /** Full name of the winning player, matching the draw exactly where possible. */
  winnerName: string;
  /** Full name of the losing player. */
  loserName: string;
}

/**
 * Fetch completed match results for an ATP Masters 1000 tournament that is currently live.
 *
 * Uses a 3-minute cache during live play. Returns an empty array when the tournament
 * hasn't started yet, all tiers fail, or no completed matches are found.
 */
export async function fetchMastersTournamentResults(
  tournamentId: string,
  tournamentName: string,
  year: number,
): Promise<LiveMatchResult[]> {
  const cacheKey = `tennis_live_results_v1_${tournamentId}_${year}`;
  const cached = readAuthCacheIfFresh<LiveMatchResult[]>(cacheKey, LIVE_DATA_CACHE_EXPIRY_LIVE);
  if (cached && Array.isArray(cached) && cached.length > 0) return cached;

  const urls = TOURNAMENT_DRAW_URLS[tournamentId];
  const urlHints = urls
    ? `Live scores and results:\n1. https://www.atptour.com/en/scores/current/${urls.atpPath}/results\n2. https://en.wikipedia.org/wiki/${year}_${urls.wikiTitle}_%E2%80%93_Men%27s_singles`
    : '';

  const prompt = `Today is ${TODAY_STR}. The ${year} ${tournamentName} ATP Masters 1000 tournament is currently in progress.
${urlHints}

Search for completed match results from this tournament. Return ONLY matches that have already been played — do NOT predict or guess unplayed matches.

For each completed match provide:
- "round": 1=First Round, 2=Second Round, 3=Third Round, 4=Quarterfinals, 5=Semifinals, 6=Final
- "winnerName": full name of the winning player exactly as listed in the official draw
- "loserName": full name of the losing player

Return JSON:
{
  "currentRound": number,
  "completedResults": [{ "round": number, "winnerName": string, "loserName": string }]
}

If no matches have been played yet, return { "currentRound": 1, "completedResults": [] }.
Return only JSON, no markdown.`;

  const resultSchema = {
    type: Type.OBJECT,
    properties: {
      round: { type: Type.INTEGER },
      winnerName: { type: Type.STRING },
      loserName: { type: Type.STRING },
    },
    required: ['round', 'winnerName', 'loserName'],
  };

  const schema = {
    type: Type.OBJECT,
    properties: {
      currentRound: { type: Type.INTEGER },
      completedResults: { type: Type.ARRAY, items: resultSchema },
    },
    required: ['currentRound', 'completedResults'],
  };

  let data: { currentRound: number; completedResults: LiveMatchResult[] } | null = null;

  // Tier 1: Grounded Search for live results — real-time match data via Google Search.
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const extracted = extractJsonObject(response.text || '');
    if (extracted && Array.isArray((extracted as Record<string, unknown>).completedResults)) {
      data = extracted as unknown as typeof data;
    }
  } catch (e) {
    console.warn('Live results Tier 1 (Grounded) error:', e);
  }

  // Tier 2: Structured output — reliable JSON from model knowledge.
  if (!data) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: schema },
      });
      data = JSON.parse(response.text || 'null');
    } catch (e) {
      console.warn('Live results Tier 2 (Structured) error:', e);
    }
  }

  const results: LiveMatchResult[] = data?.completedResults ?? [];
  if (results.length > 0) {
    writeAuthCacheWithTimestamp(cacheKey, results);
  }
  return results;
}
