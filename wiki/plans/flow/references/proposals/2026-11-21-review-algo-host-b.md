---
review review-algo-host-b
status open 2026-11-21
description Review of the host design finds it sound in shape but not Spec-ready: three Spec blockers, eleven build blockers.
---
# Review B: the host and test tooling design, cluster 5b, fit to code, seams and requirements (2026-11-21)

**Verdict: ISSUES.** @proposal.algo-host is sound in shape (one publication rule, one death occasion, one verdict
function), and most cited lines are right. It is not Spec-ready or build-ready: the memo cannot serve actors no step
touched, the Q2 answer builds an import cycle in Flow's own fixtures, a failed run carries no run for the CLI,
the I1/I2 run rule reads data the fake store never keeps, and the walkthrough Story passes vacuously on the
fixture it names. Three findings block the Spec, eleven block the build. The other reviewer attacks the
algorithms; this one covers fit, seams and skipped requirements. Paths are under `packages/flow-state-v3/`.

## 1. Blocks the Spec

- **F1. The memo never holds an actor no step touched, so `getSnapshot` answers none for it.**
  6.1 step 1 compares `p.touched`, or "every memo key" when `all`; the memo starts empty. `snapshotIn` has three more
  sources, a saved record, a quarantined record and an ended identity (`src/host/snapshot.ts:187-232`), and boot
  `Begin`s only touch live actors. So `useActorByRef(ref)` of a recorded identity and `read(ref)` get none, against
  @plan.React.O2 ("a lookup of an identity with a record returns the record view, never null") and the
  ensure-then-read pattern. `all` also iterates memo keys, so `final` skips never-published actors.
  Needs: `getSnapshot` falls back to `snapshotIn` on a miss, or the first publication seeds every identity;
  say which, and whether the fallback is cached (I2 needs one object).
- **F2. Q2 option A creates an import cycle in Flow's own fixtures.** `flow.config.ts` imports `fixtures/index.ts`
  (manifests), each manifest imports its Stories (`fixtures/shop/index.ts:19-52` imports `./stories/*`), and every
  Story file calls `Story.app` at load (`fixtures/shop/stories/usual.ts:30-31`). A Story that imports the config for
  `Story.app(config, ...)` closes the loop, and `config.rules` is read before it is defined. The rules also come
  from `tests/rules/rules.ts`, which imports `vite-plus/test` (line 2) and so would load vitest into the CLI.
  Needs: rules in a module the config and the Stories both import (a `rules` list apart from `apps`), or Q2 B.
  Also note `Story.app` today takes `(setup: RuntimeSetup, { id, fixtures, world })` (`story.ts:211-216`), not an
  app; the design's `Story.app(config, app)` changes both arguments and about 100 call sites, none counted.
- **F3. `run()` rejects `StoryFailed { verdict }` and carries no run, but `flow trace` and `--trace-output` need it.**
  6.6 and 6.9: `run()` resolves only on `passed`; `flow trace` "prints the verdict under the trace".
  @plan.CommandLine.O2 requires the requested trace output "even after execution failure", with the partial trace.
  `StoryTurnLimit` carries `evidence` today (`steps.ts:117-134`); the design drops the class and the field.
  Also `StoryFailed` today is the script-fault class (`steps.ts:99-104`, `story.ts:204`, four test files assert it);
  the design reuses the name for a verdict failure and renames the old one `StoryScriptFault`, and says neither.
  Needs: `StoryFailed` carries `{ verdict, run }` (or an internal `runUnjudged` the CLI and `propertyTest` call
  and tests cannot import), plus a rename list for the two classes.

## 2. Blocks the build

- **F4. The walkthrough Story does not test what it claims on the fixture it names.** `storeStory` uses `storeSetup`
  with `persistence: { captureMs: 0 }` (`fixtures/shop/app.ts:107-117`): each capture is issued at once, so the edge
  is never `Marked{at: now + 5 s}`, nothing is held at `closeTab`, and `.advance("5 seconds")` lands nothing. Both
  fates then reopen at `SHIPPING.METHOD`, so the section 1 expectation "PAY under abort" fails. The Story needs a
  setup with the default 5 s interval, or `Fake.storage.hold`; the same applies to the wrong-ending Story in section 9.
  `storeStory` is marked "existing" in the code comment but is fixture-local (`fixtures/shop/stories/usual.ts:30`).
