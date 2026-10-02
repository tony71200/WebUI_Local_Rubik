import { expect, it } from 'vitest';
import { mulberry32 } from './prng.ts';

it('is deterministic per seed and stays in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xs = Array.from({ length: 1000 }, a);
  expect(xs).toEqual(Array.from({ length: 1000 }, b));
  expect(xs.slice(0, 5)).not.toEqual(Array.from({ length: 5 }, c));
  expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
});
