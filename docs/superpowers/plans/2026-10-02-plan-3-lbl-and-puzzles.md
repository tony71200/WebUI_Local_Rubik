# Plan 3 — LBL solver, exact distance, puzzle levels and the "Ra đề" tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "Ra đề" tab hands out puzzles that are always solvable, at five measured difficulty levels plus three stage-training modes, and times each attempt. The "Giải" tab gains a "Từng tầng" (Layer-by-Layer) mode whose solution is grouped into 7 named, explained stages.

**Architecture:**
- **LBL solver:** a rule-based beginner's method on facelets. Fixed textbook algorithms are relabeled per side; setup moves come from tiny bounded searches.
- **Difficulty:** measured exactly up to 9 moves by meet-in-the-middle. A hash table holds all 621,649 states within 5 moves of solved, and a search of depth ≤ 4 runs from the puzzle.
- **Puzzle generation:** pure and seeded. Puzzles are canonical random walks checked by distance, or constructed states that satisfy the invariants and are scrambled by an inverted Kociemba solution.
- **Worker:** solving and puzzle generation both run in the existing solver worker.
- **Session:** a small controller watches the store to run the clock and count moves.

**Tech Stack:** TypeScript 7, Vite 8, Vitest 5 (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-10-02-rubik-webui-design.md` (sections 5.2, 6, 8.1, 8.10)

**Builds on:** Plans 1 and 2. Plan 2 lives on branch `20261002_solver-and-solve-tab`; create this plan's branch from it, or from `main` once it is merged.
- `src/core/cube.ts`: `State`, `Move`, `solved`, `applyMoves`, `splitMoves`, `invertSequence`, `isSolved`
- `src/core/cubie.ts`: `CORNER_FACELETS`, `EDGE_FACELETS`, `CubieCube`, `toCubie`, `toFacelets`, `normalize`
- `src/core/prng.ts`: `mulberry32`
- `src/solver/coords.ts`: `MOVES`, `MOVE_CUBES`, `getCornerPerm`, `getTwist`, `getFlip`, `permIndex`
- `src/solver/tables.ts`: `buildTables`; `src/solver/kociemba.ts`: `solveCubie`, `solveFacelets`
- `src/solver/protocol.ts`, `worker.ts`, `client.ts` (`createSolverClient`)
- `src/store.ts`: `createStore`, `Store`
- `src/ui/playback.ts`, `src/ui/solveTab.ts`, `src/ui/tabs.ts` (`mountTabs`), `src/ui/i18n.ts`, `src/ui/storage.ts`

## Global Constraints

- Runtime dependency: `three` only. Ask the user before adding any dependency.
- Build: one `dist/index.html`, works from `file://`, offline, no network requests.
- Never produce an unsolvable puzzle (AGENTS.md rule 2). Labels come from measured distance (rule 3).
- Determinism (rule 6): no `Math.random` and no clocks in `src/core/`, `src/solver/`, `src/scramble/`; all randomness flows from a seed through `mulberry32`. The UI may draw the seed from `crypto.getRandomValues`.
- Level contract:

  | Level | Range | How it is proved |
  |---|---|---|
  | `intro` | 1–2 | exact distance |
  | `easy` | 3–5 | exact distance |
  | `medium` | 6–9 | exact distance |
  | `hard` | walk of 10–14 moves | proved ≥ 10 |
  | `expert` | random state (WCA style) | constructed state |
  | `pll`, `oll`, `f2l` | training: top layer = last layer; F2L+LL keeps the bottom cross | constructed state |

- Measured budgets:

  | Operation | Time |
  |---|---|
  | Ball build (first puzzle) | ~0.7 s, ~27 MB |
  | Distance query | ~30 ms |
  | LBL solve | ~4 ms, ~164 moves average |
  | Medium puzzle | ~0.6 s for the first one |

  `dist/index.html` lands at ~0.81 MB (budget 1.2 MB).
- Every visible string goes through `t()` with keys in both `vi.json` and `en.json`.
- Tokens only (DESIGN.md); one `.cta` per tab; animate only transform/opacity; reduced motion disables transitions **and** animations.
- Conventional Commits; `npm test` and `npm run typecheck` pass before each commit.

## File Structure

```
src/core/cube.ts           + simplifyMoves()
src/solver/lbl.ts          Layer-by-Layer solver, 7 stages
src/scramble/distance.ts   Ball (hash set of states <= 5 moves) + exact distance <= 9
src/scramble/levels.ts     canonical walks, constructed states, generatePuzzle()
src/solver/protocol.ts     + solve method, scramble request, stages/puzzle responses
src/solver/worker.ts       + LBL and puzzle requests (ball built lazily)
src/solver/client.ts       solve() returns { moves, stages }, new scramble()
src/ui/session.ts          clock + move counter for one attempt, formatTime()
src/ui/puzzleTab.ts        the "Ra đề" tab
src/ui/solveTab.ts         + method toggle, LBL stage groups
```
Modified as well: `src/main.ts`, `src/ui/app.css`, `src/ui/i18n/{vi,en}.json`, `CLAUDE.md`.

---

### Task 1: Move simplification

**Files:**
- Modify: `src/core/cube.ts` (append), `src/core/cube.test.ts` (import line + new describe block)

**Interfaces:**
- Produces: `simplifyMoves(moves: Move[]): Move[]`. It merges neighbouring turns of the same layer (`R R` → `R2`) and drops turns that cancel (`U U'` → nothing).

- [ ] **Step 1: Write the failing test**

In `src/core/cube.test.ts`, extend the import from `./cube.ts` to include `simplifyMoves` and `splitMoves`:
```ts
import {
  BASE_MOVES, applyMove, applyMoves, invertSequence, isSolved, layerMove, moveDestinations, parseMove, simplifyMoves, solved,
  splitMoves,
  type Move,
} from './cube.ts';
```
Append at the end of the file:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/cube.test.ts`
Expected: FAIL, `simplifyMoves` is not exported / not a function.

- [ ] **Step 3: Append to src/core/cube.ts**

```ts

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (14 files, 67 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/cube.ts src/core/cube.test.ts
git commit -m "feat: add move sequence simplification"
```

---

### Task 2: Layer-by-Layer solver

**Files:**
- Create: `src/solver/lbl.ts`
- Test: `src/solver/lbl.test.ts`

**Interfaces:**
- Consumes: `applyMoves`, `isSolved`, `simplifyMoves`, `splitMoves`, `Move`, `State` (cube.ts); `CORNER_FACELETS`, `EDGE_FACELETS` (cubie.ts)
- Produces (`src/solver/lbl.ts`):
  - `LBL_STAGES = ['cross','corners','middle','topCross','topEdges','cornerPlace','cornerTwist']`; `type LblStageId`; `interface LblStage { id: LblStageId; moves: Move[] }`
  - `relabel(alg: string, x: 'F' | 'R' | 'B' | 'L'): Move[]`: rewrites a front-face algorithm for side `x`
  - `solveLbl(start: State): LblStage[]`: always 7 stages, in order. A stage can be empty. The cross stage starts with the whole-cube turn that brings white (color 0) to the bottom. The solver throws if the cube does not end solved (it never does for valid input).
- How it works:
  - It reads colors from the centers, so any held orientation is fine.
  - Setup moves come from `search(faces, maxDepth ≤ 4, goal)`, an iterative-deepening search over a few faces.
  - The textbook algorithms are relabeled per side: `R U R' U'`, `U R U' R' U' F' U F` / `U' L' U L U F U' F'`, `F R U R' U' F'`, `R U R' U R U2 R' U`, `U R U' L' U R' U' L`, `R' D' R D`.

- [ ] **Step 1: Write the failing test**

`src/solver/lbl.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/solver/lbl.test.ts`
Expected: FAIL, `Failed to resolve import "./lbl.ts"`.

- [ ] **Step 3: Implement src/solver/lbl.ts**

```ts
// Layer-by-Layer (beginner's method) in 7 named stages. White layer first (turned to the bottom),
// yellow last. Works on facelets and reads colors from the centers, so any held orientation is fine.
import { applyMoves, isSolved, simplifyMoves, splitMoves, type Move, type State } from '../core/cube.ts';
import { CORNER_FACELETS, EDGE_FACELETS } from '../core/cubie.ts';

export const LBL_STAGES = ['cross', 'corners', 'middle', 'topCross', 'topEdges', 'cornerPlace', 'cornerTwist'] as const;
export type LblStageId = (typeof LBL_STAGES)[number];
export interface LblStage { id: LblStageId; moves: Move[] }

const FACES = 'URFDLB';
const U = 0, D = 3;
const SIDES = ['F', 'R', 'B', 'L'] as const; // each face's right-hand neighbour is the next one
type Side = (typeof SIDES)[number];
const right = (x: Side): Side => SIDES[(SIDES.indexOf(x) + 1) % 4];
const left = (x: Side): Side => SIDES[(SIDES.indexOf(x) + 3) % 4];
const faceOf = (facelet: number) => Math.floor(facelet / 9);
const faceIndex = (x: string) => FACES.indexOf(x);

// Rewrite an algorithm written for the front face so that it acts on face x (a turn of the whole cube).
export function relabel(alg: string, x: Side): Move[] {
  const shift = SIDES.indexOf(x);
  return splitMoves(alg).map((m) => {
    const k = SIDES.indexOf(m[0] as Side);
    return k < 0 ? m : SIDES[(k + shift) % 4] + m.slice(1);
  });
}

const RIGHT_INSERT = "U R U' R' U' F' U F"; // UF edge -> FR slot
const LEFT_INSERT = "U' L' U L U F U' F'"; // UF edge -> FL slot
const SEXY = "R U R' U'"; // UFR corner -> DFR slot when repeated
const EDGE_FLIP = "F R U R' U' F'"; // orients top edges
const SUNE = "R U R' U R U2 R' U"; // permutes top edges
const NIKLAS = "U R U' L' U R' U' L"; // cycles three top corners, keeps UFR
const TWIST = "R' D' R D"; // twists the UFR corner (twice = one third turn)

// Whole-cube turn that brings the white center (color 0) to the bottom.
const TO_BOTTOM: Record<number, string> = { 0: 'z2', 1: 'z', 2: "x'", 3: '', 4: "z'", 5: 'x' };

class Solver {
  s: State;
  moves: Move[] = [];
  constructor(s: State) { this.s = Uint8Array.from(s); }

  apply(alg: string | Move[]) {
    const seq = typeof alg === 'string' ? splitMoves(alg) : alg;
    this.s = applyMoves(this.s, seq);
    this.moves.push(...seq);
  }

  center(face: number) { return this.s[face * 9 + 4]; }
  sideColor(x: Side) { return this.center(faceIndex(x)); }

  // position index (into EDGE_FACELETS) of the edge with these two colors
  edgeAt(a: number, b: number): number {
    return EDGE_FACELETS.findIndex(([p, q]) => {
      const c = [this.s[p], this.s[q]];
      return (c[0] === a && c[1] === b) || (c[0] === b && c[1] === a);
    });
  }
  cornerAt(cols: number[]): number {
    return CORNER_FACELETS.findIndex((fs) => fs.every((f) => cols.includes(this.s[f])));
  }
  // a piece is solved when every facelet matches its face's center
  edgeSolved(a: number, b: number) {
    const i = this.edgeAt(a, b);
    return EDGE_FACELETS[i].every((f) => this.s[f] === this.center(faceOf(f)));
  }
  cornerSolved(cols: number[]) {
    const i = this.cornerAt(cols);
    return CORNER_FACELETS[i].every((f) => this.s[f] === this.center(faceOf(f)));
  }

  // Shortest sequence (by iterative deepening) over the given faces that reaches the goal.
  search(faces: string, maxDepth: number, goal: (s: State) => boolean): Move[] {
    const moves = [...faces].flatMap((f) => [f, `${f}2`, `${f}'`]);
    const path: Move[] = [];
    const dfs = (s: State, depth: number): boolean => {
      if (depth === 0) return goal(s);
      for (const m of moves) {
        if (path.length && path[path.length - 1][0] === m[0]) continue;
        path.push(m);
        if (dfs(applyMoves(s, [m]), depth - 1)) return true;
        path.pop();
      }
      return false;
    };
    for (let d = 0; d <= maxDepth; d++) if (dfs(this.s, d)) return path;
    throw new Error('LBL search failed');
  }

  // after this many U turns, does `test` hold?
  uTurnsUntil(test: () => boolean): number {
    for (let k = 0; k < 4; k++) {
      if (test()) return k;
      this.apply('U');
    }
    throw new Error('LBL alignment failed');
  }

  with<T>(probe: () => T): T {
    const saved = this.s, n = this.moves.length;
    try { return probe(); } finally { this.s = saved; this.moves.length = n; }
  }
}

