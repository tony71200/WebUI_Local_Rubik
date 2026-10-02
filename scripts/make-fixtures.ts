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
