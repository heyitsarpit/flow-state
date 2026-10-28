# proposal-v3: correctness and static analysis review

The lens and severity scale are those of the earlier rounds:

- **blocker:** a legal program silently reaches a wrong state that matters.
- **major:** a guarantee is convention only, a sample breaks a rule, or a plan's meaning changes
  silently.
- **minor:** wording, a narrow race, or a spec gap with an obvious fill.

Checked against [principles.md](../principles.md), Machines/Operations as written, and
[comparison/amendments.md](../comparison/amendments.md).

**Verdict: no blockers, five majors, ten minors.** v3 keeps v2's I/O guarantees by moving them into
Operations, and the sign-in example traces correctly. The majors are in four of the new pieces:

- **P2** changes O2 for every commit, with no opt-in.
- **P10** drops the Attempt.
- **List instances** are addressed by index.
- **`resetOn`** is order-dependent.

All five majors are fixable without changing the shape.

---

## 1. The sign-in example, traced

| Sequence | Result | OK? |
| --- | --- | --- |
| PasswordAccepted(c1) | TWO_FACTOR.ENTERING; `code` and `resendCooldown` activate fresh; `wrongAttempts` is 0 | ✓ |
| Type 5 digits, then Submit | Alternative 1 is denied (`TriesLeft`); alternative 2 is denied (`InvalidCode`); `check()` reports both | ✓ |
| Type 6, then Submit (wrong) | VERIFYING, with `verify` fenced to this activation. `CodeWrong` takes alternative 2: ENTERING, `wrongAttempts` 1, "2 tries left", raises `code.Reset` (unguarded) | ✓ |
| A 3rd wrong code | Alternative 1: LOCKED_OUT, `wrongAttempts` 3, raises `code.Reset` and `lockout.Start`. Both are unguarded `hostEvents`, so rule 8 holds | ✓ |
| While locked: type, Submit, Resend | `canEdit` denies `LockedOut`; Submit is Unhandled; Resend is allowed if the cooldown is not running, and it raises `resendCooldown.Start` | ✓ |
| Back, then PasswordAccepted(c1), while the lockout runs | Alternative 1 goes straight to LOCKED_OUT; the root `lockout` trait survived | ✓ |
| The lockout ends in LOCKED_OUT | `onDone` alternative 1: ENTERING, `wrongAttempts` 0 | ✓ |
| The lockout ends while in PASSWORD | Alternative 2: `"self"`, `wrongAttempts` 0 | ✓ |
| Submit X (slow), Back, PasswordAccepted(c1), Submit Y | X is fenced to its VERIFYING (P2). Its late `WrongCode` goes to `abandoned` and counts against c1. Y's own outcome reaches the new VERIFYING. **The late-result bug from the builds is gone.** | ✓ |
| Same, but X is the 3rd wrong code and the user is back in ENTERING when it settles | `abandoned` sets `wrongAttempts` to 3, but nothing locks. The user can type; the next Submit locks (alternative 1), and the 5 minutes start **then** | m1 (open question 5) |
| PasswordAccepted(c2) for a *different* challenge while locked | Alternative 1 locks anyway. That contradicts the stated "lockout for the same challenge" | m2 |

Resend and the cooldown work. With B1, `Countdown.Start` no longer refuses, so the cooldown is
enforced by the host guard `!memory.resendCooldown.running`, which reads the pre-turn snapshot.
That is correct, and better than refusal by a child, because a refusal from an outcome-raised
Start would have been forbidden by rule 8 anyway.

---

## 2. Majors

### M1. P2 silently changes Operations O2 for every existing commit

**The O2 rule today:** "State exit does not cancel finite work; its event reaches the actor's later
state."

**P2:** every host commit is fenced to the state its transition enters. A late result goes to
`abandoned` if declared, and is otherwise **dropped with evidence**.

**Why that breaks existing code:** machines written to O2 rely on root handlers catching late
results. The reference editor's root `Saved` handler is commented "a reconcile that settles after
Close still lands". The sequence:

1. SaveRequested enters SAVING.
2. Close moves to CLOSED.
3. The save succeeds.

Under P2, the result is fenced to SAVING. With no `abandoned`, it is dropped. `saved` stays stale,
and CLOSED shows the old title while the server has the new one. The code still compiles, and
nothing reports it.

**A second trap.** "For `"self"`, the handler's state" makes fencing depend on *where the handler
is written*:

- A pin handler written at the root lives as long as the actor.
- The same handler written in BROWSING has its results dropped as soon as HOLDING is entered.

