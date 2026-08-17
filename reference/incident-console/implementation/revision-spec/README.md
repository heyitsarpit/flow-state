# Flow State vNext revision specification

Status: normative revision authority

Migration readiness: blocked until the applicable entries in `UNRESOLVED_BEHAVIOR.md` are explicitly
resolved.

This folder is the self-contained formal replacement for the accepted revision ledger. A reader MUST be
able to understand every accepted change and every known unresolved boundary using this folder alone.
Historical files are provenance only: no normative rule, type shape, lifecycle, failure, example, or
proof obligation is defined by following a link outside this folder. When the accepted material did not
finish an implementable shape, this folder records that omission explicitly instead of inventing it.

An accepted rule here overrides every conflicting clause in the existing implementation contracts.
Contract clauses that this specification does not change remain authoritative.

The deletion ledger in [`accepted/07-deletions-and-cutover.md`](./accepted/07-deletions-and-cutover.md) is
the normative owner for every old surface that this revision removes or replaces. `NON_GOALS.md` records
rejected and deferred directions but does not classify old clauses. An accepted clause MUST NOT leave an
affected old surface without a disposition; it MUST defer to the applicable `DEL-*` entry.

This specification does not reopen design work. It may restate, organize, and connect already accepted
decisions, but it must not add a public API, behavior, default, exception, or proof obligation that the
source material did not decide. Rejected, superseded, and deliberately deferred directions are recorded
separately in [`NON_GOALS.md`](./NON_GOALS.md) and have no normative force.

The non-normative folder organization recommendation is maintained separately in
[`recommendations/FOLDER_STRUCTURE.md`](./recommendations/FOLDER_STRUCTURE.md). It is guidance for
reference applications and MUST NOT be read as a new accepted runtime or package contract.

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

Internal `REV-*` cross-references are allowed because their target is part of this specification. A
reference to anything outside this folder is evidence only and MUST NOT complete, qualify, or change a
normative statement.

[`TRACEABILITY.md`](./TRACEABILITY.md) is the optional historical audit ledger. It maps accepted source
spans to their complete local owners and records the independent completeness and no-invention audits.

## Core conceptual model

This vocabulary summarizes the accepted model so later chapters can use exact terms. The owning
`REV-*` clauses provide the full rules.

| Term                                | Meaning in this specification                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definition                          | The inert static shape for one actor family: durable machine identity, state and event schemas, input-to-memory initialization, required readonly context, and the closed named operation catalogue.                                                                                                                                                                               |
| Machine                             | Reusable behavior compiled from one definition. It owns state configuration, handlers, guards, memory updates, redirects, timers, activities, and context-to-event registrations, but creates no actor by itself.                                                                                                                                                                  |
| Module                              | A tooling-only grouping with a unique app-local ID and an exact named machine record. Its ID groups CLI, trace, inspection, and artifact output but contributes to no runtime identity.                                                                                                                                                                                            |
| App and `App.M`                     | The statically compiled application boundary and its flattened exact machine catalogue. `App.M` admits machine families and their complete operation requirements; app compilation creates no actors.                                                                                                                                                                              |
| AppPlan                             | The closed compiled ownership and reachability plan used to validate machines, operation graphs, runtime requirements, and context-provider bindings before execution.                                                                                                                                                                                                             |
| Actor                               | One live machine instance with its own ref, input-derived initial memory, state, inherited context, mailbox, operation ownership, and lifecycle. Several independent actors may use one machine.                                                                                                                                                                                   |
| `ActorRef`                          | Inert machine-branded actor identity. An authored stable ref identifies one durable shared actor; a generated opaque ref identifies one runtime-local actor and cannot be restored.                                                                                                                                                                                                |
| Actor handle                        | Command and snapshot access to one exact actor. It exposes `actor.ref` but carries neither construction nor individual-disposal authority.                                                                                                                                                                                                                                         |
| Owner lease                         | The `{ actor, dispose }` capability returned by actor creation or shared ensure. Its asynchronous idempotent `dispose` is the only individual terminal-disposal authority.                                                                                                                                                                                                         |
| Input, memory, and context          | Input initializes a fresh actor's memory exactly once; memory is actor-local mutable domain state; context is a readonly projection from exact provider actors and may change through ordered context turns.                                                                                                                                                                       |
| Selector and selection change       | A selector is a pure synchronous projection from one atomic source snapshot; scalar and non-record results use complete-value `Object.is`, named record results use fixed-key field-by-field `Object.is`, and handlers receive current/previous selected values. Event/plan callbacks may return `false` or `null` for no output; those sentinels do not widen the selected value. |
| Operation descriptor and family     | An inert resource, transaction, or stream declaration, and the exact named methods projected from it through the machine's `O` catalogue. Merely declaring or reading one starts no work.                                                                                                                                                                                          |
| `P` and `K`                         | `P` is immutable executable operation input retained by a live binding; `K` is the bounded canonical key projected from `P`. Shared operation identity is the descriptor plus canonical `K`.                                                                                                                                                                                       |
| Binding, generation, and occurrence | A binding is one actor-owned continuing declaration; a generation is one shared resource execution for a descriptor and `K`; an occurrence is one actor-owned finite admitted operation.                                                                                                                                                                                           |
| Story plan and actor recipe         | A Story plan is immutable and inert until `run()`. A Story actor recipe describes one run-local actor by object identity and is materialized through the production runtime for each run.                                                                                                                                                                                          |
| Checkpoint and `run.end`            | Immutable Story evidence. A checkpoint captures one authored instant without progressing work; `run.end` is automatic final run evidence and does not imply actor completion.                                                                                                                                                                                                      |

