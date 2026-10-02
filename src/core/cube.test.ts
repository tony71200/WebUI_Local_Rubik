import { describe, expect, it } from 'vitest';
import {
  BASE_MOVES, applyMove, applyMoves, invertSequence, isSolved, layerMove, moveDestinations, parseMove, simplifyMoves, solved,
  splitMoves,
  type Move,
} from './cube.ts';
import { mulberry32 } from './prng.ts';

const at = (moves: string, ids: number[]) => ids.map((i) => applyMoves(solved(), moves)[i]);
const U = 0, R = 1, F = 2;

describe('cube model', () => {
  it('starts solved', () => {
    expect(isSolved(solved())).toBe(true);
    expect(isSolved(applyMove(solved(), 'R'))).toBe(false);
  });

  it('turns each layer the right way', () => {
    expect(at('U', [36, 37, 38])).toEqual([F, F, F]); // U: front top row goes to the left face
    expect(at('U', [18, 19, 20])).toEqual([R, R, R]);
    expect(at('R', [2, 5, 8])).toEqual([F, F, F]); // R: front right column goes up
    expect(at('D', [15, 16, 17])).toEqual([F, F, F]); // D: front bottom row goes right
    expect(at('L', [18, 21, 24])).toEqual([U, U, U]); // L: up left column comes to the front
    expect(at('F', [9, 12, 15])).toEqual([U, U, U]); // F: up bottom row goes to the right face
    expect(at('B', [36, 39, 42])).toEqual([U, U, U]); // B: up top row goes to the left face
    expect(at('M', [19, 22, 25])).toEqual([U, U, U]); // M follows L
    expect(at('E', [12, 13, 14])).toEqual([F, F, F]); // E follows D
    expect(at('S', [10, 13, 16])).toEqual([U, U, U]); // S follows F
    expect(at('y', [18, 22, 26])).toEqual([R, R, R]); // y follows U
  });

  it('returns to start after 4 quarter turns, and after move + inverse', () => {
    for (const b of BASE_MOVES) {
      expect(isSolved(applyMoves(solved(), [b, b, b, b]))).toBe(true);
      expect(applyMoves(solved(), [b, `${b}'`])).toEqual(solved());
      expect(applyMoves(solved(), [`${b}2`])).toEqual(applyMoves(solved(), [b, b]));
    }
  });

  it('matches known group facts', () => {
    let s = solved();
    for (let k = 0; k < 6; k++) s = applyMoves(s, "R U R' U'");
    expect(s).toEqual(solved());
    let order = 0;
    s = solved();
    do { s = applyMoves(s, 'R U'); order++; } while (!isSolved(s));
    expect(order).toBe(105);
  });

  it('superflip flips every edge and nothing else', () => {
    const s = applyMoves(solved(), "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    for (let i = 0; i < 54; i++) {
      const isEdge = (i % 9) % 2 === 1;
      expect(s[i] !== solved()[i]).toBe(isEdge);
    }
  });

  it('undoes any random sequence with its inverse', () => {
    const rnd = mulberry32(7);
    for (let n = 0; n < 50; n++) {
      const seq: Move[] = Array.from({ length: 25 }, () => BASE_MOVES[Math.floor(rnd() * 12)] + ['', "'", '2'][Math.floor(rnd() * 3)]);
      expect(applyMoves(applyMoves(solved(), seq), invertSequence(seq))).toEqual(solved());
    }
  });

  it('parses notation and rejects junk', () => {
    expect(parseMove("R'")).toMatchObject({ base: 'R', axis: 0, layers: [1], dir: 1, turns: 1 });
    expect(parseMove('U2')).toMatchObject({ base: 'U', axis: 1, dir: -1, turns: 2 });
    expect(() => parseMove('Q')).toThrow();
    expect(() => parseMove("R2'")).toThrow();
  });

  it('names layer turns', () => {
    expect(layerMove(0, 1, -1)).toBe('R');
    expect(layerMove(0, 1, 1)).toBe("R'");
    expect(layerMove(1, 0, 1)).toBe('E');
    expect(layerMove(2, -1, -1)).toBe("B'");
  });

  it('reports where stickers go', () => {
    const dest = moveDestinations('U');
    expect(dest[18]).toBe(36); // front top-left lands on left top-left
    expect(dest[4]).toBe(4); // U center stays
  });
});

describe('simplifyMoves', () => {
  it('merges and cancels neighbouring turns of the same layer', () => {
    expect(simplifyMoves(splitMoves("R R U U' F2 F2 L L L"))).toEqual(['R2', "L'"]);
    expect(simplifyMoves(splitMoves("R U U' R'"))).toEqual([]);
    expect(simplifyMoves(splitMoves("x x R R2"))).toEqual(['x2', "R'"]);
  });

  it('never changes the result of a sequence', () => {
    const rnd = mulberry32(5);
    for (let n = 0; n < 200; n++) {
      const seq = Array.from({ length: 12 }, () => 'URFx'[Math.floor(rnd() * 4)] + ['', "'", '2'][Math.floor(rnd() * 3)]);
      expect(applyMoves(solved(), simplifyMoves(seq))).toEqual(applyMoves(solved(), seq));
    }
  });
});
