# Lifecycle module review (2026-11-11, `cc0763b3..3d03715c`)

**Verdict: the tables can be built on. `step` needs two fixes before `lane-queue` reads it.** Tables A, B and C
match the v2 design cell for cell, and they are total by type. Where they differ from the Spec, the cell is either
marked pending on a CQ or is one of the three Mediums below.

The two Highs are in `step`'s anchoring and deadline code, which the mutation gate does not cover:

- a `release` member is taken on any turn without any reference check, so one claim quiets a Held lane;
- an obligation due "by TurnCloses" falls due at whichever turn is open. The same correct facts pass when split over
  two steps and fail with WriteLanes I12 when they arrive in one.

Both were reproduced on a `git archive 3d03715c` copy (probes below). Fix them in step 4, together with F3, before
the sweep diff.

Gates on the archive copy:

- `vp test` on `dsl/` and `fixtures/rows.test.ts`: 19/19;
- `vp check` on the package: zero errors and warnings;
- `effect-tsgo`: exit 0;
- the suite was not re-run, because no oracle reads the module yet.

## Findings, ranked

Paths are under `packages/flow-state-v3/conformance/` at `3d03715c`.

### H1: a `release` member is anchored on any turn (RC1, an unanchored claim)

- **Where:** `dsl/lifecycle-step.ts:188-202`.
  - `lane` drops releases before matching, and `lane.length === 0 ||` matches a turn with no write member without
    any row.
  - Every reported member is then anchored, releases included, whether or not a row matched.
  - `fixtures/reference.ts:66-71` types rows so that "a release is never in a row".
  - Table B's `Release` → `Mark` (`dsl/lifecycle-rules.ts:271`) adds the lane to `releasing`.
  - `awaited` (`dsl/lifecycle.ts:151-155`) then admits a `Released` of its Held head, and `evidenceOnly`
    (`dsl/lifecycle.ts:226-228`) makes the lane's later endings `Evidence`.
- **Rule broken:**
  - WriteLanes R16 (a release comes only from a key-less cancel in `whenAbandoned`) and I12;
  - the design's matching rule (v2, "Matching": members equal the row's "by operation and kind");
  - its RC1 rule: a report alone anchors nothing.
- **Probe:**
  - A Held `void` lane, then `Turn(Anything, LEFT→LEFT, [void.release Key])` and `Released(v1)`. The result is no
    I12, and `v1` → `Gone`.
  - The control, the same turn without the release member, gives I12.
  - This is T6 H1 / S2 H1 (quiet `Released`) reopened behind one extra claim. It also turns off I15 and I16 for every
    later ending on the lane.
- **Fix:**
  - an operation's reference states whether a key-less `whenAbandoned` cancel exists (none of today's fixtures has
    one);
  - a `release` member is anchored only on that operation, and otherwise refused (WriteLanes I12);
  - a turn with no write member still matches no row; it anchors only those releases.

### H2: an obligation's deadline is whichever turn closes next (new class: a deadline that names no turn)

- **Where:**
  - `dsl/lifecycle-step.ts:268`: `Delivered` closes the open turn;
  - `dsl/lifecycle.ts:217-221`: an unretained unknown owes `Await Released`;
  - `dsl/lifecycle.ts:374-391` (`due`) and `dsl/lifecycle-lanes.ts:390-406`: every `Await` is due at the next
    `TurnCloses`, whichever turn that is.
- **Rule broken:** WriteLanes R4. Under `cancel`, the unknown is released "once its own ending's turn ends". The
  verdict also depends on step boundaries, which breaks the suite's determinism premise.
- **Probe:** `Lab/R15Switch`: `Turn(Go)`, `Minted`, `Sent`, `Ended(unknown Lost)`, `Delivered(Unsure)`,
  `Turn(Unsure, [])`, `Released`.
  - In one step it gives I12 at the `TurnCloses` that the `Delivered` fires (the `Go` turn closing), then I12 again
    on the `Released`.
  - Split as commit | rest over two steps, it gives nothing.
  - With `[search.retry]` in the `Unsure` turn, one step still gives I12.
- **Relation to STATUS F3:** STATUS carries F3 as a release "due only at a later turn's close". This is its other
  half: the release is due too early. It is reachable by any correct runtime whose world answers within the step.
- **Fix:** an obligation names the turn it is owed by. `Await Released` from an unretained unknown is owed by the
  turn that hears its ending (`Heard`), or by the step's end when no turn hears it (an ignored or bare unknown). Only
  that turn's close makes it due. This also settles F3.

