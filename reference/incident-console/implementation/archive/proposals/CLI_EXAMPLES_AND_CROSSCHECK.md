# CLI, examples, and cross-blocker resolution proposal

Status: proposal only. This file does not amend a contract, implementation, OpenSpec change, or
task tracker.

Current resolution overlay: the accepted CLI direction is explicit gateway imports with
`behavior({ stories })`, App and Machine Story entries, `RuntimeSetup`/`Implementation` terminology, and
`--overwrite`. Candidate `RuntimeFactory`, `Layer`, `control`, and app-argument examples below are
historical or unresolved notation; consult the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md) for
the remaining public choices.

Scope: `CS-09`, `CS-11`, and consistency across `CS-01` through `CS-10`.

## Decision summary

1. A consumer exports exactly one named value, `BehaviorGateway`, from a `.ts` or `.mts` gateway file:
   `behavior({ stories })`.
2. `stories` is a readonly record whose keys are the external Story IDs. Its values are app Story plans
   created by `story.app(...)`. The gateway has one compiled app identity, no public `app` argument, no
   runtime, no Layer, no fixture acquisition, and no public decoded artifact model.
3. The CLI loader validates the project boundary, import graph, package identities, and private brand before
   reading the compiled app or Story registry. Discovery is inert. `story run` calls the shared package-private
   Story executor.
4. The evidence set is reduced to four maintained app packages, three compile-proof modules, and seven
   runtime groups. A single CLI gateway app proves the CLI path; the other packages prove distinct boundaries.
5. The proposal does not touch a Todo example. The missing or existing Todo source is not an input to the
   vNext gateway proof.

The accepted revisions and contracts remain normative. In particular, this proposal preserves the exact
ten-leaf CLI grammar, `App.M`, `story.app`, `process`, `simulate`, `run.end`, the package routes, the private
v2 artifact model, and the hard-deletion/no-alias rules.

## 1. CS-09 — consumer-authored BehaviorGateway

### Recommended contract decision

Add one exact construction boundary to the testing route:

```ts
// Public value exported by flow-state/testing.
declare function behavior<const Stories extends AppStoryRegistry>(options: {
  readonly stories: Stories;
}): BehaviorGateway<Stories>;
```

The names below are specification notation for the proposal. `AppStoryRegistry` and
`BehaviorGateway<Stories>` are not additional public support aliases.

```ts
type AppStoryRegistry = Readonly<Record<string, AppStoryPlan>>;

// Package-private shape; consumers can hold the returned value but cannot inspect or construct it.
declare const behaviorGatewayBrand: unique symbol;
type BehaviorGateway<Stories extends AppStoryRegistry> = {
  readonly [behaviorGatewayBrand]: {
    readonly app: AppOf<Stories>;
    readonly stories: Stories;
  };
};
```

The actual value may contain private compiled data, but it MUST expose no public `.app`, `.stories`,
`.runtime`, `.layer`, `.fixtures`, `.run`, decoder, or artifact-model member. The package-private loader
accessor is the only owner allowed to read the compiled app and external-ID record.

The `behavior` constructor MUST:

- accept a readonly record, not an array, so external IDs are authored at the declaration site and retained
  as literal keys;
- accept only app Story plans produced by `story.app(runtimeFactory, options?)`;
- require all registered plans to resolve to one exact app identity; different app identities are rejected;
- reject an empty external ID at construction or gateway loading, with the accepted gateway diagnostic;
- preserve each external key as the Story's CLI ID, independent of title, description, tags, machine ID, or
  module ID;
- perform only synchronous immutable app/Story registration and validation; it MUST acquire no Layer, runtime,
  fixture, actor, sink, clock, or Story executor.

The registry MAY contain multiple app Story plans for the same app, including plans with different fixture
tuples or metadata. The app identity is shared; a Story's runtime factory and fixtures remain owned by that
Story plan and are acquired only by execution.

Rejecting focused `story.machine(...)` and recipe `story.actor(...)` plans from a CLI gateway is deliberate.
Those plans remain valid testing-route values, but they have no single consumer app identity suitable for the
behavior artifact. They are proved directly by the Story and compile-proof suites.

### Exact consumer source

`examples/incident-console/src/BehaviorGateway.ts` should contain this complete gateway boundary:

