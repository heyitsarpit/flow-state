# `RcMap`

Source: [Effect v4 `RcMap` API](https://www.effect.website/docs/v4/api/effect/RcMap). Examples assume `import { Effect, RcMap } from "effect"` and an enclosing scoped `Effect` program.

`RcMap` shares keyed resources by reference count, releasing an entry when no owning Scope still holds it.

## API index

1. [RcMap.RcMap](#rcmaprcmap)
2. [RcMap.make](#rcmapmake)
3. [RcMap.get](#rcmapget)
4. [RcMap.has](#rcmaphas)
5. [RcMap.keys](#rcmapkeys)
6. [RcMap.invalidate](#rcmapinvalidate)
7. [RcMap.touch](#rcmaptouch)

### Additional known APIs (not expanded)

`State`

### [RcMap.RcMap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:73)

Represents a scoped, reference-counted map of resources keyed by application values.

```ts
const resources: RcMap.RcMap<string, string, never> = yield* RcMap.make({
  lookup: (key) => Effect.succeed(`resource:${key}`),
});
```

### [RcMap.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:235)

Creates a resource map whose lookup effect runs once per key and whose entries close when no longer referenced.

```ts
const resources = yield* RcMap.make({
  lookup: (key: string) =>
    Effect.acquireRelease(
      Effect.succeed(`connection:${key}`),
      () => Effect.log(`close:${key}`),
    ),
  idleTimeToLive: "30 seconds",
});
```

### [RcMap.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:326)

Acquires or retains the resource for a key and releases that reference with the current scope.

```ts
const connection = yield* RcMap.get(resources, "primary");
```

### [RcMap.has](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:541)

Checks whether a key is currently stored without acquiring a missing resource.

```ts
const cached = yield* RcMap.has(resources, "primary");
```

### [RcMap.keys](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:454)

Returns the keys currently stored in the map.

```ts
const keys = yield* RcMap.keys(resources);
```

### [RcMap.invalidate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:500)

Removes a key so its next access runs the lookup again, releasing it when no scope still uses it.

```ts
yield* RcMap.invalidate(resources, "primary");
```

### [RcMap.touch](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/RcMap.ts:594)

Resets the idle lifetime for a stored resource without acquiring another reference.

```ts
yield* RcMap.touch(resources, "primary");
```
