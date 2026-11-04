# Round 12: status at the checkpoint

Status: **proposed**, builder-run. For the mid-session review, which reads this while the builder keeps working. Decisions D213-D216 are in `../convergence-12.md`.

## Done at the checkpoint

`round-11/` copied to `round-12/` (the runtime changes); round 11's review files and codec measurements left out of the copy. Every gate default now names round 12.

**Step 1, the review's findings, by root cause:**

- **H1 (D213).** A contract names its services (`services: [ShopApi]`); a list that misses one of the commit's `R` leaves it with no `outcomes`, a type error. It compiles to `Op.services`; the seal refuses an operation whose service the boot lacks (`SealMissingService`). The boot is typed at one erasure, `servicesFor(typed, context)`, with `R` taken from the machine only (`NoInfer`); round 11's casts are gone. `Defect` issues carry their cause. `provide` is cut (L7). Two `types-check` directives pin it: a contract missing its service, a boot missing one.
- **M1.** D207's two refusals pinned in `checks/front-check.ts` (`SealDuplicatePath`, a bare function below ops), with `legacy.ts`'s commit path and per-read paths. `legacy.ts`'s stream branch cut (no booted hand machine has streams); its domain branch kept, since REV4-H2, REV4-H4, REV5-H1 and SEARCH-ODD-ALL boot hand domains (the review's census missed them).
- **M2 (D214).** Memory as fields; creation decodes the input (`InputRefused`, `InputMissing`, seen as `InvalidTurn` with the cause, no actor); the restore rule for a release-added field (computed from the restored fields once; an input with no default refuses the record). Pinned in `front-check.ts`, and a Date, NaN and bigint reload in a scenario (`R12-MEMORY`).
- **M3 (D215).** `inputFields` on `Op`; the seal makes the key from `keyFields` and refuses `SealKeyField`, `SealKeyTwice`, `SealNoKey`; `flow check` reports `KeyField`; `front-check.ts`'s structure check does what the convergence claimed, with a corruption for it.
- **M5.** `R12-KEYS`: D78's rekey on a typed machine whose release changes `key` fields, and a release adding a key field the stored input lacks keeps the lane. The harness compiles again at the boot after a `release`, so a release can change data.
- **L1, L2.** F6's guarded exit and rule 51 pinned in `front-check.ts`; two machines with different services in `R12-SERVICES`.
- **M4 (the 691 headline).** Not yet restated: RESULTS will say about 350 machine-only typed and about 340 typed machine plus `Compiled`-shaped module blocks, left for the entity round.

**Step 2:** `Compiled` changed once (D213-D216): services, input fields, one key source, memory fields with required restore and encode, `events` required. `idleMs` left for streams. Table in `../convergence-12.md`, with what a failed decode means at each door.

## Gates at the checkpoint [ran]

| Gate | Result |
| --- | --- |
| Suite, `--round 12` with catalog | 746/746 (742 + 4 new); output alone 0; unlogged none; stale lock 0; catalog none; RECIPIENTS as written (the four new cases' counts) |
| `--swap` | 746/746 |
| `checks/types-check.ts` | `TYPES PASS`, 10 directives |
| `checks/front-check.ts` | `FRONT PASS`, 38 pins, 71 machines, 6 corruptions |
| mailq, score, search-vacuity, `compare-all`, `compare`, `date-check`, CLI pins | pass |

Not yet run at the checkpoint: `mutate-one`, the 5 s gate, falsify, the review's survivor mutants on round 12.

## Next

Step 3, the compile prototypes: the front end moved to the design's public API (placement in the definition, ordered `states`, `trait`/`subroutine`, `lookup`, typed selectors, `Flow.uncertain`, exits as targets), every typed fixture ported, each change from the design logged in `round-12/api-changes.md`. Then the gates, then RESULTS.
