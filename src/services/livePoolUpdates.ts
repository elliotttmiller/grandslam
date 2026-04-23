import { buildBracketFromDraw, applyByesToBracket, applyLiveResults, type Match } from '@/lib/bracket-utils';
import { fetchMastersOfficialDrawPlayers, fetchMastersTournamentResults } from '@/services/geminiService';
import { MASTERS_TOURNAMENTS } from '@/lib/masters-tournaments';

const MASTER_TOURNAMENT_IDS = new Set(MASTERS_TOURNAMENTS.map((t) => t.id));

function parseTournamentYear(tournamentName: string): number {
  const match = tournamentName.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

export async function refreshMastersPoolMatches(
  tournamentId: string,
  tournamentName: string,
): Promise<Match[] | null> {
  if (!MASTER_TOURNAMENT_IDS.has(tournamentId)) return null;

  const officialDrawPlayers = await fetchMastersOfficialDrawPlayers(tournamentId, tournamentName);
  if (!officialDrawPlayers || officialDrawPlayers.length < 64) return null;

  const players = officialDrawPlayers.map((p, i) => ({
    id: `p${i + 1}`,
    name: p.name,
    seed: p.seed,
    country: p.country,
  }));

  let matches = applyByesToBracket(buildBracketFromDraw(players));

  const year = parseTournamentYear(tournamentName);
  try {
    const liveResults = await fetchMastersTournamentResults(tournamentId, tournamentName, year);
    if (liveResults.length > 0) {
      matches = applyLiveResults(matches, liveResults);
    }
  } catch (error) {
    console.warn('Failed to refresh live ATP results for Masters pool:', error);
  }

  return matches;
}
