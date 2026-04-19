/// <reference types="vite/client" />
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { authGetItem, authSetItem } from '@/lib/auth-storage';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.warn('VITE_GEMINI_API_KEY is not set. Gemini features will not work.');
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const TODAY_STR = new Date().toISOString().split('T')[0];
const GROUNDING_MODEL = "gemini-2.5-flash";
const PRIMARY_MODEL = "gemini-3.1-flash-lite-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";

export const CACHE_KEY_TOURNAMENTS = 'tennis_tournaments_cache_v5';
const CACHE_KEY_PLAYERS_PREFIX = 'tennis_players_cache_v5_';
export const CACHE_KEY_MASTERS_PREFIX = 'tennis_masters_details_v1_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const LIVE_TOURNAMENT_CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour
const LIVE_MASTERS_CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour

export interface TournamentData {
  id: string;
  name: string;
  startDate: string; // ISO format
  endDate: string;
  logo?: string;
  /** Distinguishes Grand Slam from ATP Masters 1000 entries. */
  type?: 'grand-slam' | 'masters';
}

function readFreshAuthCache<T>(key: string, maxAgeMs: number): T | null {
  const raw = authGetItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > maxAgeMs) return null;
    return parsed.data as T;
  } catch {
    return null;
  }
}

function writeAuthCache<T>(key: string, data: T): void {
  authSetItem(key, JSON.stringify({ data, timestamp: Date.now() }));
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

export async function fetchTournamentsWithDates() {
  // Check user-scoped cache first (short-lived so dates stay fresh).
  const cached = readFreshAuthCache<TournamentData[]>(CACHE_KEY_TOURNAMENTS, LIVE_TOURNAMENT_CACHE_EXPIRY);
  if (cached && cached.length > 0) {
    return cached;
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

  // Tier 1: Grounded Search
  try {
    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    data = extractJsonArray(response.text || "");
  } catch (e) {
    console.warn("Tier 1 (Grounded) error:", e);
  }

  // Tier 2: Primary Model (Structured)
  if (!data || data.length === 0) {
    try {
      const response = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        },
      });
      data = JSON.parse(response.text || "[]");
    } catch (e) {
      console.warn("Tier 2 (Primary) error:", e);
    }
  }

  // Tier 3: Fallback Model (Structured)
  if (!data || data.length === 0) {
    try {
      const response = await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || "[]");
    } catch (e) {
      console.warn("Tier 3 (Fallback) error:", e);
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
    // Ensure all four Grand Slams are present; backfill any missing from fallback
    const REQUIRED_IDS = ['ao', 'rg', 'wim', 'uso'];
    for (const fb of fallback) {
      if (!data.find(t => t.id === fb.id)) {
        data.push(fb);
      }
    }
    // Filter out unrecognised entries (keep only the four Grand Slams)
    data = data.filter(t => REQUIRED_IDS.includes(t.id));
    writeAuthCache(CACHE_KEY_TOURNAMENTS, data);
    return data as TournamentData[];
  }

  console.error("All AI models failed to fetch tournaments with dates.");
  // Fallback to basic list if all AI tiers fail
  return fallback;
}

