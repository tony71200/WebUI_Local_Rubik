import { describe, expect, it } from 'vitest';
import { moveDestinations } from './cube.ts';
import { DOTS, RINGS, ringOf } from './rings.ts';

const angle = (i: number, c: readonly [number, number]) => Math.atan2(DOTS[i][1] - c[1], DOTS[i][0] - c[0]);

describe('ring projection', () => {
  it('has 9 rings of 12 distinct facelets', () => {
    expect(RINGS.map((r) => r.name).join('')).toBe('UEDRMLFSB');
    for (const r of RINGS) expect(new Set(r.ids).size).toBe(12);
  });

  it('puts every facelet on exactly 2 rings of different families', () => {
    for (let i = 0; i < 54; i++) {
      const on = RINGS.filter((r) => r.ids.includes(i));
      expect(on).toHaveLength(2);
      expect(on[0].axis).not.toBe(on[1].axis);
    }
  });

  it('places each dot on both of its circles', () => {
    for (const r of RINGS) for (const i of r.ids) {
      expect(Math.hypot(DOTS[i][0] - r.center[0], DOTS[i][1] - r.center[1])).toBeCloseTo(r.radius, 6);
    }
  });

  it('keeps dots apart', () => {
    let min = Infinity;
    for (let i = 0; i < 54; i++) for (let j = i + 1; j < 54; j++) {
      min = Math.min(min, Math.hypot(DOTS[i][0] - DOTS[j][0], DOTS[i][1] - DOTS[j][1]));
    }
    expect(min).toBeGreaterThan(14);
  });

  it('orders each ring by increasing screen angle (same cycle as the cube)', () => {
    for (const r of RINGS) {
      const byAngle = [...r.ids].sort((i, j) => angle(i, r.center) - angle(j, r.center));
      const k = byAngle.indexOf(r.ids[0]);
      expect(r.ids).toEqual([...byAngle.slice(k), ...byAngle.slice(0, k)]);
    }
  });

  it('turning a layer rotates its ring by 3 steps', () => {
    const cases: [string, string][] = [['U', 'U'], ['E', 'E'], ['D', 'D'], ['R', 'R'], ['M', 'M'], ['L', 'L'], ['F', 'F'], ['S', 'S'], ['B', 'B']];
    for (const [name, move] of cases) {
      const ring = RINGS.find((r) => r.name === name)!;
      const dest = moveDestinations(move);
      const shifts = ring.ids.map((id, k) => (ring.ids.indexOf(dest[id]) - k + 12) % 12);
      expect(new Set(shifts).size).toBe(1);
      expect([3, 9]).toContain(shifts[0]);
    }
  });

  it('finds the ring of a facelet by axis', () => {
    expect(ringOf(1, 18)?.name).toBe('U'); // front top-left sits on the U ring
    expect(ringOf(0, 18)?.name).toBe('L');
  });
});
