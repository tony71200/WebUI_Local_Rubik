import { describe, expect, it } from 'vitest';
import { BASE_MOVES, applyMoves, solved, type State } from './cube.ts';
import { identityCubie, multiply, normalize, toCubie, toFacelets, type CubieCube } from './cubie.ts';
import { mulberry32 } from './prng.ts';

const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'];
const cubieOf = (s: ArrayLike<number>): CubieCube => {
  const r = toCubie(s);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.cube;
};
const swap = (s: State, pairs: [number, number][]) => {
  const t = Uint8Array.from(s);
  for (const [a, b] of pairs) [t[a], t[b]] = [t[b], t[a]];
  return t;
};
const kinds = (s: ArrayLike<number>) => {
  const r = toCubie(s);
  return r.ok ? [] : r.errors.map((e) => e.kind);
};

describe('cubie model', () => {
  it('reads the solved cube as identity', () => {
    expect(cubieOf(solved())).toEqual(identityCubie());
  });

  it('matches Kociemba move cubes for U, R and F', () => {
    expect(cubieOf(applyMoves(solved(), 'U'))).toMatchObject({ cp: [3, 0, 1, 2, 4, 5, 6, 7], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11] });
    expect(cubieOf(applyMoves(solved(), 'R'))).toMatchObject({ cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2] });
    expect(cubieOf(applyMoves(solved(), 'F'))).toMatchObject({ eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] });
  });

  it('round-trips facelets <-> cubies and composes like the facelet model', () => {
    const rnd = mulberry32(11);
    for (let n = 0; n < 500; n++) {
      const seq = Array.from({ length: 30 }, () => FACE_MOVES[Math.floor(rnd() * 6)] + ['', "'", '2'][Math.floor(rnd() * 3)]);
      const s = applyMoves(solved(), seq);
      expect(toFacelets(cubieOf(s))).toEqual(s);
      const m = seq[0];
      expect(multiply(cubieOf(s), cubieOf(applyMoves(solved(), m)))).toEqual(cubieOf(applyMoves(s, m)));
    }
  });

  it('accepts slice moves too (centers stay put after normalizing)', () => {
    for (const b of BASE_MOVES) expect(toCubie(applyMoves(solved(), `${b} R U`)).ok).toBe(true);
  });
});

describe('validation', () => {
  it('reports empty cells', () => {
    const s = Int8Array.from(solved());
    s[0] = -1;
    s[30] = -1;
    expect(toCubie(s)).toEqual({ ok: false, errors: [{ kind: 'empty', cells: [0, 30] }] });
  });

  it('reports colors that are not used 9 times', () => {
    const s = Uint8Array.from(solved());
    s[0] = 1; // a white cell painted red: white 8, red 10
    const r = toCubie(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.kind === 'count' && [e.color, e.count])).toEqual([[0, 8], [1, 10]]);
  });

  it('reports two faces with the same center color', () => {
    expect(kinds(swap(solved(), [[22, 0]]))).toEqual(['centers']);
  });

  it('reports pieces that cannot exist', () => {
    const r = toCubie(swap(solved(), [[9, 27]])); // URF gets U+D, DFL gets R+L
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.every((e) => e.kind === 'piece')).toBe(true);
      expect(r.errors.flatMap((e) => e.cells)).toEqual(expect.arrayContaining([9, 27]));
    }
  });

  it('reports a duplicated piece', () => {
    expect(kinds(swap(solved(), [[9, 39]]))).toContain('duplicate'); // BL edge becomes a second BR
  });

  it('reports a twisted corner, a flipped edge and a swapped pair', () => {
    const s = Uint8Array.from(solved());
    [s[8], s[9], s[20]] = [s[20], s[8], s[9]];
    expect(kinds(s)).toEqual(['twist']);
    expect(kinds(swap(solved(), [[5, 10]]))).toEqual(['flip']);
    expect(kinds(swap(solved(), [[5, 7], [10, 19]]))).toEqual(['parity']);
  });

  it('normalizes a cube held with other centers', () => {
    const turned = applyMoves(solved(), 'x y R U');
    const n = normalize(turned);
    for (let f = 0; f < 6; f++) expect(n[f * 9 + 4]).toBe(f);
    expect(toCubie(turned).ok).toBe(true);
  });
});
