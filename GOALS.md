# Flow State /goal Prompts

Each block below is a standalone `/goal` prompt.

Each goal corresponds to exactly one task list and should be run as its own
project. Do not merge these prompts together.

Global rules for every goal:

- Treat `examples/launch-workspace` as a verification and pressure-test surface
  only.
- Do not create new cleanup, redesign, split, or docs-expansion work whose main
  target is `examples/launch-workspace`.
- If a goal mentions Launch Workspace, use it only for existing proof gates or
  compatibility checks unless the task list explicitly says otherwise.
- Prefer named ESM exports on every public route:
  - `@flow-state/core`
  - `@flow-state/react`
  - `@flow-state/testing`
  - `@flow-state/inspect`
  - `@flow-state/server`
- Let users choose local namespace aliases at import sites, for example:
  - `import * as flow from "@flow-state/core"`
  - `import * as hooks from "@flow-state/react"`
  - `import * as test from "@flow-state/testing"`
  - `import * as inspect from "@flow-state/inspect"`
- Direct named imports should also stay valid for users who only want a few
  exports.
- Do not preserve exported frozen public namespace objects when named module
  exports can keep the same call shape with better tree-shaking.

## Goal 1

Corresponds to task list:
[IMPLEMENTATION.md](/Users/arpit/Developer/flow-state/IMPLEMENTATION.md)

```text
Build only the remaining implementation work still open in IMPLEMENTATION.md:
cross-cutting closeout, Phase 17, Phase 18A, and Phase 18B. Do not reopen
completed phases unless a new blocker is proven. Treat Reference Example Ports
as future potential work, not part of this goal. Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Keep Phase 17 narrow to request-scoped boot, resource hydration, and
actor snapshot restore only. Treat Phase 18A as package migration work only:
final package names, exports/metadata/docs updates, and minimal call-site
rewrites, without sneaking in runtime behavior changes. Treat Phase 18B as
library-side compiler-cost reduction with evidence, not app-author ceremony.
For each phase, write failing tests first(if it makes sense), implement only
that phase, run focused tests plus the relevant package/example gate, then run
a review using skills/thermo-nuclear-code-quality-review/SKILL.md; fix every
blocking finding, update IMPLEMENTATION.md checkboxes for completed work,
commit that slice, and only then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not implement out-of-scope APIs, and do not claim a phase complete until its abstraction decisions, tests, review, checklist update, and commit are done.
```

## Goal 2

Corresponds to task list:
[TESTING.md](/Users/arpit/Developer/flow-state/TESTING.md)

```text
Build packages/flow-state testing phase-by-phase from TESTING.md. Phase 1 is a
hard prerequisite for later phases. The durable testing surface should move to
flow.test(...), keep one dominant builder flow, keep cache() unless the harness
becomes a richer resource API, remove createControlledEffect(...), and keep
assertions owned by the host test runner. Express the API through named module
exports that support namespace imports rather than an exported frozen object.
Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Follow the task-list order strictly: Phase 1, then Phase 2, then
Phase 6, then Phases 3 and 5, then Phases 4 and 7. For each phase, write
failing tests first(if it makes sense), implement only that phase, run focused
tests plus the relevant package/example gate, then run a review using
skills/thermo-nuclear-code-quality-review/SKILL.md; fix every blocking finding,
update TESTING.md checkboxes for completed work, commit that slice, and only
then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not implement out-of-scope APIs, and do not claim a phase complete until its abstraction decisions, tests, review, checklist update, and commit are done.
```

## Goal 3

Corresponds to task list:
[INSPECT.md](/Users/arpit/Developer/flow-state/INSPECT.md)

```text
Build packages/flow-state inspect phase-by-phase from INSPECT.md. Phase 1 is
the hard foundation: stabilize the public inspection event contract first,
limited to real runtime events and shared metadata, before broader graph, trace,
story, or transport work. Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Do not invent speculative event families just because other
libraries have them. Observer and filterable subscriptions should be thin
layers on top of the stabilized event model. Leave transport/tooling work until
after Phases 1-5 settle the core inspect contracts. For each phase, write
failing tests first(if it makes sense), implement only that phase, run focused
tests plus the relevant package/example gate, then run a review using
skills/thermo-nuclear-code-quality-review/SKILL.md; fix every blocking finding,
update INSPECT.md checkboxes for completed work, commit that slice, and only
then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not implement out-of-scope APIs, and do not claim a phase complete until its abstraction decisions, tests, review, checklist update, and commit are done.
```

## Goal 4

Corresponds to task list:
[CORE_REACT_DE_SLOPPIFY.md](/Users/arpit/Developer/flow-state/CORE_REACT_DE_SLOPPIFY.md)

```text
Build packages/flow-state core-and-react contract-honesty cleanup
phase-by-phase from CORE_REACT_DE_SLOPPIFY.md. This goal is not a broad refactor
or package-reorganization vehicle. Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Prioritize one honest resource-ref contract first, then collapse
duplicate actor APIs, then make React semantics honest by clarifying flow.use(...)
and fixing the provider/runtime typing boundary. The durable decisions are:
named ESM exports consumed via `import * as flow from "@flow-state/core"`,
`runtime.orchestrators.start(...)` as the canonical actor start path,
`snapshot()` as the canonical actor snapshot reader, `useActor(...)` as the
meaningful React hook name in place of `flow.use(...)`, no exported React
`flow` namespace object, strict serializable resource-key identity, hard delete
for `createRuntime`, hard delete for the rest-arg `flow.app(...)` form, hard
delete for the factory `flow.module(id, () => inventory)` form, hard delete for
`flow.persist(...)`, hard delete for `flow.permission(...)`, and keep
`flow.outcomes(...)` as the optional typed route helper. For each phase, write
failing tests first(if it makes sense), implement only that phase, run focused
tests plus the relevant package/example gate, then run a
review using
skills/thermo-nuclear-code-quality-review/SKILL.md; fix every blocking finding,
update CORE_REACT_DE_SLOPPIFY.md checkboxes for completed work, commit that
slice, and only then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not implement out-of-scope APIs, and do not claim a phase complete until its abstraction decisions, tests, review, checklist update, and commit are done.
```

