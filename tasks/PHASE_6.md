# Phase 6 — Experimental alpha preparation

[Back to the roadmap](../TASK.md)

Goal 6 produces an installable experimental alpha, one convincing client/server
demonstration, and one supported onboarding path. The library and maintained
examples are product truth; documentation must follow their settled behavior.

Phase 5 closed by scope transfer. `P6.0` must close the inherited queue in
`tasks/BUGS.md`, complete Review 5.9, and restore `pnpm verify` before alpha work
begins. Execution order is `P6.0` through `P6.4`.

## Fixed alpha scope

| Decision         | Alpha position                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience         | Teams building mid-to-large Effect applications                                                                                                                                                                      |
| Promise          | One runtime for cached resources, optimistic transactions, workflows, streams, testing, and inspection                                                                                                               |
| Comparison       | An opinionated alternative to combining TanStack Query and XState, without drop-in or feature parity claims                                                                                                          |
| Product proof    | Five small recipes plus the client/server `incident-console` flagship                                                                                                                                                |
| Release artifact | An installable npm prerelease tarball, onboarding, CLI stories, release notes, and known limits                                                                                                                      |
| Non-goals        | Router, forms, transport abstraction, component-local state, authentication, offline support in the flagship, multi-framework adapters, a visual editor, and complete hierarchical, parallel, or history statecharts |

## Shared rules

- Preserve exact Context, Event, State, and Effect A/E/R through source and packed
  declarations. Do not add a parallel runtime, cache, interpreter, or Promise-owned
  lifecycle.
- Prove every public API change with a real example caller, source and packed type
  tests, deterministic runtime coverage, and cleanup or replacement coverage where
  ownership changes.
- Record confirmed defects in `tasks/BUGS.md` before fixing them and keep the
  regression at its semantic owner. Do not publish, tag, or create an external
  release without explicit user authorization.

## [ ] P6.0 Restore the correctness baseline

- Correct the inherited `BUG-4`, `BUG-26`, `BUG-30`, and `BUG-80` through
  `BUG-94`. The ledger owns defect detail; this slice owns scheduling and release
  accountability.
- Restore or intentionally replace every still-valid command, architecture,
  declaration-consumer, React 18/19, example, packed CLI, and documentation proof
  removed during Phase 5.
- Run the deferred Review 5.9 as a fresh independent thermo-nuclear review after
  correction. Record and fix new findings, then re-review materially changed seams.
- Exit only when every inherited row is resolved, Review 5.9 is clean, and
  `pnpm fmt`, `pnpm lint`, and `pnpm verify` pass without accepted failures.

## [ ] P6.1 Decide and prove the canonical alpha API

- Record the accepted before/after calls in `tasks/receipts/phase-6-api.md` before
  broad implementation. Use `basic-cached-posts` and `bounded-infinite-feed` as
  the ceremony tests and keep one explicit form for genuinely ambiguous types.
- Make `flow.machine({ id, initial, context, states })` the normal path. Infer the
  State union from `states`, check `initial` against it, and avoid a type-only
  setup object or manually duplicated State union. If TypeScript cannot infer
  Context and Event safely, allow one optional Context/Event binder around the
  same configuration shape.
- Define one statically inspectable form for `ensure`, `observe`, and `refresh`
  parameters selected from machine context or the entering event. It must retain
  descriptor and mode identity through behavior facts, cleanup, reentry, and
  packed declarations. The posts and feed machines must use behavioral states
  such as `list`, `detail`, and `refreshing`, not states per ID or cursor.
- Choose one typed outcome-routing model for resource, transaction, stream, and
  child success, typed failure, defect, and interruption. Remove synthetic outcome
  events that no runtime owner emits.
- Infer transaction and stream Params, Value, Error, Requirements, and routed
  Event types when callbacks determine them. Keep explicit annotations only at
  ambiguous boundaries.
- Add host resource operations only when the flagship or onboarding needs them,
  and delegate them to the existing ResourceStore and runtime Scope. Defer a
  provider-owned React runtime unless an acceptance workflow cannot be expressed
  safely with caller-owned `FlowProvider`.
