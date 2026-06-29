# TypeScript Guidance

This file captures the TypeScript constraints and patterns that Phase 18 must respect.

Use it before changing the public package split, exported API shapes, or declaration emit strategy.

## Scope

This guidance is for:

- strict-mode library authoring
- multi-entry package exports
- declaration portability
- inference-first public APIs
- app/example ergonomics under consumer tsconfigs we do not control

## Current Conclusion

Flow State should stay inference-first for ordinary app code, but exported public surfaces must remain:

- nameable
- declaration-portable
- compatible with strict consumer configs
- stable across multiple package entrypoints

The library should absorb type complexity. App code should not need wrapper inventories like `ReturnType<typeof flow.refresh>` or giant `FlowTransactionDefinition<...>` annotations just to make declaration emit or framework builds pass.

That said, the same ideal may not be fully reachable under every TypeScript mode. The goal is not to promise one perfect zero-annotation shape everywhere. The goal is to find, prove, and document the best achievable ergonomic shape per mode.

## Proven So Far

The current proof harness pairs shared fixture source under `packages/flow-state/typecheck/`
with dedicated proof packages under `examples/typescript-proof-*`, and those packages
run against built `dist` declarations as part of `pnpm --filter @flow-state/core build`.

As of June 29, 2026, the proven outcome is:

- `strict` baseline supports inference-first exported resource, transaction, view, and command descriptors in a smaller fixture than Launch Workspace.
- `strict + isolatedModules` supports the same clean exported descriptor style in that smaller fixture.
- `strict + isolatedDeclarations` does not support the same clean export style. Exported values need explicit annotations, and local helper values that appear in exported annotations also need explicit types.
- `multi-entry declaration emit` now passes in a dedicated staged-surface harness that exports contracts across `@flow-state/core`, `@flow-state/core/react`, `@flow-state/core/server`, `@flow-state/core/inspect`, and `@flow-state/core/testing`.
- The core strict, `isolatedModules`, `isolatedDeclarations`, and multi-entry checks now run through dedicated proof packages, each with its own `tsconfig.json`, so the important mode combinations are exercised as consumer-package proofs instead of only as in-package raw `tsc` invocations.
- That multi-entry proof depends on clean public ownership: server boot types, inspect artifact types, and testing harness/model types are imported from their owning public entrypoints instead of the root `@flow-state/core` surface.
- The shipped Launch Workspace package config in `examples/launch-workspace/tsconfig.json` is now proved directly by `pnpm --filter @flow-state/launch-workspace check:typescript-mode-proofs`, so the full flagship example is covered under its real `strict + isolatedModules` package settings instead of only by `next build`.
- Root `@flow-state/core` and staged `@flow-state/core/server` now re-export the helper types that inferred exported surfaces actually depend on, so consumer builds can name `flow.machine(...)`, `flow.transaction(...)`, `flow.module(...)`, and `flow.runtime(...)` through public entrypoints instead of hashed internal declaration chunks.
- Even outside `isolatedDeclarations`, heavy exported app/runtime wiring can trip TS7056 serialization limits sooner than descriptor exports do. The practical baseline is to keep descriptor exports inference-first, and keep heavyweight app/runtime assembly local unless it needs a named exported type.

The current partial boundary is:

- The full Launch Workspace package is not a good `isolatedDeclarations` target today. Forcing declaration emit across the whole app currently requires broad explicit annotations across domain constants, service-tag classes, React component return types, and exported spread-heavy helper values.
- That is a real TypeScript constraint, not a cue to normalize blanket library-shaped annotations across app code.
- The preferred target is narrower: keep library public descriptors portable under `isolatedDeclarations`, keep ordinary app/example code on its shipped `strict + isolatedModules` config, and use named public types only where exported app surfaces genuinely need them.
- In the current Launch Workspace proof, feature modules and exported descriptors stay inference-first, the rest-arg `flow.app(moduleA, moduleB, ...)` form removes the extra module-list value plumbing from the exported app assembly, and the exported app-layer constants infer directly from `LaunchWorkspaceApp.layer(...)`. The remaining named fallback is still the exported `FlowAppDefinition` boundary for the heavyweight `LaunchWorkspaceApp` export under the shipped package config.

