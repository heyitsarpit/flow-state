# Flow State vNext revision specification

Status: historical revision index; superseded for current requirements by Workflow records

Historical migration note: this index recorded the inherited `BEH-*` register as closed by its
accepted revisions. That does not establish current implementation or task readiness; Workflow does.

Current requirements, decisions, task status, and proof obligations live in `workflow/plans/` and
`workflow/tasks/`; current Specs are indexed by `workflow/spec.index`. This index, former contracts,
and original revision chapter references are historical provenance. Those chapter files are absent
from this checkout. They do not establish current rules, types, lifecycle, failures, examples, or
proof obligations. Resolve current gaps through the affected Workflow record or an explicit user
decision.

Under the former model, archived accepted rules had been merged into the contract files. Those
clauses described that historical baseline and are not current authority.

Under that former model, the transferred deletion ledger in
[`../contracts/COMPATIBILITY_AND_DELETIONS.md`](../contracts/COMPATIBILITY_AND_DELETIONS.md) owned
dispositions for surfaces removed or replaced by accepted
revisions. `NON_GOALS.md` recorded rejected
and deferred directions. They preserve history. Current deletion and compatibility decisions belong
in Workflow records.

Formerly, [`../contracts/ERRORS.ts`](../contracts/ERRORS.ts) owned the typed diagnostic contract and
its package-owned `Diagnostic` model. This preserves history; it does not establish current
diagnostic requirements.

[`../contracts/DEFERRED.md`](../contracts/DEFERRED.md) recorded implementation and proof guarantees
removed or relaxed under the former model. It preserves the historical public feature inventory and
does not establish future work or current requirements.

Historically, this specification did not reopen design work or add APIs, behavior, defaults,
exceptions, or proof obligations. Rejected, superseded, and deferred directions were recorded in
[`NON_GOALS.md`](./NON_GOALS.md). Current design decisions are owned by Workflow records.

The historical folder recommendation is in
[`recommendations/FOLDER_STRUCTURE.md`](./recommendations/FOLDER_STRUCTURE.md). It records
reference-application guidance, not a current runtime or package requirement.

## How to read this specification

Each accepted revision has one stable `REV-*` identifier and one owning topic document. Every revision
contains `Change`, `Rule`, and `Provenance`; it also records the following fields when the accepted
decision provides them:

- **Change:** whether the revision adds, replaces, removes, or clarifies old contract language.
- **Provenance:** a non-normative audit pointer to the material from which the complete local rule was
  ported. Opening that source MUST NOT be necessary to interpret the rule.
- **Supersedes:** the old contract clauses or working-spec passages that it overrides.
- **Deletion disposition:** the applicable `DEL-*` entry when the revision removes or replaces an old
  surface. A local clause MAY summarize the boundary, but the deletion ledger owns the exhaustive scope.
- **Rule:** the complete normative semantics using `MUST`, `MUST NOT`, and `SHOULD` consistently with the
  existing contract pack.
- **Example:** accepted or source-faithful client code. An example illustrates its named rule and creates
  no unnamed overload or exception.
- **Proof obligations:** only the tests, artifacts, or migration work already required by the accepted
  source.

Internal `REV-*` cross-references were used because their targets belong to this historical
specification.
Outside references preserve evidence and do not change current Workflow requirements.

[`TRACEABILITY.md`](./TRACEABILITY.md) is the optional historical audit ledger. It maps accepted source
spans to their complete local owners and records the independent completeness and no-invention audits.

## Core conceptual model

This vocabulary summarizes the accepted model so later chapters can use exact terms. The owning
`REV-*` clauses provide the full rules.

