# `Scope`

Source: [Effect v4 `Scope` API](https://www.effect.website/docs/v4/api/effect/Scope). Examples assume `import { Effect, Exit, Scope } from "effect"`.

## API index

1. [Scope.make](#scopemake)
2. [Scope.addFinalizer](#scopeaddfinalizer)
3. [Scope.addFinalizerExit](#scopeaddfinalizerexit)
4. [Scope.close](#scopeclose)
5. [Scope.use](#scopeuse)
6. [Scope.provide](#scopeprovide)
7. [Scope.fork](#scopefork)
8. [Scope](#scope)

### Additional known APIs (not expanded)

`TypeId`, `Closeable`, `State.Empty`, `State.Open`, `State.Closed`, `makeUnsafe`, `forkUnsafe`, `closeUnsafe`

### [Scope.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:251)

Creates a closeable scope that runs registered finalizers sequentially or in parallel.

```ts
const program = Effect.gen(function*() {
  const scope = yield* Scope.make("sequential");
  yield* Scope.close(scope, Exit.void);
});
```

### [Scope.addFinalizer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:402)

Registers an effect to run when the scope closes.

```ts
const program = Effect.gen(function*() {
  const scope = yield* Scope.make();
  yield* Scope.addFinalizer(scope, Effect.log("released"));
  yield* Scope.close(scope, Exit.void);
});
```

### [Scope.addFinalizerExit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:366)

Registers cleanup that can inspect whether the scope closed successfully or with failure.

```ts
const program = Effect.gen(function*() {
  const scope = yield* Scope.make();
  yield* Scope.addFinalizerExit(scope, (exit) =>
    Effect.log(Exit.isSuccess(exit) ? "ok" : "failed"),
  );
  yield* Scope.close(scope, Exit.void);
});
```

### [Scope.close](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:520)

Closes a scope and runs all registered finalizers with the supplied `Exit`.

```ts
const program = Effect.gen(function*() {
  const scope = yield* Scope.make();
  yield* Scope.addFinalizer(scope, Effect.log("cleanup"));
  yield* Scope.close(scope, Exit.fail("request failed"));
});
```

### [Scope.use](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:569)

Runs an effect with a supplied closeable scope and closes that scope when the effect exits.

```ts
const scoped = Effect.gen(function*() {
  const scope = yield* Scope.make();
  return yield* Scope.use(scope)(Effect.succeed("work"));
});
```

### [Scope.provide](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:317)

Provides an existing scope to an effect without closing it automatically.

```ts
const scoped = Effect.gen(function*() {
  const scope = yield* Scope.make();
  yield* Scope.provide(scope)(Effect.addFinalizer(Effect.log("cleanup")));
  yield* Scope.close(scope, Exit.void);
});
```

### [Scope.fork](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:439)

Creates a child scope whose lifetime is attached to its parent.

```ts
const program = Effect.gen(function*() {
  const parent = yield* Scope.make();
  const child = yield* Scope.fork(parent, "sequential");
  yield* Scope.close(parent, Exit.void);
  return child.state._tag;
});
```

### [Scope](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Scope.ts:224)

`Scope` is the service representing a resource lifetime and its finalizer strategy.

```ts
const resource = Effect.gen(function*() {
  const scope = yield* Scope.Scope;
  yield* Scope.addFinalizer(scope, Effect.log("released"));
  return "resource";
});
```
