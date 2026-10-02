import { describe, expect, it } from 'vitest';
import { applyMoves, isSolved, solved, type State } from '../core/cube.ts';
import { mulberry32 } from '../core/prng.ts';
import { LBL_STAGES, relabel, solveLbl } from './lbl.ts';

const SIDES = [1, 2, 4, 5]; // R F L B
const center = (s: State, f: number) => s[f * 9 + 4];
const rowOk = (s: State, f: number, row: number) => [0, 1, 2].every((c) => s[f * 9 + row * 3 + c] === center(s, f));
const faceOk = (s: State, f: number) => [0, 1, 2].every((r) => rowOk(s, f, r));
const edgeUp = (s: State) => [1, 3, 5, 7].every((i) => s[i] === center(s, 0));

// what must hold after each stage (white is on the bottom from stage 1 on)
const CHECKS: Record<string, (s: State) => boolean> = {
  cross: (s) => center(s, 3) === 0 && [28, 30, 32, 34].every((i) => s[i] === 0) && SIDES.every((f) => s[f * 9 + 7] === center(s, f)),
  corners: (s) => faceOk(s, 3) && SIDES.every((f) => rowOk(s, f, 2)),
  middle: (s) => faceOk(s, 3) && SIDES.every((f) => rowOk(s, f, 2) && rowOk(s, f, 1)),
  topCross: (s) => CHECKS.middle(s) && edgeUp(s),
  topEdges: (s) => CHECKS.topCross(s) && SIDES.every((f) => s[f * 9 + 1] === center(s, f)),
  cornerPlace: (s) => CHECKS.topEdges(s),
  cornerTwist: isSolved,
};

const randomState = (rnd: () => number) =>
  applyMoves(solved(), Array.from({ length: 30 }, () => 'URFDLB'[Math.floor(rnd() * 6)] + ['', "'", '2'][Math.floor(rnd() * 3)]));

describe('LBL solver', () => {
  it('relabels front-face algorithms onto other sides', () => {
    expect(relabel("R U R' U'", 'F')).toEqual(['R', 'U', "R'", "U'"]);
    expect(relabel("R U R' U'", 'R')).toEqual(['B', 'U', "B'", "U'"]);
    expect(relabel("F R U R' U' F'", 'L')).toEqual(['L', 'F', 'U', "F'", "U'", "L'"]);
  });

  it('returns the 7 stages in order', () => {
    expect(solveLbl(randomState(mulberry32(1))).map((st) => st.id)).toEqual([...LBL_STAGES]);
  });

  it('solves random cubes and meets every stage goal on the way', () => {
    const rnd = mulberry32(99);
    let total = 0;
    for (let n = 0; n < 300; n++) {
      let s = randomState(rnd);
      for (const st of solveLbl(s)) {
        s = applyMoves(s, st.moves);
        expect(CHECKS[st.id](s), st.id).toBe(true);
        total += st.moves.length;
      }
    }
    console.info(`LBL avg ${(total / 300).toFixed(0)} moves`);
  }, 60_000);

  it('handles a solved cube, a near-solved cube and other held orientations', () => {
    const empty = solveLbl(solved());
    expect(isSolved(applyMoves(solved(), empty.flatMap((st) => st.moves)))).toBe(true);
    for (const scr of ["R", "x y R U F'", "z' L D2 B"]) {
      const s = applyMoves(solved(), scr);
      expect(isSolved(applyMoves(s, solveLbl(s).flatMap((st) => st.moves)))).toBe(true);
    }
  });

  it('is deterministic', () => {
    const s = randomState(mulberry32(7));
    expect(solveLbl(s)).toEqual(solveLbl(s));
  });
});