The preferred fallback under `isolatedDeclarations` is:

- export individual values instead of wrapper-inventory objects
- use library-owned named public result types such as `FlowRefreshDefinition`, `FlowPatchDefinition`, `FlowInvalidateDefinition`, and `FlowRunDefinition`
- use existing named descriptor types such as `FlowResourceDefinition`, `FlowTransactionDefinition`, and `FlowViewDefinition`
- use the rest-arg `flow.app(moduleA, moduleB, ...)` form when an exported app assembly would otherwise need a separate module-list value plus config wrapper around `flow.app(...)`
- keep app/runtime assembly local where possible instead of exporting giant inferred values

The preferred fallback is not:

- exported `Readonly<{ readonly refreshProject: ReturnType<typeof flow.refresh>; ... }>` inventories
- broad “annotate everything” guidance
- teaching the example to compensate for a missing library-owned result type when a narrow public type can absorb the pressure
- turning the whole flagship app into an `isolatedDeclarations` compliance exercise when the library/public descriptor boundary is the real portability target

## Version Notes

As of June 29, 2026:

- TypeScript 6.0 has official release notes.
- I do not have a separate official TypeScript 7.0 release-notes page confirmed from this pass.
- The clearest TS7-era official guidance still comes from the TS6 migration and declaration-stability notes, especially around `--stableTypeOrdering`.

## High-Risk Flags And Features

These are the first things to check when a public API looks elegant in local editor inference but starts failing in builds, declaration emit, or consumer repos.

### Core Strictness

- `strict`
- `strictNullChecks`
- `exactOptionalPropertyTypes`
- `noUncheckedIndexedAccess`

### Emit And Isolation

- `isolatedModules`
- `isolatedDeclarations`
- `declaration`
- `composite`
- `verbatimModuleSyntax`

### Module And Package Boundaries

- `moduleResolution: "bundler"`
- `moduleResolution: "nodenext"`
- package `exports` maps
- multi-entry declaration ownership
- ESM source imports with output `.js` extensions

### TS6 And TS7-Era Stability Pressure

- declaration-output stability across compiler upgrades
- order-dependent inference that changes `.d.ts` emit
- exported inferred constants whose names depend on internal generated types
- multi-entry builds where one entrypoint leaks types from another entrypoint's implementation chunk

## What These Flags Mean For Flow State

### `isolatedModules`

Design as if each file can be checked in isolation.

This punishes patterns like:

- value exports that are really type-only
- module syntax that relies on TS rewriting it later
- export shapes that depend on cross-file knowledge

Library guidance:

- prefer `import type` and `export type`
- keep runtime and type boundaries explicit
- do not assume React, testing, and server-only imports can safely share one root path

### `isolatedDeclarations`

This is the biggest constraint for Phase 18.

Design as if each exported declaration must be emitted from local information alone.

This punishes patterns like:

- exported inferred objects whose type depends on non-local helper types
- exported builders that only become nameable after deep cross-file inference
- public values whose declaration names point into generated or hashed internal files

Library guidance:

- non-trivial exported public values should have a stable, portable public type path
- if app code needs explicit annotations only to satisfy declaration portability, the library API is still too type-loud
- fix the library or the declaration strategy before normalizing app-side wrapper types
- it is possible that some exported DSL shapes will never keep the cleanest inference-only style under this flag; if so, document the limit plainly and provide the lightest-weight library-owned fallback

### `verbatimModuleSyntax`

This is a good forcing function.

It means:

- type-only imports must be marked as type-only
- TS will not quietly rewrite module syntax into a different runtime shape
- package entrypoints need to be honest about their runtime environment

Library guidance:

- use `import type` and `export type` consistently
- keep React-only code out of core and server entrypoints by construction
- keep testing helpers off client-facing import paths by construction

### `moduleResolution: "bundler"`

This can hide real npm-consumer problems if used as the only validation mode.

Library guidance:

- do not trust a bundler-only success signal for a published multi-entry package
- validate that entrypoints, emitted `.d.ts`, and runtime import specifiers still make sense for Node-compatible consumers

## What Good App Code Should Look Like

The target is app code that describes domain behavior and relies on library inference.

