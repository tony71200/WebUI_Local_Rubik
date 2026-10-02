import { expect, it } from 'vitest';
import { ease } from './ease.ts';

it('eases from 0 to 1, fast then slow, never going back', () => {
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  expect(ease(0.5)).toBeGreaterThan(0.85);
  let prev = 0;
  for (let k = 1; k <= 100; k++) {
    const y = ease(k / 100);
    expect(y).toBeGreaterThanOrEqual(prev);
    prev = y;
  }
});
