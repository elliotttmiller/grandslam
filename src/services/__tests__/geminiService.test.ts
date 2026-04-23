import { describe, expect, it } from 'vitest';
import { buildTournamentUrlHints, extractJsonObject, getTournamentPhase } from '@/services/geminiService';

describe('geminiService helpers', () => {
  it('builds tournament draw source hints for Madrid', () => {
    const hints = buildTournamentUrlHints('madrid', 2026);
    expect(hints).toContain('https://www.protennislive.com/posting/2026/1536/mds.pdf');
    expect(hints).toContain('https://www.atptour.com/en/scores/current/madrid/1536/draws');
    expect(hints).toContain('https://en.wikipedia.org/wiki/2026_Mutua_Madrid_Open_%E2%80%93_Men%27s_singles');
  });

  it('extracts JSON from a prose-wrapped response', () => {
  const text = `Here is the updated bracket data:\n\n\`\`\`json\n{\n  "drawStatus": "official",\n  "drawPlayers": [{"slot":1,"name":"Player A","seed":1,"country":"USA"}]\n}\n\`\`\`\n\nUse this object.`;
    const output = extractJsonObject(text);
    expect(output).toEqual({
      drawStatus: 'official',
      drawPlayers: [{ slot: 1, name: 'Player A', seed: 1, country: 'USA' }],
    });
  });

  it('computes tournament phases correctly', () => {
    expect(getTournamentPhase('2099-01-01', '2099-01-15')).toBe('pre-draw');
    expect(getTournamentPhase('2024-12-31', '2025-01-15')).toBe('live');
  });
});
