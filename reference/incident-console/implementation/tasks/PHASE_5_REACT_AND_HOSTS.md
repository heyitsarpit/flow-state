# Phase 5: React and non-React host boundaries

Status: waiting on Phase 4

## Prerequisites and contract IDs

Phases 1-4 must have delivered the compiled AppPlan, synchronous root handles, Queue-based
actor engine, package-private acknowledged dispatch, public `actor.send(event): void`, one atomic
actor snapshot publication, exact primitive refs, scoped runtime ownership, and view definitions.
Phase 2 owns SEM-006, HOST-003, HOST-004, TEST-007, and the public-send declaration change;
this phase consumes those contracts without reopening actor dispatch.

This phase implements the `FlowDehydrateError` part of API-001/API-002, API-012A, TYPE-013,
HOST-007 through HOST-015, SEM-025 through
SEM-027, ARCH-018, ARCH-019, and TEST-017 where they touch React and non-React hosts. It consumes
the executable private root contracts implemented in Phases 1–4 and consumes
SEM-006, HOST-001 through HOST-006, HOST-016, HOST-018, TYPE-011, TYPE-012, TEST-007, and CUT-006
from Phase 2. `PROOF-001`, `PROOF-004`, `PROOF-006`, `PROOF-012`, and `PROOF-017` govern this
work; the receipt closes only their Phase 0-assigned Phase 5 subcase IDs. The read boundary also enforces
SNAP-001, SNAP-002, and SNAP-010.

Do not start while Phase 2's receipt lacks the public-send, private-acknowledgment, and
root-versus-reachable actor-authority proofs, or a view can observe independently mutable
primitive state outside the actor snapshot.

## Allowed scope

- `FlowProvider`, runtime readiness publication, `useActor`, `useView`, and internal
  `MachineObserver`;
- verification of the synchronous public actor command and non-React root lookup;
- SSR server-snapshot behavior and the scoped `withRequestRuntime` host helper later consumed by
  server and CLI integration;
- private root/React declarations and packed migration fixtures; public cutover remains Phase 7;
- React 18/19 packed/type fixtures and focused React/host behavior tests;
- a deletion manifest for the legacy root/React facades, direct resource React source, and
  comparator options, executed only in Phase 7.

## Forbidden work

- Do not implement stories, fixtures, controls, checkpoints, model discovery, artifact v2, or
  CLI rendering in this phase.
- Do not let React create, start, replace, or dispose an actor because a component mounted.
- Do not add `useCan`, `useResource`, `useTransaction`, Suspense integration, per-view equality,
  provider-owned Layer assembly, or a generic runtime loading machine state.
- Do not make `useActor` subscribe or change `actor.send(event): void` into a Promise/Effect
  acknowledgment API.
- Do not retain inspection history in the provider, observer, actor, or hook.

## Tasks

- [ ] Publish advisory online/focus facts through managed ownership; offline does not pause work
      and reconnect/focus follow Phase 3's active-observe rule.
- [ ] Ensure `runtime.actor(machine, { id })` returns any exact live stable-ID dynamic handle without
      adoption, preserves React handoff and disposal ownership, and rejects every identity mismatch.
- [ ] Export `FlowDehydrateError` with its exact terminal kinds and `retryable: true` only for
      `ConcurrentDehydrate`, without exposing StoreKernel or internal Cause.
- [ ] Consume Phase 2's root/dynamic `runtime.actor` overloads and constrained
      `runtime.createActor` without a
      React registry or alternate lookup path. Re-prove zero, ambiguous, root, reachable child,
      and unreachable host cases.
- [ ] Prove `createActor` accepts an app-level dynamic seed with exact input while root lookup and
      `useActor(machine)` reject it as a non-root; explicit stable-ID dynamic lookup accepts only an
      existing durable incarnation. Runtime construction remains the last admission point.
- [ ] Consume Phase 2's synchronous `send(event): void` and package-private acknowledged dispatch
      without wrapping, overloading, or exporting the Deferred. React receives only the public
      command handle.
- [ ] Replace the temporary actor shell with the stable runtime-owned root handle. Early sends
      must enter the real actor mailbox and wait behind the same lazy Layer acquisition as every
      other command.
- [ ] Implement a tiny synchronous readiness external store for ManagedRuntime acquisition.
      `FlowProvider` exposes the prepared runtime, rethrows acquisition failure during render,
      throws the stable disposed-runtime diagnostic after disposal, and supplies an immutable SSR
      server snapshot.
- [ ] Make `useActor(machine)` a command-only root lookup with no actor-snapshot subscription.
      Dynamic actor owners pass their actor explicitly.
