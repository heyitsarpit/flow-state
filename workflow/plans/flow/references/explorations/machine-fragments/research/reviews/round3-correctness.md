# Round 3 review: correctness and static analysis

Lens and severity scale are the same as [round 1](round1-correctness.md) and
[round 2](round2-correctness.md). Each round 2 must-fix item was checked in the revised rules and
code, not the revision log. Each no-loss drop the authors applied was checked against the
conditions in round 2 §8. Then the new mechanisms were attacked.

The seventh proposal (opus-trait-routine-actor.md) is not reviewed here.

**Headline.** Every round 2 blocker is fixed in the text. In particular:

- **Interrupt** no longer means "not sent" anywhere. Only a guaranteed non-invocation (`notSent`)
  may be retried.
- **Abandoned routes** are non-targeting in all six proposals.
- **Pending records:** all six record a pending commit synchronously in the departure turn.

Four proposals now have **no blocker and no major**: codex-single, codex-split, opus-split and
sonnet-split. Opus-single has one major, a rule contradiction. Sonnet-single has one major, a
sample that does not compile under its own rule. Both are small fixes.

---

## 1. sonnet-single-fragment.md

### Round 2 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 non-targeting abandoned | **Fixed** | Rule 13: `abandoned = { pending, settled }`, `updateMemory`/`actions` only; `Reconcile` is an explicit root event (4.4) |
| 2 | M1 parts in steps | **Fixed** | Rule 13: required "whenever its owner can be removed"; only root parts exempt |
| 3 | M2 check 18 / M3 Poll | **Fixed** | Check 10 stops at a public-event input; Poll has REFRESHING/WAITING, with ticks armed only in WAITING (4.5) |
| 4 | M5 result kinds | **Fixed in the rule, broken in the sample.** See M1. | Rule 12 |
| 5 | M4 `unrefusable` | **Fixed by removal**: public `events` and `hostEvents` (rule 7) | 4.7 sends `E.ADDRESS.city.Set` directly |
| — | H5, L7, L8 | **Fixed** | `save.NotSent` alone retries; Interrupted and Defected go to `Uncertain`; `pending` is fused into departure; a duplicate call rejects the turn |

Applied drops:
- **`ignore` → `{}`:** keeps.
- **`start` legal only in a step:** keeps.
- **Exhaustive exit mapping** stated in rule 8: keeps.
- **"Entry runs `start`"** stated in rule 3: keeps.
- **One abandoned shape with synchronous `pending`, non-targeting:** keeps.
- **Implied empty declarations** correctly *not* applied (`exits: {}` still marks a step).

### Majors

**M1. The TicketEditor sample breaks rule 12.** `failure: { … NotFound: R.Done }` maps a failure
tag onto the success result, and rule 12 says that is a type error. The sample would not compile.
The intent ("already gone counts as done") is legitimate: declare a failure result
`AlreadyGone` and route it to `exits.Done` inside the fragment. Trivial to fix, but it is the
sample for the rule.

### Minors

- m1. Rule 4 calls staged `input` "the one amendment" to Machines O3. Rule 3 makes `start` read the
  fresh `initial` memory, which is a second one. State both.
- m2. A `pending` patch is fused with the departure handler's own `updateMemory`, both on host
  memory. Rule 10's "patches are disjoint" covers fragment slices, not this pair. Say whether an
  overlapping key is a construction error (as codex-split R13 does) or an ordering.
- m3. TicketEditor `Uncertain` → UNCERTAIN → `Dismiss` reopens Delete without reconciling the Attempt
  ("the host's business"). That is harmless for delete, but the sample never shows `O.x.retry`.
- m4. Rule 13 covers restore of an acknowledged commit. State the unacknowledged case
  (→ `NotSent`) explicitly, as rule 12 does for live calls.

### Must fix

M1 only. m1 and m2 are wording.

---

## 2. opus-single-fragment.md

### Round 2 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 `notSent` versus `interrupt` | **Fixed** | `.commit({ success, failure, notSent, uncertain })`; rule 19 sends unknown, interrupt, defect, acknowledged restore and mapper throws to `uncertain`; CommitWithRetry retries only Busy/NotSent; check 4 |
| 2 | M1 synchronous pending | **Fixed** | Rule 22: `"pending"` fused into departure; TicketEditor `unsettled` guard |
| 3 | M2 clobbering | **Fixed** | Handlers clear only the matching Attempt id (TicketEditor; Checkout `track`) |

