# Reservation Invariant derivation

Illustrative Requirements provide authority; principles guide discovery and enforcement.
This table is a worked-example lens, not a required template or source of new guarantees.

Use the `code-correctness` and `code-composition` skills for the methods behind these lenses.
Use the `design-for-verification` and `testing-policy` skills when deriving observations and Tests.

| Core principle and purpose                                                                                                           | Derive from this example                                                     | Obligation                                                                            |
|--------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| **Code Correctness — preserve shared-state relationships.** Prevent independently valid values from forming an invalid whole.        | R1/R2/R4: what must remain conserved across reserve and release?             | I1: free + reserved = configured.                                                     |
| **Code Correctness — bound resources at their authority.** Prevent competing work from spending the same capacity.                   | R1/R4: can two admissions consume the last unit?                             | I2: free capacity stays in range.                                                     |
| **Code Composition — carry established facts (“parse, don't validate”).** Establish validity once and retain its meaning downstream. | R1: which fact is independent of mutable capacity?                           | I3: admitted amounts are positive. Parsing is proposed enforcement.                   |
| **Code Correctness — make identity unambiguous.** Prevent one operation from affecting another reservation.                          | R1/R7: can different reservations share an identity?                         | I4: reservation identities are distinct.                                              |
| **Code Correctness — assign invariant authority.** Keep mutations within the domain responsible for their effects.                   | R5: can an identity refer to capacity in two domains?                        | I5: one owning Domain per identity.                                                   |
| **Code Composition — preserve protocol facts.** Do not lose established meaning through mutation or transformation.                  | R6: can the admitted amount change while reserved?                           | I6: amount equals its admitted value.                                                 |
| **Code Correctness — model legal states.** Exclude incompatible lifecycle facts.                                                     | R2: can one reservation be active and released simultaneously?               | I7: active and released are disjoint.                                                 |
| **Code Correctness — reject stale authority.** Prevent delayed or repeated work from acquiring new meaning.                          | R2/R7: can a released identity become active again?                          | I8: released history never shrinks. Combined with I7, revival is impossible.          |
| **Code Correctness — publish complete state.** Prevent observers from seeing related changes half-applied.                           | R8: where must I1/I2 hold during competing operations?                       | All public Observations, not merely quiet states.                                     |
| **Design for Verification — challenge claims independently.** Find incorrect behavior that could pass existing checks.               | R3: could a rejected request swap reservations while preserving every total? | State-unchanged postcondition plus a rejection sequence; not another total invariant. |

Derivation procedure, applied to each relevant Requirement and their interactions:

```text
identify domain facts -> list permitted transitions -> construct a violating state
    -> express the forbidden state as a falsifiable predicate
    -> name source Requirements, scope, and validity boundary
    -> establish initially; challenge every relevant transition
    -> propose enforcement separately; derive a public observation that detects failure
```

Omit duplicate predicates; continue checking remaining relationships and transitions.
Do not stop merely because all Requirements have linked IDs.
Keep postconditions and progress obligations in their own form.

```spec
requirements
    R1 Reserve capacity
        source Illustrative caller requirement.
        must Accept a positive request when sufficient capacity is free at its admission point;
             return its fresh reservation identity. Otherwise reject without mutation.
    R2 Release capacity
        source Illustrative caller requirement.
        must Release an active reservation once; repeat release returns AlreadyReleased unchanged.
    R3 Rejection
        source Illustrative caller requirement.
        must Rejected requests leave reservations and free capacity unchanged.
    R4 Initialization
        source Illustrative caller requirement.
        must Start with nonnegative configured capacity entirely free and no reservations.
    R5 Domain ownership
        source Illustrative caller requirement.
        must An identity belongs to one allocation domain; foreign or unknown releases reject unchanged.
    R6 Stable admission
        source Illustrative caller requirement.
        must A reservation retains its admitted amount until release, including after caller mutation.
    R7 Identity lifetime
        source Illustrative caller requirement.
        must Never reuse a reservation identity during its allocation domain's lifetime.
    R8 Consistent observation
        source Illustrative caller requirement.
        must Every public observation exposes one complete capacity/reservation state.
model
    Domain = one allocation lifetime with immutable configuredCapacity.
    active = this Domain's Active reservations; activeIds = their identities.
    releasedIds = this Domain's released history; previousReleasedIds = history at prior Observation.
    admittedAmount(id) = amount established when id was accepted, independent of current storage.
    domainsOwning(id) = allocation domains to which the issued identity belongs.
    Reservation = identity, owning domain, admitted amount, lifecycle Active or Released.
    Released = retained logical history, not a required tombstone collection.
    Observation = completed operation return or public snapshot; includes concurrent observations.
invariants
    I1 At Observation: freeCapacity + sum(r.amount for r in active) == configuredCapacity. [@R1, @R2, @R4, @R8]
    I2 At Observation: 0 <= freeCapacity <= configuredCapacity. [@R1, @R2, @R4, @R8]
owner Reservations
    lifetime one Domain
    state reservation identities, amounts, lifecycle, free capacity
    invariants
        I3 forall r in active: r.amount > 0. [@R1]
        I4 forall distinct r, s in this Domain: r.id != s.id. [@R1, @R7]
        I5 forall issued id: count(domainsOwning(id)) == 1. [@R5]
        I6 forall r in active: r.amount == admittedAmount(r.id). [@R6]
        I7 activeIds intersect releasedIds == empty. [@R2]
        I8 At Observation: previousReleasedIds subsetOf releasedIds within this Domain lifetime. [@R2, @R7]
algorithm
    Optional enforcement proposal; behavioral obligations above do not require these mechanisms.
    parseRequest(raw)
        decode amount into immutable PositiveAmount or return InvalidAmount before state access
    reserve(request: PositiveAmount)
        atomically within Reservations:
            if request.amount > freeCapacity: return InsufficientCapacity without writes
            prepare fresh identity and reservation before publication
            publish reservation and matching capacity reduction together
            return reservation identity
    release(identity)
        atomically within Reservations:
            if foreign or unknown: reject without writes
            if Released: return AlreadyReleased without writes
            publish Active -> Released and matching capacity restoration together
            return Released
    argument
        parse(raw) -> PositiveAmount -> reserve  // value validity: I3
        owner-check + paired publication         // mutable facts: I1/I2
        immutable amount + fresh domain identity // preserved facts: I4/I5/I6
        Active -> Released; never reactivate    // lifecycle: I7/I8
```

Counterexample sequences through the real public API; amounts and identities are domain concepts:

```text
capacity=1; race reserve(1), reserve(1) -> one success, one rejection; free=0
release(id) -> Released; release(id) -> AlreadyReleased; free=1
reserve(1) -> newId != id; release(id) -> AlreadyReleased; newId remains active
reserve(0), reserve(-1), release(foreignId) -> rejection; domain state unchanged
reserve(request.amount=1) -> id; mutate caller request
    -> observe active reservation: amount=1; release(id) -> restores exactly 1
observe during concurrent operations -> every snapshot satisfies I1/I2
```

Use real parsing and owners, observable gates instead of sleeps, and retained sequences for replay.
The algorithm is optional design exploration; no counter, collection, or lock is prescribed.
