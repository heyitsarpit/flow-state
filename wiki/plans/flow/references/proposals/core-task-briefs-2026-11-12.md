# Core-runtime Task briefs: source for T54, T18, T55, T19, T20 (proposed)

Status: **proposed** (agent, 2026-11-12). Nothing here is in a `.task` record; the orchestrator applies what is
accepted. Order: T54 → T18 → T55 → T19 → T20.

## How to use this file (for the Sonnet agent writing the briefs)

Each Task section is the content of that Task's brief. Write one brief per Task from it and invent nothing.

- **The Task record stands.** Run `workflow show @task.V3.<id>` and keep its Description scope, May change,
  Evidence, False pass, Gates, Stops and Acceptance verbatim, and its Comments as "known gaps". This file adds the
  requirements, steps, traps, decisions and handoffs. Where this file and a record disagree, this file is newer;
  list the disagreement at the top of the brief (the known ones are under each Task's "Record differences").
- **Copy verbatim:** every requirement line (id, rule ids, check, wrong-runtime name), every Spec rule id, case
  id, file path, command, part id, and each "Decisions already made", "Record differences" and "Must not decide
  alone" list.
- **May reword:** the goal, Why now, step and trap sentences, keeping every fact.
- **Prepend to every brief:** "Rules for every brief", whole.
- **Order of each brief:** goal, Why now, Read first, Record differences, Decisions already made, Parts,
  Requirements, Steps, Traps, Must not decide alone, Handoffs.
- **Names.** A name after "Wrong:" is the name to give a new wrong runtime or mutant; none exists yet. An oracle
  or case marked (new) is written by the Task; one marked (exists) is in `packages/flow-state-v3/conformance/`
  today. File names for new code inside `src/core/` and `src/host/` are the builder's unless given.
- **Bare rule ids** carry their Spec's name on every line (WriteLanes I31, Actors T21); never drop it.
- If two lines here disagree, or a fact is missing, stop and ask the orchestrator; do not choose.
- Call the test apps "fixtures (including Pay and checkout)", never one app alone.

## Rules for every brief

- **Spec first.** The seven runtime Specs in `wiki/specs/core/` (WriteLanes, Actors, WriteAhead, Restore,
  Reads, Turn, Codec) are the build's source. Where a Spec and the code disagree, the Spec wins; where a Spec is
  silent, stop and ask. Shared terms: ending, Attempt, lane and owed row are WriteLanes'; Start and Life are
  Actors'; record kinds are WriteAhead R4 and R5.
- **Every requirement is a failing check first.** Write the check and its wrong runtime, see the check red on
  today's code (or, where today's code is already right, the wrong runtime red and the check green), commit
  that, then build. Say in the Task comment which of the two it was. Expected results come from the Spec rule
  cited, never from running the code.
- **Every Invariant the Task owns gets an oracle or case.** `conformance/not-yet.ts` lists the Invariants each
  Task owns. The requirement lines below are the ones with design content; every other owned Invariant still
  needs its oracle or case and a wrong runtime, written from its Spec text and its Spec test (T-numbered).
- **Slice template** (T18, T19, T20; @epic.V3 instructions): the suite half (Spec change, model section, parts,
  model mutation, audit) is green on the Spec model and reviewed before the production half starts; then
  production test-first; then the benchmark replay and the gates. "Declared, Enabled, Covered, Guards" in each
  record's acceptance are that template's items and are kept verbatim.
- **All fixtures are central** (the user, 2026-11-12). No check is "one app passes". Each requirement runs over
  the generated parts available at its slice, under their usual and stress profiles, both world seeds:
  - "the base parts": the pilots S16 transfers, S21 sign-in and S10 sync (`packages/flow-state-v3/fixtures/`),
    their app mixes (`MIX-*`), and the generated parts T52 makes of the hand fixtures (including Pay and
    checkout) and Cells;
  - built by T18, from `code:wiki/plans/flow/references/proposals/fixture-catalogue-2026-11-11.md`: S01, S24
    (composite A Editor); S08, S03, S22 flat (B Outbox); S12, S23 (C Control); S09 flat (G Optimistic);
  - built by T19: S13 (E Chat). S25 is @task.V3.T56's.
  A requirement line names the parts that reach it most directly; it still runs over all parts available.
  The fixtures (including Pay and checkout) keep one more role: the type-error count against `src/index.ts`,
  which checks the API, not behaviour.
- **Store contents before the disk reader exists.** Until T19 builds the Port's disk reader, a check that reads
  "store contents" reads the fake world's store from the harness side (`conformance/world/storage.ts`), never
  through the runtime.
- **Gates.** `nub run conformance:gates` runs them all and writes `conformance/gates.json`. Singly:
  `bun packages/flow-state-v3/conformance/runner/main.ts <mode>` with modes `suite`, `falsify`, `liar`, `crash`
  (each `--runtime production`), `parts`, `pairs`, `matrix-gate`, `model-mutation`, `mutate` (core mutants),
  `coverage`, `regressions`. Then `nub run check:fix` and `nub run check` at zero errors and zero warnings.
  "No worse" means every gate's count at the Task's start, recorded in the Task's first comment.
- **Benchmarks.** `packages/flow-state-v3/bench/bench.ts` replays a part and returns its work fingerprint and
  turn costs; no runner mode calls it yet. A Task that needs a cost number adds the scenario there and runs it
  alone (no other process), recording the command in its comment.
- **Type tests** are `*.type-test.ts` files beside the code, using `@ts-expect-error`, checked by
  `nub run check:effect`; each is planted wrong once to see it fail for the expected reason.
- **Shell.** Every command is bounded: `perl -e 'alarm N; exec @ARGV' -- <cmd> </dev/null`, under 3 minutes, no
  stdin reads; files are written with Write and Edit; kill your own stale shells. Suite slices and mutants may
  run up to 8 in parallel; browsers and benchmarks run alone.
- **Code style.** Read `tools/lint-bomb/STYLE.md`, `tools/lint-bomb/examples/style.ts` and
  `tools/lint-bomb/FLOW-STATE.md` before writing. The core (outside `src/host/`) is plain, pure, synchronous
  TypeScript returning `{ state, effects }`; the host uses Effect fully. No implicit state machine: a set of
  flags that together mean a state becomes one tagged value and one total table.
- **Sidecars.** Haiku only, effort high, read-only unless given one disjoint file with an acceptance check; the
  lead reads every line and re-runs every check. A reviewer sidecar checks each oracle, harness or runtime change.
- **Traps that apply to every Task:**
  1. **A suite that cannot load once counted as killing mutants.** Fixed in `974ad3a1`: a kill counts only when a
     failure names an oracle or a cited Invariant. Keep it guarded: for each new wrong runtime, read the failure
     and confirm it names the oracle or Invariant its requirement lists. A load failure, defect, timeout or
     missing verdict is a broken mutant, not a kill.
  2. **Which side is wrong.** A red on production may be the model's or the oracle's fault (T47 found four such:
     GEN-pay-search-20, 21, 55 and seeded-173). Before changing production to turn a check green, derive the
     expected result from the Spec rule by hand. If the model is wrong, fix the model and say so in the comment.
  3. **A lenient oracle passes everything.** Each oracle change needs its wrong runtime red before and after.
  4. **A differential baseline that silently re-records.** A baseline is re-recorded only with a named entry that
     cites the pending case it flips.
