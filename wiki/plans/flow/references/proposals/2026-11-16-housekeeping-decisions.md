# Housekeeping decisions, 2026-11-16 (proposed)

**Status (2026-11-20, decided by the orchestrator, delegated by the user):** Q1 to Q9 settled: D1, D5, D6, D8 and D10 to
D12 merged into the Plans; D2 to D4, D7 and D9 routed (@task.V3.T105, @task.V3.T29, @task.V3.T58). Q10 B: the P2
coverage record stays dated on @phase.V3.P2, since a Plan should not hold a record that changes with every edit and the
suite has since been rebuilt. Q11: `draft/story-slice` kept as the local tag `archive/story-slice` (commits 32589054,
d62ec9e4) and the branch deleted; reverse with `git branch draft/story-slice archive/story-slice`. The text below is
prior art.

**Proposed; nothing here is decided.** Eleven questions, answered as `Q1 A`. Recommendation: merge D5, D6, D8, D10,
D11 and D12 into the Testing and Package Plans now, because tests citing each rule already pass; hold D7 and D9 (their
named evidence is not built yet) and D1 to D4 (named evidence is P4, still ahead). Add the P2 coverage record to
@plan.Runtime as verification entry V8. Delete `draft/story-slice`: everything of value on it is already on
`flow-rewrite`, in a reviewed form, and its one unique content is ten generated workload JSON files.

Evidence was found by grep in `packages/flow-state-v3/tests/` and `wiki/specs/`. Before texts are copied from the Plan
files as they stand; where Pending describes a phrase I could not find verbatim, the question says so. Any merge also
removes the decision from `wiki/plans/flow/Pending.plan` and notes the merge commit on the Epic, as Pending asks.

## Part 1. Pending decisions

### Q1. D1 to D4 (Operations O3, Machines O3, Runtime O6): merge now, or hold?

- **A. Hold all four (recommended).** Each is "proven by" a P3 or P4 production run: PAY-12, PAY-15 and LANE-04 for D1,
  Turn I15 cases for D2, `o6.*` disposal runs for D3, TURN-01 with the issue count for D4.
- **B. Merge now, as the Plan edits below.**

Why hold: the tests exist for part of this (code:packages/flow-state-v3/tests/write-lanes/payment-held.test.ts is
PAY-15; code:packages/flow-state-v3/tests/turn/refusal.test.ts is TURN-01 with the redelivery;
code:packages/flow-state-v3/tests/actors/runtime-disposal.test.ts is PAY-13 with Actors R22), but I found no test
titled PAY-12 or LANE-04, and none for Turn I15. The named proofs are incomplete, so Pending's own rule says hold.

Before and after, if B is chosen (the D2 and D3 phrases are exact; D1 and D4 are as Pending quotes them):

```text
D2 @plan.Machines.O3, Machines.plan line 232
  before: Unhandled or denied events publish nothing, change no revision and start no work
  after:  Unhandled or denied events publish nothing of their own, change no revision and start no work; an ending
          admitted in that turn publishes its lane-only change
          (cites @spec.Turn.R19; evidence: Turn I15 cases, not found yet)

D3 @plan.Runtime.O6, disposal paragraph
  before: ... and invokes what the lane table promotes
  after:  (phrase dropped; "disposal runs no machine event" at Runtime.plan line 330 stands)
          (cites @spec.Actors.R22, I30; evidence: runtime-disposal.test.ts)

D1 @plan.Operations.O3 and D4 @plan.Operations.O3
  The phrases "a cancel settles a call on the wire" and "a pre-commit defect is not retried for that input" were not
  found verbatim in Operations.plan (the second sits in Machines.plan line 236 as "It is not retried for that input").
  If B is chosen, the first edit is to locate the real sentence; a merge of D1 or D4 should wait for that.
```

### Q2. D5 (Testing O1): `run({ steps })`

- **A. Merge now (recommended).**
- **B. Hold.**

Evidence: code:packages/flow-state-v3/tests/stories/story.test.ts lines 65 and 173 run `usual.run({ steps })`;
code:packages/flow-state-v3/tests/generated/sweep.test.ts and `planted.test.ts` insert and shrink steps. The Plan
sentence it contradicts is "run() ... takes no options" (Testing.plan line 41), so merging removes a false line.
Recommendation: merge, because the shipped Story API already does this and the Plan states the opposite.

```text
before (Testing.plan, O1):
  run() is the one execution boundary; it takes no options and returns a Promise of a StoryRun with
  frames, steps, checkpoints, end, evidence, payloads and trace.
after:
  run() is the one execution boundary; it returns a Promise of a StoryRun with
  frames, steps, checkpoints, end, evidence, payloads and trace. run({ steps }) runs the Story's setup and fixtures
  over another Story.Step array, the data form of a chained Story; the reload sweep inserts steps and generated
  Stories shrink them.
```

### Q3. D6 (Testing O1, Package O1): `disposeRuntime()` as an app Story step

- **A. Merge now (recommended).**
- **B. Hold.**

