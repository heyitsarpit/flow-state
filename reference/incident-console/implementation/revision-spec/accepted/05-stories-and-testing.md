# Stories and testing

This chapter is the complete accepted Story contract. It defines app and focused-machine construction,
Story-local actor recipes, immutable planning, commands, controlled observations, processing, virtual time,
checkpoints, end and failure evidence, cleanup, pure models, and the production-runtime boundary. A source
location in a `Provenance` field is historical evidence only and adds no semantics to the rule.

## Deletion disposition

The old Story constructors, commands, result fields, replay helpers, and mutable harness surfaces changed
by this chapter are classified by `DEL-009` in `REV-MIG-004`. That entry owns the complete old clause
inventory and no-residue requirements; the `Supersedes` fields below identify the local semantic boundary
only.

## REV-TEST-001 — Split Story construction by scope

**Change:** Replace the callable Story constructor with one non-callable namespace and three explicit
constructors.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:864-895` and
`DESIGN_REVISIONS.md:1366-1374`.

**Formalization:** The closed conditional option objects were accepted on 2026-08-16.

**Rule:** The public Story constructors MUST be:

```ts
story.app(runtimeFactory, options?);
story.machine(machine, options?);
story.actor(machine, options?);
```

The constructors MUST use three closed option-object shapes. The following helper names are specification
notation and need not be exported:

```ts
type InputOptions<M> =
  InputOf<M> extends void ? { readonly input?: never } : { readonly input: InputOf<M> };

type SelectedContextOptions<M> = keyof SelectedContextOf<M> extends never
  ? { readonly context?: never }
  : { readonly context: SelectedContextOf<M> };

type ContextBindingOptions<M> = keyof SelectedContextOf<M> extends never
  ? { readonly contextBindings?: never }
  : { readonly contextBindings: StoryContextBindingsOf<M> };

type StoryContextBindingsOf<M> = {
  readonly [K in keyof SelectedContextOf<M>]:
    ActorRef<ProviderMachineAt<M, K>> | StoryActorRecipe<ProviderMachineAt<M, K>>;
};

type FixtureOptions<Owner> =
  RequirementsOf<Owner> extends never
    ? { readonly fixtures?: readonly FixtureDefinition[] }
    : {
        readonly fixtures: FixtureTupleClosing<RequirementsOf<Owner>>;
      };
```

`StoryContextBindingsOf`, `ProviderMachineAt`, and `StoryActorRecipe` describe the exact contextual type
relationship; they do not require public helper exports. In this notation, `FixtureDefinition` denotes an immutable
value returned by the existing `fixture(...)` constructor, and `FixtureTupleClosing<R>` denotes a readonly
tuple whose combined Layer outputs satisfy `R`; neither needs to be an exported alias.

The three complete option shapes are:

```ts
type AppStoryOptions<App> = FixtureOptions<App> & {
  readonly boot?: RuntimeBootPayload<App>;
  readonly maxTurns?: number;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
};

type MachineStoryOptions<M> = InputOptions<M> &
  SelectedContextOptions<M> &
  FixtureOptions<M> & {
    readonly maxTurns?: number;
    readonly title?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
  };

type ActorRecipeOptions<M> = InputOptions<M> & ContextBindingOptions<M>;
```

These aliases are explanatory structural notation rather than required exports. The public constructors
MUST behave as if constrained by them, and exact-object checking MUST reject every field not shown for that
constructor. `fixtures` MAY be omitted only when the corresponding app or focused machine has no remaining
external requirement; otherwise a fixture tuple that closes every requirement MUST be supplied. The
complete options argument MAY be omitted only when none of its conditionally required fields remain.

Representative calls are:

```ts
story.app(runtimeFactory, {
  boot,
  fixtures,
  maxTurns,
  title: "document session",
  tags: ["smoke"],
});

story.machine(machine, {
  input,
  context,
  fixtures,
  maxTurns,
});