- **Never decide alone, in any Task:** a guarantee change (any Spec `must` or Invariant), a public name or shape
  in `src/index.ts`, a new report kind, a new record kind or field, dropping or weakening a check, taking a
  documented fallback. Ask the orchestrator. Small names inside the core are the builder's.
- **Close-out.** Each Task ends with a comment listing: gates at start and end, each allowed baseline difference
  with its pending case, each Spec line changed (also in `wiki/specs/spec-log.md`), and the handoff items below
  written as comments on the receiving Task.

## T54. Core consolidation (steps A0 to A4)

Make `World.owed` the one holder of endings, `start` the one delivery point, records a projection of what a step
touched, and `evidenceOf` the one builder of a report.

**Why now:** an ending lives in four places (`World.parked`, `World.kept`, the lane's Kept state, `Tries`) and
moves issue their own writes and reports. Known bugs follow from that, and T18 builds four policies on this core.

**Read first:** `code:wiki/plans/flow/references/proposals/fable-architecture-consult-3-2026-11-12.md` (Part
2, C2, C3, C9); `code:packages/flow-state-v3/prototypes/t54-skeleton` (the target types; it compiles);
@spec.WriteLanes (R5, R6, R10, `model`, I27 to I37); @spec.Actors (R8, R10, R15, R20 to R22, I40, I41);
@spec.WriteAhead (R4, R5, R10, I20 to I22); @spec.Restore (R1, R3); @spec.Turn.R26; @spec.Codec.R5.

**Record differences:**

- The record's comment of 2026-11-12T07:14:01Z (GEN-pay-search-25) is stale: `974ad3a1` fixed the model and
  emptied `regressionsOwed`. No work is owed for it.
- The record's cost baseline names S08 and S16; S08 does not exist until T18, so T54 measures on S16 and T18
  repeats the measure on S08.
- The record's "five pending cases" are not in the suite yet: step A0 writes them (A-1 to A-5).

**Decisions already made:**

- Endings apply at settlement (`Cue.Answered`). The fallback (keep `Settled` as a fourth `Delivery` state) is
  allowed by @spec.WriteLanes composition, but the builder asks the orchestrator before taking it.
- Only Kept rows block a key (`keptOn`). `Identity` is T9's. The capture window stays in the host.
- Attempt ids: a seed of at least 128 bits per boot, never restored, plus the Attempts' own counter. The id's
  text form is the builder's, with one rule: two boots never give equal ids.
- No new report kind: a row's birth is Ended, waiting is Parked, resuming is Unparked, closing is Delivered or
  Recorded. No `Owed` report, no `owed()` on the Port.
- Records: three kinds, one `format` number, the field lists of @spec.WriteAhead.R5; one owed list per identity.
- A saved row holds no `owner`, `current`, audience or delivery beyond `kept`: a row decoded from a record is
  owed to the identity, is Waiting (Kept when `kept`), and is delivered current from the active leaf
  (@spec.Turn.R20's adopted ending).
- `start` owes no derived unknown { Restored } for a Held head on a Releasing lane (WriteLanes I15); it still
  moves every Waiting and Kept row. It walks lanes in lane-id order.
- Promotion never waits on a Kept row. A Refused ending's turn leaves its row to the retry; Unhandled and Denied
  close it Delivered (@spec.Turn.R26).
- Opaque types as in the skeleton: branded `Ledger` and `Life`; `Report` is the branded Evidence only
  `evidenceOf` returns. T54 keeps `World.life` in `Disposal`'s shape; `Life` is T55's.
- T54 routes read endings through `owe` with their audience and changes nothing else about reads.

**Parts:** the base parts, usual and stress; A-2 to A-4 and A-12 to A-15 need the stress profile's disposals,
reloads and storage faults.

### Requirements (each red first)

- **A-1.** Two endings refused twice on one lane are two rows, neither replaces the other (WriteLanes I31;
  WriteLanes T24). **Check:** new case, red today (`persist.ts` keep replaces). **Wrong:** `ledger.keep-replaces`.
- **A-2.** An ending with no lane (a declined commit's) queued in the mailbox at disposal goes Waiting and is
  heard once by the identity's next incarnation (Actors I41; Actors T22). **Check:** new case, red today.
  **Wrong:** `ledger.suspend-skips-laneless`.
- **A-3.** A head held from Recapturing at Runtime disposal is saved Held, so the next boot does not wake its
  identity (Actors T23; Restore I1). **Check:** new case, red today (the boot wakes it). **Wrong:**
  `boot.wakes-held-from-recapturing`.
- **A-4.** After Runtime disposal a never-sent head has no lane, and its NotSent { Disposed } is heard once after
  a reload (Actors R22, I29; Actors T23). **Check:** new case, red today. **Wrong:**
  `disposal.drops-unsent-ending`.
- **A-5.** A Kept row gets one try per Start and is Kept again if refused, across a Start with the refusing
  guard left on (Actors I24; WriteLanes `model` LedgerFunctions start). **Check:** new case. **Wrong:**
  `ledger.start-skips-kept`.
- **A-6.** An ending applies to its lane at settlement: a call succeeds, a cancel is admitted before the
  success's turn, and the machine hears success with the lane Idle (WriteLanes I32; WriteLanes T25). **Check:**
  new case, red before `Cue.Answered`. **Wrong:** `lanes.apply-at-admission`.
- **A-7.** Only a Kept row blocks a key; a Retrying row and a Kept row on its one try block nothing (WriteLanes
  I33; WriteLanes T26). **Check:** new case. **Wrong:** `lanes.retrying-blocks`, `lanes.kept-does-not-block`.
- **A-8.** Only a close removes a row; a row closes at most once; every open row has a waker; its life is
  reported Ended, Parked, Unparked, then Delivered or Recorded (WriteLanes I29, I30, I34; WriteLanes T23).
  **Check:** oracle `owed-rows` (new), folding every part's reports. **Wrong:** `ledger.close-no-report`,
  `ledger.stale-reference-delivers`.
- **A-9.** Conservation with declines: commits admitted equal Attempts minted plus declines plus commits queued
  or ended while queued, and each decline has one ending (WriteLanes I27). **Check:** oracle `delivered-once`
  (exists) extended to count an Attempt-less ending by actor, operation and order. **Wrong:**
  `lanes.decline-no-ending`.
- **A-10.** Attempt ids come from their own counter (WriteLanes I35; WriteLanes T27). **Check:** new case: one
  script with and without other ids minted between its commits gives equal Attempt ids. **Wrong:**
  `mint.shared-counter`.
- **A-11.** `mayHaveApplied` is derived by `sentBefore` (WriteLanes I36). **Check:** written in A0 while the
  stored flag exists: at every step of every part, the stored flag equals `sentBefore(head)`; kept afterwards as
  a test of `sentBefore` against the table. **Wrong:** `lanes.sent-before-ignores-held`.
- **A-12.** One `start` delivers on reload, return and adoption, with the same reports for the same rows and
  Held heads; a boot delivers and parks nothing (Actors I40; Restore R1; Actors T21). **Check:** new case over
  all three. **Wrong:** `start.boot-delivers`, `start.adoption-own-path`.
- **A-13.** Every key written is `actor/<identity>`, `lane/<lane>` or `owed/<identity>`, each with `format`; no
  lane record has `mayHaveApplied`; the owed record lists exactly the identity's rows in owed order (Codec I7;
  WriteAhead I20; Codec T6; WriteAhead T15). **Check:** store contents after each step of every part.
  **Wrong:** `record.kept-kind`, `record.lane-may-have-applied`.
- **A-14.** Every lane and identity a step changed is in that step's write list, and no move writes a record
  (WriteAhead I21). **Check:** reload equivalence: at every crash point of every part, boot and compare the
  reports and snapshots after the boot with the baseline's (`crash` gate, extended). **Wrong:**
  `persist.skips-touched-owed`.
- **A-15.** A row leaves the owed record only in the batch that carries the actor record of the turn that heard
  it, and a batch lands whole or not at all (WriteAhead I22, I10; WriteAhead T16). **Check:** drop each batch
  whole, boot, check A-9's conservation. **Wrong:** `store.splits-batch`.
- **A-16.** Each turn yields one Turn act, and reports derive from acts in act order (Turn I36; Turn T24).
  **Check:** the report stream recorded at the end of A3, over every part and both seeds, is byte-equal after
  A4. **Wrong:** `turn.unhandled-no-act`, `turn.issue-before-turn`.
- **A-17.** No report, snapshot or `O.x.get` row carries a row id, lane id, ticket, timer or record key
  (WriteLanes I37; WriteLanes T28). **Check:** scan over every part. **Wrong:** `report.carries-owed-id`.
- **A-18.** The boot seed has at least 128 bits and is fresh each boot (WriteLanes I28). **Check:** a host test
  in `src/host/` on the seed's width, and a case that two boots mint no equal Attempt id. **Wrong:**
  `seed.thirty-two-bits`. This Invariant's row in `conformance/not-yet.ts` is closed here, not in T18.
- **A-19.** Every lane-table cell behaves as WriteLanes `model` Cell says, for the cells that exist under
  `reject` and the cancel policy today. **Check:** a table test, one row per cell. **Wrong:** one per cell,
  named `cell.<phase>-<cue>`.

### Steps

Each step ends with all gates no worse, `nub run check` at zero, and a Task comment.

- **A0, checks only, no core change.** Write A-1 to A-19's checks and wrong runtimes. Record the differential
  baseline: per step the reports, commands and store contents, over every production case and generated part,
  both seeds; the Task comment names where it lives. Add the cost scenarios to `bench/bench.ts` and record the
  cost baseline (turn cost; `ready()` with 64 queued declines; 500 keyed lanes on S16). Also two guard checks:
  `unpark` is safe only because one step drains the mail; dropping the stored `mayHaveApplied` changes no report.
  **Check:** A-1 to A-6 red; A-11 green with its wrong runtime red; wrong runtimes for code that does not exist
  yet are listed as owed, each to the step that builds it.
- **A1, the ledger in memory.** `World.owed` and the five functions replace `World.parked`, `World.kept` and
  `Tries`; `Cue.Answered` replaces `Settled` and `Ended`; `Keep`, the Kept lane state and `Settled.route` go;
  Attempts get their own counter and the 128-bit seed; old record keys are still written. **Check:** A-1, A-2,
  A-5 to A-11, A-18, A-19 green; baseline equal bar named entries.
- **A2, one `start`.** Reload, return and adoption call it; `boot` parks nothing and `deliverRestored` goes.
  **Check:** A-3, A-12 green; post-boot reports equal per identity.
- **A3, diff-written records.** Setters note touched lanes and identities; the step projects each changed entry
  once (`encodeActor`, `encodeLane`, `encodeOwed`); `Due` is derived (Awaited when a touched head entered
  Acknowledging or Recapturing, Now when an actor record is removed or an incarnation ended, else Later).
  `persist`, `park`, `keep` go. **Check:** A-4, A-13 to A-15 green; reload behaviour equal at every crash point
  (bytes may differ). Record the report stream for A-16.
- **A4, acts into `evidenceOf`.** `tx.emit` and `insertEvidence` go; Evidence constructors are private to
  `evidence-of.ts`. **Check:** A-16, A-17 green; cost baseline re-run, both results in the Task comment.

### Traps

- **Mail holds a reference, not the ending.** A reference whose row is closed must do nothing, and a refusal adds
  a new reference behind queued mail. Copying the ending into mail brings the old bug back.
- **Kept on its try is Retrying.** During a Start's one try the row does not block; if refused it is Kept again.
  A commit admitted in that window is allowed (WriteLanes R6).
- **A1's adapter.** If keeping the old record keys needs an adapter larger than the step, the documented
  fallback is to merge A1 and A3; ask first.
- **The byte-equal stream** in A4 is the refactor's strongest check. An "equal after sorting" comparison is a
  weaker check and needs the orchestrator.
- **Old citations.** Conformance files cite reworded rules and a stored `mayHaveApplied`
  (`wiki/specs/spec-log.md`, last section). Update a citation when its file is touched; mutants that edit a
  stored `mayHaveApplied` are rewritten against `sentBefore`.

### Must not decide alone

Taking the `Settled` fallback; merging A1 and A3; any allowed baseline difference that cites no pending case;
`Identity`, the tagged result or one `Commit` cue (T9, T18); whether a row shows "kept" to user code (T18); any
field of the three records beyond @spec.WriteAhead.R5's lists.

### Handoffs (comments on the receiving Task)

- **T18:** a table over Idle and head phases; one `Answered` cue; `owe` and `keptOn`; no persist or emit API; Q5
  as "close the lane's kept rows, then mint"; the cost baseline to repeat on S08.
- **T19:** writes as a flat per-step list with `Due` derived; the batch-scope question; the Recapturing
  projection rule; the capture window still in the edge.
- **T20:** three record kinds with `format`; a boot that sorts and derives Restored.
- **T21:** read endings are rows with a chosen audience; `World.reads` untouched.
- **T55:** `World.life` still `Disposal` in shape; the three places the host reads `driver.world()`
  (`src/host/runtime.ts:116, 132, 188`).

## T18. Lane policies and endings by origin

Build `latest`, `serialize` and `cancel` as rows of the lane table, and split endings by origin (option B).

**Why now:** production refuses every policy but `reject`, and composites A, B, C and G wait on this.

**Read first:** @spec.WriteLanes (R2 to R4, R6 to R14, R17, Q5, `model` Cell, Promote, Displaced; I4 to I20,
I27, I33, I38; T3 to T9, T26, T29); @spec.Actors.R15; @spec.Restore.R3; the wide consult's W1, option B
(`code:wiki/plans/flow/references/proposals/fable-wide-consult-2026-11-12.md`); the fixture catalogue;
`conformance/write-lanes/remainders.ts`; @task.V3.T18's comments.

**Record differences:**

- "I28 moves here" in the record is void: T54 closes WriteLanes I28 (A-18).
- CleanupFailed, ReleaseOverdue and the type of `dispose` (comment of 2026-11-12T04:08:02Z) are T55's to raise.
- The second kept ending and the lane-less ending (comments 04:39:47Z) are fixed by T54 (A-1, A-2).

**Decisions already made:**

- Option B (the user, 2026-11-12): four mapping keys `success:`, `failure:`, `notSent:`, `unknown:`;
  `Flow.NotSent` tags Cancelled, Restored, Rejected, Overloaded, StorageRefused, Disposed, NoPersistence,
  OldVersion, Unencodable, ModuleDisabled; `Flow.Unknown` tags Outcome { error }, StillUnknown { failure },
  Defect { cause }, Cancelled, Restored, Interrupted, StorageRefused, Disposed; both `Data.TaggedEnum` on `_tag`
  and Schema tagged unions. ReservedReason is retired; `Abandoned` is dropped.
- `cancelAll` and code `cA` are deferred (revisit.md). Codes here: lt se ca ad.
- Q5 (orchestrator, the record's comment of 2026-11-12T07:04:28Z): a cancel-policy commit on a key with Kept
  rows closes them Recorded { letGo }, then mints. Step 1 writes this into @spec.WriteLanes Q5 and the Cell text
  with a spec-log line; it is decided, not the builder's guarantee change.
- A commit beside a Kept row declines NotSent { Rejected } under reject, latest and serialize.
- serialize's bound is 64; the 65th declines Overloaded. A decline's mapper gets no `attempt`.
- The lane record gains one field for the saved queue (@spec.Restore.R3 gives it to T18): proposed `queue`, the
  queued commits' inputs in order. The name and shape are confirmed by the orchestrator before step 4.

**Parts:** S01, S24, S08, S03, S22 flat, S12, S23, S09 flat (built here from the catalogue), plus the base parts
re-judged.

### Requirements (each red first)

- **L-1.** latest: Idle mints; a never-sent head (Acknowledging, Unsent) is superseded as evidence and the newer
  commit promotes; every other phase queues the newer commit, ending a queued one Superseded; a head with a
  pending cancel (Withdrawing) is never superseded (WriteLanes `model` Cell; WriteLanes R7, R14). **Check:** cell
  table; S01, S24. **Wrong:** `lane.latest-supersedes-on-wire`, `lane.latest-supersedes-withdrawing`.
- **L-2.** serialize: Idle mints; otherwise appends to W up to 64; the 65th declines NotSent { Overloaded }
  (WriteLanes R7, I8). **Check:** cell table; S08, S03. **Wrong:** `lane.serialize-65th-queues`.
- **L-3.** cancel policy: a new commit interrupts the wire; the displaced Attempt's ending is evidence unless a
  cancel was pending on it (WriteLanes `model` Displaced; WriteLanes R7, R10). **Check:** cell table; S12, S23.
  **Wrong:** `lane.cancel-delivers-displaced`.
- **L-4.** A queued commit gets its Attempt at promotion, and every minted, promoted or re-sent Attempt is
  invoked after its turn ends (WriteLanes R5, R8). **Check:** oracle `attempt-identity` (exists); S08.
  **Wrong:** `lane.queued-mints-early`.
- **L-5.** W's head is promoted only when the addressable Attempt is resolved, released or superseded: never
  past a Held head (WriteLanes I11; WriteLanes R8). **Check:** oracle `lane-queue` (exists); S03, S22.
  **Wrong:** `lane.unknown-promotes`.
- **L-6.** Q5 as decided above. **Check:** new case: two Kept rows on a key, a cancel-policy commit; both rows
  report Recorded letGo, then one Attempt is minted. **Wrong:** `lane.q5-keeps-kept-row`.
- **L-7.** A cancel on a Held head whose key has a Kept row frees the key in one cancel: the head is released
  and the Kept rows close letGo (WriteLanes R14). **Check:** new case, red today. **Wrong:**
  `lane.cancel-leaves-kept`.
- **L-8.** A kept unknown of an Attempt closes when a later re-send of that Attempt resolves it; it is not
  delivered at the next boot (WriteLanes R10; the record's comment of 03:54:12Z). **Check:** new case, red
  today. **Wrong:** `lane.kept-unknown-survives-resend`.
- **L-9.** idle(k) denies while a Kept row blocks the key (WriteLanes I13). **Check:** new case, red today.
  **Wrong:** `guard.idle-ignores-kept`.
- **L-10.** `failure:` is exhaustive over the commit's own failure tags and nothing else; an author tag named
  `Cancelled` is the author's and is a definite failure (WriteLanes R3, R4, I4). **Check:** type test and new
  case, red today (`src/core/cells.ts:131`). **Wrong:** `map.author-tag-as-flow`.
- **L-11.** `notSent:` receives a `Flow.NotSent`; unmapped, the ending is evidence (WriteLanes R4, R10).
  **Check:** new case; S08 (Overloaded), S12 (Cancelled). **Wrong:** `map.not-sent-under-failure`.
- **L-12.** `unknown:` is one event, or a record over `Flow.Unknown`'s tags with a required `otherwise`
  (WriteLanes R4). **Check:** type test and new case. **Wrong:** `map.otherwise-optional`.
- **L-13.** `Match.tag` narrows both values and each round-trips its Schema (WriteLanes I38; WriteLanes T29).
  **Check:** new test building every tag. **Wrong:** `value.tagged-by-why`.
- **L-14.** An Unencodable decline's mapper receives the value the turn asked to send (WriteLanes R12).
  **Check:** new case, red today. **Wrong:** `map.unencodable-gets-why`.
- **L-15.** A mapper receives (value, { input, attempt, progress, key }) (WriteLanes R4), and a mapper that
  throws reports an issue naming the ending and its cause (Actors R15). **Check:** new case, red today
  (`src/machine.ts`, the mapper context is {}). **Wrong:** `map.throw-drops-cause`.
- **L-16.** A definite failure after an unknown send of the same Attempt ends unknown StillUnknown { failure },
  carrying the failure (WriteLanes R2). **Check:** new case; its entry in `conformance/write-lanes/remainders.ts`
  is removed. **Wrong:** `lane.still-unknown-drops-tag`.
- **L-17.** Under latest and serialize the lane record holds its queue; at Start each queued commit is owed
  NotSent { Restored } before its head's row (Restore R3; WriteLanes `model` LedgerFunctions start). **Check:**
  store contents and a reload case on S08, S03. **Wrong:** `record.queue-not-saved`,
  `start.head-before-queued`.
- **L-18.** Type tests (@plan.Operations.V1): a missing failure tag and a wrong mapper annotation are errors;
  the single-event `failure:` and `unknown:` fallbacks compile. **Check:** `*.type-test.ts`, each planted wrong
  once. **Wrong:** none; the planted error is the red.
- **L-19.** Every entry of `conformance/write-lanes/remainders.ts` (WriteLanes I5, I13, I17, I23, I24, I27 and
  the rest it lists) is closed by a case or oracle, and the file is empty or deleted. **Check:** the `coverage`
  gate. **Wrong:** one per entry, named from its Invariant.

### Steps

1. **Suite half.** Rule Q5 in the Spec (decided above); add the policies and option B to the Spec model; build
   the eight parts from the catalogue and enable them on the model; model mutation; the audit. **Check:** `parts`
   and `model-mutation` green on the model. **Handoff:** the Spec-log line.
2. **Endings by origin** (L-10 to L-16): the two values plus Schemas; the four mapping keys; migrate every
   fixture's mappers in the same commit. **Check:** the type tests; every base part green on `reject`.
3. **One `Commit` cue and the policy rows** (L-1 to L-9): one policy at a time, latest, serialize, cancel; each
   lands with its cell-table rows and one wrong runtime per cell. **Check:** the WriteLanes area on production
   per policy; the eight parts green.
4. **Saved queue** (L-17), after the orchestrator confirms the field. **Check:** reload equivalence at every
   crash point on S08 and S03.
5. **Close the remainders** (L-19) and the record's template items: codes lt se ca ad declared; the combination
   and feature-matrix gates; first-contact reds classified; held-out seeds; the Fable sample; the benchmark
   replay and the cost measure on S08; phase-out step 5 (create the six lab twins Serialize, Latest, Cancel,
   LateQueue, Keyed and Held in `packages/flow-state-v3/fixtures/`; `conformance/fixtures/one-lane.ts` but
   Release, and `keyed.ts`, are deleted once the derived reference equals them) and its four validations.

### Traps

- **Withdrawing is not superseded.** Under latest, a head with a pending cancel keeps its place.
- **A Kept row never stops a promotion**; it only makes a new commit decline. Under cancel it is Q5 instead.
- **Declines have no Attempt.** Their mapper's `attempt` is absent; oracles name them by actor, operation, order.
- **`{ why }` is everywhere today** (`src/core/cells.ts:68-72`, `src/core/lane-moves.ts`,
  `src/core/lanes.ts:94-101`, `fixtures/sign-in.ts`, `fixtures/transfers.ts`, `fixtures/sync.ts`,
  `conformance/machines/pay.ts:64,102,356`). Change the value and every reader in one commit, or the suite will
  not load, and a suite that cannot load must never count as a kill.
- **`cancelAll` is deferred.** Its cases, mutants and the `cA` code stay out; do not port them.
- **Release on a Held lane:** WriteLanes I12 and the Cell text for release were left as found and may disagree.
  Read both before coding the cell; if they disagree, ask the orchestrator.

### Must not decide alone

The public row fields (`waiting`, `outstanding`, the "kept blocks" boolean and its name); whether
`Attempt.mayHaveApplied` stays public; the 64 bound; the saved queue's field name and shape; a tagged result
replacing `channel`, `reason` and `value` on a row (question 2 below); deleting a lab descriptor before the
derived reference equals it; Release on a Held lane if the Spec lines disagree.

### Handoffs

- **T55:** CleanupFailed, ReleaseOverdue and `dispose`'s type (the record's comment of 04:08:02Z).
- **T19:** the saved queue's field in the lane record; captures that queue and coalesce.
- **T21:** read endings follow option B (@spec.Reads.R9: `Flow.ReadStopped` under `stopped:`, names proposed).

## T55. Runtime life (steps B1 and B2) and the host shell

Replace `Disposal` and the host's lifecycle flags with one `Life` and one `admit` table, and move the final write
and its 5 s bound into the core.

**Why now:** the Runtime's lifecycle is an implicit state machine across the core and `host/runtime.ts`; T19
rebuilds that host and should inherit one `Life`.

**Read first:** @spec.Actors (R2, R4, R20, R22, R23, `model` Life and Verdict, I3, I29, I30, I35, I41 to I43,
T23 to T25); `code:packages/flow-state-v3/prototypes/t54-skeleton/life.ts`;
`code:packages/flow-state-v3/src/host/runtime.ts`; `code:packages/flow-state-v3/src/host/driver.ts` (dispose,
lines 195 to 212); the wide consult's W2.

**Record differences:**

- "`host/fibers.ts` a `FiberMap`" is already true; the work is removing the hand-built Scope, services context
  and `booted` Deferred around it.
- @spec.Actors composition still says the host keeps "the Scope, the services Layer and one Deferred". With the
  shell, `ManagedRuntime` owns the Scope and the services, and `ready` shares its build's Exit. The builder
  rewords that sentence with a spec-log line; it is no guarantee change.

**Decisions already made:**

- The `admit` table is @spec.Actors `model` Verdict's, cell for cell. Its inputs are the eleven of
  `src/core/input.ts` plus two new ones this Task adds, `Start` (Inert to Booting) and `BootFailed` (Booting to
  Failed). `ensureActor` and `createActor` both arrive as `Ensure`.
- Send while Booting rejects RuntimeNotReady until T9 builds the boot queue.
- R22's reading: after disposal no Held head and no owed ending is dropped.
- The 5 s runs from the first call to `dispose` and covers the final write. The core holds the bound as its
  existing Bound timer (an Arm command the driver sleeps on with Effect's Clock) and the final write as a ticket
  in `Disposing { final }`. The core never reads a clock.
- Host shell (wide consult W2): `ManagedRuntime` plus the driver; `dispose` ends in `managed.disposeEffect`.
- Only two reports for Life: RuntimeDisposed, and the final write's StorageFailure.
- Blocked by T18 for ordering only.

**Parts:** every case and part ends with the suite's judged disposal (`conformance/dsl/case.ts`, `playCase`);
S03 and S12 carry calls on the wire at disposal.

### Requirements (each red first)

- **B-1.** `admit` gives every (Life, input) pair exactly one verdict, as Actors `model` lists (Actors I42;
  Actors T24). **Check:** a table test with one row for each of the 6 × 13 cells, expected values copied from
  the Spec. **Wrong:** one per cell, named `admit.<life>-<input>`.
- **B-2.** Admission follows `admit` alone: no host flag decides (Actors I42). **Check:** a host test drives
  the Runtime through each Life by the public API (construct; `ready`; a boot whose `load` fails; `dispose`
  during boot; `dispose`) and asserts each call's result equals the table's verdict. **Wrong:**
  `host.flag-admits-after-dispose`.
- **B-3.** `ready` after `dispose` rejects RuntimeDisposed; before ready succeeds, `ensureActor` and
  `createActor` reject RuntimeNotReady (Actors R2, R4, I3). **Check:** host cases. **Wrong:**
  `life.ready-after-dispose-ok`.
- **B-4.** The 5 s runs from the first call to `dispose` and covers the final write: a call on the wire answers
  3 s after the call and the final write never answers; StorageFailure is reported at 5 s, not 8 s (Actors R23,
  I43; Actors T25). **Check:** new case. Run it on today's code first: `driver.ts` already takes the bound at
  the call, so it may be green; then its red is the wrong runtime, and the comment says so. **Wrong:**
  `life.bound-from-last-fiber`.
- **B-5.** The final write is one ticket in `Disposing { final }`; Stored or Refused for that ticket ends the
  disposal, and for any other ticket changes nothing (Actors `model` Verdict, the Stored and Refused line).
  **Check:** new case and the table rows. **Wrong:** `life.late-stored-reopens`.
- **B-6.** Runtime disposal suspends every identity's rows, consumers before providers, and drops none (Actors
  R22, I29, I41). **Check:** new case on S03 and S12: dispose with endings in the mailbox, reload, each is heard
  once. **Wrong:** `life.dispose-skips-suspend`.
- **B-7.** A second `dispose` changes nothing, and after disposal starts no commit or read is invoked (Actors
  R20, I30). **Check:** the lifecycle cases in `src/host/lanes.test.ts` (exist) and a new case for the second
  call. **Wrong:** `life.second-dispose-rewrites`.
- **B-8.** The host reads no World field and builds no report (round 3, C7; Actors composition). **Check:** the
  core exports `World` as an opaque branded type; a `*.type-test.ts` in `src/host/` has `@ts-expect-error` on
  reading `world.lanes` and on building an Evidence. **Wrong:** none; removing the brand makes the
  `@ts-expect-error` lines fail, which is the red.
- **B-9.** Host shell: no fiber outlives `dispose`, and `ready` gives the build's Exit to every caller
  (wide consult W2). **Check:** a host test written and seen red against a planted leak before the swap.
  **Wrong:** `host.dispose-leaks-fiber`.

### Steps

- **B1.** `Life` replaces `Disposal`; `admit` is one total table in `src/core/life.ts`; `Start` and
  `BootFailed` join `Input`; the host's `started`, `open`, `closed()` and `admitting` go, and its guards call
  `admit` and throw the FlowError a Reject names. **Check:** B-1 to B-3, B-7 green; the report stream equal to
  the Task's start.
- **B2.** The final write and its bound move into the core; the driver's flush, bound and `Issue` go; `dispose`
  sends DisposeRuntime, waits for `Out.life` to read Disposed, then closes. The three `driver.world()` reads in
  `src/host/runtime.ts` go. **Check:** B-4 to B-6, B-8 green.
- **Shell.** `ManagedRuntime` replaces the hand-built Scope, services context and `booted` Deferred. **Check:**
  B-9; every gate no worse; the Actors composition sentence reworded.

### Traps

- **Send while Booting rejects for now.** Do not build the boot queue here.
- **Stored and Refused while Disposing run** (they answer the final write); in Inert, Booting, Failed and
  Disposed they drop.
- **`Life` is opaque**, as `Ledger` is: only `life.ts` builds one. A cast in a test means the design is wrong;
  report it.
- **`Store`, `Page`, the seed and the edge step are T19's.** Leave `edge.ts` alone beyond removing the flush the
  driver called.
- **No disk reader yet.** B-6 is judged by what a reload hears, and by store contents read from the harness side.

### Must not decide alone

Any cell of the `admit` table that differs from Actors `model`; a new Life report; the type of `dispose`
(CleanupFailed, ReleaseOverdue) in the public API; folding this Task into T19.

### Handoffs

- **T19:** the final write is a ticket; `Out.life`; the shell it builds the `Store` and `Page` layers on.
- **T9:** `Life` is done (strike it from T9's brief); Send while Booting is its cell to change.

## T19. Durability: the Store, write-ahead and the edge

Build Flow's `Store` service, the write-ahead rules and a pure edge step, so a record on disk can be judged.

**Why now:** the core returns writes as data and nothing durable judges them; T20 needs bytes to restore from.

**Read first:** @spec.WriteAhead (all); @spec.WriteLanes (I7, I8, I27); @spec.Actors (I4, R20, R21);
@plan.Persistence.O1; the wide consult's question 4 and W2; `code:packages/flow-state-v3/conformance/README.md`
("Planned Port changes": the disk reader); `partsOwed` in `code:packages/flow-state-v3/conformance/parts/play.ts`;
`code:packages/flow-state-v3/src/host/host.ts` (today's `Store` and `Host`) and `src/host/edge.ts`.

**Record differences:**

- The record's comment names `PART-transfers-stress-12`; the cases in `partsOwed` today are
  `MIX-sync+transfers+sign-in-stress-109` and `MIX-sync+transfers+sign-in-stress-2`. Use those.
- "Add an Invariant for WriteAhead R2": the text is W-2's below, added to the Spec as WriteAhead I24 with a
  spec-log line.
- Actors I4 is listed under T9 in `conformance/not-yet.ts`; the record moves it here. Move the row.
- WriteAhead I20 to I23 have no owner in `conformance/not-yet.ts`; T54 builds I20 to I22's checks and T19 owns
  I23 and re-judges all four from bytes.

**Decisions already made:**

- Flow's own `Store` service: `load` and one atomic `write(batch)`; no `KeyValueStore` adapter; shipped here as
  `layerMemory` only (the user, 2026-11-12, Q4 A). `layerIndexedDb` is T58's. `load`'s typed failure is
  `StoreUnavailable` (proposed name, from W2); `write`'s refusal stays `StoreRefused` (exists).
- Untyped missing provision fails `ready` with StorageFailure (@spec.WriteAhead.R2).
- One batch stream per Runtime, one batch out at a time (@spec.WriteAhead.R12).
- Captures: within 5 s or once the batch out answers, and at once on hide, pagehide and the steps
  @spec.WriteAhead.R10 lists. The capture window stays in the host.
- Host (W2): a `Page` service replaces `Host`'s visibility and carries both signals R10 names (hidden and
  pagehide; pagehide is new); the seed is at least 128 bits from `effect/Crypto` (marked unstable in Effect; say
  so in the comment); a `Loaded` layer reads and validates storage before any app service.
- `edgeStep(state, input)` has three states, Clean, Waiting and Out (the record's acceptance); how today's
  five flag combinations in `edge.ts` map onto them is shown in the step's table test, one row per cell.
- Code: wa.

**Parts:** S13 (built here from the catalogue), S08 and S16 for the benchmarks, and every earlier part
re-judged by the WriteAhead oracles; storage faults under the stress profile.

### Requirements (each red first)

- **W-1.** `Store` has exactly `load` (typed failure) and `write(batch)`; no `purpose`, no `acknowledges`
  (WriteAhead R2, I23). **Check:** a type test on the service, and a case counting one `Store.write` per batch
  on a fake Store. **Wrong:** `store.write-per-record`.
- **W-2.** WriteAhead I24 (new, verbatim): "A Runtime with a persisted identity and no `Store` provided fails
  `ready` with StorageFailure and invokes nothing; a provided `Store` without `load` or `write` is a type
  error. [@R2]" **Check:** new case and type test (row Q02 of `conformance/parts/feature-rows.ts:221`, whose
  text still says KeyValueStore; reword it). **Wrong:** `store.missing-is-memory`.
- **W-3.** One batch stream per Runtime: no identity's record lands without the records the same step changed,
  another identity's included, and at most one batch is out (WriteAhead I23; WriteAhead T17). **Check:** new
  case: actor A hears an ending and sends to B in one step; kill the Runtime after each write; after each
  boot B has the event iff A's row is gone. Expect red on today's per-actor batches. **Wrong:**
  `store.per-actor-batches`.
- **W-4.** For a persisted identity an Attempt is invoked only after it is Acknowledged (WriteAhead I15).
  **Check:** oracle `write-ahead` (new), comparing the disk reader's bytes with the fake server's calls.
  **Wrong:** `lane.ackout-false`.
- **W-5.** A dirty record's capture is issued within 5 s or once the batch out answers, and at once on hide,
  pagehide and an at-once step (WriteAhead R10, I12). **Check:** oracle `capture` (new) on the fake clock and
  page. **Wrong:** `edge.capture-unbounded`, `edge.ignores-pagehide`.
- **W-6.** A Recapturing head is written with the `retryCount` its re-send will carry, so a boot never restores
  a count from before the re-send (WriteAhead R13; WriteLanes I7). **Check:** case
  `MIX-sync+transfers+sign-in-stress-109` passes and its `partsOwed` entry is deleted. **Wrong:**
  `record.recapture-old-count`.
- **W-7.** A forgotten actor's unacknowledged Attempt whose batch the store refuses ends NotSent
  { StorageRefused }, so an adopting incarnation never mints a second Attempt on its lane (WriteAhead R13;
  Actors R20, R21; WriteLanes I8, I27). **Check:** case `MIX-sync+transfers+sign-in-stress-2` passes and its
  `partsOwed` entry is deleted. **Wrong:** `store.refusal-leaves-head`.
- **W-8.** The owed record lists exactly the identity's rows owed to the identity, in order, kept ones marked,
  and is absent when empty (WriteAhead I20; WriteAhead T15). **Check:** the disk reader after each step.
  **Wrong:** `record.owed-drops-kept-mark`.
- **W-9.** After any interruption the readable scope equals a complete landed batch, and a row leaves the owed
  record only with the actor record of the turn that heard it (WriteAhead I10, I22; WriteAhead T16). **Check:**
  the `crash` gate with torn batches. **Wrong:** `store.splits-batch`.
- **W-10.** The disk reader on the Port shows records only (no ticket, lane id or row id) and derives purpose
  and acknowledgement from bytes. **Check:** a test of the Port's reader in `conformance/` (new). **Wrong:**
  `port.reader-leaks-ticket`.
- **W-11.** `edgeStep(state, input)` is pure with states Clean, Waiting, Out; its runner only writes and sleeps.
  **Check:** a table test, one row per cell; the `crash` gate enumerates its states. **Wrong:** one per cell,
  named `edge.<state>-<input>`.
- **W-12.** Storage is read and validated in a layer built before any app service (Actors I4). **Check:** new
  case, red today: an app service observes that no record was read before it was built. **Wrong:**
  `host.service-before-load`.

### Steps

1. **Suite half.** The WriteAhead model section; the disk reader on the Port (W-10) reading the fake world's
   store; oracles `write-ahead` and `capture` (W-4, W-5) and the record checks (W-8, W-9); S13 on the model.
   **Check:** `parts` and `model-mutation` green on the model; the oracles run on today's host and their reds
   are recorded and classified.
2. **`Store` and `layerMemory`** (W-1, W-2): the service, `StoreUnavailable`, WriteAhead I24 in the Spec.
3. **`edgeStep`** (W-11, W-5, W-3, W-9): replace `edge.ts`'s flags; the runner writes and sleeps on Effect's
   Clock; one stream per Runtime.
4. **The two production reds** (W-6, W-7): each flips its `partsOwed` entry.
5. **Layers** (W-12): `Loaded` before app services; `Page`; the seed from `effect/Crypto`.
6. **Template items:** code wa declared; the app mix runs it; the combination and feature-matrix gates;
   held-out seeds; the Fable sample; the benchmark replay (`ready()` with 64 queued on S08, 500 keyed lanes on
   S16) against T54's cost baseline.

### Traps

- **Durability judged from the runtime's own report** passes a runtime that never writes. Every W check reads
  bytes through the disk reader.
- **"Within 5 s" is not a bound on storage.** Nothing bounds when a store answers; WriteAhead I12 bounds when a
  capture is issued.
- **The capture window stays in the host** (decided). Do not move it into the core.
- **IndexedDB is T58's.** Keep `Store` free of anything memory-specific.
- **`Life` owns disposal** (T55). The edge never decides the Runtime is done.

### Must not decide alone

Any `Store` member beyond `load` and `write(batch)`; a second batch stream; changing 5 s; a new record field;
whether a refused final write is retried (question 3 below); the name `StoreUnavailable`.

### Handoffs

- **T20:** `load`'s result and `StoreUnavailable`; the disk reader; records arrive unsorted.
- **T58:** the `Store` contract `layerIndexedDb` must meet, and the scripts the browser slice replays.

## T20. Restore: reload, owed endings at Start, quarantine and forget

Build restore from bytes: a boot that decodes and sorts records, wakes the identities that owe something, lets
their Start deliver, quarantines what it cannot read, and forget on the public route.

**Why now:** records are written but never read back, so a reload restores nothing.

**Read first:** @spec.Restore (all); @spec.Codec (all); @spec.WriteAhead (R4, R5, R9); @spec.Actors (R10, R20,
R21); `code:packages/flow-state-v3/conformance/README.md` (the `restore` row and the carry list);
`conformance/not-yet.ts` (the Restore and Codec rows).

**Record differences:**

- "Delivers owed endings at boot" in the record means at the first Start after a boot: a boot itself delivers
  and parks nothing (@spec.Restore.R1; @spec.Actors.R10).
- `conformance/not-yet.ts` gives T20 Restore I12 and I14; they are @task.V3.T56's since the split (key
  versions, saved-shape resets). Move those rows; Restore I13 and I15 (lane quarantine) stay here.
- Code `fg` is missing from `MODEL_CODES` (`conformance/parts/codes.ts`); step 1 adds it.

**Decisions already made:**

- T20 is restore only; key fingerprints, identity versions, saved-shape resets, migration steps and `previous`
  holds are T56's (orchestrator, 2026-11-12).
- A boot sorts by record key and delivers and parks nothing; Start delivers (T54 built `start`). Record-key
  order is the order (@spec.Restore.R3); creation-order keys are not built (question 4 below).
- unknown { Restored } is derived at Start and stored nowhere.
- One `format` number, 1, for all kinds. No older format exists, so no migration step is written; a newer, null
  or non-integer `format` is quarantined (@spec.Restore.R5).
- "forget" is two routes: an identity's forget (@spec.Actors.R21: removes the actor and owed records, closes
  the rows, keeps a Held lane's record unbound) and `runtime.dispose({ forget: true })` (@spec.Restore.R10:
  deletes the scope).
- Codes: sr rl fg.

**Parts:** every part built by then, each script cut at every crash point and reloaded; S13 and S08 under stress.

### Requirements (each red first)

- **R-1.** Restore reads bytes, never memory (Restore R1). **Check:** oracle `restore` (new): boot a fresh
  Runtime that shares only the disk reader's bytes with the writer, and compare what it hears with the model.
  **Wrong:** `restore.reads-memory`.
- **R-2.** After ready, the live incarnations restored from records are exactly the Owing identities whose
  actor record restores at that boot; every other record is still only a record; a boot reports no delivery
  (Restore I1; Restore T1; Actors T21). **Check:** new case. **Wrong:** `boot.delivers`,
  `boot.wakes-plain-record`.
- **R-3.** At Start: the identity's owed rows in owed order; then, lane by lane in record-key order, each queued
  commit's NotSent { Restored }, then the Held head's unknown { Restored } once, unless a row for its Attempt is
  owed; all before any external event (Restore R3, I5, I6, I7). **Check:** reload cases on S08, S03. **Wrong:**
  `start.lanes-before-rows`, `start.restored-twice`, `start.event-before-restore`.
- **R-4.** An Attempt acknowledged once restores Held and ends unknown { Restored } with the same id; one never
  acknowledged restores as never sent; no restore re-runs a turn or re-sends (Restore R3, I2, I8; WriteAhead
  I17). **Check:** new cases cutting before and after the acknowledgement lands (the `crash` gate). **Wrong:**
  `restore.unacked-as-held`, `restore.resends`.
- **R-5.** unknown { Restored } is in no record (Restore R3). **Check:** the disk reader over every part.
  **Wrong:** `record.stores-restored`.
- **R-6.** A disposed identity's rows and unbound lanes wait for an adopting ensure and are owed at that Start
  (Actors R20; Restore R1). **Check:** the regression `GEN-pay-search-25` (exists) stays green, plus a new
  production case. **Wrong:** `restore.drops-unbound-held`.
- **R-7.** One record failing to decode, or a key of no kind, is quarantined with its bytes unchanged, reported
  RecordUndecodable (proposed name), and never stops another record restoring or ready succeeding (Restore R5,
  I10, I11; Codec R5). **Check:** oracle `quarantine` (new). **Wrong:** `restore.coerces-bad-record`,
  `restore.one-bad-record-fails-ready`.
- **R-8.** A lane whose key no longer decodes or whose operation is gone is quarantined: it keeps its hold, a
  commit on its key declines NotSent { Rejected }, and a cancel clears it (Restore R8, I13, I15). **Check:** new
  case. **Wrong:** `restore.quarantined-lane-admits`.
- **R-9.** The codec: bounds, canonical bytes, strict decoding, failures (Codec I1 to I6; Codec T1 to T5).
  **Check:** vectors written from the Spec. **Wrong:** one wrong codec per test, named `codec.t1` to
  `codec.t5`.
- **R-10.** Every record has `format`, and each kind round-trips its Schema (Codec I7; Codec T6). **Check:**
  over every part. **Wrong:** `record.no-format`.
- **R-11.** An identity's forget removes its actor and owed records and closes its rows, and keeps a Held
  lane's record (Actors R21). **Check:** new case with the disk reader. **Wrong:** `forget.leaves-owed`,
  `forget.drops-held-lane`.
- **R-12.** `dispose({ forget: true })` resolves success only after deletion is confirmed; a failed deletion
  reports StorageFailure (Restore R10, I18). **Check:** new case on a store that refuses the deletion.
  **Wrong:** `forget.claims-success`.
- **R-13.** After a read failure no write to that scope happens in that Runtime, and a storage failure never
  changes committed live state (Restore R9, I16, I17). **Check:** new cases with a storage spy. **Wrong:**
  `restore.writes-after-read-failure`.
- **R-14.** Reload equivalence: at every crash point, the reports and snapshots after the boot equal the
  uncrashed run's (WriteAhead I21). **Check:** the `crash` gate over every part. **Wrong:**
  `restore.skips-owed-record`.

### Steps

1. **Suite half.** The Restore and Codec model sections; oracles `restore` and `quarantine`; code `fg` in
   `MODEL_CODES`; the parts' reload operations on the model. **Check:** `parts` and `model-mutation` green.
2. **Open item first:** the orchestrator's answer to question 1 below (how a row's `value` is encoded).
3. **Codec** (R-9, R-10): the canonical byte codec and its vectors; the three record Schemas.
4. **Boot** (R-1, R-2, R-7, R-8, R-13): decode, sort by key, quarantine, install; wake the Owing identities.
5. **Start from bytes** (R-3 to R-6): `start` already delivers; restore supplies the rows and lanes.
6. **forget** (R-11, R-12), both routes.
7. **Template items:** codes sr rl fg declared; the Restore oracles re-judge every composite; R-14; the
   combination gate; held-out seeds; the Fable sample; the benchmark replay.

### Traps

- **Restore read from memory** passes without a codec. R-1's fresh Runtime shares nothing with the writer but
  bytes.
- **Boot must not deliver.** Delivery is Start's. `GEN-pay-search-25`'s red was the model's fault, fixed in
  `974ad3a1`: the model allows that restore at the boot or at the adoption. Production does it at Start only.
- **Order across lanes:** all owed rows first, then each lane's derived endings.
- **Restore's LaneRekeyed and OldVersionLane** name one thing twice, and both are T56's; if R-8 reaches a
  re-keyed or old-version lane, stop and ask.
- **`Owing` (Restore `model`) is not `Owed`** (one ledger row, WriteLanes `model`).
- **Invariants left to cover from their Spec text** (rule above): Restore I9 and I19 have no Spec case yet;
  write one each.

### Must not decide alone

How a row's `value` is encoded when JSON cannot carry it; creation-order keys; what happens to a saved row whose
operation is gone (ask; the lane rule is R-8, the row rule is unstated); any version or key-fingerprint tag
(T56); the name RecordUndecodable; whether an identity's forget is allowed while its Attempt is on the wire.

### Handoffs

- **T56:** the record Schemas and where a version tag would sit; the quarantine path; Restore I12 and I14.
- **T58:** the reload scripts the browser slice replays on IndexedDB in Chrome and Safari.
- **T9:** boot's wake list by identity; the boot queue for a send to a persisted actor.

## Comment-ready lines for other Tasks

- **@task.V3.T24:** `EntityDomains.plan:233` still ends a write `unknown { Abandoned }` (proposed reason). The
  user dropped `Abandoned` on 2026-11-12 (Q2 A; @spec.WriteLanes.R3). T24 settles what that ending is instead.
- **@task.V3.T21:** read endings follow option B (the user, 2026-11-12, Q1 A). @spec.Reads.R9 proposes the value
  `Flow.ReadStopped` (Defect, Interrupted) under the key `stopped:`; both names are proposed and T21 confirms
  them. @spec.Reads.I22 and Reads T14 are T21's to build; T54 only routes read endings through `owe`.
- **@task.V3.T17:** `Compile.spec:104` still lists `cancelAll` and `StaticCli.spec:104` ReservedReason.

## Questions the briefs could not settle (for the user)

1. T20: how is an ending's `value` encoded when JSON cannot carry it (a Cause, a class instance)? Recommendation:
   the commit's declared Schema encodes it; with none, the value is dropped and the row carries its tag only.
2. T18: does a tagged result replace `channel`, `reason` and `value` on an owed row now, or after T20's codec?
   Recommendation: after, so the owed record changes shape once.
3. T19: is a refused final write at disposal retried inside the 5 s? Recommendation: no; one try, then
   StorageFailure.
4. T20: are creation-order record keys wanted? Recommendation: no; record-key order is deterministic, and the
   owed list already keeps an identity's order.
5. T18: the saved queue's field in the lane record. Recommendation: `queue`, the queued inputs in order.