```ts
import { behavior } from "flow-state/testing";

import { incidentSaveStory, incidentCancelStory } from "./stories";

export const BehaviorGateway = behavior({
  stories: {
    "incident/save": incidentSaveStory,
    "incident/cancel": incidentCancelStory,
  },
});
```

The Story source stays ordinary consumer code and uses the same typed runtime factory as live hosts:

```ts
import { story } from "flow-state/testing";

import { incidentFixture } from "./fixtures";
import { createIncidentRuntime } from "./runtime-factory";

export const incidentSaveStory = story.app(createIncidentRuntime, {
  fixtures: [incidentFixture],
  title: "save an incident",
  tags: ["smoke"],
});

export const incidentCancelStory = story.app(createIncidentRuntime, {
  fixtures: [incidentFixture],
  title: "cancel an incident",
  tags: ["failure"],
});
```

The example intentionally does not call `runtime(...)`, `decodeRuntimeBoot(...)`, `withRequestRuntime(...)`,
`fixture(...)`, or `run()` from `BehaviorGateway.ts`. Those values may be imported by the Story source, but
gateway registration itself remains inert. The exact `createIncidentRuntime` shape is CS-01's decision; this
proposal consumes it only through the already accepted `story.app(runtimeFactory, options?)` signature.

The CLI invocation is therefore unambiguous:

```sh
flow-state behavior build \
  --project-root examples/incident-console \
  --gateway src/BehaviorGateway.ts \
  --output /tmp/incident.behavior.json

flow-state story list \
  --project-root examples/incident-console \
  --gateway src/BehaviorGateway.ts \
  --format json

flow-state story describe incident/save \
  --project-root examples/incident-console \
  --gateway src/BehaviorGateway.ts

flow-state story run incident/save \
  --project-root examples/incident-console \
  --gateway src/BehaviorGateway.ts \
  --trace-output /tmp/incident.trace.json
```

`--gateway` is always relative to the selected canonical project root. There is no ancestor search,
implicit filename, default export, or gateway flag omission.

### Gateway loading ownership and failure behavior

The CLI owns loading, file boundaries, process signals, formatting, exit status, and temporary-file
cleanup. The testing route owns gateway construction and Story-plan identity. The production runtime owns
all execution, actor admission, operation completion, evidence, and disposal.

The loader's private conceptual type is:

```ts
type LoadedGateway<App, Stories extends AppStoryRegistry> = {
  readonly app: CompiledAppPlan<App>;
  readonly stories: Readonly<Record<keyof Stories & string, AppStoryPlan>>;
};

type LoadGateway<App, Stories extends AppStoryRegistry> = Effect.Effect<
  LoadedGateway<App, Stories>,
  GatewayLoadError,
  LoaderServices
>;
```

`CompiledAppPlan`, `AppStoryPlan`, `GatewayLoadError`, and `LoaderServices` are package-private notation for
the already compiled app, registered Story plans, accepted gateway/CLI failure boundary, and CLI host
capabilities. They MUST NOT become public support aliases or a second CLI model.

The A/E/R and ownership rules are:

- `behavior(...)` is plain synchronous TypeScript: `A = opaque BehaviorGateway`, `E = never`, `R = never`.
  Its immutable compilation and identity checks do not need Effect.
- `story.app(...)` is plain inert plan construction. Its closed fixture tuple carries the requirements needed
  by the plan; it does not acquire the Layer. `run()` is the Effectful boundary owned by the Story executor,
  with the package-owned Story failure as `E` and no residual application requirement after fixture closure.
- Gateway loading is package-private Effect code because it performs filesystem access, module evaluation,
  interruption, temporary-directory lifetime, and cleanup. The CLI composition root provides its loader Layer.
  If the loader is represented before `Effect.scoped`, `Scope` remains in its `R`; the CLI owns that Scope and
  closes it on success, gateway failure, interruption, and process-signal cleanup.
- The loader MUST NOT provide the application Layer or create a Flow runtime. `story list`, `story describe`,
  `behavior build`, and `behavior check` remain discovery-only. `story run` enters the shared Story executor,
  which owns the runtime Scope, fixture Layer, TestClock, actors, sinks, and finalizers.
- The private loader normalizes foreign import failures once into the accepted gateway/CLI diagnostic boundary.
  Raw bundler, parser, Node, or Effect implementation failures MUST NOT escape as a public Flow API.

