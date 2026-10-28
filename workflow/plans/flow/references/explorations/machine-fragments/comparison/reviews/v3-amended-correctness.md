# proposal-v3 (amended after the build): correctness check of the changed rules

**Scope:** only what changed in the "after the build" pass of
[proposal-v3.md](../../proposal-v3.md):

- rule 6 (fallthrough, abandon on exit only);
- rule 7 (raised events arm `armOn`; pre-turn payload mappers; ordered raises);
- rule 9 (`canAdd` / `canRemove`, host `Remove`, author-chosen keys);
- P1's single mapper form, optional subroutine states and nesting;
- P10's `abandoned` as an ordered handler that may raise into root traits;
- namespaced operations and `token.is(state)`;
- P13's `revertOnUnknown`;
- the rewritten sign-in.

Severity is as before. I trace the sign-in in full first.

**Verdict.** No blockers. Four majors, all about the new combinations:

- static checks against guarded alternatives;
- public list events on a host-owned list;
- parallel guesses through Back and return;
- E5 through `abandoned`.

The individual rule changes are sound.

---

## 1. Sign-in, traced

### Three wrong codes on c1

1. PasswordAccepted(c1). Alternative 1 checks `lockouts.key(c1)`, which is not armed, so alternative 2
   enters TWO_FACTOR with `wrongAttempts` 0.
2. Two wrong codes take CodeWrong alternative 2, so `wrongAttempts` reaches 2.
3. On the third, CodeWrong alternative 1 moves to LOCKED_OUT and raises `code.Reset`, then
   `lockouts.Add { c1 }`, then `lockouts.Start { c1 }`:
   - Raises run in order, so `Start` finds the instance that was just added (rule 7).
   - The raised `Start` arms `armOn` (rule 7 and P7).
   - `Start` notifies `onStart`. Its alternative 1 is denied, because the pre-turn state is
     VERIFYING, so alternative 2 (`"self"`) runs.

   One state change. ✓ But see M1: this only holds when guards are evaluated at runtime.
4. While locked: typing is denied (`canEdit`), Submit is Unhandled, and Resend works. ✓
5. Five minutes later, `Done { c1 }` notifies `onDone`. Alternative 1 (LOCKED_OUT, same key) moves
   to ENTERING, sets `wrongAttempts` to 0 and raises `Remove { c1 }`, which applies after the
   turn's other parts. ✓

### A late third wrong code after Back and return

Start from c1 with 2 wrong codes, then Submit X (slow).

1. **Back.** `abandoned` runs with `"pending"`: alternatives 1 and 2 are denied (no tag), and
   alternative 3 (`{}`) runs. ✓
2. **PasswordAccepted(c1).** Alternative 2 enters ENTERING with `wrongAttempts` still 2. ✓
3. **X settles `WrongCode`** in a turn of its own, and `abandoned` alternative 1 runs: `wrongAttempts`
   becomes 3, and it raises `Add` then `Start` for c1. `Start` notifies `onStart`, whose alternative
   1 now passes (pre-turn state ENTERING, same key), so the actor moves to LOCKED_OUT, sets `error`
   to null and raises `code.Reset`. **It locks at once, with a correct countdown.** ✓ The move is
   indirect; see §3.
4. **If the user is in PASSWORD when X settles:** `onStart` alternative 2 runs, and the next
   PasswordAccepted(c1) takes alternative 1 into LOCKED_OUT with the countdown still running. ✓
5. **If the user has already submitted Y for c1 when X settles** (VERIFYING): the lock starts but
   `onStart` stays put, and the outcome depends on Y:
   - If Y is wrong, CodeWrong alternative 1 raises `lock` again. `Add` is a no-op, but `Start`
     **re-arms**, so the lockout restarts from now (m1).
   - If Y is right, the user is **signed in although the challenge is now locked** (see M3).

### Two challenges

1. c1 is locked. Back, then PasswordAccepted(c2): alternative 2 gives `wrongAttempts` 0.
2. Three wrong codes on c2 lock `lockouts[c2]`, a separate instance. ✓ The build's single-slot bug
   (b1) is fixed.
