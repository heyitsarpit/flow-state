# Conformance suite status

Done rounds and Tasks are summaries; the full text is in git history (this file before the compaction). T7's section
is the live one.

## Round 1 (2026-11-09): layout, Port, prototype adapter, fake world, runner, first slice

Built: everything in the README's layout. The slice is two WriteLanes guarantees end to end: `ending-channels` (I3)
and `attempt-identity` (I6), each with two mutants, and the Pay cases `PAY-01` to `PAY-05` ported with the same steps
and expectations.

Verified: `suite` 5/5 on round-14 (also `--parallel 3`); null 0/5; `falsify --parallel 4` null red, control green, 4/4
mutants caught by their own oracle; `nub run check` zero (23 files).

Old-suite comparison (PAY-01..05 and the four mutants; old suite run as `bun main.ts --round 14 --runtime <rt>
--no-search --no-catalog --only <cases>` from `prototypes/conformance/`): same verdict on every case. One old-suite
weakness: `mutant.resend-new-input` was caught only by the recorded-output compare (with `--no-output` PAY-04 passed);
the old suite had no named oracle for WriteLanes R5/I6 "every send carries the same input". No new-suite bug found.
The old suite needs `--no-catalog` now (its catalog reads a deleted design file).

Sidecars (all Haiku, effort high; the lead read every diff and re-ran every check): a runner (accepted, the lead re-ran
two), a lint-fix coder (accepted after reading the diff), a spec-fidelity reviewer (10 findings: 9 accepted, 1
rejected) and a lint-bomb STYLE reviewer (18 findings: 15 accepted, 3 rejected). Rejections that still matter:

- An ending in a later step than its answer is not judged (spec finding 2): kept as a stated limit in
  `ending-channels`' doc, because pairing across steps misjudges a cancel or timeout between an answer and a re-send;
  `delivered-once` owns "every send ends".
- Request continuations stay out of the log (a capability, not a fact); per-check Attempt projections in the oracles
  stay (each oracle needs a different projection); scenario expectations compare plain values (an absent row reads
  `undefined`); untyped memory reads wait for the fixtures, which move here with phase 4's public API (README decision
  4).

Stated limits from the review fixes: the delivery check is consistency-only for endings the server did not decide;
declines pair in order per operation; `attempt-identity` anchors one side to the server and its doc says which;
`mayHaveApplied` comes from the server's log (an earlier send of the id never definitely answered).

## Round 2 (2026-11-09): review fixes, Port additions, the ending ledger, PAY-06..16

