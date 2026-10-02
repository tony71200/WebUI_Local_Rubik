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