const inU = (pos: number) => pos < 4; // UR UF UL UB
const cornerInU = (pos: number) => pos < 4; // URF UFL ULB UBR

export function solveLbl(start: State): LblStage[] {
  const z = new Solver(start);
  const stages: LblStage[] = [];
  const stage = (id: LblStageId, run: () => void) => {
    const from = z.moves.length;
    run();
    stages.push({ id, moves: simplifyMoves(z.moves.slice(from)) });
  };
  const white = () => z.center(D);

  stage('cross', () => {
    const whiteFace = [...Array(6).keys()].find((f) => z.center(f) === 0) ?? D;
    if (TO_BOTTOM[whiteFace]) z.apply(TO_BOTTOM[whiteFace]);
    const done: Side[] = [];
    const crossKept = (s: State, extra: Side[] = []) => [...done, ...extra].every((x) => {
      const probe = new Solver(s);
      return probe.edgeSolved(probe.center(D), probe.sideColor(x));
    });
    for (const x of SIDES) {
      const col = () => z.sideColor(x);
      if (!z.edgeSolved(white(), col())) {
        if (!inU(z.edgeAt(white(), col()))) {
          z.apply(z.search(FACES, 3, (s) => {
            const p = new Solver(s);
            return inU(p.edgeAt(p.center(D), p.sideColor(x))) && crossKept(s);
          }));
        }
        z.uTurnsUntil(() => EDGE_FACELETS[z.edgeAt(white(), col())].some((f) => faceOf(f) === faceIndex(x)));
        z.apply(z.search(`U${x}${left(x)}${right(x)}`, 4, (s) => crossKept(s, [x])));
      }
      done.push(x);
    }
  });

  stage('corners', () => {
    for (const x of SIDES) {
      const cols = () => [white(), z.sideColor(x), z.sideColor(right(x))];
      if (z.cornerSolved(cols())) continue;
      const kept = (s: State) => {
        const p = new Solver(s);
        const w = p.center(D);
        return SIDES.every((y) => p.edgeSolved(w, p.sideColor(y)))
          && SIDES.slice(0, SIDES.indexOf(x)).every((y) => p.cornerSolved([w, p.sideColor(y), p.sideColor(right(y))]));
      };
      if (!cornerInU(z.cornerAt(cols()))) {
        z.apply(z.search(FACES, 3, (s) => {
          const p = new Solver(s);
          return cornerInU(p.cornerAt([p.center(D), p.sideColor(x), p.sideColor(right(x))])) && kept(s);
        }));
      }
      // above the slot: the corner touches faces U, x and right(x)
      z.uTurnsUntil(() => {
        const fs = CORNER_FACELETS[z.cornerAt(cols())].map(faceOf);
        return fs.includes(faceIndex(x)) && fs.includes(faceIndex(right(x)));
      });
      for (let k = 0; k < 6 && !z.cornerSolved(cols()); k++) z.apply(relabel(SEXY, x));
    }
  });

  stage('middle', () => {
    for (const x of SIDES) {
      const cols = () => [z.sideColor(x), z.sideColor(right(x))] as const;
      if (z.edgeSolved(...cols())) continue;
      const pos = z.edgeAt(...cols());
      if (!inU(pos)) {
        // knock it out of the wrong slot: insert any top edge into that slot
        const slotFaces = EDGE_FACELETS[pos].map(faceOf);
        const y = SIDES.find((f) => slotFaces.includes(faceIndex(f)) && slotFaces.includes(faceIndex(right(f))))!;
        z.apply(relabel(RIGHT_INSERT, y));
      }
      // turn U until the edge's side sticker matches the center below it
      let side: Side | undefined;
      z.uTurnsUntil(() => {
        const [p, q] = EDGE_FACELETS[z.edgeAt(...cols())]; // p is on U
        side = SIDES.find((f) => faceIndex(f) === faceOf(q) && z.s[q] === z.sideColor(f));
        return side !== undefined && faceOf(p) === U;
      });
      const top = z.s[EDGE_FACELETS[z.edgeAt(...cols())][0]];
      z.apply(relabel(top === z.sideColor(right(side!)) ? RIGHT_INSERT : LEFT_INSERT, side!));
    }
  });

  const topOriented = () => [0, 1, 2, 3].filter((i) => z.s[EDGE_FACELETS[i][0]] === z.center(U));
  stage('topCross', () => {
    for (let n = 0; n < 4 && topOriented().length < 4; n++) {
      const o = topOriented();
      if (o.length === 2) {
        // line: hold it left-right (UL + UR); L-shape: hold it back-left (UB + UL)
        const line = (o[0] + 2) % 4 === o[1];
        z.uTurnsUntil(() => {
          const now = topOriented();
          return line ? now.includes(0) && now.includes(2) : now.includes(2) && now.includes(3);
        });
      }
      z.apply(EDGE_FLIP);
    }
  });

  // top edge i (UR UF UL UB) is in place when its side sticker matches that side's center
  const U_TURN = ['', 'U', 'U2', "U'"];
  const matching = () => [0, 1, 2, 3].filter((i) => z.s[EDGE_FACELETS[i][1]] === z.center(faceOf(EDGE_FACELETS[i][1])));
  // most top edges in place over the 4 possible U turns: [count, turns]
  const bestAlignment = (): [number, number] => z.with(() => {
    let best: [number, number] = [-1, 0];
    for (let k = 0; k < 4; k++) {
      if (matching().length > best[0]) best = [matching().length, k];
      z.apply('U');
    }
    return best;
  });
  stage('topEdges', () => {
    for (let n = 0; n < 4; n++) {
      if (bestAlignment()[0] === 4) break;
      // try the 4 ways to hold the top layer before Sune; keep the one that lines up the most edges
      let pick = 0, pickCount = -1;
      for (let k = 0; k < 4; k++) {
        const count = z.with(() => {
          z.apply(`${U_TURN[k]} ${SUNE}`);
          return bestAlignment()[0];
        });
        if (count > pickCount) { pickCount = count; pick = k; }
      }
      z.apply(`${U_TURN[pick]} ${SUNE}`);
    }
    const [count, k] = bestAlignment();
    if (count !== 4) throw new Error('LBL top edges failed');
    z.apply(U_TURN[k]);
  });

  const cornerPlaced = (i: number) => {
    const fs = CORNER_FACELETS[i];
    const want = fs.map((f) => z.center(faceOf(f)));
    return fs.every((f) => want.includes(z.s[f]));
  };
  stage('cornerPlace', () => {
    for (let n = 0; n < 4; n++) {
      const placed = [0, 1, 2, 3].filter(cornerPlaced);
      if (placed.length === 4) return;
      // keep a placed corner at UFR: corner position i sits above side SIDES[...] as the alg's "front"
      const keep = placed.length ? placed[0] : 0;
      const front: Side = (['F', 'L', 'B', 'R'] as const)[keep]; // URF->F, UFL->L, ULB->B, UBR->R
      z.apply(relabel(NIKLAS, front));
    }
    throw new Error('LBL corner placement failed');
  });

  stage('cornerTwist', () => {
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 3 && z.s[8] !== z.center(U); k++) z.apply(`${TWIST} ${TWIST}`);
      z.apply('U');
    }
    z.uTurnsUntil(() => isSolved(z.s));
  });

  if (!isSolved(z.s)) throw new Error('LBL did not solve the cube');
  return stages;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (15 files, 72 tests). The log shows `LBL avg ~164 moves`.