- **F5. `reuse` is per top-level field, but R-P2 asks for per-row identity.** UH R-P2: "each unchanged lane row
  identical". 6.1 step 1 keeps "each equal field's old reference", and `operations` is one field built fresh by
  `rowOf` per lane (`src/core/schedule-plan.ts:51-63`). A change to one lane replaces all rows. The equality is also
  unnamed ("structurally"); X-5 of @review.algorithm-review says there must be one (`sameValue`, `core/slots.ts:91`).
  Name the equality and the depth, and say what keeps `Diagnostic` and `Timers` objects stable.
- **F6. Where `Flow.private` is dropped relative to the memo is unstated, and I2 can break.** `getSnapshot` today
  allocates `{ ...snapshot, memory }` per call when private fields exist (`snapshot.ts:236-239`). 4.2 says
  `getSnapshot` returns `Snapshot<D, "outside">` "from S2", and S2 holds `snapshotIn` results with private memory.
  Either the memo stores the projected view (then `read(ref)` for Stories, which see private fields, and inspection
  need the other form) or `project` allocates per call. 4.3 says `project` is the publication's restore; 6.1 never
  calls it. State which object is memoised.
- **F7. The I1/I2 run rule reads data the fake store does not keep.** 13 says it "reads the fake store's batches
  (records as written)". `Batch` holds `keys`, `purpose`, `status`, not values (`fake.ts:586-598`); `writes` sit in a
  private `Out`. AR 9.1 wants "I2 on every key the Runtime wrote after every step that captured, and I1 against the
  World at the cut". A run rule sees a finished `StoryRun` (the checkpoints' `inspection` and the final `stored`).
  Needs: batch values in the public record, and the World (or a derived saved image) in evidence at each capture.
  The mutation generator is one word `Fake.storage.mutate(kind)`; AR 9.2's alphabet (per key, envelope, `Shape` node,
  relation, sequence, every pair on one identity) has no algorithm, oracle or home. `stored` words exist
  (`steps.ts:44`) but a generator over them is unwritten.
- **F8. `seam.ts` is under `run.ts`, and the design deletes it without a replacement.** `testing/run.ts:40` imports
  `testing` from `seam.ts` and drives `attach`, `detach`, `send`, `forget` through it (`run.ts:392, 559-577`). Nine
  host unit tests also import it (`src/host/{cleanups,close,hidden,identity,lanes,ledger,life,restore,runtime}.test.ts`)
  plus `src/host/test/cleanups.ts`; TT says four. 11 says "its importers move to Stories". Also `loose.ts` is
  `src/test/loose.ts`, used by at least six tests unrelated to `seam.ts` (`runtime.test.ts`, `planted.test.ts`,
  `surface.test.ts`, `bank-app.test.ts`, ...); it is not "removed with `seam.ts`". Name what `run.ts` uses instead, and
  TT R1 (no testing file imports `driver`, `admission` or `Input`), which `run.ts:393, 457` break today.
- **F9. The tab model is built on "one clock" while the code has one clock per open.** 6.5 says "the world (store,
  servers, clock, locks) is one value" and `advance` "moves the one clock", but the pseudocode uses `tab.clock`
  and `tabClock` is built per open with its own `Scheduler` and `TestClock` (`clock.ts:19-55`). Several tabs mean
  several `TestClock`s kept in step. Unspecified: which tab's clock a fake server's `late(d)` or handler `Clock` read
  uses when two tabs call one endpoint; `settleNow` across tabs; what a dead tab's pending server answer runs on;
  per-tab `idle()` (`run.ts:431`). `cut()`, `view()`, `checkpoint` and `read` close over one `tab` (`run.ts:455-530`),
  so `checkpoint` and `read` need a tab argument, and `StoryRun.checkpoints` a tab key.
