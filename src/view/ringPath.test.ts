import { describe, expect, it } from 'vitest';
import { BASE_MOVES, moveDestinations } from '../core/cube.ts';
import { DOTS, RINGS } from '../core/rings.ts';
import { dotPosition } from './ringPath.ts';

const ALL = BASE_MOVES.flatMap((b) => [b, `${b}'`, `${b}2`]);

describe('dot animation path', () => {
  it('starts at the source dot and ends at the destination dot', () => {
    for (const m of ALL) {
      const dest = moveDestinations(m);
      for (let i = 0; i < 54; i++) {
        expect(dotPosition(m, i, 0)).toEqual(DOTS[i]);
        expect(dotPosition(m, i, 1)).toEqual(DOTS[dest[i]]);
        const mid = dotPosition(m, i, 0.999999);
        expect(mid[0]).toBeCloseTo(DOTS[dest[i]][0], 2);
        expect(mid[1]).toBeCloseTo(DOTS[dest[i]][1], 2);
      }
    }
  });

  it('slides ring dots along their circle', () => {
    const u = RINGS.find((r) => r.name === 'U')!;
    for (const i of u.ids) {
      const p = dotPosition('U', i, 0.5);
      expect(Math.hypot(p[0] - u.center[0], p[1] - u.center[1])).toBeCloseTo(u.radius, 6);
    }
  });

  it('moves ring dots in the turn direction, not backwards', () => {
    const u = RINGS.find((r) => r.name === 'U')!;
    const i = u.ids[0];
    const a0 = Math.atan2(DOTS[i][1] - u.center[1], DOTS[i][0] - u.center[0]);
    const p = dotPosition('U', i, 0.01);
    const a1 = Math.atan2(p[1] - u.center[1], p[0] - u.center[0]);
    expect(Math.sign(a1 - a0)).toBe(-1); // U has dir -1 → decreasing screen angle
  });
});
