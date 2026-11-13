# Lane oracle convergence: adversarial review (2026-11-11)

**Verdict: revise once before building. The direction is right, but the design is not yet correct or minimal.** It
gives each Attempt and each ending one closed life, derives the lane, puts members on `Turn`, has `Issue` name its
ending and checks `Minted` at the boundary. Keep all of that. Four things block building it as written:

- **Obligations stored as phases.** Queued Attempts enter phases the derived view counts as addressable, so the
  table itself breaks WriteLanes I9 and I11.
- **Legal behaviour refused.** At least six cells refuse behaviour the Specs allow, and round-14 shows some of it.
- **The tables are not total and not two-dimensional.** Many cells depend on data that no move or phase carries,
  and the cell-mutation gate cannot pass as specified.
- **Port change 2 breaks the adapter's actor attribution.** Under change 5, every `Minted` then becomes a `Defect`.

None of these needs a new direction. One revision under skill:policy-convergence step 7 can fix all of them.

Reviewed: the proposal (P), the four reviews it answers, @spec.WriteLanes (WL), @spec.Actors, @spec.Restore,
@spec.Conformance, `conformance/port.ts`, the current oracles and round-14. Four Haiku sidecars (effort high) ran in
parallel: (a) WriteLanes, (b) Actors and disposal, (c) minimality, (d) the Port against round-14. I checked every
finding used here against the source myself. The sidecar log at the end records what I accepted, changed or
rejected. P line numbers are `P:n`.

## Findings that should change the design, ranked

### H1. Obligations are stored as phases, so the table breaks I9 and I11

The phase variant mixes two separate facts: where an Attempt is (head or queued) and what it awaits (a `Released`,
a cancel's ending). Three defects follow:

- **A queued Attempt becomes "addressable".** Under `latest`, "a previous `Queued` → `Leaving { Superseded }`"
  (P:298). Under cancelAll, each `Queued` becomes `Cancelling { storage: false }` (P:308). Both `Leaving` and
  `Cancelling` are in the addressable set (P:245-246). The derived lane then has two or more addressable Attempts,
  which breaks WL I9 ("at most one addressable Attempt").
- **A superseded queued Attempt promotes while the head is on the wire.** `Leaving` plus its evidence goes to
  `Gone ⇒ promote` (P:373). Take `latest` with the head `OnWire` and W = [Q1]. A commit C2 supersedes Q1, Q1 leaves,
  and promote makes C2 `Waiting` beside a live head. WL I11: "promoted only when the addressable Attempt is resolved
  or released". The table produces this violation on a correct runtime.
- **A pending cancel is lost to a replacement.** Under the `cancel` policy, the head goes to `Gone { Replaced }`
  whatever its phase (P:302), and that includes `Cancelling` and `Interrupting`. WL R14: "A pending cancel is never
  lost to a later replacement." Only `latest` is exempted (P:300).

Two smaller defects come from the same mix:

- `Leaving` + `TurnCloses` "goes back to the phase it had before the cell" (P:375), but `Leaving { evidence }`
  stores no earlier phase (P:184).
- For `OnWire` + a not-retained unknown → `Leaving` (P:340), going back to `OnWire` would revive a call the runtime
  already ended. The truthful fallback there is `Held`.

The simplicity review this proposal answers already set the rule. Principle 2 says "obligations that overlap phases
are separate values", and S2 kept `CancelPending` separate "since it can coexist with `Replaced`"
(`suite-simplicity-review-2026-11-10.md`). The proposal folded those obligations back into phases.

**Change:**

- Keep the phase about progress only, and derive the position: the head is the first addressable Attempt in mint
  order.
- A queued Attempt leaves W directly in the turn that ends it. Its `Superseded` evidence and `NotSent { Cancelled }`
  come in that turn (WL R7, I21).
- "This turn must show `Released` or `Superseded` for Attempt X" and "a cancel is pending on X" become turn-scoped
  obligation values beside the phase. The phase stays at its last anchored state until the evidence arrives, so
  nothing needs to go back.
- Promote only when the head leaves.

This also removes `Leaving` and the queued use of `Cancelling`.

### H2. Six or more cells refuse behaviour the Specs allow

Each item below is a false violation on a correct runtime. All were checked against the Spec text.

1. **Retry on an InFlight head is refused.**
   - Spec: WL R8, "on InFlight it is evidence InFlight".
   - Table: `Waiting`, `Cancelling`, `Interrupting` and `Leaving` have no `Retry` row and refuse I1, I20, I20 and I12
     (P:321, P:328, P:360, P:376).
   - Only `OnWire` and `Resending` admit it (P:333, P:343).
2. **A re-send whose capture is refused is refused.**
   - Spec: WL I15 lists "a re-send whose lane-record capture is refused adds a second ending … unknown {
     StorageRefused }" as an exception.
   - Table: `Resending` refuses every other move with I12 (P:336).
   - Round-14 emits this ending (`prototypes/round-14/lane.ts:508-513`, `refuseResend`).
