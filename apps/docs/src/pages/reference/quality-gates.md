# Quality Gates

Benchmarks, bundle size, and library maintenance.

Status: recommended plan.

This page records the quality gates Flow State should maintain as the library becomes real. Do not install every tool immediately. Add gates when the first runtime slice creates real code to measure.

## Goals

- Keep runtime behavior fast enough for UI workflows.
- Prevent accidental bundle-size regressions.
- Ensure package exports and TypeScript declarations work in consumer projects.
- Keep release workflow boring, auditable, and repeatable.
- Make benchmark results useful without making local development miserable.

## Recommended Stack

| Area                    | Tool                   | When to add                               | Why                                                                                |
| ----------------------- | ---------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Microbenchmarks         | Vitest `bench`         | When runtime primitives exist.            | Already in the test stack through Vite+. Uses Tinybench underneath.                |
| CI benchmark tracking   | CodSpeed               | When benchmark results matter across PRs. | Gives repeatable PR-level performance tracking instead of noisy local comparisons. |
| Bundle budgets          | Size Limit             | When public exports stabilize.            | Measures real end-user cost and fails CI if budget is exceeded.                    |
| Package validation      | publint                | Before first publish.                     | Catches package export/config mistakes across bundlers and runtimes.               |
| Type package validation | Are The Types Wrong    | Before first publish.                     | Catches TypeScript declaration and ESM/CJS resolution problems.                    |
| Versioning              | Changesets             | Before first external release.            | Manages semver intent, changelogs, and multi-package releases.                     |
| Provenance              | npm trusted publishing | Before public npm release.                | Publishes provenance through CI without long-lived publish tokens.                 |

## Benchmark Plan

Use three classes of benchmarks.

### Microbenchmarks

Purpose:

- Compare small runtime operations.
- Catch accidental algorithmic regressions.
- Guide implementation choices when two designs are otherwise equivalent.

Initial targets:

- Machine transition resolution.
- Context assignment.
- Guard evaluation.
- Resource cache lookup.
- Resource invalidation by key.
- Resource invalidation by tag.
- Subscription fanout.
- Snapshot selection.

Rules:

- Do not benchmark stubs.
- Do not benchmark React rendering first.
- Do not use microbenchmarks as product proof.
- Keep benchmark inputs realistic and named.
- Record benchmark intent in the benchmark file.

Recommended command later:

- `pnpm bench`

### Scenario Benchmarks

Purpose:

- Measure a complete workflow under realistic event sequences.
- Reveal cross-primitive costs that microbenchmarks miss.

Initial scenarios:

- Project Editor load-edit-save.
- File Upload progress stream.
- AI Agent run approval flow.
- Cached Dashboard invalidation fanout.

Metrics:

- Total scenario time.
- Number of emitted snapshots.
- Number of cache writes.
- Number of subscriber notifications.
- Number of Effect executions.

### Browser/React Performance

Purpose:

- Measure UI subscription behavior after React adapter exists.

Add only after:

- `@flow-state/react` exists.
- Project Editor uses real hooks.

Initial targets:

- Re-render count per event.
- Selector stability.
- Large list/resource fanout behavior.
- Stream update pressure.

## Bundle Size Plan

Track several different sizes because each answers a different question.

| Metric                | Question                      | Tool                                       |
| --------------------- | ----------------------------- | ------------------------------------------ |
| Packed package size   | What do we publish?           | package manager pack output.               |
| Install size          | What does installation cost?  | package-size tools or npm registry checks. |
| Bundled consumer cost | What does a user ship?        | Size Limit.                                |
| Dependency graph      | What made the bundle big?     | Size Limit `--why` / analyzer.             |
| Export-level cost     | Which entry points pull what? | Separate Size Limit checks per entry.      |

Initial budgets should be generous and then tightened after real code exists.

Suggested future budgets:

- Core runtime entry: open until implementation exists.
- React adapter entry: open until hooks exist.
- Test helpers: not part of browser bundle budget.
- Devtools: separate budget.

Bundle rules:

- Keep `effect` and `xstate` as peers while we depend on them.
- Avoid importing React from core.
- Keep devtools out of core.
- Prefer explicit entry points over hidden all-in-one imports.
- Test tree-shaking with a consumer-style fixture, not only package output size.

## Package Validation Plan

Before first publish, add package validation that runs after package build.

Required checks:

- Build package.
- Pack package.
- Run publint on package.
- Run Are The Types Wrong on packed output.
- Verify `files` includes only intended artifacts.
- Verify `exports` points to real JavaScript and type declaration files.
- Verify imports work in a minimal consumer fixture.

Package rules:

- Always set `type`.
- Use `exports` as the public contract.
- Keep `files` restrictive.
- Keep runtime dependencies minimal.
- Use peer dependencies for host libraries that should not be duplicated.
- Preserve declaration maps while useful for debugging.

## Library Maintenance Practices

### Public API

- Treat `exports` as the semver boundary.
- Avoid adding public exports until an example needs them.
- Keep unstable helpers internal or mark them clearly.
- Document every public export in the Vocs reference.
- Add type tests for public API behavior.

### Compatibility

- Test against the supported Node range.
- Test ESM import behavior.
- Add browser bundler fixture tests before publishing.
- Keep core framework-independent.
- Keep React adapter in a separate package.

### Release

- Use Changesets before the first package release.
- Require a changeset for public API changes.
- Publish from CI.
- Use npm trusted publishing when registry setup allows it.
- Generate changelogs from release notes, not commit noise.

### CI Shape

Minimum CI before first release:

- Install.
- Format/lint/type check.
- Unit tests.
- Type tests.
- Build packages.
- Build docs.
- Package validation.
- Bundle-size check.

Later CI:

- Benchmark comparison.
- Example app builds.
- Browser/performance smoke tests.
- Docs link check.

## Tool Notes

### Vitest Bench

Vitest supports benchmark tests via `bench`, powered by Tinybench. The Vitest docs mark benchmarking as experimental, so use it for local and CI signal, but avoid treating one local run as absolute truth.

### Size Limit

Size Limit is designed to enforce JavaScript performance budgets in CI. It can check every commit, calculate real user cost, include dependencies and polyfills, and show why a bundle has its size.

### publint

publint checks npm packages for compatibility across environments such as Vite, Webpack, Rollup, and Node. Use it before publishing.

### Are The Types Wrong

Are The Types Wrong analyzes packed npm package contents for TypeScript type and module-resolution problems, especially ESM-related issues.

### tsdown / Vite+ pack

Vite+ `vp pack` uses the tsdown library-bundling path. tsdown supports package validation integrations with publint and Are The Types Wrong, so prefer wiring those through the pack flow when we add the optional dependencies.

## Procedure To Implement Later

1. Wait until Project Editor uses real runtime primitives.
2. Add benchmark files beside the relevant runtime tests.
3. Add `pnpm bench`.
4. Add Size Limit with loose initial budgets.
5. Add package validation after `vp pack`.
6. Add a consumer fixture.
7. Add CI jobs.
8. Tighten budgets only after baseline data exists.

## Sources

- [Vitest benchmarking](https://vitest.dev/guide/features#benchmarking-experimental)
- [Vitest bench API](https://vitest.dev/api/test#bench)
- [Vitest benchmark config](https://vitest.dev/config/benchmark)
- [CodSpeed Vitest benchmarks](https://codspeed.io/docs/benchmarks/nodejs/vitest)
- [Size Limit](https://github.com/ai/size-limit)
- [publint](https://publint.dev/docs/)
- [Are The Types Wrong CLI](https://github.com/arethetypeswrong/arethetypeswrong.github.io/tree/main/packages/cli)
- [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points)
- [npm package files](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files)
- [Changesets](https://github.com/changesets/changesets)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [tsdown package validation](https://tsdown.dev/options/lint)
- [tsdown package validation](https://tsdown.dev/options/lint)
- [Node.js packages documentation](https://nodejs.org/api/packages.html)
- [npm package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
- [Changesets](https://github.com/changesets/changesets)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