story.actor(machine, {
  input,
  contextBindings,
});
```

Required machine input MUST remain required, while a void-input machine MUST reject an authored `input`.
Focused-machine `context` MUST contain exactly the selected values declared by the definition and MUST be
required when those declarations are nonempty; a context-free machine MUST reject it. `boot` MUST be the
existing app-branded `RuntimeBootPayload<App>` and MUST exist only on `story.app`; the removed fresh-or-boot
`start` union MUST NOT return. `title`, `description`, and `tags` are descriptive metadata on app and
machine plans only and MUST NOT become discovery identity. `maxTurns` MUST bound repeated processing and
MUST default to `100` when omitted.

`story.app` MUST accept the same typed `RuntimeFactory<App>` used by the live host. It MUST accept neither
a bare app definition nor an already-created runtime. Every `run()` MUST invoke that factory once with a
deterministic host containing the TestClock, fixture-backed external capabilities, and compatible Story
boot. Boot restoration, factory ensures, source-graph validation, graph sealing, and activation MUST use
the production bootstrap.

`story.machine` MUST compile a package-private one-machine AppPlan through the production app compiler and
execute it through the same production `FlowRuntime`, actor engine, operation kernels, context-turn path,
scheduler, inspection surface, atomic read barrier, and cleanup path used by live hosts.

A missing shared actor during bootstrap or command targeting MUST fail through the same `getActor`
diagnostic used by a live host.

The production bootstrap MUST install and validate boot actors, complete the runtime factory's initial
`ensureActor` calls, resolve every exact context-provider ref, and reject missing providers, duplicate
registrations, foreign machines, and instance cycles before activation, external work, or public handle
escape. The Story layer MUST NOT provide a second registration, activation, actor, mailbox, scheduler,
operation, cache, snapshot, or cleanup implementation.

**Proof obligations:** Compile proofs MUST cover every conditionally required or forbidden option,
fixture-requirement closure, exact boot/app compatibility, metadata placement, and rejection of extra
fields. Runtime proofs MUST cover the `100`-turn default and route app boot through production bootstrap.

## REV-TEST-002 — Keep Story plans immutable and inert

**Change:** Constrain Story builders to declarative plans.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:886-895`.

**Rule:** Builder calls MUST return new immutable plans without modifying their receiver. Plans MUST NOT
contain embedded assertions, behavior branches, loops, predicates, arbitrary execution callbacks, or live
actor handles. A runtime factory MUST be production bootstrap authority rather than a command callback.
`run()` MUST be the sole execution boundary and MUST return immutable checkpoints and automatic end
evidence for assertions in an ordinary test runner.

## REV-TEST-003 — Represent Story-local actors as recipes

**Change:** Add inert actor recipes without creating a Story-only actor model.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:897-951` and
`DESIGN_REVISIONS.md:1374-1383`.

**Formalization:** Recipe-or-ref context bindings and dependency-ordered materialization and cleanup were
accepted on 2026-08-16.

**Rule:** `story.actor(machine, options?)` MUST return a deeply frozen inert recipe containing the exact
machine, required fresh input, and required exact `contextBindings`. It MUST contain no runtime, mailbox,
snapshot, state, operation binding, disposal authority, or live actor handle. Every binding key MUST match
one declared context slot and its value MUST be either an exact compatible app-owned `ActorRef` or an exact
compatible Story actor recipe. Several keys MAY name the same provider target.

```ts
const session = story.actor(sessionMachine);
const PrimaryThemeRef = actorRef(themeMachine, "primary-theme");

const editor = story.actor(editorMachine, {
  input: { documentId: "document-1" },
  contextBindings: {
    sessionState: session,
    themeMode: PrimaryThemeRef,
  },
});

