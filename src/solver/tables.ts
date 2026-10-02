// Move tables (coordinate x move -> coordinate) and pruning tables (BFS distance lower bounds).
import { multiply, type CubieCube } from '../core/cubie.ts';
import {
  MOVE_CUBES, N_FLIP, N_PERM4, N_PERM8, N_SLICE, N_TWIST, PHASE2_MOVES,
  getCornerPerm, getEdgePerm, getFlip, getSlice, getSlicePerm, getTwist,
  setCornerPerm, setEdgePerm, setFlip, setSlice, setSlicePerm, setTwist,
} from './coords.ts';

export interface Tables {
  twistMove: Uint16Array;
  flipMove: Uint16Array;
  sliceMove: Uint16Array;
  cornerPermMove: Uint16Array;
  edgePermMove: Uint16Array;
  slicePermMove: Uint16Array;
  twistSlicePrune: Int8Array;
  flipSlicePrune: Int8Array;
  cornerSlicePrune: Int8Array;
  edgeSlicePrune: Int8Array;
}

const ALL_MOVES = Array.from({ length: 18 }, (_, m) => m);

function moveTable(n: number, set: (i: number) => CubieCube, get: (c: CubieCube) => number, moves: number[]): Uint16Array {
  const table = new Uint16Array(n * 18);
  for (let i = 0; i < n; i++) {
    const c = set(i);
    for (const m of moves) table[i * 18 + m] = get(multiply(c, MOVE_CUBES[m]));
  }
  return table;
}

// distance[a * n2 + b] from the solved pair (0, 0) using the given moves
function pruneTable(n1: number, n2: number, move1: Uint16Array, move2: Uint16Array, moves: number[]): Int8Array {
  const dist = new Int8Array(n1 * n2).fill(-1);
  dist[0] = 0;
  for (let depth = 0, grew = true; grew; depth++) {
    grew = false;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] !== depth) continue;
      const a = Math.floor(i / n2), b = i % n2;
      for (const m of moves) {
        const j = move1[a * 18 + m] * n2 + move2[b * 18 + m];
        if (dist[j] < 0) { dist[j] = depth + 1; grew = true; }
      }
    }
  }
  return dist;
}

export const TABLE_STEPS = 10;

export function buildTables(onStep: (done: number) => void = () => {}): Tables {
  let done = 0;
  const step = <T>(value: T): T => { onStep(++done); return value; };
  const twistMove = step(moveTable(N_TWIST, setTwist, getTwist, ALL_MOVES));
  const flipMove = step(moveTable(N_FLIP, setFlip, getFlip, ALL_MOVES));
  const sliceMove = step(moveTable(N_SLICE, setSlice, getSlice, ALL_MOVES));
  const cornerPermMove = step(moveTable(N_PERM8, setCornerPerm, getCornerPerm, ALL_MOVES));
  const edgePermMove = step(moveTable(N_PERM8, setEdgePerm, getEdgePerm, PHASE2_MOVES));
  const slicePermMove = step(moveTable(N_PERM4, setSlicePerm, getSlicePerm, PHASE2_MOVES));
  return {
    twistMove, flipMove, sliceMove, cornerPermMove, edgePermMove, slicePermMove,
    twistSlicePrune: step(pruneTable(N_TWIST, N_SLICE, twistMove, sliceMove, ALL_MOVES)),
    flipSlicePrune: step(pruneTable(N_FLIP, N_SLICE, flipMove, sliceMove, ALL_MOVES)),
    cornerSlicePrune: step(pruneTable(N_PERM8, N_PERM4, cornerPermMove, slicePermMove, PHASE2_MOVES)),
    edgeSlicePrune: step(pruneTable(N_PERM8, N_PERM4, edgePermMove, slicePermMove, PHASE2_MOVES)),
  };
}
