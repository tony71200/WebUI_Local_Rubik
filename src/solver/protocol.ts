// Messages between the main thread and the solver worker.
import type { Level } from '../scramble/levels.ts';
import type { LblStageId } from './lbl.ts';

export type SolveMethod = 'kociemba' | 'lbl';
export interface StageMoves { id: LblStageId; moves: string[] }

export type SolverRequest =
  | { type: 'solve'; id: number; facelets: number[]; method: SolveMethod }
  | { type: 'scramble'; id: number; level: Level; seed: number };

export type SolverResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'ready'; fromCache: boolean; ms: number }
  | { type: 'solution'; id: number; moves: string[]; stages?: StageMoves[]; ms: number }
  | { type: 'puzzle'; id: number; scramble: string[]; distance: number | null; ms: number }
  | { type: 'error'; id: number; message: string };
