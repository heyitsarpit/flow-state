# Comparison builds: correctness review

**Lens:** does each build actually implement [apps.md](../apps.md), and which bugs does each system
prevent by construction rather than by convention? Severity is the same as the earlier rounds:

- **bug:** a legal sequence of user or server events produces behaviour that contradicts apps.md;
- **risk:** the behaviour is right only while a convention holds;
- **cosmetic:** wording or test only.

**Builds:**

- **A:** [build-a-v2.md](../build-a-v2.md), proposal v2
- **B:** [build-b-locked-split.md](../build-b-locked-split.md), locked-island split
- **C:** [build-c-single-fragment.md](../build-c-single-fragment.md), one stateless fragment
- **base:** [build-baseline.md](../build-baseline.md), plain machines

---

## 1. Two-factor sign-in

### Bugs found

| Build | Sequence | Wrong result |
| --- | --- | --- |
| **B, C** | Submit code X (the verify is slow), then Back to password, then `PasswordAccepted` for a new challenge, type Y, Submit. | Both verifies are plain host commits. Outcomes "reach the actor's later state" (Operations O2), so **X's outcome is applied to Y's attempt**: a late `CodeAccepted` signs in, or a late `WrongCode` costs a try on the new challenge. If the descriptor key is constant and uses `reject`, Y's verify is declined silently and only X's answer ever arrives. Nothing fences the old step. |
| **base** | The same sequence. Base cancels on Back (`O.verifyCode.cancel`), and verify is keyed by `challengeId`. | A post-invocation cancel reports `unknown`, which lands as `CheckFailed` in the **new** VERIFYING ("Couldn't check the code"). Y's real result then arrives in ENTERING, where it is unhandled and **dropped**. If it was a success, the user must resubmit a one-time code. |
| **C** (story) | `lockout` story: Resend at "locked", then advance 299 s. | The story asserts that `resend.until` is not null at "still-locked", but the 30 s cooldown ended at +30 s. **The test fails.** |

**A has none of these.** The step is a subroutine, its `verify` result is fenced by call id, and Back
abandons it with `abandoned: {}`. A late result can never reach a newer step.

### FAKED items

- **Real risk:**
  - **B:** host step memory is reset by hand on `PasswordAccepted` (forget a key and the old
    attempts leak into the next challenge).
  - **C:** the lockout is "until ≠ null" in a nested slice, so every guard must call `lockedOut()`.
    A new handler that forgets it allows entry while locked.
- **Self-harm only (the actor is client-side), but writable by any sender:**
  - B's public `code.Reset` and `resendCooldown.Start`;
  - C's public `strikes.Strike`, `strikes.lock.Use` and `code.Set`.

  A UI or agent can lock itself out or clear its own code. This is cosmetic for correctness, and a
  real authoring hazard.
- **Cosmetic:** deadline copies for countdowns (all builds); A's `resending` flag (it duplicates the
  runtime's outstanding call, but it is correct).

### By construction or by convention

| Behaviour | A | B | C | base |
| --- | --- | --- | --- | --- |
| "Back keeps nothing" | construction (subroutine memory) | fragments: construction; host memory: convention | construction (`.at`) | convention (`freshStep`) |
| Late verify cannot hit a new attempt | **construction** (fencing) | **not prevented** | **not prevented** | **not prevented** (it misroutes) |
| Lockout refuses entry and Submit | construction (LOCKED state) | construction (state) | convention (memory mode) | construction (state) |
| Resend cooldown spans ENTERING/LOCKED | construction (step-root trait) | construction (trait on node) | construction (`.at`) | convention (one handler placed in two states) |

**A is the only build that is correct for app 1 under all event orders.**

---

## 2. Signup wizard

### Bugs found