| Term                                | Meaning in this specification                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definition                          | The inert static shape for one actor family: durable machine identity, state and event schemas, input-to-memory initialization, required readonly context, and the closed named operation catalogue.                                                                                                                                                                                     |
| Machine                             | Reusable behavior compiled from one definition. It owns state configuration, handlers, guards, memory updates, redirects, timers, activities, and context-to-event registrations, but creates no actor by itself.                                                                                                                                                                        |
| Module                              | A tooling-only grouping with a unique app-local ID and an exact named machine record. Its ID groups CLI, trace, inspection, and artifact output but contributes to no runtime identity.                                                                                                                                                                                                  |
| App and `App.M`                     | The statically compiled application boundary and its flattened exact machine catalogue. `App.M` admits machine families and their complete operation requirements; app compilation creates no actors.                                                                                                                                                                                    |
| AppPlan                             | The closed compiled ownership and reachability plan used to validate machines, operation graphs, runtime requirements, and context-provider bindings before execution.                                                                                                                                                                                                                   |
| Actor                               | One live machine instance with its own ref, input-derived initial memory, state, inherited context, mailbox, operation ownership, and lifecycle. Several independent actors may use one machine.                                                                                                                                                                                         |
| `ActorRef`                          | Inert machine-branded actor identity. An authored stable ref identifies one durable shared actor; a generated opaque ref identifies one runtime-local actor and cannot be restored.                                                                                                                                                                                                      |
| Actor handle                        | Command and snapshot access to one exact actor. It exposes `actor.ref` but carries neither construction nor individual-disposal authority.                                                                                                                                                                                                                                               |
| Owner lease                         | The `{ actor, dispose }` capability returned by actor creation or shared ensure. Its asynchronous idempotent `dispose` is the only individual terminal-disposal authority.                                                                                                                                                                                                               |
| Input, memory, and context          | Input initializes a fresh actor's memory exactly once; memory is actor-local mutable domain state; context is a readonly projection from exact provider actors and may change through ordered context turns.                                                                                                                                                                             |
| Selector and selection change       | A selector is a pure synchronous projection from one atomic source snapshot; scalar and non-record results use complete-value `Object.is`, named record results use fixed-key field-by-field `Object.is`, and handlers receive current/previous selected values. Event/plan callbacks may return `false` or `null` for no output; those sentinels do not widen the selected value.       |
| Operation descriptor and family     | An inert resource, transaction, or stream declaration, and the exact named methods projected from it through the machine's `O` catalogue. Merely declaring or reading one starts no work.                                                                                                                                                                                                |
| `P` and `K`                         | `P` is immutable executable operation input retained by a live binding; `K` is the bounded canonical key projected from `P`. Shared operation identity is the descriptor plus canonical `K`.                                                                                                                                                                                             |
| Binding, generation, and occurrence | A binding is one actor-owned continuing declaration; a generation is one shared resource execution for a descriptor and `K`; an occurrence is one actor-owned admitted operation observation. Finite operations receive monotonic actor-incarnation ordinals; a continuing stream keeps its declaration occurrence, while shared generations and lease epochs identify shared execution. |
| Story plan and actor recipe         | A Story plan is immutable and inert until `run()`. A Story actor recipe describes one run-local actor by object identity and is materialized through the production runtime for each run.                                                                                                                                                                                                |
| Checkpoint and `run.end`            | Immutable Story evidence. A checkpoint captures one authored instant without progressing work; `run.end` is automatic final run evidence and does not imply actor completion.                                                                                                                                                                                                            |

## Revision catalogue

| Area                         | Revisions                                  | Former recorded disposition                                      |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Composition and app plans    | `REV-COMP-001`–`015`                       | Recorded as integrated into the former contract pack.            |
| Machine authoring            | `REV-MACH-001`–`011`                       | Recorded as integrated into the former contract pack.            |
| Operations                   | `REV-OPS-001`–`018`                        | Recorded as integrated into the former contract pack.            |
| React and hosts              | `REV-HOST-001`–`008`                       | Recorded as integrated into the former contract pack.            |
| Stories and testing          | `REV-TEST-001`–`010`                       | Recorded as integrated into the former contract pack.            |
| Migration and proofs         | `REV-MIG-001`–`006`                        | Recorded as integrated into the former contract pack.            |
| Deletions and cutover        | `REV-MIG-004`, `DEL-001`–`011`, `RET-001`–`005` | Recorded in `COMPATIBILITY_AND_DELETIONS.md`.                  |

The former unresolved-behavior register is [`UNRESOLVED_BEHAVIOR.md`](./UNRESOLVED_BEHAVIOR.md). It
recorded internal semantics beneath the accepted public surface. The compound-node configuration
shape, complete Story constructor options, and Story-local context graph were recorded as accepted
under `REV-MACH-003`, `REV-TEST-001`, and `REV-TEST-003`, and considered no longer blockers then.
The register does not establish current blockers or answers; current questions belong in the
affected Workflow record.

## Complete historical revision index

### Composition and app plans

