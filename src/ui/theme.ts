// Light/dark: follows the OS until the user picks one, then remembers it.
import { load, save } from './storage.ts';

export type Theme = 'light' | 'dark';

export function initTheme(): void {
  const saved = load('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}

export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  save('theme', next);
  return next;
}

export const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Sticker colors live in theme.css (--sticker-u ... --sticker-b), in U R F D L B order.
export const stickerColors = (): string[] => [...'urfdlb'].map((f) => cssVar(`--sticker-${f}`));
