# Unresolved behavioral closure work

Status: non-normative blocker register

This register contains the unresolved remainder of the inherited `BEH-001` through `BEH-034` problem
inventory. The former old-clause disposition item is closed by `REV-MIG-004`; it is no longer an open
behavior gap. This register makes the revision specification self-contained without accepting an answer to
any remaining open gap. Most entries are behavior problems under the accepted public surface, not public
API redesign proposals. `BEH-027` is the remaining explicit exception that requires design review before
the accepted surface or rule can change.

Every entry below remains unresolved until an exact behavior is explicitly accepted, the affected old
contract clauses are updated, and the required compile, runtime, Story, React, persistence, or artifact
proofs are named. The accepted closures below are the exception: their owning `REV-*` clauses now supply
the behavior and supersede the corresponding problem statement. Separate historical solution and
disposition drafts remain non-normative proposals: neither supplies, accepts, or closes an answer in this
register.

## Accepted closures

The following entries are closed by the 2026-08-18 runtime-reactivity amendment. Their original problem
statements remain below as historical provenance; they no longer authorize an implementation choice.

| Entry     | Closure                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `BEH-015` | `REV-HOST-007` — internal dependency tracking, tear-free passive reads, replacement, and projection-only reruns |
| `BEH-024` | `REV-OPS-015` — timers remain event-targeting only; polling uses `after` plus an explicit refresh event         |
| `BEH-025` | `REV-OPS-015` — occurrence terminality, cancellation, supersession, disposal, and bounded public retention      |
| `BEH-026` | `REV-OPS-015` — preview, completion, conflict, and mapped-event ordering                                        |
| `BEH-028` | `REV-OPS-015` — equal-key input pinning and deterministic post-hydration selection                              |
| `BEH-029` | `REV-OPS-015` — actor-scoped overlays, base/effective reads, promotion, rollback, and equal-write behavior      |
| `BEH-031` | `REV-OPS-015` — post-hydration continuing declaration rematerialization without emission replay                 |

Closing an entry may add an internal owner, record type, ordering law, diagnostic, persistence rule, or
proof, but it MUST NOT silently rename, replace, overload, or add a competing public API. If an accepted
behavioral guarantee cannot be implemented through the accepted surface, that conflict MUST return to
explicit design review rather than being disguised as contract migration.

## Composition and runtime

### BEH-001 — Runtime factory lifecycle

**Problem and required closure:** Define the behavior of the already accepted `RuntimeFactory<App>`
across live hosts and `story.app`: app identity discovery, Clock and external-capability injection, boot
installation, Layer acquisition, initial `ensureActor` ownership, readiness, failure, cancellation, and
scoped disposal. No runtime or actor handle may expose a partially validated bootstrap graph, and
discovery must remain inert. This does not reopen the accepted `story.app(runtimeFactory, options?)` or
`FlowProvider` surfaces.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:25-31`.

### BEH-002 — Post-bootstrap actor admission

**Problem and required closure:** Separate sealed static `AppPlan` admission from the runtime
actor-instance graph. Later `createActor` and `ensureActor` calls must use one atomic admission transaction
that validates the machine, resolves every context provider, rejects instance cycles and disposed refs,
installs the silent baseline and logical edges, activates the actor, and only then exposes its handle.
“Graph sealed” must not imply that accepted runtime creation calls are impossible after bootstrap.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:33-39`.

### BEH-003 — `ensureActor` ownership authority

**Problem and required closure:** Make “owner-only” enforceable without changing the accepted
`ensureActor`/`getActor` split. A caller must not gain terminal disposal authority merely by replacing a
lookup with an ensure. The contract must identify who may ensure, what concurrent ensures own, whether
their disposal authority is shared or scoped, and how boot-restored ownership is reconciled.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:41-46`.

### BEH-004 — Durable actor capture membership

**Problem and required closure:** Replace the deleted automatic-root capture law. Define exactly which
stable actors dehydration includes, how suspended stable actors and runtime-local tombstones are treated,
who owns a restored actor that the current factory does not ensure, and which transitive context
dependencies join the capture. Opaque actors that affect included persistent state must retain fail-closed
behavior.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:48-53`.

### BEH-005 — Stable and opaque ref encoding

