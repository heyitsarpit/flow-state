# Stories and testing contract

Status: normative vNext contract

This contract defines Story construction, recipes, immutable plans, commands, Implementations, seeds,
TestClock processing, checkpoints, failure/cleanup evidence, pure model discovery, and the shared
production-runtime boundary. It is semantic authority; archived revisions and provenance citations add
no behavior. Deleted Story/scenario surfaces remain governed by DEL-009/DEL-010; child-machine surfaces
remain deleted by DEL-002.

## Deletion disposition

The old Story constructors, commands, result fields, replay helpers, and mutable harness surfaces
are replaced by `DEL-009` in `COMPATIBILITY_AND_DELETIONS.md`. Conflicting server, persistence, artifact,
inspect, and CLI surfaces are governed by `DEL-010`; child-machine Story and model surfaces are deleted by
`DEL-002`. That contract owns the complete old-clause inventory and no-residue requirements. This file
records the accepted replacement and the retained host-runner and inspection boundaries.

## Construction and fixtures

~~~ts
const storyRun = story
  .app(runtimeSetup, {
    fixtures: [documentsFixture],
    maxTurns: 100,
    tags: ["smoke"],
  })
  .send(editor, Editor.E.EditRequested("Updated"))
  .process()
  .checkpoint("saved")
  .run();

const focused = story.machine(editorMachine, {
  input: { documentId: "document-1" },
  context: { sessionState: Session.S.ACTIVE, themeMode: "dark" },
  fixtures: [editorFixture],
});

const local = story.actor(editorMachine, {
  input: { documentId: "document-1" },
  contextBindings: { sessionState: sessionRecipe },
});
~~~

### Rule card — REV-TEST-001

- Surface: Public Story builders and closed option objects.
- Rule: The only constructors are story.app(runtimeSetup, options?), story.machine(machine, options?),
  and story.actor(machine, options?). App and machine plans may carry fixtures, maxTurns, title,
  description, and tags; machine plans also carry exact input and selected context; actor recipes carry
  exact input and contextBindings. maxTurns defaults to 100. Metadata is descriptive and not identity.
- Accepts: RuntimeSetup<App> for app Stories; required machine input; exact selected context; fixture
  definitions from fixture({ id, implementation, seeds? }); readonly fixture tuples closing every
  external requirement; an Implementation graph whose combined outputs satisfy the owner and whose
  acquisition may fail with its typed error; seeds as preloaded Runtime-owned resource state.
- Rejects: bare apps, already-created runtimes, void-machine input, context on context-free machines,
  missing required fixtures, extra fields, fresh/boot start unions, persistence inherited by Stories,
  duplicate Fixture providers, seeds used to satisfy service requirements, matchers, control registries,
  or a public testing runtime.
- Observable guarantee: Fixtures are constructed once per Runtime; each run receives fresh
  Runtime-scoped provider state. Fixture Implementation overrides the App Implementation for the same
  service identity, and duplicate providers reject rather than depend on order. story.app uses the
  supplied RuntimeSetup and every run calls RuntimeSetup.construct() once with a deterministic
  TestClock-backed host, fixture capabilities, and any explicitly supplied Persistence. Persistence
  tests use isolated in-memory storage. story.machine compiles a package-private focused AppPlan
  without creating another public app identity.
- Proof: Conditional option typing, exact-object rejection, fixture closure/override, metadata placement,
  100-turn default, Persistence compatibility, and production-bootstrap tests.
- Trace: REV-TEST-001; PUBLIC_API API-011–017.

### Rule card — REV-TEST-002

- Surface: Plan materialization and immutability.
- Rule: Builder calls return new deeply immutable inert plans. A plan has no assertions, branches,
  loops, predicates, arbitrary execution callbacks, live handles, or Runtime. run() is the only
  execution boundary. At materialization, AppPlan, RuntimeSetup, Implementation, Persistence, Clock,
  fixtures, seeds, and runner options are frozen as one construction snapshot.
- Accepts: Configuration fixed before materialization and a deterministic TestClock-backed host.
- Rejects: receiver mutation, late configuration mutation observed by a run, embedded test expectations,
  or execution hidden in a builder.
- Observable guarantee: A Story run observes exactly the materialized snapshot and returns immutable
  checkpoints plus automatic end evidence.
- Proof: Receiver/configuration mutation and inertness tests through the production runner.
- Trace: REV-TEST-002.

## Actor recipes and command targeting

### Rule card — REV-TEST-003, REV-TEST-004

- Surface: Story-local actor recipes and app Story targets.
- Rule: story.actor returns a deeply frozen recipe containing only exact machine, input, and exact
  contextBindings. Recipe identity, not machine/input equality, identifies a local target: reused recipe
  means one actor per run; distinct recipes mean independent actors. App send targets one exact recipe or
  app-owned ActorRef and resolves refs through runtime.getActor.