- `REV-COMP-001` adds inherited readonly context declarations.
- `REV-COMP-002` defines atomic ordered context selection and propagation.
- `REV-COMP-003` establishes silent context bootstrap and typed `onContext` events.
- `REV-COMP-004` binds consumers to exact provider refs for their complete lifetime.
- `REV-COMP-005` requires context-closed dehydration and derived-context restoration.
- `REV-COMP-006` preserves named module machine records in flattened `App.M`.
- `REV-COMP-007` makes `App.M` the closed machine and operation-admission universe.
- `REV-COMP-008` limits module IDs to tooling identity.
- `REV-COMP-009` makes definition input initialize fresh memory exactly once.
- `REV-COMP-010` separates static shape, behavior, app ownership, runtime services, and Story fixtures.
- `REV-COMP-011` gives every actor one exact machine-branded stable or opaque `ActorRef`.
- `REV-COMP-012` separates shared ensure, exact lookup, and fresh local creation authority.
- `REV-COMP-013` moves individual disposal authority into explicit idempotent owner leases.
- `REV-COMP-014` tombstones a disposed stable ref for one runtime incarnation.
- `REV-COMP-015` seals the initial bootstrap actor and context graph before activation or handle escape.

### Machine authoring

- `REV-MACH-001` removes child machines and assigns hierarchy to substates in one actor.
- `REV-MACH-002` adds recursive named compound-state declarations and exact tokens.
- `REV-MACH-003` recursively mirrors the definition tree in exact machine configuration records and
  replaces root `initial` with required root and compound `default` entry.
- `REV-MACH-004` compiles compound handlers into one unambiguous machine-wide protocol.
- `REV-MACH-005` exposes one exact active leaf plus ancestor matching.
- `REV-MACH-006` fixes the shared runtime and type-system nesting bound at ten levels.
- `REV-MACH-007` defines compound activity lifetime and parent/child ordering.
- `REV-MACH-008` preserves compound timers across descendant transitions.
- `REV-MACH-009` includes compound redirects in outer-to-inner stabilization.
- `REV-MACH-010` removes final-node actor-completion semantics.
- `REV-MACH-011` replaces Boolean reentry with one exact active restart boundary.

### Operations

- `REV-OPS-001` replaces generic registries with one closed named `O` catalogue.
- `REV-OPS-002` separates executable input `P` from bounded canonical identity `K`.
- `REV-OPS-003` pins one executable input for each shared resource generation.
- `REV-OPS-004` places one shared resource store inside each Flow runtime.
- `REV-OPS-005` fixes the exact resource, transaction, and stream family methods.
- `REV-OPS-006` admits finite plans through transition actions and continuing plans through activities.
- `REV-OPS-007` defines pre-turn action planning and atomic event admission.
- `REV-OPS-008` reconciles state-scoped memory-derived continuing work independently.
- `REV-OPS-009` separates selector suppression from normalized operation retention.
- `REV-OPS-010` fences older generations after authoritative resource writes.
- `REV-OPS-011` limits cancellation to the calling actor's finite occurrence.
- `REV-OPS-012` makes invalidation and clearing scoped, validated, and atomic.
- `REV-OPS-013` uses keyed finite transaction commits and explicit resource mappings.
- `REV-OPS-014` keeps streams continuing and explicitly mapped; `REV-OPS-015` amends stream status to retain
  the latest projection and defines runtime-owned reactivity, previews, fanout, and hydration.
- `REV-OPS-016` defines Flow-owned canonical key containers, deterministic UTF-8 bytes, discriminator
  ownership, hostile-reflection rejection, and exact canonical-key bounds.
- `REV-OPS-017` fixes the exact resource, transaction, and stream state unions, passive cross-actor reads,
  retained values, post-boundary transaction truth, and duplicate-live-stream rejection.
- `REV-OPS-018` fixes bounded invalidation and clear expansion, stable deduplication, no-op targets, and
  active-work interaction without adding a cache-wide escape hatch.

### React and hosts

- `REV-HOST-001` separates fresh local creation, shared lookup, and reactive observation.
- `REV-HOST-002` prepares one final actor during render and attaches that same actor during commit.
- `REV-HOST-003` defines the truthful `prepared | active | suspended | disposed` lifecycle.
- `REV-HOST-004` publishes coherent lifecycle snapshots before ordered inspection evidence.
- `REV-HOST-005` releases live resources during suspension while preserving actor continuity.
- `REV-HOST-006` removes registered views and constrains `useView` to exact passive projections.
- `REV-HOST-007` makes passive operation reads dependency-reactive through internal runtime leases and
  projection-only actor publications.
- `REV-HOST-008` makes boot/SSR/fixture seeding construction-owned and limits post-start trusted writes to
  a package-private capability-scoped lease.

### Stories and testing

- `REV-TEST-001` splits Story construction into app, machine, and actor recipes with closed conditional
  option objects.
- `REV-TEST-002` keeps Story plans immutable and inert until `run()`.
- `REV-TEST-003` binds Story-local context to exact recipes or refs and materializes the validated recipe
  graph in dependency order per run.
