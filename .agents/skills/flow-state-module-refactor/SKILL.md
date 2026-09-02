---
name: flow-state-module-refactor
description: Refactor one packages/flow-state-rewrite source module into a smaller, clearer owner boundary, then prove and commit that module before considering shared abstractions. Use for the deliberate file-by-file rewrite workflow; do not use for the frozen packages/flow-state package, contract authoring, or a project-wide cleanup pass.
---

# Flow State Module Refactor

Simplify one rewrite module completely before moving to the next. Delete before
abstracting. Preserve observable behavior unless the user explicitly changes
it. Backwards compatibility is not required unless the current task says so.

Use `typescript-style-guide` for TypeScript implementation and style review.
Use `effect-systems-design` when deciding whether work belongs in plain
TypeScript, `Result`, `Effect`, a service, or a `Layer`. Use
`effect-api-documentation` only when exact Effect v4 APIs need verification.

## Required module card

Write these before editing:

- [ ] Module path and exact allowed files.
- [ ] One sentence naming the module's single responsibility.
- [ ] Callers, tests, and public exports that depend on it.
- [ ] Observable behavior to preserve or intentionally change.
- [ ] Known compatibility, duplication, or machinery that may be deleted.

If the owner sentence remains unclear after tracing callers, stop before
designing the replacement.

## 1. Read and classify

- [ ] Read every module file and trace every export to its callers.
- [ ] Inspect the smallest relevant tests and public entrypoints.
- [ ] Before deletion, inventory runtime values and identity, public type inference, diagnostics (`code`, `path`, `details`, `cause`), and mutability/ownership; contracted or documented public behavior is not dead merely because current callers do not use it.
- [ ] Classify each declaration as keep, delete, inline, or move to its owner; mark proposed deletions as behavior-preserving or contract-changing, and stop for authorization before contract-changing deletion.
- [ ] Identify pure work, expected failures, caught unexpected failures,
      dependencies, lifetime, and cleanup.
- [ ] Check Effect, the standard library, and existing project owners before
      retaining custom machinery.

Do not edit the frozen package, generated output, contracts, Beads, or unrelated
dirty files unless separately authorized.

## 2. Design the minimum owner

- [ ] Give each production file one responsibility; split only when ownership,
      dependency direction, lifetime, or a real test seam differs.
- [ ] Remove compatibility wrappers, duplicate errors, generic mappers,
      speculative extension points, and stale exports that no longer serve the
      chosen API.
- [ ] Keep infallible helpers plain; introduce `Result` only where expected failure begins, and `Effect` only for dependencies, lifetimes, concurrency, or asynchrony. An `Effect`/`Result` boundary does not force every helper beneath it into that abstraction.
- [ ] Keep expected application failures as the canonical `Diagnostic` in the
      `E` channel. Map unexpected failures that are deliberately caught to
      `Panic`; do not indiscriminately swallow defects or interruption.
- [ ] Introduce a service only for genuine replacement, injection, state,
      configuration, or lifetime ownership.

Use `pipe`, `flow`, `compose`, `Predicate`, `Equivalence`, and other Effect APIs
only when they remove code or make semantics clearer. Decorative composition is
not a simplification.

## 3. Replace the old module

- [ ] Implement the smallest coherent owner API.
- [ ] Rewire every in-scope caller directly to that API.
- [ ] Delete replaced declarations, imports, exports, aliases, and obsolete
      tests; do not leave a second owner behind.
- [ ] Curate public exports deliberately; keep implementation helpers internal.
- [ ] Rewrite tests around observable success, typed failure, panic projection,
      and important boundary cases.
- [ ] Stop simplifying when further work changes the contract, adds indirection,
      merely moves lines, or reduces file size without removing concepts.

Do not preserve an old name or shape merely because it already exists. Do not
expand into an adjacent module to make the current diff look complete.

## 4. Prove the module

- [ ] Prove runtime and compile-time contracts separately: behavior tests cover
      values, failures, identity, and hostile inputs; compile-only fixtures cover
      inference, nominality, readonly behavior, and rejections.
- [ ] Run focused lint and formatting checks.
- [ ] Run the rewrite package typecheck and `git diff --check`.
- [ ] Request one independent `typescript-style-guide` review scoped only to
      the module, then fix blocking findings without broadening the slice.
- [ ] Inspect the final diff for unnecessary files, helpers, comments,
      abstractions, assertions, suppressions, and accidental public exports.

A green typecheck does not replace behavior proof. A focused module check does
not prove unrelated public, packed-consumer, integration, or runtime work.

## 5. Stop cleanly

- [ ] Stage only the authorized module files.
- [ ] Inspect the staged name-status manifest before committing.
- [ ] Commit only when the user or active workflow authorizes it.
- [ ] Leave unrelated dirty work unstaged and report it as protected.
- [ ] Record repeated shapes as candidates; do not abstract them during this
      module pass.

## Project-wide abstraction gate

Create a separate shared refactor only when all are true:

- [ ] The same meaningful pattern exists in at least three completed modules.
- [ ] The abstraction deletes more code and concepts than it introduces.
- [ ] It has one clear owner and a domain-specific name.
- [ ] It preserves or improves the `Effect<A, E, R>` story and dependency
      direction.
- [ ] It can be reviewed, proven, and reverted independently.

## Handback

Report only:

1. What the module now owns.
2. What was deleted, inlined, or moved.
3. Exact changed and protected paths.
4. Checks and independent review results.
5. Deferred abstraction candidates, if a pattern has repeated.

## Refining this skill

After each completed module, update this skill only when real usage exposed a
missing decision rule or unnecessary step. Replace weak guidance instead of
appending another exception. Do not generalize a lesson from one unusual
module.
