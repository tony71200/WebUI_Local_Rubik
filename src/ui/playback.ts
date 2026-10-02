// Steps through a solution on the store. Any move it did not send makes the solution stale.
import { inverseMove, type Move, type State } from '../core/cube.ts';
import type { Store } from '../store.ts';

export interface PlaybackState { moves: Move[]; index: number; playing: boolean; stale: boolean }

export interface Playback {
  readonly state: PlaybackState;
  load(start: State, moves: Move[]): void;
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  restart(): void;
  onChange(fn: (s: PlaybackState) => void): void;
}

export function createPlayback(store: Store): Playback {
  let moves: Move[] = [];
  let index = 0; // moves[0..index) have been sent to the store
  let playing = false;
  let stale = false;
  let start: State | null = null;
  let expected: Move[] = []; // sent but not finished yet
  let resetting = false;
  const listeners = new Set<(s: PlaybackState) => void>();
  const snapshot = (): PlaybackState => ({ moves, index, playing, stale });
  const emit = () => listeners.forEach((fn) => fn(snapshot()));

  const send = (m: Move) => {
    expected.push(m);
    store.enqueue(m);
  };
  const step = () => send(moves[index++]);
  const reset = (s: State) => {
    resetting = true;
    store.setState(s);
    resetting = false;
  };
  const invalidate = () => {
    stale = moves.length > 0;
    playing = false;
    expected = [];
  };

  store.subscribe((_, move) => {
    if (move === null) {
      if (!resetting) { invalidate(); emit(); }
      return;
    }
    if (expected[0] === move) {
      expected.shift();
      if (playing && !expected.length) {
        if (index < moves.length) step();
        else playing = false;
      }
    } else {
      invalidate();
    }
    emit();
  });

  const playback: Playback = {
    get state() { return snapshot(); },
    load(s, m) {
      start = Uint8Array.from(s);
      moves = m;
      index = 0;
      playing = false;
      stale = false;
      expected = [];
      reset(start);
      emit();
    },
    play() {
      if (stale || index >= moves.length) return;
      playing = true;
      if (!expected.length) step();
      emit();
    },
    pause() {
      playing = false;
      emit();
    },
    toggle() {
      if (playing) playback.pause();
      else playback.play();
    },
    next() {
      if (stale || index >= moves.length) return;
      playing = false;
      step();
      emit();
    },
    prev() {
      if (stale || index === 0) return;
      playing = false;
      send(inverseMove(moves[--index]));
      emit();
    },
    restart() {
      if (!start) return;
      playing = false;
      stale = false;
      expected = [];
      index = 0;
      reset(start);
      emit();
    },
    onChange(fn) { listeners.add(fn); },
  };
  return playback;
}
