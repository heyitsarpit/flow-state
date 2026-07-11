# Flow State Architecture Contract

Status: active internal architecture contract.

## Purpose

Define where behavior belongs so correctness work reduces duplication instead
of moving it between competing owners. This contract governs implementation
architecture; it does not replace or expand the public API in `API_CONTRACT.md`.

The primary rule is simple:

> Definitions describe behavior, one production runtime executes it, and every
> other surface configures, controls, or observes that runtime.

## Architectural layers

Layer `N` may depend on lower-numbered layers, never higher-numbered layers.

1. **Public definitions and types**
   - `resource`, `transaction`, `machine`, `stream`, `view`, `module`, and `app`.
   - Declarative values and callbacks supplied by the client.
   - No global runtime, fiber, subscription, clock, cache, or host framework.

2. **Internal normalization and ownership metadata**
   - Converts compatible public call forms into one internal representation.
   - Assigns stable identities and validates registration/ownership.
   - May produce an internal ownership graph or catalog.
   - Must remain pure and must not execute client callbacks.

3. **Production runtime services**
   - Actor orchestration, resource store, transactions, streams, timers,
     children, snapshots, hydration, receipts, issues, and pending work.
   - The only layer allowed to own semantic execution and runtime lifecycle.
   - Uses Effect services, Layers, Scope, fibers, clocks, queues, refs, streams,
     and finalizers where they match the behavior.

4. **Runtime projections and controls**
   - Typed reads, views, traces, inspection, deterministic test controls, and
     serialization adapters.
   - Read/control production owners; do not reproduce state machines, caches,
     routing, concurrency, or lifecycle rules.

5. **Hosts and presentation**
   - React, server/request adapters, CLI, story runners, formatters, and docs.
   - Translate host input/output and manage host-owned lifetime.
   - Never become an alternate interpreter.

## Semantic ownership

| Concern                     | Sole semantic owner                         | Other layers may do                                     |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Canonical shared data       | Resource store                              | Declare refs, seed fixtures, subscribe, render, inspect |
| Workflow/process state      | Actor runtime                               | Declare machines, send events, read snapshots, render   |
| Writes and optimistic state | Transaction runner using the resource store | Declare transactions, submit/run, observe receipts      |
| Ongoing values              | Runtime-owned Effect Stream fiber           | Declare stream, provide fixtures, observe status        |
| Delayed work                | Runtime timer/scheduler owner               | Declare delays, advance TestClock, inspect              |
| Child workflows             | Actor runtime supervision                   | Declare child relationship, route outcomes, inspect     |
| Reusable projections        | Pure view evaluator                         | Declare/select/subscribe; never start work              |
| Runtime lifecycle           | Scoped runtime/actor owners                 | Acquire, provide, dispose at explicit host boundaries   |
| Evidence and pending work   | Facts emitted by production owners          | Project, filter, format, assert                         |
| Durable encoding            | Explicit boundary adapter                   | Provide optional schemas and typed diagnostics          |

No concern may have separate “live,” “test,” “React,” “story,” or “CLI”
semantics. Those modes may provide different services or deterministic controls
to the same owner.

## Definition and compilation rules

- Public definitions are immutable descriptions after construction.
- Type inference mirrors runtime data flow: authored inputs and params
  contextualize downstream callbacks; downstream callback implementations may
  infer results but never redefine upstream inputs backwards.
- Construction and normalization must not start runtime work.
- Ownership compilation may inspect definition identity and declarative
  references, but must not call lookup, commit, subscribe, guard, update,
  selector, routing, tag, or service callbacks.
- App/module order must not change stable app, descriptor, resource-instance,
  actor, state, binding, or correlation identity.
- Every executable definition belongs to one registered app/module owner when
  ownership is required.
- Duplicate IDs, incompatible same-ID tags, unregistered targets, illegal
  routes, and ambiguous owners fail explicitly.
- Internal ownership metadata is the shared source for runtime authorization,
  testing, inspection, coverage, CLI grouping, and documentation projection.
  Consumers may project it; they may not rebuild it with separate scanners.
- The internal representation is not a mandatory public AppGraph API.

## Identity contract

- Descriptor identity names the reusable definition.
- Resource-instance identity combines the descriptor with its typed parameters
  or canonical key.
- Actor identity belongs to one app/runtime ownership domain.
- State-owned work identity includes the actor, owning state/binding, and active
  generation.
