# Round 10, status

Done through stage C. All three stages are written up in `RESULTS.md`, with decisions D129-D153 in `../convergence-10.md`. Everything is proposed.

At the end of stage C (`32c4b7af`): suite 727/727, every gate red on what it should be (`conformance/falsify.ts`, five parts), the re-audit's H1, H2, M1, M3, M4 closed, M2 cut from 112 to 73 failing cases.

Left undone, in order of what makes green mean more:

1. M2's rest: lane helpers reading one lane by its full key (rounds 7, 8, 9, 9b) through the codec; mark what stays as a named format pin.
2. `checkMints` takes `Released`/`Superseded` on the runtime's word; the ledger reads `lane.release.*` cell names as a release's sign.
3. Pins for under-specification A05, A12, A15, and for rules 47 and 59.
4. The fake: hidden throttling, plain writes queued behind a strict one, connection loss, power loss, a reload driven into a 409.
5. Review M6: `reality/spin.ts` with a costly listener as a gate; `run7.ts`, `h3.ts`, `spin.ts` scored by declared modes (D153).
6. Re-audit L1-L4, L6, L7; `--swap` past Pay; `bench/main.ts` scored.
7. The 18 builder mutants rerun through `mutate.ts` on the stage C commit; the older mutant lists rewritten.
