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

## T7 (2026-11-10 and 2026-11-11): WriteLanes area (in progress)

Bottom line: the convergence v2 build is under way (steps 1 to 4 in; see "Convergence v2 build" below).
Open: the rest of v2's migration; I22; T7's own rows.

- First step (`392147bc`): H5 in `ending-channels` (`mutant.success-without-answer`, I3) and case `DISP-06`.
- S2 (`a8714be6`, `c1f02294`):
  - `lane-queue` now has one phase per Attempt (`Held { at }`) and judges keyed lanes, named from `Minted.key` or
    the first request's input.
  - `Released` passes only in a step with a turn of a cancelling event (reference `cancels` or the new `mayCancel`;
    Pay: `IntentRead`, `OrderSeen`), giving WriteLanes I12 (review H1). A send while on the wire is WriteLanes I1.
  - `delivered-once` keeps one life per ending (`Owed { inDisposal }` or `Parked`). Declines are first in, first
    out. A surely replaced Attempt is never delivered, a forget (not a dispose) excuses a record, and I16 is judged.
    I22 is out of its guarantee until a releasing-lane fixture exists.
  - The `attempts` flag is gone.
- Baselines settled:
  - A turn's reports come before its `Turn`, so a cancel's history is the model at the step's previous `Turn`.
  - A reload judges the step's pending cancels over the reports before it, then drops every pending cancel.
- Verdict changes against `ac9e0fa0` (Conformance R11):
  - Case verdicts: none.
  - `mutant.release-drops-held` moves from `disposal` (Actors I29) to `lane-queue` (WriteLanes I12, R8 "no quiet
    release"; review L5). `DISP-01` now cites WriteLanes R8 and I12.
  - `id.dispose-drops-lanes` is still caught, but no longer in `DISP-01`, because I12 fires earlier there.
  - `lane.cancel-wire-as-never-sent` is now also caught in `PAY-12` and `PAY-15/cancel-on-wire` (keyed lanes,
    R14).
  - `lane.held-auto-resend` is now caught in about 30 more Pay cases, and `lane.cancel-held-keeps` in `LANE-09`
    (keyed lanes, R8).
  - New mutants: `lie.held-released-unguarded` (I12), `mutant.double-invoke` (I1), `mutant.replaced-delivered`
    (I15), `mutant.success-then-failure` (I16), `d6.disposed-ending-is-evidence` (I15). Each was seen caught for
    its reason.
- Sidecars (Haiku, read-only), with results checked by the lead:
  - A reviewer of the S2 diff:
    - Accepted: the `Released`-by-`Recorded` path was consistency-only (Conformance R4), so it was dropped. The
      suite stays 67/67 without it.
    - Noted: I9 is cited for a mint with no actor and for a send of a replaced Attempt. This is pre-existing.
    - Noted, latent:
      - a key reported as an array collapses lanes;
      - two fixtures sharing an operation name disagree on key fields;
      - a release on leave reads as an I12 violation until a fixture declares one.
    - Open for the user: the prototype records a local or non-persisted disposed actor's ending as evidence (rule
      44), while I15's exceptions do not list disposal. No case hits it.
    - Pre-existing and stated: an ending decided during disposal parks at the reload without a `Parked` report.

### The T40/S2 review's findings (2026-11-11; `references/proposals/t40-s2-review-2026-11-11.md`)

- **H1, done:** `mayCancel` is now transitions (event, from, to); a `Released` on a may-cancel event anchors only to a
  turn that took that transition (Pay: `IntentRead` UNSURE→PLACING, `OrderSeen` UNSURE→PAID). New
  `lie.release-on-guarded-read` (WriteLanes I12, `PAY-15/retry-budget`), caught for its reason; the review ran it
  uncaught at HEAD.
- **M2, done:** a reload keeps `Held { at }`, a head on the wire becomes `Held` at the reload's step, and queued,
  waiting and replaced Attempts drop; a send of an Attempt that left its lane is WriteLanes I1 (Restore I2: a boot
  sends nothing). New `mutant.boot-resends-held` (I12), caught in 12 cases.
- **M1, carried (needs a call):** round-14 reports no key at mint, and its evidence carries none; the adapter can
  read it only from the world's internals (`frames()`), which the Port rule forbids. Options: the Port requires
  `Minted.key` on keyed operations and T16's adapter meets it, with round-14's gap a stated limit; or the round-14
  adapter reads `frames()` as a prototype-only exception.
- **M3, done here:**
  - S2's constraints: `Held { at }` now survives a reload (M2); `drivenTurns` and `unstoppable` are lists kept
    across it; `unstoppable` is read at step end; the mutant dependencies hold (each still caught for its reason).
    `delivered-once` drops an `Owed` ending at a reload unless decided during disposal; whether that matches the old
    `open` set across a reload is not verified.
  - Baselines: a turn's reports come before its `Turn`, so a cancel is judged from the model at the step's previous
    `Turn`; a reload judges the step's pending cancels over the reports before it, then drops them.
  - `id.dispose-drops-lanes` on `DISP-01`: caught by `disposal` (Actors I29) before S2, by `lane-queue` (WriteLanes
    I12) after; the release comes before the disposal (R17: disposal drops no lane).
  - The ported `lie.held-released-unguarded` releases every hold when it is held (no turn anchors it); the old lie
    released only `Lab/R15Late`'s holds and was caught by the old cancel-cause check. The guarded-cancel case is
    now `lie.release-on-guarded-read`.