**Fix:** make fencing opt-in, or opt-out loudly. For example, fence only when the commit declares
`abandoned` (or `fence: true`), and keep O2 otherwise. Or add a `flow check` error when a fenced
commit's outcome events are handled at an ancestor or the root, outside the fenced state. Either
way, state that P2 is a breaking change to O2.

### M2. P10's `abandoned` has no Attempt

The payload is `{ outcome, tag?, input }`. A late `unknown` (or `interrupt` or `defect`) after
leaving cannot be reconciled with `O.x.retry(attempt)`, because the Attempt is gone. The host can
only resubmit, which mints a new Attempt and risks a double write. That is the exact hazard v2 closed.

P12 has the same gap: "if its activation did not survive, it goes to `abandoned`", but without the
Attempt that restored `unknown` is unreconcilable. A late success's value is also missing, so the
host cannot record what the server returned.

**Fix:** use `{ outcome, tag?, input, attempt, value? }`. The Attempt is always present for
admitted commits; `value` is present on success.

### M3. List instances are addressed by index (B2; open question 1)

**Stale indexes.** `Remove { indexes }` shifts later instances, and events address `E.invites[i]`.

1. Invites are [a, b, c]. The user is typing in c (index 2) and clicks Remove on a.
2. The mailbox holds Remove {0}, then Changed@2.
3. After the Remove, index 2 no longer exists, so the keystroke is dropped (or lands on the wrong
   instance if one was added).

React handlers capture `i` at render, so this happens in real use, not only with stale views.

**Callback payloads carry `index`.** A host that starts I/O from a list callback and maps the
result by that `index` (rather than by an input id, P1) writes to whatever instance now sits at
that index. That is L2 at list scale.

**Instance timers and arming ids under a shift are unspecified.** Does instance 3's Debounce keep
its deadline when it becomes instance 2?

**Fix:** keyed instances (`.list({ key })`, or a framework-minted id per Add). Events then address
by key, callback payloads carry the key, and timers follow the key. Index addressing can stay as
view sugar.

### M4. `resetOn` is order-dependent, and can re-create the "delete rows you can't see" bug

Rule 1: selections are compared after each committed turn, "in declaration order, so one reset can
trigger the next".

**Scenario:** declare `selection` (`resetOn: listQuery`, which reads `pager.page`) **before** `pager`.

1. SortChanged commits.
2. `selection` compares first. Sort changed, so it resets.
3. `pager` resets to page 1.

That case works. Now the user is on page 3 and changes the search:

- The page change happens *after* `selection`'s comparison in the same pass.
- The search change already reset the selection, so this case is harmless.

The harmful case is a reset that only the page change triggers:

1. A host handler resets `pager` through `pager`'s own `resetOn` (which reads `appliedSearch`).
2. `selection`'s selection is `page` alone.
3. `selection` was declared first, so it already compared and saw no change.
4. The selection now spans page 1's rows while the user sees page 1 or page 3.

The fix is the same either way: compare to a fixed point, or reject at construction a `resetOn`
that reads memory a later-declared reset can write.

Also unspecified:

- whether resets join the **same publication** as the turn (otherwise views and `check()` see a
  snapshot whose query has changed but whose selection has not);
- how a reset interacts with a raise into the same trait in that turn (SelectPage's `SelectAll`
  plus a query change, which yields an empty selection).

**Fix:**
- iterate resets to a fixed point within the turn's single publication;
- state that a raise into a trait is applied before its reset;
- reject self-feeding resets as a cycle.

### M5. Rule 8 covers raises, not the outcome handlers themselves

