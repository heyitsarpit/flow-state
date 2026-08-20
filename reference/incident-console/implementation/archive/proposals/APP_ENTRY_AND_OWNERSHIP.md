# App entry and ownership proposal

Status: proposal only. This file does not amend the contract pack and does not claim that the
proposal is implemented.

Current resolution overlay: the accepted target uses `behavior({ stories })`, `RuntimeSetup`, and
`Implementation` as recorded in the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md).
Older recommendations in this file that use
`behavior({ app, stories })` or `RuntimeFactory` are historical proposal text. Remaining user choices are
listed in the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md).

Authority boundary: this audit used only `reference/incident-console/implementation/contracts/` for
normative decisions. The frozen `packages/flow-state/` tree is cited as implementation evidence only.
Accepted revision files, prior proposals, OpenSpec, and Beads were not used as semantic authority.

## Decision

`behavior`/`BehaviorGateway` is not the singular entry point into an app.

The contracts define four deliberately different boundaries:

```text
definition -> machine -> module -> app(...) -> private AppPlan
                                            |
                              runtime({ app, layer?, boot? })
                                            |
                                  actor leases and actors

behavior({ app, stories }) -- CLI discovery --> AppPlan projection + Story IDs
story.app(runtimeFactory, options?) ------- run --> the same production runtime
```

The smallest forward-compatible public shape is therefore:

```ts
const IncidentApp = app({
  id: "incident-console",
  persistenceVersion: "1",
  modules: [CoreModule, IncidentModule],
});

const BehaviorGateway = behavior({
  app: IncidentApp,
  stories: {
    "incident-smoke": incidentSmokeStory,
  },
});
```

The code above is proposed TypeScript notation, not a new normative contract. The important
boundary is that `app(...)` returns the application value whose private compiled `AppPlan` closes
machine admission, while `behavior(...)` is only an optional CLI/testing registration around that
already-compiled app and a keyed set of immutable Story plans. The brand on the returned gateway is
package-private. It is not a second app compiler, runtime factory, actor registry, or lifetime owner.

If the behavior gateway is retained, this is the recommended shape. If it is deleted, the same
ownership split still applies: the CLI needs a separately specified replacement gateway before its
gateway-loading commands can remain valid. Deletion does not make `BehaviorGateway` the runtime entry
point by default.

## Five strongest findings

1. **The singular app composition boundary is `app(...)` plus its private `AppPlan`, not
   `BehaviorGateway`.** `ARCHITECTURE.md` `ARCH-001`, `ARCH-003`, and `ARCH-024A`, together with
   `PUBLIC_API.md` `API-010` and `API-002`, assign closed machine admission, reachability, and
   compilation-time identity to the app while keeping `AppPlan` private and actor-free.

2. **The singular live execution owner is `runtime({ app, layer?, boot? })`.** `ARCHITECTURE.md`
   `ARCH-007` and `ARCH-007A`, `PUBLIC_API.md` `API-011`–`API-012`, and `SEMANTICS.md` `SEM-024`,
   `SEM-027`, and `SEM-029` put Layer/scopes/fibers, admission, actor leases, runtime phase, and
   terminal disposal in the runtime/lease boundary. A gateway must not acquire or own any of them.

3. **`behavior`/`BehaviorGateway` is a CLI/testing registration and artifact projection boundary.**
   `CLI.md` `CLI-003`–`CLI-004` requires a branded gateway whose already-compiled app is consumed
   without runtime work; `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-020A`–`WIRE-020B` limits artifacts to
   declarations and Story metadata, excluding callbacks, Effects, fixtures, actors, refs, and state.

4. **`Story` owns an inert, declarative run plan; it does not own a second runtime.** `PUBLIC_API.md`
   `API-013`, `TESTING.md` `REV-TEST-001`–`REV-TEST-004` and `REV-TEST-010`, plus
   `ARCHITECTURE.md` `ARCH-020` and `ARCH-032`, require production-runtime parity, provider-first
   recipe materialization, retained leases, and reverse cleanup.

5. **The frozen package shows the ownership split is currently unresolved legacy behavior, not
   evidence for a vNext entrypoint.** `packages/flow-state/src/cli/gateway.ts:102–140` validates a
   legacy app descriptor containing `layer`; `packages/flow-state/src/core/api/flow-core.ts:731–733`
   constructs a Layer-only runtime; and `packages/flow-state/src/testing/flow-stories.ts:158–221`
   routes Stories through a separate harness. These source facts explain the migration risk but do
   not override the contract paths above.

