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
/** Model used for grounding searches (must support googleSearch tool). */
const GROUNDING_MODEL = "gemini-2.0-flash";

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

/**
 * Robustly extracts the first JSON array found anywhere in a text response.
 * Handles markdown code fences, leading prose, etc.
 */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Current date string for use in prompts, e.g. "April 10, 2026".
 */
function todayStr(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Attempt to fetch players using a Google Search–grounded Gemini call so the
 * model can retrieve real-time standings and seedings.  Returns null on any
 * failure so the caller can fall back to structured-output mode.
 */
async function fetchPlayersGrounded(
  ai: GoogleGenAI,
  tournamentName: string,
  currentYear: number
): Promise<PlayerData[] | null> {
  try {
    const prompt =
      `Today is ${todayStr()}. You are a professional tennis data analyst. ` +
      `Your task: provide the 32 seeded players for the ${tournamentName} ${currentYear}.\n\n` +
      `INSTRUCTIONS:\n` +
      `1. Search for the official ${currentYear} ${tournamentName} draw or seedings if they have been announced.\n` +
      `2. If official seedings are NOT yet available, use current ATP/WTA world rankings ` +
      `(as of today) to produce a professional pre-tournament predicted bracket. ` +
      `Base seedings strictly on current ranking order, noting that Grand Slam ` +
      `seedings follow world rankings with minor surface-specific adjustments.\n` +
      `3. Use only real, currently-active professional tennis players.\n\n` +
      `Return ONLY a valid JSON array — no prose, no markdown fences. ` +
      `Exactly 32 objects, each with:\n` +
      `  "name"    — full player name (string)\n` +
      `  "seed"    — integer 1–32\n` +
      `  "country" — 3-letter IOC country code (string)\n` +
      `Order the array by seed 1 through 32.`;

    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text ?? "";
    const parsed = extractJsonArray(text);
    if (parsed && parsed.length >= 16) {
      return parsed as PlayerData[];
    }
    console.warn("[GeminiService] Grounded response did not contain a valid player array");
    return null;
  } catch (err) {
    console.warn("[GeminiService] Grounded player fetch failed:", err);
    return null;
  }
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

  const promptText =
    `Today is ${todayStr()}. You are a tennis data expert. ` +
    `Provide the official, confirmed start and end dates for all four Grand Slam ` +
    `tennis tournaments in ${currentYear}. ` +
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

  // ── Try grounded search first for real-time date accuracy ────────────────
  try {
    console.info("[GeminiService] Fetching schedule via grounded search…");
    const groundedResponse = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: promptText + " Return ONLY a JSON array — no prose, no markdown fences.",
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    const text = groundedResponse.text ?? "";
    const parsed = extractJsonArray(text);
    if (Array.isArray(parsed) && parsed.length === 4) {
      const schedule = parsed as TournamentScheduleEntry[];
      const entry: ScheduleCacheEntry = { schedule, fetchedAt: Date.now(), year: currentYear };
      saveScheduleToStorage(entry);
      console.info("[GeminiService] Schedule fetched & cached (grounded)");
      return schedule;
    }
    console.warn("[GeminiService] Grounded schedule response was not 4 entries");
  } catch (err) {
    console.warn("[GeminiService] Grounded schedule fetch failed:", err);
  }

  // ── Fall back to structured JSON mode ─────────────────────────────────────
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      console.info(`[GeminiService] Fetching schedule via ${model}…`);
      const response = await ai.models.generateContent({
        model,
        contents: promptText,
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
 * Fetch the top-32 seeded players for a Grand Slam tournament.
 *
 * Strategy (most to least accurate):
 *  1. Google Search–grounded call  → real-time seedings or predicted rankings
 *  2. Structured JSON call (primary model) → well-formed predicted bracket
 *  3. Structured JSON call (fallback model) → same as above
 *
 * Results are cached in memory AND localStorage (24 h TTL).
 * Pass `forceRefresh: true` only when the user explicitly triggers a refresh.
 *
 * Throws if the API key is missing or all approaches fail — no mock fallback.
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

  // ── 2a. Grounded search (real-time) ───────────────────────────────────────
  console.info(`[GeminiService] Fetching "${tournamentName}" players via grounded search…`);
  const groundedPlayers = await fetchPlayersGrounded(ai, tournamentName, currentYear);
  if (groundedPlayers && groundedPlayers.length >= 16) {
    const players = groundedPlayers;
    const entry: PlayerCacheEntry = { players, fetchedAt: Date.now() };
    const key = tournamentName.toLowerCase();
    memCache.set(key, entry);
    savePlayerToStorage(tournamentName, entry);
    console.info(
      `[GeminiService] Fetched & cached ${players.length} players for "${tournamentName}" (grounded)`
    );
    return players;
  }

  // ── 2b. Structured JSON mode (fallback) ───────────────────────────────────
  const fallbackPrompt =
    `Today is ${todayStr()}. You are a professional tennis data analyst. ` +
    `Provide the 32 seeded players for the ${tournamentName} ${currentYear}.\n\n` +
    `RULES:\n` +
    `- If the official ${currentYear} ${tournamentName} seedings have been published, return those.\n` +
    `- If not yet published, produce a professional PRE-TOURNAMENT PREDICTED seeding list ` +
    `based on current ATP/WTA world rankings. Grand Slam seedings follow world rankings ` +
    `with minor surface-based adjustments. This is a legitimate expert prediction.\n` +
    `- Every player must be a real, currently active professional player.\n` +
    `- Return a JSON array of exactly 32 objects ordered by seed 1–32.\n` +
    `- Each object: "name" (full name), "seed" (integer 1–32), "country" (3-letter IOC code).`;

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
        contents: fallbackPrompt,
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