Also verified:
- `Reconcile` is a step bound to `O.x.retry`.
- Check 4 correctly exempts `retry` from the "no resend after uncertain" rule.
- Terminal totality (rule 15).
- The restore rule now matches Persistence O6 (rule 19).

Applied drops:
- **One `.reply` form:** keeps.
- **`raise` only into `hostEvents`:** keeps.
- **Type-mirroring collapse:** keeps.
- **`payload` → `event`:** keeps, because rule 12 and §3.1 say host handlers read the *declared*
  payload as `event`.

### Majors

**M1. Rule 15 and rule 22 contradict each other.**
- Rule 15: "Transitions triggered by a reply, a schedule firing or a host exit handler can never
  decline."
- Rule 22: "Entering the same placement again declines with `PreviousCallUnsettled` until that
  call settles."

An exit continuation (or a reply-driven exit) that enters a placement with an unsettled abandoned
call must both decline and never decline. Either the delivery is lost (T1/L8) or the L7 barrier is
skipped. Scenario: a reply in step X takes an exit whose host mapping enters step Y, and Y's
previous activation was abandoned with a commit outstanding. TicketEditor avoids this only
because its Delete guard blocks the route earlier.

**Fix:** add a check error when a terminal-delivery path can enter a placement that can hold an
unsettled abandoned call. Or make the barrier a guard on *public* entry events only, and let
terminal paths enter with the old call still routed to `abandoned`, which already fences it.

### Minors

- m1. A lookup select still reads `memory` and `context`. It is deliberate and documented, but reads
  are the only remaining place where a request reads live host state.
- m2. Checkout and TicketEditor gate L7 by host guards. This is honestly labelled "by convention
  across placements".
- m3. `.reply` injection stays behind a named Testing amendment. That is a process choice; the
  correctness risk is low because only the fragment harness has it.

### Must fix

M1.

---

## 3. sonnet-split.md

### Round 2 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 interrupt re-places | **Fixed** | `SendNotSent` → `Unapplied` (the only start-over); Interrupted, Unknown and Defect → `Uncertain` (CommitWithRetry; rule 18). `Cancel` only in BACKOFF, after definitive Busy |
| 2 | M1 phantom reply | **Fixed** | A second call rejects the turn; `reject` and `allow` are construction errors (2.2, rule 14) |
| 3 | M2 abandoned coverage | **Fixed** | Required on every commit binding (rule 13) |
| 4 | M3 departure gap | **Fixed** | `pending` in the departure turn; `Begin`/`TryAgain`/`Open`/`RequestDelete` guard on it; serialize/cancel only |

Also verified:
- E5 (rule 17).
- Totality, extended to timers (rule 10).
- Projection defects end the call (`NotSent` before invocation, `Defect` after).
- Checkout and TicketEditor reconcile with `O.x.retry`.

Applied drops:
- **One `story.fragment`:** keeps.
- **`optional` removed entirely:** keeps, and satisfies the gate condition.
- **`NotSent` + `Cancelled` → `Unapplied`:** keeps. It was applied only after `NotSent` came to mean
  guaranteed non-invocation, as the condition required.
- **Implied empty declarations:** keeps, because the constructors are explicit.

### Minors

- m1. The TicketEditor abandoned handler drops the Attempt on a late `unknown`/`interrupt`/`defect`
  (it only writes `notice`), then clears `pendingDelete`, so a second delete is allowed. Checkout
  does this correctly (it stores `attempt`). Copy Checkout's branch.
- m2. Rule 9 says "memory patches are disjoint", but `pending` and the leaving transition both patch
  host memory. Same as sonnet-single m2.
- m3. D6 is by convention (`.with` reads pre-turn memory; take data from the payload). It is
  labelled honestly.

### Must fix

None blocking. m1 is a sample fix.

---

## 4. opus-split.md

### Round 2 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | M1 departure gap | **Fixed** | Rule 8: `"pending"` fused into the leaving transition; Checkout `Start` guards `late === null`; `late.status = "Pending"` is set in the Cancel turn |
| 2 | M2 Checkout dead end | **Fixed** | CART `Reconcile`: Placed → PLACED; Unclear → RECONCILING with `place.retry(attempt)`; UNSURE uses the same path |
| — | m1 TicketDelete records failures | **Fixed** (failure/notSent clear) | 6.4, 6.7 |