- **F10. The edge table skips the capture stage and three inputs of the real accept.** Code: `accept(due, refused)`
  answers `refused` tickets false first, `Due.Awaited` carries tickets, `captureMs <= 0` and a hidden page take the
  `Now` path (`edge.ts:162-176`); `issue` calls `options.capture`, which is an `Input.Capture` step whose result
  arrives later as a `Write` command (`edge.ts:178-205`, `core/step.ts:57-62`), and an empty write list settles
  landed. 6.4 has no row for `refused` tickets, `captureMs: 0`, or the capture-to-write hop; "Out" starts at `issue`
  but the batch exists only at `Write`. Also `edge.ts:119` retries with `Schedule.duration(captureInterval)`; the
  table's `Backoff{now + C}` is the same value but the keyed fork must be named so `again` after a close is not lost.
- **F11. O7 is left open on a seam only 5b can close.** A capture issued between `Serve` slices saves the mail-owed
  world's records while the mail is not saved (`step.ts:57-62`: a capture reads the World and serves nothing). It
  happens on any page, not only at a death: a refresh after a landed mid-chain capture loses the follow-ups. The
  design asks AR and moves on (13, O7). Q1 already defers publication until mail is served; the same rule for
  `issue` (wait for `owesServe` false, except at a hide or ticketed `Now`) is one row in 6.4 and needs the user's call.
- **F12. `StepOut` does not exist, and `touched` has a choke point the design does not use.** `step` returns
  `Out` (`tx.ts:559-563`); there is no `StepOut` (11 says `core/step.ts`). Every map write goes through `tx.draft`
  with a map-level key and no actor (`tx.ts:160-175`), and `tx` already has `dirtyActors` and `moved`. The snapshot reads
  nine sources (incarnations, records, ended, quarantined, lanes and `lanesOfActor`, timers, issues, life,
  `consumersOf` for context): a state inventory of snapshot inputs against their writers, per AT's index rule and the
  user's "whole task at once", is missing. O2 and `PublicationDrift` are a guard, not that inventory. The drift rule
  also scans every untouched memo entry per publishing slice, which breaks I18 (steps times actors).
- **F13. The edge and driver edits overlap AT's and drop signals.** 7's loop omits `Deferred.done(disposed, void)`
  at disposal (`driver.ts:392`, today per step) and `Wake` and the emit consumer AT puts in the same functions
  (AT 14: `driver.ts#perform`, `#ownerOf`, the sink). `Quiescent(world, env.now)` uses `env`, which is per step in the
  loop body. `snapshotIn(q.world, a)` omits `machines`. Sequence 5b and AT on `driver.ts`, and keep the disposal signal.
- **F14. Lenient runs and the late-cleanup fault have no rule.** `finish` turns unused words into a script fault
  unless `lenient` (`run.ts:633-634`), and generated runs set `lenient: true` (`generate.ts:847`). The design deletes
  `lenient` and makes `UnusedWord` a rule; generated runs then breach it on every draw. `late.length` cleanups are a
  script fault today (`run.ts:636-637`); the design has no rule for it (`CleanupLeft` covers resources). State the
  switch generated runs use for `UnusedWord`, and where `late` goes.
- **F15. `flow check` and the JSON status are not built by any row.** The CLI has `story list`, `story run`, `trace`
  (`cli/main.ts:95-135`); 6.9 names `flow check` as "AY 7.2's rows" and 11 lists no new command. @plan.CommandLine.O1
  also lists `story describe`, `graph`, `explain`; O3 gives JSON `status` completed, equal, different, incomplete or
  failed. Nothing maps `Verdict` (`breaches`, `neverBroke`, `unfinished`) to `status`, to `story run`'s printed
  output, or to `RunRejected`, which today wraps a script fault (`main.ts:14, 49`) and in 6.9 becomes "`compiledOf`
  raised". AO's `flow explain` showing `releasing` and fates (AO 14, AR 14) is unanswered.
- **F16. Delivering a new Story step needs more files than 11 lists.** Not in 11: `host/trace.ts` (renders and
  decodes steps and the `Tab` record, `trace.ts:47, 105`; `closeTab`/`openTab` and the renamed `inflight` need text and
  the export/import codec, R-I1), `host/testing/samples.ts` (prints `Story.app(...)`, lines 166-175, and `heldWrites`),
  `host/print.ts`, `host/inspect.ts` (`releasing` with ages, the version), and the TT 3.2 world words 6.10 relies on
  (`late(d)`, `never()`, `duplicate()`, `network.offline` with its advance): `WorldWord` has none of them
  (`steps.ts:36-45`). `heldWrites` appears in 28 files (fixtures 6, tests about 14), so the rename is a wide edit.

