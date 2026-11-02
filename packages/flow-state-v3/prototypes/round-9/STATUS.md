# Round 9, part one: status at the checkpoint

Proposed, throwaway. See `../convergence-9.md`.

Done in code, suite green: D114 (a decline's input, the hold test), D115 (no rate budget, an ending chain paces), D116 (lock), D117 (oracle j), D118 (kept: firing, stream, raise key, `Kept` column, row), D119 (names and carried), D120 (lint). `canon` no longer overflows the stack on a cycle, which was why `odd` reached depth 1.

Running: builder mutants `mutants-r9.ts`. Not yet: tamper checks, all searches, plants, real runs, RESULTS.
