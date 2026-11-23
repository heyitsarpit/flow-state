# `Terminal`

Source: installed declarations and JavaScript in `effect@4.1.4` (`node_modules/effect/dist/Terminal.d.ts`, `Terminal.js`). Node implementation: `node_modules/@effect/platform-node-shared/dist/NodeTerminal.js` and `node_modules/@effect/platform-node/dist/NodeTerminal.js`. Examples assume `import { Console, Effect, Layer, Queue, Terminal } from "effect"`.

`Terminal` is the service for interactive terminal capabilities: column and row counts, a size subscription, key input, a line read, and display. Programs depend on the service, and the platform layer or a test stub provides it.

**Stability:** the module is `@stability unstable` (`Terminal.d.ts:10`), and every export below repeats that marker, so a minor release may break it.

**Requirement:** `Terminal.make` now requires `size`. The `Terminal` interface declares `size` as a required member (`Terminal.d.ts:45`), and `make` takes `Omit<Terminal, typeof TypeId>` (`Terminal.d.ts:200`).

## API index

1. [Terminal.Terminal](#terminalterminal)
2. [Terminal.make](#terminalmake)
3. [Terminal.QuitError](#terminalquiterror)
4. [Terminal.isQuitError](#terminalisquiterror)

### Additional known APIs (not expanded)

`Terminal` (interface), `Size`, `Key`, `UserInput`

### [Terminal.Terminal](/Users/arpit/Developer/flow-state/node_modules/effect/dist/Terminal.d.ts:180)

The service tag for terminal capabilities. Yield it to get a `Terminal`, or provide one with `Layer.succeed(Terminal.Terminal, impl)`.

**Signature**

```ts
export declare const Terminal: Context.Service<Terminal, Terminal>;

export interface Terminal {
    readonly [TypeId]: typeof TypeId;
    readonly columns: Effect.Effect<number>;
    readonly rows: Effect.Effect<number>;
    readonly size: Effect.Effect<Queue.Dequeue<Size, Cause.Done>, never, Scope.Scope>;
    readonly readInput: Effect.Effect<Queue.Dequeue<UserInput, Cause.Done>, never, Scope.Scope>;
    readonly readLine: Effect.Effect<string, QuitError>;
    readonly display: (text: string) => Effect.Effect<void, PlatformError>;
}
```

**Confirmed behaviour**

- The tag is `Context.Service<Terminal, Terminal>` (`Terminal.d.ts:180`; `Terminal.js:63`).
- `columns` and `rows` are `Effect`s (`Terminal.d.ts:35`, `:39`). The Node implementation reads `process.stdout.columns ?? 0` (`NodeTerminal.js:91`-`92`). Confirmed at runtime: with stdout piped, `columns` was `0`.
- `size` yields a queue that starts with the current dimensions and keeps only the latest change (`Terminal.d.ts:40`-`45`). The Node implementation uses `Queue.sliding(1)` (`NodeTerminal.js:93`-`106`). It needs a `Scope` and ends when the scope closes.
- `readInput` yields a queue of `UserInput` events and needs a `Scope` (`Terminal.d.ts:49`). The Node implementation enables raw mode only for key input (`NodeTerminal.js:82`).
- `readLine` yields one line and fails with `QuitError` on cancel (`Terminal.d.ts:53`).
- `display` writes text to the default output and can fail with `PlatformError` (`Terminal.d.ts:57`).

```ts
import { Effect, Terminal } from "effect"

export const dims = Effect.gen(function*() {
  const terminal = yield* Terminal.Terminal
  const columns = yield* terminal.columns
  const rows = yield* terminal.rows
  yield* terminal.display(`${columns}x${rows}\n`)
})
```

### [Terminal.make](/Users/arpit/Developer/flow-state/node_modules/effect/dist/Terminal.d.ts:200)

Creates a `Terminal` service implementation from the members of the interface. The result is a `Terminal` value, so it can be passed to `Layer.succeed(Terminal.Terminal, ...)`.

**Signature**

```ts
export declare const make: (impl: Omit<Terminal, typeof TypeId>) => Terminal;
```

**Confirmed behaviour**

- Declaration at `Terminal.d.ts:200`; implementation `impl => Terminal.of({ ...impl, [TypeId]: TypeId })` at `Terminal.js:83`-`85`.
- `size` is required: the object literal without it fails the type check with `TS2741: Property 'size' is missing` (checked with `tsc` against the same literal shape). The runtime constructor does not check the members, so the omission only shows up in the type check.
- Type check passes when `size` is given, for example `size: Effect.die("unused")`.

```ts
import { Console, Effect, Layer, Terminal } from "effect"

export const stub = Terminal.make({
  columns: Effect.succeed(80),
  rows: Effect.succeed(24),
  size: Effect.die("unused"),
  readInput: Effect.die("unused"),
  readLine: Effect.die("unused"),
  display: (text) => Console.log(text)
})

export const TerminalStub = Layer.succeed(Terminal.Terminal, stub)
```

### [Terminal.QuitError](/Users/arpit/Developer/flow-state/node_modules/effect/dist/Terminal.d.ts:140)

The error `readLine` fails with when the user cancels, usually with Ctrl+C. It is a `Schema.Error("QuitError")` class with `_tag: "QuitError"` (`Terminal.js:21`).

**Signature**

```ts
export declare class QuitError extends QuitError_base {
    readonly [QuitErrorTypeId] = "~effect/Terminal/QuitError";
}
```

**Confirmed behaviour**

- Declaration at `Terminal.d.ts:140`; class at `Terminal.js:21`.
- Matched at runtime by `Terminal.isQuitError`, not by `instanceof`.
- `Command.runWith` treats a `QuitError` as an interruption (`cli/Command.js:1338`; see `Cli.md`).

```ts
import { Effect, Terminal } from "effect"

export const ask = Effect.gen(function*() {
  const terminal = yield* Terminal.Terminal
  return yield* terminal.readLine.pipe(
    Effect.catchTag("QuitError", () => Effect.succeed(""))
  )
})
```

### [Terminal.isQuitError](/Users/arpit/Developer/flow-state/node_modules/effect/dist/Terminal.d.ts:167)

Returns `true` for a `QuitError`, and narrows an unknown failure to it.

**Signature**

```ts
export declare const isQuitError: (u: unknown) => u is QuitError;
```

**Confirmed behaviour**

- Declaration at `Terminal.d.ts:167`; implementation `Predicate.hasProperty(u, QuitErrorTypeId)` at `Terminal.js:50`. It checks the marker property, not the class.

```ts
import { Terminal } from "effect"

export const label = (error: unknown) => Terminal.isQuitError(error) ? "cancelled" : "failed"
```

## Project use (`packages/flow-state-v3`)

- `src/host/cli/main.ts` does not touch `Terminal` directly; `effect/cli` takes it from the environment (`Cli.md`).
