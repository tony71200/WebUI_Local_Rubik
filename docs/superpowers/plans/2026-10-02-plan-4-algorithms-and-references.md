# Plan 4 — Algorithms tab and reference implementations in 5 languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Add the "Thuật toán" tab: 6 explained sections (VI/EN), with code that is cut at build time from runnable Kociemba + LBL implementations in Python, C++, C#, Java and JavaScript, plus downloads of the full files.
- Add `npm run verify:ref`, which proves that all five, and the TypeScript solvers, print the same solutions move for move.

**Architecture:**
- `scripts/make-fixtures.ts` runs the TypeScript solvers on 30 fixed cubes and writes `reference/expected.txt` (`--check` prints it instead).
- Each reference implementation is a single dependency-free file that reads `reference/fixtures.txt` (54 digits per line) and prints `<kociemba>;<lbl stage 1>|…|<lbl stage 7>`.
- `scripts/verify-ref.mjs` builds and runs all of them in parallel and diffs every line.
- A Vite plugin (`scripts/snippets.mjs`) cuts four `#region` blocks out of each reference file. It highlights them with Shiki (css-variables theme) at build time and compacts the HTML to one-letter classes colored by theme tokens.

**Tech Stack:**
- TypeScript 7, Vite 8, Vitest 5.
- Shiki 4 (new devDependency, allowed by spec 8.8).
- Python 3.12, g++ 15 (C++17), .NET 9, Java 11, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-02-rubik-webui-design.md` (sections 8.8, 9.2, 11)

**Builds on:** Plans 1–3; branch `20261002_lbl-and-puzzles` (or `main` once merged).
- `src/solver/kociemba.ts` (`solveFacelets`), `src/solver/tables.ts` (`buildTables`), `src/solver/lbl.ts` (`solveLbl`)
- `src/core/cube.ts` (`applyMoves`, `isSolved`, `solved`), `src/core/prng.ts` (`mulberry32`)
- `src/ui/tabs.ts` (`mountTabs`), `src/ui/i18n.ts` (`getLang`, `onLangChange`, `Lang`), `src/ui/storage.ts`

## Global Constraints

- **Dependencies:** the runtime dependency stays `three` only. Shiki is the one new devDependency (approved in spec 8.8). Do not add `@types/node`: Node-only build code lives in `.mjs` with a `.d.mts` declaration.
- **Build:** one `dist/index.html`, works from `file://`, offline, no network requests. Size ≤ 1.2 MB: it lands at about 1.09 MB (snippets about 150 kB, full sources about 120 kB).
- **Reference implementations (AGENTS.md rule 10):**
  - Python 3.12 stdlib only; C++17 with g++; C# on .NET 9; Java 11 (no records, no switch expressions, no text blocks); Node with no dependencies.
  - Same algorithm structure and move order as the TypeScript solver; output identical to `reference/expected.txt`.
- **Fixtures (AGENTS.md rule 5):** `npm run verify:ref` must pass whenever `src/solver/` or `reference/` changes. Regenerate fixtures (`npm run fixtures`) only on purpose, and say why in the commit.
- **Measured runtimes** (30 fixtures):

  | Runner | Time |
  |---|---|
  | typescript | ~4 s |
  | javascript | ~3 s |
  | python | ~57 s (tables built in CPython) |
  | java | ~5 s |
  | csharp | ~2 s |
  | cpp | ~1 s |

  Runners run in parallel, so the whole check takes about one minute.
- **Text:** every visible string goes through `t()` (keys in both `vi.json` and `en.json`). Long prose lives in `src/ui/content/`.
- **Tokens only:** code colors are new tokens `--code-*` in `src/ui/theme.css` (light and dark), documented in DESIGN.md.
- Conventional Commits; `npm test` and `npm run typecheck` pass before each commit.

## File Structure

```
scripts/make-fixtures.ts     30 cubes -> reference/fixtures.txt + reference/expected.txt (--check: print)
scripts/verify-ref.mjs       build + run every implementation, diff against expected.txt
scripts/snippets.mjs         extractRegions(), compactHtml(), snippetsPlugin() (virtual:algo-snippets)
scripts/snippets.d.mts       types for the above
reference/fixtures.txt, reference/expected.txt
reference/js/rubik.mjs       reference/python/rubik.py     reference/java/Rubik.java
reference/csharp/Rubik.cs + Rubik.csproj                  reference/cpp/rubik.cpp
src/algo-snippets.d.ts       types for virtual:algo-snippets
src/ui/content/algo.ts, algo.vi.ts, algo.en.ts   six sections of prose per language
src/ui/algoTab.ts            the "Thuật toán" tab
```
Modified as well: `package.json`, `.gitignore`, `vite.config.ts`, `src/main.ts`, `src/ui/app.css`, `src/ui/theme.css`, `src/ui/i18n/{vi,en}.json`, `DESIGN.md`, `CLAUDE.md`, and the spec (9.2 wording).

---

### Task 1: Fixtures, the verify harness and the JavaScript reference

**Files:**
- Create: `scripts/make-fixtures.ts`, `scripts/verify-ref.mjs`, `reference/js/rubik.mjs`
- Generate: `reference/fixtures.txt`, `reference/expected.txt`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces:
  - `npm run fixtures` (rewrites the two text files) and `npm run verify:ref` (exit 0 only if every runner matches).
  - The output line format `<kociemba moves>;<stage1>|<stage2>|…|<stage7>`, moves separated by single spaces; empty stages stay empty between pipes.
  - Every reference file marks four regions with `// #region <name>` … `// #endregion` (Python: `# region <name>` … `# endregion`): `facelets`, `invariants`, `kociemba`, `lbl`.

- [ ] **Step 1: Add the npm scripts and ignore the build folder**

In `package.json` add to `"scripts"`:
```json
    "fixtures": "node --experimental-strip-types --no-warnings scripts/make-fixtures.ts",
    "verify:ref": "node scripts/verify-ref.mjs"
```
Append to `.gitignore`:
```
.ref-build/
```

- [ ] **Step 2: Create scripts/make-fixtures.ts**

```ts
// Writes reference/fixtures.txt (one cube per line: 54 digits, colors U R F D L B = 0..5)
// and reference/expected.txt (one line per cube: "<kociemba moves>;<lbl stage 1>|...|<lbl stage 7>").
// The TypeScript solvers are the source of truth; every reference implementation must reproduce this file.
// With --check, prints the expected lines to stdout instead of writing files (used by verify-ref).
import { writeFileSync } from 'node:fs';
import { applyMoves, isSolved, solved, type State } from '../src/core/cube.ts';
import { mulberry32 } from '../src/core/prng.ts';
import { solveFacelets } from '../src/solver/kociemba.ts';
import { solveLbl } from '../src/solver/lbl.ts';
import { buildTables } from '../src/solver/tables.ts';

const rnd = mulberry32(20261002);
const walk = (n: number) => Array.from({ length: n }, () => 'URFDLB'[Math.floor(rnd() * 6)] + ['', "'", '2'][Math.floor(rnd() * 3)]);

const cubes: State[] = [
  solved(),
  applyMoves(solved(), 'R'),
  applyMoves(solved(), "R U R' U'"),
  applyMoves(solved(), "x y R U F'"), // held with other centers
  applyMoves(solved(), "U R2 F B R B2 R U2 L B2"),
  ...Array.from({ length: 25 }, () => applyMoves(solved(), walk(30))),
];

const tables = buildTables();
const lines = cubes.map((s) => {
  const k = solveFacelets(tables, s);
  const l = solveLbl(s).map((st) => st.moves);
  if (!isSolved(applyMoves(s, k)) || !isSolved(applyMoves(s, l.flat()))) throw new Error('a solution does not solve its cube');
  return `${k.join(' ')};${l.map((st) => st.join(' ')).join('|')}`;
});

if (process.argv.includes('--check')) {
  process.stdout.write(`${lines.join('\n')}\n`);
} else {
  writeFileSync('reference/fixtures.txt', `${cubes.map((s) => s.join('')).join('\n')}\n`);
  writeFileSync('reference/expected.txt', `${lines.join('\n')}\n`);
  console.log(`wrote ${cubes.length} fixtures`);
}
```

Run: `npm run fixtures`
Expected: `wrote 30 fixtures`. The first two lines of `reference/expected.txt` are `;z2||||||` and `R';z2 L'||||||`.

- [ ] **Step 3: Create scripts/verify-ref.mjs (TypeScript + JavaScript runners for now)**

```js
// npm run verify:ref
// Runs the TypeScript solvers and the 5 reference implementations on reference/fixtures.txt and checks that
// every one prints exactly reference/expected.txt (same moves, same order, every stage).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const exe = process.platform === 'win32' ? '.exe' : '';
const fixtures = readFileSync('reference/fixtures.txt', 'utf8');
const expected = readFileSync('reference/expected.txt', 'utf8').replace(/\r/g, '').trim().split('\n');
mkdirSync('.ref-build', { recursive: true });

const works = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const python = ['python3', 'python'].find((p) => works(p, ['--version'])) ?? 'python3';

const RUNNERS = [
  { name: 'typescript', run: ['node', ['--experimental-strip-types', '--no-warnings', 'scripts/make-fixtures.ts', '--check']] },
  { name: 'javascript', run: ['node', ['reference/js/rubik.mjs']] },
];

function run([cmd, args], input) {
  return new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => done({ code: -1, out, err: String(e), ms: Date.now() - t0 }));
    child.on('close', (code) => done({ code, out, err, ms: Date.now() - t0 }));
    child.stdin.end(input ?? '');
  });
}

function compare(out) {
  const got = out.replace(/\r/g, '').trim().split('\n');
  for (let i = 0; i < expected.length; i++) {
    if (got[i] !== expected[i]) return `cube ${i + 1} differs\n    expected: ${expected[i]}\n    got:      ${got[i] ?? '(nothing)'}`;
  }
  return got.length === expected.length ? null : `printed ${got.length} lines, expected ${expected.length}`;
}

async function check(r) {
  if (r.build) {
    const b = await run(r.build);
    if (b.code !== 0) return `build failed: ${(b.err || b.out).trim().split('\n').slice(-5).join('\n    ')}`;
  }
  const res = await run(r.run, fixtures);
  if (res.code !== 0) return `exited with ${res.code}: ${res.err.trim().split('\n').slice(-5).join('\n    ')}`;
  const diff = compare(res.out);
  return diff ?? `ok (${(res.ms / 1000).toFixed(1)} s)`;
}

console.log(`verifying ${expected.length} cubes in ${RUNNERS.length} implementations...`);
const results = await Promise.all(RUNNERS.map(async (r) => [r.name, await check(r)]));
let failed = 0;
for (const [name, msg] of results) {
  const ok = msg.startsWith('ok');
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(11)} ${msg}`);
}
process.exit(failed ? 1 : 0);
```

Run: `npm run verify:ref`
Expected: `PASS  typescript` and `FAIL  javascript` (cannot find `reference/js/rubik.mjs`), exit code 1.

- [ ] **Step 4: Create reference/js/rubik.mjs**

```js
// Rubik's cube solvers (Kociemba two-phase + Layer-by-Layer), reference implementation in JavaScript.
// No dependencies. Usage: node rubik.mjs < fixtures.txt
// Input: one cube per line, 54 digits (facelets U R F D L B, each face row by row; colors 0..5).
// Output: one line per cube: "<kociemba moves>;<lbl stage 1>|...|<lbl stage 7>".
import { readFileSync } from 'node:fs';

// #region facelets
// Facelet i sits on face floor(i / 9) at row floor(i % 9 / 3), column i % 3.
// p = position of its cubie (x -> R, y -> U, z -> F), n = outward normal.
function faceletAt(face, r, c) {
  switch (face) {
    case 0: return { p: [c - 1, 1, r - 1], n: [0, 1, 0] };
    case 1: return { p: [1, 1 - r, 1 - c], n: [1, 0, 0] };
    case 2: return { p: [c - 1, 1 - r, 1], n: [0, 0, 1] };
    case 3: return { p: [c - 1, -1, 1 - r], n: [0, -1, 0] };
    case 4: return { p: [-1, 1 - r, c - 1], n: [-1, 0, 0] };
    default: return { p: [1 - c, 1 - r, -1], n: [0, 0, -1] };
  }
}
const FACELETS = Array.from({ length: 54 }, (_, i) => faceletAt(Math.floor(i / 9), Math.floor((i % 9) / 3), i % 3));
const key = (p, n) => `${p.join()}|${n.join()}`;
const INDEX = new Map(FACELETS.map((f, i) => [key(f.p, f.n), i]));

// Quarter turn about +axis; dir +1 = counter-clockwise seen from +axis.
function rotate([x, y, z], axis, dir) {
  if (axis === 0) return [x, -dir * z, dir * y];
  if (axis === 1) return [dir * z, y, -dir * x];
  return [-dir * y, dir * x, z];
}

// base move -> [axis, turned layers, direction of the clockwise move]
const BASE = {
  U: [1, [1], -1], D: [1, [-1], 1], R: [0, [1], -1], L: [0, [-1], 1], F: [2, [1], -1], B: [2, [-1], 1],
  x: [0, [-1, 0, 1], -1], y: [1, [-1, 0, 1], -1], z: [2, [-1, 0, 1], -1],
};

// from[k] = facelet whose sticker lands on k after one clockwise quarter turn
function quarterFrom(base) {
  const [axis, layers, dir] = BASE[base];
  const from = new Array(54);
  FACELETS.forEach((f, i) => {
    const j = layers.includes(f.p[axis]) ? INDEX.get(key(rotate(f.p, axis, dir), rotate(f.n, axis, dir))) : i;
    from[j] = i;
  });
  return from;
}
const QUARTER = Object.fromEntries(Object.keys(BASE).map((b) => [b, quarterFrom(b)]));

function applyMove(s, m) {
  const times = m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1;
  const q = QUARTER[m[0]];
  for (let t = 0; t < times; t++) s = q.map((src) => s[src]);
  return s;
}
// #endregion

const applyMoves = (s, moves) => moves.reduce(applyMove, s);
const split = (alg) => alg.split(' ').filter(Boolean);
const isSolved = (s) => s.every((c, i) => c === s[Math.floor(i / 9) * 9 + 4]);

function simplify(moves) {
  const quarters = (m) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);
  const out = [];
  for (const m of moves) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev[0] === m[0]) {
      out.pop();
      const q = (quarters(prev) + quarters(m)) % 4;
      if (q) out.push(m[0] + ['', '', '2', "'"][q]);
    } else out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------- cubies
// Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR.
const CORNER_FACELETS = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const EDGE_FACELETS = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
const CORNER_COLORS = CORNER_FACELETS.map((fs) => fs.map((f) => Math.floor(f / 9)));
const EDGE_COLORS = EDGE_FACELETS.map((fs) => fs.map((f) => Math.floor(f / 9)));

// #region invariants
// Read corner/edge permutation and orientation from the facelets (colors already relative to centers).
function toCubie(s) {
  const cube = { cp: [], co: [], ep: [], eo: [] };
  CORNER_FACELETS.forEach((fs, i) => {
    const cols = fs.map((f) => s[f]);
    const ori = cols.findIndex((c) => c === 0 || c === 3); // where the U/D color sits
    cube.cp[i] = CORNER_COLORS.findIndex((cc) =>
      cc[0] === cols[ori] && cc[1] === cols[(ori + 1) % 3] && cc[2] === cols[(ori + 2) % 3]);
    cube.co[i] = ori;
  });
  EDGE_FACELETS.forEach(([a, b], i) => {
    const j = EDGE_COLORS.findIndex((ec) => ec[0] === s[a] && ec[1] === s[b]);
    cube.ep[i] = j >= 0 ? j : EDGE_COLORS.findIndex((ec) => ec[0] === s[b] && ec[1] === s[a]);
    cube.eo[i] = j >= 0 ? 0 : 1;
  });
  return cube;
}

const parity = (p) => {
  let x = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) x ^= 1;
  return x;
};
// The three laws every reachable cube obeys.
const solvable = (c) => c.co.reduce((a, b) => a + b, 0) % 3 === 0
  && c.eo.reduce((a, b) => a + b, 0) % 2 === 0
  && parity(c.cp) === parity(c.ep);
// #endregion

// Recolor so each center's color becomes its face number (the cube may be held any way).
function normalize(s) {
  const faceOf = new Map();
  for (let f = 0; f < 6; f++) faceOf.set(s[f * 9 + 4], f);
  return s.map((c) => faceOf.get(c));
}

function multiply(a, b) {
  return {
    cp: b.cp.map((p) => a.cp[p]),
    co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
    ep: b.ep.map((p) => a.ep[p]),
    eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
  };
}
const identity = () => ({ cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0), ep: [...Array(12).keys()], eo: Array(12).fill(0) });

// ---------------------------------------------------------------- Kociemba coordinates and tables
const MOVES = [...'URFDLB'].flatMap((f) => [f, `${f}2`, `${f}'`]);
const PHASE2 = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16]; // U U2 U' D D2 D' R2 L2 F2 B2
const SOLVED = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));
const MOVE_CUBES = MOVES.map((m) => toCubie(applyMove(SOLVED, m)));

const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};
function permIndex(p) {
  let idx = 0;
  for (let i = 0; i < p.length; i++) {
    let smaller = 0;
    for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) smaller++;
    idx = idx * (p.length - i) + smaller;
  }
  return idx;
}
function permFromIndex(idx, n) {
  const digits = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { digits[i] = idx % (n - i); idx = Math.floor(idx / (n - i)); }
  const free = [...Array(n).keys()];
  return digits.map((d) => free.splice(d, 1)[0]);
}

const getTwist = (c) => c.co.slice(0, 7).reduce((t, o) => 3 * t + o, 0);
const getFlip = (c) => c.eo.slice(0, 11).reduce((t, o) => 2 * t + o, 0);
function getSlice(c) {
  let a = 0, x = 0;
  for (let j = 11; j >= 0; j--) if (c.ep[j] >= 8) { a += choose(11 - j, x + 1); x++; }
  return a;
}
const getCornerPerm = (c) => permIndex(c.cp);
const getEdgePerm = (c) => permIndex(c.ep.slice(0, 8));
const getSlicePerm = (c) => permIndex(c.ep.slice(8).map((e) => e - 8));

function setTwist(t) {
  const c = identity();
  let sum = 0;
  for (let i = 6; i >= 0; i--) { c.co[i] = t % 3; sum += c.co[i]; t = Math.floor(t / 3); }
  c.co[7] = (3 - (sum % 3)) % 3;
  return c;
}
function setFlip(f) {
  const c = identity();
  let sum = 0;
  for (let i = 10; i >= 0; i--) { c.eo[i] = f % 2; sum += c.eo[i]; f = Math.floor(f / 2); }
  c.eo[11] = sum % 2;
  return c;
}
function setSlice(idx) {
  const c = identity();
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
const setCornerPerm = (i) => ({ ...identity(), cp: permFromIndex(i, 8) });
const setEdgePerm = (i) => ({ ...identity(), ep: [...permFromIndex(i, 8), 8, 9, 10, 11] });
const setSlicePerm = (i) => ({ ...identity(), ep: [0, 1, 2, 3, 4, 5, 6, 7, ...permFromIndex(i, 4).map((e) => e + 8)] });

const ALL = [...Array(18).keys()];
function moveTable(n, set, get, moves) {
  const t = new Uint16Array(n * 18);
  for (let i = 0; i < n; i++) {
    const c = set(i);
    for (const m of moves) t[i * 18 + m] = get(multiply(c, MOVE_CUBES[m]));
  }
  return t;
}
function pruneTable(n1, n2, m1, m2, moves) {
  const dist = new Int8Array(n1 * n2).fill(-1);
  dist[0] = 0;
  for (let depth = 0, grew = true; grew; depth++) {
    grew = false;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] !== depth) continue;
      const a = Math.floor(i / n2), b = i % n2;
      for (const m of moves) {
        const j = m1[a * 18 + m] * n2 + m2[b * 18 + m];
        if (dist[j] < 0) { dist[j] = depth + 1; grew = true; }
      }
    }
  }
  return dist;
}

const T = {};
T.twist = moveTable(2187, setTwist, getTwist, ALL);
T.flip = moveTable(2048, setFlip, getFlip, ALL);
T.slice = moveTable(495, setSlice, getSlice, ALL);
T.cperm = moveTable(40320, setCornerPerm, getCornerPerm, ALL);
T.eperm = moveTable(40320, setEdgePerm, getEdgePerm, PHASE2);
T.sperm = moveTable(24, setSlicePerm, getSlicePerm, PHASE2);
T.twistSlice = pruneTable(2187, 495, T.twist, T.slice, ALL);
T.flipSlice = pruneTable(2048, 495, T.flip, T.slice, ALL);
T.cornerSlice = pruneTable(40320, 24, T.cperm, T.sperm, PHASE2);
T.edgeSlice = pruneTable(40320, 24, T.eperm, T.sperm, PHASE2);

// ---------------------------------------------------------------- Kociemba search
const MAX_LENGTH = 21, IMPROVE_NODES = 200000, NODE_LIMIT = 30000000;
const IS_PHASE2 = new Set(PHASE2);
const redundant = (face, last) => face === last || face === last - 3;

