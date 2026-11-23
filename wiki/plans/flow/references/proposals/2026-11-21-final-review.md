---
review final-review
status open 2026-11-21
description Finds no algorithm design Spec-ready as written, though every blocker is local; the worst holes sit between designs.
---
# Final review: holes across the six algorithm designs of the round (2026-11-21)

**Bottom line:** no design is Spec-ready as written, but every blocker found is local and named. Schedules
needs one mechanical pass (its answered question 8 is not carried into its tables). Turn, operations and host
each need a few cells changed. Records needs two rule calls. Types is held up by its own known holes (H2, H8).
The worst holes sit **between** designs:

- who owns alarms, and which alarm kinds exist;
- whether a hidden page is a use change;
- arms resolved for a scope that ended later in the same turn;
- three different rules for a throwing user read.

The re-run models agree with the final text for turn, records and operations. Host's edge table (6.4) fails on
three traces. Of the 68 open questions:

- 29 are correctness calls, which this review checked where it could;
- 13 sit in 10 duplicate or conflict groups, each with one proposed answer;
- 26 are the user's calls.

Requirements no design owns: streams, server rendering, Story frames and playback, redaction, the reach flags
(`cancelsAcknowledging`, `retainsUnknown`) and the retry guards (`retryable`, `idle`), which five fixtures use.

Method: the findings come from an Opus read of the six designs and four Haiku sidecars (adversaries for each pair
of designs, seams, requirements and fixtures, question collation). A Sonnet sidecar re-ran the models. Each
finding below was checked against the cited lines. A finding marked *(sidecar, unverified)* was not re-read. The
verification log is in section 6.

## 1. Findings by severity

Short names: S = `2026-11-21-algo-schedules.md`, T = `-algo-turn.md`, R = `-algo-records.md`,
O = `-algo-operations.md`, Y = `-algo-types.md`, H = `-algo-host.md`, all in this folder.

### 1.1 Blocks Spec

**Cross-cluster**