| Build | Sequence | Wrong result |
| --- | --- | --- |
| **C** | On ACCOUNT, click Cancel (the dialog opens: `cancel.open = true`), then press Enter or send `Next`. | Next is allowed. The page moves to PROFILE **with the discard dialog still open**. Keep then "returns" to PROFILE, not to the page Cancel came from. On REVIEW, `Submit` with the dialog open starts the commit; Discard is then Unhandled (Confirm is `.at("FORM")`). The FAKED comment admits that only the modal keeps the events out of reach. |
| **C** | Submit, Busy, then during the backoff `E.invites.Add()` (public, and `Add` has no `canEdit`). | The retry re-reads `memory.invites.items` and **sends `["grace@…", ""]`**: an empty invite the Next guard would have dropped. A D2 hole by convention (FAKED at the `TextList` guard slot). |
| **B** | Submit, Busy, then during BUSY `E.email.Changed({ value: "x" })` (all Field `canEdit` are `() => true`). | The retry's `create` select re-reads live fields and **sends a different account** than the one reviewed (D2). The UI hides the fields, so this is reachable only programmatically, but nothing refuses it. |
| — | — | A and base: none found. |

### FAKED items

- **Real risk:**
  - **C:** the dialog as a memory flag (above).
  - **B:** retry policy as host wiring. It is correct now; the next app copies it.
  - **B and C:** fields editable during submit (D2 by convention).
  - **A, B, base:** `returnTo` plus four guard alternatives instead of history (a new page needs a
    new alternative in two places).
- **Cosmetic:**
  - **A:** invites' error is shown at once (no `edited`). apps.md only asks for "after the first
    edit" on the 2FA code.
  - **A, B, base:** the `role!` non-null assertion (the guard chain makes it safe).

### By construction or by convention

| Behaviour | A | B | C | base |
| --- | --- | --- | --- | --- |
| Drafts survive Back, Next and the dialog | construction (root traits) | construction (root traits) | construction (root fragments) | construction (host memory) |
| Dialog blocks Next, Back and Submit | **construction** (DISCARD state) | **construction** (state) | **convention, broken** | **construction** (state) |
| Keep returns to the same page | convention (`returnTo`) | convention | accidental (page unchanged); broken by the bug above | convention |
| Retries send the reviewed request (D2) | **construction** (input captured at entry) | **convention, broken** | convention, broken (`Add`) | **construction** (field handlers exist only on pages) |
| Busy 3× at 1/2/4 s, then Review | construction (CommitWithRetry) | host wiring | fragment plus callbacks | host states |
| Unknown never retried | **construction** (kind-typed; check 9) | convention | convention | convention |
| Cancel refused while submitting | construction | construction | construction (`.at("FORM")`) | construction |

**A and base are correct.** B and C are correct only when every sender is the intended UI.

---

## 3. Issue list screen

### Bugs found

| Build | Sequence | Wrong result |
| --- | --- | --- |
| **C** | Select rows, type in search, then within 300 ms press and hold Delete. The debounce settles mid-hold and clears the selection; keep holding for 1.5 s. | `onHeld` has **no selection guard** (only `canStart` on Press). DELETING starts `deleteMany({ ids: [] })`. apps.md: "Refused when nothing is selected." A, B and base all re-check on completion. |
| **B, C, base** | Select all on page 2, then click Next. The selection is cleared, then a stale "select all" from the previous render arrives with page 2's ids. | Select-all takes **ids from the sender** (FAKED in B and C; base's `PageSelected` too). The selection now holds rows that are not on screen, and a hold-to-delete **deletes issues the user cannot see**. A derives the ids from the lane and guards `RowToggled` on "row on this page". |
| **A, B, C, base** | Pin row R1 and row R2, and R2's commit ends in `interrupt` (or `defect`, except in base and B). | No row id is available, so **every in-flight pin is forgotten** (`pinning: []`). Click R1 again while its first commit is still running: the guard allows it, and `setPinned` (keyed `reject`) **declines it silently**. The click does nothing and shows nothing; the row's optimistic value is not re-applied. B pretends the mapper gets the Attempt (see the shared gaps in §4). |
| **B** | A pin settles `unknown`. | The flash shows "Couldn't pin" at once, but there is **no refetch**. The optimistic value stays (Operations O5), so the row shows pinned until the next 30 s poll. A, C and base refetch. |
| **C** | Press the hold, release at 1.49 s, press again at once. | Without arming ids, a `Held` firing already queued before the re-press is delivered while `pressing` is true again, so **the delete fires early**. The race is narrow. A fences it with arming ids; B and base leave a state, which ends the activation. |

