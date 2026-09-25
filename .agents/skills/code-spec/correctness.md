# Correctness (Correctness phase reference)

Read during Correctness, after Survey. Modeling already happened at Extract (`value`, `state`, `invariant`, `transition` are already in the Spec). This phase decides who is authoritative for each invariant, what algorithm makes it hold, and what operational discipline shared state needs.

## Cut

```text
group entity / state / invariant / operation
by: shared mutable state, or must-change-atomically-together
      │
      ▼
one owner per group  ──►  already found by Survey?
                              │ yes            │ no
                              ▼                ▼
                          reuse/extend      new owner,
                          that owner        new slice
```

Two owners in one Spec means it isn't cut yet.

## When a concern becomes an owner

```text
op A ──┐
       ├──► could this leave the invariant false in between?
op B ──┘         │ yes                    │ no
                  ▼                       ▼
          one owner, one commit    invariant belongs on
                                    the value, not an owner
```

A capability concern (from Composition) becomes an `owner` exactly when this test is yes.

## Choosing the algorithm

Pick the representation whose properties keep the invariant true with the least ongoing work, and write *why*, not just *what*:

```text
weak argument    "uses a heap"
strong argument  "popMax returns the maximum because the heap holds
                  exactly the Queued jobs — every transition that
                  removes one from Queued removes it from the heap
                  in the same commit"
```

If an operation's correctness depends on an invariant the owner doesn't actually enforce, the argument is false, even if the code works today.

## Operational rules

Only write a `rule` block when state is shared across operations, callers, or tasks.

```text
commit      the one step where a change becomes visible to everyone
            at once; everything before it is fallible and abandonable
locks       held only for the commit itself — no I/O or callback inside
bounds      every queue/retry/list that can grow needs a limit and a
            stated behavior at that limit
monotonic   a value that must never go backward — checked before it
            increments, with a story near its numeric limit
tasks       every background task belongs to a named owner that can
            stop it
```

## Placing each guarantee at the strongest layer

```text
strongest ────────────────────────────────────────────────► weakest
type → construction → operation signature → owner boundary
    → algorithm invariant → atomic commit → typed error
    → property/model test → proof
```

Move down this list only when a stronger layer genuinely can't express the property — usually because the fact depends on something outside the process.

## Attacking the design

```text
escape hatches              stale evidence
casts, deserialization,     a token/handle proves a fact only as
direct storage writes,      of when it was issued — re-check the
FFI, reflection              current state inside the same commit
                              that uses it
```

Classify honestly. GUARANTEED means an algorithm or atomic commit prevents it — not "would be caught in review." An unclassified `POSSIBLE` is a failure of this phase, not of the design.

## Deriving verification

```text
invariant           → random-sequence model test
temporal eventually → fairness / progress argument, tested the same way
IMPOSSIBLE claim     → a construction-time or compile-time test, never runtime
```
