# Phase 4 — Testing, React, server, inspection, and CLI adapters

[Back to the roadmap](../TASK.md)

Goal 4 makes adapters consume established production semantics. An adapter may
translate inputs/outputs and own its host lifecycle, but it cannot become a
second resource, actor, transaction, stream, timer, child, or evidence engine.

You can reference the effect-v4 codebase to learn how to use a Effect feature: `/Users/arpit/Developer/flow-state/docs/codebases/effect-v4`.

## P4.0 — Inherited correctness corrections

Goal 4 fixes the latest independent-audit findings before starting adapter
cutover work. Their semantic ownership remains in the Phase 2 and Phase 3
criteria linked below; this packet controls implementation order and prevents
adapters from being built on weakened production contracts.

- [x] Close [BUG-18T](./BUGS.md#reopened-bug-18t-the-submit-carrier-restores-bivariance)
      under `P2.4`: remove the bivariant shadow transaction carrier and add
      negative source and packed submit/run proofs connecting selector Context
      to the owning machine.
- [x] Close [BUG-60](./BUGS.md#bug-60-ordinary-machine-inference-no-longer-accepts-a-checked-config)
      under `P3A.2`: restore `flow.machine(config)` for an already checked
      `FlowMachineConfig` without explicit generic restatement, including
      isolated and multi-entry declaration proofs.
- [x] Close [BUG-56](./BUGS.md#reopened-bug-56-canonical-stream-syntax-still-erases-invoke-inputs)
      under `P3B.3`: preserve the stream's exact Context and Params input family
      through machine invoke bindings in source and packed declarations.
- [x] Close [BUG-41S](./BUGS.md#reopened-bug-41s-receipt-facts-erase-a-present-undefined-value)
      under `P3B.1`: use the stream `hasValue` discriminant in runtime, Flow Test,
      model, terminal, interrupt, and restore receipt facts.
- [x] Close [BUG-61](./BUGS.md#bug-61-timer-restore-accepts-an-infinite-deadline)
      under `P3C.1`: reject non-finite timer timestamps and schedule facts before
      runtime or Flow Test actor registration.

`P4A` begins only after these five corrections and their owning Phase 2–3
checkboxes are closed with focused hostile regressions and packed verification.

## P4A — Testing and Scenario execution

### [x] P4A.1 Testing delegation and bounded progress

- Flow Test installs test Layers and drives production owners through TestClock,
  Deferred, controlled Stream, and bounded Queue/PubSub controls.
- Runtime and test paths agree on snapshots, facts, issues, Cause, pending work,
  settle, interruption, and cleanup.
- Fixtures infer exact app/machine/resource/transaction/stream/child/view types
  and reject wrong owners. No test cache, interpreter, or duplicate registry remains.

### [x] P4A.2 Story/Scenario cutover

- Story remains authored discovery and CLI vocabulary. Scenario names executed
  outcomes, reports, options, checks, and blocked reasons.
- Public execution APIs, reports, checks, and adapter outputs migrate to Scenario
  names. Story execution aliases are removed after their callers are migrated.
- Serialized `story-run` and `story-test` kinds are either migrated in P4C.1a or
  named as explicit historical wire exceptions.
- Programmatic and CLI execution consume the same Scenario result with distinct
  success, domain failure, blocked proof, defect, interruption, and internal error.
- Cutover marker: Scenario is the execution vocabulary; Story stays only for
  authored discovery and CLI concepts, per CV-3.

### [x] P4A.3 Launch Workspace read models

- Business/readiness state derives from canonical resources, actor snapshots,
  and explicit domain state—not receipt/trace history.
- Evidence retention, clearing, truncation, or unrelated facts cannot change
  business output. Inspection remains diagnostic only.

## P4B — React and views

### [x] P4B.1a External-store resource and view sources

- `useSyncExternalStore` consumes canonical ResourceStore/view sources with pure
  getSnapshot/subscribe behavior and coherent batches.
- Initial render performs no lookup, Effect, Promise, registration, or mutation.
  Final unsubscribe releases sources without removing newer generations.

### [x] P4B.1b Actor hook and runtime leases

- Actor hooks use caller-owned runtimes and the canonical actor owner. Render is
  pure; commit adopts/starts exactly once through runtime handles.
- Strict Mode, Suspense retry, aborted render, shared providers, and unmount do
  not leak, double-start, or stop another consumer's actor.
- Runtime replacement orders old lease release/finalization before incompatible
  new publication; no fire-and-forget disposal race.

### [ ] P4B.1c Launch Workspace bootstrap

- Runtime creation/hydration occurs in an explicit client bootstrap effect, not
  render. A deterministic non-Flow fallback renders until ready.
- Bootstrap failure, mismatch, replacement, and final unmount dispose exactly once.

### [ ] P4B.1d Environment matrix

- SSR/server components do not import client runtime creation or hooks.
- Offscreen retention, multiple roots, HMR, provider swap, React 18/19, and
  duplicate-install ownership follow explicit lease/replacement behavior.

### [ ] P4B.2 `useActor` cutover

- Export `useActor` as the actor hook from `flow-state/react`.
- Migrate callers and docs from `use` to `useActor`, then remove `use` from the
  supported React subpath.
- `useActor` follows canonical ownership/cleanup and works from packed React 18/19.
- Cutover marker: prove the new hook path and intentional failure of legacy
  `use` imports through CV-1.

## P4C — Durable and server boundaries

### [ ] P4C.1a Decode and version

- Accept `unknown`, reject hostile accessors/proxies/classes/executable values,
  enforce version/depth/count/byte limits, redact secrets, and produce one
  complete immutable decoded value before mutation.
- Historical wire versions remain only when this criterion names them as explicit
  wire exceptions; otherwise migrate the corpus to the current version.
- Runtime-local identity is never presented as durable.
- Cutover marker: add stricter decode/version validation and either migrate old
  wire fixtures or document the exact historical versions still supported.

### [ ] P4C.1b Atomic attach

- Validate app, runtime, machine, resource, owner, generation, duplicate, and
  conflict rules before one atomic attach to production owners.
- Repeated hydration is deterministic; failure leaves owners untouched.

### [ ] P4C.1c Coherent dehydrate barrier

- Dehydrate captures actor/resource facts behind one declared logical barrier,
  performs no work, and returns immutable data from one coherent cut.

### [ ] P4C.2 Request-scoped runtime

- The host supplies request Layer/Scope. Concurrent requests with identical
  public IDs remain isolated; partial acquisition and request completion finalize once.
- Host conversion maps final Exit/Cause once and cannot leave module-global runtime state.

## P4D — Inspection and CLI

### [ ] P4D.1a Pure metadata and committed-fact inspection

- Inspection distinguishes declared, dynamic, runtime, mounted, and unavailable
  evidence without invoking client callbacks or probing executable objects.
- Reads are pure and consume immutable committed facts from production owners.

### [ ] P4D.1b Family integration

- Transaction, stream, timer, child, resource, actor, and Scenario evidence all
  use the canonical fact model. Duplicate family collectors/builders are deleted.

### [ ] P4D.2 One evidence object and exit policy

- Programmatic, CLI human, and CLI JSON output project one evidence/status object.
- Domain failure, blocked proof, defect, interruption, invalid input, unsupported
  environment, and internal error map to explicit output and non-success exit.
- CLI owns only Node/host adaptation and final rendering, not runtime semantics.

## Phase 4 exit

- Every `P4.0` inherited correction and its owning Phase 2–3 criterion is closed.
- Every adapter delegates to production owners and passes its deterministic
  cutover/environment matrix.
- Render/request/decode/inspection boundaries are pure or correctly scoped.
- Programmatic and CLI results agree; no business logic scans evidence history.
