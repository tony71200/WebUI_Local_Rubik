# Plan 2 — Validation, Kociemba solver and the "Giải" tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user paints a cube on a cross net, gets specific errors for impossible cubes, and gets a Kociemba two-phase solution (≤ 21 moves, usually under 100 ms). The solution plays step by step on the 3D cube and the ring diagram, at an adjustable speed.

**Architecture:**
- A pure cubie model (`src/core/cubie.ts`) converts the 54 facelets to corner/edge permutations and orientations. Validation runs in stages and reports the first stage that fails.
- The solver (`src/solver/`) is coordinate-based Kociemba. It runs in an inline Web Worker that caches its tables in IndexedDB, behind a main-thread client with a 10 s timeout and restart.
- A playback controller drives solutions through the existing store, so the views stay in sync with no new wiring.
- The right-hand panel becomes a tab host. This plan adds the "Giải" tab; plans 3 and 4 add "Ra đề" and "Thuật toán".

**Tech Stack:** TypeScript 7, Vite 8 (`?worker&inline`), Vitest 5, three 0.186 (unchanged), IndexedDB.

**Spec:** `docs/superpowers/specs/2026-10-02-rubik-webui-design.md` (sections 5.1, 7, 8.1, 8.10, 9, 10)

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-10-02-plan-1-core-and-play.md`), already on `main`. It provides:
- `src/core/cube.ts`: `State`, `Move`, `solved`, `applyMove`, `applyMoves`, `splitMoves`, `inverseMove`, `invertSequence`, `isSolved`, `FACE_NAMES`, `BASE_MOVES`
- `src/core/prng.ts`: `mulberry32`
- `src/store.ts`: `createStore(durationMs)`, with `state`, `enqueue`, `undo`, `redo`, `setState`, `frame`, `busy`, `subscribe((state, move | null) => void)`
- `src/ui/i18n.ts`: `t`, `Key`, `onLangChange`, `applyI18n`
- `src/ui/storage.ts`: `load`, `save`
- `src/ui/theme.ts`: `stickerColors`
- `src/main.ts`, `index.html`, `src/ui/app.css`

## Global Constraints

- Runtime dependency: `three` only. Ask the user before adding any dependency.
- Build output: one file `dist/index.html`, works from `file://`, offline, no network requests. The worker is inlined (`?worker&inline`).
- Kociemba is deterministic: fixed move order, node budgets, no clock, no `Math.random` (AGENTS.md rule 6).
- Defaults: stop improving at ≤ 21 moves (HTM) once 200,000 nodes are spent; hard budget 30,000,000 nodes after the first solution; a solution always exists (≤ 30).
- Budgets: tables build < 2.5 s (measured ~0.8 s); cached start < 300 ms (measured ~14 ms); typical solve < 1 s (measured ~85 ms); `dist/index.html` ≤ 1.2 MB (lands at ~0.8 MB).
- Worker hung > 10 s: terminate, start a new one, show "Bộ giải gặp lỗi…". IndexedDB failures fall back to rebuilding tables.
- Every visible string goes through `t()` with keys in both `src/ui/i18n/vi.json` and `src/ui/i18n/en.json`.
- Colors, radii and fonts only from tokens in `src/ui/theme.css`; one primary (`.cta`) button per tab; no disabled buttons (show the reason inline instead).
- Animate only `transform`/`opacity`; honor `prefers-reduced-motion`.
- Commits: Conventional Commits. `npm test` and `npm run typecheck` pass before every commit.
- Out of scope here: LBL mode and stage grouping (plan 3), scramble levels and timer (plan 3), algorithm tab and reference code (plan 4).

## File Structure

```
src/core/cubie.ts          cubie model, facelet <-> cubie, validation (7 error kinds + empty)
src/solver/coords.ts       18 face moves, move cubies, 6 Kociemba coordinates
src/solver/tables.ts       move tables + 4 pruning tables, buildTables(onStep)
src/solver/kociemba.ts     two-phase IDA* search, solveFacelets()
src/solver/protocol.ts     worker message types
src/solver/worker.ts       worker entry: IndexedDB cache, solve requests
src/solver/client.ts       main-thread client: ids, status, timeout, restart
src/ui/playback.ts         steps a solution through the store, detects manual turns
src/ui/tabs.ts             ARIA tab host for the right panel
src/ui/netEditor.ts        54-cell cross net + 6-color palette
src/ui/solveTab.ts         the "Giải" tab
```
Modified: `index.html`, `src/main.ts`, `src/ui/app.css`, `src/ui/i18n/vi.json`, `src/ui/i18n/en.json`, `CLAUDE.md`.

---

### Task 1: Cubie model and validation

**Files:**
- Create: `src/core/cubie.ts`
- Test: `src/core/cubie.test.ts`

**Interfaces:**
- Consumes: `State` from `src/core/cube.ts`
- Produces (`src/core/cubie.ts`):
  - `interface CubieCube { cp: number[]; co: number[]; ep: number[]; eo: number[] }`. Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR; `cp[i]` = corner at position i.
  - `CORNER_FACELETS`, `EDGE_FACELETS`, `CORNER_COLORS`, `EDGE_COLORS`
  - `identityCubie(): CubieCube`; `multiply(a, b): CubieCube` (a then b); `toFacelets(c): State`
  - `type ValidationError = { kind: 'empty' | 'count' | 'centers' | 'piece' | 'duplicate' | 'twist' | 'flip' | 'parity'; cells: number[] }`. The `count` kind also carries `color` and `count`.
  - `type CubieResult = { ok: true; cube: CubieCube } | { ok: false; errors: ValidationError[] }`
  - `normalize(net: ArrayLike<number>): State`: recolors so that each center's color is its face id
  - `toCubie(net: ArrayLike<number>): CubieResult`. `net` values are 0..5, or -1 for an empty cell. The checks run in stages: empty → count → centers → piece/duplicate → twist/flip/parity.

- [ ] **Step 1: Write the failing test**

`src/core/cubie.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/cubie.test.ts`
Expected: FAIL, `Failed to resolve import "./cubie.ts"`.