// #region kociemba
function kociemba(cube) {
  let nodes = 0, d1 = 0, best = null;
  const path1 = [], path2 = [];
  // keep improving until good enough; budgets only apply once a solution exists
  const done = () => best !== null
    && (best.length <= d1 || nodes > NODE_LIMIT || (best.length <= MAX_LENGTH && nodes >= IMPROVE_NODES));
  const h1 = (tw, fl, sl) => Math.max(T.twistSlice[tw * 495 + sl], T.flipSlice[fl * 495 + sl]);
  const h2 = (cp, ep, sp) => Math.max(T.cornerSlice[cp * 24 + sp], T.edgeSlice[ep * 24 + sp]);

  function search2(cp, ep, sp, togo, last) {
    if (togo === 0) return cp === 0 && ep === 0 && sp === 0;
    for (const m of PHASE2) {
      const face = (m / 3) | 0;
      if (redundant(face, last)) continue;
      const ncp = T.cperm[cp * 18 + m], nep = T.eperm[ep * 18 + m], nsp = T.sperm[sp * 18 + m];
      if (h2(ncp, nep, nsp) >= togo) continue;
      nodes++;
      path2.push(m);
      if (search2(ncp, nep, nsp, togo - 1, face)) return true;
      path2.pop();
      if (done()) return false;
    }
    return false;
  }

  function phase2() {
    let c = cube;
    for (const m of path1) c = multiply(c, MOVE_CUBES[m]);
    const cp = getCornerPerm(c), ep = getEdgePerm(c), sp = getSlicePerm(c);
    const limit = Math.min(18, (best ? best.length - 1 : 30) - path1.length);
    const last = path1.length ? (path1[path1.length - 1] / 3) | 0 : -9;
    for (let d2 = h2(cp, ep, sp); d2 <= limit; d2++) {
      path2.length = 0;
      if (search2(cp, ep, sp, d2, last)) { best = [...path1, ...path2]; return done(); }
      if (done()) return true;
    }
    return false;
  }

  function search1(tw, fl, sl, togo, last) {
    if (togo === 0) {
      if (tw || fl || sl) return false; // not in G1 = <U, D, R2, L2, F2, B2> yet
      if (path1.length && IS_PHASE2.has(path1[path1.length - 1])) return false;
      return phase2();
    }
    for (let m = 0; m < 18; m++) {
      const face = (m / 3) | 0;
      if (redundant(face, last)) continue;
      const ntw = T.twist[tw * 18 + m], nfl = T.flip[fl * 18 + m], nsl = T.slice[sl * 18 + m];
      if (h1(ntw, nfl, nsl) >= togo) continue; // pruning table: cannot reach G1 in time
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
  return best.map((m) => MOVES[m]);
}
// #endregion

// ---------------------------------------------------------------- Layer-by-Layer
const SIDES = ['F', 'R', 'B', 'L'];
const right = (x) => SIDES[(SIDES.indexOf(x) + 1) % 4];
const left = (x) => SIDES[(SIDES.indexOf(x) + 3) % 4];
const faceOf = (f) => Math.floor(f / 9);
const faceIndex = (x) => 'URFDLB'.indexOf(x);
const U = 0, D = 3;
const RIGHT_INSERT = "U R U' R' U' F' U F", LEFT_INSERT = "U' L' U L U F U' F'";
const SEXY = "R U R' U'", EDGE_FLIP = "F R U R' U' F'", SUNE = "R U R' U R U2 R' U";
const NIKLAS = "U R U' L' U R' U' L", TWIST = "R' D' R D";
const TO_BOTTOM = { 0: 'z2', 1: 'z', 2: "x'", 3: '', 4: "z'", 5: 'x' };
const U_TURN = ['', 'U', 'U2', "U'"];

// #region lbl
// Rewrite an algorithm written for the front face so it acts on side x.
function relabel(alg, x) {
  const shift = SIDES.indexOf(x);
  return split(alg).map((m) => {
    const k = SIDES.indexOf(m[0]);
    return k < 0 ? m : SIDES[(k + shift) % 4] + m.slice(1);
  });
}

// First-layer corners: bring each white corner above its slot, then repeat R U R' U' until it drops in.
function cornersStage(z) {
  for (const x of SIDES) {
    const cols = () => [z.center(D), z.side(x), z.side(right(x))];
    if (z.cornerSolved(cols())) continue;
    if (z.cornerAt(cols()) >= 4) {
      z.apply(z.search('URFDLB', 3, (p) => p.cornerAt([p.center(D), p.side(x), p.side(right(x))]) < 4
        && SIDES.every((y) => p.edgeSolved(p.center(D), p.side(y)))
        && SIDES.slice(0, SIDES.indexOf(x)).every((y) => p.cornerSolved([p.center(D), p.side(y), p.side(right(y))]))));
    }
    z.uTurnsUntil(() => {
      const fs = CORNER_FACELETS[z.cornerAt(cols())].map(faceOf);
      return fs.includes(faceIndex(x)) && fs.includes(faceIndex(right(x)));
    });
    for (let k = 0; k < 6 && !z.cornerSolved(cols()); k++) z.apply(relabel(SEXY, x));
  }
}
// #endregion

class Lbl {
  constructor(s) { this.s = s; this.moves = []; }
  apply(alg) {
    const seq = typeof alg === 'string' ? split(alg) : alg;
    this.s = applyMoves(this.s, seq);
    this.moves.push(...seq);
  }
  center(f) { return this.s[f * 9 + 4]; }
  side(x) { return this.center(faceIndex(x)); }
  edgeAt(a, b) {
    return EDGE_FACELETS.findIndex(([p, q]) => (this.s[p] === a && this.s[q] === b) || (this.s[p] === b && this.s[q] === a));
  }
  cornerAt(cols) { return CORNER_FACELETS.findIndex((fs) => fs.every((f) => cols.includes(this.s[f]))); }
  edgeSolved(a, b) { return EDGE_FACELETS[this.edgeAt(a, b)].every((f) => this.s[f] === this.center(faceOf(f))); }
  cornerSolved(cols) { return CORNER_FACELETS[this.cornerAt(cols)].every((f) => this.s[f] === this.center(faceOf(f))); }
  // shortest sequence over `faces` (iterative deepening) after which goal(new Lbl(state)) holds
  search(faces, maxDepth, goal) {
    const moves = [...faces].flatMap((f) => [f, `${f}2`, `${f}'`]);
    const path = [];
    const dfs = (s, depth) => {
      if (depth === 0) return goal(new Lbl(s));
      for (const m of moves) {
        if (path.length && path[path.length - 1][0] === m[0]) continue;
        path.push(m);
        if (dfs(applyMove(s, m), depth - 1)) return true;
        path.pop();
      }
      return false;
    };
    for (let d = 0; d <= maxDepth; d++) if (dfs(this.s, d)) return path;
    throw new Error('LBL search failed');
  }
  uTurnsUntil(test) {
    for (let k = 0; k < 4; k++) {
      if (test()) return;
      this.apply('U');
    }
    throw new Error('LBL alignment failed');
  }
  probe(fn) {
    const s = this.s, n = this.moves.length;
    try { return fn(); } finally { this.s = s; this.moves.length = n; }
  }
}

function lbl(start) {
  const z = new Lbl(start);
  const stages = [];
  const stage = (run) => {
    const from = z.moves.length;
    run();
    stages.push(simplify(z.moves.slice(from)));
  };

  stage(() => { // 1. white cross
    const whiteFace = [0, 1, 2, 3, 4, 5].find((f) => z.center(f) === 0);
    if (TO_BOTTOM[whiteFace]) z.apply(TO_BOTTOM[whiteFace]);
    const done = [];
    const kept = (p, extra) => [...done, ...extra].every((x) => p.edgeSolved(p.center(D), p.side(x)));
    for (const x of SIDES) {
      if (!z.edgeSolved(z.center(D), z.side(x))) {
        if (z.edgeAt(z.center(D), z.side(x)) >= 4) {
          z.apply(z.search('URFDLB', 3, (p) => p.edgeAt(p.center(D), p.side(x)) < 4 && kept(p, [])));
        }
        z.uTurnsUntil(() => EDGE_FACELETS[z.edgeAt(z.center(D), z.side(x))].some((f) => faceOf(f) === faceIndex(x)));
        z.apply(z.search(`U${x}${left(x)}${right(x)}`, 4, (p) => kept(p, [x])));
      }
      done.push(x);
    }
  });

  stage(() => cornersStage(z)); // 2. first-layer corners

  stage(() => { // 3. middle-layer edges
    for (const x of SIDES) {
      const cols = () => [z.side(x), z.side(right(x))];
      if (z.edgeSolved(...cols())) continue;
      const pos = z.edgeAt(...cols());
      if (pos >= 4) {
        const slot = EDGE_FACELETS[pos].map(faceOf);
        const y = SIDES.find((f) => slot.includes(faceIndex(f)) && slot.includes(faceIndex(right(f))));
        z.apply(relabel(RIGHT_INSERT, y));
      }
      let side;
      z.uTurnsUntil(() => {
        const [p, q] = EDGE_FACELETS[z.edgeAt(...cols())];
        side = SIDES.find((f) => faceIndex(f) === faceOf(q) && z.s[q] === z.side(f));
        return side !== undefined && faceOf(p) === U;
      });
      const top = z.s[EDGE_FACELETS[z.edgeAt(...cols())][0]];
      z.apply(relabel(top === z.side(right(side)) ? RIGHT_INSERT : LEFT_INSERT, side));
    }
  });

  const oriented = () => [0, 1, 2, 3].filter((i) => z.s[EDGE_FACELETS[i][0]] === z.center(U));
  stage(() => { // 4. yellow cross
    for (let n = 0; n < 4 && oriented().length < 4; n++) {
      const o = oriented();
      if (o.length === 2) {
        const line = (o[0] + 2) % 4 === o[1];
        z.uTurnsUntil(() => {
          const now = oriented();
          return line ? now.includes(0) && now.includes(2) : now.includes(2) && now.includes(3);
        });
      }
      z.apply(EDGE_FLIP);
    }
  });

  const matching = () => [0, 1, 2, 3].filter((i) => z.s[EDGE_FACELETS[i][1]] === z.center(faceOf(EDGE_FACELETS[i][1])));
  const bestAlignment = () => z.probe(() => {
    let best = [-1, 0];
    for (let k = 0; k < 4; k++) {
      if (matching().length > best[0]) best = [matching().length, k];
      z.apply('U');
    }
    return best;
  });
  stage(() => { // 5. yellow edges
    for (let n = 0; n < 4; n++) {
      if (bestAlignment()[0] === 4) break;
      let pick = 0, pickCount = -1;
      for (let k = 0; k < 4; k++) {
        const count = z.probe(() => { z.apply(`${U_TURN[k]} ${SUNE}`); return bestAlignment()[0]; });
        if (count > pickCount) { pickCount = count; pick = k; }
      }
      z.apply(`${U_TURN[pick]} ${SUNE}`);
    }
    z.apply(U_TURN[bestAlignment()[1]]);
  });

  const placed = (i) => {
    const fs = CORNER_FACELETS[i];
    const want = fs.map((f) => z.center(faceOf(f)));
    return fs.every((f) => want.includes(z.s[f]));
  };
  stage(() => { // 6. place yellow corners
    for (let n = 0; n < 4; n++) {
      const ok = [0, 1, 2, 3].filter(placed);
      if (ok.length === 4) return;
      z.apply(relabel(NIKLAS, ['F', 'L', 'B', 'R'][ok.length ? ok[0] : 0]));
    }
  });

  stage(() => { // 7. twist yellow corners
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 3 && z.s[8] !== z.center(U); k++) z.apply(`${TWIST} ${TWIST}`);
      z.apply('U');
    }
    z.uTurnsUntil(() => isSolved(z.s));
  });
  return stages;
}

// ---------------------------------------------------------------- main
const input = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean);
for (const line of input) {
  const s = [...line].map(Number);
  const cube = toCubie(normalize(s));
  if (!solvable(cube)) throw new Error(`unsolvable cube: ${line}`);
  const k = kociemba(cube).join(' ');
  const l = lbl(s).map((st) => st.join(' ')).join('|');
  console.log(`${k};${l}`);
}
```

- [ ] **Step 5: Verify**

Run: `npm run verify:ref`
Expected: `PASS  typescript` and `PASS  javascript`, exit code 0.

Also prove the harness catches a difference. Edit line 2 of `reference/expected.txt` from `R';…` to `R;…` and run `npm run verify:ref`: it prints `FAIL … cube 2 differs` and exits 1. Then restore the file with `git checkout reference/expected.txt` (if not yet committed, re-run `npm run fixtures`).

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore scripts/make-fixtures.ts scripts/verify-ref.mjs reference/fixtures.txt reference/expected.txt reference/js/rubik.mjs
git commit -m "feat: add solver fixtures, verify:ref harness and the JavaScript reference"
```

---

### Task 2: Python reference

**Files:**
- Create: `reference/python/rubik.py`
- Modify: `scripts/verify-ref.mjs` (add one runner)

**Interfaces:**
- Consumes: `reference/fixtures.txt` on stdin; must print exactly `reference/expected.txt`.
- Produces: a Python 3.12 program with the same 4 marked regions (`facelets`, `invariants`, `kociemba`, `lbl`) that Task 6 cuts into the Algorithms tab.
- Port rules: keep the TypeScript structure and **the same move order, node counting and stop rule**. Node counts decide where the improvement budget ends, so any difference changes the output. CPython builds the tables in about 55 s; that is expected (the runner has no timeout).

- [ ] **Step 1: Register the runner (failing check)**

In `scripts/verify-ref.mjs`, add this entry at the end of the `RUNNERS` array (just before `];`):
```js
  { name: 'python', run: [python, ['reference/python/rubik.py']] },
```

Run: `npm run verify:ref`
Expected: `FAIL  python     ` (file not found / build failed); the earlier runners still PASS. Exit code 1.

- [ ] **Step 2: Create `reference/python/rubik.py`**

```python
"""Rubik's cube solvers (Kociemba two-phase + Layer-by-Layer), reference implementation in Python 3.12.

Standard library only. Usage: python rubik.py < fixtures.txt
Input: one cube per line, 54 digits (facelets U R F D L B, each face row by row; colors 0..5).
Output: one line per cube: "<kociemba moves>;<lbl stage 1>|...|<lbl stage 7>".
"""
import sys

# region facelets
# Facelet i sits on face i // 9 at row i % 9 // 3, column i % 3.
# p = position of its cubie (x -> R, y -> U, z -> F), n = outward normal.
def facelet_at(face, r, c):
    return [
        ((c - 1, 1, r - 1), (0, 1, 0)),
        ((1, 1 - r, 1 - c), (1, 0, 0)),
        ((c - 1, 1 - r, 1), (0, 0, 1)),
        ((c - 1, -1, 1 - r), (0, -1, 0)),
        ((-1, 1 - r, c - 1), (-1, 0, 0)),
        ((1 - c, 1 - r, -1), (0, 0, -1)),
    ][face]