## Recommendation

Retain a small, synchronous `behavior(...)` registration only if the CLI surface remains in scope.
Make it reference one already-compiled app and an external-ID record of immutable Story plans, return
an internally branded value, and expose only a declaration/metadata projection to discovery and
artifacts. Keep `AppPlan` private, make `runtime(...)` the only live execution owner, and make
`Story.run()` the only path that materializes Story-local runtime resources. If the gateway is
deleted, first specify the replacement CLI discovery contract; do not silently promote app source,
runtime, or a process-global registry into its place.

## Contract reading

### `app(...)` and `AppPlan` own composition

`app({ id, persistenceVersion, modules })` is the composition boundary. It synchronously compiles
the exact named machine records into one flattened `App.M`, complete operation graph and requirement
set, canonical IDs, durable descriptor resolution, and ownership/reachability plan. It performs no
Effect work, resource acquisition, actor creation, or global registration. This is the closed-world
rule in `ARCHITECTURE.md` `ARCH-001` (lines 9–31).

`API-010` makes the same boundary public: modules preserve named machine records, `App.M` is the
complete machine-admission catalogue, every local/shared/Story-local actor uses an admitted machine,
and app compilation creates no actor (`PUBLIC_API.md:432–475`). The app owns reachability; definitions
own static actor shape; machines own behavior; runtime Layers supply services; and Story fixtures
close test requirements (`API-010`).

`AppPlan` must remain private. `ARCHITECTURE.md` `ARCH-024A` keeps `AppPlan`, `StoreState`, actor
state, turn plans, commit plans, and runtime evidence package-private. The public app value may expose
the exact `App.M` catalogue and inferred requirement boundary, but it must not expose the mutable
compiler result as a second public registry.

### `runtime(...)` owns execution and live lifetime

`runtime({ app, layer?, boot? })` is the production execution boundary, not `BehaviorGateway`.
`API-012` requires the app/layer boundary, exact boot decoding, `createActor`, `ensureActor`,
lookup-only `getActor`, asynchronous disposal, and the closed actor lifecycle. `ARCHITECTURE.md`
`ARCH-007` assigns one Flow runtime shell and one Effect `ManagedRuntime` the Layer, scopes, fibers,
activities, and finalizers. `SEMANTICS.md` `SEM-027` keeps runtime readiness private as
`constructed | booting | ready | failed | disposed`.

Runtime admission is not app compilation. `SEMANTICS.md` `SEM-029` requires one linearized admission
transaction for `ensureActor` and `createActor`: validate exact app/plan provenance, machine/ref
identity, input, bindings, provider availability, tombstones, duplicate identity, and cycles; then
install context, attach, activate, and expose the lease only after success. Failure rolls back in
reverse order without exposing a partial handle, generation, StoreState mutation, or lifecycle
evidence.

The actor lease is the individual terminal owner. `API-011` and `SEM-024` require `{ actor, dispose }`
from construction, lookup-only ordinary handles, asynchronous/idempotent/terminal disposal, stable-ref
tombstones, dependency-aware disposal rejection, and runtime shutdown that subsumes outstanding
leases. Context edges do not create actor parentage or ownership (`API-011`; `SEM-002A`).

### `Story` owns a declarative test plan, not a second runtime

`story.app(runtimeFactory, options?)`, `story.machine(machine, options?)`, and
`story.actor(machine, options?)` are the three Story constructors (`PUBLIC_API.md:581–606`,
`TESTING.md` `REV-TEST-001`). A Story plan is immutable and inert until `run()`; it contains no live
actor handles, loops, arbitrary callbacks, embedded assertions, or behavior branches.

An app Story owns the typed runtime factory reference, boot/fixture/options input, immutable commands,
exact actor targets, and Story metadata. On `run()`, it invokes the factory once, uses production
bootstrap, materializes Story-local recipes through `runtime.createActor`, retains their owner leases,
and disposes them in reverse dependency order. App-owned shared actors remain owned by the runtime
factory (`TESTING.md` `REV-TEST-001`–`REV-TEST-004`; `ARCHITECTURE.md` `ARCH-020`).

Story does not own actor semantics, mailboxes, operation kernels, scheduling, snapshots, evidence
history, or cleanup machinery. `REV-TEST-010` and `PROOF_MATRIX.md` `PROOF-004` require live hosts,
Stories, and tests to share the same production runtime implementation.

### `behavior`/`BehaviorGateway` owns only CLI registration

