---
page T20-durability-restore
---
# Durability, restore: what an app author notices (T20, 2026-11-18)

**Bottom line:** nothing changes in app code. A reload brings back every acknowledged write and every ending an actor
is owed; a record Flow can't trust is set aside and reported, never guessed at. Closed by the user's call at the
failure limit; one known gap (below) is owned by @task.V3.T92.

## What you notice after a reload

| Case                                                                                                     | What happens                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An actor is owed an ending (a write answered while the tab was gone)                                     | It wakes at boot and hears it once                                                                                                                       |
| A write was acknowledged, including a call a cancel-policy commit displaced                              | It is restored and ends as usual                                                                                                                         |
| A write whose record can't be saved                                                                      | It ends `NotSent { StorageRefused }` at once; your other writes go on                                                                                    |
| A pending result too large to save                                                                       | It is heard once after the reload as `unknown { Restored }`                                                                                              |
| A saved record Flow can't read (a newer format, a name or key that doesn't match, an undeclared machine) | The record is set aside, the actor reads lifecycle `quarantined`, its key stays blocked until a cancel, and `RecordUndecodable` is reported at each boot |
| The store can't load at all                                                                              | The tab runs without persistence                                                                                                                         |

`dispose({ forget: true })` deletes the actor's saved scope, and fails with `StorageFailure` if it can't.

## In Stories

`Fake.storage.refuseHeld()` (**new**) refuses the oldest held write, for a disk that takes a write and then refuses
it.

## Known gap

An actor record's context bindings are not yet checked against the app, so a forged binding can start a local actor
or stop the boot. It needs forged or corrupt storage, and is shown by an inverted Restore R5 test.
@task.V3.T92 redesigns record decoding so every name in a record goes through one `Identity` Schema.
