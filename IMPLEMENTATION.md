# Flow State Remaining Plan

Pre-compaction baseline commit: `fec085dd3f0212faf652d98c5919ba80d0003910`

This file now tracks only remaining work. The source of truth is still the live
docs, [Status](apps/docs/src/pages/reference/status.mdx),
[launchWorkspace.test.ts](examples/launch-workspace/src/launchWorkspace.test.ts),
[BUGS.md](BUGS.md), and [TYPESCRIPT.md](TYPESCRIPT.md).

Decision locks for the remaining work:

- This file is bounded to the still-open work below. Do not reopen completed
  phases unless a new blocker is proven.
- `examples/launch-workspace` remains a verification and pressure-test surface
  only. Use its existing gates, but do not create new example-focused cleanup
  or redesign work under this goal.
- `Reference Example Ports` are future potential work, not part of Goal 1.

## Collapsed History

- Phase 0: cleanup reset and failing-first rebuild baseline complete.
- Phase 1: public builders and descriptor model complete.
- Phase 2: selection source and `ResourceStore` complete.
- Phase 3: Effect runtime and `App.layer` complete.
- Phase 4: machine transition core complete for the supported subset.
- Phase 5: `OrchestratorSystem` and actor lifecycle complete for the supported subset.
- Phase 6: invokes, resources, streams, and time complete for the supported subset.
- Phase 7: transactions complete for the supported subset; offline queue/replay/undo remain intentionally parked.
- Phase 8: views and read models are executable; broadening them is no longer the blocker.
- Phase 9: React adapter is executable.
- Phase 10: Launch Workspace integration is executable.
- Phase 11: model testing, replay, and trace are executable for the supported subset.
- Phase 12: docs and generated status surfaces are in place.
- Phase 13: durable naming, integration follow-up, and scenario-matrix closeout are in place.
- Phase 14: observable runtime, deterministic controls, semantic layers, and truth surfaces are executable.
- Phase 15: diagnostics, bundle hygiene, and performance work are complete for the supported subset.
- Phase 16: Next.js App Router client proof is complete.
- Phase 17: request-scoped boot, serialization, hydration, and preload semantics are complete for the supported subset.
- Phase 18A: final public package migration is complete across package metadata, exports, docs, examples, and type proof surfaces.
- Cross-Cutting Closeout: public diagnostics callback families are covered by tagged code/help/Cause snapshots, and the delete-now API cleanup is complete (`createRuntime`, rest-arg `flow.app(...)`, factory `flow.module(...)`, `flow.persist(...)`, and `flow.permission(...)` are removed from public surfaces; `flow.outcomes(...)` remains).
- Phase 18B: TypeScript performance closeout is complete. `FlowModuleMap` now uses a key-remapped module union instead of repeated `Extract<...>` projections, preserving exact `app.moduleMap.<id>` typing while reducing Launch Workspace declaration-emit instantiations from 305,987 to 305,730 and core declaration output from 41.71 kB to 41.68 kB.

## Remaining Work

No remaining implementation slices are open under this goal. Run the final gates
below before calling the goal complete.

## Future Potential Work

### Reference Example Ports

This section is intentionally out of scope for the current implementation goal.

- Port 1-3 small TanStack Query reference apps into Flow-native example packages to add more product-shaped testing pressure.
- First ports:
  - `pagination`
  - `optimistic-updates-cache`
  - `chat`
- Each port must include:
  - focused scenario tests
  - at least one small inspection/debug surface
  - clear mapping from app behavior to Flow ownership
- Defer suspense-heavy and offline examples until the Flow contract actually broadens enough to support them honestly.

## Final Gates

Run these before calling the remaining work done:

```sh
pnpm verify
pnpm --filter flow-state pack
pnpm --filter @flow-state/launch-workspace test -- --run
pnpm --filter @flow-state/launch-workspace build
pnpm docs:build
pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit false --declaration --emitDeclarationOnly --declarationDir /tmp/flow-state-launch-workspace-dts
git diff --check
```