- [ ] **Step 5: Commit**

```bash
git add src/solver/lbl.ts src/solver/lbl.test.ts
git commit -m "feat: add Layer-by-Layer solver with 7 checked stages"
```

---

### Task 3: Exact distance by meet-in-the-middle

**Files:**
- Create: `src/scramble/distance.ts`
- Test: `src/scramble/distance.test.ts`

**Interfaces:**
- Consumes: `identityCubie`, `multiply`, `CubieCube` (cubie.ts); `MOVE_CUBES`, `MOVES`, `getCornerPerm`, `getFlip`, `getTwist`, `permIndex` (coords.ts)
- Produces (`src/scramble/distance.ts`):
  - `BALL_RADIUS = 5`, `SEARCH_DEPTH = 4`, `MAX_EXACT = 9`
  - `class Ball { size: number; get(a, b): number; add(a, b, depth): boolean }`: open-addressing hash, 2^21 slots, keys `(corners*2048 + flip, edgePermRank)`
  - `buildBall(): Ball` (621,649 states, ~0.7 s)
  - `distance(ball: Ball, cube: CubieCube): number | null`: the exact HTM distance if ≤ 9, else `null` (proved ≥ 10)

- [ ] **Step 1: Write the failing test**

`src/scramble/distance.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, isSolved, solved, type Move } from '../core/cube.ts';
import { toCubie } from '../core/cubie.ts';
import { mulberry32 } from '../core/prng.ts';
import { MOVES } from '../solver/coords.ts';
import { buildBall, distance, type Ball } from './distance.ts';

let ball: Ball;
let buildMs = 0;
beforeAll(() => {
  const t0 = performance.now();
  ball = buildBall();
  buildMs = performance.now() - t0;
}, 60_000);

const cubieOf = (moves: string | Move[]) => {
  const r = toCubie(applyMoves(solved(), moves));
  if (!r.ok) throw new Error('bad cube');
  return r.cube;
};

// brute force: shortest solution by iterative deepening, for tiny distances only
function bruteForce(moves: Move[], max: number): number {
  const s = applyMoves(solved(), moves);
  const dfs = (st: typeof s, togo: number): boolean =>
    togo === 0 ? isSolved(st) : MOVES.some((m) => dfs(applyMoves(st, [m]), togo - 1));
  for (let d = 0; d <= max; d++) if (dfs(s, d)) return d;
  return Infinity;
}

describe('meet-in-the-middle distance', () => {
  it('holds every state within 5 moves', () => {
    expect(ball.size).toBe(621_649); // 1 + 18 + 243 + 3240 + 43239 + 574908
    console.info(`ball built in ${Math.round(buildMs)} ms`);
  });

  it('matches brute force on short scrambles', () => {
    const rnd = mulberry32(3);
    for (let n = 0; n < 40; n++) {
      const len = 1 + Math.floor(rnd() * 3);
      const seq = Array.from({ length: len }, () => MOVES[Math.floor(rnd() * 18)]);
      expect(distance(ball, cubieOf(seq))).toBe(bruteForce(seq, 3));
    }
  });

  it('measures known distances', () => {
    expect(distance(ball, cubieOf(''))).toBe(0);
    expect(distance(ball, cubieOf('R U'))).toBe(2);
    expect(distance(ball, cubieOf("R U R' U'"))).toBe(4);
    expect(distance(ball, cubieOf("R U F' L D B2 R' U2 F"))).toBe(9);
  });

  it('proves cubes 10+ moves away', () => {
    const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
    expect(distance(ball, cubieOf(superflip))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/scramble/distance.test.ts`
Expected: FAIL, `Failed to resolve import "./distance.ts"`.

- [ ] **Step 3: Implement src/scramble/distance.ts**

```ts
// Exact distance (HTM, face moves) up to 9 by meeting in the middle:
// a precomputed ball of every state within 5 moves of solved, plus a search of depth <= 4 from the cube.
import { identityCubie, multiply, type CubieCube } from '../core/cubie.ts';
import { MOVE_CUBES, getCornerPerm, getFlip, getTwist, permIndex } from '../solver/coords.ts';

export const BALL_RADIUS = 5;
export const SEARCH_DEPTH = 4;
export const MAX_EXACT = BALL_RADIUS + SEARCH_DEPTH; // 9
const BITS = 21; // 2^21 slots for 621,649 states
const SLOTS = 1 << BITS;

// A cube state as two exact numbers: corners + edge flip (< 2^38), edge permutation (< 2^29).
function keyOf(c: CubieCube): [number, number] {
  return [(getCornerPerm(c) * 2187 + getTwist(c)) * 2048 + getFlip(c), permIndex(c.ep)];
}

function slotOf(a: number, b: number): number {
  const h = Math.imul((a >>> 0) ^ Math.imul(b, 0x9e3779b1) ^ Math.floor(a / 4294967296), 0x85ebca6b);
  return h >>> (32 - BITS);
}

export class Ball {
  private readonly a = new Float64Array(SLOTS);
  private readonly b = new Int32Array(SLOTS);
  private readonly d = new Int8Array(SLOTS).fill(-1);
  size = 0;

  get(a: number, b: number): number {
    for (let i = slotOf(a, b); ; i = (i + 1) & (SLOTS - 1)) {
      if (this.d[i] < 0) return -1;
      if (this.a[i] === a && this.b[i] === b) return this.d[i];
    }
  }

  add(a: number, b: number, depth: number): boolean {
    for (let i = slotOf(a, b); ; i = (i + 1) & (SLOTS - 1)) {
      if (this.d[i] < 0) {
        this.a[i] = a; this.b[i] = b; this.d[i] = depth;
        this.size++;
        return true;
      }
      if (this.a[i] === a && this.b[i] === b) return false;
    }
  }
}

// Breadth-first from solved; only states closer than the radius are expanded.
export function buildBall(): Ball {
  const ball = new Ball();
  let frontier = [identityCubie()];
  ball.add(...keyOf(frontier[0]), 0);
  for (let depth = 0; depth < BALL_RADIUS; depth++) {
    const next: CubieCube[] = [];
    for (const c of frontier) {
      for (const m of MOVE_CUBES) {
        const child = multiply(c, m);
        if (ball.add(...keyOf(child), depth + 1) && depth + 1 < BALL_RADIUS) next.push(child);
      }
    }
    frontier = next;
  }
  return ball;
}

// Same face twice, or opposite faces in the "wrong" order, never shortens a path.
const redundant = (m: number, last: number) => {
  const f = (m / 3) | 0, l = (last / 3) | 0;
  return last >= 0 && (f === l || f === l - 3);
};

// Exact distance if it is at most 9, otherwise null (proved: no solution of 9 moves or fewer).
export function distance(ball: Ball, cube: CubieCube): number | null {
  let best = Infinity;
  const dfs = (c: CubieCube, depth: number, togo: number, last: number) => {
    if (togo === 0) {
      const d = ball.get(...keyOf(c));
      if (d >= 0) best = Math.min(best, depth + d);
      return;
    }
    for (let m = 0; m < 18; m++) {
      if (redundant(m, last)) continue;
      dfs(multiply(c, MOVE_CUBES[m]), depth + 1, togo - 1, m);
    }
  };
  for (let f = 0; f <= SEARCH_DEPTH; f++) {
    dfs(cube, 0, f, -1);
    if (best <= f + 1) break; // a deeper split can only add moves
  }
  return best <= MAX_EXACT ? best : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (16 files, 76 tests). The log shows `ball built in` ~700 ms.

- [ ] **Step 5: Commit**

```bash
git add src/scramble/distance.ts src/scramble/distance.test.ts
git commit -m "feat: measure exact distance up to 9 moves by meet-in-the-middle"
```

---

### Task 4: Puzzle levels

**Files:**
- Create: `src/scramble/levels.ts`
- Test: `src/scramble/levels.test.ts`

**Interfaces:**
- Consumes: `applyMoves`, `invertSequence`, `solved`, `Move`, `State`; `toCubie`, `toFacelets`, `CubieCube`; `mulberry32`; `MOVES` (coords.ts)
- Produces (`src/scramble/levels.ts`):
  - `LEVELS = ['intro','easy','medium','hard','expert','pll','oll','f2l']`; `type Level`
  - `DISTANCE_RANGE` for the walk levels; `interface Puzzle { level; scramble: Move[]; state: State; distance: number | null }`
  - `interface PuzzleDeps { distance(cube): number | null; solve(cube): Move[] }`: injected, so this module stays pure
  - `canonicalWalk(rnd, length): Move[]`; `generatePuzzle(level, seed, deps): Puzzle`

- [ ] **Step 1: Write the failing test**

`src/scramble/levels.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { applyMoves, solved, type State } from '../core/cube.ts';
import { toCubie } from '../core/cubie.ts';
import { solveCubie } from '../solver/kociemba.ts';
import { buildTables } from '../solver/tables.ts';
import { buildBall, distance } from './distance.ts';
import { DISTANCE_RANGE, canonicalWalk, generatePuzzle, type PuzzleDeps } from './levels.ts';
import { mulberry32 } from '../core/prng.ts';

