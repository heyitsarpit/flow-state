# Phase 4 — Testing, React, server, inspection, and CLI adapters

[Back to the roadmap](../TASK.md)

Goal 4 makes adapters consume established production semantics. An adapter may
translate inputs/outputs and own its host lifecycle, but it cannot become a
second resource, actor, transaction, stream, timer, child, or evidence engine.

## P4A — Testing and Scenario execution

### P4A.1 Testing delegation and bounded progress

- Flow Test installs test Layers and drives production owners through TestClock,
  Deferred, controlled Stream, and bounded Queue/PubSub controls.
- Runtime and test paths agree on snapshots, facts, issues, Cause, pending work,
  settle, interruption, and cleanup.
- Fixtures infer exact app/machine/resource/transaction/stream/child/view types
  and reject wrong owners. No test cache, interpreter, or duplicate registry remains.

### P4A.2 Story/Scenario compatibility

- Story remains authored discovery and CLI vocabulary. Scenario names executed
  outcomes, reports, options, checks, and blocked reasons.
- Existing public Story execution names remain compatible aliases where needed;
  serialized `story-run` and `story-test` kinds remain stable.
- Programmatic and CLI execution consume the same Scenario result with distinct
  success, domain failure, blocked proof, defect, interruption, and internal error.

### P4A.3 Launch Workspace read models

- Business/readiness state derives from canonical resources, actor snapshots,
  and explicit domain state—not receipt/trace history.
- Evidence retention, clearing, truncation, or unrelated facts cannot change
  business output. Inspection remains diagnostic only.

## P4B — React and views

### P4B.1a External-store resource and view sources

- `useSyncExternalStore` consumes canonical ResourceStore/view sources with pure
  getSnapshot/subscribe behavior and coherent batches.
- Initial render performs no lookup, Effect, Promise, registration, or mutation.
  Final unsubscribe releases sources without removing newer generations.

### P4B.1b Actor hook and runtime leases

- Actor hooks use caller-owned runtimes and the canonical actor owner. Render is
  pure; commit adopts/starts exactly once through runtime handles.
- Strict Mode, Suspense retry, aborted render, shared providers, and unmount do
  not leak, double-start, or stop another consumer's actor.
- Runtime replacement orders old lease release/finalization before incompatible
  new publication; no fire-and-forget disposal race.

### P4B.1c Launch Workspace bootstrap

- Runtime creation/hydration occurs in an explicit client bootstrap effect, not
  render. A deterministic non-Flow fallback renders until ready.
- Bootstrap failure, mismatch, replacement, and final unmount dispose exactly once.

### P4B.1d Environment matrix

- SSR/server components do not import client runtime creation or hooks.
- Offscreen retention, multiple roots, HMR, provider swap, React 18/19, and
  duplicate-install ownership follow explicit lease/replacement behavior.

### P4B.2 Preferred `useActor` compatibility

- Export `useActor` while retaining `use` as the same implementation and exact type.
- Both names follow identical ownership/cleanup and work from packed React 18/19.

## P4C — Durable and server boundaries

### P4C.1a Decode and version

- Accept `unknown`, reject hostile accessors/proxies/classes/executable values,
  enforce version/depth/count/byte limits, redact secrets, and produce one
  complete immutable decoded value before mutation.
- Supported historical wire versions remain in the compatibility corpus;
  runtime-local identity is never presented as durable.

### P4C.1b Atomic attach

- Validate app, runtime, machine, resource, owner, generation, duplicate, and
  conflict rules before one atomic attach to production owners.
- Repeated hydration is deterministic; failure leaves owners untouched.

### P4C.1c Coherent dehydrate barrier

- Dehydrate captures actor/resource facts behind one declared logical barrier,
  performs no work, and returns immutable data from one coherent cut.

### P4C.2 Request-scoped runtime

- The host supplies request Layer/Scope. Concurrent requests with identical
  public IDs remain isolated; partial acquisition and request completion finalize once.
- Host conversion maps final Exit/Cause once and cannot leave module-global runtime state.

## P4D — Inspection and CLI

### P4D.1a Pure metadata and committed-fact inspection

- Inspection distinguishes declared, dynamic, runtime, mounted, and unavailable
  evidence without invoking client callbacks or probing executable objects.
- Reads are pure and consume immutable committed facts from production owners.

### P4D.1b Family integration

- Transaction, stream, timer, child, resource, actor, and Scenario evidence all
  use the canonical fact model. Duplicate family collectors/builders are deleted.

### P4D.2 One evidence object and exit policy

- Programmatic, CLI human, and CLI JSON output project one evidence/status object.
- Domain failure, blocked proof, defect, interruption, invalid input, unsupported
  environment, and internal error map to explicit output and non-success exit.
- CLI owns only Node/host adaptation and final rendering, not runtime semantics.

## Phase 4 exit

- Every adapter delegates to production owners and passes its deterministic
  compatibility/environment matrix.
- Render/request/decode/inspection boundaries are pure or correctly scoped.
- Programmatic and CLI results agree; no business logic scans evidence history.