- Snapshot identity includes enough app, definition, actor, version, and
  generation information to reject incompatible restore.
- Receipt, issue, and correlation identity must point back to the production
  owner that emitted the fact.
- Array position, object traversal order, descriptor ID alone, or a string cast
  may not substitute for missing identity.

Stable identity is primarily an internal responsibility. Clients should not be
forced to manually author graph node IDs or binding IDs for ordinary usage.

## Effect contract

- Preserve `Effect<A, E, R>` and `Stream<A, E, R>` through public definitions,
  normalization, runtime execution, tests, and adapters.
- Domain failure, boundary failure, defect, and interruption remain distinct.
- Service requirements are provided through typed Layers or explicit host
  adapters, not hidden globals or broad `Layer.Any` collections.
- Every long-lived fiber, subscription, child, timer, request runtime, and
  managed service has an explicit Scope owner.
- Finalizers run exactly once on normal completion, failure, interruption,
  replacement, stop, and disposal as applicable.
- Promise conversion occurs only at an explicit host boundary. Internal Promise
  wrappers may not define alternate error, cancellation, or lifecycle semantics.
- Deterministic tests provide clocks, queues, streams, and services to production
  owners rather than reimplementing them.

## Resource and transaction consistency

- Resource store state is the only canonical shared-data state.
- Actor, React, test, and inspection snapshots reference or project resource
  facts; they do not maintain competing resource caches.
- Transaction preview, rollback, commit, invalidation, receipts, and pending work
  update atomically from the perspective of subscribers.
- A failed, defective, interrupted, cancelled, or stale-generation operation
  cannot publish success facts.
- `submit`, `run`, patch, and invalidation helpers may remain distinct public
  commands while delegating to common production owners.

## Snapshot and boundary contract

- Decoded in-memory values remain typed values; they are not repeatedly
  encoded/decoded during local execution.
- `unknown` input is decoded at the boundary where it enters the trusted runtime.
- Schemas are optional capabilities for local definitions and required only for
  values actually serialized, persisted, hydrated, or received from a foreign
  source.
- Restore and hydration are atomic. Wrong app, version, actor, machine,
  resource, schema, or identity rejects the operation without partial mutation.
- Serialized snapshots preserve active generations, pending ownership, and the
  minimum facts needed for valid resume; functions and service values are never
  serialized.

## Adapter rules

### Testing and stories

- Operate through production runtime handles.
- May provide TestClock, controlled streams, fake Layers, and bounded
  flush/settle controls.
- Cannot invoke callbacks directly to simulate runtime success.
- Pure model/path analysis must be labeled static and must not claim runtime
  causality.

### React

- Provider supplies an existing runtime and owns only explicitly acquired host
  lifetime.
- Hooks subscribe and project; they do not execute resource, transaction,
  stream, timer, or child semantics.
- Rendering is safe under repeated render and Strict Mode.
- Suspense is derived from canonical runtime facts and never starts hidden work.

### Server

- Request runtime is scoped per request unless the host explicitly supplies a
  longer-lived owner.
- No module-global mutable runtime or cross-request cache is introduced by the
  adapter.
- Server serialization uses explicit boundary validation and redaction.

### Inspection and CLI

- Consume production facts and pure ownership metadata.
- Formatting never invents missing receipts, causal ordering, ownership, or
  proof strength.
- Static, snapshot, runtime, and mounted evidence remain distinguishable.

## Dependency and deletion rules

- Core runtime must not import React, CLI, docs, examples, or test runners.
- React/server/testing/inspection entry points may depend on the public/core
  runtime surface, not private sibling adapters.
- Examples consume package entry points, never package source internals.
- Shared helpers must have a semantic owner; do not create generic dumping-ground
  modules to avoid deciding ownership.
- A duplicate implementation is merged behind the correct owner before deletion.
- Dead code requires export, import, dynamic-load, CLI, generated-code, and test
  caller inventory before removal.
- Compatibility adapters contain translation only and have a named removal
  condition.

## Architecture change gate

An architecture change must state:

1. the duplicated or incorrect owner it fixes;
2. the surviving owner and dependency direction;
3. Effect/lifecycle consequences;
4. public API impact under `API_CONTRACT.md`;
5. positive and negative parity evidence;
6. deleted files/owners and rollback path.

Green tests alone do not justify another registry, graph, interpreter, cache,
snapshot model, or runtime.