## 3. Seams the earlier designs handed over

| Sender  | Handed                                                  | 5b's answer                                   | Match                                              |
| ------- | ------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| 5a (AY) | `findingsOf`, `compiledOf`, `Compiled.rules`, `project` | 13: `Story.app` and Runtime call `compiledOf` | partly: F2, F6                                     |
| 5a      | 8 casts                                                 | 11                                            | two claims wrong, see F17                          |
| 5a      | `EvidenceOf`, `Finding.location`, CLI table             | 4.3, 6.9, 13                                  | partly: F15                                        |
| AO      | read generator, abort-ignoring fake                     | "fixture services" (13)                       | no design; a pointer to TT 3.5                     |
| AO      | `releasing` inspection, `flow explain`                  | `releasing` with ages only                    | `explain`, entries, refusal missing                |
| AO      | publish on release alarm                                | 6.1, no host code                             | yes; AO's `Wake` driver is AT's and not named      |
| AO      | `stepEnds` once per step                                | last row of core `step`                       | yes                                                |
| AO      | issues equal `issuesOf` run rule                        | 6.6                                           | see F18                                            |
| AO H11  | "public event a view sends for `refetch`"               | none                                          | **unanswered** (H11 blocks build)                  |
| AR      | I1/I2 run rule                                          | 13                                            | F7                                                 |
| AR      | mutation generator, O7                                  | one world word, asked back                    | F7, F11                                            |
| AT      | emit listeners at row 15, once per step                 | per publishing slice (Q3)                     | a stated departure; P6 holds                       |
| AT      | props, `Input.Create`                                   | 13                                            | yes                                                |
| AT      | evidence face                                           | 4.3                                           | yes; `Published.why`, `Turn.from/to` are AT's      |
| AS      | breach-id tooling                                       | `StoryFailed.verdict.breaches[0].rule`        | F3 (needs the run); order ties by rule             |
| AS      | memo for `issuesOf`                                     | "is S2"                                       | no: AS's memo is keyed by the owner's map identity |

- **Q3 (emits per publication).** AT P6 ("sees its turn's snapshot or a later one") holds. AT 6.10 says the
  inspector sink and emits sit at the step's end; both are now in S3 until the slice ends, so a turn whose
  mail chain is long delivers late, and a stop drops owed turns' emits unheard (7: "no emits"). State that, and
  say what the evidence sink sees in the meantime (it still runs per step).
- **Q4 (`touched`).** See F12; the field is cheap but incomplete as a design. Option B (compare every memo actor)
  is O(A) per slice, but I18 and F12's drift scan already cost that in tests.
- **F17. Two claims about casts and files are wrong.** `run.ts:640` is `Object.fromEntries(checkpoints) as
  StoryRun<Names>["checkpoints"]`, a checkpoint-record cast; `project` does not remove it. `sweep.ts:352` casts
  `options.properties`, not the run. `test/loose.ts` is `src/test/loose.ts` (F8). Re-justify or re-count.
- **F18. The issues run rule has no data.** 6.6 says snapshot issues equal `issuesOf` of inspection's state; a run rule
  sees evidence and final `inspection`, and `Published` evidence today has `{ actor, state, memory }` only
  (`core/evidence.ts:157`). It needs the published snapshot in the record (4.3 adds one) and the inspection state at the
  same step, not the end.

## 4. Requirements with no mechanism, or one too vague to build

- **R-P4 and @plan.React.O1.** "All `useView` reads in one render see one consistent version across actors" and
  "store entries". 5b gives `version` to the binding only and no multi-actor read. Name the binding read (one
  `useSyncExternalStore` over the version, or per actor).
- **Terminal snapshot per actor (@plan.React.O3).** A subscription "completes after the terminal snapshot of
  `disposeActor`, forget or Runtime disposal". 6.1 has a Runtime-level `Final` only. After `forget` the memo entry is
  removed (step 2) and S5's listener set for that actor is never cleared. Add a per-actor end row.
