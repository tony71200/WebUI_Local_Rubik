// Exact distance (HTM, face moves) up to 9 by meeting in the middle:
// a precomputed ball of every state within 5 moves of solved, plus a search of depth <= 4 from the cube.
import { identityCubie, multiply, type CubieCube } from '../core/cubie.ts';
import { MOVE_CUBES, getCornerPerm, getFlip, getTwist, permIndex } from '../solver/coords.ts';

export const BALL_RADIUS = 5;
export const SEARCH_DEPTH = 4;
export const MAX_EXACT = BALL_RADIUS + SEARCH_DEPTH; // 9
const BITS = 21; // 2^21 slots for 621,649 states
const SLOTS = 1 << BITS;

// A cube state as two exact numbers: corners + edge flip (< 2^38), edge permutation (< 2^29).
function keyOf(c: CubieCube): [number, number] {
  return [(getCornerPerm(c) * 2187 + getTwist(c)) * 2048 + getFlip(c), permIndex(c.ep)];
}

function slotOf(a: number, b: number): number {
  const h = Math.imul((a >>> 0) ^ Math.imul(b, 0x9e3779b1) ^ Math.floor(a / 4294967296), 0x85ebca6b);
  return h >>> (32 - BITS);
}

export class Ball {
  private readonly a = new Float64Array(SLOTS);
  private readonly b = new Int32Array(SLOTS);
  private readonly d = new Int8Array(SLOTS).fill(-1);
  size = 0;

  get(a: number, b: number): number {
    for (let i = slotOf(a, b); ; i = (i + 1) & (SLOTS - 1)) {
      if (this.d[i] < 0) return -1;
      if (this.a[i] === a && this.b[i] === b) return this.d[i];
    }
  }

  add(a: number, b: number, depth: number): boolean {
    for (let i = slotOf(a, b); ; i = (i + 1) & (SLOTS - 1)) {
      if (this.d[i] < 0) {
        this.a[i] = a; this.b[i] = b; this.d[i] = depth;
        this.size++;
        return true;
      }
      if (this.a[i] === a && this.b[i] === b) return false;
    }
  }
}

// Breadth-first from solved; only states closer than the radius are expanded.
export function buildBall(): Ball {
  const ball = new Ball();
  let frontier = [identityCubie()];
  ball.add(...keyOf(frontier[0]), 0);
  for (let depth = 0; depth < BALL_RADIUS; depth++) {
    const next: CubieCube[] = [];
    for (const c of frontier) {
      for (const m of MOVE_CUBES) {
        const child = multiply(c, m);
        if (ball.add(...keyOf(child), depth + 1) && depth + 1 < BALL_RADIUS) next.push(child);
      }
    }
    frontier = next;
  }
  return ball;
}

// Same face twice, or opposite faces in the "wrong" order, never shortens a path.
const redundant = (m: number, last: number) => {
  const f = (m / 3) | 0, l = (last / 3) | 0;
  return last >= 0 && (f === l || f === l - 3);
};

// Exact distance if it is at most 9, otherwise null (proved: no solution of 9 moves or fewer).
export function distance(ball: Ball, cube: CubieCube): number | null {
  let best = Infinity;
  const dfs = (c: CubieCube, depth: number, togo: number, last: number) => {
    if (togo === 0) {
      const d = ball.get(...keyOf(c));
      if (d >= 0) best = Math.min(best, depth + d);
      return;
    }
    for (let m = 0; m < 18; m++) {
      if (redundant(m, last)) continue;
      dfs(multiply(c, MOVE_CUBES[m]), depth + 1, togo - 1, m);
    }
  };
  for (let f = 0; f <= SEARCH_DEPTH; f++) {
    dfs(cube, 0, f, -1);
    if (best <= f + 1) break; // a deeper split can only add moves
  }
  return best <= MAX_EXACT ? best : null;
}
