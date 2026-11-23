---
page T19-durability-write-ahead
description No app change; a reload never hears an ending twice or loses one, and a refused save is retried within 5 s.
---
# Durability, write-ahead: what an app author notices (T19, 2026-11-16)

**Bottom line:** nothing changes in app code. What Flow saves now matches what the app heard: a reload never hears
an ending twice, never loses one, and a refused save is retried within 5 s. Reviewed PASS at `8c02753e`;
bench under 0.06 ms per turn.

## What you notice after a reload

| Before                                                                                           | Now                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| A retry that was waiting to save and was refused woke the actor again after a reload             | It shows on disk as not in flight; the reload leaves it alone |
| The saved retry count missed the re-send about to go out                                         | It counts that re-send                                        |
| A refused save waited for the next change                                                        | It goes again within 5 s                                      |
| A timer that fired into a state that ignores it came back after a reload                         | It is gone from the record                                    |
| A row still queued when a step hit its 10,000-turn drain cap could be heard twice after a reload | It is heard once                                              |
| `ready()` after `dispose()` during boot could reject `ServiceFailed`                             | It always rejects `RuntimeDisposed`                           |

Saves are batched: changes made within 5 s are written together, and the disposal writes everything changed within
its own 5 s bound.

## When a value can't be saved

```ts
const Cart = definition({                        // existing
  id: "Shop/cart",
  persist: true,                                 // existing
  memory: { note: Flow.initial(Schema.Unknown, null) }, // user-defined: a value Schema may fail to encode
  // ...
});
```

If an actor's memory can't be encoded, nothing for that actor is saved that step, including its lanes and owed
endings, and its sends wait. The actor does not end at its grace while its records are held back. Everything is
written once the value encodes again. The report you will see for this (UnencodableValue) is still to be built; T20
owns it.

## Calls made for you to check

- **One actor's bad value doesn't stop the others.** While one actor's records are held back, other actors' records
  from the same step are still saved (Spec WriteAhead I23 amended). The alternative is to skip the whole step's save
  until every record encodes; neither loses an ending, but that one hangs every later save in the Runtime until the
  bad value is fixed, so the review kept the amendment.
- Only the disposal's own final write reports `StorageFailure`; an earlier refused save that a later one replaced
  doesn't, because the later save carries its records.
- Every lane and actor change is saved, except a commit going out on the wire, which would add nothing new to disk.

## Known gaps, each with an owner

- Saving when the page is hidden (`pagehide`) has no test yet: the test host can't hide the page. T58 owns it.
- A held-back actor's ticket may report `StorageSilent` after 10 s although nothing is wrong. T20 owns it.
