# Phase 8: Migration, proving applications, and final deletion

Status: waiting on Phase 7

## Prerequisites and contract IDs

Phases 1-7 must be green with their receipts complete. All target public APIs, production
runtime ownership, story/model execution, artifact codecs, inspection sink, server helper, and
CLI paths must already exist before this phase removes the last examples and compatibility
surfaces.

This phase closes TEST-001 through TEST-018 at the workspace boundary and closes PROOF-001,
PROOF-012, PROOF-014, PROOF-015, PROOF-016, and PROOF-017. It must carry any previously open
proof ID rather than hiding it behind the broad gate.

## Allowed scope

- migrate and consolidate examples into the three final proving applications;
- migrate remaining package, example, CLI, React, server, and browser tests to target APIs;
- move bounded-feed behavior into a package-owned contract fixture;
- retain React 18/19 and TypeScript mode packages strictly as packed/type proofs;
- update root/package scripts, workspace filters, export maps, and package metadata;
- delete superseded examples, exports, source systems, dependencies, tests, scripts, generated
  assumptions, and manual coverage ledgers after replacement proofs pass;
- run the entire proof matrix and broad gate.

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

- [ ] Build **Todo Essentials** by merging basic cached posts and optimistic transactions. It must
      prove resource ensure/observe, stale and GC time, exact refs, transactions, overlapping
      optimistic overlays, invalidation, machine behavior, views, React, fixtures, controlled
      Effects, stories, checkpoints, and TestClock.
- [ ] Finish **Incident Console** as the flagship. It must prove multiple refs, transaction
      conflicts and pressure, controlled streams, children, diagnostics, TurnRecord inspection,
      CLI registered stories, browser lifetime, and the scoped runbook lease.
- [ ] Resolve B12/Q12 without a new operation kind. Move the runbook remote lease under a child
      actor and its activity Scope. Distinguish normal completion, navigation, replacement,
      external interruption, parent disposal, and runtime disposal. Release exactly once and
      publish cancellation/finalizer Cause instead of using `Effect.ignore`.
- [ ] Build **Hydrated Offline Notes** by merging server prefetch/hydration and offline recovery.
      It must prove request isolation, root-event preload, v2 boot, first-render consistency,
      persisted outbox normalization, reconnect drain through an app-owned controlled connectivity
      stream, and disposal. Package-level resource tests continue to exercise Flow's private host
      signal source directly.
- [ ] Move bounded infinite-feed aggregation and pressure cases into a package contract fixture
      and oracle tests. Do not retain it as a showcase app.
- [ ] Keep the React 18, React 19, isolated declarations, isolated modules, strict, and multi-entry
      packages as compile/packed proof only. Ensure none contains a second runtime or userland
      showcase contract.
- [ ] Migrate every remaining test and script from removed APIs. Delete architecture tests that
      read source text for filenames or tokens and replace them with the corresponding PROOF ID.
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

- `examples/basic-cached-posts`, `examples/optimistic-transactions`,
  `examples/bounded-infinite-feed`, `examples/server-prefetch-hydration`, and
  `examples/offline-recovery`;
- `examples/FEATURE_COVERAGE.md`;
- obsolete legacy testing, React, server, inspection, CLI, runtime, registry, scheduler,
  controlled-stream, artifact, and compatibility files identified by Phases 5-7;
- `@tanstack/store` and any dependency with no remaining live importer;
- source-text architecture tests and snapshots whose only job is preserving deleted filenames,
  exports, or legacy vocabulary;
- generated build assumptions and root filters for deleted packages.

Keep the TypeScript proof packages listed by the live package-hygiene test, but revise their
contents to prove the target exports. Keep no compatibility alias solely to make those fixtures
green.

## Exact gates

Run focused owner gates first, then the broad gate:

```sh
pnpm --filter flow-state check:cli-source-types
pnpm --filter flow-state test
pnpm --filter flow-state build
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

Write `reference/incident-console/implementation/receipts/PHASE_8_MIGRATION_AND_DELETION.md`
with:

- prerequisite phase receipts and every TEST/PROOF ID status;
- final showcase and type-proof package inventory;
- a mapping from each deleted example capability to its replacement proof and application;
- the scoped lease exit matrix, release counts, and cleanup Cause evidence;
- exact deleted paths, removed exports, removed dependencies, and zero-match searches;
- root script/package-filter inspection;
- every gate above with exit code, duration, test count, and skipped-test count;
- final `git diff --name-status`, `git status --short`, and any unrelated preserved changes.

The receipt must say pending if any deletion, proof ID, package gate, browser test, or broad gate
is incomplete. A smaller green subset cannot close Phase 8.

## Live evidence

- Root `package.json:7-30` currently builds five superseded examples plus Incident Console and
  defines the broad `verify` gate.
- `packages/flow-state/package.json:59-85` owns package build, test, packed/type proof, and peer
  dependency surfaces.
- `examples/incident-console/package.json:6-18` owns its test, CLI, acceptance, and Playwright
  commands.
- `examples/incident-console/src/features/incidents/runbook-lease.ts:9-26` currently hides remote
  cancellation in `Stream.never` and `Effect.ignore`.
- `reference/incident-console/IMPLEMENTATION_BLOCKERS.md:725-763` lists cleanup and the three
  final proving applications; `:765-800` lists required proof tests.
