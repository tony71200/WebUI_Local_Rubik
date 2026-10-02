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