- [ ] Implement `MachineObserver` and `useView(view)` / `useView(actor, view)` over one atomic
      actor snapshot and `useSyncExternalStore`. Keep structural sharing private: recursively
      reuse acyclic arrays and plain records, and use `Object.is` for cycles and opaque values.
- [ ] Make MachineObserver own one immutable prepared server selection outside hook invocation and
      a separate live selection for subscriptions; execute the runtime behavior matrix in packed
      React 18 and 19 renderers rather than treating the current typecheck loop as behavior proof.
- [ ] Resolve one-argument views through provider AppPlan and require exactly one public root;
      diagnose zero/multiple matches without actor creation or subscription.
- [ ] Prove selector failures reach the React error boundary and cannot loop on the same actor
      revision. Prove subscribe, unsubscribe, rerender, and Strict Mode behavior never changes
      resource ownership, refresh, stale time, or GC.
- [ ] Move browser runtime creation outside React initializers. Request-scoped and future story
      runtimes remain Scope-owned rather than module singletons.
- [ ] Implement `withRequestRuntime({ app, layer, boot?, mode? }, handler)` as the one scoped request host.
      It creates one runtime, exposes root lookup to the handler, and awaits disposal after success,
      failure, or interruption. It does not preload services or own artifact rendering.
- [ ] Prove SSR as two sequential helper lifetimes: preload through typed events, dehydrate and
      dispose, then construct a mutation-free render runtime from that boot; client construction
      from the same boot must match the first view selection.
- [ ] Replace host-listener `Effect.runSync` mutation with an acquire/release-owned listener that
      offers immutable focus/online facts to one runtime Queue; its managed consumer owns refresh
      policy, and no public host-signal mutator survives.
- [ ] Prove the private root and React owners together without changing package exports. Keep the
      vNext server helper private until Phase 7 atomically switches every public route and deletes
      all legacy owners.

## Executable acceptance

- A send issued before Layer acquisition completes is processed exactly once after readiness;
  acquisition failure reaches the readiness store and every waiting acknowledged command.
- `useActor` renders once across actor state changes unless another subscribed value changes,
  while `useView` rerenders only when its structurally shared projection reference changes.
- React 18 and React 19 packed consumers typecheck the same hook overloads.
- React 18 and React 19 packed renderers execute pending/failure/disposal Provider, Strict Mode,
  selector failure, server hydration, and subscription-race proofs.
- Strict Mode mount/discard behavior creates no runtime, actor, subscription, lease, or fiber
  leak.
- SSR `getServerSnapshot` remains immutable for the render and never reads moving client actor
  state.
- `runtime.actor` never creates an actor; `runtime.createActor` rejects unreachable machines.
- Public declaration proof observes `actor.send(event): void` and cannot import acknowledged
  dispatch.
- Two concurrent request helpers share no runtime, actor, store, Layer acquisition, sink, or
  finalizer state, and both await disposal on success and failure.

## Deletion obligations

Record `packages/flow-state/src/react/use-resource.ts`,
`packages/flow-state/src/react/resource-source.ts`, their tests, the actor shell in
`react/use-actor.ts`, hook comparator inputs, and direct resource/transaction lifecycle hooks in the
Phase 7 deletion manifest. Phase 5 changes no public legacy owner. Remove them only during the
all-route cutover after PROOF-012's private behavior and packed fixtures pass.

Do not delete a legacy path until its replacement test passes in the same change. No deprecated
alias survives phase closure.

## Exact gates

Run, in order:

```sh
pnpm exec vp test packages/flow-state/src/react/provider.test.ts packages/flow-state/src/react/use-actor.test.ts packages/flow-state/src/react/use-view.test.ts packages/flow-state/src/runtime-lifecycle.test.ts packages/flow-state/src/runtime/request-runtime.test.ts
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state test
pnpm --filter flow-state build
pnpm --filter flow-state check:typescript-mode-proofs
pnpm --filter flow-state check:packed-consumers
```

If maintained example bootstrap code changes, also run each affected example's `test` and
`build` scripts. Browser acceptance remains a Phase 8 closeout gate unless this phase changes
the Incident Console browser bootstrap, in which case run `pnpm test:browser` here too.

## Receipt requirements

Write `reference/incident-console/implementation/receipts/PHASE_5.md` with:

- prerequisite commit and proof IDs closed;
- the consumed public actor signature and final runtime root, request-helper, and hook signatures;
- React 18/19, readiness, SSR, Strict Mode, and request-isolation test names;
- resource lease/refresh/GC counters before and after mount cycles;
- exact deleted files and removed exports;
- every command above with exit code and test count;
- `git diff --name-status` for the phase and any remaining failed or skipped acceptance.

The receipt must remain pending if any required gate, deletion, or PROOF-012 case is incomplete.
