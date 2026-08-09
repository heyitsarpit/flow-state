# Phase 8: Migration, proving applications, and final deletion

Status: waiting on Phase 7

## Prerequisites and contract IDs

Phases 1-7 must be green with their receipts complete. All target public APIs, production
runtime ownership, story/model execution, artifact codecs, inspection sink, server helper, and
supported behavior, story list/describe/run, and trace CLI commands must already exist before
this phase removes the last examples and compatibility surfaces.

Earlier phases own the Phase 0-assigned implementation subcases under TEST-001 through TEST-018
and PROOF-001 through PROOF-015. This phase consumes their completed receipts and owns only the
Phase 0-assigned Phase 8 subcases under PROOF-016 and PROOF-017 plus final repository deletion verification
under API-001, API-002, CUT-001 through CUT-008, and CUT-007A. API-001/API-002 closure means the
packed root and secondary routes expose exactly the values and types implemented by their owning
phases, with every removed or internal symbol absent. It may close another proof only when that ID arrives as
an explicitly unresolved carried item; the broad gate does not transfer ordinary ownership here.

## Allowed scope

- migrate and consolidate examples into the three final proving applications;
- migrate remaining package, example, CLI, React, server, and browser tests to target APIs;
- move bounded-feed behavior into a package-owned contract fixture;
- retain React 18/19 packages as packed renderer/declaration proofs and TypeScript mode packages as
  packed type proofs; none becomes another showcase or runtime owner;
- update root/package scripts, workspace filters, export maps, and package metadata;
- delete superseded examples, exports, source systems, dependencies, tests, scripts, generated
  assumptions, and manual coverage ledgers after replacement proofs pass;
- run the entire proof matrix as regression evidence and close the final application/deletion
  proofs plus any explicitly carried unresolved ID.

## Forbidden work

- Do not add compatibility aliases, deprecated wrappers, another example to postpone a merge,
  or a manual coverage document in place of executable proof.
- Do not preserve an obsolete file because one source-text test names it; replace the test with
  a behavior or type proof.
- Do not delete a source or example until its target proof runs against the replacement in the
  same phase.
- Do not redesign settled runtime, story, fixture, model, inspection, or React contracts during
  cleanup. A real contract defect returns to the owning phase and reopens its receipt.
- Do not stage or rewrite unrelated user worktree changes.

## Tasks

- [ ] Execute the resolved authority-cleanup obligation formerly tracked as `SP-B025`. Migrate every
      still-live packed-route, Effect peer,
      React 18/19, exact-inference, isolation, capacity, hostile-input, lifecycle, and independent
      oracle requirement into a current `PROOF-*` row before deleting the authority that named it.
- [ ] Replace root `TASK.md` with a short pointer to this task index, then delete the repository-root
      `tasks/**` phase system and receipts; never delete
      `reference/incident-console/implementation/tasks/**`. Remove all normative citations to
      `IMPLEMENTATION_BLOCKERS.md`, migrate any remaining rationale to stable contract or proof
      IDs, and delete that ledger. Delete the superseded root contracts and historical
      API documents named in the deletion obligations below only after exact inbound-link and proof
      replacement checks pass.
- [ ] Build **Todo Essentials** by merging basic cached posts and optimistic transactions. It must
      prove resource ensure/observe, stale and GC time, exact refs, transactions, overlapping
      optimistic overlays, invalidation, machine behavior, views, React, fixtures, controlled
      Effects, stories, checkpoints, and TestClock.
- [ ] Finish **Incident Console** as the flagship. It must prove multiple refs, transaction
      conflicts and application-authored Stream backpressure, controlled streams, children, diagnostics, TurnRecord inspection,
      CLI registered stories, browser lifetime, and the scoped runbook lease.
- [ ] Implement and prove the already selected B12/Q12 contract without a new operation kind. Move the runbook remote lease under a child
      actor and its activity Scope. Distinguish normal completion, navigation, replacement,
      external interruption, parent disposal, and runtime disposal. Release exactly once and
      publish cancellation/finalizer Cause instead of using `Effect.ignore`.
- [ ] Build **Hydrated Offline Notes** by merging server prefetch/hydration and offline recovery.
      It must prove request isolation, root-event preload, v2 boot, first-render consistency,
      persisted outbox normalization, reconnect drain through an application-owned connectivity
      stream controlled through a fixture in stories, and disposal. Package-level resource tests
      continue to exercise Flow's private host signal source directly.
- [ ] Move bounded infinite-feed aggregation and application-authored Stream backpressure cases
      into a package contract fixture and oracle tests. Do not add a Flow `pressure` option or
      retain it as a showcase app.
- [ ] Promote the supported workflows and recipes in `../USER_WORKFLOW_COVERAGE.md` and
      `../QUICK_EXAMPLES.md` into package/example documentation only after their named contracts
      and proofs are green. Delete or label any recipe whose gap remains unresolved; target
      documentation must never imply an unshipped capability.
- [ ] Publish the resolved host-workflow obligation formerly tracked as `SP-N003` with one proof-backed recipe each for a basic feature root, route preload,
      route/dialog-owned dynamic actor lifetime, URL synchronization, offline outbox drain,
      session-runtime replacement, and serialized host persistence whose loop settles before the
      final write and disposal. Prefer ordinary host composition over new convenience APIs.
- [ ] Keep the React 18, React 19, isolated declarations, isolated modules, strict, and multi-entry
      packages as compile/packed proof only. Ensure none contains a second runtime or userland
      showcase contract.
- [ ] Migrate every remaining example, test, and script from `vocabulary` and nested machine
      `define`/`memory` configuration to `definition` plus one machine behavior callback, then
      migrate every other removed API. Delete architecture tests that read source text for
      filenames or tokens and replace them with the corresponding PROOF ID.
