# Laws and independent oracles

[Back to the plan tracker](./TASK.md)

Authority: DEC-17 law work must use independent oracles. Tests may call public
Flow State APIs to exercise behavior, but the expected result cannot be computed
by importing the production encoder, reducer, batcher, scheduler, or serializer
being tested.

| Area                | Law                                                                                            | Named non-law                                               | Independent oracle                                 | Owning proof |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- | ------------ |
| Resource identity   | accepted identity is reflexive, symmetric, transitive, injective, and property-order invariant | runtime-local object/function identity is not durable       | small standalone encoder model in the test file    | P1A.2/P1A.4c |
| App identity        | module reorder does not change app identity                                                    | duplicate/invalid IDs do not normalize                      | sorted length-delimited string model               | P1A.0/P1C.1  |
| Reads and `can`     | reads, `can`, and dehydrate are observationally pure at one snapshot                           | time-dependent guards are not allowed to observe wall clock | frozen snapshot clone plus event table             | P3A.1/P4C    |
| Lifecycle           | stop, dispose, unsubscribe, cancel, and identical hydrate are idempotent                       | forced process death is not finalization                    | reference state machine in test                    | P1C.3a/P4C   |
| Batch publication   | nested batches flatten associatively and empty batch is identity                               | observer callbacks cannot be part of the semantic batch     | event-log model with one commit barrier            | P1B.2/P1D.3a |
| Queue/admission     | per-owner queues are FIFO and non-reentrant                                                    | cross-owner global order is not promised                    | explicit queue model with scheduler turns          | P1C.4b/P2.1  |
| Projection/evidence | fact sequence is monotonic except explicit truncation gaps                                     | evidence is not business state and cannot veto              | append-only vector model with gap markers          | P1D.3b/P4D   |
| Round trip          | supported JSON values round-trip semantically                                                  | canonical byte-for-byte JSON is not promised                | JSON parse/stringify plus schema-shaped comparator | P4C.1a       |

Generators use bounded depths from `CAPACITY_POLICY.md`, shrink by removing
events/keys/entries before simplifying values, and keep permanent fuzz seeds in
the owning test file. Mutation targets include key graphs, module IDs, forged
refs, mailbox interleavings, transaction overlap, stream pressure, hydration
payloads, redaction/export, and shutdown/finalizer Cause aggregation. The
deterministic scheduler is `TestClock` plus explicit Deferred gates; real sleeps
and double flushes are not proof.