- Exit when the two ceremony examples and packed consumers use the accepted call
  shapes, hostile negative tests reject mismatches, and focused runtime, behavior,
  inspection, reentry, replacement, and cleanup tests pass.

## [ ] P6.2 Build the real client/server flagship

Build `examples/incident-console` according to
[its product and interaction contract](./PHASE_6_APP.md): a two-pane operations
console with a filterable queue, cursor pagination, incident detail, assignee and
status controls, live timeline, runbook panel, ordinary user journeys, and
reproducible advanced scenarios. Seed enough varied incidents for at least three
pages so filters and pagination exercise changing resource identities. Start from
the prepared [package scaffold](../examples/incident-console/README.md).
Use the app to falsify API ergonomics and integration claims: duplicated inferable
types, data-specific machine states, or application-owned runtime work reopens
`P6.1` instead of becoming flagship ceremony.

### Build strategy

- Apply the full `P5.4` application strategy in `tasks/PHASE_5.md`, including
  `CLIENT_STRUCTURE_CONTRACT.md` ownership, an independent workspace package,
  public imports, `src/app/behavior.ts`, red-green production-runtime proof,
  consumer-bin CLI evidence, and bug-before-workaround discipline.
- The implementer may inspect, copy, and adapt proven Flow definitions, Layers,
  runtime assembly, React boundaries, gateways, and tests from any maintained
  `examples/` app. Record exact reused files and their new owners in the flagship
  README; copy patterns instead of importing another example package at runtime.
- Apply Phase 5's deterministic-service rule behind the API server. The flagship
  changes only the frontend boundary: runtime, React, CLI, and browser acceptance
  must cross real HTTP/SSE instead of substituting an in-process service Layer.
- Browser acceptance belongs to `examples/incident-console`: package-owned
  `@playwright/test` tests under its `tests/browser` directory drive installed
  Chromium through the package command, while root `pnpm test:browser` only
  delegates. React tests and `happy-dom` may provide focused feedback but cannot
  satisfy a browser row or user journey.

### Network boundary

- Run a standalone development API from `examples/incident-console/server/` as a
  separate Node process. It owns the seeded mutable store, versions, timeline
  subscribers, and runbook jobs; the browser reaches it through a configured base
  URL over HTTP and SSE. This server is part of the flagship system under test,
  not a frontend mock.
- The frontend may share schemas and domain types with the server, but it may not
  import server handlers, repositories, seeds, or scenario controls. Its Effect
  services must call the API through real fetch and EventSource implementations.
- Do not use MSW, fetch replacement, fake EventSource, frontend fixtures, or fake
  service Layers in flagship acceptance. Pure domain tests may remain in-process;
  application acceptance must start the API on an ephemeral port and cross a real
  socket.
- Synthetic data belongs only to the development server. Development/test-only
  reset and fault controls may deterministically seed a scenario, return one real
  HTTP failure, or close an SSE connection, but the frontend must never call or
  know about those controls.
- Validate requests and responses at both network boundaries and model 400, 404,
  409, and 503 responses as typed domain failures. Do not depend on a public API
  such as SWAPI: it cannot prove writes, concurrency conflicts, SSE, or runbook
  jobs, and its availability would become part of the demo.

### API contract

