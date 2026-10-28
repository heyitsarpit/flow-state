# Amendments from the builds

Small changes the four builds and their reviews kept asking for. Each is applied in a second pass of
the builds, to see how much they improve. **Override** marks where an amendment changes an existing
proposal, spec or plan. None of the plans themselves are edited; the builds assume these as
amendments.

## Plan-level (every system, including the baseline)

| # | Change | Draft syntax | Fixes | Override |
| --- | --- | --- | --- | --- |
| P1 | Outcome mappers also receive the call's **input** | `failure: { X: E.PinFailed.from((err, { input }) => ({ id: input.id })) }`, same for `success`, `unknown`, `interrupt`, `defect` | per-row pin attribution; "forget every in-flight pin" | **Operations O2/O6** |
| P2 | Results of a **host commit started in a state are fenced** to that state's activation; a late result after leaving goes to the commit's `abandoned` handler if it has one, otherwise is dropped with evidence | `O.x.commit(select, { outcomes, abandoned? })` | B's and the baseline's late verify landing in a newer attempt | **Operations O2, Machines O6** |
| P3 | Guards can read whether a commit is **outstanding** | `O.Issues.setPinned.pending(s, { id })` → `boolean` | hand-kept in-flight lists; double-click refusal | **Operations** |
| P4 | A **retry policy** on a commit descriptor: retries named failure tags with a schedule, **resends the same input**, never retries `unknown` / `interrupt` / `defect`; reports each retry | `transaction({ …, retry: { on: ["Busy"], schedule: Schedule.exponential("1 second").pipe(Schedule.recurs(3)) } })`, outcome `retrying: E.Retrying.from(({ attempt }) => …)` | B's retry re-reading editable fields; hand-written backoff in every host | **Operations** (new) |
| P5 | A **shallow history** target | `target: S.WIZARD.history` returns to the last active child of `WIZARD` | `returnTo` plus a guard chain in every build | **Machines O2** |
| P6 | **Schedule deadlines** are readable in the snapshot | `s.schedules.lockout?.dueAt` | deadlines copied into memory for countdowns | **Machines O5/O8** |
| P7 | A schedule can be **armed by an event**, not only by entry or `restartOn` | `schedules: { flash: { schedule: "3 seconds", send: E.Clear, armOn: [E.Show] } }`; re-arming restarts it | the counter-plus-`restartOn` idiom (5 times in C) | **Machines O5** |
| P8 | The `restartOn` entry baseline is the **entering turn's committed memory** | — | debounce traps (already in proposal-v2) | **Machines O5** |

## Spec fixes to apps.md

| # | Change | Why |
| --- | --- | --- |
| S1 | Wrong attempts and the lockout survive Back to password and re-entry, for the same challenge | otherwise Back resets the lockout |
| S2 | Select-all takes the ids **from the current snapshot**, not from the click | a stale click could select, then delete, issues not on screen |
| S3 | An `unknown` pin reverts the row and refetches the list | an uncertain pin should not show as confirmed |

## System-level

| # | Change | Systems | Override |
| --- | --- | --- | --- |
| F1 | **`hostEvents`**: events only the direct parent may raise; the UI cannot send them | B, C (A has it) | **spec-b, spec-c**: three event lists instead of two |
| F2 | Ordinary host transitions may `raise` into children's `events` and `hostEvents` | B, C | clarifies spec-b, spec-c |
| F3 | Guards test states with tokens (`S.CODE.LOCKED_OUT.is(state)`), never path strings | all | clarifies spec-b, spec-c |
| F4 | A subroutine's memory is read at `s.memory.<NAME>`, `undefined` while inactive | B | clarifies spec-b |
| F5 | A guard slot may hold an array of guards that must all pass | B, C | clarifies spec-b, spec-c; already in proposal-v2 |
| F6 | A second call to a busy request is a **denial** (`deny("Busy")`), not a rejected turn | A | **proposal-v2 rule 9** |

## Round 2 (after the amended builds)

| # | Change | Where | From |
| --- | --- | --- | --- |
| P9 | Outcome kinds: `unknown`, `interrupt`, `defect` may only target events marked uncertain; "never sent" is its own outcome | Operations | A |
| P10 | `abandoned` for host commits: `{ outcome, input }`; runs with "pending" in the leaving turn, again on settlement; never moves the actor | Operations | A |
| P11 | Timer arming ids: a firing from before a re-arm is never delivered | Machines | A |
| P12 | Restore rules for fenced commits in flight at reload | Persistence | A |
| P13 | An `unknown` optimistic value can be reverted at once (explicit option) | Operations | builds |
| B1 | Deliveries are never lost: a raise reachable from a result, exit or timer handler must target an event that cannot refuse | fragments | A |
| B2 | Lists of fragment instances (`Field(…).list({ max })`, `E.invites[i].Changed`) | fragments | builds |
| B3 | Default fillings: a fragment may default a callback (`{}`) or guard (allow); ports without a default stay required | fragments | builds |
| B4 | `resetOn`: re-activate a trait when a selected value changes | fragments | builds |

Plan sentences to pin down: which state P2 fences to; whether guards read `s.schedules` and call
`pending`; whether `armOn` also arms on entry; where trait timers sit in the snapshot; when P4's
`retrying` fires.

## Not applied (too large for this pass)

- **Dynamic instances**: a list of fragments (one `Field` per invite, one pin per row). Every build
  needed it; it is a design question of its own.
- **Parallel-region traits**: real states for always-there pieces such as hold-to-confirm.