- Accepts: Binding keys exactly matching declared context slots, compatible app-owned refs or recipes,
  repeated keys naming one provider, admitted machines, transitive provider recipes, and stable refs
  retained by Runtime ownership.
- Rejects: runtime/mailbox/snapshot/state/operation/disposal fields in recipes; missing/extra/incompatible
  bindings, cycles, missing providers, foreign/mismatched/disposed refs, machine-family targets,
  unadmitted recipe machines, recipe targets in React or ordinary runtime APIs, and target failure that
  creates an actor or acquires ownership.
- Observable guarantee: Preparation validates the complete recipe graph, materializes providers before
  consumers after Runtime construction, translates recipe bindings to opaque refs, retains owner leases,
  and disposes Story-local leases in reverse dependency order. App-owned shared actors remain Runtime-
  owned and are not disposed by Story cleanup. Post-bootstrap admission uses the shared atomic path.
- Proof: Recipe identity/reuse, transitive dependency, provider-first materialization, reverse cleanup,
  cycles, missing/unadmitted providers, exact target lookup, and no-creation failure tests.
- Trace: REV-TEST-003, REV-TEST-004; SEM-029.

### Rule card — REV-TEST-005

- Surface: Focused machine Stories and selected context.
- Rule: story.machine owns one implicit fresh actor. send omits a target. It may accept exact fresh
  input and exact selected initial context, but never a boot payload, ActorRef, extra actor, raw memory,
  initial state, or snapshot override. setContext exists only for machine Stories and submits through
  the production context-turn path.
- Accepts: A command-empty focused AppPlan with exactly SelectedContextOf<M>; baseline context installed
  silently before activation/first evidence; later equal context silently ignored and changed context
  following production current/previous, onContext, mailbox, issue, and reconciliation rules.
- Rejects: direct context mutation, provider impersonation, provider selector proof, synthetic baseline
  events/evidence/work, app Stories injecting context, or focused sources treated as actor/ref/provider/
  graph nodes.
- Observable guarantee: Focused execution uses the production compiler, Runtime, actor engine, operation
  kernels, context coordinator, scheduler, inspection, barrier, and cleanup. It proves actor execution
  and context turns only; app Stories prove provider-backed resolution.
- Proof: Exact input/context typing, silent baseline, changed/equal setContext, no synthetic event, and
  focused-vs-app boundary tests.
- Trace: REV-TEST-005; DEL-002.

~~~ts
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
~~~

## Commands, execution, and evidence

    // Both kinds
    process(); advance(duration); advanceTo(epochMilliseconds);
    advanceToNextTimer(); checkpoint(name); run({ signal? });

    // App Story
    send(target, event);

    // Machine Story
    send(event); setContext(context);

### Rule card — REV-TEST-006

- Surface: Closed Story command surface and cleanup.
- Rule: send enters the exact production mailbox and waits for that turn's acknowledgement without
  draining unrelated work. process replaces flush/settle and repeatedly drains ready mailboxes, context
  turns, reconciliation, same-time deadlines, scheduler work, and finite fibers until no work can progress
  without another command or future time. It does not advance time or invent results. Clock commands move
  the injected TestClock only and never call process implicitly. checkpoint captures immediately. run
  creates a fresh Runtime, executes the plan, and owns cancellation/finalization. Every committed turn
  obtains the global commit permit and reserves its sequence before StoreState mutation; the DehydrateBarrier
  captures only after publication and before the acknowledgement/release boundary required by WIRE-017.
- Accepts: Continuing streams, pending external calls, future TestClock deadlines, and unknown finite
  work visible to process; maxTurns as the bound for repeated unknown finite work.
- Rejects: implicit time movement, invented external results, silent maxTurns exhaustion, commands after
  admission closes, or a Story-owned runtime/cleanup path.
- Observable guarantee: Exhaustion fails the run. On execution, cancellation, or failure, admission
  closes and non-abortable finalization runs. Terminal lifecycle evidence is retained before sinks shut
  down, and accepted evidence is drained before closing sinks and queues. Story leases dispose in reverse
  dependency order; Runtime
  disposes actors, stores, operations, context, lifecycle evidence, sinks, and queues. Fixture/host
  scopes finalize after Flow-owned dependents. Every cleanup phase runs; failures are deterministic and
  ordered. Existing execution/cancellation failure remains primary, otherwise the first cleanup failure
  is primary, and either case rejects. FlowStoryExecutionError carries one deeply frozen package-owned
  envelope containing completed checkpoints, optional end, failure boundary, primary diagnostic, ordered
  cleanup diagnostics, cancellation evidence, accepted/drained evidence-sequence facts, and the complete
  public Effect Cause.Cause<unknown>.
- Proof: Command ordering, TestClock boundaries, maxTurns, cancellation, cleanup phases, failure
  precedence, and scope-lifetime tests.
