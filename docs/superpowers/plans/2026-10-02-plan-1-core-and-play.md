# Plan 1 — Core model, synced 3D cube + 9-ring diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single offline HTML file where the user turns a 3D Rubik's cube (drag, keyboard, keycaps) and a 9-ring circle-puzzle diagram (click a ring), with both views always in sync, in VI/EN and light/dark.

**Architecture:** A 54-facelet `Uint8Array` is the only state. Every move is a precomputed 54-element permutation. A store owns state, a move queue, undo/redo and one animation clock; the three.js view and the SVG ring view only read `store.frame(now)` and enqueue moves. They never talk to each other.

**Tech Stack:** TypeScript 7, Vite 8 + `vite-plugin-singlefile` 2, Vitest 5, three 0.186, `@fontsource` Be Vietnam Pro + JetBrains Mono (woff2 inlined).

**Spec:** `docs/superpowers/specs/2026-10-02-rubik-webui-design.md`

**Roadmap (one plan each, written after the previous one lands):**
1. **This plan:** core model, ring projection, store, both views, controls, theme, i18n, single-file build.
2. Cubie model + validation + Kociemba (Web Worker, IndexedDB cache) + right-hand tab panel + Tab "Giải" (net editor, playback).
3. LBL solver + meet-in-the-middle distance + scramble levels + Tab "Ra đề" (timer, move counter).
4. Tab "Thuật toán" content (VI/EN, Shiki) + reference implementations in 5 languages + `npm run verify:ref`.

## Global Constraints

- Runtime dependency: `three` only. Dev dependencies allowed. Adding any other dependency requires asking the user.
- Build output: one file `dist/index.html`, works from `file://`, offline, no network requests or CDN.
- Browsers: current Edge and Chrome.
- Code, identifiers, comments, commit messages: English. Every visible string goes through i18n with both `vi` and `en`.
- No `Math.random` and no time-based limits in `src/core/`, `src/solver/`, `src/scramble/`; use `mulberry32` from `src/core/prng.ts`.
- Colors, radii and fonts only from tokens in `src/ui/theme.css`; follow `DESIGN.md`.
- Animate only `transform`/`opacity` (SVG `transform` attribute counts); honor `prefers-reduced-motion` (move duration 0).
- Move timing: quarter turn 220 ms, half turn 330 ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- Size budget: `dist/index.html` ≤ 1.2 MB (this plan lands at about 0.77 MB).
- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Shell: Git Bash on Windows. Node 22.14, npm 10.9.

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html
CLAUDE.md, AGENTS.md, DESIGN.md
src/
  main.ts                 wiring: store + views + controls + animation loop
  store.ts                state, queue (max 50), undo/redo, shared animation clock
  core/cube.ts            facelets, move permutations, notation
  core/prng.ts            mulberry32
  core/rings.ts           9 rings, 54 dot positions (circle-puzzle projection)
  view/ease.ts            cubic-bezier(0.16,1,0.3,1)
  view/ringPath.ts        dot positions while a move animates
  view/rings2d.ts         SVG ring view
  view/drag.ts            sticker drag -> move
  view/cube3d.ts          three.js view
  ui/theme.css, ui/app.css
  ui/theme.ts, ui/fonts.ts, ui/storage.ts, ui/i18n.ts, ui/i18n/{vi,en}.json
  ui/keys.ts              keyboard -> command
  ui/controls.ts          keycaps + keyboard wiring
```

Tests sit next to their source as `*.test.ts`.

---

### Task 1: Project scaffold and agent docs

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `CLAUDE.md`, `AGENTS.md`
- Existing: `.gitignore` (already ignores `node_modules/`, `dist/`)

**Interfaces:**
- Produces: `npm run dev | build | preview | test | typecheck`; imports use explicit `.ts` extensions (`allowImportingTsExtensions`).

- [ ] **Step 1: Create package.json**

```json
{
  "name": "webui-local-rubik",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p . && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc -p ."
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install three@^0.186.1
npm install -D typescript@^7.0.2 vite@^8.3.2 vite-plugin-singlefile@^2.3.3 vitest@^5.0.3 @types/three@^0.186.0 @fontsource/be-vietnam-pro @fontsource/jetbrains-mono
```
Expected: `package.json` gains `dependencies.three` and the devDependencies; no errors.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  test: { environment: 'node' },
});
```

- [ ] **Step 5: Create a minimal index.html and src/main.ts**

`index.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rubik</title>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
// Entry point. Task 5 onward wires the app here.
export {};
```

- [ ] **Step 6: Write CLAUDE.md**

```markdown
# Rubik WebUI (local)

Offline single-file web app to play and learn the 3×3 Rubik's cube: a three.js cube and a 9-ring
circle-puzzle diagram kept in sync, plus tabs to generate puzzles, solve user-entered states
(Kociemba two-phase and Layer-by-Layer) and explain the algorithms in 5 languages.

- Spec: `docs/superpowers/specs/2026-10-02-rubik-webui-design.md`
- Plans: `docs/superpowers/plans/`
- Rules you must follow: `AGENTS.md`. Visual rules: `DESIGN.md`.

## Commands

- `npm run dev`: Vite dev server
- `npm test`: Vitest (logic only; no DOM tests)
- `npm run typecheck`: `tsc` (no emit)
- `npm run build`: typecheck + build `dist/index.html` (single file, open it by double-click)

## Map

- `src/core/`: pure model. `cube.ts` (facelets, move permutations), `rings.ts` (circle-puzzle geometry), `prng.ts`
- `src/store.ts`: the only state holder; move queue, undo/redo, shared animation clock
- `src/view/`: `cube3d.ts` (three.js), `rings2d.ts` (SVG), plus pure helpers `ringPath.ts`, `drag.ts`, `ease.ts`
- `src/ui/`: theme tokens, fonts, i18n (`i18n/vi.json`, `i18n/en.json`), keyboard and keycaps

## Data flow

input (drag, key, keycap, ring click) → `store.enqueue(move)` → each frame `store.frame(now)` returns
`{ id, move, t }` → `cube3d.render(anim)` and `rings2d.render(anim)` → when `t` reaches 1 the store
applies the permutation and notifies subscribers, which recolor.

## Glossary

- facelet: one of 54 stickers, indexed in Kociemba order U R F D L B, each face row-major
- cubie: one of the 26 small cubes (8 corners, 12 edges, 6 centers)
- ring / circle puzzle: one of 9 slice belts drawn as a circle; each facelet is the crossing of 2 rings
- HTM: half-turn metric (U2 counts as one move)
- G1: subgroup ⟨U, D, R2, L2, F2, B2⟩ used by Kociemba phase 2
- LBL stage: one of the 7 named Layer-by-Layer steps
```

- [ ] **Step 7: Write AGENTS.md**

```markdown
# Rules for agents working in this repo

These are hard rules. If a task seems to need breaking one, stop and ask the user.

1. The store's state is the single source of truth. Every move goes through `store.enqueue`.
   Views never mutate state and never call each other.
2. Never produce an unsolvable puzzle. A puzzle is either a move sequence applied to the solved
   state, or a constructed state that satisfies the 3 invariants (corner twist ≡ 0 mod 3, edge flip
   even, corner parity = edge parity) and passes the validator.
3. Difficulty labels must come from a measured distance, never from scramble length alone.
4. TDD for `src/core/`, `src/solver/`, `src/scramble/`, and pure helpers in `src/view/` and `src/ui/`.
   `npm test` and `npm run typecheck` must pass before every commit. Never edit a test to make it pass; fix the code.
5. Changes to `src/solver/` or `reference/` require `npm run verify:ref` to pass. Regenerate fixtures
   only on purpose, and say why in the commit message.
6. Determinism: no `Math.random` and no time-based limits in `src/core/`, `src/solver/`, `src/scramble/`.
   Use `mulberry32` from `src/core/prng.ts` and node-count limits.
7. Code, identifiers, comments and commit messages are in English. Every visible string goes through
   `t()`; add each key to both `src/ui/i18n/vi.json` and `src/ui/i18n/en.json`.
8. The only runtime dependency is `three`. Ask the user before adding any dependency.
9. The build must stay one HTML file that works from `file://` with no network requests.
   Check: `grep -Eo '(src|href)="https?://' dist/index.html` prints nothing.
10. Reference implementations: Python 3.12 stdlib only; C++17 (g++); C# on .NET 9; Java 11 (no records,
    no newer APIs); Node with no dependencies. Same algorithm structure and move order as the TypeScript solver.
11. Colors, radii, spacing and fonts come only from tokens in `src/ui/theme.css`. Follow `DESIGN.md`.
12. Animate only `transform` and `opacity`. Honor `prefers-reduced-motion`.
13. Performance budgets: Kociemba tables build < 2.5 s; cached start < 300 ms; typical solve < 1 s;
    60 fps animation; `dist/index.html` ≤ 1.2 MB.
14. Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
```

- [ ] **Step 8: Verify the toolchain**

Run: `npm run build && npm test`
Expected: build prints `dist/index.html`; Vitest prints `No test files found, exiting with code 0`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts CLAUDE.md AGENTS.md
git commit -m "chore: scaffold Vite single-file TypeScript project with agent docs"
```

---

### Task 2: Cube model (facelets, moves, notation) and PRNG

**Files:**
- Create: `src/core/cube.ts`, `src/core/prng.ts`
- Test: `src/core/cube.test.ts`, `src/core/prng.test.ts`