The current normative CLI boundary is narrower than an app/runtime boundary. `CLI.md` `CLI-003`
requires the named `BehaviorGateway` export to carry a package-private brand produced by
`behavior({ stories })`; the loader consumes the branded value's already compiled app and external-ID
record. Gateway discovery must not maintain a second application compiler or Story registry. `CLI-004`
requires behavior discovery, Story listing, and Story description to acquire no Layer, runtime,
fixture, actor, inspection sink, or Story executor. Only Story execution enters the shared production
Story executor.

The behavior artifact confirms this narrow role. `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-020A`–`WIRE-020B`
requires behavior artifacts to contain compiled app declarations, module tooling ownership, machine
records, requirements, and registered Story metadata, but never callbacks, Effects, fixtures, runtime
actors, live refs, or runtime state. `appPlanFingerprint` is package-private and Stories are metadata,
not part of the plan fingerprint preimage.

Therefore a retained gateway may reference the app and live Story plans needed by the CLI host, but it
must not own or expose:

- Layer acquisition, ManagedRuntime, actor creation, actor handles, owner leases, or disposal;
- a process-global app/machine/descriptor registry;
- mutable Story execution state or an independent Story runner;
- a second application compiler or artifact decoder; or
- app startup policy, automatic roots, dynamic machine admission, or module actor factories.

The CLI process host owns gateway module loading, temporary bundle cleanup, formatting, files, signals,
and exit status. Flow runtime and Story owners retain machine semantics, actors, stores, scheduling,
evidence, and lifetimes (`CLI.md` lines 18–22 and `CLI-003`–`CLI-004`).

## Frozen-source evidence

These observations are not normative and describe the frozen legacy package only.

| Evidence | What it shows | Ownership risk exposed |
| --- | --- | --- |
| `packages/flow-state/src/core/inspection/behavior-contract.ts:20–25` | `FlowBehaviorGateway` is only a type alias for `FlowBehaviorBuildTarget`, shaped as `{ app: FlowAppDefinition; stories? }`. | The current gateway is a structural build target, not a branded vNext registration. |
| `packages/flow-state/src/cli/gateway.ts:102–140` | The loader validates `app` fields (`id`, `label`, `modules`, `inventory`, `layer`) and optional legacy Story descriptors, then calls `buildBehaviorContract`. | The gateway currently closes over runtime-assembly functions and legacy Story data instead of only an inert AppPlan boundary. |
| `packages/flow-state/src/cli/gateway.ts:203–260` | The CLI imports a named `BehaviorGateway`, structurally validates it, and removes its temporary bundle in `finally`. | Named-export loading and temporary-file lifetime belong to the CLI host, not the app runtime. Current brand enforcement is not visible in this frozen source. |
| `packages/flow-state/src/descriptors/app.ts:54–135` | `createAppDefinition` validates/copies modules, derives an app ID/label, exposes `inventory`, and builds a Layer that installs `FlowAppOwnership`, stores, orchestrators, inspection, and trace services. | App construction and runtime assembly are coupled in the legacy implementation; vNext must move that boundary to `AppPlan` plus `runtime({ app, layer?, boot? })`. |
| `packages/flow-state/src/core/api/flow-core.ts:247–261,731–733` | Public `app` delegates to `createAppDefinition`; public `runtime` accepts a Layer and delegates to `createRuntime`, with no app argument. | The frozen runtime entry is not evidence of vNext app/plan ownership. |
| `packages/flow-state/src/runtime/contract-runtime.ts:409–548,551–599` | The current runtime creates one `ManagedRuntime`, exposes legacy orchestrator `start/attach/get/stop`, `createActor`, hydration, and disposal; construction is Layer-based. | Runtime ownership exists, but app admission and actor identity are not yet unified at the vNext boundary. |
| `packages/flow-state/src/testing/flow-stories.ts:158–221,321–359` | Legacy app Stories route through `test.app(app).scenario(machine)` or `test.app(app).rehydrate(...)`, and `runFlowScenario` executes a harness with `flush`. | The frozen Story path is a separate legacy harness, not proof of `story.app(...)` production parity. |
| `packages/flow-state/src/testing.ts:1–13` | The frozen testing route exports scenario/harness APIs; it does not expose the vNext `behavior` constructor shown by the target contract. | Current package shape must not be treated as vNext contract evidence. |

The strongest source conclusion is not that one current surface is correct. It is that the legacy
implementation has multiple ownership paths: gateway/app inventory, app-provided Layer assembly,
Layer-only runtime construction, and a separate Story harness. That is exactly the topology the vNext
contracts prohibit from surviving as parallel owners.