"Deliveries are never lost" requires only that a *raise* from an outcome, exit or timer handler be
unrefusable. An outcome event that arrives in its fenced activation, but in a child state that does
not handle it (or handles it only with guards), is still lost. Example: fenced to a compound, but
the outcome is handled only in one child. v2 had this check ("every result handled unguarded in
every state reachable while pending"); v3 dropped it.

**Fix:** extend rule 8 and `flow check`. Every outcome event of a fenced commit must be handled,
ending in an unguarded alternative, in every state of the fenced activation. Exit fillings and
timer handlers likewise. Open question 2 (follow fused chains transitively) should be "yes".

---

## 3. Minors

- **m1. Late 3rd strike (open question 5).** No extra guess is ever granted, because the next Submit
  locks. But the user sits in ENTERING with the attempts exhausted and no countdown, and the 5
  minutes start late. **Fix:** in PasswordAccepted (and ENTERING), when the same challenge has
  `wrongAttempts >= 3`, go to LOCKED_OUT and raise `lockOut`. `abandoned` still needs no `raise`.
- **m2. Lockout scope.** The comment says "for the same challenge", but the code locks any challenge
  while `lockout.running`. Pick one. apps.md S1 says same challenge.
- **m3. Default guards are a silent permission grant (B3).** `canEdit: "allow"` means a host that
  forgets to fill it gets an always-editable field. The v2 review rejected exactly this
  (`guard().optional()`). Harm is limited where P4 freezes retry input, but the A6 verdict
  "Prevented" is wrong: it is "by the fragment author's choice".
  **Fix:** have `flow check` list every defaulted guard as info, or allow only `"required"` for
  guards.
- **m4. P10 and the leaving turn's patch.** The rule says "fused into the leaving turn", but does not
  say whether rule 7's disjoint-keys rule applies between the pending run and the leaving handler.
  Say so: an overlap is a construction error, as v2 decided.
- **m5. P13.** Say that `revertOnUnknown` still invalidates the entry and refetches. Otherwise a
  write that did apply shows reverted until the next read.
- **m6. P4 retries after abandonment.**
  - When the starting state is left mid-backoff, does the descriptor keep retrying? Today it does,
    and it may create the account after the user left.
  - What does a restore taken between two retries answer (`notSent` for the pending retry, or the
    last failure)?

  Specify both. A natural rule: leaving cancels a not-yet-invoked retry, and the result is `notSent`
  to `abandoned`.
- **m7. P5 history** must be persisted and restored (Persistence), and must be defined for a target
  of `S.X.history` when X is entered from outside for the first time. The default is stated; the
  persistence is not.
- **m8. Countdown keeps `running` in memory next to its schedule.** The two cannot drift (Start and
  Done set both, and leaving drops both), but `s.schedules.X.done !== undefined` would make the flag
  unnecessary. That is cosmetic.
- **m9. Rule 2 "`InvalidEvent` untyped" for `hostEvents`.** Good. Also state that list `Add` and
  `Remove` are public (any sender can remove rows). That is fine for drafts, but say so.
- **m10. `check()` for list events** with a stale index should be `Unhandled` (no such instance),
  not a defect.

---

## 4. Section 4 verdicts

| Row | Claimed | Verdict |
| --- | --- | --- |
| L1, T2 | Prevented | **Agree** (P7, P8, P11). |
| L2, L5, L7 | Prevented for every machine | **L2 agree, with M1's caveat** (it drops results that older code expected). **L5: route prevented, but no Attempt (M2).** **L7: the record exists, but the guard is convention.** The sign-in `abandoned` ignores `"pending"`; it happens to be safe there. |
| L3 | Prevented by placement | **Partly.** It says so itself for host memory. |
| L4, E1, E2, E3, E4, E5, H3, T1 | Prevented | **Agree.** |
| L6, L8 | Prevented | **Agree** for commits. List events with stale indexes are an L8 cousin (M3). |
| H1, H2 | Allowed | **Agree.** |
| H4, H5 | Prevented | **Agree** (P9 plus P4's never-retry list). |
| D1 | Prevented | **Agree.** |
| D2 | Prevented | **Agree** for descriptor retries. A host resubmit reads live memory by design. |
| D3 | N/A | **Agree.** |
| D4 | "As in the plans" | That is **allows** (an issue is published). Say "allows; `uncertain` targets typed". |
| D5 | Prevented (P12) | **Partly:** a restored `unknown` routed to `abandoned` cannot be reconciled (M2). |
| D6 | Prevented | **Agree** for fragment `input`. |
| D7 | Prevented by placement | **By convention** (place drafts in root traits; host keys are reset by hand). |
| A1–A5, A7 | as stated | **Agree.** |
| A6 | Prevented | **By the author's choice** (m3). |

---

## 5. Correct enough to build against?

**Yes, once the following change.** All five are spec edits, not redesigns.

1. **M1:** make P2 opt-in (fence only commits that declare `abandoned` or `fence`), or add a
   `flow check` error for outcome handlers outside the fenced state, and mark P2 as breaking O2.
2. **M2:** add `attempt` (and `value` on success) to the `abandoned` payload. Spell out P12's
   reconcile path.
3. **M3:** use keyed list instances. Callback payloads, events and timers follow the key.
4. **M4:** run `resetOn` to a fixed point within the turn's publication, with raises applied before
   resets.
5. **M5:** extend rule 8 to outcome, exit and timer handlers themselves, transitively (open
   question 2: yes).

Recommended in the same pass:
- m1 and m2 (sign-in lockout re-entry and scope);
- m3 (the default-guard listing, and the A6 wording);
- m4 (P10 key overlap);
- m6 (P4 after abandonment);
- the §4 verdict corrections.
