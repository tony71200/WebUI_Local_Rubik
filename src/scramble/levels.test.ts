import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, solved, type State } from '../core/cube.ts';
import { toCubie } from '../core/cubie.ts';
import { solveCubie } from '../solver/kociemba.ts';
import { buildTables } from '../solver/tables.ts';
import { buildBall, distance } from './distance.ts';
import { DISTANCE_RANGE, canonicalWalk, generatePuzzle, type PuzzleDeps } from './levels.ts';
import { mulberry32 } from '../core/prng.ts';

let deps: PuzzleDeps;
beforeAll(() => {
  const tables = buildTables();
  const ball = buildBall();
  deps = { distance: (c) => distance(ball, c), solve: (c) => solveCubie(tables, c) };
}, 60_000);

const center = (s: State, f: number) => s[f * 9 + 4];
const rowOk = (s: State, f: number, row: number) => [0, 1, 2].every((c) => s[f * 9 + row * 3 + c] === center(s, f));
const SIDES = [1, 2, 4, 5];
const f2lSolved = (s: State) => [0, 1, 2].every((r) => rowOk(s, 3, r)) && SIDES.every((f) => rowOk(s, f, 1) && rowOk(s, f, 2));
const crossSolved = (s: State) => [28, 30, 32, 34].every((i) => s[i] === 3) && SIDES.every((f) => s[f * 9 + 7] === center(s, f));

describe('puzzle levels', () => {
  it('walks without trivially cancelling moves', () => {
    const w = canonicalWalk(mulberry32(1), 200);
    for (let i = 1; i < w.length; i++) expect(w[i][0]).not.toBe(w[i - 1][0]);
  });

  it('measures walk levels exactly', () => {
    let seed = 1;
    for (const level of ['intro', 'easy', 'medium'] as const) {
      const [lo, hi] = DISTANCE_RANGE[level];
      for (let n = 0; n < 15; n++) {
        const p = generatePuzzle(level, seed++, deps);
        expect(p.distance).toBeGreaterThanOrEqual(lo);
        expect(p.distance).toBeLessThanOrEqual(hi);
        expect(applyMoves(solved(), p.scramble)).toEqual(p.state);
      }
    }
  }, 60_000);

  it('proves hard puzzles need at least 10 moves', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const p = generatePuzzle('hard', seed, deps);
      expect(p.distance).toBeNull();
      expect(p.scramble.length).toBeGreaterThanOrEqual(10);
      expect(p.scramble.length).toBeLessThanOrEqual(14);
    }
  }, 60_000);

  it('builds legal random-state and training puzzles whose scramble reaches the state', () => {
    for (const level of ['expert', 'pll', 'oll', 'f2l'] as const) {
      for (let seed = 1; seed <= 5; seed++) {
        const p = generatePuzzle(level, seed, deps);
        expect(toCubie(p.state).ok).toBe(true);
        expect(applyMoves(solved(), p.scramble)).toEqual(p.state);
        if (level === 'pll') expect(f2lSolved(p.state) && [0, 1, 2].every((r) => rowOk(p.state, 0, r))).toBe(true);
        if (level === 'oll') expect(f2lSolved(p.state)).toBe(true);
        if (level === 'f2l') expect(crossSolved(p.state)).toBe(true);
      }
    }
  }, 60_000);

  it('is reproducible from its seed', () => {
    expect(generatePuzzle('medium', 42, deps)).toEqual(generatePuzzle('medium', 42, deps));
    expect(generatePuzzle('oll', 42, deps)).toEqual(generatePuzzle('oll', 42, deps));
  }, 60_000);
});