3. Back, then PasswordAccepted(c1): alternative 1 finds c1 armed, so LOCKED_OUT. ✓
4. c1's lock ends while the user is on c2: `onDone` alternative 2 runs, leaves `wrongAttempts`
   (c2's) untouched, and removes c1. ✓
5. **Still open (m2):** c1 with 2 wrong codes, then c2, then c1 again gives `wrongAttempts` 0.
   Attempts live in one host slot, not per challenge.
6. **Also lost (m2):** a late wrong code for c1 that settles while the user is on c2 fails
   `wrongHere`, so it is not counted.

---

## 2. Majors

### M1. Static checks versus guarded alternatives

The sign-in's third-strike turn fuses two parts that could each change state, could each write
`error`, and could each raise `code.Reset`:

- **CodeWrong alternative 1:** moves to LOCKED_OUT, writes `error`, raises `code.Reset`.
- **`onStart` alternative 1:** moves to LOCKED_OUT, writes `error`, raises `code.Reset`.

Rule 7 forbids both "two state changers" and overlapping keys. Rule 8 requires every raise to
reach a child that is active; `onStart` alternative 1 raises into `code`, which is placed `.at`
TWO_FACTOR and is absent in PASSWORD. These are safe only because of guards on `state`.

If `flow check` treats guards as opaque, as every earlier round said it must, **v3's own flagship
example fails its own checks**. If the checks run only at runtime, they are not "a construction
error" as stated.

**Fix:** state that `flow check` understands **state-token guards** (`S.X.is(state)`) structurally,
and prunes alternatives they exclude. Any other overlap is a runtime pre-commit defect plus a
`flow check` warning. Either way, say which rules are construction errors and which are runtime
errors.

### M2. Public `Add` and `Remove` on a host-owned list

Rule 9: `Add` and `Remove` are public, refused only by optional `canAdd` / `canRemove`, which
default to **allow**. The sign-in fills neither for `lockouts`. So any sender (UI code, an agent, a
test) can do this:

1. While c1 is locked, send `E.lockouts.Remove({ keys: ["c1"] })`. The instance and its schedule are
   gone, and `onDone` never fires.
2. The actor sits in LOCKED_OUT with nothing to end it except Back.
3. Back, then PasswordAccepted(c1): alternative 1 finds nothing armed, so alternative 2 enters
   ENTERING with `wrongAttempts` 3. Submit no longer checks the count (the build's lock on Submit
   was dropped), so **a fourth guess is allowed**.
4. Repeat for unlimited guesses.

`E.lockouts.Add({ key })` can also create stray instances.

This is H1/E1: a host-owned fact (which challenges are locked) is writable from outside. Rule 9's
"`Remove` never refuses when the host raises it" makes guarding cheap, but the example doesn't
guard. The info finding for unfilled optional guards is the only signal.

**Fix:**
- In the example, fill `canAdd: () => deny("HostOnly")` and `canRemove: () => deny("HostOnly")`
  (host raises bypass them).
- Better, give a list a host-only mode (`.list({ key, events: "host" })`) that turns `Add` and
  `Remove` into `hostEvents`.
- Restore a Submit alternative that locks when `wrongAttempts >= 3`, as defence in depth.

### M3. Parallel guesses through Back and return

Submit is unhandled in VERIFYING, but Back plus return creates a fresh ENTERING, and Submit there
checks only the code format. With `verifyCode` at `allow` (the concurrency the build chose, and the
one the example needs so that Y isn't `notSent`), this happens:

1. At 2 strikes, Submit X, then Back and return.
2. Submit Y, then Back and return.
3. Submit Z, and so on.

Every guess is in flight before any settles, so `wrongAttempts` sees them only afterwards: **N
guesses against a limit of 1**. Late strikes then lock, but one of the guesses may already have
signed the user in (the Y-correct case in §1).

**Fix:** guard Submit with `!O.Auth.verifyCode.pending(g, { challengeId })`, which P3 provides. Or
key `verifyCode` by challenge with `reject`, so a second guess answers `notSent` ("Couldn't check").
Say which, in the example.

### M4. E5 through `abandoned` is convention only (open question 1)

P10 says `abandoned` has no `target`, but it may raise into root traits, and a root trait's
callback may target anything (rule 6). So a late result can move the actor. In the sign-in,
`onStart` alternative 1 is guarded by ENTERING and the same challenge, so it never preempts live
work.

Loosen that guard to `S.TWO_FACTOR.is(state)` and this happens: X's late strike arrives while Y is
in VERIFYING. The actor jumps to LOCKED_OUT, **which abandons Y's fenced verify** (Y goes to
`abandoned`). A newer live step was yanked by a late outcome. That is exactly E5, and nothing
checks it.

**My view:** the capability is worth keeping. The sign-in shows why: locking at once is the right
behaviour. It is acceptable only with a mechanical rule. Proposal:

> In a turn whose source is `abandoned` (directly, or through raises and callbacks), any alternative
> whose target would exit a state holding an outstanding fenced commit or an active subroutine is
> treated as **denied**. The next alternative is tried. Rule 8's final unguarded alternative must
> therefore be non-moving (or `"self"`).

`flow check` can verify the second sentence structurally. The runtime enforces the first. Then a
late result may move a user who is *idle*, and can never preempt live work. Marking such callbacks
(open question 1's alternative) only documents the hazard; it doesn't prevent it.

---

## 3. The changed rules, one by one

| Change | Check | Verdict |
| --- | --- | --- |
| Raised events arm `armOn` (rule 7, P7) | Countdown, Flash and the lockouts all arm. A raise that re-arms restarts the timer (m1) | **Sound.** Closes UNCLEAR 11. |
| Fallthrough inside subroutine states; only an exit abandons (rule 6, Machines O2) | Root pin outcomes during HOLDING are delivered; an ancestor `"self"` does not abandon; an explicit re-entry of the subroutine's own state does (exit and enter) | **Sound.** Say the re-entry case explicitly. |
| Pre-turn reads for `raise`, `notify` and `exits` mappers (rule 7) | The pin flash keeps the title; the `lock` mappers read `challengeId` correctly | **Sound.** A mapper that reads list membership after an `Add` raised earlier in the same turn sees the *old* list (m3). |
| `canAdd` / `canRemove`; host `Remove` never refuses (rule 9) | Delivery-raised `Remove` (`forget`) can't be refused; the signup page guards work | **Sound**, but the defaults allow (M2). |
| Author-chosen keys; per-challenge lockouts (rule 9, 3.1) | `Add` of an existing key is a no-op, then `Start` re-arms; separate instances per challenge | **Sound.** Fixes the build's b1. Attempts are still a single slot (m2). |
| Removing an instance from its own callback, applied "after the turn's other parts" (open question 2) | `onDone` raises `forget` for its own key; the instance's `Done` handler and notify have already run | **Sound.** "After" is checkable: Remove becomes the last effect of the fused turn. |
| One mapper form `(value, { input, attempt })`; `retrying` gets `{ retry, error }` | Pins, retries | **Sound.** |
| Optional subroutine states | `Confirm` as a leaf | **Sound.** |
| Nesting (`Flash` with a `Countdown` child) | `Show` raises `timer.Start`, which re-arms; `onDone` clears; both unguarded, so rule 8 holds | **Sound.** |
| `abandoned` as an ordered handler that may raise into root traits | Total alternatives; the pending run is fused; key overlap is a defect | **Sound as a shape;** E5 is M4. |
| `operations` groups; `token.is(state)` | Notation only | **Sound.** |
| P13 `revertOnUnknown` | Removes the optimistic writes at once, still invalidates and refetches | **Sound.** If the write did apply, the row shows unpinned until the refetch lands. That is acceptable and stated. |

---

## 4. Minors

- **m1.** A second `lock` for an already-locked challenge re-arms `Start` and **extends** the
  lockout. A late X followed by a wrong Y does this. Guard: skip `Start` when
  `lockouts.key(c)?.done` is armed, or let `Add`'s no-op case suppress the following `Start`.
- **m2.** Attempts are per host, not per challenge. A late strike for a challenge the user has left
  is lost, and returning resets the count. Put the attempt count in the keyed instance (Countdown
  with memory, or a `Strikes` trait listed by challenge).
- **m3.** Pre-turn mapper reads don't see list instances added earlier in the same turn. Document
  it, or apply `Add` before later mappers read membership.
- **m4.** `canAdd` / `canRemove` (like every optional guard) default to allow. That is an info
  finding only. For a list placed at the root and fed by the host, a `flow check` warning is better
  (M2).

---

## 5. Must change before building

1. **M1:** define how static checks treat guarded alternatives, with state tokens understood
   structurally. Otherwise the sign-in is rejected by its own rules.
2. **M2:** add a host-only list mode, or fill `canAdd` / `canRemove` in the sign-in, and restore the
   lock on Submit at the attempt limit.
3. **M3:** guard Submit with `.pending`, or use per-challenge `reject` concurrency.
4. **M4:** at runtime, deny abandoned-sourced alternatives that would exit live work, and require a
   non-moving final alternative (open question 1).
