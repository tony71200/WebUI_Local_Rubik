// Solver worker: builds (or loads cached) Kociemba tables once, then answers solve requests.
import { solveFacelets } from './kociemba.ts';
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

self.onmessage = async (e: MessageEvent<SolverRequest>) => {
  const { id, facelets } = e.data;
  try {
    const tables = await ready;
    const t0 = performance.now();
    const moves = solveFacelets(tables, facelets);
    post({ type: 'solution', id, moves, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