**Interfaces:**
- Produces (`src/core/cube.ts`):
  - `type Axis = 0 | 1 | 2` (x, y, z); `type Vec3 = readonly [number, number, number]`; `type State = Uint8Array` (54 values 0..5 = U R F D L B); `type Move = string`
  - `FACE_NAMES = 'URFDLB'`; `BASE_MOVES = ['U','D','R','L','F','B','M','E','S','x','y','z']`; `type BaseMove`
  - `FACELETS: readonly { p: Vec3; n: Vec3 }[]` (cubie position, outward normal; x→R, y→U, z→F)
  - `rotate(v: Vec3, axis: Axis, dir: 1 | -1): Vec3` (dir +1 = counter-clockwise seen from +axis)
  - `interface MoveInfo { base: BaseMove; axis: Axis; layers: number[]; dir: 1 | -1; turns: 1 | 2 }`
  - `isMove(m: string): boolean`; `parseMove(m: string): MoveInfo` (throws on invalid)
  - `layerMove(axis: Axis, layer: number, dir: 1 | -1): Move`
  - `solved(): State`; `applyMove(s, m): State`; `applyMoves(s, seq: string | Move[]): State`; `splitMoves(seq: string): Move[]`
  - `moveDestinations(m: Move): Int16Array` (`dest[i]` = where the sticker at `i` lands)
  - `inverseMove(m): Move`; `invertSequence(seq: Move[]): Move[]`; `isSolved(s): boolean`
- Produces (`src/core/prng.ts`): `mulberry32(seed: number): () => number`

- [ ] **Step 1: Write the failing tests**

`src/core/prng.test.ts`:
```ts
import { expect, it } from 'vitest';
import { mulberry32 } from './prng.ts';

it('is deterministic per seed and stays in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xs = Array.from({ length: 1000 }, a);
  expect(xs).toEqual(Array.from({ length: 1000 }, b));
  expect(xs.slice(0, 5)).not.toEqual(Array.from({ length: 5 }, c));
  expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
});
```

`src/core/cube.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BASE_MOVES, applyMove, applyMoves, invertSequence, isSolved, layerMove, moveDestinations, parseMove, solved,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "./cube.ts"` / `"./prng.ts"`.

- [ ] **Step 3: Implement src/core/prng.ts**

```ts
// Seeded PRNG (mulberry32). AGENTS.md: use this, never Math.random, in core/solver/scramble.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Implement src/core/cube.ts**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (2 files, 10 tests); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/core/cube.ts src/core/cube.test.ts src/core/prng.ts src/core/prng.test.ts
git commit -m "feat: add facelet cube model with move permutations and seeded PRNG"
```

---

### Task 3: Ring projection (circle puzzle geometry)

**Files:**
- Create: `src/core/rings.ts`
- Test: `src/core/rings.test.ts`

**Interfaces:**
- Consumes: `FACELETS`, `Axis`, `Vec3`, `moveDestinations` from `src/core/cube.ts`
- Produces (`src/core/rings.ts`):
  - `type Point = readonly [number, number]`; `type LayerName = 'U'|'E'|'D'|'R'|'M'|'L'|'F'|'S'|'B'`
  - `interface Ring { name: LayerName; axis: Axis; layer: -1|0|1; ids: number[]; center: Point; radius: number }`
  - `RINGS: readonly Ring[]` in order U E D R M L F S B; `ids` = 12 facelets in increasing SVG angle around `center`
  - `DOTS: readonly Point[]` (54 SVG positions, viewBox `-155 -155 310 310`)
  - `FAMILY_CENTER: readonly Point[]` (by axis), `RADII = [62, 80, 98]` (by layer + 1), `FAMILY_DISTANCE = 48`
  - `ringOf(axis: Axis, facelet: number): Ring | undefined`
- Geometry facts this design relies on (checked by the tests): each facelet sits on exactly 2 rings of different axes; a quarter turn of a layer shifts its ring by 3 places; a `dir = +1` turn moves ring dots toward increasing SVG angle.

- [ ] **Step 1: Write the failing test**

`src/core/rings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { moveDestinations } from './cube.ts';
import { DOTS, RINGS, ringOf } from './rings.ts';

const angle = (i: number, c: readonly [number, number]) => Math.atan2(DOTS[i][1] - c[1], DOTS[i][0] - c[0]);

describe('ring projection', () => {
  it('has 9 rings of 12 distinct facelets', () => {
    expect(RINGS.map((r) => r.name).join('')).toBe('UEDRMLFSB');
    for (const r of RINGS) expect(new Set(r.ids).size).toBe(12);
  });

  it('puts every facelet on exactly 2 rings of different families', () => {
    for (let i = 0; i < 54; i++) {
      const on = RINGS.filter((r) => r.ids.includes(i));
      expect(on).toHaveLength(2);
      expect(on[0].axis).not.toBe(on[1].axis);
    }
  });

  it('places each dot on both of its circles', () => {
    for (const r of RINGS) for (const i of r.ids) {
      expect(Math.hypot(DOTS[i][0] - r.center[0], DOTS[i][1] - r.center[1])).toBeCloseTo(r.radius, 6);
    }
  });

  it('keeps dots apart', () => {
    let min = Infinity;
    for (let i = 0; i < 54; i++) for (let j = i + 1; j < 54; j++) {
      min = Math.min(min, Math.hypot(DOTS[i][0] - DOTS[j][0], DOTS[i][1] - DOTS[j][1]));
    }
    expect(min).toBeGreaterThan(14);
  });

  it('orders each ring by increasing screen angle (same cycle as the cube)', () => {
    for (const r of RINGS) {
      const byAngle = [...r.ids].sort((i, j) => angle(i, r.center) - angle(j, r.center));
      const k = byAngle.indexOf(r.ids[0]);
      expect(r.ids).toEqual([...byAngle.slice(k), ...byAngle.slice(0, k)]);
    }
  });

  it('turning a layer rotates its ring by 3 steps', () => {
    for (const name of ['U', 'E', 'D', 'R', 'M', 'L', 'F', 'S', 'B']) {
      const ring = RINGS.find((r) => r.name === name)!;
      const dest = moveDestinations(name);
      const shifts = ring.ids.map((id, k) => (ring.ids.indexOf(dest[id]) - k + 12) % 12);
      expect(new Set(shifts).size).toBe(1);
      expect([3, 9]).toContain(shifts[0]);
    }
  });

  it('finds the ring of a facelet by axis', () => {
    expect(ringOf(1, 18)?.name).toBe('U'); // front top-left sits on the U ring
    expect(ringOf(0, 18)?.name).toBe('L');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/rings.test.ts`
Expected: FAIL, `Failed to resolve import "./rings.ts"`.

- [ ] **Step 3: Implement src/core/rings.ts**

```ts
// Circle-puzzle projection: 9 rings (3 families x 3 concentric) whose pairwise intersections are the 54 facelets.
import { FACELETS, type Axis, type Vec3 } from './cube.ts';

export type Point = readonly [number, number];
export type LayerName = 'U' | 'E' | 'D' | 'R' | 'M' | 'L' | 'F' | 'S' | 'B';

export interface Ring {
  name: LayerName;
  axis: Axis;
  layer: -1 | 0 | 1;
  ids: number[]; // 12 facelets, counter-clockwise about +axis; also increasing SVG angle
  center: Point;
  radius: number;
}

export const FAMILY_DISTANCE = 48;
export const RADII = [62, 80, 98] as const; // indexed by layer + 1

// Family centers for axes x, y, z (SVG coordinates, y grows downward)
export const FAMILY_CENTER: readonly Point[] = [-90, 30, 150].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [FAMILY_DISTANCE * Math.cos(a), FAMILY_DISTANCE * Math.sin(a)] as Point;
});

const LAYERS: [LayerName, Axis, -1 | 0 | 1][] = [
  ['U', 1, 1], ['E', 1, 0], ['D', 1, -1],
  ['R', 0, 1], ['M', 0, 0], ['L', 0, -1],
  ['F', 2, 1], ['S', 2, 0], ['B', 2, -1],
];

function angleAbout(v: Vec3, axis: Axis): number {
  const [x, y, z] = v;
  if (axis === 0) return Math.atan2(z, y);
  if (axis === 1) return Math.atan2(x, z);
  return Math.atan2(y, x);
}

const outward = (i: number): Vec3 => {
  const { p, n } = FACELETS[i];
  return [p[0] + n[0] / 2, p[1] + n[1] / 2, p[2] + n[2] / 2];
};

export const RINGS: readonly Ring[] = LAYERS.map(([name, axis, layer]) => {
  const ids = FACELETS.map((_, i) => i)
    .filter((i) => FACELETS[i].p[axis] === layer && FACELETS[i].n[axis] === 0)
    .sort((i, j) => angleAbout(outward(i), axis) - angleAbout(outward(j), axis));
  return { name, axis, layer, ids, center: FAMILY_CENTER[axis], radius: RADII[layer + 1] };
});

function intersect(c1: Point, r1: number, c2: Point, r2: number): [Point, Point] {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
  const l = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - l * l);
  const mx = c1[0] + (l * dx) / d, my = c1[1] + (l * dy) / d;
  return [[mx + (h * dy) / d, my - (h * dx) / d], [mx - (h * dy) / d, my + (h * dx) / d]];
}

// A facelet lies on the rings of the two axes perpendicular to its normal.
// Faces with a negative normal (D, L, B) take the intersection nearer the origin.
export const DOTS: readonly Point[] = FACELETS.map(({ p, n }) => {
  const na = n.findIndex((c) => c !== 0);
  const [a1, a2] = ([0, 1, 2] as Axis[]).filter((a) => a !== na);
  const [q1, q2] = intersect(FAMILY_CENTER[a1], RADII[p[a1] + 1], FAMILY_CENTER[a2], RADII[p[a2] + 1]);
  const q1Inner = Math.hypot(...q1) < Math.hypot(...q2);
  return n[na] < 0 === q1Inner ? q1 : q2;
});

export function ringOf(axis: Axis, facelet: number): Ring | undefined {
  return RINGS.find((r) => r.axis === axis && r.ids.includes(facelet));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (3 files, 17 tests). Minimum dot distance is about 18.4 units.

- [ ] **Step 5: Commit**

```bash
git add src/core/rings.ts src/core/rings.test.ts
git commit -m "feat: add 9-ring circle-puzzle projection of the 54 facelets"
```

---

### Task 4: Store (queue, undo/redo, animation clock) and easing

**Files:**
- Create: `src/store.ts`, `src/view/ease.ts`
- Test: `src/store.test.ts`, `src/view/ease.test.ts`

**Interfaces:**
- Consumes: `applyMove`, `inverseMove`, `solved`, `Move`, `State` from `src/core/cube.ts`
- Produces (`src/store.ts`):
  - `interface Anim { id: number; move: Move; t: number }` (`t` linear progress in [0, 1); `id` > 0, new per started move)
  - `type Listener = (state: State, move: Move | null) => void` (`move` null after `setState`)
  - `MAX_QUEUE = 50`
  - `createStore(durationMs: (m: Move) => number): Store` with `state`, `enqueue(move)`, `undo()`, `redo()`, `setState(s)`, `frame(now): Anim | null`, `busy(): boolean`, `subscribe(fn): () => void`
- Produces (`src/view/ease.ts`): `ease(t: number): number`

- [ ] **Step 1: Write the failing tests**

`src/store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { applyMoves, solved } from './core/cube.ts';
import { MAX_QUEUE, createStore } from './store.ts';

