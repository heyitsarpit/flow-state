# Behavioral Spec example

Illustrative contract, not implementation evidence. Names below describe contract state.

```text
spec TransactionExecution
status proposed
basis Illustrative agreed ordered execution and cancellation requirements.
location src/transactions
provides execute
requirements
    R1 Prerequisite ordering
        source Illustrative agreed caller requirement.
        must Start a step only after all earlier declared steps succeed.
    R2 Failure result
        source Illustrative agreed caller requirement.
        must A failed step returns its identity and prevents later steps from starting.
    R3 Success result
        source Illustrative agreed caller requirement.
        must If every declared step succeeds and interruption has not been accepted, settle as
             success, assuming execution continues to be scheduled. Never return success earlier.
    R4 Interruption cleanup
        source Illustrative agreed caller requirement.
        must Interruption stops locally owned confirmation work before execution settles.
    R5 Interruption admission
        source Illustrative agreed caller requirement.
        must Accept interruption if execution is unsettled when the request takes effect; after
             acceptance, no not-yet-started step may start. If execution has already settled,
             interruption has no effect on its result.
    R6 Interruption result
        source Illustrative agreed caller requirement.
        must Accepted interruption settles as Interrupted, never success; it does not undo remote work.
open
    Q1 Enforcement and executable evidence remain unresolved.
        outcome Tests are obligations, not identified executables or passing runs.
model
    Run = ordered steps with observable started/succeeded facts and a settled result.
    LocalWork = confirmation work owned by this run; excludes remote submitted transactions.
    InterruptionAcceptance = one observable ordering decision before settlement; a request racing
        settlement may lose to settlement or be accepted first, never both.
invariants
    I1 For every started step i, every declared step j < i has succeeded. [@R1]
owner ExecutionRun
    invariants
        I2 result == success implies every declared step has succeeded. [@R3]
        I3 interrupted and settled implies count(activeLocalConfirmationWork) == 0. [@R4]
coverage
    @R1
        enforced_by [@I1], implementation unresolved
        open_by [@Q1]
    @R2
        enforced_by execution failure boundary, implementation unresolved
        open_by [@Q1]
    @R3
        enforced_by [@I2], implementation unresolved
        open_by [@Q1]
    @R4
        enforced_by [@I3], implementation unresolved
        open_by [@Q1]
    @R5
        enforced_by execution admission boundary, implementation unresolved
        open_by [@Q1]
    @R6
        enforced_by execution result boundary, implementation unresolved
        open_by [@Q1]
tests
    T1 Gate confirmation of A through a controlled chain dependency; B never starts while A waits.
    T2 Fail A in plan [A,B]; result identifies A and the dependency observes zero B submissions.
    T3 Complete A then B; success appears only after B confirmation succeeds.
    T4 Interrupt while A confirms; expect Interrupted. Drive controlled time after settlement:
       no local confirmation calls occur and B never starts. [@R4, @R5, @R6]
    T5 Race interruption with final success: either success settles first and stays success, or
       interruption is accepted first and settles as Interrupted after cleanup. No second result.
```

Exercise the production execution API and real owners; substitute only the named wallet/chain edges.
Keep interruption cleanup and failure outcomes explicit without prescribing fibers, queues, or maps.
