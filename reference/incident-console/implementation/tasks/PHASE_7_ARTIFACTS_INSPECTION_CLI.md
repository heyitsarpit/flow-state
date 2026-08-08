# Phase 7: Artifacts, inspection, server integration, and CLI

Status: waiting on Phase 6

## Prerequisites and contract IDs

Phases 1-6 must provide the compiled AppPlan, immutable v2-capable runtime data, atomic
TurnRecords, sink publication, scoped request runtime, registered immutable stories, pure model
paths, and the one story runner.

This phase implements TEST-016 and integrates TEST-001, TEST-003, TEST-009 through TEST-011,
and TEST-017 with tools. It closes PROOF-010, PROOF-013, PROOF-014, the tool-facing portion of
PROOF-017, and any remaining artifact cases in PROOF-005. Artifact codecs preserve every
SNAP-001 through SNAP-010 identity and discriminant owned by the corresponding envelope.

## Allowed scope

- private Schema-v2 codecs for boot, trace, and behavior envelopes;
- TurnRecord sinks and `createInspectionBufferSink`;
- inspection, receipt, trace, behavior, coverage, and rendering projections derived from one
  TurnRecord source;
- request-scoped server runtime and root-machine preload;
- CLI gateway, registered-story discovery/execution, model path listing/checking, artifact
  import/export, and concise rendering;
- deletion of v1 compatibility, mutable parallel histories, arbitrary event fabrication, and
  duplicate runner/report envelopes after replacements pass.

## Forbidden work

- Do not change domain authoring to Effect Schema or claim runtime validation of erased domain
  payload types.
- Do not store inspection history in the actor, runtime core, story result, provider, or a
  process-global singleton.
- Do not retain both TurnRecord history and independently mutable receipt, trace, or inspection
  histories.
- Do not add another story executor, scenario result, CLI-only harness, or model replay path.
- Do not let the CLI fabricate arbitrary payload-bearing events or mutate runtime resource
  state directly.
- Do not silently accept or guess v1 artifacts as v2.

## Tasks

- [ ] Define private Schema-v2 envelopes for runtime boot, trace artifacts, and behavior contracts.
      Validate Flow-owned version, app, definition, token, actor, primitive, and ref identity while
      preserving domain memory and payloads as application-owned opaque values.
- [ ] Make boot immutable runtime constructor input and decode/normalize it before root activity.
      Resolve roots and dynamic actors through the compiled AppPlan, rematerialize resource
      projections from the canonical store, and reject incompatible identities before activation.
- [ ] Publish one immutable TurnRecord after each actor snapshot. Derive receipts, inspection
      events, trace data, summaries, and CLI evidence from that record rather than writing several
      histories.
- [ ] Implement `createInspectionBufferSink({ capacity? })` as the sole retained inspection owner.
      Default to 256, validate non-negative integer capacity, support zero, drop oldest records,
      expose `truncatedBeforeSequence`, and keep captured sink snapshots immutable.
- [ ] Remove runtime-owned retention setters and global inspection logs. A host explicitly installs
      sinks; CLI/story execution installs a run-local buffer only when requested evidence needs
      history. Exclude buffer contents from boot and encode them only in explicit trace artifacts.
- [ ] Update request runtime support to accept app, Layer, optional boot, and preload behavior.
      Server preload sends typed root-machine events and observes the root; it never calls a
      service and fabricates resource snapshots.
- [ ] Rebuild behavior discovery around the registered story record. CLI list/describe/run consumes
      the same story definitions and runner; path commands consume the pure model and expose
      `path.story` live checking.
- [ ] Preserve typed decode, decompression, import, execution, and disposal failures through CLI
      envelopes. Rendering may compress evidence, but it must not change Cause, cleanup, checkpoint,
      truncation, or artifact truth.
- [ ] Add artifact round-trip, invalid-version, hostile identity, request isolation, sink retention,
      CLI/story parity, and no-arbitrary-event tests.

## Executable acceptance