let deps: PuzzleDeps;
beforeAll(() => {
  const tables = buildTables();
  const ball = buildBall();
  deps = { distance: (c) => distance(ball, c), solve: (c) => solveCubie(tables, c) };
}, 60_000);

const center = (s: State, f: number) => s[f * 9 + 4];
const rowOk = (s: State, f: number, row: number) => [0, 1, 2].every((c) => s[f * 9 + row * 3 + c] === center(s, f));
const SIDES = [1, 2, 4, 5];
const f2lSolved = (s: State) => [0, 1, 2].every((r) => rowOk(s, 3, r)) && SIDES.every((f) => rowOk(s, f, 1) && rowOk(s, f, 2));
const crossSolved = (s: State) => [28, 30, 32, 34].every((i) => s[i] === 3) && SIDES.every((f) => s[f * 9 + 7] === center(s, f));

describe('puzzle levels', () => {
  it('walks without trivially cancelling moves', () => {
    const w = canonicalWalk(mulberry32(1), 200);
    for (let i = 1; i < w.length; i++) expect(w[i][0]).not.toBe(w[i - 1][0]);
  });

  it('measures walk levels exactly', () => {
    let seed = 1;
    for (const level of ['intro', 'easy', 'medium'] as const) {
      const [lo, hi] = DISTANCE_RANGE[level];
      for (let n = 0; n < 15; n++) {
        const p = generatePuzzle(level, seed++, deps);
        expect(p.distance).toBeGreaterThanOrEqual(lo);
        expect(p.distance).toBeLessThanOrEqual(hi);
        expect(applyMoves(solved(), p.scramble)).toEqual(p.state);
      }
    }
  }, 60_000);

  it('proves hard puzzles need at least 10 moves', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const p = generatePuzzle('hard', seed, deps);
      expect(p.distance).toBeNull();
      expect(p.scramble.length).toBeGreaterThanOrEqual(10);
      expect(p.scramble.length).toBeLessThanOrEqual(14);
    }
  }, 60_000);

  it('builds legal random-state and training puzzles whose scramble reaches the state', () => {
    for (const level of ['expert', 'pll', 'oll', 'f2l'] as const) {
      for (let seed = 1; seed <= 5; seed++) {
        const p = generatePuzzle(level, seed, deps);
        expect(toCubie(p.state).ok).toBe(true);
        expect(applyMoves(solved(), p.scramble)).toEqual(p.state);
        if (level === 'pll') expect(f2lSolved(p.state) && [0, 1, 2].every((r) => rowOk(p.state, 0, r))).toBe(true);
        if (level === 'oll') expect(f2lSolved(p.state)).toBe(true);
        if (level === 'f2l') expect(crossSolved(p.state)).toBe(true);
      }
    }
  }, 60_000);

  it('is reproducible from its seed', () => {
    expect(generatePuzzle('medium', 42, deps)).toEqual(generatePuzzle('medium', 42, deps));
    expect(generatePuzzle('oll', 42, deps)).toEqual(generatePuzzle('oll', 42, deps));
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/scramble/levels.test.ts`
Expected: FAIL, `Failed to resolve import "./levels.ts"`.

- [ ] **Step 3: Implement src/scramble/levels.ts**

```ts
// Puzzle generation. Every puzzle is either a legal move sequence from solved, or a constructed state
// that satisfies the three invariants and passes the validator; difficulty comes from measured distance.
import { applyMoves, invertSequence, solved, type Move, type State } from '../core/cube.ts';
import { toCubie, toFacelets, type CubieCube } from '../core/cubie.ts';
import { mulberry32 } from '../core/prng.ts';
import { MOVES } from '../solver/coords.ts';

export const LEVELS = ['intro', 'easy', 'medium', 'hard', 'expert', 'pll', 'oll', 'f2l'] as const;
export type Level = (typeof LEVELS)[number];

// exact distance range for walk levels; 'hard' means "proved 10 or more", walked 10..14 moves
export const DISTANCE_RANGE: Record<'intro' | 'easy' | 'medium' | 'hard', [number, number]> = {
  intro: [1, 2], easy: [3, 5], medium: [6, 9], hard: [10, 14],
};

export interface Puzzle {
  level: Level;
  scramble: Move[];
  state: State;
  distance: number | null; // exact for intro..medium, null for hard (>= 10) and constructed states
}

export interface PuzzleDeps {
  distance(cube: CubieCube): number | null; // exact up to 9, else null
  solve(cube: CubieCube): Move[]; // Kociemba
}

const MAX_ATTEMPTS = 500;

// Random face moves with no same-face repeats and opposite faces in a fixed order (no "D U").
export function canonicalWalk(rnd: () => number, length: number): Move[] {
  const out: number[] = [];
  while (out.length < length) {
    const m = Math.floor(rnd() * 18);
    const last = out.length ? out[out.length - 1] : -1;
    const f = (m / 3) | 0, l = (last / 3) | 0;
    if (last >= 0 && (f === l || f === l - 3)) continue;
    out.push(m);
  }
  return out.map((m) => MOVES[m]);
}

const cubieOf = (s: State): CubieCube => {
  const r = toCubie(s);
  if (!r.ok) throw new Error(`invalid puzzle state: ${r.errors.map((e) => e.kind).join(', ')}`);
  return r.cube;
};

function shuffle(rnd: () => number, xs: number[]): number[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const parity = (p: number[]) => {
  let x = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) x ^= 1;
  return x;
};

// Scramble the given positions (pieces stay among them), then repair the three invariants.
function constructed(rnd: () => number, corners: number[], edges: number[], twist: boolean, flip: boolean): CubieCube {
  const c: CubieCube = {
    cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0),
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0),
  };
  shuffle(rnd, corners).forEach((piece, k) => { c.cp[corners[k]] = piece; });
  shuffle(rnd, edges).forEach((piece, k) => { c.ep[edges[k]] = piece; });
  if (twist) for (const i of corners) c.co[i] = Math.floor(rnd() * 3);
  if (flip) for (const i of edges) c.eo[i] = Math.floor(rnd() * 2);
  const [c0, e0, e1] = [corners[0], edges[0], edges[1]];
  c.co[c0] = (c.co[c0] + 3 - (c.co.reduce((a, b) => a + b, 0) % 3)) % 3;
  c.eo[e0] = (c.eo[e0] + c.eo.reduce((a, b) => a + b, 0)) % 2;
  if (parity(c.cp) !== parity(c.ep)) [c.ep[e0], c.ep[e1]] = [c.ep[e1], c.ep[e0]];
  return c;
}

