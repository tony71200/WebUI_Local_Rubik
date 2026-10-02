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