- Boot is decoded before any root activity counter increments; invalid version, app,
  persistence version, machine, token, and canonical ref fail through typed diagnostics.
- `createInspectionBufferSink()` retains exactly the newest 256 records, reports the exact
  truncated sequence, supports explicit capacities including zero, and leaves captured
  snapshots stable after further turns.
- A runtime with no buffer sink retains no inspection history while live TurnRecord consumers
  still receive turns.
- Receipt, inspection, trace, and CLI projections for one turn share its sequence and cannot
  disagree about state, primitive facts, issues, or Cause.
- Boot round trips exclude sink history; v2 trace artifacts preserve retained records and the
  truncation marker; v1 input is rejected.
- Two simultaneous server requests share no actors, stores, Layers, sinks, controls, or
  finalizers and both dispose.
- CLI story run output matches direct `story.run()` evidence and errors, including checkpoint
  order, partial failure evidence, and cleanup status.
- CLI cannot accept an arbitrary payload event outside an application-decoded or registered
  story boundary.

## Deletion obligations

Delete or replace the mutable `TraceLog`, global inspection history, runtime retention mutation,
separate receipt/trace/inspection writers, shallow v1 artifact validators, silent
`undefined` import failures, v1 boot compatibility, mutable `hydrateBoot`, arbitrary CLI event
fabrication, legacy scenario envelopes, scenario report conversion, and CLI-specific story
execution helpers.

Delete source-text architecture tests that assert CLI helper placement or token strings. Keep
package metadata tests only where they inspect real package behavior; replace architecture
assertions with artifact round-trip, sink retention, runner parity, and host lifetime proof.

## Exact gates

Run, in order:

```sh
pnpm exec vp test packages/flow-state/src/runtime-boot-decoder.test.ts packages/flow-state/src/runtime-rehydration.test.ts packages/flow-state/src/runtime-inspection.test.ts packages/flow-state/src/flow-trace.test.ts packages/flow-state/src/behavior-contract.test.ts packages/flow-state/src/cli-test/behavior-cli.test.ts packages/flow-state/src/cli-test/flow-state-cli.test.ts
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state test
pnpm --filter flow-state build
pnpm --filter flow-state check:typescript-mode-proofs
pnpm --filter flow-state check:packed-consumers
pnpm check:example-cli
```

Run the server example or its Phase 8 replacement's focused test/build whenever request-runtime
code changes. Browser proof remains Phase 8 unless CLI or inspection is wired into the Incident
Console UI in this phase, in which case also run its package test and `pnpm test:browser`.

## Receipt requirements

Write
`reference/incident-console/implementation/receipts/PHASE_7_ARTIFACTS_INSPECTION_CLI.md`
with:

- prerequisite commit and contract/proof IDs closed;
- v2 envelope versions and supported/opaque field ownership;
- the sink API, default and tested capacities, retained sequences, and truncation examples;
- evidence that boot excludes history and trace artifacts preserve it;
- request isolation and disposal counters;
- direct story versus CLI output/error parity;
- exact deleted histories, setters, codecs, commands, and architecture tests;
- every gate with exit code/test count, diff names, skips, and unresolved IDs.

Do not close the phase while any tool maintains a second execution or history owner.

## Live evidence

- `packages/flow-state/src/core/inspection/inspection-retention.ts:23-110` currently gives a
  mutable inspection service a 256-entry policy; this phase moves retention to the buffer sink.
- `packages/flow-state/src/core/inspection/receipt-retention.ts:3-34` independently prunes receipt
  history and must converge on TurnRecord-derived evidence.
- `packages/flow-state/src/runtime/contract-runtime.ts:501-518` currently exposes mutable
  post-construction hydration.
- `packages/flow-state/src/core/api/runtime-types.ts:78-89` identifies the current v1 boot
  envelope.
- `reference/incident-console/IMPLEMENTATION_BLOCKERS.md:461-477` records artifact decoding and
  durable identity defects; `:579-590` records Q10-Q11.
- `reference/incident-console/DESIGN_DECISIONS.md:1838-1871` settles artifact, story, and model
  ownership.