const leftButton = story.actor(buttonMachine);
const rightButton = story.actor(buttonMachine);
```

One completed plan MUST identify local targets by recipe object identity. Reuse of one recipe MUST resolve
one actor per run; separate recipes MUST create independent actors even when machine and input are equal.
Before materialization, Story preparation MUST validate the complete referenced recipe dependency graph,
including its transitive provider recipes, exact slot coverage, provider compatibility, admitted machines,
missing providers, and cycles. It MUST translate each recipe binding to the opaque ref of that recipe's
materialized actor while leaving app-owned stable refs unchanged.

Each `run()` MUST materialize providers before consumers with `runtime.createActor` after the production
factory returns. It MUST retain each returned owner lease, expose only `lease.actor` to command execution
and evidence capture, and call the leases' asynchronous idempotent `dispose` in reverse dependency order
during run cleanup. Dropping a lease MUST NOT count as cleanup, and app-owned shared actors MUST remain owned
by leases retained by the runtime factory. A recipe whose machine is not admitted by the compiled AppPlan
MUST be rejected. Post-bootstrap actor admission remains governed by `BEH-002`; this rule adds no alternate
creation path.

**Proof obligations:** Compile proofs MUST reject missing, extra, and provider-incompatible binding keys.
Runtime proofs MUST cover recipe and stable-ref providers, repeated bindings to one provider, transitive
provider discovery, provider-first materialization, consumer-first cleanup, cycles, missing providers, and
unadmitted machines.

## REV-TEST-004 — Address exact actors in app Stories

**Change:** Replace machine-family targeting with exact actor targets.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:916-951` and
`DESIGN_REVISIONS.md:1378-1383`.

**Rule:** App Story `send` and `simulate` MUST target either one exact `story.actor` recipe or one exact
app-owned `ActorRef`. A ref MUST resolve through `runtime.getActor`; a missing ref MUST fail rather than
create an actor. App-owned shared actors MUST remain owned by the runtime factory and MUST NOT be disposed
by Story cleanup. Machine families MUST be invalid targets because one machine can back several actors.
Story recipes MUST NOT be accepted by React hooks, `useView`, or ordinary runtime APIs.

**Failure behavior:** A missing, foreign, mismatched, or disposed app-owned ref MUST fail through
the same stable `runtime.getActor` diagnostic as live lookup and MUST NOT create an actor. A machine family
MUST fail as an invalid target. An unadmitted recipe machine MUST fail before command execution. No target
failure may acquire ownership or begin command execution.

**Example:**

```ts
const saveDocument = story
  .app(createDocumentsRuntime, {
    fixtures: [documentsFixture],
    maxTurns: 100,
  })
  .send(editor, Editor.E.EditRequested("Updated"))
  .process()
  .simulate(
    editor,
    Editor.O.save.commit({
      documentId: "document-1",
      body: "Updated",
    }),
    {
      occurrence: 1,
      type: "success",
      value: savedDocument,
    },
  )
  .process()
  .send(PrimarySessionRef, Session.E.SignOutRequested())
  .process()
  .checkpoint("signed-out");
```

## REV-TEST-005 — Keep machine Stories focused on one fresh actor

**Change:** Replace raw state restoration and extra-actor inputs with exact input and selected context.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:952-988` and
`DESIGN_REVISIONS.md:1381-1383`.

**Rule:** A machine Story MUST own one implicit fresh actor, so its `send` and `simulate` commands MUST omit
a target. It MAY accept exact fresh input and exact selected initial context required by the definition.
It MUST invoke the production memory initializer and MUST NOT accept a runtime boot payload, `ActorRef`,
additional actor, raw memory, initial state, or actor-snapshot override.

`setContext(context)` MUST exist only for machine Stories and MUST admit exact already-selected values
through the production context-turn path. It MUST NOT impersonate provider actors or prove provider
selectors. App Stories MUST prove production provider resolution and MUST NOT inject context directly.

The focused one-machine AppPlan MUST use the production compiler, actor engine, operation kernels,
context-turn coordinator, scheduler, inspection surface, and cleanup path. Injected selected context MUST
exercise that production context-turn path, while the Story MUST NOT claim to prove provider selectors,
provider refs, app bootstrap, or a production context graph. The exact package-private focused-context
installation mechanism remains unresolved under `BEH-018`.

```ts
const signedOutStory = story
  .machine(editorMachine, {
    input: { documentId: "document-1" },
    context: {
      sessionState: Session.S.ACTIVE,
      themeMode: "dark",
    },
    fixtures: [editorFixture],
    maxTurns: 100,
  })
  .send(Editor.E.EditRequested())
  .setContext({
    sessionState: Session.S.SIGNED_OUT,
    themeMode: "dark",
  })
  .process()
  .checkpoint("signed-out");
