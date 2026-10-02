// Puzzle generation. Every puzzle is either a legal move sequence from solved, or a constructed state
// that satisfies the three invariants and passes the validator; difficulty comes from measured distance.
import { applyMoves, invertSequence, solved, type Move, type State } from '../core/cube.ts';
import { toCubie, toFacelets, type CubieCube } from '../core/cubie.ts';
import { mulberry32 } from '../core/prng.ts';
import { MOVES } from '../solver/coords.ts';

export const LEVELS = ['intro', 'easy', 'medium', 'hard', 'expert', 'pll', 'oll', 'f2l'] as const;
export type Level = (typeof LEVELS)[number];

// exact distance range for walk levels; 'hard' means "proved 10 or more", walked 10..14 moves
export const DISTANCE_RANGE: Record<'intro' | 'easy' | 'medium' | 'hard', [number, number]> = {
  intro: [1, 2], easy: [3, 5], medium: [6, 9], hard: [10, 14],
};

export interface Puzzle {
  level: Level;
  scramble: Move[];
  state: State;
  distance: number | null; // exact for intro..medium, null for hard (>= 10) and constructed states
}

export interface PuzzleDeps {
  distance(cube: CubieCube): number | null; // exact up to 9, else null
  solve(cube: CubieCube): Move[]; // Kociemba
}

const MAX_ATTEMPTS = 500;

// Random face moves with no same-face repeats and opposite faces in a fixed order (no "D U").
export function canonicalWalk(rnd: () => number, length: number): Move[] {
  const out: number[] = [];
  while (out.length < length) {
    const m = Math.floor(rnd() * 18);
    const last = out.length ? out[out.length - 1] : -1;
    const f = (m / 3) | 0, l = (last / 3) | 0;
    if (last >= 0 && (f === l || f === l - 3)) continue;
    out.push(m);
  }
  return out.map((m) => MOVES[m]);
}

const cubieOf = (s: State): CubieCube => {
  const r = toCubie(s);
  if (!r.ok) throw new Error(`invalid puzzle state: ${r.errors.map((e) => e.kind).join(', ')}`);
  return r.cube;
};

function shuffle(rnd: () => number, xs: number[]): number[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const parity = (p: number[]) => {
  let x = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) x ^= 1;
  return x;
};

// Scramble the given positions (pieces stay among them), then repair the three invariants.
function constructed(rnd: () => number, corners: number[], edges: number[], twist: boolean, flip: boolean): CubieCube {
  const c: CubieCube = {
    cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0),
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0),
  };
  shuffle(rnd, corners).forEach((piece, k) => { c.cp[corners[k]] = piece; });
  shuffle(rnd, edges).forEach((piece, k) => { c.ep[edges[k]] = piece; });
  if (twist) for (const i of corners) c.co[i] = Math.floor(rnd() * 3);
  if (flip) for (const i of edges) c.eo[i] = Math.floor(rnd() * 2);
  const [c0, e0, e1] = [corners[0], edges[0], edges[1]];
  c.co[c0] = (c.co[c0] + 3 - (c.co.reduce((a, b) => a + b, 0) % 3)) % 3;
  c.eo[e0] = (c.eo[e0] + c.eo.reduce((a, b) => a + b, 0)) % 2;
  if (parity(c.cp) !== parity(c.ep)) [c.ep[e0], c.ep[e1]] = [c.ep[e1], c.ep[e0]];
  return c;
}

const U_CORNERS = [0, 1, 2, 3];
const U_EDGES = [0, 1, 2, 3];
const ALL_CORNERS = [0, 1, 2, 3, 4, 5, 6, 7];
const NON_CROSS_EDGES = [0, 1, 2, 3, 8, 9, 10, 11]; // D edges 4..7 are the solved cross

export function generatePuzzle(level: Level, seed: number, deps: PuzzleDeps): Puzzle {
  const rnd = mulberry32(seed);
  if (level === 'intro' || level === 'easy' || level === 'medium' || level === 'hard') {
    const [lo, hi] = DISTANCE_RANGE[level];
    for (let n = 0; n < MAX_ATTEMPTS; n++) {
      const scramble = canonicalWalk(rnd, lo + Math.floor(rnd() * (hi - lo + 1)));
      const state = applyMoves(solved(), scramble);
      const d = deps.distance(cubieOf(state));
      const ok = level === 'hard' ? d === null : d !== null && d >= lo && d <= hi;
      if (ok) return { level, scramble, state, distance: d };
    }
    throw new Error(`no ${level} puzzle in ${MAX_ATTEMPTS} attempts`);
  }
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const cube = level === 'expert' ? constructed(rnd, ALL_CORNERS, [...Array(12).keys()], true, true)
      : level === 'pll' ? constructed(rnd, U_CORNERS, U_EDGES, false, false)
      : level === 'oll' ? constructed(rnd, U_CORNERS, U_EDGES, true, true)
      : constructed(rnd, ALL_CORNERS, NON_CROSS_EDGES, true, true);
    const state = toFacelets(cube);
    cubieOf(state); // validator as an assertion: constructed states must be legal
    const solution = deps.solve(cube);
    if (solution.length === 0) continue; // drew the solved cube; draw again
    return { level, scramble: invertSequence(solution), state, distance: null };
  }
  throw new Error(`no ${level} puzzle in ${MAX_ATTEMPTS} attempts`);
}