### FAKED items

- **Real risk:**
  - **all:** pin attribution through the error payload or an Attempt key (see §4).
  - **B, C, base:** select-all ids from the sender.
  - **C:** `pins.Begin`/`End` are public, so any sender can unlock a row in flight.
  - **A, B, C, base:** "selection clears on query change" is a hand-repeated patch or raise in every
    query handler. It is correct today in all four, and a fifth query input would need it again.
- **Cosmetic:**
  - **A:** a retry subroutine used as a single-shot commit.
  - **A, B, C, base:** counter idioms for timers.
  - **A, B, C, base:** the flash as memory.

### By construction or by convention

| Behaviour | A | B | C | base |
| --- | --- | --- | --- | --- |
| Hold refused with an empty selection, at press and at completion | construction (guard on `onHeld`) | construction (exit guard) | **press only: broken** | construction |
| Early release cancels | construction (arming id) | construction (subroutine exit) | **convention** (pressing flag; queued-firing race) | construction (state exit) |
| Second click on an in-flight row refused | convention (`pinning` list) | convention | convention, publicly writable | convention |
| Delete outcomes (fail / unknown) | construction (kind-typed exits) | host mapping | host mapping | host mapping |
| Select-all is this page | **construction** (lane) | convention | convention | convention |

**A is correct apart from the shared pin-attribution gap.** C has one plain bug. B, C and base
share the select-all trust issue.

---

## 4. Shared gaps in today's plans (every build hit them)

1. **Outcome attribution for concurrent same-descriptor commits.** Mappers receive values only
   (Operations O2/O6). Per-row pins need the row id back:
   - on failure, it must come from the error payload (an adapter convention);
   - on unknown, from the Attempt key;
   - on interrupt or defect, it is not available at all.

   **Proposed amendment:** outcome mappers receive the Attempt (or the admitted input) as a second
   argument, for every outcome. This is the only fix that also makes `interrupt` attributable.
2. **No "outstanding call" fact a guard can read.** Every build keeps a hand list (`pinning`,
   `resending`, `InFlight`). That list drifts from the runtime when an outcome is unattributable
   (the bug in §3), and `reject` declines silently.
   **Proposed:** a per-key `pending` read on transaction descriptors, or the request ports' "one
   outstanding call" fact exposed to guards.
3. **No history target.** "Keep returns to the page" is `returnTo` plus N guard alternatives in
   A, B and base, and an accidental flag in C. **Proposed:** a shallow history target for a
   compound's last active child (an O2 extension), or make the dialog a subroutine whose `Declined`
   exit can target "the state it was entered from".
4. **Timer deadlines are invisible.** Every countdown copies `now + length` into memory beside a
   schedule of the same length, so the two can drift. **Proposed:** expose an armed schedule's
   `dueAt` in the snapshot (Machines O8).
5. **No "arm now".** A timer started by an event needs the counter-plus-`restartOn` idiom
   everywhere.
6. **An unknown commit cannot revert its optimistic value** until a confirming read (Operations
   O5), so "on failure the row reverts" means "on unknown, refetch". Every build except B does this.
7. **Dynamic collections cannot be fragment instances** (invites, rows). Per-entry Field logic and
   per-row pin state are hand-rolled in all four builds.
