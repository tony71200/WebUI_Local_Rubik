import type { Plugin } from 'vite';

export const REGIONS: readonly ['facelets', 'invariants', 'kociemba', 'lbl'];
export const CODE_LANGS: readonly { id: string; label: string; file: string }[];
export function extractRegions(source: string): Record<string, string>;
export function compactHtml(html: string): string;
export function snippetsPlugin(): Plugin;
