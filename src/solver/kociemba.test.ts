import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, isSolved, solved } from '../core/cube.ts';
import { mulberry32 } from '../core/prng.ts';
import { solveFacelets } from './kociemba.ts';
import { buildTables, TABLE_STEPS, type Tables } from './tables.ts';

let tables: Tables;
let buildMs = 0;
const steps: number[] = [];

beforeAll(() => {
  const t0 = performance.now();
  tables = buildTables((done) => steps.push(done));
  buildMs = performance.now() - t0;
}, 60_000);

const randomScramble = (rnd: () => number, n: number) =>
  Array.from({ length: n }, () => 'URFDLB'[Math.floor(rnd() * 6)] + ['', "'", '2'][Math.floor(rnd() * 3)]);

describe('kociemba', () => {
  it('builds every table and reports progress', () => {
    expect(steps).toEqual(Array.from({ length: TABLE_STEPS }, (_, i) => i + 1));
    expect(tables.twistSlicePrune.every((d) => d >= 0)).toBe(true);
    expect(tables.cornerSlicePrune.every((d) => d >= 0)).toBe(true);
    console.info(`tables built in ${Math.round(buildMs)} ms`);
  });

  it('returns no moves for a solved cube and short answers for near-solved ones', () => {
    expect(solveFacelets(tables, solved())).toEqual([]);
    expect(solveFacelets(tables, applyMoves(solved(), 'R'))).toEqual(["R'"]);
    expect(solveFacelets(tables, applyMoves(solved(), "F U' R2")).length).toBeLessThanOrEqual(3);
  });

  it('solves random cubes in at most 21 moves', () => {
    const rnd = mulberry32(2026);
    let total = 0;
    const t0 = performance.now();
    for (let n = 0; n < 60; n++) {
      const s = applyMoves(solved(), randomScramble(rnd, 30));
      const sol = solveFacelets(tables, s);
      expect(isSolved(applyMoves(s, sol))).toBe(true);
      expect(sol.length).toBeLessThanOrEqual(21);
      total += sol.length;
    }
    console.info(`avg ${(total / 60).toFixed(1)} moves, ${Math.round((performance.now() - t0) / 60)} ms per solve`);
  }, 60_000);

  it('solves the superflip and cubes painted around other centers', () => {
    const superflip = applyMoves(solved(), "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    expect(isSolved(applyMoves(superflip, solveFacelets(tables, superflip)))).toBe(true);
    const turned = applyMoves(solved(), "x y' R U F'");
    expect(isSolved(applyMoves(turned, solveFacelets(tables, turned)))).toBe(true);
  }, 30_000);

  it('is deterministic and respects the node budget', () => {
    const s = applyMoves(solved(), "R U2 F' L D B2 R' U F2 L' D2 B U' R2 F L2");
    expect(solveFacelets(tables, s)).toEqual(solveFacelets(tables, s));
    const tight = solveFacelets(tables, s, { nodeLimit: 1 });
    expect(isSolved(applyMoves(s, tight))).toBe(true);
  });

  it('rejects an unsolvable cube', () => {
    const s = Uint8Array.from(solved());
    [s[5], s[10]] = [s[10], s[5]];
    expect(() => solveFacelets(tables, s)).toThrow(/flip/);
  });
});
