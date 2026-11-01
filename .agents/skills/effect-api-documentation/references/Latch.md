# `Latch`

Source: [installed Effect rc.112 `Latch` source](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts). Examples assume `import { Effect, Fiber, Latch } from "effect"`.

`Latch` is a reusable fiber gate: it can open for current and future waiters, release only current waiters, and close to suspend later work again.

## API index

1. [Latch.make](#latchmake)
2. [Latch.await](#latchawait)
3. [Latch.open](#latchopen)
4. [Latch.release](#latchrelease)
5. [Latch.close](#latchclose)
6. [Latch.whenOpen](#latchwhenopen)

### Additional known APIs (not expanded)

`Latch`, `makeUnsafe`, `openUnsafe`, `closeUnsafe`

### [Latch.make](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts:164)

Creates a latch inside `Effect`. It starts closed unless `true` is passed.

```ts
const latch = yield* Latch.make(false);
```

### [Latch.await](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts:266)

Suspends until the latch is open or the current waiters are released. An open latch completes immediately.

```ts
const waiter = latch.await.pipe(Effect.as("ready"));
```

### [Latch.open](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts:198)

Opens the latch and releases current and future waiters. The result is `true` only when the state changed.

```ts
yield* Latch.open(latch);
```

### [Latch.release](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts:241)

Releases the current waiters without opening the latch; later waiters still suspend.

```ts
yield* Latch.release(latch);
```

### [Latch.close](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts:293)

Closes an open latch so future `await` calls suspend again.

```ts
yield* Latch.close(latch);
```

### [Latch.whenOpen](/Users/arpit/Developer/flow-state/node_modules/effect/src/Latch.ts:338)

Gates another effect behind the latch while preserving that effect's success, failure, and requirements.

```ts
const workAfterReady = Latch.whenOpen(latch, Effect.succeed("started"));
```