## Revision catalogue

| Area                                                                    | Revisions                                       | Contract effect                                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Composition and app plans](./accepted/01-composition-and-app-plans.md) | `REV-COMP-001`–`015`                            | Definition dependencies, reactive context, modules, apps, actor admission, identity, and construction    |
| [Machine authoring](./accepted/02-machine-authoring.md)                 | `REV-MACH-001`–`011`                            | Definition grammar, compound states, transitions, timers, redirects, and reentry                         |
| [Operations](./accepted/03-operations.md)                               | `REV-OPS-001`–`014`                             | Operation families, canonical identity, finite actions, continuing work, selection, and cache semantics  |
| [React and hosts](./accepted/04-react-and-hosts.md)                     | `REV-HOST-001`–`006`                            | React attachment ownership, focused reads, render safety, suspension, resumption, and host behavior      |
| [Stories and testing](./accepted/05-stories-and-testing.md)             | `REV-TEST-001`–`010`                            | Story constructors, commands, controlled operations, processing, time, checkpoints, evidence, and models |
| [Migration and proofs](./accepted/06-migration-and-proofs.md)           | `REV-MIG-001`–`003`                             | Required contract rewrites, compatibility effects, artifact work, and executable proof obligations       |
| [Deletions and cutover](./accepted/07-deletions-and-cutover.md)         | `REV-MIG-004`, `DEL-001`–`011`, `RET-001`–`005` | Exhaustive old-surface dispositions, no-residue rules, retained boundaries, and absence proofs           |

Unresolved behavior is indexed separately in
[`UNRESOLVED_BEHAVIOR.md`](./UNRESOLVED_BEHAVIOR.md). Most entries close internal semantics beneath the
accepted public surface. `BEH-024` and `BEH-027` record source-authority conflicts that require explicit
design review. The compound-node configuration shape, complete Story constructor options, and Story-local
context graph were accepted during formalization and are now owned by `REV-MACH-003`, `REV-TEST-001`, and
`REV-TEST-003`; they are no longer blockers. No remaining open entry acquires a normative answer from the
proposal files.

## Complete revision index

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
- `REV-OPS-014` keeps streams continuing, explicitly mapped, and free of retained latest values.

### React and hosts

- `REV-HOST-001` separates fresh local creation, shared lookup, and reactive observation.
- `REV-HOST-002` prepares one final actor during render and attaches that same actor during commit.
- `REV-HOST-003` defines the truthful `prepared | active | suspended | disposed` lifecycle.
- `REV-HOST-004` publishes coherent lifecycle snapshots before ordered inspection evidence.
- `REV-HOST-005` releases live resources during suspension while preserving actor continuity.
- `REV-HOST-006` removes registered views and constrains `useView` to exact passive projections.

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

## Authority and conflict rules

1. A rule in this specification overrides an old contract only when its `Supersedes` field names that
   clause or the conflict is direct and unavoidable.
2. Untouched old contract clauses remain normative; silence here is not deletion.
3. `NON_GOALS.md`, rationale, source notes, and examples do not override normative rules.
4. If two `REV-*` rules conflict, implementation stops until this specification is reconciled.
5. If this specification cannot trace a semantic statement to accepted source material, that statement
   must be removed or explicitly returned to design review.

## Historical provenance boundary

The optional traceability ledger records which passages in the former revision ledger, operations drafts,
behavior-gap inventory, and old contracts were used to construct this specification. Those files are not
part of the reading path and cannot add semantics. If a statement required for implementation exists only
in a historical source, this specification is incomplete and must be repaired here before implementation
continues.