- `REV-TEST-004` targets app commands at one recipe or stable actor ref.
- `REV-TEST-005` keeps a machine Story focused on one production-created actor.
- `REV-TEST-006` closes the command surface around explicit processing and virtual time.
- `REV-TEST-007` simulates exact admitted operation occurrences through production completion.
- `REV-TEST-008` captures atomic checkpoint and `run.end` evidence.
- `REV-TEST-009` limits pure model discovery to command-empty fresh machine plans.
- `REV-TEST-010` requires live hosts and Stories to share one production runtime implementation.

### Migration and proofs

- `REV-MIG-001` keeps accepted public decisions closed while behavioral gaps are resolved.
- `REV-MIG-002` migrates contracts, public surfaces, artifacts, and proofs as one replacement.
- `REV-MIG-003` proves the accepted surface through production owners rather than testing substitutes.
- `REV-MIG-004` makes old-surface deletion and replacement explicit and requires absence proofs before
  cutover.
- `REV-MIG-005` freezes one package-private v2 artifact, trace, serialized CauseProjection, Story failure,
  and CLI model authority while retaining public raw Cause on declared Flow error boundaries.
- `REV-MIG-006` removes subordinate-machine capability and requires explicit actors for independent
  workflows.

## Canonical surface examples

The owning clauses define the complete semantics. These source-faithful examples are independent;
undeclared symbols represent definitions, refs, fixtures, and runtimes specified by their owning clauses.
They create no additional overloads.

```ts
const Editor = definition({
  id: "Editor",
  states: ["EDITING", "READ_ONLY", "SIGNED_OUT"],
  events: {
    SessionEnded: null,
  },
  context: {
    sessionState: Session.select(({ state }) => state),
    themeMode: Theme.select(({ memory }) => memory.mode),
  },
  memory: () => ({
    draft: "",
  }),
});

const editorMachine = machine(Editor, ({ S, E, onContext }) => {
  onContext.select(
    ({ context }) => context.sessionState,
    (current) => current === Session.S.SIGNED_OUT && E.SessionEnded(),
  );

  return {
    default: S.EDITING,
    states: {
      EDITING: {
        on: {
          SessionEnded: S.SIGNED_OUT,
        },
      },
      READ_ONLY: {},
      SIGNED_OUT: {},
    },
  };
});
```

```ts
const sharedRef = actorRef(editorMachine, "primary-editor");
const sharedLease = runtime.ensureActor(sharedRef, {
  contextBindings: {
    sessionState: PrimarySessionRef,
    themeMode: PrimaryThemeRef,
  },
});

const localLease = runtime.createActor(editorMachine, {
  contextBindings: {
    sessionState: PrimarySessionRef,
    themeMode: PrimaryThemeRef,
  },
});

const existing = runtime.getActor(sharedRef);
await localLease.dispose();
```

```tsx
const actor = useActor(editorMachine, {
  contextBindings: {
    sessionState: PrimarySessionRef,
    themeMode: PrimaryThemeRef,
  },
});

const model = useView(actor, ({ state, memory, can }) => ({
  state,
  draft: memory.draft,
  canSignOut: can(Editor.E.SessionEnded()),
}));
```

```ts
const plan = story
  .machine(editorMachine, {
    context: {
      sessionState: Session.S.ACTIVE,
      themeMode: "dark",
    },
    fixtures: [editorFixture],
    maxTurns: 100,
  })
  .setContext({
    sessionState: Session.S.SIGNED_OUT,
    themeMode: "dark",
  })
  .process()
  .checkpoint("signed-out");

const run = await plan.run();

run.checkpoints["signed-out"].snapshot;
run.end.runtime.pendingWork;
```

## Former authority and conflict rules (historical)

The following rules describe the former conflict model. Handle current conflicts and unresolved
requirements through the affected Workflow record or an explicit user decision.

1. A rule in this specification overrode an old contract only when its `Supersedes` field named that
   clause or the conflict was direct and unavoidable.
2. Untouched old contract clauses remained normative under that former model; silence here was not
   deletion.
3. `NON_GOALS.md`, rationale, source notes, and examples did not override the then-normative rules.
4. If two `REV-*` rules conflicted, implementation stopped until the historical specification was
   reconciled.
5. If this specification could not trace a semantic statement to accepted source material, the
   statement was to be removed or returned to design review.

## Historical provenance boundary

The optional traceability ledger records passages from the former revision ledger and operations
drafts,
behavior-gap inventory, and old contracts that informed this specification. Those files preserve
provenance only. Under the former model, implementation text found only in a historical source meant
this specification was incomplete and had to be repaired before work continued.
