# T6 completion review (2026-11-10)

Hourly review of builder checkpoints `9c43f407` (Actors I35, I36), `63332667` (the user's cleanup), `e9320217`
(T6 review fixes) and `392147bc` (H5 in ending-channels), by an Opus lead with four Haiku sidecars.

**Verdict:** T6's acceptance holds, but the disposal layer has one High false pass and a cluster of Medium findings
that share root causes with the rest of the oracle layer. The High finding needs no guarantee change: WriteLanes I12
already states the rule that the unregistered false-`Released` mutant breaks. Both `lane-queue` and the disposal ledger
accept the runtime's `Released` claim without anchoring it to a suite fact.

**Scope and method:** code was read at `392147bc` from a `git archive` copy in the lead's scratchpad. HEAD moved during
the review (T40 S1, S3, S5, S6, S7 landed, and the tree had uncommitted T40 edits), so a builder was running, contrary
to the brief. Where HEAD already fixes a finding, the finding says so. No gate, suite or falsify run was made: the
orchestrator's runs at `8be33fc5` (suite 67/67, null 0/67, falsify 38/38, each by its expected Invariant) were taken
as given, and every finding below was verified by reading the code against the cited Spec rule.

## Root-cause classes

- **RC1, unanchored runtime claims:** an oracle treats a runtime report (`Released`, a bare `Delivered`) as proof,
  against the Port's own rule that every observation is a claim to anchor to a suite fact (`port.ts`, `Observation`
  Gotchas).
- **RC2, hand-rolled mutable oracle state:** each oracle keeps its own mutable collections. Folds are pure in name only,
  and lifecycles are split across several collections (implicit state machines).
- **RC3, domain rules computed per oracle:** the answer-to-channel classification, `Never`, lane identity and the
  effect of a cancel are re-derived in each oracle, with different rules. T40 S5's `dsl/domain.ts` starts on this.
- **RC4, Spec and oracle drift:** an Invariant's text is narrower than what its oracle judges, or `expects` names an
  Invariant the fault does not break. Docs and guarantee strings lag the code.
- **RC5, coarse time:** reports are stamped with their step, not with the clock.

## Findings

Paths are under `packages/flow-state-v3/conformance/`, lines at `392147bc`.

### High

**H1. A false `Released` passes every oracle (RC1).**

- **Where:** `write-lanes/lane-queue.ts:187-195` drops the Attempt from the lane model on any `Released` and returns no
  violation. `actors/disposal-ledger.ts:184-190, 198-200` settles a head on `Released` whenever the suite holds a use
  of its actor.
