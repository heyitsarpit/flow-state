# Phase 3 — Resource kernel

Status: waiting on Phase 2

## Objective

Implement one revisioned resource authority with exact refs, canonical values, lookup
generations, machine-owned leases, clock-driven freshness and collection, and passive actor
projection.

## Governing contracts

`API-005`, `API-006`, `TYPE-005`, `SEM-006A`, `SEM-008`–`SEM-014`, `ARCH-013`–`ARCH-016`,
`ARCH-013A`, `ARCH-013B`,
`WIRE-002`, `WIRE-006`, the resource portions of `WIRE-009`–`WIRE-011`, `WIRE-013`,
`SNAP-002`–`SNAP-005`, `SNAP-010`,
`PROOF-005`, `PROOF-006`, and the resource portions of `PROOF-004` and `PROOF-014`.

## Allowed scope

Resource descriptor runtime metadata, `SubscriptionRef<StoreState>`, exact ref entries,
lookup supervisor, RcMap leases, freshness/GC timers, resource actor projection, hydration,
and focused tests.

Transaction overlays, React, and testing controls are forbidden except for interfaces that
remain inert until their later phases.

## Tasks

- [ ] Make online state advisory. Offline never blocks explicit resource
      activities or cancels in-flight work; reconnect and focus start only an actively observed
      missing or stale ref without an existing generation, and snapshots gain no paused state.
- [ ] Keep runtime-sized keyed collection reconciliation and infinite-query bindings out of vNext.
      Each declaration materializes one ref; use static bindings or an application-owned
      aggregate resource/stream and do not claim dynamic parallel coverage.
- [ ] Make StoreState capture complete and deterministic. No current-view,
      unreferenced-warmth, sensitivity, or descriptor predicate omission is permitted.
- [ ] Make one immutable `StoreState` in `SubscriptionRef` the sole canonical resource data
      and revision owner.
- [ ] Implement atomic commands returning an ordered deduplicated immutable changed-ref vector and
      revision; the vector is a hint valid only for that revision and any gap forces a full reread. Actor-originated changes pass through the Phase 2
      StoreFanout barrier, while autonomous stale/GC commits fan out after store publication.
- [ ] Use exact refs everywhere; remove descriptor-ID slots and reads that manufacture empty
      records.
- [ ] Use descriptor ID plus the frozen canonical argument tuple as the only resource identity;
      delete resource projected keys and canonical-key invalidation filters from execution,
      snapshots, hydration, fixtures, inspection, and artifacts.
- [ ] Use `FiberMap` for lookup replacement and explicit Flow generations for completion
      admission.
- [ ] Use `RcMap` only for scoped machine ownership and `gcTime`; protect expiry cleanup with
      a lease epoch and never use `RcMap.invalidate` for Flow invalidation.
- [ ] Gate expiry, invalidation, refresh, lookup replacement, lease reacquisition, and an old GC
      finalizer at one TestClock instant; prove ordinary StoreKernel permit order plus generation and
      lease-epoch checks prevents a later base or owner from being marked stale or evicted.
- [ ] Publish stale transitions through Effect Clock timers and store revisions without
      starting lookup work.
- [ ] Publish successful values fresh before scheduling `staleTime: 0` as a later same-time turn;
      schedule `gcTime: 0` collection only as a later turn after final eligible release, and retain
      consumed finite-binding leases until their configuration activation releases.
- [ ] Implement `ensure`, `observe`, `refresh`, and invalidation ownership without counting
      actor/view/React subscribers.
- [ ] Implement `SEM-011A/B`: finite activation registrations, joined-generation fanout,
      canonical `valueRevision`, post-publication outcome routing, restored emission cursors, and
      no emissions for placeholders or metadata-only commits.
- [ ] Add each mapped resource result to Phase 2's `PendingOutcome` map in the same actor turn that
      advances the finite-consumed or observe-emission cursor; enqueue only the stable outcome ID.
- [ ] Implement direct ref/tag invalidation and computed
      `activity.invalidate({ targets })`; materialize and deduplicate the target vector during
      pure planning and commit it once without retaining a selector or predicate in StoreKernel.
- [ ] Implement the fixed factored `ResourceSnapshot` union from `SNAP-003` directly; do not
      synthesize a descriptor-dependent Cartesian conditional type.
- [ ] Project placeholder data only while an empty lookup generation is active; never store,
      persist, or route it as canonical success. Keep `.status` as the derived convenience, but
      do not duplicate placeholder or failed-refresh facts in extra booleans/error fields.
- [ ] Restore canonical values and timestamps, recompute freshness under the destination
      Clock, and normalize in-flight lookup generations before root activation.

## Acceptance

- Old, interrupted, or uninterruptible lookup completion cannot publish over a newer
  generation or remove its supervisor entry.
- Two different argument tuples of one resource family remain distinct in store, actors,
  receipts, and boot.
- Actors never subscribe directly to StoreState; StoreFanout preserves initiating-actor-first
  publication. React-style passive subscription changes no ownership, refresh, freshness, or
  GC fact.
- `gcTime: 0`, finite exact-deadline reacquisition, and infinite GC cannot let an old
  finalizer remove newly owned data.
- Staleness publishes under TestClock without an unrelated mutation.
- Placeholder is visible only for the active empty lookup and never becomes canonical.
- Fresh finite hits, stale retained data, joined work, equal-value refresh, observe replay,
  invalidation-only commits, and hydration emit exactly the contracted outcomes once.
- A dehydration cut between resource projection and mapped-event processing restores and applies
  that event exactly once.
- Every legal resource snapshot narrows without a cast and illegal field combinations fail the
  package-owned declaration fixtures within the type-cost budget.

## Deletion obligations

Delete the custom in-flight Deferred/waiter maps, subscription-count activity policy,
custom wall clock, TanStack resource source, global ref registry, resource projected-key and
descriptor-ID promotion, canonical-key invalidation filters, and indefinite resource Map
ownership.

## Gates and receipt

Run resource identity, dedupe/interruption race, multi-waiter, freshness, invalidation,
placeholder, hydration, RcMap deadline, TestClock, and actor projection tests, followed by
package tests/build. The receipt records store revision sequences, lease/finalizer counts,
generation race evidence, retained-entry bounds, deletions, and exact exits.
