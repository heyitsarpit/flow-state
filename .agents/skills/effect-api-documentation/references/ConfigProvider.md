# `ConfigProvider`

Source: [Effect v4 `ConfigProvider` API](https://www.effect.website/docs/v4/api/effect/ConfigProvider). Examples assume `import { ConfigProvider } from "effect"`.

`ConfigProvider` resolves configuration paths for `Config` descriptions, allowing the same typed configuration code to read from different backing sources.

## API index

1. [ConfigProvider.fromEnv](#configproviderfromenv)
2. [ConfigProvider.fromUnknown](#configproviderfromunknown)
3. [ConfigProvider.fromDotEnvContents](#configproviderfromdotenvcontents)
4. [ConfigProvider.fromDotEnv](#configproviderfromdotenv)
5. [ConfigProvider.fromDir](#configproviderfromdir)
6. [ConfigProvider.orElse](#configproviderorelse)
7. [ConfigProvider.nested](#configprovidernested)
8. [ConfigProvider.constantCase](#configproviderconstantcase)
9. [ConfigProvider.mapInput](#configprovidermapinput)
10. [ConfigProvider.layer](#configproviderlayer)
11. [ConfigProvider.layerAdd](#configproviderlayeradd)
12. [ConfigProvider.make](#configprovidermake)
13. [ConfigProvider.ConfigProvider](#configproviderconfigprovider)

### Additional known APIs (not expanded)

`Node`, `Path`, `SourceError`, `makeValue`, `makeRecord`, `makeArray`, `ConfigProvider`, `load`

### [ConfigProvider.fromEnv](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:848)

Creates a provider backed by environment variables. Pass an `env` record to make tests deterministic or to support non-Node runtimes.

```ts
const provider = ConfigProvider.fromEnv({
  env: { API_HOST: "localhost" },
});
```

### [ConfigProvider.fromUnknown](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:739)

Creates a provider from an in-memory object, array, or primitive value. It is useful for embedded configuration and tests.

```ts
const provider = ConfigProvider.fromUnknown({
  database: { port: 5432 },
});
```

### [ConfigProvider.fromDotEnvContents](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:967)

Parses `.env` contents supplied as a string, with optional variable expansion and empty-string preservation.

```ts
const provider = ConfigProvider.fromDotEnvContents("HOST=localhost\nPORT=3000");
```

Parse checked-in or remotely fetched `.env` text, then provide it to the same
config program used by the live environment.

```ts
const provider = ConfigProvider.fromDotEnvContents(`
HOST=localhost
PORT=3000
`);

const program = Effect.gen(function*() {
  return yield* Config.number("PORT");
}).pipe(
  Effect.provideService(ConfigProvider.ConfigProvider, provider),
);
```

### [ConfigProvider.fromDotEnv](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:1110)

Creates an effect that reads and parses a `.env` file using the `FileSystem` service.

```ts
const provider = ConfigProvider.fromDotEnv({ path: ".env.local" });
```

Resolve config through the provider effect at application startup.

```ts
const config = Effect.gen(function*() {
  const provider = yield* ConfigProvider.fromDotEnv({ path: ".env.local" });
  return yield* Config.string("API_HOST").pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, provider),
  );
});
```

### [ConfigProvider.fromDir](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:1166)

Creates an effect that reads configuration from a directory tree where files are leaf values and directories are containers.

```ts
const provider = ConfigProvider.fromDir({ rootPath: "/etc/myapp" });
```

### [ConfigProvider.orElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:442)

Uses the second provider only when the first provider has no value for a path. Source errors from the first provider propagate.

```ts
const provider = ConfigProvider.orElse(
  ConfigProvider.fromEnv(),
  ConfigProvider.fromUnknown({ PORT: "3000" }),
);
```

### [ConfigProvider.nested](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:579)

Prefixes every lookup with a path, allowing a provider to be reused for a namespaced config subtree.

```ts
const provider = ConfigProvider.fromUnknown({ app: { port: 8080 } }).pipe(
  ConfigProvider.nested("app"),
);
```

### [ConfigProvider.constantCase](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:535)

Converts string path segments to constant case, bridging schema keys such as `databaseHost` to environment names such as `DATABASE_HOST`.

```ts
const provider = ConfigProvider.fromEnv({
  env: { DATABASE_HOST: "localhost" },
}).pipe(ConfigProvider.constantCase);
```

### [ConfigProvider.mapInput](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:488)

Transforms lookup paths before they reach the backing source.

```ts
const provider = ConfigProvider.fromEnv().pipe(
  ConfigProvider.mapInput((path) => path.map(String).map((key) => key.toUpperCase())),
);
```

### [ConfigProvider.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:631)

Installs a provider as the active `ConfigProvider`, replacing the current one for downstream effects.

```ts
const testConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ PORT: 8080 }),
);
```

Install the provider around the effect that reads it, which makes the same
configuration program reusable with production, test, or preview values.

```ts
const port = Effect.gen(function*() {
  return yield* Config.number("PORT");
});

const testPort = port.pipe(
  Effect.provide(
    ConfigProvider.layer(
      ConfigProvider.fromUnknown({ PORT: 8080 }),
    ),
  ),
);
```

### [ConfigProvider.layerAdd](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:672)

Adds a provider to the active provider as a fallback, or makes it primary with `asPrimary: true`.

```ts
const defaults = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({ PORT: 3000 }),
);
```

Add defaults without replacing the active environment provider, so deployed
values win while missing keys still receive safe local values.

```ts
const withDefaults = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({
    HOST: "localhost",
    PORT: "3000",
  }),
);

const config = Effect.gen(function*() {
  return yield* Config.all({
    host: Config.string("HOST"),
    port: Config.number("PORT"),
  });
}).pipe(Effect.provide(withDefaults));
```

### [ConfigProvider.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:400)

Creates a provider backed by a custom lookup function that returns a `Node`, `undefined`, or a `SourceError`.

```ts
const provider = ConfigProvider.make((path) =>
  Effect.succeed(ConfigProvider.makeValue(path.join("."))),
);
```

### [ConfigProvider.ConfigProvider](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:296)

The context reference for the active provider. `Config` values resolve this service automatically when yielded in an Effect.

```ts
const program = Effect.gen(function*() {
  return yield* Effect.service(ConfigProvider.ConfigProvider);
});
```
