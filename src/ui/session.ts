// One puzzle attempt: the clock starts at the first move after the scramble and stops when solved.
import { applyMoves, isSolved, solved, type Move } from '../core/cube.ts';
import type { Level } from '../scramble/levels.ts';
import type { Store } from '../store.ts';

export interface Attempt { level: Level; scramble: Move[]; distance: number | null }
export interface SessionState {
  attempt: Attempt | null;
  moves: number;
  startedAt: number | null;
  endedAt: number | null;
  active: boolean; // false once solved or abandoned (the cube was replaced)
}

export interface Session {
  readonly state: SessionState;
  start(a: Attempt): void;
  elapsed(): number; // ms
  onChange(fn: (s: SessionState) => void): void;
}

export function createSession(store: Store, now: () => number = () => performance.now()): Session {
  let st: SessionState = { attempt: null, moves: 0, startedAt: null, endedAt: null, active: false };
  let loading = false;
  const listeners = new Set<(s: SessionState) => void>();
  const emit = () => listeners.forEach((fn) => fn({ ...st }));

  store.subscribe((state, move) => {
    if (!st.active) return;
    if (move === null) {
      if (!loading) { st.active = false; emit(); } // another tool replaced the cube
      return;
    }
    st.startedAt ??= now();
    st.moves++;
    if (isSolved(state)) { st.endedAt = now(); st.active = false; }
    emit();
  });

  return {
    get state() { return { ...st }; },
    start(a) {
      st = { attempt: a, moves: 0, startedAt: null, endedAt: null, active: true };
      loading = true;
      store.setState(applyMoves(solved(), a.scramble));
      loading = false;
      emit();
    },
    elapsed: () => (st.startedAt === null ? 0 : (st.endedAt ?? now()) - st.startedAt),
    onChange(fn) { listeners.add(fn); },
  };
}

// 83456 ms -> "01:23.4"
export function formatTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const m = Math.floor(tenths / 600), s = Math.floor(tenths / 10) % 60, t = tenths % 10;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}
