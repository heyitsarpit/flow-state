# `Resource`

Source: [Effect v4 `Resource` API](https://www.effect.website/docs/v4/api/effect/Resource). Examples assume `import { Effect, Resource, Schedule } from "effect"`.

## API index

1. [Resource.manual](#resourcemanual)
2. [Resource.get](#resourceget)
3. [Resource.refresh](#resourcerefresh)
4. [Resource.auto](#resourceauto)
5. [Resource.isResource](#resourceisresource)

### Additional known APIs (not expanded)

`Resource`

### [Resource.manual](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Resource.ts:99)

Creates a scoped resource whose acquisition runs once and refreshes only when requested.

```ts
const current = Effect.scoped(
  Effect.gen(function*() {
    const resource = yield* Resource.manual(Effect.succeed("client-v1"));
    return yield* Resource.get(resource);
  }),
);
```

### [Resource.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Resource.ts:154)

Reads the latest acquisition result. A failed acquisition is returned as an effect failure until a later refresh succeeds.

```ts
const readClient = (resource: Resource.Resource<string>) =>
  Resource.get(resource);
```

### [Resource.refresh](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Resource.ts:183)

Reacquires a resource and replaces the previous scoped value; a failed refresh leaves the previous result available to `get`.

```ts
const refreshClient = (resource: Resource.Resource<string>) =>
  Effect.gen(function*() {
    yield* Resource.refresh(resource);
    return yield* Resource.get(resource);
  });
```

### [Resource.auto](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Resource.ts:128)

Creates a resource that refreshes in the background according to a `Schedule` for the lifetime of its scope.

```ts
const current = Effect.scoped(
  Effect.gen(function*() {
    const resource = yield* Resource.auto(
      Effect.succeed("client-v1"),
      Schedule.fixed("1 minute"),
    );
    return yield* Resource.get(resource);
  }),
);
```

### [Resource.isResource](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Resource.ts:62)

Checks an unknown value and narrows it to a `Resource` at a runtime boundary.

```ts
declare const candidate: unknown;
if (Resource.isResource(candidate)) {
  const current = Resource.get(candidate);
}
```