- **Rule:** WriteLanes I12 ("A Held lane leaves Held only by a retry's resolution, a cancel or cancelAll, or a release
  on leave") and R8 ("no quiet release"). `lane-queue`'s guarantee includes I12 (`lane-queue.ts:514`).
- **Scenario:** the old suite's `lie.held-released-unguarded` (`prototypes/conformance/falsify.ts:305`) reports
  `Released` for a Held head whose handler's cancel is guarded out, then drops the lane. `lane-queue` accepts it, and
  disposal no longer counts the head as open (`openHeads` excludes `Settled`). Only the cases that count `Released`
  (PAY-03, LANE-03, LANE-09) fail.
- **Fix:** admit `Released` only when anchored to a suite fact: a turn of the owner on an event the reference says may
  cancel the operation (extend `OperationReference.cancels`, which today lists only unguarded cancels, with
  may-cancel events), a release on leave the fixture declares, or an unknown whose mapping is bare or ignored (R4).
  Any other `Released` is a WriteLanes I12 violation in `lane-queue`. Register `lie.held-released-unguarded` there
  with `expects: "WriteLanes I12"`. Then the ledger's use-held window is no longer needed.

### Medium

**M1. `Delivered`'s ending is derivable, so the stated "no channel" limit is unnecessary (RC1).**

- **Where:** `actors/disposal.ts:85-86` (`keptLane`) accepts any delivery of the Attempt as the parked ending.
- **Rule:** Actors I29 with Restore I6 (a parked outcome is delivered as that outcome, never also unknown Restored).
- **Scenario:** an Attempt settles success within the bound and is parked; the next boot delivers the fixture's
  unknown event for it. I29 passes. `ending-channels` H5 catches it only if the runtime also reports an `Ended` at
  the boot.
- **Fix:** map `Delivered.event` back to its channel through the reference's `success`, `failure` and `unknown` events
  (`fixtures/reference.ts:25-27`) and compare it with the ending the disposal reported (`life.ended`). No Port change
  is needed.

**M2. The disposal oracle keeps implicit state machines (RC2).**

- **Where:**
  - an Attempt's phase during disposal is spread over `wire`, `settled` and `ended` (`disposal.ts:28-39, 158-159,
    203-225`), and `wire` is stored beside `held` though it is `held` filtered by phase (`disposal.ts:349-350`);
  - the Maps inside the `Life.Disposing` value are mutated in place (`:212, :218`), and `Advanced` copies the value
    while sharing them (`:395`);
  - a second lane lifecycle, `Kept` (`dropped`, `unbound`), sits outside `Life` and is mutated by `push` and `splice`
    (`:45-50, :240, :276, :295, :307`);
  - `judgeStep` mutates the ledger inside its `reduce` (`:400-403`).
- **Rule:** AGENTS.md "Don't write any implicit state machines" and "Store facts, derive views"; STYLE.md (one closed
  variant of phases, one transition).
- **Regression:** the T6 STYLE reviewer's finding 1 ("one phase per Attempt, not three sets") was logged as accepted
  in STATUS.md, yet `9c43f407` reintroduced three collections for the disposal-time phase. The cleanup commit's claim
  ("no phase kept in flags") holds only for `Life` itself.
- **At HEAD:** the `Kept` mutations and the Map writes are still present.
- **Fix:** give each Attempt one closed phase that disposal extends (`OnWire`, `SettledInBound { channel }`,
  `Ended { ending }`) and each lane one closed kept-state, changed by one pure transition the fold threads.

**M3. The ledger's tables are only partly the transition authority (RC2).** This is the verdict on the previous
review's "cleanest in the suite" claim.

- **For the claim:** `ON_SENT`, `ON_ANSWER` and `ON_ENDED` (`disposal-ledger.ts:100-119`) are total, typed tables,
  the only ones in the four oracles, and `learn` matches all 14 facts.
- **Against it:**
  - four of the seven ways a phase changes bypass the tables: `cancelled` (`:166`), `minted` (`:171-178`), `claimed`
    (`:198-200`) and `reloaded` (`:203-208`);
  - `Settled` conflates a definite answer, a claimed release or supersede, and a driven cancel;
  - `claimed` takes `kind: string` where `EvidenceKind` exists (`:184`);
  - the ledger is mutated with `splice` inside a fold (`:149, :230`).
- **Verdict:** the cleanest typed encoding in the suite, but not one transition authority.
- **Fix:** route every phase change through one table keyed by (phase, event), and split `Settled` by cause.

**M4. A cancel of a call on the wire settles its head, while WriteLanes R14 holds it (RC3).**

- **Where:** `disposal-ledger.ts:155-167` moves any head to `Settled` on a driven cancel event.
- **Rule:** WriteLanes R14: "On the wire it interrupts the fiber; unknown { Cancelled } is queued when the fiber exits
  and retained (Held)". R4's "an unknown that is not retained (... a cancel's own turn end) is released" reads the
  other way, so the Spec is ambiguous.
- **Scenario:** a call is on the wire; the suite drives a cancel event; the runtime drops the lane; then Runtime
  disposal and a reload. No I29 violation is reported.
- **Fix:** settle only Held or waiting heads on cancel, and let an on-wire head follow its ending. Ask the user to
  reconcile R4 with R14.

**M5. `expects` and the Invariant text disagree for H5 (RC4).**

- **Where:** `write-lanes/ending-channels.mutants.ts:57-69` (`mutant.success-without-answer`, `expects: "WriteLanes
  I3"`) and `ending-channels.ts:212-218` (`madeUp`, reported as I3).
- **Rule:** Conformance Q5 says each mutant names "the Invariant it breaks". WriteLanes I3's text covers only one
  channel per ending and no definite failure after an unknown. A made-up success breaks R2 (the commit's
  classification), which I3 does not state. The whole of `ending-channels`' answer check rests on R2 through the
  coverage block, not on I3's words. The builder rejected this point (T7 log, reviewer finding 6) on the coverage
  block.
- **Fix:** revise WriteLanes I3 with to-spec, for example "an Attempt ends on the channel its commit gives the
  server's answer; without an answer only unknowns and Flow's declines". This is a guarantee change, so it needs the
  user's read.

**M6. A `Never` answer counts as a settlement (RC3).**

- **Where:** `disposal.ts:203-214` (`settledIn`) and `disposal-ledger.ts:127-137` (`answered`) classify `Never` as
  unknown (`fixtures/reference.ts:74`), though `world/network.ts:17` keeps the request open. `ending-channels.ts:231`
  skips `Never`.
- **Rule:** Actors I35 ("a call ... that settles").
- **Scenario:** a call is on the wire at the disposal's start; the case answers `Never`; the runtime ends it unknown
  Interrupted at 0 ms. `cutShort` sees settled `unknown` equal to the ending's channel and passes (`disposal.ts:168-
  173`). This is latent: no disposal case answers `Never`.
- **Fix:** one shared answer-to-channel function in `dsl/domain.ts` that returns none for `Never`, used by the ledger,
  disposal and `ending-channels`. That also removes the duplicate.

### Low

- **L1 (RC4, fixed at HEAD):** `disposal.ts:491`'s guarantee omitted Actors I32, though the oracle reports it (`:52`)
  and a mutant expects it. HEAD (T40 S1) lists I32.
- **L2 (RC2, fixed at HEAD):** `dsl/case.ts:172` keeps only the first violation per oracle per step, so a later
  expected violation reads as a wrong reason (loud, not a false pass). T40 S1 keeps every violation.
- **L3 (RC4):** Invariant or rule ids in doc comments added by these commits: `dsl/oracle.ts:103`,
  `fixtures/reference.ts:80`, `write-lanes/ending-channels.ts:299`, `write-lanes/lane-model.ts:43`. Rule: no ids
  outside `guarantee`, `cites`, `expects` and violation text.
- **L4 (RC4):** stale lists. `actors/disposal.mutants.ts:5-18` names 7 of 12 mutants;
  `ending-channels.mutants.ts:3-11` names 3 of 4; the README's mutant rows (`:260, :263, :264`) miss
  `mutant.success-without-answer`, two delivered-once mutants and `lane.held-auto-resend`; `STATUS.md:443` names a
  `disposalBoundMutants` that no longer exists.
- **L5 (RC4):** `mutant.release-drops-held` drops the lane at the release grace end, before any disposal, and is
  reported as "did not survive the disposal". I29 is literally broken, but the first broken rule is WriteLanes I12.
  DISP-01 cites Actors R20, though it runs no `disposeActor`. Fix: cite WriteLanes R8 and I12, and word the message
  as "absent after the disposal".
- **L6 (RC5):** the end of every case advances 5000 ms in one step (`dsl/case.ts:312`), so an early bound cut at
  3 s inside it passes I35. PAY-16 splits 4999 + 1 and catches it there; the limit is stated. Fix: split the end's
  advance the same way.
- **L7 (RC1):** I35's settled check compares the channel only (`disposal.ts:168-173`). A call answered `CardDeclined`
  that ends failure with a Flow reason passes; I35 says "ends by its own result". Fix: compare the reason for
  failures.
- **L8 (RC2):** the end-of-case reattach records `Ensured` for `ensureExisting` (`dsl/case.ts:288-305`), so
  `adopted()` reads it as adoption. After `disposeActor` or `forget` with no re-ensure, a correct runtime adopts
  nothing and is flagged. This is latent and the builder noted it. A held use's reattach records no `Ensured`: two
  paths, two meanings.
- **L9 (RC3):** lane guesses where keys are missing. `recommitted` matches operation and actor, not key
  (`disposal.ts:270-278`). `laneOfDelivered`'s fallback (`:116-130`) can attribute one key's never-sent commit to
  another key's head while `Minted.key` is `None` (the prototype limit, Conformance Q3).
- **L10 (RC2):** `holdLast` counts a second delivery of the same id as a later ending (`disposal.ts:142-145`), which
  mixes a WriteLanes I15 fault into I31.
- **L11 (RC4):** a lane whose call settled while it was unbound is not required at adoption: `adopted()` checks only
  `Unsure` (`disposal.ts:299`). DISP-06 catches it only through its own expectation.
- **L12 (RC2):** small style points:
  - `uncertain` treats any truthy value as uncertain (`disposal.ts:245-246`);
  - `Ending` repeats `Ended`'s fields (`:26`);
  - the dead fallback `Option.getOrElse(request.key, () => "")` sits after its guard (`ending-channels.ts:228, 235`);
  - two `Phase` types, two `Ledger` types and a local `Runtime` type shadow other names;
  - `Phase` and `Attempt` are exported but used only in their own module (`disposal-ledger.ts:24, :44`).

## The four flagged items

1. **The use-held `Released` leniency:** unsound and avoidable. It admits a `Released` at any moment while a use is
   held, including steps where no turn ran. Replace it with H1's anchoring. With that in place, `whenAbandoned`
   releases (R16) also stop being false positives once a fixture declares them.
2. **The unregistered false-`Released` mutant:** not a guarantee gap. WriteLanes I12 and R8 state the rule, and
   `lane-queue` owns I12. Register it under `lane-queue` with `expects: "WriteLanes I12"` after H1. The record's
   "no oracle catches it" is true; the implied "no Invariant states it" is not.
3. **The unported `1b.disposal-definite-w-first`:** the builder is right. The mutant swaps which is parked first, the
   definite head's ending or the queue's NotSent { Disposed } (`prototypes/round-14/mutants-audit-1b.ts:10`).
   - No Invariant fixes that order. Actors I31 orders only the hold-leaving ending, and Restore I5 keeps whatever
     saved order there is.
   - WriteLanes I21 orders cancelAll the other way: queue first, head last.
   - Recommendation for the user: add no mint-order Invariant; put the mutant in revisit.md as a deliberate non-rule.
4. **`Delivered` carrying no channel:** the limit is real today but needs no Port change. Derive the ending from
   `Delivered.event` through the reference (M1).

## Spec revisions

- **I35:** right and faithful to R22. It bundles three clauses (not cut short; settled ends by its own result and the
  disposal waits; unsettled at 5 s ends unknown { Disposed }), but they are one bound, so this is acceptable. R22's
  "its late result is ignored" is judged by nothing; noted, not a finding.
- **I36:** right and minimal. The oracle judges every later boot until a new commit of the operation, which is
  stricter than "the next boot" but follows R22 ("a definite ending drops it").
- **Q5 narrowing:** sound in direction. A kill must now name its (oracle, Invariant) pair, which makes kills
  stricter, and the trailing colon in falsify's match keeps "I3" from matching "I35" (`runner/falsify.ts:114-115`).
  Two caveats:
  - the wording "the Invariant it breaks" does not match practice when the oracle reports a proxy Invariant (M5,
    L5);
  - the first-violation limit is fixed at HEAD, so Q5's open list should be refreshed then.

## Sidecar log

Each result was verified by reading the cited lines at `392147bc` and the Spec rule.

**Sidecar (a), code quality (29 items and the claim):**

- **Accepted:**
  - 2, 4, 5, 6 and 14 (into M2);
  - 7 and 11 (into M3);
  - 19 (into M6);
  - 1 (L2, fixed at HEAD);
  - 13, 17, 23, 24 and 25 (into L12);
  - 3, 9, 10, 15 and 16 (Low: the delivered-once and lane-queue state machines, which T7 rewrites);
  - 20 (three lane identities, addressed at HEAD by T40 S5; not re-verified);
  - 21 and 22 (Low duplication).
- **Changed:**
  - 12: `Ended.reason` must stay a string, since author tags are open (WriteLanes R4); Issue codes could be a literal
    union (Low);
  - 18: the `_tag` compare is Low; the stored step number is a label, not a derived fact;
  - the claim: verified independently (M3).
- **Rejected:**
  - 8: `reportedWhileDisposing` tests two tags, and STYLE.md asks for `$match` from four;
  - 26: FLOW-STATE.md treats `runner/` as an edge;
  - 27: outside these commits;
  - 28: old-suite mutant names are kept by README decision, for comparison with the old suite;
  - 29: trivial.

**Sidecar (b), types, comments and lint (34 items):**

- **Accepted:**
  - 1 (L1);
  - 2 to 6 and 32 (L4);
  - 7 to 10 (L3, in-scope lines);
  - 24 and 29 (into L12 and M2);
  - 26 to 28 (L12);
  - 30 (Low doc fix).
- **Changed:** 11 to 13 are older doc ids, outside these commits; noted for the convergence pass.
- **Rejected:**
  - 14: a README decision number, not a Spec id;
  - 15: old-suite names;
  - 16: case ids are suite names;
  - 17: the label is failure text;
  - 18 to 23 and 25: pre-existing adapter and scenario code, outside these commits;
  - 31: author tags keep the reason open;
  - 33 and 34: `nub run check` is at zero, the formatter owns code lines, and README and STATUS are not Workflow
    records.

**Sidecar (c), disposal correctness (20 items and ledger notes):**

- **Accepted:**
  - 1 (H1 and M4);
  - 2 (M1, changed to a reference mapping rather than a Port change);
  - 3 and 11 (L8);
  - 5 (L11);
  - 8: adoption-time endings are not ordered under I31 (Low, noted);
  - 9 and 19 (L9);
  - 13 (M6);
  - 14 (L7);
  - the ledger notes on `Settled` (M3);
  - the R16 note: no fixture declares `whenAbandoned`.
- **Changed:** 12 (L6): PAY-16's 4999 + 1 split covers the bound in the cases; only the end of case is coarse.
- **Rejected:**
  - 4: `lane-queue` judges a `Minted` with no actor (`lane-queue.ts:41-42`), one oracle per guarantee;
  - 7: I30 is anchored to the server log by design;
  - 10: fixed fixtures, so the clause cannot change a verdict;
  - 15: a settled call left unended is caught at the reload by I36's `endedUnknownAgain` or by I29 (path read);
  - 16: reads have no Attempt, and I35's "call" is ambiguous; noted;
  - 18: the restore half of I36 is judged without `Read`;
  - 20: the Port says an `Ended` is reported when it is decided;
  - the ledger's `Sent` to `Unsure` on a re-send: `lane-queue`'s to judge;
  - `Superseded` on any minted Attempt: `lane-queue` judges I8.
- **Not verified:** 6 (a commit minted during disposal) and 17 (the doc line numbers).

**Sidecar (d), mutants, `expects` and H5 (27 items):**

- **Confirmed:** 1 and 6 (the colon guard; no silent pass); 11 to 13 and 15 to 17 (each mutant fails for its stated
  reason); 21, 25 and 26 (H5 is correct as R2 states it).
- **Accepted:**
  - 2: no lane identity in the match (Low);
  - 3: seed 1 only (as Q5 states);
  - 4 and 5 (L2, L1);
  - 7 and 18 (M5);
  - 14 (L10).
- **Changed:**
  - 8: I29 is literally broken too (the lane is absent after the disposal), so Low;
  - 10 (L5);
  - 19: WriteLanes I12 does state the rule (H1);
  - 20: Restore I5 does not fix the park order, and I21 orders the other way, which supports the builder.
- **Rejected:**
  - 9: I29 enforces R22 by the coverage map, and the message is explicit;
  - 22: unknowns legitimately end without an answer (cancel, die, restore, disposal);
  - 23: a stated Gotcha;
  - 24: writes carry their Attempt id; unverified and conditional.
- **Noted:** 27 (`mutant.delivered-during-disposal` judged under I15 is RC4, outside the named set).

## Verdict on the builder's log

The builder's accept and reject entries are specific and give reasons, and the orchestrator's re-runs confirm each
kill. Two weaknesses:

- **A logged acceptance was undone:** STYLE finding 1, "one phase per Attempt, not three sets", was accepted for
  `03098b28`, and `9c43f407` reintroduced three collections (M2).
- **Two rejections do not hold against the Spec's text:**
  - "a boot's parked delivery carries no channel; stated limit" (T6 review fixes, item 4): the ending is derivable
    from `Delivered.event` (M1);
  - "WriteLanes I3 enforces R2 in the coverage block" (T7, item 6): the Invariant's words do not state what is
    judged (M5).
- **Smaller points:**
  - each change got one Haiku reviewer, not four, and the cleanup commit got none (its verdicts were compared
    byte for byte instead, which is adequate for a refactor);
  - the log does not record re-running a sidecar's checks.
- **The flag on L5 ("no oracle catches it") was framed as a gap for the user;** it is an oracle gap the lane work
  can close (H1).

## Not checked

- No suite, null or falsify run of my own. In particular, `lie.held-released-unguarded` was not ported and run to
  show it survives; that rests on the builder's probe (STATUS.md, L5) and on reading `lane-queue.ts:187-195`.
- The T40 commits at HEAD were checked only for whether L1, L2 and M2 still stand.
- Sidecar (c) items 6 and 17 were not verified.