## AER and lifetime rules

For this proposal, AER means acquire/admit, execute, and release. It is an audit lens, not a new
contract term.

| Surface | Acquire/admit | Execute | Release/lifetime |
| --- | --- | --- | --- |
| `app` / private `AppPlan` | Synchronous validation and compilation only; no Effect, actor, resource, or global registry. | Pure descriptor resolution and closed admission metadata. | Immutable value; no disposal. |
| `behavior` / `BehaviorGateway` | Synchronous brand/provenance validation of an already-compiled app and keyed Story registrations. CLI may load it in a temporary bundle. | Discovery projects declarations; `story run` delegates to the shared Story executor. | CLI removes temporary bundle; gateway has no actor/runtime disposal authority. |
| Runtime factory / `runtime` | Inert factory discovery; runtime bootstrap validates boot, acquires Layer, installs initial actors, resolves context, seals graph, and activates. | One mailbox per actor, StoreKernel, operations, scheduler, context propagation, inspection, and evidence. | Runtime disposal closes admission, drains accepted evidence, releases graph/resources, and subsumes leases. |
| Actor owner lease | `ensureActor` or `createActor` admits one exact actor incarnation and returns `{ actor, dispose }`. | Actor commands and owned operations run through production kernels. | Only the lease may individually dispose; disposal is async/idempotent/terminal and tombstones stable refs. |
| Story plan / run | Plan construction is inert; `run()` creates a fresh scoped production runtime and materializes recipes provider-first. | Story commands use production mailbox acknowledgment; `simulate` replaces only external execution. | Capture `run.end` before cleanup, then dispose recipes reverse-dependency and runtime; success implies cleanup. |
| React host | `FlowProvider` receives an already-created runtime; `useActor` prepares then commits one actor. | Commands use the attached production actor; `useView` is passive. | React cleanup suspends; owner/runtime disposal is the terminal authority. |

The critical no-overlap rules are:

1. A gateway registration must never acquire the runtime Layer or create actors during discovery.
2. A Story must never introduce a testing actor engine, mailbox, scheduler, store, or cleanup owner.
3. A passive view or artifact projection must never acquire ownership or start work (`SEM-025`,
   `SNAP-002`).
4. A runtime must never expand `App.M` after compilation (`ARCH-001`, `ARCH-003`).
5. A context binding is a fixed logical edge, not actor parentage or provider ownership; disposal is
   consumer-before-provider and reverse dependency ordered (`SEM-002A`, `SEM-024`).

## Retained and deleted behavior branches

### If `behavior`/`BehaviorGateway` is retained

Retain it only on the testing/CLI registration route named by `PUBLIC_API.md` `API-001` and `CLI.md`
`CLI-003`. Make `behavior(...)` a synchronous, immutable wrapper around an already-created `App` and
an external-ID record of immutable Story plans. Require exact app/plan and Story-machine provenance,
reject mixed apps, duplicate/empty IDs, and unadmitted machines before returning the private brand.
Keep Story plan callbacks, runtime factories, fixture layers, and Effects out of behavior artifacts;
the artifact projection must follow `WIRE-020A`–`WIRE-020B`.

The CLI may use the named `BehaviorGateway` export as a file-level convention. That convention is not
the production app entry point and must not be reused by `runtime`, React, request hosts, or ordinary
library consumers.

### If `behavior`/`BehaviorGateway` is deleted

Delete it as a hard deletion, with no alias, overload, adapter, compatibility namespace, parser branch,
or structural fallback. `COMPATIBILITY_AND_DELETIONS.md` `CUT-001`–`CUT-004` requires replacement to
move atomically and deleted shapes to fail before side effects.

Before deleting it, the CLI contract must be changed to name a replacement for `--gateway`, gateway
loading, behavior build/check, and Story list/describe/run discovery. The replacement must still
provide the CLI with an already-compiled app identity and an external Story-ID record without becoming
an app/runtime owner. Otherwise `CLI.md` `CLI-001` and `CLI-003`–`CLI-004` are internally unsatisfied.

Deleting the gateway must not cause any of these substitutions:

- CLI loading `app(...)` source and compiling an app a second time;
- runtime accepting an unbranded gateway or arbitrary source module;
- Story accepting a bare app or already-created runtime;
- a process-global current app or Story registry; or
- a compatibility adapter that keeps the legacy `{ app, stories? }` shape alive.

## Rejected alternatives

