# Ownership and APIs

Read this when a change moves code, adds a module, changes a type, or changes
the public surface.

## Give each concept one owner

- Give each production module one primary responsibility.
- Keep contracts, domain values, implementations, adapters, composition roots, and fixtures separate.
- Split when ownership, dependency direction, lifetime, or test seam differs.
- Keep a short, cohesive concept together.
- Keep a helper beside its only caller.
- Promote a helper when it has a stable owner, an independent contract, or meaningful reuse.
- Avoid `utils.ts`, `helpers.ts`, `manager.ts`, and `common.ts` drawers.

Name helpers after the domain rule they protect.

```ts
const joinPreviewUrl = (previewUrl: string, route: string) =>
  new URL(route, previewUrl).toString();
```

Avoid names such as `transform`, `normalize`, and `processData` when they hide
the invariant.

## Keep dependencies pointed inward

```text
domain/core <- ports/contracts <- live implementations <- CLI/React/server/host
```

- Core code does not import host frameworks, generated output, CLI code, or the public barrel.
- Put replaceable behavior behind a narrow port.
- Compose the live implementation at the host edge.
- Use a port for replacement, testing, or another runtime.

```ts
// Good: the core owns the seam; the host supplies the implementation.
export interface StageLifecyclePort {
  readonly deploy: (stage: string) => Effect.Effect<DeployResult, StageLifecycleError>;
  readonly destroy: (stage: string) => Effect.Effect<void, StageLifecycleError>;
}

export const StageLifecycleLive = Layer.effect(StageLifecycle, implementation);
```

Keep projections as pure transformations from admitted domain state to a read
model. Keep foreign-shape mapping in an explicit adapter at the boundary. Host
entrypoints own configuration and runtime execution; they run Effects once at
the edge rather than making the domain execute itself.

## Use file names as signals

- Domain modules hold values, types, pure transformations, and laws.
- `*Repository.ts`, `*Client.ts`, and `*Port.ts` hold narrow contracts and errors.
- `*Live.ts` holds one implementation and its Layer construction.
- `*Schema.ts` holds executable boundary schemas beside their types.
- `bin.ts`, `server.ts`, and `react-entry.ts` hold host integration.
- Tests hold behavior proofs and local fakes.

Keep a contract and its errors close. Keep mapping beside its implementation.
Keep process configuration at the host edge.

## Make phases visible

- Extract a policy, validation rule, or boundary when a name makes the behavior clearer.
- Prefer a short linear sequence to generic plumbing.
- Name phases after the domain.
- Do not split code only to meet a line-count target.

## Infer implementation return types

- Let named implementations, methods, and callbacks infer their return values by default.
- Keep explicit types when they express a consumer contract, predicate, assertion, overload, deliberate public abstraction, readonly publication, recursion, or a compile proof.
- In the rewrite package, `anti-slop/prefer-inferred-return-types` requires a standalone local comment for an exception:

  ```ts
  // RETURN_TYPE: Prevents callers from mutating the published collection.
  const collectNames = (names: readonly string[]): readonly string[] => [...names];
  ```

- The reason must name the contract or inference limit. `Readability` and `exported function` are not enough.
- This rule covers implementations in `src`, `test`, and static compiler fixtures.
- An exception for an outer function does not cover a nested callback.
- Do not delete an annotation mechanically. Do not replace it with a cast or move it to a local just to silence lint.
- Check literal, tuple, `readonly`, predicate, `Result`/`Effect`, public declaration, and proof behavior first.

## Keep services narrow

- A service owns one capability.
- Do not pass a god dependency record and carve it up with `Pick`.
- Use `Context.Service` and a `FooLive` Layer for a real dependency seam.
- Capture stable dependencies when building the Layer.
- Keep request values in the operation.
- Keep configuration at the composition root or host.

## Treat mutation as an ownership choice

- Keep mutable state private.
- Publish a readonly view at the real boundary.
- Copy once when publishing a persistent snapshot.
- Do not use `Object.freeze` or layers of shallow copies as ownership substitutes.
- Review private `readonly`, `Readonly`, `ReadonlyMap`, `ReadonlySet`, and `ReadonlyArray` against the owner contract.
- Contract-required public shapes are allowed. Use `Data` for immutable values when appropriate.
- Follow the configured `anti-slop/no-readonly` rule and its fixtures. Do not evade it with casts or runtime workarounds.

## Keep spacing semantic

- Put a blank line between meaningful phases in a sequential workflow.
- Keep statements in one phase together.
- Do not add blank lines after every statement or split one expression.
- Let formatter settings preserve this visual boundary.

## Design public entrypoints deliberately

- Internal modules import their owner directly.
- Consumers and public-surface proofs import the facade.
- Export only supported values, types, constructors, errors, and adapters.
- Avoid unreviewed `export *` trees.
- Preserve type information.
- Do not import package `dist` files or the package itself from inside the package.
- Prove public reachability with a type test.

```ts
// Bad: every internal helper becomes public.
export * from "./internal/index.js";

// Good: exports are curated and outward-only.
export { Account, AccountId } from "./account/Account.js";
export { AccountRepository, AccountRepositoryLive } from "./account/AccountRepository.js";
export type { AccountLookupError } from "./account/errors.js";
```

## Keep metadata and comments useful

- Keep project names, contract IDs, proof IDs, module paths, boundary labels, and owner labels in task or review records.
- Use neutral symbols and behavior names in source and tests.
- Comment the reason: ownership, invariant, compatibility, failure, lifetime, or safety.
- Do not narrate syntax.
- If a comment compensates for invisible ownership, improve the type or module boundary when possible.

## Do not make these blanket bans

These forms need context:

- Classes, interfaces, type aliases, arrows, and declarations.
- Bounded local mutation and generics, including `NoInfer`, `Parameters`, and `ReturnType`.
- `Promise`, `throw`, and `typeof` at an appropriate boundary.
- `Effect.gen`, `flatMap`, `Effect.succeed`, `Effect.fail`, and Layer composition.
- Public facades, internal barrels, larger files, and default exports with a clear owner.

Review meaning, ownership, and boundary placement. Do not erase useful type or
failure information to satisfy a mechanical rule.

## Start a greenfield module

Use this order when the module is new. Do not force it onto a small change:

1. Name the owner and boundary.
2. Define domain values, schemas, failures, and outcomes.
3. Define narrow ports and public contracts.
4. Implement pure policies and projections, then live services and explicit
   adapters.
5. Compose lifetimes and runtimes, then add the host entrypoint and run Effects
   once at the edge.
6. Curate exports and type-level reachability proofs.
7. Add separate behavior, failure, cleanup, ordering, and integration proofs.