Also verified:
- Per-call and per-arming ids (rule 2).
- Projection defects deliver `defect` (rule 7).
- Transitive terminal totality (rule 10).
- `live` reads lanes, stated (rule 9).
- The HoldToConfirm trait callback targets a host state inside its node (6.8).
- `notSent` stays precise: reject, pre-invocation cancel, never-invoked restore.

Applied drops:
- **Rule clauses removed** (rule 5 "raised only by the direct parent"; rule 9 "a fused target may
  not leave a node whose child is raised into"): keeps.
- **One `story.fragment`:** keeps.
- **All selects read only `payload`:** keeps, because `live` stays (Poll's key moved into the request
  Schema).
- **`ignored` label removed:** keeps.

### Minors

- m1. A `pending` patch "fused into that leaving transition" is merged in the order own, fillings,
  raised (rule 10). An overlapping key is then a silent last-writer. Make it a construction error
  (codex-split R13).
- m2. TicketList (6.7) has one `late` slot and an unguarded `Remove`. Escape mid-send, then Remove
  on another row: the second pending overwrites the first Attempt. Guard `Remove` on `late`, as
  Checkout does, or keep a ledger.
- m3. L5 and L7 depend on host guards. This is labelled honestly (weakness 8).

### Must fix

None blocking. m1 and m2 are small.

---

## 5. codex-single-fragment.md

### Round 2 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | M1 departure gap / lost update | **Fixed** | R21 and §3.4: the per-operation observer receives a batched `Pending` fact synchronously before the leaving publication; RetryHost `Review` and AutoSaveHost `Open` require `pending` and `uncertain` to be empty; a crash rebuilds pending obligations before admission |
| — | m1 interrupt/defect retention | **Fixed** | They move pending to `uncertain` with the Attempt |
| — | m2 autosave interrupt | **Strengthened** | AutoSave sends Interrupted/Defected to `exits.Uncertain` with the draft; only `NotSent` re-arms through FAILED |
| — | m3 throwing `requireAttempt` | **Fixed** | Removed; the guard matches the Attempt with `Equal.equals` |

New mechanisms checked:
- `notSent` for an admitted, cancelled-before-invocation call, with the observer keeping prior
  uncertainty when a *retry* is `NotSent`.
- The defect fallback for projection failures.
- R14 transitive totality, including the timer-fired `Flush`, handled unguarded in IDLE, SENDING
  and FAILED.
- The same-turn graph bound.
- Per-arming timer stamps.

AutoSave was retraced. A trailing edit during SENDING sets `due` through the quiet timer, and
`Saved` resends. An early `Saved` goes IDLE, and the later quiet `Flush` sends. A rejection lands in
FAILED, and the next quiet edit sends. Correct.

Applied drops:
- **One per-operation observer:** keeps. It is non-targeting, carries `binding` plus `operation`
  (commit or retry), and synchronous `Pending` is batched.
- **One exit spelling:** keeps.
- **Merged Story namespace:** keeps.
- **Implied empty declarations:** keeps, because `kind` is explicit.
- **`guard().optional()`:** correctly *rejected*.
- **E=never reply handlers:** correctly kept (only the host map is omitted).

### Minors

- m1. `SaveText` keeps `concurrency: "allow"`, and R16 forbids only `reject`. Write ordering then
  rests entirely on the authored `pending` gate (L7 by convention). An ungated host can let an older
  write land last. Recommend sonnet-split's rule: request-bound commits are `serialize` or
  `cancel`. Or at least warn on `allow` with no ledger guard on the entering edge.
- m2. "A Pending observer defect rejects the departure batch." A buggy observer therefore makes
  the step unleavable (L4) until the code is fixed. This is defensible under the pre-commit defect
  rule; state it as a weakness.
- m3. L7 itself remains by convention (an authored guard). That is honest, and the same in every
  proposal.

### Must fix

None blocking.

---

## 6. codex-split.md

### Round 2 must-fix: verified (all were minors)

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| m1 | Pending/source patch conflict | **Fixed (documented as a construction error)** | R8, R13, §4.5; RenameHost moves the departure `error` into the `Pending` branch |
| m2 | Definitive failure kept unresolved | **Fixed** | The observer's `Failure` clears `unresolved` for Busy/Rejected |
| m3 | D6 by convention | **Kept, argued** | Rule 7 |
| m4 | Schedule `props` amendment | **Listed** | §8 amendments |

Applied drops:
- **One request-binding form:** keeps.
- **One `{ attempt, outcome }` observer with synchronous `Pending`, non-targeting:** keeps.
- **Implied stateless `start` and empty records:** keeps, because the constructors are explicit.
- **`answers` / `reply` / `replies` split:** keeps.
- **One transitive totality rule, R9:** keeps; it covers reply, exit and timer chains.
- **One own-node callback rule:** keeps.
- **`raise` only into `hostEvents`:** keeps.

### Minors

- m1. R12: "Silent cancel closes an active request with **interrupt**." In this proposal interrupt
  means "may have run", so a pre-invocation cancel lands in UNCERTAIN. The user is then asked to
  reconcile, and `retry(attempt)` of a never-invoked Attempt *performs* the cancelled write. This
  is conservative (never a silent double write) but semantically inverted. Use a `notSent`-class
  reply for guaranteed non-invocation, as opus-split and codex-single do.
- m2. D6 by convention (call mappers read pre-turn memory). Codex-single's staged incoming-input rule
  would make it "prevents".
- m3. The abandoned observer is per binding (lexical). Two bindings of one operation in one host
  need coordinated ledgers. That is fine, but codex-single's per-operation batch is simpler for
  L7 gating.

### Must fix

None blocking. m1 is the only semantic item.

---

## 7. Final ranking and verdict

| Rank | Proposal | Blockers | Majors | Why |
| --- | --- | --- | --- | --- |
| 1 | **codex-single** | 0 | 0 | Most complete protocol (details below). Remaining: `allow` concurrency relies on authored L7 gates; observer defects block departure. |
| 2 | **codex-split** | 0 | 0 | The same protocol strength, with explicit patch-conflict rejection. Pre-invocation cancel is labelled "interrupt" (conservative but inverted); D6 by convention. |
| 3 | **opus-split** | 0 | 0 | Precise `notSent`; staged input (D6 prevents); smaller surface. The pending patch merge is an unspecified last-writer; a one-slot ledger in TicketList. |
| 4 | **sonnet-split** | 0 | 0 | Correct protocol, and serialize/cancel enforced (better than codex-single there). One sample drops an Attempt; D6 by convention. |
| 5 | **sonnet-single** | 0 | 1 | The protocol is now sound; its TicketEditor sample violates rule 12. |
| 6 | **opus-single** | 0 | 1 | The rule 15/22 contradiction can strand a terminal delivery or skip the L7 barrier. |

Codex-single's protocol, item by item:
- **`notSent`:** precise, covering admitted pre-invocation cancel.
- **Input:** staged incoming input (D6 prevents).
- **Departure:** a synchronous batched `Pending` per operation, which also covers a terminal
  already queued and a crash rebuild.
- **Patches:** disjoint patches are a rule (R15).
- **Totality:** transitive, including timers.
- **Identity:** per-arming identity.
- **Restore:** read restore as interrupt.
- **Defects:** projection-defect closure.
- **Reconcile:** a real reconcile step on `retry`.

**Free of blockers and majors:** codex-single, codex-split, opus-split and sonnet-split.

**What is left for the leader (codex-single), exactly:**

1. Decide whether request-bound commits may use `allow`. Recommended: forbid it (serialize or cancel
   only, as sonnet-split does), or warn when an entering edge lacks a ledger guard. This is the
   only gap where a legal program can let an older write land last.
2. State in the weaknesses that a defective `Pending` observer blocks departure (L4 until fixed).
3. Nothing else is correctness. The `kind` field versus two constructors, the vocabulary size
   (about 41 roles) and the `check()` payload-mapper amendment are simplicity and principles
   questions.

**Is a third revision round worth running?** Not a full one. The remaining correctness items are:

- one rule contradiction (opus-single M1);
- one non-compiling sample (sonnet-single M1);
- a handful of minors, mostly samples and wording.

None reopens a yardstick problem in the leading four. The open choices are policy decisions that
should be made once, centrally, not by six authors again:

- `notSent` versus "interrupt" for pre-invocation cancel (recommend `notSent`);
- staged incoming input versus pre-turn call mappers (recommend staged: D6 prevents);
- whether `allow` is legal for request-bound commits (recommend no);
- an observer per operation versus per binding (either is correct);
- pending/departure patch overlap (recommend a construction error).

Recommend:
- targeted fixes to opus-single M1 and sonnet-single M1, without a review round;
- a user decision on the five points above;
- moving to the simplicity and shape choice (single versus split, which cuts to take), where the
  proposals now differ more than they do on correctness.
