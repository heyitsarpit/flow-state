---
name: flow-state-module-refactor
description: Refactor one packages/flow-state-rewrite module into a smaller, clearer owner boundary while preserving or intentionally changing its contract. Use for focused module work; do not use for the frozen packages/flow-state package, contract authoring, or project-wide cleanup.
---

# Flow State module refactor

Use this skill for one focused `packages/flow-state-rewrite` module. Keep the
slice narrow. Preserve observable behavior unless the task explicitly changes
it; backwards compatibility is not required unless the task says so. Make
routine reversible assumptions. Ask a focused question only when missing
information changes the contract, scope, or authorization.

## Required module card

Before editing, record this lightweight card:

- [ ] target module and exact allowed files;
- [ ] one sentence naming the module's single responsibility;
- [ ] direct callers, tests, and public exports;
- [ ] observable behavior and contracts to preserve or intentionally change;
- [ ] known compatibility, duplication, or machinery that may be deleted.

If the owner sentence remains unclear after tracing callers, resolve scope
before designing the replacement.

## Establish scope and ownership

Use the module card as the scope boundary. Gather only the evidence needed to
make the owner clear.

For each export, trace its callers and public route. Read the smallest relevant
tests and entrypoints. Widen discovery only when a contract, identity, public
type inference, diagnostics (`code`, `path`, `details`, `cause`),
mutability/ownership, or lifecycle/cleanup proof requires it.
Contracted or documented public behavior is not dead merely because current
callers do not use it.

Classify declarations as keep, delete, inline, or move. Mark each deletion as
behavior-preserving or contract-changing; get authorization before a
contract-changing deletion. Identify pure work, expected failures, deliberately
caught unexpected failures, dependencies, lifetime, and cleanup. Check Effect,
the standard library, and existing project owners before keeping custom
machinery.

Do not edit `packages/flow-state`, generated output, contracts, Beads, or
unrelated dirty files.

## Design the smallest owner

- Give each production file one responsibility. Split only when ownership,
  dependency direction, lifetime, or a real test seam differs.
- Remove compatibility wrappers, duplicate errors, generic mappers,
  speculative extension points, stale exports, and old shapes that no longer
  serve the chosen API.
- Keep infallible helpers plain. Use `Result` where expected failure begins and
  `Effect` for dependencies, lifetime, concurrency, or asynchrony. A
  `Result`/`Effect` boundary does not force every helper beneath it into that
  abstraction.
- Keep expected application failures as the canonical `Diagnostic` in the `E`
  channel. Map deliberately caught unexpected failures to `Panic`; do not
  swallow defects or interruption indiscriminately.
- Add a service only for genuine replacement, injection, state, configuration,
  or lifetime ownership.

Use `pipe`, `flow`, `compose`, `Predicate`, `Equivalence`, and other Effect APIs
only when they remove code or clarify semantics. Decorative composition is not
a simplification.

Prefer deleting obsolete concepts before introducing abstractions. Complete the
focused owner boundary before considering shared abstractions.

## Refactor and prove the boundary

Implement the smallest coherent owner API and rewire every in-scope caller to
it. Delete replaced declarations, imports, exports, aliases, and obsolete
tests so a second owner does not remain. Curate public exports; keep
implementation helpers internal. Do not expand into an adjacent module merely
to make the diff look complete.

Stop when further work would change the contract, add indirection, merely move
lines, or reduce file size without removing concepts.

Prove runtime and compile-time contracts separately:

- if runtime behavior changes, behavior tests cover values, typed failures,
  panic projection, identity, and hostile inputs;
- if public or type behavior changes, compile-only fixtures cover inference,
  nominality, readonly behavior, and rejected uses.

For implementation changes, run the smallest applicable focused lint/format
check, rewrite-package typecheck, and `git diff --check`. Add broader public,
packed-consumer, integration, runtime, or build checks only when the changed
boundary or a failure justifies them. A green typecheck does not replace
behavior proof, and a focused module check does not prove unrelated work.

Request one independent `typescript-style-guide` review scoped to this module
for every implementation change, then fix blocking findings without widening
the slice. Inspect the final diff for unnecessary files, helpers, comments,
abstractions, assertions, suppressions, and accidental public exports.

## Safe completion

- Keep only authorized module paths changed. Leave unrelated dirty work
  untouched and report protected paths.
- Confirm the owner boundary, public contract, deletion decisions, and proof
  results. Report exact failures and unresolved uncertainty.
- Do not stage, commit, or push as part of this skill unless the user explicitly
  requests it. If a commit is requested, stage only the authorized module files
  and inspect the name-status manifest first.
- Record repeated meaningful shapes as candidates; do not abstract them during
  this module pass.

Hand back:

1. What the module now owns.
2. What was deleted, inlined, or moved.
3. Exact changed and protected paths.
4. Checks and independent review results.
5. Deferred abstraction candidates and remaining uncertainty, if any.

## Shared abstraction gate

Consider a separate shared refactor only when all of these are true:

- the same meaningful pattern exists in at least three completed modules;
- the abstraction deletes more code and concepts than it introduces;
- it has one clear owner and a domain-specific name;
- it preserves or improves the `Effect<A, E, R>` story and dependency direction;
- it can be reviewed, proven, and reverted independently.

## Related guidance

- Use `typescript-style-guide` for Flow State TypeScript implementation and
  style review.
- Use `effect-systems-design` when choosing plain TypeScript, `Result`,
  `Effect`, a service, or a `Layer`.
- Use `effect-api-documentation` only to verify exact Effect v4 APIs.

Refine this skill only after real module work exposes a missing decision rule
or unnecessary step. Replace weak guidance instead of appending exceptions. Do
not generalize a lesson from one unusual module.