- Trace: REV-TEST-006; WIRE-021/022/023.

`send` MUST enter the exact actor's production mailbox with a package-private acknowledgement on that same
command. The acknowledgement MUST complete after the ordinary event turn stabilizes and MUST NOT invoke
transition logic directly or drain unrelated ready work.

`process()` MUST repeatedly ask the production runtime to drain ready mailboxes, context turns,
reconciliation, same-time deadlines, scheduler work, and finite operation fibers until no work can progress
without another command or future time. It MUST stop while pending external calls, continuing streams, and
future TestClock deadlines remain visible. Unknown finite work MUST continue until completion or `maxTurns`
exhaustion; `process()` MUST NOT advance time or invent an external result.

`advance(duration)`, `advanceTo(epochMilliseconds)`, and `advanceToNextTimer()` MUST move the injected
TestClock, and clock movement MUST NOT call `process()` implicitly. `checkpoint(name)` MUST capture evidence
immediately without progressing work, moving time, or creating restoration input. `run({ signal? })` MUST
acquire a fresh production runtime, execute the immutable plan, and guarantee cancellation and scoped cleanup
through production disposal.

### Rule card — REV-TEST-007

- Surface: External behavior and operation ownership.
- Rule: Stories use complete typed Implementations and Fixtures. Production resource, transaction, and
  stream kernels alone own admission, execution, completion classification, writes, projections, mapped
  events, evidence, cancellation, and cleanup.
- Accepts: Typed service Effects or Streams supplied by Implementation/Fixture.
- Rejects: perform, deliver, receive, simulate, result injection, interception of pending occurrences,
  operation registries, public persistence facts, and replay of restored external work.
- Observable guarantee: Hydrated transactions follow WIRE-012; hydrated streams create a new generation
  without replaying emissions. Live hosts and Stories observe the same operation semantics.
- Proof: Implementation completeness, no-injection API absence, and production-kernel parity tests.
- Trace: REV-TEST-007; WIRE-011A/012.

### Rule card — REV-TEST-008

- Surface: Checkpoint/end shape and atomic capture.
- Rule: App evidence exposes actor(storyActor | actorRef); machine evidence exposes snapshot for its
  one actor. Both expose runtime.now and runtime.pendingWork. Every checkpoint and successful run.end is
  deeply frozen and captured by one production DehydrateBarrier cut; end is captured after commands and
  before cleanup.
- Accepts: Exact static Story closure: the machine actor, every recipe, and every exact ActorRef in
  bindings, command targets, and transitive providers. Captured actor issues remain in snapshots.
- Rejects: live lookup from actor(), unrelated runtime actors, processing, time movement, creation,
  disposal, restoration, external work, independent issue/resource registries, or end implying completion.
- Observable guarantee: Capture includes one StoreState revision, published actor snapshots, pending work,
  TestClock time, and accepted evidence prefix. A failed run retains completed checkpoints and truthful
  failure/cleanup evidence; no successful end is manufactured.
- Proof: Atomic read-cut, exact-target lookup, freeze, closure membership, failed-boundary, and end
  timing tests.
- Trace: REV-TEST-008; WIRE-009/017/021/022/023.

The result vocabulary is run.end, never final. A machine example is:

~~~ts
appRun.checkpoints["signed-out"].actor(editor).snapshot;
appRun.checkpoints["signed-out"].actor(PrimarySessionRef).snapshot;
appRun.checkpoints["signed-out"].runtime.now;
appRun.checkpoints["signed-out"].runtime.pendingWork;

appRun.end.actor(editor).snapshot;
appRun.end.actor(PrimarySessionRef).snapshot;

machineRun.checkpoints["saved"].snapshot;
machineRun.checkpoints["saved"].runtime.now;
machineRun.end.snapshot;
machineRun.end.runtime.pendingWork;
~~~

## Runtime boundary, models, and host runners

### Rule card — REV-TEST-009, REV-TEST-010

- Surface: Pure model scope and production runtime parity.
- Rule: Pure model discovery accepts only a command-empty fresh story.machine plan. App Stories prove
  real cross-actor orchestration. Stories may create a fresh Runtime for isolation, but live hosts,
  Stories, and tests share one production Runtime implementation, including actor creation/lookup,
  mailboxes, operation kernels, context propagation, scheduler, inspection, read barrier, and disposal.
- Accepts: Immutable plan construction, deterministic host capabilities, command interpretation,
  acknowledgement waiting, and evidence collection.
- Rejects: a separate Story/testing transition engine, actor engine, mailbox, scheduler, store,
  operation, cache, snapshot, cleanup, or evidence implementation.
- Observable guarantee: Equivalent live-host and Story commands produce equivalent snapshots, operation
  facts, context turns, pending work, generations, TurnRecords, and cleanup evidence. React lifecycle
  evidence remains outside the machine timeline.
