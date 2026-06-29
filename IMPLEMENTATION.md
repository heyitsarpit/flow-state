# Flow State Remaining Plan

Pre-compaction baseline commit: `fec085dd3f0212faf652d98c5919ba80d0003910`

This file now tracks only remaining work. The source of truth is still the live
docs, [Status](apps/docs/src/pages/reference/status.mdx),
[launchWorkspace.test.ts](examples/launch-workspace/src/launchWorkspace.test.ts),
[BUGS.md](BUGS.md), and [TYPESCRIPT.md](TYPESCRIPT.md).

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
- Phase 15: diagnostics, bundle hygiene, and performance work are mostly complete; one diagnostics closeout item remains.
- Phase 16: Next.js App Router client proof is complete.
- Phase 17: request-scoped boot, serialization, and hydration boundary are executable; one preload-contract clarification remains.
- Phase 18A: staged entrypoint split and boundary isolation are complete; final 5-package migration remains.
- Phase 18B: TypeScript mode proofs and docs are complete; compiler-cost reduction work remains.

## Remaining Work

### Cross-Cutting Closeout

- Finish the remaining public diagnostics closeout so the tagged code/help/Cause/sourcemapped-stack convention is complete across the remaining callback families.
- Keep the final quality pass honest:
  - no public type escape hatches
  - no ignored public config
  - no unscoped runtime-owned work
  - no needless wrappers around Effect or synchronous reads
- Split oversized ownership-heavy files only if the remaining slices need to touch them again, especially `packages/flow-state/src/testing/flow-test.ts`.

### Phase 17: Server Preload Contract

- Clarify exactly what server-capable `flow.ensure`, `flow.observe`, `flow.refresh`, and `flow.invalidate` mean for preload behavior.
- Keep the supported server boundary narrow until new proof exists:
  - request-scoped boot
  - resource hydration
  - actor snapshot restore
- Do not widen this plan to generic Suspense reads, Server Actions ownership, or a broader RSC runtime split until they are executable.

### Phase 18A: Final Public Package Migration

- Replace staged `@flow-state/core/*` subpaths with the final real packages:
  - `@flow-state/core`
  - `@flow-state/react`
  - `@flow-state/testing`
  - `@flow-state/server`
  - `@flow-state/inspect`
- Update package metadata, exports, docs, and examples so those final names are the durable public contract.
- Review whether heavy inspect or diagnostics helpers should stay eagerly loaded or move behind their own entrypoint boundary.
- Keep Launch Workspace and the docs as the public-surface pressure test during the migration.

### Phase 18B: TypeScript Performance And Fallback Design

- Reduce library generic fan-out and compiler cost around `flow.app(...)` / `FlowAppDefinition` before asking apps to carry more named boundaries.
- Apply the Zod-style lesson directly:
  - prefer smaller public structural types
  - prefer referential named library-owned types when they materially reduce compiler work
  - justify any remaining named boundary with compiler-cost evidence, not zero-annotation aesthetics
- If `isolatedDeclarations` still needs fallbacks, keep them library-owned:
  - named helper exports
  - `satisfies`-oriented surfaces
  - narrow `define*` helpers if needed
- Re-run the proof packages and Launch Workspace declaration-emit probe after each library-side simplification.

### Reference Example Ports

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
pnpm --filter @flow-state/core pack
pnpm --filter @flow-state/launch-workspace test -- --run
pnpm --filter @flow-state/launch-workspace build
pnpm docs:build
pnpm exec tsc -p examples/launch-workspace/tsconfig.json --noEmit false --declaration --emitDeclarationOnly --declarationDir /tmp/flow-state-launch-workspace-dts
git diff --check
```
