// Single source of truth: cube state + move queue + one animation clock shared by every view.
import { applyMove, inverseMove, solved, type Move, type State } from './core/cube.ts';

export interface Anim { id: number; move: Move; t: number } // t = linear progress in [0, 1)
export type Listener = (state: State, move: Move | null) => void;
type Kind = 'do' | 'undo' | 'redo';

export const MAX_QUEUE = 50;

export interface Store {
  readonly state: State;
  enqueue(move: Move): void;
  undo(): void;
  redo(): void;
  setState(s: State): void;
  frame(now: number): Anim | null;
  busy(): boolean;
  subscribe(fn: Listener): () => void;
}

export function createStore(durationMs: (m: Move) => number): Store {
  let state = solved();
  let queue: { move: Move; kind: Kind }[] = [];
  let active: { id: number; move: Move; kind: Kind; start: number; dur: number } | null = null;
  let nextId = 1;
  const history: Move[] = [];
  const future: Move[] = [];
  const listeners = new Set<Listener>();
  const emit = (move: Move | null) => listeners.forEach((fn) => fn(state, move));

  const push = (move: Move, kind: Kind) => {
    if (queue.length < MAX_QUEUE) queue.push({ move, kind });
  };

  const finish = (move: Move, kind: Kind) => {
    state = applyMove(state, move);
    if (kind === 'do') { history.push(move); future.length = 0; }
    if (kind === 'redo') history.push(move);
    emit(move);
  };

  return {
    get state() { return state; },
    enqueue(move) { push(move, 'do'); },
    undo() {
      const last = history.pop();
      if (last === undefined) return;
      future.push(last);
      push(inverseMove(last), 'undo');
    },
    redo() {
      const next = future.pop();
      if (next !== undefined) push(next, 'redo');
    },
    setState(s) {
      state = Uint8Array.from(s);
      queue = [];
      active = null;
      history.length = 0;
      future.length = 0;
      emit(null);
    },
    frame(now) {
      for (;;) {
        if (!active) {
          const job = queue.shift();
          if (!job) return null;
          active = { id: nextId++, ...job, start: now, dur: durationMs(job.move) };
        }
        const t = active.dur <= 0 ? 1 : (now - active.start) / active.dur;
        if (t < 1) return { id: active.id, move: active.move, t };
        const done = active;
        active = null;
        finish(done.move, done.kind);
      }
    },
    busy() { return active !== null || queue.length > 0; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
