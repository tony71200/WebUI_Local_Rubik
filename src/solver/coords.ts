// Kociemba coordinates: small integers that describe one aspect of a CubieCube.
import { applyMove, solved, type Move } from '../core/cube.ts';
import { identityCubie, toCubie, type CubieCube } from '../core/cubie.ts';

// 18 face moves; index = face * 3 + power (0 = quarter, 1 = half, 2 = prime), faces U R F D L B.
export const MOVES: Move[] = [...'URFDLB'].flatMap((f) => [f, `${f}2`, `${f}'`]);
// <U, D, R2, L2, F2, B2>: the moves that keep a cube inside G1
export const PHASE2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

export const MOVE_CUBES: CubieCube[] = MOVES.map((m) => {
  const r = toCubie(applyMove(solved(), m));
  if (!r.ok) throw new Error('move cube');
  return r.cube;
});

export const N_TWIST = 2187; // 3^7
export const N_FLIP = 2048; // 2^11
export const N_SLICE = 495; // C(12, 4)
export const N_PERM8 = 40320; // 8!
export const N_PERM4 = 24; // 4!

export function getTwist(c: CubieCube): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = 3 * t + c.co[i];
  return t;
}
export function setTwist(t: number): CubieCube {
  const c = identityCubie();
  let sum = 0;
  for (let i = 6; i >= 0; i--) { c.co[i] = t % 3; sum += c.co[i]; t = Math.floor(t / 3); }
  c.co[7] = (3 - (sum % 3)) % 3;
  return c;
}

export function getFlip(c: CubieCube): number {
  let f = 0;
  for (let i = 0; i < 11; i++) f = 2 * f + c.eo[i];
  return f;
}
export function setFlip(f: number): CubieCube {
  const c = identityCubie();
  let sum = 0;
  for (let i = 10; i >= 0; i--) { c.eo[i] = f % 2; sum += c.eo[i]; f = Math.floor(f / 2); }
  c.eo[11] = sum % 2;
  return c;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

// Which 4 positions hold the slice edges FR FL BL BR (8..11); 0 when they are all in the slice.
export function getSlice(c: CubieCube): number {
  let a = 0, x = 0;
  for (let j = 11; j >= 0; j--) if (c.ep[j] >= 8) { a += choose(11 - j, x + 1); x++; }
  return a;
}
export function setSlice(idx: number): CubieCube {
  const c = identityCubie();
  const ep = Array(12).fill(-1);
  let x = 4;
  for (let j = 0; j < 12; j++) {
    if (idx - choose(11 - j, x) >= 0) { ep[j] = 12 - x; idx -= choose(11 - j, x); x--; }
  }
  let other = 0;
  for (let j = 0; j < 12; j++) if (ep[j] < 0) ep[j] = other++;
  c.ep = ep;
  return c;
}

// Permutation rank in the factorial number system.
export function permIndex(p: ArrayLike<number>): number {
  let idx = 0;
  for (let i = 0; i < p.length; i++) {
    let smaller = 0;
    for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) smaller++;
    idx = idx * (p.length - i) + smaller;
  }
  return idx;
}
export function permFromIndex(idx: number, n: number): number[] {
  const digits = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { digits[i] = idx % (n - i); idx = Math.floor(idx / (n - i)); }
  const free = Array.from({ length: n }, (_, k) => k);
  return digits.map((d) => free.splice(d, 1)[0]);
}

// Phase-2 coordinates (meaningful only inside G1)
export const getCornerPerm = (c: CubieCube) => permIndex(c.cp);
export const getEdgePerm = (c: CubieCube) => permIndex(c.ep.slice(0, 8));
export const getSlicePerm = (c: CubieCube) => permIndex(c.ep.slice(8).map((e) => e - 8));

export function setCornerPerm(i: number): CubieCube {
  const c = identityCubie();
  c.cp = permFromIndex(i, 8);
  return c;
}
export function setEdgePerm(i: number): CubieCube {
  const c = identityCubie();
  c.ep = [...permFromIndex(i, 8), 8, 9, 10, 11];
  return c;
}
export function setSlicePerm(i: number): CubieCube {
  const c = identityCubie();
  c.ep = [0, 1, 2, 3, 4, 5, 6, 7, ...permFromIndex(i, 4).map((e) => e + 8)];
  return c;
}
