# Example: Latest Attempt Owns Transaction Publication

Brownfield Spec for a stale failure arriving after a second save starts. The old runtime is evidence; the rewrite contract remains proposed.

```spec
spec AllowTransactionOverlap
status       proposed
basis        inferred from existing behavior
location     .agents/skills/code-spec/references/examples/submission-overlap.md
realized-by  packages/flow-state/src/core/orchestrator/orchestrator-transaction-start.ts
             packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts
             packages/flow-state/src/core/orchestrator/orchestrator-transaction-completion.ts
             packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview-overlays.ts
             packages/flow-state-rewrite/src/operation/transaction.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-activities.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-operation-work.ts
implements   R1 R2 R3 R4
provides     commit

requirements
    R1
        source  packages/flow-state/src/submit-transaction-allow-latest-wins-oracle.test.ts and packages/flow-state/src/testing/fixtures/submit-transaction-allow-latest-wins.ts start Draft A and Draft B before either save settles
        must    concurrency allow starts each admitted save while an earlier save is still running

    R2
        source  packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts assigns each attempt a generation and records one snapshot owner per transaction id
        must    only the newest started attempt may publish the shared transaction status, terminal receipt, issue, or routed outcome

    R3
        source  packages/flow-state/src/submit-transaction-stale-allow-publication-oracle.test.ts settles Draft B first, then settles Draft A as success, failure, or defect
        must    a stale completion cannot publish its outcome or apply its returned value; removing its own preview may reveal a surviving layer or the base value

    R4
        source  packages/flow-state/src/submit-transaction-allow-latest-wins-oracle.test.ts inspects pending work after both controlled saves settle
        must    every started attempt releases its active work after completion is handled, whether or not it still owns publication

open
    FB1 packages/flow-state-rewrite/src/runtime-next/actor/actor-activities.ts retains only the latest occurrence for one descriptor and key, while packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts retains multiple active attempts and gives only the newest generation snapshot ownership

    Q1 the source requirements do not define how an external store reconciles a stale save that committed after a newer save failed
        assume  stale callbacks are fenced from local publication; remote reconciliation remains the adapter or application responsibility

    RK1 a stale save may have changed remote state before its completion is ignored; the frozen controlled adapter returns values but does not model remote state or convergence

    Q2 interruption is present in the rewrite transaction model but is not exercised by the brownfield allow-overlap oracles
        assume  interruption is outside this slice until a separate Spec defines its publication and preview-reconciliation behavior

model
    TransactionId = stable identity for one authored transaction

    AttemptGeneration = positive monotonic generation within one actor transaction id

    Transaction = {id: TransactionId, concurrency: "allow"}

    Params = inputs captured for one commit attempt

    AttemptOutcome =
        | Success{value}
        | Failure{error}
        | Defect{cause}

    TransactionState =
        | Idle
        | Pending{generation}
        | Success{generation, value}
        | Failure{generation, error}
        | Defect{generation}

    Attempt =
        | Running{transactionId, generation}
        | Settled{transactionId, generation, outcome: AttemptOutcome}

    transitions
        ST1 submit with allow: any visible state -> Pending{g+1}, while earlier active attempts remain active
        ST2 current attempt settles: Pending{g} -> Success{g} | Failure{g} | Defect{g}
        ST3 stale attempt settles: shared TransactionState is unchanged

owner TransactionAttemptLedger
    lifetime  concurrent attempts for one actor transaction id
    state     active attempts by generation, latest publication generation, and per-attempt preview layers

    invariants
        I1 each admitted allow attempt owns one completion lifetime until it settles [R1 R4]
        I2 publication ownership moves only to a newer started generation and never moves back [R2 R3]
        I3 stale outcomes cannot replace the current transaction state or publish their routed event [R2 R3]
        I4 reconciling one attempt's preview cannot apply its stale returned value or overwrite a newer surviving preview [R3]

operations
    submit(transaction: Transaction, params: Params) -> AttemptGeneration
        requires   transaction concurrency is allow
        ensures    one new attempt is active and owns shared publication for its transaction id
        publishes  Pending{generation} and the attempt's preview
        completes  after the commit starts or admission fails before the effect starts

    observe(transactionId: TransactionId, generation: AttemptGeneration, outcome: AttemptOutcome) -> Unit
        requires   the generation identifies a started attempt
        ensures    a current attempt publishes its outcome; a stale attempt cannot change shared transaction state or apply its returned value
        publishes  one terminal transaction receipt and routed outcome only for the current generation
        completes  after the attempt's active work is released and any allowed preview reconciliation is applied

algorithm
    submit
        1. Allocate a new generation for the transaction id.
        2. Keep earlier allow attempts active.
        3. Assign publication ownership to the new generation.
        4. Publish its pending state and preview.

    observe
        1. Find and release the matching active attempt.
        2. Compare its generation with the current publication generation.
        3. For the current generation, publish the terminal state, issue, receipt, invalidation, and routed event.
        4. For a stale generation, reconcile only its own preview layer and do not publish its outcome or returned value.

    argument
        a distinct generation lets concurrent work finish independently while I2 preserves one shared publication owner;
        checking ownership at settlement blocks late failures, defects, and successes from changing the latest result;
        keeping preview layers attempt-scoped preserves newer layers and lets removal reveal the next surviving layer or base value;
        releasing stale work preserves I1 and I4 without granting it publication authority

composition
    flow
        SAVE event
            -> prepare transaction params
            -> start concurrent commit attempt
            -> publish attempt preview and pending state
            -> settle commit
            -> publish only if this generation still owns the transaction id

    uses
        TransactionConcurrency
            kind      owner
            found-in  packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts
            role      track active attempts and the generation allowed to publish one transaction snapshot
            reuse     supersede at the rewrite cutover with TransactionAttemptLedger as the single authority

        PreviewOverlays
            kind      transformer
            found-in  packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview-overlays.ts
            role      keep optimistic values scoped to the attempt that created them
            reuse     extend the rewrite transaction path; do not add another resource cache

        OperationOccurrence
            kind      protocol
            found-in  packages/flow-state-rewrite/src/runtime-next/actor/actor-activities.ts
            role      carry one worker's identity through completion and stale-fact checks
            reuse     reuse-as-is for worker identity; the transaction ledger owns publication ordering

        TransactionDescriptor
            kind      protocol
            found-in  packages/flow-state-rewrite/src/operation/transaction.ts
            role      declare the transaction id, canonical key, commit program, and concurrency policy
            reuse     reuse-as-is

    boundaries
        transaction runtime -> commit adapter
            protocol  Attempt{transactionId, generation, params}
            facts     generation and canonical key were assigned before the effect started
            hides     snapshot publication ownership and preview bookkeeping

        commit adapter -> transaction runtime
            protocol  AttemptOutcome
            facts     the outcome belongs to one started generation
            hides     external client details and whether remote state has converged

rules
    publication  transaction state, terminal receipt, issue, and routed event belong to the same current generation
    lifetime     each allow attempt remains independently active until its own completion is handled
    ordering     completion order does not change which generation owns publication
    authority    one TransactionAttemptLedger owns rewrite publication; the frozen registry is migration evidence only

coverage
    R1
        enforced-by  I1, submit steps 1-2
        proven-by    T1 T2

    R2
        enforced-by  I2 I3, observe steps 2-4, publication rule
        proven-by    T1 T2

    R3
        enforced-by  I3 I4, observe step 4
        proven-by    T2 T3

    R4
        enforced-by  I1, observe step 1, lifetime rule
        proven-by    T1 T2

attacks
    A1 complete older Draft A with failure after Draft B has started
        blocked-by  I2 I3; Draft B stays pending and no stale failure is routed

    A2 complete Draft B successfully, then complete older Draft A with success, failure, or defect
        blocked-by  I2 I3 I4; the winning transaction and resource snapshots remain unchanged

    A3 complete Draft B with failure, then return success for Draft A
        blocked-by  I2 I4; the transaction remains failed and removing Draft A's preview reveals the base resource value

    A4 remote save for Draft A commits before its stale completion is discarded
        outcome  local publication stays fenced, but remote convergence remains RK1

    A5 settle the same attempt twice
        blocked-by  the matching active attempt entry is removed after its first settlement

tests
    T1 packages/flow-state/src/submit-transaction-allow-latest-wins-oracle.test.ts completes older failure while newer allow attempt is pending, then completes newer success
    T2 packages/flow-state/src/submit-transaction-stale-allow-publication-oracle.test.ts completes newer success first, then older success, failure, and defect in separate cases
    T3 packages/flow-state/src/submit-transaction-stale-allow-publication-oracle.test.ts completes newer failure, then older success; the transaction remains failed and stale preview removal reveals the seeded base value
    T4 packages/flow-state-rewrite/src/runtime-next/test/actor-operation.test.ts supplies the generic stale-occurrence proof; extend it with two same-key allow commits settled in both orders, each worker finalizing once and only the latest generation publishing
```