| Endpoint                           | Required behavior                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/incidents`               | Filter by service, severity, status, and assignee; return stable cursor pages and `nextCursor`                                        |
| `GET /api/incidents/:id`           | Return the incident, current version, and not-found error                                                                             |
| `PATCH /api/incidents/:id`         | Update assignee or status using `expectedVersion`; return the new record or typed `409 version_conflict` with current server state    |
| `GET /api/incidents/:id/events`    | Stream ordered timeline events over SSE, support cancellation, and allow reconnect from the last event ID                             |
| `POST /api/incidents/:id/runbooks` | Start a bounded resolution runbook and return `202` with a run ID                                                                     |
| `GET /api/runbooks/:id`            | Return queued, running, succeeded, failed, or cancelled status and completed steps                                                    |
| `DELETE /api/runbooks/:id`         | Cancel an active runbook idempotently                                                                                                 |
| `POST /__dev/reset`                | Reset an isolated server to a named seed; enabled only in development and acceptance                                                  |
| `POST /__dev/faults`               | Arm one deterministic delay, 503, malformed payload, deletion, SSE disconnect, or runbook step/failure; never called by frontend code |

### Acceptance workflows

1. **Browse and refresh.** Filter the queue, traverse cursors, open two incident
   IDs, refresh one detail, and prove that resource keys change without machine
   states or branches per incident or cursor.
2. **Optimistic conflict.** Change assignment or status optimistically, issue two
   real PATCH requests with the same version, receive an actual 409 for one, roll
   back or reconcile its preview, invalidate affected resources, and render the
   server-authoritative result.
3. **Live resolution.** Consume timeline SSE through a state-owned stream, recover
   from one server-closed connection using the last event ID, start a runbook as a
   child workflow, and prove replacement, cancellation, typed failure, and cleanup.

### Coverage and stress evidence

- Complete [the Phase 6 coverage ledger](./PHASE_6_COVERAGE.md). Reconcile it
  against every shipped entrypoint and route each capability to flagship evidence,
  a focused recipe, a package proof, or an explicit documented alpha limit.
- Implement every required scenario through production definitions and its named
  evidence surfaces. The ledger's clean-implementation constraints are part of
  `P6.2` acceptance, not optional test guidance.

The production UI, runtime tests, browser acceptance, behavior gateway, CLI
stories, and packed-package acceptance must all use the same HTTP/SSE services.
`pnpm --filter @flow-state/incident-console dev` must start API and Next together,
and root `pnpm dev` must delegate to it. Add one `test:acceptance` command that
boots an isolated API, runs the three workflows, and terminates every server,
stream, runtime, and child without leaked work; include the server and frontend in
the root build, `pnpm test:browser`, and example CLI gates.

## [ ] P6.3 Rewrite the supported documentation path

- Make `apps/docs/src/pages/getting-started.md` the only onboarding how-to. It
  must build one small Effect service-to-resource-to-machine/view-to-React slice,
  one deterministic test, and one CLI or inspection command using the settled API.
- Rewrite `index.mdx`, `examples.md`, and `reference/status.mdx` around the alpha
  table above. Present the five small apps as recipes and `incident-console` as
  the client/server architecture proof; remove the Launch Workspace guide and all
  unsupported commands, screenshots, and claims.
- Document how to run both flagship processes, the HTTP/SSE boundary, compatibility,
  supported entrypoints, known limits, and the precise TanStack Query/XState
  comparison. Execute every onboarding and flagship command, then build the docs.

## [ ] P6.4 Pack, audit, and close the alpha candidate

- Choose the prerelease version, normally `0.1.0-alpha.0`, and complete package
  metadata, engines, repository links, README inclusion, and a user-approved
  license. Keep workspace applications private.
- Inspect the npm tarball and install it with strict peers in clean core, React 18,
  React 19, testing, server, inspection, CLI, and flagship consumers. Verify every
  documented ESM entrypoint and exclude workspace paths and private sources.
- Run a focused bug hunt through the three flagship workflows, then a fresh
  thermo-nuclear alpha-readiness review over changed production owners, packed
  declarations, docs, CLI, flagship, and tarball. Fix findings and re-review
  materially changed seams.
- Produce release notes, known limits, checksum, repeatable installation commands,
  and the exact publish command. Run `pnpm fmt`, `pnpm lint`, `pnpm verify`, docs
  command checks, flagship `test:acceptance`, and the clean tarball matrix without
  accepted failures; stop before publishing.

## Final definition of done

- The inherited queue and both independent reviews are clean.
- The accepted API call shapes are proved in source, packed declarations, and
  maintained examples without duplicated inferable types or data-specific states.
- `incident-console` demonstrates real HTTP reads, optimistic concurrency, SSE,
  and child workflows without a frontend data mock boundary.
- Every row and scenario in `PHASE_6_COVERAGE.md` has live evidence or an approved,
  user-visible alpha-limit disposition.
- Every ordinary and advanced interaction in `PHASE_6_APP.md` works through the
  production component tree and real server boundary.
- One onboarding path and the shipped package describe the same alpha surface.
- The audited prerelease tarball and publish command are ready for explicit user
  authorization.
