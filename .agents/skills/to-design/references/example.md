# Complete Spec syntax example

Illustrative syntax, not a project contract or verification receipt.

```text
spec TransactionExecution
status        proposed
basis         illustrative adaptation of historical transaction execution behavior;
              paths, budgets, and test declarations are examples, not observed evidence;
              executable checks use production public boundaries under testing-policy
location      src/transactions/TransactionExecution.spec
realized_by   EVM/executeTransaction.ts
              SVM/executeTransaction.ts
              TVM/executeTransaction.ts
              utils/repeatInterval.ts
provides      execute

derives_from  [@plan.Example.D1, @plan.Example.C1, @plan.Example.O1, @task.Example.T1]

requirements
    R1
        source  EVM, SVM, and TVM executeTransaction.ts receive ordered Step[] values
        must    execute steps in declared order

    R2
        source  each executor loops in order and stops after caught step failure
        must    not start a step unless its prerequisite succeeded

    R3
        source  TransactionProgress/useTransactionStatus.ts observes status by step id
        must    settle every started step as Succeeded or Failed

    R4
        source  NewIntent/CreateIntentButton.tsx treats execution as the transaction outcome
        must    return success only after every step succeeded

    R5  Complete terminal settlement contract
        source      Illustrative refinement of the earlier R3 settlement requirement.
        supersedes  [@R3]
        reason      Make interruption and bounded timeout explicit while retaining R3 as history.
        must        Every started step settles as Succeeded or Failed, including interruption and 
                    timeout.

    R6  Explain execution failure
        source  Example Plan outcome O1 requires reproducible failure diagnosis.
        must    Record the step identity, prior and next status, and failure cause so a controlled
                run can reconstruct the sequence leading to failure.

open
    Q1  interruption has no declared domain outcome
        assume  interruption fails the current step and execution

    Q2  confirmation polling has no common exhaustion outcome
        assume  bounded exhaustion returns ConfirmationTimedOut

    FB1  EVM currently continues after a failed receipt and returns success
    FB2  SVM and TVM currently return before confirmation polling completes
    FB3  SVM confirmation currently ignores the transaction execution result

    RK1  A remote submission may complete before local interruption is observed.
        outcome  Local interruption does not undo the remote effect; reconciliation remains explicit
                 application or adapter work.

    Q3  Trace collection and replay harness are not implemented.
        assume   An execution-local progress sink can retain one bounded run's transition records.
        outcome  R6 remains pending until the harness reconstructs a controlled failure.

model
    StepId = stable identity within one TransactionPlan

    TransactionPlan = non-empty ordered TransactionStep[]

    TransactionStep =
        | SwitchChain{id: StepId, from, to}
        | SendTransaction{id: StepId, account, chain, request}

    StepStatus =
        | Idle
        | Preparing
        | Submitting
        | Confirming{transactionHash}
        | Succeeded{transactionHash?}
        | Failed{reason: ExecutionFailureReason | Interrupted}

    StepProgress = {stepId: StepId, status: StepStatus}

    StepSuccess = {transactionHash?}

    ExecutionSuccess = {finalTransactionHash?}

    ExecutionFailure = {stepId: StepId, reason: ExecutionFailureReason}

    ExecutionFailureReason =
        | WalletRejected
        | SubmissionFailed
        | ConfirmationFailed
        | ConfirmationTimedOut

    transitions
        ST1 SwitchChain:      Idle -> Preparing -> Submitting -> Succeeded
        ST2 SwitchChain:      Idle -> Preparing -> Submitting -> Failed
        ST3 SendTransaction: Idle -> Preparing -> Submitting -> Confirming -> Succeeded
        ST4 SendTransaction: Idle -> Preparing -> Submitting -> Confirming -> Failed
        ST5 SendTransaction: Idle -> Preparing -> Submitting -> Failed

owner ExecutionRun
    lifetime  one execution of one TransactionPlan
    state     current step index, current StepStatus, active confirmation
    derived   completedCount = number of Succeeded steps, updated after each terminal publication

    invariants
        I1  every step before the current step is Succeeded                 [@R1, @R2]
        I2  every step after the current step is Idle or Preparing          [@R1, @R2]
        I3  at most one wallet or chain operation is active                 [@R1]
        I4  a Failed step is terminal for the entire plan                   [@R2, @R4]
        I5  ExecutionSuccess returns exactly when every step succeeded      [@R4]
        I6  bounded confirmation cannot leave a step permanently Confirming [@R3, @R5]

operations
    execute(plan: TransactionPlan, progress: TransactionProgress) -> ExecutionSuccess
        argument
                  Awaiting one step before advancing preserves sequential execution and terminal 
                  settlement.
        fails      ExecutionFailure
        requires   plan is non-empty and every step is prepared
        ensures    a returned value means every step is Succeeded
                   a failure identifies the first failed step
        publishes  every StepStatus transition
        completes  after all steps succeed, the first step fails,
                   or execution is interrupted

    executeStep(step: TransactionStep, progress: TransactionProgress) -> StepSuccess
        fails         ExecutionFailure
        requires      every prerequisite step is Succeeded
        ensures       the step is Succeeded or Failed before returning
        publishes     the legal transition for the matched step variant
        interruption  publishes Failed{Interrupted}, then remains interrupted

    publishStepStatus(progress, stepId, status) -> Unit
        ensures  progress receives one complete StepProgress value;
                 status and transactionHash are never published separately

algorithm
    execute
        1. Visit steps from left to right.
        2. Await executeStep for the current step.
        3. Continue only after Succeeded; fail with the first ExecutionFailure.
        4. Return ExecutionSuccess after the final step succeeds.

    executeStep
        1. Match the closed TransactionStep variant.
        2. Run switchChainStep for SwitchChain.
        3. Run sendTransactionStep for SendTransaction.

    switchChainStep
        1. Publish Submitting and ask Wallet to switch chains.
        2. Publish Succeeded after the wallet confirms the switch.

    sendTransactionStep
        1. Publish Submitting and submit through Wallet.
        2. Publish Confirming with the returned transaction hash.
        3. Poll ChainClient within a bounded confirmation policy.
        4. Interpret the chain result, publish one terminal status, and return it.

    argument
        advancing only after executeStep succeeds preserves I1 and I2;
        awaiting submission and confirmation preserves I3;
        variant matching prevents chain switching from entering confirmation;
        stopping on the first step-addressed failure preserves I4 and I5;
        bounded polling preserves I6;
        publishStepStatus preserves the publication rule

composition
    flow
        TransactionPlan
            -> execute sequentially
            -> Wallet performs current step
            -> ChainClient confirms SendTransaction steps
            -> TransactionProgress publishes its status
            -> execution outcome

    uses
        Wallet
            kind      capability
            found_in  EVM/executeTransaction.ts, SVM/executeTransaction.ts, 
                      TVM/executeTransaction.ts
            input     TransactionStep
            returns   StepSuccess
            fails     ExecutionFailure
            needs     authorized account and selected chain
            role      perform or reject one wallet-authorized step
            reuse     extend the existing network wallet adapters

        ChainClient
            role   interpret chain-specific confirmation
            reuse  extend the existing EVM, SVM, and TVM clients

        TransactionProgress
            role   publish observable StepStatus
            reuse  extend the existing progress store

        StepInterpreter
            kind      capability
            found_in  executeStep in the existing transaction executors
            role      compose wallet submission, bounded confirmation, and progress publication
            reuse     extend the existing step interpreter
            input     TransactionStep
            returns   StepSuccess
            fails     ExecutionFailure
            needs     Wallet, ChainClient, TransactionProgress
            policy    match the step variant; submit once, confirm when needed, then publish 
                      settlement

    boundaries
        execute -> Wallet
            protocol  TransactionStep
            facts     prepared for the current execution and prerequisites succeeded
            hides     wallet and chain SDK calls

        execute -> ChainClient
            protocol  SubmittedTransaction{stepId, transactionHash}
            facts     wallet submission succeeded and the hash belongs to this step
            hides     serialized transaction representation

        execute -> TransactionProgress
            protocol  StepProgress
            facts     status and transaction hash form one complete publication
            hides     execution mechanics

rules
    ordering      one step is active within a plan
    bounds        confirmation has a maximum attempt count and delay
    interruption  cancels confirmation, publishes terminal progress,
                  and leaves execution interrupted
    lifetime      all polling belongs to ExecutionRun
    publication   status and its transaction hash become observable together

realization effect-v4
    plain
        keep plan construction, ordering, and status projection as ordinary functions

    data
        use Data.TaggedEnum for TransactionStep, StepStatus,
        and ExecutionFailureReason
        use Schema only where wallet or chain data crosses a runtime boundary

    effects
        execute(plan, progress):
            Effect<ExecutionSuccess, ExecutionFailure, Wallet | ChainClient>

        executeStep(step, progress):
            Effect<StepSuccess, ExecutionFailure, Wallet | ChainClient>

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
    @R1
        enforced_by  [@I1, @I2, @I3], execute steps 1-3
        proven_by    [@T1]

    @R2
        enforced_by  [@I1, @I2, @I4], execute step 3
        proven_by    [@T2]

    @R3
        enforced_by  [@I6], both variant algorithms, publishStepStatus,
                     bounded confirmation, interruption rule
        proven_by    [@T3, @T4, @T5]

    @R4
        enforced_by  [@I4, @I5], execute step 4
        proven_by    [@T2, @T3]

    @R5
        enforced_by  [@I6], bounded confirmation and interruption settlement
        proven_by    [@T3, @T4, @T5]

    @R6
        enforced_by  intended transition-record sink and controlled replay harness
        open_by      [@Q3]

attacks
    A1  start step two before step one succeeds
        blocked_by  I1 I2 and the sequential interpreter

    A2  return success after a failed receipt
        blocked_by  I4 I5 and the typed failure channel

    A3  leave confirmation pending forever
        blocked_by  I6 and the bounded confirmation policy

    A4  close the UI while confirmation is pending
        outcome  interruption cancels scoped work and publishes Failed{Interrupted}

    A5  reject one wallet request
        outcome  that step fails and later steps do not start

tests
    T1  fake Wallet and ChainClient observe strictly sequential execution
    T2  a failed prerequisite prevents every later submission
    T3  a failed receipt fails with ExecutionFailure and publishes Failed
    T4  controlled time reaches both confirmation success and timeout
    T5  interruption cancels outstanding confirmation work
    T6  Planned boundary integration check: drive a failed execution and reconstruct its 
        transitions.
            Use real execution and progress components with controlled wallet and chain responses.
            Capture inputs, code/harness revisions, step identities, state transitions, and failure 
                causes.
            This controlled dependency check is not mock-free E2E; Q3 keeps execution evidence 
                pending.
```