3. **The bound's ending of a cancelled wire call is refused.**
   - Spec: Actors R22, "past the bound an Attempt on the wire ends unknown { Disposed }".
   - Table: `Interrupting` admits only `unknown { Cancelled }` and refuses any other `End` with I20 (P:352-353).
   - I35's window watches `OnWire` only (P:477-479), so a cancelled call at the disposal's start is outside I35 too.
4. **`unknown { Restored }` on a return is refused.**
   - Spec, three places:
     - WL I15: "once again after each reload or return".
     - Actors R10: "each Held head's unknown { Restored } once per incarnation".
     - Restore I6: "exactly once per incarnation".
   - A Held head is not work in flight (Actors R7), so a persisted actor ends at its grace with the lane unbound
     (R8), and an ensure brings it back (R9).
   - Table: P:365-366 admits `Restored` only "between a `Reload` and its `BootSettles`". Any other `End` is I16
     (P:370).
   - Root: the moves have no grace end and no return. `Record.Unbound` is set only by `disposeActor` or `forget`
     (P:225-228), so a lane unbound at its grace end is not modelled at all.
5. **A kept ending's boot try is refused.**
   - Table: `Kept` → `KeptOpen` on "the actor's first incarnation" (P:438), but no move in `resolve` (P:259-277)
     produces that, so `Kept` + `Delivered` refuses Actors I24 (P:441).
   - Same root as item 4.
6. **`Released` of a replaced Attempt may be refused.**
   - Spec: WL R4 says a not-retained unknown "under the cancel concurrency policy once its own ending's turn ends"
     is released, "and the store hears Released".
   - Table: `Gone { Replaced }` + `Evidence Released` is refused with I12 (P:395).
   - Confirm with a trace against round-14. If round-14 releases, the cell is wrong.
7. **A cancelled never-sent head at disposal.**
   - Table: `Cancelling` + `DisposalStarts` stays (P:327). `RuntimeDisposed` then falls into "otherwise Refuse
     I20" (P:328).
   - Spec: Actors R22 treats a never-sent commit as `NotSent { Disposed }` and says nothing for a cancelled one. The
     proposal itself already sends a `Waiting` head (not only a queued one) to `Flushing` (P:319).
   - Reading: `Cancelling` should flush too.

**Change:**

- Add each missing row, each with a trace that cites its rule.
- Add the actor-life moves `GraceEnds` (unbinds the actor's lanes, Actors R8) and `Returns` (a new incarnation,
  Actors R9). Make `Restored` allowed once per *incarnation*, derived from `endings` by incarnation rather than by
  `boot`, and open `KeptOpen` on `Returns` or `Adopt`.
- `Record.Unbound` gains `by: "grace"`.

### H3. The tables are neither total nor two-dimensional, and their guards are out of reach of the defences

P:46 and P:280-281 claim "one total `(phase, move)` table". Neither half holds.

- **Not total:**
  - `Flushing` and `Gone` end "otherwise stays" (P:381, P:396), against the "otherwise Refuse" rule.
  - The ending table has no default at all.
  - `Orphaned` has no row (P:209, P:418).
  - `Unparked` is listed as a move (P:275) but has no cell. Today's oracle refuses one that was never parked
    (`write-lanes/delivered-once.ts:225-240`).
  - `Parked`, `Delivering`, `Refused`, `Kept` and `KeptOpen` have no `Reload`, `DisposalStarts` or `Adopt` row.
