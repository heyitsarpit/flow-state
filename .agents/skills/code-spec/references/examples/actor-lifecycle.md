# Example: Actor lease disposal

An inferred Spec for admitting, coalescing, and settling terminal disposal of one exposed actor.

```spec
spec ActorLeaseDisposal
status       proposed
basis        inferred from existing behavior
location     .agents/skills/code-spec/references/examples/actor-lifecycle.md
realized-by  packages/flow-state-rewrite/src/runtime-next/actor/actor-lease.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-engine.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-engine-lifecycle.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-mailbox.ts
             packages/flow-state-rewrite/src/runtime-next/actor/lifecycle.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-directory.ts
             packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts
             packages/flow-state-rewrite/src/runtime-next/test/admission.test.ts
             packages/flow-state-rewrite/src/runtime-next/test/actors.test.ts
             packages/flow-state-rewrite/src/runtime-next/test/lifecycle.test.ts
implements   R1 R2 R3 R4 R5
provides     dispose

requirements
    R1
        source  packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts constructs a lease and a disposal program before observing any callback
        must    constructing a lease or its disposal program starts no preflight, cleanup, or retirement work

    R2
        source  packages/flow-state-rewrite/src/runtime-next/actor/actor-lease.ts leaves the claim idle after a rejected preflight; packages/flow-state-rewrite/src/runtime-next/test/admission.test.ts RN-ADMIT-009 proves a later retry
        must    when a preflight failure reaches the claim decision while the lease is idle, reject without cleanup or retirement and allow a later attempt

    R3
        source  packages/flow-state-rewrite/src/runtime-next/actor/actor-lease.ts and packages/flow-state-rewrite/src/runtime-next/test/actors.test.ts RN-ACTOR-010 share one terminal cleanup among concurrent disposal callers
        must    after one claim is published, every later caller joins it without starting another cleanup or preflight; callers that wait through settlement observe its same terminal outcome

    R4
        source  packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts retains a cleanup Cause and skips retirement after cleanup failure
        must    run retirement only after cleanup succeeds, and retain the complete cleanup or retirement outcome as the lease's terminal result

    R5
        source  packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts proves that a waiter interruption leaves owner-scoped cleanup running and that owner-scope closure settles it
        must    keep cleanup independent of any one caller's wait while making its lifetime a child of the lease owner lifetime

open
    RK1 any cleanup failure is terminal for ActorLease and skips retirement, while ActorEngine.shutdown can fail either before or after publishing disposed
        outcome  a pre-terminal failure can reopen mailbox admission and a post-terminal cleanup failure can leave a disposed actor registered; recovery across these owners is unspecified

model
    DisposalOutcome =
        | Succeeded
        | Failed{diagnostic: PublicDiagnostic}
        | Interrupted
        | Defect{cause}

    DisposalSettlement = Pending | Complete{outcome: DisposalOutcome}

    ActorLeaseState =
        | Idle
        | Claimed{settlement: DisposalSettlement}

    ClaimDecision =
        | Reject{outcome: DisposalOutcome}
        | Start{settlement: DisposalSettlement}
        | Join{settlement: DisposalSettlement}

    transitions
        ST1 Idle + failed preflight, still Idle at claim decision -> Idle
        ST2 Idle + successful preflight + claim publication -> Claimed{pending}
        ST3 Claimed{pending} + dispose -> Claimed{pending}; caller joins completion
        ST4 Claimed{pending} + cleanup failure or owner-scope interruption -> Claimed{terminal failure}
        ST5 Claimed{pending} + cleanup success -> run retirement and store its terminal outcome

owner ActorLease
    lifetime  one exposed actor lease; the claim lasts for the lease's lifetime
    state     fixed actor value, Idle or Claimed with one shared settlement

    invariants
        I1 a failed preflight cannot claim an Idle lease [R2]
        I2 at most one cleanup worker is started for one lease [R3]
        I3 every caller arriving after the claim awaits the same completion [R3]
        I4 retirement is not invoked after cleanup failure [R4]
        I5 the worker belongs to the lease owner lifetime, not to the caller that won the claim [R5]

operations
    makeActorLease(actor, ownerLifetime, preflight, cleanup, retire) -> ActorLease
        ensures    exposes the supplied actor and one disposal authority
        completes  without running any callback

    dispose() -> Unit
        fails      PublicDiagnostic
        requires   a successful preflight is required only to create the first claim
        ensures    a returned success means cleanup and retirement both succeeded
                   after a claim, callers that wait through settlement observe the same terminal outcome
        publishes  Idle -> Claimed once, with a completion shared by all joiners
        completes  after preflight rejection or terminal settlement; a caller may be interrupted while waiting

algorithm
    dispose
        1. If the state is Claimed, await its settlement and replay its outcome.
        2. If the state is Idle, evaluate preflight and retain its full outcome.
        3. Atomically re-read the state: join an existing claim; otherwise reject a failed preflight or publish a new claim.
        4. For a new claim, start one worker in the lease owner lifetime. Run cleanup, then run retirement only after cleanup succeeds.
        5. Complete the shared settlement with the full terminal outcome; each caller waits interruptibly.

    argument
        the atomic re-read makes a concurrent claim win over this caller's preflight result and prevents a second worker;
        the shared settlement preserves cleanup and retirement failures for every waiter;
        putting the worker in the lease owner lifetime lets caller interruption detach one waiter without cancelling disposal;
        capturing owner-scope interruption settles the claim instead of leaving waiters pending

composition
    flow
        ActorLease.dispose
            -> dependency preflight
            -> publish one terminal claim
            -> supplied actor cleanup
            -> supplied retirement after cleanup success
            -> shared terminal outcome

    uses
        dependency preflight
            kind      capability
            found-in  packages/flow-state-rewrite/src/runtime-next/actor/actor-lease.ts and packages/flow-state-rewrite/src/runtime-next/test/admission.test.ts
            role      reject disposal while a dependent actor still blocks it
            reuse     reuse-as-is through the existing preflight callback

        ActorEngine shutdown
            kind      capability
            found-in  packages/flow-state-rewrite/src/runtime-next/actor/actor-engine.ts and packages/flow-state-rewrite/src/runtime-next/actor/lifecycle.ts
            role      seal admission, drain accepted commands, publish terminal lifecycle when needed, and close actor-owned work
            reuse     reuse-as-is through the existing cleanup callback

        ActorDirectory retirement
            kind      capability
            found-in  packages/flow-state-rewrite/src/runtime-next/actor/actor-directory.ts
            role      tombstone a stable actor identity or remove a local identity after cleanup
            reuse     reuse-as-is through the existing retirement callback

    boundaries
        lease -> dependency preflight
            protocol  preflight() -> Unit; fails PublicDiagnostic
            facts     no terminal claim has been published when the callback begins
            hides     how the caller determines whether dependent actors remain

        lease -> actor cleanup callback
            protocol  cleanup() -> Unit; fails PublicDiagnostic; may end interrupted or defective
            facts     one lease claim owns the cleanup attempt
            hides     when backed by ActorEngine.shutdown, activation joining, mailbox sealing and draining, lifecycle publication, observation completion, and evidence-credit release

        lease -> retirement callback
            protocol  retire() -> Unit; fails PublicDiagnostic; may end interrupted or defective
            facts     cleanup succeeded for the identity captured by the caller
            hides     when backed by ActorDirectory.retire, stable tombstones and local-slot removal

rules
    publication  re-read Idle or Claimed and publish the claim decision atomically
    ordering     preflight, claim, cleanup, then retirement; skip retirement when cleanup fails
    concurrency  a caller arriving after claim publication joins its completion
    lifetime     the cleanup worker belongs to the lease owner lifetime; caller waiters do not own it
    settlement   cache and replay the complete terminal outcome, including defects and interruption

realization effect-v4
    state       SynchronizedRef stores Idle or Claimed
    settlement  Deferred<Exit<void, PublicDiagnostic>> shares the terminal outcome
    lifetime    Scope.Scope owns the cleanup worker independently of caller waiters
    masking     uninterruptibleMask makes claim and settlement publication indivisible while restoring callbacks and waits

coverage
    R1
        enforced-by  inert disposal-program construction in makeActorLease
        proven-by    T1

    R2
        enforced-by  failed preflight rejects only while the atomic re-read remains Idle
        proven-by    T1 T2

    R3
        enforced-by  I2 I3 and the single shared settlement
        proven-by    T3

    R4
        enforced-by  I4 and cleanup-before-retirement sequencing
        proven-by    T4 T5

    R5
        enforced-by  owner-lifetime worker and restored waiter interruption
        proven-by    T3 T6

attacks
    A1 two callers both pass the initial Idle read
        blocked-by  the atomic claim re-read makes one start and the other join

    A2 interrupt the caller that started disposal
        blocked-by  cleanup runs in the lease owner lifetime and the caller only owns its wait

    A3 reject disposal while dependencies remain, then remove the dependency
        outcome  the lease remains Idle and a later preflight may claim it

    A4 close the lease owner lifetime during active cleanup
        outcome  cleanup is interrupted and its full terminal outcome is settled for later callers; no retry is available on the claimed lease

    A5 fail cleanup after the actor engine has sealed admission
        outcome  the lease caches the failure and skips retirement; if the engine has not published disposed, RK1 remains

tests
    T1 packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts proves inert construction, rejected preflight, and retry
    T2 packages/flow-state-rewrite/src/runtime-next/test/admission.test.ts RN-ADMIT-009 proves dependency preflight rejection before cleanup and directory retirement
    T3 packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts and packages/flow-state-rewrite/src/runtime-next/test/actors.test.ts RN-ACTOR-010 prove one cleanup, shared outcome, and caller interruption isolation
    T4 packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts proves the cleanup Cause is retained and retirement is skipped
    T5 packages/flow-state-rewrite/src/runtime-next/test/admission.test.ts RN-ADMIT-009 and RN-ADMIT-011 prove successful retirement and that cleanup failure does not tombstone the registration
    T6 packages/flow-state-rewrite/src/runtime-next/test/actor-lease-owner.test.ts proves owner-scope interruption settles the cached result
    T7 packages/flow-state-rewrite/src/runtime-next/test/actors.test.ts RN-ACTOR-005 and packages/flow-state-rewrite/src/runtime-next/test/lifecycle.test.ts prove actor shutdown drains earlier work, closes admission, and settles cleanup failure
```
