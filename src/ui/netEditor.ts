// Cross-shaped 54-cell net the user paints. Cell values: color 0..5 (U R F D L B colors) or -1 = empty.
import { FACE_NAMES } from '../core/cube.ts';
import { onLangChange, t, type Key } from './i18n.ts';

// top-left cell (column, row) of each face in a 12 x 9 grid, faces in U R F D L B order
const FACE_ORIGIN: [number, number][] = [[3, 0], [6, 3], [3, 3], [3, 6], [0, 3], [9, 3]];
export const EMPTY = -1;

export interface NetEditor {
  readonly el: HTMLElement;
  get(): Int8Array;
  set(cells: ArrayLike<number>): void;
  clear(): void;
  mark(bad: number[]): void;
  onChange(fn: () => void): void;
}

const colorName = (c: number) => t((c < 0 ? 'color.none' : `color.${c}`) as Key);

export function createNetEditor(colors: string[]): NetEditor {
  const el = document.createElement('div');
  el.className = 'net-editor';

  const palette = document.createElement('div');
  palette.className = 'palette';
  palette.setAttribute('role', 'radiogroup');
  palette.dataset.i18nAria = 'solve.palette';
  const grid = document.createElement('div');
  grid.className = 'net';
  el.append(grid, palette);

  const cells = new Int8Array(54).fill(EMPTY);
  let brush = 0;
  const listeners = new Set<() => void>();

  const swatches = colors.map((color, c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = color;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { brush = c; paintSwatches(); });
    palette.append(b);
    return b;
  });
  const paintSwatches = () => swatches.forEach((b, c) => {
    b.setAttribute('aria-checked', String(c === brush));
    b.setAttribute('aria-label', colorName(c));
  });

  const buttons = Array.from({ length: 54 }, (_, i) => {
    const f = Math.floor(i / 9), k = i % 9;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'net-cell';
    b.style.gridColumn = String(FACE_ORIGIN[f][0] + (k % 3) + 1);
    b.style.gridRow = String(FACE_ORIGIN[f][1] + Math.floor(k / 3) + 1);
    b.addEventListener('click', () => {
      cells[i] = brush;
      paintCell(i);
      listeners.forEach((fn) => fn());
    });
    grid.append(b);
    return b;
  });
  const paintCell = (i: number) => {
    const b = buttons[i];
    b.style.background = cells[i] < 0 ? '' : colors[cells[i]];
    b.dataset.c = String(cells[i]);
    b.setAttribute('aria-label', `${FACE_NAMES[Math.floor(i / 9)]}${(i % 9) + 1}: ${colorName(cells[i])}`);
  };
  const paintAll = () => {
    for (let i = 0; i < 54; i++) paintCell(i);
    paintSwatches();
  };

  const editor: NetEditor = {
    el,
    get: () => Int8Array.from(cells),
    set(next) {
      for (let i = 0; i < 54; i++) cells[i] = next[i];
      paintAll();
      listeners.forEach((fn) => fn());
    },
    clear() {
      editor.set(Array.from({ length: 54 }, (_, i) => (i % 9 === 4 ? Math.floor(i / 9) : EMPTY)));
    },
    mark(bad) {
      const set = new Set(bad);
      buttons.forEach((b, i) => b.classList.toggle('bad', set.has(i)));
    },
    onChange(fn) { listeners.add(fn); },
  };
  editor.clear();
  onLangChange(paintAll);
  return editor;
}
