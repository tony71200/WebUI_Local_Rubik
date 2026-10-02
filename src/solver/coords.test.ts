import { expect, it } from 'vitest';
import { identityCubie, type CubieCube } from '../core/cubie.ts';
import {
  MOVES, MOVE_CUBES, N_FLIP, N_PERM4, N_PERM8, N_SLICE, N_TWIST, PHASE2_MOVES,
  getCornerPerm, getEdgePerm, getFlip, getSlice, getSlicePerm, getTwist,
  permFromIndex, permIndex, setCornerPerm, setEdgePerm, setFlip, setSlice, setSlicePerm, setTwist,
} from './coords.ts';

it('lists 18 face moves and the 10 G1 moves', () => {
  expect(MOVES.slice(0, 6)).toEqual(['U', 'U2', "U'", 'R', 'R2', "R'"]);
  expect(PHASE2_MOVES.map((m) => MOVES[m])).toEqual(['U', 'U2', "U'", 'D', 'D2', "D'", 'R2', 'L2', 'F2', 'B2']);
});

it('is zero on the solved cube', () => {
  const c = identityCubie();
  expect([getTwist(c), getFlip(c), getSlice(c), getCornerPerm(c), getEdgePerm(c), getSlicePerm(c)]).toEqual([0, 0, 0, 0, 0, 0]);
});

it('round-trips every coordinate', () => {
  const cases: [number, (i: number) => CubieCube, (c: CubieCube) => number][] = [
    [N_TWIST, setTwist, getTwist], [N_FLIP, setFlip, getFlip], [N_SLICE, setSlice, getSlice],
    [N_PERM8, setCornerPerm, getCornerPerm], [N_PERM8, setEdgePerm, getEdgePerm], [N_PERM4, setSlicePerm, getSlicePerm],
  ];
  for (const [n, set, get] of cases) for (let i = 0; i < n; i++) expect(get(set(i))).toBe(i);
});

it('ranks permutations bijectively', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const p = permFromIndex(i, 4);
    expect(permIndex(p)).toBe(i);
    seen.add(p.join());
  }
  expect(seen.size).toBe(24);
});

it('keeps G1 moves inside G1', () => {
  for (const m of PHASE2_MOVES) {
    const c = MOVE_CUBES[m];
    expect([getTwist(c), getFlip(c), getSlice(c)]).toEqual([0, 0, 0]);
  }
});