const U_CORNERS = [0, 1, 2, 3];
const U_EDGES = [0, 1, 2, 3];
const ALL_CORNERS = [0, 1, 2, 3, 4, 5, 6, 7];
const NON_CROSS_EDGES = [0, 1, 2, 3, 8, 9, 10, 11]; // D edges 4..7 are the solved cross

export function generatePuzzle(level: Level, seed: number, deps: PuzzleDeps): Puzzle {
  const rnd = mulberry32(seed);
  if (level === 'intro' || level === 'easy' || level === 'medium' || level === 'hard') {
    const [lo, hi] = DISTANCE_RANGE[level];
    for (let n = 0; n < MAX_ATTEMPTS; n++) {
      const scramble = canonicalWalk(rnd, lo + Math.floor(rnd() * (hi - lo + 1)));
      const state = applyMoves(solved(), scramble);
      const d = deps.distance(cubieOf(state));
      const ok = level === 'hard' ? d === null : d !== null && d >= lo && d <= hi;
      if (ok) return { level, scramble, state, distance: d };
    }
    throw new Error(`no ${level} puzzle in ${MAX_ATTEMPTS} attempts`);
  }
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    const cube = level === 'expert' ? constructed(rnd, ALL_CORNERS, [...Array(12).keys()], true, true)
      : level === 'pll' ? constructed(rnd, U_CORNERS, U_EDGES, false, false)
      : level === 'oll' ? constructed(rnd, U_CORNERS, U_EDGES, true, true)
      : constructed(rnd, ALL_CORNERS, NON_CROSS_EDGES, true, true);
    const state = toFacelets(cube);
    cubieOf(state); // validator as an assertion: constructed states must be legal
    const solution = deps.solve(cube);
    if (solution.length === 0) continue; // drew the solved cube; draw again
    return { level, scramble: invertSequence(solution), state, distance: null };
  }
  throw new Error(`no ${level} puzzle in ${MAX_ATTEMPTS} attempts`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (17 files, 81 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scramble/levels.ts src/scramble/levels.test.ts
git commit -m "feat: generate always-solvable puzzles at measured difficulty levels"
```

---

### Task 5: Worker protocol: LBL and puzzles

**Files:**
- Modify (full replacement): `src/solver/protocol.ts`, `src/solver/worker.ts`, `src/solver/client.ts`, `src/solver/client.test.ts`
- Modify: `src/ui/solveTab.ts` (2 lines, keeps it compiling against the new client)

**Interfaces:**
- Produces:
  - `protocol.ts`: `type SolveMethod = 'kociemba' | 'lbl'`; `interface StageMoves { id: LblStageId; moves: string[] }`. Requests are `solve {id, facelets, method}` or `scramble {id, level, seed}`. Responses add `solution.stages?` and `puzzle {id, scramble, distance, ms}`.
  - `client.ts`: `interface SolveResult { moves: Move[]; stages?: StageMoves[] }`; `interface ScrambleResult { scramble: Move[]; distance: number | null }`; `SolverClient.solve(net, method = 'kociemba'): Promise<SolveResult>`; `SolverClient.scramble(level, seed): Promise<ScrambleResult>`
  - The worker builds the ball lazily on the first scramble request.

- [ ] **Step 1: Replace src/solver/client.test.ts (failing test)**

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
    const b = client.solve([2, 3], 'lbl');
    expect(workers[0].sent).toEqual([
      { type: 'solve', id: 1, facelets: [0, 1], method: 'kociemba' },
      { type: 'solve', id: 2, facelets: [2, 3], method: 'lbl' },
    ]);
    workers[0].reply({ type: 'error', id: 2, message: 'Invalid cube: flip' });
    workers[0].reply({ type: 'solution', id: 1, moves: ['R', "U'"], ms: 5 });
    await expect(a).resolves.toEqual({ moves: ['R', "U'"], stages: undefined });
    await expect(b).rejects.toThrow('Invalid cube: flip');
  });

  it('asks the worker for puzzles', async () => {
    const client = createSolverClient(make);
    const p = client.scramble('medium', 42);
    expect(workers[0].sent).toEqual([{ type: 'scramble', id: 1, level: 'medium', seed: 42 }]);
    workers[0].reply({ type: 'puzzle', id: 1, scramble: ['R', 'U2'], distance: 2, ms: 30 });
    await expect(p).resolves.toEqual({ scramble: ['R', 'U2'], distance: 2 });
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
Expected: FAIL. The sent messages lack `method`, `solve` resolves an array instead of `{ moves }`, and `client.scramble` is not a function.

- [ ] **Step 3: Replace src/solver/protocol.ts**

```ts
// Messages between the main thread and the solver worker.
import type { Level } from '../scramble/levels.ts';
import type { LblStageId } from './lbl.ts';

export type SolveMethod = 'kociemba' | 'lbl';
export interface StageMoves { id: LblStageId; moves: string[] }

export type SolverRequest =
  | { type: 'solve'; id: number; facelets: number[]; method: SolveMethod }
  | { type: 'scramble'; id: number; level: Level; seed: number };

export type SolverResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'ready'; fromCache: boolean; ms: number }
  | { type: 'solution'; id: number; moves: string[]; stages?: StageMoves[]; ms: number }
  | { type: 'puzzle'; id: number; scramble: string[]; distance: number | null; ms: number }
  | { type: 'error'; id: number; message: string };
```

- [ ] **Step 4: Replace src/solver/client.ts**

```ts
// Main-thread side of the solver worker: request ids, status, timeout and restart.
import type { Move } from '../core/cube.ts';
import type { Level } from '../scramble/levels.ts';
import type { SolveMethod, SolverRequest, SolverResponse, StageMoves } from './protocol.ts';

export type SolverStatus =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'ready'; fromCache: boolean; ms: number }
  | { kind: 'failed' };

export interface SolveResult { moves: Move[]; stages?: StageMoves[] }
export interface ScrambleResult { scramble: Move[]; distance: number | null }

export interface SolverClient {
  solve(net: ArrayLike<number>, method?: SolveMethod): Promise<SolveResult>;
  scramble(level: Level, seed: number): Promise<ScrambleResult>;
  status(): SolverStatus;
  onStatus(fn: (s: SolverStatus) => void): void;
}

export const SOLVE_TIMEOUT_MS = 10_000;

type Pending = { resolve: (r: SolveResult | ScrambleResult) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
type Body = { type: 'solve'; facelets: number[]; method: SolveMethod } | { type: 'scramble'; level: Level; seed: number };

export function createSolverClient(makeWorker: () => Worker, timeoutMs = SOLVE_TIMEOUT_MS): SolverClient {
  let worker: Worker;
  let status: SolverStatus = { kind: 'loading', done: 0, total: 1 };
  let nextId = 1;
  const pending = new Map<number, Pending>();
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
      else if (msg.type === 'solution') settle(msg.id)?.resolve({ moves: msg.moves, stages: msg.stages });
      else if (msg.type === 'puzzle') settle(msg.id)?.resolve({ scramble: msg.scramble, distance: msg.distance });
      else settle(msg.id)?.reject(new Error(msg.message));
    };
    worker.onerror = () => {
      worker.terminate();
      failAll('crashed');
      setStatus({ kind: 'failed' }); // the next request starts a fresh worker
    };
  }
  start();

  function request<T extends SolveResult | ScrambleResult>(body: Body): Promise<T> {
    if (status.kind === 'failed') start();
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        failAll('timeout');
        start();
      }, timeoutMs);
      pending.set(id, { resolve: resolve as Pending['resolve'], reject, timer });
      worker.postMessage({ ...body, id } as SolverRequest);
    });
  }

  return {
    solve: (net, method = 'kociemba') => request<SolveResult>({ type: 'solve', facelets: Array.from(net), method }),
    scramble: (level, seed) => request<ScrambleResult>({ type: 'scramble', level, seed }),
    status: () => status,
    onStatus(fn) { listeners.add(fn); },
  };
}
```

- [ ] **Step 5: Replace src/solver/worker.ts**

```ts
// Solver worker: builds (or loads cached) Kociemba tables once, then answers solve and scramble requests.
import { normalize, toCubie } from '../core/cubie.ts';
import { buildBall, distance, type Ball } from '../scramble/distance.ts';
import { generatePuzzle } from '../scramble/levels.ts';
import { solveCubie, solveFacelets } from './kociemba.ts';
import { solveLbl } from './lbl.ts';
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

let ball: Ball | null = null; // built on the first scramble request (~0.7 s, ~27 MB)

