# `Path`

Source: [Effect v4 `Path` API](https://www.effect.website/docs/v4/api/effect/Path). Examples assume `import { Effect, Path } from "effect"` and use `Path.layer` for the built-in POSIX implementation.

`Path` is an injectable service for joining, resolving, normalizing, and otherwise manipulating platform-specific filesystem paths.

## API index

1. [Path.Path](#pathpath)
2. [Path.join](#pathjoin)
3. [Path.resolve](#pathresolve)
4. [Path.normalize](#pathnormalize)
5. [Path.parse](#pathparse)
6. [Path.format](#pathformat)
7. [Path.relative](#pathrelative)
8. [Path.isAbsolute](#pathisabsolute)
9. [Path.basename](#pathbasename)
10. [Path.dirname](#pathdirname)
11. [Path.extname](#pathextname)
12. [Path.toFileUrl](#pathtofileurl)
13. [Path.fromFileUrl](#pathfromfileurl)
14. [Path.layer](#pathlayer)

### Additional known APIs (not expanded)

`TypeId`, `sep`, `toNamespacedPath`, `Path.Parsed`

### [Path.Path](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:258)

The service tag provides portable path operations through the effect environment instead of a process-global platform module.

```ts
const program = Effect.gen(function*() {
  const path = yield* Path.Path;
  return path.join("src", "index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.join](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:93)

Joins path segments with the platform service's separator and normalizes the result.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).join("src", "features", "index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.resolve](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:97)

Resolves path segments into a normalized absolute path according to the active implementation.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).resolve("/app", "src", "index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.normalize](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:94)

Collapses `.` and `..` segments while preserving the implementation's path semantics.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).normalize("src/../dist/index.js");
}).pipe(Effect.provide(Path.layer));
```

### [Path.parse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:95)

Splits a path into root, directory, base, extension, and name fields.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).parse("src/index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.format](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:90)

Builds a path from the structured fields returned by `Path.parse`.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).format({ dir: "src", name: "index", ext: ".ts" });
}).pipe(Effect.provide(Path.layer));
```

### [Path.relative](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:96)

Computes the path needed to move from one location to another.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).relative("/app/src", "/app/src/index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.isAbsolute](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:92)

Checks whether a path is absolute under the active path implementation.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).isAbsolute("/app/config.json");
}).pipe(Effect.provide(Path.layer));
```

### [Path.basename](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:87)

Returns the final path component, optionally removing a matching suffix.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).basename("src/index.ts", ".ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.dirname](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:88)

Returns the directory portion of a path.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).dirname("src/features/index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.extname](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:89)

Returns the extension of the final path component.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).extname("index.ts");
}).pipe(Effect.provide(Path.layer));
```

### [Path.toFileUrl](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:98)

Converts a path to a `file:` URL and reports invalid arguments through the effect error channel.

```ts
const url = Effect.gen(function*() {
  return yield* (yield* Path.Path).toFileUrl("/app/config.json");
}).pipe(Effect.provide(Path.layer));
```

### [Path.fromFileUrl](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:91)

Converts a `file:` URL back to a path while rejecting unsupported schemes.

```ts
const path = Effect.gen(function*() {
  return yield* (yield* Path.Path).fromFileUrl(new URL("file:///app/config.json"));
}).pipe(Effect.provide(Path.layer));
```

### [Path.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Path.ts:870)

Provides the built-in POSIX path implementation to effects that require `Path.Path`.

```ts
const program = Effect.gen(function*() {
  return (yield* Path.Path).sep;
}).pipe(Effect.provide(Path.layer));
```
