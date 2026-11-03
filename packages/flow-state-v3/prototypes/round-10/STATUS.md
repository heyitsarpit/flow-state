# Round 10, status

Done through stage D. All four stages are written up in `RESULTS.md`, with decisions D129-D158 in `../convergence-10.md`. Everything is proposed.

At the end of stage D (`9b87842e` and the docs commit): suite 727/727; every input the oracles read is inventoried (34: 11 observed, 3 debt-only, 6 names-only, 12 checked, 2 excuses at the runtime's word; 7 allowances in all); an oracle excuses only for a cause the suite saw (D154); 11 lying runtimes in `falsify.ts --part lies`, each red by its named oracle. Gate numbers are in `RESULTS.md`, "Gates on the final commit".

Left undone, in order of what makes green mean more:

1. Lies for the seven allowances A1-A7 (`convergence-10.md`, Stage D), then convert each the way D154 did, or keep it as a stated allowance.
2. M2's rest: lane helpers reading one lane by its full key (rounds 7, 8, 9, 9b) through the codec; mark what stays as a named format pin.
3. Pins for under-specification A05, A12, A15, and for rules 47 and 59.
4. The fake: hidden throttling, plain writes queued behind a strict one, connection loss, power loss, a reload driven into a 409.
5. Review M6: `reality/spin.ts` with a costly listener as a gate; `run7.ts`, `h3.ts`, `spin.ts` scored by declared modes (D153, D157).
6. Re-audit L1-L4, L6, L7 (re-check L1: a never-true guard on a dead action is still green); `--swap` past Pay; `bench/main.ts` scored.
7. The 18 builder mutants rerun through `mutate.ts`; the older mutant lists rewritten.