```

## REV-TEST-006 — Use one closed Story command surface

**Change:** Replace overlapping progress, delivery, and time commands.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:990-1035` and
`DESIGN_REVISIONS.md:1389-1399`.

**Rule:** The complete command surface MUST be:

```ts
// Both Story kinds
process();
advance(duration);
advanceTo(epochMilliseconds);
advanceToNextTimer();
checkpoint(name);
run({ signal? });

// App Story
send(target, event);
simulate(target, operationPlan, observation);

// Machine Story
send(event);
simulate(operationPlan, observation);
setContext(context);
```

`send` MUST enter the exact actor's production mailbox with a package-private acknowledgement on that same
command. The acknowledgement MUST complete after the ordinary event turn stabilizes and MUST NOT invoke
transition logic directly or drain unrelated ready work.

`process()` MUST replace both `flush()` and `settle()`. It MUST repeatedly ask the production runtime to
drain ready mailboxes, context turns, reconciliation, same-time deadlines, scheduler work, and finite
operation fibers until no work can progress without another command or future time. It MUST stop while
controlled calls, continuing streams or observations, and future TestClock deadlines remain visible.
Unknown finite work MUST continue until completion or `maxTurns` exhaustion. `process()` MUST NOT advance
time or invent an external result.

`advance(duration)`, `advanceTo(epochMilliseconds)`, and `advanceToNextTimer()` MUST move the injected
TestClock. Clock movement and `simulate` MUST NOT call `process()` implicitly. `checkpoint(name)` MUST
capture evidence immediately without progressing work, moving time, or creating restoration input.
`run({ signal? })` MUST acquire a fresh production runtime, execute the immutable plan, and guarantee
cancellation and scoped cleanup through production disposal.

`maxTurns` MUST bound repeated processing of unknown finite work. Exhaustion MUST fail the run rather than
silently treating remaining finite work as settled. The exact failure envelope and cleanup aggregation are
unresolved under `BEH-022`.

## REV-TEST-007 — Simulate admitted operation occurrences through production completion

**Change:** Replace `perform`, `deliver`, and `receive` with one exact controlled-observation command.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:1019-1075` and
`DESIGN_REVISIONS.md:1390-1397`.

**Rule:** `simulate` MUST match an already-pending controlled operation and MUST NOT create work. Its
operation plan MUST identify the exact descriptor and canonical input or key; a required one-based
`occurrence` MUST distinguish repeated matching admissions for the exact actor target. The observation
MUST enter through the production completion path and MUST NOT directly mutate actor memory, cache state,
snapshots, generations, or pending-work evidence.

The accepted anonymous observation shapes are:

```ts
type ObservationShape =
  | { occurrence: number; type: "success"; value: Success }
  | { occurrence: number; type: "failure"; error: Failure }
  | { occurrence: number; type: "defect"; defect: unknown }
  | { occurrence: number; type: "interruption" }
  | { occurrence: number; type: "emission"; value: Emission }
  | { occurrence: number; type: "completion" };
```

`ObservationShape` is local explanatory notation, not an accepted exported name or universal generic
parameter order. Each operation family admits only the variants and value types that apply to that family.

Finite operations MUST accept terminal observations. Streams MUST accept emissions followed by
completion, failure, defect, or interruption. Missing, mismatched, not-yet-admitted, already-settled, and
wrong-kind occurrences MUST fail deterministically. When several actor occurrences share one canonical
resource generation, one terminal simulation MUST settle that generation once and update every attached
actor; another terminal observation MUST fail as already settled.

The Story layer MAY replace only external execution. Admission, ownership, concurrency, canonical
identity, lifecycle publication, completion classification, authoritative writes, mapped outcomes, and
evidence MUST continue through the production operation kernels. Exact interception, occurrence allocation
and retention, suspension interaction, and hydration behavior remain unresolved under `BEH-019` and
`BEH-020`.

## REV-TEST-008 — Capture atomic checkpoint and end evidence

**Change:** Replace machine-ID maps and `final` with exact actor evidence lookup and `run.end`.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:1077-1109` and
`DESIGN_REVISIONS.md:1390-1396`.

