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