```ts
export const projectResource = flow.resource({
  id: "launch.project",
  key: (id: LaunchProjectId) => ["launch.project", id] as const,
  lookup: (id) => loadProject(id),
});

export const saveProject = flow.transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
  }),
  commit: persistProject,
  routes: flow.outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
});
```

Good signs:

- domain types are named where they matter
- exported values read like domain declarations
- no wrapper inventory exists just to preserve inference
- the public type can be emitted without reaching into private generated symbols

## Mode-By-Mode Target

We should optimize for the most ideal achievable code in each mode, not assume every mode can reach the same end state.

### Baseline Strict Mode

Target:

- ordinary app exports are inference-first
- domain types are named where meaningful
- app code rarely needs library-owned helper annotations

Preferred shape:

```ts
export const saveProject = flow.transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
  }),
  commit: persistProject,
});
```

### `isolatedModules`

Target:

- same app ergonomics as baseline strict mode
- explicit type-only import/export hygiene
- no hidden reliance on compiler rewrites

Preferred shape:

- app code still mostly looks inference-first
- library authors bear the burden of module-syntax discipline

### `isolatedDeclarations`

Target:

- preserve inference for ordinary local authoring
- keep exported app code as light as possible
- avoid app-owned wrapper inventories and giant generic pinning
- accept that some non-trivial exported public values may need a stable named public type path supplied by the library

Preferred shape if fully achievable:

```ts
export const saveProject = flow.transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
  }),
  commit: persistProject,
});
```

Fallback shape if the ideal cannot be proved:

```ts
export const saveProject = defineTransaction(
  flow.transaction({
    id: "launch.save-project",
    params: ({ context }) => ({
      id: context.activeProjectId,
      draft: context.draft,
    }),
    commit: persistProject,
  }),
);
```

or

```ts
export const saveProject: FlowTransactionResult<
  "launch.save-project",
  SaveProjectParams,
  LaunchProject,
  ProjectSaveError,
  LaunchWorkspaceEvent
> = flow.transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
  }),
  commit: persistProject,
});
```

Important constraint:

- if a mode cannot support the cleanest inference-first export shape, the fallback should still be library-owned and narrow
- do not push the burden onto app-side wrapper object types like `Readonly<{ readonly refreshProject: ReturnType<typeof flow.refresh> }>`

## If The Ideal Is Not Reachable

For any flag or mode, especially `isolatedDeclarations`, follow this order:

1. Prove whether the cleanest inference-first shape actually fails.
2. Try a library-side fix first.
3. If the ideal still fails, design the smallest public ergonomic assist.
4. Document the limitation and the preferred fallback in docs.
5. Do not silently normalize workaround-heavy app code as the new standard.

Acceptable library-owned ergonomic assists may include:

- named stable public result types
- final per-surface helper exports
- `define*` helpers that stabilize declaration emit
- `satisfies`-oriented object shapes
- dedicated exports for common descriptor results

Unacceptable default fallback:

- app-owned wrapper inventory types
- repeating giant generic helper annotations across examples
- undocumented “just annotate everything” guidance

## Proof Requirement

Before we bless any API shape for Phase 18, we should prove it against a small matrix rather than trusting one repo build.

Minimum proof targets:

- strict baseline
- strict + `isolatedModules`
- strict + `isolatedDeclarations`
- multi-entry declaration emit
- current Launch Workspace example
- a tiny declaration-pressure fixture smaller than Launch Workspace

For each mode, capture:

- ideal attempted shape
- whether it compiles
- whether declaration emit stays portable
- whether the fallback is library-owned or app-owned
- the final recommended style for docs

## Documentation Requirement

The docs should eventually say plainly:

- which TypeScript modes fully support the cleanest inference-first app code
- which modes require a narrower but still ergonomic library-owned fallback
- which helper exports exist specifically to reduce handwritten code in stricter emit modes

The docs should not imply that every TypeScript mode can always support the exact same zero-annotation public export style if the proof work says otherwise.

## What Bad App Code Looks Like

These are design smells unless they model real domain concepts.

### Wrapper Types That Only Exist For Library Emit

