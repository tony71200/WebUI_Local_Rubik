// Main-thread side of the solver worker: request ids, status, timeout and restart.
import type { Move } from '../core/cube.ts';
import type { SolverResponse } from './protocol.ts';

export type SolverStatus =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'ready'; fromCache: boolean; ms: number }
  | { kind: 'failed' };

export interface SolverClient {
  solve(net: ArrayLike<number>): Promise<Move[]>;
  status(): SolverStatus;
  onStatus(fn: (s: SolverStatus) => void): void;
}

export const SOLVE_TIMEOUT_MS = 10_000;

export function createSolverClient(makeWorker: () => Worker, timeoutMs = SOLVE_TIMEOUT_MS): SolverClient {
  let worker: Worker;
  let status: SolverStatus = { kind: 'loading', done: 0, total: 1 };
  let nextId = 1;
  const pending = new Map<number, { resolve: (m: Move[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<(s: SolverStatus) => void>();

  const setStatus = (s: SolverStatus) => {
    status = s;
    listeners.forEach((fn) => fn(s));
  };
  const settle = (id: number) => {
    const p = pending.get(id);
    if (p) { clearTimeout(p.timer); pending.delete(id); }
    return p;
  };
  const failAll = (reason: string) => [...pending.keys()].forEach((id) => settle(id)?.reject(new Error(reason)));

  function start() {
    worker = makeWorker();
    setStatus({ kind: 'loading', done: 0, total: 1 });
    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') setStatus({ kind: 'loading', done: msg.done, total: msg.total });
      else if (msg.type === 'ready') setStatus({ kind: 'ready', fromCache: msg.fromCache, ms: msg.ms });
      else if (msg.type === 'solution') settle(msg.id)?.resolve(msg.moves);
      else settle(msg.id)?.reject(new Error(msg.message));
    };
    worker.onerror = () => {
      worker.terminate();
      failAll('crashed');
      setStatus({ kind: 'failed' }); // the next solve() starts a fresh worker
    };
  }
  start();

  return {
    solve(net) {
      if (status.kind === 'failed') start();
      const id = nextId++;
      return new Promise<Move[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          failAll('timeout');
          start();
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ type: 'solve', id, facelets: Array.from(net) });
      });
    },
    status: () => status,
    onStatus(fn) { listeners.add(fn); },
  };
}
