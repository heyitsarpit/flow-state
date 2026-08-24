# `TestConsole`

Testing-specific reference for capturing Effect console output without writing to the host console.

Source: [Effect v4 `TestConsole` API](https://www.effect.website/docs/v4/api/effect/testing/TestConsole). Examples use `TestConsole` from `effect/testing`.

## API index

1. [TestConsole.layer](#testconsolelayer)
2. [TestConsole.logLines](#testconsoleloglines)
3. [TestConsole.errorLines](#testconsoleerrorlines)
4. [TestConsole.testConsoleWith](#testconsoletestconsolewith)
5. [TestConsole.make](#testconsolemake)
6. [TestConsole.Entry](#testconsoleentry)
7. [TestConsole.Method](#testconsolemethod)

### Additional known APIs (not expanded)

`TestConsole`

### [TestConsole.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:289)

Provides an in-memory console implementation so tests can assert on Effect console calls.

```ts
import { Console, Effect } from "effect"
import { TestConsole } from "effect/testing"

const program = Effect.gen(function*() {
  yield* Console.log("captured")
  return yield* TestConsole.logLines
}).pipe(Effect.provide(TestConsole.layer))
```

### [TestConsole.logLines](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:328)

Reads the arguments captured by `Console.log` in the provided test console.

```ts
import { Console, Effect } from "effect"
import { TestConsole } from "effect/testing"

const logs = Effect.gen(function*() {
  yield* Console.log("hello", 42)
  return yield* TestConsole.logLines
}).pipe(Effect.provide(TestConsole.layer))
```

### [TestConsole.errorLines](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:367)

Reads the arguments captured by `Console.error` in the provided test console.

```ts
import { Console, Effect } from "effect"
import { TestConsole } from "effect/testing"

const errors = Effect.gen(function*() {
  yield* Console.error("invalid input")
  return yield* TestConsole.errorLines
}).pipe(Effect.provide(TestConsole.layer))
```

### [TestConsole.testConsoleWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:253)

Accesses the provided test console when a test needs its service-specific capture state.

```ts
import { Effect } from "effect"
import { TestConsole } from "effect/testing"

const program = TestConsole.testConsoleWith((console) =>
  Effect.sync(() => console.log("captured directly")),
).pipe(Effect.provide(TestConsole.layer))
```

### [TestConsole.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:178)

Constructs an effect that yields an in-memory `TestConsole` value. Run it when
custom test-layer composition needs the service implementation directly.

```ts
import { Effect } from "effect"
import { TestConsole } from "effect/testing"

const testConsole = Effect.runSync(TestConsole.make)
```

### [TestConsole.Entry](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:140)

Describes one captured console invocation by method name and parameters.

```ts
import type { TestConsole } from "effect/testing"

const entry: TestConsole.Entry = {
  method: "error",
  parameters: ["not found"],
}
```

### [TestConsole.Method](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestConsole.ts:113)

Provides the union of console method names accepted by captured entries.

```ts
import type { TestConsole } from "effect/testing"

const method: TestConsole.Method = "log"
```
