import { GoogleGenAI, Type } from "@google/genai";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PlayerData {
  name: string;
  seed: number;
  country: string;
}

export interface TournamentScheduleEntry {
  /** One of "ao" | "rg" | "wim" | "uso" */
  id: string;
  /** Full tournament name, e.g. "Australian Open" */
  name: string;
  /** ISO date string, e.g. "2026-01-12" */
  startDate: string;
  /** ISO date string, e.g. "2026-01-25" */
  endDate: string;
  /** Host city, e.g. "Melbourne" */
  location: string;
}

interface PlayerCacheEntry {
  players: PlayerData[];
  fetchedAt: number;
}

interface ScheduleCacheEntry {
  schedule: TournamentScheduleEntry[];
  fetchedAt: number;
  year: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PRIMARY_MODEL = "gemini-2.5-flash-preview-04-17";
const FALLBACK_MODEL = "gemini-2.0-flash";

const PLAYER_KEY_PREFIX  = "grandslam_players_";
const SCHEDULE_KEY       = "grandslam_schedule";
/** Player data is considered fresh for 24 hours. */
const PLAYER_TTL_MS      = 24 * 60 * 60 * 1000;
/** Schedule is considered fresh for 24 hours. */
const SCHEDULE_TTL_MS    = 24 * 60 * 60 * 1000;

// ─── In-memory cache (module singleton) ───────────────────────────────────────
const memCache = new Map<string, PlayerCacheEntry>();

// ─── localStorage helpers ─────────────────────────────────────────────────────
function playerStorageKey(tournamentName: string): string {
  return PLAYER_KEY_PREFIX + tournamentName.toLowerCase().replace(/\s+/g, "_");
}

function loadPlayerFromStorage(tournamentName: string): PlayerCacheEntry | null {
  try {
    const raw = localStorage.getItem(playerStorageKey(tournamentName));
    if (!raw) return null;
    const entry = JSON.parse(raw) as PlayerCacheEntry;
    if (Date.now() - entry.fetchedAt > PLAYER_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function savePlayerToStorage(tournamentName: string, entry: PlayerCacheEntry): void {
  try {
    localStorage.setItem(playerStorageKey(tournamentName), JSON.stringify(entry));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

function removePlayerFromStorage(tournamentName: string): void {
  try {
    localStorage.removeItem(playerStorageKey(tournamentName));
  } catch { /* ignore */ }
}

function loadScheduleFromStorage(): ScheduleCacheEntry | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ScheduleCacheEntry;
    if (Date.now() - entry.fetchedAt > SCHEDULE_TTL_MS) return null;
    if (entry.year !== new Date().getFullYear()) return null;
    return entry;
  } catch {
    return null;
  }
}

function saveScheduleToStorage(entry: ScheduleCacheEntry): void {
  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(entry));
  } catch { /* ignore */ }
}

// ─── Public cache management ──────────────────────────────────────────────────
export function clearPlayerCache(tournamentName?: string): void {
  if (tournamentName) {
    memCache.delete(tournamentName.toLowerCase());
    removePlayerFromStorage(tournamentName);
  } else {
    memCache.clear();
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(PLAYER_KEY_PREFIX)) localStorage.removeItem(key);
      }
    } catch { /* ignore */ }
  }
}

export function clearScheduleCache(): void {
  try {
    localStorage.removeItem(SCHEDULE_KEY);
  } catch { /* ignore */ }
}

/**
 * Synchronously read the cached schedule from localStorage.
 * Returns null if no valid cache exists. Used for instant initialisation without
 * an async call.
 */
export function getCachedSchedule(): TournamentScheduleEntry[] | null {
  return loadScheduleFromStorage()?.schedule ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "No Gemini API key is configured. Add GEMINI_API_KEY to your environment."
    );
  }
  return key;
}

// ─── Tournament schedule ──────────────────────────────────────────────────────
/**
 * Fetch the official start/end dates for all four Grand Slams in the current year.
 * Results are cached in localStorage for 24 hours.
 */