```ts
type LaunchCommandContracts = Readonly<{
  readonly refreshProject: ReturnType<typeof flow.refresh>;
  readonly previewProjectPatch: ReturnType<typeof flow.patch>;
}>;

export const launchCommandContracts: LaunchCommandContracts = {
  refreshProject: flow.refresh(Project.byId.ref(fixtureProjectId)),
  previewProjectPatch: flow.patch(Project.byId.ref(fixtureProjectId), {
    name: "Atlas v2",
  }),
};
```

Why this is bad:

- it describes library machinery, not domain meaning
- it teaches the example to compensate for a library emit problem
- it tends to spread once accepted

### Giant Public Helper Annotations On Ordinary Exports

```ts
export const saveProjectTransaction: FlowTransactionDefinition<
  "launch.save-project",
  SaveProjectParams,
  LaunchProject,
  ProjectSaveError,
  unknown,
  LaunchWorkspaceEvent
> = flow.transaction({
  /* ... */
});
```

Why this is bad by default:

- it makes app code conform to the library instead of the opposite
- it is often a symptom of declaration portability or multi-entry leakage
- it should only survive if a documented TS constraint makes it unavoidable and the library fix is tracked

## Preferred Library Techniques

Use these before asking apps to write more types.

### `satisfies`

Use `satisfies` to validate structure while keeping the inferred literal shape.

Good for:

- exported config-ish objects
- route maps
- command maps
- inventories and registries

### `const` Type Parameters

Prefer `const` type parameters in library APIs when the goal is to preserve literal inference without forcing app authors to scatter `as const`.

### Named Public Types For Non-Trivial Exports

If a public value is genuinely non-trivial, the library should provide a stable public type path for it.

Examples:

- named result helpers
- named transaction descriptor return types
- named inspect artifact types
- stable entrypoint-specific React/testing/server public types

If `isolatedDeclarations` blocks the cleanest export form, prefer this kind of narrow library-owned named type over app-owned wrapper inventories.

### Final Surface-Specific Entry Points

The package split should reduce type leakage as much as it reduces bundle leakage.

Target surfaces:

- `@flow-state/core`
- `@flow-state/react`
- `@flow-state/testing`
- `@flow-state/server`
- `@flow-state/inspect`

This helps because:

- React types and hooks stop leaking into core/server paths
- testing helpers stop appearing in app-facing declaration graphs
- server boot helpers stop riding along the browser-oriented root path
- inspect tooling can evolve separately from the execution core

## Concrete Rules For Phase 18

- Do not accept app-side wrapper types as the normal solution.
- Do not accept one omnibus root entrypoint as the final surface.
- Do not treat `next build` success under the current repo tsconfig as sufficient proof.
- Do require exported public values to remain portable under `strict`, `isolatedModules`, and `isolatedDeclarations`.
- Do add a small reproducible declaration-pressure fixture that is smaller than Launch Workspace.
- Do keep per-entry bundle and per-entry declaration ownership explicit.

## Package Authoring Baseline

When evaluating the final library surface, prefer a baseline compatible with official TypeScript library guidance:

- `strict: true`
- `declaration: true`
- `verbatimModuleSyntax: true`
- explicit entrypoint `exports`
- explicit `types` conditions per entrypoint
- Node-compatible ESM publishing assumptions unless a surface is explicitly browser-only

`moduleResolution: "bundler"` is useful for apps, but should not be the only proof mode for a published package.

## References

Official TypeScript sources:

- Choosing Compiler Options
  - https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html
- TypeScript 6.0 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- TypeScript 5.8 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
- TypeScript 5.6 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html
- TypeScript 5.5 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html
- TypeScript 5.0 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html
- TypeScript 4.9 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
- TypeScript 4.7 release notes
  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html
- `isolatedModules`
  - https://www.typescriptlang.org/tsconfig/isolatedModules.html
- `isolatedDeclarations`
  - https://www.typescriptlang.org/tsconfig/isolatedDeclarations.html
- `verbatimModuleSyntax`
  - https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html
- `exactOptionalPropertyTypes`
  - https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html
- `noUncheckedIndexedAccess`
  - https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html

Helpful secondary context:

- Chris Krycho, “Isolated Declarations and Zod”
  - https://v5.chriskrycho.com/notes/isolated-declarations-and-zod/
- Marvin Hagemeister, “Speeding up the JavaScript ecosystem - part 10”
  - https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-10/