- **R-A9, R-A5, R-A8** (selector exceptions, grace, scope change): not mentioned, presumably UH's. Say "unchanged".
- **TT R4, R5, R7.** A closed store refuses every later write and load; the fake store closes with its scope;
  `storeContract` passes on the Story's store and IndexedDB. 5b's `left` lists "stores open" but 6.5 never closes the
  store or specifies the closed failure, and `platform/memory.ts` does not exist yet (11 lists no "new" row for it).
- **TT R9, R11, R12.** Idempotency key answers, one timeout scale under coverage, time bounds changed only on
  re-measurement. 5b keeps `QUIET_LIMIT` and `TASK_LIMIT` and names T117 but no scale factor.
- **UH R-L4 to R-L6, R-I1 to R-I3, R-Y1.** Lock, trace round trip, inspector capacity and playback: T27, T49, T108's;
  5b needs one line saying they are unchanged, since 6.5's `Dying` and `Gone` change what trace and `Tab` carry.
- **Locks fake modes.** UH 3.6 has a Safari mode that drops the lock on freeze and a Chrome mode that keeps it
  (UH 379-380); 6.5 has `closeTab` only and says no `freeze` word. The hostile `Locks` fake of UH needs the
  mode, or the one-line statement that the Safari mode is not simulated.
- **Generated runs with tabs.** The generator, `quieting()` (`generate.ts:355-392`, reads `view.held`,
  `view.heldWrites`) and `forkReloads` run one tab; with `openTab` they need per-tab views and a rule on whether
  samples draw tabs. S13 does not say.
- **Disposing.** 6.1 handles `Disposed` and `Stopped`; `Disposing` is a separate life with its own async window
  (`core/life.ts`, `disposal.ts:64-74`), clears mail at its start and publishes `lifecycle` changes. It works through
  `lifeChanged`, but no table row names it, and `Final` after `Disposing` while an edge ticket is out is covered
  only by prose.
- **Cost.** `clock.ts:27` also cancels with `tasks.includes` plus `splice`; a ring index for `shift` leaves that scan.
  `cut()` runs `indexDrift(world)` over the whole world at every checkpoint (`run.ts:466-472`), not in 10.
- **Fixtures.** No fixture runs two tabs (stated, 12). `fixtures/session` and `transfers` hide rows cover `hideFlush`;
  nothing covers `Second` booting `Closed`, a lock released at death, or a fate word under a refused hold. Section 9's
  alphabet has them as atoms but no Story names them; R6 of TT asks for a Story per table row.

## 5. Minor

- `Quiescent` and `Published.at` are per slice, but the doc says "the time every snapshot was derived at"; with
  `Serve` slices the time is the last step's.
- `final`'s `all` over an empty memo, `PHASES` "derived from the lane phase type's tags" versus the sweep's own
  five-phase `CellRun`: two things called "phase" in 6.10; rename one.
- Fit table 11 says `core/step.ts` `StepOut`, `host/emits.ts` "new" and AT also adds it: one owner, one Task.
- 6.4 "Departure from today" (a `Later` mark waits in `Backoff`) conflicts with `edge.ts:75-76` only in the retry
  timer; say the keyed `wake` and `RETRY` become one key, since the code has two (`edge.ts:27-28`).
- Section 1 calls the stepper `useActorByRef(FlowRef, {})`; @plan.React.O2 allows that only for a value-named ref.

## 6. What holds

The cited lines for `driver.ts` (255-420), `defaults.ts:39`, `edge.ts:61-65, 200`, `clock.ts:24-34`, `fake.ts:475, 558-660`,
`generate.ts:512`, `story.ts:274-283`, `run.ts:402-414, 521-525` and `select.ts:186` match the code. The claims that a
reload fires no hide listener, that `Serve` is a macrotask, that one store exists in four copies, and that a dead
open's write hangs (`fake.ts:603`) are right. Q1, Q5 to Q9 are well posed; Q10 (user) is honoured only if F2 is fixed,
and Q11 (user) is consistent with AY 7.2's rows.