**Problem and required closure:** Define the stable-ID grammar, length bounds, equality, composite
encoding, serialized machine lookup, and opaque-ref generation for the accepted `ActorRef` behavior.
Durable restoration resolves authored machine identity through the current `App.M`; it cannot depend on
JavaScript object identity. Equal stable IDs under different machine identities remain distinct.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:55-60`.

### BEH-006 — Module tooling ownership

**Problem and required closure:** Give every admitted machine family exactly one module tooling owner per
app. The compiler must reject the same machine value appearing under several module keys or modules when
that would make trace, artifact, CLI, or diff attribution ambiguous. Moving a machine between modules is
artifact-breaking but remains runtime- and persistence-compatible under the accepted identity split.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:62-67`.

## React and hosts

### BEH-007 — Lifecycle publication revisions

**Problem and required closure:** Lifecycle changes publish distinct immutable snapshots but are not
machine turns. Define separate publication and machine-turn revision semantics, including which revision
keys selector memoization, hydration, checkpoints, and inspection correlation. Two observably different
snapshots must never be indistinguishable to subscribers or evidence tooling.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:71-76`.

### BEH-008 — One ordered lifecycle evidence path

**Problem and required closure:** Suspend, resume, start, restore, and dispose evidence must share one
globally ordered runtime evidence path with ordinary `TurnRecord` facts rather than forming an unsequenced
second history. Define the exact lifecycle cause union, sequence allocation, sink ordering, overflow,
drain, and failure behavior while preserving the rule that attachment lifecycle is not a machine turn.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:78-83`.

### BEH-009 — Suspended context dependencies

**Problem and required closure:** A context binding is fixed for a consumer's lifetime, so provider
disposal must account for every non-disposed consumer, including a suspended one. Suspension may release
live subscriptions and work, but it must preserve enough logical dependency state to prevent provider
loss or else define an exact, actionable resume failure. React cleanup ordering cannot make graph
integrity depend on which Effect cleans up first.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:85-91`.

### BEH-010 — Serialized suspension and finite-operation normalization

**Problem and required closure:** Define one serialized lifecycle lane so resume waits for asynchronous
suspension cleanup and live generations never overlap. For finite resource work, queued and irreversible
transactions, streams, timers, pending outcomes, and context waves, state whether suspension continues,
interrupts, normalizes, or defers the work; hiding and revealing a React Activity must not manufacture a
replay or claim that an irreversible effect was undone. Cleanup failure must have one exact lifecycle
outcome.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:93-99`.

### BEH-011 — Prepared context and SSR

**Problem and required closure:** Resolve the conflict between context being installed before the first
observable snapshot and a prepared React actor exposing a snapshot before commit. Preparation must either
install a passive provisional provider cut that attachment validates atomically, or the contract must
explicitly bound which context-dependent local actors can render on the server. No preparation may
acquire ownership, subscribe, or start work.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:101-107`.

### BEH-012 — Hook construction-tuple changes

**Problem and required closure:** Define behavior when `machine`, `input`, `contextBindings`, provider
runtime, or shared ref changes during one component incarnation. The accepted stable-local-actor rule
should reject changes to the construction tuple with a diagnostic directing the caller to use a keyed
remount; lookup-only ref replacement may follow its own non-owning subscription replacement rule.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:109-114`.

### BEH-013 — Prepared command bounds and abandoned handles

**Problem and required closure:** Bound command buffering before first attachment and define overflow
diagnostics. An abandoned prepared handle that escaped impure render code must remain inert and must not
accumulate an unbounded mailbox, attach itself later, or create a runtime cleanup obligation.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:116-120`.

### BEH-014 — Context selector defects

**Problem and required closure:** Define what happens when a provider has committed but a consumer
context selector throws: retained prior context, consumer issue/disposal, downstream wave behavior,
retry, and dehydration readiness. The rule must preserve a coherent consumer projection and may not
retroactively claim that an already published provider turn did not occur.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:122-127`.

### BEH-015 — Reactive passive operation reads [closed by REV-HOST-007]

