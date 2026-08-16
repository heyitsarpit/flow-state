# Flow State agent guide

Use this file to navigate, change, and verify Flow State. Read the live source,
tests, contracts, and proofs before making implementation or status claims.

## Useful structure

- `packages/flow-state/` — runtime, public APIs, adapters, CLI, tests, and proofs.
- `packages/flow-state/src/index.ts`, `react-entry.ts`, `testing.ts`,
  `server.ts`, and `inspect.ts` — public package entrypoints.
- `packages/flow-state/src/core/` — runtime behavior; `src/react/`,
  `src/testing/`, and `src/cli/` — integration surfaces.
- `examples/` — maintained consumers and TypeScript compiler proofs.
- `apps/docs/` — Vocs documentation and generated reference artifacts.
- `reference/incident-console/implementation/` — normative Incident Console
  contract pack: its README maps authority, `tasks/` names the active slice,
  `contracts/` define behavior, `receipts/` prove phases, and
  `SCRATCHPAD.md` records findings.
- `codebases/` — research input only; installed packages and the lockfile
  are authoritative for dependency APIs.

Development uses Node 22.18+, `nub@0.7.5`, TypeScript 7.0.2, Vite Plus, and
Effect 4.0.0-beta.86.

## Commands

```sh
nub install                                      # install dependencies
nub run check:toolchain                          # after dependency/compiler changes
nub run check                                    # formatting, lint, and type checks
nub run --filter flow-state check:cli-source-types
nub run --filter flow-state check:typescript-mode-proofs
nub run --filter flow-state check:vnext
nub run --filter flow-state check:packed-consumers
nub run test                                     # workspace test suite
nub run build                                    # package, CLI, and example output
nub run docs:build                               # documentation or public API changes
nub run test:browser                             # Incident Console browser behavior
nub run verify                                   # full closeout gate
```

Use the smallest relevant check while iterating. Run `build` when package, CLI,
or example output changes; it also runs the example CLI acceptance gate. The docs
generators derive API reference data from public entrypoints and behavior data from
`examples/basic-cached-posts`. Run `verify` before claiming a workspace slice
is complete.

## Working practices

- Read `git status`, relevant source and tests, README guidance, and the active
  contract/task before editing. Preserve unrelated worktree changes.
- Make the smallest change at the owning boundary. Check public API changes against
  affected entrypoints, tests, examples, packed consumers, and docs.
- Add or update executable behavior proofs with semantic changes; source-text checks
  and typechecking alone do not prove runtime behavior.
- Regenerate generated docs and package output through their commands. Do not hand-edit
  `dist/`, `apps/docs/src/generated/`, or `apps/docs/src/pages.gen.ts`.
- For contract work, read only the active task and its named contracts. Reconcile
  conflicting authority before changing implementation semantics.

## Skills

- Use `skills/effect-systems-design/SKILL.md` when choosing Effect boundaries,
  services, layers, ownership, or public api and internal implementation details.
- Use `skills/api-design/SKILL.md` when designing or reviewing public API shape,
  ergonomics, defaults, compatibility, or evolution.
- Use `skills/thermo-nuclear-code-quality-review/SKILL.md` before implementing and
  when reviewing flow-state code changes.
- Use the environment-provided `effect-ts` skill when checking an exact Effect v4
  import, signature, or behavior against the pinned installed version.

## Boundaries

- Always use the pinned nub toolchain, preserve existing worktree changes, run the
  smallest relevant check, and report exactly what was verified.
- Stop before changing a normative contract, widening the task, or treating a
  proposal, old roadmap, or reference codebase as shipped behavior.
- Never use unpinned latest dependencies, edit generated outputs by hand, erase public
  type information to satisfy a proof, or claim full verification from a focused check.
