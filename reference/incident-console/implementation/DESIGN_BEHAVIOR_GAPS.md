# Flow State vNext behavioral closure register

Status: open behavioral contract work under the normative revision overlay

This register records the gaps found by the post-decision audit of
[`DESIGN_REVISIONS.md`](./DESIGN_REVISIONS.md) against the existing implementation contracts, live
source, tests, proof matrix, phase tasks, and artifact schemas.

The reconciled internal architecture and semantics proposed to close these gaps are recorded in
[`DESIGN_BEHAVIOR_SOLUTIONS.md`](./DESIGN_BEHAVIOR_SOLUTIONS.md). That file remains non-normative until
its decisions are explicitly accepted.

These are behavior problems, not API redesign proposals. The accepted public names, constructor
shapes, hook split, actor/ref/lease capability split, Story command vocabulary, named `O` families,
context authoring surface, and child-machine deletion remain locked. Closing an item below may add an
internal owner, record type, ordering law, diagnostic, persistence rule, or proof, but must not silently
rename, replace, overload, or add a competing public API. If a behavioral guarantee genuinely cannot
be implemented through the accepted surface, that conflict must return to explicit design review
rather than being disguised as contract migration.

The items are numbered so contract migration can give each one an explicit disposition and proof.

## Runtime, actor graph, and ownership

### BEH-001 — Runtime factory lifecycle

Define the behavior of the already accepted `RuntimeFactory<App>` across live hosts and `story.app`:
app identity discovery, Clock and external-capability injection, boot installation, Layer acquisition,
initial `ensureActor` ownership, readiness, failure, cancellation, and scoped disposal. No runtime or
actor handle may expose a partially validated bootstrap graph, and discovery must remain inert. This
does not reopen the accepted `story.app(runtimeFactory, options?)` or `FlowProvider` surfaces.

### BEH-002 — Post-bootstrap actor admission

Separate sealed static `AppPlan` admission from the runtime actor-instance graph. Later
`createActor` and `ensureActor` calls must use one atomic admission transaction that validates the
machine, resolves every context provider, rejects instance cycles and disposed refs, installs the
silent baseline and logical edges, activates the actor, and only then exposes its handle. “Graph
sealed” must not imply that accepted runtime creation calls are impossible after bootstrap.

### BEH-003 — `ensureActor` ownership authority

Make “owner-only” enforceable without changing the accepted `ensureActor`/`getActor` split. A caller
must not gain terminal disposal authority merely by replacing a lookup with an ensure. The contract
must identify who may ensure, what concurrent ensures own, whether their disposal authority is shared
or scoped, and how boot-restored ownership is reconciled.

### BEH-004 — Durable actor capture membership

Replace the deleted automatic-root capture law. Define exactly which stable actors dehydration
includes, how suspended stable actors and runtime-local tombstones are treated, who owns a restored
actor that the current factory does not ensure, and which transitive context dependencies join the
capture. Opaque actors that affect included persistent state must retain fail-closed behavior.

### BEH-005 — Stable and opaque ref encoding

Define the stable-ID grammar, length bounds, equality, composite encoding, serialized machine lookup,
and opaque-ref generation for the accepted `ActorRef` behavior. Durable restoration resolves authored
machine identity through the current `App.M`; it cannot depend on JavaScript object identity. Equal
stable IDs under different machine identities remain distinct.

### BEH-006 — Module tooling ownership

Give every admitted machine family exactly one module tooling owner per app. The compiler must reject
the same machine value appearing under several module keys or modules when that would make trace,
artifact, CLI, or diff attribution ambiguous. Moving a machine between modules is artifact-breaking
but remains runtime- and persistence-compatible under the accepted identity split.

## React lifecycle, context, and observation

### BEH-007 — Lifecycle publication revisions

Lifecycle changes publish distinct immutable snapshots but are not machine turns. Define separate
publication and machine-turn revision semantics, including which revision keys selector memoization,
hydration, checkpoints, and inspection correlation. Two observably different snapshots must never be
indistinguishable to subscribers or evidence tooling.

### BEH-008 — One ordered lifecycle evidence path

Suspend, resume, start, restore, and dispose evidence must share one globally ordered runtime evidence
path with ordinary `TurnRecord` facts rather than forming an unsequenced second history. Define the
exact lifecycle cause union, sequence allocation, sink ordering, overflow, drain, and failure behavior
while preserving the rule that attachment lifecycle is not a machine turn.

### BEH-009 — Suspended context dependencies

A context binding is fixed for a consumer's lifetime, so provider disposal must account for every
non-disposed consumer, including a suspended one. Suspension may release live subscriptions and work,
but it must preserve enough logical dependency state to prevent provider loss or else define an exact,
actionable resume failure. React cleanup ordering cannot make graph integrity depend on which Effect
cleans up first.

### BEH-010 — Serialized suspension and finite-operation normalization

