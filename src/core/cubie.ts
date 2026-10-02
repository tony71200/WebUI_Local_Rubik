// Cubie model (Kociemba conventions) and facelet validation.
// Corners: URF UFL ULB UBR DFR DLF DBL DRB. Edges: UR UF UL UB DR DF DL DB FR FL BL BR.
// cp[i] = corner sitting at position i, co[i] = its twist (0..2); ep/eo likewise for edges (flip 0..1).
import type { State } from './cube.ts';

export interface CubieCube { cp: number[]; co: number[]; ep: number[]; eo: number[] }

// Facelet indices of each corner/edge position, first facelet on the U/D face (or F/B for slice edges).
export const CORNER_FACELETS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
] as const;
export const EDGE_FACELETS = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52],
  [23, 12], [21, 41], [50, 39], [48, 14],
] as const;

const face = (f: number) => Math.floor(f / 9);
export const CORNER_COLORS = CORNER_FACELETS.map((fs) => fs.map(face));
export const EDGE_COLORS = EDGE_FACELETS.map((fs) => fs.map(face));

export const identityCubie = (): CubieCube => ({
  cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0),
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0),
});

// a then b ("replaced-by" composition)
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  return {
    cp: b.cp.map((p) => a.cp[p]),
    co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
    ep: b.ep.map((p) => a.ep[p]),
    eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
  };
}

export function toFacelets(c: CubieCube): State {
  const s = Uint8Array.from({ length: 54 }, (_, i) => face(i));
  c.cp.forEach((j, i) => {
    for (let n = 0; n < 3; n++) s[CORNER_FACELETS[i][(n + c.co[i]) % 3]] = CORNER_COLORS[j][n];
  });
  c.ep.forEach((j, i) => {
    for (let n = 0; n < 2; n++) s[EDGE_FACELETS[i][(n + c.eo[i]) % 2]] = EDGE_COLORS[j][n];
  });
  return s;
}

export type ValidationError =
  | { kind: 'empty'; cells: number[] }
  | { kind: 'count'; color: number; count: number; cells: number[] }
  | { kind: 'centers'; cells: number[] }
  | { kind: 'piece'; cells: number[] }
  | { kind: 'duplicate'; cells: number[] }
  | { kind: 'twist'; cells: number[] }
  | { kind: 'flip'; cells: number[] }
  | { kind: 'parity'; cells: number[] };

export type CubieResult = { ok: true; cube: CubieCube } | { ok: false; errors: ValidationError[] };

function parityOf(perm: number[]): number {
  let p = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  return p;
}

// Map painted colors so that each center's color becomes its face id (the user may hold the cube any way).
// net: 54 values, color 0..5 or -1 for an unpainted cell.
export function normalize(net: ArrayLike<number>): State {
  const faceOf = new Map<number, number>();
  for (let f = 0; f < 6; f++) faceOf.set(net[f * 9 + 4], f);
  return Uint8Array.from({ length: 54 }, (_, i) => faceOf.get(net[i]) ?? 0);
}

// Checks run in order; the first failing stage reports all of its problems.
export function toCubie(net: ArrayLike<number>): CubieResult {
  const all = Array.from({ length: 54 }, (_, i) => i);
  const empty = all.filter((i) => net[i] < 0 || net[i] > 5);
  if (empty.length) return { ok: false, errors: [{ kind: 'empty', cells: empty }] };

  const counts: ValidationError[] = [];
  for (let color = 0; color < 6; color++) {
    const cells = all.filter((i) => net[i] === color);
    if (cells.length !== 9) counts.push({ kind: 'count', color, count: cells.length, cells: cells.length > 9 ? cells : [] });
  }
  if (counts.length) return { ok: false, errors: counts };

  const centers = [4, 13, 22, 31, 40, 49];
  if (new Set(centers.map((i) => net[i])).size !== 6) return { ok: false, errors: [{ kind: 'centers', cells: centers }] };

  const s = normalize(net);
  const errors: ValidationError[] = [];
  const cube = identityCubie();
  const seenC = new Map<number, number[]>();
  CORNER_FACELETS.forEach((fs, i) => {
    const cols = fs.map((f) => s[f]);
    const ori = cols.findIndex((c) => c === 0 || c === 3);
    const j = ori < 0 ? -1 : CORNER_COLORS.findIndex((cc) =>
      cc[0] === cols[ori] && cc[1] === cols[(ori + 1) % 3] && cc[2] === cols[(ori + 2) % 3]);
    if (j < 0) { errors.push({ kind: 'piece', cells: [...fs] }); return; }
    cube.cp[i] = j;
    cube.co[i] = ori;
    seenC.set(j, [...(seenC.get(j) ?? []), ...fs]);
  });
  const seenE = new Map<number, number[]>();
  EDGE_FACELETS.forEach((fs, i) => {
    const [a, b] = fs.map((f) => s[f]);
    let j = EDGE_COLORS.findIndex((ec) => ec[0] === a && ec[1] === b);
    let ori = 0;
    if (j < 0) { j = EDGE_COLORS.findIndex((ec) => ec[0] === b && ec[1] === a); ori = 1; }
    if (j < 0) { errors.push({ kind: 'piece', cells: [...fs] }); return; }
    cube.ep[i] = j;
    cube.eo[i] = ori;
    seenE.set(j, [...(seenE.get(j) ?? []), ...fs]);
  });
  for (const cells of seenC.values()) if (cells.length > 3) errors.push({ kind: 'duplicate', cells });
  for (const cells of seenE.values()) if (cells.length > 2) errors.push({ kind: 'duplicate', cells });
  if (errors.length) return { ok: false, errors };

  if (cube.co.reduce((a, b) => a + b, 0) % 3 !== 0) errors.push({ kind: 'twist', cells: [] });
  if (cube.eo.reduce((a, b) => a + b, 0) % 2 !== 0) errors.push({ kind: 'flip', cells: [] });
  if (parityOf(cube.cp) !== parityOf(cube.ep)) errors.push({ kind: 'parity', cells: [] });
  return errors.length ? { ok: false, errors } : { ok: true, cube };
}