self.onmessage = async (e: MessageEvent<SolverRequest>) => {
  const req = e.data;
  try {
    const tables = await ready;
    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0);
    if (req.type === 'solve') {
      if (req.method === 'lbl') {
        const check = toCubie(normalize(req.facelets));
        if (!check.ok) throw new Error(`Invalid cube: ${check.errors.map((x) => x.kind).join(', ')}`);
        const stages = solveLbl(Uint8Array.from(req.facelets));
        post({ type: 'solution', id: req.id, moves: stages.flatMap((s) => s.moves), stages, ms: ms() });
      } else {
        post({ type: 'solution', id: req.id, moves: solveFacelets(tables, req.facelets), ms: ms() });
      }
    } else {
      ball ??= buildBall();
      const b = ball;
      const p = generatePuzzle(req.level, req.seed, { distance: (c) => distance(b, c), solve: (c) => solveCubie(tables, c) });
      post({ type: 'puzzle', id: req.id, scramble: p.scramble, distance: p.distance, ms: ms() });
    }
  } catch (err) {
    post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
```

- [ ] **Step 6: Keep the Solve tab compiling**

In `src/ui/solveTab.ts`, inside the solve click handler, change:
```ts
      const moves = await solver.solve(cells);
      playback.load(Uint8Array.from(cells), moves);
```
to:
```ts
      const { moves } = await solver.solve(cells);
      playback.load(Uint8Array.from(cells), moves);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (17 files, 82 tests).

- [ ] **Step 8: Commit**

```bash
git add src/solver/protocol.ts src/solver/worker.ts src/solver/client.ts src/solver/client.test.ts src/ui/solveTab.ts
git commit -m "feat: serve LBL solutions and puzzles from the solver worker"
```

---

### Task 6: Attempt session (clock and move counter)

**Files:**
- Create: `src/ui/session.ts`
- Test: `src/ui/session.test.ts`

**Interfaces:**
- Consumes: `applyMoves`, `isSolved`, `solved`, `Move` (cube.ts); `Level` (levels.ts); `Store`
- Produces (`src/ui/session.ts`):
  - `interface Attempt { level: Level; scramble: Move[]; distance: number | null }`
  - `interface SessionState { attempt; moves; startedAt; endedAt; active }`
  - `createSession(store, now = performance.now): Session` with `state`, `start(attempt)` (puts the scrambled state into the store), `elapsed(): number`, `onChange(fn)`
  - `formatTime(ms): string` → `mm:ss.t`
- Rules:
  - The clock starts when the first move after the scramble finishes, and stops when the cube is solved.
  - Every move counts, including undo and playback moves.
  - A `setState` by anything else (Reset, the Solve tab) abandons the attempt.

- [ ] **Step 1: Write the failing test**

`src/ui/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyMoves, solved } from '../core/cube.ts';
import { createStore } from '../store.ts';
import { createSession, formatTime } from './session.ts';

function setup() {
  let clock = 1000;
  const store = createStore(() => 0);
  const session = createSession(store, () => clock);
  const tick = (ms: number) => { clock += ms; };
  return { store, session, tick };
}

describe('session', () => {
  it('loads the scramble, starts on the first move and stops when solved', () => {
    const { store, session, tick } = setup();
    session.start({ level: 'intro', scramble: ['R', 'U'], distance: 2 });
    expect(store.state).toEqual(applyMoves(solved(), 'R U'));
    tick(5000);
    expect(session.elapsed()).toBe(0); // not started yet
    store.enqueue("U'");
    store.frame(0);
    tick(2500);
    expect(session.elapsed()).toBe(2500);
    store.enqueue("R'");
    store.frame(0);
    expect(session.state).toMatchObject({ moves: 2, active: false, startedAt: 6000, endedAt: 8500 });
    tick(9000);
    expect(session.elapsed()).toBe(2500);
  });

  it('counts every move, including detours', () => {
    const { store, session } = setup();
    session.start({ level: 'easy', scramble: ['F'], distance: 1 });
    for (const m of ['U', "U'", "F'"]) store.enqueue(m);
    store.frame(0);
    expect(session.state).toMatchObject({ moves: 3, active: false });
  });

  it('is abandoned when another tool replaces the cube', () => {
    const { store, session } = setup();
    session.start({ level: 'easy', scramble: ['F'], distance: 1 });
    store.setState(solved());
    expect(session.state.active).toBe(false);
    expect(session.state.endedAt).toBeNull();
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(83_456)).toBe('01:23.4');
    expect(formatTime(42_349)).toBe('00:42.3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/session.test.ts`
Expected: FAIL, `Failed to resolve import "./session.ts"`.

- [ ] **Step 3: Implement src/ui/session.ts**

```ts
// One puzzle attempt: the clock starts at the first move after the scramble and stops when solved.
import { applyMoves, isSolved, solved, type Move } from '../core/cube.ts';
import type { Level } from '../scramble/levels.ts';
import type { Store } from '../store.ts';

export interface Attempt { level: Level; scramble: Move[]; distance: number | null }
export interface SessionState {
  attempt: Attempt | null;
  moves: number;
  startedAt: number | null;
  endedAt: number | null;
  active: boolean; // false once solved or abandoned (the cube was replaced)
}

export interface Session {
  readonly state: SessionState;
  start(a: Attempt): void;
  elapsed(): number; // ms
  onChange(fn: (s: SessionState) => void): void;
}

export function createSession(store: Store, now: () => number = () => performance.now()): Session {
  let st: SessionState = { attempt: null, moves: 0, startedAt: null, endedAt: null, active: false };
  let loading = false;
  const listeners = new Set<(s: SessionState) => void>();
  const emit = () => listeners.forEach((fn) => fn({ ...st }));

  store.subscribe((state, move) => {
    if (!st.active) return;
    if (move === null) {
      if (!loading) { st.active = false; emit(); } // another tool replaced the cube
      return;
    }
    st.startedAt ??= now();
    st.moves++;
    if (isSolved(state)) { st.endedAt = now(); st.active = false; }
    emit();
  });

  return {
    get state() { return { ...st }; },
    start(a) {
      st = { attempt: a, moves: 0, startedAt: null, endedAt: null, active: true };
      loading = true;
      store.setState(applyMoves(solved(), a.scramble));
      loading = false;
      emit();
    },
    elapsed: () => (st.startedAt === null ? 0 : (st.endedAt ?? now()) - st.startedAt),
    onChange(fn) { listeners.add(fn); },
  };
}

// 83456 ms -> "01:23.4"
export function formatTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const m = Math.floor(tenths / 600), s = Math.floor(tenths / 10) % 60, t = tenths % 10;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS (18 files, 86 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/session.ts src/ui/session.test.ts
git commit -m "feat: time puzzle attempts and count moves"
```

---

### Task 7: The "Ra đề" tab and LBL mode in the "Giải" tab

**Files:**
- Create: `src/ui/puzzleTab.ts`
- Modify (full replacement): `src/ui/solveTab.ts`, `src/main.ts`
- Modify: `src/ui/app.css` (insert a block, adjust the reduced-motion rule), `src/ui/i18n/vi.json`, `src/ui/i18n/en.json`, `CLAUDE.md`
- Test: `src/ui/i18n.test.ts` (key parity) + browser verification

**Interfaces:**
- Consumes: `SolverClient` (`scramble`, `solve(net, method)`), `SolveMethod`, `StageMoves`; `Session`, `SessionState`, `formatTime`; `Level`; `load`, `save`; `t`, `Key`, `onLangChange`
- Produces:
  - `createPuzzleTab({ solver, session }): HTMLElement`. The level choice is remembered under storage key `level` (default `medium`).
  - The Solve tab gets a method radio group (`Ngắn nhất` / `Từng tầng`). An LBL solution renders as stage groups (title · count, hint, chips) in a scrollable list; the current stage is highlighted and the current chip is scrolled into view.
  - Tab order: `puzzle`, `solve`.

- [ ] **Step 1: Add the i18n keys**

Merge into `src/ui/i18n/vi.json`:
```json
{
  "tab.puzzle": "Ra đề",
  "puzzle.levels": "Cấp độ (khoảng cách thật tới đích)",
  "level.intro": "Làm quen",
  "level.easy": "Dễ",
  "level.medium": "Trung bình",
  "level.hard": "Khó",
  "level.expert": "Chuyên gia",
  "level.pll": "PLL",
  "level.oll": "OLL+PLL",
  "level.f2l": "F2L+LL",
  "puzzle.training": "Luyện giai đoạn",
  "puzzle.trainingHint": "Đề luyện giữ nguyên phần đã xong; tầng trên (trắng) là tầng cuối.",
  "puzzle.create": "Tạo đề",
  "puzzle.creating": "Đang tạo đề…",
  "puzzle.failed": "Không tạo được đề. Bấm Tạo đề để thử lại.",
  "puzzle.current": "Đề hiện tại",
  "puzzle.empty": "Chọn cấp độ rồi bấm Tạo đề. Đồng hồ chạy từ nước đầu tiên.",
  "puzzle.distance": "Cách đích đúng {n} nước",
  "puzzle.atLeast10": "Cần ít nhất 10 nước (đã chứng minh)",
  "puzzle.randomState": "Trạng thái ngẫu nhiên như đề WCA",
  "puzzle.trainingState": "Đề luyện {name}",
  "puzzle.time": "Thời gian",
  "puzzle.moves": "Số nước",
  "puzzle.solved": "Đã giải sau {time} · {n} nước",
  "puzzle.abandoned": "Khối đã bị thay bằng công cụ khác. Tạo đề mới để tính giờ lại.",
  "solve.method": "Cách giải",
  "solve.kociemba": "Ngắn nhất",
  "solve.lbl": "Từng tầng",
  "lbl.cross": "1. Chữ thập trắng",
  "lbl.cross.hint": "Đưa mặt trắng xuống dưới, ghép 4 cạnh trắng sao cho màu bên khớp với tâm.",
  "lbl.corners": "2. Góc tầng 1",
  "lbl.corners.hint": "Đưa từng góc trắng lên trên chỗ của nó rồi lặp R U R' U' tới khi vào đúng.",
  "lbl.middle": "3. Cạnh tầng 2",
  "lbl.middle.hint": "Khớp cạnh với tâm phía trước rồi chèn sang phải (U R U' R' U' F' U F) hoặc sang trái.",
  "lbl.topCross": "4. Chữ thập vàng",
  "lbl.topCross.hint": "F R U R' U' F' biến chấm thành chữ L, chữ L thành đường thẳng, đường thẳng thành chữ thập.",
  "lbl.topEdges": "5. Xếp cạnh vàng",
  "lbl.topEdges.hint": "R U R' U R U2 R' U đổi chỗ các cạnh tới khi cả 4 khớp tâm.",
  "lbl.cornerPlace": "6. Đặt vị trí góc vàng",
  "lbl.cornerPlace.hint": "Giữ một góc đã đúng chỗ ở trước-phải rồi dùng U R U' L' U R' U' L.",
  "lbl.cornerTwist": "7. Xoay góc vàng",
  "lbl.cornerTwist.hint": "Lặp R' D' R D cho từng góc tới khi màu vàng hướng lên, xoay U sang góc kế tiếp."
}
```

Merge into `src/ui/i18n/en.json`:
```json
{
  "tab.puzzle": "Puzzle",
  "puzzle.levels": "Level (true distance to solved)",
  "level.intro": "Warm-up",
  "level.easy": "Easy",
  "level.medium": "Medium",
  "level.hard": "Hard",
  "level.expert": "Expert",
  "level.pll": "PLL",
  "level.oll": "OLL+PLL",
  "level.f2l": "F2L+LL",
  "puzzle.training": "Stage training",
  "puzzle.trainingHint": "Training puzzles keep the finished part; the top (white) layer is the last layer.",
  "puzzle.create": "New puzzle",
  "puzzle.creating": "Making a puzzle…",
  "puzzle.failed": "Couldn't make a puzzle. Press New puzzle to try again.",
  "puzzle.current": "Current puzzle",
  "puzzle.empty": "Pick a level and press New puzzle. The clock starts at your first move.",
  "puzzle.distance": "Exactly {n} moves from solved",
  "puzzle.atLeast10": "Needs at least 10 moves (proved)",
  "puzzle.randomState": "Random state, like a WCA scramble",
  "puzzle.trainingState": "{name} training",
  "puzzle.time": "Time",
  "puzzle.moves": "Moves",
  "puzzle.solved": "Solved in {time} · {n} moves",
  "puzzle.abandoned": "Another tool replaced the cube. Make a new puzzle to time again.",
  "solve.method": "Method",
  "solve.kociemba": "Shortest",
  "solve.lbl": "Layer by layer",
  "lbl.cross": "1. White cross",
  "lbl.cross.hint": "Turn white to the bottom and place the 4 white edges so their side colors match the centers.",
  "lbl.corners": "2. First-layer corners",
  "lbl.corners.hint": "Bring each white corner above its slot, then repeat R U R' U' until it drops in.",
  "lbl.middle": "3. Middle-layer edges",
  "lbl.middle.hint": "Match the edge with the front center, then insert it right (U R U' R' U' F' U F) or left.",
  "lbl.topCross": "4. Yellow cross",
  "lbl.topCross.hint": "F R U R' U' F' turns a dot into an L, an L into a line, and a line into the cross.",
  "lbl.topEdges": "5. Yellow edges",
  "lbl.topEdges.hint": "R U R' U R U2 R' U swaps edges until all 4 match their centers.",
  "lbl.cornerPlace": "6. Place yellow corners",
  "lbl.cornerPlace.hint": "Keep a correctly placed corner at front-right and use U R U' L' U R' U' L.",
  "lbl.cornerTwist": "7. Twist yellow corners",
  "lbl.cornerTwist.hint": "Repeat R' D' R D on each corner until yellow faces up, then turn U to the next corner."
}
```

Run: `npm test -- src/ui/i18n.test.ts`
Expected: PASS.

- [ ] **Step 2: Create src/ui/puzzleTab.ts**

```ts
// Tab "Ra đề": pick a level, get a solvable puzzle from the worker, time the attempt.
import type { Level } from '../scramble/levels.ts';
import type { SolverClient } from '../solver/client.ts';
import { onLangChange, t, type Key } from './i18n.ts';
import { formatTime, type Session, type SessionState } from './session.ts';
import { load, save } from './storage.ts';

export interface PuzzleTabDeps { solver: SolverClient; session: Session }

const WALK_LEVELS: [Level, string][] = [['intro', '1–2'], ['easy', '3–5'], ['medium', '6–9'], ['hard', '10+'], ['expert', 'WCA']];
const TRAINING: Level[] = ['pll', 'oll', 'f2l'];
const ALL = [...WALK_LEVELS.map(([l]) => l), ...TRAINING];

// UI code may use the platform RNG; core/solver/scramble only see the seed.
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export function createPuzzleTab({ solver, session }: PuzzleTabDeps): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <p class="lbl" data-i18n="puzzle.levels"></p>
    <div class="rows" role="radiogroup" data-i18n-aria="puzzle.levels">
      ${WALK_LEVELS.map(([l, range]) => `<button type="button" class="row" role="radio" data-level="${l}"><span data-i18n="level.${l}"></span><span class="mono range">${range}</span></button>`).join('')}
    </div>
    <p class="lbl" data-i18n="puzzle.training"></p>
    <div class="seg" role="radiogroup" data-i18n-aria="puzzle.training">
      ${TRAINING.map((l) => `<button type="button" class="btn" role="radio" data-level="${l}" data-i18n="level.${l}"></button>`).join('')}
    </div>
    <p class="hint" data-i18n="puzzle.trainingHint"></p>
    <button type="button" class="cta" data-act="create" data-i18n="puzzle.create"></button>
    <p class="hint puzzle-status" aria-live="polite"></p>
    <p class="lbl" data-i18n="puzzle.current"></p>
    <div class="scramble mono"></div>
    <p class="hint distance"></p>
    <div class="stats">
      <div class="stat"><span data-i18n="puzzle.time"></span><span class="mono time">00:00.0</span></div>
      <div class="stat"><span data-i18n="puzzle.moves"></span><span class="mono count">0</span></div>
    </div>
    <p class="alert success solved" role="status" hidden></p>
    <p class="alert warning abandoned" hidden data-i18n="puzzle.abandoned"></p>`;

  const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const status = q('.puzzle-status');
  const pickers = [...panel.querySelectorAll<HTMLButtonElement>('[data-level]')];
  const saved = load('level') as Level | null;
  let level: Level = saved && ALL.includes(saved) ? saved : 'medium';
  let timer: ReturnType<typeof setInterval> | undefined;

  const showPick = () => pickers.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === level)));
  pickers.forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level as Level;
    save('level', level);
    showPick();
  }));
  showPick();

  const distanceText = (s: SessionState) => {
    const a = s.attempt;
    if (!a) return t('puzzle.empty');
    if (a.distance !== null) return t('puzzle.distance', { n: a.distance });
    if (a.level === 'hard') return t('puzzle.atLeast10');
    if (a.level === 'expert') return t('puzzle.randomState');
    return t('puzzle.trainingState', { name: t(`level.${a.level}` as Key) });
  };

  const render = (s: SessionState) => {
    q('.scramble').textContent = s.attempt ? s.attempt.scramble.join(' ') : '—';
    q('.distance').textContent = distanceText(s);
    q('.time').textContent = formatTime(session.elapsed());
    q('.count').textContent = String(s.moves);
    const solved = s.endedAt !== null;
    q('.solved').hidden = !solved;
    if (solved) q('.solved').textContent = t('puzzle.solved', { time: formatTime(session.elapsed()), n: s.moves });
    q('.abandoned').hidden = !(s.attempt && !s.active && !solved);
    const running = s.active && s.startedAt !== null;
    if (running && timer === undefined) timer = setInterval(() => { q('.time').textContent = formatTime(session.elapsed()); }, 100);
    if (!running && timer !== undefined) { clearInterval(timer); timer = undefined; }
  };
  session.onChange(render);
  onLangChange(() => render(session.state));
  render(session.state);

  q('[data-act="create"]').addEventListener('click', async () => {
    status.textContent = t('puzzle.creating');
    try {
      const r = await solver.scramble(level, newSeed());
      session.start({ level, scramble: r.scramble, distance: r.distance });
      status.textContent = '';
    } catch {
      status.textContent = t('puzzle.failed');
    }
  });

  return panel;
}
```

- [ ] **Step 3: Replace src/ui/solveTab.ts**

```ts
// Tab "Giải": paint a cube, validate it, solve it in the worker, then step through the solution.
import { toCubie, type ValidationError } from '../core/cubie.ts';
import type { SolverClient, SolverStatus } from '../solver/client.ts';
import type { SolveMethod, StageMoves } from '../solver/protocol.ts';
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
    <p class="lbl" data-i18n="solve.method"></p>
    <div class="seg" role="radiogroup" data-i18n-aria="solve.method">
      <button type="button" class="btn" role="radio" data-method="kociemba" data-i18n="solve.kociemba"></button>
      <button type="button" class="btn" role="radio" data-method="lbl" data-i18n="solve.lbl"></button>
    </div>
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
  const methodBtns = [...panel.querySelectorAll<HTMLButtonElement>('[data-method]')];
  let method: SolveMethod = 'kociemba';
  let stages: StageMoves[] | null = null; // LBL groups for the loaded solution
  const showMethod = () => methodBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.method === method)));
  methodBtns.forEach((b) => b.addEventListener('click', () => { method = b.dataset.method as SolveMethod; showMethod(); }));
  showMethod();

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
    steps.classList.toggle('grouped', !!stages);
    const chip = (m: string, i: number) => {
      const el = document.createElement('span');
      el.className = `step${i < s.index - 1 ? ' done' : ''}${i === s.index - 1 ? ' on' : ''}`;
      el.textContent = m;
      return el;
    };
    if (!stages) s.moves.forEach((m, i) => steps.append(chip(m, i)));
    let offset = 0;
    for (const st of stages ?? []) {
      if (!st.moves.length) continue;
      const box = document.createElement('div');
      const current = s.index - 1 >= offset && s.index - 1 < offset + st.moves.length;
      box.className = `stage${current ? ' current' : ''}`;
      box.innerHTML = `<p class="stage-title"><span></span> · <span class="mono"></span></p><p class="hint"></p><div class="stage-steps"></div>`;
      box.querySelector('.stage-title span')!.textContent = t(`lbl.${st.id}` as Key);
      box.querySelector('.stage-title .mono')!.textContent = String(st.moves.length);
      box.querySelector('.hint')!.textContent = t(`lbl.${st.id}.hint` as Key);
      const row = box.querySelector('.stage-steps')!;
      st.moves.forEach((m, j) => row.append(chip(m, offset + j)));
      steps.append(box);
      offset += st.moves.length;
    }
    steps.querySelector('.step.on')?.scrollIntoView({ block: 'nearest' });
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
      const result = await solver.solve(cells, method);
      stages = result.stages ?? null;
      playback.load(Uint8Array.from(cells), result.moves);
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