const make = (dur = 100) => createStore(() => dur);

describe('store', () => {
  it('animates a move over its duration, then applies it once', () => {
    const s = make();
    const seen = vi.fn();
    s.subscribe(seen);
    s.enqueue('R');
    expect(s.frame(1000)).toMatchObject({ move: 'R', t: 0 });
    expect(s.frame(1050)?.t).toBeCloseTo(0.5);
    expect(s.state).toEqual(solved());
    expect(s.frame(1100)).toBeNull();
    expect(s.state).toEqual(applyMoves(solved(), 'R'));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][1]).toBe('R');
  });

  it('plays queued moves in order with fresh ids', () => {
    const s = make();
    s.enqueue('R');
    s.enqueue('U');
    const a = s.frame(0)!;
    const b = s.frame(100)!;
    expect([a.move, b.move]).toEqual(['R', 'U']);
    expect(b.id).not.toBe(a.id);
    expect(s.busy()).toBe(true);
    expect(s.frame(200)).toBeNull();
    expect(s.busy()).toBe(false);
    expect(s.state).toEqual(applyMoves(solved(), 'R U'));
  });

  it('applies instantly when duration is 0 (reduced motion)', () => {
    const s = make(0);
    s.enqueue('R');
    s.enqueue('U');
    expect(s.frame(0)).toBeNull();
    expect(s.state).toEqual(applyMoves(solved(), 'R U'));
  });

  it('undoes and redoes', () => {
    const s = make(0);
    s.enqueue('R');
    s.enqueue('U');
    s.frame(0);
    s.undo();
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), 'R'));
    s.redo();
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), 'R U'));
    s.undo();
    s.frame(0);
    s.enqueue('F'); // a new move clears redo
    s.frame(0);
    s.redo();
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), 'R F'));
  });

  it('caps the queue', () => {
    const s = make(0);
    for (let k = 0; k < MAX_QUEUE + 10; k++) s.enqueue('U');
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), Array(MAX_QUEUE).fill('U')));
  });

  it('setState replaces state, clears queue and history', () => {
    const s = make();
    const target = applyMoves(solved(), 'R U');
    s.enqueue('F');
    s.frame(0);
    s.setState(target);
    expect(s.frame(10)).toBeNull();
    expect(s.state).toEqual(target);
    s.undo();
    expect(s.frame(20)).toBeNull();
  });
});
```

`src/view/ease.test.ts`:
```ts
import { expect, it } from 'vitest';
import { ease } from './ease.ts';