The validation order is fixed at the contract level:

1. Parse and validate CLI options without loading application code.
2. Canonicalize and validate the project root, exact root `package.json`, regular gateway file, and symlink
   containment.
3. Reject computed dynamic imports, non-literal `require`, path escape, undeclared bare imports, and package
   resolution that does not use the selected project's declared dependency boundary before evaluating the
   gateway.
4. Resolve `flow-state`, its routes, and `effect` to the same real package instances used by the CLI.
5. Evaluate the trusted gateway in a scoped temporary location, require the named `BehaviorGateway` export,
   validate the private brand and package identities, and reject mixed-app or empty-key registrations.
6. Only after all checks pass, use the package-private accessor to obtain the compiled app and external-ID
   record. No second shape validator, app compiler, Story registry, or artifact decoder is created.

Missing or default-only exports, structural lookalikes, forged brands from another package instance, mixed-app
registrations, empty keys, path escapes, undeclared imports, and package-identity mismatches are gateway
failures before compiled-registry access. The loader removes every temporary file through the owned Scope on
success, failure, and interruption.

`story run` then performs the following additional ownership transition: select the external ID, pass the
stored Story plan to the package-private executor, and let the production runtime produce the accepted
checkpoints, `run.end`, failure boundary, cleanup evidence, and private decoded model. A run failure is a
`CliError` for `command: "story.run"`; it is never an incomplete successful Story result.

## 2. CS-11 — exact example layout and reduced evidence set

### Recommended maintained packages

The seven audit recommendations collapse into four non-redundant app packages:

| Maintained package | Responsibility | Replaces or absorbs |
| --- | --- | --- |
| `examples/incident-console/` | One app, named modules, operations, stable refs/leases, Story checkpoints/end, and the sole CLI gateway | `todo-essentials`, `operations-order-workflow`, `cli-gateway-artifact` |
| `examples/context-editor/` | Exact provider refs, silent bootstrap, context change event, disposal rejection, context-closed dehydration | `context-editor` |
| `examples/canonical-key-hostile-input/` | Pure canonical tuple/record acceptance and hostile-input rejection before ownership or work | `canonical-key-hostile-input` |
| `examples/host-and-persistence/` | React prepared/active/suspended/disposed lifecycle, request ownership, branded boot/dehydrate, and no-replay hydration | `react-lifecycle-host`, `offline-notes-persistence` |

The first package is the only package loaded by the CLI gateway proof. The other three are direct source,
type, runtime, browser, or persistence consumers. This avoids multiplying gateway loader proofs while retaining
each materially different boundary.

The exact source layout for the CLI app is:

```text
examples/incident-console/
  package.json
  tsconfig.json
  src/
    domain.ts             # application values, codecs, and domain error types
    operations.ts         # resource, transaction, and stream descriptors
    machines.ts           # definitions and machine behavior
    app.ts                # module records and closed App.M
    fixtures.ts           # fixture(...) values only; no acquisition at import time
    runtime-factory.ts    # the CS-01 RuntimeFactory<App> value
    stories.ts            # story.app(...) plans and external behavior
    BehaviorGateway.ts    # the one named export shown above
```

`package.json` MUST declare every bare import used by the gateway dependency graph, including `flow-state`
and `effect` at the pinned peer identity. React and server dependencies belong only to packages that use those
routes. The gateway is a regular source file; it is not a generated artifact, JSON registry, test-only path,
or special CLI entrypoint.

The supporting packages have equally direct layouts:

```text
examples/context-editor/
  package.json
  tsconfig.json
  src/{domain,operations,machines,app,runtime-factory,stories}.ts

examples/canonical-key-hostile-input/
  package.json
  tsconfig.json
  src/{accepted,hostile-inputs}.ts

examples/host-and-persistence/
  package.json
  tsconfig.json
  src/{app,runtime-factory,boot-codec,server-entry,react-entry}.ts(x)
```

No package may add `story/`, `scenarios/`, `flowTest`, a local proof format, arbitrary event JSON, a second
decoder, a second runtime, or a compatibility wrapper. The source files use the retained package routes:

```ts
import { app, definition, machine, module, resource, runtime, stream, transaction } from "flow-state";
import { behavior, control, fixture, model, story } from "flow-state/testing";
import { withRequestRuntime } from "flow-state/server";
import { FlowProvider, useActor, useActorByRef, useView } from "flow-state/react";
import { buildBehaviorContract, graphOf, importTraceArtifact } from "flow-state/inspect";
```