- [ ] **Step 3: Implement src/core/cubie.ts**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (10 files, 45 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/cubie.ts src/core/cubie.test.ts
git commit -m "feat: add cubie model and staged facelet validation"
```

---

### Task 2: Kociemba coordinates

**Files:**
- Create: `src/solver/coords.ts`
- Test: `src/solver/coords.test.ts`

**Interfaces:**
- Consumes: `applyMove`, `solved`, `Move` (cube.ts); `identityCubie`, `toCubie`, `CubieCube` (cubie.ts)
- Produces (`src/solver/coords.ts`):
  - `MOVES: Move[]` (18; index = face*3 + power, faces U R F D L B, powers quarter/half/prime); `PHASE2_MOVES = [0,1,2,9,10,11,4,13,7,16]`; `MOVE_CUBES: CubieCube[]`
  - sizes `N_TWIST=2187`, `N_FLIP=2048`, `N_SLICE=495`, `N_PERM8=40320`, `N_PERM4=24`
  - `getTwist/setTwist`, `getFlip/setFlip`, `getSlice/setSlice`, `getCornerPerm/setCornerPerm`, `getEdgePerm/setEdgePerm`, `getSlicePerm/setSlicePerm` (each `get(c: CubieCube): number`, `set(i: number): CubieCube`)
  - `permIndex(p: ArrayLike<number>): number`, `permFromIndex(idx: number, n: number): number[]`

- [ ] **Step 1: Write the failing test**

`src/solver/coords.test.ts`:
```ts
import { expect, it } from 'vitest';
import { identityCubie, type CubieCube } from '../core/cubie.ts';
import {
  MOVES, MOVE_CUBES, N_FLIP, N_PERM4, N_PERM8, N_SLICE, N_TWIST, PHASE2_MOVES,
  getCornerPerm, getEdgePerm, getFlip, getSlice, getSlicePerm, getTwist,
  permFromIndex, permIndex, setCornerPerm, setEdgePerm, setFlip, setSlice, setSlicePerm, setTwist,
} from './coords.ts';

it('lists 18 face moves and the 10 G1 moves', () => {
  expect(MOVES.slice(0, 6)).toEqual(['U', 'U2', "U'", 'R', 'R2', "R'"]);
  expect(PHASE2_MOVES.map((m) => MOVES[m])).toEqual(['U', 'U2', "U'", 'D', 'D2', "D'", 'R2', 'L2', 'F2', 'B2']);
});

it('is zero on the solved cube', () => {
  const c = identityCubie();
  expect([getTwist(c), getFlip(c), getSlice(c), getCornerPerm(c), getEdgePerm(c), getSlicePerm(c)]).toEqual([0, 0, 0, 0, 0, 0]);
});

it('round-trips every coordinate', () => {
  const cases: [number, (i: number) => CubieCube, (c: CubieCube) => number][] = [
    [N_TWIST, setTwist, getTwist], [N_FLIP, setFlip, getFlip], [N_SLICE, setSlice, getSlice],
    [N_PERM8, setCornerPerm, getCornerPerm], [N_PERM8, setEdgePerm, getEdgePerm], [N_PERM4, setSlicePerm, getSlicePerm],
  ];
  for (const [n, set, get] of cases) for (let i = 0; i < n; i++) expect(get(set(i))).toBe(i);
});

it('ranks permutations bijectively', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const p = permFromIndex(i, 4);
    expect(permIndex(p)).toBe(i);
    seen.add(p.join());
  }
  expect(seen.size).toBe(24);
});