- **Lane moves sit outside the table:**
  - `Commit`, `CancelAll` and promote act on several Attempts, depending on the head's phase, W and the policy
    (P:292-302).
  - The per-phase lists do not carry them. `Waiting` and `Queued` have no supersede row and refuse it (P:321, P:312).
  - `Held`, `Cancelling` and `Interrupting` have no row for a `cancel`-policy commit.
- **Cells read data that no move or phase carries:**
  - Retention: P:340's "not retained" needs bare, ignored or cancel-policy, but `End { channel, reason }` (P:268)
    carries none of them.
  - Whether a storage write is pending: `Waiting` + `Cancel` always sets `storage: true` (P:315), but WL R14 waits
    for storage only "while a never-sent Attempt's acknowledgement is being written".
  - Whether the move came from cancelAll: "but not under `CancelAll`" (P:323, P:373) has no field to read.
  - Other cell inputs: `mode` (P:338, P:349), endings by `boot` (P:365), the `Unstoppable` fact (P:354), the
    reference's evidence declarations (P:405) and the policy.
- **Consequence:**
  - The cell-mutation defence (P:95-98) mutates only the data cells.
  - Every guard in `resolve` and `advance` is code it never touches, and most of the defects in H1 and H2 sit in
    guards or in lane-level rules.

**Change:**

- State the table's real key: `(phase, move, guard inputs)`, with each guard input named on the move.
- Write the lane-level rules as a second table keyed by (head phase, policy, W).
- Give both tables an explicit default.
- Have the mutation test enumerate guard outcomes too, or name each guard as untested, with its trace.

### H4. Separate folds give no common-mode independence, and the mutation gate cannot pass

- **Separate folds are one fold.**
  - Each oracle runs the same pure `advance` over the same facts (P:79-83), so the three models are equal at every
    step.
  - A wrong `To` cell is wrong in all three at once. The proposal's Risk 1 concedes the table's definition is still
    common mode (P:750-752).
  - What separate folds really buy: an unchanged `Judge` contract (P:84), at three times the folding.
  - The refused-move rule (P:88-91) is what stops T7 M1's cross-blinding, and it works just as well with one fold.
  - The simplicity review's warning was "share the pattern, not the state: one shared Attempt model would make the
    oracles fail together". Sharing the transition table *is* sharing the model. The proposal overrides that warning
    rather than meeting it.
  - Overriding it is defensible, given T7 M5's threshold of four hand-rolled models, but it should be said plainly.
- **The gate "every cell mutation is killed" (P:729-731) is unreachable as specified.** Several cells have
  equivalent mutants that no trace can kill:
  - `Ignore { judgedBy }` behaves exactly like `To { same phase, keep }` (P:241, P:320), and nothing reads `judgedBy`
    (P:106 checks only `Refuse`).
  - `Gone { Released }`, `{ NotSent }`, `{ Unborn }` and `{ Resolved { inDisposal: false } }` are treated
    identically by every cell: "any other End → I16" and "`Evidence Released` → I12" (P:393-396). Swapping one for
    another changes nothing.
  - `Delivering { again }` and `Delivering { kept }` have identical rows (P:428-432).
  - `Recorded.why` is read by no cell.
- **Change:**
  - Say plainly that common mode is accepted and paid for by the traces, the mutation test, the independent judges
    and the runtime mutants.
  - Then do one of two things, and log the choice:
    - (a) fold once per Case, which is the S1 step-fold contract the simplicity review proposed;
    - (b) keep separate folds and justify them by contract stability alone.
  - Either way, collapse the distinctions no cell or oracle reads, or name the oracle view that reads each one, so
    every remaining mutant can be killed.
  - Drop the separate reach check (P:93-94): a cell that no trace reaches cannot be killed, so the mutation check
    already implies it.

### H5. Port change 2 breaks the adapter's actor attribution, and change 5 then turns it into a Defect on every mint

- **The mechanism:**
  - The round-14 adapter gives each `Minted`, each decline's `Ended` and each `Delivered` the actor of the next `Turn`
    in its batch (`conformance/adapters/prototype-observations.ts:191-201`).
  - The mint note carries no actor or key (`:129-139`; `prototypes/round-14/lane.ts:272`).
  - A batch holds one turn.
  - Once `Turn` comes first (P:114-115), a turn's mints have no later `Turn`, so their actor is `None`.