### M1: a twice-refused decline, or a never-sent Attempt's ending, is kept (common mode: the trace follows the runtime)

- **Where:**
  - `dsl/lifecycle-rules.ts:421`: `InvalidTurn × Delivering{retry}` → `Kept` has no guard;
  - `dsl/lifecycle-rules.ts:444, 451`: then `Opens` → `KeptOpen`, and step end → Actors I24;
  - the trace `dsl/lifecycle-lives.traces.ts:156-161` cites "a second refusal is final; Actors R15 keeps it".
- **Rule broken:** Actors R15. "The second refusal is final"; only "a sent write's twice-refused ending stays parked
  on its lane".
  - A Spec-correct runtime that drops a twice-refused decline gets Actors I24 at the next boot.
  - Round-14 keeps declines too (`prototypes/round-14/turn.ts:1111-1124`, D123), so a trace drawn from the runtime
    agrees with the wrong cell.
- **Fix:** guard the cell on whether the ending's Attempt was sent, and send declines and never-sent endings to
  `Closed`. Or raise it with CQ1/CQ2 if round-14's rule is meant.

### M2: a definite ending of a replaced Attempt is refused (a design table gap)

- **Where:** `dsl/lifecycle-rules.ts:85`. `EndDefinite` × `Gone{evidence}` → I16, while `EndNotSent` and `EndUnknown`
  admit the first ending (`:108`, `:125`). Design footnote 7 covers only those two rows.
- **Rule broken:**
  - WriteLanes R7 ("cancel interrupts the previous Attempt, whose ending is evidence");
  - R10 and I15 (recorded, never delivered);
  - I16 is the wrong label for a first ending.
- **Reachability:** latent. The fake world settles answers at step boundaries, so a success after the replacing turn
  needs an interrupt that loses its race.
- **Fix:** `Gone: { evidenceFirst: stay, … }` on `EndDefinite` as well.

### M3: the mutation gate cannot fail on the code that chooses cells (Risk 5 understated)

- **Where:** `dsl/lifecycle.test.ts:195-404`.
  - It mutates table entries only.
  - It does not mutate the guard classifiers (`dsl/lifecycle.ts:68-196`, `dsl/lifecycle-lanes.ts:76-89`,
    `dsl/lifecycle-lives.ts:50-76`), `discharge` (`dsl/lifecycle.ts:206-224`, `dsl/lifecycle-lives.ts:97-115`),
    `declineAllowed`, `Resend`'s discharge, or anything in `dsl/lifecycle-step.ts`.
  - `lifecycle-step.ts` has 10 example tests and no mutants.
- **Answer to "can the gate pass with a wrong cell":** yes, in two ways.
  1. Table C's traces restate the table cell by cell (`lifecycle-lives.traces.ts:120-290`), so a wrong cell with its
     restated expectation passes. M1 is one.
  2. A wrong guard value routes a correct table to the wrong cell, and no mutant covers that. H1 and H2 are both
     here.
  - Also, Table A traces compare obligations by count. Only the 25 `owing` checks in `lifecycle-members.traces.ts`
    compare identity.
- **Rule broken:** v2 "Common mode": guard values "mutated too"; v2 Risk 5.
- **Fix:**
  - give `step` its own mutants: drop the release check, close at `Delivered`, `retryable` off by one, `retained`
    inverted, attribution to another actor;
  - kill each with a `lifecycle-step` trace;
  - check obligation identity in Table A traces.

### M4: a commit's decline guard accepts any reason (an open "otherwise")

- **Where:** `dsl/lifecycle-lanes.ts:335-342`. `declineAllowed` returns `true` for every reason except `Rejected`
  and `Overloaded`. So a commit admitted as `Mint` may be declined `Cancelled`, `Restored`, `Disposed` or
  `StorageRefused`.
- **Rule broken:**
  - v2 Table B `mint`: a decline is allowed only for `Unencodable`, `NoPersistence` or `OldVersion`;
  - WriteLanes R1, R11 and R12;
  - H3's "no otherwise".
- **Fix:** list the allowed reasons per `Admit`, and refuse the rest as WriteLanes I8 (or I1).

### Lows

