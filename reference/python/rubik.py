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