Each file imports only the route that owns the value. A consumer may alias a route locally, but the package
does not export `flow`, `test`, `inspect`, or `hooks` namespace objects.

### Reduced compile-proof modules

Use three modules in `examples/compile-proofs/src/`; do not preserve four overlapping aggregates:

```text
examples/compile-proofs/
  package.json
  tsconfig.json
  src/
    public-positive.ts
    public-negative.ts
    boundary-and-provenance.ts
```

Their ownership is:

- `public-positive.ts` proves route exports, definitions, recursive states, `App.M`, refs/leases, named
  operation catalogues, Story constructors, exact targets, checkpoints, `run.end`, and state narrowing.
- `public-negative.ts` proves deleted exports and authoring shapes, child/root/dynamic/view/receipt/scenario
  absence, wrong machine family, foreign ref, missing/extra input and bindings, invalid `K`, invalid option
  fields, target-free app commands, and invalid `simulate` observations. Every `@ts-expect-error` names its
  contract or deletion owner.
- `boundary-and-provenance.ts` proves the operation A/E/R and Layer closure, passive selector restrictions,
  branded boot input, Story fixture closure, the `BehaviorGateway` export, and the root/React/testing/server/
  inspect packed route relationship.

This split keeps positive inference, negative absence, and boundary closure independently reviewable. A fourth
module would repeat the same Story/persistence/CLI or operations/hosts consumer and would not add an evidence
class.

Packed consumers remain a separate fresh-package harness rather than a fourth compile module. It must install
the newly packed package into a temporary consumer and compile the same three modules against the package's
export map. It must test React 18 and React 19 where required, without treating the showcase examples as a
substitute for declaration or route proofs.

### Reduced runtime groups

The ten recommended groups collapse to seven. Each group below is a separate invariant class; merging within
one group means one production-path scenario with named subcases, not a new harness or a second runtime.

| Group | Production proof |
| --- | --- |
| 1. Mailbox and atomic turn | Pre-turn snapshot, action-batch validation, atomic publication, reentrant FIFO, and synchronous `send`. |
| 2. Context graph and admission lifetime | Silent bootstrap, one propagation wave, provider change, selector defect, concurrent ensure join, prepared activation, dependent-disposal rejection, tombstone, and reverse cleanup. |
| 3. Resource/store ownership | Same-runtime sharing, passive cross-actor reads, canonical generation fencing, owner-only preview/rollback, authoritative write, and StoreFanout ordering. |
| 4. Finite and continuing operations | Transaction reject/cancel/allow/serialize, writes-before-outcome, post-boundary unknown, stream latest/`hasValue`/count/generation, terminal release, duplicate declaration, and hydration without replay. |
| 5. Machine lifecycle and time | Compound-state activity lifetime, explicit timer/refresh event, redirect order, exact reentry, suspended deadline, and absence of final completion. |
| 6. Story/live parity and evidence | Inert plan, `process` versus clock movement, exact target, production `simulate`, checkpoint read cut, `run.end`, cleanup failure, and equivalent live-host/Story snapshots, records, pending work, and cleanup. |
| 7. Artifact and CLI boundary | Shared v2 codec, gateway safety, discovery inertness, Story/CLI executor parity, bounded/truncated trace, atomic output, signal cleanup, exit status, and deleted-shape refusal. |

The original context, admission, and lifetime groups are one graph/lifetime class. Resource and transaction/
stream behavior remain separate because passive canonical sharing and finite/continuing terminal semantics are
different equivalence classes. Story execution and host parity share one production-runtime proof because the
parity claim is exactly that they traverse the same owner. Artifact/CLI remains separate because it crosses a
trusted process and file boundary.

## 3. Cross-blocker dependency matrix

This proposal closes only the gateway registration and evidence-layout choices. The following public
signatures are prerequisites, not silently redefined here:

| Blocker | Required dependency | Use in this proposal | Circular or unsafe shape to reject |
| --- | --- | --- | --- |
| `CS-01` | Exact `RuntimeFactory<App>`, `runtime({ app, layer?, boot? })`, and request ownership | `story.app(createIncidentRuntime, options)` and live/Story parity | A gateway that constructs a runtime, exposes `ManagedRuntime`, or makes the factory a command callback |
| `CS-02` | Exact descriptor and plan signatures with honest A/E/R | Typed operation plans in `stories.ts` | A generic operation registry or a gateway-defined plan/observation type |
| `CS-03` | Family-specific `simulate` operation/observation typing | Story plans remain compile-checked before registration | Arbitrary `{ occurrence, type, value }` JSON accepted by the gateway or CLI |
| `CS-04` | Exact `fixture`, `control`, and `behavior` construction/closure rules | Fixtures are stored in Story plans; controls are acquired only during run; `behavior` is the one gateway constructor | A gateway that accepts raw fixtures, a Layer, control registry, or structural lookalike |
| `CS-05` | App-owned `decodeRuntimeBoot` and domain-slot codec | Used only by the persistence example and runtime bootstrap | Gateway discovery calling the boot decoder or defining a second domain decoder |
| `CS-06` | Exact `withRequestRuntime` and host Scope ownership | Used only by `host-and-persistence` | CLI or gateway owning a request runtime or sharing a browser/request Scope |
| `CS-07` | Public inspect projections and private TurnRecord/v2 model boundary | CLI projections consume the shared package-private model; examples use inspect route values only | A public gateway artifact model, CLI-only history, or snapshot-to-trace reconstruction |
| `CS-08` | Stable package-owned diagnostic/error envelopes | Loader maps import/brand/identity failures to accepted CLI diagnostics; Story run preserves primary/secondary evidence | A new public gateway hierarchy or raw parser/Effect errors escaping |
| `CS-09` | Exact branded `behavior({ stories })` value and loader checks | Resolved by Sections 1 and 4 | Optional gateway, default export, bare app plus stories, or a second registry |
| `CS-10` | Private v2 carriers and one codec authority | `behavior build/check` and trace commands use the shared artifact path | Gateway serializing itself, public v2 aliases, or a CLI decoder separate from Story |

The dependency direction must be acyclic:

```text
definitions -> machines -> modules/App.M -> RuntimeFactory/App
                                      -> story.app -> Story plans
Story plans -> behavior({ stories }) -> private gateway view
private gateway view -> CLI discovery/build/check/list/describe
private gateway view -> shared Story executor -> production runtime/Layer/Scope
production evidence -> shared private v2 codec -> CLI render/diff/trace projections
```

The CLI must not feed an artifact back into gateway construction, and gateway construction must not call the
CLI or artifact decoder. Artifact-only commands begin at the bounded artifact path and never import or execute
the gateway.

## 4. Rejected alternatives and circular proposals

### Rejected gateway shapes

- `behavior({ app, stories })`: the app is already derivable from typed app Story plans. An independent app
  argument creates two identity authorities and permits stories from another app to be paired structurally.
- `behavior({ stories: [storyA, storyB] })`: an array has no exact external-ID declaration and encourages a
  second ID-assignment registry. The record key is the CLI identity.
- `export default BehaviorGateway`: the CLI contract requires the named `BehaviorGateway` export, which makes
  the source boundary explicit and prevents accidental default exports from becoming a second convention.
- `export const BehaviorGateway = { app, stories }`: structural values can be forged, mutated, or assembled
  from mixed package instances. Only `behavior(...)` may produce the private brand.
- `behavior({ definitions, machines, runtime })`: this would duplicate AppPlan compilation, runtime ownership,
  and Story registration. The gateway registers finished Story plans only.
- A public `BehaviorGateway` type, `getApp()`, `getStories()`, or `toArtifact()` method: these expose private
  registry/schema authority and make the CLI contract part of the public testing API.

### Rejected CLI and evidence shapes

- Loading a runtime or fixture during `behavior build`, `check`, `story list`, or `story describe`: violates
  inert discovery and makes listing mutate application state.
- A CLI-only `decodeBehaviorGateway`, event JSON parser, Story runner, matcher, or history store: violates the
  one package-private v2 model and shared executor rules.
- Reintroducing `story/<path>`, arbitrary event JSON, `perform`, `deliver`, `receive`, `flush`, `settle`,
  `final`, `children`, or local-proof artifacts: these are deleted surfaces, not compatibility conveniences.
