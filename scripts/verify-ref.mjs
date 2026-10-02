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
  { name: 'python', run: [python, ['reference/python/rubik.py']] },
  { name: 'java', run: ['java', ['reference/java/Rubik.java']] },
  {
    name: 'csharp',
    build: ['dotnet', ['build', 'reference/csharp/Rubik.csproj', '-c', 'Release', '-o', '.ref-build/csharp', '--nologo', '-v', 'q']],
    run: ['dotnet', ['.ref-build/csharp/Rubik.dll']],
  },
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