## Goal 5

Corresponds to task list:
[SRC_REORGANIZATION_BACKLOG.md](/Users/arpit/Developer/flow-state/SRC_REORGANIZATION_BACKLOG.md)

```text
Build packages/flow-state src reorganization phase-by-phase from
SRC_REORGANIZATION_BACKLOG.md. This is a physical file-layout project only:
preserve public import paths and runtime behavior unless another goal explicitly
authorizes a contract change. Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Follow the fixed target folder structure in
SRC_REORGANIZATION_BACKLOG.md and the binding phase order: root boring first,
then dissolve public/, then split core by ownership, then later cleanup
phases. For each phase, write failing tests first(if it makes sense), implement
only that phase, run focused tests plus the relevant package/example gate, then
run a review using skills/thermo-nuclear-code-quality-review/SKILL.md; fix
every blocking finding, update SRC_REORGANIZATION_BACKLOG.md checkboxes for
completed work, commit that slice, and only then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not implement out-of-scope APIs, and do not claim a phase complete until its abstraction decisions, tests, review, checklist update, and commit are done.
```

## Goal 6

Corresponds to task list:
[DE_SLOPPIFY_OPPORTUNITIES.md](/Users/arpit/Developer/flow-state/DE_SLOPPIFY_OPPORTUNITIES.md)

```text
Build packages/flow-state de-sloppify cleanup phase-by-phase from
DE_SLOPPIFY_OPPORTUNITIES.md, but keep the goal narrow: public API honesty,
docs/vocabulary cleanup, and removal or demotion of weak public surfaces only.
Leave internal structural cleanup to Goals 4 and 5, and do not do Launch
Workspace cleanup work here. Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Delete weak public surfaces when confidence is high. If a surface is
still uncertain, demote it with a standard @deprecated marker, a short note,
and a matching backlog trail for deletion later. Settled delete-now targets are
`createRuntime`, the rest-arg `flow.app(...)` form, the factory
`flow.module(id, () => inventory)` form, `flow.persist(...)`, and
`flow.permission(...)`. Keep `flow.outcomes(...)` for now. For each phase,
write failing tests first(if it makes sense), implement only that phase, run
focused tests plus the relevant package/example gate, then run a review using
skills/thermo-nuclear-code-quality-review/SKILL.md; fix every blocking finding,
update DE_SLOPPIFY_OPPORTUNITIES.md checkboxes for completed work, commit that
slice, and only then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not implement out-of-scope APIs, and do not claim a phase complete until its abstraction decisions, tests, review, checklist update, and commit are done.
```

## Goal 7

Corresponds to task lists:
[SRC_REORGANIZATION_BACKLOG.md](/Users/arpit/Developer/flow-state/SRC_REORGANIZATION_BACKLOG.md)
and
[DE_SLOPPIFY_OPPORTUNITIES.md](/Users/arpit/Developer/flow-state/DE_SLOPPIFY_OPPORTUNITIES.md)

```text
Build packages/flow-state by combining the src reorganization work from
SRC_REORGANIZATION_BACKLOG.md with the public-surface honesty cleanup from
DE_SLOPPIFY_OPPORTUNITIES.md. Treat this as one coordinated project only when
the physical file-layout changes and the de-sloppify cuts benefit from being
landed together. Before coding, read
skills/thermo-nuclear-code-quality-review/SKILL.md then think of the high level
abstractions will improve reusability, performance, debuggability, reduce lines
of code and be easy to read.

Procedure: Keep the combined goal honest about its two boundaries. The
reorganization side is still a physical file-layout project first: preserve
public import paths and runtime behavior unless the de-sloppify backlog
explicitly authorizes a contract change. The de-sloppify side is still narrow:
public API honesty, docs/vocabulary cleanup, and removal or demotion of weak
public surfaces only. Do not turn this combined goal into broad Launch
Workspace cleanup or unrelated refactor churn. Follow the fixed folder-structure
and phase ordering from SRC_REORGANIZATION_BACKLOG.md, and when a touched area
also has an explicit de-sloppify requirement, resolve it in the same slice
instead of preserving a weak surface just because it already exists. Delete weak
public surfaces when confidence is high. If a surface is still uncertain,
demote it with a standard @deprecated marker, a short note, and a matching
backlog trail for deletion later. Settled delete-now targets remain
`createRuntime`, the rest-arg `flow.app(...)` form, the factory
`flow.module(id, () => inventory)` form, `flow.persist(...)`, and
`flow.permission(...)`. Keep `flow.outcomes(...)` for now. For each phase,
write failing tests first(if it makes sense), implement only that phase, run
focused tests plus the relevant package/example gate, then run a review using
skills/thermo-nuclear-code-quality-review/SKILL.md; fix every blocking
finding, update both SRC_REORGANIZATION_BACKLOG.md and
DE_SLOPPIFY_OPPORTUNITIES.md checkboxes for completed work, commit that slice,
and only then move to the next phase.

Review bar: Tests are the contract; do not skip or weaken them, do not
implement out-of-scope APIs, and do not claim a phase complete until its
abstraction decisions, tests, review, checklist update, and commit are done.
```

## Guidance Note

[HOW_TO_USE_FLOW_STATE.md](/Users/arpit/Developer/flow-state/HOW_TO_USE_FLOW_STATE.md)
is a guidance note that can inform other goals. It is not a standalone coding
goal.
