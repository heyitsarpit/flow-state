# Phase 7: Artifacts, inspection, server integration, and CLI

Status: waiting on Phase 6

## Prerequisites and contract IDs

Phases 1-6 must provide the compiled AppPlan, immutable v2-capable runtime data, atomic
post-publication TurnRecords, the Phase 5 scoped request runtime, registered immutable stories,
and the one story runner before Phase 7 starts. Sink and artifact outputs themselves are created
in this phase.

This phase implements API-017, API-018, CLI-001 through CLI-012, ARCH-022, HOST-015, the artifact and sink portions of
WIRE-014 through WIRE-023, TEST-016, CUT-007A, and CUT-008. It consumes the boot codec and
normalizers delivered under WIRE-004 through WIRE-013 rather than redefining them, while
integrating TEST-001, TEST-003, TEST-009 through TEST-011, and TEST-017 with tools. `PROOF-005`,
`PROOF-010`, `PROOF-013`, `PROOF-014`, and `PROOF-017` govern this work; the receipt closes only
their Phase 0-assigned Phase 7 subcase IDs. Artifact codecs preserve every SNAP-001 through SNAP-010 identity and
discriminant owned by the corresponding envelope.

## Allowed scope

- private Schema-v2 codecs for trace and behavior envelopes, plus boot import/export adapters
  that reuse the Phase 2 boot Schema and Phase 3/4 normalizers;
- TurnRecord sinks and `createInspectionBufferSink`;
- inspection, receipt, trace, behavior, coverage, and rendering projections derived from one
  TurnRecord source;
- request-scoped server runtime and root-machine preload;
- CLI gateway, registered-story list/describe/run, artifact import/export, and concise rendering;
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
- Do not expose CLI model traversal, `story paths`, path checking/listing, or `--event`; typed
  programmatic traversal calls are the sole model candidate boundary.
- Do not silently accept or guess v1 artifacts as v2.

## Tasks

- [ ] Implement `CLI-001` through `CLI-012`. Do not retain a legacy flag, result envelope, exit
      behavior, gateway validator, artifact input, or runner path that conflicts with the CLI
      contract.
- [ ] Split CLI evidence into source handler/parser/codec tests and freshly built binary tests.
      Build before invoking `dist`, then run one packed-tarball consumer through its installed
      `flow-state` shim from a read-only project root. Never accept stale generated output as proof.
- [ ] Replace the manual gateway shape validator and CLI-built registry with the actual branded
      `behavior({ stories })` value. Loading may execute trusted local source but MUST remain inert,
      validate before property access, share the application's Flow/Effect package identities, use
      only declared dependencies, clean OS-temporary output, and acquire no Layer or runtime.
- [ ] Resolve dependencies only from the selected manifest's four dependency fields, reject
      undeclared transitive imports and realpath/symlink escape before evaluation, and reject a
      second Flow or Effect package identity.
- [ ] Replace Scenario execution, reports, checks, pending-work wrappers, PASS/FAIL language, and
      status envelopes with the one package-private story executor. A completed product-defined
      failure state exits as completed evidence; only execution inability follows the chosen CLI
      failure contract. An explicit trace output installs exactly one bounded run-local sink and
      retains partial failure, Cause, truncation, and cleanup truth.
- [ ] Implement no built-in browser/WebSocket inspector transport
      and no runtime-sized keyed collection reconciliation. Inspection sinks may be forwarded by
      applications; CLI/artifact projections must not imply dynamic collection ownership.
- [ ] Define private Schema-v2 envelopes for trace artifacts and behavior contracts. Reuse the
      existing boot Schema for boot import/export and preserve domain memory and payloads as
      application-owned opaque values.
- [ ] Consume the Phase 0-reviewed exact nested Schemas and canonical byte goldens for boot,
      behavior, trace, Cause, CLI result, and diagnostics; reject noncanonical Cause payloads,
      gzip extra members, and trailing bytes instead of adding fallback stringification.
- [ ] Prove that artifact import and request boot call the Phase 2 constructor decoder and the
      Phase 3/4 normalizers. Resolve identities through AppPlan and reject incompatible input
      before activation without creating a second hydration path.
- [ ] Round-trip active stream materialized params and restoration interruption facts; reject
      `NonDurableActiveStreamParams` with the same typed capture classification used by direct
      host dehydration.
- [ ] Round-trip every actor's pending mapped outcomes as stable IDs, binding/generation identity,
      event token ID, and opaque payload. Never encode Queue cells; prove restored scheduling and
      exactly-once clearing through the production mailbox. TurnRecord projections must
      distinguish admission, application, inapplicable clearing, stale duplicate, and cleanup.
- [ ] Consume Phase 2's one TurnRecord for each committed actor turn and implement only its sink,
      receipt, inspection, trace, summary, and CLI projections. Prepared construction/hydration
      snapshots create no record; the activation barrier and later committed turns do. Do not add
      another publisher or history.
- [ ] Implement `createInspectionBufferSink({ capacity? })` as the sole retained inspection owner.
      Default to 256, validate non-negative integer capacity, support zero, drop oldest records,
      expose `truncatedBeforeSequence`, and keep captured sink snapshots immutable.
- [ ] Implement `attachInspectionSink(runtime, sink)` with post-attachment admission, asynchronous
      ordered processing, explicit drain, idempotent dispose, and isolated failure detachment;
      actor acknowledgment and StoreFanout never wait for sink processing.
- [ ] Remove runtime-owned retention setters and global inspection logs. A host explicitly installs
      sinks; CLI/story execution installs a run-local buffer only when requested evidence needs
      history. Exclude buffer contents from boot and encode them only in explicit trace artifacts.