8. **Late host-commit results reach later states** (Operations O2). Only A's fragment requests are
   fenced. Plain host commits in every build (pins, B's and C's verify, base's verify) are exposed
   to the cross-entry misattribution in §1. **Proposed:** an optional per-state fence for host
   commits, or a check warning for a host commit whose outcomes are handled only in a state that
   can be left and re-entered.
9. **The 2FA spec allows a lockout bypass.** "Back to password … keeping nothing" resets the wrong
   attempts, so Back plus re-entry evades the lockout. All four builds do exactly what apps.md says;
   this is an apps.md issue, not a build bug.

---

## 5. Per-system verdict

- **A (proposal v2):** **the most correct.** No bug found in apps 1 and 2. App 3 is correct apart
  from the shared attribution gap (§4.1).
  - **By construction:** request fencing (the cross-entry late result in app 1), captured request
    input (D2 in app 2), kind-typed outcomes ("unknown never retried"), arming ids (hold re-press),
    states for dialogs and lockouts.
  - **Costs:** two FAKED v2 review fixes, and every abandoned or relay rule it needs in only one
    app.
- **Base (plain machines):**
  - **Correct:** app 2 (fields have handlers only on their pages, so D2 holds by construction) and
    app 3 apart from the select-all trust and shared gaps.
  - **Buggy:** app 1 has the cross-entry late-result bug.
  - **Convention:** most reuse; copies drift when a new handler is added.
- **B (locked split):**
  - **Fragments:** correct for the ones it has.
  - **Bugs:** host-owned I/O re-exposes L2 (app 1) and D2 (app 2, live re-read on retry); app 3
    lacks a refetch on unknown.
  - **Hazard:** public host-only events. Correct only under "only the intended UI sends".
- **C (single stateless fragment):** **least correct.**
  - **Modes in memory** produced two behavioural bugs: the dialog doesn't block (app 2) and the hold
    doesn't recheck the selection (app 3).
  - **Other bugs:** the queued-`Held` race, the L2 bug from app 1, the `Add` D2 hole, and a failing
    story.

  "Stateless" moved state rules into guards that every handler must remember, and several didn't.

---

## 6. Fix before the user reads it (bugs only)

**A**
1. App 3: `PinsLost` clears every in-flight pin, so re-clicking a still-running row is declined
   silently. Keep the pins on interrupt or defect and show "Couldn't pin an issue" without
   unlocking. Or note it as the §4.1 gap in the text.

**B**
1. App 1: a late verify from an abandoned TWO_FACTOR reaches the next attempt. Add a step
   generation to memory and guard outcome handlers on it, or document it as the §4.8 gap.
2. App 2: Field `canEdit: () => true` lets fields change during SUBMITTING/BUSY, and retries
   re-read them. Guard edits to the four pages, or capture the request in memory on Submit.
3. App 3: on `unknown`, also `refetch` (the row otherwise shows the optimistic pin until the next
   poll).
4. App 3: `SelectAll` trusts sender ids. Intersect them with the lane's current rows in the host
   (or document).

**C**
1. App 2: the dialog doesn't block Next, Back or Submit. Add `!memory.cancel?.open` to every page's
   Next, Back and Submit guard, or make the dialog a host state.
2. App 2: `invites.Add` is allowed while SUBMITTING and the retry re-reads invites. Guard `Add` with
   `editable` too (it needs a second guard slot, or an Add-specific port).
3. App 3: `onHeld` deletes with an empty selection. Add the selection guard on the filling, with an
   unguarded `{ target: "self" }` fallback.
4. App 1: the `still-locked` story assertion is wrong: `resend.until` is null by then. Assert at
   +29 s, or drop it.
5. App 1: a late verify crosses entries (as B). Document it as the §4.8 gap.

**base**
1. App 1: Back's cancel turns X's verify into `unknown`, which lands in a new VERIFYING as
   CheckFailed while Y's real result is dropped. Without a fence, drop the cancel and add a
   `challengeId` check in the outcome handlers (carry it in the event via the shared gap), or
   document it.
2. App 3: `PageSelected` trusts sender ids. Intersect them with the lane in the handler.