export async function fetchTournamentPlayers(tournamentName: string) {
  const cacheKey = `${CACHE_KEY_PLAYERS_PREFIX}${tournamentName.replace(/\s+/g, '_').toLowerCase()}`;
  
  // Check cache first
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_EXPIRY) {
      return data;
    }
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

  // Tier 1: Grounded Search
  try {
    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
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
    console.warn("Tier 1 (Grounded) error:", e);
  }

  // Tier 2: Primary Model (Structured)
  try {
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      },
    });
    data = JSON.parse(response.text || "[]");
    if (data && data.length === 32) {
      localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
      return data;
    }
    console.warn(`Tier 2 (Primary) failed: returned ${data?.length} players instead of 32.`);
  } catch (e) {
    console.warn("Tier 2 (Primary) error:", e);
  }

  // Tier 3: Fallback Model (Structured)
  try {
    const response = await ai.models.generateContent({
      model: FALLBACK_MODEL,
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
    console.warn(`Tier 3 (Fallback) failed: returned ${data?.length} players instead of 32.`);
  } catch (e) {
    console.warn("Tier 3 (Fallback) error:", e);
  }
  
  console.warn("All AI models failed to generate exactly 32 players. Using fallback player list.");
  return FALLBACK_PLAYERS;
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

/**
 * Fetch comprehensive details for an ATP Masters 1000 tournament using the Gemini AI.
 * Returns cached results for 24 hours to avoid hitting rate limits.
 */
export async function fetchMastersTournamentDetails(
  tournamentId: string,
  tournamentName: string,
): Promise<MastersTournamentDetails> {
  const cacheKey = `${CACHE_KEY_MASTERS_PREFIX}${tournamentId}`;

  // Check user-scoped cache first (short-lived so details stay current).
  const cached = readFreshAuthCache<MastersTournamentDetails>(cacheKey, LIVE_MASTERS_CACHE_EXPIRY);
  if (cached) {
    return cached;
  }

  const prompt = `Today is ${TODAY_STR}. Find the most accurate and up-to-date information about the 2026 ATP Masters 1000 men's singles tournament: "${tournamentName}".

Return a JSON object with these fields:
- "id": "${tournamentId}"
- "name": full official tournament name including year (e.g. "2026 BNP Paribas Open")
- "startDate": main draw start date in YYYY-MM-DD format
- "endDate": final date in YYYY-MM-DD format
- "location": city and country (e.g. "Indian Wells, California, USA")
- "venue": full venue/stadium name (e.g. "Indian Wells Tennis Garden")
- "surface": court surface (e.g. "Hard", "Clay", "Indoor Hard")
- "drawSize": number of players in main draw (usually 96 for Masters 1000)
- "prizeMoney": total prize money string (e.g. "$8,800,000") or null if unknown
- "seedings": JSON array of the top 16 seeds, each object with "seed" (number), "name" (string), "country" (3-letter code), "ranking" (ATP ranking number). If official seedings are not yet available, provide AI-predicted seedings based on current ATP rankings with surface adjustments.
- "seedingsStatus": "official" if official draw has been released, otherwise "predicted"
- "notes": one sentence of current context about this tournament (e.g. defending champion, key absences) or null

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

  // Tier 1: Grounded Search (most accurate real-time data)
  try {
    const response = await ai.models.generateContent({
      model: GROUNDING_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const text = response.text || '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      data = JSON.parse(text.substring(start, end + 1));
    }
  } catch (e) {
    console.warn('Masters Tier 1 (Grounded) error:', e);
  }

  // Tier 2: Primary Model (Structured output)
  if (!data || !data.seedings?.length) {
    try {
      const response = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });
      data = JSON.parse(response.text || 'null');
    } catch (e) {
      console.warn('Masters Tier 2 (Primary) error:', e);
    }
  }

  // Tier 3: Fallback Model
  if (!data || !data.seedings?.length) {
    try {
      const response = await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      data = JSON.parse(response.text || 'null');
    } catch (e) {
      console.warn('Masters Tier 3 (Fallback) error:', e);
    }
  }

  if (data && data.seedings) {
    writeAuthCache(cacheKey, data);
    return data;
  }

  // Last-resort fallback using static data
  const fallback: MastersTournamentDetails = {
    id: tournamentId,
    name: `2026 ${tournamentName}`,
    startDate: '',
    endDate: '',
    location: 'Location unavailable',
    venue: 'Venue unavailable',
    surface: 'Hard',
    drawSize: 96,
    seedings: FALLBACK_PLAYERS.slice(0, 16).map(p => ({ ...p, ranking: undefined })),
    seedingsStatus: 'predicted',
    notes: 'Live data unavailable. Showing approximate predicted seedings.',
  };
  return fallback;
}

/**
 * Fetch the 64-player draw for an ATP Masters 1000 bracket.
 * Returns 16 seeded players (from AI/official seedings) plus 48 qualifier slots.
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