- **X1. Alarms have two owners and an open set.**
  - T fixes the set at four alarm kinds: schedule, grace, silence and bound. Its `tick` branches on those
    four, and I12 says "no other alarm" (T:152, T:797-800, T:825).
  - O adds two more: a collect alarm for `gcTime` and a release alarm at `since + bound`. O names them in
    `collectDue`, `releaseDue` and "the two alarms" (O:250, O:316, O:334, O:464).
  - H calls the release alarm a core alarm (H:363-364, H:870).
  - Ownership is split. S says the applier's alarm writes are "the only writes to the due index" (S:772).
    T says the turn offers `alarms`, and AS writes go through it (T:1162).

  Trace: an entry's last hold leaves with `gcTime` 5000. O sets an alarm. T's `tick` has no branch for it, and
  T's I12 calls the alarm a breach. Expected: the entry is removed at 5000.

  Fix: one alarm owner (T's heap) with an open, tagged alarm union. Each owner registers its alarm kind and the
  handler `tick` dispatches to, and I12 becomes "every alarm has a live owner".
- **X2. A hidden page is a use change in T and is not one in H.**
  - T: "a hidden page and a hydration reach the core as a use change" (T:722). T's Freeze row then clears
    the alarms of the scopes that fell asleep (T:705).
  - H: "a hidden page is not a use change in v1" (H:867).

  Trace: a background tab with an armed `autosave`. Under T its alarms are cleared, and wake fires the
  overdue timer once. Under H the alarm keeps running. The two designs give different schedule behaviour, and
  neither records the other's choice. This is a user-visible call; see pile (b), group B11.
- **X3. Arms are resolved for a scope that ended later in its own turn.** T resolves each part's actions, sends
  and "its scope's arms and disarms on `after`" (row 7, T:766). This happens after the rounds in which
  `settle` ends instances (T:769-772). I10 only says a part's scope was not ended *earlier* (T:820).

  Trace: a part of instance `k` enters a state with a computed `after`. Its own event patches the host so that
  key `k` is gone, and round 2 ends `k`. Row 7 then runs `k`'s delay, which is user code. By AS question 5 a bad
  delay refuses the whole turn (T:712-713). Expected: an ended scope hears nothing (T:698, P4).

  Fix: row 7 skips scopes with an `End` in `acc.steps`. Add the trace to T's sequence alphabet.
- **X4. Three rules for one family: a user read that throws.**
  - S question 3 (answered): the first clean read is a silent baseline (S:830).
  - O question 18 A: the row is refused, tried once more, and kept with its issue (O:938-945).
  - T H3: a throw reads as the slot's last value (T:1434).

  The principle "same rule at every scope" and the classes-not-instances rule both ask for one rule. See
  group B4.

**Schedules (S)**

- **S1. Question 8 is answered A, but the tables still encode B.** The answer: a refused start is retried on
  every occasion (S:863-864, `[answered: user 2026-11-21]`). Text that still says B:
  - the start causes, which still say "Wake and Refused … question 8 would make it any occasion" (S:292-294);
  - I6, which keeps its `Refused` exception (S:490);
  - the input gate, which omits a scope that holds a `Refused` timer (S:666-670);
  - the expected-result row "stays Refused until the reload" (S:570);
  - the planted fault `refused-not-retried-at-wake` (S:594).

  T already relies on A (T:715). This is mechanical, but to-spec would copy B.

**Turn (T)**

- **T1. The model covers only part of the final text.** The lead's model was overwritten. The re-run is a new,
  smaller model (section 2). Not modelled: the mailbox, props, emits, alarms, indexes and the holders of 6.5,
  so I5, I7, I9, I12, I13 and I15 to I17 are unchecked.

**Records (R)**

- **R1. A throw in one memory field resets the whole position, while the ledger says "per leaf".** The
  reference table gives "present, does not read" a `ResetRecord` for a memory field (R:415). That resets the
  state, all memory, timers and instances. The ledger row "A throw changes only its own check: held: per leaf"
  (R:794) says the opposite, and no trade-off is written.

  Either the rule or the ledger is wrong. The choice (reset the field to its declared initial, or reset the
  whole position) is a P7 call for the user.

**Operations (O)**

- None found that block Spec on their own; see X1 and X4.

**Types (Y)**

- **Y1. The "removed" families rest on unproven assignability.**
  - Deleting the casts at `machine.ts:125,172`, `compile-body.ts:196` and `compile-schedules.ts:241` relies on
    `AnyBody` being assignable from a body. `on` handlers were never checked (Y H2).
  - Question 1 A rests on H8: every token must still exist on a refused definition.

  Both are holes the lead itself flags as high. Until they are spiked, the families count as handled at one
  point, not removed.

**Host (H)**

- **H1. The edge table (6.4) has three holes, found by the re-run model.**
  1. *Ticket stuck behind a flying batch.* Trace: `[accept Now, accept Now, head landed]`. The second ticket
     waits, and the "head landed" cell has no ticket branch, so the ticket goes out only once `at` passes or the
     page hides (H:408, H:412). 1,577 cases.
     Fix: "a ticket waits: issue", as the refused cell already says (H:413).
  2. *Marks stranded.* Trace: `[accept Later, hidden, accept Later, shown, head refused]`. With another batch
     still flying, the marks join `again` and no timer is set. When the last head lands, the cell gives
     `Marked{at}` with no `at` (`Out.at` is an `Option`, H:194-195), so nothing arms `wake`. 153 cases at
     depth 6.
  3. *The hidden-retry flag has no home.* The "head refused" cell reads "hidden and not retried", but `Out` has
     no such field; only `Backoff.hiddenRetried` exists (H:194-196, H:413). Trace: a store that always refuses
     while hidden re-issues at once, forever. That breaks I10 (H:704).
     Fix: carry the flag in `Out`.

  All three come from lifecycle facts kept in `Option`s and booleans (`Out.waiting`, `Out.at`,
  `Waiting.marked`). The explicit-states principle forbids that, and H's ledger has no trade-off for it; it
  even claims "total tables: held".

### 1.2 Blocks build

- **X5. Saved shapes and names drift.**
  - One saved timer has two names: `SavedTimer`/`SavedScheduled` (S:385, S:770) and `TimerShape`,
    "spelled once here" (R:181, R:194).
  - T asks that "lane and owed record keys gain the subject" (T:1167-1169). R merges lanes and owed rows into
    one `work` record per identity (R question 2, open).

  Pick one name, and restate T's request against R's record (group B9).
- **X6. Emit timing.** T 6.10 delivers emits once per step, at the step's end (T:658-664). H delivers once per
  publishing slice, after the snapshot listeners (H:385, H:864). H's question 3 is open, but H's AT seam
  presents it as settled. See group B8.
- **X7. Ownership drift in the seams.**
  - RT5 is handed to O (S:789). O did not find it (O:841-842). Y answers it as an `EvidenceOf` row.
  - The `issuesOf` memo is handed to cluster 5 (S:771, S:790). H gives it back to S and T (H:880-883).
  - The `compiledOf` call site goes to 5b in Y but to Y in H (H:884).
  - The mutation generators go to 5b in Y, and H says they have no design (its hole O10).

  Each needs one owner written into both designs.
- **X8. "Freeze interrupts calls" (T:500) against "a frozen life's slots keep their holds" (O:465).** These are
  consistent only if T's "calls" means life-held write calls and not reads. T does not say which.
- **R2. A `persist` flag change has no row.**
  - P8 says no key exists for a `persist: false` machine (R:83).
  - `admit` never reads `persist` (R:598-605). `encodeStore` has no persist gate (R:615-621), although I12
    claims one (R:650).

  Trace: a build turns `persist: true` into `false`. The old record is admitted `Live`, marked dirty and
  written again. Expected: dropped and reported. Add a reference-table row and the gate in `encodeStore`.
- **O1. The lane redesign does not reach the retry guards.** Five fixtures use `O.x.retryable(key, { times })`
  and `O.x.idle(key)`:
  - `fixtures/home/machines/room.ts:93`;
  - `fixtures/shop/machines/cart.ts:142`;
  - `fixtures/transfers/machines/transfers.ts:59`;
  - `fixtures/command-palette/machines/palette.ts:168,175`;
  - sync.

  These guards read lane state that R and O restructure: one work record, and lanes keyed by subject. Neither
  design names them (0 hits for `retryable`). The code has them today (`core/turn.ts`, `tokens.ts`).
- **H2. Two shapes for an invariant's input** *(sidecar, unverified)*. Y gives `check` the input
  `{ state, memory, context }` (Y:138), while H gives it `{ snapshot }` (H:157). Y's walkthrough would not
  compile against H.

### 1.3 Minor

- **S2. Removal is overclaimed.** The `Decided` brand is "removed", yet I8 itself says a cast around it is "a
  lint error" (S:492). By the round's rule (section 3) that is handled at one point. The same applies to T's
  `Applied` brand (T:118, I4).
- **T2. One target, two answers** *(sidecar, unverified)*. A raise into a frozen plain slot refuses the turn
  (T:354, W9), but the same target as an event is `Unhandled` (T:513). There is no question for it.
- **R3. A shape change without a format bump destroys data.** Strict shapes reject an unknown field (R:325),
  and only the stamp (`RecordShapeChanged`) tells. Nothing forces a bump when format 6 gains a field.
- **O2. A read's timeout has no named ending.** "For a read it is an ordinary failure tag" (O:451), but
  `ENDINGS.failure` is `Defect, Interrupted` only (O:517).
- **O3. `besideOf` is worded two ways.** "together, one cleanup" (O:536-537) against "every reason" (O:716).
  The model confirms the combined reading. Use that wording in both places.
- **H3. `hideDrain`'s pseudo-code is broken, though the drain works.**
  - It passes `{ yield: false }`, which `input` does not take (H:652).
  - Its `finally: running = false` belongs to `run()`.
  - Each iteration also forks a stray `serve` task.

  The loop repeats `input(Serve)` until no mail is owed, so it does drain (a sidecar's "death with mail owed"
  claim is rejected).
- **H4. `final` takes a `World` but `publish` takes a `Quiescent`.** `final` passes `quiescent(world, now)`,
  which is an `Option`, and relies on a comment that no mail is owed (H:676).
- **Y2. About 15 new cached fields are added unmeasured** (Y 10.2-10.3), against "cache only when measured"
  (`AGENTS.md`). Y's ledger also says "same rule at every scope: held" while fragments and instances are its H3.

### 1.4 Principle ledger: breaks without a written trade-off

- **S:** removal claimed for brand-plus-lint families (S2).
- **T:** removal claimed for `Applied` (S2). The cost table omits `liveTargets` per raise and `readsOf(before)`
  per part *(sidecar, unverified)*.
- **R:** a throw changes only its own check (R1). P2 traded for format 5 Held heads, which are told again under
  question 9 (R:363), with no ledger row. The capture costs `O(b)` over the whole work text (R:741), and there is
  no cheap-operations row.
- **O:** cheap operations are claimed "held" (O:821), but invalidate by partial key is `O(entries of a
  contract)` and `issuesOf` scans every row on each publish (O:751-752) *(sidecar, unverified)*. P9 (every Cause
  kept) is traded by `Cause.combine`'s de-duplication (O:553) with no row.
- **Y:** caching before measuring, and the scope claim (Y2).
- **H:** explicit states (H1). Total tables are claimed "held" (H1 shows otherwise). The ring-index inbox and
  timestamp timers sit beside Effect's `Queue` and `Schedule`. That is defensible for a synchronous driver, but
  unwritten.

### 1.5 Requirements with no mechanism

Each has 0 hits across the six designs. The requirement sources were checked by keyword plus targeted reads.
None of these is a cluster of this round, so each is a scope call for the user.

- Streams and bookmarks (@plan.Operations O4). O admits it as H5.
- Server rendering (@plan.ServerRendering O1 to O7; @plan.LazyFeatures O4).
- Story frames, `StoryFrame` and playback (@plan.Testing O4, O9).
- Redaction and digests (@plan.Inspection O5).
- Context propagation (@plan.Runtime O5) *(sidecar, unverified)*.
- The reach flags `cancelsAcknowledging` and `retainsUnknown`, which appear in 12 fixture files.
- The retry guards (O1 above).

Context slots and `C.slot.change` are covered at the callback-input level (T:177-178). The one-provider rule was
not checked.

Case-study lessons: the schedules, records and types lessons each map to a named mechanism (S 4.1, 6.5-6.8,
9.2-9.3; R 4.1, 4.4, 6.5, 8, 9; Y 5.1-5.8, 9.2, 10.1). Lesson 2.6.6, "weigh cutting scope", has no mechanism in
any design.

## 2. Model results

The scripts are in the session scratchpad, under `final-models/c2` to `c5b`. Each control (a deliberately wrong
rule) fails where it should.

- **Cluster 2, turn H1: passes, on a new and smaller model.** The lead's `model.mjs` was overwritten by
  cluster 4.
  - Encoded: W2 to W6, W10, the 6.3 table, End with `HostEnded` running no callback, R0 and the rounds, and
    section 7.
  - Run: depth 4, about 330,000 applications over 20 atoms with reload. I1, I2, I3, I6, I8, I10, I11 and I14
    pass. Four controls fail as expected.
  - Ambiguity: W3 compares sites, not moves. Under the sites reading, a source and an abandoned callback both
    moving to PREV are refused. Under the moves reading, none of the 312 cases are refused. T must say which.
- **Cluster 3, records H13: passes; the 6 P2 failures were a model bug.** The second-run model placed a carried
  row by index, and the row fell off the end of the list. With `Place.Row{after}` as written (R:249), P2 passes
  579 of 579.
  - Run: 600 worlds, about 210,000 cases. I1 to I4, I4c, I5a, I6, I7, I11 and the wake rule pass.
  - Known failures remain: I5b (10 cases, a field's declared initial made unreadable) and `nothingLost`
    (2 cases, R:499-500).
  - Ambiguity: "that entry stays in displaced, Carried" (R:430) is finer than any `Place`. Both readings give
    the same results.
- **Cluster 4, operations H1: the last `besideOf` fix passes.** 992 `failureOf` combinations agree with the
  table, and I13, I15 and I17 pass. The reads model (I1 to I12, 20,000 runs) and the steps model pass. Only
  `besideOf` was diffed against the final text, not 6.2 to 6.4 line by line.
- **Cluster 5b, host O8: T1 and T2 pass; T3 fails three ways (H1 above).**
  - T1: 16,105 sequences with hide and wake. P1 to P7 pass, and the new capture check passes. Earlier P5 and
    P5b failures were a counting artefact.
  - T2: 236,000 cases with matched `Expect{rule, step?, actor?, where?}`. I13 to I16 and the shrink key pass.
    By the text, a rule-only `expectBroken` on a rule that breaks twice fails the Story (450 cases); see
    host question 12 in pile (c). Two Expects on one rule can take the same breach. The text must say whether a
    breach is consumed.

## 3. Question triage

There are 68 open questions: turn 13, records 12, operations 19, types 11, host 13. Schedules' nine are answered.
This section is a sorted proposal. Nothing here is settled or tagged.

### 3.1 Pile (a): correctness calls (29)

Where a model or a traced cell decides the question, the result is given. "Read" means the recommendation is
consistent with the design's own rows, but this review did not trace it (section 7).

- Turn:
  - Q1, rounds in one turn: **holds** (c2 model, I11).
  - Q2, one site per key: **holds** (I6).
  - Q5, `whenAbandoned` only inside a turn: **holds** (I8; its `HostEnded` control fails as expected).
  - Q3, Q6, Q7, Q9, Q11, Q12: read.
- Records:
  - Q5, an unreadable obligation is carried: **holds** (c3 P2 with `Place.Row{after}`).
  - Q4, Q7, Q11, Q12: read.
- Operations:
  - Q3, one position: **holds**. "Behind" is derived (O:304), so a Written value makes a running request
    behind, and it never lands over the write.
  - Q15, written data is fresh: **holds** by the same trace. A sidecar's "waiter hangs" claim was rejected.
  - Q5, Q7, Q8, Q12, Q13, Q19: read. Q12 duplicates R's H6 but stays here as a correctness call.
- Host:
  - Q1, publish only a slice with no mail owed: **holds** (T1 P1 to P7).
  - Q10, the quiet capture: **holds** (T1 capture check).
  - Q7, a Later mark waits during backoff, except once when hidden: **fails** as written, because the flag has
    no home in `Out` (H1.3). Fix: carry `hiddenRetried` in `Out`.
  - Q11, the hide issues behind a flying batch: **fails** on H1.1 and H1.2. Fix: add the two cells.
  - Q4, Q5, Q13: read.

### 3.2 Pile (b): duplicates and conflicts (13 questions, 11 groups)

Each group has one proposed answer.

- **B1. Context after Wake: T Q13 against S Q4 (answered).** T drops the "differs" test (T:595).
  Proposed: S's answered rule stands, and T 6.12 is edited to match. Put T's trace to the user as an overturn
  only if it shows a wrong ending.
- **B2. A bad delay at an instance's creation: T Q8 against S Q5 (answered).** There is no real conflict. S Q5
  covers a turn's own arm, and T Q8 covers an instance's creation. Proposed: adopt T Q8 A as a scoped extension,
  and add one line to S 6.3.
- **B3. Key codecs: T Q4 (a reset value is a string or a number) against S Q1 (answered; `restartOn` may be
  `Schema.Date`).** Proposed: one rule. Every value used as a key is encoded by its declared Schema, then made
  canonical text (`selectionCodec`, S:773). Drop T Q4's type limit.
- **B4. A throwing user read: S Q3, O Q18 and T H3 (X4).** Proposed: one family rule. The read's field is
  `Failed` with its issue, nothing acts on it, and the next occasion reads again. O Q18 A is that rule for rows,
  S Q3 is it for baselines, and T H3 is rewritten from "last value" to the same rule.
- **B5. `Compiled` holds the saved and schedule codecs: R Q8 = Y Q8.** Proposed: A, asked once. Y 5.2 already
  calls it "granted" (Y:376) while its own question is open; fix that.
- **B6. A final answer replaces an unheard unknown: R Q3 = O Q14.** Proposed: accept once, in R 6.6. O cites it.
- **B7. Where rules are switched on: Y Q5 (no `enabled`; the Runtime setup chooses) against H Q2 (one rules
  module, imported by the config and `Story.app`).** These fit together. Proposed: one user question covering
  both (pile (c) shape below).
- **B8. Emit timing: H Q3 against T 6.10 (X6).** Proposed: H Q3 A, once per publishing slice, after the
  snapshot listeners, so an emit never arrives before the snapshot that explains it. T 6.10 is edited to match.
- **B9. The work record: R Q2 against T's lane and owed key request (X5).** Proposed: R Q2 A. T's request
  becomes "lanes in the work record carry their subject", which R already says (R:792).
- **B10. A schedule's key as a field record: Y Q9.** S Q1's answered example already uses it. Proposed: close
  as answered by S Q1.
- **B11. A hidden page (X2).** This is not a lead question, but it decides between two designs. Proposed: H's
  rule for v1 (not a use change, so timers keep running and the drain-and-capture covers a freeze). T:722 is
  edited to match.

### 3.3 Pile (c): the user's calls (26)

Each item changes public API, scope or a Task boundary, or overturns a decision. The lead's recommendation is
marked; this review agrees unless it says otherwise.

- **Y Q1, construction returns a value (overturns SC 3.2).** Recommend A once H8 is spiked.

  ```ts
  // before: const M = machine(Def, body)   // throws FlowError at import, first finding only
  // after:  const M = machine(Def, body)   // NEW: M.construction is Built | Refused | Blocked;
  //         Runtime start or a Story raises one FlowError with every finding
  ```
- **Y Q3, the body gives the machine's type only its rule names (corrects a decided snippet).** Recommend A.

  ```ts
  // before (decided snippet): body: B & Exact<...>
  // after: the conditional is required; `const B` is inert
  ```
- **Y Q5 with H Q2, no `enabled` (overturns SC 3.4).** Recommend A, with one rules module.

  ```ts
  // before: rule({ enabled: import.meta.env.DEV, ... })
  // after:  Runtime.make({ rules: "judge" | "off" })   // NEW; Stories and the CLI always judge
  ```
- **Y Q2, `Machine<D, R>`'s default for `R`.** Recommend `never`.

  ```ts
  // before: M.rules.Typo                // RuleToken | undefined
  // after:  M.rules.Typo                // a type error
  ```
- **Y Q4, every declared pause reason needs a callback in every placement.** Recommend required.
- **Y Q6, terminals are proved by `flow check` only.** Recommend A.
- **Y Q7, source locations come from the CLI adapter.** This is a Task boundary. Recommend A, but its algorithm
  is unspiked (Y H7).
- **Y Q10, a schedule's `send` mapper takes the firing's metadata.** Recommend A.

  ```ts
  // before: send: (value, { input, key }) => ...
  // after:  send: ({ key, attempt, armedAt, dueAt, firedAt, output }) => ...   // NEW shape
  ```
- **Y Q11, the metadata's `output` stays `unknown`.** Recommend A.
- **O Q1, a read's key names every input field.** Recommend A.

  ```ts
  // before: resource({ input: { account, currency }, key: ["account"] })   // compiles; answers cross
  // after:  the same line is a type error: `key` omits `currency`
  ```
- **O Q2, no `Trigger` cue (departs @plan.Operations O2).** Recommend A.

  ```ts
  // before: refetch on focus or reconnect, built in
  // after:  a machine schedule or a host input runs O.x.refetch()
  ```
- **O Q4, a life's end and a disposal owe waiters nothing (departs RO R11).** Recommend A.
- **O Q6, `failureOf` gives one `FlowError` per crossing, with the defect in `cause` (departs
  `close.ts:282-296`).** Recommend A.
- **O Q9, a write's timeout is unknown and a type error.** Accept, but name the read's ending too (O2).
- **O Q10, ET PD1 and PD4.** Accept as proposed.
- **O Q11, a made value's internals live under a second registered symbol.** Confirm.
- **O Q16, a persisted write declares its output and error Schemas.** Recommend A.

  ```ts
  // before: transaction({ commit })                      // an unsaveable ending reloads as unknown
  // after:  transaction({ commit, output, error })       // required when the app persists
  ```
- **O Q17, a delayed retry is a machine schedule; drop RO 3.5's `Schedule.exponential` example.** Scope.
  Recommend A.
- **R Q1, the fault model leaves forged-but-valid records out of scope.** Recommend A, and state the caveat in
  P2.
- **R Q6, an orphan record is kept, not discarded (departs DL PD5).** Recommend A.
- **R Q9, one format step from 5 to 6, and a format 5 hold is told once.** This is a Task boundary. Recommend A,
  with a ledger row for the P2 trade.
- **R Q10, SR D2 to D4.** Adopt as SR proposed.
- **H Q6, `propertyTest` runs every seed and rejects after the last.** Recommend A.
- **H Q8, the verdict is a four-fact record, not the first match.** Recommend A.
- **H Q12, `expectBroken` matches rule, step, actor and where.** Recommend A, plus one rule the text lacks: a
  matched Expect consumes one breach. Add `times?` only if a fixture needs a rule that breaks twice (the model's
  450 cases).

  ```ts
  // before: expectBroken: ["NoLostWrite"]
  // after:  expectBroken: [{ rule: "NoLostWrite", step: 3 }]   // NEW fields step?, actor?, where?
  ```
- **H Q9, UH PD4 and PD5 stand.** Accept.
- **T Q10, `Published` carries the incarnation and `why` has `End`.** Public face. Recommend A, with H Q4.

The user also decides on R1 (a field or the whole position), B11 (hidden page) and section 1.5 (scope).

## 4. Counts

- **Casts.** `git grep -c "disable.*no-unsafe-type-assertion"` over `packages/flow-state-v3/src` gives 41.
  Three are in test files:
  - `core/boundary.test.ts:15`;
  - `host/cleanups.test.ts:453`;
  - `host/runtime.test.ts:401`.

  That leaves 38 in production source, which matches Y. Y should say it counts production files only.
- **`chainOf`.** Y says 20 call sites *(sidecar)*. The grep finds 28 occurrences in `src`, 8 of them in
  `tree.ts`. Recount before Y's fit table becomes a Task list.
- **Questions.** The brief says about 68; there are exactly 68 open, plus 9 answered in S. Open holes: T 9,
  R 14, O 11, Y 9, H 12.

## 5. Unchecked

The 60-minute cap cut these:

- The pile (a) items marked "read": no trace or model run of their recommendations.
- The *(sidecar, unverified)* findings: T2, H2, and the T, O and context-propagation ledger notes.
- O 6.2 to 6.4 line by line against the operations model. Only `besideOf` was re-diffed.
- The turn model's missing invariants: I5, I7, I9, I12, I13, I15 to I17.
- R's `Fate` against H's fate words. H's reload taken as a crash (its hole O3).
- A fragment or instance index for Y. Its H3 is not designed.
- A denied or unhandled firing advancing the series with no issue (S:302-303, S:328), raised by a sidecar.

## 6. Verification log

- **Accepted:**
  - S1 (S:292, S:490, S:668 read).
  - X1 (T:152, T:797, O:250, O:464 read).
  - X2 (T:722, H:867).
  - X3 (T:766-772, T:698, T:712).
  - X5 to X7.
  - R1 (R:415, R:794).
  - R2 (R:598-621).
  - O1 (fixture grep).
  - H1 (the model, and H:194-196, H:404-416).
  - The cast count.
  - The requirement gaps (grep counts).
- **Changed:**
  - The records sidecar's "a same-format field destroys data" became minor R3: the stamp exists, and a future
    shape change should bump the format.
  - "Freeze contradiction" became X8: an ambiguity, not a contradiction.
  - The host sidecar's "drain cannot finish" became H3: the drain loops, and the pseudo-code is broken.
  - "Context slots have no mechanism" was narrowed: T:177-178 covers them.
- **Rejected:**
  - "A restored frozen instance has no route to its schedules": T:1167-1168 puts AS's saved schedules in the
    instance partition, and S:392 files them under the new activation.
  - "A Written value on a Running-behind entry hangs its waiter": "behind" is derived (O:304), and Written owes
    every waiter.
  - "`Entry.last` is not saved": the issue belongs to an incarnation's slot, and the reload re-derives it by
    asking again.
  - "A row's refusal does not survive reload": a Kept row takes its one try at restore (T:498), which re-derives
    the refusal.
  - "`final` throws twice at stop": the stop path uses `finalFromMemo` (H:657-659).