1. **Make `BehaviorGateway` the singular app entry.** Rejected. It would combine CLI discovery,
   AppPlan compilation, runtime bootstrap, and Story registration, violating `ARCH-001`, `ARCH-007`,
   `API-010`–`API-013`, and `CLI-003`–`CLI-004`.

2. **Have `app(...)` return a gateway with registered Stories.** Rejected. App compilation owns
   machine admission and reachability, creates zero actors, and has no runtime or Story lifetime.
   Story plans also carry run-local factory/fixture/command concerns that must remain inert until
   `run()` (`API-010`, `REV-TEST-002`, `REV-TEST-010`).

3. **Pass `BehaviorGateway` to `runtime(...)`.** Rejected. Runtime construction must name the app,
   optional Layer, and boot payload; gateway registration is not a Layer, boot decoder, owner lease,
   or runtime phase (`API-012`, `ARCH-007A`, `SEM-027`).

4. **Expose `AppPlan` publicly so the gateway can resolve it.** Rejected. The plan is a package-private
   compiler/runtime owner; public consumers receive definitions, app values, commands, snapshots,
   refs, passive views, boot payloads, and inspect projections (`ARCH-024A`, `PUBLIC_API.md` `API-002`).

5. **Keep the legacy app Layer and Story harness behind a gateway adapter.** Rejected for vNext.
   The source is useful migration evidence, but `CUT-002`–`CUT-004` prohibit compatibility behavior
   for replaced authoring shapes, and `REV-TEST-010` prohibits a second Story/runtime owner.

## Unresolved decisions

These are intentionally open; this proposal does not invent answers.

1. **Exact `behavior(...)` signature.** `CLI-003` names `behavior({ stories })`, while the contracts do
   not fully specify whether the already-compiled `app` is an explicit field, inferred from every Story,
   or carried by another package-private registration value. The recommended shape above uses explicit
   `app` because it supports zero-story behavior artifacts and makes mixed-app rejection immediate.

2. **Story external-ID record.** The contracts require CLI external IDs and registered Story metadata,
   but do not settle whether IDs come from record keys, a Story option, or both. Record keys are the
   smallest choice; `title`, `description`, and `tags` must remain metadata, not discovery identity
   (`TESTING.md` `REV-TEST-001`; `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-020B`).

3. **Gateway value versus named export.** The CLI requires a named `BehaviorGateway` export, while
   `PUBLIC_API.md` names the `behavior` constructor and does not specify a public `BehaviorGateway`
   value/type. The loader convention and the library constructor need one exact declaration proof.

4. **Live Story plan retention.** A gateway used by `story run` must retain enough live Story plan
   information to invoke the typed runtime factory, while behavior artifacts must strip callbacks,
   Effects, fixtures, actors, refs, and runtime state. The package-private projection boundary and its
   no-leak proof remain to be named.

5. **No-story behavior builds.** `behavior build` can produce an app declaration artifact with an empty
   Story metadata list, but the constructor syntax for that case is not fixed. Empty `stories` must not
   create a second app or registry.

6. **Deletion decision.** The current contracts describe a retained CLI gateway, but this audit does
   not decide whether the public `behavior` constructor survives the final cutover. If deleted, the
   CLI and export contracts must be amended first; until then, do not remove or alias it in source.

## Actionable proof slice

The smallest proof slice for this ownership decision is:

1. Compile one app with two modules and two exact machines. Prove `app(...)` is inert, produces one
   closed `App.M`, rejects duplicate machine identity/tooling ownership, and cannot admit a machine
   after runtime construction (`PROOF-002`).
2. Register one app Story and one machine Story through the proposed gateway shape. Prove discovery
   performs no Layer acquisition, actor creation, or Story execution, then prove `story run` uses the
   same production runtime and cleanup path as a live host (`CLI-004`, `PROOF-004`, `PROOF-008`–`PROOF-011`).
3. Prove app/runtime/Story ownership separately: runtime factory bootstrap and graph sealing precede
   handle escape; Story-local leases clean up provider-first admission and consumer-first release;
   ordinary handles cannot dispose actors (`SEM-029`, `SEM-024`, `PROOF-004`, `PROOF-015`).
4. Build the behavior artifact and assert it contains app/plan declaration identity and Story metadata
   only, with no runtime references, callbacks, Effects, fixtures, actors, live refs, or mutable state
   (`WIRE-020A`–`WIRE-020B`, `PROOF-014`).
5. If deletion is chosen, add negative export and CLI gateway tests before removing the surface; do not
   claim deletion closure from source scans alone (`CUT-003`, `CUT-P01`–`CUT-P06`, `PROOF-017`).