- **The effect:**
  - Change 5 makes that a `Defect` (P:121-122) on every mint.
  - In migration steps 4 and 5, the old disposal oracles are still live, and they silently drop a `Minted` with
    actor `None` (`actors/disposal-ledger.ts:229`, `actors/disposal-kept.ts:131`).
  - Step 2 is not verdict-neutral as P:732-733 claims unless this is fixed first.
- **The fix is small and also closes Conformance Q3's decision 10:**
  - `CellArgs` holds `actor` and `key` at the mint (`lane.ts:178-181`), and `deliver()` has the actor in scope
    (`turn.ts:1202-1206`).
  - So the mint and delivered notes, and a decline's ending, carry `actor` (and the mint also carries `key`, `None`
    when unkeyed), and attribution goes.
  - Do this in step 2, before the reorder.
- **Two corrections to P:127-132:**
  - `world.ts`'s `byAttempt` does not hold the key at mint time: `setLane` writes it after the mint note
    (`world.ts:425-430`). The key comes from `CellArgs`.
  - Risk 3 (P:756-758) names the wrong danger. No conformance find string sits in the moved region. The neighbour
    `tx.touchedActors.add(w.a.key)` at `turn.ts:985` stays unique. The danger is attribution.

### M1. `Turn.members` cannot express three things round-14 does

- **Release on leave.**
  - Round-14 applies rule-60 release cells after every member (`turn.ts:779-784`), and they are not alt members.
  - WL R16 and I12 make release a way out of Held, and P:405 and Q3b use "a releasing lane".
  - Neither the table nor `MemberKind` has a release.
  - Change: add a `release` kind and move now, even with no cells beyond a stated limit, so the table stays total
    when the fragment fixtures arrive.
- **A key-less cancel outside an ending fans out.**
  - It lets go every kept ending of the operation (`turn.ts:752-757`).
  - `key: None` would then mean both "unkeyed operation" and "every lane of the operation".
  - Change: give `Member` a lane target, with one value for an unkeyed operation's single lane, one for a key, and
    one for every lane of the operation.
- **A refusal that is not an operation's ending.**
  - A refused schedule firing (`turn.ts:1271-1296`) and a module delivery (`world.ts:152-159`) have no operation.
  - `Issue.ending` must be `None` for them, and P should say so.
  - Module deliveries never report `Delivered` (`turn.ts:1320-1340`). Change 4 must include them or exclude them by
    name.

Smaller points on the Port:

- Change 4's "a kept ending's try is reported too" is already true (`turn.ts:1206`, `|| item.kept`). Only the
  ordinary redelivery is new.
- Round-14's own mutant `d123.delivered-silent-at-boot` (`mutants-r9b.ts:45`) anchors on the guard that change 4
  removes, so it needs a new anchor.
- Keys of key-less members are resolved inside the member loop (`turn.ts:760-778`). A `Turn` note placed before
  `applyMembers` (the right place, `turn.ts:954`) can still name them, because a key-less member in an ending names
  its own Attempt's lane, which is fixed. That is small, but not the "notes it already writes" P:127 claims.

### M2. Disposal and delivery checks narrowed or changed without being declared

Each item was checked against the current code.

- **Delivery during disposal.**
  - Today, any `Delivered` after the disposal starts is I15 (`delivered-once.ts:264-269`).
  - P guards only `OwedAtDisposal` (P:420). `Parked`, `Refused`, `Kept` and `KeptOpen` deliveries during disposal
    are unjudged.
  - P:681 says "the disposal park rule" is kept.
- **An ending decided during disposal, then a reload.**
  - Today it becomes `Parked` at the reload (`ending-lives.ts:131`).
  - P has no `Reload` row for `OwedAtDisposal`, so a later boot's legitimate delivery of it is refused I15 (P:420).
- **`Refused` + `Reload`.**
  - P makes it `Kept` (P:436). Today it is dropped (`ending-lives.ts:133`).
  - That may be right, but it is a verdict change missing from the drop list.
- **`UnmappedEnding` → `Kept` "as today" (P:430).**
  - Today the ending is cleared, with no key blocked and no boot try (`delivered-once.ts:271-277`, `:323-324`).
  - P adds both, so this is a change, not "as today".
