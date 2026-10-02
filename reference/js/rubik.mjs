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
