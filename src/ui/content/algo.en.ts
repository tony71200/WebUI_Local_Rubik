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
