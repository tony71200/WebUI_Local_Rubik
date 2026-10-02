import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSolverClient, type SolverStatus } from './client.ts';
import type { SolverRequest, SolverResponse } from './protocol.ts';

class FakeWorker {
  onmessage: ((e: MessageEvent<SolverResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: SolverRequest[] = [];
  terminated = false;
  postMessage(msg: SolverRequest) { this.sent.push(msg); }
  terminate() { this.terminated = true; }
  reply(msg: SolverResponse) { this.onmessage?.({ data: msg } as MessageEvent<SolverResponse>); }
}

let workers: FakeWorker[];
const make = () => {
  const w = new FakeWorker();
  workers.push(w);
  return w as unknown as Worker;
};

beforeEach(() => { workers = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('solver client', () => {
  it('reports loading progress then ready', () => {
    const client = createSolverClient(make);
    const seen: SolverStatus[] = [];
    client.onStatus((s) => seen.push(s));
    workers[0].reply({ type: 'progress', done: 3, total: 10 });
    workers[0].reply({ type: 'ready', fromCache: true, ms: 120 });
    expect(seen).toEqual([{ kind: 'loading', done: 3, total: 10 }, { kind: 'ready', fromCache: true, ms: 120 }]);
    expect(client.status()).toEqual({ kind: 'ready', fromCache: true, ms: 120 });
  });

  it('resolves and rejects by request id', async () => {
    const client = createSolverClient(make);
    const a = client.solve([0, 1]);
    const b = client.solve([2, 3], 'lbl');
    expect(workers[0].sent).toEqual([
      { type: 'solve', id: 1, facelets: [0, 1], method: 'kociemba' },
      { type: 'solve', id: 2, facelets: [2, 3], method: 'lbl' },
    ]);
    workers[0].reply({ type: 'error', id: 2, message: 'Invalid cube: flip' });
    workers[0].reply({ type: 'solution', id: 1, moves: ['R', "U'"], ms: 5 });
    await expect(a).resolves.toEqual({ moves: ['R', "U'"], stages: undefined });
    await expect(b).rejects.toThrow('Invalid cube: flip');
  });

  it('asks the worker for puzzles', async () => {
    const client = createSolverClient(make);
    const p = client.scramble('medium', 42);
    expect(workers[0].sent).toEqual([{ type: 'scramble', id: 1, level: 'medium', seed: 42 }]);
    workers[0].reply({ type: 'puzzle', id: 1, scramble: ['R', 'U2'], distance: 2, ms: 30 });
    await expect(p).resolves.toEqual({ scramble: ['R', 'U2'], distance: 2 });
  });

  it('times out, terminates the worker and starts a new one', async () => {
    const client = createSolverClient(make, 1000);
    const p = client.solve([0]);
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toThrow('timeout');
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('restarts after a crash on the next solve', async () => {
    const client = createSolverClient(make);
    const p = client.solve([0]);
    workers[0].onerror?.();
    await expect(p).rejects.toThrow('crashed');
    expect(client.status()).toEqual({ kind: 'failed' });
    void client.solve([0]).catch(() => {});
    expect(workers).toHaveLength(2);
    expect(workers[1].sent).toHaveLength(1);
  });
});