- [ ] **Step 4: Update src/ui/app.css**

Insert directly above the `@media (prefers-reduced-motion: reduce) {` block:
```css
.rows { display: flex; flex-direction: column; gap: 2px; }
.row {
  display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border: 0;
  border-radius: var(--radius); background: transparent; color: var(--body); cursor: pointer; text-align: left;
}
.row:hover { background: var(--elevated); }
.row[aria-checked='true'] { background: var(--selected); color: var(--ink); }
.row .range { color: var(--mute); font-size: 11px; }
.seg { display: flex; gap: 4px; }
.seg .btn { flex: 1; }
.seg .btn[aria-checked='true'] { background: var(--selected); border-color: var(--ring); }
.scramble {
  padding: 8px; background: var(--canvas); border: 1px solid var(--hairline); border-radius: var(--radius);
  color: var(--ink); font-size: 12px; word-spacing: 2px;
}
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.stat { display: flex; flex-direction: column; padding: 6px 8px; background: var(--canvas); border-radius: var(--radius); color: var(--mute); font-size: 11px; }
.stat .mono { color: var(--ink); font-size: 15px; }
.alert.success { color: var(--success); background: color-mix(in srgb, var(--success) 12%, transparent); animation: pop 220ms var(--ease); }
@keyframes pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
.steps.grouped { display: block; max-height: 40vh; overflow-y: auto; }
.stage { padding: 6px 0; border-top: 1px solid var(--hairline); }
.stage:first-child { border-top: 0; }
.stage-title { margin: 0; color: var(--body); font-size: 12px; font-weight: 500; }
.stage.current .stage-title { color: var(--ink); }
.stage .hint { margin: 2px 0 6px; }
.stage-steps { display: flex; flex-wrap: wrap; gap: 4px; }
```
Then, inside the reduced-motion block, change `* { transition: none !important; }` to:
```css
  * { transition: none !important; animation: none !important; }
```

