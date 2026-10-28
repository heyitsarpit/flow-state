# build-v3: correctness review

The lens is the same as [correctness.md](correctness.md): trace each app against
[apps.md](../apps.md) with S1–S3, look for concrete bugs as event sequences, and separate what holds
by construction from what holds by convention.

- **Build:** [build-v3.md](../build-v3.md), from [proposal-v3.md](../../proposal-v3.md) as revised
  after [v3-correctness.md](../../reviews/v3-correctness.md).
- **Compared with:** [build-b-locked-split-amended.md](../build-b-locked-split-amended.md), "amended
  B" below.

**Verdict.** The build is the most correct of all the builds so far.

- **Bugs:** none that apps.md forbids outright.
- **Deviations it states:** three. The S3 revert is not immediate, a late third strike locks late,
  and invite Add works on every page.
- **Further narrow bugs found:** two, both in sign-in.

All five v3 majors are fixed, and the builder used them as intended. Of the 19 UNCLEAR items, four
are real semantic gaps, and one of them would lock sign-in forever under the other reading. The
rest are missing syntax.

---

## 1. Two-factor sign-in

### Traces

| Sequence | Result | OK? |
| --- | --- | --- |
| Three wrong codes | The third takes CodeWrong alternative 1, `lockNow`: LOCKED_OUT, `lockedChallenge` = c1, raises `code.Reset` and `lockout.Start`. Both are unguarded hostEvents (rule 8) | ✓ |
| Locked: type, Submit, Resend | `canEdit` is denied; Submit is Unhandled; Resend passes `schedules.resendCooldown.done === undefined`, then raises Start | ✓ |
| Back, then PasswordAccepted(c1) while locked | Alternative 1 (armed lockout, same challenge) goes to LOCKED_OUT; the countdown is unchanged; the resend cooldown is fresh | ✓ (S1) |
| The lockout ends in LOCKED_OUT, or while away | `onDone` alternative 1 goes to ENTERING and resets; alternative 2 resets only the locked challenge | ✓ |
| Submit X (slow), Back, PasswordAccepted(c1), Submit Y | X is fenced to the old VERIFYING. Its late `WrongCode` goes to `abandoned`, which adds 1 when the challenge matches. Y's outcome reaches the new VERIFYING and reads the updated count. With `allow`, Y is never `notSent` because of X | ✓ (P2/P10) |
| X is the third wrong code and settles while the user is in ENTERING | `canEdit` refuses typing (the second guard); Submit takes alternative 1 and locks; the countdown starts **at that Submit** | stated deviation (v3 open question 3) |
| X is the third wrong code and settles while the user is in PASSWORD | PasswordAccepted(c1) takes alternative 2: lock on entry | ✓ |

### Bugs

- **b1 (minor). There is one lockout slot.**
  1. Lock c1.
  2. Back, then PasswordAccepted(c2), and lock c2. `lockout.Start` re-arms, and `lockedChallenge`
     becomes c2.
  3. Back, then PasswordAccepted(c1). Alternative 1 fails (the locked challenge is c2) and
     alternative 2 fails (`challengeId` is c2), so alternative 3 runs: ENTERING with
     `wrongAttempts: 0`.

  Challenge c1 regains three attempts while its lock should still be running. The builder notes
  this. It needs two server-issued challenges, so the risk is low, but S1's "for the same
  challenge" is not met after an intervening challenge. A per-challenge `.list` keyed by
  `challengeId` would fix it (that is v3 open question 2: author-chosen keys).
- **b2 (minor). Attempts are lost across challenges** by the same mechanism, without any lock. c1
  has 2 wrong codes, then c2 is issued, then c1 returns: `wrongAttempts` is 0.

### By construction or by convention

| Behaviour | How it holds |
| --- | --- |
| Late results never reach a newer attempt | **construction** (P2) |
| A late wrong code still counts | **construction of the route** (P10); the counting is host code |
| Lockout and cooldown lifetimes | **construction** (placement: root versus `.at`) |
| Host keys (`wrongAttempts`, `lockedChallenge`) | **convention**: reset by hand on five paths (FAKED; node memory is deferred) |

**Compared with amended B: better.** Amended B drops a wrong code that settles after Back, because
it fences without an `abandoned` handler (its own text says so). That makes "verify, Back,
re-enter" a free extra guess. v3 counts it.

---

## 2. Signup wizard

### Traces

- **Pages and drafts.** Next, Back and Cancel then Keep use `S.WIZARD.history` (P5). The drafts are
  root traits; each field's `canEdit` is `onPage(…)`. ✓
- **Invites.** These are keyed instances.
  - A keystroke to a removed key is Unhandled (rule 9), so a stale `Changed` can't land on a
    neighbour. ✓
  - Next raises `Remove` (which never refuses) for the empty entries. ✓
