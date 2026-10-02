// Long-form text for the "Thuật toán" tab, one file per language.
import type { Lang } from '../i18n.ts';
import { SECTIONS_EN } from './algo.en.ts';
import { SECTIONS_VI } from './algo.vi.ts';

export type SectionId = 'model' | 'invariants' | 'rings' | 'lbl' | 'kociemba' | 'gods';
export interface AlgoSection { id: SectionId; title: string; html: string }

export const ALGO_SECTIONS: Record<Lang, AlgoSection[]> = { vi: SECTIONS_VI, en: SECTIONS_EN };

// code region (in the reference implementations) shown under each section
export const SECTION_REGION: Partial<Record<SectionId, 'facelets' | 'invariants' | 'kociemba' | 'lbl'>> = {
  model: 'facelets', invariants: 'invariants', lbl: 'lbl', kociemba: 'kociemba',
};
