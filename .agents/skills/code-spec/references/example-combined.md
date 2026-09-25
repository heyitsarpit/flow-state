# Example: Transaction Execution (combined candidate)

Brownfield reconstruction of one EVM, SVM, and TVM transaction slice. The uninterrupted block is the complete Spec; the notes after it explain the proposed final format.

```spec
spec TransactionExecution
status        proposed
basis         inferred from existing behavior
location      packages/lib/transactions/transaction-execution.spec.md
realized-by   EVM/executeTransaction.ts
              SVM/executeTransaction.ts
              TVM/executeTransaction.ts
              utils/repeatInterval.ts
implements    R1 R2 R3 R4
depends       Wallet ChainClient TransactionProgress
provides      execute

requirements
  R1
    source  all three executors receive an ordered step list
    must    execute steps in declared order

  R2
    source  later steps depend on the output of earlier steps
    must    not start a step unless its prerequisite succeeded

  R3
    source  the UI observes progress for every started step
    must    settle every started step as Succeeded or Failed

  R4
    source  callers use the execution result as the transaction outcome
    must    return success only after every step succeeded

open
  Q1 interruption has no declared domain outcome
    assume  interruption fails the current step and execution

  Q2 confirmation polling has no common exhaustion outcome
    assume  bounded exhaustion returns ConfirmationTimedOut

  FB1 EVM currently continues after a failed receipt and returns success
  FB2 SVM and TVM currently return before confirmation polling completes
  FB3 SVM confirmation currently ignores the transaction execution result

model
  TransactionPlan = non-empty ordered TransactionStep[]

  TransactionStep =
      SwitchChain{id, from, to}
    | SendTransaction{id, account, chain, request}

  StepStatus =
      Idle
    | Preparing
    | Submitting
    | Confirming{transactionHash}
    | Succeeded{transactionHash?}
    | Failed{reason: ExecutionFailure | Interrupted}

  ExecutionSuccess = {finalTransactionHash?}

  ExecutionFailure =
      WalletRejected
    | SubmissionFailed
    | ConfirmationFailed
    | ConfirmationTimedOut

  transitions
    ST1 Idle -> Preparing -> Submitting -> Confirming -> Succeeded
    ST2 Idle -> Preparing -> Submitting -> Confirming -> Failed
    ST3 Idle -> Preparing -> Submitting -> Failed

owner ExecutionRun
  lifetime  one execution of one TransactionPlan
  state     current step index, current StepStatus, active confirmation

  invariants
    I1 every step before the current step is Succeeded                 [R1 R2]
    I2 every step after the current step is Idle or Preparing          [R1 R2]
    I3 at most one wallet or chain operation is active                 [R1]
    I4 a Failed step is terminal for the entire plan                   [R2 R4]
    I5 ExecutionSuccess returns exactly when every step succeeded      [R4]
    I6 bounded confirmation cannot leave a step permanently Confirming [R3]

operations
  execute(plan: TransactionPlan, progress: TransactionProgress) -> ExecutionSuccess
    fails      ExecutionFailure
    requires   plan is non-empty
    ensures    a returned value means every step is Succeeded
               a failure identifies the first failed step
    publishes  every StepStatus transition
    completes  after all steps succeed, the first step fails,
               or execution is interrupted

  executeStep(step: TransactionStep, progress: TransactionProgress) -> Succeeded
    fails      ExecutionFailure
    requires   every prerequisite step is Succeeded
    ensures    the step is Succeeded or Failed before returning
    publishes  Submitting, Confirming{transactionHash}, then a terminal status
    interruption publishes Failed{Interrupted}, then remains interrupted

algorithm
  execute
    1. Visit steps from left to right.
    2. Await executeStep for the current step.
    3. Continue only after Succeeded; fail with the first ExecutionFailure.
    4. Return ExecutionSuccess after the final step succeeds.

  executeStep
    1. Publish Submitting and submit through Wallet.
    2. Publish Confirming with the returned transaction hash.
    3. Poll ChainClient within a bounded confirmation policy.
    4. Interpret the chain result, publish one terminal status, and return it.

  argument
    advancing only after executeStep succeeds preserves I1 and I2;
    awaiting submission and confirmation preserves I3;
    stopping on the first typed failure preserves I4 and I5;
    bounded polling preserves I6

composition
  flow
    TransactionPlan
      -> execute sequentially
      -> Wallet submits current step
      -> ChainClient confirms current step
      -> TransactionProgress publishes its status
      -> execution outcome

  uses
    Wallet
      role   submit or reject one prepared transaction
      reuse  extend the existing network wallet adapters

    ChainClient
      role   interpret chain-specific confirmation
      reuse  extend the existing EVM, SVM, and TVM clients

    TransactionProgress
      role   publish observable StepStatus
      reuse  extend the existing progress store

  boundaries
    execute -> Wallet
      passes  prepared TransactionStep
      hides   wallet and chain SDK calls

    Wallet -> ChainClient
      passes  SubmittedTransaction{stepId, transactionHash}
      hides   serialized transaction representation

    execute -> TransactionProgress
      passes  complete StepStatus values
      hides   execution mechanics

rules
  ordering      one step is active within a plan
  bounds        confirmation has a maximum attempt count and delay
  interruption  cancels confirmation and fails the current execution
  lifetime      all polling belongs to ExecutionRun
  publication   status and its transaction hash become observable together

realization effect-v4
  plain
    keep plan construction, ordering, and status projection as ordinary functions

  data
    use Data.TaggedEnum for TransactionStep, StepStatus, and ExecutionFailure
    use Schema only where wallet or chain data crosses a runtime boundary

  effects
    execute(plan, progress):
      Effect<ExecutionSuccess, ExecutionFailure, Wallet | ChainClient>

    executeStep(step, progress):
      Effect<Succeeded, ExecutionFailure, Wallet | ChainClient>

  contextual capabilities
    Wallet
      service because authority crosses composition levels and tests replace it

    ChainClient
      service because chain I/O crosses composition levels and tests replace it

    TransactionProgress
      direct argument because one ExecutionRun owns this progress sink

  time
    Schedule owns bounded confirmation attempts and spacing
    Clock remains supplied so tests can control time

  lifetime
    confirmation remains inside executeStep and the ExecutionRun scope
    interruption finalization publishes Failed{Interrupted} without converting
    Effect interruption into an ordinary typed failure
    no detached Fiber survives execution

  layers
    WalletLive + ChainClientLive satisfy the contextual requirements of
    execute; ExecutionRun and TransactionProgress stay execution-local

  host
    the React handler runs the composed CreateIntent program
    the UI translates ExecutionFailure into display text once

coverage
  R1
    enforced-by  I1 I2 I3, execute steps 1-3
    proven-by    T1

  R2
    enforced-by  I1 I2 I4, execute step 3
    proven-by    T2

  R3
    enforced-by  I6, executeStep steps 2-4, bounded confirmation
    proven-by    T3 T4

  R4
    enforced-by  I4 I5, execute step 4
    proven-by    T2 T3

attacks
  A1 start step two before step one succeeds
    blocked-by  I1 I2 and the sequential interpreter

  A2 return success after a failed receipt
    blocked-by  I4 I5 and the typed failure channel

  A3 leave confirmation pending forever
    blocked-by  I6 and the bounded confirmation policy

  A4 close the UI while confirmation is pending
    outcome     interruption cancels scoped work and publishes Failed{Interrupted}

  A5 reject one wallet request
    outcome     that step fails and later steps do not start

tests
  T1 fake Wallet and ChainClient observe strictly sequential execution
  T2 a failed prerequisite prevents every later submission
  T3 a failed receipt returns Failed and publishes Failed
  T4 controlled time reaches both confirmation success and timeout
  T5 interruption cancels outstanding confirmation work
```

## Format decisions

- The target-neutral core ends at `rules`; `realization effect-v4` is an optional target appendix, not the Spec's organizing model.
- Stable IDs exist only where later sections need to refer back: requirements, transitions, invariants, attacks, and tests.
- `invariants` state the hard truths owned by the slice. `coverage` shows how operations, algorithms, and tests enforce them without a repetitive `guarantee` vocabulary.
- Operations describe observable contracts; the algorithm explains the mechanism. There is no `commit` keyword or implementation-order section.
- `source`, `basis`, `realized-by`, and `open` separate evidence from proposed behavior so a brownfield Spec does not present inference as fact.
