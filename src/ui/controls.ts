// Keycap toolbar + keyboard shortcuts. Everything ends in store.enqueue / undo / redo.
import { BASE_MOVES, parseMove, type Move } from '../core/cube.ts';
import type { Store } from '../store.ts';
import { t, type Key } from './i18n.ts';
import { keyToCommand } from './keys.ts';

export function speakMove(m: Move): string {
  const { base, turns } = parseMove(m);
  if (turns === 2) return `${base} ${t('move.double')}`;
  return m.endsWith("'") ? `${base} ${t('move.prime')}` : base;
}

export function mountControls(bar: HTMLElement, store: Store): void {
  let modifier: '' | "'" | '2' = '';

  const button = (text: string, cls: string, i18nAria?: Key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    if (i18nAria) b.dataset.i18nAria = i18nAria;
    bar.append(b);
    return b;
  };

  for (const m of BASE_MOVES) button(m, 'keycap').addEventListener('click', () => store.enqueue(m + modifier));

  const toggles = ([["'", 'keys.prime'], ['2', 'keys.double']] as const).map(([mod, aria]) => {
    const b = button(mod, 'keycap', aria);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      modifier = modifier === mod ? '' : mod;
      toggles.forEach(([other, el]) => el.setAttribute('aria-pressed', String(modifier === other)));
    });
    return [mod, b] as const;
  });

  const undo = button('', 'keycap wide');
  undo.dataset.i18n = 'action.undo';
  undo.addEventListener('click', () => store.undo());
  const redo = button('', 'keycap wide');
  redo.dataset.i18n = 'action.redo';
  redo.addEventListener('click', () => store.redo());

  window.addEventListener('keydown', (e) => {
    if (e.repeat || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    const cmd = keyToCommand(e, modifier === '2');
    if (!cmd) return;
    e.preventDefault();
    if (cmd.type === 'undo') store.undo();
    else if (cmd.type === 'redo') store.redo();
    else store.enqueue(cmd.move);
  });
}