- [ ] Consume Phase 5's request helper in two sequential scopes for SSR: preload through typed
      root-machine events, dehydrate/dispose, then construct a mutation-free render runtime from
      that boot with request-helper `mode: "render"`, whose private latch prevents every consumer,
      restored barrier, send, actor creation, and dehydrate until disposal. It never calls a
      service directly or fabricates resource snapshots.
- [ ] Rebuild behavior discovery around the registered story record. CLI list/describe/run consumes
      the same story definitions and runner. Delete the entire CLI path request, normalizer,
      check/list envelope, renderer, command, and CLI-only model helper family.
- [ ] Preserve typed decode, decompression, import, execution, and disposal failures through CLI
      envelopes. Rendering may compress evidence, but it must not change Cause, cleanup, checkpoint,
      truncation, or artifact truth.
- [ ] Enforce malformed UTF-8, duplicate-key, compressed-input, symlink, `0600` sibling-temp,
      stable-key JSON/newline, drain/write/cleanup multi-Cause, POSIX link/rename, and EPIPE laws from
      CLI-003 through CLI-010 with deterministic filesystem/process fault injection.
- [ ] Gate the first SIGINT/SIGTERM immediately before and after link/rename: precommit interruption
      removes the temporary and preserves the destination, while postcommit interruption retains the
      new artifact and completes cleanup with the signal exit.
- [ ] Resolve only the selected project root's manifest, require regular named inputs, preflight
      every relative dependency inside the root, reject computed module loading before evaluation,
      and document that trusted gateway execution is not sandboxed.
- [ ] Add artifact round-trip, invalid-version, hostile identity, request isolation, sink retention,
      CLI/story parity, and no-arbitrary-event tests.
- [ ] Rewrite `scripts/check-example-cli-acceptance.mjs` against a minimal packed vNext
      behavior/story gateway before invoking `pnpm check:example-cli`; the Phase 7 gate must not
      assert deleted `story paths`, `--event`, `--save-trace`, `--input`, or `evidence.ok` grammar.
- [ ] Atomically switch root, React, testing, server, inspect, and CLI to the executable vNext owners
      in one source/export/declaration/binary change, then delete every legacy engine, facade, and
      v1 surface in the same green gate.

## Executable acceptance

- Source-level CLI tests and the freshly built packed binary return the same structured command
  results; no test executes an older `dist` artifact.
- Gateway discovery works from a read-only project root, leaves no temporary file, rejects a
  hand-built lookalike, mixed apps, and invalid registered keys before execution, and performs no
  Layer/runtime acquisition for list, describe, or behavior build.
- Text and JSON derive from one immutable result. Success writes only stdout; failures write only
  stderr; every selected exit category, Ctrl-C cleanup, stdin rule, atomic output rule, and
  truncated-diff claim has executable coverage.
- A story run without trace output retains no history. A run with trace output installs one sink
  and preserves partial TurnRecords, `truncatedBeforeSequence`, primary Cause, and cleanup status
  even when execution rejects.
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
- CLI help omits `story paths`; invoking it, `--event`, or any path-check/list flag fails as an
  unsupported command or option before loading a runtime.

## Deletion obligations

Delete or replace the mutable `TraceLog`, global inspection history, runtime retention mutation,
separate receipt/trace/inspection writers, shallow v1 artifact validators, silent
`undefined` import failures, v1 boot compatibility, mutable `hydrateBoot`, arbitrary CLI event
fabrication, legacy scenario envelopes, scenario report conversion, and CLI-specific story
execution helpers. Delete `story paths` together with its request normalizer, check/list
envelopes, renderers, command wiring, and CLI-only model adapter.

Delete source-text architecture tests that assert CLI helper placement or token strings. Keep
package metadata tests only where they inspect real package behavior; replace architecture
assertions with artifact round-trip, sink retention, runner parity, and host lifetime proof.

## Exact gates

Run, in order:

```sh
pnpm exec vp test packages/flow-state/src/runtime-boot-decoder.test.ts packages/flow-state/src/runtime-rehydration.test.ts packages/flow-state/src/runtime-inspection.test.ts packages/flow-state/src/flow-trace.test.ts packages/flow-state/src/behavior-contract.test.ts packages/flow-state/src/cli/gateway.test.ts
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state build
pnpm exec vp test packages/flow-state/src/cli-test/behavior-cli.test.ts packages/flow-state/src/cli-test/flow-state-cli.test.ts
pnpm --filter flow-state test
pnpm --filter flow-state check:typescript-mode-proofs
pnpm --filter flow-state check:packed-consumers
pnpm check:example-cli
```

Run the server example or its Phase 8 replacement's focused test/build whenever request-runtime
code changes. Browser proof remains Phase 8 unless CLI or inspection is wired into the Incident
Console UI in this phase, in which case also run its package test and `pnpm test:browser`.

## Receipt requirements

Write `reference/incident-console/implementation/receipts/PHASE_7.md` with:

- prerequisite commit and contract/proof IDs closed;
- v2 envelope versions and supported/opaque field ownership;
- the sink API, default and tested capacities, retained sequences, and truncation examples;
- evidence that boot excludes history and trace artifacts preserve it;
- request isolation and disposal counters;
- direct story versus CLI output/error parity;
- unsupported `story paths`, `--event`, and path-check/list command evidence;
- exact deleted histories, setters, codecs, commands, and architecture tests;
- every gate with exit code/test count, diff names, skips, and unresolved IDs.

Do not close the phase while any tool maintains a second execution or history owner.
