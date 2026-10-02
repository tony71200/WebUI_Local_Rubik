// Kociemba two-phase search. Deterministic: fixed move order, node budget instead of a clock.
import type { Move } from '../core/cube.ts';
import { multiply, normalize, toCubie, type CubieCube } from '../core/cubie.ts';
import {
  MOVES, MOVE_CUBES, N_PERM4, N_SLICE, PHASE2_MOVES,
  getCornerPerm, getEdgePerm, getFlip, getSlice, getSlicePerm, getTwist,
} from './coords.ts';
import type { Tables } from './tables.ts';

export interface SolveOptions {
  maxLength?: number; // good enough: once this short and `improveNodes` are spent, stop improving
  improveNodes?: number;
  nodeLimit?: number; // hard budget once any solution exists
}

export const DEFAULT_MAX_LENGTH = 21;
export const DEFAULT_IMPROVE_NODES = 200_000;
export const DEFAULT_NODE_LIMIT = 30_000_000;
const FALLBACK_LENGTH = 30; // phase 1 <= 12 + phase 2 <= 18 always succeeds
const IS_PHASE2 = new Set(PHASE2_MOVES);

// Same face twice in a row, or an opposite face in the "wrong" order (D then U), is redundant.
const redundant = (face: number, last: number) => face === last || face === last - 3;

export function solveCubie(t: Tables, cube: CubieCube, opts: SolveOptions = {}): Move[] {
  const maxLength = opts.maxLength ?? DEFAULT_MAX_LENGTH;
  const nodeLimit = opts.nodeLimit ?? DEFAULT_NODE_LIMIT;
  const improveNodes = opts.improveNodes ?? DEFAULT_IMPROVE_NODES;
  let nodes = 0;
  let d1 = 0;
  let best: number[] | null = null;
  const path1: number[] = [];
  const path2: number[] = [];

  // Budgets only apply once a solution exists, so an answer is always returned.
  // best.length <= d1 means no deeper phase 1 can beat it.
  const done = () => best !== null &&
    (best.length <= d1 || nodes > nodeLimit || (best.length <= maxLength && nodes >= improveNodes));
  const h1 = (tw: number, fl: number, sl: number) =>
    Math.max(t.twistSlicePrune[tw * N_SLICE + sl], t.flipSlicePrune[fl * N_SLICE + sl]);
  const h2 = (cp: number, ep: number, sp: number) =>
    Math.max(t.cornerSlicePrune[cp * N_PERM4 + sp], t.edgeSlicePrune[ep * N_PERM4 + sp]);

  function search2(cp: number, ep: number, sp: number, togo: number, last: number): boolean {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0;
    for (const m of PHASE2_MOVES) {
      const face = (m / 3) | 0;
      if (redundant(face, last)) continue;
      const ncp = t.cornerPermMove[cp * 18 + m], nep = t.edgePermMove[ep * 18 + m], nsp = t.slicePermMove[sp * 18 + m];
      if (h2(ncp, nep, nsp) >= togo) continue;
      nodes++;
      path2.push(m);
      if (search2(ncp, nep, nsp, togo - 1, face)) return true;
      path2.pop();
      if (done()) return false;
    }
    return false;
  }

  // Called with the cube in G1 after path1. Returns true when the whole search can stop.
  function phase2(): boolean {
    let c = cube;
    for (const m of path1) c = multiply(c, MOVE_CUBES[m]);
    const cp = getCornerPerm(c), ep = getEdgePerm(c), sp = getSlicePerm(c);
    const limit = Math.min(18, (best ? best.length - 1 : FALLBACK_LENGTH) - path1.length);
    const last = path1.length ? (path1[path1.length - 1] / 3) | 0 : -9;
    for (let d2 = h2(cp, ep, sp); d2 <= limit; d2++) {
      path2.length = 0;
      if (search2(cp, ep, sp, d2, last)) {
        best = [...path1, ...path2];
        return done();
      }
      if (done()) return true;
    }
    return false;
  }

  function search1(tw: number, fl: number, sl: number, togo: number, last: number): boolean {
    if (togo === 0) {
      if (tw || fl || sl) return false;
      // a phase-1 path ending in a G1 move was already tried one level shallower
      if (path1.length && IS_PHASE2.has(path1[path1.length - 1])) return false;
      return phase2();
    }
    for (let m = 0; m < 18; m++) {
      const face = (m / 3) | 0;
      if (redundant(face, last)) continue;
      const ntw = t.twistMove[tw * 18 + m], nfl = t.flipMove[fl * 18 + m], nsl = t.sliceMove[sl * 18 + m];
      if (h1(ntw, nfl, nsl) >= togo) continue;
      nodes++;
      path1.push(m);
      if (search1(ntw, nfl, nsl, togo - 1, face)) return true;
      path1.pop();
      if (done()) return true;
    }
    return false;
  }

  const tw = getTwist(cube), fl = getFlip(cube), sl = getSlice(cube);
  for (d1 = h1(tw, fl, sl); d1 <= 12; d1++) {
    path1.length = 0;
    if (search1(tw, fl, sl, d1, -9) || done()) break;
  }
  // best is always set here: the budget only stops the search after a first solution
  return (best as number[] | null)!.map((m) => MOVES[m]);
}

// Facelet entry point: colors may be painted relative to any centers.
export function solveFacelets(t: Tables, net: ArrayLike<number>, opts?: SolveOptions): Move[] {
  const r = toCubie(normalize(net));
  if (!r.ok) throw new Error(`Invalid cube: ${r.errors.map((e) => e.kind).join(', ')}`);
  return solveCubie(t, r.cube, opts);
}
