// Messages between the main thread and the solver worker.
export type SolverRequest = { type: 'solve'; id: number; facelets: number[] };

export type SolverResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'ready'; fromCache: boolean; ms: number }
  | { type: 'solution'; id: number; moves: string[]; ms: number }
  | { type: 'error'; id: number; message: string };
