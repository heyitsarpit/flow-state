# Behavioral Spec example

Illustrative syntax, not a project contract or verification receipt.
This example leaves implementation and execution evidence unresolved.

```text
spec TransactionExecution
status proposed
basis Illustrative ordered transaction execution contract.
location src/transactions
provides execute
requirements
    R1 Sequential execution
        source Supplied consumer requirement.
        must Execute declared steps in order; start a step only after its prerequisite succeeds.
    R2 Terminal outcome
        source Supplied consumer requirement.
        must Return success only when all steps succeed. On failure, identify the failed step
             and do not start later steps.
    R3 Bounded confirmation
        source Supplied consumer requirement.
        must Settle a started confirmation as success, failure, timeout, or interruption within
             the configured confirmation bound.
open
    Q1 Implementation and behavior checks are not yet verified.
        outcome All coverage remains pending execution evidence.
invariants
    I4 Success requires every declared step to succeed. [@R2]
owner ExecutionRun
    invariants
        I1 At most one submission is active; steps start in declared order after prerequisite
           success. [@R1]
        I2 Failure prevents later steps from starting. [@R2]
        I3 A started confirmation cannot remain pending beyond its configured bound. [@R3]
coverage
    @R1
        enforced_by [@I1], enforcing implementation unresolved.
        open_by [@Q1]
    @R2
        enforced_by [@I2, @I4], enforcing implementation unresolved.
        open_by [@Q1]
    @R3
        enforced_by [@I3], enforcing implementation unresolved.
        open_by [@Q1]
tests
    T1 Through the public execution API, observe ordered submissions and no overlapping activity.
    T2 Reject a prerequisite through a controlled external dependency; assert failure identifies
       that step and later submissions never start.
    T3 Through the public execution API with controlled time, assert success, timeout, and
       interruption settle the result and leave no owned confirmation work running.
    T4 Through the public execution API, complete every step successfully; assert success
       only after the final step succeeds. [@I4]
```

Use real execution components. Name substituted external dependencies and limit the evidence claim.
The owner label scopes invariants; it does not prescribe an implementation class or module.