- [ ] **Step 5: Replace src/main.ts**

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
import { createPuzzleTab } from './ui/puzzleTab.ts';
import { createSession } from './ui/session.ts';
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
const session = createSession(store);
mountTabs($('#side'), [
  { id: 'puzzle', label: 'tab.puzzle', panel: createPuzzleTab({ solver, session }) },
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

- [ ] **Step 6: Update the map in CLAUDE.md**

In `## Map`, replace the `src/solver/` line and add a `src/scramble/` line after it:
```markdown
- `src/solver/`: Kociemba two-phase (`coords.ts`, `tables.ts`, `kociemba.ts`) and Layer-by-Layer (`lbl.ts`), all pure and tested; `worker.ts` (IndexedDB cache, puzzles) + `client.ts` (timeout/restart) + `protocol.ts`
- `src/scramble/`: `distance.ts` (exact distance <= 9, meet-in-the-middle), `levels.ts` (seeded, always-solvable puzzles)
```
and append to the `src/ui/` line: `, puzzleTab.ts + session.ts`.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, open it in Edge.

Expected:
- **Tabs:** "Ra đề" then "Giải". The last tab and the last level are remembered after a reload.
- **Ra đề, measured levels:**
  - Default level "Trung bình"; "Tạo đề" shows a 6–9 move scramble with "Cách đích đúng N nước". The cube and the rings jump to the scrambled state.
  - "Khó" shows 10–14 moves with "Cần ít nhất 10 nước (đã chứng minh)".
  - "Chuyên gia" shows about 20 moves with "Trạng thái ngẫu nhiên như đề WCA".
- **Ra đề, training:** PLL / OLL+PLL / F2L+LL show "Đề luyện …". For PLL the bottom two layers and the white top face are already solved.
- **Clock and counter:**
  - The time stays `00:00.0` until the first move, then runs.
  - Each move increments "Số nước".
  - Solving the cube (e.g. on an "Làm quen" puzzle, type the scramble's inverse; Ctrl+Z cannot undo the scramble because loading a puzzle clears history) stops the clock and shows the green "Đã giải sau … · N nước" with a short pop.
  - Pressing "Đặt lại" during an attempt shows the orange "abandoned" note.
- **Giải, Từng tầng:**
  - After a scramble, choose "Từng tầng", then "Lấy từ khối hiện tại", then "Giải".
  - The steps appear grouped under "1. Chữ thập trắng", "2. Góc tầng 1"… each with its hint. Empty stages are skipped. The total is about 120–200 moves.
  - Play: the first move is the whole-cube turn that puts white on the bottom. The current stage title brightens and the current chip scrolls into view. The cube ends solved.
- **Giải, Ngắn nhất:** "Ngắn nhất" still gives a flat list of ≤ 21 moves.

- [ ] **Step 8: Run the suite and commit**

Run: `npm test && npm run typecheck`
Expected: PASS (18 files, 86 tests).

```bash
git add src/ui/puzzleTab.ts src/ui/solveTab.ts src/main.ts src/ui/app.css src/ui/i18n/vi.json src/ui/i18n/en.json CLAUDE.md
git commit -m "feat: add puzzle tab with levels and timer, and LBL mode in the Solve tab"
```

---

### Task 8: Single-file release check

**Files:**
- Modify: none, unless a check fails

- [ ] **Step 1: Build and check**

Run:
```bash
npm run build
grep -Eo '(src|href)="https?://' dist/index.html | wc -l
wc -c < dist/index.html
```
Expected: `0` external references; about 815 kB (below `1258291`).

- [ ] **Step 2: Manual checklist from file://**

Double-click `dist/index.html` in Edge and in Chrome:
- [ ] "Tạo đề" works at every level; the first puzzle takes under about 1.5 s (tables + ball), later ones are near-instant.
- [ ] LBL and Kociemba solutions both play to a solved cube.
- [ ] With `prefers-reduced-motion: reduce` (DevTools > Rendering), moves are instant and the "Đã giải" message appears without the pop.
- [ ] Console has no errors.

- [ ] **Step 3: Commit if anything changed**

```bash
git add -A
git commit -m "fix: address plan 3 release check findings"
```
(Skip if nothing changed.)