Evidence: code:packages/flow-state-v3/tests/stories/steps.test.ts lines 85 and 93 (disposeRuntime with a call on the
wire ends unknown Disposed; Actors R22, R23, I35). Recommendation: merge; the step exists and is tested, and the
Package line it replaces says the opposite.

```text
before (Testing.plan line 51):
  dispose is `disposeActor` and { how: "forget" } is forget.
after:
  dispose is `disposeActor` and { how: "forget" } is forget; `disposeRuntime()` disposes the whole Runtime, with work
  in flight (Actors R22, Diagnostics I8).

before (Package.plan lines 41 to 42):
  flow-state/internal/testing, which exports disposeRuntime for Flow's own suite, is not a supported route and is
  not one of the six.
after:
  (these two lines removed; no internal testing route exists)
```

### Q4. D7 (Testing O3): `Fake.call`, `Fake.control`, and `Fake.http`

- **A. Merge the helper names now, hold `Fake.http` (recommended).**
- **B. Hold all of D7 until the first Promise-based adapter runs.**

Evidence: `Fake.call` and `Fake.control` are used in code:packages/flow-state-v3/fixtures/pay/server.ts, `transfers`,
`sign-in` and `command-palette`, and tested in tests/stories/fake.test.ts. `Fake.http` appears only in
`wiki/specs/testing/Stories.spec` as unbuilt (line 205, and line 216 waits for the first Promise-based adapter,
@task.V3.T29). So split: the helpers are proven, the binding is not.

```text
before (Testing.plan, O3):
  Fake.server gives run-scoped truth, endpoints and controls; ...
  Fake.Lost, Fake.Refused and Fake.Closed are mapped by the transport binding;
after (A):
  Fake.server gives run-scoped truth, endpoints (built with Fake.call) and controls (built with Fake.control); ...
  Fake.Lost, Fake.Refused and Fake.Closed are mapped by the transport binding;
  (the sentence on `Fake.http` stays in Pending until T29)
```

### Q5. D8 (Testing O4): `read(target)` takes a fake endpoint

- **A. Merge now (recommended).**
- **B. Hold.**

Evidence: code:packages/flow-state-v3/tests/pay/pay.test.ts lines 41, 42 and 60 read `Shop.confirm` and assert each
call's `status` (for example "held at response") and the call count; tests/checkout.ts line 106 does the same.

```text
before (Testing.plan, O4):
  read(target) (an actor's snapshot by ref, undefined if absent, or a
  fake's truth)
after:
  read(target) (an actor's snapshot by ref, undefined if absent, a
  fake's truth, or, for an endpoint, each call it received with its status: held, answered or dropped)
```

### Q6. D9 (Package O1): `storeContract` and the `Store` tag

- **A. Hold (recommended).**
- **B. Merge now.**

Evidence: grep finds no `storeContract` anywhere in the package or the Specs. Its proof is @task.V3.T58 and
@task.V3.T28, which are not done. Merging would put an unbuilt export in a Plan as settled.

```text
before (Package.plan line 37):
  - flow-state/persistence: layerIndexedDb({ database? }), layerMemory.
after (if B):
  - flow-state/persistence: Store, layerIndexedDb({ database? }), layerMemory.
  - flow-state/testing: storeContract(name, layer), the store contract as a plain @effect/vitest function of a
    Store Layer.
```

### Q7. D10 (Testing O1): `reload({ reattach: false })`

- **A. Merge now (recommended).**
- **B. Hold.**

Evidence: code:packages/flow-state-v3/tests/stories/steps.test.ts line 222 ("only what the boot wakes is live";
Stories R13, Restore R1); the sweep uses it in tests/rules/sweep.ts and src/host/testing/sweep.ts.

```text
before (Testing.plan line 51 to 52):
  `openTab` and reload re-attach the Story's uses;
after:
  `openTab` and reload re-attach the Story's uses; reload({ reattach: false }) boots the new page attaching none, so
  only what the boot wakes is live;
```

### Q8. D11 (Testing O3): `reload({ heldWrites: "land" })`

- **A. Merge now (recommended).**
- **B. Hold.**

Evidence: code:packages/flow-state-v3/tests/stories/storage.test.ts line 57 (default aborts; "land" restores the
transfer unknown with nothing sent; WriteAhead R13, Restore R3), plus the pay cases in tests/write-lanes/
payment-late-answers.test.ts and payment-leave-and-reload.test.ts. It is one of the agent calls Pending marks "for the
user's read", so it is your call, but it has tests and a planted fault.

```text
before (Testing.plan, O3):
  store with a purpose per write, FIFO per tab, aborted on close, under the scope lock;
after:
  store with a purpose per write, FIFO per tab, aborted on close (reload({ heldWrites: "land" }) instead lands every
  held write at the reload instant, unheard, as a transaction can commit before its tab hears complete), under the
  scope lock;
```

### Q9. D12 (Testing O3): `Fake.network.offline()` and `online()`

- **A. Merge now (recommended).**
- **B. Hold.**

