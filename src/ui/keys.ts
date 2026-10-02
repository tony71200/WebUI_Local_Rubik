// Keyboard -> command. Letters turn layers, Shift = prime, the "2" toggle = double.
import type { Move } from '../core/cube.ts';

export type Command = { type: 'move'; move: Move } | { type: 'undo' } | { type: 'redo' };

export interface KeyLike { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }

const LETTERS = new Set(['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z']);

export function keyToCommand(e: KeyLike, double: boolean): Command | null {
  const k = e.key.length === 1 ? e.key : '';
  if (e.ctrlKey || e.metaKey) {
    if (k.toLowerCase() === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (k.toLowerCase() === 'y') return { type: 'redo' };
    return null;
  }
  if (e.altKey || !k) return null; // Alt+letter opens browser menus in Edge/Chrome
  const lower = k.toLowerCase();
  const base = 'xyz'.includes(lower) ? lower : lower.toUpperCase();
  if (!LETTERS.has(base)) return null;
  const suffix = double ? '2' : e.shiftKey ? "'" : '';
  return { type: 'move', move: base + suffix };
}
