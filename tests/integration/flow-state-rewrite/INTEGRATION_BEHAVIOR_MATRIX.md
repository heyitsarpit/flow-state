# Flow State rewrite integration behavior matrix

This file defines the behavior examples that repository-level integration tests
must eventually prove. It is a test design artifact, not an implementation TODO
list. Each row is a candidate decisive test or a tightly bounded test family.

Tests must exercise the production owner named in the row. A helper may control a
production runtime, clock, queue, or sink, but may not replace the actor engine,
store kernel, operation kernel, persistence coordinator, or CLI result model.

## Test receipt

Every implemented row records:

```text
integration ID:
contract/proof IDs:
production owner:
harness boundary: source | packed | host | CLI
setup:
action:
observable assertion:
failure/interruption assertion:
why package-local coverage is insufficient:
focused command and receipt:
```

Default budget: one to three decisive tests per implementation slice. Add another
test only for a distinct lane such as a race, public type case, hostile input, or
required boundary vector.

## Evidence roots

The matrix is grounded in these live authorities:

- `reference/incident-console/implementation/contracts/IMPLEMENTATION_WORKFLOW.md:122-131`
  defines decisive-test receipts, production ownership, deterministic controls,
  and rejected source-only/runtime-replacement proofs.
- `reference/incident-console/implementation/contracts/TESTING.md:162-220`
  defines Story command ordering, TestClock boundaries, cleanup, Cause, and the
  prohibition on simulation/result injection.
- `reference/incident-console/implementation/contracts/SEMANTICS.md:11-42,165-225,287-335,353-429,474-514`
  defines macrosteps, store/operation ownership, P/K/generation behavior,
  lifecycle, Cause, and bootstrap semantics.
- `reference/incident-console/implementation/contracts/REACT_AND_HOSTS.md:250-305`
  defines request runtime, persistence ownership, Effect bridges, host leases,
  and disposal behavior.
- `reference/incident-console/implementation/contracts/PERSISTENCE_AND_ARTIFACTS.md:31-49,111-141,202-234,273-307,360-427`
  defines context-closed capture, hydration, artifact/Cause projection, and
  atomic evidence boundaries.
- `reference/incident-console/implementation/contracts/CLI.md:57-99,112-182,184-262,279-293`
  defines grammar, gateway containment, Story parity, bounded artifacts,
  publication, output, signals, truncation, and fresh binary proof.

## Runtime, ownership, and operations

| ID | Contract/proof | Concrete integration behavior | Required assertion |
|---|---|---|---|
| INT-001 | `SEM-027`, `SEM-029`, `HOST-P01`, `PROOF-002`, `PROOF-003`, `PROOF-004` | Construct an app with a missing provider, duplicate actor claim, or context cycle, then construct a valid app and call `ready()`; for the valid case create an admitted actor by exact machine ID/ref and send one event. | Construction performs no acquisition. Failed readiness exposes no handle, actor, StoreState mutation, operation generation, lifecycle evidence, or external work; staged resources roll back in reverse order. Valid readiness produces one stable opaque identity and production-mailbox evidence with no root/global registry. |
| INT-002 | `TYPE_SYSTEM`, `PROOF-001`, `HOST-P05` | Start `runtimeSetup` with an app that requires an implementation, then start it once without the required provider graph and once with the complete typed graph. | The incomplete setup fails with the declared typed failure; the valid setup reaches readiness; no hidden acquisition or second execution scope occurs. |
| INT-003 | `SEM-001`, `SEM-002`, `SEM-004`, `SEM-006`, `REV-TEST-006`, `PROOF-003`, `PROOF-004`, `WIRE-017` | Send two events to one actor while unrelated ready work exists; instrument guard, memory, actions, StoreKernel, TurnRecord, acknowledgement, fanout, and a reentrant send. | The macrostep order is transition → guard → memory → actions → target/redirect → validation → Store/actor commit → TurnRecord → acknowledgement → fanout → async work. Each send waits for only its own acknowledgement; external facts re-enter the mailbox; unrelated work is not drained. |
| INT-004 | `PROOF-003`, `PROOF-005`, `PROOF-006` | Commit a StoreKernel publication that changes actor-visible data and then deliver the resulting compact fact. | Store mutation, publication, evidence, and actor fact ordering are observable; StoreKernel does not call ActorEngine directly; one canonical revision is used. |
| INT-005 | `SEM-010`, `SEM-014`, `SEM-017`, `PROOF-005`, `SNAP-P01`, `SNAP-003` | Start equal-key executable inputs with different clients, explicitly refetch with new `P`, complete the old generation late, and perform an authoritative `setData`. | The running generation retains its original `P`; refetch owns a new generation; late completion cannot mutate current truth; only explicit writes promote canonical data; `P` remains occurrence identity and `K` remains canonical operation identity. |
| INT-006 | `SEM-002A`, `SEM-019`, `SEM-024`, `SEM-028`, `PROOF-004`, `PROOF-015`, `HOST-P05` | Create a stable provider and context-bound consumer, concurrently ensure the stable ref, suspend the consumer, attempt provider disposal, then dispose dependents/provider and finally the runtime with evidence queued. | Concurrent ensures share one actor; lookup grants no ownership; dependent disposal reports exact paths; successful disposal is idempotent and tombstones only after cleanup; suspended commands reject; runtime drains evidence, preserves lifecycle ordering, and retains Cause truth. |
| INT-007 | `SEM-008`, `SEM-009`, `SEM-011`, `SEM-011A`, `PROOF-006`, `PROOF-007`, `SNAP-002`, `SNAP-004`, `SNAP-005` | Two actors in one runtime share a resource descriptor/`K`; a second runtime is isolated. Perform passive reads, admit work, cancel one actor, complete shared work, then cancel the final owner. | Passive reads create no entry, lease, revision, or work. Same-runtime actors share canonical data/generations but retain independent lifetimes. Non-final cancellation preserves data and the other actor; final-owner cancellation interrupts and fences work; runtimes remain isolated. |
| INT-008 | `SEM-019`, `SEM-020`, `SEM-024`, `SEM-028`, `PROOF-007`, `PROOF-012`, `PROOF-013`, `HOST-P05` | Run an actor with a continuing resource, stream, timer, finite transaction, and context provider; suspend, send while suspended, resume, then dispose with one finalizer failure. Also exercise typed failure, defect, and interruption through the same host bridge. | Identity, state, memory, context, cursors, occurrences, and deadlines survive suspension. Suspended commands reject; resources release once; resume waits for finalizers and cleanup failure blocks resume. Typed failure, defect, and interruption-only outcomes remain distinguishable; lifecycle snapshots precede ordered records. |