- **Submit.** The commit is fenced to SUBMITTING, with `retry: { on: ["Busy"] }` on
  `exponential(1s)` with `recurs(3)`, so 1, 2 and 4 seconds.
  - `retrying(n)` updates the counter; the final Busy goes to REVIEW with "Try again later".
  - `EmailTaken` goes to ACCOUNT.
  - `unknown`, `interrupt` and `defect` go to UNSURE.
  - Cancel is Unhandled while submitting. ✓
- **D2.** The retry resends the admitted input (P4), so edits during SUBMITTING can't change it,
  and the fields are refused off-page anyway. ✓
- **The dialog blocks the pages** by construction (CANCELLING is a sibling state). ✓

**Bugs:** none.

**Deviation:** `invites.Add` and `Remove` work from any page and while submitting. That is harmless
here: the commit's input is admitted, and Add creates only empty rows, which Next drops. It is a
view convention (FAKED / UNCLEAR 14).

**Compared with amended B: better.** Amended B still has `FieldList` duplicating `Field` (its one
remaining FAKED item), with index-addressed entries. v3's keyed list closes the stale-index hole by
construction.

---

## 3. Issue list

### Traces

| Behaviour | Result | OK? |
| --- | --- | --- |
| Search | Debounce re-arms on every `Changed` (`armOn`). Settled writes `applied`. In the same turn, pager `resetOn` (search, sort, status) goes to page 1, and selection `resetOn` (the whole query including the page) clears. This is the fixed point, in one publication | ✓ |
| Sort, status, page | They change memory; `resetOn` resets the pager and selection | ✓ by construction (no raise per handler) |
| Select all | A `SelectPage` event with no ids raises the `SelectAll` hostEvent with ids taken from the lane | ✓ (S2); the view cannot send ids |
| Toggle | `canToggle` requires the row on this page | ✓ |
| Pin | The guard array is "on the page" plus `!setPinned.pending(id)` (P3). It is a root `"self"` commit, fenced to the actor, so its outcomes are handled at the root in every state, including HOLDING and DELETING (UNCLEAR 16) | ✓ |
| Pin failure (any kind) | Per-row attribution through P1 `{ input }`; a flash with the copied title | ✓ |
| Pin unknown | The flash and refetch happen at once; the row keeps the optimistic value until the refetch lands | **stated deviation** (S3's "reverts" is not immediate: P13 was cut) |
| Hold | HoldStart (with a selection) enters HOLDING. Release leaves it (Cancelled). Held fires `Confirmed`, which re-checks `hasSelection`, so a query change mid-hold resets the selection (`resetOn`) and lands in BROWSING | ✓ (`resetOn` mid-hold is handled) |
| Delete | The commit is fenced to DELETING. Success clears and refetches; failure flashes "Delete failed"; `unknown`, `interrupt` and `defect` flash "Delete may have happened" and refetch | ✓ (P9 forces the last two to be uncertain, which is conservative) |
| Refresh | A 30 s root schedule | ✓ |

**Bugs:** none found.

**The title copy is a D1 copy.** `pinTitles` is a copy, but a correct one: it lets the flash name a
row that has already left the page. Amended B reads the title from the lane and falls back to
"issue" in that case. v3 is better for output; the copy is keyed by row and dropped on every
outcome.

**Compared with amended B: equal or better.**
- **Equal:** `.pending`, P1 attribution, hold, delete.
- **Better:** `resetOn` instead of raising `queryReset` and `Clear` from every query handler
  (amended B still keeps that by convention), and the correct title in the flash.

---

## 4. Were the v3 review majors really fixed?

| Major | As written in v3 now | As the builder used it | Status |
| --- | --- | --- | --- |
| M1 P2 default fencing | Stays the default. `flow check` rejects outcome handlers outside the fenced state; the O2 break is stated | Every outcome is handled in its fenced state. A root `"self"` pin lives with the actor. Resend has no outcomes, so its late result is dropped | **Fixed.** The design choice is visible and checked. |
| M2 `abandoned` payload | `{ outcome, tag?, value?, input, attempt }`; key overlap with the leaving turn is a defect | Uses `tag` and `input` (counting wrong codes) | **Fixed.** `attempt` and `value` are available; the build has no unknown to reconcile. |
| M3 keyed lists | `E.invites.key(k)`; a removed key is Unhandled; its timers stop | React keys plus `key(f.key)` sends | **Fixed.** Only Story syntax for seeding keys is missing (UNCLEAR 6). |
| M4 `resetOn` fixed point | Inside the turn, after raises, repeated to a fixed point, one publication | Pager, then selection, which sees the reset page in the same turn | **Fixed.** |
| M5 rule 8 totality | Covers outcome, exit and timer handlers, transitively | Every outcome is unguarded-total, and both `onDone` fillings end unguarded | **Fixed.** It depends on UNCLEAR 16 (see below). |

---

## 5. The 19 UNCLEAR items: real gap or syntax?

| # | Item | Verdict |
| --- | --- | --- |
| **11** | Does a **raised** hostEvent arm an `armOn` schedule? (P7 says "a transition … is accepted") | **Real gap, critical.** Under the other reading, `lockout.Start` and `resendCooldown.Start` (always raised) never arm. LOCKED_OUT then never ends (an L4 trap): `onDone` never fires and the lockout guard never sees an armed schedule. Flash never clears. State that a fused raised transition arms. |
| **16** | Do ancestor and root host handlers run while inside a subroutine state, and does an ancestor `"self"` abandon it? | **Real gap, high.** Rule 8 and P2 for root-fenced pins rely on root handlers catching outcomes during HOLDING. If a subroutine state blocked fallthrough, pin outcomes during a hold would be lost (rule 8 violated). State that ordinary O2 fallthrough applies and that only a transition that **exits** the state abandons it (v2 had to fix the same wording). |
| **15** | What does a raise's `.from` mapper read: the pre-turn snapshot or post-update memory? | **Real gap, medium.** The pin flash reads a title the same turn deletes. Under post-update reading, it says "Couldn't pin issue". State pre-turn, as Machines O3 does for action parameters. |
| **14** | Can a host guard a list's `Add` or `Remove`? | **Real gap, low.** No bug here, but a list whose rows must not change in some states has no refusal point (H2). Add an optional `canAdd` / `canRemove` guard port. `Remove` must still never refuse when raised from a delivery. |
| 13 | Inline guards inside fragments (`Pager.Previous`) | **Mostly syntax**, but say yes: otherwise a fragment can't protect its own invariants (page ≥ 1). |
| 2 | Spelling of a required port | **Syntax**, with an A6 edge: if a bare `{}` were read as "ignore", a required guard would silently allow. Spell it out. |
| 8, 7, 10 | Where host and subroutine schedules sit; namespace clashes; a trait without memory | **Syntax and snapshot shape.** A clash between a host schedule and a trait instance name must reject, or views read the wrong `dueAt`. |
| 3 | Types of shared helpers outside a node, and reading `.at` slices | **Syntax/types.** A helper that reads an absent `.at` slice would throw a pre-commit defect at runtime, so the type should prevent it. |
| 1, 4, 5, 6, 9, 12, 17, 18, 19 | `operations` namespacing, `is(state)`, the P1 mapper argument shape, Story key seeding, nesting syntax, a subroutine without states, the `optimistic` shape, Story `send` turns, history visibility while CANCELLING | **Missing syntax or plan wording.** No correctness risk. Nesting (9) caused a duplicated timer, not a bug. |

---

## 6. Against amended B, overall

| App | v3 build compared with amended B |
| --- | --- |
| Sign-in | **Better.** Late wrong codes count, so Back can't buy an extra guess. Lock on entry or Submit after a late strike. |
| Signup | **Better.** Keyed list instead of the duplicated `FieldList`. History, retry and D2 are equal. |
| Issue list | **Equal or better.** `resetOn` replaces per-handler raises; the flash names a row that left the page. |

Both builds share two deviations: the S3 revert is not immediate, and the late-strike lock starts
late in v3 (amended B doesn't count the strike at all).

---

## 7. v3 changes needed, ranked

1. **`armOn` and raised transitions (UNCLEAR 11):** "a raised event that is accepted in the fused
   turn arms `armOn` schedules". Without it, every Countdown or Flash driven by `raise` never arms,
   and sign-in can be stuck in LOCKED_OUT.
2. **Subroutine states and ancestor handlers (UNCLEAR 16):** state that O2 fallthrough applies
   inside a subroutine state for host events, and that only a transition that **exits** the state
   abandons it (an ancestor `"self"` does not). Rule 8 and root-fenced commits depend on it.
3. **Raise mapper reads (UNCLEAR 15):** state the pre-turn snapshot, like guards and action
   parameters.
4. **A late result that must act (open question 3):** let `abandoned` raise unguarded hostEvents
   into **root** traits (still never moving the actor). Or add a host internal event it may enqueue
   as a later turn, so a late third strike can start the lockout when it settles.
5. **List guard ports (UNCLEAR 14):** optional `canAdd` / `canRemove`, where a delivery-raised
   `Remove` stays unrefusable.
6. **Port spellings (UNCLEAR 2 and 13):** spell a required port, and allow inline guards over a
   fragment's own memory.
7. **Snapshot paths (UNCLEAR 7, 8 and 10):** host and subroutine schedules, a namespace collision
   rule, and traits without memory.
8. **Immediate revert on unknown (S3, open question 1):** reinstate P13 as an opt-in. It must still
   invalidate and refetch.
9. **Per-key policy (b1, b2; open question 2):** author-chosen list keys (`.list({ key })`), so
   per-challenge attempts and lockouts are expressible.
10. **Syntax only:** nesting (9), the P1 mapper argument (5), `is(state)` (4), `operations`
    namespacing (1), Story key seeding (6), a subroutine without states (12), history visibility
    (19), and the plan gaps `optimistic` (17) and Story `send` (18).