it('keeps G1 moves inside G1', () => {
  for (const m of PHASE2_MOVES) {
    const c = MOVE_CUBES[m];
    expect([getTwist(c), getFlip(c), getSlice(c)]).toEqual([0, 0, 0]);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/solver/coords.test.ts`
Expected: FAIL, `Failed to resolve import "./coords.ts"`.

- [ ] **Step 3: Implement src/solver/coords.ts**

Move cubies are derived from the facelet model (`toCubie(applyMove(solved(), m))`), so the solver can never disagree with the views. Task 1 checks them against Kociemba's published U/R/F cubes.

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (11 files, 50 tests).

- [ ] **Step 5: Commit**

```bash
git add src/solver/coords.ts src/solver/coords.test.ts
git commit -m "feat: add Kociemba coordinates derived from the facelet model"
```

---

### Task 3: Tables and the two-phase search

**Files:**
- Create: `src/solver/tables.ts`, `src/solver/kociemba.ts`
- Test: `src/solver/kociemba.test.ts`

**Interfaces:**
- Consumes: everything from `src/solver/coords.ts`; `multiply`, `normalize`, `toCubie`, `CubieCube` (cubie.ts)
- Produces:
  - `tables.ts`: `interface Tables` (6 `Uint16Array` move tables with stride 18 + 4 `Int8Array` pruning tables); `TABLE_STEPS = 10`; `buildTables(onStep?: (done: number) => void): Tables` (calls `onStep(1..10)`)
  - `kociemba.ts`: `interface SolveOptions { maxLength?: number; improveNodes?: number; nodeLimit?: number }`; `DEFAULT_MAX_LENGTH = 21`, `DEFAULT_IMPROVE_NODES = 200_000`, `DEFAULT_NODE_LIMIT = 30_000_000`; `solveCubie(t, cube, opts?): Move[]`; `solveFacelets(t, net, opts?): Move[]` (throws `Invalid cube: <kinds>`)
- Stop rule (deterministic): the search keeps improving its best solution until one of these holds:
  - it can no longer win (best length ≤ current phase-1 depth);
  - best ≤ `maxLength` and at least `improveNodes` nodes have been spent;
  - `nodeLimit` nodes have been spent.

  None of the budgets apply before the first solution is found, so an answer always comes back. This rule is why `R` is answered with `R'`; stopping at the first solution ≤ 21 would have returned an 8-move detour.

- [ ] **Step 1: Write the failing test**

`src/solver/kociemba.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, isSolved, solved } from '../core/cube.ts';
import { mulberry32 } from '../core/prng.ts';
import { solveFacelets } from './kociemba.ts';
import { buildTables, TABLE_STEPS, type Tables } from './tables.ts';

let tables: Tables;
let buildMs = 0;
const steps: number[] = [];

beforeAll(() => {
  const t0 = performance.now();
  tables = buildTables((done) => steps.push(done));
  buildMs = performance.now() - t0;
}, 60_000);

const randomScramble = (rnd: () => number, n: number) =>
  Array.from({ length: n }, () => 'URFDLB'[Math.floor(rnd() * 6)] + ['', "'", '2'][Math.floor(rnd() * 3)]);

describe('kociemba', () => {
  it('builds every table and reports progress', () => {
    expect(steps).toEqual(Array.from({ length: TABLE_STEPS }, (_, i) => i + 1));
    expect(tables.twistSlicePrune.every((d) => d >= 0)).toBe(true);
    expect(tables.cornerSlicePrune.every((d) => d >= 0)).toBe(true);
    console.info(`tables built in ${Math.round(buildMs)} ms`);
  });

  it('returns no moves for a solved cube and short answers for near-solved ones', () => {
    expect(solveFacelets(tables, solved())).toEqual([]);
    expect(solveFacelets(tables, applyMoves(solved(), 'R'))).toEqual(["R'"]);
    expect(solveFacelets(tables, applyMoves(solved(), "F U' R2")).length).toBeLessThanOrEqual(3);
  });

  it('solves random cubes in at most 21 moves', () => {
    const rnd = mulberry32(2026);
    let total = 0;
    const t0 = performance.now();
    for (let n = 0; n < 60; n++) {
      const s = applyMoves(solved(), randomScramble(rnd, 30));
      const sol = solveFacelets(tables, s);
      expect(isSolved(applyMoves(s, sol))).toBe(true);
      expect(sol.length).toBeLessThanOrEqual(21);
      total += sol.length;
    }
    console.info(`avg ${(total / 60).toFixed(1)} moves, ${Math.round((performance.now() - t0) / 60)} ms per solve`);
  }, 60_000);

  it('solves the superflip and cubes painted around other centers', () => {
    const superflip = applyMoves(solved(), "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    expect(isSolved(applyMoves(superflip, solveFacelets(tables, superflip)))).toBe(true);
    const turned = applyMoves(solved(), "x y' R U F'");
    expect(isSolved(applyMoves(turned, solveFacelets(tables, turned)))).toBe(true);
  }, 30_000);

  it('is deterministic and respects the node budget', () => {
    const s = applyMoves(solved(), "R U2 F' L D B2 R' U F2 L' D2 B U' R2 F L2");
    expect(solveFacelets(tables, s)).toEqual(solveFacelets(tables, s));
    const tight = solveFacelets(tables, s, { nodeLimit: 1 });
    expect(isSolved(applyMoves(s, tight))).toBe(true);
  });

  it('rejects an unsolvable cube', () => {
    const s = Uint8Array.from(solved());
    [s[5], s[10]] = [s[10], s[5]];
    expect(() => solveFacelets(tables, s)).toThrow(/flip/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/solver/kociemba.test.ts`
Expected: FAIL, cannot resolve `./kociemba.ts` / `./tables.ts`.

- [ ] **Step 3: Implement src/solver/tables.ts**

```ts
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
```

- [ ] **Step 4: Implement src/solver/kociemba.ts**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (12 files, 56 tests). The log shows `tables built in` ~800 ms and `avg` ~20 moves at ~85 ms per solve. The whole suite takes about 10 s.

- [ ] **Step 6: Commit**

```bash
git add src/solver/tables.ts src/solver/kociemba.ts src/solver/kociemba.test.ts
git commit -m "feat: add deterministic Kociemba two-phase solver"
```

---

### Task 4: Solver worker and client

**Files:**
- Create: `src/solver/protocol.ts`, `src/solver/worker.ts`, `src/solver/client.ts`
- Test: `src/solver/client.test.ts`

**Interfaces:**
- Consumes: `solveFacelets` (kociemba.ts); `buildTables`, `TABLE_STEPS`, `Tables` (tables.ts); `Move` (cube.ts)
- Produces:
  - `protocol.ts`: `SolverRequest = { type: 'solve'; id; facelets: number[] }`. `SolverResponse` is one of `progress {done,total}`, `ready {fromCache, ms}`, `solution {id, moves, ms}`, or `error {id, message}`.
  - `client.ts`:
    - `type SolverStatus = { kind: 'loading'; done; total } | { kind: 'ready'; fromCache; ms } | { kind: 'failed' }`
    - `interface SolverClient { solve(net: ArrayLike<number>): Promise<Move[]>; status(): SolverStatus; onStatus(fn): void }`
    - `SOLVE_TIMEOUT_MS = 10_000`
    - `createSolverClient(makeWorker: () => Worker, timeoutMs?): SolverClient`
  - `worker.ts`: module default-imported in `main.ts` as `import SolverWorker from './solver/worker.ts?worker&inline'`. It caches tables in IndexedDB database `rubik`, store `tables`, key `kociemba-v1`.

- [ ] **Step 1: Write the failing test**

`src/solver/client.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolverClient, type SolverStatus } from './client.ts';
import type { SolverRequest, SolverResponse } from './protocol.ts';

class FakeWorker {
  onmessage: ((e: MessageEvent<SolverResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: SolverRequest[] = [];
  terminated = false;
  postMessage(msg: SolverRequest) { this.sent.push(msg); }
  terminate() { this.terminated = true; }
  reply(msg: SolverResponse) { this.onmessage?.({ data: msg } as MessageEvent<SolverResponse>); }
}

let workers: FakeWorker[];
const make = () => {
  const w = new FakeWorker();
  workers.push(w);
  return w as unknown as Worker;
};

beforeEach(() => { workers = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('solver client', () => {
  it('reports loading progress then ready', () => {
    const client = createSolverClient(make);
    const seen: SolverStatus[] = [];
    client.onStatus((s) => seen.push(s));
    workers[0].reply({ type: 'progress', done: 3, total: 10 });
    workers[0].reply({ type: 'ready', fromCache: true, ms: 120 });
    expect(seen).toEqual([{ kind: 'loading', done: 3, total: 10 }, { kind: 'ready', fromCache: true, ms: 120 }]);
    expect(client.status()).toEqual({ kind: 'ready', fromCache: true, ms: 120 });
  });

  it('resolves and rejects by request id', async () => {
    const client = createSolverClient(make);
    const a = client.solve([0, 1]);
    const b = client.solve([2, 3]);
    expect(workers[0].sent.map((r) => r.id)).toEqual([1, 2]);
    workers[0].reply({ type: 'error', id: 2, message: 'Invalid cube: flip' });
    workers[0].reply({ type: 'solution', id: 1, moves: ['R', "U'"], ms: 5 });
    await expect(a).resolves.toEqual(['R', "U'"]);
    await expect(b).rejects.toThrow('Invalid cube: flip');
  });

  it('times out, terminates the worker and starts a new one', async () => {
    const client = createSolverClient(make, 1000);
    const p = client.solve([0]);
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toThrow('timeout');
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('restarts after a crash on the next solve', async () => {
    const client = createSolverClient(make);
    const p = client.solve([0]);
    workers[0].onerror?.();
    await expect(p).rejects.toThrow('crashed');
    expect(client.status()).toEqual({ kind: 'failed' });
    void client.solve([0]).catch(() => {});
    expect(workers).toHaveLength(2);
    expect(workers[1].sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/solver/client.test.ts`
Expected: FAIL, cannot resolve `./client.ts`.

- [ ] **Step 3: Create src/solver/protocol.ts**

```ts
// Messages between the main thread and the solver worker.
export type SolverRequest = { type: 'solve'; id: number; facelets: number[] };

export type SolverResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'ready'; fromCache: boolean; ms: number }
  | { type: 'solution'; id: number; moves: string[]; ms: number }
  | { type: 'error'; id: number; message: string };
```

- [ ] **Step 4: Create src/solver/client.ts**

```ts
// Main-thread side of the solver worker: request ids, status, timeout and restart.
import type { Move } from '../core/cube.ts';
import type { SolverResponse } from './protocol.ts';

export type SolverStatus =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'ready'; fromCache: boolean; ms: number }
  | { kind: 'failed' };

export interface SolverClient {
  solve(net: ArrayLike<number>): Promise<Move[]>;
  status(): SolverStatus;
  onStatus(fn: (s: SolverStatus) => void): void;
}

export const SOLVE_TIMEOUT_MS = 10_000;

export function createSolverClient(makeWorker: () => Worker, timeoutMs = SOLVE_TIMEOUT_MS): SolverClient {
  let worker: Worker;
  let status: SolverStatus = { kind: 'loading', done: 0, total: 1 };
  let nextId = 1;
  const pending = new Map<number, { resolve: (m: Move[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<(s: SolverStatus) => void>();

  const setStatus = (s: SolverStatus) => {
    status = s;
    listeners.forEach((fn) => fn(s));
  };
  const settle = (id: number) => {
    const p = pending.get(id);
    if (p) { clearTimeout(p.timer); pending.delete(id); }
    return p;
  };
  const failAll = (reason: string) => [...pending.keys()].forEach((id) => settle(id)?.reject(new Error(reason)));

  function start() {
    worker = makeWorker();
    setStatus({ kind: 'loading', done: 0, total: 1 });
    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') setStatus({ kind: 'loading', done: msg.done, total: msg.total });
      else if (msg.type === 'ready') setStatus({ kind: 'ready', fromCache: msg.fromCache, ms: msg.ms });
      else if (msg.type === 'solution') settle(msg.id)?.resolve(msg.moves);
      else settle(msg.id)?.reject(new Error(msg.message));
    };
    worker.onerror = () => {
      worker.terminate();
      failAll('crashed');
      setStatus({ kind: 'failed' }); // the next solve() starts a fresh worker
    };
  }
  start();

  return {
    solve(net) {
      if (status.kind === 'failed') start();
      const id = nextId++;
      return new Promise<Move[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          failAll('timeout');
          start();
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ type: 'solve', id, facelets: Array.from(net) });
      });
    },
    status: () => status,
    onStatus(fn) { listeners.add(fn); },
  };
}
```

- [ ] **Step 5: Run the client test**

Run: `npm test -- src/solver/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Create src/solver/worker.ts**

The worker is not unit-tested (it is glue around the tested solver). Task 6 verifies it in the browser.

```ts
// Solver worker: builds (or loads cached) Kociemba tables once, then answers solve requests.
import { solveFacelets } from './kociemba.ts';
import type { SolverRequest, SolverResponse } from './protocol.ts';
import { buildTables, TABLE_STEPS, type Tables } from './tables.ts';

const DB_NAME = 'rubik';
const STORE = 'tables';
const CACHE_KEY = 'kociemba-v1'; // bump when the table layout changes

const post = (msg: SolverResponse) => (self as unknown as Worker).postMessage(msg);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// IndexedDB may be unavailable (some file:// setups): then tables are rebuilt on every start.
async function readCache(): Promise<Tables | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(CACHE_KEY);
      req.onsuccess = () => resolve(req.result as Tables | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function writeCache(tables: Tables): Promise<void> {
  try {
    const db = await openDb();
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(tables, CACHE_KEY);
  } catch {
    // no cache on this origin
  }
}

const ready: Promise<Tables> = (async () => {
  const t0 = performance.now();
  const cached = await readCache();
  if (cached) {
    post({ type: 'ready', fromCache: true, ms: Math.round(performance.now() - t0) });
    return cached;
  }
  const tables = buildTables((done) => post({ type: 'progress', done, total: TABLE_STEPS }));
  post({ type: 'ready', fromCache: false, ms: Math.round(performance.now() - t0) });
  void writeCache(tables);
  return tables;
})();

self.onmessage = async (e: MessageEvent<SolverRequest>) => {
  const { id, facelets } = e.data;
  try {
    const tables = await ready;
    const t0 = performance.now();
    const moves = solveFacelets(tables, facelets);
    post({ type: 'solution', id, moves, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
```

- [ ] **Step 7: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS (13 files, 60 tests).

```bash
git add src/solver/protocol.ts src/solver/worker.ts src/solver/client.ts src/solver/client.test.ts
git commit -m "feat: run the solver in a cached Web Worker behind a timeout-aware client"
```

---

### Task 5: Playback controller

**Files:**
- Create: `src/ui/playback.ts`
- Test: `src/ui/playback.test.ts`

**Interfaces:**
- Consumes: `inverseMove`, `Move`, `State` (cube.ts); `Store` (store.ts)
- Produces:
  - `interface PlaybackState { moves: Move[]; index: number; playing: boolean; stale: boolean }`. `index` = number of moves already sent to the store, so the current step is `index - 1`.
  - `interface Playback`: `state`, `load(start, moves)` (sets the store to `start`), `play`, `pause`, `toggle`, `next`, `prev`, `restart`, `onChange(fn)`
  - `createPlayback(store: Store): Playback`
- Rule: any move or `setState` that the playback did not issue marks the solution `stale` and stops it.

- [ ] **Step 1: Write the failing test**

`src/ui/playback.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyMoves, invertSequence, isSolved, solved, splitMoves } from '../core/cube.ts';
import { createStore } from '../store.ts';
import { createPlayback } from './playback.ts';

const scramble = splitMoves("R U F' L2 D");
const start = applyMoves(solved(), scramble);
const solution = invertSequence(scramble);

function setup() {
  const store = createStore(() => 0); // instant moves: frame(0) drains the queue
  const playback = createPlayback(store);
  playback.load(start, solution);
  return { store, playback };
}

describe('playback', () => {
  it('loads the start state and plays the whole solution', () => {
    const { store, playback } = setup();
    expect(store.state).toEqual(start);
    playback.play();
    store.frame(0);
    expect(isSolved(store.state)).toBe(true);
    expect(playback.state).toMatchObject({ index: 5, playing: false, stale: false });
  });

  it('steps forward and back', () => {
    const { store, playback } = setup();
    playback.next();
    playback.next();
    store.frame(0);
    expect(store.state).toEqual(applyMoves(start, solution.slice(0, 2)));
    playback.prev();
    store.frame(0);
    expect(store.state).toEqual(applyMoves(start, solution.slice(0, 1)));
    expect(playback.state.index).toBe(1);
  });

  it('restarts from the start state', () => {
    const { store, playback } = setup();
    playback.play();
    store.frame(0);
    playback.restart();
    expect(store.state).toEqual(start);
    expect(playback.state).toMatchObject({ index: 0, stale: false });
  });

  it('goes stale when the cube is turned by hand or reset', () => {
    const { store, playback } = setup();
    store.enqueue('U');
    store.frame(0);
    expect(playback.state.stale).toBe(true);
    playback.play();
    store.frame(0);
    expect(playback.state.index).toBe(0);

    const other = setup();
    other.store.setState(solved());
    expect(other.playback.state.stale).toBe(true);
  });

  it('notifies listeners', () => {
    const { store, playback } = setup();
    const seen: number[] = [];
    playback.onChange((s) => seen.push(s.index));
    playback.next();
    store.frame(0);
    expect(seen).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/playback.test.ts`
Expected: FAIL, cannot resolve `./playback.ts`.

- [ ] **Step 3: Implement src/ui/playback.ts**

```ts
// Steps through a solution on the store. Any move it did not send makes the solution stale.
import { inverseMove, type Move, type State } from '../core/cube.ts';
import type { Store } from '../store.ts';

export interface PlaybackState { moves: Move[]; index: number; playing: boolean; stale: boolean }

export interface Playback {
  readonly state: PlaybackState;
  load(start: State, moves: Move[]): void;
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  restart(): void;
  onChange(fn: (s: PlaybackState) => void): void;
}

export function createPlayback(store: Store): Playback {
  let moves: Move[] = [];
  let index = 0; // moves[0..index) have been sent to the store
  let playing = false;
  let stale = false;
  let start: State | null = null;
  let expected: Move[] = []; // sent but not finished yet
  let resetting = false;
  const listeners = new Set<(s: PlaybackState) => void>();
  const snapshot = (): PlaybackState => ({ moves, index, playing, stale });
  const emit = () => listeners.forEach((fn) => fn(snapshot()));

  const send = (m: Move) => {
    expected.push(m);
    store.enqueue(m);
  };
  const step = () => send(moves[index++]);
  const reset = (s: State) => {
    resetting = true;
    store.setState(s);
    resetting = false;
  };
  const invalidate = () => {
    stale = moves.length > 0;
    playing = false;
    expected = [];
  };

  store.subscribe((_, move) => {
    if (move === null) {
      if (!resetting) { invalidate(); emit(); }
      return;
    }
    if (expected[0] === move) {
      expected.shift();
      if (playing && !expected.length) {
        if (index < moves.length) step();
        else playing = false;
      }
    } else {
      invalidate();
    }
    emit();
  });

  const playback: Playback = {
    get state() { return snapshot(); },
    load(s, m) {
      start = Uint8Array.from(s);
      moves = m;
      index = 0;
      playing = false;
      stale = false;
      expected = [];
      reset(start);
      emit();
    },
    play() {
      if (stale || index >= moves.length) return;
      playing = true;
      if (!expected.length) step();
      emit();
    },
    pause() {
      playing = false;
      emit();
    },
    toggle() {
      if (playing) playback.pause();
      else playback.play();
    },
    next() {
      if (stale || index >= moves.length) return;
      playing = false;
      step();
      emit();
    },
    prev() {
      if (stale || index === 0) return;
      playing = false;
      send(inverseMove(moves[--index]));
      emit();
    },
    restart() {
      if (!start) return;
      playing = false;
      stale = false;
      expected = [];
      index = 0;
      reset(start);
      emit();
    },
    onChange(fn) { listeners.add(fn); },
  };
  return playback;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (14 files, 65 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/playback.ts src/ui/playback.test.ts
git commit -m "feat: add solution playback that detects manual turns"
```

---

### Task 6: Tab panel, net editor and the "Giải" tab

**Files:**
- Create: `src/ui/tabs.ts`, `src/ui/netEditor.ts`, `src/ui/solveTab.ts`
- Modify: `index.html` (add the aside), `src/main.ts`, `src/ui/app.css` (append styles before the reduced-motion block), `src/ui/i18n/vi.json`, `src/ui/i18n/en.json`, `CLAUDE.md` (map)
- Test: covered by `src/ui/i18n.test.ts` (key parity) + browser verification below

**Interfaces:**
- Consumes: `toCubie`, `ValidationError` (cubie.ts); `SolverClient`, `SolverStatus` (client.ts); `Playback`, `PlaybackState`, `createPlayback`; `Store`; `t`, `Key`, `onLangChange`, `applyI18n`; `load`, `save`; `FACE_NAMES`; `stickerColors`
- Produces:
  - `tabs.ts`: `interface TabDef { id: string; label: Key; panel: HTMLElement }`; `mountTabs(host, tabs): void`. Tabs follow the ARIA tabs pattern (arrow keys, Home, End) and the last tab is remembered under storage key `tab`. Plans 3 and 4 add `{ id: 'puzzle' }` before and `{ id: 'algo' }` after `solve`.
  - `netEditor.ts`: `EMPTY = -1`; `interface NetEditor { el; get(): Int8Array; set(cells); clear(); mark(bad: number[]); onChange(fn) }`; `createNetEditor(colors): NetEditor`
  - `solveTab.ts`: `interface SolveTabDeps { store; solver; playback; colors; setSpeed(multiplier: number) }`; `createSolveTab(deps): HTMLElement`

- [ ] **Step 1: Add the i18n keys**

Merge these keys into `src/ui/i18n/vi.json` (keep the existing keys):
```json
{
  "tabs.label": "Chức năng",
  "tab.solve": "Giải",
  "solve.netTitle": "Tô màu theo lưới chữ thập",
  "solve.palette": "Bảng màu",
  "solve.fromCube": "Lấy từ khối hiện tại",
  "solve.clear": "Xóa lưới",
  "solve.hint": "Chọn màu ở bảng màu rồi bấm vào ô. Mẹo: lấy từ khối hiện tại rồi sửa cho giống khối thật.",
  "solve.solve": "Giải",
  "solve.loading": "Đang chuẩn bị bộ giải… {pct}%",
  "solve.ready": "Bộ giải sẵn sàng ({ms} ms)",
  "solve.working": "Đang giải…",
  "solve.failed": "Bộ giải gặp lỗi. Bấm Giải để thử lại.",
  "solve.steps": "Các bước",
  "solve.count": "{n} nước",
  "solve.alreadySolved": "Khối đã được giải",
  "solve.stale": "Khối đã bị xoay tay nên lời giải không còn khớp. Bấm Giải để giải lại.",
  "player.restart": "Về đầu",
  "player.prev": "Lùi một bước",
  "player.play": "Phát",
  "player.pause": "Tạm dừng",
  "player.next": "Tới một bước",
  "player.speed": "Tốc độ",
  "color.none": "chưa tô",
  "color.0": "Trắng",
  "color.1": "Đỏ",
  "color.2": "Xanh lá",
  "color.3": "Vàng",
  "color.4": "Cam",
  "color.5": "Xanh dương",
  "err.empty": "Còn {n} ô chưa tô.",
  "err.count": "{color}: {count} ô, cần đúng 9.",
  "err.centers": "Hai mặt có cùng màu ở ô tâm.",
  "err.piece": "Có khối không tồn tại trên Rubik thật (màu đối diện nằm cạnh nhau hoặc sai tổ hợp màu).",
  "err.duplicate": "Có khối xuất hiện hai lần.",
  "err.twist": "Một góc bị vặn tại chỗ: khối này không thể giải.",
  "err.flip": "Một cạnh bị lật: khối này không thể giải.",
  "err.parity": "Hai khối bị tráo chỗ: khối này không thể giải."
}
```

Merge these keys into `src/ui/i18n/en.json`:
```json
{
  "tabs.label": "Tools",
  "tab.solve": "Solve",
  "solve.netTitle": "Paint the cross net",
  "solve.palette": "Colors",
  "solve.fromCube": "Copy the current cube",
  "solve.clear": "Clear net",
  "solve.hint": "Pick a color, then click cells. Tip: copy the current cube, then fix it to match your real one.",
  "solve.solve": "Solve",
  "solve.loading": "Preparing the solver… {pct}%",
  "solve.ready": "Solver ready ({ms} ms)",
  "solve.working": "Solving…",
  "solve.failed": "The solver failed. Press Solve to try again.",
  "solve.steps": "Steps",
  "solve.count": "{n} moves",
  "solve.alreadySolved": "Already solved",
  "solve.stale": "The cube was turned by hand, so this solution no longer applies. Press Solve again.",
  "player.restart": "Back to start",
  "player.prev": "Step back",
  "player.play": "Play",
  "player.pause": "Pause",
  "player.next": "Step forward",
  "player.speed": "Speed",
  "color.none": "empty",
  "color.0": "White",
  "color.1": "Red",
  "color.2": "Green",
  "color.3": "Yellow",
  "color.4": "Orange",
  "color.5": "Blue",
  "err.empty": "{n} cells are still empty.",
  "err.count": "{color}: {count} cells, needs exactly 9.",
  "err.centers": "Two faces share the same center color.",
  "err.piece": "Some piece can't exist on a real cube (opposite colors side by side, or a wrong color set).",
  "err.duplicate": "A piece appears twice.",
  "err.twist": "A corner is twisted in place: this cube can't be solved.",
  "err.flip": "An edge is flipped: this cube can't be solved.",
  "err.parity": "Two pieces are swapped: this cube can't be solved."
}
```

Run: `npm test -- src/ui/i18n.test.ts`
Expected: PASS (key parity holds).

- [ ] **Step 2: Create src/ui/tabs.ts**

```ts
// Pill tab bar for the right-hand panel (WAI-ARIA tabs pattern, arrow keys move between tabs).
import type { Key } from './i18n.ts';
import { load, save } from './storage.ts';

export interface TabDef { id: string; label: Key; panel: HTMLElement }

export function mountTabs(host: HTMLElement, tabs: TabDef[]): void {
  const list = document.createElement('div');
  list.className = 'tablist';
  list.setAttribute('role', 'tablist');
  list.dataset.i18nAria = 'tabs.label';
  host.append(list);

  const buttons = tabs.map(({ id, label, panel }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.id = `tab-${id}`;
    b.dataset.i18n = label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `panel-${id}`);
    list.append(b);
    panel.id = `panel-${id}`;
    panel.classList.add('tabpanel');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', b.id);
    host.append(panel);
    return b;
  });

  const show = (k: number, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === k;
      buttons[i].setAttribute('aria-selected', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      tab.panel.hidden = !on;
    });
    if (focus) buttons[k].focus();
    save('tab', tabs[k].id);
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => show(i));
    b.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const k = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (k < 0) return;
      e.preventDefault();
      show(k, true);
    });
  });

  show(Math.max(0, tabs.findIndex((tab) => tab.id === load('tab'))));
}
```

- [ ] **Step 3: Create src/ui/netEditor.ts**

```ts
// Cross-shaped 54-cell net the user paints. Cell values: color 0..5 (U R F D L B colors) or -1 = empty.
import { FACE_NAMES } from '../core/cube.ts';
import { onLangChange, t, type Key } from './i18n.ts';

// top-left cell (column, row) of each face in a 12 x 9 grid, faces in U R F D L B order
const FACE_ORIGIN: [number, number][] = [[3, 0], [6, 3], [3, 3], [3, 6], [0, 3], [9, 3]];
export const EMPTY = -1;

export interface NetEditor {
  readonly el: HTMLElement;
  get(): Int8Array;
  set(cells: ArrayLike<number>): void;
  clear(): void;
  mark(bad: number[]): void;
  onChange(fn: () => void): void;
}

const colorName = (c: number) => t((c < 0 ? 'color.none' : `color.${c}`) as Key);

export function createNetEditor(colors: string[]): NetEditor {
  const el = document.createElement('div');
  el.className = 'net-editor';

  const palette = document.createElement('div');
  palette.className = 'palette';
  palette.setAttribute('role', 'radiogroup');
  palette.dataset.i18nAria = 'solve.palette';
  const grid = document.createElement('div');
  grid.className = 'net';
  el.append(grid, palette);

  const cells = new Int8Array(54).fill(EMPTY);
  let brush = 0;
  const listeners = new Set<() => void>();

  const swatches = colors.map((color, c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = color;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { brush = c; paintSwatches(); });
    palette.append(b);
    return b;
  });
  const paintSwatches = () => swatches.forEach((b, c) => {
    b.setAttribute('aria-checked', String(c === brush));
    b.setAttribute('aria-label', colorName(c));
  });

  const buttons = Array.from({ length: 54 }, (_, i) => {
    const f = Math.floor(i / 9), k = i % 9;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'net-cell';
    b.style.gridColumn = String(FACE_ORIGIN[f][0] + (k % 3) + 1);
    b.style.gridRow = String(FACE_ORIGIN[f][1] + Math.floor(k / 3) + 1);
    b.addEventListener('click', () => {
      cells[i] = brush;
      paintCell(i);
      listeners.forEach((fn) => fn());
    });
    grid.append(b);
    return b;
  });
  const paintCell = (i: number) => {
    const b = buttons[i];
    b.style.background = cells[i] < 0 ? '' : colors[cells[i]];
    b.dataset.c = String(cells[i]);
    b.setAttribute('aria-label', `${FACE_NAMES[Math.floor(i / 9)]}${(i % 9) + 1}: ${colorName(cells[i])}`);
  };
  const paintAll = () => {
    for (let i = 0; i < 54; i++) paintCell(i);
    paintSwatches();
  };

  const editor: NetEditor = {
    el,
    get: () => Int8Array.from(cells),
    set(next) {
      for (let i = 0; i < 54; i++) cells[i] = next[i];
      paintAll();
      listeners.forEach((fn) => fn());
    },
    clear() {
      editor.set(Array.from({ length: 54 }, (_, i) => (i % 9 === 4 ? Math.floor(i / 9) : EMPTY)));
    },
    mark(bad) {
      const set = new Set(bad);
      buttons.forEach((b, i) => b.classList.toggle('bad', set.has(i)));
    },
    onChange(fn) { listeners.add(fn); },
  };
  editor.clear();
  onLangChange(paintAll);
  return editor;
}
```

- [ ] **Step 4: Create src/ui/solveTab.ts**

```ts
// Tab "Giải": paint a cube, validate it, solve it in the worker, then step through the solution.
import { toCubie, type ValidationError } from '../core/cubie.ts';
import type { SolverClient, SolverStatus } from '../solver/client.ts';
import type { Store } from '../store.ts';
import { onLangChange, t, type Key } from './i18n.ts';
import { createNetEditor } from './netEditor.ts';
import type { Playback, PlaybackState } from './playback.ts';

export interface SolveTabDeps {
  store: Store;
  solver: SolverClient;
  playback: Playback;
  colors: string[];
  setSpeed(multiplier: number): void;
}

const SPEEDS = [0.5, 1, 2, 3];

function errorText(e: ValidationError): string {
  switch (e.kind) {
    case 'empty': return t('err.empty', { n: e.cells.length });
    case 'count': return t('err.count', { color: t(`color.${e.color}` as Key), count: e.count });
    default: return t(`err.${e.kind}` as Key);
  }
}

const ICONS = {
  restart: '<path d="M4 3v10M13 3 6 8l7 5z" fill="currentColor"/>',
  prev: '<path d="M12 3 5 8l7 5z" fill="currentColor"/>',
  play: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>',
  pause: '<path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/>',
  next: '<path d="M4 3l7 5-7 5z" fill="currentColor"/><path d="M12 3v10" stroke="currentColor" stroke-width="2"/>',
};
const icon = (name: keyof typeof ICONS) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

export function createSolveTab({ store, solver, playback, colors, setSpeed }: SolveTabDeps): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <p class="lbl" data-i18n="solve.netTitle"></p>
    <div class="net-slot"></div>
    <div class="row-actions">
      <button type="button" class="btn" data-act="from-cube" data-i18n="solve.fromCube"></button>
      <button type="button" class="btn" data-act="clear" data-i18n="solve.clear"></button>
    </div>
    <p class="hint" data-i18n="solve.hint"></p>
    <div class="alert danger" role="alert" hidden><ul class="errors"></ul></div>
    <button type="button" class="cta" data-act="solve" data-i18n="solve.solve"></button>
    <p class="hint solver-status" aria-live="polite"></p>
    <section class="solution" hidden>
      <p class="lbl"><span data-i18n="solve.steps"></span> · <span class="mono move-count"></span></p>
      <div class="steps"></div>
      <div class="player">
        <button type="button" class="btn icon" data-act="restart" data-i18n-aria="player.restart">${icon('restart')}</button>
        <button type="button" class="btn icon" data-act="prev" data-i18n-aria="player.prev">${icon('prev')}</button>
        <button type="button" class="btn icon" data-act="toggle"></button>
        <button type="button" class="btn icon" data-act="next" data-i18n-aria="player.next">${icon('next')}</button>
        <label class="speed"><span data-i18n="player.speed"></span>
          <select data-act="speed">${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}×</option>`).join('')}</select>
        </label>
      </div>
      <p class="alert warning stale" hidden data-i18n="solve.stale"></p>
    </section>`;

  const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const net = createNetEditor(colors);
  q('.net-slot').replaceWith(net.el);
  const alertBox = q('.alert.danger');
  const errorList = q('.errors');
  const status = q('.solver-status');
  const solution = q('.solution');
  const steps = q('.steps');
  const toggleBtn = q<HTMLButtonElement>('[data-act="toggle"]');

  const showErrors = (errors: ValidationError[]) => {
    errorList.innerHTML = '';
    for (const e of errors) {
      const li = document.createElement('li');
      li.textContent = errorText(e);
      errorList.append(li);
    }
    alertBox.hidden = errors.length === 0;
    net.mark(errors.flatMap((e) => e.cells));
  };

  const showStatus = (s: SolverStatus) => {
    status.textContent = s.kind === 'loading' ? t('solve.loading', { pct: Math.round((100 * s.done) / s.total) })
      : s.kind === 'ready' ? t('solve.ready', { ms: s.ms })
      : t('solve.failed');
  };

  const renderPlayback = (s: PlaybackState) => {
    solution.hidden = false;
    q('.move-count').textContent = s.moves.length ? t('solve.count', { n: s.moves.length }) : t('solve.alreadySolved');
    steps.innerHTML = '';
    s.moves.forEach((m, i) => {
      const chip = document.createElement('span');
      chip.className = `step${i < s.index - 1 ? ' done' : ''}${i === s.index - 1 ? ' on' : ''}`;
      chip.textContent = m;
      steps.append(chip);
    });
    toggleBtn.innerHTML = icon(s.playing ? 'pause' : 'play');
    toggleBtn.setAttribute('aria-label', t(s.playing ? 'player.pause' : 'player.play'));
    q('.stale').hidden = !s.stale;
  };

  net.onChange(() => showErrors([]));
  solver.onStatus(showStatus);
  showStatus(solver.status());
  playback.onChange(renderPlayback);
  onLangChange(() => {
    showStatus(solver.status());
    if (!solution.hidden) renderPlayback(playback.state);
  });

  q('[data-act="from-cube"]').addEventListener('click', () => net.set(store.state));
  q('[data-act="clear"]').addEventListener('click', () => net.clear());
  q('[data-act="restart"]').addEventListener('click', () => playback.restart());
  q('[data-act="prev"]').addEventListener('click', () => playback.prev());
  q('[data-act="next"]').addEventListener('click', () => playback.next());
  toggleBtn.addEventListener('click', () => playback.toggle());
  q<HTMLSelectElement>('[data-act="speed"]').addEventListener('change', (e) => {
    setSpeed(Number((e.target as HTMLSelectElement).value));
  });

  q('[data-act="solve"]').addEventListener('click', async () => {
    const cells = net.get();
    const check = toCubie(cells);
    if (!check.ok) { showErrors(check.errors); return; }
    showErrors([]);
    status.textContent = t('solve.working');
    try {
      const moves = await solver.solve(cells);
      playback.load(Uint8Array.from(cells), moves);
      showStatus(solver.status());
    } catch {
      status.textContent = t('solve.failed');
    }
  });

  // Space plays/pauses while this tab is visible (buttons and fields keep their own Space).
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || panel.hidden || solution.hidden) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [role="button"]')) return;
    e.preventDefault();
    playback.toggle();
  });

  return panel;
}
```

- [ ] **Step 5: Append panel styles to src/ui/app.css**

Insert this block directly above the existing `@media (prefers-reduced-motion: reduce) {` block:
```css
@media (min-width: 760px) {
  .layout { max-width: none; grid-template-columns: minmax(0, 1fr) 340px; align-items: start; }
  .side { position: sticky; top: 12px; }
}
@media (min-width: 1100px) {
  .layout { grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); }
}

.tablist { display: flex; gap: 2px; padding: 2px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: 999px; }
.tab {
  flex: 1; height: 28px; border: 0; border-radius: 999px; background: transparent;
  color: var(--mute); font-weight: 500; font-size: 12px; cursor: pointer;
}
.tab[aria-selected='true'] { background: var(--selected); color: var(--ink); }
.tabpanel { padding-top: 4px; }

.lbl { margin: 12px 0 6px; color: var(--mute); font-size: 11px; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.cta {
  width: 100%; height: 32px; margin-top: 10px; border: 0; border-radius: var(--radius);
  background: var(--cta-bg); color: var(--cta-fg); font-weight: 600; font-size: 12px; cursor: pointer;
  transition: transform var(--dur-fast) var(--ease);
}
.cta:active { transform: scale(0.98); }
.alert ul { margin: 0; padding-left: 16px; }
.alert.warning { color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); }

.net { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px; max-width: 336px; margin: 0 auto; }
.net-cell {
  aspect-ratio: 1; min-width: 0; padding: 0; border: 1px solid var(--hairline); border-radius: 3px;
  background: var(--elevated); cursor: pointer;
}
.net-cell[data-c='0'], .net-cell[data-c='3'] { border-color: var(--pale-dot-edge); }
.net-cell.bad { outline: 2px solid var(--danger); outline-offset: 1px; }
.palette { display: flex; gap: 6px; justify-content: center; margin-top: 8px; }
.swatch { width: 32px; height: 32px; border: 1px solid var(--hairline); border-radius: var(--radius-sm); cursor: pointer; }
.swatch[aria-checked='true'] { outline: 2px solid var(--ink); outline-offset: 2px; }

.steps { display: flex; flex-wrap: wrap; gap: 4px; }
.step {
  min-width: 28px; height: 24px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--elevated); border: 1px solid var(--hairline); border-radius: var(--radius-sm);
  color: var(--ink); font: 500 11px var(--font-mono);
}
.step.done { color: var(--mute); }
.step.on { background: var(--cta-bg); color: var(--cta-fg); border-color: var(--cta-bg); }
.player { display: flex; gap: 6px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.btn.icon { padding: 0; width: 32px; }
.speed { display: inline-flex; gap: 6px; align-items: center; margin-left: auto; color: var(--mute); font-size: 11px; }
.speed select {
  height: 28px; background: var(--elevated); color: var(--ink); border: 1px solid var(--hairline);
  border-radius: var(--radius-sm); font: 500 11px var(--font-mono);
}
```

- [ ] **Step 6: Add the side panel to index.html**

In `index.html`, add the aside right after the closing `</section>` of `.play`, inside `<main class="layout">`:
```html
        </section>
        <aside class="panel side" id="side"></aside>
      </main>
```

- [ ] **Step 7: Replace src/main.ts**

```ts
import './ui/theme.css';
import './ui/app.css';
import { solved } from './core/cube.ts';
import { createSolverClient } from './solver/client.ts';
import SolverWorker from './solver/worker.ts?worker&inline';
import { createStore } from './store.ts';
import { mountControls, speakMove } from './ui/controls.ts';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { createPlayback } from './ui/playback.ts';
import { createSolveTab } from './ui/solveTab.ts';
import { mountTabs } from './ui/tabs.ts';
import { cssVar, initTheme, stickerColors, toggleTheme } from './ui/theme.ts';
import { createCube3D } from './view/cube3d.ts';
import { createRings2D } from './view/rings2d.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let speed = 1; // playback speed multiplier, set from the Solve tab
const store = createStore((m) => (reducedMotion.matches ? 0 : (m.endsWith('2') ? 330 : 220) / speed));
const colors = stickerColors();

const cube = createCube3D($('#cube-view'), store, colors, cssVar('--plastic'));
if (!cube) {
  $('#cube-view').hidden = true;
  $('#webgl-error').hidden = false;
}
const rings = createRings2D($<SVGSVGElement>('#rings'), store, colors);
mountControls($('#keycaps'), store);

const solver = createSolverClient(() => new SolverWorker());
const playback = createPlayback(store);
mountTabs($('#side'), [
  { id: 'solve', label: 'tab.solve', panel: createSolveTab({ store, solver, playback, colors, setSpeed: (x) => { speed = x; } }) },
]);
applyI18n(document);

const live = $('#live');
store.subscribe((_, move) => { live.textContent = move ? speakMove(move) : ''; });

$('#reset').addEventListener('click', () => store.setState(solved()));
$('#theme-toggle').addEventListener('click', () => toggleTheme());

const langLabel = $('#lang-current');
const showLang = () => { langLabel.textContent = getLang().toUpperCase(); };
showLang();
onLangChange(showLang);
$('#lang-toggle').addEventListener('click', () => setLang(getLang() === 'vi' ? 'en' : 'vi'));

const labelsBtn = $('#labels-toggle');
labelsBtn.addEventListener('click', () => {
  const on = labelsBtn.getAttribute('aria-pressed') !== 'true';
  labelsBtn.setAttribute('aria-pressed', String(on));
  rings.setLabels(on);
});

const loop = (now: number) => {
  const anim = store.frame(now);
  cube?.render(anim);
  rings.render(anim);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
```

- [ ] **Step 8: Update the map in CLAUDE.md**

Replace the `## Map` section with:
```markdown
## Map

- `src/core/`: pure model. `cube.ts` (facelets, move permutations), `cubie.ts` (corners/edges, validation), `rings.ts` (circle-puzzle geometry), `prng.ts`
- `src/solver/`: Kociemba two-phase. `coords.ts`, `tables.ts`, `kociemba.ts` (pure, tested); `worker.ts` (IndexedDB cache) + `client.ts` (timeout/restart) + `protocol.ts`
- `src/store.ts`: the only state holder; move queue, undo/redo, shared animation clock
- `src/view/`: `cube3d.ts` (three.js), `rings2d.ts` (SVG), plus pure helpers `ringPath.ts`, `drag.ts`, `ease.ts`
- `src/ui/`: theme tokens, fonts, i18n (`i18n/vi.json`, `i18n/en.json`), keyboard and keycaps, `tabs.ts`, `solveTab.ts` + `netEditor.ts` + `playback.ts`
```

- [ ] **Step 9: Verify in the browser**

Run: `npm run dev`, open it in Edge.

Expected:
- **Layout:**
  - ≥1100px wide: two columns, ratio about 1.45 : 1.
  - At 900px: the right panel is exactly 340px.
  - At 375px: one column, the panel below the ring diagram, no horizontal scroll.
- **Solver status:**
  - First load shows "Đang chuẩn bị bộ giải… N%", then "Bộ giải sẵn sàng (~700 ms)".
  - After a reload it says "(~15 ms)", because the tables come from the IndexedDB cache.
- **Validation:**
  - "Xóa lưới", then "Giải" shows "Còn 48 ô chưa tô."
  - "Lấy từ khối hiện tại" on a solved cube, then paint one white cell red, then "Giải": two errors (White 8, Red 10) and the 10 red cells get a red outline.
  - Swapping the two colors of the UR edge (cells U6 and R2) shows "Một cạnh bị lật…".
  - Any click on the net clears the errors.
- **Solving and playback:**
  - Scramble with keys (e.g. `r u f l d b`), then "Lấy từ khối hiện tại", then "Giải": about 20 move chips appear in under a second.
  - Play animates every move on both views and highlights the current chip. Pause, step back, step forward and "Về đầu" work.
  - Speed 3× is visibly faster. Space toggles play when focus is not on a button.
  - A cube one move away (press `r`, copy, solve) gets the single move `R'`.
- **Stale solution:** turning the cube by hand (key `u`) while a solution is loaded shows the orange "Khối đã bị xoay tay…" notice and stops playback.
- **Language:** VI/EN switches every new label, error and color name.

- [ ] **Step 10: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS (14 files, 65 tests).

```bash
git add index.html src/main.ts src/ui/tabs.ts src/ui/netEditor.ts src/ui/solveTab.ts src/ui/app.css src/ui/i18n/vi.json src/ui/i18n/en.json CLAUDE.md
git commit -m "feat: add tab panel and Solve tab with net editor, validation and playback"
```

---

### Task 7: Single-file release check

**Files:**
- Modify: none, unless a check fails (fix where the failure points)

- [ ] **Step 1: Build and check size and external references**

Run:
```bash
npm run build
grep -Eo '(src|href)="https?://' dist/index.html | wc -l
wc -c < dist/index.html
```
Expected:
- The build succeeds.
- `0` external references.
- Size about 795 kB, below `1258291` bytes.

- [ ] **Step 2: Manual checklist from file://**

Double-click `dist/index.html`, once in Edge and once in Chrome:
- [ ] The solver status reaches "Bộ giải sẵn sàng". This proves the inline worker starts from `file://`.
- [ ] Reload: the status shows either a small cached time or a fresh ~0.7 s build. Both are fine; a fresh build means that browser blocks IndexedDB on `file://`, and the fallback works.
- [ ] Scramble → copy → solve → play works end to end; the cube ends solved.
- [ ] DevTools > Rendering > `prefers-reduced-motion: reduce`: playback applies moves instantly.
- [ ] Console has no errors.

- [ ] **Step 3: Commit if anything changed**

```bash
git add -A
git commit -m "fix: address plan 2 release check findings"
```
(Skip if nothing changed.)
