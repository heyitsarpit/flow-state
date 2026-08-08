# Phase 3 — Resource kernel

Status: waiting on Phase 2

## Objective

Implement one revisioned resource authority with exact refs, canonical values, lookup
generations, machine-owned leases, clock-driven freshness and collection, and passive actor
projection.

## Governing contracts

`API-005`, `API-006`, `TYPE-005`, `SEM-008`–`SEM-014`, `ARCH-013`–`ARCH-016`,
`WIRE-002`, `WIRE-006`, `WIRE-009`–`WIRE-013`, `SNAP-002`–`SNAP-005`, `SNAP-010`,
`PROOF-005`, `PROOF-006`, and the resource portions of `PROOF-004` and `PROOF-014`.

## Allowed scope

Resource descriptor runtime metadata, `SubscriptionRef<StoreState>`, exact ref entries,
lookup supervisor, RcMap leases, freshness/GC timers, resource actor projection, hydration,
and focused tests.

Transaction overlays, React, and testing controls are forbidden except for interfaces that
remain inert until their later phases.

## Tasks

- [ ] Make one immutable `StoreState` in `SubscriptionRef` the sole canonical resource data
      and revision owner.
- [ ] Implement atomic commands returning changed projections and revision; changed refs are
      hints valid only for that revision.
- [ ] Use exact refs everywhere; remove descriptor-ID slots and reads that manufacture empty
      records.
- [ ] Use `FiberMap` for lookup replacement and explicit Flow generations for completion
      admission.
- [ ] Use `RcMap` only for scoped machine ownership and `gcTime`; protect expiry cleanup with
      a lease epoch and never use `RcMap.invalidate` for Flow invalidation.
- [ ] Publish stale transitions through Effect Clock timers and store revisions without
      starting lookup work.
- [ ] Implement `ensure`, `observe`, `refresh`, and invalidation ownership without counting
      actor/view/React subscribers.
- [ ] Project placeholder data only while an empty lookup generation is active; never store,
      persist, or route it as canonical success.
- [ ] Restore canonical values and timestamps, recompute freshness under the destination
      Clock, and normalize in-flight lookup generations before root activation.

## Acceptance

- Old, interrupted, or uninterruptible lookup completion cannot publish over a newer
  generation or remove its supervisor entry.
- Two keys of one resource family remain distinct in store, actors, receipts, and boot.
- React-style passive subscription changes no ownership, refresh, freshness, or GC fact.
- `gcTime: 0`, finite exact-deadline reacquisition, and infinite GC cannot let an old
  finalizer remove newly owned data.
- Staleness publishes under TestClock without an unrelated mutation.
- Placeholder is visible only for the active empty lookup and never becomes canonical.

## Deletion obligations

Delete the custom in-flight Deferred/waiter maps, subscription-count activity policy,
custom wall clock, TanStack resource source, global ref registry, descriptor-ID promotion,
and indefinite resource Map ownership.

## Gates and receipt

Run resource identity, dedupe/interruption race, multi-waiter, freshness, invalidation,
placeholder, hydration, RcMap deadline, TestClock, and actor projection tests, followed by
package tests/build. The receipt records store revision sequences, lease/finalizer counts,
generation race evidence, retained-entry bounds, deletions, and exact exits.
