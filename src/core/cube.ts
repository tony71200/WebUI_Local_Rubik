// Facelet model: 54 stickers in Kociemba order U R F D L B, each face read row-major.
// Coordinates: x -> R, y -> U, z -> F. Each facelet has a cubie position p and outward normal n.
export type Axis = 0 | 1 | 2;
export type Vec3 = readonly [number, number, number];
export type State = Uint8Array;
export type Move = string;

export const FACE_NAMES = 'URFDLB';
export const BASE_MOVES = ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z'] as const;
export type BaseMove = (typeof BASE_MOVES)[number];

export interface Facelet { p: Vec3; n: Vec3 }

function faceletAt(face: number, r: number, c: number): Facelet {
  switch (face) {
    case 0: return { p: [c - 1, 1, r - 1], n: [0, 1, 0] };
    case 1: return { p: [1, 1 - r, 1 - c], n: [1, 0, 0] };
    case 2: return { p: [c - 1, 1 - r, 1], n: [0, 0, 1] };
    case 3: return { p: [c - 1, -1, 1 - r], n: [0, -1, 0] };
    case 4: return { p: [-1, 1 - r, c - 1], n: [-1, 0, 0] };
    default: return { p: [1 - c, 1 - r, -1], n: [0, 0, -1] };
  }
}

export const FACELETS: readonly Facelet[] = Array.from({ length: 54 }, (_, i) =>
  faceletAt(Math.floor(i / 9), Math.floor((i % 9) / 3), i % 3));

const key = (p: Vec3, n: Vec3) => `${p.join()}|${n.join()}`;
const INDEX = new Map(FACELETS.map((f, i) => [key(f.p, f.n), i]));

// Quarter turn about +axis: dir +1 = counter-clockwise seen from +axis (right-hand rule, same as three.js).
export function rotate(v: Vec3, axis: Axis, dir: 1 | -1): Vec3 {
  const [x, y, z] = v;
  if (axis === 0) return [x, -dir * z, dir * y];
  if (axis === 1) return [dir * z, y, -dir * x];
  return [-dir * y, dir * x, z];
}

// axis, turned layers, direction of the unprimed move
const BASE: Record<BaseMove, [Axis, number[], 1 | -1]> = {
  U: [1, [1], -1], E: [1, [0], 1], D: [1, [-1], 1],
  R: [0, [1], -1], M: [0, [0], 1], L: [0, [-1], 1],
  F: [2, [1], -1], S: [2, [0], -1], B: [2, [-1], 1],
  x: [0, [-1, 0, 1], -1], y: [1, [-1, 0, 1], -1], z: [2, [-1, 0, 1], -1],
};

export interface MoveInfo { base: BaseMove; axis: Axis; layers: number[]; dir: 1 | -1; turns: 1 | 2 }

const MOVE_RE = /^([UDRLFBMESxyz])(2|'|)$/;

export function isMove(m: string): boolean { return MOVE_RE.test(m); }

export function parseMove(m: string): MoveInfo {
  const hit = MOVE_RE.exec(m);
  if (!hit) throw new Error(`Invalid move: ${m}`);
  const base = hit[1] as BaseMove;
  const [axis, layers, baseDir] = BASE[base];
  const dir = (hit[2] === "'" ? -baseDir : baseDir) as 1 | -1;
  return { base, axis, layers, dir, turns: hit[2] === '2' ? 2 : 1 };
}

// Name of the layer move (unprimed or primed) that turns `layer` of `axis` by a quarter in `dir`.
const LAYER_NAMES: Record<Axis, Record<number, BaseMove>> = {
  0: { 1: 'R', 0: 'M', [-1]: 'L' }, 1: { 1: 'U', 0: 'E', [-1]: 'D' }, 2: { 1: 'F', 0: 'S', [-1]: 'B' },
};
export function layerMove(axis: Axis, layer: number, dir: 1 | -1): Move {
  const base = LAYER_NAMES[axis][layer];
  return BASE[base][2] === dir ? base : `${base}'`;
}

function quarterFrom(base: BaseMove): Int16Array {
  const [axis, layers, dir] = BASE[base];
  const from = new Int16Array(54);
  FACELETS.forEach((f, i) => {
    const j = layers.includes(f.p[axis]) ? INDEX.get(key(rotate(f.p, axis, dir), rotate(f.n, axis, dir)))! : i;
    from[j] = i;
  });
  return from;
}

const QUARTER = new Map(BASE_MOVES.map((b) => [b, quarterFrom(b)]));
const PERM_CACHE = new Map<Move, Int16Array>();

// from[k] = index whose sticker lands on k after the move
function permOf(m: Move): Int16Array {
  let perm = PERM_CACHE.get(m);
  if (perm) return perm;
  const { base } = parseMove(m);
  const times = m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1;
  const q = QUARTER.get(base)!;
  perm = Int16Array.from({ length: 54 }, (_, k) => k);
  for (let t = 0; t < times; t++) perm = perm.map((v) => q[v]);
  PERM_CACHE.set(m, perm);
  return perm;
}

export function solved(): State { return Uint8Array.from({ length: 54 }, (_, i) => Math.floor(i / 9)); }

export function applyMove(s: State, m: Move): State {
  const from = permOf(m);
  return s.map((_, k) => s[from[k]]);
}

export function splitMoves(seq: string): Move[] { return seq.trim().split(/\s+/).filter(Boolean); }

export function applyMoves(s: State, seq: string | Move[]): State {
  return (typeof seq === 'string' ? splitMoves(seq) : seq).reduce(applyMove, s);
}

// dest[i] = facelet where the sticker currently at i ends up
export function moveDestinations(m: Move): Int16Array {
  const from = permOf(m);
  const dest = new Int16Array(54);
  from.forEach((src, k) => { dest[src] = k; });
  return dest;
}

export function inverseMove(m: Move): Move {
  if (m.endsWith('2')) return m;
  return m.endsWith("'") ? m.slice(0, -1) : `${m}'`;
}

export function invertSequence(seq: Move[]): Move[] { return [...seq].reverse().map(inverseMove); }

export function isSolved(s: State): boolean {
  for (let f = 0; f < 6; f++) for (let k = 0; k < 9; k++) if (s[f * 9 + k] !== s[f * 9 + 4]) return false;
  return true;
}

const quarters = (m: Move) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);

// Merges neighbouring turns of the same layer: "R R" -> "R2", "U U'" -> nothing.
export function simplifyMoves(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev[0] === m[0]) {
      out.pop();
      const q = (quarters(prev) + quarters(m)) % 4;
      if (q) out.push(m[0] + ['', '', '2', "'"][q]);
    } else {
      out.push(m);
    }
  }
  return out;
}