**Problem and required closure:** Define how `useView(actor, selector)` stays reactive when snapshot-bound
`O.getData(K)` or `O.getState(K)` observes a shared entry changed by another actor. The solution must
provide tear-free actor/store reads and exact dependency replacement while keeping passive reads free of
acquisition, retention, freshness, and mutation effects.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:129-134`.

### BEH-016 — Actor-handle lifecycle matrix

**Problem and required closure:** For every accepted actor-handle capability, define behavior in
`prepared`, `active`, `suspended`, and `disposed`: synchronous command admission, snapshot access,
observation/subscription, replay, and diagnostics. Disposal authority remains absent from ordinary handles
and refs. Retain selector exception memoization, keyed by the publication identity settled in BEH-007,
and distinguish pure `can(event)` transition legality from current command-admission capability.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:136-142`.

## Story and testing

### BEH-018 — Focused-machine context mode

**Problem and required closure:** Specify the package-private focused compilation mode used by
`story.machine`. Injected selected context must enter the production context-turn coordinator, while the
focused Story truthfully does not prove provider selection, ActorRef resolution, app bootstrap, or the
production context graph.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:154-158`.

### BEH-019 — Controlled-operation interception

**Problem and required closure:** Define one production-kernel interception point for `simulate`. Only
external execution is controlled; admission, ownership, concurrency, canonical identity, status
publication, completion classification, writes, mapped outcomes, and evidence remain the same production
paths used live. Simulation proves Flow orchestration rather than the real service implementation.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:160-165`.

### BEH-020 — Story occurrence identity

**Problem and required closure:** Allocate one-based occurrence identity when an actor-local operation
occurrence is admitted. Scope it by exact target actor, operation kind, descriptor, canonical `K`, and
ordinal, never executable `P` or plan-object identity. Preserve consumed occurrence truth across
cancellation, supersession, suspension, and hydration, and distinguish actor occurrences from a shared
resource generation.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:167-172`.

### BEH-021 — Checkpoint evidence cut and capture set

**Problem and required closure:** Define the production evidence barrier underlying checkpoints and
`run.end`, including lock order, actor registry leases, store revision, pending work, lifecycle evidence,
and TestClock. Either deliver the promised one-instant cut or explicitly weaken it to a
revision-consistent closed cut. Also define whether a checkpoint captures all live actors or the complete
statically referenced target set; later evidence lookup cannot discover an actor that was never captured.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:174-180`.

### BEH-022 — Cleanup and end evidence

**Problem and required closure:** Retain cleanup-before-success, non-abortable finalization, deterministic
aggregation of cleanup failures, and exact `FlowStoryExecutionError` evidence. If commands complete and
cleanup fails, the error retains the captured `end` evidence even though no successful run is returned.
Completed checkpoints, primary Cause, cancellation evidence, sink drain, fixture cleanup, Story-local
leases, and runtime disposal must remain truthful.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:182-188`.

## Operations and persistence

### BEH-023 — Exact operation state unions and read visibility

**Problem and required closure:** Define closed resource, transaction, and stream state unions using
typed `K`, including public generation, failure, defect, interruption, retained-value refresh failure,
and collection behavior. State whether an actor may read a shared entry it never materialized. Because
stream runtime identity includes a declaration slot while `getState(K)` does not, define
duplicate-live-binding rejection or another unambiguous behavioral law without adding a competing
registry API.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:192-198`.

### BEH-024 — Timer-owned finite actions [closed by REV-OPS-015]

**Problem and required closure:** The accepted surface adds `actions` only to event handlers, while this
gap asks timer facts to admit finite operation plans. That is an authority conflict, not a purely internal
closure task: adding timer `actions` or another timer-admission surface requires explicit design review.
Until then, implementation MUST NOT infer that the accepted event-action grammar applies to timers. If the
surface is later accepted, its pre-turn read, redirect stabilization, atomic validation, same-time ordering,
and failure behavior must be reconciled with the event macrostep.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:200-205`.

### BEH-025 — Finite occurrence lifetime and cancellation cardinality [closed by REV-OPS-015]

**Problem and required closure:** Finite actions are actor-owned occurrences independent of later state
membership. Define settlement, supersession, suspension, disposal, bounded terminal retention, and how
key-based cancel behaves when several active or queued occurrences share a descriptor and `K`. If no
individual occurrence handle is added, cancellation must have one deterministic lane-wide meaning.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:207-212`.

### BEH-026 — Atomic action-batch conflict algebra [closed by REV-OPS-015]

