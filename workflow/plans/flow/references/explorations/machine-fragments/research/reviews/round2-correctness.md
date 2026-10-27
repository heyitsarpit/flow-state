# Round 2 review: correctness and static analysis

Lens and severity scale are the same as [round 1](round1-correctness.md). Each round 1 must-fix item
was checked against the revised **rules and code**, not the revision log. Then the mechanisms added
in round 1 were attacked: abandoned routes and ledgers, `notSent`, outcome kinds, input that reads
the entering event or payload, `start`, whole-turn decline, `events`/`hostEvents`/`internalEvents`,
persisted generations, and trait callbacks that move the host.

The round 1 shared blockers are now closed in the rules of all six proposals:

- **Silent admission** (L6) is answered with `interrupt` or `notSent`, or `reject` is forbidden.
- **Host-mapped `unknown`** (H4) is gone: in every proposal the fragment or runtime owns
  `unknown`/`interrupt`/`defect`.
- **Restore** persists the generation (or activation id) and restores a pending read as
  `interrupt`.

The new shared failures sit one level down:

- **The departure-to-settlement gap.** Every proposal except codex-split records an abandoned
  commit only when it *settles*. Between the user leaving and the late result, the host knows
  nothing, so the next submit can start a second commit.
- **Treating `interrupt` as "not sent".** Opus-single and sonnet-split retry or re-place after
  `interrupt`. Operations O7 allows an adapter-reported interrupt after invocation.
- **Abandoned routes that move the actor.** Sonnet-single's abandoned route still targets host
  states.

---

## 1. sonnet-single-fragment.md

### Round 1 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 abandoned commit route + check | **Partly.** The route exists and is required (rule 12, check 12), but it **targets** host states. See new B1. | 4.4 root handlers `DeleteLanded: S.DELETED`, `DeleteUnknown: { target: S.UNCERTAIN }` |
| 2 | B2 silent admission → `interrupt` | **Fixed** | Rule 12 "Silent admission is answered"; check 12 |
| 3 | B3 AutoSave trailing edit | **Fixed** | `restartOn: edits:inFlight`. Traced: edits 1–3, Due (inFlight 3, selection changes, harmless no-op Due), edit 4, Saved clears inFlight, re-arms, saves 4. Correct. |
| 4 | M1 `input`/`start` snapshot | **Fixed, as staged reads.** The rejection of `event`/`payload` is defensible but costs a host copy key (minor m1). | Rule 4 |
| 5 | M2 fusion over stateful targets | **Fixed** | Rule 8 table: per active leaf, one state change, unhandled ⇒ deny |

### Blockers

**B1. Abandoned routes move the actor out of a newer live step (E3; the round 1 codex-single B1
lesson was not taken).** Rule 12 delivers late outcomes as host events "in whatever state the host
is then in", and the 4.4 handlers target states. Scenario:

1. DELETING.SENDING has commit A in flight. `CancelDelete` → VIEWING.
2. `Delete` → `Yes` → DELETING, with commit B in flight.
3. A settles `unknown`. Root `DeleteUnknown` → UNCERTAIN, which abandons B.
4. B settles; `DeleteLanded` → DELETED, or `DeleteMissed`.

The live step was ended by a rule elsewhere, and the UI flips through UNCERTAIN to DELETED. Nothing
reports it: check 14 only demands that the events be *handled*. **Fix:** make `abandoned` handlers
non-targeting, as opus-single, opus-split and both codex proposals now do. Record the outcome in
host memory and reconcile from an explicit host event.

### Majors

