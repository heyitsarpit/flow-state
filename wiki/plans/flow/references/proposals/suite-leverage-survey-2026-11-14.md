# Suite leverage survey, 2026-11-14

**Bottom line:** the suite's judging is wide, but it is pushed hard in only a few places. Nothing runs its gates
automatically. The generator never varies its inputs and never uses what it measures. Production gets a fraction of
the self-proving machinery that round-14 gets. Several outputs are computed and never gated. Status: proposed.
Survey by four read-only Haiku agents (generation, judging, self-proving machinery, a blind read). The orchestrator
checked the main claims in code at 6c8d4a8b..81953e22.

## Verified facts

- **Gates run only by hand.**
  - `nub run verify` (root `package.json:31`) runs no conformance gate.
  - `conformance:gates` is a manual script.
  - `gates.json` mixes revisions, and its standing reds (pairs, crash) are seen by no build.
- **The generator's inputs are fixed.**
  - Answers always go to the oldest open request (`parts/belief.ts:210`, `parts/generate.ts:162`).
  - Timers fire exactly at their deadline.
  - Payload pools have one email and one cart.
  - Mixes are stress-only and pilot-only.
  - Reach (cells, pairs, fields) never feeds back into generation.
- **Production is barely self-proven.**
  - Falsify: 18 mutants on production, against 154 on round-14.
  - Liar: 13 against 126.
  - Coverage counts only round-14's mutants (`coverage.ts:204`).
  - The production catch sweep is stale and unread.
  - The crash gate's 3 reds are unnamed and have no owner.
- **Outputs that are computed but never gated.**
  - `fieldGate` passes a field when any mutant exists for it, not when a run notices it (`parts/model-mutation.ts:266`).
    It reads 327/327 with about 36 noticed. T52's strict field gate (Q20) owns this.
  - Cell-pair and triple reach are printed only.
  - 6 of 8 generated kept regressions are saved as `"by": "pass"`, so they cannot fail.
  - Bench timings are printed, then dropped.
- **Built but wired into no gate:**
  - the forged-report adversary (T52 item 2);
  - `shrink`, `kills`, the full sweeps and `suite --generated`;
  - automatic shrinking for part scripts, which doesn't exist at all.

## Levers, by benefit for cost

1. **Run the gates automatically.** Cheap gates (coverage, parts, held-out, class, bench) run at every checkpoint
   and in `verify`, with a fresh `gates.json`. Cost: wall time, unmeasured. Reds become visible on every commit.
2. **Vary the generator's inputs:** out-of-order answers, timing offsets of -1, 0 and +1 ms around deadlines, payload
   pools varied by seed, a usual-profile mix, and Pay joining a mix. About 100 to 150 lines. Opens bug classes
   (cross-key ordering, deadline off-by-one) that no seed can reach today.
3. **Make dropped outputs gate:**
   - name and own crash's 3 reds;
   - re-save or drop the 6 pass-only regressions;
   - read the production sweep's 24 neighbouring-oracle rows;
   - gate on cell-pair reach;
   - field noticing (T52 Q20).

   Small.
4. **Shrink part scripts automatically and group failures by signature, then choose seeds by reach.** About 150
   lines. This is the precondition for a useful soak run; without it, thousands of seeds re-find the same breaks.
5. **Give production its own self-proof:** mutants for the liar behaviours and the 29 owed core gaps, and coverage
   counting production's mutants. Medium. This is stage B's exit: round-14 becomes a mutant host, then is retired.
6. **Bounded enumeration:** every move sequence to depth 3 or 4 per pilot, through a chooser in place of the
   random draw. About 60 to 100 lines. Covers every short interleaving.
7. **Smaller items:** a trace command (step, expected, observed, mismatch), held-out seeds for hand cases, recorded
   bench timings, and graph-edge checks from production's compiled machine.

Already in T52: the adversary (item 2) and the strict field gate (Q20).
