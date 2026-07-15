# Flow State semantic owner map

Status: final implementation inventory. This map describes the owners present
in the live tree after the public cutover; it is evidence for deletion and
review, not a second API contract.

## Semantic owners

| Capability                                                                                       | Semantic owner                                                                                                          | Adapters and projections                                                                      | Closure status                                                                             |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Resource lookup, state, subscriptions, patching, invalidation, and hydration                     | `ResourceStore` in `packages/flow-state/src/core/runtime/services/resource-store.ts`, implemented under `core/store/**` | Runtime resource handles, React resource sources, and the runtime-backed test read surface    | One owner. Testing reads the production store and actor snapshots; it has no cache engine. |
| Actor registry, lifecycle, mailbox work, restore, and ownership                                  | `OrchestratorSystem` under `core/orchestrator/**`, with transitions under `core/machines/**`                            | Runtime handles, React actor leases, server request runtimes, and testing builders            | One owner. Focused tests assemble a focused app and start a production runtime actor.      |
| Transaction admission, overlap, preview layers, completion, invalidation, recovery, and receipts | `core/orchestrator/orchestrator-transaction-*.ts`                                                                       | `flow.run`, transition submit, testing read/control surfaces, inspection, and CLI projections | One owner. The former test transaction bookkeeping engine is deleted.                      |
| Stream generations, pressure, routing, interruption, and finalization                            | `core/orchestrator/orchestrator-stream-ownership.ts`                                                                    | Controlled stream test adapter, actor snapshots, inspection, and testing controls             | One owner. The former test stream ownership engine is deleted.                             |
| One-shot timers and restored remaining delays                                                    | `core/orchestrator/orchestrator-after-timer-ownership.ts` with `core/scheduling/delayed-work.ts`                        | `TestClock` progress controls and snapshot/inspection projections                             | One owner. Testing advances time but does not schedule a second timer engine.              |
| Child start, stop, supervision, retry, restore, and cleanup                                      | `core/orchestrator/orchestrator-children.ts`                                                                            | Testing child projections and inspection reports                                              | One owner. Testing has no child lifecycle registry.                                        |
| Runtime construction, Effect execution bridge, boot commit, and disposal                         | `runtime/contract-runtime.ts`; strict boot decoding lives in `runtime/runtime-boot-decoder.ts`                          | `runtime/request-runtime.ts` is the server host boundary                                      | One owner. Promise conversion remains at explicit runtime/server/CLI host boundaries.      |
| Graph, story, behavior, trace, and semantic summaries                                            | Pure projections under `core/inspection/**` over descriptors and committed runtime facts                                | `flow-state/inspect`, the packaged CLI, generated docs, and evaluation artifacts              | One projection family. CLI renderers do not execute a shadow runtime or redefine evidence. |
| React runtime leases and subscriptions                                                           | Runtime ownership remains in `ResourceStore` and `OrchestratorSystem`; React lease coordination lives under `react/**`  | `FlowProvider`, `useActor`, `useResource`, and `useView`                                      | Adapter-only. Render is inert and commit/effect boundaries acquire and release leases.     |

## Runtime services

| Service                               | Lifetime and role                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `ResourceStore`                       | Runtime-scoped state and lookup owner with host-signal cleanup.                |
| `OrchestratorSystem`                  | Runtime-scoped actor and owned-work supervisor.                                |
| `InspectionLog` and `TraceLog`        | Runtime-scoped bounded fact retention and observer publication.                |
| `NotificationScheduler`               | Host scheduling adapter; it owns no resource or actor semantics.               |
| `HostSignals` and `FlowRuntimePolicy` | Runtime policy inputs composed through `Layer`.                                |
| `FlowAppOwnership`                    | Immutable app/module descriptor provenance used for admission and diagnostics. |

## Retained adapters and test controls

- `testing/runtime-backed-test-harness.ts` projects a production runtime actor
  and exposes deterministic controls. It does not interpret transitions,
  transactions, streams, timers, or children.
- `testing/controlled-stream.ts` is a deterministic producer adapter over the
  production stream owner, not a runtime stream implementation.
- `testing/flow-test-progress-controls.ts` advances `TestClock` and observes
  production pending work; it does not own scheduling.
- `react/**`, `server.ts`, and `cli/**` translate host concerns at their public
  boundaries and depend on the canonical runtime and inspection owners.

## Deleted duplicate owners and compatibility wrappers

- `testing/flow-test-transaction-bookkeeping.ts`,
  `testing/flow-test-stream-ownership.ts`, and
  `testing/flow-test-after-timer-ownership.ts` are absent.
- The focused test cache/interpreter and test-owned child registry are absent;
  `flowTest` and `test` use the runtime-backed harness.
- Public `snapshot()` aliases and the repository-local behavior/CLI wrapper
  scripts are absent; supported callers use `getSnapshot()` and the installed
  `flow-state` bin.

## Static reachability disposition

The final production import probe reports only files under `testing/fixtures/**`
and `testing/runtime-parity-assertions.ts` without non-test importers. They are
deliberate test-only leaves with direct test callers, so they are not product
dead code. Public entry leaves are `index.ts`, `react-entry.ts`, `testing.ts`,
`server.ts`, `inspect.ts`, and `cli/index.ts`; package exports, the build entry
list, and `bin.flow-state` are their dynamic caller evidence. No unreferenced
production implementation remains in the probe.

## Live verification

- `packages/flow-state/src/public-typing-architecture.test.ts` asserts the
  duplicate test-owner files stay absent and entrypoint ownership stays narrow.
- `packages/flow-state/scripts/check-build-output.mjs` proves root closure and
  packaged CLI hygiene.
- `packages/flow-state/scripts/check-packed-consumers.mjs` installs the produced
  tarball into core, React 18/19, multi-entry, and Launch consumers and rejects
  deep imports and duplicate-package resource identity.
- `scripts/check-example-cli-acceptance.mjs` exercises every example through its
  consumer bin shim, including deterministic artifacts, text/JSON projections,
  useful story/path/trace operations, and typed non-success exits.
- `pnpm verify` is the final source, runtime, packed, example, and docs gate.
