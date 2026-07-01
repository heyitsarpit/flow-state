# Flow State /goal Prompts

Run these in order. Each block is meant to be copied directly into Codex
`/goal` and executed as one whole project, not as a tiny subtask.

## Goal 1

```text
Finish the remaining Flow State contract-truth and public-API blockers from IMPLEMENTATION.md and CORE_REACT_DE_SLOPPIFY.md before any large structural migration. This project should fully resolve the remaining Phase 17 preload-contract truth, cross-cutting diagnostics closeout, resource-ref honesty, runtime.resources shape and typing, canonical actor start/snapshot APIs, React provider/runtime typing truth, key identity policy, and the highest-priority core/react public API lies.

Procedure: Before coding, read skills/thermo-nuclear-code-quality-review/SKILL.md plus the relevant Effect, TanStack Store, TanStack Query, and XState references under docs/codebases, then write failing tests first for each public contract decision. Implement the whole project end-to-end, run focused tests plus the relevant package/example gates after each slice, run the thermo-nuclear review before closing the project, fix every blocking finding, update IMPLEMENTATION.md and CORE_REACT_DE_SLOPPIFY.md as work lands, commit the completed project slice, and only then move to the next goal.

Review bar: Tests are the contract; do not weaken preload, hydration, React/runtime, or public API semantics just to make the cleanup easier, do not add unrelated feature expansion, and do not call this project complete until the runtime contract is honest, reviewed, backlog-updated, and committed.
```

## Goal 2

```text
Execute the whole testing-package cleanup and productivity project described in TESTING.md and TESTING_PACKAGE_AUDIT.md so Flow State testing becomes the one obvious AI-first development loop. This project should fully simplify the testing API, remove the double-start flowTest builder ceremony, tighten types, split testing/flow-test.ts as needed, clean stale terminology and docs drift, and then build the highest-value testing ergonomics, recipes, and flagship example surfaces that still fit the cleaned design.

Procedure: Before coding, read skills/thermo-nuclear-code-quality-review/SKILL.md plus the relevant Effect, TanStack Query, and XState testing references under docs/codebases, then write failing tests first for each testing surface change and each new productivity feature. Implement the whole testing project end-to-end, run focused testing/package/example/docs gates throughout, run the thermo-nuclear review before closing the project, fix every blocking finding, update TESTING.md, TESTING_PACKAGE_AUDIT.md, HOW_TO_USE_FLOW_STATE.md, and IMPLEMENTATION.md as work lands, commit the completed project slice, and only then move to the next goal.

Review bar: Tests are the contract; do not preserve awkward builder ceremony for backward compatibility, do not add an assertion DSL, do not add convenience features that hide raw facts or weaken determinism, and do not call this project complete until the testing surface is simpler, stronger, reviewed, backlog-updated, and committed.
```

## Goal 3

```text
Execute the whole inspect cleanup and expansion project described in INSPECT.md so inspect becomes a real runtime-debugging product rather than a thin wrapper over descriptors and receipts. This project should fully resolve inspect-truth issues first, including placeholder surfaces like graphOf(...) and flowStories(...), inspect/testing type ownership drift, and the live-inspection-first story, and then build the approved inspection improvements such as typed live events, graph helpers, filtering, retention/export/redaction policies, richer resource and transaction inspection, and optional pretty printing backed by real receipts.

Procedure: Before coding, read skills/thermo-nuclear-code-quality-review/SKILL.md plus the relevant XState inspect/graph references under docs/codebases/xstate, then write failing tests, scripts, or receipt proofs first for each inspect decision and feature. Implement the whole inspect project end-to-end, run focused inspect/runtime/docs gates throughout, run the thermo-nuclear review before closing the project, fix every blocking finding, update INSPECT.md and IMPLEMENTATION.md as work lands, commit the completed project slice, and only then move to the next goal.

Review bar: Receipts and tests are the contract; do not keep descriptor-heavy or ornamental inspect wrappers that do not pay rent, do not let inspect get ahead of the real runtime facts, and do not call this project complete until every surviving and newly added inspect feature is proved, reviewed, backlog-updated, and committed.
```

