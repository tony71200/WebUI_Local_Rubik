import { describe, expect, it } from 'vitest';
import { applyMoves, invertSequence, isSolved, solved, splitMoves } from '../core/cube.ts';
import { createStore } from '../store.ts';
import { createPlayback } from './playback.ts';

const scramble = splitMoves("R U F' L2 D");
const start = applyMoves(solved(), scramble);
const solution = invertSequence(scramble);

function setup() {
  const store = createStore(() => 0); // instant moves: frame(0) drains the queue
  const playback = createPlayback(store);
  playback.load(start, solution);
  return { store, playback };
}

describe('playback', () => {
  it('loads the start state and plays the whole solution', () => {
    const { store, playback } = setup();
    expect(store.state).toEqual(start);
    playback.play();
    store.frame(0);
    expect(isSolved(store.state)).toBe(true);
    expect(playback.state).toMatchObject({ index: 5, playing: false, stale: false });
  });

  it('steps forward and back', () => {
    const { store, playback } = setup();
    playback.next();
    playback.next();
    store.frame(0);
    expect(store.state).toEqual(applyMoves(start, solution.slice(0, 2)));
    playback.prev();
    store.frame(0);
    expect(store.state).toEqual(applyMoves(start, solution.slice(0, 1)));
    expect(playback.state.index).toBe(1);
  });

  it('restarts from the start state', () => {
    const { store, playback } = setup();
    playback.play();
    store.frame(0);
    playback.restart();
    expect(store.state).toEqual(start);
    expect(playback.state).toMatchObject({ index: 0, stale: false });
  });

  it('goes stale when the cube is turned by hand or reset', () => {
    const { store, playback } = setup();
    store.enqueue('U');
    store.frame(0);
    expect(playback.state.stale).toBe(true);
    playback.play();
    store.frame(0);
    expect(playback.state.index).toBe(0);

    const other = setup();
    other.store.setState(solved());
    expect(other.playback.state.stale).toBe(true);
  });

  it('notifies listeners', () => {
    const { store, playback } = setup();
    const seen: number[] = [];
    playback.onChange((s) => seen.push(s.index));
    playback.next();
    store.frame(0);
    expect(seen).toEqual([1, 1]);
  });
});
