# Round 10, status

Done. Both stages are written up in `RESULTS.md`, with decisions D129-D148 in `../convergence-10.md`. Everything is proposed.

At the end: suite 723/723, every gate red on what it should be (`conformance/falsify.ts`), 18/18 mutants killed from a git worktree, the bfcache contract verified in Chrome with a red control.

Left undone, in order of what makes green mean more:

1. A named oracle for `laundered-as-evidence`. Today only whole output kills it.
2. Pins for under-specification A05, A12, A15, and for rules 47 and 59.
3. The fake: hidden throttling, plain writes queued behind a strict one, connection loss, power loss, a reload driven into a 409.
4. Review M6: `reality/spin.ts` with a costly listener as a gate, for `task-is-microtask`.
5. `tsc` on `typed/type-tests.ts` as a gate; `--swap` past Pay; `bench/main.ts` scored.
6. The older mutant lists, rewritten against round 10's text.
