# `Config`

Source: [Effect v4 `Config` API](https://www.effect.website/docs/v4/api/effect/Config). Examples assume `import { Config } from "effect"`.

`Config` describes typed settings and validation; a `ConfigProvider` supplies the values from an environment, object, or other source.

## API index

1. [Config.schema](#configschema)
2. [Config.string](#configstring)
3. [Config.number](#confignumber)
4. [Config.boolean](#configboolean)
5. [Config.all](#configall)
6. [Config.withDefault](#configwithdefault)
7. [Config.option](#configoption)
8. [Config.orElse](#configorelse)
9. [Config.map](#configmap)
10. [Config.nested](#confignested)
11. [Config.duration](#configduration)
12. [Config.redacted](#configredacted)
13. [Config.url](#configurl)

### Additional known APIs (not expanded)

`Config`, `ConfigError`, `isConfig`, `mapOrFail`, `succeed`, `fail`, `unwrap`, `Success`, `Wrap`, `Boolean`, `Port`, `LogLevel`, `Record`, `nonEmptyString`, `finite`, `int`, `literal`, `literals`, `port`, `logLevel`, `date`

### [Config.schema](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:642)

Builds a typed config from a `Schema` codec, decoding raw provider values into the desired domain type.

```ts
const server = Config.schema(Schema.Struct({ port: Schema.Int }), "server");
```

Resolve a structured config once at the application boundary and keep the
validated value typed inside the program.

```ts
const AppConfig = Config.schema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Int,
  }),
  "server",
);

const program = Effect.gen(function*() {
  const config = yield* AppConfig;
  return `http://${config.host}:${config.port}`;
});

const test = program.pipe(
  Effect.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        server: { host: "localhost", port: 3000 },
      }),
    ),
  ),
);
```

### [Config.string](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:904)

Reads one string value from the active `ConfigProvider`.

```ts
const host = Config.string("HOST");
```

### [Config.number](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:947)

Reads a numeric value and decodes it from the provider's string representation.

```ts
const port = Config.number("PORT");
```

### [Config.boolean](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:1090)

Reads a boolean flag from common string representations such as `true`, `yes`, `on`, `1`, and their false equivalents.

```ts
const enabled = Config.boolean("FEATURE_ENABLED");
```

### [Config.all](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:270)

Combines configs into a tuple, iterable, or named record while preserving the input shape.

```ts
const database = Config.all({
  host: Config.string("DB_HOST"),
  port: Config.number("DB_PORT"),
});
```

Compose a complete application configuration with defaults and optional
overrides, rather than resolving each setting independently.

```ts
const AppConfig = Config.all({
  database: Config.all({
    host: Config.string("DB_HOST"),
    port: Config.number("DB_PORT"),
  }),
  region: Config.string("REGION").pipe(Config.withDefault("local")),
  tracing: Config.option(Config.boolean("TRACING")),
});
```

### [Config.withDefault](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:357)

Uses a fallback only when the config fails because data is missing; validation errors still fail.

```ts
const port = Config.number("PORT").pipe(Config.withDefault(3000));
```

### [Config.option](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:401)

Turns missing config data into `Option.none()` and successful data into `Option.some(value)`.

```ts
const region = Config.option(Config.string("REGION"));
```

### [Config.orElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:231)

Tries another config when the first one fails, including failures beyond missing data.

```ts
const host = Config.string("HOST").pipe(
  Config.orElse(() => Config.succeed("localhost")),
);
```

### [Config.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:165)

Transforms a parsed config value with a pure function.

```ts
const host = Config.string("HOST").pipe(Config.map((value) => value.trim()));
```

### [Config.nested](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:1418)

Scopes a config under a path prefix, such as `DATABASE_HOST` or `{ database: { host } }`.

```ts
const host = Config.string("HOST").pipe(Config.nested("DATABASE"));
```

### [Config.duration](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:1136)

Reads a human-readable duration for settings such as timeouts, intervals, and TTLs.

```ts
const timeout = Config.duration("REQUEST_TIMEOUT");
```

### [Config.redacted](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:1268)

Reads a secret string into a `Redacted` value that avoids exposing the secret in logs and string output.

```ts
const apiKey = Config.redacted("API_KEY");
```

### [Config.url](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Config.ts:1328)

Reads and validates a URL value from a string config source.

```ts
const endpoint = Config.url("API_URL");
```
