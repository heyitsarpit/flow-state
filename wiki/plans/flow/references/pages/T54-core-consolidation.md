---
page T54-core-consolidation
description Almost no app change; saves leave as one batch per step and a boot-adopted lane treats later endings as current.
---
# Core consolidation: what an app author notices (T54, 2026-11-16)

**Bottom line:** almost nothing changes in app code; two bugs an author could hit are fixed. Saves now leave as one
batch per step across actors, and a lane adopted at boot treats its later endings as current. Reviewed PASS at
`a3345224`.

## Fixed

- **Writes from several actors no longer wait on each other.** Before, while one actor's save was held (slow or
  stuck storage), other actors' changes waited behind it. Now each step sends one write list with every record it
  touched, and one batch is out at a time for the whole Runtime (WriteAhead R12, I23).

  ```ts
  // two accounts send in the same instant while storage is slow
  account1.send({ _tag: "Send", transferId: "t1", cents: 500 })   // existing API, unchanged
  account2.send({ _tag: "Send", transferId: "t2", cents: 200 })
  // before: account2's record waited for account1's batch; after: both records are in the one batch
  ```

- **A lane adopted after a reload delivers its later endings as current** (Turn R20, I26). Before, an ending
  arriving after adoption could be routed as stale and never reach the machine.

## Unchanged for authors

- One `start` now owes the `unknown` Restored endings at boot, return and adoption; one ledger holds every owed
  ending; every report is built in one place. These are internal, guarded by structural checks and planted faults.

## Calls made for you to check

- WriteAhead I20 is kept as written: queued and retrying rows stay out of the saved owed record, because the only
  such row left at a step's end is an `unknown` Restored, which the record holds. Past the 10,000-turn drain cap that
  premise fails; routed to T19.
- The Spec now says a step returns evidence built from acts.
- The test generator's hash gained a finalizer (its draws were correlated); saved stress Stories were reprinted.