- **L1, obligations and phases holding other facts (the brief's fourth question):**
  - the open turn's `waiting` and `silent` (`dsl/lifecycle-model.ts:306-311`) are obligations, kept outside
    `obligations` with their own deadline path (`dsl/lifecycle-lanes.ts:390-401`, deadline `Commit`);
  - `Restoring.head` stores position, which `addressable` reads (`dsl/lifecycle-model.ts:65`, `:82`);
  - `AwaitRestore.cause` copies the actor record at creation (`dsl/lifecycle.ts:405`, `:424-428`);
  - `Ending.incarnation` is written (`dsl/lifecycle.ts:239`, `dsl/lifecycle-lanes.ts:354`) and never read, which
    breaks v2 requirement 6.
  - None of these is wrong today. Fold the first into `Obligation` when H2 makes obligations name their turn.
- **L2, labels:**
  - an unmet `Await Released` from an unretained unknown is WriteLanes I5 ("a not-retained unknown leaves no Held
    lane"), not I12 (`dsl/lifecycle-rules.ts:191`). The obligation does not carry its cause;
  - `AwaitLetGo` as WriteLanes I15 (`:202`) has no Invariant behind it (Actors R15 is a Requirement);
  - an untried `KeptOpen` as Actors I24 (`:451`) is "at most once", not "at least once" (CQ8).
- **L3, pending CQs:** CQ7 is marked in Table B's doc and in the traces, but not in Table A's gotcha
  (`dsl/lifecycle-rules.ts:71-75`, which lists only CQ5 and CQ6).
- **L4, `Send` on `Resending` after a cancel:** `Send` × `Resending` is `always → OnWire`
  (`dsl/lifecycle-rules.ts:81`). A re-send invoked after a cancel (WriteLanes R14: "returns to Held and is
  released") is caught only later, by the `Await Released` deadline. Add a `cancelPending` guard, as `Unsent` has.
- **L5, attribution:**
  - a decline's `Parked`, `Unparked` or `Recorded` takes the oldest open decline of the operation from any actor
    (`dsl/lifecycle-step.ts:86-92`);
  - `Unhandled` and `Denied` hear any actor's ending (`:106`; a stated limit).
  - Both need an `actor` on those notes (v2 Port change 3 says "every note").
- **L6, silent drops in `step`:**
  - `Delivered`, `Parked`, `Unparked` and `Recorded` that resolve to no actor (`dsl/lifecycle-step.ts:267-289`);
  - a second `Incarnated` in a step (`:306`);
  - an `Ended` decline with no actor outside a turn (`:258-265`);
  - an unknown operation reads as `retained` (`:249-253`);
  - `TurnCloses` drops `turn.rest` after an unanswered commit (`dsl/lifecycle-lanes.ts:403`);
  - `last === undefined` is unreachable (`dsl/lifecycle-step.ts:373`).
- **L7, `retryable`:** a refused `Send` of this step is not counted, though the server saw it
  (`dsl/lifecycle-step.ts:130`). This happens only on lie paths. The count itself is right: `sends - 1` is
  `retryCount` (WriteLanes I7).
- **L8, mutation exclusions:**
  - `movesHeadWhereItIs` excludes `Resending/Retry → Resend` (`dsl/lifecycle.test.ts:319-322`), but `Resend` also
    discharges an `Await Released`, so the two differ in a `[cancel, retry]` turn. This is latent, as F6 is: no row
    has two members on one lane;
  - `identity` treats `Move` to the same phase as `Stay`, but `Move` also runs `promote`
    (`dsl/lifecycle.ts:299`). That is equivalent only while the lane has a head.
- **L9, code quality:**
  - stringly keyed guard records (`dsl/lifecycle-rules.ts:41, 259, 377`; `MissingLifeCell` row and life typed as
    `string`, `dsl/lifecycle-lives.ts:91-95`);
  - tag lists behind type predicates (`dsl/lifecycle-fold.ts:69-89`);
  - `wl()` defined six times, and `stepOf` with the same tuple four times;
  - `Model.unstoppable` appended without dedupe (`dsl/lifecycle-step.ts:352-355`);
  - long lines (`dsl/lifecycle-step.ts:415`, `dsl/lifecycle.ts:271`).

## The builder's calls

- **`requests` as `step`'s fourth argument:** sound. The server log before the step, plus this step's accepted
  `Send`s of the head, gives `retryCount + 1`. See L7 for the lie-path gap. To reverse it: fold the `Requested` facts
  into the model.
- **Two rows matching one turn:** sound. Rows that tie have equal members, so the anchored members are the same.
  Assert that every matching row has equal members, rather than using `some`, so a future tie with different members
  is caught.
- **A turn with no write member anchors its releases:** unsound (H1).
- **`unstoppable` on the model:** sound. The fact is "from now on" (`dsl/oracle.ts:24`), so the fold has to remember
  it. Dedupe it (L9).
- **`retryable(3)` on PlaceUnsure:** sound. `prototypes/conformance/typed/pay.ts:325-327` guards the retry with
  `O.place.retryable({ times: 3 })`, and its fallback (→ STUCK) runs no member.
- **Others checked:**
  - `Incarnated` once per actor per step, with `Adopt` as that one, is sound;
  - `Resend` discharging the head's `Await Released` is sound (WriteLanes R4, a retry in its own turn);
  - a delivered ending discharging `AwaitRestore` is sound for a parked or kept ending (Restore I6: "never also
    unknown { Restored }"). The code does not limit it to those, but no other delivery of a Held head's ending can
    happen within the new incarnation.

## Cells checked against the Spec, with no finding

Derived from the Spec before reading the traces:

- **Table A:** `Send` on `Held` (I12) and on `Restoring` (I1, Restore I2); `Unsent` cancel endings (R14); `Interrupted`
  endings (R14, I20); the reload row (Restore R3); `DisposalStarts` `Resending` → `Held` (Actors R22); and the
  `settledInDisposal` cell (Actors I36).
- **Table B:** every commit column on `Unsent`, `Resending`, `OnWire` and `Held` (WriteLanes R7); `Retry`; the four
  `Cancel` heads and `CancelAll` (R8, R14, R15); and Idle (R14).
- **Table C:** `Delivered`, `Parked`, `Unparked`, `Opens`, and `StepEnds` on `Parked` and `Refused` (WriteLanes R10;
  Actors R10, R15).
- **Pending cells:** these follow the design and are cited as pending in the traces: CQ3 (`members.traces.ts:135`),
  CQ5 (`ends.traces.ts:96`), CQ6, CQ7 (`members.traces.ts:235`), CQ9 (`members.traces.ts:260`) and CQ10
  (`lives.traces.ts:162, 256`).
- **Already with the user:** WriteLanes R9's `KeyRequired` against round-14's `Every` (STATUS). It is not repeated
  here.

## Sidecar log

There were four Haiku sidecars, at effort high and read-only. Each result was checked against the code at
`3d03715c`, and the Highs by probe.

- **(a) Table A:**
  - accepted: Gone-evidence definite (M2);
  - changed: not-retained → Held (the phase follows the design; the label goes to L2), and `AwaitRestore.cause` (L1);
  - rejected:
    - `Send` while disposing (Actors I30 is `disposal`'s server-log check, by design);
    - `Restoring` gone at `BootSettles`, and `Unsent` → `Restoring{head}` (both v2 Risk 4 and Restore R3);
    - the pre-bound disposal cells (Actors I35 is `disposal`'s);
    - R16 (a stated limit);
    - `firstFree` (equivalent in reachable states: only Attempts about to leave owe something);
    - the I11 and I16 labels on `Queued` (defensible);
  - noted: CQ7's marking (L3).
- **(b) Tables B and C:**
  - accepted: decline kept (M1, checked against round-14 D123), `declineAllowed` (M4), `rest` dropped (L6),
    `Ending.incarnation` unread (L1);
  - changed: delivered discharges `AwaitRestore` (sound, as above);
  - rejected:
    - "`Ending.reason` and `channel` unread" (`dsl/lifecycle-step.ts:108` reads them);
    - the Idle mutation exclusion (Quiet against Stay is still mutated);
    - `Restoring × latest` (unreachable before restore deliveries, Restore I7);
    - delivery during disposal (design ᵈ; Actors R22 parks);
    - pending CQ3, CQ9 and CQ10, and `Every` (already with the user).
- **(c) `step` and the rows:**
  - accepted: memberless releases (widened to every turn and reproduced: H1), F3 (reproduced in one step: H2),
    attribution (L5), silent drops and defaults (L6), the refused-send count (L7), and F6, F7 and F8 as real;
  - verified: the PlaceUnsure guard and the off-by-one.
- **(d) Code quality:**
  - accepted: unmutated guard code (M3), the `Resending` exclusion (L8), dead code and duplication (L6, L9), string
    keys (L9);
  - changed: "holds observes little" (the members traces do check identity; only Table A's compare counts, in M3);
  - rejected:
    - the twelve `// RETURN_TYPE:` comments (required by lint-bomb's `prefer-inferred-return-types`);
    - "killed means any trace" (a mutant changes one cell, so any failing trace reached it);
    - "pending pinned as truth" (the cites name the CQ, which is how pending is marked).
- Sidecar (c) reported writing and then removing a scratch file at `/tmp/x` while reading. Nothing else was written.