## Stories, fixtures, and live parity

| ID | Contract/proof | Concrete integration behavior | Required assertion |
|---|---|---|---|
| INT-009 | `REV-TEST-003`, `REV-TEST-004`, `PROOF-012` | Run an app Story with two actor recipes: one reused recipe and one distinct recipe, including a transitive provider recipe. | Reused recipe identity resolves to one actor; distinct recipes resolve independently; providers materialize first; reverse Story cleanup does not dispose app-owned actors. |
| INT-010 | `REV-TEST-003`, `PROOF-012` | Prepare Story recipes with a missing provider, cycle, foreign ref, disposed ref, and unadmitted machine. | Preparation fails before actor creation or ownership acquisition; each diagnostic identifies the invalid graph condition. |
| INT-011 | `REV-TEST-005`, `PROOF-011`, `PROOF-012` | Run a focused machine Story with exact fresh input and selected context, then call `setContext` with an equal value and a changed value. | Baseline context installs silently; equal context does nothing; changed context follows the production context-turn path; no synthetic event/evidence is created. |
| INT-012 | `REV-TEST-006`, `WIRE-021`, `WIRE-022`, `WIRE-023` | Use `send`, `process`, `advance`, `advanceToNextTimer`, `checkpoint`, and `run` around pending external work, continuing streams, same-time timers, and finite work. | `process` drains only ready work; clock commands never process implicitly; checkpoints are immediate immutable cuts; `maxTurns` exhaustion is explicit failure. |
| INT-013 | `REV-TEST-007`, `WIRE-011A`, `WIRE-012`, `PROOF-007`, `PROOF-014` | Supply behavior only through complete typed Implementations/Fixtures; hydrate a transaction and a stream. | No `simulate`, `result` injection, interception, or operation registry is available; hydrated transactions follow the wire contract; hydrated streams begin a new generation without replay. |
| INT-014 | `REV-TEST-008`, `WIRE-009`, `WIRE-017`, `PROOF-014` | Capture a checkpoint and successful `run.end` while publication, pending work, and accepted evidence are present; repeat with execution failure. | One production DehydrateBarrier cut captures revision, snapshots, pending work, clock, and evidence prefix; failed runs retain checkpoints and do not manufacture successful end evidence. |
| INT-015 | `PROOF-011`, `PROOF-012` | Run the same behavior through a live host and a Story plan with the same Implementation and Fixture. | Observable actor, operation, context, stream, failure, and cleanup semantics match; the model remains pure and does not instantiate a second runtime. |

## React, server, and persistence hosts

