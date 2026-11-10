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

Bottom line: S2, the T6 completion review's disposal findings and the T40/S2 review are done (M1 by the Port rule).
Suite 69/69, null 0/69, falsify sweep 47/47. Open: T41; I22; T7's own rows.

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
