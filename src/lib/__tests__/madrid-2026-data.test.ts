import { describe, expect, it } from 'vitest';
import { getMadrid2026OfficialDrawSlots } from '@/lib/madrid-2026-data';

describe('Madrid 2026 draw data', () => {
  it('returns the full official 128-slot draw', () => {
    const slots = getMadrid2026OfficialDrawSlots();
    expect(slots.length).toBe(128);
    expect(slots[0]).toEqual(expect.objectContaining({ name: expect.any(String), seed: expect.any(Number) }));
    expect(slots[127]).toEqual(expect.objectContaining({ name: expect.any(String) }));
  });
});