it('eases from 0 to 1, fast then slow, never going back', () => {
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  expect(ease(0.5)).toBeGreaterThan(0.85);
  let prev = 0;
  for (let k = 1; k <= 100; k++) {
    const y = ease(k / 100);
    expect(y).toBeGreaterThanOrEqual(prev);
    prev = y;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, cannot resolve `./store.ts` and `./ease.ts`.

- [ ] **Step 3: Implement src/view/ease.ts**

```ts
// cubic-bezier(0.16, 1, 0.3, 1): the motion curve from DESIGN.md
const X1 = 0.16, Y1 = 1, X2 = 0.3, Y2 = 1;
const bez = (s: number, a: number, b: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;

export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, X1, X2) < t) lo = mid; else hi = mid;
  }
  return bez((lo + hi) / 2, Y1, Y2);
}
```

- [ ] **Step 4: Implement src/store.ts**

```ts
// Single source of truth: cube state + move queue + one animation clock shared by every view.
import { applyMove, inverseMove, solved, type Move, type State } from './core/cube.ts';

export interface Anim { id: number; move: Move; t: number } // t = linear progress in [0, 1)
export type Listener = (state: State, move: Move | null) => void;
type Kind = 'do' | 'undo' | 'redo';

export const MAX_QUEUE = 50;

export interface Store {
  readonly state: State;
  enqueue(move: Move): void;
  undo(): void;
  redo(): void;
  setState(s: State): void;
  frame(now: number): Anim | null;
  busy(): boolean;
  subscribe(fn: Listener): () => void;
}

export function createStore(durationMs: (m: Move) => number): Store {
  let state = solved();
  let queue: { move: Move; kind: Kind }[] = [];
  let active: { id: number; move: Move; kind: Kind; start: number; dur: number } | null = null;
  let nextId = 1;
  const history: Move[] = [];
  const future: Move[] = [];
  const listeners = new Set<Listener>();
  const emit = (move: Move | null) => listeners.forEach((fn) => fn(state, move));

  const push = (move: Move, kind: Kind) => {
    if (queue.length < MAX_QUEUE) queue.push({ move, kind });
  };

  const finish = (move: Move, kind: Kind) => {
    state = applyMove(state, move);
    if (kind === 'do') { history.push(move); future.length = 0; }
    if (kind === 'redo') history.push(move);
    emit(move);
  };

  return {
    get state() { return state; },
    enqueue(move) { push(move, 'do'); },
    undo() {
      const last = history.pop();
      if (last === undefined) return;
      future.push(last);
      push(inverseMove(last), 'undo');
    },
    redo() {
      const next = future.pop();
      if (next !== undefined) push(next, 'redo');
    },
    setState(s) {
      state = Uint8Array.from(s);
      queue = [];
      active = null;
      history.length = 0;
      future.length = 0;
      emit(null);
    },
    frame(now) {
      for (;;) {
        if (!active) {
          const job = queue.shift();
          if (!job) return null;
          active = { id: nextId++, ...job, start: now, dur: durationMs(job.move) };
        }
        const t = active.dur <= 0 ? 1 : (now - active.start) / active.dur;
        if (t < 1) return { id: active.id, move: active.move, t };
        const done = active;
        active = null;
        finish(done.move, done.kind);
      }
    },
    busy() { return active !== null || queue.length > 0; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (5 files, 24 tests).

- [ ] **Step 6: Commit**

```bash
git add src/store.ts src/store.test.ts src/view/ease.ts src/view/ease.test.ts
git commit -m "feat: add store with move queue, undo/redo and shared animation clock"
```

---

### Task 5: Theme tokens, fonts, i18n and the app shell (+ DESIGN.md)

**Files:**
- Create: `src/ui/theme.css`, `src/ui/app.css`, `src/ui/theme.ts`, `src/ui/fonts.ts`, `src/ui/storage.ts`, `src/ui/i18n.ts`, `src/ui/i18n/vi.json`, `src/ui/i18n/en.json`, `DESIGN.md`
- Modify: `index.html` (full shell), `src/main.ts`
- Test: `src/ui/i18n.test.ts`

**Interfaces:**
- Produces:
  - `storage.ts`: `load(key): string | null`, `save(key, value): void` (keys prefixed `rubik.`; never throws)
  - `i18n.ts`: `type Lang = 'vi' | 'en'`, `type Key`, `DICTS`, `translate(dict, key, vars?)`, `t(key, vars?)`, `getLang()`, `setLang(lang)`, `applyI18n(root)` (fills `[data-i18n]` text and `[data-i18n-aria]` aria-label), `onLangChange(fn)`
  - `theme.ts`: `type Theme = 'light' | 'dark'`, `initTheme()`, `currentTheme()`, `toggleTheme()`, `cssVar(name)`, `stickerColors(): string[]` (U R F D L B)
  - `fonts.ts`: `loadFonts()`
  - DOM ids used by later tasks: `#cube-view`, `#webgl-error`, `#keycaps`, `#rings`, `#labels-toggle`, `#reset`, `#theme-toggle`, `#lang-toggle`, `#lang-current`, `#live`

- [ ] **Step 1: Write the failing test**

`src/ui/i18n.test.ts`:
```ts
import { expect, it } from 'vitest';
import { DICTS, translate } from './i18n.ts';

it('has the same keys in every language, none empty', () => {
  const vi = Object.keys(DICTS.vi).sort();
  expect(Object.keys(DICTS.en).sort()).toEqual(vi);
  for (const dict of Object.values(DICTS)) for (const v of Object.values(dict)) expect(v.trim()).not.toBe('');
});

it('fills variables and falls back to the key', () => {
  expect(translate({ a: 'Xoay lớp {name}' }, 'a', { name: 'U' })).toBe('Xoay lớp U');
  expect(translate({ a: 'x {missing}' }, 'a')).toBe('x {missing}');
  expect(translate({}, 'no.such.key')).toBe('no.such.key');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/i18n.test.ts`
Expected: FAIL, cannot resolve `./i18n.ts`.

- [ ] **Step 3: Create src/ui/storage.ts**

```ts
// localStorage can be missing or throw (file:// origins, private windows): fall back to defaults.
export function load(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`rubik.${key}`) ?? null;
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(`rubik.${key}`, value);
  } catch {
    // storage blocked: the setting just won't persist
  }
}
```

- [ ] **Step 4: Create the dictionaries**

`src/ui/i18n/vi.json`:
```json
{
  "app.title": "Rubik vòng giao",
  "lang.toggle": "Đổi ngôn ngữ",
  "theme.toggle": "Đổi giao diện sáng/tối",
  "action.reset": "Đặt lại",
  "action.undo": "Hoàn tác",
  "action.redo": "Làm lại",
  "cube.hint": "Kéo nền để xoay góc nhìn · kéo một ô để xoay lớp",
  "cube.noWebgl": "Trình duyệt chưa bật WebGL nên không vẽ được khối 3D. Sơ đồ vòng bên dưới vẫn chơi được đầy đủ.",
  "keys.toolbar": "Nút xoay theo ký hiệu",
  "keys.prime": "Ngược chiều",
  "keys.double": "Xoay đôi",
  "keys.hint": "Phím chữ để xoay · Shift + phím: ngược chiều · Ctrl+Z: hoàn tác",
  "rings.title": "Sơ đồ 9 vòng (circle puzzle)",
  "rings.labels": "Hiện ký hiệu",
  "rings.aria": "Chín vòng tròn giao nhau, mỗi chấm là một ô màu",
  "rings.turn": "Xoay lớp {name}",
  "move.prime": "ngược",
  "move.double": "hai lần"
}
```

`src/ui/i18n/en.json`:
```json
{
  "app.title": "Rubik Rings",
  "lang.toggle": "Switch language",
  "theme.toggle": "Switch light/dark theme",
  "action.reset": "Reset",
  "action.undo": "Undo",
  "action.redo": "Redo",
  "cube.hint": "Drag the background to orbit · drag a sticker to turn its layer",
  "cube.noWebgl": "WebGL is off in this browser, so the 3D cube can't be drawn. The ring diagram below still plays fully.",
  "keys.toolbar": "Move buttons",
  "keys.prime": "Counter-clockwise",
  "keys.double": "Double turn",
  "keys.hint": "Letter keys turn · Shift + key: counter-clockwise · Ctrl+Z: undo",
  "rings.title": "9-ring diagram (circle puzzle)",
  "rings.labels": "Show letters",
  "rings.aria": "Nine intersecting rings; each dot is one sticker",
  "rings.turn": "Turn layer {name}",
  "move.prime": "prime",
  "move.double": "twice"
}
```

- [ ] **Step 5: Create src/ui/i18n.ts**

```ts
// UI strings: every visible text goes through t(). vi.json and en.json must have the same keys.
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { load, save } from './storage.ts';

export type Lang = 'vi' | 'en';
export type Key = keyof typeof vi;
type Vars = Record<string, string | number>;

export const DICTS: Record<Lang, Record<string, string>> = { vi, en };

export function translate(dict: Record<string, string>, key: string, vars: Vars = {}): string {
  return (dict[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function detect(): Lang {
  const saved = load('lang');
  if (saved === 'vi' || saved === 'en') return saved;
  return globalThis.navigator?.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;
export const t = (key: Key, vars?: Vars): string => translate(DICTS[current], key, vars);

// Fills [data-i18n] text and [data-i18n-aria] aria-labels under root.
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as Key));
  });
}

export function setLang(lang: Lang): void {
  current = lang;
  save('lang', lang);
  document.documentElement.lang = lang;
  applyI18n(document);
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void { listeners.add(fn); }
```

- [ ] **Step 6: Run the i18n test**

Run: `npm test -- src/ui/i18n.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Create src/ui/theme.css**

```css
/* Design tokens (DESIGN.md). Components use only these variables. */
:root {
  color-scheme: light;
  --canvas: #F7F7F5;
  --surface: #FFFFFF;
  --elevated: #F1F1EF;
  --selected: #E9E9E6;
  --hairline: #E4E4E0;
  --ring: #C9CBCF;
  --mute: #6E727A;
  --body: #3A3D42;
  --ink: #16181B;
  --cta-bg: #16181B;
  --cta-fg: #F7F7F5;
  --success: #1F9D63;
  --danger: #D93C3C;
  --warning: #B7791F;
  --pale-dot-edge: #9A9DA3;

  --sticker-u: #F4F4F2;
  --sticker-r: #E0352B;
  --sticker-f: #18B35A;
  --sticker-d: #FFD23F;
  --sticker-l: #FF8A1F;
  --sticker-b: #1E6BFF;
  --plastic: #141518;

  --font-ui: 'Be Vietnam Pro', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 10px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 150ms;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --canvas: #0B0C0E;
    --surface: #111214;
    --elevated: #16181B;
    --selected: #1B1D21;
    --hairline: #23262A;
    --ring: #34373C;
    --mute: #6E727A;
    --body: #C9CBCF;
    --ink: #F2F3F5;
    --cta-bg: #F2F3F5;
    --cta-fg: #0B0C0E;
    --success: #59D499;
    --danger: #FF6161;
    --warning: #FFC533;
    --pale-dot-edge: #0B0C0E;
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --canvas: #0B0C0E;
  --surface: #111214;
  --elevated: #16181B;
  --selected: #1B1D21;
  --hairline: #23262A;
  --ring: #34373C;
  --mute: #6E727A;
  --body: #C9CBCF;
  --ink: #F2F3F5;
  --cta-bg: #F2F3F5;
  --cta-fg: #0B0C0E;
  --success: #59D499;
  --danger: #FF6161;
  --warning: #FFC533;
  --pale-dot-edge: #0B0C0E;
}
```

- [ ] **Step 8: Create src/ui/app.css**

```css
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  min-height: 100dvh;
  background: var(--canvas);
  color: var(--body);
  font: 400 13px/1.5 var(--font-ui);
}
button { font: inherit; color: inherit; }
[hidden] { display: none !important; }
.mono { font-family: var(--font-mono); }
.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.app { max-width: 1440px; margin: 0 auto; padding: 12px 16px 24px; }

.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 12px; }
.brand { display: flex; align-items: center; gap: 8px; }
.brand-mark {
  width: 14px; height: 14px; border-radius: 3px;
  background: linear-gradient(90deg, var(--sticker-r) 33%, var(--sticker-f) 33% 66%, var(--sticker-b) 66%);
}
.brand-name { color: var(--ink); font-weight: 600; font-size: 14px; }
.brand-meta { color: var(--mute); font-size: 11px; }
.topbar-actions { display: flex; gap: 6px; }

.btn {
  height: 32px; min-width: 32px; padding: 0 12px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--elevated); border: 1px solid var(--hairline); border-radius: var(--radius);
  color: var(--ink); font-weight: 500; font-size: 12px; cursor: pointer;
  transition: transform var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.btn:hover { border-color: var(--ring); }
.btn:active { transform: scale(0.98); }
.btn[aria-pressed='true'] { background: var(--selected); border-color: var(--ring); }
.btn svg { width: 16px; height: 16px; }

.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; max-width: 760px; margin: 0 auto; }
.play { display: flex; flex-direction: column; gap: 12px; }

.panel { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); padding: 10px 12px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--mute); font-size: 11px; }
.hint { margin: 0; color: var(--mute); font-size: 11px; }

.cube-view { height: clamp(260px, 42vh, 380px); touch-action: none; cursor: grab; }
.cube-view:active { cursor: grabbing; }
.cube-view canvas { display: block; width: 100%; height: 100%; }

.alert { margin: 8px 0; padding: 8px 10px; border-radius: var(--radius); font-size: 12px; }
.alert.danger { color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }

.keycaps { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 8px; }
.keycap {
  height: 32px; min-width: 32px; padding: 0 8px;
  background: var(--elevated); border: 1px solid var(--hairline); border-radius: var(--radius-sm);
  color: var(--ink); font: 500 12px var(--font-mono); cursor: pointer;
  transition: transform var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.keycap:hover { border-color: var(--ring); }
.keycap:active { transform: scale(0.96); }
.keycap[aria-pressed='true'] { background: var(--cta-bg); color: var(--cta-fg); border-color: var(--cta-bg); }
.keycap.wide { font-family: var(--font-ui); }
.keys-hint { text-align: center; margin-top: 6px; }

.rings { display: block; width: 100%; height: clamp(260px, 40vh, 380px); }
.ring-line { fill: none; stroke: var(--ring); stroke-width: 1.2; transition: stroke var(--dur-fast) var(--ease); }
.ring-hit { fill: none; stroke: transparent; stroke-width: 10; pointer-events: stroke; cursor: pointer; }
.ring:hover .ring-line, .ring:focus-visible .ring-line, .ring.active .ring-line { stroke: var(--ink); stroke-width: 2; }
.ring:focus-visible { outline: none; }
.dot circle { stroke: var(--canvas); stroke-width: 1.5; }
.dot[data-c='0'] circle, .dot[data-c='3'] circle { stroke: var(--pale-dot-edge); stroke-width: 1; }
.dot { pointer-events: none; }
.dot-label { font: 600 6px var(--font-ui); fill: #0B0C0E; }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 9: Create src/ui/theme.ts**

```ts
// Light/dark: follows the OS until the user picks one, then remembers it.
import { load, save } from './storage.ts';

export type Theme = 'light' | 'dark';

export function initTheme(): void {
  const saved = load('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}

export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  save('theme', next);
  return next;
}

export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Sticker colors live in theme.css (--sticker-u ... --sticker-b), in U R F D L B order.
export const stickerColors = (): string[] => [...'urfdlb'].map((f) => cssVar(`--sticker-${f}`));
```

- [ ] **Step 10: Create src/ui/fonts.ts**

Only woff2 files are loaded: fontsource's CSS also ships `.woff`, which would add ~200 KB to the single file for nothing on Edge/Chrome.

```ts
// woff2-only font faces (Edge/Chrome need nothing else); the build inlines each file as a data URL.
import bvpLatin400 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2?url';
import bvpLatin500 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-500-normal.woff2?url';
import bvpLatin600 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-600-normal.woff2?url';
import bvpViet400 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-400-normal.woff2?url';
import bvpViet500 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-500-normal.woff2?url';
import bvpViet600 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-600-normal.woff2?url';
import jbmLatin400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import jbmLatin500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const VIETNAMESE = 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';

const FACES: [family: string, url: string, weight: string, range: string][] = [
  ['Be Vietnam Pro', bvpLatin400, '400', LATIN],
  ['Be Vietnam Pro', bvpLatin500, '500', LATIN],
  ['Be Vietnam Pro', bvpLatin600, '600', LATIN],
  ['Be Vietnam Pro', bvpViet400, '400', VIETNAMESE],
  ['Be Vietnam Pro', bvpViet500, '500', VIETNAMESE],
  ['Be Vietnam Pro', bvpViet600, '600', VIETNAMESE],
  ['JetBrains Mono', jbmLatin400, '400', LATIN],
  ['JetBrains Mono', jbmLatin500, '500', LATIN],
];

export function loadFonts(): void {
  for (const [family, url, weight, unicodeRange] of FACES) {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, unicodeRange, display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => { /* system font fallback from theme.css */ });
  }
}
```

- [ ] **Step 11: Replace index.html with the full shell**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rubik</title>
  </head>
  <body>
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name" data-i18n="app.title"></span>
          <span class="brand-meta mono">3×3 · 54 facelet</span>
        </div>
        <div class="topbar-actions">
          <button type="button" class="btn" id="lang-toggle" data-i18n-aria="lang.toggle"><span class="mono" id="lang-current"></span></button>
          <button type="button" class="btn" id="theme-toggle" data-i18n-aria="theme.toggle">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>
          </button>
          <button type="button" class="btn" id="reset" data-i18n="action.reset"></button>
        </div>
      </header>
      <main class="layout">
        <section class="play">
          <div class="panel">
            <p class="hint" data-i18n="cube.hint"></p>
            <div id="cube-view" class="cube-view"></div>
            <p id="webgl-error" class="alert danger" data-i18n="cube.noWebgl" hidden></p>
            <div id="keycaps" class="keycaps" role="toolbar" data-i18n-aria="keys.toolbar"></div>
            <p class="hint keys-hint" data-i18n="keys.hint"></p>
          </div>
          <div class="panel">
            <div class="panel-head">
              <span data-i18n="rings.title"></span>
              <button type="button" class="btn" id="labels-toggle" aria-pressed="false" data-i18n="rings.labels"></button>
            </div>
            <svg id="rings" class="rings" viewBox="-155 -155 310 310" role="group" data-i18n-aria="rings.aria"></svg>
          </div>
        </section>
      </main>
      <div id="live" class="sr-only" aria-live="polite"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 12: Replace src/main.ts with the shell wiring**

```ts
import './ui/theme.css';
import './ui/app.css';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { initTheme, toggleTheme } from './ui/theme.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();
applyI18n(document);

$('#theme-toggle').addEventListener('click', () => toggleTheme());

const langLabel = $('#lang-current');
const showLang = () => { langLabel.textContent = getLang().toUpperCase(); };
showLang();
onLangChange(showLang);
$('#lang-toggle').addEventListener('click', () => setLang(getLang() === 'vi' ? 'en' : 'vi'));
```

- [ ] **Step 13: Write DESIGN.md**

```markdown
# DESIGN.md: Rubik WebUI

Sources: taste-skill (minimalist), impeccable.style, awesome-design-md (Raycast, Linear).

## 1. Visual theme and atmosphere
Calm, precise tool. The chrome is near-monochrome so the six sticker colors are the only saturated
thing on screen. Dark and light themes; default follows the OS; the user toggle is remembered.

## 2. Color palette and roles
| Token | Dark | Light | Role |
|---|---|---|---|
| `--canvas` | #0B0C0E | #F7F7F5 | page background |
| `--surface` | #111214 | #FFFFFF | panels |
| `--elevated` | #16181B | #F1F1EF | buttons, keycaps, inputs |
| `--selected` | #1B1D21 | #E9E9E6 | active tab/row, pressed toggle |
| `--hairline` | #23262A | #E4E4E0 | 1px borders |
| `--ring` | #34373C | #C9CBCF | ring lines, hover borders |
| `--mute` | #6E727A | #6E727A | captions, hints |
| `--body` | #C9CBCF | #3A3D42 | body text |
| `--ink` | #F2F3F5 | #16181B | headings, active ring, focus ring |
| `--cta-bg` / `--cta-fg` | #F2F3F5 / #0B0C0E | #16181B / #F7F7F5 | the one primary action per tab |
| `--success` `--danger` `--warning` | #59D499 #FF6161 #FFC533 | #1F9D63 #D93C3C #B7791F | status text; backgrounds at 12% via color-mix |
Stickers (both themes): U #F4F4F2, R #E0352B, F #18B35A, D #FFD23F, L #FF8A1F, B #1E6BFF; plastic #141518.
White and yellow dots get a 1px `--pale-dot-edge` stroke so they read on light backgrounds.

## 3. Typography
Be Vietnam Pro for UI (11px captions, 12–13px body, 14px brand, 18px headings; weights 400/500/600).
JetBrains Mono for move notation, timers, counts and code. Never Inter, never serif.

## 4. Component styling
- Primary CTA: `--cta-bg`, 32px tall, radius 8px, weight 600. One per tab.
- Secondary button `.btn`: `--elevated` + 1px `--hairline`, hover border `--ring`, active `scale(0.98)`.
- Keycap `.keycap`: mono 12px, 32px square minimum, radius 6px; pressed toggle uses CTA colors.
- Pill tabs: transparent, active `--selected` background, radius 999px.
- Panel `.panel`: `--surface`, 1px `--hairline`, radius 10px, padding 10–12px. Never nest panels.
- Alert: status color text on a 12% tint of the same color, radius 8px, inline under the field.

## 5. Layout principles
4px spacing grid (4, 6, 8, 10, 12, 16, 24). ≥1100px: two columns (play area 1.45fr, tab panel 1fr).
760–1100px: tab panel 340px wide. <760px: one column, tabs below the ring diagram.

## 6. Depth and elevation
No drop shadows. Depth comes from the surface ladder (canvas → surface → elevated → selected) plus 1px hairlines.

## 7. Do's and don'ts
Do: one accent role (the CTA); concrete copy ("Màu đỏ có 10 ô, cần đúng 9"); animate only transform/opacity
with `cubic-bezier(0.16,1,0.3,1)`; honor reduced motion; keep every control keyboard-reachable.
Don't: pure #000, purple/neon gradients, glows, emoji, nested cards, chip soup, pulsing dots,
disabled buttons without a reason shown, more than one primary button per view.

## 8. Responsive behavior
Breakpoints 760px and 1100px. Touch targets ≥32px. The 3D view uses Pointer Events and `touch-action: none`.

## 9. Agent prompt guide
"Use the tokens in src/ui/theme.css only. Dark canvas #0B0C0E, panels #111214 with 1px #23262A borders,
white CTA, mono notation in JetBrains Mono, sticker colors only inside the cube, rings and net."
```

- [ ] **Step 14: Verify in the browser**

Run: `npm run dev`, open the printed URL in Edge.
Expected: header with "Rubik vòng giao" (or "Rubik Rings" if the browser language is not Vietnamese), VI/EN button switches every label, theme button flips dark/light and survives reload, two empty panels. No console errors.

- [ ] **Step 15: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add index.html src/main.ts src/ui DESIGN.md
git commit -m "feat: add theme tokens, woff2 fonts, VI/EN i18n and app shell"
```

---

### Task 6: Ring view (SVG) with animated dots

**Files:**
- Create: `src/view/ringPath.ts`, `src/view/rings2d.ts`
- Modify: `src/main.ts`
- Test: `src/view/ringPath.test.ts`

**Interfaces:**
- Consumes: `moveDestinations`, `parseMove`, `FACE_NAMES`, `BASE_MOVES`, `Move`, `State` (cube.ts); `DOTS`, `RINGS`, `ringOf`, `Point` (rings.ts); `Anim`, `Store` (store.ts); `ease`; `t`, `onLangChange` (i18n.ts); `stickerColors` (theme.ts)
- Produces:
  - `dotPosition(move: Move, i: number, t: number): Point` (`t` already eased)
  - `createRings2D(svg: SVGSVGElement, store: Store, colors: string[]): RingsView` with `render(anim: Anim | null)` and `setLabels(on: boolean)`

- [ ] **Step 1: Write the failing test**

`src/view/ringPath.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BASE_MOVES, moveDestinations } from '../core/cube.ts';
import { DOTS, RINGS } from '../core/rings.ts';
import { dotPosition } from './ringPath.ts';

const ALL = BASE_MOVES.flatMap((b) => [b, `${b}'`, `${b}2`]);

describe('dot animation path', () => {
  it('starts at the source dot and ends at the destination dot', () => {
    for (const m of ALL) {
      const dest = moveDestinations(m);
      for (let i = 0; i < 54; i++) {
        expect(dotPosition(m, i, 0)).toEqual(DOTS[i]);
        expect(dotPosition(m, i, 1)).toEqual(DOTS[dest[i]]);
        const mid = dotPosition(m, i, 0.999999);
        expect(mid[0]).toBeCloseTo(DOTS[dest[i]][0], 2);
        expect(mid[1]).toBeCloseTo(DOTS[dest[i]][1], 2);
      }
    }
  });

  it('slides ring dots along their circle', () => {
    const u = RINGS.find((r) => r.name === 'U')!;
    for (const i of u.ids) {
      const p = dotPosition('U', i, 0.5);
      expect(Math.hypot(p[0] - u.center[0], p[1] - u.center[1])).toBeCloseTo(u.radius, 6);
    }
  });

  it('moves ring dots in the turn direction, not backwards', () => {
    const u = RINGS.find((r) => r.name === 'U')!;
    const i = u.ids[0];
    const a0 = Math.atan2(DOTS[i][1] - u.center[1], DOTS[i][0] - u.center[0]);
    const p = dotPosition('U', i, 0.01);
    const a1 = Math.atan2(p[1] - u.center[1], p[0] - u.center[0]);
    expect(Math.sign(a1 - a0)).toBe(-1); // U has dir -1 → decreasing screen angle
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/view/ringPath.test.ts`
Expected: FAIL, cannot resolve `./ringPath.ts`.

- [ ] **Step 3: Implement src/view/ringPath.ts**

Ring dots travel along their circle in the move's direction (a `dir = +1` turn increases SVG angle, which Task 3 tests). The 8 dots of a turned face, which sit on other rings, rotate around the face's center dot in the sense the corner dot takes under a quarter turn.

```ts
// Where each dot is drawn while a move animates (t = eased progress 0..1).
import { moveDestinations, parseMove, type Move } from '../core/cube.ts';
import { DOTS, ringOf, type Point } from '../core/rings.ts';

const TAU = Math.PI * 2;
const angle = (p: Point, c: Point) => Math.atan2(p[1] - c[1], p[0] - c[0]);

// Angle from `from` to `to`, going the way `sign` says (full circle allowed).
function sweep(from: number, to: number, sign: number): number {
  let d = (to - from) % TAU;
  if (sign > 0 && d <= 0) d += TAU;
  if (sign < 0 && d >= 0) d -= TAU;
  return d;
}

function shortest(from: number, to: number): number {
  const d = (((to - from) % TAU) + TAU) % TAU;
  return d > Math.PI ? d - TAU : d;
}

// Sense in which a face cluster turns on screen: read off its corner dot under a quarter turn.
function faceSense(move: Move, face: number): number {
  const quarter = move.endsWith('2') ? move[0] : move;
  const c = DOTS[face * 9 + 4];
  const i = face * 9;
  return Math.sign(shortest(angle(DOTS[i], c), angle(DOTS[moveDestinations(quarter)[i]], c))) || 1;
}

export function dotPosition(move: Move, i: number, t: number): Point {
  const j = moveDestinations(move)[i];
  if (j === i || t <= 0) return DOTS[i];
  if (t >= 1) return DOTS[j];
  const info = parseMove(move);
  const ring = ringOf(info.axis, i);
  if (ring && info.layers.includes(ring.layer)) {
    const c = ring.center;
    const a = angle(DOTS[i], c) + sweep(angle(DOTS[i], c), angle(DOTS[j], c), info.dir) * t;
    return [c[0] + ring.radius * Math.cos(a), c[1] + ring.radius * Math.sin(a)];
  }
  const face = Math.floor(i / 9);
  const c = DOTS[face * 9 + 4];
  const a = angle(DOTS[i], c) + sweep(angle(DOTS[i], c), angle(DOTS[j], c), faceSense(move, face)) * t;
  const r0 = Math.hypot(DOTS[i][0] - c[0], DOTS[i][1] - c[1]);
  const r1 = Math.hypot(DOTS[j][0] - c[0], DOTS[j][1] - c[1]);
  const r = r0 + (r1 - r0) * t;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/view/ringPath.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement src/view/rings2d.ts**

```ts
// SVG view of the circle puzzle. Reads the store, never writes state except by enqueueing moves.
import { FACE_NAMES, parseMove, type State } from '../core/cube.ts';
import { DOTS, RINGS } from '../core/rings.ts';
import type { Anim, Store } from '../store.ts';
import { onLangChange, t } from '../ui/i18n.ts';
import { ease } from './ease.ts';
import { dotPosition } from './ringPath.ts';

const NS = 'http://www.w3.org/2000/svg';
const DOT_RADIUS = 5;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export interface RingsView {
  render(anim: Anim | null): void;
  setLabels(on: boolean): void;
}

export function createRings2D(svg: SVGSVGElement, store: Store, colors: string[]): RingsView {
  const rings = RINGS.map((ring) => {
    const g = el('g', { class: 'ring', tabindex: 0, role: 'button' });
    const circle = { cx: ring.center[0], cy: ring.center[1], r: ring.radius };
    g.append(el('circle', { ...circle, class: 'ring-line' }), el('circle', { ...circle, class: 'ring-hit' }));
    const turn = (prime: boolean) => store.enqueue(prime ? `${ring.name}'` : ring.name);
    g.addEventListener('click', (e) => turn(e.shiftKey));
    g.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      turn(e.shiftKey);
    });
    svg.append(g);
    return { ring, g };
  });
  const label = () => rings.forEach(({ ring, g }) => g.setAttribute('aria-label', t('rings.turn', { name: ring.name })));
  label();
  onLangChange(label);

  const dots = DOTS.map(() => {
    const g = el('g', { class: 'dot' });
    const c = el('circle', { r: DOT_RADIUS });
    const text = el('text', { class: 'dot-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    g.append(c, text);
    svg.append(g);
    return { g, c, text };
  });

  let labels = false;
  let shownId = 0; // 0 = dots at rest

  const paint = (s: State) => dots.forEach((d, i) => {
    d.c.setAttribute('fill', colors[s[i]]);
    d.g.dataset.c = String(s[i]);
    d.text.textContent = labels ? FACE_NAMES[s[i]] : '';
  });

  const place = (anim: Anim | null) => dots.forEach((d, i) => {
    const [x, y] = anim ? dotPosition(anim.move, i, ease(anim.t)) : DOTS[i];
    d.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  });

  const highlight = (anim: Anim | null) => {
    const info = anim && parseMove(anim.move);
    rings.forEach(({ ring, g }) => g.classList.toggle('active', !!info && info.axis === ring.axis && info.layers.includes(ring.layer)));
  };

  paint(store.state);
  place(null);
  store.subscribe((s) => paint(s));

  return {
    render(anim) {
      const id = anim?.id ?? 0;
      if (id === 0 && shownId === 0) return;
      place(anim);
      if (id !== shownId) highlight(anim);
      shownId = id;
    },
    setLabels(on) {
      labels = on;
      paint(store.state);
    },
  };
}
```

- [ ] **Step 6: Replace src/main.ts to wire store + ring view**

```ts
import './ui/theme.css';
import './ui/app.css';
import { solved } from './core/cube.ts';
import { createStore } from './store.ts';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { initTheme, stickerColors, toggleTheme } from './ui/theme.ts';
import { createRings2D } from './view/rings2d.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore((m) => (reducedMotion.matches ? 0 : m.endsWith('2') ? 330 : 220));
const colors = stickerColors();

const rings = createRings2D($<SVGSVGElement>('#rings'), store, colors);
applyI18n(document);

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
  rings.render(store.frame(now));
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev` and open it in Edge.
Expected:
- 9 rings and 54 dots in 6 color clusters.
- Click the outer ring of the top family: its 12 dots glide along it for about 220 ms while the ring line turns `--ink`, and the 8 dots of one cluster rotate around their center dot.
- Shift+click turns the other way. Tab to a ring and press Enter to turn it.
- "Hiện ký hiệu" prints U/R/F/D/L/B in each dot. "Đặt lại" restores the solved clusters.

- [ ] **Step 8: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add src/view/ringPath.ts src/view/ringPath.test.ts src/view/rings2d.ts src/main.ts
git commit -m "feat: add interactive 9-ring SVG view with animated dots"
```

---

### Task 7: 3D cube view (three.js) with sticker drag

**Files:**
- Create: `src/view/drag.ts`, `src/view/cube3d.ts`
- Modify: `src/main.ts`
- Test: `src/view/drag.test.ts`

**Interfaces:**
- Consumes: `FACELETS`, `layerMove`, `parseMove`, `moveDestinations`, `Axis`, `Vec3`, `State`, `Move` (cube.ts); `Anim`, `Store`; `ease`; `cssVar`, `stickerColors` (theme.ts)
- Produces:
  - `dragToMove(normal: Vec3, cubie: Vec3, dir: Vec3): Move | null` (the turn axis is `normal × dir`)
  - `candidateDirs(normal: Vec3): Vec3[]` (the 4 axis-aligned in-plane directions)
  - `createCube3D(host: HTMLElement, store: Store, colors: string[], plastic: string): CubeView | null` (null when WebGL is unavailable); `CubeView.render(anim: Anim | null)`

- [ ] **Step 1: Write the failing test**

`src/view/drag.test.ts`:
```ts
import { expect, it } from 'vitest';
import { FACELETS, moveDestinations } from '../core/cube.ts';
import { candidateDirs, dragToMove } from './drag.ts';

it('maps drags on the front face to the expected moves', () => {
  expect(dragToMove([0, 0, 1], [1, 1, 1], [0, 1, 0])).toBe('R'); // right column up
  expect(dragToMove([0, 0, 1], [1, 1, 1], [1, 0, 0])).toBe("U'"); // top row right
  expect(dragToMove([0, 0, 1], [0, 0, 1], [0, -1, 0])).toBe('M'); // middle column down
  expect(dragToMove([0, 1, 0], [-1, 1, 0], [0, 0, 1])).toBe('L'); // up face, left column toward the front
});

it('always moves the grabbed sticker toward the drag direction', () => {
  const surface = (i: number) => FACELETS[i].p.map((c, k) => c + FACELETS[i].n[k] / 2);
  FACELETS.forEach((f, i) => {
    for (const d of candidateDirs(f.n)) {
      const j = moveDestinations(dragToMove(f.n, f.p, d)!)[i];
      const a = surface(i), b = surface(j);
      expect((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1] + (b[2] - a[2]) * d[2]).toBeGreaterThan(0);
    }
  });
});

it('offers 4 in-plane directions', () => {
  expect(candidateDirs([0, 0, 1])).toEqual([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/view/drag.test.ts`
Expected: FAIL, cannot resolve `./drag.ts`.

- [ ] **Step 3: Implement src/view/drag.ts**

```ts
// Turn a drag on a sticker into a layer move.
import { layerMove, type Axis, type Move, type Vec3 } from '../core/cube.ts';

// normal: outward normal of the grabbed facelet; cubie: its cubie position;
// dir: axis-aligned unit vector (cube coordinates) the sticker should travel along.
// The turn axis is normal x dir, so the sticker moves exactly along dir.
export function dragToMove(normal: Vec3, cubie: Vec3, dir: Vec3): Move | null {
  const w: Vec3 = [
    normal[1] * dir[2] - normal[2] * dir[1],
    normal[2] * dir[0] - normal[0] * dir[2],
    normal[0] * dir[1] - normal[1] * dir[0],
  ];
  const axis = w.findIndex((c) => c !== 0) as Axis | -1;
  if (axis === -1) return null;
  return layerMove(axis, cubie[axis], w[axis] > 0 ? 1 : -1);
}

// The 4 in-plane directions a sticker with this normal can move along.
export function candidateDirs(normal: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (let a = 0; a < 3; a++) {
    if (normal[a] !== 0) continue;
    for (const s of [1, -1]) {
      const v: [number, number, number] = [0, 0, 0];
      v[a] = s;
      out.push(v);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/view/drag.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement src/view/cube3d.ts**

Design notes:
- Stickers stay in fixed facelet slots and are recolored after each move, so no cubie identity is tracked.
- During a move, the turning layer is parked in the `turn` group, which rotates by `dir × turns × 90° × ease(t)`.
- Use `add`, never `attach`, to move meshes in and out of `turn` while it has identity rotation. This keeps local transforms exact; `attach` re-derives them from world matrices and drifts over thousands of moves.
- Render only when dirty: during a move, while orbiting, after a recolor, or after a resize.

```ts
// three.js view. Stickers stay in fixed slots and are recolored from the store state after each move;
// during a move the turning layer's meshes are parked in a group that rotates by the eased progress.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FACELETS, parseMove, type State, type Vec3 } from '../core/cube.ts';
import type { Anim, Store } from '../store.ts';
import { candidateDirs, dragToMove } from './drag.ts';
import { ease } from './ease.ts';

export interface CubeView { render(anim: Anim | null): void }

const DRAG_START_PX = 8;
const ORBIT_SPEED = 0.008;
const AXES = ['x', 'y', 'z'] as const;

function stickerShape(size: number, radius: number): THREE.Shape {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return s;
}

// Returns null when WebGL is unavailable; the caller shows a notice and the ring view keeps working.
export function createCube3D(host: HTMLElement, store: Store, colors: string[], plastic: string): CubeView | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const canvas = renderer.domElement;
  host.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x30343a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(4, 6, 8);
  scene.add(sun);

  const root = new THREE.Group();
  root.rotation.set(0.5, -0.65, 0); // shows U, F and R
  scene.add(root);
  const turn = new THREE.Group();
  root.add(turn);
  const pieces: THREE.Mesh[] = [];

  const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: plastic, roughness: 0.6 });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(x, y, z);
    root.add(body);
    pieces.push(body);
  }

  const stickerGeo = new THREE.ShapeGeometry(stickerShape(0.82, 0.12));
  const stickerMats = colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
  const stickers = FACELETS.map(({ p, n }, i) => {
    const m = new THREE.Mesh(stickerGeo, stickerMats[0]);
    m.position.set(p[0] + n[0] * 0.485, p[1] + n[1] * 0.485, p[2] + n[2] * 0.485);
    m.lookAt(m.position.x + n[0], m.position.y + n[1], m.position.z + n[2]); // before parenting: local space
    m.userData.facelet = i;
    root.add(m);
    pieces.push(m);
    return m;
  });

  let dirty = true;
  const paint = (s: State) => {
    stickers.forEach((m, i) => { m.material = stickerMats[s[i]]; });
    dirty = true;
  };
  paint(store.state);
  store.subscribe((s) => paint(s));

  new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, w < h ? 11 * (h / w) : 11);
    camera.updateProjectionMatrix();
    dirty = true;
  }).observe(host);

  // --- pointer: drag background = orbit, drag sticker = turn its layer
  const ray = new THREE.Raycaster();
  const toPixels = (local: THREE.Vector3) => {
    const v = local.applyMatrix4(root.matrixWorld).project(camera);
    return new THREE.Vector2(((v.x + 1) / 2) * canvas.clientWidth, ((1 - v.y) / 2) * canvas.clientHeight);
  };
  const pickFacelet = (e: PointerEvent): number => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(stickers, false)[0];
    return hit ? (hit.object.userData.facelet as number) : -1;
  };
  const stickerDrag = (i: number, drag: THREE.Vector2) => {
    const { p, n } = FACELETS[i];
    root.updateMatrixWorld();
    const surface = new THREE.Vector3(p[0] + n[0] / 2, p[1] + n[1] / 2, p[2] + n[2] / 2);
    const origin = toPixels(surface.clone());
    let best: Vec3 | null = null;
    let bestScore = -Infinity;
    for (const d of candidateDirs(n)) {
      const screen = toPixels(surface.clone().add(new THREE.Vector3(...d))).sub(origin).normalize();
      const score = screen.dot(drag);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best && dragToMove(n, p, best);
  };

  let gesture: { facelet: number; x: number; y: number; done: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    gesture = { facelet: pickFacelet(e), x: e.clientX, y: e.clientY, done: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (gesture.facelet < 0) {
      const q = new THREE.Quaternion();
      root.quaternion.premultiply(q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * ORBIT_SPEED));
      root.quaternion.premultiply(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * ORBIT_SPEED));
      gesture.x = e.clientX;
      gesture.y = e.clientY;
      dirty = true;
      return;
    }
    if (gesture.done || Math.hypot(dx, dy) < DRAG_START_PX) return;
    const move = stickerDrag(gesture.facelet, new THREE.Vector2(dx, dy).normalize());
    if (move) store.enqueue(move);
    gesture.done = true;
  });
  const end = () => { gesture = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // --- animation
  let shownId = 0;
  const releaseLayer = () => {
    turn.rotation.set(0, 0, 0);
    [...turn.children].forEach((c) => root.add(c)); // turn is identity here, so local transforms stay exact
  };
  const grabLayer = (anim: Anim) => {
    const { axis, layers } = parseMove(anim.move);
    for (const m of pieces) if (layers.includes(Math.round(m.position[AXES[axis]]))) turn.add(m);
  };

  return {
    render(anim) {
      const id = anim?.id ?? 0;
      if (id !== shownId) {
        releaseLayer();
        if (anim) grabLayer(anim);
        shownId = id;
        dirty = true;
      }
      if (anim) {
        const { axis, dir, turns } = parseMove(anim.move);
        turn.rotation.set(0, 0, 0);
        turn.rotation[AXES[axis]] = dir * turns * (Math.PI / 2) * ease(anim.t);
        dirty = true;
      }
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
    },
  };
}
```

- [ ] **Step 6: Wire the cube into src/main.ts**

Replace the whole file:
```ts
import './ui/theme.css';
import './ui/app.css';
import { solved } from './core/cube.ts';
import { createStore } from './store.ts';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { cssVar, initTheme, stickerColors, toggleTheme } from './ui/theme.ts';
import { createCube3D } from './view/cube3d.ts';
import { createRings2D } from './view/rings2d.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore((m) => (reducedMotion.matches ? 0 : m.endsWith('2') ? 330 : 220));
const colors = stickerColors();