- [ ] Remove dead dependencies after source deletion, including `@tanstack/store` once all actor
      and resource publication uses Effect-native state. Verify package output contains no removed
      public symbol.
- [ ] Update root `build:examples`, development, browser, CLI acceptance, and workspace filters to
      name only live packages. Root scripts delegate; example packages own their tests/builds and
      Incident Console owns Playwright.
- [ ] Delete `examples/FEATURE_COVERAGE.md`. Generate coverage truth from the compiled app graph,
      registered stories, proof tests, and phase receipts rather than another manual ledger.
- [ ] Run the complete proof matrix, inspect failures and skips, fix every in-scope finding, then
      run the broad workspace gate from a preserved worktree.

## Executable acceptance

- Exactly three showcase application packages remain: Todo Essentials, Incident Console, and
  Hydrated Offline Notes. Type/packed proof packages and package-owned contract fixtures do not
  count as showcases.
- Each showcase owns runnable tests and build scripts; Incident Console additionally owns real
  Chromium acceptance.
- The runbook lease proof distinguishes completion and every cancellation boundary, runs release
  once, retains cleanup Cause, and leaves no remote lease or fiber after disposal.
- Todo overlay, Incident conflict/stream/child, and Hydrated Offline request/outbox paths execute
  through imported registered stories and ordinary host assertions.
- React 18/19 packed proofs share the same public declarations and Strict Mode behavior.
- Removed exports fail negative packed-consumer imports; removed files, examples, dependencies,
  and symbols have zero live matches outside this implementation record and receipts.
- Root build/test/browser/CLI scripts resolve only live packages and delegate to the package
  owner.
- `pnpm verify` passes with no skipped required proof and all phase receipts truthfully complete.

## Deletion obligations

After replacement acceptance, delete:

- the old contents of root `TASK.md`, while retaining the exact short pointer required by CUT-P06;
  then the old repository-root `tasks/**` phases, goals, receipts, and ledgers; never delete this
  implementation pack's `tasks/**`;
- `API_CONTRACT.md`, `ARCHITECTURE_CONTRACT.md`, `TYPE_INFERENCE_CONTRACT.md`,
  `COMPATIBILITY_CORPUS.md`, `OWNER_MAP.md`, `CAPACITY_POLICY.md`, `LAWS_AND_ORACLES.md`, and
  `CLIENT_STRUCTURE_CONTRACT.md`;
- `reference/incident-console/IMPLEMENTATION_BLOCKERS.md` after its remaining evidence maps to
  contract and proof IDs;
- `docs/library-reference.md`, `docs/reference/lib_api.md`, `extra_features_api.md`, `test_api.md`,
  `test_conversation.md`, and `docs/product/XState-and-Effect-Integration.md` after their live
  facts are replaced;
- `HOW_TO_USE_FLOW_STATE.md` unless it is rewritten entirely from shipped vNext behavior, and
  `docs/xstate-deferred-patterns-memo.md` after its surviving ownership rules move to
  `ARCHITECTURE.md`;
- obsolete root/package READMEs and `apps/docs/src/pages/**` only after executable vNext examples
  and generated documentation replace them; retain `docs/codebases/**` as vendored evidence and
  `docs/docs-framework.md` only while Vocs remains the selected documentation infrastructure;
- `examples/basic-cached-posts`, `examples/optimistic-transactions`,
  `examples/bounded-infinite-feed`, `examples/server-prefetch-hydration`, and
  `examples/offline-recovery`;
- `examples/FEATURE_COVERAGE.md`;
- obsolete legacy testing, React, server, inspection, CLI, runtime, registry, scheduler,
  controlled-stream, artifact, and compatibility files identified by Phases 5-7;
- `@tanstack/store` and any dependency with no remaining live importer;
- source-text architecture tests and snapshots whose only job is preserving deleted filenames,
  exports, or legacy surface;
- generated build assumptions and root filters for deleted packages.

Keep the TypeScript proof packages listed by the live package-hygiene test, but revise their
contents to prove the target exports. Keep no compatibility alias solely to make those fixtures
green.

## Exact gates

Run focused owner gates first, then the broad gate:

```sh
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state build
pnpm --filter flow-state test
pnpm --filter flow-state check:typescript-mode-proofs
pnpm --filter flow-state check:packed-consumers
pnpm --filter @flow-state/todo-essentials test
pnpm --filter @flow-state/todo-essentials build
pnpm --filter @flow-state/incident-console test
pnpm --filter @flow-state/incident-console build
pnpm --filter @flow-state/incident-console test:cli
pnpm --filter @flow-state/incident-console test:acceptance
pnpm --filter @flow-state/hydrated-offline-notes test
pnpm --filter @flow-state/hydrated-offline-notes build
pnpm check:example-cli
pnpm test:browser
pnpm verify
```

The two new package filters are acceptance requirements for the final package names and will
become executable when their package manifests land. Before the final `pnpm verify`, run exact
searches for every deletion list and record the zero-match output.

## Receipt requirements

Write `reference/incident-console/implementation/receipts/PHASE_8.md`
with:

- prerequisite phase receipts, every TEST/PROOF ID status, and explicit identification of the
  PROOF-016/017 ownership versus carried unresolved IDs;
- final showcase and type-proof package inventory;
- a mapping from each deleted example capability to its replacement proof and application;
- the scoped lease exit matrix, release counts, and cleanup Cause evidence;
- exact deleted paths, removed exports, removed dependencies, and zero-match searches;
- root script/package-filter inspection;
- every gate above with exit code, duration, test count, and skipped-test count;
- final `git diff --name-status`, `git status --short`, and any unrelated preserved changes.

The receipt must say pending if any deletion, proof ID, package gate, browser test, or broad gate
is incomplete. A smaller green subset cannot close Phase 8.