- **M4, done (`1ab7e889`):** `delivered-once` gives each ending a life `Refused { event }` after an
  `InvalidTurn` of its one pending delivery, settled by a later turn of that event by its actor (the
  redelivery) or by a second refusal, which makes it `Kept` (Actors R15: one try per boot or
  adoption; a `Delivered` with none owed takes a kept one as its last try). Port contract: the
  redelivery is not reported again as `Delivered` (round-14's behaviour; stated in `port.ts`). New
  case `DLV-04` (place answered with a malformed body, so `Placed`'s mapper throws) and
  `1b.r8-refused-ending-not-redelivered` (I15), caught for its reason. The file split into
  `ending-lives.ts` and `written-attempts.ts` (the 500-line warning).
  - Expectation drafter (Haiku, Spec only): agreed on state (PLACING throughout, no receipt), no
    re-send, kept across the boot. Disagreed: it counted no issue at the first refusal (A3: the
    Specs say only that the issue "names the cause"); the case checks only that an `InvalidTurn` is
    raised. Its A2 (WriteLanes I15 "final" against Actors R15 "one try per boot") is read as Actors
    R15; A1 (a kept ending's lane state), A4 (how a kept ending is let go) and A5 (does a kept
    ending keep its actor alive) are Spec gaps for the user.
  - Reviewer (Haiku) of the diff: 2A "a refused redelivery's turn drops the ending" rejected (a
    refused turn reports no `Turn`; DLV-04 runs that path and its boot try); accepted as stated
    limits in the Gotchas: a third try in the same step and a lost kept ending are not seen; two
    pending deliveries make a refusal unattributable; another `InvalidTurn` in the step excuses a
    missing redelivery (the Port's `Issue` has only a code). Noted: a redelivery during disposal is
    not judged.
- **M5, done (`4ad1daa8`, `a5df7376`):** `ending-channels` and `attempt-identity` are pure folds
  (no `Set`/`Map` mutated; `attempt-identity` derives the first request per id from the log and
  keeps one list of mints); the "in place" Gotcha in `dsl/oracle.ts` is gone. L6: whether an
  answered send is live and newest is judged at the step's end, so a send answered at request
  time is no longer missed (probe: `mutant.ending-without-id` on `PAY-12/sync` now reports "answered
  on a live send"; not kept as a registration). Reviewer (Haiku): found that the first cut still
  judged "newest" at ask time (accepted, fixed in `a5df7376`); a same-id re-send in the step is
  covered by the same fix; a `Reloaded` between an answer and the step's end is not reachable
  (noted); attempt-identity, the `-1` removal and the lane-naming move are equivalent.
- **Lows (`edcf62be`):** L2 an Idle cancel counts only the cancelling actor's endings; L3 `-1`
  sentinels gone from `delivered-once` and `lane-queue`, lane naming once in `dsl/domain.ts`
  (`laneAtMint`, `laneAtSend`); L4 doc drift (mutant headers, README `writeNamed`, the reload
  Gotcha after M2); M1's decision written into `port.ts` and the README limits. Carried: L1 (stated
  Gotcha), L5 and L8 (stated limits), L7 (types; carried from T40), L9 (a repeated mint is
  `attempt-identity`'s I6), L3's template-literal keys and `Written`'s flags.
- **Verdicts against `b2b51634`** (Conformance R11): no case verdict changed; the sweep gains only
  `DLV-04` and the new mutant (47/47). Suite 69/69, null 0/69, `nub run check` at zero at
  `a5df7376`.
- **Reviewer** (Haiku, H1 and M2 diff against WriteLanes I12, R8 and Restore): the Pay transitions match the machine;
  a boot send is never correct (Restore R3, I2); both mutants do what they say (accepted, re-run here). Carried: a
  machine's own timer-fired retry sits in a step with no `Drove` or `Answered`, so it reads as not driven (pre-existing,
  now also for restored heads).
- Verdicts: no case verdict changed; sweep 46/46, the two new mutants only.

### Disposal findings (2026-11-11; the T6 completion review's M1 to M4, M6 and Lows)

- **M6:** `endingOf` in `dsl/domain.ts` is the one answer-to-ending rule (channel, a failure's tag, `StillUnknown`,
  `Defect`); `Never` settles nothing. The ledger, `disposal` and `ending-channels` use it. New case
  `PAY-16/never-answered-waits-for-the-bound` and `mutant.short-disposal-bound` (Actors I35), seen caught for its
  reason, and seen missed by `disposal` when the probe let `Never` settle again.
- **M4:** a driven cancel settles a waiting or Held head; a head on the wire stays open, and its unknown ending holds
  it (WriteLanes R14). R4's clashing clause was the old `HeldThisTurn` (the `cancel` policy); R4 reworded, no
  Invariant changed (`workflow/specs/spec-log.md`). @plan.Operations.O3 has the same phrase, left for the user.
- **M1:** a parked or restored ending counts only when the delivered event maps to that ending's channel.
- **M2, M3:** the ledger is one table keyed by (phase, move), `Settled` split into `Answered`, `EndedUnsent`,
  `Cancelled` and `Claimed`; per disposal, each call has one closed state (`Open`, `Settled`, `Done`) and one step;
  kept lanes (`Dropped`, `Unbound`) moved to `actors/disposal-kept.ts` with one step. Everything is immutable.
- **Lows:** L3 ids out of doc comments; L4 lists; L6 end of case advances 4999 then 1 ms; L7 the reason is compared;
  L9 a recommit matches the lane when `Minted.key` is known; L10 a second delivery of the same id; L11 a lane settled
  while unbound is owed at adoption; L12 `uncertain` is `=== true`, the dead fallback gone. L8 stays a stated limit
  (Gotcha). `Released` no longer needs a held use (`lane-queue` anchors it).
- **Verdicts against `ca6e2f4d`** (Conformance R11): no case verdict changed. Sweep: `lie.boot-says-disposed`,
  `lie.boot-drops-held` and `lane.unknown-promotes` are now also caught in `PAY-12/cancel-on-wire`,
  `PAY-15/cancel-on-wire` and `LANE-04` (R14: the cancelled head is kept); `mutant.short-disposal-bound` also in 8
  cases at the end of case (L6).
- **Expectation drafter** (Haiku, Spec only) for the new case: agreed on every step (not ended at 4999 ms, unknown
  Disposed at 5000 ms, no Restored, nothing invoked). Its ambiguities A2 (Actors R10 against Restore I6) and A4 (the
  exact boundary) noted; the case follows I35's wording.
- **Reviewer** (Haiku, the diff against the intended changes): (1) failure after a may-apply first send: rejected, a
  first send has no earlier request; (2) an unknown ending of a first send holds it, (3) a re-send on the wire is not
  owed at adoption, (4) a restored ending must arrive as the unknown event: accepted as intended (R8, the oracle's
  stated rule, Restore I6); (5) a dropped head evicted an unbound one on the same lane: accepted and fixed (one of
  each per lane); (6) a second ending, first answer wins, order only: noted. Its lint note (a shadowed `endingOf`)
  fixed.

### Rows round (2026-11-11, after T8; the coordinator's T7 list)

Bottom line: I4, I5, I7, I13 (in part), I25 and I15's releasing-lane clause are checked; I28 is T18's
(decision 8); I2, I9, I14, I17 to I19, I23, I24, I26 and I27 stay T7's, each with its reason in
`not-yet.ts`. The old-suite comparison (Conformance R11) of every old lie red on a ported case
finds no new-suite gap.

- New checks: `retry-count` (I7: a read row's `retryCount` equals the server's re-sends of the
  lane's head); `evidence-kinds` (I4: an ending with an evidence-kind reason is never delivered);
  `idle-guard` (I13: an `idle`-guarded alternative is taken iff the lanes are Idle, from the
  lifecycle); `lane-queue` claims I5 (an unretained unknown's release is its own deadline,
  `UnretainedRelease`, marked on its `Await`); `ending-channels` claims I25 (its answer checks).
- Fixture `Release` (`Lab/P1Rel`, a trait whose `whenAbandoned` releases `q`) with part tables in
  the handler table (`parts`; a part-only turn stays at the leaf and must say so), and the cases
  LANE-11 (unretained unknown) and LANE-12 (a releasing lane delivers nothing). Changed expected
  results: three lifecycle traces and one step test now cite I5 where they cited I12 for an
  unretained unknown's release (I5 is the Invariant that states it).
- Mutants: `lane.retry-count-frozen`, `lane.superseded-delivered`, `lane.idle-never-passes`,
  `lane.unretained-unknown-held`, `lane.releasing-delivers`, `turn.part-turn-moves-header`.
- Drafter (Haiku) of LANE-11 and LANE-12: accepted, with its open points (R17 against R14 and R16
  on a release's interrupt ending) left unasserted.
- R11 comparison (scratch script, one run of each lie on an edited round-14, whitespace-insensitive
  edits as the old suite applied them): 25 old lies are red on a ported PAY case; the new suite
  kills 24 by an oracle, `w.patch-in-place` in its old form only by a case (round-14 freezes
  published memory; the registered form drops the freeze and is caught by I29). Differences:
  `e8.wa-failure` is red on DLV-03, not PAY-12 (the variant that caught it needs a module fault,
  not ported); `k.no-boot-ev+boot-order` survives: it removes the prototype's internal `boot`
  evidence and reorders boot inputs, which no case observes through the Port (an old-suite check of
  internals, decision 2).
- Reviewer (Haiku) of this round, 10 findings. Fixed: a part-only turn's reported `to` is judged,
  and a part-only turn is allowed only when the root and leaf have no alternative for its event
  (1, 3; mutant `turn.part-turn-moves-header`). Owed as remainders: idle over a busy lane, no
  fixture reaches it (2, 6); I5 seen apart from the runtime's `Released` (5). Stated: the
  answer-to-ending check needs the ending in its answer's step (4, an older stated limit); the
  unended check names I3 though it is I27's clause (7, kept with I27 owed); re-sends counted at the
  server (8); a decline matched by operation (9). Rejected: `unknown` on `Await` is not derivable
  (10): `hearing` is cleared once the ending is heard, before the deadline reads it.

### Rows round 2 (2026-11-11, the coordinator's calls on PF, I9, I14, I17, I18, I23, I27)

Bottom line: I9, I14, I18 and I26 are checked, and I27 in part; I2, I17, I19, I23 and I24 are
still T7's (next round's plan below).

- I26: probe PF is now `lane.retry-members-dropped`; `lane-queue` owes a head re-sending since the
  step began its send by the end of a step in which the store answered every held write (`ack`;
  the Case now records `Acknowledged` on every `ack`, even with no Attempts). I9: a re-send that
  carries an Attempt its lane never sent (`lane.retry-sends-another-attempt`). Both in
  `write-lanes/resend.mutants.ts`.
- I27: `ending-channels`' "an answered live send ends in its step" check now names I27 (its "a
  call that settles gives its Attempt an ending"), with `lane.settled-without-ending`; the rest of
  I27 is a remainder.
- I14, I18: fixtures `Keyed` and `Held` (`fixtures/keyed.ts`, from `round15b.ts`), cases LANE-13
  (a key-less cancel in a's success leaves b's lane alone) and LANE-14 (an input that cannot encode
  declines `NotSent { Unencodable }` and the turn runs), checked by their own expectations with
  `lane.keyless-names-latest-lane` and `lane.unencodable-refuses-turn`. Drafter (Haiku): accepted;
  its open point (whether the bigint reaches the encoder) is settled by R12's "cannot encode".
  Finding: no oracle catches the key-less cancel landing on the other key's lane (b ends
  `unknown { Cancelled }` with the fold silent); only LANE-13's expectation does. Carried to T15's
  audit.
- Next round, as approved: I17 needs `Boot` to carry a fixture release (the old suite mutated a
  `Release { v }` between boots; `keyStampFixture(rel)`, `round13.ts`), and a hand Schema per
  release; I2, I19, I24 need a domain-write fixture (`p1TicketFixture`, `phase1e.ts`, or
  `docsFixture`, `stores.ts`) and a Port read of entity data (the store is not on the Port); I23 an
  oracle on late answers after a release, forget or interrupt (no delivery, no lane, no replacement
  work), with a mutant at round-14's interrupted fence (`step.ts`, `turn.ts` `admitEnding`).

### Handover (2026-11-11, end of this lead's run)

- Convergence on the WriteLanes oracles' phase state started (orchestrator): `lane-queue.ts`, `lane-model.ts`,
  `delivered-once.ts`, `disposal*.ts` and `dsl/domain.ts` are frozen for builders; the
  `t7-fixes-review-2026-11-11.md` review's M1 to M4 go to that pass. I22 and T7's own rows wait for it.
- Started for I22 and kept (`0eb28949`): the Port's `send` takes the `part` an event is addressed to (a trait or
  fragment instance, `E.t.Go`), and `Drive` carries it; actor views send to the root. T8's fragment cases need it.
  Not built: typed part events on `Fixture` (the T8 lead's design), the `Lab/P1Rel` fixture.
- That review's Lows in allowed files: L5 (the end-of-case "past the bound" wording) and L7 (`Replacement`
  unexported) fixed; L7's `Transition` typed by the fixture's events and states is carried; the rest are in frozen
  files and go to the convergence pass.

### Convergence v2 build (2026-11-11; `references/proposals/lane-oracle-convergence-v2-2026-11-11.md`)

Bottom line: steps 2, 1, 3, 4 and 5 landed; `lane-queue` and `delivered-once` read the Case's one fold. The step 4
review's H1 is fixed (a turn owes its chosen row's members); its M1, M3, M4 and Lows are next, then steps 6 to 9
("Run 3" below). Now: suite 86/86, null 0/86, coverage 0 gaps (35 checked), the lifecycle tests 30/30, `nub run
check` at zero.

- **Order:** step 2 before step 1, so the lifecycle's facts-to-moves step reads the real Port. Step 1 is split: part 1
  (Table A, deadlines, promotion) is in; part 2 (Table B, Table C, the actor moves, `step(model, reference, facts)`)
  is not.
- **Step 2 (`26c3bfcf`, `cc0763b3`):** round-14's mint, decline and delivery notes carry `actor`, the mint `key`
  (lane.ts, world.ts, reads.ts, step.ts, turn.ts); the next-turn attribution is gone (README decision 10 closed).
  `Turn.members` (target `Only`, `Key`, `Every`, and `Nothing` for a member that names no lane), `Issue.ending`
  (`InvalidTurn` and `UnmappedEnding` of an ending), `Incarnated` (round-14 `incarnation`) and `Finished` (`ended`).
  A `Minted` with no actor, or a keyed one with no key, stops the case as `UnreadableReport` naming the field.
  - Gate: with the key withheld, the sweep is byte-identical to `c1427047` (checked). The key at mint changes one
    mutant's reach (Conformance R11): `lane.held-auto-resend` is now also caught in `PAY-18`, and in
    `PAY-09/ack-stored-confirmation-lost` now by its oracle (WriteLanes I12; R6: the lane is named at mint, M1).
    No case verdict changed.
  - Port shape added by the lead (small, logged): `MemberTarget.Nothing`. Why: round-14 runs key-less members that
    act on no lane (a decline's ending, another operation's ending, a key-less retry outside an ending, a key that
    did not encode); naming them with a `null` key would anchor a no-op to a lane. Reverse: drop the variant and
    omit those members.
  - Reviewer (Haiku) of the diff: accepted and fixed: the `null`-key sentinel and the three no-op paths (now
    `Nothing`); a release of an unkeyed operation is `Only`; a non-JSON mint key read as missing, so the Case names
    it (it was dropped with the batch as `SinkFailed`); `UnreadableReport` carries its text. Noted: v2 cites
    `step.ts:644` (`returned`) for `Incarnated`; `returned` always reaches the `incarnation` note, which is mapped,
    so one report per incarnation. Noted: the `FollowUpBound` `InvalidTurn` carries no ending (not a refusal of the
    ending's delivery). Rejected: an unkeyed mint's key `Some({})` (lane naming ignores the key of an unkeyed
    operation).
- **Step 1, part 1 (`527429c4` and the next commit):** `dsl/lifecycle-model.ts` (types), `dsl/lifecycle-rules.ts`
  (Table A with one cell per guard value, the deadlines, the promotion rules), `dsl/lifecycle.ts` (`advance`, `due`,
  `incarnate`, `cellOf`), traces in `dsl/lifecycle-ends.traces.ts`, `dsl/lifecycle.traces.ts` and
  `dsl/lifecycle-obligations.traces.ts` (builders in `dsl/lifecycle-trace.ts`), and `dsl/lifecycle.test.ts`: every
  trace holds, every cell value is reached, and every other outcome of every cell (each phase, stay, each Invariant),
  every other deadline and Invariant, and every other promotion rule is killed. No oracle uses it yet.
  - Lead's calls: promotion runs after every move, not as a cell flag (requirement 3); `Restoring { head: false }`
    is not addressable; a reload restores a queued commit as `Restoring { head: false }` and an unsent head as
    `Restoring { head: true }`; an unknown `Disposed` while running is Actors I35; cancelAll's NotSent out of mint
    order is WriteLanes I21; `Model.afterDisposal` gives `AwaitRestore` its `runtimeDisposal` cause; an ending is
    recorded when its `End` is applied (Table C will move its life).
  - Pending cells, marked in code and traces: never-sent ending (CQ5), never-sent commit at the disposal's end
    (CQ6), the superseded head's promotion (CQ7), Restore I6's claim (CQ11).
  - Reviewer (Haiku) of the lifecycle: Table A matches v2 cell for cell except three guards, fixed or pinned:
    accepted and fixed: endings were never recorded, so a replaced Attempt's second ending passed (now recorded,
    trace "a replaced Attempt's second ending", seen failing without the fix); the unretained unknown's
    `Await Released` was unpinned (two traces with `due`); the `second` promotion mutant was killed only as "promote
    nothing" (new trace); `identity` excused unreached cells (now needs a reach); a `PendingCancel` of the other kind
    (trace); an unretained unknown `Disposed` during disposal holds with nothing owed (trace, R17); cites relabelled
    (StepEnds as today's rule, CQ5, R14, requirement 3). Noted for v2's wording (step 9): footnote 9's "stays Held"
    against the `Await Released` deadline (the code follows the deadline: R4 says it is released); footnote 10's
    I20 against footnote 9's I35 for an unknown `Disposed` while running; footnote 12 should name the releasing
    lane; footnote 4 should name the out-of-order I21; `afterDisposal` belongs in v2's Model. Noted: the
    `PendingCancel` deadline's Invariant is unread while it has no deadline.
  - `527429c4` alone failed `nub run check` (the test imported `@effect/vitest`, an Effect unstable-API warning);
    the next commit imports `vite-plus/test` and is at zero.
- **Step 1, part 2 (`1a850b5d`):** Table B (`tableB`, `dsl/lifecycle-lanes.ts`), Table C (`tableC`,
  `dsl/lifecycle-lives.ts`), the actor moves and `apply` over every move (`dsl/lifecycle-fold.ts`); traces in
  `lifecycle-members.traces.ts`, `lifecycle-turns.traces.ts`, `lifecycle-lives.traces.ts`. The test kills every other
  action of every Table B cell and every other fate of every Table C cell (planted: without their traces, each gate
  fails). No oracle reads it, so no verdict changed.
  - Lead's calls: `step` moves to step 3, since it anchors members against step 3's rows; the open turn is a Model
    field (`turn`); a commit's cell is read at member time and waits for its mint or decline, holding later members
    (I10); a commit with neither by the turn's close is WriteLanes I15 (deadline `Commit`, every commit delivers its
    ending); a stray decline is I1; a member with no lane (`Every` on an operation with none, a commit whose key did
    not encode) acts on the key-less Idle lane; the Idle cancel with a kept ending lets it go (Actors R15 as written,
    CQ3); a delivered ending discharges its Attempt's `AwaitRestore`; head-less actions on the Idle row, and moves to
    the head's own phase, are excluded from mutation as equivalent.
  - Reviewer (Haiku) of the diff, 13 findings: accepted and fixed: a key-less commit's `Unencodable` decline was I1;
    `Every` on an operation with no lane; the commit deadline as I10 (design: I10 is order only; now I15); a disposing
    delivery of a Kept ending (footnote ᵈ: I15); a repeated cancel owed twice; `Heard` names the delivering ending;
    `SupersedeHead` on Idle is not equivalent (now mutated); the fold's doc states anchoring is the caller's. Changed:
    the `Every` trace's cite (see decision below). Rejected: the cancel-policy replacement of a cancelled never-sent
    head keeps its cancel (the design's `replC` note, R14); `AwaitRestore` discharge ignores the incarnation (an older
    one is already due by its step's end). Noted: a refused 65th mint also fails the commit deadline (refused-move
    rule).
  - For the user: WriteLanes R9 makes a key-less member on a keyed operation outside an ending KeyRequired, while
    round-14 (`turn.ts:752-757`) and v2's Port change 1 act on every lane (`Every`). The suite follows round-14 until a
    Spec answer.
- **Step 3 (`e760b472` and the next commit):**
  - Rows (`Row`, `row`, `Rows`, `rowsFor`) in `fixtures/reference.ts` and `fixture.ts`, typed by states and operations
    (`payRow = row<string, State, Write>`); events stay strings, since rows name internal events. Pay has 13 rows
    (`PayRequested` PAYING→same and any→PAYING, `Leave`, `Confirmed` ×3, `PlaceUnsure`, `VoidUnsure` ×2, `RetryNow`,
    `IntentRead` ×2, `OrderSeen`); Cells adds `AbortPay`; the Lab fixtures one or two each.
  - `guard: Option<Retryable>` (`operation`, `times`, `passes`): Pay's `PlaceUnsure`, `VoidUnsure` and `IntentRead`
    UNSURE→PAYING rows pass with `retryable(3)`; `VoidUnsure`'s `[void.cancel]` row needs it to fail. `PlaceUnsure`
    carries it too, because its compiled alternative does (v2 named only the other two).
  - `unknown: { event } | "ignore" | "bare"` with `unknownEvent` and `retains` (WriteLanes R4: mapped, and not under
    `cancel` except an `O.x.cancel`'s `Cancelled`).
  - Change detector `fixtures/rows.test.ts` (labelled as one): each fixture's rows equal its round-14 compiled
    alternatives that run write members (a root alternative's state token is its `from`; a retryable token is
    `passes`, a later same-target alternative `fails`). It was seen failing on a planted wrong guard.
    `adapters/prototype.ts` gains `compiledOf`.
  - `dsl/lifecycle-step.ts`: `step(model, known, facts, requests)` gives `{ before, after, applied }`. Lead's calls:
    `requests` is a fourth argument (retryable counts the server's log before the step plus the step's accepted
    `Send`s); rows with equal members both matching one turn anchor it (`PayRequested` from PAYING matches two);
    a turn with no write member matches without a row and anchors its releases; `Incarnated` counts once per actor
    per step (an `Adopt` counts as that one); `unstoppable` is a Model field; a `Parked`, `Unparked` or `Recorded`
    takes its actor from the Attempt's lane, or the operation's oldest open decline, else its newest. Tests in
    `dsl/lifecycle-step.test.ts` (matching, mismatch as I1, guard both ways, own-step sends, retention, `Heard`,
    `Incarnated` anchoring, `Adopt`).
  - Found while writing it: an unretained unknown re-sent in its own ending's turn (R15Switch with `Retrying`) owed a
    `Released` it never gets, a false WriteLanes I12. Table B's `Resend` now discharges the head's `Await Released`
    (WriteLanes R4: released once its own turn ends); trace "an unretained unknown re-sent in its own turn owes no
    release".
  - Reviewer (Haiku) of `e760b472`, 9 findings. Rows and the retry offset checked right. Accepted and fixed: F1 a
    report naming only `Closed` declines now names the newest (Table C refuses it as I15); F4 only accepted `Send`s
    count, and the test now sends from `Resending`; F5 the memberless-turn test is named for what it checks. Carried
    to step 5: F2 `Delivered.event` is not checked against the ending's mapping (v2 moves that check to the lives
    oracles). Carried, needs a call at step 4: F3 a release owed with no turn in scope (an unknown heard only by
    `Unhandled`, `Denied` or parked) is due only at a later turn's close; closing at `Delivered` would refuse a
    release whose own turn follows. Noted as latent: F6 cancel then retry of one lane in one turn would drop the
    cancel's release (no row has two members on a lane); F7 the detector filters compiled members by the fixture's
    writes and compares rows only, not channels, `concurrency` or `unknown`; F8 `rowsFor`, like `referenceFor`, keeps
    the later of two fixtures with one machine id (Cells' rows are a superset of Pay's); F9 `retained` defaults to
    true for an unknown lane, and storage evidence is not a move.
- **Step 4 (this commit):**
  - Built: `dsl/case.ts` folds `step` once per step before the oracles and passes `lives` to every Judge
    (`dsl/oracle.ts`); `lane-queue` reports the lifecycle's refusals of its guarantee (WriteLanes I1, I8, I9, I10,
    I11, I12, I20, I21), plus views: W bounds and I9 at the step's end, I10 member order, and cancelAll's head-last
    (I21); Port change 2 (round-14 `finish` reads the members, notes the turn, then applies them; a refused turn
    truncates the note with its evidence); `step` skips reports of an operation no fixture declares a write (reads).
  - Lifecycle review (`references/proposals/lifecycle-review-2026-11-11.md`): **H1 accepted, fixed:** a `release`
    member anchors only on an operation whose reference sets `releasesOnLeave` (WriteLanes R16; none does), else the
    turn anchors nothing; probe kept as `lie.release-member-claimed` (I12). **H2 accepted, fixed (settles F3):**
    `Await` carries `heard`; an unretained unknown's release is owed by the turn that hears its ending, due at its
    close, or at the step's end when heard with no turn (`Unhandled`, `Denied`); not due while unheard (parked).
    Four traces, the "heard by no turn" one seen failing on the old `due`. **Carried to the next run:** M1 (a kept
    decline or never-sent ending; with CQ1 and CQ2 for the user), M2 (`EndDefinite` × `Gone{evidence}`), M3 (mutants
    for the guard code and `step`), M4 (`declineAllowed`), the Lows.
  - F3 decided (lead): as H2's fix above. The "by the step's end with no turn" half is a reading of R4's "once its
    own ending's turn ends"; a bare or ignored unknown (never delivered) is a stated limit, no fixture has one.
  - Cases: `PAY-21` (two shoppers; one IntentRead cancel releases only its own hold, T7 M1) and `PAY-22` (void Lost
    four times: three retries by `retryable({ times: 3 })`, then cancel and one release, T7 M2) in
    `write-lanes/lane-anchors.scenarios.ts`. The design's PAY-17 and PAY-18 ids belong to ported cases; its PAY-19 is
    `PAY-09/ack-stored-confirmation-lost`, which already restores a never-sent head. Expectation drafter (Haiku, Spec
    only): agreed on every value of both; its ambiguity (a) (lane identity per actor) follows R6 and round-14's
    `laneKey`; (d) the last ack has nothing to acknowledge (the case has no ack after it).
  - Mutants: `lie.release-other-lane` (PAY-21), `lie.void-retry-releases` (PAY-22), `lie.release-member-claimed`
    (PAY-15/retry-budget), all I12; `lane.reject-queues` (PAY-02, I8); `mutant.boot-replays-never-sent` (PAY-09
    ack-stored-confirmation-lost, I1); `mutant.members-reversed` (PAY-03, I10). Each seen caught for its reason. The
    design's `lane.guarded-cancel-keeps` is `lane.cancel-held-keeps` with PAY-03 added (now caught there, T7 M2).
    WriteLanes I10 leaves T7's not-yet row.
  - Verdicts against the sweep before step 4 (Conformance R11): no case verdict changed. `p1h.cancel-all-idle-declines`
    now expects WriteLanes I21, not I20 (v2's intended change, M4: a decline after an Idle cancelAll). Reach changes:
    `lane.cancel-held-keeps` also caught by I12 in PAY-03, PAY-08/reloadDuringCharge, PAY-14 and both PAY-20 (a
    guarded cancel's row owes `Released`, R14, I12); `lie.held-released-unguarded` also in LANE-04, PAY-12 and PAY-15
    cancel-on-wire (an O.x.cancel's `Cancelled` is retained, R4, R14, so a release there owes nothing);
    `mutant.superseded-claimed` also lane-queue's I8 (R7: `Superseded` only where owed); `lane.fresh-mint-on-held`
    and `lane.unknown-promotes` no longer also I9 (the refused move leaves one addressable head). The new cases widen
    many mutants' red sets only.
  - Reviewer (Haiku) of the diff, 12 findings: accepted and fixed: (1) cancelAll head-last was dropped (view restored;
    no mutant yet, carried), (2) a parked unretained unknown refused at the step's end (fixed by H2); changed: (3) the
    F3 cite now says reading; accepted as stated: (8) bounds at the step's end, (10) the I21 re-attribution logged;
    rejected: (4) the old "driven turn later than the hold" re-send guard: a re-send now needs an anchored retry
    member, which is stronger, and a retry in its own ending's turn is legal (R15Switch); (7) undeclared writes are
    skipped: fixtures declare every write, reads are the rest, and `attempt-identity` still anchors every send;
    noted: (9) I10 blind spots (two like members on a lane), (11) Port change 2 is order only, (12) boot-replays is
    caught by its `Send`. Carried: (5) a turn whose reported members differ from its one row anchors nothing, so a
    runtime that drops a cancel member from both its report and its act passes (v2 calls the mismatch no violation;
    needs a call at step 9); (6) the "each Invariant in one lifecycle oracle" unit test lands with steps 5 and 6.
  - Reviewer (Haiku) of the H1, H2 and head-last delta, 12 findings: accepted and fixed: (1) head-last judged a head
    that ended before the cancelAll (now only a head not yet ended when the queued commit ended), (3) `Unhandled` and
    `Denied` now close the open turn before hearing, (7) the H1 mutant pushed a release with no subject (fixed; seen
    caught as I12 on its case). Rejected: (8) as (7) above. Carried to the next run: (2) an unheard `Await` keyed by
    Attempt can be flipped by a later ending of the same Attempt across a reload (it should name its ending); (4) an
    unheard `Await` whose ending closes unheard (reload, releasing lane, never-returning actor) is never due; (5) and
    (6) `releasesOnLeave` is per operation, not per leave event, and has no positive trace (no fixture declares a
    whenAbandoned cancel); (9) head-last is per step; (10) `Resend` drops an unheard `Await`; (11) no step-level
    mutants (M3); (12) R4's wording against a release due by the hearing turn's close (for step 9's Spec read).
  - Sweep: `lane.held-auto-resend` runs past the 120 s child bound on `PAY-22` (seen alone: no verdict on PAY-22,
    caught on its own cases LANE-03 and PAY-15/press-pay-while-held). A Held void re-sent at once loops under the
    world's settle; the sweep's per-mutant child has no per-case bound (Conformance Q11, Q12 carried). Not fixed.
  - Next: the lifecycle review's M1 to M4 and Lows, then step 5 (`delivered-once` onto `lives`, Port change 5, F2),
    then 6 to 9.
- **Next run (2026-11-11, from `805dc643`):**
  - **Item 1, a time bound per case (Conformance Q11, Q12):** each runtime case runs under one 10 s bound over its
    seeds (`CASE_SECONDS`); the world asks `overdue` at every settled task, timer firing and request and throws
    `Overdue` (again on every later ask, so a runtime that swallows one stops at the next). The verdict is the new
    `Timeout` kind (`TIME` in the human form): no oracle, no cites, so falsify never counts it as a catch (it is red
    but never `Caught`; alone it is `WrongReason`). Q12 rewritten to what stays open (static cases, a host-free spin,
    the split path's slice bound), logged in the spec-log.
    - Sweep against `805dc643` (Conformance R11): one change. `lane.held-auto-resend` is now caught (it had no
      verdict: the 120 s child bound); `PAY-22` is `Timeout` under it and red, not caught; its catch is by WriteLanes
      I12 in 38 other cases (LANE-03, PAY-15/press-pay-while-held among them). Every other mutant byte-identical
      (step texts aside). Suite 86/86, null 0/86.
  - **Item 2, the lifecycle review's Mediums and Lows:**
    - M2 (`88188934`): `EndDefinite` × `Gone{evidence}` admits the first ending (`evidenceFirst` stays), as the other
      two End rows do (WriteLanes R7, R10, I15); trace "a replaced Attempt's late answer is evidence".
    - M4 (`a9f78ab1`): a commit's decline is allowed only for `Rejected` where the lane declines, `Overloaded` past 64
      waiting, `Disposed` while disposing, or a reason no policy gives (`Unencodable`, `NoPersistence`,
      `OldVersion`, `ModuleDisabled`); any other is WriteLanes I8. Lead's call: `Disposed` at a decline is allowed
      only while the Runtime disposes (Actors R22), `StorageRefused`, `Cancelled` and `Restored` never (they end a
      minted Attempt). Seven traces; seen failing with the old `true`.
    - M3 (`5cf960b9`): `lifecycle-step.test.ts` runs its examples against six source mutants of `lifecycle-step.ts`
      (written beside it, imported, removed): release check dropped, no `Heard`, `retryable` off by one, retention
      inverted, another actor's ending heard, `Delivered` closes no turn. Each killed; two new examples for the last
      two. Carried: obligation identity in Table A traces (they still compare counts; ~150 traces to restate by
      hand, and deriving them from the code would be common mode).
    - M1 (`13a493d6`), **pending CQ1 and CQ2**: a twice-refused decline or never-sent ending is `Closed`, as Actors
      R15 is written; a sent write's stays `Kept`. Round-14 keeps declines (D123); no oracle reads Table C's
      refusals yet, so no verdict changed. It becomes visible at step 5.
    - Lows (`b0280fb8`): L3 CQ7 in Table A's Gotcha; L4 a `Send` of a `Resending` head that owes its release is
      WriteLanes I12 (trace); L6 the unreachable `last === undefined` gone; L9 `unstoppable` deduped. Carried: L1
      (the open turn's `waiting`/`silent` as obligations), L2 (I5 not I12 for an unretained unknown's unmet release:
      a label change with a verdict reach, best with step 5), L5 (needs `actor` on `Parked`/`Unparked`/`Recorded`,
      a Port change), L7 (lie path only), L8, the rest of L9.
    - Sweep against item 1: identical. Suite 86/86, lifecycle tests 22/22.
  - **Item 3, the step-4 reviewers' open items:**
    - (2) and (4) (`dcc13b4c`): an unretained unknown's `Await Released` names its ending (`hearing: Option<index>`,
      replacing `heard`), so only that ending's turn makes it owed; and it falls due as soon as that ending closes
      unheard (`Closed` or `Evidence`: a reload, a releasing lane). Two traces. A never-returning actor's parked
      ending never closes, so its release stays undue (stated).
    - (5) and (6) (`b09b983b`): `releasesOnLeave` is now the leaving transitions (event, from, to), and a `release`
      member anchors only in a turn that took one; a positive step example with a releasing reference, and its
      negative.
    - The member mismatch: **a guarantee gap, stopped.** No Invariant states that a turn runs its selected
      alternative's declared members. Turn I2 is selection only; WriteLanes I1 is about invokes and I10 about order;
      a runtime that drops a cancel member from its report and its act breaks R14's effect but no Invariant. For the
      user: add an Invariant (WriteLanes or Turn: "a turn's members are exactly its selected alternative's") or
      keep v2's no-violation rule.
    - Sweep against item 2: identical, 74/74 caught. (The sweeps ran on scratch copies without `workflow/`, so
      their coverage line reads BAD; coverage in the checkout is 0 gaps.)
  - Next: step 5 (`delivered-once` onto `lives`, Port change 5, F2, DLV-05), then 6 to 9; L2 with step 5; the member
    mismatch waits on the user.
- **Run 3 (2026-11-11, from `1186683d`):**
  - **Reviewer (Haiku) of `2dec83cb^..1186683d` (`81127d25`), 11 findings, no High.** Accepted and fixed: (1) the
    null gate took any non-`Pass`, so a null run of all `Timeout`s read ok; it now needs every case `Fail`; (3) no
    test held Timeout judging: `judge` is exported and `runner/falsify.test.ts` pins a lone `Timeout` as
    `WrongReason` and a catch beside one (seen failing with Timeout counted red); (4) the `releasesOnLeave` example
    called the real `step`, not the mutated one, so it guarded no mutant (found while adding the asked mutants):
    it now runs through `using`, with one negative per field (event, from, to) and three mutants, each killed;
    (5) a step mutant is killed only by an `AssertionError` (any other throw fails the test); (6) the stale
    `heard` doc. Rejected: (2) checking the bound in `judge`: a violation judged from reported facts is true at any
    wall time, and a bound there turns it into a `Timeout` on a slow machine; (9) the two
    `FLOW_STATE_ALLOW_UNKNOWN` markers are one per `unknown` use (FLOW-STATE.md). Carried to step 9: (7) Table A's
    `End` × `Gone` (M2) and `Send` × `Resending` (L4) and Table C's twice-refused never-sent `Closed` (M1) are not
    yet in v2's tables; (8) `ModuleDisabled` in the no-policy declines (WriteLanes R13 moves it to the entity
    store; kept as a reason no lane policy gives) and `Disposed` at a decline while disposing (lead's call, logged
    in M4). Noted: (10) a wrapped `Overdue` is a `Fail` with no oracle, never a catch; (11) a child past its 120 s
    bound is `NoVerdict`, not `Timeout`.
  - **Step 5 (`1f922556`, `31933a7b`):** `delivered-once` reports the fold's refusals of WriteLanes I15, I16,
    Actors I24 and Restore I6, with no views of its own. Port change 5: round-14 notes every admission of an
    operation's ending (`turn.ts` `deliver`), the redelivery after a refusal and a kept try included. F2: a
    delivery whose event is not its ending's mapping (`mappedEvent`) is refused as I15 (lead's call: it delivers
    an ending that does not exist; I3 stays `ending-channels`'). The old ledger code is now unread (step 8 deletes
    `ending-lives.ts`, `written-attempts.ts`, `lane-model.ts`).
    - Found on round-14, three lead's calls (each with traces, seen failing on the old code):
      1. A boot decides its restore endings before it opens incarnations (`step.ts` `onBoot`: `restore`, then the
         `incarnation` notes), and a record not woken at ready hears them parked at its return. So `Reload` owes
         each Held head's `AwaitRestore` to the actor's next incarnation (cause `plain`, or `runtimeDisposal` after
         a disposal), and only a return from grace, `disposeActor` or `forget` owes its own at `incarnate`. A Held
         head that owes its release owes no restore (R4). v2 had the incarnation owe it; the boot's order refuted
         that (51 cases red).
      2. `Opens` on a `Parked` ending gives a new life `ParkedOpen` (v2: `Owed`): round-14 reports the unpark after
         the incarnation opens, and `Unparked` on `Owed` stays a refusal. `ParkedOpen` is owed by the step's end,
         as v2's `Owed` was (T6 L11). Every Table C row has its `ParkedOpen` cell and trace.
      3. **Pending CQ6:** a never-sent commit's ending decided in the Runtime's disposal (`NotSent { Disposed }`)
         stays `Parked` at `Opens`, unjudged. Round-14 never delivers it after the reload (`PAY-10/hang`,
         `PAY-13/waiting-flush-lost`), and I15 as written says it must be delivered or be evidence. For the user
         with CQ6: deliver it at the next incarnation, or name it evidence by declaration.
    - Mutants: `mutant.parked-delivered-as-other-tag` (DISP-06, I15 by F2; also ending-channels I3) and
      `mutant.boot-skips-restored` (PAY-15/reload-holds-exactly-once, Restore I6), each caught for its reason.
      Restore I6 leaves T11's not-yet row (coverage 35 checked, 0 gaps). Actors I24 is claimed with no mutant yet
      (`mutant.kept-retried-without-boot` and DLV-05 not built; it stays in T9's row). Not built from v2's list:
      `mutant.adoption-skips-parked`, `mutant.restored-twice`, `1b.r8-third-try`, DLV-05.
    - M1 (pending CQ1, CQ2) against round-14: no case differs. No suite case refuses a decline or never-sent
      ending twice, so the `Closed`-versus-`Kept` cell is reached only by traces.
    - Sweep against `81feeae5` (Conformance R11): 74/74 both; **no case verdict changed.** Reach:
      `d6.disposed-ending-is-evidence` is also caught in DISP-05 (R17, I15: a disposed actor's ending is parked,
      never recorded; `RecordedOther` on `Owed`). Seven lane mutants (`lane.queue-unbounded`,
      `lane.cancel-wire-as-never-sent`, `1b.cancel-all-queue-reversed`, `p1h.cancel-all-idle-declines`,
      `lane.reject-queues`, `1b.forget-marks-held-lane`) now also draw delivered-once I15 in their caught case
      (the refused-move rule: a refused `End` records no ending, so its delivery names none; and Table B's
      `Commit` deadline, I15, which no oracle reported before); each is still caught by lane-queue.
  - **Step 4 review (`references/proposals/step4-review-2026-11-11.md`), arrived after step 5 had landed:**
    - **H1 (`7f8c331b`), accepted and fixed:** a turn's row is chosen by event, from, to and guard; its members
      are owed whatever the runtime reports, and the report only confirms the row and gives a member's key (a
      missing member's target: `Only` if unkeyed, the heard ending's lane, else `Every`). A row with a sibling
      alternative of the same state and target, other lane members and a guard the suite does not compute is
      `claimed` (Pay's `Leave` only, derived by the change detector): owed only when the report names it (v2 Risk
      2). Mutant `mutant.cancel-members-dropped` (the probe): lane-queue catches it again in all 8 of the
      reviewer's cases, LANE-03 and LANE-09 by I12, PAY-12 and PAY-15 cancel-on-wire, LANE-04 and LANE-08 by I20,
      LANE-04 and LANE-10 by I21 (checked by throwaway I20 and I21 copies of the mutant), plus 7 more by I12. Two
      step mutants (report-chosen row, claimed ignored), each killed. **This retires the member-mismatch item:**
      the owed members' effects are judged under I12, I20 and I21. Step examples restated: a reported cancel
      where the retry row is chosen leaves the head `Resending`; a reported retry where the cancel row is chosen
      owes its release (I12).
    - Sweep against step 5 (Conformance R11): 77/77; every one of the 74 older mutants has the same red set,
      the same cases caught by its oracle and the same first catch. **No verdict changed.** The scratch sweeps
      read coverage as BAD (no `workflow/`); in the checkout coverage is 0 gaps.
    - M2: already fixed by `dcc13b4c` (`Await` names its ending through `hearing`).
    - M1, M3, M4 and the Lows: not started (next run).
- **Run 4 (2026-11-11, from `48109efd`):**
  - **Method for the verdict diffs (Conformance R11):** besides the falsify sweep, every runtime mutant (58) runs
    the whole suite on its edited copy and each red case's `oracle: Invariant` set is diffed between trees (scratch
    driver, as the step 4 reviewer did). So reason losses show, not only red sets.
  - **Step 4 review M1 (`c51f6501`):** `Applied` carries the model each move applied to (`on`); cancelAll's
    head-last (I21) takes, per turn with a cancelAll member, the lane's head and queue at that turn's open and
    judges the deliveries after it. Reviewer (Haiku) finding 1 accepted: the head counts only when it ends after
    the turn (a Held head's earlier ending is not cancelAll's). Diff: `lane.cancel-wire-as-never-sent` LANE-04
    gains lane-queue I21 again (R15, I21), the check lost at `cf825289`; nothing else. The same commit also
    deleted `lane-model.ts` (L1; a staging slip, verdict-neutral) and fixed the L5 doc errors in `lane-queue.ts`.
  - **M3 (`47f27231`):** `Case.answerTo(operation, fields, answer)` answers the oldest open request whose input
    has those fields; PAY-21's second shopper pays on its own intent (`pi2`) and every pay answer and the intent
    reread are answered by intent, so no reread order is assumed (Conformance R5). Reviewer finding 8 accepted:
    match on the key fields, not the whole input. Diff: none.
  - **M4 (`c50bd327`):** I1 is no longer a catch-all. A second mint of one id is WriteLanes I6 (judged by
    `attempt-identity` from reports; no lifecycle oracle claims I6, so the fold's copy is not reported); a decline
    outside a turn or with no commit member is I15 ("an ending no commit owes", R7, R10); a move on an Attempt
    never minted is I1 (`Send`), I15 (`End`), I12 (`Released`, R8, R14) or I8 (`Superseded`, R7). Deadline texts
    name the awaited report (`Await Released of …`). Four traces, seen failing with the old I1. Diff:
    `mutant.ending-without-id` loses lane-queue I1 in LANE-04, PAY-06/uninterruptible, PAY-12 and PAY-15
    cancel-on-wire and PAY-16/stale-send-fenced (delivered-once's I15 already named those declines); it stays
    caught by `ending-channels`.
  - **The four rows M4 says were missing from step 4's log** (now logged): `lane.cancel-wire-as-never-sent` lost
    I21 on LANE-04 (restored above); `mutant.ending-without-id` gained lane-queue I1 in the five cases above
    (removed above); `d154.moved-fail-released` gained lane-queue I12 in LANE-04 ("att-1000-2 (Gone) got
    Released", R14, I12: no release is owed there); `lane.unknown-promotes` first fails both PAY-20 cases with
    lane-queue I12 (an unmet `Await Released`, R14) instead of `disposal` Actors I29, which still fails them.
  - **L1 (`e114b165`):** `mayCancel` deleted (no reader). `cancels` stays: `disposal-ledger.ts` reads it until
    step 6. Conformance Q8's `lane-queue` half closed and its broken link to `lane-model.ts` dropped (spec-log);
    the README's matching stated limit removed.
  - Reviewer (Haiku) of M1, M3, M4: accepted 1 (head must end after the turn), 5 to 7 (rule named in the
    refusal texts beside the claimed Invariant), 8 (answer by key fields). Rejected: 2 (R15's "which leaves a
    hold" describes the head's ending; I21 governs), 10 (formatter). Noted, carried: 3 (`memberLane`'s `Only`
    names every lane of a keyed operation; round-14 acts on every lane, the user's R9 question), 4 (I6 judged by
    `attempt-identity` only), 9 (no unit test of head-last beside LANE-04 and the mutant).
  - **Rest of step 5 (`4ee99037`):** case DLV-05 (a twice-refused place success is kept and gets one try per
    boot: deliveries 2, then 3 after a reload, 4 after another; Actors R15, I24); mutants
    `1b.r8-third-try` (I15; also I24 for the delivery to a kept ending), `mutant.kept-retried-without-boot`
    (Actors I24, at the reload), `mutant.adoption-skips-parked` (DISP-06, I15: ParkedOpen unmet at the step's
    end; also `disposal` I29) and `mutant.restored-twice` (PAY-09/ack-stored-confirmation-lost, I15), each seen
    caught for its reason. Actors I24 leaves T9's not-yet row (coverage 36 checked, 0 gaps). Reviewer (Haiku):
    accepted 1 (the `Leave` step and the state after it were not from a cited rule; dropped), 5, 6, 8 (wording);
    rejected 2 and 9 (Actors R15 says "a kept ending gets one try per boot or adoption", so the counts are
    exact), 4 (seen: one try per reload), 7 (R15 states it).
    - Sweep against `48109efd`: 81/81 caught (the scratch tree reads coverage BAD, no `workflow/`; in the
      checkout 0 gaps). Reasons diff: no old case changed under any old mutant; DLV-05 widens seven mutants'
      red sets only (`mutant.ending-without-id`, `mutant.sent-under-another-operation`,
      `mutant.success-then-failure`, `1b.r8-refused-ending-not-redelivered`, `mutant.double-invoke` and the two
      graph-name mutants, which judge every case's fixtures).
  - **Step 8, part:** `ending-lives.ts` and `written-attempts.ts` (no importer since step 5) deleted; by a
    staging slip they landed in `4ee99037`. Verdict-neutral. Left for step 8: `disposal-ledger.ts`,
    `disposal-kept.ts` (step 6), `dsl/domain.ts`'s `laneAtSend` and template key, the README and mutant headers.
  - **Stopped here** (context). Now: suite 87/87, null 0/87, sweep 81/81, coverage 0 gaps (36), lifecycle
    tests 30/30, `nub run check` at zero. Next: step 6 (`disposal` onto the fold: the window, I35's four
    violations, I30, I31, I36, I29/I32 from `AwaitRestore`; the ledger and kept files go, with
    `mutant.bound-ending-wrong-tag`), step 7 (decide whether `ending-channels` and `attempt-identity` read the
    fold, the T41/T13 review's M4; add the key check), the rest of step 8, then the user's step 9 review.
  - **Pending, the Spec followed as written (marked in code):** CQ1 and CQ2 (a twice-refused decline or
    never-sent ending is `Closed`; `lifecycle-rules.ts`, `delivered-once.ts`, traces), CQ6 (a never-sent commit's
    disposal ending stays `Parked`, unjudged; `lifecycle-rules.ts`, traces).
- **Run 5 (2026-11-11, from `2bf524ac`):**
  - **Step 6 (`c95fdf78`):** `disposal` reports the fold's Actors I29, I32, I35, I36 and keeps its own views: the
    window (Attempts `OnWire` or `Interrupted` at `DisposalStarts`; an `Interrupted` call's own `unknown
    { Cancelled }` is the cancel's) for I35's four violations, I30 from the server log, I31 over the deliveries
    after a disposing `Reload` (distinct endings), I36's read check, and a release of an unbound actor's in-flight
    head (I29, I32). `disposal-ledger.ts` and `disposal-kept.ts` went in `2bf524ac` (a staged deletion swept into
    the coordinator's commit; `c95fdf78` repairs HEAD). Mutant `mutant.bound-ending-wrong-tag` (PAY-16
    settled-during-disposal-parked): I35 violation 2, also ending-channels I3.
    - Verdict diff against `2ab39d18` (reasons per red case): `lie.boot-says-disposed` and `lie.boot-drops-held`
      lose disposal I29 in 26 cases and keep delivered-once I15; moved to delivered-once's mutants expecting I15
      (the boot decides `unknown { Restored }` and drops its mail: the lane survives, Actors I29 holds; the
      decided ending is never delivered, WriteLanes I15). `mutant.adoption-skips-parked` DISP-06 loses I29, keeps
      I15 (T6 L11). Gains: `mutant.delivered-during-disposal` I29 in two PAY-16 cases; `mutant.boot-skips-restored`
      PAY-06 x2 and `lane.unknown-promotes` PAY-06/uninterruptible and PAY-18 red by I29 (an unmet `AwaitRestore`
      after the end-of-case disposal, R22); `o6.no-bound`, `mutant.short-disposal-bound`,
      `mutant.success-without-answer` gain I35 in PAY-16/stale-send-fenced (a re-send on the wire is in the window;
      v2 drops that limit). Sweep 82/82.
    - Reviewer (Haiku), 8 findings: accepted and fixed 1 (an on-wire or re-sending unbound head released was
      lost) and 2 (the `Interrupted` exemption on the settled path too). Rejected 8 (the window keeps each call's
      start phase, a fact of the start). Noted: 3 (I31 is per step and ignores `Parked`, as before; Actors I31 says
      "delivered or parked together", for step 9), 4 (the read's key is compared raw with the mint key; checked
      equal on PAY-16, where `o6.settled-in-bound-stays-held` is caught by the read), 5 (a non-`Restored` unknown of
      a settled head is now I16), 6 (an `AwaitRestore` is discharged by any delivery of its Attempt; a wrong event
      is F2's I15), 7 (settled while unbound is I15).
  - **Step 5 review (`references/proposals/step5-review-2026-11-11.md`, `7b0a4696`):**
    - H1 fixed: lane members are owed only by the chosen row; a non-leaving reported release, or a member of an
      unknown operation, drops only itself. Mutant `lie.cancels-reported-as-release` (lane-queue I12, 14 cases).
      Diff: `lie.release-member-claimed` green in PAY-03, PAY-08/reloadDuringCharge, PAY-14, PAY-20 x2 and PAY-21
      (was I1 and I12, the misattribution H1 names; the release there is report-only), still caught in its case.
    - **M1 open:** owing a restore to a `Restoring { head: true }` head turns PAY-09/ack-not-stored red
      (Restore I6): the suite has no storage fact telling an acknowledged batch from one that never landed (v2
      Risk 4). Needs a storage fact (a Port or world change); reverted, stated in `incarnate`'s Gotcha.
    - **M2 part:** the `claimed` doc corrected; no mutant, since no Invariant says a turn runs its selected
      alternative's members (the member-mismatch gap for the user), so a case mutant has nothing to expect.
    - M3, the six reach changes step 5's log missed (Conformance R11): `k.failure-as-success` also delivered-once
      I15 in 23 cases (F2: event against its mapping); `mutant.success-then-failure` loses delivered-once I15 in 18
      cases, keeps I16 (a refused `End` records no ending); `lane.unknown-promotes` first catch moves to Restore I6
      in PAY-15/reload-holds-exactly-once and PAY-08/reload-while-reconciling (was a case expectation) and in
      DISP-05 (was disposal I32); `lane.fresh-mint-on-held` (PAY-15/press-pay-while-held) and
      `lie.serialize-as-latest` (LANE-02) also delivered-once I15; `mutant.boot-resends-held` also I16 and I15 in
      PAY-07/late-may-not-leave. The "seven lane mutants" of step 5 are six.
    - L4: `AwaitRestore.incarnation` removed (its read was always met). L5: the CQ6 Gotcha cites I15 and R10
      against Actors R22. L1: the old ledger's "parked ending delivered with no `Unparked`" check stays dropped,
      as v2's Table C admits `Delivered` on `Parked` (consistency only, Conformance R4).
    - Reviewer (Haiku) of the fixes: accepted 2, 3 (no-row leaving releases anchor), 7 (doc wording); verified 5
      (incarnation) and 6 (mutant edits). **Carried, Medium:** 1, a reported `Nothing` target on an owed member
      voids it (`owedMembers` takes the report's target; round-14 reports `nothing` for a cancel inside another
      operation's ending, where v2's fallback gives `Every`). The same class as H1; tied to R9's `Only`/`Every`
      question, so not changed here.
  - **Stopped here** (context). Now: suite 87/87, null 0/87, sweep 83/83, coverage 0 gaps (36), lifecycle tests
    30/30, `nub run check` at zero. Next: step 7 (whether `ending-channels` and `attempt-identity` read the fold;
    the key check; whether the fold's I6 refusal is claimed), step 8 (`cancels` in the references is unread
    since step 6; `dsl/domain.ts`'s `laneAtSend`, `laneAtMint` and template key; README and mutant headers).
- **Run 6 (2026-11-11, from `161c0f9c`):**
  - **Step 7 (`9bb7fa5d`), three lead's calls:**
    1. `ending-channels` and `attempt-identity` stay off the fold. Why: they are v2's independent judges of the
       fold's common mode; reading the fold would put WriteLanes I3 and I6 in it. This answers the T41/T13
       review's M4: their RC2 shape goes instead. Both now keep `{ operation, attempt }` records compared by
       `sameAttempt` (no template keys), and `ending-channels` derives an Attempt's newest request from the server
       log rather than storing it. Reverse: give them `lives` and read `before`/`after`.
    2. The key check: each send's input key fields must equal those of the key `Minted` reported (WriteLanes I6,
       R5: an Attempt has one key and one input). Mutant `mutant.mint-key-differs` (PAY-01): the invoke sends
       another `intentId` than the mint reported; caught in 54 cases, "pay att-1000-1 was minted on key
       ["pi1"] and sent with key ["elsewhere"]". A first version edited the mint note instead and was caught
       only by lane-queue I1 (the fold places the Attempt on the reported lane), so it was retargeted.
    3. The fold's second-mint refusal (WriteLanes I6) stays unclaimed by the lifecycle oracles; `attempt-identity`
       judges it from reports. v2's claim test is now built (`dsl/lifecycle.test.ts`): every Invariant the rules or
       traces refuse under has exactly one lifecycle owner, I6 none (seen failing with I21 dropped from lane-queue).
    - Reviewer (Haiku), 8 findings: accepted 1 (an older key version or a hand key closure is not told apart:
      stated limit) and 2 (the citation now names R5 and v2's proposed check); noted 3 (unkeyed requests no longer
      double-counted, same Invariant), 4 (the derived newest request needs one cut per judge batch, which holds),
      5 (array scans), 6 (code-level refusals covered through traces), 7 (raw key fields, as 1); 8 checked by lint.
    - Sweep against `161c0f9c`: 84/84; reasons diff: only the new mutant. **No verdict changed.**
  - **Step 5 review M1 (`87ee9d9f`):** Port change 8 (after v2's seven): the store's `write` names the Attempts a
    batch acknowledges (round-14 passes its acknowledge tickets, `edge.ts`), `answer` returns those of batches
    that landed (`ack`, `landNoAck`), and the Case records `Acknowledged { attempts }`. A `Reload` owes
    `AwaitRestore` to a `Restoring { head: true }` head whose acknowledgement landed (Restore R3, I6), none to one
    whose batch never landed (Restore I8). PAY-09/ack-not-stored stays green. Mutant `mutant.restore-skips-unsent`
    (PAY-09/ack-stored-confirmation-lost, PAY-18, Restore I6; also DLV-01, DLV-02, PAY-08, PAY-14,
    PAY-16/restore-keeps-mayHaveApplied, the review's probe P3). Four traces; dropping the acknowledged guard
    fails two.
    - **Changed verdicts (Conformance R11):** `mutant.boot-skips-restored` in PAY-09/ack-stored-confirmation-lost
      and PAY-18: case expectation → delivered-once Restore I6 (Restore R3, I6: an acknowledged never-sent head
      ends `unknown { Restored }`). Nothing else.
    - Reviewer (Haiku), 10 findings: **rejected 1** (High, "the owing is never discharged"): a delivery discharges
      it (`lifecycle-lives.ts` `Delivered`), the suite is 87/87 and a trace now delivers and meets StepEnds.
      Accepted 3 as a stated limit (the batch-to-Attempt claim is unchecked against the bytes, whose encoding is
      the runtime's), 9 (docs), 10 (line wrapped). Carried: 2 (an `unknown { Restored }` on a never-acknowledged
      Restoring head is accepted; Restore I8's, not claimed here), 4 (an unminted id in `Acknowledged` is
      harmless), 5, 7, 8 (unreached).
  - **Step 8 (`a6c2bfcf`, part in `9bb7fa5d`):** `dsl/domain.ts` lost `attemptKey`, `LaneId`, `sameLane`, `laneOf`,
    `laneAtMint`, `laneAtSend`; the references lost `cancels` and `CancelsOf`; Pay `Leave`'s `claimed` exception is
    a stated limit (decided). README brought to the build; mutant headers checked against entries. Reviewer
    (Haiku): accepted 1 to 3, 5, 6 (stale limits and Port rows); 4 superseded (the `Nothing` Gotcha was removed,
    see below); 7 to 11 noted (header wording, v2's kept limits not yet in the README). Sweep 85/85, no verdict
    changed.
  - **Step 6 review M3:** `mutant.boot-after-disposal-skips-restored` (PAY-15/dispose-held, disposal Actors I29;
    red in 33 cases), from `mutant.boot-skips-restored`'s edits.
  - **The coordinator's convergence order** (step 6 review H1, M2: a report retargets, removes or unclaims what a
    turn owes, the third review in a row) arrived after steps 7, M1 and 8 had landed. The brief's "reported
    `Nothing` waits on R9" is superseded by it: the Gotcha marking it pending was removed, and the rule replaces
    it. **Not started:** the one member-resolution rule in STATUS, its rewrite in `step`, the exhaustive
    perturbation test, the reviewer's probes PD, PF, PH (and PG) as mutants, the Lows' dispositions (step 6 L1 to
    L8, step 5 L2, L3, L6 to L13). M1 (no oracle checks an owed `retry` re-sends) is **pending, for the user** as
    a guarantee gap.
  - **Stopped here** (context). Now: suite 87/87, null 0/87, sweep 85/85 plus the M3 mutant, coverage 0 gaps
    (36), conformance tests 31/31, `nub run check` at zero. Next: the member-resolution convergence above, then
    step 9.
- **Run 7 (2026-11-11, from `fcfa2635`): member resolution, converged (R35: step 4, 5 and 6 reviews' H1).**
  Bottom line: what a turn owes is now derived in one place, `code:dsl/lifecycle-owed.ts#owedMembers`, from the
  rule below; no report can retarget, remove or unclaim an owed member (a claimed row is owed only once its
  members are reported, the stated limit in rule 7). Probe PD is caught like the omitted
  member (14 cases, the same reasons); PG and PH stay green; PF is pending the user.
  - **Member resolution (the rule).** What a turn owes comes only from the reference and the turn's facts (its
    event, from, to and actor, the ending it hears, the lanes the model holds, the server's log). The report is a
    claim: it confirms a member, gives a commit's or keyed member's key, and chooses among claimed rows. Nothing
    else of it is read.
    1. _Row._ Event, from, to and the computed guard match. A `claimed` row matches only when the report names
       each of its members (operation and kind; order and other members not read). Rows that tie with other
       members are claimed (the change detector derives it); the one with the most members is taken (the first
       of equals), so other reported members never choose. No row: no lane member is owed (releases still are,
       rule 4). A reported key counts only when every reported copy of the member names the same one.
    2. _Target, by how the source names the lane_ (`RowMember.keyed`, checked against the compiled `mem.key`):
       - unkeyed operation: `Only`, whatever was reported;
       - commit: the reported `Key` (its input's key), else `Nothing` (the key-less lane). Its mint or decline is
         owed either way (WriteLanes I15); a mint on another lane is I1;
       - keyed retry, cancel or cancelAll (`O.pay.cancel(intent)`): the reported `Key` when it names a lane the
         model holds for the actor and operation, else `Every` such lane;
       - key-less on a keyed operation (`O.void.cancel`): from the heard ending alone (R9, I14): its Attempt's
         lane in an ending of its operation; `Nothing` in a decline's or another operation's ending; outside an
         ending `Every` for a cancel or cancelAll, `Nothing` for a retry (round-14; R9's KeyRequired is the
         user's question). The report is not read.
    3. _Guard._ `retryable` reads the heads of its member's owed lanes: it passes when one is Held with retries
       left; so the guarded rows stay exclusive whatever was reported.
    4. _Releases._ Owed for each operation whose reference releases on the turn's (event, from, to) (R16),
       reported or not: `Only` unkeyed, `Every` keyed.
    5. _Order._ The row's member order, then releases. Report order is not read; act order is judged by the
       mints (I10).
    6. _Extras._ A reported member the turn does not owe (an unknown operation, one outside the row, a release
       on a transition that releases nothing, a second copy) anchors nothing: its effects are refused under
       their own Invariants (a `Released` I12, a mint I1). It never removes or unclaims an owed member.
    7. _Stated limits._ A claimed row is owed only when its members are reported (v2 Risk 2: Pay `Leave`, and
       now `Confirmed` from `LEFT`); a commit's key, and a keyed member's key between two lanes one actor holds,
       are the runtime's claim (a mint elsewhere is I1; `attempt-identity` checks the send's input against the
       mint); a turn hearing a read's ending is seen as hearing none; a keyed member whose key names no lane
       the actor holds is owed on every lane of its operation, so a correct runtime that cancels a fresh key
       while another is Held, or whose member key does not encode (round-14 reports `Nothing` and acts on
       none), would be refused (no fixture reaches either; the other choice lets a wrong key retarget the
       member). **Pending, for the user:** nothing checks
       that an owed retry re-sends (step 6 review M1): its obligation is the head's `Resending`, and no Invariant
       says a `Resending` head must send.
  - **Built.** `dsl/lifecycle-owed.ts` (the rule; `step` calls it once per `Turn`); `RowMember.keyed` on the
    retry, cancel and cancelAll members of Pay, Cells and the Lab fixtures, derived and compared by
    `fixtures/rows.test.ts`. The detector now also ties a row with a state-less sibling (a root fallthrough), so
    Pay's `Confirmed` LEFT→same is `claimed` (its `{}` fallthrough stays in LEFT when `capturable` fails; owing
    `void.commit` there was a false I15 waiting for a case). `step` lost `anchoredMembers`, `owedTarget` and the
    report-read guard. Step 6 L6 is fixed by rule 4.
  - **Perturbation test** (`code:dsl/lifecycle-perturbations.ts#perturbationsOf`, run on `step` and on every step
    mutant): for every member of every row of every fixture (32 rows, 34 members), the row's reference turn with
    each member's lane holding a Held head runs with its correct report and with the member dropped, retargeted
    to each other target (`Only`, `Key` of its lane, `Key` of another, `Every`, `Nothing`), an unknown
    operation's member added, an extra member of another kind added, a non-leaving release added, and the
    members reversed: 306 perturbations. Unacted, each leaves the same model and refusals as the correct report,
    which is refused under the member's Invariant (I15 commit, I12 cancel and cancelAll; a retry leaves its head
    `Resending`, pending above). Acted, the correct report and every perturbation naming the same lanes pass
    (Conformance R4). Claimed rows' dropped members are the 4 stated limits. On `fcfa2635`'s `step` it reports
    the three reviews' holes: `Nothing`, `Only` and another `Key` retargeting cancels and retries, an unknown
    member unclaiming `Leave`, the guard reading the report.
  - **Step mutants** restated for the new module (18, each killed, the harness mutating `lifecycle-owed.ts`
    through a mutated `lifecycle-step.ts`): a reported key retargets a key-less member; a keyed member takes any
    key; an unreported keyed key names nothing; an unkeyed member takes the reported target; a commit ignores its
    key; the guard reads the report (H1); a claimed row needs an exact report (M2); claimed ignored; releases from
    the report (L6); three release-transition ones; retry count; and the four step ones kept. Not mutated: a
    key-less cancel outside an ending (`Every`) and one in another operation's ending (`Nothing`): no fixture
    reaches them, and the first is R9's question.
  - **Probes.** `lie.cancels-reported-as-nothing` (PD, lane-queue I12; PAY-03, PAY-14): on `fcfa2635`'s `step`
    red only by case expectations; now caught in the same 14 cases with the same reasons as
    `mutant.cancel-members-dropped`. A new kind, `Probe` (`dsl/oracle.ts`), which falsify runs beside the
    mutants and never counts as one: `probe.members-reported-reversed` (PG) and `probe.unknown-member-reported`
    (PH, green; PH was red in PAY-07/late-may-not-leave and both PAY-19 on the old `step`) must pass every case;
    `probe.retry-members-dropped` (PF, pending) prints its red set (9 cases, case expectations only).
  - **Verdict diff (Conformance R11)**, every runtime mutant's whole suite, each red case's oracle and Invariant,
    `fcfa2635` against the rewrite: **no verdict of the 86 older mutants changed.** New: PD as above; the
    probes as above. Pay's `Confirmed` LEFT→same becoming `claimed` changed none either.
  - **Reviewer (Haiku) of the rewrite, 15 findings.** Accepted and fixed: 1 (the claimed tie-break read the
    whole report, so an extra member could choose the row: now the row with the most members, report-free);
    2 (two reported copies with different keys let order set the key: a key counts only when every copy agrees;
    new perturbation "reported twice, first with another key", two-lane example, mutant); 8 (rule 1's "no row"
    against rule 4's releases: text settled); 9 (the perturbation test now fails on a refused setup or a missing
    head); 10 (one lane cannot tell `Every` from `Key`: two-lane step example and mutant "a keyed member always
    names every lane"); 11 (a pending probe that turns green fails falsify); 14 (one `lanesOfOperation` in
    `lifecycle-model.ts` for the owed targets and Table B's `Every`; a doc comment on an unexported helper
    dropped). Changed to stated limits (rule 7): 3 and 4 (a keyed key naming no held lane, or one that does not
    encode, is owed on every lane, where round-14 acts on none), 7 (STATUS's bottom line now names the claimed
    limit). Noted: 5 (key-less cancel outside an ending, R9's question, already stated), 6 (`Every` with no lane
    falls to Table B's key-less Idle cell, as before the rewrite), 13 (a lane counts as known from any Attempt,
    `Gone` included: naming it is the runtime's claim either way). Rejected: 12 (a missing case id comes back as
    a failed verdict, `failed(id, "no such case")` in `runner/main.ts`, so a green probe cannot pass on a gap).
    15 is covered by 1, 2 and 10.
  - **Lows' dispositions.** Step 6 review:
    - L1: reading for `mutant.delivered-during-disposal`'s I29 in two PAY-16 cases: the delivered ending's turn
      mints `place` during the disposal and `RuntimeDisposed` finds it `Unsent` (Actors R22: a never-sent queued
      commit ends `NotSent { Disposed }`). Accepted. Its second half is this list.
    - L2: accepted as stated (the never-sent check fires at `RuntimeDisposed`, which every case ends with);
      Restore R3's `NotSent { Restored }` for a queued commit at a reload has no cell: carried to T11.
    - L3: accepted; the timing assumption is now a Gotcha of `disposal`.
    - L4 (`cutShort` against `pastBound` on a late `Cancelled`), L5 (`endsAs` with no reason; I31's parked half):
      unreached or pre-existing; carried to T9.
    - L6: fixed by rule 4 (releases on leave owed from the reference; mutant "releases come from the report").
    - L7: fixed: `ending-delivery.scenarios.ts` (no "ending ledger"), `case.ts` (`answerTo` takes any fields),
      `disposal.mutants.ts` (the `o6.*` grouping). Already done at step 8: `cancels`, `laneAtMint`, `laneAtSend`,
      the README rows. Review tags in doc comments and test names: kept where they name the finding a test
      holds.
    - L8: fixed: `lie.cancels-reported-as-release` no longer passes state through `(w as any)` (a local list,
      as PD); the step's `UNBOUND` is `ADOPTABLE`. Noted: `disposal.ts`'s `findIndex` and `?? []` (style, no
      verdict), for the T41/T13 queue.
  - Step 5 review:
    - L2 (a report naming no actor applies nothing): carried; only a runtime using the Port's `None` reaches it
      (T16).
    - L3: logged under R11: `d123.delivered-silent-at-boot` (old suite) lost its anchor to Port change 5; its
      intent is caught by Table C's `Refused` × `StepEnds` (I15).
    - L6: fixed: `mutant.parked-delivered-as-other-tag`'s header says it proves F2's cell (also I3), not I15's
      delivery count.
    - L7: P5b is `mutant.adoption-skips-parked` (built, `4ee99037`); P5d's lost kept try is
      `mutant.kept-retried-without-boot`'s Actors I24.
    - L8 (`Guard` returns `string`): carried, a type tightening with no verdict.
    - L9: fixed: `lifeNamed`'s doc (the reported actor first), `delivered-once.ts` (tables in
      `lifecycle-rules.ts`), the clashing `LifeStep` tuple in `lifecycle-lives.ts` is the unexported
      `LivesStep`.
    - L10: fixed: `port.ts` says `Unparked` may come before or after its `Incarnated`.
    - L11: noted; I20 and I21 have mutants of their own, so their catches by `mutant.cancel-members-dropped`
      need no count.
    - L12 (no case reaches a thaw): carried to T9.
    - L13: fixed: one `owesRelease` helper; `incarnate` now also skips a Held head that owes its release, as
      its Gotcha said.
  - **Stopped here, before step 9** (its adversarial review is the coordinator's). Now: suite 87/87, null 0/87,
    falsify 87/87 with 3/3 probes holding, coverage 0 gaps (36), conformance tests 35/35, `nub run check` at
    zero.
- **Queued after the convergence steps, before T8 (coordinator, 2026-11-11):** the T41/T13 review
  (`references/proposals/t41-t13-review-2026-11-11.md`): H1, M1 to M4 and the Lows in the files touched. Its M4
  (whether `ending-channels` and `attempt-identity` move onto the lifecycle) is decided at step 7.
- **Queued with them (coordinator, 2026-11-11):** the StaticCli and Port review
  (`references/proposals/staticcli-port-review-2026-11-11.md`): H1 the graph gate both ways (with the rename probe as
  a mutant); M1 a "partial" coverage standing (StaticCli I1, I4, I6, I8, I12; Compile I1, I6, I11, I15); M2 R10's
  `Rule20Late` case and mutant, T22's comment and the "every static Invariant" claim; M3 make the new suite kill
  `pay16.decline-not-delivered` and `lost.decline.mail` (anchors broken by step 2's `lane.ts:277`), and log it; the
  Lows in files touched.

## T13 (2026-11-11): static cases, first slice (in progress)

Bottom line: static cases run (Conformance R14) on a `Surface` with prototype and null adapters; the coverage gate has a
case-covered kind; Compile I1, I2, I4, I5, I6, I11, I15, I16 are checked by `CMP-01` to `CMP-07` and ten mutants, each
seen caught for its Invariant. Suite 76/76, null 0/76, falsify 57/57, coverage 24 of 186, `nub run check` zero.

- Built: `surface.ts`, `dsl/static-case.ts` (`expect` cites an Invariant or a Requirement), `adapters/prototype-static.ts`
  (round-14's compiler, `seal`, `toData`), `adapters/null-static.ts`, `compile/construction.{cases,mutants}.ts`;
  `CaseCovered` rows, `CaseChecked`, `Unproven` and `Uncited` in `coverage.ts`; a failed expectation's `cites` in the
  verdict; falsify's `case expectations` judge; falsify now copies the prototype's `conformance/` tree (source files only)
  instead of linking it, so compiler mutants stay in their copy (R13).
- Planted (scratch, not kept): a row naming a missing case gave `Uncited` and `Unproven`; a row with no mutant gave
  `Unproven`; two rows gave `Twice`.
- Owed, with why, in `not-yet.ts`: Compile I3, I7 to I10, I12 to I14, I17 (round-14 stops at the first violation, runs
  creation only in a runtime, and has no IdentityFieldOptional, SharedContract, write-scope, name, app or wiring check);
  Diagnostics and Codec (round-14 has no Diagnostic carrier and no canonical byte codec, Codec Q2); StaticCli (not built).
- Expectation drafter (Haiku, Spec only): agreed on every value. Followed: events compared as sets with internal ones
  included (R16 "every event"); ImpureDefault tested beside Flow.initial with `includes` (both R5 rules may fire); closure
  names checked by place (`operations.save.*`), not spelling. Its gaps for the user: R17's refusals have no code; whether
  a Runtime reports every violation; whether the machine callback or a Schema counts as a Slot.
- Reviewer (Haiku) of the diff, 11 findings: accepted (3) citations moved to the rule that gives them (`R1`, `R16`, `R17`,
  ImpureDefault to I6); (4) events and states compared sorted; (5) slot names by path segments, read as paths; (6) the
  data view's source and the root drop stated in the adapter's doc. Rejected (2): `cmp.impure-default-accepted` is caught
  because ImpureDefault is no longer reported, its stated mistake. Carried: (1) one failure per static run and (8) no
  in-process time bound, as for runtime cases (Q11, Q12, T14); (7) `seal` with no services, stated; (9) a cited case
  need not hold an expectation with that label, falsify proves it; (10) node_modules still linked; (11) Conformance Q5,
  Q11, Q12, Q14 describe the state before this slice: a Spec revision for the user's read.

### T13 part 2 (2026-11-11): StaticCli cases, the graph gate, rows to P4

Bottom line: every static Invariant round-14 can make is checked. StaticCli I1, I4 to I9 and I12 by `CLI-01` to
`CLI-08` with nine mutants; StaticCli I2 by the `graph-names` oracle on the runtime cases with two mutants (one in the
CLI's graph, one in the turn record). The 28 static Invariants round-14 cannot make are owed in `not-yet.ts` to the P4
Task that builds their surface: Compile I3, I7 to I10, I12 to I14, I17 and Diagnostics to T17, Codec to T20, StaticCli
I3, I10, I11 to T22. Suite 84/84, null 0/84, falsify 68/68, coverage 33 of 186 with 0 gaps, `nub run check` zero.

- Built: `Surface.cli` (round-14: `bun cli/flow.ts`, 30 s bound, the suite's `pay` mapped to its `typed-pay`; null:
  exit 0, nothing printed); `static-cli/{cli.cases,cli.mutants,graph,graph-names,graph-names.mutants}.ts`; `TurnPart`
  on the Port's `Turn` (`parts`, each alternative's `definition` and `at`); `graphs` passed to `Oracle.open` and
  `Judge.start` (a new `Fact` variant would break the exhaustive matches in lane-queue.ts and disposal.ts, which the
  WriteLanes convergence owns), read once per run from `flow graph` and given per scenario, since fixtures share
  machine ids.
- Spec revisions (spec-log, 2026-11-11): Conformance Q5, Q11, Q12, Q14 follow the suite; Compile R17 decides its
  refusal code (InvalidConfiguration with a reason) and that a refusal need not list every malformation; Compile Q3
  added for the user: whether a Schema's functions or the machine callback are Slots changes I15.
- Stated limits: the gate judges only machines the round-14 CLI selects (`pay`; cells, serialize, latest and cancel
  are none of its targets), and the adapter spells round-14's `implicit` trigger as the graph's
  `trigger:<node>:<event>` (no CLI fixture has one); I1 reads the CLI's own `callbacksRun`, not spies (T1 asks for
  spies, T22); I8 checks the four R10 rules round-14 has (KeyRequired, SharedContract, UnresolvedHold, NotSent
  unmapped) on the eight reference apps with no error (desk and desk-listen report UnresolvedHold errors, left to
  T22); I4 compares check's text and JSON only.
- Reviewer (Haiku) of the diff, 11 findings: accepted (6) CLI-08's exit code cited I6, not I12, and checked after the
  stdout expectation. Already stated (1, 2, 3, 5). Rejected (4): a CLI that always says incomplete keeps I7, which
  forbids only a false complete. Carried: (7) the UnresolvedHold and failure-path predicates match more than one
  round-14 rule; (8) per-expectation vacuity behind an `isSome` guard; (9) graphs keyed by machine id within one
  scenario, and a space-joined name; (10) edge status is not judged (I2 is names only); (11) the surface now loads for
  runtime-only runs.

### T13 part 3 (2026-11-11): review fixes (T41/T13 and StaticCli/Port reviews)

Bottom line: a crash is never a refusal, partial checks say what they leave, every owner is an open
Task, and Compile I7, I8, I13, I14 are checked on round-14. Suite 92/92, null 0/92, falsify 100/100,
coverage 40 of 186 (18 in part), 0 gaps, `nub run check` zero.

- T41/T13 H1: `Built`, `Admission` and the new `Made` have a `Crashed` variant; only a throw with a
  leading `Code:` is a refusal. `cmp.seal-crashes-on-bare` (I15) and `-on-key` (I16) are caught by
  CMP-06 failing with the crash in its text.
- M1, M3: CMP-06's untouched admission cites I15 (`cmp.compiler-emits-bare-guard` caught); the guard
  expectation cites R1 and `cmp.guard-runs-at-construction` is dropped (a guard is not in I1's list);
  `cmp.commit-runs-at-construction` is I1's mutant; I4 gains `cmp.state-dropped` and
  `cmp.operation-dropped`.
- M2: Surface `create`, `restore` (the Compiled's memory Slots) and `admitApp` (`sealAll`); CMP-08
  (I7, old `r15.creation-decodes-input`), CMP-09 (I8, `cmp.restore-runs-creation`), CMP-10 (I13,
  old `d138.self-allowed`), CMP-11 (I14, old `r15c.duplicate-machine-allowed`). Coverage reads each
  owner with `workflow show --json` and fails one that does not resolve or is done (planted T99 and
  done T5: 18 `Unowned` gaps each, reverted).
- StaticCli H1: CLI-09 compares `flow graph pay`'s edges with the places of pay's Compiled, both ways
  (`cli.graph-renames-untaken-edge`, `states.STUCK.on.CheckAgain[0]`, caught). Trigger edges are left
  out (no Compiled place names them; remainder).
- M1: `Remainder` rows (beside their cases) give a `Partial` standing; gaps `Unchecked`, `Unowned`.
  `cliCovered` and `constructionCovered` are derived from the cases' `cites` (L1).
- M2: CLI-06 row for the late handler (`broken`, `Rule20Late`; `cli.late-handler-unreported`).
- M3: `pay16.decline-not-delivered` and `lost.decline.mail` re-anchored in
  `write-lanes/carried.mutants.ts`, caught by `delivered-once` (WriteLanes I15) on PAY-02 and LANE-02.
- Expectation drafter (Haiku, Specs only): agreed on CMP-08, CMP-09, CMP-11, CLI-06. Disagreed on
  CMP-10: R2/I3 put the refusal at construction, round-14 refuses at Runtime creation; the case
  accepts either and the construction half is in I13's remainder (drafter right on the Spec). CLI-09:
  trigger edges' places are not determined by the Spec; left out, owed.
- Reviewer (Haiku) of the diff, 24 findings. Accepted: the vacuous equal-memory check (4), `isOpen`
  ignoring the exit code (8), CLI-09's dedupe (10, part), `lost.decline.mail`'s `says` (13), missing
  remainders for Compile I5, I15 and StaticCli I6, I7, I9 (16 to 20), the docs (6, 21 to 24).
  Rejected: (2) a crash failing an expectation counts as a catch: I15 and I16 require a refusal and
  the crash is not one, the case fails with the crash in its text and never passes; (11, 14) CMP-08
  cites I7 as Compile T4 does; (12) restore's no-creation half is judged by values (count 5, not
  creation's 0). Carried: (1) a non-code throw that happens to start `Word:` reads as a refusal of an
  unknown code, which still fails any expected code; (3) CLI-04 reads exit 1 alone (CLI-02, CLI-03
  read `broken`'s documents); (5) adapter defects in `handleOf` stay uncited throws.

## Convergence step 9 revision (2026-11-11, in progress; the convergence's one allowed revision)

From `references/proposals/convergence-step9-review-2026-11-11.md`, assigned by the coordinator after
the selection oracle (T8) landed. Plan, in order:

1. A table here of every obligation trigger in the lifecycle: suite fact or runtime claim, and for a
   claim, the oracle that judges it (the turn header by Turn I2 now).
2. One pass so every trigger is a suite fact or a judged claim: H1's header (the lifecycle reads the
   anchored choice), H2 (a missing `Incarnated` or a bare `Parked` drops a delivery: anchor liveness
   to `Ensured`, attach facts and the reload; recover `k.drop-row` and `q1a.unchanged-resets` on
   their 18 cases), and `Unhandled`, `Denied` or a second `InvalidTurn` disposing of an ending.
3. The perturbation test extended to the turn header and the actor facts.
4. M1: six cells and about ten trace cites moved to the Spec (CQ1 and CQ6 rulings in log.task).
5. M2: Run 7's account and its five narrowings corrected here.
6. Cuts (the lifecycle is 2.6 times v2's estimate: M3's unread distinctions and duplication).

### Obligation triggers (step 1; after `b39461d0`)

Every place a fact or report creates, discharges or changes what the lifecycle judges. A trigger
must be a suite fact or a judged claim.

| Trigger (what it moves)                                     | Source                  | Judged by                                                                                              |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `Ensured`, `Released`, `Disposed`, `Forgot` (uses, records) | suite                   | (fact)                                                                                                 |
| `Reloaded`, `DisposingRuntime`, `Drove`, `Unstoppable`      | suite                   | (fact)                                                                                                 |
| `Requested`, `Answered`, `Advanced`, `Read`                 | suite                   | (fact)                                                                                                 |
| `Acknowledged` (the restorable set)                         | store fact              | which Attempts a batch names is the runtime's (stated)                                                 |
| `Turn.event`, `from`, `to` (row, releases on leave)         | claim                   | Turn I2 (`selection`); the lifecycle reads the judged header (H1)                                      |
| `Turn.members` (confirm a claimed row, give a key)          | claim                   | bounded: never retargets or drops what a row owes (step 8); claimed rows a stated limit                |
| `Minted`, `Sent`                                            | claim                   | WriteLanes I6 (`attempt-identity`) against the server log; lane order I1, I10                          |
| `Ended` (an ending decided)                                 | claim                   | WriteLanes I3 (`ending-channels`) against the server's answers                                         |
| `Delivered` (a delivery discharged)                         | claim                   | WriteLanes I15 once; the mapped event (`misdelivered`)                                                 |
| `Parked`, `Unparked`                                        | claim                   | held uses (suite): a held actor's ending may not stay parked at a step's end (H2)                      |
| a boot's `AwaitRestore`                                     | suite (reload, records) | discharged by delivery, not the decision; a forgotten identity's by the decision (H2)                  |
| `Recorded`                                                  | claim                   | closes only an owed let-go or a suite-forgotten record                                                 |
| `Unhandled`, `Denied` (close a delivered ending)            | claim                   | Turn I2 when the suite can attribute it; a delivered ending's `Denied` is `late-routing`'s (R21, owed) |
| `Evidence` (Released, Superseded)                           | claim                   | it is what the row owes (an `Await`), never a discharge of another                                     |
| `Issue` InvalidTurn, UnmappedEnding                         | claim                   | **not judged**: the `refusal` oracle (Turn I14 to I16, T8) owes it                                     |
| `Incarnated` (open parked and kept endings)                 | claim, gated            | gated by a suite `Ensured`, `Drove` or `Reloaded` in the step                                          |
| `Finished` (record `grace`, read by adoption)               | claim                   | **not judged**: Actors I13 to I16 (`incarnations`, T9)                                                 |
| `RuntimeDisposed`                                           | claim                   | Actors I35 (`disposal`) against the answers and the bound                                              |

### Step 2 so far

- H1 (`de899357`): the Case passes the lifecycle each step's facts with every `Turn` header as Turn
  I2 judged it (`judgedStep` in `turn/selection.ts`). The review's probe is now also a `lane-queue`
  mutant, `lie.cancels-dropped-header-nowhere` (WriteLanes I12, 9 cases by its oracle; 0 before).
- H2 (`b39461d0`): the lifecycle keeps the suite's held uses; a held actor's `Parked` ending at a
  step's end is WriteLanes I15; a boot's restore stays owed until delivered (Restore R1), except a
  forgotten identity's, which the decision discharges and adoption delivers. `k.drop-row` and
  `q1a.unchanged-resets` are `disposal` mutants again (Actors I29, 31 and 32 cases by its oracle):
  16 of the review's 18 cases are back; PAY-16/disposal-ends-with-the-last-fiber and
  /settled-during-disposal-parked are disposal-time cases (CQ6's never-sent parking).
- `Unhandled` and `Denied` are judged by `selection` (`turn.cancel-turns-unhandled`, 12 cases).
- Two traces changed with the rule: a decided restore stays owed (owed 1); a new trace for a
  forgotten identity's and one for a held actor's parked ending (the cell-mutation gate).

### T42's suite updates (folded into the revision)

- Done: CQ1 (a second refusal keeps the ending, sent or not; `f9cf89ee`); CQ6 (Table A's
  RuntimeDisposed cell and `mutant.disposal-skips-never-sent` move to Actors I38, claimed by
  `disposal`; I38 leaves T9's row); CQ7 (docs: the promotion rule already promotes); CQ9 (already
  held: a pending cancel makes the replacement `ReplaceCancelled`, which owes unknown { Cancelled });
  C22 (a boot owes no restore to a head whose ending is parked, with a trace); CQ5 (`ending-channels`'
  fifth check, an Attempt that never reached the server ends only NotSent or unknown { Restored };
  `mutant.unsent-ends-unknown`, DISP-03 and LANE-02); C6 and C18 named in the StaticCli I6 and I7
  remainders; C8 in CLI-01's labels (a configuration callback's one run is construction).
- Carried, with why: CQ3's commit half (a commit on a lane holding a kept ending acts as on a
  non-Idle lane) needs a Table B row of its own with no head to act on; it is designed with the
  lifecycle cuts (step 6). C5 (admission order) is how `lane-queue` already orders queued
  endings. R9's KeyRequired is a round-14 limit for T7's front-end cases. C12 (T7), C13 and C21
  (T8's `context` and `activations`), C17 (T11, no Port fact for a quarantined record) and C24
  (CMP-09 already checks that a field the record has takes no initial) go to their areas.

### Run 7's account, corrected (step 9 review M2)

- "Nothing else of it is read" was not true at Run 7: the report's event, from and to chose the row
  and the releases (H1). Since `de899357` the lifecycle reads the header as Turn I2 judged it (from
  the carried leaf, to the selected alternative's leaf); the event stays the report's, admitted by
  `selection` (driven, delivered or scheduled).
- "The guarded rows stay exclusive whatever was reported" is not quite true: `retryable` counts
  this step's reported `Sent`s; `attempt-identity` bounds that count against the server's log
  (Low, kept).
- Five narrowings Run 7 did not log, each checked in code by the review: an Idle cancel's I20 now
  fires only on a decline in the same turn on that lane (before, any ending of the operation in the
  step); cancelAll's head-last takes any addressable head, and only queued commits that ended
  `Cancelled` count; Actors I29's (now I38's) never-sent check counts mints made during the
  disposal, and an ending after `RuntimeDisposed` no longer excuses; forget's evidence was refused
  (fixed in `d9c04e0a`, Actors R21); and H2's 18 cases (16 back since `b39461d0`).

### Steps 3 to 6, the audit checklist and the review

- Step 3 (`05fb2553`): the perturbation test also runs each reference turn's header through
  `selection` with `to` or `from` naming no state (the obligation stays, or Turn I2 fires), and a
  heard ending reported `Parked` while the suite holds its actor (WriteLanes I15). Caught kinds:
  `header-from`, `header-to`, `parked-while-held` beside the seven member kinds.
- Step 4, M1 (`d9c04e0a`): a forgotten identity's owed or parked ending recorded as evidence closes
  (Actors R21); cites moved to the Spec (Actors R22 for disposal parking, WriteLanes R14 read at
  quiescence for the interrupted call, R9 for a member that names no lane); the "boot settles" trace
  says it is carried to T11 (Restore R3). Rejected: I1 for a queued Attempt's send (I11 holds too:
  sending a queued Attempt is an early promotion). Kept as stated readings: unknown { Disposed }
  outside a disposal under Actors I35, I16 and I15 where WriteLanes I27 ("every commit ends", T7's
  row) would now fit.
- Step 5, M2: Run 7's account corrected (above).
- Step 6, cuts (`a31e186e`): the `incarnation` field (written, read only by tests) is gone; one
  `lanesOf` in `lifecycle-model.ts` replaces `lanesNamed`. Not cut: `lane-queue`'s member predicate
  (it has no model), `Adopt` beside `Incarnated` (suite fact against claim), the shared deadline
  causes (CQ11 may split them).
- Audit checklist (policy-testing "Audit a suite"): inputs inventoried (the trigger table);
  excuses limited to observed causes: `UnmappedEnding` excuses only an ending the fixture leaves
  unmapped (`cc6c7d43`), a delivery discharges a boot's restore only when it is unknown { Restored },
  a non-held actor's park is excused by the suite's own facts. A lie per report read: header and
  members (selection, lane-queue), `Unhandled` (`turn.cancel-turns-unhandled`), `Parked`
  (`k.drop-row`), `UnmappedEnding` (`lie.failures-unmapped`, 24 cases), `Incarnated`
  (`lie.no-incarnated`, DLV-04 and DLV-05), plus the existing `Minted`, `Sent`, `Ended`,
  `Delivered`, `Evidence` and `RuntimeDisposed` mutants. Still excused by a report, owed to T8's
  rest: `InvalidTurn` (refusal, Turn I14), a delivered ending's `Denied` (late-routing, R21),
  `Finished` (T9), an unattributable `Unhandled`.
- Reviewer (Haiku) of the revision: accepted (b) a boot's restore owed to a head whose ending was
  decided in the disposal (fixed, with a trace), (c) `mapped` read any ending of the attempt
  (now the open one of the same actor), (e) an `Unhandled` attributed when two actors got the event
  (now unjudged), (f4) any delivery discharged a restore (now only unknown { Restored }). Rejected:
  Resending at `RuntimeDisposed` under I38 (it was sent before, so not never-sent). Carried: a
  path-level park while the actor is live (Actors R10; no fixture has fragments), an old version's
  ending judged against the current reference (no fixture has versions), the CQ6 cell left
  unjudged as round-14's stated limit, and (f1, f2, f6) in the line above.

## T8 (2026-11-11): Turn area (in progress)

**Left, to resume after T16's first checkpoint (2026-11-11):** the T8 H1 rows Turn I1, I4, I6, I24
and I35 (evidence and plans in `not-yet.ts`; I4: a `self` transition keeping Activations, e.g.
`Cells`' `AbortPay` target `self` or audit1b's `A1bHist` compound fixture; I24: `roomFixture`, P1-S,
`mutants-p1s.ts`; I35: `.each` per-key timers, FRAG-06 and FRAG-20; I6 has no old case). Done in
this run: M3 as ruled (WriteLanes R10 and I15 widened to any refused turn, TURN-01 asserts two
issues), I19 moved to T24 with evidence, and the round-14 limits for Turn I32 (arm order) and
Actors I38 (a commit queued behind a Held head at disposal) recorded in README's Stated limits.

### Plan for the rest (2026-11-11, after the step 9 revision; done in round 2 below)

Test-first (the user, 2026-11-11): for each Invariant, its scenarios or mutants and the expected
results (a Haiku drafter, from the Spec) before the oracle. Order, by what closes the revision's
remaining report-excuses first:

1. `late-routing` (I26, I27): owner Activations from the anchor (the leaf an alternative with a
   commit enters, a new Activation per entry or re-entry); a late ending walks the root only, an
   on-time one the leaf then root; an on-time ending's `Denied` is judged.
2. `refusal` (I14 to I16): `InvalidTurn` judged against faults the fixture plants.
3. `issues` (I31).
4. `publication` (I1, I7, I9, I29, I30): needs the Port's `Published` (README Port table).
5. `schedules` (I20 to I23), `activations` (I4, I10, I11), `turn-purity` (I12, I13, I17, I19),
   `placements` (I24, I25), `context` (I28), and I18's case: each needs Port facts first.

### Round 2 (2026-11-11, after `62bb4002`): refusal, schedules, I27, I9; the step 9 revision review

Bottom line: every Turn Invariant is checked, in part with its rest in `turn/remainders.ts`, or owed
by a P4 Task with its reason in `not-yet.ts`. The T18 and T21 rows are proposed, for the user's
read: round-14 and the flat fixtures cannot show them, and T18's and T21's "May change" would need
the suite's Turn cases added.

- `refusal` (I14, I15): a refused turn (`InvalidTurn` naming an ending) and an Unhandled or Denied
  event report no work in their span, the next turn runs from the pre-turn leaf, and a step with no
  other turn of the actor publishes the same state and memory. Faults come through the fixture's
  user code from the suite's answers: `Busy { retryAfterMs: -1 }` (an invalid delay rejects the
  turn, plan O3) and `place` answered `null` (the mapper throws, WriteLanes R10). No Port change.
- `schedules` (I20, I21, I23) and `TURN-03`: firings judged against the suite's clock, uses and the
  carried leaf; I22's returning use is a case expectation.
- `selection` claims I27 (a late turn leaving an Activation that owns pending work; a Held head is
  not pending). `publication` claims I9 (a step whose turns move an actor publishes it).
- Mutants: `refusal.reports-kept`, `refusal.state-kept`, `refusal.unhandled-patches`,
  `sched.outlives-activation`, `sched.fires-at-once`, `life.schedule-fires-unused`,
  `life.waiting-never-wakes` (case), `turn.late-leaves-work`, `pub.turn-not-published`.
- Drafter (Haiku) of `TURN-01` to `TURN-03`. Accepted cases 1 and 3. Changed case 2: the drafter
  read a throwing outcome mapper as a post-commit defect (one issue, committed); WriteLanes R10
  says it refuses the turn and is redelivered once, which the case expects and round-14 does. Its
  case 4 (no reachable Denied in Pay) is right: the late `LateMayNotLeave` denial in PAY-07 is the
  one Denied judged.
- Open for the user (not a stop): plan O3 says a pre-commit defect "is not retried for that
  input"; round-14 redelivers a refused ending once for any cause (D50), and WriteLanes R10 says so
  only for a mapper throw. `TURN-01/schedule-refused` expects at least one `InvalidTurn`, not a
  count.
- Publication review (Haiku) applied: the last publication cleared on `Incarnated` and `Finished`;
  port.ts says `memoryId` is per boot and round-14 reports the root's memory; the "64 and 21 cases"
  below are sweep counts (the mutants run PAY-01 and PAY-04); `w.row-in-place` needs a row
  identity read (T18, README).
- Reviewer (Haiku) of this diff, 12 findings. Accepted and fixed: `Finished` makes an actor's
  armings unknown (1); a firing is excused only by a `Drove` to that actor's root or a `Delivered`
  naming it (2); an Unhandled or Denied is judged only when its event's sources name one actor
  (3); unknown armings end at any entering turn (5); `refusal` resets on `Incarnated` and
  `Finished`, and `selection` bumps an actor's Activation count on dispose, forget and reload, so
  an old owner never matches (6); `publication` matches a part's definition (10); the memory-delay
  gotcha (12). Stated in the docs, not changed: the publication excuse rests on a reported turn
  that `selection` judges (4), no arming id on the Port (7), I9 A-to-B-to-A and raw headers (8).
  Carried to T15's audit: reports read with no lying mutant (9); the admission check named I2
  (11).

The step 9 revision review (`references/proposals/step9-revision-review-2026-11-11.md`), each
verified and fixed:

- H1: a turn with no root part breaks I2; an alternative is never chosen by `to`.
- H2: `Stored` keeps the leaf across a reload (a restore keeps it); a restored ending routes
  `current` before the phase check. Changed: a disposal still drops the leaf, since the record may
  lag its last turn (DISP-02 and DISP-06 go red otherwise: round-14 restores IDLE).
- Probes as `selection` mutants, written from the review's description: p2
  `turn.root-first-no-part` (24 red, 26 listed by the sweep, all by `selection`), p4
  `turn.root-first-on-restored` (32 red, all by `selection`; its review cases PAY-13 and PAY-16 do
  not go red under this edit, so it runs DLV-01, PAY-05, PAY-08), p5 `turn.cancels-dropped-no-part`
  (16 red, all by `selection`). The perturbation test's reference headers now carry their root part.
- M1: a report discharges only the `Await` it answers. M2: an Unhandled or Denied closes a
  delivering ending only when one actor's endings match. M3: an actor-less `Delivered` admits
  nothing. M4: the I30 excuse needs a root-machine part the table says updates; `Published.state`
  and `memoryId 0` stay unjudged (remainders). M5: `unknown { Restored }` of a never-sent Attempt
  only in a step with a reload or an attach (`mutant.unsent-restored-outside-boot`). M6: remainders
  for Turn I2, I26, I29, I30 and Actors I38. Low: a `step()` test of the once-per-step `Incarnated`
  guard (red without it); README and STATUS drift fixed. M7, L2 to L7 carried as the review says.

Reviewer (Haiku) of `8d0c3729`, 10 findings. Rejected: a turn with no root part on a fixture with
parts (3): the tables are flat, so the rule stands until a table names parts (T21; stated in
`selection`). Stated, not changed: the first turn after a disposal takes the reported `from` (1;
the I2 remainder); a reload whose record lags its last turn would go red, a risk no case reaches
(2; WriteAhead I10, I12 allow the lag, so a production case for it is T18's); a cancelAll's NotSent
end leaves a Superseded `Await` (4) and a two-actor Unhandled leaves its ending owed (5), both
unreachable with today's fixtures; the Activation bump drops pre-boot queued commits from I27 (6);
an actor-less `Delivered` admits nothing (7, the Port names the actor). Confirmed: the mutants'
edits (8) and the table-built perturbation headers (9).

### Typed adapter failures (2026-11-11, queued after T8 by the user)

Bottom line: a runtime report, issue, snapshot or row the Port cannot read is a typed `Unreadable`
(port.ts), apart from defects; the runner names it ("unreadable ... the runtime broke the Port's
contract") and a defect "defect: ...". Before, an unreadable report threw inside the prototype's
evidence sink, which round-14 swallowed as a `SinkFailed` issue and dropped the whole batch.

- `observationsOf` decodes each report to a `Result`, keeping the reports around a bad one; the
  adapter sends failures to `Boot.unreadable`, and the Case stops with the first at the step's end.
  `Runtime.snapshot` and `row` return `Result<_, Unreadable>`; the Case's missing-field check
  (`Minted` with no actor or key) is the same failure.
- Kept as defects: an unknown fixture name, a fixture's non-JSON input, the static adapter's
  `Undeclared` and `ForeignHandle` (suite bugs); `PrototypeLoadFailed` was already typed.
- Proved: tests of `observationsOf` and `actorRef`; an edited round-14 whose turn reports
  `event: 42` fails PAY-01 as `unreadable turn`, not a dropped batch.
- Reviewer (Haiku), 8 findings. Accepted and fixed: memory and rows that fail the fixture's Schema
  are `Unreadable`, not a defect (1); a non-string state is `Unreadable`, only `undefined` is
  absent (2); a malformed actor key is `Unreadable` (3); a step's `Unreadable` names the step, and
  wins over a settle failure it caused (4, 5); stale `UnreadableReport` docs (7). Stated, not
  changed: fixture inputs that are not JSON stay defects (6; the fixtures are the suite's own,
  decision 4), and a `Delivered` with no event (an `UnmappedEnding`'s) reads `(unmapped)`; a read's
  `Unreadable` (snapshot, row) has no step, being no step; schema issues are flattened to text (8).

### The T8/T7 rows review (`references/proposals/t8-t7-rows-review-2026-11-11.md`), fixes so far

Bottom line: H2, M1 to M5, M2, M3 and R11 are done; H1 (porting the compound, fragment and
placement cases) and M6 (the implicit state machines) are next. T8 stays open.

- H1 (rows): Turn I1, I3 to I6, I10, I11, I17, I24, I32 and I35 are back on T8 with their round-14
  and old-suite evidence in `not-yet.ts`; I16, I18, I28, I31, I33, I34 stay T18's and I25 T21's, each
  citing the code searched. The I20, I22 and I27 remainders are T8's again.
- H2: PAY-16/schedule-reads-after-memory cites Turn I12 (After memory read by a schedule), with
  round-14's `pay16.schedule-reads-pre-transition-memory`; the guard and mapper reads are a T8
  remainder.
- M1: `evidence-kinds` judges a delivery after an evidence ending the fold accepted (whatever its
  label), in fact order (an unretained unknown is delivered, then released). Its mutant now mails
  the superseded `x` labelled `Overloaded`; `ending-channels` and `delivered-once` catch it too,
  since they judge the same delivery from other sides.
- M2: CLI-06 checks Compile I10's SharedContract report (`cli.shared-contract-unchecked`); the
  construction refusal stays T17's as a remainder.
- M3: reworded, then reverted after an independent check (Haiku): the conflict is three-way and
  needs the user. Actors R15 and I24 redeliver an ending "whose turn is refused, or whose mapper
  throws" (round-14 does, for firings too, turn.ts:1324); WriteLanes R10 names the mapper throw
  only; @plan.Pending D4 (proposed) calls any other redelivery a deviation. TURN-01/schedule-refused
  asserts no issue count until it is ruled (Actors R15 makes it two, R10 and D4 one).
- M4: `refusal` excuses a changed publication only by a turn of an event the suite drove, or an
  incarnation in a step that reloaded or attached.
- M5: remainders for I9 (a turn that stays), I20 (arming ids, disarmOn), I27 (calls before a
  reload) and I15 (counts as delivered).
- L1: a drive to a part credits only a part-only turn.
- R11: the comparison script is `prototypes/conformance/compare-new-suite.ts`.
- M6: `schedules` keeps one tagged `Arming` per actor (`Known` armings or `Unknown`); `anchor` keeps
  one `Call` per Attempt (owner, `CallPhase` Open, Held or Ended, and whether its ending is current),
  in mint order, replacing four parallel collections. The per-actor reset copied across four
  oracles is not merged yet (carried). Falsify 143/143 after both.

### H1 so far (Turn rows back on T8)

Bottom line: Turn I3, I10, I11, I17 and I5 (in part) are checked; I1, I4, I6, I24 and I35 stay
T8's; I32 moved to T18 as a round-14 deviation.

- I5: fixture `LateQueue`; TURN-04 (the first call's ending is late once W was re-entered, and may
  not leave the new W's queued commit); `selection` names I5 when a late route comes from a
  re-entered state, with Spec T1's `a3.r14-explicit-reentry-keeps-activation` and
  `audit-1.r14-reentry-keeps-activation`. `a3.r14-reenters-the-parent` and
  `1b.r14-history-reentry-keeps-activation` need compound fixtures (I5 remainder).
- I3, I10, I11: fixture `Form`; TURN-05 (child refusal from FRAG-17, a pending reset as its own
  `PendingReset` turn from FRAG-02, a removed copy's `whenAbandoned` from FRAG-01), each with a
  round-14 edit as its mutant. `selection` now reads a trait's callback parts as notifications, not
  selected alternatives, and admits Flow's `PendingReset` turn.
- I17: the runner replays seed 1 of every case and compares the reports in order
  (`turn.memory-takes-a-random-nonce`); round-14 replays equal in all 111 cases. Cost: about a
  third more per case; the suite still runs in about 2 s wall.
- Findings for the coordinator: (1) Turn I32: round-14 fires equal deadlines in arm order, not
  actor admission order (two shoppers arming against admission order went red), so the row is
  T18's with that evidence; (2) Actors I38: a commit queued behind a Held head is not ended
  `NotSent { Disposed }` at Runtime disposal on round-14 (the first TURN-04 draft went red at the
  end-of-case disposal; the case now avoids a Held head); (3) LANE-13's key-less cancel on the
  other key's lane is caught only by the case, not by the fold (above).

### Next steps

1. Carried: CQ3's commit half (a Table B row for a lane holding a kept ending); the review's M7.

### Snapshot values (Turn I29, I30) and the Port's `Published`

Bottom line: a ninth Port change, `Published { actor, state, memory, memoryId }`, reports each
actor a visible step changed (round-14 notes it at the step's frame; the adapter numbers memory
objects within a boot). `turn/publication.ts` judges I29 (a memory object never republished with
other content) and I30 (unchanged memory republished as the same object, on steps whose turns
ran no `updateMemory`, from the handler table's new `updates` flag). Test-first: the mutants
were written before the oracle: `w.patch-in-place` (the old lie, with round-14's freeze dropped;
64 cases) and `pub.move-copies-memory` (21 cases). Suite 92/92, falsify 113/113, coverage 43.
Limits: memory is the one part judged; equal-value patches give round-14 a new object (R24 would
keep it), so those steps are not judged for I30; I1, I7 and I9 are owed (flat fixtures have no
non-leaf to publish; a per-turn publication count needs the Port to tie a publication to its
turn).

### Late routing (Turn I26)

Bottom line: `selection` also claims Turn I26. It records each call's owner (the state the
alternative that ran names: the target it enters, a new Activation per entry or re-entry; else
the node holding it, the root's never ending) at the mint and at a retry, and routes a delivered
ending current while that Activation lives, else late (the root alone). Test-first:
`late.routed-from-leaf` was written first and was red only by PAY-07's state expectation; now
caught by I26. A current ending's `Denied` is judged; a late one's stays R21's (I27, owed).
`turn.root-first` is now caught on endings too (I2). Suite 92/92, falsify 111/111, coverage 41,
0 gaps. Phases and the transition table moved to `turn/phases.ts`.

Reviewer (Haiku) of the I26 diff, 10 findings. Accepted: a retry re-owns its lane's head, the
oldest open call of its operation and key (not the latest mint; an unknown keeps a call open); an
unknown { Restored } and an adopted ending (`Unparked`) count as current only in a step with a
reload or an attach (not on the runtime's word alone); docs (the Restored route, the `Unanchored`
phase, `judgeTurn`'s doc). The anchor's state moved to `turn/anchor.ts`. Carried: owners per part
(the Port's `Minted` names no part; no fixture has fragments), reads' endings (no owner in the
Port), and the fallback match that leaves the entry count stale (it can hide an I26, never fake
one).

### Selection (first, from the step 9 review's H1)

Bottom line: `turn/selection.ts` judges every reported turn header (Turn I2) against a hand-written
handler table and facts the suite owns, so a lane oracle may trust a header that passed it. Suite
92/92, null 0/92, falsify 103/103, coverage 41 of 186 (18 in part), 0 gaps, `nub run check` zero.

- Built: `fixtures/handlers.ts` (`Handlers`, `possible`: the leaf's level, then the root's; state
  tokens computed, other guards opaque, each possible up to the first unguarded one); a `handlers`
  table on every fixture (Pay, Cells, Serialize, Latest, Cancel), by hand from the typed sources;
  `Judge.start` and `Oracle.open` take the case's tables (`handlersFor`); the oracle's phases
  (`Fresh`, `Stored`, `Live`, `Unanchored`) move by one table on suite facts and judged turns.
- Checks per turn: `from` equals the carried leaf; the event was driven to that actor, delivered to
  it, or is one its schedules send; the root part's place is an allowed alternative and `to` is its
  leaf. The carried leaf is the table's, never the report's.
- Mutants: `turn.header-to-nowhere` (the review's probe: cancels dropped, `to: "Nowhere"`; caught on
  PAY-12/cancel-on-wire), `turn.from-misreported` (PAY-01), `turn.root-first` (PAY-04, selection
  reading the root before the leaf). `turn.record-renames-alternative` is now also caught by I2.
- Stated limits: a delivered ending may be late (R19, R20), so the root's alternatives are allowed
  beside the leaf's for it; `root-first` is caught only on driven and scheduled events, and
  lateness is `late-routing`'s (I26, owed). `Unhandled` and `Denied` name no actor, so a turn that
  should have run and is reported unhandled is not judged. A `Delivered` report admits its event
  (delivered-once judges deliveries). Part-level alternatives and compound states are not judged
  (no fixture has them). After a reload or a disposed actor's re-use, the next `from` is taken once.
- Reviewer (Haiku), 6 groups: tables match their sources (no mismatch). Accepted: a live actor's
  second use kept unanchored (fixed: it keeps its leaf), stale driven credit (cleared on dispose,
  forget, reload, and on an `Unhandled` or `Denied` of the event held by one actor), the unused
  `none` field (dropped), docs. Rejected: keep a disposed persisted actor's leaf (its record may lag
  its last turn, WriteAhead's capture interval); "the walk doc is inverted" (it matched the code).
  Carried: the late allowance and the `Delivered` admission above.

## T16 (2026-11-11): the Pay path on production

The 61 Pay cases (fixture `pay`) pass on production (`suite --runtime production`), and
`falsify --runtime production` catches 13/13 production mutants, at 8bd0cfb9. Cells cases are not
booted yet (`UnknownProductionFixture`).

- **Layout (proposed, the user's read):** `src/core/` is the pure core: `compiled.ts` (Compiled),
  `turn.ts` (the turn), `step.ts` composing `tx.ts`, `persist.ts`, `lanes.ts`, `answers.ts`,
  `incarnations.ts`, `serve.ts`, `disposal.ts`, with `record.ts`, `rows.ts`, `evidence.ts`,
  `world.ts`, `input.ts`. `src/host/` is the Effect edge: `host.ts` (the Host contract),
  `driver.ts`, `edge.ts`, `runtime.ts`, `testing.ts` (Flow's own seam, not a route). The Pay
  machine in the public API is `conformance/machines/pay.ts` with `pay.contracts.ts`.
- **Public exports (provisional, the user's call):** root: `definition`, `machine`, `transaction`,
  `resource`, `deny`, `Flow` (`initial`, `uncertain`, `entry`), `Outcome`, `FlowError`, `app`,
  `runtimeSetup`, `actorRef`; types `Definition`, `Machine`, `Resource`, `Transaction`, `Attempt`,
  `Actor`, `ActorRef`, `App`, `Runtime`, `RuntimeSetup`, `Snapshot`. Inspect: `attachInspector`.
  Runtime members: `ready`, `ensureActor`, `disposeActor`, `dispose`; handle: `send`, `getSnapshot`.
- **Decisions:** the Pay machine keeps the real Pay's 3-D Secure alternatives as guarded stays
  (CHALLENGE is outside the subset) so alternative places match `states.PAYING.on.Confirmed[1]`;
  Pay's deadline is its commit's `Effect.timeoutOrElse` over a detached request fiber (an
  uninterruptible request still times out); uses, `ensureExisting`, `forget` and runtime disposal go
  through `src/host/testing.ts`; lint: `no-allocation-in-loop` narrowed to `core/turn.ts`,
  `no-optional-domain-properties` an error on internal modules and off on the public option-bag
  modules, `--no-error-on-unmatched-pattern` removed (FLOW-STATE.md updated).
- **Review sidecars (Haiku, one rule each):** adapter role: accepted 3 (parts ignored → refused with
  `UnbuiltInProduction`; non-object payload → `Unreadable`; dispose and forget were no-ops →
  built), rejected 4 as stated limits of this skeleton (flat parts and `definition` constants,
  input ignored for an input-less machine, `entity` none, the row read through the public
  `O.x.get` path); core purity: accepted 3 (guard verdicts and select or key records now read
  inside `Result.try`), deferred 1 (a user Schema that throws escapes the `*Result` adapters) to
  T18.
- **The user's notes, folded in:** `Host.monotonic` (the real host uses `performance.now()`); real
  entropy for the session seed (`crypto.getRandomValues`). Owed by @task.V3.T19: the real host's
  visibility (`hidden`, `onHidden` stubbed) and storage (`store: none`).
- **Open:** Restore R1 against DISP-05 (spec-log, 2026-11-11 T16); no module integration tests yet
  beside the suite; reject is the only concurrency; no `flow graph` on production, so the graph
  gate does not judge production turns; the coverage gate reports 5 gaps owed by @task.V3.T7, which
  is done (from the phase restructure, not T16).

### T16 review fixes (2026-11-11, `t16-review-2026-11-11.md`)

- **Fixed, each with a public-API test that failed first** (`9bfdb839`, `src/host/runtime.test.ts`):
  ready() once, storage before services, RuntimeNotReady before it (H2); an unencodable commit
  declines Unencodable (H3); non-reject concurrency refused at compile time, a stated limit (H4).
  dispose() runs the disposal (H1, fixed by R1; pinned by a test). Computed entry delays arm (R6).
- **Restore R1** (`27618769`): Held-lane identities stay records at the boot; an owed identity
  whose record does not decode is not woken (`9bfdb839`).
- **The internal symbol is gone:** a Runtime carries only an inspector hook; the suite builds
  through `testing.build`, which returns the driver beside the Runtime (M7).
- **Pay's UNSURE stand-in** takes the real guard and cancel; PAY-23 reaches it (L2).
- **Mutants** (`7419dadb`): persist, record and tx, and one the Cancelled exemption hid; 17 caught.
- **T7:** I23 is partial (data and forget owed by T7); unknown Cancelled now needs a cancel.
- **After the fixes** (`484cbfb8`, `0c4d27f7`): the 8 Cells cases pass on production (70 Pay
  and Cells cases in all); 9 public-API module tests (`src/host/runtime.test.ts`,
  `src/machine.test.ts`).
- **Owed:** the reviewer's `kept-ignored` probe needs a case, and the case (drafted: a commit on a
  kept ending's key declines Rejected) fails on both runtimes because the suite's lifecycle does not
  model a kept ending holding its lane (WriteLanes R6, CQ3): owed to T44.

## T43 (2026-11-11): Effect simplification R1 to R8

All eight applied, each alone with the round-14 suite and the Pay cases green and the production
mutants caught, at 90c9f3bd.

- **R2** (`7467df5c`): codecs compiled once; the public send decodes payloads and throws
  InvalidEvent (a real bug: payloads were never decoded); an equal update keeps the memory object.
- **R1** (`181caa16`): Host is a Context.Service with only what Effect lacks; Clock and Scheduler
  come from the Platform Context; calls, timers and wakes are keyed fibers in one FiberMap in the
  Runtime's one Scope; dispose closes the core, then the Scope.
- **R3** (`119bb1fc`), **R4** (`e563d710`), **R5** (`9064f874`), **R6** (`9f48aa50`, also arms
  computed entry delays at creation), **R7** (`9118e224`), **R8** with the time ban (`90c9f3bd`).
- **The advisor's bug, confirmed:** a throwing inspector left the driver's loop marked running,
  so later inputs stayed queued. A test failed first; a throwing sink now detaches itself and the
  loop is released before a step defect is rethrown. No production mutant: no Port path throws in
  a sink; the test was falsified by hand (both guards removed: red).
- **Rejected:** none. R7's string TypeId became T16's removal of the internal symbol.

## T41 (2026-11-11): coverage gate

Bottom line: `coverage` (and the first line of `falsify`) fails unless every Invariant of the ten core Specs is checked
(an oracle's guarantee names it and one of its prototype mutants expects it; falsify proves the catch) or listed once
in `not-yet.ts` with its owning Task. At `6279cdf1`: 16 of 186 checked, 170 owed, 0 gaps.

- Built: `coverage.ts` (the rule, pure), `not-yet.ts` (rows per Task: T7's WriteLanes rows with I9 claimed by
  `lane-queue` but no mutant, T8 to T13 their areas), `runner/specs.ts` (Invariants read with
  `workflow show @spec.<name> --json`; an unreadable or empty Spec fails the gate), `nub run conformance:coverage`.
- Planted gaps (run, then reverted): `Turn I31` dropped from T8's row, `WriteLanes I3` added to T7's, a `Turn I99`
  row. The gate printed `Uncovered`, `Stale` and `Unknown` for each, `3 gap(s)`, exit 1.
- Reviewer (Haiku) of the diff: accepted the empty-read guard (added). Already stated: covered is by declaration,
  falsify proves the catch; I9's README row says it has no mutant. Carried: to `nub run verify` with T15 (fast
  gates in verify); case-judged checks (a row for case expectations) when the first case-only Invariant lands
  (T7's I4, I5, I18); production mutants with P4; a row naming a closed Task.

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