- **I35:**
  - The window does not cover `Interrupting` (H2 item 3).
  - P:477-479 does not state the violations the current oracle makes:
    - leaving `OnWire` before the call settles or the bound passes (`disposal.ts:216-227`, the
      `o6.dispose-interrupts-wire` mutant);
    - an `End` that does not match `endingOf(answer)` (`:229-239`);
    - past the bound, an `End` other than `unknown { Disposed }` (`:244-250`);
    - `RuntimeDisposed` before the bound while a call is open (`:252-258`).
  - Only `RuntimeDisposed` with `Flushing` has a cell (P:380).
- **The I29 and I32 adoption check (P:471-473).**
  - It requires every non-Idle Attempt to show a `Restored` or a delivered parked ending.
  - `Waiting`, `Queued`, `Cancelling`, `Resending` and `OnWire` can show neither. Today's oracle limits the check
    to Held or answered heads (`disposal-kept.ts:163-168`).
  - T6 L11 is also still open and missing from the mapping: a lane whose call settled while unbound has no
    adoption-time duty, since its parked ending "still parked at the case's end is not checked" (P:710).
  - I32's `HoldForgotten` exception (Actors R21) is absent.
  - The attachment gate the current check uses (`disposal.ts:145`, `attached(...)`) has no counterpart at
    `BootSettles`, so an unreached Held head would fail there.

**Change:** add these rows and conditions, and list every intended verdict change in the drop section (Conformance
R11).

### M3. Several mapped findings are not removed by this design alone

- **T7 L8:** removed only if the user answers Q5. "Its Invariant is Q5" (P:380, P:536) is not an `InvariantId`,
  and the kept mutant still expects Actors I29 (`actors/disposal.mutants.ts:47-59`). Say "pending Q5".
- **T7 L9:** `Ignore` hands it to `ending-channels`, which has no rule for it until Q4 is answered (P:621-624). The
  finding is deferred, not removed.
- **T7 M4 and S2 M4:** depend on Q1 and Q2. Mark the `Refused` → `Kept` → `KeptOpen` cells pending, as P:730 does
  for the traces.
- **Missing from the mapping:**
  - T6 L11 (see M2);
  - T6 L7, the I35 reason comparison;
  - T6 L10, `holdLast` mixing an I15 fault into I31;
  - S2 L5, two `Restored` in one incarnation and the re-send `StorageRefused`, which H2 item 2 now refuses.
- **Restore I6's lower bound.**
  - The table enforces at most one `Restored` per boot.
  - Nothing refuses a Held head that gets none: `Held` + `BootSettles` has no cell.
  - P:418-419 hands this to "the restore oracle", but none exists. Restore I6 is judged by case expectations
    (`actors/lane-keeping.scenarios.ts`, `write-lanes/ending-delivery.scenarios.ts`).

### M4. Spec questions: framing and citations

- **Q3b is mostly settled already.**
  - Actors R15: a kept ending blocks its key "until heard, cancelled, released or a local life ends".
  - WL R8: "A kept ending blocks its key until heard or let go".
  - WL I13: "holds no kept ending".
  - Only `forget` and the `Recorded { letGo }` report are new.
  - Its citations point at the wrong Spec. "R14" (P:604) is WL R14, not Actors R14 (admission bounds). "R16" (P:609)
    is WL R16. "R17: disposal drops no lane" (P:616) is WL R17 or Actors R22, not Actors R17. "R22" at P:335 and
    P:626 is Actors R22.
- **A new question is needed: is `Superseded` a promotion trigger?**
  - WL I11 promotes "only when the addressable Attempt is resolved or released".
  - A superseded never-invoked head (WL R7) is neither by name, yet the lane must promote or it stalls.
  - Recommendation: read a superseded head as resolved, and ask the user to confirm it as Q6.
- **The row-mismatch claim is not I10.**
  - WL I10 is about action order ("each to the lane state the previous one left").
  - A `Turn` whose members match no row is a different claim, closer to "the alternative that ran is the one the
    reference allows".
  - Keep I10 for order, and name the row check honestly, or drop it.
- **The question numbers collide.** P's Q1 to Q5 clash with WL's own open items Q1 and Q2. Prefix them (CQ1 …).
- **A wrong cite:** P:289 cites I20 for a cancelAll on an idle lane. It is WL I21's.

### L1. Minimality: what can merge once H1 to H4 are fixed

Removing these cuts cells and equivalent mutants (H4) and loses no check:

- `Heard`, `Recorded` and `Orphaned` are one terminal sink. Their rows are identical or missing (P:209, P:444).
- `Delivering { first | again | kept }` becomes `Delivering { retry: boolean }`, because `again` and `kept` have the
  same rows.
- The `queue` column of `To` (P:239) is never defined, and per-phase rows restate it. Drop it once H1 derives
  promotion.
- `GoneWhy` keeps three distinctions only: `Resolved { inDisposal }`, which I36 reads; evidence-ended (`Replaced`
  or `Superseded`), which the "stays with one End" cell reads; and the rest.
- `Flushing` and `OwedAtDisposal` restate `mode`, against "store facts, derive views". Keep them only if the
  revised table keys cells by phase alone. Then say so.
- P:250-251 says "nothing in the model is a counter", but `Model.boot` and `Ending.boot` are counters. Correct the
  claim, or use the incarnation.

Not worth merging (rejected sidecar suggestions):

- `Resending` into `Held { admitted }`;
- `Interrupting` into `OnWire { cancelled }`;
- `Refused` into `Owed { refused }`.

Each moves a state into a flag and saves no cell.

**Answer to "are 11 phases and 12 lives minimal?":** no, and they are not complete either. After H1, `Leaving`
goes, and so do the queued uses of `Cancelling`. After L1, about 9 phases and 8 lives remain, plus the actor-life
moves H2 adds. The table's size is set by the moves and guards, not by the count of phases.

### L2. Smaller points

- **The runtime picks between tied rows.**
  - For `VoidUnsure` (P:157), the reported members choose between retry and cancel.
  - The guard is `O.void.retryable({ times: 3 })` (`prototypes/conformance/typed/pay.ts:331-337`), which the suite
    can work out from the server log's sends of that Attempt.
  - Where a guard is computable from suite facts, the reference row should carry it, so the row is anchored rather
    than chosen by the claim (Conformance R4).
  - Add this to Risk 2.
- **Risk 6's premise is partly wrong (P:766-769).** The ledger already moves on the runtime's unknown `Ended`
  (`disposal-ledger.ts:55-75`). The real change is narrower: definite endings now move it too.
- **`LaneId` (P:173) omits the identity version and contract id that WL R6 names.** Old-version holds (WL R11, I17)
  cannot be told apart. State this as a limit.
- **The R10 evidence list at P:405-406 is incomplete.** It omits a declined retry, a released lookup and a
  fragment's lookup. Cite R10 and I15 rather than restating the list.

## The five named risks, judged

1. **Common mode:** understated. Separate folds add no independence, and the mutation gate has equivalent mutants
   (H4).
2. **Member keys are claims:** valid. Extend it to tied-row selection, which can be anchored for `retryable`
   guards (L2).
3. **The reorder moves find strings:** the wrong risk. None moves. The real break is attribution (H5).
4. **`Restoring` → `Unborn`:** valid, as stated. Add that `Held` + `BootSettles` with no `Restored` is unjudged
   (M3).
5. **Readings to confirm:**
   - `Resending` + `DisposalStarts` → `Held` is supported in substance: Actors R22 says "nothing new is invoked",
     and WL I12 limits how a lane leaves Held.
   - `Cancelling` + `DisposalStarts` stays is not supported (H2 item 7).
   - The `KeptOpen` timing is open. Actors R15 and I24 set a count, not a step. It needs the `Returns` move (H2) and
     a user reading.

Also: "`disposal` now trusts `Ended`" is partly mistaken (L2).

## Each Port change, judged

Round-14 can meet all five. What each needs:

1. **`Turn.members`:** members are known before any cell runs (`turn.ts:667`). P must add a `release` kind and a
   lane target for fan-out, and filter out `lookup` and `module`.
2. **`Turn` before its members' reports:** move one block above `applyMembers` (`turn.ts:954`). The notes must
   carry `actor`, attribution goes, and this lands before step 4 (H5).
3. **`Issue.ending`:** the refused `item` is in hand at `turn.ts:1276`. It is `None` for firings and module mail,
   and the field must be plumbed through `prototype.ts:85` and `:361` and `port.ts:172`.
4. **`Delivered` on every admission:** one guard (`turn.ts:1206`). Re-anchor `mutants-r9b.ts:45`, and decide on
   module deliveries.
