# Correctness (Correctness phase reference)

Read during Correctness, after Survey. Extraction supplied the semantic claims; compile their values, states, transitions, and failures under `model`. This phase decides who is authoritative for each invariant, what algorithm makes it hold, and what operational discipline shared state needs.

## Cut

```text
group entity / state / invariant / operation
by: shared mutable state, or must-change-atomically-together
      │
      ▼
at most one primary owner ──► already found by Survey?
                              │ yes            │ no
                              ▼                ▼
                          reuse/extend      new owner,
                          that owner        new slice
```

A stateless slice may have no owner. Two primary owners in one Spec means it isn't cut yet. If Composition discovers another owner, start a separate Spec beside that owner's code, link it, and resume against its public operations.

Before naming a new owner, cite the relevant Survey findings and explain why no existing owner can enforce this invariant without weakening its boundary.

## When a concern becomes an owner

```text
op A ──┐
       ├──► could this leave the invariant false in between?
op B ──┘         │ yes                    │ no
                  ▼                       ▼
          one owner, one          invariant belongs on
          publication rule        the value, not an owner
```

A capability concern (from Composition) becomes an `owner` exactly when this test is yes.

## Choosing the algorithm

Pick the representation whose properties keep the invariant true with the least ongoing work, and write *why*, not just *what*:

```text
weak argument    "uses a heap"
strong argument  "popMax returns the maximum because the heap holds
                  exactly the Queued jobs — every transition that
                  removes one from Queued removes it from the heap
                  in the same atomic publication"
```

If an operation's correctness depends on an invariant the owner doesn't actually enforce, the argument is false, even if the code works today.

Record complexity when scale or a requirement makes it observable.

## Operational rules

Only write a `rules` section when state is shared across operations, callers, or tasks.

```text
publication  the smallest indivisible decision and state publication:
             re-check stale facts, decide, and expose the new state together;
             names what observers cannot see half-applied, not the primitive used
locks        held only for atomic publication — no I/O or callback inside
bounds       every queue/retry/list that can grow needs a limit and a
             stated behavior at that limit
monotonic    a value that must never go backward — checked before it
             increments, with a story near its numeric limit
tasks        every background task belongs to a named owner that can
             stop it
```

## Placing each HARD claim at the strongest layer

```text
strongest ────────────────────────────────────────────────► weakest
type → construction → operation signature → owner boundary
    → algorithm invariant → atomic publication → typed error
    → property/model test → proof
```

Move down this list only when a stronger layer genuinely can't express the property — usually because the fact depends on something outside the process.

## Attacking the design

```text
escape hatches                stale evidence
casts, deserialization,     a token/handle proves a fact only as
direct storage writes,      of when it was issued — re-check the
FFI, reflection              current state inside the same publication
                              that uses it
```

Also attack interruption and partial external effects between publications. A local atomic update cannot make an external side effect atomic; require idempotency, durable convergence, an outbox, or an explicit visible risk.

Resolve honestly. An attack is blocked only when a named mechanism prevents it — not when it "would be caught in review." Otherwise record its observable `outcome` or keep the risk in `open`.

## Deriving verification

```text
invariant             → random-sequence model test
temporal eventually   → fairness / progress argument, tested the same way
construction-only fact → a construction-time or compile-time test, never runtime
```
