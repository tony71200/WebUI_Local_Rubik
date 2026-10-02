import { expect, it } from 'vitest';
import { ALGO_SECTIONS } from './algo.ts';

it('has the same 6 sections in both languages, each with text', () => {
  const ids = ALGO_SECTIONS.vi.map((s) => s.id);
  expect(ids).toEqual(['model', 'invariants', 'rings', 'lbl', 'kociemba', 'gods']);
  expect(ALGO_SECTIONS.en.map((s) => s.id)).toEqual(ids);
  for (const lang of ['vi', 'en'] as const) {
    for (const s of ALGO_SECTIONS[lang]) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.html).toMatch(/^<p>/);
      expect(s.html.split('<p>').length).toBeGreaterThanOrEqual(3);
    }
  }
});