Evidence: code:packages/flow-state-v3/tests/stories/wire.test.ts line 82 (every call lost at request, no server
reached, wire words wait; Stories R17, I9, I22); used by fixtures/pay, cells and number-input stories and by
src/host/testing/generate.ts. Also an agent call marked "for the user's read".

```text
before (Testing.plan line 115):
  Fake.server gives run-scoped truth, endpoints and controls; the Story controls the wire with four words: hold,
  release, drop, duplicate.
after:
  Fake.server gives run-scoped truth, endpoints and controls; the Story controls the wire with four words: hold,
  release, drop, duplicate, and the whole network with Fake.network.offline() and online(): while offline every call
  is lost at request and reaches no server, and wire words given meanwhile wait for the network.
```

## Part 2. The P2 coverage record

### Q10. Add it to @plan.Runtime as verification entry V8?

- **A. Yes, append V8 after V7 in the `verification` group (recommended).**
- **B. No; leave it as a comment on @phase.V3.P2.**

`wiki/plans/flow/Runtime.plan` has `verification` entries V1 to V7 (lines 354 to 373 and after). V8 goes after V7. The
text is the latest comment of 2026-11-16T02:04:05Z over the 01:39:29Z record, with its Covers and Scope kept. Two
facts will go stale at the next change: the match revision and the counts, so the entry names how to re-match them.

```text
before:
  (verification group ends at V7)
after:
    V8  Suite coverage (P2 record, matched at eff65a6b, code as 96ef4847): Covers @plan.Runtime, @plan.Operations,
        @plan.Persistence and @plan.Testing outcomes as tests cite them (Testing O1 to O4 and O6 first slices,
        @plan.CommandLine first slice); @spec.WriteLanes, Actors, Stories, Turn, Restore, WriteAhead, Compile and
        CommandLine rules named in test titles; src/core/ and src/host/.
        Suite: packages/flow-state-v3/tests/ (Story tests by Spec area; run rules and the reload sweep in
        tests/rules/; generated Stories, the pair sweep and the planted fault in tests/generated/; compile-time tests
        in tests/types/; CLI tests in tests/cli/) and the host tests in src/. The fast suite is the default; stress
        runs in the 8 `*.stress.test.ts` files.
        Rerun: `vp test run packages/flow-state-v3`; `nub run test:stress`; `nub run faults` (scratch copies).
        Mutants: the dead core and the 52 named faults of code:packages/flow-state-v3/tests/faults.ts (32) and
        tooling-faults.ts (20), each citing its rule.
        Audit: the completion audit passed at eff65a6b.
        Matched at: eff65a6b (fast suite 452 plus 8 it.fails, stress 23, faults 52 of 52, check and lint:rules at
        zero). Re-match after any change to tests/ or tools/faults/.
        Scope: fixtures pay, cells, sync, sign-in, transfers, command-palette and number-input over fake servers, one
        tab, TestClock time, usual and stress profiles, 1,000 drive seeds (129 of 392 pair cells reached). Excluded:
        real browsers and storage (P4), reads (T21), the rest of Story and Fake (T29), and the bugs held as it.fails:
        Turn I9, Turn I14 (two), WriteAhead R5 and I23, WriteLanes I7, Actors I43, Compile T11.
```

Risk: the record changes with every later P2 edit, which a Plan is a poor place to track. That is why B exists; if you
prefer B, the record stays dated on the phase and the exit criterion "the coverage record exists" is already met.

## Part 3. The `draft/story-slice` branch

### Q11. Delete `draft/story-slice`, or keep it?

- **A. Delete the local branch (recommended).** It was never pushed (`git branch -a` shows no remote copy).
- **B. Keep it.**

Evidence. `git log flow-rewrite..draft/story-slice` lists two commits: `d62ec9e4` (first Story slice, "unfinished and
unreviewed") and `32589054` (ten bench scripts from the deleted generator). The merge base is `4cf9a27c`.

- The first slice's files (`src/host/testing/{fake,run,story,index}.ts`, `fixtures/pay`, `fixtures/transfers`,
  `tests/pay/lost-confirm.test.ts`, `tests/rules/rules.ts`, `tests/transfers/stories.test.ts`) all exist on
  `flow-rewrite` today in reviewed, much larger form (T63 to T75).
- `draft/spike/` and `draft/tracked-changes.patch` are spike code; `flow-rewrite` has no `draft/` directory.
- Only `draft/workloads/*.json` (ten files, 6,775 lines) is not on `flow-rewrite`. The `bench/` directory there holds
  only `run.ts` and `time.ts`, and the long Stories in `fixtures/` now carry the workloads, which `bench/run.ts`
  times (commits `ba9009a5`, `347bd32c`).

Risk: if you want the old generated JSON as a reference, keep it. The commits stay reachable by hash
(`32589054`) for the reflog's lifetime only, so B is the safe choice if there is any doubt.

```text
before: draft/story-slice  (2 commits ahead, 27 files, +9,004 lines, local only)
after:  git branch -D draft/story-slice   (no remote to update; no other file changes)
```