- Proof: Architecture absence scans and live/Story parity through production owners.
- Trace: REV-TEST-009, REV-TEST-010.

### Rule card — TEST-014

- Surface: Structural model discovery.
- Rule: model(baseStory, { stateKey }) accepts only a fresh command-empty machine Story. stateKey
  returns a CanonicalKeyInput containing every state, memory, and seed fact affecting guards/redirects;
  Flow validates it with PUBLIC_API API-005. Traversal uses only pure transition, guard, redirect, and
  memory logic. Flow MUST NOT fall back to object identity or a state token alone.
- Accepts: options exactly { events, maxDepth?, limit? }; maxDepth default 20 and non-negative safe;
  limit default 100 and positive safe; candidate events owned by each traversal call; inert exact-ref
  seed facts readable without fixture instantiation.
- Rejects: Effect imports/run, services, resource/transaction/stream execution, fixture Implementation
  construction, runtime/fixture mutation, app Story reduction, boot payloads, inferred candidates,
  filters, source/target selectors, weights, duplicate policies, custom serializers, hidden registries,
  synthesized success routes, and any fallback to object identity or a state token alone.
- Observable guarantee: Shortest paths are breadth-first in candidate order, simple paths depth-first,
  first path per unseen key, zero-step path included, no repeated key in one simple path, and both stop
  at maxDepth/limit. Results are frozen { paths, truncated, explored }; defects fail synchronously
  before partial results.
- Proof: Pure import, candidate ownership, bounds, canonical keys, order, truncation, and state-key
  defect tests.
- Trace: TEST-014.

Traversal options are exactly `{ events, maxDepth?, limit? }`; `maxDepth` defaults to 20 and is a
non-negative safe integer, while `limit` defaults to 100 and is a positive safe integer. Event cost is
always one. `getShortestPaths` performs breadth-first search in candidate-array order and retains the first
path to each unseen state key, including the zero-step initial path. `getSimplePaths` performs depth-first
search in candidate-array order and never repeats a state key within one path. Both stop before expanding
beyond `maxDepth` or returning more than `limit`, and return a frozen `{ paths, truncated, explored }`
result; `truncated` is true when either bound hid an otherwise reachable candidate. State-key defects or
noncanonical results throw synchronously before returning a partial collection.

### Rule card — TEST-015

- Surface: Model paths and live proof.
- Rule: Each path retains predicted final projection, per-step data, issues, weight, description, and
  traversal metadata. path.story is the base focused Story extended with authored events; path.story.run()
  is the live proof and path.story.process().run() is an explicit ready-work boundary.
- Accepts: Live final and prefix Stories compared with the same stateKey; asynchronous outcomes only
  when their domain events were already authored as candidates.
- Rejects: model-owned replay, replay-only Implementations/clocks, predicted primitive snapshots,
  synthesized events/checkpoints, or a second resource/transaction/stream interpreter.
- Observable guarantee: Live parity returns ordinary Story values/errors/checkpoints/cleanup guarantees
  and shares the production runtime. React attachment lifecycle stays outside the machine timeline.
- Proof: Final-key, prefix-key, asynchronous-candidate, and ordinary-live-Story parity tests.
- Trace: TEST-015; REV-TEST-010.

Live parity applies the model's same `stateKey` callback to the returned Story's final actor snapshot and
compares that key with the predicted final key. Per-step parity runs corresponding model-generated prefix
Stories and compares each prefix key. Primitive snapshots remain ordinary live-Story evidence and are not
predicted, because doing so would execute a forbidden second resource, transaction, or stream interpreter.
Paths that depend on asynchronous outcomes include their already-authored domain events as candidate events;
the model never synthesizes them or invents checkpoint names or a second evidence shape.

Host runners own assertions, pass/fail, retries, and naming. Flow evidence contains evidence, not
expectations; ordinary matchers run after run() returns or inspect FlowStoryExecutionError after
rejection. One immutable TurnRecord follows each atomic machine-turn snapshot. Lifecycle records use
the same sequenced hub and publication barrier but never create a machine turn or second mutable history.
createInspectionBufferSink({ capacity? }) defaults to 256, validates a non-negative capacity, and
exposes frozen records plus truncatedBeforeSequence. Hosts install history explicitly; Persistence does
not persist buffers and there is no actor-owned setRetention or mutable TraceLog.

## Historical closure note

The historical problem statements are recorded in
`reference/incident-console/implementation/revision-spec/UNRESOLVED_BEHAVIOR.md`; this chapter's focused-
context, external-operation, occurrence, checkpoint, and cleanup entries are closed by the accepted
`REV-TEST-*` clauses. Post-bootstrap recipe admission follows the shared atomic transaction in `SEM-029`; no
new Story surface follows from that dependency.
