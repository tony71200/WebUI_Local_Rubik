# Rules for agents working in this repo

These are hard rules. If a task seems to need breaking one, stop and ask the user.

1. The store's state is the single source of truth. Every move goes through `store.enqueue`.
   Views never mutate state and never call each other.
2. Never produce an unsolvable puzzle. A puzzle is either a move sequence applied to the solved
   state, or a constructed state that satisfies the 3 invariants (corner twist ≡ 0 mod 3, edge flip
   even, corner parity = edge parity) and passes the validator.
3. Difficulty labels must come from a measured distance, never from scramble length alone.
4. TDD for `src/core/`, `src/solver/`, `src/scramble/`, and pure helpers in `src/view/` and `src/ui/`.
   `npm test` and `npm run typecheck` must pass before every commit. Never edit a test to make it pass; fix the code.
5. Changes to `src/solver/` or `reference/` require `npm run verify:ref` to pass. Regenerate fixtures
   only on purpose, and say why in the commit message.
6. Determinism: no `Math.random` and no time-based limits in `src/core/`, `src/solver/`, `src/scramble/`.
   Use `mulberry32` from `src/core/prng.ts` and node-count limits.
7. Code, identifiers, comments and commit messages are in English. Every visible string goes through
   `t()`; add each key to both `src/ui/i18n/vi.json` and `src/ui/i18n/en.json`.
8. The only runtime dependency is `three`. Ask the user before adding any dependency.
9. The build must stay one HTML file that works from `file://` with no network requests.
   Check: `grep -Eo '(src|href)="https?://' dist/index.html` prints nothing.
10. Reference implementations: Python 3.12 stdlib only; C++17 (g++); C# on .NET 9; Java 11 (no records,
    no newer APIs); Node with no dependencies. Same algorithm structure and move order as the TypeScript solver.
11. Colors, radii, spacing and fonts come only from tokens in `src/ui/theme.css`. Follow `DESIGN.md`.
12. Animate only `transform` and `opacity`. Honor `prefers-reduced-motion`.
13. Performance budgets: Kociemba tables build < 2.5 s; cached start < 300 ms; typical solve < 1 s;
    60 fps animation; `dist/index.html` ≤ 1.2 MB.
14. Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`).
