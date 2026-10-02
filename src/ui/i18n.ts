// UI strings: every visible text goes through t(). vi.json and en.json must have the same keys.
import en from './i18n/en.json';
import vi from './i18n/vi.json';
import { load, save } from './storage.ts';

export type Lang = 'vi' | 'en';
export type Key = keyof typeof vi;
type Vars = Record<string, string | number>;

export const DICTS: Record<Lang, Record<string, string>> = { vi, en };

export function translate(dict: Record<string, string>, key: string, vars: Vars = {}): string {
  return (dict[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function detect(): Lang {
  const saved = load('lang');
  if (saved === 'vi' || saved === 'en') return saved;
  return globalThis.navigator?.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;
export const t = (key: Key, vars?: Vars): string => translate(DICTS[current], key, vars);

// Fills [data-i18n] text and [data-i18n-aria] aria-labels under root.
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as Key));
  });
}

export function setLang(lang: Lang): void {
  current = lang;
  save('lang', lang);
  document.documentElement.lang = lang;
  applyI18n(document);
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void { listeners.add(fn); }