const cube = createCube3D($('#cube-view'), store, colors, cssVar('--plastic'));
if (!cube) {
  $('#cube-view').hidden = true;
  $('#webgl-error').hidden = false;
}
const rings = createRings2D($<SVGSVGElement>('#rings'), store, colors);
applyI18n(document);

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

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev` and open it in Edge.
Expected:
- The cube shows U (white) on top, F (green) front-left, R (red) front-right.
- Dragging the background orbits the cube.
- Dragging the front-center sticker up turns the middle slice up (`M'`). Dragging it right turns `E`. Dragging the front-right column up turns `R`.
- Every 3D turn plays the same move on the ring diagram at the same time.
- Clicking a ring turns the cube.
- After click-turning ring R, then ring U, the front face reads `RRR / GGY / GGY` top to bottom (red, green, yellow).
- In Edge `edge://flags`, disabling WebGL and reloading shows the red notice; the rings still work.

- [ ] **Step 8: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add src/view/drag.ts src/view/drag.test.ts src/view/cube3d.ts src/main.ts
git commit -m "feat: add three.js cube view synced with the ring diagram"
```

---

### Task 8: Keyboard, keycaps, undo/redo and screen-reader announcements

**Files:**
- Create: `src/ui/keys.ts`, `src/ui/controls.ts`
- Modify: `src/main.ts`
- Test: `src/ui/keys.test.ts`

**Interfaces:**
- Consumes: `BASE_MOVES`, `parseMove`, `Move` (cube.ts); `Store`; `t`, `Key` (i18n.ts)
- Produces:
  - `type Command = { type: 'move'; move: Move } | { type: 'undo' } | { type: 'redo' }`
  - `keyToCommand(e: KeyLike, double: boolean): Command | null` (letters `U D R L F B M E S x y z`; Shift = prime; `double` → `2`; Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Ctrl+Shift+Z redo; Alt ignored)
  - `speakMove(m: Move): string` ("U ngược" / "U prime", "R hai lần" / "R twice")
  - `mountControls(bar: HTMLElement, store: Store): void`

- [ ] **Step 1: Write the failing test**

`src/ui/keys.test.ts`:
```ts
import { expect, it } from 'vitest';
import { keyToCommand } from './keys.ts';

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

