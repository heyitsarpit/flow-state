# Proposal v4: correctness review

Lens: correctness and static analysis. The scope is what v4 adds to v3: the turn algorithm (§2.5),
incarnations, the new `resetOn`, contract summaries, no fallthrough after a child's refusal,
`onLeave`, list incarnations, `keep`, the Lockout sign-in, P14–P21 and T1–T3. The baseline is v3
after its final pass (`comparison/reviews/v3-amended-correctness.md`, with n1/n2 folded in).

**Verdict.** I found no blockers and eight majors. Four of them break a v3 rule that used to hold:

| v3 rule | Broken by | Finding |
| --- | --- | --- |
| Rule 8, deliveries are never lost | Dropping a whole delivery into a dead incarnation | M3 |
| One guess in flight per challenge (v3's M3 fix) | A timeout's `unknown`, plus `.pending` being undefined afterwards | M5 |
| D3, `notSent` proves no write | `IdempotencyExpired` answered as `notSent` | M6 |
| Rule 6 / E5, a late result never preempts live work | Outcomes of compensating commits | M7 |

M8 is a fifth case, in wording only: the normative step 2 drops Machines O2's ancestor fallthrough.

The sign-in traces correctly once M2 (the step 6 order) and M5 are fixed.

---

## Majors

### M1. Step 3 seeds incarnations before the turn knows which states it enters

**Scenario.** A root trait's callback filling, or an exit filling, changes state. Examples are
`onLocked` alternative 1 (ENTERING → LOCKED_OUT, in an `abandoned`-sourced turn) and Confirm's
`Declined → S.WIZARD.history`. Suppose the target node has an `.at` trait, and an earlier part in the
written order raises into it.

- Step 3 seeds "fragments entered in this turn". At step 3, though, only the source has been
  selected, so these entries are not yet known.
- Step 4 expands in written order. A raise that comes before the state-changing part is expanded
  before "the turn's one state change is known". Yet step 4 says it addresses the incarnation that
  is live once the state change is known.

**Why it fails.** The algorithm is single-pass and calls itself normative. The fresh incarnation
behind a part-selected entry has no `input` or `initial` step. The incarnation a raise addresses
depends on a later selection. Rule 12 makes "a raise into a fragment that is not live after the
turn's structure is fixed" a construction error, but closure guards decide which part changes
state. So this case can be neither pruned nor diagnosed at runtime as written.

**Fix.** Split step 4 into two passes:

- **4a, select.** Select every part using pre-turn reads. Fix the one state change and the set of
  incarnations that end or start (entries, resets, `Add`s).
- **4b, seed.** Seed every new incarnation: read `input` from the source-updated memory, then apply
  `initial`.
- **4c, compute.** Compute payloads and patches, with parts addressed to new incarnations reading
  their initial memory.

Selection inside a fragment that is created this turn can read only its initial memory, so 4a needs
4b for those fragments. Seed lazily on first address: incarnations are fixed before any patch is
computed. A raise selected in 4a into a fragment that 4a's state change ends should be a runtime
pre-commit defect, and a `flow check` warning when closures hide it.

### M2. Step 6 applies the patches before the new incarnations' memory

**Scenario.** This is v3's `lockouts.Add`-then-`Start` case, now `Add`-then-`Strike`. A late
`WrongCode` for c1 arrives after its instance was never added. `abandoned` raises `Add{c1}` and then
`Strike{c1}`.

1. Step 4: `Strike` addresses "one created earlier in the same turn" and reads the initial memory
   (`strikes: 0`).
2. Alternative 2 patches `strikes: 1`.
3. Step 6 reads "Apply the patches in expansion order, and the new incarnations' memory". The
   initial `{ strikes: 0 }` lands after the patch and erases the strike.

The same happens to a raise into a trait that was reset in this turn (rule 1 says it "reaches the
fresh incarnation").

**Fix.** Make the order explicit: exits and entries, then the new incarnations' initial memory
(entries, resets, `Add`s), then the patches in expansion order, then removals. Counting an instance's
creation and a later part's patch to its slice as an "overlapping key" is wrong; say so in step 5.

With this order, the Add-then-Strike trace is correct: `Strike` reads `strikes: 0`, takes
alternative 2, and stores `strikes: 1`. If c1 is present, `Add` is a no-op and `Strike` reaches the
incarnation that was live when the commit started.

### M3. "The delivery is dropped" breaks rule 8

**Scenario.** A list has a commit per row. The host starts `O.Mail.check.commit` for invite k on an
INVITE `"self"` transition. Its outcome handler at INVITE does two things:

- decrements `memory.checking`;
- raises `E.invites.key(k).Checked`.

The user removes row k and re-adds it (keyed list), and then the result arrives. Rule 9 says "If that
incarnation is gone, the delivery is dropped with evidence". Read literally, the whole outcome turn is
dropped:

- `checking` never returns to 0;
- a hot "checking" state, if there is one, is stuck.

In v3, deliveries were never lost (rule 8).

**Fix.** Drop only the parts addressed to the dead incarnation, together with their sub-chains, and
record evidence for them. The rest of the turn commits. Rule 8's totality then still holds for the
host's own handler.

Two related gaps:

- An incarnation added *after* the commit started is never addressed (only "live when its commit
  started, or created earlier in the same turn"). State that this is intended for re-added keys.
- Persistence must save the incarnation map each commit and arming captured, or the rule cannot
  survive a reload (Persistence O2 lists only "list incarnations").

### M4. A summary as a "may notify" set flags exclusive alternatives as two state changers

**Scenario.** A trait event has alternatives: valid notifies `onValid`, invalid notifies `onInvalid`.
The host fills them with different targets. The summary records only that the event "may notify
`onValid`, `onInvalid`". Rule 10 checks hosts against summaries only, so `flow check` sees two
possible state changers in one turn.

**Why it fails.**

- Rule 12 makes "two state changers … that state-token pruning cannot separate" a construction
  error. The child's alternatives are exclusive by first-match selection, which is not a closure
  overlap and is not visible in a set.
- v3 read the bodies and at worst warned. v4 rejects correct code, and the workaround (splitting
  events) leaks into contracts.

**Fix.**

- Make the summary per event a list of per-alternative effect sets: `{ notifies, exits, total }` for
  each alternative. The host check treats different alternatives as exclusive.
- Include in the summary the `internalEvents` (and nested children's timer chains) and `onLeave`.
  Today it covers only `events` and `hostEvents`, yet the host needs both to check rule 8 and
  disjoint keys. For example, Lockout's timer notifies `onUnlocked`, and `onLeave` notifies
  `onDraft` in the leaving turn.

### M5. A timeout or cancel after sending: `.pending` and the "real settlement" are undefined

**Scenario.** In the sign-in, `verify` has `timeout: "15 seconds"`. The sequence:

1. X1 (c1) times out. P16 aborts the signal and answers `unknown`.
2. `CodeUnchecked` moves the user to ENTERING.
3. Is X1 still `.pending`?
   - If it is not, Submit passes and X2 is in flight while X1's "eventual real settlement" (P17) is
     still to come. That is two guesses in flight for one challenge. The sign-in's bullet "only one
     guess is in flight per challenge" and v3's M3 fix are broken.
   - If it is, Submit shows `StillChecking` with no bound, possibly forever.
4. Worse, P16 *aborts the signal*. With Effect interruption, an aborted adapter has no real
   settlement to report; at most an interruption. P17 then promises something that cannot arrive.
5. Operations O3's "Every commit delivers exactly one terminal outcome" also now becomes two
   deliveries: `unknown` in the state, then the settlement in `abandoned`.

**Fix.** Pick one rule for each case and state it in Operations O3 and P3:

- **Timeout = stop waiting, keep listening.** Do not interrupt. Deliver `unknown` (reason `Timeout`)
  in the state. The call stays `.pending` until its real settlement, which goes once to `abandoned`.
  Add an optional `abandonAfter` bound, after which the call stops counting as pending and its
  evidence is dropped.
- **Explicit cancel = interrupt.** There is no later settlement. `unknown` is final and `.pending`
  becomes false.

Then restate "exactly one terminal outcome" as "one in-state outcome, and at most one `abandoned`
settlement". The sign-in keeps one guess in flight under the first rule; say that in §3.1.

### M6. `IdempotencyExpired` answered as `notSent` mislabels an uncertain write

**Scenario.**

1. A charge is `unknown`, and its Attempt is saved.
2. A day later, `orphaned` or a reconcile handler calls `retry(attempt)`.
3. The idempotency window has passed, so P18 answers `notSent` with reason `IdempotencyExpired`.
4. A host that maps `notSent` to "safe to resend" (the meaning D3 gives it: "only notSent proves the
   remote write did not happen") starts a fresh charge, and the customer is charged twice.

**Fix.** Answer `unknown` (reason `IdempotencyExpired`), which may target only `uncertain` events,
or a distinct terminal outcome that is also typed as uncertain. `notSent` must stay limited to work
that was never invoked.

The same applies to `orphaned` retries. Also note that `createdAt` is client Runtime Clock time while
the window is the server's. Add a safety margin, or compare against the acknowledgment time.

### M7. Compensating commits (P20) reopen E5

**Scenario.**

1. `abandoned` starts `refund` (P20), fenced to the root.
2. Its outcome events (`RefundFailed`, `RefundUnsure`) are ordinary deliveries handled at the root.
3. Rule 6's late-result denial covers only turns "sourced from `abandoned` (directly, or through its
   raises and the callbacks they notify)". These turns are sourced by the refund's outcomes.
4. A root `RefundFailed: S.PAYMENT_ERROR` therefore moves a user who is mid-way through a new
   checkout (a busy SUBMITTING with a fenced commit). That is exactly the E5 that v3 closed. In v3,
   `abandoned` could not start work, so the rule held.

**Fix.** Extend rule 6 transitively. A turn sourced by an outcome (or retrying, or `abandoned`) of a
commit started from an `abandoned` run is also a late-result turn. Alternatively, require that the
outcomes of commits started in `abandoned` target nothing (`target: "self"` only) and end unguarded,
as `abandoned` itself does.

### M8. Step 2 drops Machines O2's ancestor fallthrough when every alternative declines

**Scenario.** A leaf has `Submit: { guard: g }`, and the parent has a `Submit` handler. `g` declines.
Machines O2 (kept by v3) says "all declining falls through to the next ancestor". The normative step
2 says to find the handler from the leaf up, try its alternatives, and "If no alternative is selected,
the event is `Unhandled` or `Denied`". Since §5 says the algorithm replaces the O3 prose, the runtime
and `check()` would now stop at the leaf.

**Fix.** In step 2, add: "If every alternative declines, continue at the next ancestor; only after the
root is the event `Denied` (if any handler existed) or `Unhandled`." The new no-fallthrough rule
concerns a *child's refusal* inside a selected alternative, and should say so.

---

## Minors

- **m1. `onLeave` is listed twice.** Step 1 queues "`abandoned`, `orphaned` and `onLeave` deliveries"
  in the mailbox, but rule 6 fuses `onLeave` into the leaving turn. Remove `onLeave` from step 1.
  `orphaned` is a descriptor handler, not an actor delivery (P19); say where it runs.
- **m2. What a later trait's `resetOn` reads after an earlier reset.** Step 3 evaluates each
  `resetOn` "on" the source-updated memory. §3.4 says `checked` "sees pager's reset". Step 3 should
  say that each `resetOn` reads the source-updated memory with earlier resets' initial slices
  applied.
- **m3. A deferred reset lands on an unrelated turn.**
  - **Scenario.** A callback writes `appliedSearch` in turn N. Its reset is evaluated only in turn
    N+1, whatever its source.
  - **The bad case.** N+1 is the user's `E.pager.Next`. Step 2 selects `Next` against the old
    incarnation (page n, `hasNext`). Step 3 then resets the pager. Is the source's `page: n+1` patch
    applied to the dead incarnation, or to the fresh one?
  - **Fix.** Either re-baseline `resetOn` silently at commit (callback-written keys then never
    reset, which `flow check` makes an error rather than a Story warning), or apply resets pending
    from the previous commit before step 2.
  - **Cost, acceptable.** The search settle moves from a Debounce trait to a host schedule, so
    fragment debouncers cannot drive resets.
- **m4. Typing "only traits declared before it" in a record.**
  - TypeScript does not give reliable key order for object-literal types. This needs tuple placement
    or a builder, and belongs in the S1 type spike.
  - Define the order across `.at` traits on different nodes and across nested traits.
- **m5. `keep` edge cases.**
  - A firing that was already queued but not handled when its node was left: v3 discarded it. For a
    kept schedule, say that the firing is retracted and fires on return, otherwise it is lost.
  - Explicit re-entry of X no longer refreshes kept traits. v3's "re-enter to reset" idiom is gone
    for them; say so.
  - A kept trait whose `resetOn` differs on return gets `onLeave` twice: at freeze, and again at the
    reset. Say which.
  - `.list(...).at(X, { keep })` is unspecified.
- **m6. History into a waiting state.** History restores control only. Re-entering VERIFYING or
  SUBMITTING through `S.X.history` has nothing pending, because the fenced commit was abandoned. T1
  catches this only for states marked `hot`. `flow check` should warn whenever a history target can
  restore a state that handles fenced outcome events.
- **m7. A raise into an absent key in a user turn.** For views this is `Unhandled`. For a host raise
  in a user-sourced turn it is unspecified: refuse, or a no-op? Say which.
- **m8. The saga recipe.**
  - The recipe compensates only `outcome === "success"`. Late `unknown` and uncertain tags (P14) are
    not reconciled; reconcile them with `retry(attempt)` from `abandoned`.
  - Give the `abandoned` payload a `definite` flag, so an uncertain failure tag is not read as
    definite.
  - The refund descriptor must not use `concurrency: "reject"`, or a second abandoned run gets
    `notSent`.
- **m9. One Attempt id across retries (P15).** A server that caches definite failures under the
  idempotency key (several APIs cache 4xx responses) replays the `Busy` failure, so the retries do
  nothing. Document that adapters may derive a per-invocation key from `(id, n)` for definite
  retries.
- **m10. `orphaned` (P19).**
  - The Attempt input must re-decode under the new version's input Schema. If it cannot, surface an
    issue rather than `InvalidAttempt` inside a retry with no sink.
  - Say where an orphaned retry's outcome goes; it has no actor, so evidence only.
  - "Delivered once" needs the mark-delivered write to be atomic with the retry call, or relies on
    idempotency; state which.
- **m11. The sign-in.**
  - `challenges` never removes an instance, so the list grows with every challenge and is persisted.
    Remove on SIGNED_IN, or when an instance is unlocked with zero strikes.
  - `resendCooldown` at `.at("TWO_FACTOR")` resets on Back and return. That contradicts the bullet
    "resend is refused for 30 seconds after each resend". Keep it (`keep: true`) or move it to the
    root.
- **m12. `check()` details.**
  - Step 5 failures (an invalid action batch, overlapping keys) need a `check()` verdict.
  - A declined token element needs a reason `code` in `Denied.reasons`, or is omitted; say which.
  - "Step 1: take the oldest event from the mailbox" does not apply to `check()`.
- **m13. `timeout` shorthand.** `timeout: "15 seconds"` doesn't say whether it is `perAttempt` or
  `total`. P16 makes them differ for retries.

---

## Traces

**1. Three wrong codes (c1).**

- The first two `CodeWrong`s take alternative 2 (to ENTERING) and raise `Strike`; the Lockout's
  alternative 2 counts each strike.
- The third takes CodeWrong alternative 1 (to LOCKED_OUT) and raises `Reset` and `Strike`. Lockout
  alternative 1 sets `strikes: 3`, raises `timer.Start` (armed by `armOn`) and notifies `onLocked`.
  `onLocked` alternative 1 is pruned by the ENTERING token (the pre-turn state is VERIFYING), so
  alternative 2 runs. One state changer, disjoint keys. ✓

**2. Unlock.**

- Countdown `Done` notifies `onDone`; the Lockout sets `strikes: 0` and notifies `onUnlocked`.
- `onUnlocked` alternative 1 needs `[LOCKED_OUT, isCurrent]` and moves to ENTERING.
- LOCKED_OUT holds no fenced commit (the resend is fenced to TWO_FACTOR). ✓

**3. A late strike for a challenge the user left.**

1. X (c1) is in flight. Back leaves VERIFYING and fuses `abandoned`'s pending run, which has no tag,
   so `{}` runs.
2. PasswordAccepted(c2) moves to ENTERING and raises `Add{c2}`.
3. X settles `WrongCode`. `abandoned` raises `Add{c1}` (a no-op) and then `Strike{c1}`, which
   reaches the c1 incarnation live when X started.
4. If that is the third strike, the lock runs. `onLocked` alternative 1 is denied (`OtherChallenge`),
   so alternative 2 (`"self"`) runs.
5. Returning to c1 while it is locked: PasswordAccepted alternative 1 goes to LOCKED_OUT. Returning
   after the unlock: `strikes: 0`. ✓

**4. A late third strike while entering the same challenge.**

1. Back and return happen with X pending. Submit is denied (`StillChecking`).
2. X settles, and `onLocked` alternative 1 moves the idle ENTERING to LOCKED_OUT; rule 6 allows it.
3. A late strike while already locked takes Lockout alternative 2 (`min`) and does not re-arm the
   timer. v3's m1 is gone. ✓

**5. Two challenges.** Each has its own instance and timer. A late `onLocked` or `onUnlocked` for the
other challenge is filtered by `isCurrent`. ✓

**6. A timeout on the current challenge (M5).** The trace fails unless `.pending` stays true until
the real settlement.

**7. Add-then-Strike into an absent key.** It is correct only with M2's order.

**8. A raise into a fragment entered or reset in the same turn.**

- When the source selects the entry or the reset, it is correct: step 3 seeds the incarnation and
  the raise reads its initial memory, provided M2 is fixed.
- When a callback or exit filling selects the entry, the outcome is undefined (M1).

---

## Must fix before plan editing

| Finding | Fix |
| --- | --- |
| M1 | A two-pass step 4: select, then seed, then compute |
| M2 | Order in step 6: initial memory, then patches |
| M3 | Drop only the dead incarnation's parts |
| M4 | Per-alternative summaries, with timer chains and `onLeave` |
| M5 | Timeout semantics and `.pending` |
| M6 | `IdempotencyExpired` is not `notSent` |
| M7 | Rule 6 is transitive through compensating commits |
| M8 | Step 2 keeps ancestor fallthrough |

The minors can ride along with the plan text.

---

## Fix check

This section checks proposal-v4 as revised (1,212 lines), against its "Changes after review" list.

### M1–M8

| Finding | Status | Where |
| --- | --- | --- |
| M1 seeding before the state change is known | **Closed** | Step 3 selects every part and fixes the one state change. Incarnations are seeded lazily on first address, and step 4 seeds the rest. |
| M2 patches before initial memory | **Closed** | Step 6 applies initial memory, then patches, then removals. Step 5 says an incarnation's creation and a patch to it do not overlap. |
| M3 dropping a whole delivery (broke rule 8) | **Closed** | Rule 9: "only the parts addressed to it (with their sub-chains) are dropped… the host's own outcome handling commits". |
| M4 summaries as union sets | **Closed** | Per-alternative effects, which are exclusive. Summaries include internal events (timer chains) and `onLeave`. |
| M5 timeout, `.pending` and one guess (broke v3's M3 fix) | **Closed** | P16: a timeout stops waiting, not the call. P3: pending until the real settlement. P17: an explicit cancel interrupts and is final. Delivery is "one in-state outcome, and at most one `abandoned` settlement". |
| M6 `IdempotencyExpired` as `notSent` (broke D3) | **Closed, by deferral** | The window is moved to "Left out", and will be `unknown` when it comes back. |
| M7 compensation reopening E5 | **Closed**, with f2 | Rule 6 defines a **late turn** transitively through the outcomes and `retrying` of commits started from late turns. |
| M8 ancestor fallthrough | **Closed** | Step 2: "If every alternative declines, continue at the next ancestor". |

The minors m1–m13 are all addressed in the text.

### The author's new choice: pending resets

The rule: a key written by a callback or exit filling becomes a pending reset, applied at step 1 of
the next turn. It has three holes. The first two are major.

**f1 (major). The lag is unbounded, and `check()` disagrees with the runtime.**

- **Unbounded lag.** The pending reset waits for the *next admitted event*, which may never come
  while the actor is idle. So the claim "one published snapshot shows the old incarnation" does not
  hold: the old incarnation is published until something else happens.
  - Example: a callback writes `appliedSearch`.
  - The pager stays on page 5 indefinitely.
  - Activities whose params read `memory.pager.page` keep fetching page 5 under the new search,
    which a user sees as an empty page.
- **`check()` disagrees.** Step 1 is "runtime only", and `check()` runs steps 2–6. On the published
  snapshot, `check(s, E.pager.Next())` judges `hasNext` against page 5, while the runtime first
  resets to page 1. This breaks "check agrees with handling".
- **`onLeave` lands in an unrelated turn.** The pending reset's `onLeave` fillings fuse into
  whatever turn comes next. If they write a key that turn's source writes, it is a pre-commit
  defect. When that turn is a delivery, rule 8 is broken.

Fix: apply pending resets in their own **follow-up turn**, queued at the *head* of the mailbox
immediately after the commit that recorded them. That turn:

- runs `onLeave` and arms entry timers;
- publishes a second snapshot;
- is total, because it cannot refuse.

Then:

- the lag is exactly one snapshot;
- `check()` stays consistent;
- `onLeave` never shares a turn with unrelated work.

Persist pending resets as well, or drop them on restore by re-baselining silently, and say which.

**f2 (minor). Commits started in `abandoned`'s pending run.** The pending run is fused into the
user's leaving turn, which is not a late turn. So a compensation started there has outcomes that are
not "from a late turn". Define a late turn's sources as "a commit started from either `abandoned`
run".

**f3 (minor). Which incarnation a delivery addresses.** Rule 9 lets a delivery address "the
incarnation live when its commit started, or one created earlier in the same turn". When the first
is dead and the delivery re-adds the key, say that the in-turn incarnation wins; the sign-in relies
on this. Also qualify "A stale result therefore never lands on a re-added row": the exception is a
row the delivery re-adds itself.

### Sign-in, traced once more

1. **A late strike for a challenge the user left.**
   - X is in flight for c1, and Back's pending run takes `{}`.
   - The user moves to c2 with `Add{c2}`.
   - X settles `WrongCode`. `Add{c1}` is a no-op, and `Strike{c1}` reaches the incarnation that was
     live when X started.
   - On a third strike, the lock runs and `onLocked` alternative 2 runs (`OtherChallenge`).
   - On unlock, `onUnlocked` alternative 2 raises `Remove{c1}`. ✓
2. **Two challenges.** The instances are independent. `isCurrent` filters the other challenge's
   lock and unlock, and an unlock removes only its own key. ✓
3. **Timeout, then a late settlement.**
   - At 15 seconds, `unknown` maps to `CodeUnchecked` and the user goes to ENTERING. The leaving turn
     fuses the pending run (`{}`).
   - X stays pending, so Submit is denied with `StillChecking`. One guess stays in flight.
   - The real `WrongCode` reaches `abandoned` and strikes. A third strike moves the idle ENTERING
     user to LOCKED_OUT in a late turn; this is allowed, because ENTERING holds no fenced commit. ✓
   - A late *success* is ignored (`{}`), and the user re-enters a code that may already be consumed.
     This is acceptable, but say so in §3.1.
4. **Back keeps the resend cooldown.**
   - Resend at t=0, Back at t=10 (frozen, `dueAt` 30), return at t=20: Resend is refused until t=30.
   - Return at t=40: the overdue firing runs once on return. ✓
   - Two notes:
     - For the one snapshot before that firing turn, `done` is still armed, so `canResend` is false
       briefly.
     - The cooldown is per TWO_FACTOR, not per challenge. A new challenge inherits it. This is
       consistent with the spec. Add `resetOn: challengeId` if per-challenge is wanted.
5. **Leftovers.** `CodeAccepted` removes every key. But a late `WrongCode` for an abandoned c1 that
   arrives after sign-in re-adds c1 inside SIGNED_IN, and nothing removes it. Instances for
   challenges that never locked also stay until sign-in. Both are harmless, but list growth is not
   fully closed.

### Verdict

M1–M8 are closed, and the four v3 rules M3, M5, M6 and M7 had broken hold again. The one new hole is
f1, the pending-reset lag and `check()` mismatch. Fix it with an immediate follow-up turn before the
plan edit. f2 and f3 are wording.