| ID | Contract/proof | Concrete integration behavior | Required assertion |
|---|---|---|---|
| INT-016 | `HOST-P02`, `PROOF-012` | Mount, prepare, attach, suspend, resume, Strict Mode reconnect, and finally unmount a React actor/view. | Handle/ref identity and lifecycle state follow the contract; prepared abandonment is inert; no active work remains after final unmount; `useView` remains passive. |
| INT-017 | `HOST-013`, `HOST-P04`, `HOST-P05` | Render the same AppPlan through a request/server host and a live host, with a cleanup failure in each. | Each request has an isolated production runtime; request cleanup is owner-scoped; host behavior and failure/Cause ordering match live ownership. |
| INT-018 | `HOST-014`, `HOST-P04`, `SNAP-P01` | Persist a stable actor with provider bindings, hydrate in a fresh runtime, and attempt malformed, disposed, non-durable, and context-conflicting restores. | Hydration is provider-owned and dependency-ordered; no input/initializer replay or `onContext` event occurs; invalid providers report `FlowPersistenceError` with exact paths; disposed/local actors are excluded. |
| INT-019 | `HOST-015`, `HOST-P05` | Run an Effect through the host bridge and compare its `Exit` with runtime readiness and implementation failure evidence. | The bridge uses the installed production Context and one Scope; Exit/Cause truth matches runtime truth. |

## Inspection, wire, CLI, and package boundaries

| ID | Contract/proof | Concrete integration behavior | Required assertion |
|---|---|---|---|
| INT-020 | `PROOF-013`, `PROOF-014`, `PROOF-015` | Run a behavior that produces lifecycle, operation, stream, transaction, timer, and cleanup records through the bounded inspection sink. | Records are linearized, sequence-preserving, bounded, and drained before sink shutdown; inspection is read-only and does not create a second evidence path. |
| INT-021 | `CLI-005`, `WIRE-016`, `WIRE-020B`, `CLI-P01` | Feed artifact-only commands canonical JSON, one gzip member, concatenated gzip, trailing bytes, oversized input, deleted legacy envelopes, and malformed nested fields. | Accepted inputs use the bounded v2 path; rejected inputs fail before app/runtime loading; artifact-only commands never execute application code. |
| INT-022 | `CLI-003`, `CLI-004`, `CLI-P01` | Load a gateway with path escape, dynamic import, undeclared transitive import, package identity mismatch, foreign Story, and mixed App identity. | Discovery is contained and inert; only the allowed command family loads code; invalid gateways fail before runtime/fixture acquisition. |
| INT-023 | `CLI-004`, `WIRE-020A`, `WIRE-020B`, `PROOF-014` | Run the same Story directly and through `story.run`, including success, execution failure, cleanup failure, and trace-write failure. | Both paths use the same decoded evidence model, checkpoints, end, Cause projection, cleanup truth, and failure precedence. |
| INT-024 | `CLI-006`, `WIRE-018`, `WIRE-019`, `WIRE-020B` | Publish behavior and trace output to absent destinations, existing files, symlinks, raced destinations, and interrupted writes, with and without overwrite. | Preflight occurs before runtime acquisition; old destinations are never truncated; temp files use the required mode and commit protocol; interruption preserves the old/absent destination before commit. |
| INT-025 | `CLI-007`, `CLI-008`, `CLI-009`, `CLI-010`, `CLI-P01` | Execute successful, comparison-different, usage, gateway, Story, cleanup, EPIPE, SIGINT, and SIGTERM commands in a fresh built binary. | Text/JSON are byte-stable and derive from one result; stdout/stderr ownership is exact; exit statuses are 0/1/2/130/143 as specified; cleanup diagnostics remain secondary. |
| INT-026 | `CLI-011`, `CLI-P01` | Summarize, prove, and diff complete, truncated, equal-retained, changed-retained, unknown-selector, and incompatible artifacts. | Summary exposes truncation; proof rejects incomplete evidence; diff reports equal/different/incomplete correctly; identity incompatibility is not an ordinary difference. |
| INT-027 | `PUBLIC_API`, `API-P01`, `PROOF-017`, `CLI-P02` | Build and pack the rewrite package, import the root and each approved subpath from a read-only consumer, inspect route namespace keys, and attempt deleted symbols/private deep imports. | Root, `./react`, `./testing`, `./server`, and `./inspect` are independently isolated; `./cli`, `./vnext`, `./src/*`, old aliases, and deleted symbols fail in source and packed declarations. The positive `./server` symbol table must be locked by its owning normative API contract before this test is finalized. |
| INT-028 | `PROOF-016`, `PROOF-017`, `CLI-P02` | Run the minimum rewrite proving app through source, packed consumer, example, and browser/server integration gates. | Fresh output is used; no stale `dist` or old package path satisfies acceptance; production behavior, package declarations, examples, browser behavior, and deletion proofs agree. |

## Promotion order

1. Runtime rows `INT-001`–`INT-008` establish ownership and operation truth.
2. Story and host rows `INT-009`–`INT-019` establish parity and lifecycle.
3. Inspection/wire/CLI rows `INT-020`–`INT-026` establish evidence and boundary behavior.
4. Package rows `INT-027`–`INT-028` establish fresh packed cutover and deleted-surface absence.

The package-local tests may prove pure helpers and type cases. They cannot replace
these rows when the behavior crosses Runtime, host, persistence, CLI, packed
artifacts, or deletion boundaries.
