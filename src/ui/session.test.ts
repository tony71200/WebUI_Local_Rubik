import { describe, expect, it } from 'vitest';
import { applyMoves, solved } from '../core/cube.ts';
import { createStore } from '../store.ts';
import { createSession, formatTime } from './session.ts';

function setup() {
  let clock = 1000;
  const store = createStore(() => 0);
  const session = createSession(store, () => clock);
  const tick = (ms: number) => { clock += ms; };
  return { store, session, tick };
}

describe('session', () => {
  it('loads the scramble, starts on the first move and stops when solved', () => {
    const { store, session, tick } = setup();
    session.start({ level: 'intro', scramble: ['R', 'U'], distance: 2 });
    expect(store.state).toEqual(applyMoves(solved(), 'R U'));
    tick(5000);
    expect(session.elapsed()).toBe(0); // not started yet
    store.enqueue("U'");
    store.frame(0);
    tick(2500);
    expect(session.elapsed()).toBe(2500);
    store.enqueue("R'");
    store.frame(0);
    expect(session.state).toMatchObject({ moves: 2, active: false, startedAt: 6000, endedAt: 8500 });
    tick(9000);
    expect(session.elapsed()).toBe(2500);
  });

  it('counts every move, including detours', () => {
    const { store, session } = setup();
    session.start({ level: 'easy', scramble: ['F'], distance: 1 });
    for (const m of ['U', "U'", "F'"]) store.enqueue(m);
    store.frame(0);
    expect(session.state).toMatchObject({ moves: 3, active: false });
  });

  it('is abandoned when another tool replaces the cube', () => {
    const { store, session } = setup();
    session.start({ level: 'easy', scramble: ['F'], distance: 1 });
    store.setState(solved());
    expect(session.state.active).toBe(false);
    expect(session.state.endedAt).toBeNull();
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(83_456)).toBe('01:23.4');
    expect(formatTime(42_349)).toBe('00:42.3');
  });
});