**Problem and required closure:** After exact target expansion, define conflicts and ordering for repeated
writes, write plus invalidation, write plus clear, cancel plus refetch, and overlapping tag/family targets.
Reject the whole candidate batch before mutation when same-target intentions conflict; deduplicate only
semantically identical invalidations or clears. Completion-side transaction and stream callbacks must
materialize once and publish writes, overlays, status, and mapped events in one exact order.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:214-220`.

### BEH-027 — Canonical-key ownership and encoding

**Problem and required closure:** The accepted revision says mutable structures reject, while the gap
proposes accepting ordinary arrays and plain records by copying them into Flow-owned immutable containers.
That conflict requires explicit design review and this register selects neither interpretation. The final
rule must still validate synchronously, reject hostile or unsupported structure, and specify one canonical
encoding used for equality, persistence, diagnostics, and the 8 KiB bound; an unspecified “tagged” encoding
is not an implementable compatibility contract.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:222-228`.

### BEH-028 — Equal-key binding refresh [closed by REV-OPS-015]

**Problem and required closure:** When continuing reconciliation produces equal `K` with a new executable
`P`, pin the current generation's input and outcome mapping while defining which candidate input is
retained for the next generation. Stable acquisition order must survive hydration and cannot depend
accidentally on current map iteration order.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:230-235`.

### BEH-029 — Tags, placeholders, overlays, and equal-value writes [closed by REV-OPS-015]

**Problem and required closure:** Make tags and placeholders deterministic from canonical `K` so
equal-key owners cannot disagree. Define whether reads return base or overlay-effective values, which
value an updater observes, how transaction-owned overlays are removed, and whether an `Object.is`-equal
authoritative write advances freshness, store revision, value revision, or continuing value emissions.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:237-242`.

### BEH-030 — Invalidation and clearing bounds

**Problem and required closure:** The accepted revision already applies admitted-family targets to both
invalidation and clearing. The remaining gap is to give tag/family expansion a fixed pre-mutation bound and
define missing-target and zero-match revision behavior plus interaction with an active lookup. Whole-runtime
clearing remains owned only by runtime disposal under the accepted API.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:244-249`, corrected by the accepted authority at
`DESIGN_REVISIONS.md:447-451` and `DESIGN_REVISIONS.md:1459-1465`.

### BEH-031 — Continuing-operation hydration input [closed by REV-OPS-015]

**Problem and required closure:** Choose how an active stream obtains executable `P` after hydration even
though `K` is not invertible. Either preserve canonical restart input and reject non-durable active
streams, or rerun continuing declaration reconciliation after restored pending outcomes drain. Finite
actions must never replay, terminal streams must not restart, and selector/key mismatch behavior must be
explicit.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:251-256`.

### BEH-032 — Host seeding and trusted writes

**Problem and required closure:** Define boot, SSR, and fixture seeding through construction-owned
descriptor-plus-key behavior before actor activation, with deterministic duplicate handling and no
operation occurrence. Trusted post-start writes are already accepted; the remaining gap is their exact
host owner, surface, authority, and evidence behavior while preserving the same fencing and fanout as
machine authoritative writes. This must not revive generic runtime registries or an ordinary cache clear
escape hatch.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:258-264`.

## Artifacts and migration

### BEH-033 — Artifact and CLI representation

**Problem and required closure:** Update the frozen behavior, trace, and CLI schemas to represent accepted
app Stories, multi-actor checkpoint lookup, `run.end`, module ownership, compound states, context
requirements, lifecycle records, and the new operation identities. Preserve byte-stable output, bounded
decoding, atomic file publication, partial failure evidence, and CLI/public-run parity.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:268-273`.

### BEH-034 — Removed child capability

**Problem and required closure:** Record the behavioral consequence of child-machine deletion: compound
states do not provide an independent mailbox, memory, failure boundary, or lifetime, and machine behavior
cannot secretly retain a child-equivalent owner. Existing subordinate-workflow and behaviorally
significant remote lease examples must be rewritten using the accepted first-class actor ownership model
or explicitly declared unsupported. This item does not propose restoring a child API.

**Provenance:** `DESIGN_BEHAVIOR_GAPS.md:275-281`.

## Closure rule

The accepted public API remains the baseline while these entries are open. Contract promotion may close
an entry only by recording one exact behavior, updating every affected old clause, and naming its compile,
runtime, Story, React, persistence, or artifact proof. A proof failure reopens the corresponding `BEH-*`
behavior; it does not authorize an implementation agent to invent a new public surface.