5. **`Minted` decoded at the boundary:** `CellArgs` has both fields (`lane.ts:178-181`). The mint note carries
   `actor` and `key`, and the `byAttempt` cite is corrected.

## Sidecar log

Each result was checked against the source before use. Ids are the sidecars' own.

**(a) WriteLanes:**

- Accepted:
  - 1, 8, 11 (folded into H1);
  - 10, 13 (H2);
  - 2, 4, 6, 19, 20, 24, 15 (H3);
  - 5 (H2 item 6, as needing confirmation);
  - 3 (M4, Q6);
  - 26 (M4, reworded: lane-queue's claim of I10 is new, but the row check is not I10's content);
  - 27, 32 (M4);
  - 17, 21 (L2);
  - 23, 29 (M3 and Risks).
- Changed:
  - 12: release folded into M1 as a Port and move gap, since P declares fragment releases a kept limit (P:712);
  - 7: a `cancel`-policy commit on a Held head, kept as part of H3's missing lane rows;
  - 28: Q5 as an Invariant, merged into M3.
- Rejected:
  - 25: the other WL Invariants have other judges or `not-yet.ts` rows, and Requirement 11 is scoped to the
    lifecycle oracles;
  - 22: P already marks Q1 cells pending (P:730);
  - 30: WL I20 makes the cancel's result independent of timing, so `Interrupting` refusing a server answer is right;
  - 31: the timing of "in this turn" follows from the cancel being in the turn (WL R14), and is low value;
  - 14, 16, 18: true, but low value. Each is a stated-limit candidate, not a design change.

**(b) Actors and disposal:**

- Accepted:
  - 1, 2, 3, 28 (H2);
  - 16 (H2 item 7);
  - 5, 6, 7, 8, 18, 19, 20, 21, 23, 24 (M2);
  - 22 (H3);
  - 14 (M3);
  - 29 (M4);
  - 31 (L2);
  - 4 (Risks).
- Changed:
  - 17: the mode-dependent `Send` cells, folded into H3's guard inputs;
  - 11: the I36 row read; P keeps it (P:687), so only the wording of P:480 is incomplete (low).
- Rejected:
  - 13: each oracle folds the full model, so `delivered-once` sees Attempt-table I16 refusals;
  - 15: a re-send's definite failure is judged by I3 (`ending-channels`), and P's channel-level cells are right;
  - 12: a label change only, closer to the Spec text;
  - 27: a late `End` past the bound is rightly I16;
  - 9, 10, 25, 26: true, but outside this design's scope or already stated limits. Noted for the revision as stated
    limits.

**(c) Minimality:**

- Accepted:
  - 1, 2, 4, 9, 19, 20 (L1, H4);
  - 18, 22 (H4);
  - 12 (H1);
  - 7, 8 (M2, H3);
  - 14, 15, 28, 29 (L1);
  - 27 (L2);
  - 3 (as a question in L1's revision: `Evidence` has no step-end row, confirm it against I15);
  - 21 and 30 as estimates only. P's ~1,400 is production code. With traces, the total is about 1,800, a 36% cut.
- Rejected:
  - 5, 6, 11, 16: a phase moved into a flag saves no cell;
  - 10: "has one End" is derivable from `endings`, which P already uses this way (P:251);
  - 13: Restore R3 says an Attempt "acknowledged once ends unknown { Restored } even if … never invoked", so
    `Restoring { head }` → `Held` is right;
  - 17, 24, 25: small, and left to the builder.

**(d) Port against round-14:**

- Accepted: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 18, 19, 20, 22, 23, 25, 26, 27, 28, 29, 32 (H5, M1 and the
  Port table).
- Changed:
  - 21: `delivered-once`'s rework under change 4 is expected (P:739), so it is not a finding;
  - 4: key-less keys in an ending are fixed by the Attempt, so they can be resolved early (M1).
- Rejected:
  - 31: the name collision with the "Defect" reason is cosmetic;
  - 33: a round-14 mutant already unapplied predates this design.

## Not checked

- No gate, test or mutant was run. All findings come from reading.
- The proposed traces do not exist yet. Read them against the Spec in the revision's review, as P:751-752 asks.
- I did not read `lane-queue.ts` and `ending-channels.ts` in full; I read only the lines cited.
