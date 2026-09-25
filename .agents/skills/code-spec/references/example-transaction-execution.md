# Example: Transaction Execution (expanded comparison)

Brownfield reconstruction of an EVM, SVM, and TVM transaction flow. This keeps the older section-oriented detail—especially invariants, algorithms, operational rules, attacks, and tests—while adding code provenance, asynchronous completion, and a concrete Effect realization. It is a comparison candidate, not yet the canonical format.

```spec
slice TransactionExecution
status       proposed
basis        inferred from existing EVM, SVM, and TVM implementations
realized-by  types.ts
             EVM/executeTransaction.ts
             SVM/executeTransaction.ts
             TVM/executeTransaction.ts
             utils/repeatInterval.ts
implements   R1 R2 R3 R4
depends      Wallet, ChainClient, TransactionProgress
provides     execute
target       effect-v4

requirements
  R1  execute steps in declared order
  R2  do not begin a dependent step unless its prerequisite succeeded
  R3  every started step reaches Success or Failed
  R4  return success only when every step succeeded

open
  Q1  interruption has no declared domain outcome
      assume: interruption fails the current step and the execution

  Q2  confirmation timeout has no current failure state
      assume: bounded exhaustion returns ConfirmationTimedOut

  FB1 current EVM execution continues after a failed receipt and returns success
  FB2 current SVM and TVM execution return before confirmation polling completes
  FB3 current SVM confirmation does not inspect the transaction execution result

types
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
    | Failed{reason}

  ExecuteResult =
      Succeeded{finalTransactionHash?}
    | Failed{stepId, reason}

  ExecutionError =
      WalletRejected
    | SubmissionFailed
    | ConfirmationFailed
    | ConfirmationTimedOut
    | Interrupted

composition
  flow
    TransactionPlan
      -> execute steps sequentially
      -> submit current step
      -> confirm current step
      -> publish terminal status
      -> continue or stop
      -> ExecuteResult

  concerns
    execute
      owns: ordering and stop/continue policy

    submit
      owns: wallet interaction and transaction submission

    confirm
      owns: bounded confirmation and chain-specific success interpretation

    progress
      owns: publishing observable step state

  boundaries
    execute -> submit
      protocol: prepared TransactionStep
      hides: wallet and chain SDK calls

    submit -> confirm
      protocol: SubmittedTransaction{stepId, transactionHash}
      hides: serialized transaction representation

    execute -> TransactionProgress
      protocol: StepStatus
      hides: execution mechanics

owner ExecutionRun
  lifetime  one execution of one TransactionPlan
  state     current step index
            current StepStatus
            outstanding confirmation work

  invariants
    I1  every step before current is Succeeded                         [R1, R2]
    I2  every step after current is Idle or Preparing                  [R1, R2]
    I3  at most one wallet or chain operation is active                [R1]
    I4  a Failed step is terminal for the entire plan                  [R2, R4]
    I5  Succeeded is returned exactly when every step succeeded        [R4]
    I6  confirmation exhaustion produces Failed, never permanent
        Confirming                                                     [R3]

ops
  execute(TransactionPlan) -> ExecuteResult | ExecutionError
    pre      plan is non-empty
             every immediately executable step is prepared

    post     Succeeded means every step is Succeeded
             Failed identifies the first failed step

    emits    each StepStatus transition

    complete when the plan succeeds, the first step fails,
             or execution is interrupted

  executeStep(TransactionStep) -> Succeeded | ExecutionError
    pre      every prerequisite step is Succeeded

    steps    publish Submitting
             submit through Wallet
             publish Confirming{transactionHash}
             wait for bounded confirmation
             publish Succeeded or Failed

algo
  representation  left-to-right sequential plan interpreter

  confirmation    poll inside executeStep using bounded retry;
                  do not detach confirmation from the execution

  stop            the first typed failure short-circuits the remaining plan

  argument        I1 and I2 hold because the interpreter advances only after
                  executeStep returns Succeeded. I3 holds because confirmation
                  remains inside the current sequential operation. I4 and I5
                  follow from typed short-circuiting.

rules
  ordering      concurrency is one within a plan
  bounds        confirmation has maximum attempts and delay
  interruption  cancels confirmation and fails the current execution
  lifetime      all retry and polling work belongs to ExecutionRun
  publication   status and associated transaction hash publish together

realization effect-v4
  plain
    TransactionPlan construction
    plan ordering
    StepStatus derivation

  data
    Data.TaggedEnum:
      TransactionStep
      StepStatus
      ExecuteResult
      ExecutionError

  effects
    execute, executeStep:
      Effect<ExecuteResult, ExecutionError,
             Wallet | ChainClient | TransactionProgress>

  services
    Wallet
      Context.Service because wallet authority crosses composition levels
      and needs test substitution

    ChainClient
      Context.Service because confirmation is chain I/O with test substitution

    TransactionProgress
      Context.Service only if progress remains contextual;
      otherwise pass a local progress sink directly

  time
    Schedule for bounded confirmation attempts and spacing
    Clock supplied through Effect so tests use deterministic time

  lifetime
    confirmation runs in the executeStep scope
    no detached Fiber survives ExecutionRun

  layers
    WalletLive
      +
    ChainClientLive
      +
    TransactionProgressLive
      ->
    TransactionExecutionLive
      ->
    CreateIntent program

  errors
    wallet rejection, submission failure, confirmation failure,
    timeout, and interruption remain distinct until the UI boundary

  host
    React handler runs the CreateIntent program
    UI boundary translates ExecutionError into display text once

coverage
  R1 -> I1 I2 I3 -> sequential interpreter
  R2 -> I1 I2 I4 -> typed short-circuit
  R3 -> I6 -> bounded Schedule + scoped confirmation
  R4 -> I4 I5 -> ExecuteResult

attacks
  start step two before step one succeeds       GUARANTEED by I1 and interpreter
  failed receipt followed by success result     IMPOSSIBLE through ExecuteResult
  confirmation never resolves                   REJECTED as ConfirmationTimedOut
  close UI while polling                        GUARANTEED by ExecutionRun scope
  wallet rejects one step                       REJECTED; later steps never start

tests
  sequential execution with fake Wallet and ChainClient
  failed prerequisite prevents every later submission
  failed receipt returns Failed
  TestClock advances confirmation through success and timeout
  interruption cancels outstanding confirmation work
```