Built: `write-lanes/delivered-once.ts` (WriteLanes I15, I16, I22, the ending ledger) with four mutants;
`write-lanes/ending-delivery.scenarios.ts` (DLV-01..03, built so each mutant's trigger fires); the `cells` fixture;
fake-world late answers, late landings, uninterruptible calls, answers at once, storage `hang` and `landNoAck`;
`falsify --sweep`. Round 1's review items M1 to M5 and the lows are done: `ending-channels` requires an answered live
send to end under its id in that step (`mutant.ending-without-id`); `suite.ts` holds `guarantees` and falsify fails an
oracle with no mutant; the planned Port is built (`release` and `use` on `ensure`/`ensureExisting`, actor on `Minted`,
decline `Ended` and `Delivered`, `Parked`, `Unparked`, `Recorded`, `Unhandled`, `Denied`, storage evidence,
`Boot.sessionSeed`); the carry table is in the README.

Verified: `suite` 38/38 under seeds 1 and 2; null fails every case (`--json` exits 1); `falsify --parallel 5` 9/9
caught by their own oracle; `nub run check` zero (30 files).

Old-suite comparison (PAY-01..16, 53 old case items against 38 new): same verdicts. `a2.deliv-fail-samemail`,
`d154.moved-fail-released` and `lie.released` stay green on Pay in both suites (their trigger never fires on Pay
traces); the new DLV-01/DLV-02 fire it and `delivered-once` catches them. `e8.wa-failure` is caught on DLV-03 (the old
suite caught it on PAY-12/shuffle, not ported). `mutant.ending-without-id`: 41 old red, 30 new red, same verdict on
every ported case with a write ending. Two oracle refinements came from the port: a late ending the actor's guards
deny is accepted (`Denied` as a delivery outcome); the live-send check applies only to the newest request of an id.

Decisions and stated limits:

- README decision 8: the suite supplies the session seed; round-14 asks its host for each id, so its adapter derives
  them from the seed (a prototype limit). The seed cases and their wrong runtime are phase 4 builds.
- `StillUnknown` keeps its tag when the runtime reports it; round-14 does not (stated limit).
- `Unhandled` and `Denied` match by event (stated limit of the e8 reading).
- Dropped assertions (internals the Port does not show): lane cells, `fence`, `interrupt`, `initial`, boot frames,
  `replay`, `outside` except as the server's own request phases.

Carried (ported 31 Pay variants; not ported 17, each waiting on a planned Port part): PAY-11 (5 variants: slot and
module faults), PAY-12/duplicate (a duplicated completion), PAY-12/shuffle (scheduler shuffle), PAY-13 and the disposal
variants (ported in round 3), PAY-16/parked-success-is-delivered (yield injection), PAY-16/cancelled-does-not-stick (an
`interrupted` answer), PAY-16/rejected-is-delivered (dropped by its coder: both assertions read internals; to be
re-expressed on `Delivered` and `Turn`), and the hook-throw and core-throw variants (module and core faults: never a
Port part; the Spec-level refusals they cover are the `refusal` oracle's).

Sidecars: four Pay coders A to D (accepted or changed after the lead's reading; rejected-is-delivered skipped, logged
above), a runner (accepted, two runs re-run) and a spec reviewer (19 findings: 5 accepted, 1 rejected, 4 kept as
limits, the rest notes). The rejection: e8 is caught by `delivered-once` (B's IDLE root handles `Declined`; falsify
shows it), though its point stands as the event-match limit above.

## Round 3 (2026-11-09): `lane-queue`, Runtime disposal, PAY-13 and PAY-17..20

Built: `write-lanes/lane-queue.ts`, a model of each unkeyed lane from the runtime's reports, checked after each turn and
step: the queue bound per policy (I8), one addressable Attempt (I9), promotion only past a resolved or released head
(I11), Held left only by retry, cancel or release (I12), `Superseded` only under latest (R7), cancel by the head's
history (I20), and `cancelAll`'s queue in mint order with a held head delivered last (I21); a cancel is judged over
the reports from its turn to the end of its step. Twelve mutants (seven with the old suite's names and edits, five
written from WriteLanes' text). `write-lanes/lane-policies.scenarios.ts` (`LANE-01` to `LANE-10`). Port:
`Runtime.disposeRuntime()`, `Observation.RuntimeDisposed`, timeline facts `DisposingRuntime`, `Drove`, `Unstoppable`,
the fake network's `FailButLanded`, the reference's `keyFields` and `cancels`. `delivered-once`: from a Runtime
disposal to the next reload an ending may stay owed and counts as parked at the reload; a delivery in that span is a
violation; parked endings survive a reload; a re-park is not a second delivery. Ported `PAY-13` (3),
`PAY-15/dispose-held`, `PAY-16` disposal variants (4), `PAY-18`, `PAY-19` (2), `PAY-20` (2); not ported: `PAY-17` (5
variants, module and core faults, never a Port part) and `PAY-16/parked-success-is-delivered` (a yield fault). Spec
changes are in `workflow/specs/spec-log.md` (round 3): WriteLanes R14's Idle cell and three wrong-runtime moves
(`lane.promote-skips-durable` to WriteAhead T7, `lost.letgo-silent` to T6, T10's idle mutant).

Verified: `suite` 61/61 under seeds 1 and 2; null fails every case; `falsify --parallel 6` 21/21 caught by their own
oracle (12 are `lane-queue`'s); `nub run check` zero on the round's code before the lint scope widened (commit
`46488541`), leaving 79 findings (74 `no-unknown`, 2 `no-object-type`, 3 `no-optional-domain-properties`), nothing
waived, closed in round 4.

Old-suite comparison (full old suite, 1,080 cases, on an edited copy per mutant, against `falsify --sweep`): every
mutant caught by both. Old-suite weaknesses: no oracle for I8's bound (`lane.queue-unbounded`, one case assertion),
R7 under latest (`lane.latest-as-serialize`), and cancelAll order checked by one case (`1b.cancel-all-queue-reversed`).
Two old wrong runtimes no longer apply to round-14 (rotted: `lie.serialize-as-latest`'s edit,
`audit-1.cancel-all-leaves-the-head`'s, the latter re-anchored here; confirmed by grep). The new suite's breadth is
smaller (61 against 1,080), so its red counts are smaller. Stated limit, the keyed-lane limit: on Pay (keyed) lane
mutants are red by case assertions and other oracles, not `lane-queue`.

Sidecars: coders A (PAY-18..20) and B (disposal cases), a runner (new side re-run by the lead; rot counts confirmed),
a spec reviewer (19 findings: 13 accepted, 3 rejected, 3 kept as limits) and a STYLE reviewer (17 findings: 6
accepted, 10 rejected, 1 accepted in part). Reasons that matter:

- Fixed in the oracle, not the cases: `delivered-once` forgot parked endings at a reload (coder B's four failures
  were right).
- Kept as limits: a parked ending still parked at a case's end; a `delivered-once` mutant for the disposal rule (done
  in round 4, `mutant.delivered-during-disposal`).
- Rejected: a write has no abort signal at the fake server by design; R14 says unknown Cancelled on fiber exit
  whatever the answer; Runtime disposal is idempotent (Actors R20), so a repeat is no violation; `Disposed` is
  round-14's runtime-level note, an actor's dispose notes `disposed`; the lane holds the reference's object, not a
  copy; `RETURN_TYPE` is the lint's own mechanism.
- Style rejections with reasons: `mint` returning nothing and closure `let`s in `judgeStep` (the model is a
  projection rebuilt inside one check, not owned state; round 4 changed the half that mattered, `mint` now returns
  its violations); the `"(decline)"` sentinel in a space-joined ledger key (a ledger-local label, operation names are
  fixture identifiers with no spaces; revisit if operation names ever become user-supplied text); reason and channel
  literals matched in several places (`Channel` is a Schema literal union; reasons are an open set, the closed part
  is `FLOW_DECLINES` in `fixtures/reference.ts`).

Carried to round 4: type the Port per fixture with generics (the user's direction) to close the 79 lint findings
(done); the Attempt's key on `Minted` (production reports it, the prototype adapter cannot) so `lane-queue` judges
keyed lanes and Pay (open, T7's H1); `members` (WriteLanes I10, I13, I14) with the releasing-lane fixture `p1Rel`
for `audit-1.cancel-all-release-also-cancels-head` and I22 (open, T7); a `delivered-once` mutant for the disposal
rule and the `disposal` oracle (Actors I29 to I31; done, T6).

## Round 4 (2026-11-09): services, typed fixtures, review fixes

Built: a restructure into `Context.Service`s (commit `c7f72a9c`; reverted in round 5) with README decisions 6 and 11;
typed fixtures and typed actor views. Parity proof: `suite --json`, `suite --runtime null --json` and `falsify
--sweep` byte-identical before and after the restructure, and after the review fixes except for the four new
mutants.

Verified: `suite` 61/61 under seeds 1 and 2; null fails every case; `falsify --sweep --parallel 6` 25/25 caught by
their own oracle (21 old, 4 new); `nub run check` zero (40 files, none waived).

Review fixes (the runner's independent review of rounds 2 to 4), with the stated limits they leave:

- H1: `delivered-once` excuses a recorded ending only from suite-visible facts (under `cancel`, an Attempt still
  undecided when a later commit of its actor and operation was minted; under `latest`, one still unsent then); the
  runtime's `Superseded` only words the message. Mutant `mutant.superseded-claimed` (DLV-03).
- H2: `lane-queue` judges a Held head's re-send (permitted only after a suite-driven turn of its actor in a later
  step; limit in README). Mutant `lane.held-auto-resend` (LANE-03, PAY-15/press-pay-while-held).
- M1: an `InvalidTurn`/`UnmappedEnding` issue settles a delivery only when it is the one pending in its step (stated
  limit: `Issue` carries no event or actor).
- M2: only endings decided after the disposal began count as parked at the reload; mutant
  `mutant.delivered-during-disposal` (PAY-16/settled-during-disposal-parked).
- M3: a `Minted` with no actor is a violation in `lane-queue` and `delivered-once`; round-14's adapter still
  attributes actors (decision 10, a prototype limit).
- M4: the row is `Option<Json>` at the Port and decoded per policy by the fixture (Reads R14); round-14 has no idle
  row (stated limit).
- M5: `PageKilled`, `WorldClock.effect` and `Page.effect` removed; README states what phase 4 must add.
- Lows: `attempt-identity` keys Attempts by operation and id (mutant `mutant.sent-under-another-operation`, caught by
  the same oracle's count check, so the naming check has no isolating mutant: stated limit); `ending-channels`
  StillUnknown strictness not changed, kept as a stated limit (strict turns PAY-05 and
  PAY-16/restore-keeps-mayHaveApplied red; the adapter will not invent the failure).

Sidecars (Haiku, effort high; the lead read every diff and re-ran every check): four coders for the Case-service port
and four for the fixes (all accepted; coder 3's `repeatedKeys` and coder 4's nullish helpers changed by the lead);
three reviewers. STYLE services 14 findings (5 accepted, 8 rejected, 1 confirmed); types and comments 12 (5 accepted,
3 deferred to round 5, 4 rejected); spec, oracles and runner 11 (6 accepted as stated limits, 5 notes confirmed).
Stated limits taken from them: teardown disposal unjudged and repeated (made a judged step in T6), the prototype sink
swallows a throw, non-JSON request bodies die. Deferred and since done or carried: shared scenario helpers (T40 S4),
one attempt-key helper (T40 S5), `keyFields` restates the key Schema (drops when the key is on `Minted`, T7).
Process slips, noted: the lead edited `world/network.ts` once with a Python script, coder B edited
`write-lanes/delivered-once.mutants.ts` with a Python heredoc (diff checked), coder 1 briefly wrote under `/tmp` and
removed it.

Carried to round 5 (the list there): a judged Runtime disposal and the `disposal` oracle (Actors I29 to I31; T6);
`members` with `p1Rel` and a mutant for "a held head is delivered last" (I21; T7); keyed lanes once a runtime reports
`Minted.key`, then drop `keyFields` (T7); shared Pay scenario helpers (T40 S4).

## Round 5 (2026-11-09): services reverted

The user: the scenarios had to `yield*` every step, noise that turned simple code into noisy code; revert the
`Context.Service` change specifically. Round 4's restructure (`c7f72a9c`, with `3097ea3c`'s fixes) is reverted to the
round 3 shape (`714ace7a`): a `Port` whose `boot` returns a plain `Runtime` record; the world plain owned state with
synchronous steps; `openCase` builds a plain `Case`; a scenario's `run` is `(c: Case) => void`, steps and reads are
plain calls that throw `Violated` or `Mismatch`. README decision 6 records it.

- Kept from round 4: fixtures typed by their Schemas, typed actor views, the JSON Port, the review fixes H1 to M5 and
  their mutants, rows per Reads R14, actors required on `Minted`, `page.ts`'s name. Effect stays in the runner, the
  prototype loading and Schema at the adapter boundary.
- One behaviour change, not judged: the Runtime is no longer disposed at a case's end. README's stated limit says so;
  closed by T6.
- Parity: `suite --json`, null `--json` and `falsify --sweep --parallel 5` byte-identical to HEAD before the change
  (61/61; 25/25 caught); `nub run check` zero, nothing waived; `yield*` in `scenarios/`: 0 (736 before).
- Lint: two findings fixed with reasons on the line (`runner/run.ts`'s thrown-value `unknown` with
  `FLOW_STATE_ALLOW_UNKNOWN:`, `runtimeOf`'s `RETURN_TYPE:`).
- Scenario files were rewritten by hand with Write from a mechanical preview (a script that printed the converted
  text, writing no file).

## T6 (2026-11-10): judged Runtime disposal at every case's end; `@effect/tsgo` in check

Built: `playCase` ends every case with judged steps (dispose the Runtime, answer held writes, advance past the 5 s
bound, answer again, expect the disposal ended, reload); the `disposal` oracle, split into `actors/disposal.ts` and its
ledger `actors/disposal-ledger.ts`, judging Actors I29 (both halves), I30, I31, I32, I35 and I36; `forget` on the Port;
cases `DISP-01` to `DISP-05` (`actors/lane-keeping.scenarios.ts`); `nub run check:effect` (`effect-tsgo tsc`,
`@effect/tsgo` 0.61.0) inside `nub run check`. Every mutant names the Invariant it breaks (`expects`), and falsify
counts a kill only by its oracle's violation naming it (Conformance Q5, narrowed).

Verified (orchestrator, HEAD `8be33fc5`): suite 67/67; null 0/67; `falsify --parallel 6` 38/38 caught, each by its
expected Invariant; `nub run check` zero, and a planted `unknownInEffectCatch` fails it.

Mutants and the Invariant each is caught by: `lie.boot-says-disposed` and `lie.boot-drops-held` (I29 at the reload,
PAY-15/dispose-held), `mutant.disposal-skips-never-sent` (I29), `mutant.disposal-dispatches` (I30 at the end-of-case
ack, PAY-07/late-may-not-leave), `mutant.disposal-hold-first` (I31, DISP-03), `id.dispose-drops-lanes` (disposeActor's
I29, DISP-02), `1b.forget-marks-held-lane` (I32, DISP-05), `mutant.disposal-rereads` (DISP-04),
`mutant.release-drops-held` (DISP-01), and the three `o6.*` mutants: `o6.dispose-interrupts-wire` and `o6.no-bound` by
I35 (PAY-16), `o6.settled-in-bound-stays-held` by I36.

The guarantee change (user, Q1 A): Actors I35 (a call on the wire at the disposal's start is not cut short within 5 s;
one settling earlier ends by its own result and the disposal waits; one unsettled at 5 s ends unknown { Disposed })
and I36 (a definite ending during the disposal leaves no hold), written with to-spec as two Invariants because they
fail apart (reason in `workflow/specs/spec-log.md`). The timeline gained `Advanced { ms }` and `Read`; reads now run
every oracle.

Decisions and stated limits:

- A `Released` claim settles a head only while the suite holds a use of its actor (the builder's M2 leniency; an actor
  with no use runs no handler). Open: a false `Released` passes every oracle (L5: caught only by the cases counting
  `Released`, PAY-03, LANE-03, LANE-09; not registered); T7's rewrite fixes it under WriteLanes I12 with
  `lie.held-released-unguarded`.
- `1b.disposal-definite-w-first` is not ported: its expectation is mint order, which no Invariant states (I31 orders
  only the hold-leaving ending). Deferred to revisit.md; adding an Invariant would be a guarantee change.
- A kept lane needs a delivery plus unknown { Restored } at the boot or a disposal-reported ending; `Delivered` carries
  no channel, so a parked ending's channel is not compared (stated limit).
- `judge` keeps the first violation per oracle per step (noted, pre-existing); the per-step clock is a stated limit
  (stamping reports with the clock is a timeline change for later).
- `@effect/tsgo` 0.61.0 is exact, the newest at least two weeks old; `scripts/check-toolchain.mjs` does not check its
  version (outside T6's scope).
- Per-case disposal: the end-of-case reload attaches every actor that minted a write; a dropped head's lane is judged
  until a new commit of that operation; adoption requires a delivery only for a Held head and must not re-send.

Sidecars (Haiku, effort high; the lead verified each finding against the code and the Specs and re-ran every gate):
four reviews, each of one diff. R4 reviewer of `03098b28`: 9 findings, 7 accepted, 2 rejected. STYLE reviewer of
`f8b92e7b` and `03098b28`: 10 findings, 5 accepted, 5 rejected (keyed lanes are by design, `lane-queue` is unkeyed by
its stated limit; mutant names keep the old suite's ids, README decision). R4 reviewer of the I35/I36 diff: 10
findings, 5 accepted, 5 rejected (a Held head cannot end definitely during disposal since admission is closed;
`RuntimeDisposed` is the disposal's only public end signal). R4 reviewer of the T6 review diff: 10 findings, 4
accepted, 6 rejected or noted (owners come from `Minted`, the only report naming who committed; a boot's parked
delivery carries no channel; latent: no case disposes without re-ensuring).

## T7 (2026-11-10): first step, then parked for T40

Committed: H5 in `ending-channels` (a success or commit failure ends only in a step where the
server answered one of its sends; an answer given at request time counts; only unknowns and Flow's
own failures end without one), its mutant `mutant.success-without-answer` (PAY-16, caught as
WriteLanes I3), and case `DISP-06` (a disposed actor's ending parks and the next ensure hears it;
Actors R20, WriteLanes R10). Numbers: suite 67/67; null 0/67; falsify --parallel 6 38/38;
`nub run check` at zero.

Parked, not committed, by the orchestrator's call (lane-queue, lane-model and delivered-once are
rewritten from the Spec in T7's S2 after @task.V3.T40): the H1 keyed lanes in `lane-queue`, the H2
I16 check, the H3 replaced-delivery check and the H4 dropped disposal excuse in `delivered-once`,
and their mutants `mutant.replaced-delivered` (LANE-07, I15), `mutant.success-then-failure`
(PAY-01, I16) and `d6.disposed-ending-is-evidence` (DISP-06, I15), each seen caught for its reason
on the parked patch. They are the rewrite's acceptance list. Also found: with no key on `Minted`, a
keyed lane can be named from the request's input (the server log), as `disposal-ledger.ts`
`laneOf` does; the rewrite should do that rather than guess.

| Sidecar                      | Task              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer (test the spec, R4) | the H1 to H5 diff | 7 findings. Accepted: 2 (Flow's reasons exempt only failures from the answer rule), 7 (the doc lists the answer rule and request-time answers). Carried to the rewrite with the parked code: 1 (name a keyed lane from the request input, not a fresh lane), 3 (the replaced excuse ignores keys), 4 and 5 (docs of parked code). Rejected: 6 (WriteLanes I3 is the Invariant that enforces R2 in the coverage block, and the oracle names it; a made-up success breaks R2's three-channel classification). |

## T40 (2026-11-10 and 2026-11-11): suite simplified

Built, each item landing alone and gated from `packages/flow-state-v3` with `suite --json`, `suite --runtime null
--json` and `falsify --sweep --parallel 6` compared sorted with the item before (byte-identical unless noted):

- First pass (`a6063da3` to `81063ced`): S5 one `attemptKey`, `writeNamed`, `LaneId`/`sameLane`/`laneOf` in
  `dsl/domain.ts`; S7 key fields derived from the key Schema, `CHANNEL` gone; S6 dead world surface gone
  (`Storage.entries`, `Page.tasks`, `WorldClock.armed`, `World.seed`, `Request.page`/`at`); S1 oracles are pure step
  folds (`Judge`, `oracle`, typed `Violation`, `InvariantId` guarantees; the Case folds only new facts and keeps every
  violation; per case the verdict kind, oracles and first Invariant are identical and the sweep's red and caught-by
  sets are identical, texts now list every violation); S3 in part (`landLate`, storage `match`,
  `answerWhere`/`where`, `ensureWith` gone); S4 `fixtures/pay-steps.ts` with `REREAD_MS` and `PAY_TIMEOUT_MS` named
  from the fixture; S5 one `mayHaveApplied` from the server log, used by `ending-channels` and `disposal` (no verdict
  changed).
- Second pass (`98cec2b2` to `1592361b`, base `81063ced`): `STATUS.md` formatted; S3 `openCase` split into
  `runtimeLife`, `stepEngine` and the `Case` surface, `Driver` and `dsl/timeline.ts` gone, counters for steps and
  requests, one `reportsOf(tag)`; S8 the runtime choice is a string, one no-verdict fill path in `sliceVerdicts`,
  `applyEdit` one `Effect.try` (`--parallel 4` 67/67; a dead child and an unknown id each fail with their reason);
  the review's two STYLE.md lines; S1 review fold-ins (`Mutant.expects` is an `InvariantId`; the `Judge` doc no
  longer says pure).

Verified (orchestrator, HEAD `ac9e0fa0`, clean tree): suite 67/67; null 0/67; falsify sweep 38/38 caught, each by its
expected Invariant; `nub run check` zero.

Decisions and calls:

- `reportsOf` stays inside the Case, behind the five readers it serves (`endings`, `evidence`, `issues`, `denials`,
  `runtimeDisposals`), so 42 scenario call sites keep their one-word reads. `Mismatch` and `Violated` moved to
  `dsl/oracle.ts` so `actor.ts` imports `case.ts` for types only. `ackAll` is the labelled storage step
  (`answerStorage(what, how)`); the end's label stays `end of case: ack`, so verdict texts do not change. `Actor.ref`
  dropped as unused.
- Rejected: S7's "drop `Fixture`'s 4 generic parameters" (they are the lint's sanctioned place for
  `Schema.Codec<unknown, unknown>`, and `Schema.Top` does not give the encoders the requirement-free Codec they need);
  the review's "drop `declared`/`NotInFixture`" in `actor.ts` (with `noUncheckedIndexedAccess` a fixture table lookup
  by a generic key is `| undefined`, and `declared` narrows it; tsc fails without it).

Sidecars (Haiku, effort high, read-only; the lead re-ran every gate): a Conformance R5/R9 reviewer of S1 (`83c50e8f`),
15 findings: 2 accepted and fixed (`expects` typed `InvariantId`; the doc said pure while three oracles update state
in place), 4 carried, 6 confirmed or noted, 3 pre-existing or already gone. A refactor-parity reviewer of S3 and S8
found no difference in any path (accepted). Findings noted: an oracle's defect hides later oracles' violations in that
step (a defect either way); a `Read` is its own cut; each step is judged with the server log as of that step.

Carried:

- The machine verdict form (violations flattened to text at the Case, a step label rather than a number, only the
  first failing seed reaching the verdict, a thrown defect counted as `Fail`): Conformance Q2 and R9, for
  @task.V3.T14 (runner modes) or T15; not a T40 item because it changes every verdict line.
- `delivered-once`'s I16 and I22 claims with no check, and `lane-queue`'s I9 with no mutant: T7's S2.
- S7's `attempts` flag (dropping it touches `lane-model` and `delivered-once`): T7.
- S8's adapter decode-once: not done, by the brief.