it('maps letters to moves', () => {
  expect(keyToCommand(key('r'), false)).toEqual({ type: 'move', move: 'R' });
  expect(keyToCommand(key('R', { shiftKey: true }), false)).toEqual({ type: 'move', move: "R'" });
  expect(keyToCommand(key('m'), true)).toEqual({ type: 'move', move: 'M2' });
  expect(keyToCommand(key('X', { shiftKey: true }), false)).toEqual({ type: 'move', move: "x'" });
});

it('maps undo/redo and ignores everything else', () => {
  expect(keyToCommand(key('z', { ctrlKey: true }), false)).toEqual({ type: 'undo' });
  expect(keyToCommand(key('y', { ctrlKey: true }), false)).toEqual({ type: 'redo' });
  expect(keyToCommand(key('Z', { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: 'redo' });
  expect(keyToCommand(key('r', { ctrlKey: true }), false)).toBeNull();
  expect(keyToCommand(key('f', { altKey: true }), false)).toBeNull();
  expect(keyToCommand(key('q'), false)).toBeNull();
  expect(keyToCommand(key('Enter'), false)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/keys.test.ts`
Expected: FAIL, cannot resolve `./keys.ts`.

- [ ] **Step 3: Implement src/ui/keys.ts**

```ts
// Keyboard -> command. Letters turn layers, Shift = prime, the "2" toggle = double.
import type { Move } from '../core/cube.ts';

export type Command = { type: 'move'; move: Move } | { type: 'undo' } | { type: 'redo' };

export interface KeyLike { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }

const LETTERS = new Set(['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z']);

export function keyToCommand(e: KeyLike, double: boolean): Command | null {
  const k = e.key.length === 1 ? e.key : '';
  if (e.ctrlKey || e.metaKey) {
    if (k.toLowerCase() === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (k.toLowerCase() === 'y') return { type: 'redo' };
    return null;
  }
  if (e.altKey || !k) return null; // Alt+letter opens browser menus in Edge/Chrome
  const lower = k.toLowerCase();
  const base = 'xyz'.includes(lower) ? lower : lower.toUpperCase();
  if (!LETTERS.has(base)) return null;
  const suffix = double ? '2' : e.shiftKey ? "'" : '';
  return { type: 'move', move: base + suffix };
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/ui/keys.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement src/ui/controls.ts**

```ts
// Keycap toolbar + keyboard shortcuts. Everything ends in store.enqueue / undo / redo.
import { BASE_MOVES, parseMove, type Move } from '../core/cube.ts';
import type { Store } from '../store.ts';
import { t, type Key } from './i18n.ts';
import { keyToCommand } from './keys.ts';

export function speakMove(m: Move): string {
  const { base, turns } = parseMove(m);
  if (turns === 2) return `${base} ${t('move.double')}`;
  return m.endsWith("'") ? `${base} ${t('move.prime')}` : base;
}

export function mountControls(bar: HTMLElement, store: Store): void {
  let modifier: '' | "'" | '2' = '';

  const button = (text: string, cls: string, i18nAria?: Key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    if (i18nAria) b.dataset.i18nAria = i18nAria;
    bar.append(b);
    return b;
  };

  for (const m of BASE_MOVES) button(m, 'keycap').addEventListener('click', () => store.enqueue(m + modifier));

  const toggles = ([["'", 'keys.prime'], ['2', 'keys.double']] as const).map(([mod, aria]) => {
    const b = button(mod, 'keycap', aria);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      modifier = modifier === mod ? '' : mod;
      toggles.forEach(([other, el]) => el.setAttribute('aria-pressed', String(modifier === other)));
    });
    return [mod, b] as const;
  });

  const undo = button('', 'keycap wide');
  undo.dataset.i18n = 'action.undo';
  undo.addEventListener('click', () => store.undo());
  const redo = button('', 'keycap wide');
  redo.dataset.i18n = 'action.redo';
  redo.addEventListener('click', () => store.redo());

  window.addEventListener('keydown', (e) => {
    if (e.repeat || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    const cmd = keyToCommand(e, modifier === '2');
    if (!cmd) return;
    e.preventDefault();
    if (cmd.type === 'undo') store.undo();
    else if (cmd.type === 'redo') store.redo();
    else store.enqueue(cmd.move);
  });
}
```

- [ ] **Step 6: Wire controls and the live region in src/main.ts**

Replace the whole file:
```ts
import './ui/theme.css';
import './ui/app.css';
import { solved } from './core/cube.ts';
import { createStore } from './store.ts';
import { mountControls, speakMove } from './ui/controls.ts';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { cssVar, initTheme, stickerColors, toggleTheme } from './ui/theme.ts';
import { createCube3D } from './view/cube3d.ts';
import { createRings2D } from './view/rings2d.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore((m) => (reducedMotion.matches ? 0 : m.endsWith('2') ? 330 : 220));
const colors = stickerColors();

const cube = createCube3D($('#cube-view'), store, colors, cssVar('--plastic'));
if (!cube) {
  $('#cube-view').hidden = true;
  $('#webgl-error').hidden = false;
}
const rings = createRings2D($<SVGSVGElement>('#rings'), store, colors);
mountControls($('#keycaps'), store);
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

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev` and open it in Edge.
Expected:
- Keys `r u f` turn R U F; `Shift+R` turns R'.
- The `2` keycap makes the next keycap press and letter key a double turn; the `'` keycap makes keycap presses prime. The two toggles exclude each other.
- `Ctrl+Z` / `Ctrl+Y` and the Hoàn tác / Làm lại keycaps undo and redo, animating on both views.
- Holding a key does not flood the queue.
- With Narrator or NVDA on, each finished move is announced ("U ngược").

- [ ] **Step 8: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS (9 test files, 34 tests).

```bash
git add src/ui/keys.ts src/ui/keys.test.ts src/ui/controls.ts src/main.ts
git commit -m "feat: add keyboard shortcuts, keycaps, undo/redo and move announcements"
```

---

### Task 9: Single-file release check

**Files:**
- Modify: none, unless a check below fails (fix in the file the failure points at)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `dist/index.html` about 770 kB (gzip about 300 kB); no warnings about unresolved imports.

- [ ] **Step 2: Check the file is self-contained and within budget**

Run:
```bash
grep -Eo '(src|href)="https?://' dist/index.html | wc -l
wc -c < dist/index.html
```
Expected: `0` external references; size below `1258291` bytes (1.2 MB).

- [ ] **Step 3: Manual checklist from file://**

Double-click `dist/index.html` (Explorer), once in Edge and once in Chrome:
- [ ] The cube and rings render; fonts are Be Vietnam Pro (Vietnamese diacritics such as "Đặt lại", "Hoàn tác" render in the same family).
- [ ] Drag-turn, orbit, ring click, keys, keycaps, undo/redo all work and both views always match.
- [ ] VI/EN switch and the light/dark switch both work. After a reload the choice survives (or falls back to defaults without errors if the browser blocks storage on `file://`).
- [ ] Width < 760px (DevTools device toolbar): single column, no horizontal scroll, touch drag works in device emulation.
- [ ] Windows "Show animations" off (or DevTools > Rendering > `prefers-reduced-motion: reduce`): moves apply instantly.
- [ ] Console has no errors.

- [ ] **Step 4: Commit if anything changed**

```bash
git add -A
git commit -m "fix: address single-file release check findings"
```
(Skip if the checklist passed with no changes.)