- Treating module IDs as actor or persistence identity: module IDs remain tooling and artifact grouping only.
- Keeping all seven examples, four compile modules, and ten runtime groups as independent copies: that would
  duplicate the same app/route/runtime owners and make green counts look like independent proof.

## 5. Acceptance gates and absence proofs

### Positive gates

The implementation is acceptable only when all of these pass from a fresh packed build in a clean checkout:

1. The three compile modules typecheck in source and packed declaration modes, including strict, isolated
   modules, isolated declarations, multi-entry, and required React 18/19 consumers.
2. The four maintained app packages build against the exact route map and their declared dependencies; no
   gateway import resolves an undeclared transitive package.
3. `behavior build`, `behavior check`, `behavior render`, `behavior diff`, `story list`, `story describe`, and
   `story run` exercise the exact gateway example. `story run` is compared with the direct Story executor for
   checkpoints, `run.end`, failure evidence, cleanup, and trace records.
4. Artifact-only `render`, `diff`, `trace summarize`, `trace proof`, and `trace diff` commands execute with no
   gateway import or application side effect.
5. Atomic output, bounded input/truncation, signal interruption, package-identity checks, temporary cleanup,
   stdout/stderr, and exit-status behavior pass through the CLI process owner.

The repository commands for the eventual implementation are the focused CLI/type/packed checks, the example
acceptance check, and then the broad `nub run verify` gate. A focused green check or `git diff --check` alone
does not close this proposal's proof obligations.

### Gateway negative cases

The deterministic gateway test matrix must reject, before compiled-registry access:

| Input | Required result |
| --- | --- |
| No `BehaviorGateway` named export, default-only export, or structural object | Gateway export failure |
| Brand from a second `flow-state` instance or mismatched `effect` instance | Package-identity failure |
| Two Story plans from different app identities | Mixed-app failure |
| Empty external key, missing Story value, focused machine Story, or actor recipe | Invalid gateway registration |
| Escaping symlink, gateway outside root, dynamic import, non-literal `require`, undeclared bare import | Gateway file/import failure before evaluation |

The same test must prove that the project root remains unchanged and every loader temporary disappears after
each failure path.

### Absence proofs

Acceptance must combine runtime and declaration evidence:

- inspect the packed export map and prove exactly the retained root, React, testing, server, inspect, and
  package-manifest routes; non-root routes cannot import root builders;
- compile negative consumers against the packed declarations for deleted values, types, overloads, properties,
  deep imports, namespace objects, child/root/dynamic/view/receipt/scenario surfaces, and old Story commands;
- run the fresh binary and prove old story paths, arbitrary event JSON, v1/final/children artifact shapes,
  batch Story execution, and a second decoder are absent or rejected before side effects;
- compare direct Story and CLI `story run` through the same production owner and private decoded model;
- prove the four package sources and the compile/packed harness contain no compatibility alias, local runtime,
  local operation registry, local history, or generated gateway artifact.

Source scans support the absence audit, but they cannot replace packed declaration, runtime, artifact, cleanup,
or parity proofs. The final acceptance record should name `API-P01` through `API-P03`, `CLI-P01`, `CLI-P02`,
`PROOF-001`, `PROOF-002`, `PROOF-008` through `PROOF-011`, `PROOF-014`, `PROOF-016`, and `PROOF-017` where
the corresponding evidence is actually present.

## 6. Contract decisions versus implementation choices

The following are contract decisions that require incorporation into the owning normative sources after this
proposal is accepted:

- the exact `behavior({ stories })` input and opaque return boundary;
- app Story-only registration, one app identity, external-ID record keys, and named `BehaviorGateway` export;
- loader identity/path/import checks before compiled-registry access;
- the four-package, three-module, seven-group proof crosswalk and the one CLI gateway layout;
- direct Story/CLI executor parity and artifact-only non-execution.

The following remain implementation choices and must not grow the public surface:

- `unique symbol`, private class, or private WeakSet brand storage;
- the bundler and temporary-directory mechanism used inside the scoped loader;
- the internal package-identity token representation and private gateway accessor;
- the concrete `LoaderServices` Layer and Node adapter composition;
- the file names of private decoded v2 records and test helper modules;
- whether the implementation combines several positive assertions in one executable test, provided every
  invariant and failure lane remains named and production-owned.

No implementation choice may change the public signatures, add a second decoder/runtime/registry, expose
private artifact data, or turn a source example into a new normative behavior rule.
