# `Logger`

Source: [Effect v4 `Logger` API](https://www.effect.website/docs/v4/api/effect/Logger). Examples assume `import { Logger } from "effect"`.

`Logger` provides structured logging services, levels, annotations, and formatting that can be replaced and scoped through Layers.

## API index

1. [Logger.layer](#loggerlayer)
2. [Logger.make](#loggermake)
3. [Logger.formatJson](#loggerformatjson)
4. [Logger.consolePretty](#loggerconsolepretty)
5. [Logger.withLeveledConsole](#loggerwithleveledconsole)
6. [Logger.batched](#loggerbatched)
7. [Logger.toFile](#loggertofile)
8. [Logger.map](#loggermap)
9. [Logger.defaultLogger](#loggerdefaultlogger)

### Additional known APIs (not expanded)

`Logger`, `Options`, `isLogger`, `CurrentLoggers`, `LogToStderr`, `withConsoleLog`, `withConsoleError`, `formatSimple`, `formatLogFmt`, `formatStructured`, `consoleLogFmt`, `consoleStructured`, `consoleJson`, `tracerLogger`

### [Logger.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:1130)

Installs one or more loggers for downstream effects. By default it replaces the active set; pass `mergeWithExisting: true` to retain existing loggers.

```ts
const live = Logger.layer([Logger.consolePretty()]);
const program = Effect.log("started").pipe(Effect.provide(live));
```

### [Logger.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:476)

Creates a logger from a function that receives the complete log event and returns its output.

```ts
const logger = Logger.make((options) =>
  `[${options.logLevel}] ${String(options.message)}`,
);
```

### [Logger.formatJson](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:709)

Formats log events as one-line JSON strings, suitable for structured log ingestion.

```ts
const live = Logger.layer([Logger.withConsoleLog(Logger.formatJson)]);
```

### [Logger.consolePretty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:861)

Creates a human-readable logger that writes formatted entries to the console. It is useful for local development and terminal output.

```ts
const live = Logger.layer([Logger.consolePretty({ colors: true })]);
```

### [Logger.withLeveledConsole](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:350)

Routes each log level to its corresponding console method, such as `info`, `warn`, or `error`.

```ts
const live = Logger.layer([
  Logger.withLeveledConsole(Logger.formatSimple),
]);
```

### [Logger.batched](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:764)

Buffers logger output and periodically flushes a batch in a scoped background process. Remaining output is flushed when the scope closes.

```ts
const batched = Logger.batched(Logger.formatJson, {
  window: "1 second",
  flush: (messages) => Effect.log(`flushed ${messages.length}`),
});
```

### [Logger.toFile](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:1252)

Creates a scoped logger that batches string output and writes it to a file. The effect requires `FileSystem` and `Scope`.

```ts
const fileLogger = Logger.formatJson.pipe(Logger.toFile("/tmp/app.log"));
```

### [Logger.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:227)

Transforms an existing logger's output without changing how it receives log events.

```ts
const json = Logger.formatStructured.pipe(
  Logger.map((entry) => JSON.stringify(entry)),
);
```

### [Logger.defaultLogger](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Logger.ts:509)

The logger used by the Effect runtime by default.

```ts
const live = Logger.layer([Logger.defaultLogger]);
```
