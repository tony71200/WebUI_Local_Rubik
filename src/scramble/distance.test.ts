import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, isSolved, solved, type Move } from '../core/cube.ts';
import { toCubie } from '../core/cubie.ts';
import { mulberry32 } from '../core/prng.ts';
import { MOVES } from '../solver/coords.ts';
import { buildBall, distance, type Ball } from './distance.ts';

let ball: Ball;
let buildMs = 0;
beforeAll(() => {
  const t0 = performance.now();
  ball = buildBall();
  buildMs = performance.now() - t0;
}, 60_000);

const cubieOf = (moves: string | Move[]) => {
  const r = toCubie(applyMoves(solved(), moves));
  if (!r.ok) throw new Error('bad cube');
  return r.cube;
};

// brute force: shortest solution by iterative deepening, for tiny distances only
function bruteForce(moves: Move[], max: number): number {
  const s = applyMoves(solved(), moves);
  const dfs = (st: typeof s, togo: number): boolean =>
    togo === 0 ? isSolved(st) : MOVES.some((m) => dfs(applyMoves(st, [m]), togo - 1));
  for (let d = 0; d <= max; d++) if (dfs(s, d)) return d;
  return Infinity;
}

describe('meet-in-the-middle distance', () => {
  it('holds every state within 5 moves', () => {
    expect(ball.size).toBe(621_649); // 1 + 18 + 243 + 3240 + 43239 + 574908
    console.info(`ball built in ${Math.round(buildMs)} ms`);
  });

  it('matches brute force on short scrambles', () => {
    const rnd = mulberry32(3);
    for (let n = 0; n < 40; n++) {
      const len = 1 + Math.floor(rnd() * 3);
      const seq = Array.from({ length: len }, () => MOVES[Math.floor(rnd() * 18)]);
      expect(distance(ball, cubieOf(seq))).toBe(bruteForce(seq, 3));
    }
  });

  it('measures known distances', () => {
    expect(distance(ball, cubieOf(''))).toBe(0);
    expect(distance(ball, cubieOf('R U'))).toBe(2);
    expect(distance(ball, cubieOf("R U R' U'"))).toBe(4);
    expect(distance(ball, cubieOf("R U F' L D B2 R' U2 F"))).toBe(9);
  });

  it('proves cubes 10+ moves away', () => {
    const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
    expect(distance(ball, cubieOf(superflip))).toBeNull();
  });
});
