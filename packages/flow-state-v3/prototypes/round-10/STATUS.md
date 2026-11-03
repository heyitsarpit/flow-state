# Round 10, status

Done through stage E. All five stages are written up in `RESULTS.md`, with decisions D129-D163 in `../convergence-10.md`. Everything is proposed.

At the end of stage E (`0eee5e65` and the docs commit): suite 727/727; the suite holds its own reference model of binding (`conformance/reference/model.ts`, D159), and (j) takes a park only where it says nothing live binds the op (D160); every D154 cause is per owner (D161); A1 closed, A4 narrowed (D162); 35 inputs inventoried (11 observed, 3 debt-only, 5 names-only, 15 checked, 1 excuse at the runtime's word; allowances A2, A3', A4', A5, A6, A7); 35 lying runtimes in `falsify.ts --part lies`, each red by its named oracle or shown vacuous. Gate numbers are in `RESULTS.md`, "Gates on the final commit".

Stage F (re-check 10e, D164-D168, proposed): each attempt's copy is recorded from the suite's own driving, every `delivered` names the copy it ran in, and (j) checks the recipient, not only the count (D164); the park check and a decline's park are answered per copy, from the published leaf, `.each` membership, each copy's published state and its `resetOn` values (D165); (ref) asks with the real subject (D166); `reference/` is locked, with a tamper (D167); a `turn` pays a refusal only with a seen Slot run, and `types-check` finds `tsc` from a fresh worktree (D168). Suite 729/729 (FRAG-21 new). 42 lies: 39 red by their named oracle, 3 vacuous as before.

Stage G (re-check 10f, D169-D172, proposed): (j) observes each ending's recipient through a guard of its own and places it by published views into one actor, life and copy (D169), replacing D164's `at` check, which is deleted; let-go per copy and per owner (D170); `Reference.copies` de-duplicated (D171); `types-check` from a fresh worktree (D172). FRAG-22 (two actors, three copies each) and a REV9-EDGE variant added. Gates on the stage G commit: suite 732/732 with output and catalog, `RECIPIENTS observed 44063; among equal views 1364; unplaceable 0; at a boot 205; unobserved 143`; `mutate-one.ts` control not killed (suite, `--swap`, typed compare, date check, CLI pins, every `checks/` file, 5 s gate); 5 s gate `29 failed, 29 expected; unexpected: none`; `falsify --part search`, `mutants`, `watch`, `tamper` every gate ok; `--part lies`: the five stage G lies and the lies named in RESULTS red by the named oracle. **Not rerun: the rest of `--part lies`** (47 lies at about 60 s each on this machine; over the hour).

Left undone, in order of what makes green mean more:

0. The rest of `falsify --part lies` on the stage G commit (`--slice i/12`). Equal views across actors or copies (1,364 deliveries) cannot be told apart: a lie that swaps two equal copies is unseen by design. A view at a boot is placed by pre-kill memory only (205 unmatched, stated). A named case with `odd`'s duplicate-key shape.
1. The allowances left: A2 (now 143 deliveries no guard saw), A5, A6, A7. A fragment's cancel reached through a raise stays `unknown` in `cancelsOn`. L1: D161's keyed "owner moved" trigger still fires in no case (FRAG-21's second variant tried and missed). Gates not rerun at stage F: `--swap`, CLI, checks, search, mutants, watch. Then L2: a case where a cancel alternative's guard refuses beside a dropped ending.
2. M2's rest: lane helpers reading one lane by its full key (rounds 7, 8, 9, 9b) through the codec; mark what stays as a named format pin.
3. Pins for under-specification A05, A12, A15, and for rules 47 and 59.
4. The fake: hidden throttling, plain writes queued behind a strict one, connection loss, power loss, a reload driven into a 409.
5. Review M6: `reality/spin.ts` with a costly listener as a gate; `run7.ts`, `h3.ts`, `spin.ts` scored by declared modes (D153, D157).
6. Re-audit L1-L4, L6, L7 (re-check L1: a never-true guard on a dead action is still green); `--swap` past Pay; `bench/main.ts` scored.
7. The 18 builder mutants rerun through `mutate.ts`; the older mutant lists rewritten.