FACELETS = [facelet_at(i // 9, i % 9 // 3, i % 3) for i in range(54)]
INDEX = {f: i for i, f in enumerate(FACELETS)}


def rotate(v, axis, d):
    """Quarter turn about +axis; d = +1 is counter-clockwise seen from +axis."""
    x, y, z = v
    if axis == 0:
        return (x, -d * z, d * y)
    if axis == 1:
        return (d * z, y, -d * x)
    return (-d * y, d * x, z)


# base move -> (axis, turned layers, direction of the clockwise move)
BASE = {
    'U': (1, (1,), -1), 'D': (1, (-1,), 1), 'R': (0, (1,), -1), 'L': (0, (-1,), 1),
    'F': (2, (1,), -1), 'B': (2, (-1,), 1),
    'x': (0, (-1, 0, 1), -1), 'y': (1, (-1, 0, 1), -1), 'z': (2, (-1, 0, 1), -1),
}


def quarter_from(base):
    """from_[k] = facelet whose sticker lands on k after one clockwise quarter turn."""
    axis, layers, d = BASE[base]
    from_ = [0] * 54
    for i, (p, n) in enumerate(FACELETS):
        j = INDEX[(rotate(p, axis, d), rotate(n, axis, d))] if p[axis] in layers else i
        from_[j] = i
    return from_


QUARTER = {b: quarter_from(b) for b in BASE}


def apply_move(s, m):
    times = 2 if m.endswith('2') else 3 if m.endswith("'") else 1
    q = QUARTER[m[0]]
    for _ in range(times):
        s = [s[src] for src in q]
    return s
# endregion


def apply_moves(s, moves):
    for m in moves:
        s = apply_move(s, m)
    return s


def is_solved(s):
    return all(c == s[i // 9 * 9 + 4] for i, c in enumerate(s))


def simplify(moves):
    def quarters(m):
        return 2 if m.endswith('2') else 3 if m.endswith("'") else 1
    out = []
    for m in moves:
        if out and out[-1][0] == m[0]:
            prev = out.pop()
            q = (quarters(prev) + quarters(m)) % 4
            if q:
                out.append(m[0] + ['', '', '2', "'"][q])
        else:
            out.append(m)
    return out


# ---------------------------------------------------------------- cubies
# Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR.
CORNER_FACELETS = [(8, 9, 20), (6, 18, 38), (0, 36, 47), (2, 45, 11), (29, 26, 15), (27, 44, 24), (33, 53, 42), (35, 17, 51)]
EDGE_FACELETS = [(5, 10), (7, 19), (3, 37), (1, 46), (32, 16), (28, 25), (30, 43), (34, 52), (23, 12), (21, 41), (50, 39), (48, 14)]
CORNER_COLORS = [tuple(f // 9 for f in fs) for fs in CORNER_FACELETS]
EDGE_COLORS = [tuple(f // 9 for f in fs) for fs in EDGE_FACELETS]


# region invariants
def to_cubie(s):
    """Read corner/edge permutation and orientation from the facelets (colors relative to centers)."""
    cp, co, ep, eo = [], [], [], []
    for fs in CORNER_FACELETS:
        cols = [s[f] for f in fs]
        ori = next(k for k, c in enumerate(cols) if c in (0, 3))  # where the U/D color sits
        cp.append(next(j for j, cc in enumerate(CORNER_COLORS)
                       if cc == (cols[ori], cols[(ori + 1) % 3], cols[(ori + 2) % 3])))
        co.append(ori)
    for a, b in EDGE_FACELETS:
        if (s[a], s[b]) in EDGE_COLORS:
            ep.append(EDGE_COLORS.index((s[a], s[b])))
            eo.append(0)
        else:
            ep.append(EDGE_COLORS.index((s[b], s[a])))
            eo.append(1)
    return (cp, co, ep, eo)


def parity(p):
    return sum(1 for i in range(len(p)) for j in range(i + 1, len(p)) if p[i] > p[j]) % 2


def solvable(c):
    """The three laws every reachable cube obeys."""
    cp, co, ep, eo = c
    return sum(co) % 3 == 0 and sum(eo) % 2 == 0 and parity(cp) == parity(ep)
# endregion


def normalize(s):
    """Recolor so each center's color becomes its face number (the cube may be held any way)."""
    face_of = {s[f * 9 + 4]: f for f in range(6)}
    return [face_of[c] for c in s]


def multiply(a, b):
    acp, aco, aep, aeo = a
    bcp, bco, bep, beo = b
    return ([acp[p] for p in bcp], [(aco[p] + bco[i]) % 3 for i, p in enumerate(bcp)],
            [aep[p] for p in bep], [(aeo[p] + beo[i]) % 2 for i, p in enumerate(bep)])


def identity():
    return (list(range(8)), [0] * 8, list(range(12)), [0] * 12)


# ---------------------------------------------------------------- Kociemba coordinates and tables
MOVES = [f + p for f in 'URFDLB' for p in ('', '2', "'")]
PHASE2 = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16]  # U U2 U' D D2 D' R2 L2 F2 B2
SOLVED = [i // 9 for i in range(54)]
MOVE_CUBES = [to_cubie(apply_move(SOLVED, m)) for m in MOVES]


def choose(n, k):
    if k < 0 or k > n:
        return 0
    r = 1
    for i in range(k):
        r = r * (n - i) // (i + 1)
    return r


def perm_index(p):
    idx = 0
    for i in range(len(p)):
        smaller = sum(1 for j in range(i + 1, len(p)) if p[j] < p[i])
        idx = idx * (len(p) - i) + smaller
    return idx


def perm_from_index(idx, n):
    digits = [0] * n
    for i in range(n - 1, -1, -1):
        digits[i] = idx % (n - i)
        idx //= n - i
    free = list(range(n))
    return [free.pop(d) for d in digits]


def get_twist(c):
    t = 0
    for o in c[1][:7]:
        t = 3 * t + o
    return t


def get_flip(c):
    f = 0
    for o in c[3][:11]:
        f = 2 * f + o
    return f


def get_slice(c):
    a = x = 0
    for j in range(11, -1, -1):
        if c[2][j] >= 8:
            a += choose(11 - j, x + 1)
            x += 1
    return a


def get_corner_perm(c):
    return perm_index(c[0])


def get_edge_perm(c):
    return perm_index(c[2][:8])


def get_slice_perm(c):
    return perm_index([e - 8 for e in c[2][8:]])


def set_twist(t):
    cp, co, ep, eo = identity()
    total = 0
    for i in range(6, -1, -1):
        co[i] = t % 3
        total += co[i]
        t //= 3
    co[7] = (3 - total % 3) % 3
    return (cp, co, ep, eo)


def set_flip(f):
    cp, co, ep, eo = identity()
    total = 0
    for i in range(10, -1, -1):
        eo[i] = f % 2
        total += eo[i]
        f //= 2
    eo[11] = total % 2
    return (cp, co, ep, eo)


def set_slice(idx):
    cp, co, _, eo = identity()
    ep = [-1] * 12
    x = 4
    for j in range(12):
        if idx - choose(11 - j, x) >= 0:
            ep[j] = 12 - x
            idx -= choose(11 - j, x)
            x -= 1
    other = 0
    for j in range(12):
        if ep[j] < 0:
            ep[j] = other
            other += 1
    return (cp, co, ep, eo)


def set_corner_perm(i):
    _, co, ep, eo = identity()
    return (perm_from_index(i, 8), co, ep, eo)


def set_edge_perm(i):
    cp, co, _, eo = identity()
    return (cp, co, perm_from_index(i, 8) + [8, 9, 10, 11], eo)


def set_slice_perm(i):
    cp, co, _, eo = identity()
    return (cp, co, list(range(8)) + [e + 8 for e in perm_from_index(i, 4)], eo)


ALL = list(range(18))


def move_table(n, setter, getter, moves):
    t = [0] * (n * 18)
    for i in range(n):
        c = setter(i)
        for m in moves:
            t[i * 18 + m] = getter(multiply(c, MOVE_CUBES[m]))
    return t


def prune_table(n1, n2, m1, m2, moves):
    dist = bytearray(b'\xff') * (n1 * n2)  # 255 = not reached yet
    dist[0] = 0
    depth = 0
    frontier = [0]
    while frontier:  # breadth-first, one depth at a time
        nxt = []
        for i in frontier:
            a, b = divmod(i, n2)
            for m in moves:
                j = m1[a * 18 + m] * n2 + m2[b * 18 + m]
                if dist[j] == 255:
                    dist[j] = depth + 1
                    nxt.append(j)
        frontier = nxt
        depth += 1
    return dist


print('building tables (about a minute in CPython)...', file=sys.stderr)
TWIST = move_table(2187, set_twist, get_twist, ALL)
FLIP = move_table(2048, set_flip, get_flip, ALL)
SLICE = move_table(495, set_slice, get_slice, ALL)
CPERM = move_table(40320, set_corner_perm, get_corner_perm, ALL)
EPERM = move_table(40320, set_edge_perm, get_edge_perm, PHASE2)
SPERM = move_table(24, set_slice_perm, get_slice_perm, PHASE2)
TWIST_SLICE = prune_table(2187, 495, TWIST, SLICE, ALL)
FLIP_SLICE = prune_table(2048, 495, FLIP, SLICE, ALL)
CORNER_SLICE = prune_table(40320, 24, CPERM, SPERM, PHASE2)
EDGE_SLICE = prune_table(40320, 24, EPERM, SPERM, PHASE2)

# ---------------------------------------------------------------- Kociemba search
MAX_LENGTH, IMPROVE_NODES, NODE_LIMIT = 21, 200000, 30000000
IS_PHASE2 = set(PHASE2)


def redundant(face, last):
    return face == last or face == last - 3


# region kociemba
def kociemba(cube):
    st = {'nodes': 0, 'd1': 0, 'best': None}
    path1, path2 = [], []

    def done():  # keep improving until good enough; budgets only apply once a solution exists
        best = st['best']
        return best is not None and (len(best) <= st['d1'] or st['nodes'] > NODE_LIMIT
                                     or (len(best) <= MAX_LENGTH and st['nodes'] >= IMPROVE_NODES))

    def h1(tw, fl, sl):
        return max(TWIST_SLICE[tw * 495 + sl], FLIP_SLICE[fl * 495 + sl])

    def h2(cp, ep, sp):
        return max(CORNER_SLICE[cp * 24 + sp], EDGE_SLICE[ep * 24 + sp])

    def search2(cp, ep, sp, togo, last):
        if togo == 0:
            return cp == 0 and ep == 0 and sp == 0
        for m in PHASE2:
            face = m // 3
            if redundant(face, last):
                continue
            ncp, nep, nsp = CPERM[cp * 18 + m], EPERM[ep * 18 + m], SPERM[sp * 18 + m]
            if h2(ncp, nep, nsp) >= togo:
                continue
            st['nodes'] += 1
            path2.append(m)
            if search2(ncp, nep, nsp, togo - 1, face):
                return True
            path2.pop()
            if done():
                return False
        return False

    def phase2():
        c = cube
        for m in path1:
            c = multiply(c, MOVE_CUBES[m])
        cp, ep, sp = get_corner_perm(c), get_edge_perm(c), get_slice_perm(c)
        limit = min(18, (len(st['best']) - 1 if st['best'] else 30) - len(path1))
        last = path1[-1] // 3 if path1 else -9
        d2 = h2(cp, ep, sp)
        while d2 <= limit:
            path2.clear()
            if search2(cp, ep, sp, d2, last):
                st['best'] = path1 + path2
                return done()
            if done():
                return True
            d2 += 1
        return False

    def search1(tw, fl, sl, togo, last):
        if togo == 0:
            if tw or fl or sl:  # not in G1 = <U, D, R2, L2, F2, B2> yet
                return False
            if path1 and path1[-1] in IS_PHASE2:
                return False
            return phase2()
        for m in range(18):
            face = m // 3
            if redundant(face, last):
                continue
            ntw, nfl, nsl = TWIST[tw * 18 + m], FLIP[fl * 18 + m], SLICE[sl * 18 + m]
            if h1(ntw, nfl, nsl) >= togo:  # pruning table: cannot reach G1 in time
                continue
            st['nodes'] += 1
            path1.append(m)
            if search1(ntw, nfl, nsl, togo - 1, face):
                return True
            path1.pop()
            if done():
                return True
        return False

    tw, fl, sl = get_twist(cube), get_flip(cube), get_slice(cube)
    st['d1'] = h1(tw, fl, sl)
    while st['d1'] <= 12:
        path1.clear()
        if search1(tw, fl, sl, st['d1'], -9) or done():
            break
        st['d1'] += 1
    return [MOVES[m] for m in st['best']]
# endregion


# ---------------------------------------------------------------- Layer-by-Layer
SIDES = ['F', 'R', 'B', 'L']
U, D = 0, 3
RIGHT_INSERT, LEFT_INSERT = "U R U' R' U' F' U F", "U' L' U L U F U' F'"
SEXY, EDGE_FLIP, SUNE = "R U R' U'", "F R U R' U' F'", "R U R' U R U2 R' U"
NIKLAS, TWIST_ALG = "U R U' L' U R' U' L", "R' D' R D"
TO_BOTTOM = {0: 'z2', 1: 'z', 2: "x'", 3: '', 4: "z'", 5: 'x'}
U_TURN = ['', 'U', 'U2', "U'"]


def right(x):
    return SIDES[(SIDES.index(x) + 1) % 4]


def left(x):
    return SIDES[(SIDES.index(x) + 3) % 4]


def face_of(f):
    return f // 9


def face_index(x):
    return 'URFDLB'.index(x)


# region lbl
def relabel(alg, x):
    """Rewrite an algorithm written for the front face so it acts on side x."""
    shift = SIDES.index(x)
    return [SIDES[(SIDES.index(m[0]) + shift) % 4] + m[1:] if m[0] in SIDES else m for m in alg.split()]


def corners_stage(z):
    """First-layer corners: bring each white corner above its slot, then repeat R U R' U' until it drops in."""
    for x in SIDES:
        def cols():
            return [z.center(D), z.side(x), z.side(right(x))]
        if z.corner_solved(cols()):
            continue
        if z.corner_at(cols()) >= 4:
            z.apply(z.search('URFDLB', 3, lambda p: p.corner_at([p.center(D), p.side(x), p.side(right(x))]) < 4
                             and all(p.edge_solved(p.center(D), p.side(y)) for y in SIDES)
                             and all(p.corner_solved([p.center(D), p.side(y), p.side(right(y))])
                                     for y in SIDES[:SIDES.index(x)])))

        def above():
            fs = [face_of(f) for f in CORNER_FACELETS[z.corner_at(cols())]]
            return face_index(x) in fs and face_index(right(x)) in fs
        z.u_turns_until(above)
        k = 0
        while k < 6 and not z.corner_solved(cols()):
            z.apply(relabel(SEXY, x))
            k += 1
# endregion


class Lbl:
    def __init__(self, s):
        self.s = s
        self.moves = []

    def apply(self, alg):
        seq = alg.split() if isinstance(alg, str) else alg
        self.s = apply_moves(self.s, seq)
        self.moves.extend(seq)

    def center(self, f):
        return self.s[f * 9 + 4]

    def side(self, x):
        return self.center(face_index(x))

    def edge_at(self, a, b):
        return next(i for i, (p, q) in enumerate(EDGE_FACELETS)
                    if (self.s[p], self.s[q]) in ((a, b), (b, a)))

    def corner_at(self, cols):
        return next(i for i, fs in enumerate(CORNER_FACELETS) if all(self.s[f] in cols for f in fs))

    def edge_solved(self, a, b):
        return all(self.s[f] == self.center(face_of(f)) for f in EDGE_FACELETS[self.edge_at(a, b)])

    def corner_solved(self, cols):
        return all(self.s[f] == self.center(face_of(f)) for f in CORNER_FACELETS[self.corner_at(cols)])

    def search(self, faces, max_depth, goal):
        """Shortest sequence over `faces` (iterative deepening) after which goal(Lbl(state)) holds."""
        moves = [f + p for f in faces for p in ('', '2', "'")]
        path = []

        def dfs(s, depth):
            if depth == 0:
                return goal(Lbl(s))
            for m in moves:
                if path and path[-1][0] == m[0]:
                    continue
                path.append(m)
                if dfs(apply_move(s, m), depth - 1):
                    return True
                path.pop()
            return False
        for d in range(max_depth + 1):
            if dfs(self.s, d):
                return path
        raise RuntimeError('LBL search failed')

    def u_turns_until(self, test):
        for _ in range(4):
            if test():
                return
            self.apply('U')
        raise RuntimeError('LBL alignment failed')

    def probe(self, fn):
        s, n = self.s, len(self.moves)
        try:
            return fn()
        finally:
            self.s = s
            del self.moves[n:]


def lbl(start):
    z = Lbl(start)
    stages = []

    def stage(run):
        start_n = len(z.moves)
        run()
        stages.append(simplify(z.moves[start_n:]))

    def cross():
        white_face = next(f for f in range(6) if z.center(f) == 0)
        if TO_BOTTOM[white_face]:
            z.apply(TO_BOTTOM[white_face])
        done = []

        def kept(p, extra):
            return all(p.edge_solved(p.center(D), p.side(x)) for x in done + extra)
        for x in SIDES:
            if not z.edge_solved(z.center(D), z.side(x)):
                if z.edge_at(z.center(D), z.side(x)) >= 4:
                    z.apply(z.search('URFDLB', 3, lambda p: p.edge_at(p.center(D), p.side(x)) < 4 and kept(p, [])))
                z.u_turns_until(lambda: any(face_of(f) == face_index(x)
                                            for f in EDGE_FACELETS[z.edge_at(z.center(D), z.side(x))]))
                z.apply(z.search('U' + x + left(x) + right(x), 4, lambda p: kept(p, [x])))
            done.append(x)

    def middle():
        for x in SIDES:
            def cols():
                return (z.side(x), z.side(right(x)))
            if z.edge_solved(*cols()):
                continue
            pos = z.edge_at(*cols())
            if pos >= 4:
                slot = [face_of(f) for f in EDGE_FACELETS[pos]]
                y = next(f for f in SIDES if face_index(f) in slot and face_index(right(f)) in slot)
                z.apply(relabel(RIGHT_INSERT, y))
            found = {}

            def matched():
                p, q = EDGE_FACELETS[z.edge_at(*cols())]
                found['side'] = next((f for f in SIDES if face_index(f) == face_of(q) and z.s[q] == z.side(f)), None)
                return found['side'] is not None and face_of(p) == U
            z.u_turns_until(matched)
            side = found['side']
            top = z.s[EDGE_FACELETS[z.edge_at(*cols())][0]]
            z.apply(relabel(RIGHT_INSERT if top == z.side(right(side)) else LEFT_INSERT, side))

    def oriented():
        return [i for i in range(4) if z.s[EDGE_FACELETS[i][0]] == z.center(U)]

    def top_cross():
        n = 0
        while n < 4 and len(oriented()) < 4:
            o = oriented()
            if len(o) == 2:
                line = (o[0] + 2) % 4 == o[1]
                z.u_turns_until(lambda: (0 in oriented() and 2 in oriented()) if line
                                else (2 in oriented() and 3 in oriented()))
            z.apply(EDGE_FLIP)
            n += 1

    def matching():
        return [i for i in range(4) if z.s[EDGE_FACELETS[i][1]] == z.center(face_of(EDGE_FACELETS[i][1]))]

    def best_alignment():
        def run():
            best = (-1, 0)
            for k in range(4):
                if len(matching()) > best[0]:
                    best = (len(matching()), k)
                z.apply('U')
            return best
        return z.probe(run)

    def top_edges():
        for _ in range(4):
            if best_alignment()[0] == 4:
                break
            pick, pick_count = 0, -1
            for k in range(4):
                def trial(k=k):
                    z.apply(U_TURN[k] + ' ' + SUNE)
                    return best_alignment()[0]
                count = z.probe(trial)
                if count > pick_count:
                    pick, pick_count = k, count
            z.apply(U_TURN[pick] + ' ' + SUNE)
        z.apply(U_TURN[best_alignment()[1]])

    def placed(i):
        fs = CORNER_FACELETS[i]
        want = [z.center(face_of(f)) for f in fs]
        return all(z.s[f] in want for f in fs)

    def corner_place():
        for _ in range(4):
            ok = [i for i in range(4) if placed(i)]
            if len(ok) == 4:
                return
            z.apply(relabel(NIKLAS, ['F', 'L', 'B', 'R'][ok[0] if ok else 0]))

    def corner_twist():
        for _ in range(4):
            k = 0
            while k < 3 and z.s[8] != z.center(U):
                z.apply(TWIST_ALG + ' ' + TWIST_ALG)
                k += 1
            z.apply('U')
        z.u_turns_until(lambda: is_solved(z.s))

    for run in (cross, lambda: corners_stage(z), middle, top_cross, top_edges, corner_place, corner_twist):
        stage(run)
    return stages


# ---------------------------------------------------------------- main
for line in sys.stdin.read().split():
    s = [int(ch) for ch in line]
    cube = to_cubie(normalize(s))
    if not solvable(cube):
        raise SystemExit('unsolvable cube: ' + line)
    k = ' '.join(kociemba(cube))
    l = '|'.join(' '.join(st) for st in lbl(s))
    print(k + ';' + l, flush=True)
```

- [ ] **Step 3: Verify**

Run: `npm run verify:ref`
Expected: every runner so far prints `PASS`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add reference/python/rubik.py scripts/verify-ref.mjs
git commit -m "feat: add the Python reference implementation"
```

---

### Task 3: Java reference

**Files:**
- Create: `reference/java/Rubik.java`
- Modify: `scripts/verify-ref.mjs` (add one runner)

**Interfaces:**
- Consumes: `reference/fixtures.txt` on stdin; must print exactly `reference/expected.txt`.
- Produces: a Java 11 (single-file source launch) program with the same 4 marked regions (`facelets`, `invariants`, `kociemba`, `lbl`) that Task 6 cuts into the Algorithms tab.
- Port rules: keep the TypeScript structure and **the same move order, node counting and stop rule**. Node counts decide where the improvement budget ends, so any difference changes the output. Run with `java Rubik.java` (no separate javac step). Stay within Java 11 APIs.

- [ ] **Step 1: Register the runner (failing check)**

In `scripts/verify-ref.mjs`, add this entry at the end of the `RUNNERS` array (just before `];`):
```js
  { name: 'java', run: ['java', ['reference/java/Rubik.java']] },
```

Run: `npm run verify:ref`
Expected: `FAIL  java       ` (file not found / build failed); the earlier runners still PASS. Exit code 1.

- [ ] **Step 2: Create `reference/java/Rubik.java`**

```java
// Rubik's cube solvers (Kociemba two-phase + Layer-by-Layer), reference implementation in Java 11.
// No dependencies. Usage: java Rubik.java < fixtures.txt
// Input: one cube per line, 54 digits (facelets U R F D L B, each face row by row; colors 0..5).
// Output: one line per cube: "<kociemba moves>;<lbl stage 1>|...|<lbl stage 7>".
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.IntSupplier;
import java.util.function.Predicate;

public class Rubik {
    // #region facelets
    // Facelet i sits on face i / 9 at row i % 9 / 3, column i % 3.
    // P = position of its cubie (x -> R, y -> U, z -> F), N = outward normal.
    static final int[][] P = new int[54][], N = new int[54][];
    static final Map<String, Integer> INDEX = new HashMap<>();
    static {
        for (int i = 0; i < 54; i++) {
            int face = i / 9, r = i % 9 / 3, c = i % 3;
            int[][] f = {
                {c - 1, 1, r - 1, 0, 1, 0}, {1, 1 - r, 1 - c, 1, 0, 0}, {c - 1, 1 - r, 1, 0, 0, 1},
                {c - 1, -1, 1 - r, 0, -1, 0}, {-1, 1 - r, c - 1, -1, 0, 0}, {1 - c, 1 - r, -1, 0, 0, -1},
            };
            P[i] = Arrays.copyOfRange(f[face], 0, 3);
            N[i] = Arrays.copyOfRange(f[face], 3, 6);
            INDEX.put(Arrays.toString(P[i]) + Arrays.toString(N[i]), i);
        }
    }

    // Quarter turn about +axis; d = +1 is counter-clockwise seen from +axis.
    static int[] rotate(int[] v, int axis, int d) {
        int x = v[0], y = v[1], z = v[2];
        if (axis == 0) return new int[] {x, -d * z, d * y};
        if (axis == 1) return new int[] {d * z, y, -d * x};
        return new int[] {-d * y, d * x, z};
    }

    // base move -> axis, turned layers (bit mask of -1/0/+1 as 1/2/4), direction of the clockwise move
    static final String BASES = "UDRLFBxyz";
    static final int[][] BASE = {
        {1, 4, -1}, {1, 1, 1}, {0, 4, -1}, {0, 1, 1}, {2, 4, -1}, {2, 1, 1}, {0, 7, -1}, {1, 7, -1}, {2, 7, -1},
    };
    static final int[][] QUARTER = new int[9][54]; // QUARTER[b][k] = facelet whose sticker lands on k
    static {
        for (int b = 0; b < 9; b++) {
            int axis = BASE[b][0], layers = BASE[b][1], d = BASE[b][2];
            for (int i = 0; i < 54; i++) {
                int j = (layers & (1 << (P[i][axis] + 1))) != 0
                    ? INDEX.get(Arrays.toString(rotate(P[i], axis, d)) + Arrays.toString(rotate(N[i], axis, d))) : i;
                QUARTER[b][j] = i;
            }
        }
    }

    static int[] applyMove(int[] s, String m) {
        int times = m.endsWith("2") ? 2 : m.endsWith("'") ? 3 : 1;
        int[] q = QUARTER[BASES.indexOf(m.charAt(0))];
        for (int t = 0; t < times; t++) {
            int[] n = new int[54];
            for (int k = 0; k < 54; k++) n[k] = s[q[k]];
            s = n;
        }
        return s;
    }
    // #endregion

    static int[] applyMoves(int[] s, List<String> moves) {
        for (String m : moves) s = applyMove(s, m);
        return s;
    }

    static List<String> split(String alg) {
        List<String> out = new ArrayList<>();
        for (String m : alg.trim().split("\\s+")) if (!m.isEmpty()) out.add(m);
        return out;
    }

    static boolean isSolved(int[] s) {
        for (int i = 0; i < 54; i++) if (s[i] != s[i / 9 * 9 + 4]) return false;
        return true;
    }

    static int quarters(String m) { return m.endsWith("2") ? 2 : m.endsWith("'") ? 3 : 1; }

    static List<String> simplify(List<String> moves) {
        List<String> out = new ArrayList<>();
        String[] suffix = {"", "", "2", "'"};
        for (String m : moves) {
            if (!out.isEmpty() && out.get(out.size() - 1).charAt(0) == m.charAt(0)) {
                String prev = out.remove(out.size() - 1);
                int q = (quarters(prev) + quarters(m)) % 4;
                if (q != 0) out.add(m.charAt(0) + suffix[q]);
            } else {
                out.add(m);
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- cubies
    // Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR.
    static final int[][] CORNER_FACELETS = {
        {8, 9, 20}, {6, 18, 38}, {0, 36, 47}, {2, 45, 11}, {29, 26, 15}, {27, 44, 24}, {33, 53, 42}, {35, 17, 51},
    };
    static final int[][] EDGE_FACELETS = {
        {5, 10}, {7, 19}, {3, 37}, {1, 46}, {32, 16}, {28, 25}, {30, 43}, {34, 52}, {23, 12}, {21, 41}, {50, 39}, {48, 14},
    };

    static final class Cubie {
        int[] cp = {0, 1, 2, 3, 4, 5, 6, 7}, co = new int[8];
        int[] ep = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}, eo = new int[12];
    }

    // #region invariants
    // Read corner/edge permutation and orientation from the facelets (colors relative to centers).
    static Cubie toCubie(int[] s) {
        Cubie c = new Cubie();
        for (int i = 0; i < 8; i++) {
            int[] fs = CORNER_FACELETS[i];
            int ori = 0;
            while (s[fs[ori]] != 0 && s[fs[ori]] != 3) ori++; // where the U/D color sits
            for (int j = 0; j < 8; j++) {
                int[] cc = CORNER_FACELETS[j];
                if (cc[0] / 9 == s[fs[ori]] && cc[1] / 9 == s[fs[(ori + 1) % 3]] && cc[2] / 9 == s[fs[(ori + 2) % 3]]) c.cp[i] = j;
            }
            c.co[i] = ori;
        }
        for (int i = 0; i < 12; i++) {
            int a = s[EDGE_FACELETS[i][0]], b = s[EDGE_FACELETS[i][1]];
            for (int j = 0; j < 12; j++) {
                int x = EDGE_FACELETS[j][0] / 9, y = EDGE_FACELETS[j][1] / 9;
                if (x == a && y == b) { c.ep[i] = j; c.eo[i] = 0; }
                if (x == b && y == a) { c.ep[i] = j; c.eo[i] = 1; }
            }
        }
        return c;
    }

    static int parity(int[] p) {
        int x = 0;
        for (int i = 0; i < p.length; i++) for (int j = i + 1; j < p.length; j++) if (p[i] > p[j]) x ^= 1;
        return x;
    }

    // The three laws every reachable cube obeys.
    static boolean solvable(Cubie c) {
        return Arrays.stream(c.co).sum() % 3 == 0 && Arrays.stream(c.eo).sum() % 2 == 0 && parity(c.cp) == parity(c.ep);
    }
    // #endregion

    // Recolor so each center's color becomes its face number (the cube may be held any way).
    static int[] normalize(int[] s) {
        int[] faceOf = new int[6];
        for (int f = 0; f < 6; f++) faceOf[s[f * 9 + 4]] = f;
        int[] n = new int[54];
        for (int i = 0; i < 54; i++) n[i] = faceOf[s[i]];
        return n;
    }

    static Cubie multiply(Cubie a, Cubie b) {
        Cubie c = new Cubie();
        for (int i = 0; i < 8; i++) { c.cp[i] = a.cp[b.cp[i]]; c.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3; }
        for (int i = 0; i < 12; i++) { c.ep[i] = a.ep[b.ep[i]]; c.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2; }
        return c;
    }

    // ---------------------------------------------------------------- Kociemba coordinates and tables
    static final String[] MOVES = new String[18];
    static final int[] PHASE2 = {0, 1, 2, 9, 10, 11, 4, 13, 7, 16}; // U U2 U' D D2 D' R2 L2 F2 B2
    static final boolean[] IS_PHASE2 = new boolean[18];
    static final Cubie[] MOVE_CUBES = new Cubie[18];
    static {
        int[] solved = new int[54];
        for (int i = 0; i < 54; i++) solved[i] = i / 9;
        String[] pw = {"", "2", "'"};
        for (int m = 0; m < 18; m++) {
            MOVES[m] = "URFDLB".charAt(m / 3) + pw[m % 3];
            MOVE_CUBES[m] = toCubie(applyMove(solved, MOVES[m]));
        }
        for (int m : PHASE2) IS_PHASE2[m] = true;
    }

    static int choose(int n, int k) {
        if (k < 0 || k > n) return 0;
        long r = 1;
        for (int i = 0; i < k; i++) r = r * (n - i) / (i + 1);
        return (int) r;
    }

    static int permIndex(int[] p) {
        int idx = 0;
        for (int i = 0; i < p.length; i++) {
            int smaller = 0;
            for (int j = i + 1; j < p.length; j++) if (p[j] < p[i]) smaller++;
            idx = idx * (p.length - i) + smaller;
        }
        return idx;
    }

    static int[] permFromIndex(int idx, int n) {
        int[] digits = new int[n];
        for (int i = n - 1; i >= 0; i--) { digits[i] = idx % (n - i); idx /= n - i; }
        List<Integer> free = new ArrayList<>();
        for (int k = 0; k < n; k++) free.add(k);
        int[] p = new int[n];
        for (int i = 0; i < n; i++) p[i] = free.remove(digits[i]);
        return p;
    }

    static int getTwist(Cubie c) { int t = 0; for (int i = 0; i < 7; i++) t = 3 * t + c.co[i]; return t; }
    static int getFlip(Cubie c) { int f = 0; for (int i = 0; i < 11; i++) f = 2 * f + c.eo[i]; return f; }
    static int getSlice(Cubie c) {
        int a = 0, x = 0;
        for (int j = 11; j >= 0; j--) if (c.ep[j] >= 8) { a += choose(11 - j, x + 1); x++; }
        return a;
    }
    static int getCornerPerm(Cubie c) { return permIndex(c.cp); }
    static int getEdgePerm(Cubie c) { return permIndex(Arrays.copyOfRange(c.ep, 0, 8)); }
    static int getSlicePerm(Cubie c) {
        int[] p = new int[4];
        for (int i = 0; i < 4; i++) p[i] = c.ep[8 + i] - 8;
        return permIndex(p);
    }

    static Cubie setTwist(int t) {
        Cubie c = new Cubie();
        int sum = 0;
        for (int i = 6; i >= 0; i--) { c.co[i] = t % 3; sum += c.co[i]; t /= 3; }
        c.co[7] = (3 - sum % 3) % 3;
        return c;
    }
    static Cubie setFlip(int f) {
        Cubie c = new Cubie();
        int sum = 0;
        for (int i = 10; i >= 0; i--) { c.eo[i] = f % 2; sum += c.eo[i]; f /= 2; }
        c.eo[11] = sum % 2;
        return c;
    }
    static Cubie setSlice(int idx) {
        Cubie c = new Cubie();
        Arrays.fill(c.ep, -1);
        int x = 4;
        for (int j = 0; j < 12; j++) {
            if (idx - choose(11 - j, x) >= 0) { c.ep[j] = 12 - x; idx -= choose(11 - j, x); x--; }
        }
        int other = 0;
        for (int j = 0; j < 12; j++) if (c.ep[j] < 0) c.ep[j] = other++;
        return c;
    }
    static Cubie setCornerPerm(int i) { Cubie c = new Cubie(); c.cp = permFromIndex(i, 8); return c; }
    static Cubie setEdgePerm(int i) {
        Cubie c = new Cubie();
        int[] p = permFromIndex(i, 8);
        System.arraycopy(p, 0, c.ep, 0, 8);
        return c;
    }
    static Cubie setSlicePerm(int i) {
        Cubie c = new Cubie();
        int[] p = permFromIndex(i, 4);
        for (int k = 0; k < 4; k++) c.ep[8 + k] = p[k] + 8;
        return c;
    }

    interface Setter { Cubie set(int i); }
    interface Getter { int get(Cubie c); }

    static final int[] ALL = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17};

    static int[] moveTable(int n, Setter set, Getter get, int[] moves) {
        int[] t = new int[n * 18];
        for (int i = 0; i < n; i++) {
            Cubie c = set.set(i);
            for (int m : moves) t[i * 18 + m] = get.get(multiply(c, MOVE_CUBES[m]));
        }
        return t;
    }

    static byte[] pruneTable(int n1, int n2, int[] m1, int[] m2, int[] moves) {
        byte[] dist = new byte[n1 * n2];
        Arrays.fill(dist, (byte) -1);
        dist[0] = 0;
        boolean grew = true;
        for (int depth = 0; grew; depth++) {
            grew = false;
            for (int i = 0; i < dist.length; i++) {
                if (dist[i] != depth) continue;
                int a = i / n2, b = i % n2;
                for (int m : moves) {
                    int j = m1[a * 18 + m] * n2 + m2[b * 18 + m];
                    if (dist[j] < 0) { dist[j] = (byte) (depth + 1); grew = true; }
                }
            }
        }
        return dist;
    }

    static final int[] TWIST = moveTable(2187, Rubik::setTwist, Rubik::getTwist, ALL);
    static final int[] FLIP = moveTable(2048, Rubik::setFlip, Rubik::getFlip, ALL);
    static final int[] SLICE = moveTable(495, Rubik::setSlice, Rubik::getSlice, ALL);
    static final int[] CPERM = moveTable(40320, Rubik::setCornerPerm, Rubik::getCornerPerm, ALL);
    static final int[] EPERM = moveTable(40320, Rubik::setEdgePerm, Rubik::getEdgePerm, PHASE2);
    static final int[] SPERM = moveTable(24, Rubik::setSlicePerm, Rubik::getSlicePerm, PHASE2);
    static final byte[] TWIST_SLICE = pruneTable(2187, 495, TWIST, SLICE, ALL);
    static final byte[] FLIP_SLICE = pruneTable(2048, 495, FLIP, SLICE, ALL);
    static final byte[] CORNER_SLICE = pruneTable(40320, 24, CPERM, SPERM, PHASE2);
    static final byte[] EDGE_SLICE = pruneTable(40320, 24, EPERM, SPERM, PHASE2);

    // ---------------------------------------------------------------- Kociemba search
    static final int MAX_LENGTH = 21, IMPROVE_NODES = 200000, NODE_LIMIT = 30000000;

    static boolean redundant(int face, int last) { return face == last || face == last - 3; }

    // #region kociemba
    static final class Kociemba {
        final Cubie cube;
        long nodes = 0;
        int d1 = 0;
        List<Integer> best = null;
        final List<Integer> path1 = new ArrayList<>(), path2 = new ArrayList<>();

        Kociemba(Cubie cube) { this.cube = cube; }

        // keep improving until good enough; budgets only apply once a solution exists
        boolean done() {
            return best != null
                && (best.size() <= d1 || nodes > NODE_LIMIT || (best.size() <= MAX_LENGTH && nodes >= IMPROVE_NODES));
        }
        int h1(int tw, int fl, int sl) { return Math.max(TWIST_SLICE[tw * 495 + sl], FLIP_SLICE[fl * 495 + sl]); }
        int h2(int cp, int ep, int sp) { return Math.max(CORNER_SLICE[cp * 24 + sp], EDGE_SLICE[ep * 24 + sp]); }

        boolean search2(int cp, int ep, int sp, int togo, int last) {
            if (togo == 0) return cp == 0 && ep == 0 && sp == 0;
            for (int m : PHASE2) {
                int face = m / 3;
                if (redundant(face, last)) continue;
                int ncp = CPERM[cp * 18 + m], nep = EPERM[ep * 18 + m], nsp = SPERM[sp * 18 + m];
                if (h2(ncp, nep, nsp) >= togo) continue;
                nodes++;
                path2.add(m);
                if (search2(ncp, nep, nsp, togo - 1, face)) return true;
                path2.remove(path2.size() - 1);
                if (done()) return false;
            }
            return false;
        }

        boolean phase2() {
            Cubie c = cube;
            for (int m : path1) c = multiply(c, MOVE_CUBES[m]);
            int cp = getCornerPerm(c), ep = getEdgePerm(c), sp = getSlicePerm(c);
            int limit = Math.min(18, (best != null ? best.size() - 1 : 30) - path1.size());
            int last = path1.isEmpty() ? -9 : path1.get(path1.size() - 1) / 3;
            for (int d2 = h2(cp, ep, sp); d2 <= limit; d2++) {
                path2.clear();
                if (search2(cp, ep, sp, d2, last)) {
                    best = new ArrayList<>(path1);
                    best.addAll(path2);
                    return done();
                }
                if (done()) return true;
            }
            return false;
        }

        boolean search1(int tw, int fl, int sl, int togo, int last) {
            if (togo == 0) {
                if (tw != 0 || fl != 0 || sl != 0) return false; // not in G1 = <U, D, R2, L2, F2, B2> yet
                if (!path1.isEmpty() && IS_PHASE2[path1.get(path1.size() - 1)]) return false;
                return phase2();
            }
            for (int m = 0; m < 18; m++) {
                int face = m / 3;
                if (redundant(face, last)) continue;
                int ntw = TWIST[tw * 18 + m], nfl = FLIP[fl * 18 + m], nsl = SLICE[sl * 18 + m];
                if (h1(ntw, nfl, nsl) >= togo) continue; // pruning table: cannot reach G1 in time
                nodes++;
                path1.add(m);
                if (search1(ntw, nfl, nsl, togo - 1, face)) return true;
                path1.remove(path1.size() - 1);
                if (done()) return true;
            }
            return false;
        }

        List<String> solve() {
            int tw = getTwist(cube), fl = getFlip(cube), sl = getSlice(cube);
            for (d1 = h1(tw, fl, sl); d1 <= 12; d1++) {
                path1.clear();
                if (search1(tw, fl, sl, d1, -9) || done()) break;
            }
            List<String> out = new ArrayList<>();
            for (int m : best) out.add(MOVES[m]);
            return out;
        }
    }
    // #endregion

    // ---------------------------------------------------------------- Layer-by-Layer
    static final String SIDES = "FRBL";
    static final int U = 0, D = 3;
    static final String RIGHT_INSERT = "U R U' R' U' F' U F", LEFT_INSERT = "U' L' U L U F U' F'";
    static final String SEXY = "R U R' U'", EDGE_FLIP = "F R U R' U' F'", SUNE = "R U R' U R U2 R' U";
    static final String NIKLAS = "U R U' L' U R' U' L", TWIST_ALG = "R' D' R D";
    static final String[] TO_BOTTOM = {"z2", "z", "x'", "", "z'", "x"};
    static final String[] U_TURN = {"", "U", "U2", "U'"};

    static char right(char x) { return SIDES.charAt((SIDES.indexOf(x) + 1) % 4); }
    static char left(char x) { return SIDES.charAt((SIDES.indexOf(x) + 3) % 4); }
    static int faceOf(int f) { return f / 9; }
    static int faceIndex(char x) { return "URFDLB".indexOf(x); }

    // #region lbl
    // Rewrite an algorithm written for the front face so it acts on side x.
    static List<String> relabel(String alg, char x) {
        int shift = SIDES.indexOf(x);
        List<String> out = new ArrayList<>();
        for (String m : split(alg)) {
            int k = SIDES.indexOf(m.charAt(0));
            out.add(k < 0 ? m : SIDES.charAt((k + shift) % 4) + m.substring(1));
        }
        return out;
    }

    // First-layer corners: bring each white corner above its slot, then repeat R U R' U' until it drops in.
    static void cornersStage(Lbl z) {
        for (int xi = 0; xi < 4; xi++) {
            final char x = SIDES.charAt(xi);
            final int done = xi;
            if (z.cornerSolved(z.cols3(x))) continue;
            if (z.cornerAt(z.cols3(x)) >= 4) {
                z.apply(z.search("URFDLB", 3, p -> {
                    if (p.cornerAt(p.cols3(x)) >= 4) return false;
                    for (int y = 0; y < 4; y++) if (!p.edgeSolved(p.center(D), p.side(SIDES.charAt(y)))) return false;
                    for (int y = 0; y < done; y++) if (!p.cornerSolved(p.cols3(SIDES.charAt(y)))) return false;
                    return true;
                }));
            }
            z.uTurnsUntil(() -> {
                int[] fs = CORNER_FACELETS[z.cornerAt(z.cols3(x))];
                boolean hasX = false, hasR = false;
                for (int f : fs) { hasX |= faceOf(f) == faceIndex(x); hasR |= faceOf(f) == faceIndex(right(x)); }
                return hasX && hasR;
            });
            for (int k = 0; k < 6 && !z.cornerSolved(z.cols3(x)); k++) z.apply(relabel(SEXY, x));
        }
    }
    // #endregion

    static final class Lbl {
        int[] s;
        final List<String> moves = new ArrayList<>();

        Lbl(int[] s) { this.s = s; }

        void apply(List<String> seq) { s = applyMoves(s, seq); moves.addAll(seq); }
        void apply(String alg) { apply(split(alg)); }
        int center(int f) { return s[f * 9 + 4]; }
        int side(char x) { return center(faceIndex(x)); }
        int[] cols3(char x) { return new int[] {center(D), side(x), side(right(x))}; }

        int edgeAt(int a, int b) {
            for (int i = 0; i < 12; i++) {
                int p = s[EDGE_FACELETS[i][0]], q = s[EDGE_FACELETS[i][1]];
                if ((p == a && q == b) || (p == b && q == a)) return i;
            }
            return -1;
        }
        int cornerAt(int[] cols) {
            for (int i = 0; i < 8; i++) {
                boolean all = true;
                for (int f : CORNER_FACELETS[i]) {
                    boolean in = false;
                    for (int c : cols) in |= s[f] == c;
                    all &= in;
                }
                if (all) return i;
            }
            return -1;
        }
        boolean edgeSolved(int a, int b) {
            for (int f : EDGE_FACELETS[edgeAt(a, b)]) if (s[f] != center(faceOf(f))) return false;
            return true;
        }
        boolean cornerSolved(int[] cols) {
            for (int f : CORNER_FACELETS[cornerAt(cols)]) if (s[f] != center(faceOf(f))) return false;
            return true;
        }

        // shortest sequence over `faces` (iterative deepening) after which goal(new Lbl(state)) holds
        List<String> search(String faces, int maxDepth, Predicate<Lbl> goal) {
            List<String> ms = new ArrayList<>();
            for (char f : faces.toCharArray()) { ms.add("" + f); ms.add(f + "2"); ms.add(f + "'"); }
            List<String> path = new ArrayList<>();
            for (int d = 0; d <= maxDepth; d++) if (dfs(s, d, ms, path, goal)) return path;
            throw new IllegalStateException("LBL search failed");
        }
        private boolean dfs(int[] st, int depth, List<String> ms, List<String> path, Predicate<Lbl> goal) {
            if (depth == 0) return goal.test(new Lbl(st));
            for (String m : ms) {
                if (!path.isEmpty() && path.get(path.size() - 1).charAt(0) == m.charAt(0)) continue;
                path.add(m);
                if (dfs(applyMove(st, m), depth - 1, ms, path, goal)) return true;
                path.remove(path.size() - 1);
            }
            return false;
        }

        void uTurnsUntil(BooleanSupplier test) {
            for (int k = 0; k < 4; k++) {
                if (test.getAsBoolean()) return;
                apply("U");
            }
            throw new IllegalStateException("LBL alignment failed");
        }

        int probe(IntSupplier fn) {
            int[] saved = s;
            int n = moves.size();
            try { return fn.getAsInt(); } finally { s = saved; moves.subList(n, moves.size()).clear(); }
        }
    }

    static List<List<String>> lbl(int[] start) {
        Lbl z = new Lbl(start);
        List<List<String>> stages = new ArrayList<>();
        Runnable[] runs = new Runnable[7];

        runs[0] = () -> { // 1. white cross
            int whiteFace = 0;
            while (z.center(whiteFace) != 0) whiteFace++;
            if (!TO_BOTTOM[whiteFace].isEmpty()) z.apply(TO_BOTTOM[whiteFace]);
            for (int xi = 0; xi < 4; xi++) {
                final char x = SIDES.charAt(xi);
                final int done = xi;
                if (!z.edgeSolved(z.center(D), z.side(x))) {
                    if (z.edgeAt(z.center(D), z.side(x)) >= 4) {
                        z.apply(z.search("URFDLB", 3, p -> p.edgeAt(p.center(D), p.side(x)) < 4 && crossKept(p, done, false)));
                    }
                    z.uTurnsUntil(() -> {
                        for (int f : EDGE_FACELETS[z.edgeAt(z.center(D), z.side(x))]) if (faceOf(f) == faceIndex(x)) return true;
                        return false;
                    });
                    z.apply(z.search("U" + x + left(x) + right(x), 4, p -> crossKept(p, done, true)));
                }
            }
        };

        runs[1] = () -> cornersStage(z); // 2. first-layer corners

        runs[2] = () -> { // 3. middle-layer edges
            for (int xi = 0; xi < 4; xi++) {
                final char x = SIDES.charAt(xi);
                if (z.edgeSolved(z.side(x), z.side(right(x)))) continue;
                int pos = z.edgeAt(z.side(x), z.side(right(x)));
                if (pos >= 4) {
                    int a = faceOf(EDGE_FACELETS[pos][0]), b = faceOf(EDGE_FACELETS[pos][1]);
                    for (int yi = 0; yi < 4; yi++) {
                        char y = SIDES.charAt(yi);
                        int fy = faceIndex(y), fr = faceIndex(right(y));
                        if ((fy == a || fy == b) && (fr == a || fr == b)) { z.apply(relabel(RIGHT_INSERT, y)); break; }
                    }
                }
                final char[] side = {0};
                z.uTurnsUntil(() -> {
                    int[] pq = EDGE_FACELETS[z.edgeAt(z.side(x), z.side(right(x)))];
                    side[0] = 0;
                    for (int fi = 0; fi < 4; fi++) {
                        char f = SIDES.charAt(fi);
                        if (faceIndex(f) == faceOf(pq[1]) && z.s[pq[1]] == z.side(f)) { side[0] = f; break; }
                    }
                    return side[0] != 0 && faceOf(pq[0]) == U;
                });
                int top = z.s[EDGE_FACELETS[z.edgeAt(z.side(x), z.side(right(x)))][0]];
                z.apply(relabel(top == z.side(right(side[0])) ? RIGHT_INSERT : LEFT_INSERT, side[0]));
            }
        };

        runs[3] = () -> { // 4. yellow cross
            for (int n = 0; n < 4 && oriented(z).size() < 4; n++) {
                List<Integer> o = oriented(z);
                if (o.size() == 2) {
                    final boolean line = (o.get(0) + 2) % 4 == o.get(1);
                    z.uTurnsUntil(() -> {
                        List<Integer> now = oriented(z);
                        return line ? now.contains(0) && now.contains(2) : now.contains(2) && now.contains(3);
                    });
                }
                z.apply(EDGE_FLIP);
            }
        };

        runs[4] = () -> { // 5. yellow edges
            for (int n = 0; n < 4; n++) {
                if (bestAlignment(z)[0] == 4) break;
                int pick = 0, pickCount = -1;
                for (int k = 0; k < 4; k++) {
                    final int kk = k;
                    int count = z.probe(() -> { z.apply(U_TURN[kk] + " " + SUNE); return bestAlignment(z)[0]; });
                    if (count > pickCount) { pickCount = count; pick = k; }
                }
                z.apply(U_TURN[pick] + " " + SUNE);
            }
            z.apply(U_TURN[bestAlignment(z)[1]]);
        };

        runs[5] = () -> { // 6. place yellow corners
            for (int n = 0; n < 4; n++) {
                List<Integer> ok = new ArrayList<>();
                for (int i = 0; i < 4; i++) if (placed(z, i)) ok.add(i);
                if (ok.size() == 4) return;
                z.apply(relabel(NIKLAS, "FLBR".charAt(ok.isEmpty() ? 0 : ok.get(0))));
            }
        };

        runs[6] = () -> { // 7. twist yellow corners
            for (int i = 0; i < 4; i++) {
                for (int k = 0; k < 3 && z.s[8] != z.center(U); k++) z.apply(TWIST_ALG + " " + TWIST_ALG);
                z.apply("U");
            }
            z.uTurnsUntil(() -> isSolved(z.s));
        };

        for (Runnable run : runs) {
            int from = z.moves.size();
            run.run();
            stages.add(simplify(new ArrayList<>(z.moves.subList(from, z.moves.size()))));
        }
        return stages;
    }

    static boolean crossKept(Lbl p, int done, boolean includeCurrent) {
        int n = includeCurrent ? done + 1 : done;
        for (int y = 0; y < n; y++) if (!p.edgeSolved(p.center(D), p.side(SIDES.charAt(y)))) return false;
        return true;
    }

    static List<Integer> oriented(Lbl z) {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < 4; i++) if (z.s[EDGE_FACELETS[i][0]] == z.center(U)) out.add(i);
        return out;
    }

    static int matching(Lbl z) {
        int n = 0;
        for (int i = 0; i < 4; i++) if (z.s[EDGE_FACELETS[i][1]] == z.center(faceOf(EDGE_FACELETS[i][1]))) n++;
        return n;
    }

    // most top edges in place over the 4 possible U turns: {count, turns}
    static int[] bestAlignment(Lbl z) {
        int[] best = {-1, 0};
        int count = z.probe(() -> {
            for (int k = 0; k < 4; k++) {
                if (matching(z) > best[0]) { best[0] = matching(z); best[1] = k; }
                z.apply("U");
            }
            return best[0];
        });
        return new int[] {count, best[1]};
    }

    static boolean placed(Lbl z, int i) {
        for (int f : CORNER_FACELETS[i]) {
            boolean in = false;
            for (int g : CORNER_FACELETS[i]) in |= z.s[f] == z.center(faceOf(g));
            if (!in) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------- main
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        for (String line; (line = in.readLine()) != null; ) {
            line = line.trim();
            if (line.isEmpty()) continue;
            int[] s = new int[54];
            for (int i = 0; i < 54; i++) s[i] = line.charAt(i) - '0';
            Cubie cube = toCubie(normalize(s));
            if (!solvable(cube)) throw new IllegalStateException("unsolvable cube: " + line);
            String k = String.join(" ", new Kociemba(cube).solve());
            List<String> stages = new ArrayList<>();
            for (List<String> st : lbl(s)) stages.add(String.join(" ", st));
            out.append(k).append(';').append(String.join("|", stages)).append('\n');
        }
        System.out.print(out);
    }
}
```

- [ ] **Step 3: Verify**

Run: `npm run verify:ref`
Expected: every runner so far prints `PASS`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add reference/java/Rubik.java scripts/verify-ref.mjs
git commit -m "feat: add the Java reference implementation"
```

---

### Task 4: C# reference

**Files:**
- Create: `reference/csharp/Rubik.cs`
- Create: `reference/csharp/Rubik.csproj`
- Modify: `scripts/verify-ref.mjs` (add one runner)

**Interfaces:**
- Consumes: `reference/fixtures.txt` on stdin; must print exactly `reference/expected.txt`.
- Produces: a C# (.NET 9) program with the same 4 marked regions (`facelets`, `invariants`, `kociemba`, `lbl`) that Task 6 cuts into the Algorithms tab.
- Port rules: keep the TypeScript structure and **the same move order, node counting and stop rule**. Node counts decide where the improvement budget ends, so any difference changes the output. Built with `dotnet build` into `.ref-build/csharp`; `bin/` and `obj/` under reference/ are already ignored.

- [ ] **Step 1: Register the runner (failing check)**

In `scripts/verify-ref.mjs`, add this entry at the end of the `RUNNERS` array (just before `];`):
```js
  {
    name: 'csharp',
    build: ['dotnet', ['build', 'reference/csharp/Rubik.csproj', '-c', 'Release', '-o', '.ref-build/csharp', '--nologo', '-v', 'q']],
    run: ['dotnet', ['.ref-build/csharp/Rubik.dll']],
  },
```

Run: `npm run verify:ref`
Expected: `FAIL  csharp     ` (file not found / build failed); the earlier runners still PASS. Exit code 1.

- [ ] **Step 2: Create `reference/csharp/Rubik.cs`**

```csharp
// Rubik's cube solvers (Kociemba two-phase + Layer-by-Layer), reference implementation in C# (.NET 9).
// No dependencies. Usage: dotnet run -c Release < fixtures.txt
// Input: one cube per line, 54 digits (facelets U R F D L B, each face row by row; colors 0..5).
// Output: one line per cube: "<kociemba moves>;<lbl stage 1>|...|<lbl stage 7>".
using System.Text;

static class Rubik
{
    // #region facelets
    // Facelet i sits on face i / 9 at row i % 9 / 3, column i % 3.
    // P = position of its cubie (x -> R, y -> U, z -> F), N = outward normal.
    static readonly int[][] P = new int[54][], N = new int[54][];
    static readonly Dictionary<string, int> Index = new();

    static int[] Rotate(int[] v, int axis, int d) => axis switch
    {
        // quarter turn about +axis; d = +1 is counter-clockwise seen from +axis
        0 => new[] { v[0], -d * v[2], d * v[1] },
        1 => new[] { d * v[2], v[1], -d * v[0] },
        _ => new[] { -d * v[1], d * v[0], v[2] },
    };

    // base move -> axis, turned layers (bit mask of -1/0/+1 as 1/2/4), direction of the clockwise move
    const string Bases = "UDRLFBxyz";
    static readonly int[,] Base = { { 1, 4, -1 }, { 1, 1, 1 }, { 0, 4, -1 }, { 0, 1, 1 }, { 2, 4, -1 }, { 2, 1, 1 }, { 0, 7, -1 }, { 1, 7, -1 }, { 2, 7, -1 } };
    static readonly int[][] Quarter = new int[9][]; // Quarter[b][k] = facelet whose sticker lands on k

    static string Key(int[] p, int[] n) => string.Join(",", p) + "|" + string.Join(",", n);

    static void InitFacelets()
    {
        for (int i = 0; i < 54; i++)
        {
            int face = i / 9, r = i % 9 / 3, c = i % 3;
            int[][] f =
            {
                new[] { c - 1, 1, r - 1, 0, 1, 0 }, new[] { 1, 1 - r, 1 - c, 1, 0, 0 }, new[] { c - 1, 1 - r, 1, 0, 0, 1 },
                new[] { c - 1, -1, 1 - r, 0, -1, 0 }, new[] { -1, 1 - r, c - 1, -1, 0, 0 }, new[] { 1 - c, 1 - r, -1, 0, 0, -1 },
            };
            P[i] = f[face][..3];
            N[i] = f[face][3..];
            Index[Key(P[i], N[i])] = i;
        }
        for (int b = 0; b < 9; b++)
        {
            int axis = Base[b, 0], layers = Base[b, 1], d = Base[b, 2];
            Quarter[b] = new int[54];
            for (int i = 0; i < 54; i++)
            {
                int j = (layers & (1 << (P[i][axis] + 1))) != 0 ? Index[Key(Rotate(P[i], axis, d), Rotate(N[i], axis, d))] : i;
                Quarter[b][j] = i;
            }
        }
    }

    static int[] ApplyMove(int[] s, string m)
    {
        int times = m.EndsWith("2") ? 2 : m.EndsWith("'") ? 3 : 1;
        int[] q = Quarter[Bases.IndexOf(m[0])];
        for (int t = 0; t < times; t++)
        {
            var n = new int[54];
            for (int k = 0; k < 54; k++) n[k] = s[q[k]];
            s = n;
        }
        return s;
    }
    // #endregion

    static int[] ApplyMoves(int[] s, IEnumerable<string> moves)
    {
        foreach (var m in moves) s = ApplyMove(s, m);
        return s;
    }

    static List<string> Split(string alg) => alg.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();

    static bool IsSolved(int[] s)
    {
        for (int i = 0; i < 54; i++) if (s[i] != s[i / 9 * 9 + 4]) return false;
        return true;
    }

    static int Quarters(string m) => m.EndsWith("2") ? 2 : m.EndsWith("'") ? 3 : 1;

    static List<string> Simplify(List<string> moves)
    {
        var outp = new List<string>();
        string[] suffix = { "", "", "2", "'" };
        foreach (var m in moves)
        {
            if (outp.Count > 0 && outp[^1][0] == m[0])
            {
                var prev = outp[^1];
                outp.RemoveAt(outp.Count - 1);
                int q = (Quarters(prev) + Quarters(m)) % 4;
                if (q != 0) outp.Add(m[0] + suffix[q]);
            }
            else outp.Add(m);
        }
        return outp;
    }

    // ---------------------------------------------------------------- cubies
    // Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR.
    static readonly int[][] CornerFacelets =
    {
        new[] { 8, 9, 20 }, new[] { 6, 18, 38 }, new[] { 0, 36, 47 }, new[] { 2, 45, 11 },
        new[] { 29, 26, 15 }, new[] { 27, 44, 24 }, new[] { 33, 53, 42 }, new[] { 35, 17, 51 },
    };
    static readonly int[][] EdgeFacelets =
    {
        new[] { 5, 10 }, new[] { 7, 19 }, new[] { 3, 37 }, new[] { 1, 46 }, new[] { 32, 16 }, new[] { 28, 25 },
        new[] { 30, 43 }, new[] { 34, 52 }, new[] { 23, 12 }, new[] { 21, 41 }, new[] { 50, 39 }, new[] { 48, 14 },
    };

    sealed class Cubie
    {
        public int[] Cp = { 0, 1, 2, 3, 4, 5, 6, 7 }, Co = new int[8];
        public int[] Ep = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 }, Eo = new int[12];
    }

    // #region invariants
    // Read corner/edge permutation and orientation from the facelets (colors relative to centers).
    static Cubie ToCubie(int[] s)
    {
        var c = new Cubie();
        for (int i = 0; i < 8; i++)
        {
            int[] fs = CornerFacelets[i];
            int ori = 0;
            while (s[fs[ori]] != 0 && s[fs[ori]] != 3) ori++; // where the U/D color sits
            for (int j = 0; j < 8; j++)
            {
                int[] cc = CornerFacelets[j];
                if (cc[0] / 9 == s[fs[ori]] && cc[1] / 9 == s[fs[(ori + 1) % 3]] && cc[2] / 9 == s[fs[(ori + 2) % 3]]) c.Cp[i] = j;
            }
            c.Co[i] = ori;
        }
        for (int i = 0; i < 12; i++)
        {
            int a = s[EdgeFacelets[i][0]], b = s[EdgeFacelets[i][1]];
            for (int j = 0; j < 12; j++)
            {
                int x = EdgeFacelets[j][0] / 9, y = EdgeFacelets[j][1] / 9;
                if (x == a && y == b) { c.Ep[i] = j; c.Eo[i] = 0; }
                if (x == b && y == a) { c.Ep[i] = j; c.Eo[i] = 1; }
            }
        }
        return c;
    }

    static int Parity(int[] p)
    {
        int x = 0;
        for (int i = 0; i < p.Length; i++) for (int j = i + 1; j < p.Length; j++) if (p[i] > p[j]) x ^= 1;
        return x;
    }

    // The three laws every reachable cube obeys.
    static bool Solvable(Cubie c) => c.Co.Sum() % 3 == 0 && c.Eo.Sum() % 2 == 0 && Parity(c.Cp) == Parity(c.Ep);
    // #endregion

    // Recolor so each center's color becomes its face number (the cube may be held any way).
    static int[] Normalize(int[] s)
    {
        var faceOf = new int[6];
        for (int f = 0; f < 6; f++) faceOf[s[f * 9 + 4]] = f;
        return s.Select(c => faceOf[c]).ToArray();
    }

    static Cubie Multiply(Cubie a, Cubie b)
    {
        var c = new Cubie();
        for (int i = 0; i < 8; i++) { c.Cp[i] = a.Cp[b.Cp[i]]; c.Co[i] = (a.Co[b.Cp[i]] + b.Co[i]) % 3; }
        for (int i = 0; i < 12; i++) { c.Ep[i] = a.Ep[b.Ep[i]]; c.Eo[i] = (a.Eo[b.Ep[i]] + b.Eo[i]) % 2; }
        return c;
    }

    // ---------------------------------------------------------------- Kociemba coordinates and tables
    static readonly string[] Moves = new string[18];
    static readonly int[] Phase2 = { 0, 1, 2, 9, 10, 11, 4, 13, 7, 16 }; // U U2 U' D D2 D' R2 L2 F2 B2
    static readonly bool[] IsPhase2 = new bool[18];
    static readonly Cubie[] MoveCubes = new Cubie[18];
    static readonly int[] All = Enumerable.Range(0, 18).ToArray();

    static int Choose(int n, int k)
    {
        if (k < 0 || k > n) return 0;
        long r = 1;
        for (int i = 0; i < k; i++) r = r * (n - i) / (i + 1);
        return (int)r;
    }

    static int PermIndex(int[] p)
    {
        int idx = 0;
        for (int i = 0; i < p.Length; i++)
        {
            int smaller = 0;
            for (int j = i + 1; j < p.Length; j++) if (p[j] < p[i]) smaller++;
            idx = idx * (p.Length - i) + smaller;
        }
        return idx;
    }

    static int[] PermFromIndex(int idx, int n)
    {
        var digits = new int[n];
        for (int i = n - 1; i >= 0; i--) { digits[i] = idx % (n - i); idx /= n - i; }
        var free = Enumerable.Range(0, n).ToList();
        var p = new int[n];
        for (int i = 0; i < n; i++) { p[i] = free[digits[i]]; free.RemoveAt(digits[i]); }
        return p;
    }

    static int GetTwist(Cubie c) { int t = 0; for (int i = 0; i < 7; i++) t = 3 * t + c.Co[i]; return t; }
    static int GetFlip(Cubie c) { int f = 0; for (int i = 0; i < 11; i++) f = 2 * f + c.Eo[i]; return f; }
    static int GetSlice(Cubie c)
    {
        int a = 0, x = 0;
        for (int j = 11; j >= 0; j--) if (c.Ep[j] >= 8) { a += Choose(11 - j, x + 1); x++; }
        return a;
    }
    static int GetCornerPerm(Cubie c) => PermIndex(c.Cp);
    static int GetEdgePerm(Cubie c) => PermIndex(c.Ep[..8]);
    static int GetSlicePerm(Cubie c) => PermIndex(c.Ep[8..].Select(e => e - 8).ToArray());

    static Cubie SetTwist(int t)
    {
        var c = new Cubie();
        int sum = 0;
        for (int i = 6; i >= 0; i--) { c.Co[i] = t % 3; sum += c.Co[i]; t /= 3; }
        c.Co[7] = (3 - sum % 3) % 3;
        return c;
    }
    static Cubie SetFlip(int f)
    {
        var c = new Cubie();
        int sum = 0;
        for (int i = 10; i >= 0; i--) { c.Eo[i] = f % 2; sum += c.Eo[i]; f /= 2; }
        c.Eo[11] = sum % 2;
        return c;
    }
    static Cubie SetSlice(int idx)
    {
        var c = new Cubie();
        Array.Fill(c.Ep, -1);
        int x = 4;
        for (int j = 0; j < 12; j++)
            if (idx - Choose(11 - j, x) >= 0) { c.Ep[j] = 12 - x; idx -= Choose(11 - j, x); x--; }
        int other = 0;
        for (int j = 0; j < 12; j++) if (c.Ep[j] < 0) c.Ep[j] = other++;
        return c;
    }
    static Cubie SetCornerPerm(int i) => new() { Cp = PermFromIndex(i, 8) };
    static Cubie SetEdgePerm(int i)
    {
        var c = new Cubie();
        Array.Copy(PermFromIndex(i, 8), c.Ep, 8);
        return c;
    }
    static Cubie SetSlicePerm(int i)
    {
        var c = new Cubie();
        var p = PermFromIndex(i, 4);
        for (int k = 0; k < 4; k++) c.Ep[8 + k] = p[k] + 8;
        return c;
    }

    static int[] MoveTable(int n, Func<int, Cubie> set, Func<Cubie, int> get, int[] moves)
    {
        var t = new int[n * 18];
        for (int i = 0; i < n; i++)
        {
            var c = set(i);
            foreach (int m in moves) t[i * 18 + m] = get(Multiply(c, MoveCubes[m]));
        }
        return t;
    }

    static sbyte[] PruneTable(int n1, int n2, int[] m1, int[] m2, int[] moves)
    {
        var dist = new sbyte[n1 * n2];
        Array.Fill(dist, (sbyte)-1);
        dist[0] = 0;
        bool grew = true;
        for (int depth = 0; grew; depth++)
        {
            grew = false;
            for (int i = 0; i < dist.Length; i++)
            {
                if (dist[i] != depth) continue;
                int a = i / n2, b = i % n2;
                foreach (int m in moves)
                {
                    int j = m1[a * 18 + m] * n2 + m2[b * 18 + m];
                    if (dist[j] < 0) { dist[j] = (sbyte)(depth + 1); grew = true; }
                }
            }
        }
        return dist;
    }

    static int[] TwistT = null!, FlipT = null!, SliceT = null!, CpermT = null!, EpermT = null!, SpermT = null!;
    static sbyte[] TwistSlice = null!, FlipSlice = null!, CornerSlice = null!, EdgeSlice = null!;

    static void InitTables()
    {
        var solved = Enumerable.Range(0, 54).Select(i => i / 9).ToArray();
        string[] pw = { "", "2", "'" };
        for (int m = 0; m < 18; m++)
        {
            Moves[m] = "URFDLB"[m / 3] + pw[m % 3];
            MoveCubes[m] = ToCubie(ApplyMove(solved, Moves[m]));
        }
        foreach (int m in Phase2) IsPhase2[m] = true;
        TwistT = MoveTable(2187, SetTwist, GetTwist, All);
        FlipT = MoveTable(2048, SetFlip, GetFlip, All);
        SliceT = MoveTable(495, SetSlice, GetSlice, All);
        CpermT = MoveTable(40320, SetCornerPerm, GetCornerPerm, All);
        EpermT = MoveTable(40320, SetEdgePerm, GetEdgePerm, Phase2);
        SpermT = MoveTable(24, SetSlicePerm, GetSlicePerm, Phase2);
        TwistSlice = PruneTable(2187, 495, TwistT, SliceT, All);
        FlipSlice = PruneTable(2048, 495, FlipT, SliceT, All);
        CornerSlice = PruneTable(40320, 24, CpermT, SpermT, Phase2);
        EdgeSlice = PruneTable(40320, 24, EpermT, SpermT, Phase2);
    }

    // ---------------------------------------------------------------- Kociemba search
    const int MaxLength = 21, ImproveNodes = 200000, NodeLimit = 30000000;

    static bool Redundant(int face, int last) => face == last || face == last - 3;

    // #region kociemba
    sealed class Kociemba
    {
        readonly Cubie cube;
        long nodes;
        int d1;
        List<int>? best;
        readonly List<int> path1 = new(), path2 = new();

        public Kociemba(Cubie cube) => this.cube = cube;

        // keep improving until good enough; budgets only apply once a solution exists
        bool Done() => best != null
            && (best.Count <= d1 || nodes > NodeLimit || (best.Count <= MaxLength && nodes >= ImproveNodes));
        static int H1(int tw, int fl, int sl) => Math.Max(TwistSlice[tw * 495 + sl], FlipSlice[fl * 495 + sl]);
        static int H2(int cp, int ep, int sp) => Math.Max(CornerSlice[cp * 24 + sp], EdgeSlice[ep * 24 + sp]);

        bool Search2(int cp, int ep, int sp, int togo, int last)
        {
            if (togo == 0) return cp == 0 && ep == 0 && sp == 0;
            foreach (int m in Phase2)
            {
                int face = m / 3;
                if (Redundant(face, last)) continue;
                int ncp = CpermT[cp * 18 + m], nep = EpermT[ep * 18 + m], nsp = SpermT[sp * 18 + m];
                if (H2(ncp, nep, nsp) >= togo) continue;
                nodes++;
                path2.Add(m);
                if (Search2(ncp, nep, nsp, togo - 1, face)) return true;
                path2.RemoveAt(path2.Count - 1);
                if (Done()) return false;
            }
            return false;
        }

        bool Phase2Search()
        {
            var c = cube;
            foreach (int m in path1) c = Multiply(c, MoveCubes[m]);
            int cp = GetCornerPerm(c), ep = GetEdgePerm(c), sp = GetSlicePerm(c);
            int limit = Math.Min(18, (best != null ? best.Count - 1 : 30) - path1.Count);
            int last = path1.Count == 0 ? -9 : path1[^1] / 3;
            for (int d2 = H2(cp, ep, sp); d2 <= limit; d2++)
            {
                path2.Clear();
                if (Search2(cp, ep, sp, d2, last)) { best = path1.Concat(path2).ToList(); return Done(); }
                if (Done()) return true;
            }
            return false;
        }

        bool Search1(int tw, int fl, int sl, int togo, int last)
        {
            if (togo == 0)
            {
                if (tw != 0 || fl != 0 || sl != 0) return false; // not in G1 = <U, D, R2, L2, F2, B2> yet
                if (path1.Count > 0 && IsPhase2[path1[^1]]) return false;
                return Phase2Search();
            }
            for (int m = 0; m < 18; m++)
            {
                int face = m / 3;
                if (Redundant(face, last)) continue;
                int ntw = TwistT[tw * 18 + m], nfl = FlipT[fl * 18 + m], nsl = SliceT[sl * 18 + m];
                if (H1(ntw, nfl, nsl) >= togo) continue; // pruning table: cannot reach G1 in time
                nodes++;
                path1.Add(m);
                if (Search1(ntw, nfl, nsl, togo - 1, face)) return true;
                path1.RemoveAt(path1.Count - 1);
                if (Done()) return true;
            }
            return false;
        }

        public List<string> Solve()
        {
            int tw = GetTwist(cube), fl = GetFlip(cube), sl = GetSlice(cube);
            for (d1 = H1(tw, fl, sl); d1 <= 12; d1++)
            {
                path1.Clear();
                if (Search1(tw, fl, sl, d1, -9) || Done()) break;
            }
            return best!.Select(m => Moves[m]).ToList();
        }
    }
    // #endregion

    // ---------------------------------------------------------------- Layer-by-Layer
    const string Sides = "FRBL";
    const int U = 0, D = 3;
    const string RightInsert = "U R U' R' U' F' U F", LeftInsert = "U' L' U L U F U' F'";
    const string Sexy = "R U R' U'", EdgeFlip = "F R U R' U' F'", Sune = "R U R' U R U2 R' U";
    const string Niklas = "U R U' L' U R' U' L", TwistAlg = "R' D' R D";
    static readonly string[] ToBottom = { "z2", "z", "x'", "", "z'", "x" };
    static readonly string[] UTurn = { "", "U", "U2", "U'" };

    static char Right(char x) => Sides[(Sides.IndexOf(x) + 1) % 4];
    static char Left(char x) => Sides[(Sides.IndexOf(x) + 3) % 4];
    static int FaceOf(int f) => f / 9;
    static int FaceIndex(char x) => "URFDLB".IndexOf(x);

    // #region lbl
    // Rewrite an algorithm written for the front face so it acts on side x.
    static List<string> Relabel(string alg, char x)
    {
        int shift = Sides.IndexOf(x);
        return Split(alg).Select(m => Sides.IndexOf(m[0]) is var k && k >= 0 ? Sides[(k + shift) % 4] + m[1..] : m).ToList();
    }

    // First-layer corners: bring each white corner above its slot, then repeat R U R' U' until it drops in.
    static void CornersStage(Lbl z)
    {
        for (int xi = 0; xi < 4; xi++)
        {
            char x = Sides[xi];
            int done = xi;
            if (z.CornerSolved(z.Cols3(x))) continue;
            if (z.CornerAt(z.Cols3(x)) >= 4)
            {
                z.Apply(z.Search("URFDLB", 3, p => p.CornerAt(p.Cols3(x)) < 4
                    && Sides.All(y => p.EdgeSolved(p.Center(D), p.Side(y)))
                    && Sides[..done].All(y => p.CornerSolved(p.Cols3(y)))));
            }
            z.UTurnsUntil(() =>
            {
                var fs = CornerFacelets[z.CornerAt(z.Cols3(x))].Select(FaceOf).ToArray();
                return fs.Contains(FaceIndex(x)) && fs.Contains(FaceIndex(Right(x)));
            });
            for (int k = 0; k < 6 && !z.CornerSolved(z.Cols3(x)); k++) z.Apply(Relabel(Sexy, x));
        }
    }
    // #endregion

    sealed class Lbl
    {
        public int[] S;
        public readonly List<string> Moves = new();

        public Lbl(int[] s) => S = s;

        public void Apply(List<string> seq) { S = ApplyMoves(S, seq); Moves.AddRange(seq); }
        public void Apply(string alg) => Apply(Split(alg));
        public int Center(int f) => S[f * 9 + 4];
        public int Side(char x) => Center(FaceIndex(x));
        public int[] Cols3(char x) => new[] { Center(D), Side(x), Side(Right(x)) };

        public int EdgeAt(int a, int b)
        {
            for (int i = 0; i < 12; i++)
            {
                int p = S[EdgeFacelets[i][0]], q = S[EdgeFacelets[i][1]];
                if ((p == a && q == b) || (p == b && q == a)) return i;
            }
            return -1;
        }
        public int CornerAt(int[] cols)
        {
            for (int i = 0; i < 8; i++) if (CornerFacelets[i].All(f => cols.Contains(S[f]))) return i;
            return -1;
        }
        public bool EdgeSolved(int a, int b) => EdgeFacelets[EdgeAt(a, b)].All(f => S[f] == Center(FaceOf(f)));
        public bool CornerSolved(int[] cols) => CornerFacelets[CornerAt(cols)].All(f => S[f] == Center(FaceOf(f)));

        // shortest sequence over `faces` (iterative deepening) after which goal(new Lbl(state)) holds
        public List<string> Search(string faces, int maxDepth, Func<Lbl, bool> goal)
        {
            var ms = faces.SelectMany(f => new[] { f + "", f + "2", f + "'" }).ToList();
            var path = new List<string>();
            bool Dfs(int[] st, int depth)
            {
                if (depth == 0) return goal(new Lbl(st));
                foreach (var m in ms)
                {
                    if (path.Count > 0 && path[^1][0] == m[0]) continue;
                    path.Add(m);
                    if (Dfs(ApplyMove(st, m), depth - 1)) return true;
                    path.RemoveAt(path.Count - 1);
                }
                return false;
            }
            for (int d = 0; d <= maxDepth; d++) if (Dfs(S, d)) return path;
            throw new InvalidOperationException("LBL search failed");
        }

        public void UTurnsUntil(Func<bool> test)
        {
            for (int k = 0; k < 4; k++)
            {
                if (test()) return;
                Apply("U");
            }
            throw new InvalidOperationException("LBL alignment failed");
        }

        public T Probe<T>(Func<T> fn)
        {
            var saved = S;
            int n = Moves.Count;
            try { return fn(); }
            finally { S = saved; Moves.RemoveRange(n, Moves.Count - n); }
        }
    }

    static List<List<string>> LblSolve(int[] start)
    {
        var z = new Lbl(start);
        var stages = new List<List<string>>();

        List<int> Oriented() => Enumerable.Range(0, 4).Where(i => z.S[EdgeFacelets[i][0]] == z.Center(U)).ToList();
        int Matching() => Enumerable.Range(0, 4).Count(i => z.S[EdgeFacelets[i][1]] == z.Center(FaceOf(EdgeFacelets[i][1])));
        (int count, int turns) BestAlignment() => z.Probe(() =>
        {
            var best = (count: -1, turns: 0);
            for (int k = 0; k < 4; k++)
            {
                if (Matching() > best.count) best = (Matching(), k);
                z.Apply("U");
            }
            return best;
        });
        bool Placed(int i) => CornerFacelets[i].All(f => CornerFacelets[i].Any(g => z.S[f] == z.Center(FaceOf(g))));
        bool CrossKept(Lbl p, int n) => Enumerable.Range(0, n).All(y => p.EdgeSolved(p.Center(D), p.Side(Sides[y])));

        Action[] runs =
        {
            () => // 1. white cross
            {
                int whiteFace = Enumerable.Range(0, 6).First(f => z.Center(f) == 0);
                if (ToBottom[whiteFace] != "") z.Apply(ToBottom[whiteFace]);
                for (int xi = 0; xi < 4; xi++)
                {
                    char x = Sides[xi];
                    int done = xi;
                    if (z.EdgeSolved(z.Center(D), z.Side(x))) continue;
                    if (z.EdgeAt(z.Center(D), z.Side(x)) >= 4)
                        z.Apply(z.Search("URFDLB", 3, p => p.EdgeAt(p.Center(D), p.Side(x)) < 4 && CrossKept(p, done)));
                    z.UTurnsUntil(() => EdgeFacelets[z.EdgeAt(z.Center(D), z.Side(x))].Any(f => FaceOf(f) == FaceIndex(x)));
                    z.Apply(z.Search("U" + x + Left(x) + Right(x), 4, p => CrossKept(p, done + 1)));
                }
            },
            () => CornersStage(z), // 2. first-layer corners
            () => // 3. middle-layer edges
            {
                for (int xi = 0; xi < 4; xi++)
                {
                    char x = Sides[xi];
                    if (z.EdgeSolved(z.Side(x), z.Side(Right(x)))) continue;
                    int pos = z.EdgeAt(z.Side(x), z.Side(Right(x)));
                    if (pos >= 4)
                    {
                        var slot = EdgeFacelets[pos].Select(FaceOf).ToArray();
                        char y = Sides.First(f => slot.Contains(FaceIndex(f)) && slot.Contains(FaceIndex(Right(f))));
                        z.Apply(Relabel(RightInsert, y));
                    }
                    char side = '\0';
                    z.UTurnsUntil(() =>
                    {
                        var pq = EdgeFacelets[z.EdgeAt(z.Side(x), z.Side(Right(x)))];
                        side = Sides.FirstOrDefault(f => FaceIndex(f) == FaceOf(pq[1]) && z.S[pq[1]] == z.Side(f));
                        return side != '\0' && FaceOf(pq[0]) == U;
                    });
                    int top = z.S[EdgeFacelets[z.EdgeAt(z.Side(x), z.Side(Right(x)))][0]];
                    z.Apply(Relabel(top == z.Side(Right(side)) ? RightInsert : LeftInsert, side));
                }
            },
            () => // 4. yellow cross
            {
                for (int n = 0; n < 4 && Oriented().Count < 4; n++)
                {
                    var o = Oriented();
                    if (o.Count == 2)
                    {
                        bool line = (o[0] + 2) % 4 == o[1];
                        z.UTurnsUntil(() =>
                        {
                            var now = Oriented();
                            return line ? now.Contains(0) && now.Contains(2) : now.Contains(2) && now.Contains(3);
                        });
                    }
                    z.Apply(EdgeFlip);
                }
            },
            () => // 5. yellow edges
            {
                for (int n = 0; n < 4; n++)
                {
                    if (BestAlignment().count == 4) break;
                    int pick = 0, pickCount = -1;
                    for (int k = 0; k < 4; k++)
                    {
                        int kk = k;
                        int count = z.Probe(() => { z.Apply(UTurn[kk] + " " + Sune); return BestAlignment().count; });
                        if (count > pickCount) { pickCount = count; pick = k; }
                    }
                    z.Apply(UTurn[pick] + " " + Sune);
                }
                z.Apply(UTurn[BestAlignment().turns]);
            },
            () => // 6. place yellow corners
            {
                for (int n = 0; n < 4; n++)
                {
                    var ok = Enumerable.Range(0, 4).Where(Placed).ToList();
                    if (ok.Count == 4) return;
                    z.Apply(Relabel(Niklas, "FLBR"[ok.Count > 0 ? ok[0] : 0]));
                }
            },
            () => // 7. twist yellow corners
            {
                for (int i = 0; i < 4; i++)
                {
                    for (int k = 0; k < 3 && z.S[8] != z.Center(U); k++) z.Apply(TwistAlg + " " + TwistAlg);
                    z.Apply("U");
                }
                z.UTurnsUntil(() => IsSolved(z.S));
            },
        };

        foreach (var run in runs)
        {
            int from = z.Moves.Count;
            run();
            stages.Add(Simplify(z.Moves.GetRange(from, z.Moves.Count - from)));
        }
        return stages;
    }

    // ---------------------------------------------------------------- main
    static void Main()
    {
        InitFacelets();
        InitTables();
        var sb = new StringBuilder();
        string? line;
        while ((line = Console.In.ReadLine()) != null)
        {
            line = line.Trim();
            if (line.Length == 0) continue;
            int[] s = line.Select(ch => ch - '0').ToArray();
            var cube = ToCubie(Normalize(s));
            if (!Solvable(cube)) throw new InvalidOperationException("unsolvable cube: " + line);
            var k = string.Join(" ", new Kociemba(cube).Solve());
            var l = string.Join("|", LblSolve(s).Select(st => string.Join(" ", st)));
            sb.Append(k).Append(';').Append(l).Append('\n');
        }
        Console.Out.Write(sb.ToString());
    }
}
```

`reference/csharp/Rubik.csproj`:
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <InvariantGlobalization>true</InvariantGlobalization>
  </PropertyGroup>
</Project>
```

- [ ] **Step 3: Verify**

Run: `npm run verify:ref`
Expected: every runner so far prints `PASS`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add reference/csharp/Rubik.cs reference/csharp/Rubik.csproj scripts/verify-ref.mjs
git commit -m "feat: add the C# reference implementation"
```

---

### Task 5: C++ reference

**Files:**
- Create: `reference/cpp/rubik.cpp`
- Modify: `scripts/verify-ref.mjs` (add one runner)

**Interfaces:**
- Consumes: `reference/fixtures.txt` on stdin; must print exactly `reference/expected.txt`.
- Produces: a C++17 program with the same 4 marked regions (`facelets`, `invariants`, `kociemba`, `lbl`) that Task 6 cuts into the Algorithms tab.
- Port rules: keep the TypeScript structure and **the same move order, node counting and stop rule**. Node counts decide where the improvement budget ends, so any difference changes the output. Avoid identifiers that collide with C macros: the move tables are named `*_MV` because `EPERM` is an errno macro on MinGW.

- [ ] **Step 1: Register the runner (failing check)**

In `scripts/verify-ref.mjs`, add this entry at the end of the `RUNNERS` array (just before `];`):
```js
  {
    name: 'cpp',
    build: ['g++', ['-O2', '-std=c++17', 'reference/cpp/rubik.cpp', '-o', `.ref-build/rubik_cpp${exe}`]],
    run: [resolve(`.ref-build/rubik_cpp${exe}`), []],
  },
```

Run: `npm run verify:ref`
Expected: `FAIL  cpp        ` (file not found / build failed); the earlier runners still PASS. Exit code 1.

- [ ] **Step 2: Create `reference/cpp/rubik.cpp`**

```cpp
// Rubik's cube solvers (Kociemba two-phase + Layer-by-Layer), reference implementation in C++17.
// No dependencies. Build: g++ -O2 -std=c++17 rubik.cpp -o rubik    Usage: ./rubik < fixtures.txt
// Input: one cube per line, 54 digits (facelets U R F D L B, each face row by row; colors 0..5).
// Output: one line per cube: "<kociemba moves>;<lbl stage 1>|...|<lbl stage 7>".
#include <algorithm>
#include <array>
#include <cstdint>
#include <functional>
#include <iostream>
#include <map>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using namespace std;
using State = array<int, 54>;
using Moves = vector<string>;

// #region facelets
// Facelet i sits on face i / 9 at row i % 9 / 3, column i % 3.
// P = position of its cubie (x -> R, y -> U, z -> F), N = outward normal.
using V3 = array<int, 3>;
V3 P[54], N[54];
map<pair<V3, V3>, int> INDEX;

// Quarter turn about +axis; d = +1 is counter-clockwise seen from +axis.
V3 rotate(V3 v, int axis, int d) {
  if (axis == 0) return {v[0], -d * v[2], d * v[1]};
  if (axis == 1) return {d * v[2], v[1], -d * v[0]};
  return {-d * v[1], d * v[0], v[2]};
}

// base move -> axis, turned layers (bit mask of -1/0/+1 as 1/2/4), direction of the clockwise move
const string BASES = "UDRLFBxyz";
const int BASE[9][3] = {{1, 4, -1}, {1, 1, 1}, {0, 4, -1}, {0, 1, 1}, {2, 4, -1}, {2, 1, 1}, {0, 7, -1}, {1, 7, -1}, {2, 7, -1}};
int QUARTER[9][54];  // QUARTER[b][k] = facelet whose sticker lands on k

void initFacelets() {
  for (int i = 0; i < 54; i++) {
    int face = i / 9, r = i % 9 / 3, c = i % 3;
    int f[6][6] = {{c - 1, 1, r - 1, 0, 1, 0}, {1, 1 - r, 1 - c, 1, 0, 0}, {c - 1, 1 - r, 1, 0, 0, 1},
                   {c - 1, -1, 1 - r, 0, -1, 0}, {-1, 1 - r, c - 1, -1, 0, 0}, {1 - c, 1 - r, -1, 0, 0, -1}};
    P[i] = {f[face][0], f[face][1], f[face][2]};
    N[i] = {f[face][3], f[face][4], f[face][5]};
    INDEX[{P[i], N[i]}] = i;
  }
  for (int b = 0; b < 9; b++) {
    int axis = BASE[b][0], layers = BASE[b][1], d = BASE[b][2];
    for (int i = 0; i < 54; i++) {
      int j = (layers & (1 << (P[i][axis] + 1))) ? INDEX[{rotate(P[i], axis, d), rotate(N[i], axis, d)}] : i;
      QUARTER[b][j] = i;
    }
  }
}

State applyMove(State s, const string& m) {
  int times = m.size() > 1 && m[1] == '2' ? 2 : m.size() > 1 && m[1] == '\'' ? 3 : 1;
  const int* q = QUARTER[BASES.find(m[0])];
  for (int t = 0; t < times; t++) {
    State n;
    for (int k = 0; k < 54; k++) n[k] = s[q[k]];
    s = n;
  }
  return s;
}
// #endregion

State applyMoves(State s, const Moves& moves) {
  for (auto& m : moves) s = applyMove(s, m);
  return s;
}

Moves split(const string& alg) {
  Moves out;
  istringstream in(alg);
  for (string m; in >> m;) out.push_back(m);
  return out;
}

string join(const Moves& v, const string& sep) {
  string out;
  for (size_t i = 0; i < v.size(); i++) out += (i ? sep : "") + v[i];
  return out;
}

bool isSolved(const State& s) {
  for (int i = 0; i < 54; i++)
    if (s[i] != s[i / 9 * 9 + 4]) return false;
  return true;
}

int quarters(const string& m) { return m.size() > 1 && m[1] == '2' ? 2 : m.size() > 1 && m[1] == '\'' ? 3 : 1; }

Moves simplify(const Moves& moves) {
  Moves out;
  const char* suffix[] = {"", "", "2", "'"};
  for (auto& m : moves) {
    if (!out.empty() && out.back()[0] == m[0]) {
      string prev = out.back();
      out.pop_back();
      int q = (quarters(prev) + quarters(m)) % 4;
      if (q) out.push_back(string(1, m[0]) + suffix[q]);
    } else {
      out.push_back(m);
    }
  }
  return out;
}

// ---------------------------------------------------------------- cubies
// Corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR.
const int CORNER_FACELETS[8][3] = {{8, 9, 20}, {6, 18, 38}, {0, 36, 47}, {2, 45, 11}, {29, 26, 15}, {27, 44, 24}, {33, 53, 42}, {35, 17, 51}};
const int EDGE_FACELETS[12][2] = {{5, 10}, {7, 19}, {3, 37}, {1, 46}, {32, 16}, {28, 25}, {30, 43}, {34, 52}, {23, 12}, {21, 41}, {50, 39}, {48, 14}};

struct Cubie {
  array<int, 8> cp{0, 1, 2, 3, 4, 5, 6, 7}, co{};
  array<int, 12> ep{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}, eo{};
};

// #region invariants
// Read corner/edge permutation and orientation from the facelets (colors relative to centers).
Cubie toCubie(const State& s) {
  Cubie c;
  for (int i = 0; i < 8; i++) {
    const int* fs = CORNER_FACELETS[i];
    int ori = 0;
    while (s[fs[ori]] != 0 && s[fs[ori]] != 3) ori++;  // where the U/D color sits
    for (int j = 0; j < 8; j++) {
      const int* cc = CORNER_FACELETS[j];
      if (cc[0] / 9 == s[fs[ori]] && cc[1] / 9 == s[fs[(ori + 1) % 3]] && cc[2] / 9 == s[fs[(ori + 2) % 3]]) c.cp[i] = j;
    }
    c.co[i] = ori;
  }
  for (int i = 0; i < 12; i++) {
    int a = s[EDGE_FACELETS[i][0]], b = s[EDGE_FACELETS[i][1]];
    for (int j = 0; j < 12; j++) {
      int x = EDGE_FACELETS[j][0] / 9, y = EDGE_FACELETS[j][1] / 9;
      if (x == a && y == b) c.ep[i] = j, c.eo[i] = 0;
      if (x == b && y == a) c.ep[i] = j, c.eo[i] = 1;
    }
  }
  return c;
}

template <size_t K>
int parity(const array<int, K>& p) {
  int x = 0;
  for (size_t i = 0; i < K; i++)
    for (size_t j = i + 1; j < K; j++)
      if (p[i] > p[j]) x ^= 1;
  return x;
}

// The three laws every reachable cube obeys.
bool solvable(const Cubie& c) {
  return accumulate(c.co.begin(), c.co.end(), 0) % 3 == 0 && accumulate(c.eo.begin(), c.eo.end(), 0) % 2 == 0 &&
         parity(c.cp) == parity(c.ep);
}
// #endregion

// Recolor so each center's color becomes its face number (the cube may be held any way).
State normalize(const State& s) {
  int faceOf[6];
  for (int f = 0; f < 6; f++) faceOf[s[f * 9 + 4]] = f;
  State n;
  for (int i = 0; i < 54; i++) n[i] = faceOf[s[i]];
  return n;
}

Cubie multiply(const Cubie& a, const Cubie& b) {
  Cubie c;
  for (int i = 0; i < 8; i++) c.cp[i] = a.cp[b.cp[i]], c.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  for (int i = 0; i < 12; i++) c.ep[i] = a.ep[b.ep[i]], c.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  return c;
}

// ---------------------------------------------------------------- Kociemba coordinates and tables
string MOVES[18];
const vector<int> PHASE2 = {0, 1, 2, 9, 10, 11, 4, 13, 7, 16};  // U U2 U' D D2 D' R2 L2 F2 B2
bool IS_PHASE2[18];
Cubie MOVE_CUBES[18];
vector<int> ALL;

int choose(int n, int k) {
  if (k < 0 || k > n) return 0;
  long long r = 1;
  for (int i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return (int)r;
}

int permIndex(const int* p, int n) {
  int idx = 0;
  for (int i = 0; i < n; i++) {
    int smaller = 0;
    for (int j = i + 1; j < n; j++)
      if (p[j] < p[i]) smaller++;
    idx = idx * (n - i) + smaller;
  }
  return idx;
}

vector<int> permFromIndex(int idx, int n) {
  vector<int> digits(n), freeList(n), p(n);
  for (int i = n - 1; i >= 0; i--) digits[i] = idx % (n - i), idx /= n - i;
  iota(freeList.begin(), freeList.end(), 0);
  for (int i = 0; i < n; i++) p[i] = freeList[digits[i]], freeList.erase(freeList.begin() + digits[i]);
  return p;
}

int getTwist(const Cubie& c) { int t = 0; for (int i = 0; i < 7; i++) t = 3 * t + c.co[i]; return t; }
int getFlip(const Cubie& c) { int f = 0; for (int i = 0; i < 11; i++) f = 2 * f + c.eo[i]; return f; }
int getSlice(const Cubie& c) {
  int a = 0, x = 0;
  for (int j = 11; j >= 0; j--)
    if (c.ep[j] >= 8) a += choose(11 - j, x + 1), x++;
  return a;
}
int getCornerPerm(const Cubie& c) { return permIndex(c.cp.data(), 8); }
int getEdgePerm(const Cubie& c) { return permIndex(c.ep.data(), 8); }
int getSlicePerm(const Cubie& c) {
  int p[4];
  for (int i = 0; i < 4; i++) p[i] = c.ep[8 + i] - 8;
  return permIndex(p, 4);
}

Cubie setTwist(int t) {
  Cubie c;
  int sum = 0;
  for (int i = 6; i >= 0; i--) c.co[i] = t % 3, sum += c.co[i], t /= 3;
  c.co[7] = (3 - sum % 3) % 3;
  return c;
}
Cubie setFlip(int f) {
  Cubie c;
  int sum = 0;
  for (int i = 10; i >= 0; i--) c.eo[i] = f % 2, sum += c.eo[i], f /= 2;
  c.eo[11] = sum % 2;
  return c;
}
Cubie setSlice(int idx) {
  Cubie c;
  c.ep.fill(-1);
  int x = 4;
  for (int j = 0; j < 12; j++)
    if (idx - choose(11 - j, x) >= 0) c.ep[j] = 12 - x, idx -= choose(11 - j, x), x--;
  int other = 0;
  for (int j = 0; j < 12; j++)
    if (c.ep[j] < 0) c.ep[j] = other++;
  return c;
}
Cubie setCornerPerm(int i) { Cubie c; auto p = permFromIndex(i, 8); copy(p.begin(), p.end(), c.cp.begin()); return c; }
Cubie setEdgePerm(int i) { Cubie c; auto p = permFromIndex(i, 8); copy(p.begin(), p.end(), c.ep.begin()); return c; }
Cubie setSlicePerm(int i) {
  Cubie c;
  auto p = permFromIndex(i, 4);
  for (int k = 0; k < 4; k++) c.ep[8 + k] = p[k] + 8;
  return c;
}

vector<int> moveTable(int n, Cubie (*set)(int), int (*get)(const Cubie&), const vector<int>& moves) {
  vector<int> t(n * 18);
  for (int i = 0; i < n; i++) {
    Cubie c = set(i);
    for (int m : moves) t[i * 18 + m] = get(multiply(c, MOVE_CUBES[m]));
  }
  return t;
}

vector<int8_t> pruneTable(int n1, int n2, const vector<int>& m1, const vector<int>& m2, const vector<int>& moves) {
  vector<int8_t> dist(n1 * n2, -1);
  dist[0] = 0;
  bool grew = true;
  for (int depth = 0; grew; depth++) {
    grew = false;
    for (int i = 0; i < (int)dist.size(); i++) {
      if (dist[i] != depth) continue;
      int a = i / n2, b = i % n2;
      for (int m : moves) {
        int j = m1[a * 18 + m] * n2 + m2[b * 18 + m];
        if (dist[j] < 0) dist[j] = (int8_t)(depth + 1), grew = true;
      }
    }
  }
  return dist;
}

vector<int> TWIST_MV, FLIP_MV, SLICE_MV, CPERM_MV, EPERM_MV, SPERM_MV;
vector<int8_t> TWIST_SLICE, FLIP_SLICE, CORNER_SLICE, EDGE_SLICE;

void initTables() {
  State solved;
  for (int i = 0; i < 54; i++) solved[i] = i / 9;
  const char* pw[] = {"", "2", "'"};
  for (int m = 0; m < 18; m++) {
    MOVES[m] = string(1, "URFDLB"[m / 3]) + pw[m % 3];
    MOVE_CUBES[m] = toCubie(applyMove(solved, MOVES[m]));
    ALL.push_back(m);
  }
  for (int m : PHASE2) IS_PHASE2[m] = true;
  TWIST_MV = moveTable(2187, setTwist, getTwist, ALL);
  FLIP_MV = moveTable(2048, setFlip, getFlip, ALL);
  SLICE_MV = moveTable(495, setSlice, getSlice, ALL);
  CPERM_MV = moveTable(40320, setCornerPerm, getCornerPerm, ALL);
  EPERM_MV = moveTable(40320, setEdgePerm, getEdgePerm, PHASE2);
  SPERM_MV = moveTable(24, setSlicePerm, getSlicePerm, PHASE2);
  TWIST_SLICE = pruneTable(2187, 495, TWIST_MV, SLICE_MV, ALL);
  FLIP_SLICE = pruneTable(2048, 495, FLIP_MV, SLICE_MV, ALL);
  CORNER_SLICE = pruneTable(40320, 24, CPERM_MV, SPERM_MV, PHASE2);
  EDGE_SLICE = pruneTable(40320, 24, EPERM_MV, SPERM_MV, PHASE2);
}

// ---------------------------------------------------------------- Kociemba search
const int MAX_LENGTH = 21, IMPROVE_NODES = 200000, NODE_LIMIT = 30000000;

bool redundant(int face, int last) { return face == last || face == last - 3; }

// #region kociemba
struct Kociemba {
  Cubie cube;
  long long nodes = 0;
  int d1 = 0;
  bool found = false;
  vector<int> best, path1, path2;

  // keep improving until good enough; budgets only apply once a solution exists
  bool done() const {
    return found && ((int)best.size() <= d1 || nodes > NODE_LIMIT || ((int)best.size() <= MAX_LENGTH && nodes >= IMPROVE_NODES));
  }
  static int h1(int tw, int fl, int sl) { return max(TWIST_SLICE[tw * 495 + sl], FLIP_SLICE[fl * 495 + sl]); }
  static int h2(int cp, int ep, int sp) { return max(CORNER_SLICE[cp * 24 + sp], EDGE_SLICE[ep * 24 + sp]); }

  bool search2(int cp, int ep, int sp, int togo, int last) {
    if (togo == 0) return cp == 0 && ep == 0 && sp == 0;
    for (int m : PHASE2) {
      int face = m / 3;
      if (redundant(face, last)) continue;
      int ncp = CPERM_MV[cp * 18 + m], nep = EPERM_MV[ep * 18 + m], nsp = SPERM_MV[sp * 18 + m];
      if (h2(ncp, nep, nsp) >= togo) continue;
      nodes++;
      path2.push_back(m);
      if (search2(ncp, nep, nsp, togo - 1, face)) return true;
      path2.pop_back();
      if (done()) return false;
    }
    return false;
  }

  bool phase2() {
    Cubie c = cube;
    for (int m : path1) c = multiply(c, MOVE_CUBES[m]);
    int cp = getCornerPerm(c), ep = getEdgePerm(c), sp = getSlicePerm(c);
    int limit = min(18, (found ? (int)best.size() - 1 : 30) - (int)path1.size());
    int last = path1.empty() ? -9 : path1.back() / 3;
    for (int d2 = h2(cp, ep, sp); d2 <= limit; d2++) {
      path2.clear();
      if (search2(cp, ep, sp, d2, last)) {
        best = path1;
        best.insert(best.end(), path2.begin(), path2.end());
        found = true;
        return done();
      }
      if (done()) return true;
    }
    return false;
  }

  bool search1(int tw, int fl, int sl, int togo, int last) {
    if (togo == 0) {
      if (tw || fl || sl) return false;  // not in G1 = <U, D, R2, L2, F2, B2> yet
      if (!path1.empty() && IS_PHASE2[path1.back()]) return false;
      return phase2();
    }
    for (int m = 0; m < 18; m++) {
      int face = m / 3;
      if (redundant(face, last)) continue;
      int ntw = TWIST_MV[tw * 18 + m], nfl = FLIP_MV[fl * 18 + m], nsl = SLICE_MV[sl * 18 + m];
      if (h1(ntw, nfl, nsl) >= togo) continue;  // pruning table: cannot reach G1 in time
      nodes++;
      path1.push_back(m);
      if (search1(ntw, nfl, nsl, togo - 1, face)) return true;
      path1.pop_back();
      if (done()) return true;
    }
    return false;
  }

  Moves solve() {
    int tw = getTwist(cube), fl = getFlip(cube), sl = getSlice(cube);
    for (d1 = h1(tw, fl, sl); d1 <= 12; d1++) {
      path1.clear();
      if (search1(tw, fl, sl, d1, -9) || done()) break;
    }
    Moves out;
    for (int m : best) out.push_back(MOVES[m]);
    return out;
  }
};
// #endregion

// ---------------------------------------------------------------- Layer-by-Layer
const string SIDES = "FRBL";
const int U = 0, D = 3;
const string RIGHT_INSERT = "U R U' R' U' F' U F", LEFT_INSERT = "U' L' U L U F U' F'";
const string SEXY = "R U R' U'", EDGE_FLIP = "F R U R' U' F'", SUNE = "R U R' U R U2 R' U";
const string NIKLAS = "U R U' L' U R' U' L", TWIST_ALG = "R' D' R D";
const string TO_BOTTOM[6] = {"z2", "z", "x'", "", "z'", "x"};
const string U_TURN[4] = {"", "U", "U2", "U'"};

char rightOf(char x) { return SIDES[(SIDES.find(x) + 1) % 4]; }
char leftOf(char x) { return SIDES[(SIDES.find(x) + 3) % 4]; }
int faceOf(int f) { return f / 9; }
int faceIndex(char x) { return (int)string("URFDLB").find(x); }

struct Lbl {
  State s;
  Moves moves;

  explicit Lbl(const State& st) : s(st) {}
  void apply(const Moves& seq) { s = applyMoves(s, seq); moves.insert(moves.end(), seq.begin(), seq.end()); }
  void apply(const string& alg) { apply(split(alg)); }
  int center(int f) const { return s[f * 9 + 4]; }
  int side(char x) const { return center(faceIndex(x)); }
  array<int, 3> cols3(char x) const { return {center(D), side(x), side(rightOf(x))}; }

  int edgeAt(int a, int b) const {
    for (int i = 0; i < 12; i++) {
      int p = s[EDGE_FACELETS[i][0]], q = s[EDGE_FACELETS[i][1]];
      if ((p == a && q == b) || (p == b && q == a)) return i;
    }
    return -1;
  }
  int cornerAt(const array<int, 3>& cols) const {
    for (int i = 0; i < 8; i++) {
      bool all = true;
      for (int f : CORNER_FACELETS[i]) all = all && find(cols.begin(), cols.end(), s[f]) != cols.end();
      if (all) return i;
    }
    return -1;
  }
  bool edgeSolved(int a, int b) const {
    for (int f : EDGE_FACELETS[edgeAt(a, b)])
      if (s[f] != center(faceOf(f))) return false;
    return true;
  }
  bool cornerSolved(const array<int, 3>& cols) const {
    for (int f : CORNER_FACELETS[cornerAt(cols)])
      if (s[f] != center(faceOf(f))) return false;
    return true;
  }

  // shortest sequence over `faces` (iterative deepening) after which goal(Lbl(state)) holds
  Moves search(const string& faces, int maxDepth, const function<bool(const Lbl&)>& goal) const {
    Moves ms, path;
    for (char f : faces) ms.push_back(string(1, f)), ms.push_back(string(1, f) + "2"), ms.push_back(string(1, f) + "'");
    function<bool(const State&, int)> dfs = [&](const State& st, int depth) {
      if (depth == 0) return goal(Lbl(st));
      for (auto& m : ms) {
        if (!path.empty() && path.back()[0] == m[0]) continue;
        path.push_back(m);
        if (dfs(applyMove(st, m), depth - 1)) return true;
        path.pop_back();
      }
      return false;
    };
    for (int d = 0; d <= maxDepth; d++)
      if (dfs(s, d)) return path;
    throw runtime_error("LBL search failed");
  }

  void uTurnsUntil(const function<bool()>& test) {
    for (int k = 0; k < 4; k++) {
      if (test()) return;
      apply("U");
    }
    throw runtime_error("LBL alignment failed");
  }

  template <class F>
  auto probe(F fn) {
    State saved = s;
    size_t n = moves.size();
    auto result = fn();
    s = saved;
    moves.resize(n);
    return result;
  }
};

// #region lbl
// Rewrite an algorithm written for the front face so it acts on side x.
Moves relabel(const string& alg, char x) {
  int shift = (int)SIDES.find(x);
  Moves out;
  for (auto& m : split(alg)) {
    auto k = SIDES.find(m[0]);
    out.push_back(k == string::npos ? m : string(1, SIDES[(k + shift) % 4]) + m.substr(1));
  }
  return out;
}

// First-layer corners: bring each white corner above its slot, then repeat R U R' U' until it drops in.
void cornersStage(Lbl& z) {
  for (int xi = 0; xi < 4; xi++) {
    char x = SIDES[xi];
    if (z.cornerSolved(z.cols3(x))) continue;
    if (z.cornerAt(z.cols3(x)) >= 4) {
      z.apply(z.search("URFDLB", 3, [&](const Lbl& p) {
        if (p.cornerAt(p.cols3(x)) >= 4) return false;
        for (char y : SIDES)
          if (!p.edgeSolved(p.center(D), p.side(y))) return false;
        for (int y = 0; y < xi; y++)
          if (!p.cornerSolved(p.cols3(SIDES[y]))) return false;
        return true;
      }));
    }
    z.uTurnsUntil([&] {
      bool hasX = false, hasR = false;
      for (int f : CORNER_FACELETS[z.cornerAt(z.cols3(x))]) hasX |= faceOf(f) == faceIndex(x), hasR |= faceOf(f) == faceIndex(rightOf(x));
      return hasX && hasR;
    });
    for (int k = 0; k < 6 && !z.cornerSolved(z.cols3(x)); k++) z.apply(relabel(SEXY, x));
  }
}
// #endregion

vector<Moves> lbl(const State& start) {
  Lbl z(start);
  vector<Moves> stages;

  auto crossKept = [](const Lbl& p, int n) {
    for (int y = 0; y < n; y++)
      if (!p.edgeSolved(p.center(D), p.side(SIDES[y]))) return false;
    return true;
  };
  auto oriented = [&] {
    vector<int> out;
    for (int i = 0; i < 4; i++)
      if (z.s[EDGE_FACELETS[i][0]] == z.center(U)) out.push_back(i);
    return out;
  };
  auto matching = [&] {
    int n = 0;
    for (int i = 0; i < 4; i++)
      if (z.s[EDGE_FACELETS[i][1]] == z.center(faceOf(EDGE_FACELETS[i][1]))) n++;
    return n;
  };
  auto bestAlignment = [&] {  // most top edges in place over the 4 possible U turns: {count, turns}
    return z.probe([&] {
      pair<int, int> best{-1, 0};
      for (int k = 0; k < 4; k++) {
        if (matching() > best.first) best = {matching(), k};
        z.apply("U");
      }
      return best;
    });
  };
  auto placed = [&](int i) {
    for (int f : CORNER_FACELETS[i]) {
      bool in = false;
      for (int g : CORNER_FACELETS[i]) in |= z.s[f] == z.center(faceOf(g));
      if (!in) return false;
    }
    return true;
  };

  vector<function<void()>> runs = {
      [&] {  // 1. white cross
        int whiteFace = 0;
        while (z.center(whiteFace) != 0) whiteFace++;
        if (!TO_BOTTOM[whiteFace].empty()) z.apply(TO_BOTTOM[whiteFace]);
        for (int xi = 0; xi < 4; xi++) {
          char x = SIDES[xi];
          if (z.edgeSolved(z.center(D), z.side(x))) continue;
          if (z.edgeAt(z.center(D), z.side(x)) >= 4)
            z.apply(z.search("URFDLB", 3, [&](const Lbl& p) { return p.edgeAt(p.center(D), p.side(x)) < 4 && crossKept(p, xi); }));
          z.uTurnsUntil([&] {
            for (int f : EDGE_FACELETS[z.edgeAt(z.center(D), z.side(x))])
              if (faceOf(f) == faceIndex(x)) return true;
            return false;
          });
          z.apply(z.search(string("U") + x + leftOf(x) + rightOf(x), 4, [&](const Lbl& p) { return crossKept(p, xi + 1); }));
        }
      },
      [&] { cornersStage(z); },  // 2. first-layer corners
      [&] {                      // 3. middle-layer edges
        for (char x : SIDES) {
          if (z.edgeSolved(z.side(x), z.side(rightOf(x)))) continue;
          int pos = z.edgeAt(z.side(x), z.side(rightOf(x)));
          if (pos >= 4) {
            int a = faceOf(EDGE_FACELETS[pos][0]), b = faceOf(EDGE_FACELETS[pos][1]);
            for (char y : SIDES) {
              int fy = faceIndex(y), fr = faceIndex(rightOf(y));
              if ((fy == a || fy == b) && (fr == a || fr == b)) { z.apply(relabel(RIGHT_INSERT, y)); break; }
            }
          }
          char side = 0;
          z.uTurnsUntil([&] {
            const int* pq = EDGE_FACELETS[z.edgeAt(z.side(x), z.side(rightOf(x)))];
            side = 0;
            for (char f : SIDES)
              if (faceIndex(f) == faceOf(pq[1]) && z.s[pq[1]] == z.side(f)) { side = f; break; }
            return side != 0 && faceOf(pq[0]) == U;
          });
          int top = z.s[EDGE_FACELETS[z.edgeAt(z.side(x), z.side(rightOf(x)))][0]];
          z.apply(relabel(top == z.side(rightOf(side)) ? RIGHT_INSERT : LEFT_INSERT, side));
        }
      },
      [&] {  // 4. yellow cross
        for (int n = 0; n < 4 && oriented().size() < 4; n++) {
          auto o = oriented();
          if (o.size() == 2) {
            bool line = (o[0] + 2) % 4 == o[1];
            z.uTurnsUntil([&] {
              auto now = oriented();
              auto has = [&](int v) { return find(now.begin(), now.end(), v) != now.end(); };
              return line ? has(0) && has(2) : has(2) && has(3);
            });
          }
          z.apply(EDGE_FLIP);
        }
      },
      [&] {  // 5. yellow edges
        for (int n = 0; n < 4; n++) {
          if (bestAlignment().first == 4) break;
          int pick = 0, pickCount = -1;
          for (int k = 0; k < 4; k++) {
            int count = z.probe([&] { z.apply(U_TURN[k] + " " + SUNE); return bestAlignment().first; });
            if (count > pickCount) pickCount = count, pick = k;
          }
          z.apply(U_TURN[pick] + " " + SUNE);
        }
        z.apply(U_TURN[bestAlignment().second]);
      },
      [&] {  // 6. place yellow corners
        for (int n = 0; n < 4; n++) {
          vector<int> ok;
          for (int i = 0; i < 4; i++)
            if (placed(i)) ok.push_back(i);
          if (ok.size() == 4) return;
          z.apply(relabel(NIKLAS, string("FLBR")[ok.empty() ? 0 : ok[0]]));
        }
      },
      [&] {  // 7. twist yellow corners
        for (int i = 0; i < 4; i++) {
          for (int k = 0; k < 3 && z.s[8] != z.center(U); k++) z.apply(TWIST_ALG + " " + TWIST_ALG);
          z.apply("U");
        }
        z.uTurnsUntil([&] { return isSolved(z.s); });
      },
  };

  for (auto& run : runs) {
    size_t from = z.moves.size();
    run();
    stages.push_back(simplify(Moves(z.moves.begin() + from, z.moves.end())));
  }
  return stages;
}

// ---------------------------------------------------------------- main
int main() {
  initFacelets();
  initTables();
  string out;
  for (string line; getline(cin, line);) {
    while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
    if (line.empty()) continue;
    State s;
    for (int i = 0; i < 54; i++) s[i] = line[i] - '0';
    Kociemba k{toCubie(normalize(s))};
    if (!solvable(k.cube)) throw runtime_error("unsolvable cube: " + line);
    vector<string> stageText;
    for (auto& st : lbl(s)) stageText.push_back(join(st, " "));
    out += join(k.solve(), " ") + ";" + join(stageText, "|") + "\n";
  }
  cout << out;
}
```

- [ ] **Step 3: Verify**

Run: `npm run verify:ref`
Expected: every runner so far prints `PASS`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add reference/cpp/rubik.cpp scripts/verify-ref.mjs
git commit -m "feat: add the C++ reference implementation"
```

---

### Task 6: Snippet extraction and highlighting

**Files:**
- Create: `scripts/snippets.mjs`, `scripts/snippets.d.mts`, `src/algo-snippets.d.ts`
- Modify: `vite.config.ts`, `package.json` (devDependency)
- Test: `scripts/snippets.test.mjs`

**Interfaces:**
- Consumes: the four regions in each of the 5 reference files.
- Produces:
  - `extractRegions(source): Record<string, string>` (dedented text between the markers)
  - `compactHtml(shikiHtml): string`. The output is `<pre class="code"><code>…`; token spans become `<span class=k|s|c|f|n|v>` (keyword, string, comment, function, constant, parameter); punctuation and plain text stay bare.
  - `snippetsPlugin()`: a Vite plugin serving `virtual:algo-snippets` with `SNIPPETS[region][lang]` (lang ∈ `python cpp csharp java javascript`)

- [ ] **Step 1: Install Shiki**

Run: `npm install -D shiki@^4.5.0`
Expected: `package.json` gains `"shiki"` under devDependencies.

- [ ] **Step 2: Write the failing test**

`scripts/snippets.test.mjs`:
```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_LANGS, REGIONS, compactHtml, extractRegions } from './snippets.mjs';

describe('algorithm snippets', () => {
  it('cuts dedented regions marked with // #region or # region', () => {
    const js = 'a\n  // #region one\n  if (x) {\n    y();\n  }\n  // #endregion\nb';
    expect(extractRegions(js)).toEqual({ one: 'if (x) {\n  y();\n}' });
    const py = '# region two\ndef f():\n    pass\n# endregion\n';
    expect(extractRegions(py)).toEqual({ two: 'def f():\n    pass' });
  });

  it('turns Shiki css-variable spans into short classes and drops line wrappers', () => {
    const html = '<pre class="shiki css-vars" style="background-color:var(--shiki-background)" tabindex="0"><code>'
      + '<span class="line"><span style="color:var(--shiki-token-keyword)">def</span><span style="color:var(--shiki-foreground)"> f</span>'
      + '<span style="color:var(--shiki-token-punctuation)">(</span></span>\n'
      + '<span class="line"><span style="color:var(--shiki-token-comment)"># x</span></span></code></pre>';
    expect(compactHtml(html)).toBe('<pre class="code"><code><span class=k>def</span> f(\n<span class=c># x</span></code></pre>');
  });

  it('finds every region in every reference implementation', () => {
    for (const lang of CODE_LANGS) {
      const regions = extractRegions(readFileSync(lang.file, 'utf8'));
      for (const r of REGIONS) expect(regions[r]?.length, `${lang.file} ${r}`).toBeGreaterThan(50);
    }
  });
});
```

Run: `npm test -- scripts/snippets.test.mjs`
Expected: FAIL, cannot resolve `./snippets.mjs`.

- [ ] **Step 3: Create scripts/snippets.mjs**

```js
// Build-time code snippets for the "Thuật toán" tab: cut marked regions out of the reference
// implementations and highlight them with Shiki, so the tab always shows code that really runs.
// Plain JS (with snippets.d.mts) because it needs Node's fs and is only ever run by Vite/Vitest.
import { readFileSync } from 'node:fs';
import { codeToHtml, createCssVariablesTheme } from 'shiki';

export const REGIONS = ['facelets', 'invariants', 'kociemba', 'lbl'];
export const CODE_LANGS = [
  { id: 'python', label: 'Python', file: 'reference/python/rubik.py' },
  { id: 'cpp', label: 'C++', file: 'reference/cpp/rubik.cpp' },
  { id: 'csharp', label: 'C#', file: 'reference/csharp/Rubik.cs' },
  { id: 'java', label: 'Java', file: 'reference/java/Rubik.java' },
  { id: 'javascript', label: 'JS', file: 'reference/js/rubik.mjs' },
];

const START = /^\s*(?:\/\/|#)\s*#?region\s+([\w-]+)\s*$/;
const END = /^\s*(?:\/\/|#)\s*#?endregion\b/;

/** Text between `// #region name` (or `# region name`) and the matching end marker, dedented. */
export function extractRegions(source) {
  const out = {};
  let name = null;
  let lines = [];
  for (const line of source.replace(/\r/g, '').split('\n')) {
    if (name === null) {
      const m = START.exec(line);
      if (m) { name = m[1]; lines = []; }
    } else if (END.test(line)) {
      const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      out[name] = lines.map((l) => l.slice(indent)).join('\n').trim();
      name = null;
    } else {
      lines.push(line);
    }
  }
  return out;
}

// Shiki token kinds -> one-letter classes colored in app.css; everything else stays plain text.
const SHORT = { keyword: 'k', string: 's', 'string-expression': 's', link: 's', comment: 'c', function: 'f', constant: 'n', parameter: 'v' };

/** Shiki css-variables output -> compact HTML: no per-line wrappers, short unquoted classes (keeps the single file small). */
export function compactHtml(html) {
  return html
    .replace(/<pre class="shiki[^"]*"[^>]*>/, '<pre class="code">')
    .replace(/<span class="line">(.*?)<\/span>(?=\n|<\/code>)/g, '$1')
    .replace(/<span style="color:var\(--shiki-(?:foreground|token-punctuation)\)">([^<]*)<\/span>/g, '$1')
    .replace(/<span style="color:var\(--shiki-token-([\w-]+)\)[^"]*">([^<]*)<\/span>/g,
      (_, kind, text) => (SHORT[kind] ? `<span class=${SHORT[kind]}>${text}</span>` : text));
}

const theme = createCssVariablesTheme({ name: 'css-vars', variablePrefix: '--shiki-' });
const VIRTUAL = 'virtual:algo-snippets';
const RESOLVED = `\0${VIRTUAL}`;

/** Vite plugin: `import { SNIPPETS } from 'virtual:algo-snippets'` -> SNIPPETS[region][lang] = html. */
export function snippetsPlugin() {
  return {
    name: 'algo-snippets',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    async load(id) {
      if (id !== RESOLVED) return null;
      const snippets = Object.fromEntries(REGIONS.map((r) => [r, {}]));
      for (const lang of CODE_LANGS) {
        this.addWatchFile(lang.file);
        const regions = extractRegions(readFileSync(lang.file, 'utf8'));
        for (const r of REGIONS) {
          if (!regions[r]) throw new Error(`${lang.file}: missing region "${r}"`);
          snippets[r][lang.id] = compactHtml(await codeToHtml(regions[r], { lang: lang.id, theme }));
        }
      }
      return `export const SNIPPETS = ${JSON.stringify(snippets)};`;
    },
  };
}
```

- [ ] **Step 4: Create the declarations**

`scripts/snippets.d.mts`:
```ts
import type { Plugin } from 'vite';

export const REGIONS: readonly ['facelets', 'invariants', 'kociemba', 'lbl'];
export const CODE_LANGS: readonly { id: string; label: string; file: string }[];
export function extractRegions(source: string): Record<string, string>;
export function compactHtml(html: string): string;
export function snippetsPlugin(): Plugin;
```

`src/algo-snippets.d.ts`:
```ts
// Provided at build time by scripts/snippets.mjs (Vite plugin): highlighted HTML per code region and language.
declare module 'virtual:algo-snippets' {
  type Region = 'facelets' | 'invariants' | 'kociemba' | 'lbl';
  type CodeLang = 'python' | 'cpp' | 'csharp' | 'java' | 'javascript';
  export const SNIPPETS: Record<Region, Record<CodeLang, string>>;
}
```

- [ ] **Step 5: Register the plugin in vite.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { snippetsPlugin } from './scripts/snippets.mjs';

export default defineConfig({
  base: './',
  plugins: [snippetsPlugin(), viteSingleFile()],
  test: { environment: 'node' },
});
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (19 files, 89 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/snippets.mjs scripts/snippets.d.mts scripts/snippets.test.mjs src/algo-snippets.d.ts vite.config.ts
git commit -m "feat: cut and highlight reference code regions at build time"
```

---

### Task 7: Algorithms prose (VI/EN)

**Files:**
- Create: `src/ui/content/algo.ts`, `src/ui/content/algo.vi.ts`, `src/ui/content/algo.en.ts`
- Test: `src/ui/content/algo.test.ts`

**Interfaces:**
- Consumes: `Lang` (i18n.ts)
- Produces:
  - `type SectionId = 'model' | 'invariants' | 'rings' | 'lbl' | 'kociemba' | 'gods'`
  - `interface AlgoSection { id; title; html }`
  - `ALGO_SECTIONS: Record<Lang, AlgoSection[]>`
  - `SECTION_REGION`: maps model→facelets, invariants→invariants, lbl→lbl, kociemba→kociemba. `rings` and `gods` have no code.
- Facts used:
  - Group order 43,252,003,274,489,856,000.
  - God's number 20, proved in 2010 by Rokicki, Kociemba, Davidson and Dethridge with about 35 CPU-years from Google.
  - The superflip needs 20 moves.
  - The meet-in-the-middle ball holds 621,649 states.

- [ ] **Step 1: Write the failing test**

`src/ui/content/algo.test.ts`:
```ts
import { expect, it } from 'vitest';
import { ALGO_SECTIONS } from './algo.ts';

it('has the same 6 sections in both languages, each with text', () => {
  const ids = ALGO_SECTIONS.vi.map((s) => s.id);
  expect(ids).toEqual(['model', 'invariants', 'rings', 'lbl', 'kociemba', 'gods']);
  expect(ALGO_SECTIONS.en.map((s) => s.id)).toEqual(ids);
  for (const lang of ['vi', 'en'] as const) {
    for (const s of ALGO_SECTIONS[lang]) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.html).toMatch(/^<p>/);
      expect(s.html.split('<p>').length).toBeGreaterThanOrEqual(3);
    }
  }
});
```

Run: `npm test -- src/ui/content/algo.test.ts`
Expected: FAIL, cannot resolve `./algo.ts`.

- [ ] **Step 2: Create src/ui/content/algo.ts**

```ts
// Long-form text for the "Thuật toán" tab, one file per language.
import type { Lang } from '../i18n.ts';
import { SECTIONS_EN } from './algo.en.ts';
import { SECTIONS_VI } from './algo.vi.ts';

export type SectionId = 'model' | 'invariants' | 'rings' | 'lbl' | 'kociemba' | 'gods';
export interface AlgoSection { id: SectionId; title: string; html: string }

export const ALGO_SECTIONS: Record<Lang, AlgoSection[]> = { vi: SECTIONS_VI, en: SECTIONS_EN };

// code region (in the reference implementations) shown under each section
export const SECTION_REGION: Partial<Record<SectionId, 'facelets' | 'invariants' | 'kociemba' | 'lbl'>> = {
  model: 'facelets', invariants: 'invariants', lbl: 'lbl', kociemba: 'kociemba',
};
```

- [ ] **Step 3: Create src/ui/content/algo.vi.ts**

```ts
import type { AlgoSection } from './algo.ts';

// Vietnamese text for the "Thuật toán" tab (trusted, static HTML).
export const SECTIONS_VI: AlgoSection[] = [
  {
    id: 'model',
    title: '1. Biểu diễn khối: facelet và cubie',
    html: `<p>Khối có 54 ô màu (<em>facelet</em>), đánh số 0–53 theo thứ tự mặt U R F D L B, mỗi mặt đọc từng hàng. Trạng thái của khối chỉ là một mảng 54 số.</p>
<p>Mỗi phép xoay là một <strong>hoán vị</strong> của 54 vị trí. Thay vì gõ tay bảng hoán vị, ta gắn cho mỗi ô toạ độ khối con <code>p</code> và pháp tuyến <code>n</code>, quay 90° những ô nằm trên lớp cần xoay, rồi tra lại chỉ số: hoán vị tự sinh ra nên không thể gõ nhầm.</p>
<p>Cách nhìn thứ hai là <em>cubie</em>: 8 góc và 12 cạnh, mỗi khối có vị trí và hướng (góc xoay 0–2, cạnh lật 0–1). Bộ giải Kociemba làm việc trên cubie.</p>`,
  },
  {
    id: 'invariants',
    title: '2. Nhóm Rubik và 3 bất biến',
    html: `<p>Mọi trạng thái xoay được từ khối đã giải tạo thành <strong>nhóm Rubik</strong> với 43.252.003.274.489.856.000 phần tử (khoảng 4,3 × 10<sup>19</sup>).</p>
<p>Nếu tháo ra lắp lại tuỳ ý thì có gấp 12 lần số đó, và chỉ 1/12 giải được. Ba định luật phân biệt chúng:</p>
<ul><li>tổng hướng các góc chia hết cho 3 (một góc bị vặn: không giải được);</li>
<li>tổng lật các cạnh là số chẵn (một cạnh bị lật: không giải được);</li>
<li>tính chẵn lẻ của hoán vị góc bằng của hoán vị cạnh (hai khối bị tráo: không giải được).</li></ul>
<p>1/3 × 1/2 × 1/2 = 1/12. Tab "Giải" dùng chính 3 định luật này để báo lỗi, còn Tab "Ra đề" dùng chúng để chỉ sinh trạng thái giải được.</p>`,
  },
  {
    id: 'rings',
    title: '3. Sơ đồ 9 vòng (circle puzzle)',
    html: `<p>9 lát cắt (3 trục × 3 lớp) được vẽ thành 9 vòng tròn: mỗi họ vòng đồng tâm ứng với một trục, mỗi vòng đi qua đúng 12 ô của lát cắt đó.</p>
<p>Mỗi ô nằm trên đúng 2 lát cắt, nên mỗi chấm là <strong>giao điểm của 2 vòng khác họ</strong>. Hai vòng cắt nhau tại 2 điểm: một cho mặt có pháp tuyến dương (U, R, F), một cho mặt đối diện (D, L, B, nằm gần tâm hơn). 3 cặp họ × 9 cặp vòng × 2 điểm = 54 chấm.</p>
<p>Đây là một <strong>biểu diễn đẳng cấu</strong> (isomorphic representation): cùng một nhóm hoán vị trên 54 phần tử, chỉ khác cách vẽ. Quay một lớp tức là trượt 12 chấm 3 nấc dọc vòng của nó, đồng thời 8 chấm của mặt bị xoay quay quanh chấm tâm.</p>`,
  },
  {
    id: 'lbl',
    title: '4. Phương pháp từng tầng (LBL)',
    html: `<p>7 giai đoạn: chữ thập trắng → góc tầng 1 → cạnh tầng 2 → chữ thập vàng → xếp cạnh vàng → đặt vị trí góc vàng → xoay góc vàng. Trước tiên cả khối được xoay để mặt trắng xuống dưới.</p>
<p>Mỗi giai đoạn chỉ dùng vài công thức cố định (<code>R U R' U'</code>, <code>F R U R' U' F'</code>, <code>R U R' U R U2 R'</code>…). Công thức được viết cho mặt trước rồi <em>đổi nhãn</em> (relabel) sang mặt khác, thay vì xoay cả khối.</p>
<p>Bước đưa khối vào vị trí chuẩn bị dùng một tìm kiếm rất nông (≤ 4 nước), nên không phải liệt kê từng trường hợp. Trung bình khoảng 160 nước: dài nhưng dễ hiểu từng bước.</p>`,
  },
  {
    id: 'kociemba',
    title: '5. Thuật toán 2 pha của Kociemba',
    html: `<p><strong>Pha 1</strong> đưa khối vào nhóm con G1 = ⟨U, D, R2, L2, F2, B2⟩: không góc nào bị vặn, không cạnh nào bị lật, 4 cạnh tầng giữa nằm trong tầng giữa. Pha 1 mô tả khối bằng 3 toạ độ: twist (2187 giá trị), flip (2048), slice (495).</p>
<p><strong>Pha 2</strong> giải trong G1 chỉ với 10 phép xoay trên, bằng 3 toạ độ khác: hoán vị góc (40320), hoán vị 8 cạnh (40320), hoán vị lát giữa (24).</p>
<p>Mỗi pha là <strong>IDA*</strong>: tìm sâu dần và cắt nhánh khi <em>bảng cắt tỉa</em> (pruning table, lập bằng BFS) cho biết không thể tới đích kịp. Bộ giải tiếp tục rút ngắn trong một ngân sách nút cố định, nên kết quả tất định: cùng đầu vào cho cùng lời giải ở cả 5 ngôn ngữ.</p>`,
  },
  {
    id: 'gods',
    title: '6. Con số của Chúa = 20',
    html: `<p>Năm 2010, Rokicki, Kociemba, Davidson và Dethridge chứng minh mọi trạng thái đều giải được trong tối đa <strong>20 nước</strong> (tính U2 là một nước), dùng khoảng 35 năm CPU do Google tài trợ.</p>
<p><em>Superflip</em> (mọi cạnh đều bị lật, mọi thứ khác đúng chỗ) là trạng thái nổi tiếng cần đúng 20 nước.</p>
<p>Ứng dụng này đo khoảng cách chính xác tới 9 nước bằng <strong>meet-in-the-middle</strong>: dựng sẵn 621.649 trạng thái cách đích ≤ 5 nước, rồi tìm ≤ 4 nước từ đề cho tới khi chạm tập đó.</p>`,
  },
];
```

- [ ] **Step 4: Create src/ui/content/algo.en.ts**

```ts
import type { AlgoSection } from './algo.ts';

// English text for the "Algorithms" tab (trusted, static HTML).
export const SECTIONS_EN: AlgoSection[] = [
  {
    id: 'model',
    title: '1. Modelling the cube: facelets and cubies',
    html: `<p>The cube has 54 stickers (<em>facelets</em>), numbered 0–53 in face order U R F D L B, each face read row by row. A cube state is just an array of 54 numbers.</p>
<p>Every turn is a <strong>permutation</strong> of the 54 positions. Instead of typing permutation tables by hand, each sticker gets a cubie position <code>p</code> and an outward normal <code>n</code>; the stickers on the turning layer are rotated 90° and looked up again, so the permutation generates itself and cannot contain typos.</p>
<p>The second view is <em>cubies</em>: 8 corners and 12 edges, each with a position and an orientation (corner twist 0–2, edge flip 0–1). The Kociemba solver works on cubies.</p>`,
  },
  {
    id: 'invariants',
    title: '2. The cube group and its 3 invariants',
    html: `<p>Every state reachable from the solved cube forms the <strong>Rubik's cube group</strong>, with 43,252,003,274,489,856,000 elements (about 4.3 × 10<sup>19</sup>).</p>
<p>Taking the cube apart and reassembling it at random gives 12 times as many, and only 1 in 12 is solvable. Three laws tell them apart:</p>
<ul><li>the corner twists add up to a multiple of 3 (one twisted corner: unsolvable);</li>
<li>the edge flips add up to an even number (one flipped edge: unsolvable);</li>
<li>the corner permutation and the edge permutation have the same parity (two swapped pieces: unsolvable).</li></ul>
<p>1/3 × 1/2 × 1/2 = 1/12. The Solve tab uses exactly these laws to explain errors, and the Puzzle tab uses them to build only solvable states.</p>`,
  },
  {
    id: 'rings',
    title: '3. The 9-ring diagram (circle puzzle)',
    html: `<p>The 9 slices (3 axes × 3 layers) are drawn as 9 circles: each family of concentric circles belongs to one axis, and each circle runs through the 12 stickers of its slice.</p>
<p>Every sticker lies on exactly 2 slices, so every dot is the <strong>crossing of 2 circles from different families</strong>. Two circles cross twice: once for the face with a positive normal (U, R, F) and once for the opposite face (D, L, B, nearer the middle). 3 family pairs × 9 circle pairs × 2 points = 54 dots.</p>
<p>It is an <strong>isomorphic representation</strong>: the same permutation group on 54 elements, drawn differently. Turning a layer slides its circle's 12 dots by 3 places, while the 8 dots of the turned face rotate around their center dot.</p>`,
  },
  {
    id: 'lbl',
    title: '4. The layer-by-layer method (LBL)',
    html: `<p>7 stages: white cross → first-layer corners → middle-layer edges → yellow cross → yellow edges → place yellow corners → twist yellow corners. First the whole cube is turned so that white is at the bottom.</p>
<p>Each stage uses a few fixed algorithms (<code>R U R' U'</code>, <code>F R U R' U' F'</code>, <code>R U R' U R U2 R'</code>…). An algorithm is written for the front face and <em>relabelled</em> onto another side instead of turning the whole cube.</p>
<p>Setup moves come from a very shallow search (≤ 4 moves), so no case tables are needed. About 160 moves on average: long, but every step makes sense.</p>`,
  },
  {
    id: 'kociemba',
    title: "5. Kociemba's two-phase algorithm",
    html: `<p><strong>Phase 1</strong> brings the cube into the subgroup G1 = ⟨U, D, R2, L2, F2, B2⟩: no twisted corners, no flipped edges, the 4 middle-layer edges inside the middle layer. Phase 1 describes the cube with 3 coordinates: twist (2187 values), flip (2048) and slice (495).</p>
<p><strong>Phase 2</strong> solves inside G1 using only those 10 turns, with 3 other coordinates: corner permutation (40320), permutation of 8 edges (40320) and middle-slice permutation (24).</p>
<p>Each phase is <strong>IDA*</strong>: a deepening search that prunes a branch when a <em>pruning table</em> (built by BFS) proves the goal is out of reach. The solver keeps shortening within a fixed node budget, so it is deterministic: the same input gives the same solution in all 5 languages.</p>`,
  },
  {
    id: 'gods',
    title: "6. God's number is 20",
    html: `<p>In 2010 Rokicki, Kociemba, Davidson and Dethridge proved that every state can be solved in at most <strong>20 moves</strong> (counting U2 as one move), using about 35 CPU-years donated by Google.</p>
<p>The <em>superflip</em> (every edge flipped, everything else in place) is the famous state that needs exactly 20.</p>
<p>This app measures exact distances up to 9 moves by <strong>meeting in the middle</strong>: it stores all 621,649 states within 5 moves of solved, then searches up to 4 moves from the puzzle until it lands in that set.</p>`,
  },
];
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (20 files, 90 tests).

- [ ] **Step 6: Commit**

```bash
git add src/ui/content
git commit -m "docs: add bilingual explanations for the algorithms tab"
```

---

### Task 8: The "Thuật toán" tab

**Files:**
- Create: `src/ui/algoTab.ts`
- Modify: `src/main.ts`, `src/ui/i18n/vi.json`, `src/ui/i18n/en.json`, `src/ui/theme.css`, `src/ui/app.css`, `DESIGN.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-02-rubik-webui-design.md`

**Interfaces:**
- Consumes: `SNIPPETS` (virtual module), `ALGO_SECTIONS`, `SECTION_REGION`; `getLang`, `onLangChange`; `load`, `save`; the reference files via `?raw`.
- Produces: `createAlgoTab(): HTMLElement`, registered as the third tab `{ id: 'algo', label: 'tab.algo' }`.
- Behavior:
  - An accordion: one section open at a time, the first one open by default.
  - One code-language choice shared by all sections, remembered under storage key `codeLang` (default `python`).
  - Five download buttons build a Blob of the full source.

- [ ] **Step 1: Add the i18n keys**

Merge into `src/ui/i18n/vi.json`:
```json
{
  "tab.algo": "Thuật toán",
  "algo.pick": "Chọn một mục để đọc. Đoạn code được cắt thẳng từ 5 bản cài đặt mẫu, nên chính là code chạy thật.",
  "algo.download": "Tải mã đầy đủ",
  "algo.downloadHint": "Mỗi file đọc các khối từ stdin (mỗi dòng 54 chữ số theo thứ tự U R F D L B) và in lời giải Kociemba;LBL. Cả 5 bản cho kết quả giống hệt bản TypeScript từng nước (npm run verify:ref)."
}
```
Merge into `src/ui/i18n/en.json`:
```json
{
  "tab.algo": "Algorithms",
  "algo.pick": "Pick a section to read. The code is cut straight from the 5 reference implementations, so it is the code that really runs.",
  "algo.download": "Download full source",
  "algo.downloadHint": "Each file reads cubes from stdin (one line of 54 digits in U R F D L B order) and prints the Kociemba;LBL solutions. All 5 match the TypeScript solvers move for move (npm run verify:ref)."
}
```
Run: `npm test -- src/ui/i18n.test.ts`
Expected: PASS.

- [ ] **Step 2: Add code color tokens to src/ui/theme.css**

In the light `:root` block, right after `--pale-dot-edge: #9A9DA3;`:
```css
  --code-keyword: #9A5B00;
  --code-string: #2E7D32;
  --code-comment: #8A8F98;
  --code-function: #1E5BC6;
  --code-constant: #B3261E;
  --code-parameter: #3A3D42;
```
In **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` and `:root[data-theme='dark']`), right after `--pale-dot-edge: #0B0C0E;`:
```css
  --code-keyword: #E0A458;
  --code-string: #8CC98F;
  --code-comment: #6E727A;
  --code-function: #7FB2FF;
  --code-constant: #F28B82;
  --code-parameter: #C9CBCF;
```

- [ ] **Step 3: Add the tab styles to src/ui/app.css**

Insert directly above the `@media (prefers-reduced-motion: reduce) {` block:
```css
.algo-sec { border-top: 1px solid var(--hairline); }
.algo-sec:first-child { border-top: 0; }
.algo-head { width: 100%; }
.algo-head svg { width: 14px; height: 14px; flex: none; color: var(--mute); transition: transform var(--dur-fast) var(--ease); }
.algo-head[aria-expanded='true'] svg { transform: rotate(90deg); }
.algo-body { padding: 0 10px 10px; color: var(--body); font-size: 12.5px; line-height: 1.6; }
.algo-body p { margin: 6px 0; }
.algo-body ul { margin: 4px 0; padding-left: 18px; }
.algo-body code { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink); }
.code-langs { display: flex; gap: 2px; margin: 10px 0 6px; flex-wrap: wrap; }
.code-langs .tab { flex: none; padding: 0 10px; }
.code-langs .tab[aria-checked='true'] { background: var(--selected); color: var(--ink); }
.code {
  margin: 0; max-height: 360px; overflow: auto; padding: 10px; background: var(--canvas);
  border: 1px solid var(--hairline); border-radius: var(--radius);
  font: 400 11px/1.55 var(--font-mono); color: var(--body); tab-size: 2;
}
.code code { font: inherit; color: inherit; }
.code .k { color: var(--code-keyword); }
.code .s { color: var(--code-string); }
.code .c { color: var(--code-comment); }
.code .f { color: var(--code-function); }
.code .n { color: var(--code-constant); }
.code .v { color: var(--code-parameter); }
```

- [ ] **Step 4: Create src/ui/algoTab.ts**

```ts
// Tab "Thuật toán": six explained sections; the code under them is cut from the reference implementations.
import { SNIPPETS } from 'virtual:algo-snippets';
import cppSrc from '../../reference/cpp/rubik.cpp?raw';
import csSrc from '../../reference/csharp/Rubik.cs?raw';
import javaSrc from '../../reference/java/Rubik.java?raw';
import jsSrc from '../../reference/js/rubik.mjs?raw';
import pySrc from '../../reference/python/rubik.py?raw';
import { ALGO_SECTIONS, SECTION_REGION } from './content/algo.ts';
import { getLang, onLangChange } from './i18n.ts';
import { load, save } from './storage.ts';

const CODE = [
  { id: 'python', label: 'Python', file: 'rubik.py', src: pySrc },
  { id: 'cpp', label: 'C++', file: 'rubik.cpp', src: cppSrc },
  { id: 'csharp', label: 'C#', file: 'Rubik.cs', src: csSrc },
  { id: 'java', label: 'Java', file: 'Rubik.java', src: javaSrc },
  { id: 'javascript', label: 'JS', file: 'rubik.mjs', src: jsSrc },
] as const;
type CodeLang = (typeof CODE)[number]['id'];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createAlgoTab(): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <p class="lbl" data-i18n="algo.pick"></p>
    <div class="algo-sections"></div>
    <p class="lbl" data-i18n="algo.download"></p>
    <p class="hint" data-i18n="algo.downloadHint"></p>
    <div class="row-actions downloads">
      ${CODE.map((c) => `<button type="button" class="btn mono" data-file="${c.id}">${c.file}</button>`).join('')}
    </div>`;

  const list = panel.querySelector<HTMLElement>('.algo-sections')!;
  const saved = load('codeLang');
  let codeLang: CodeLang = CODE.some((c) => c.id === saved) ? (saved as CodeLang) : 'python';
  let open = 0;

  const render = () => {
    list.innerHTML = '';
    ALGO_SECTIONS[getLang()].forEach((sec, i) => {
      const box = document.createElement('section');
      box.className = 'algo-sec';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'row algo-head';
      head.id = `algo-h-${sec.id}`;
      head.setAttribute('aria-expanded', String(i === open));
      head.setAttribute('aria-controls', `algo-b-${sec.id}`);
      head.innerHTML = `<span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
      head.querySelector('span')!.textContent = sec.title;
      head.addEventListener('click', () => { open = open === i ? -1 : i; render(); });
      const body = document.createElement('div');
      body.className = 'algo-body';
      body.id = `algo-b-${sec.id}`;
      body.hidden = i !== open;
      body.innerHTML = sec.html; // static, trusted content from src/ui/content
      const region = SECTION_REGION[sec.id];
      if (region) {
        const tabs = document.createElement('div');
        tabs.className = 'code-langs';
        tabs.setAttribute('role', 'radiogroup');
        for (const c of CODE) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tab';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(c.id === codeLang));
          b.textContent = c.label;
          b.addEventListener('click', () => { codeLang = c.id; save('codeLang', codeLang); render(); });
          tabs.append(b);
        }
        const code = document.createElement('div');
        code.innerHTML = SNIPPETS[region][codeLang]; // highlighted at build time from reference/
        body.append(tabs, code);
      }
      box.append(head, body);
      list.append(box);
    });
  };
  render();
  onLangChange(render);

  panel.querySelectorAll<HTMLButtonElement>('[data-file]').forEach((b) => {
    const c = CODE.find((x) => x.id === b.dataset.file)!;
    b.addEventListener('click', () => download(c.file, c.src));
  });
  return panel;
}
```

- [ ] **Step 5: Register the tab in src/main.ts**

Add the import next to the other `./ui/` imports:
```ts
import { createAlgoTab } from './ui/algoTab.ts';
```
and append a third entry to the `mountTabs` list, after the `solve` entry:
```ts
  { id: 'algo', label: 'tab.algo', panel: createAlgoTab() },
```

- [ ] **Step 6: Document the tokens and commands**

In `DESIGN.md`, section 2, add a row to the color table:
```markdown
| `--code-keyword` `--code-string` `--code-comment` `--code-function` `--code-constant` `--code-parameter` | #E0A458 #8CC98F #6E727A #7FB2FF #F28B82 #C9CBCF | #9A5B00 #2E7D32 #8A8F98 #1E5BC6 #B3261E #3A3D42 | syntax colors in the Algorithms tab only |
```
In `CLAUDE.md`, add these two commands to `## Commands`:
```markdown
- `npm run verify:ref`: run the TypeScript solvers and the 5 reference implementations on `reference/fixtures.txt`; all must print `reference/expected.txt`
- `npm run fixtures`: regenerate `reference/fixtures.txt` + `expected.txt` from the TypeScript solvers (only on purpose; say why in the commit)
```
Then add these two lines to `## Map`:
```markdown
- `reference/`: Kociemba + LBL in Python, C++, C#, Java, JS (one file each, `#region` markers feed the Algorithms tab)
- `scripts/`: `make-fixtures.ts`, `verify-ref.mjs`, `snippets.mjs` (Vite plugin: highlighted code regions)
```
Finally, append `, \`algoTab.ts\` + \`content/\`` to the `src/ui/` line.

In the spec, section 9.2, replace `` `reference/fixtures.json` gồm 30 trạng thái kèm lời giải Kociemba + LBL do bản TS sinh. `` with `` `reference/fixtures.txt` (30 trạng thái, mỗi dòng 54 chữ số) và `reference/expected.txt` (lời giải Kociemba + LBL do bản TS sinh, mỗi dòng `kociemba;giai đoạn 1|…|giai đoạn 7`). ``

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, open it in Edge.

Expected:
- Tabs in order: Ra đề, Giải, Thuật toán.
- In "Thuật toán", section 1 is open; it shows the explanation plus a Python snippet whose first line is `# Facelet i sits on face i // 9 …`.
- Choosing C++ switches the code; opening section 5 shows the C++ `struct Kociemba` with colored keywords. The choice survives a reload.
- Sections 3 and 6 have text only.
- Toggling dark/light recolors the code using the `--code-*` tokens.
- Each of the 5 download buttons saves its file (e.g. `rubik.py`), identical to the file in `reference/`.
- Switching VI/EN changes all section titles and texts.

- [ ] **Step 8: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS (20 files, 90 tests).

```bash
git add src/ui/algoTab.ts src/main.ts src/ui/i18n/vi.json src/ui/i18n/en.json src/ui/theme.css src/ui/app.css DESIGN.md CLAUDE.md docs/superpowers/specs/2026-10-02-rubik-webui-design.md
git commit -m "feat: add the Algorithms tab with highlighted reference code and downloads"
```

---

### Task 9: Release check

**Files:**
- Modify: none, unless a check fails

- [ ] **Step 1: Full verification**

Run:
```bash
npm test && npm run typecheck && npm run verify:ref && npm run build
grep -Eo '(src|href)="https?://' dist/index.html | wc -l
wc -c < dist/index.html
```
Expected:
- Tests and typecheck pass; all 6 runners PASS.
- `0` external references.
- Size about 1,086,000 bytes, below `1258291`.

- [ ] **Step 2: Manual checklist from file://**

Double-click `dist/index.html` in Edge and in Chrome:
- [ ] All three tabs work. The code blocks are colored in both themes and scroll inside their box.
- [ ] The downloads work from `file://`.
- [ ] Console has no errors.

- [ ] **Step 3: Commit if anything changed**

```bash
git add -A
git commit -m "fix: address plan 4 release check findings"
```
(Skip if nothing changed.)
