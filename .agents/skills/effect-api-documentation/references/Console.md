# `Console`

Source: [Effect v4 `Console` API](https://www.effect.website/docs/v4/api/effect/Console). Examples use `Console` from `effect`.

## API index

1. [Console.log](#consolelog)
2. [Console.error](#consoleerror)
3. [Console.consoleWith](#consoleconsolewith)
4. [Console.withGroup](#consolewithgroup)
5. [Console.withTime](#consolewithtime)
6. [Console.group](#consolegroup)
7. [Console.time](#consoletime)
8. [Console.warn](#consolewarn)

### Additional known APIs (not expanded)

`Console`, `assert`, `clear`, `count`, `countReset`, `debug`, `dir`, `dirxml`, `groupEnd`, `info`, `table`, `timeLog`, `trace`

### [Console.log](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:406)

Writes an ordinary log through the current console service, keeping output inside the Effect program.

```ts
import { Console, Effect } from "effect"

const program = Effect.gen(function*() {
  yield* Console.log("user loaded", { id: "user-1" })
})
```

### [Console.error](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:311)

Writes error-level output through the active console implementation.

```ts
import { Console, Effect } from "effect"

const program = Console.error("request failed", { status: 503 })
```

### [Console.consoleWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:97)

Runs an effect against the console implementation currently installed in the fiber context.

```ts
import { Console, Effect } from "effect"

const program = Console.consoleWith((console) =>
  Effect.sync(() => console.log("uses the active implementation")),
)
```

### [Console.withGroup](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:584)

Opens a console group around an effect and closes it on success, failure, or interruption.

```ts
import { Console, Effect } from "effect"

const program = Console.withGroup(
  Console.log("processing order"),
  { label: "order-42", collapsed: true },
)
```

### [Console.withTime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:638)

Times an effect and stops the timer when the effect completes.

```ts
import { Console, Effect } from "effect"

const program = Console.withTime(Effect.sleep("100 millis"), "database call")
```

### [Console.group](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:341)

Opens a scoped console group; the matching `groupEnd` runs when the scope closes.

```ts
import { Console, Effect } from "effect"

const program = Effect.scoped(
  Effect.gen(function*() {
    yield* Console.group({ label: "startup" })
    yield* Console.log("ready")
  }),
)
```

### [Console.time](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:465)

Starts a scoped timer that is automatically ended by resource finalization.

```ts
import { Console, Effect } from "effect"

const program = Effect.scoped(
  Effect.gen(function*() {
    yield* Console.time("migration")
    yield* Effect.sleep("1 second")
  }),
)
```

### [Console.warn](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Console.ts:554)

Writes warning-level output through the active console service.

```ts
import { Console } from "effect"

const program = Console.warn("deprecated configuration")
```
