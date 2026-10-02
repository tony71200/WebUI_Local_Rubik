import { describe, expect, it, vi } from 'vitest';
import { applyMoves, solved } from './core/cube.ts';
import { MAX_QUEUE, createStore } from './store.ts';

const make = (dur = 100) => createStore(() => dur);

describe('store', () => {
  it('animates a move over its duration, then applies it once', () => {
    const s = make();
    const seen = vi.fn();
    s.subscribe(seen);
    s.enqueue('R');
    expect(s.frame(1000)).toMatchObject({ move: 'R', t: 0 });
    expect(s.frame(1050)?.t).toBeCloseTo(0.5);
    expect(s.state).toEqual(solved());
    expect(s.frame(1100)).toBeNull();
    expect(s.state).toEqual(applyMoves(solved(), 'R'));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][1]).toBe('R');
  });

  it('plays queued moves in order with fresh ids', () => {
    const s = make();
    s.enqueue('R');
    s.enqueue('U');
    const a = s.frame(0)!;
    const b = s.frame(100)!;
    expect([a.move, b.move]).toEqual(['R', 'U']);
    expect(b.id).not.toBe(a.id);
    expect(s.busy()).toBe(true);
    expect(s.frame(200)).toBeNull();
    expect(s.busy()).toBe(false);
    expect(s.state).toEqual(applyMoves(solved(), 'R U'));
  });

  it('applies instantly when duration is 0 (reduced motion)', () => {
    const s = make(0);
    s.enqueue('R');
    s.enqueue('U');
    expect(s.frame(0)).toBeNull();
    expect(s.state).toEqual(applyMoves(solved(), 'R U'));
  });

  it('undoes and redoes', () => {
    const s = make(0);
    s.enqueue('R');
    s.enqueue('U');
    s.frame(0);
    s.undo();
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), 'R'));
    s.redo();
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), 'R U'));
    s.undo();
    s.frame(0);
    s.enqueue('F'); // a new move clears redo
    s.frame(0);
    s.redo();
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), 'R F'));
  });

  it('caps the queue', () => {
    const s = make(0);
    for (let k = 0; k < MAX_QUEUE + 10; k++) s.enqueue('U');
    s.frame(0);
    expect(s.state).toEqual(applyMoves(solved(), Array(MAX_QUEUE).fill('U')));
  });

  it('setState replaces state, clears queue and history', () => {
    const s = make();
    const target = applyMoves(solved(), 'R U');
    s.enqueue('F');
    s.frame(0);
    s.setState(target);
    expect(s.frame(10)).toBeNull();
    expect(s.state).toEqual(target);
    s.undo();
    expect(s.frame(20)).toBeNull();
  });
});
