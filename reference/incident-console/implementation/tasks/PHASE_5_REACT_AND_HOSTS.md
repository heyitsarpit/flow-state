# Phase 5: React and non-React host boundaries

Status: waiting on Phase 4

## Prerequisites and contract IDs

Phases 1-4 must have delivered the compiled AppPlan, synchronous root handles, Queue-based
actor engine, one atomic actor snapshot publication, exact primitive refs, scoped runtime
ownership, and view definitions. This phase implements TEST-007 and TEST-017 where they touch
host APIs and closes PROOF-001, PROOF-004, PROOF-006, PROOF-012, and the host-facing part of
PROOF-017. The read boundary also enforces SNAP-001, SNAP-002, and SNAP-010.

Do not start while `runtime.actor(machine)` cannot distinguish roots from merely reachable
machines, public `actor.send` still returns the actor, or a view can observe independently
mutable primitive state outside the actor snapshot.

## Allowed scope

- `FlowProvider`, runtime readiness publication, `useActor`, `useView`, and internal
  `MachineObserver`;
- the synchronous public actor command signature and non-React root lookup;
- SSR server-snapshot behavior and request/CLI root access needed to prove the host boundary;
- React 18/19 packed/type fixtures and focused React/host behavior tests;
- deletion of the old actor shell, direct resource React source, and comparator options after
  their replacements pass.

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

- [ ] Add `runtime.actor(machine)` as compiled-root lookup and constrain
      `runtime.createActor(machine, ...)` to app-reachable machines. Prove zero, ambiguous, root,
      reachable child, and unreachable cases without a global registry.
- [ ] Change the public actor command to synchronous `send(event): void`. Keep acknowledged
      dispatch package-private for Phase 6; React must not receive or await its Deferred.
- [ ] Replace the temporary actor shell with the stable runtime-owned root handle. Early sends
      must enter the real actor mailbox and wait behind the same lazy Layer acquisition as every
      other command.
- [ ] Implement a tiny synchronous readiness external store for ManagedRuntime acquisition.
      `FlowProvider` exposes the prepared runtime, rethrows acquisition failure during render,
      and supplies an immutable SSR server snapshot.
- [ ] Make `useActor(machine)` a command-only root lookup with no actor-snapshot subscription.
      Dynamic actor owners pass their actor explicitly.
- [ ] Implement `MachineObserver` and `useView(view)` / `useView(actor, view)` over one atomic
      actor snapshot and `useSyncExternalStore`. Keep structural sharing private: recursively
      reuse acyclic arrays and plain records, and use `Object.is` for cycles and opaque values.
- [ ] Prove selector failures reach the React error boundary and cannot loop on the same actor
      revision. Prove subscribe, unsubscribe, rerender, and Strict Mode behavior never changes
      resource ownership, refresh, stale time, or GC.
- [ ] Move browser runtime creation outside React initializers. Request-scoped and future story
      runtimes remain Scope-owned rather than module singletons.
- [ ] Replace host-listener `Effect.runSync` mutation with an acquire/release-owned listener that
      offers immutable focus/online facts to one runtime Queue; its managed consumer owns refresh
      policy, and no public host-signal mutator survives.

## Executable acceptance

- A send issued before Layer acquisition completes is processed exactly once after readiness;
  acquisition failure reaches the readiness store and every waiting acknowledged command.
- `useActor` renders once across actor state changes unless another subscribed value changes,
  while `useView` rerenders only when its structurally shared projection reference changes.
- React 18 and React 19 packed consumers typecheck the same hook overloads.
- Strict Mode mount/discard behavior creates no runtime, actor, subscription, lease, or fiber
  leak.
- SSR `getServerSnapshot` remains immutable for the render and never reads moving client actor
  state.
- `runtime.actor` never creates an actor; `runtime.createActor` rejects unreachable machines.
- Public declaration proof observes `actor.send(event): void` and cannot import acknowledged
  dispatch.

## Deletion obligations

Delete `packages/flow-state/src/react/use-resource.ts`,
`packages/flow-state/src/react/resource-source.ts`, their tests, the actor shell in
`react/use-actor.ts`, hook comparator inputs, and any direct resource/transaction lifecycle
hook export. Remove runtime construction from React state initializers in maintained examples.
Delete source-text tests that merely assert those filenames or token strings; replace them with
the PROOF-012 behavior and packed-consumer proofs.

Do not delete a legacy path until its replacement test passes in the same change. No deprecated
alias survives phase closure.

## Exact gates

Run, in order:

```sh
pnpm exec vp test packages/flow-state/src/react/provider.test.ts packages/flow-state/src/react/use-actor.test.ts packages/flow-state/src/react/use-view.test.ts packages/flow-state/src/runtime-lifecycle.test.ts
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

Write `reference/incident-console/implementation/receipts/PHASE_5_REACT_AND_HOSTS.md` with:

- prerequisite commit and proof IDs closed;
- the final public actor, runtime root lookup, and hook signatures;
- React 18/19, readiness, SSR, and Strict Mode test names;
- resource lease/refresh/GC counters before and after mount cycles;
- exact deleted files and removed exports;
- every command above with exit code and test count;
- `git diff --name-status` for the phase and any remaining failed or skipped acceptance.

The receipt must remain pending if any required gate, deletion, or PROOF-012 case is incomplete.

## Live evidence

- `packages/flow-state/src/react/use-actor.ts:20-134` contains the current temporary shell and
  attachment window.
- `packages/flow-state/src/core/api/runtime-types.ts:27-46` exposes the current chain-returning
  `send` signature.
- `reference/incident-console/IMPLEMENTATION_BLOCKERS.md:140-165` defines the non-React root
  requirement, and `:257-276` defines reactive capability projection.
- `reference/incident-console/DESIGN_DECISIONS.md:941-999` and `:1001-1135` settle runtime and
  React ownership.
