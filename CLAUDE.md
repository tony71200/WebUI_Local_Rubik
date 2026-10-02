# Rubik WebUI (local)

Offline single-file web app to play and learn the 3×3 Rubik's cube: a three.js cube and a 9-ring
circle-puzzle diagram kept in sync, plus tabs to generate puzzles, solve user-entered states
(Kociemba two-phase and Layer-by-Layer) and explain the algorithms in 5 languages.

- Spec: `docs/superpowers/specs/2026-10-02-rubik-webui-design.md`
- Plans: `docs/superpowers/plans/`
- Rules you must follow: `AGENTS.md`. Visual rules: `DESIGN.md`.

## Commands

- `npm run dev`: Vite dev server
- `npm test`: Vitest (logic only; no DOM tests)
- `npm run typecheck`: `tsc` (no emit)
- `npm run build`: typecheck + build `dist/index.html` (single file, open it by double-click)

## Map

- `src/core/`: pure model. `cube.ts` (facelets, move permutations), `cubie.ts` (corners/edges, validation), `rings.ts` (circle-puzzle geometry), `prng.ts`
- `src/solver/`: Kociemba two-phase. `coords.ts`, `tables.ts`, `kociemba.ts` (pure, tested); `worker.ts` (IndexedDB cache) + `client.ts` (timeout/restart) + `protocol.ts`
- `src/store.ts`: the only state holder; move queue, undo/redo, shared animation clock
- `src/view/`: `cube3d.ts` (three.js), `rings2d.ts` (SVG), plus pure helpers `ringPath.ts`, `drag.ts`, `ease.ts`
- `src/ui/`: theme tokens, fonts, i18n (`i18n/vi.json`, `i18n/en.json`), keyboard and keycaps, `tabs.ts`, `solveTab.ts` + `netEditor.ts` + `playback.ts`

## Data flow

input (drag, key, keycap, ring click) → `store.enqueue(move)` → each frame `store.frame(now)` returns
`{ id, move, t }` → `cube3d.render(anim)` and `rings2d.render(anim)` → when `t` reaches 1 the store
applies the permutation and notifies subscribers, which recolor.

## Glossary

- facelet: one of 54 stickers, indexed in Kociemba order U R F D L B, each face row-major
- cubie: one of the 26 small cubes (8 corners, 12 edges, 6 centers)
- ring / circle puzzle: one of 9 slice belts drawn as a circle; each facelet is the crossing of 2 rings
- HTM: half-turn metric (U2 counts as one move)
- G1: subgroup ⟨U, D, R2, L2, F2, B2⟩ used by Kociemba phase 2
- LBL stage: one of the 7 named Layer-by-Layer steps