Define one serialized lifecycle lane so resume waits for asynchronous suspension cleanup and live
generations never overlap. For finite resource work, queued and irreversible transactions, streams,
timers, pending outcomes, and context waves, state whether suspension continues, interrupts,
normalizes, or defers the work; hiding and revealing a React Activity must not manufacture a replay or
claim that an irreversible effect was undone. Cleanup failure must have one exact lifecycle outcome.

### BEH-011 — Prepared context and SSR

Resolve the conflict between context being installed before the first observable snapshot and a
prepared React actor exposing a snapshot before commit. Preparation must either install a passive
provisional provider cut that attachment validates atomically, or the contract must explicitly bound
which context-dependent local actors can render on the server. No preparation may acquire ownership,
subscribe, or start work.

### BEH-012 — Hook construction-tuple changes

Define behavior when `machine`, `input`, `contextBindings`, provider runtime, or shared ref changes
during one component incarnation. The accepted stable-local-actor rule should reject changes to the
construction tuple with a diagnostic directing the caller to use a keyed remount; lookup-only ref
replacement may follow its own non-owning subscription replacement rule.

### BEH-013 — Prepared command bounds and abandoned handles

Bound command buffering before first attachment and define overflow diagnostics. An abandoned
prepared handle that escaped impure render code must remain inert and must not accumulate an unbounded
mailbox, attach itself later, or create a runtime cleanup obligation.

### BEH-014 — Context selector defects

Define what happens when a provider has committed but a consumer context selector throws: retained
prior context, consumer issue/disposal, downstream wave behavior, retry, and dehydration readiness.
The rule must preserve a coherent consumer projection and may not retroactively claim that an already
published provider turn did not occur.

### BEH-015 — Reactive passive operation reads

Define how `useView(actor, selector)` stays reactive when snapshot-bound `O.getData(K)` or
`O.getState(K)` observes a shared entry changed by another actor. The solution must provide tear-free
actor/store reads and exact dependency replacement while keeping passive reads free of acquisition,
retention, freshness, and mutation effects.

### BEH-016 — Actor-handle lifecycle matrix

For every accepted actor-handle capability, define behavior in `prepared`, `active`, `suspended`, and
`disposed`: synchronous command admission, snapshot access, observation/subscription, replay, and
diagnostics. Disposal authority remains absent from ordinary handles and refs. Retain selector
exception memoization, keyed by the publication identity settled in BEH-007, and distinguish pure
`can(event)` transition legality from current command-admission capability.

## Stories, simulation, evidence, and cleanup

### BEH-017 — Story-local context graphs

Define how the accepted `story.actor` recipe represents the already accepted `contextBindings`
behavior when a provider is an app-owned ref or another Story-local actor. Plan preparation must
validate the recipe dependency graph, materialize providers before consumers, reject cycles and
missing slots, and clean up consumers before providers. This closes runtime behavior without adding
another Story constructor or target kind.

### BEH-018 — Focused-machine context mode

Specify the package-private focused compilation mode used by `story.machine`. Injected selected
context must enter the production context-turn coordinator, while the focused Story truthfully does
not prove provider selection, ActorRef resolution, app bootstrap, or the production context graph.

### BEH-019 — Controlled-operation interception

Define one production-kernel interception point for `simulate`. Only external execution is
controlled; admission, ownership, concurrency, canonical identity, status publication, completion
classification, writes, mapped outcomes, and evidence remain the same production paths used live.
Simulation proves Flow orchestration rather than the real service implementation.

### BEH-020 — Story occurrence identity

Allocate one-based occurrence identity when an actor-local operation occurrence is admitted. Scope it
by exact target actor, operation kind, descriptor, canonical `K`, and ordinal, never executable `P` or
plan-object identity. Preserve consumed occurrence truth across cancellation, supersession,
suspension, and hydration, and distinguish actor occurrences from a shared resource generation.

### BEH-021 — Checkpoint evidence cut and capture set

Define the production evidence barrier underlying checkpoints and `run.end`, including lock order,
actor registry leases, store revision, pending work, lifecycle evidence, and TestClock. Either deliver
the promised one-instant cut or explicitly weaken it to a revision-consistent closed cut. Also define
whether a checkpoint captures all live actors or the complete statically referenced target set; later
evidence lookup cannot discover an actor that was never captured.

### BEH-022 — Cleanup and end evidence

Retain cleanup-before-success, non-abortable finalization, deterministic aggregation of cleanup
failures, and exact `FlowStoryExecutionError` evidence. If commands complete and cleanup fails, the
error retains the captured `end` evidence even though no successful run is returned. Completed
checkpoints, primary Cause, cancellation evidence, sink drain, fixture cleanup, Story-local leases,
and runtime disposal must remain truthful.

## Operations and persistence

### BEH-023 — Exact operation state unions and read visibility

Define closed resource, transaction, and stream state unions using typed `K`, including public
generation, failure, defect, interruption, retained-value refresh failure, and collection behavior.
State whether an actor may read a shared entry it never materialized. Because stream runtime identity
includes a declaration slot while `getState(K)` does not, define duplicate-live-binding rejection or
another unambiguous behavioral law without adding a competing registry API.

### BEH-024 — Timer-owned finite actions

