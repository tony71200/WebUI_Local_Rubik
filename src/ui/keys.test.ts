import { expect, it } from 'vitest';
import { keyToCommand } from './keys.ts';

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

it('maps letters to moves', () => {
  expect(keyToCommand(key('r'), false)).toEqual({ type: 'move', move: 'R' });
  expect(keyToCommand(key('R', { shiftKey: true }), false)).toEqual({ type: 'move', move: "R'" });
  expect(keyToCommand(key('m'), true)).toEqual({ type: 'move', move: 'M2' });
  expect(keyToCommand(key('X', { shiftKey: true }), false)).toEqual({ type: 'move', move: "x'" });
});

it('maps undo/redo and ignores everything else', () => {
  expect(keyToCommand(key('z', { ctrlKey: true }), false)).toEqual({ type: 'undo' });
  expect(keyToCommand(key('y', { ctrlKey: true }), false)).toEqual({ type: 'redo' });
  expect(keyToCommand(key('Z', { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: 'redo' });
  expect(keyToCommand(key('r', { ctrlKey: true }), false)).toBeNull();
  expect(keyToCommand(key('f', { altKey: true }), false)).toBeNull();
  expect(keyToCommand(key('q'), false)).toBeNull();
  expect(keyToCommand(key('Enter'), false)).toBeNull();
});