export async function fetchTournamentSchedule(
  forceRefresh = false
): Promise<TournamentScheduleEntry[]> {
  if (!forceRefresh) {
    const cached = loadScheduleFromStorage();
    if (cached) {
      console.info("[GeminiService] Schedule cache HIT");
      return cached.schedule;
    }
  }

  const apiKey = requireApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const currentYear = new Date().getFullYear();

  const prompt =
    `You are a tennis data expert. Provide the official, confirmed start and end dates ` +
    `for all four Grand Slam tennis tournaments in ${currentYear}. ` +
    `Return a JSON array of exactly 4 objects. Each object must have: ` +
    `"id" (exactly one of "ao", "rg", "wim", "uso"), ` +
    `"name" (full official tournament name), ` +
    `"startDate" (ISO 8601 date, YYYY-MM-DD), ` +
    `"endDate" (ISO 8601 date, YYYY-MM-DD), ` +
    `"location" (host city name only). ` +
    `Use only officially confirmed/announced dates for ${currentYear}. ` +
    `If a ${currentYear} date has not yet been officially announced, use the most recently confirmed schedule.`;

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id:        { type: Type.STRING },
        name:      { type: Type.STRING },
        startDate: { type: Type.STRING },
        endDate:   { type: Type.STRING },
        location:  { type: Type.STRING },
      },
      required: ["id", "name", "startDate", "endDate", "location"],
    },
  };

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.info(`[GeminiService] Fetching schedule via ${model}…`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema },
      });
      const parsed: unknown = JSON.parse(response.text ?? "[]");
      if (Array.isArray(parsed) && parsed.length === 4) {
        const schedule = parsed as TournamentScheduleEntry[];
        const entry: ScheduleCacheEntry = {
          schedule,
          fetchedAt: Date.now(),
          year: currentYear,
        };
        saveScheduleToStorage(entry);
        console.info(`[GeminiService] Schedule fetched & cached (${model})`);
        return schedule;
      }
      console.warn(`[GeminiService] ${model} returned unexpected schedule data`);
    } catch (err) {
      console.warn(`[GeminiService] ${model} failed for schedule:`, err);
    }
  }

  throw new Error("Failed to fetch tournament schedule from Gemini.");
}

// ─── Player fetch ─────────────────────────────────────────────────────────────
/**
 * Fetch the top-32 seeded players for a Grand Slam tournament from Gemini.
 *
 * Results are cached in memory AND localStorage (24 h TTL).
 * Pass `forceRefresh: true` only when the user explicitly triggers a refresh.
 *
 * Throws if the API key is missing or all models fail — no mock fallback.
 */
export async function fetchTournamentPlayers(
  tournamentName: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
): Promise<PlayerData[]> {
  // ── 1. Return from cache unless a refresh was requested ──────────────────
  if (!forceRefresh) {
    const key = tournamentName.toLowerCase();

    const memHit = memCache.get(key);
    if (memHit) {
      console.info(`[GeminiService] Player cache HIT (memory) for "${tournamentName}"`);
      return memHit.players;
    }

    const storageHit = loadPlayerFromStorage(tournamentName);
    if (storageHit) {
      memCache.set(key, storageHit);
      console.info(`[GeminiService] Player cache HIT (localStorage) for "${tournamentName}"`);
      return storageHit.players;
    }
  }

  // ── 2. Fetch from Gemini ──────────────────────────────────────────────────
  const apiKey = requireApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const currentYear = new Date().getFullYear();

  const prompt =
    `You are a tennis data expert. List the top 32 seeded players for the ` +
    `${tournamentName} ${currentYear} tournament. ` +
    `If ${currentYear} seedings are not yet published, use the most recently announced seedings. ` +
    `Return a JSON array of exactly 32 objects ordered by seed (1 = top seed). ` +
    `Each object must have: "name" (full player name), "seed" (integer 1–32), ` +
    `"country" (3-letter IOC country code).`;

  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name:    { type: Type.STRING },
        seed:    { type: Type.INTEGER },
        country: { type: Type.STRING },
      },
      required: ["name", "seed", "country"],
    },
  };

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.info(`[GeminiService] Fetching "${tournamentName}" players via ${model}…`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema },
      });
      const parsed: unknown = JSON.parse(response.text ?? "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        const players = parsed as PlayerData[];
        const entry: PlayerCacheEntry = { players, fetchedAt: Date.now() };
        const key = tournamentName.toLowerCase();
        memCache.set(key, entry);
        savePlayerToStorage(tournamentName, entry);
        console.info(
          `[GeminiService] Fetched & cached ${players.length} players for "${tournamentName}" (${model})`
        );
        return players;
      }
      console.warn(`[GeminiService] ${model} returned empty player list`);
    } catch (err) {
      console.warn(`[GeminiService] ${model} failed for players:`, err);
    }
  }

  throw new Error(`Failed to fetch players for "${tournamentName}" from Gemini.`);
}