Apply the accepted finite-action macrostep to timer facts so polling, refetch, transaction, and cache
work can be admitted by timers. Define its pre-turn read, redirect stabilization, atomic validation,
same-time ordering, and failure behavior consistently with event-owned finite actions. This clarifies
the scope of the accepted `actions` capability rather than introducing a new operation API.

### BEH-025 — Finite occurrence lifetime and cancellation cardinality

Finite actions are actor-owned occurrences independent of later state membership. Define settlement,
supersession, suspension, disposal, bounded terminal retention, and how key-based cancel behaves when
several active or queued occurrences share a descriptor and `K`. If no individual occurrence handle
is added, cancellation must have one deterministic lane-wide meaning.

### BEH-026 — Atomic action-batch conflict algebra

After exact target expansion, define conflicts and ordering for repeated writes, write plus
invalidation, write plus clear, cancel plus refetch, and overlapping tag/family targets. Reject the
whole candidate batch before mutation when same-target intentions conflict; deduplicate only
semantically identical invalidations or clears. Completion-side transaction and stream callbacks must
materialize once and publish writes, overlays, status, and mapped events in one exact order.

### BEH-027 — Canonical-key ownership and encoding

Accept ordinary arrays and plain records as key input, validate them synchronously, copy them into
Flow-owned containers, and deeply freeze the canonical copy. Reject hostile or unsupported structure
rather than TypeScript-level mutability. Reuse one fully specified canonical encoding for equality,
persistence, diagnostics, and the 8 KiB bound; an unspecified “tagged” encoding is not an implementable
compatibility contract.

### BEH-028 — Equal-key binding refresh

When continuing reconciliation produces equal `K` with a new executable `P`, pin the current
generation's input and outcome mapping while defining which candidate input is retained for the next
generation. Stable acquisition order must survive hydration and cannot depend accidentally on current
map iteration order.

### BEH-029 — Tags, placeholders, overlays, and equal-value writes

Make tags and placeholders deterministic from canonical `K` so equal-key owners cannot disagree.
Define whether reads return base or overlay-effective values, which value an updater observes, how
transaction-owned overlays are removed, and whether an `Object.is`-equal authoritative write advances
freshness, store revision, value revision, or continuing value emissions.

### BEH-030 — Invalidation and clearing bounds

Resolve whether family targets apply to invalidation, clearing, or both, and give tag/family expansion
a fixed pre-mutation bound. Define missing-target and zero-match revision behavior plus interaction
with an active lookup. Whole-runtime clearing remains owned only by runtime disposal under the
accepted API.

### BEH-031 — Continuing-operation hydration input

Choose how an active stream obtains executable `P` after hydration even though `K` is not invertible.
Either preserve canonical restart input and reject non-durable active streams, or rerun continuing
declaration reconciliation after restored pending outcomes drain. Finite actions must never replay,
terminal streams must not restart, and selector/key mismatch behavior must be explicit.

### BEH-032 — Host seeding and trusted writes

Define boot, SSR, and fixture seeding through construction-owned descriptor-plus-key behavior before
actor activation, with deterministic duplicate handling and no operation occurrence. If trusted
post-start writes remain supported, they must use the same fencing, fanout, and evidence behavior as
machine authoritative writes. This must not revive generic runtime registries or an ordinary cache
clear escape hatch.

## Compatibility, artifacts, and removed capabilities

### BEH-033 — Artifact and CLI representation

Update the frozen behavior, trace, and CLI schemas to represent accepted app Stories, multi-actor
checkpoint lookup, `run.end`, module ownership, compound states, context requirements, lifecycle
records, and the new operation identities. Preserve byte-stable output, bounded decoding, atomic file
publication, partial failure evidence, and CLI/public-run parity.

### BEH-034 — Removed child capability

Record the behavioral consequence of child-machine deletion: compound states do not provide an
independent mailbox, memory, failure boundary, or lifetime, and machine behavior cannot secretly
retain a child-equivalent owner. Existing subordinate-workflow and behaviorally significant remote
lease examples must be rewritten using the accepted first-class actor ownership model or explicitly
declared unsupported. This item does not propose restoring a child API.

### BEH-035 — Explicit old-clause disposition

For every accepted revision, map affected `GLO`, `API`, `TYPE`, `SEM`, `SNAP`, `ARCH`, `WIRE`, `HOST`,
`TEST`, `CLI`, `CUT`, and `PROOF` clauses plus Phase 0 schemas, phase tasks, examples, and deletions to
`retain`, `rewrite`, or `delete`. Mixed clauses must preserve guarantees such as selector exception
memoization, fixture requirement closure, bounded clocks and models, cleanup truth, SSR/readiness, and
CLI discovery without retaining deleted roots, views, controls, children, or result fields.

## Closure rule

The accepted public API remains the baseline while these entries are open. Contract promotion may
close an entry only by recording one exact behavior, updating every affected old clause, and naming
its compile/runtime/Story/React/persistence/artifact proof. A proof failure reopens the corresponding
`BEH-*` behavior; it does not authorize an implementation agent to invent a new public surface.