**M1. "A part's commit is never abandoned" is false for parts inside steps (L5).** Rule 12
exempts parts. Parts may sit inside steps (AddressStep's `parts`), and leaving the step removes
the part. An AutoSave part inside a step loses its in-flight save outcome with no route. **Fix:**
the abandonment rule follows the *owning activation*, not the shape. Require `abandoned` for any
commit whose owner can be removed. Opus-single requires it on every commit binding.

**M2. AutoSave fails its own check 18.** AutoSave maps `unknown: E.Failed`. `Failed → Edited → Due
→ save` is a graph path from an unknown-mapped event to a send of the same request without an
exit, so check 18 errors on the sample. For autosave, sending newer content after an unknown is
correct. **Fix:** check 18 should stop at an external input (a user event), or AutoSave must exit
on `unknown` (as codex-single's does).

**M3. Poll breaks rule 12's one-outstanding-call rule.** `Tick: { actions: [fetch] }` fires every
5 seconds whether or not the previous fetch has settled. Rule 12 says a second send "rejects the
turn like an invalid action". A slow server therefore produces an issue-only rejected turn every
tick, while the comment says "refetch joins, never stacks". **Fix:** two inner states
(WAITING/REFRESHING, as the other five proposals do), or guard Tick on an in-flight flag.

**M4. The E4 "prevents" claim for `unrefusable` holds only for guards.**
- Not exposed: the host must forward the event. Check 10 forbids a guard over the raise, not a
  *missing* forward in some host state, so Release can still be dropped by a host state that
  doesn't handle it.
- Exposed or not: fusion denies the whole event if a sibling raise in the same host handler is
  denied (rule 8). `Release: { raise: [E.hold.Release, E.audit.Log] }` with `Log` denied refuses
  Release.

**Fix:** an `unrefusable` event must be reachable without host code (always exposed), or check
that every host state where the fragment is active has an unguarded forward with no sibling raise.

**M5. A host result mapping can trigger a retry on success.** `results` carry no kind, so
`success: R.Locked` type-checks. The fragment then retries an applied commit with a new Attempt,
which is a double write. `failure: { X: R.Done }` fakes success. **Fix:** results declare
success versus failure, and the host's `success` accepts only success results (opus-split rule 7,
codex 4.4).

### Minors

- m1. Staged `input` cannot read `event`, so seeding from an event forces a host memory key that
  outlives the step. That is a small D1/L3 cost. Per-transition supply (`.with`, `.enter`, transition
  `input`) types per call site, which answers the "heterogeneous transitions" reason.
- m2. `abandoned` covers success, failure and unknown but not interrupt or defect. State that those
  become issues.
- m3. The departure gap (see 7.1): after `CancelDelete`, a second `Delete` can start before A's
  outcome. That is harmless for an idempotent delete and dangerous for orders.

### Must fix before round 3

1. B1: non-targeting abandoned routes.
2. M1: the abandoned requirement follows the owning activation (parts in steps).
3. M2 and M3: make AutoSave and Poll obey checks 18 and 12.
4. M5: kinds on `results`.
5. M4: narrow or enforce the `unrefusable` E4 claim.

---

## 2. opus-single-fragment.md

### Round 1 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 reply kinds | **Fixed** | `.replies({ success, failure, defect, interrupt, unknown })`; host maps only success and failure (rule 20) |
| 2 | B2 abandoned route | **Fixed** | Required, non-targeting (rule 23); TicketEditor and Checkout bind it |
| 2 | B3 silent admission | **Fixed, but conflated** with adapter interrupt. See new B1. | Rule 22; `interrupt: "NotSent"` |
| 3 | M1 seed via `input` | **Fixed** | Definition-side `{ fragment, input }`; `.enter(...)` for steps |
| 4 | M2 H1 | **Fixed** (hostEvents; guards not optional) | Rules 8, 12 |
| 5 | M4 payload-only commit select | **Fixed** (reads still read memory, deliberately) | Rule 20 |

### Blockers

**B1. `interrupt` is treated as "not sent" and retried: a double order.** CommitWithRetry maps
`interrupt: "NotSent"`, and `NotSent: retryOrGiveUp` carries the comment "the write did not happen,
retrying is safe". Rule 22 merges declined admission into the same reply. Operations O7 also maps
*adapter-reported* interruption, which can follow invocation, to `interrupt`. Scenario: Checkout
PLACING, the adapter is interrupted after the payment request left, then BACKOFF and a fresh
`place` commit with a new Attempt. Two orders. This is exactly round 1 opus-split M1, which
opus-split fixed with `notSent`. **Fix:** split the reply kinds. Use `notSent` (guaranteed
non-invocation: reject, pre-invocation cancel, never-invoked restore) as retryable, and send
`interrupt` to the uncertain exit with its Attempt. Extend check 13/18-style analysis to error on
`interrupt` reaching a fresh send.

### Majors

**M1. The departure gap.** In TicketEditor, `CancelDelete` cancels; after invocation the cancel
reports `unknown`, which reaches `abandoned` only when it settles. Before that, `Delete` → `Yes` →
DELETING starts a second commit. For a delete this is mostly harmless. Checkout's PLACING has no
leave path today, but its `abandoned` comment invites one. **Fix:** a synchronous `pending` handler
in the departure turn (codex-split 4.5), so guards can refuse a new submit at once.

**M2. The TicketEditor abandoned handler clobbers an uncertain Attempt.** `pendingAttempt: outcome
=== "success" || "unknown" ? attempt : null`. A later abandoned *failure* sets null, wiping an
earlier still-unresolved Attempt from another call. **Fix:** on failure, return `{}`, or keep a
ledger keyed by Attempt id (codex-single).

### Minors

- m1. Rule 15: a declined fused transition "falls through as usual". An ancestor handler for the
  same event may then run something unrelated, and `check()` reports Allowed for that ancestor.
  This is consistent with Machines O2. Mention it in check 12's message.
- m2. `.enter` reads pre-turn memory (D6 "reduces"). This is honest. A per-call `enter` that also
  receives the transition's own patch result is not needed if authors use the payload. Keep it.
- m3. `UNCERTAIN: {}` stays a dead end. It is acceptable as a sample, but there is no
  `O.x.retry(attempt)` path anywhere in this proposal.

### Must fix before round 3

1. B1: separate `notSent` from `interrupt`; never retry on `interrupt`.
2. M1: a synchronous pending record on departure.
3. M2: don't clobber unresolved Attempts.

---

## 3. sonnet-split.md

### Round 1 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 AutoSave restartOn | **Fixed** | DIRTY uses an entry-armed Duration plus `Edit: target S.DIRTY`; EDITED → DIRTY re-arms; rule 15, check 18 |
| 2 | B2 lexical, one-operation result tokens | **Fixed** | `send: (reply) => O.x.commit(...)`; checks 4, 5 |
| 3 | B3 typed result kinds | **Fixed** (host: success plus failures; runtime: the rest) | 2.2 |
| 4 | B4 abandoned / admission / generation | **Partly.** `abandoned` is required only for *host* leave paths. See M2. Duplicate calls are answered `interrupt`. See M1. | Rule 12, check 12, 2.2 |
| 5 | M1 drafts on abnormal exits; M2 no fresh commit after uncertain | **Fixed** | AutoSave exits carry `draft`; Checkout UNSURE reconciles with `place.retry(attempt)` |

### Blockers

**B1. `SendInterrupted → exits.NotSent → enterAddress` re-places an order after a possibly-applied
commit.** `SendInterrupted` covers four cases (2.2):
- `reject` concurrency;
- a pre-invocation cancel;
- a never-acknowledged restore;
- adapter-reported interruption (Operations O7), which can follow invocation.

Checkout maps `NotSent: enterAddress`, and the user then proceeds to a fresh `place` commit. The
exit name asserts a guarantee the reply does not carry. **Fix:** split `notSent` (guaranteed
non-invocation) from `interrupt` (Attempt, may have run → UNSURE), as in opus-split rule 7.

### Majors

**M1. A duplicate call answered `SendInterrupted` corrupts the outstanding call.** 2.2: "a second
call while one is outstanding … is answered `SendInterrupted`". The fragment is still waiting on
call 1. It receives `Interrupted` (for call 2), exits `NotSent` and leaves. Call 1's real outcome
now has no live owner, and PLACING has no `abandoned`, because "no host transition leaves it".
The reply is also ambiguous: nothing says *which* call it answers. **Fix:** reject a second
outstanding call at construction, or reject the turn before publication (every other proposal).
Never deliver a reply for a call that never existed.

**M2. `abandoned` misses non-host departures (L5).** Rule 12 and check 12 count only "a
transition on that state or an ancestor". Three other leave paths exist:
- the fragment's **own exits** taken while a call is outstanding (opus-split check 20 covers this);
- an **enclosing subroutine's** exit that removes a nested request-holding subroutine;
- a **trait callback** that targets a host state (rule 10 allows it).

Each leaves a call with no route. The TicketEditor and Checkout comments "no host transition
leaves, so no `abandoned`" are only true for today's code. **Fix:** require `abandoned` for every
commit binding (opus-single, opus-split, codex). Alternatively, compute leave paths over exits,
enclosing exits and trait-callback targets, and make check 12 cover them.

**M3. The departure gap.** In NoteEditor, Leave during SAVING moves to LIST; `Open` immediately
starts a new EDITING. If a save was in flight, two saves race. With `allow` concurrency, the older
one can land last and overwrite newer text. **Fix:** a synchronous `pending` record (codex-split),
plus an `Open` guard.

### Minors

- m1. D6 is "prevents", but `.with` reads pre-turn memory. A `.with` that reads a key the same
  transition updates is stale. Say "prevents when data comes by payload" (opus-single's honest
  wording).
- m2. `gate({ optional: true })` unbound means *allow*. That is the silent-permission default the
  other proposals removed. Require `() => true`.
- m3. TicketEditor: an `unsure` Attempt blocks `RequestDelete` forever, because no reconcile path
  exists for delete (Checkout has one).
- m4. State that `success` accepts only `reply.success` (the types presumably do; the text doesn't
  say so).

### Must fix before round 3

1. B1: `notSent` versus `interrupt`.
2. M1: reject duplicate calls; never answer a phantom call.
3. M2: the `abandoned` requirement covers every departure (own exits, enclosing exits, trait
   callbacks), or every commit binding.
4. M3: a pending record on departure.

---

## 4. opus-split.md

### Round 1 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 abandoned route; check error | **Fixed** | Required non-empty `abandoned` on commits (rule 7, check 2); check 20 warns on own exits |
| 2 | B2 silent admission | **Fixed, best in class** | `notSent` = guaranteed never invoked; one outstanding call (rule 7, check 11) |
| 3 | M1 no retry on interrupt | **Fixed** | `interrupt`/`unknown` → `Unsure`; check 13 errors on a resend after them |
| 4 | M3 raise semantics | **Fixed** | Fused; whole transition declines; raises only into `hostEvents` that are handled in every leaf (check 8) |
| 5 | M4 `input` reads staged + event/payload | **Fixed** | Rule 2; 6.7 seeds from `event` |

### Majors

**M1. The departure gap makes Checkout's L5 claim false.** In 6.6, the text says "If the order is
placed anyway, `abandoned` sets `memory.attempt`, and `Start` refuses a second order." Scenario:
1. PLACING with A in flight. `Cancel` → CART; `attempt` is still null.
2. `Start` (guard passes) → ADDRESS → REVIEW → `Yes` → PLACING sends B.
3. A and B both succeed: two orders.

`abandoned` runs only at settlement. **Fix:** a synchronous `pending` handler in the departure turn
(codex-split 4.5), which sets `attempt` before `Start` can be sent.

**M2. Abandoned success has nowhere to go, so Checkout dead-ends.** After an abandoned success,
`unknown`, `interrupt` or `defect`, `attempt` is set and `Start` is denied forever. No
reconcile path exists, and a definite *success* cannot move the actor to PLACED, because the
handler is non-targeting. The actor sits in CART with an order placed. **Fix:** a reconcile flow
(`O.Orders.place.retry(attempt)` from an explicit host event, as sonnet-split UNSURE and codex
do). Show it in the sample, since non-targeting routes make it mandatory.

### Minors

- m1. TicketDelete `abandoned` records the Attempt for every outcome, including a definitive
  failure. Filter as Checkout does.
- m2. `live` selectors may read `activities`, so guards over `live` depend on lane identity. That is
  fine under O4, but `check()` then reads lanes too. State it in rule 8.
- m3. `start` reads fresh fragment memory (rule 3), and `input` reads staged memory. These are two
  documented O3 exceptions. They are fine, but they are listed separately from the turn rule.

### Must fix before round 3

1. M1: a pending record on departure.
2. M2: a reconcile path in Checkout.

---

## 5. codex-single-fragment.md

### Round 1 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 non-targeting abandoned route | **Fixed** | 3.4: root observers `target: "self"`, cannot raise, cannot be overridden; plural ledger |
| 2 | M1 abandoned success | **Fixed** | Optional `abandoned.success` plus a warning when missing |
| 3 | M2 reply kinds | **Fixed** | Nominal success/failure tokens; system kinds owned by the compiler |
| 4 | M3 AutoSave recovery, draft on Close | **Fixed** | FAILED handles `Flush`; Close checkpoints; uncertain exit carries the draft |
| 5 | M4 seed through `input` | **Fixed** | `initial` receives only `input` (3.1) |

The new mechanisms hold:
- `start` appended to the entering transition, never on a default path;
- input selectors reading post-patch parent memory plus the event or payload;
- whole-candidate decline, with `check()` expanding the guard chain;
- one outstanding call per port, with the terminal reply consuming the slot;
- re-check at delivery whether the owner left after settlement.

### Majors

**M1. The departure gap leaves a lost update in the sample.** RetryHost: Leave during SAVE (A in
flight, `SaveText` concurrency `allow`) → EDITING. `Review` (guard `unknowns.length === 0` passes:
A is unsettled, not unknown) → `Yes` → SAVE sends B with newer text. If A settles *after* B, the
server ends on the older text. AbandonedSuccess records A but changes nothing. AutoSaveHost has
the same issue with Close then Open. **Fix:** a synchronous `abandoned.pending` record in the
departure turn (codex-split) that Review and Open guard on. Or require `serialize` for request
bindings whose key is shared.

### Minors

- m1. `abandoned` interrupt and defect become issues only. State the Attempt retention for
  interrupt, which may have run (codex-split keeps it).
- m2. AutoSave maps `interrupt` → FAILED, so the next quiet edit resends. That is acceptable for a
  whole-document save. Say so, since elsewhere `interrupt` is "may have run".
- m3. `requireAttempt` throws inside `input` if a race slips past the guard. That becomes a pre-commit
  defect. Make it a guard-only lookup.

### Must fix before round 3

1. M1: a pending record on departure, or `serialize` for shared-key request bindings.

---

## 6. codex-split.md

### Round 1 must-fix: verified

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | B1 abandoned route plus check | **Fixed, strongest** | 4.5: complete non-targeting routes (`pending`, success, each failure tag, unknown, interrupt, defect); `pending` runs **in the departure turn**; error on any unrouted leave path; durable across restore |
| 2 | M1 pending read on restore | **Fixed** | 4.6: interrupt before public admission; Poll → WAITING |
| 3 | M2 trait seed | **Fixed** | `embeds: { x: { trait, input } }` reads owner input and own memory only |
| 4 | M3 partial turns | **Fixed** | 4.3: whole-candidate decline; `Replace` is total (guarded apply plus unguarded no-op) |

Also verified:
- interrupt routes to UNCERTAIN with "may have run" (3.5);
- reply producers carry path and class brands plus origin checks (4.4);
- `reject` is forbidden for required requests;
- a projection defect closes the request with `defect`;
- timer arming identity (4.6).

### Minors

- m1. A `pending` patch merges into the departure transition. If the leaving transition writes the
  same key (`error`), that is a construction conflict, so the host cannot write that key on leave.
  Document it, or let `pending` run immediately after, in the same publication.
- m2. RenameHost routes definitive failures (Busy, Rejected) to `unresolved` too, forcing a
  Reconcile → `retry(attempt)`. That is safe only while the Runtime knows the settled result. After
  a reload without durable settlement, `retry` re-invokes a write the server refused, and it may
  now succeed. On definitive failure, clear `unresolved` instead.
- m3. Call mappers read pre-turn memory, and the D6 row correctly says "by convention". Codex-single
  shows this is avoidable: its input selectors read post-patch parent memory (D6 "prevents").
  Consider borrowing that.
- m4. A Debounce `schedule: ({ props }) => …` extends Machines O5's schedule callback arguments.
  List it among the amendments.
- m5. `check()` runs payload mappers (O4 amendment). This is accepted and argued.

### Must fix before round 3

None blocking. Address m1 and m2.

---

## 7. Cross-proposal

### 7.1 New shared failure: the departure-to-settlement gap (propose as yardstick L7)

A host leaves a step while a commit is in flight. The abandoned route records the outcome only
when it settles. In between, the host's guards see no pending work, so the user can start a
second commit. The results are a double order (opus-split Checkout) or an older write landing last
under `allow` (codex-single RetryHost and AutoSave, sonnet-split NoteEditor). Only codex-split closes
it: `abandoned.pending` runs synchronously in the departure turn with the admitted Attempt, and
guards read it.

### 7.2 Borrowing table (round 2)

| Problem (where) | Borrow from | Mechanism |
| --- | --- | --- |
| Departure gap (all but codex-split) | codex-split 4.5 | `abandoned.pending` in the departure turn, with the Attempt; guards refuse a new submit until it resolves |
| Abandoned route moves the actor (sonnet-single) | codex-single 3.4 / opus-split rule 7 / codex-split 4.5 | Non-targeting observers (memory and actions only); reconcile through an explicit host event |
| `interrupt` treated as not sent (opus-single, sonnet-split) | opus-split rule 7 | `notSent` = guaranteed non-invocation (retryable); `interrupt` carries the Attempt and goes to uncertain |
| Duplicate call answered `interrupt` (sonnet-split) | opus-split check 11 / codex 3.4 / 4.4 | A second outstanding call is a construction error or a pre-publication turn rejection |
| `abandoned` required only on some leave paths (sonnet-single parts, sonnet-split host-only) | opus-single rule 23 / codex-split 4.5 | Required on every commit binding, routed through relays and enclosing exits |
| Untyped host results (sonnet-single) | opus-split rule 7 / codex-split 4.4 | One success result; failure tags map only onto failure results (brands) |
| Dead-end after an abandoned or uncertain commit (opus-split, opus-single) | sonnet-split 2.8 UNSURE / codex-single ReconcileText / codex-split RECONCILING | An explicit Reconcile event runs `O.x.retry(attempt)` |
| Poll stacks sends (sonnet-single) | opus-split / codex Poll | WAITING/REFRESHING inner states; next tick only after settlement |
| Check over-reports an autosave resend after unknown (sonnet-single check 18) | none yet | Stop the path search at external inputs |
| `reject` binding | codex-split 4.4 (forbid) or opus-split (`notSent`) | Either is sound; forbidding is simpler and needs no new outcome |
| Pending read on restore | codex 3.5 / 4.6 | Answer `interrupt` before public admission |
| Timer firing queued before a restart | codex-split 4.6 | Arming identity on firings |

### 7.3 Yardstick additions

- **L7 Departure gap.** After abandoning an in-flight commit, a new command starts before the old
  outcome is recorded.
- **H5 Interrupt as not-sent.** A retry or re-submit on `interrupt`, which Operations allows after
  invocation.
- **E5 Preempting observers.** A late-outcome handler moves the actor out of a newer live step.
- **L8 Phantom replies.** A reply delivered for a call that was never admitted, or to the wrong
  outstanding call.

### 7.4 Most correct now

**codex-split.** It is the only proposal with no open finding above minor. It is the only one that
closes the departure gap (synchronous `pending`). It enforces outcome classes by brand plus
construction origin, forbids `reject` instead of inventing a reply, and keeps interrupt and defect
Attempts for reconciliation. It also routes abandonment through relays and enclosing exits, keeps
timer arming identity, and shows complete reconcile flows. Its costs are verbosity (seven abandoned
handlers per commit binding) and a check that runs payload mappers. Those are simplicity questions,
not correctness ones.

The rest, by remaining severity:
1. **codex-single and opus-split** (one major each besides the gap; sound rules).
2. **opus-single** (blocker: retry on `interrupt`).
3. **sonnet-split** (blocker: re-place on `interrupt`; duplicate-call reply; partial abandoned
   coverage).
4. **sonnet-single** (blocker: targeting abandoned routes; three sample/rule contradictions).

---

## 8. Simplicity audit check

This section checks [round2-simplicity.md](round2-simplicity.md) against the correctness lens.

- For each **no-loss drop**: does it keep the feature, or does it reopen a yardstick problem? The
  problems include this file's L7 (departure gap), H5 (interrupt treated as not sent), E5
  (late-outcome handlers that move the actor) and L8 (phantom replies).
- For each **feature cut**: are its stated losses accurate?

Verdicts:
- **keeps:** no correctness loss.
- **keeps only if …:** a condition must hold.
- **reopens Xn:** a correctness regression.

### 8.1 sonnet-single

| Drop | Verdict |
| --- | --- |
| `ignore` → `{}` | **keeps**, if `{}` is listed by inspection (A6). |
| `R` and the `.send` table; results arrive as events named by result keys | **keeps only if** the reserved `unknown`/`interrupt`/`defect` events keep their kinds (unknown carries the Attempt) and are host-unmappable (H4). Fix H5 at the same time: add a separate `notSent`. |
| `start` no longer a shape trigger | **keeps only if** `start` on a part is a type error. Otherwise a part's `start` never runs, so its first send is lost (A7). |
| Rule 9 folded into rule 10 | **keeps only if** exhaustive host exit mapping (check 2) stays. Rule 10 covers sending, not mapping (A6). |
| Rule 3 folded into rule 15 / D9 | **keeps only if** "entry always starts at `default` and runs `start`" is stated elsewhere (A7). |
| Most of `unrefusable` | **keeps** the fragment-side half (it is redundant). The host-side half is the E4 part, and it is already insufficient (section 1, M4). |
| One handler shape for callbacks and exits | **keeps**. The declaration still decides whether a target is allowed (E3). |

| Cut | Losses |
| --- | --- |
| 1 `expose` | **Accurate.** Replacing it with fragment-declared public `events` also closes M4 (E4) and lets `unrefusable` go: a net correctness gain. |
| 2 `unrefusable` | **Accurate** (E1, E4). |
| 3 `request.read` | **Understated.** It also reopens L2 for reads (a late refresh reply reaches a re-entered step unfenced) and D5 (a pending read at restore strands REFRESHING). |
| 4 `raise` fusion | **Understated.** A host could no longer feed a fragment at all (Replace after save, so D3), and T1 becomes moot only because the feature is gone. |
| 5 requests entirely | **Accurate.** Add H5 and L8: outcome meaning moves back into host mappings. |

### 8.2 opus-single

| Drop | Verdict |
| --- | --- |
| One `.reply` form | **keeps** (test API only). |
| `raise` only into `hostEvents` | **keeps**. Public events already arrive directly, so this removes a second route that could carry host policy (E4 neutral). |
| Type-mirroring checks collapsed to one line | **keeps**, if untyped construction still runs the same checks. |
| Rule 13, half of rule 17, the end of rule 26 | **keeps** (restatements). |
| Derived kind → two constructors | **keeps**. |
| `payload` → `event` in host fillings | **keeps only if** `event` in a host filling is the *declared* callback or exit payload, never the fragment's triggering event. Exposing that would make the fragment's internal event shapes host interface (D9/E2). |

| Cut | Losses |
| --- | --- |
| 1 live `prop` | **Accurate** (D1). |
| 2 request reads | **Understated.** The host would map read outcomes onto fragment events again, so H3 and H4 return for reads (a host can fake `Verified`), along with L2 for reads and D5 (a pending read at restore). |
| 3 `story.fragment` | **Accurate.** |
| 4 `raise` + `hostEvents` + whole-turn decline | **Accurate as a bundle.** Cutting only the decline reopens T1. |
| 5 replying callbacks | **Accurate.** L7 and H5 become moot; H4 and H5 return in host code. |

### 8.3 codex-single

| Drop | Verdict |
| --- | --- |
| `kind` → two constructors | **keeps**. |
| Callback calls moved out of `actions` | **keeps** (clarity only). |
| One exit spelling | **keeps**. |
| One abandoned observer per operation, or one `{ outcome, attempt }` handler | **keeps only if** non-targeting and no-raise stay (E5) and the handler can tell which binding the Attempt came from, for a commit versus a retry of one operation. It does not fix L7: a synchronous `pending` case is still needed (section 5, M1). |
| Omit handlers for replies an E=never binding cannot produce | **reopens D4/A6.** Reply handling is fragment code, and a fragment is reused with other bindings. Omission would make the fragment's completeness depend on one host. Drop the reply from the *declaration* instead, or check per placement. |
| Merge `E.input` / `E.control` | **keeps**. |
| `guard().optional()` | **reopens A6 / H1 partly.** Unbound means a silent permission grant, visible only in inspection. That is the author's stated reason for rejecting it; I agree. |

| Cut | Losses |
| --- | --- |
| 1 live `prop` | **Accurate.** |
| 2 `lookup` kind | **Accurate,** if `refetch` stays a request kind. If all reads go, as in 8.2 cut 2 (H3/H4/L2/D5 for reads). |
| 3 request relay | **Understated.** Without the relay, a middle fragment must map its child's replies itself through its own events, so H3 and H4 reopen at depth. Abandonment routing through the middle (L5 at depth) has to be rebuilt per wrapper. |
| 4 `story.fragment` | **Accurate.** |
| 5 same-turn composition | **Understated.** Add D3: the confirmed-value `Replace`/`Set` route is host-raised. Add E4 if forwarding replaces public routes. |
| 6 request ports | **Accurate.** Add H5. |

### 8.4 sonnet-split

| Drop | Verdict |
| --- | --- |
| One `story.fragment` | **keeps**. |
| Unified `optional` / `default` | **keeps only if** an optional *gate* does not default to allow (section 3, m2; A6). |
| "Always `.from`" → bare only when payload-free | **keeps**. |
| Rules 15 and 17 as advice plus check 18 | **keeps only if** check 18 stays (T2). |
| Rule 7 versus check 9 (keep one) | **keeps**, if the surviving one covers both `input` and `start` (A7, D6). |
| `contract` wrapper optional | **keeps**. |
| Merge `NotSent` and `Cancelled` | **keeps only if** `NotSent` first comes to mean guaranteed non-invocation. Today it absorbs adapter `interrupt` (section 3, B1), so merging spreads **H5** into the cancel path. |

| Cut | Losses |
| --- | --- |
| 1 `request.read` | **Accurate** (none shown). If a read step appears later, add L2 and D5 as in 8.1. |
| 2 `P` namespace | **Accurate.** |
| 3 subroutine in subroutine | **Accurate.** It also removes the nested-exit leave path that section 3, M2 found unrouted, so it is a small correctness gain. |
| 4 `also` | **Understated.** Add D3 (no host route for confirmed replacements). |
| 5 requests entirely | **Accurate.** Add H5. |

### 8.5 opus-split

| Drop | Verdict |
| --- | --- |
| Rule 5 clause; rule 9 clause | **keeps** (each is implied by "active before and after"). |
| Rule restatements as checks | **keeps**. |
| One `story.fragment` | **keeps**. |
| All selects read only `payload` (reads too) | **keeps only if** `live` stays. Read keys must then reach the fragment through `live`. Taking this drop *and* the `live` cut means keys change only by `hostEvent`, which is a copy (D1). A missed push refreshes a stale key (L2-like). |
| `ignored` label | **keeps** (cosmetic). |

| Cut | Losses |
| --- | --- |
| 1 `live` | **Accurate alone.** It is understated in combination with the payload-only select drop (above). |
| 2 "every port required" | **Accurate** (A6). |
| 3 Story `reply` | **Accurate** if replaced by fixtures. Fixtures must express `notSent` deterministically (the author's objection), or the H5/L6 paths go untested. |
| 4 staged `input` / `start` | **Understated.** `start` also reads fresh fragment memory. Under pre-turn reads, the fragment memory is undefined at `start`, so the first send cannot use the captured request. That reopens A7 and D2, not only D6. |
| 5 fused raise + `hostEvents` | **Accurate.** Cutting the decline alone reopens T1. |
| 6 requests | **Accurate.** Add H5 (`notSent` is the H5 fix). |

### 8.6 codex-split

| Drop | Verdict |
| --- | --- |
| One request-binding shape (Story fills `abandoned`) | **keeps**. |
| One `{ attempt, outcome }` abandoned handler | **keeps only if** `Pending` stays a member and still runs **synchronously in the departure turn** (L7), and the handler stays non-targeting and no-raise (E5). Per-tag exhaustiveness is then moot. |
| Implied `start: { target: "self" }` | **keeps**. |
| Implied `exits: {}` / `events: {}` | **keeps** here, because the constructor fixes the kind. Not portable to sonnet-single, where `exits: {}` *is* the step marker (see 8.7). |
| `replies` rename | **keeps**. |
| One terminal-totality rule | **keeps only if** it still covers raises reachable from reply and return chains. Otherwise a consumed reply can be declined and stranded (T1, L8). |
| One callback-target rule ("own node") | **keeps**, if a trait's node is defined as its containing node (idle → LOCKED still works). |
| Drop "required" on raises | **keeps**. |

| Cut | Losses |
| --- | --- |
| 1 `check` evaluating payload mappers | **Understated.** "Reopens nothing" is wrong: without it, `check()` can report Allowed where handling declines (T1, check/handling disagreement). It keeps only if transformed payloads into guarded child commands are forbidden. |
| 2 `start` as a transition | **Accurate** (A7 for composites). |
| 3 per-arming / per-occurrence identity | **Understated.** Per-occurrence identity also stops an old occurrence's reply (for example after `cancel` concurrency) from completing the current one (L8). It carries restore correlation (D5), so it is more than "narrow races". |
| 4 abandoned protocol | **Understated.** Add L7: `pending` is the only departure-gap fix in any proposal. Add E5 if a targeting handler replaces it, and D5 (routes survive restore). |
| 5 kinds + brands | **Understated.** Add H5: kinds route `interrupt` to uncertain instead of retry. |
| 6 fused composition | **Accurate.** Add A1. |

### 8.7 Cross-proposal

| Drop | Verdict |
| --- | --- |
| 1 one `story.fragment` | **keeps**. |
| 2 one `{ outcome, attempt }` abandoned handler | **keeps only if** it includes a synchronous `Pending` (L7) and is non-targeting (E5). Adopting it in sonnet-single without removing targets keeps E5 open. |
| 3 one callback-target rule | **keeps**. For sonnet-split and sonnet-single it narrows trait callbacks inside steps (they can no longer leave the step), which is a correctness gain. |
| 4 `raise` only into `hostEvents` | **keeps only if** the proposal has public `events`. In sonnet-single, raise into `accepts` is the only host route, so it needs the events/hostEvents split first. |
| 5 one optional form | **keeps only if** guards have no silent-allow optional (A6). |
| 6 one terminal-totality rule | **keeps**, with the same caveat as 8.6. |
| 7 type-mirroring checks → one line | **keeps**. |
| 8 imply empty declarations | **keeps only with explicit constructors.** In sonnet-single and opus-single the kind is derived from declarations, so an implied `exits: {}` turns Poll into an embedded part that is never left: L4, and L1 (its timer runs for the actor's life). |
| 9 two constructor names | **keeps**. It also makes drop 8 safe. |

| Cut | Losses |
| --- | --- |
| 1 requests for reads | **Understated.** Add D5 (a pending read at restore strands its waiting state) and H3/H4 for reads (host-mapped read outcomes can fake `Verified`/`Ready`). |
| 2 live props | **Accurate.** It interacts with opus-split's payload-only-select drop (8.5). |
| 3 steps inside fragments | **Accurate.** It also removes L5-at-depth and relay routing, which cuts correctness surface as well as size. |
| 4 `start` | **Accurate.** Add L8: the host now issues the fragment's request, so the one-outstanding check spans two owners. |
| 5 forbid abandoning a sending step | **Understated, and the gain is overstated.** A post-invocation cancel reports `unknown` with an Attempt, which still needs a route after the step is gone, so the abandoned protocol does not disappear. If the step must instead wait for settlement, an adapter that never settles leaves the actor unleavable: **L4 fully** for hung I/O, not "partly". L7 does vanish. |
| 6 trait callback targets | **Accurate.** It is a mild correctness gain (fewer leave paths for L5). |
| 7 `raise` | **Accurate.** |
| 8 request ports | **Accurate.** Add H5, L7 and L8: each returns to hand-written host mappings. |

**Net:** most no-loss drops do keep their feature. Five need a condition:

- the abandoned-handler merges must keep a synchronous `Pending` and non-targeting;
- implied empty declarations need explicit constructors;
- sonnet-split's NotSent/Cancelled merge waits on the H5 fix;
- opus-split's payload-only reads need `live`;
- opus-single's `payload`→`event` must name the declared payload.

Two are not no-loss:

- **codex-single's omitted impossible replies** reopen D4/A6;
- **codex-single's `guard().optional()`** reopens A6.

The most understated cut is cross-proposal cut 5 (forbid abandoning a sending step): it trades L5
for L4 on hung adapters and does not remove the routing for post-invocation cancel.
