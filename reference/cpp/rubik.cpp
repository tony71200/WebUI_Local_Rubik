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