**Rule:** App checkpoints and end evidence MUST expose exact authored targets through
`actor(storyActor | actorRef)`. This method MUST read captured evidence and MUST NOT return a live actor.
Machine checkpoints MUST expose `snapshot` for their single actor. Both modes MUST reserve
`runtime.now` and `runtime.pendingWork`, while actor issues remain in their actor snapshots.

```ts
appRun.checkpoints["signed-out"].actor(editor).snapshot;
appRun.checkpoints["signed-out"].actor(PrimarySessionRef).snapshot;
appRun.checkpoints["signed-out"].runtime.now;
appRun.checkpoints["signed-out"].runtime.pendingWork;

appRun.end.actor(editor).snapshot;
appRun.end.actor(PrimarySessionRef).snapshot;

machineRun.checkpoints["signed-out"].snapshot;
machineRun.checkpoints["signed-out"].runtime.now;
machineRun.end.snapshot;
machineRun.end.runtime.pendingWork;
```

Every checkpoint and successful `run.end` MUST be deeply frozen and captured through the production
runtime's atomic read barrier so all actor snapshots and runtime metadata describe one instant. `run.end`
MUST NOT imply actor finality or completion. Failed execution MUST retain completed checkpoints plus typed
failure-boundary and cleanup evidence and MUST NOT manufacture a successful `run.end`.

The exact atomic-read lock order, actor capture set, lifecycle-evidence cut, cleanup-error aggregation, and
failed-run envelope remain unresolved under `BEH-021` and `BEH-022`. Those gaps MUST preserve the accepted
single-cut, frozen-evidence, completed-checkpoint retention, and no-fabricated-success requirements.

## REV-TEST-009 — Limit pure model discovery to fresh machine plans

**Change:** Prevent a pure transition model from standing in for asynchronous app orchestration.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:1111-1113` and
`DESIGN_REVISIONS.md:1397-1398`.

**Rule:** Pure model discovery MUST accept only a command-empty fresh `story.machine` plan. App Stories
MUST prove real cross-actor orchestration and MUST NOT be reduced to one predicted machine model.

## REV-TEST-010 — Share one production runtime implementation

**Change:** Prohibit testing-specific stateful runtime implementations.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:692-694` and
`DESIGN_REVISIONS.md:1115-1128`.

**Rule:** A Story MAY create a fresh runtime instance for isolation, but live execution, Stories, and tests
MUST share the same production runtime implementation. Story code MUST be limited to immutable plan
construction, deterministic host capabilities, command interpretation, acknowledgement waiting, and
evidence collection. Every stateful action MUST pass through the production runtime factory,
`FlowRuntime`, actor creation and lookup, mailbox, operation kernels, context propagation, scheduler,
inspection, atomic read barrier, and disposal paths.

Equivalent domain commands executed by a live host and a Story MUST produce the same snapshots, operation
facts, context turns, and `TurnRecord`s. React attachment lifecycle evidence remains outside the machine
timeline and does not require synthetic Story suspend/resume commands.

**Proof obligations:** Architecture proofs MUST reject any separate Story/testing runtime, actor, mailbox,
scheduler, operation store, transition engine, cache, snapshot, or cleanup implementation. Parity proofs
MUST execute equivalent live-host and Story commands and compare snapshots, turn records, pending work,
operation generations, and cleanup evidence.

## Unresolved boundaries

The following internal questions remain open and MUST NOT be answered by this chapter: focused-context
installation (`BEH-018`); controlled-operation interception and exact
occurrence persistence (`BEH-019`, `BEH-020`); and the checkpoint capture set, evidence cut, cleanup failure,
and failed-run envelope (`BEH-021`, `BEH-022`). Their problem statements are recorded in
[`UNRESOLVED_BEHAVIOR.md`](../UNRESOLVED_BEHAVIOR.md). Post-bootstrap recipe admission also depends on the
open internal transaction in `BEH-002`; no new Story surface follows from that dependency.
