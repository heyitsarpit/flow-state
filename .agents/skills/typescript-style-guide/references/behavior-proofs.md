# Behavior proofs

Read this when a change affects observable behavior, a public type, a failure
path, cleanup, ordering, interruption, or concurrency.

## Test the real seam

Choose the smallest seam that proves the changed contract:

- Pure functions: laws and boundary cases.
- Ports and services: behavior with a named fake.
- Schemas and public types: decode and compile proofs.
- Adapters: the foreign boundary and its mapping.
- Host code: the integration behavior.
- Resources and concurrency: lifetime, interruption, ordering, cleanup, and capacity when the contract needs them.

Focused checks are enough when the change is focused. Expand them when the
change crosses a package or host boundary.

## Prove behavior, not implementation shape

- Name tests after laws and failure paths.
- Assert observable values, errors, calls, ordering, and cleanup.
- Share fixture scaffolding, not scenario identity or mutable state.
- Use `@effect/vitest` for Effect-aware declarations and assertions.
- Use `it.effect` for an Effect-returning test.
- Use regular `it` for pure synchronous behavior.

```ts
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

describe("lookup", () => {
  it.effect("returns the requested account", () =>
    Effect.gen(function* () {
      const account = yield* lookup(accountId);
      assert.strictEqual(account.id, accountId);
    }));
});
```

Prefer a named fake over a broad mock:

```ts
const calls: string[] = [];
const port = {
  deploy: (stage: string) => Effect.sync(() => {
    calls.push(`deploy:${stage}`);
    return deployed;
  }),
  destroy: (stage: string) => Effect.sync(() => {
    calls.push(`destroy:${stage}`);
  }),
} satisfies Pick<StageLifecyclePort, "deploy" | "destroy">;
```

Avoid a module mock, snapshot, conditional assertion, real sleep, or broad
fixture when it hides the law under test.

## Prove public reachability

- Import public values and types through the public facade.
- Keep internal imports on the owning module.
- Add a type-level proof when a public export changes.
- Preserve literal, tuple, readonly, `Result`, `Effect`, and failure-channel information.

## Prove cleanup and interruption when relevant

If a change owns a resource or concurrent task, test the relevant exit paths:

- Normal success.
- Expected failure.
- Defect.
- Interruption or cancellation.
- Cleanup failure.
- Ordering or capacity.

Do not add every case to every test. Add the cases that the changed contract
can expose.