## Goal 4

```text
Execute the whole src-tree reorganization and architecture-split project described in SRC_REORGANIZATION_BACKLOG.md so packages/flow-state/src matches the real export-path model and ownership boundaries of the library. This project should fully split the biggest concern buckets first, then dissolve public/, stop using src/ root as an implementation strip, reorganize the implementation into core/react/testing/shared/utils, make the top-level entry files boring shims, and remove the small-cut structural slop that still makes the tree feel handwritten and uneven.

Procedure: Before coding, read skills/thermo-nuclear-code-quality-review/SKILL.md plus the local package-hygiene, architecture, runtime, and transaction proof tests, then write failing structural or behavior-preserving tests first where needed. Implement the whole reorganization project end-to-end in safe slices, run focused architecture tests plus the relevant package/example gates throughout, run the thermo-nuclear review before closing the project, fix every blocking finding, update SRC_REORGANIZATION_BACKLOG.md and IMPLEMENTATION.md as work lands, commit the completed project slice, and only then move to the next goal.

Review bar: Tests, build outputs, and architecture proofs are the contract; do not do half-migrated folder moves, do not spread oversized logic into new folders without really splitting it, and do not call this project complete until the tree clearly matches the export-path model, the shims stay boring, the backlog is updated, and the slice is committed.
```

## Goal 5

```text
Execute the final package migration and TypeScript-cost reduction project from IMPLEMENTATION.md Phase 18A and Phase 18B after the API and source-tree cleanup is stable. This project should replace staged @flow-state/core/* public stories with the final package contract @flow-state/core, @flow-state/react, @flow-state/testing, @flow-state/server, and @flow-state/inspect, update exports/docs/examples/Launch Workspace accordingly, and then reduce compiler-cost pressure by simplifying flow.app(...) / FlowAppDefinition generic fan-out, splitting type ownership by export path, and keeping any fallback helper surfaces minimal and library-owned.

Procedure: Before coding, read skills/thermo-nuclear-code-quality-review/SKILL.md plus the relevant Effect/XState references and the local TypeScript proof packages, then write failing package/export proofs and declaration/typing proofs first for each migration or compiler-cost simplification. Implement the whole project end-to-end, run focused package/docs/example/type-proof gates throughout, run the thermo-nuclear review before closing the project, fix every blocking finding, update IMPLEMENTATION.md and the affected backlog files as work lands, commit the completed project slice, and only then move to the next goal.

Review bar: Package exports, docs, and type proofs are the contract; do not leave stale staged-package stories behind, do not keep expensive generic public shapes without evidence, and do not call this project complete until the final package contract and compiler-cost improvements are both proved, reviewed, backlog-updated, and committed.
```

## Goal 6

```text
Execute the final proof-by-examples and framework-story project using IMPLEMENTATION.md and HOW_TO_USE_FLOW_STATE.md. This project should port the planned reference examples, especially the early TanStack Query-style examples, make sure they include testing-rich and inspection-rich proof surfaces, and then turn HOW_TO_USE_FLOW_STATE.md into the real durable docs story for how Flow State should be used as an AI-first, test-first, framework-like system.

Procedure: Before coding, read skills/thermo-nuclear-code-quality-review/SKILL.md plus the relevant TanStack Query, TanStack Store, Effect, and XState references, then write failing tests and example proofs first for each example or docs claim. Implement the whole project end-to-end, run focused example/docs/package gates throughout, run the thermo-nuclear review before closing the project, fix every blocking finding, update IMPLEMENTATION.md, HOW_TO_USE_FLOW_STATE.md, and any remaining backlog/docs files as work lands, commit the completed project slice, and only then stop.

Review bar: Examples, tests, and docs are the contract; do not teach transitional APIs or half-cleaned architecture, do not call the framework story final until the examples really prove it, and do not call this project complete until the product-shaped examples and usage page are reviewed, backlog-updated, and committed.
```
