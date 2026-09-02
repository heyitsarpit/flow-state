# `Data`

Source: [Effect v4 `Data` API](https://www.effect.website/docs/v4/api/effect/Data). Examples assume `import { Data } from "effect"`.

`Data` provides immutable data helpers with structural equality, hashing, and tagged or class-based constructors for domain values.

## API index

1. [Data.Class](#dataclass)
2. [Data.TaggedClass](#datataggedclass)
3. [Data.TaggedEnum](#datataggedenum)
4. [Data.taggedEnum](#datataggedenum-1)
5. [Data.Error](#dataerror)
6. [Data.TaggedError](#datataggederror)

### Additional known APIs (not expanded)

`TaggedEnum.WithGenerics`, `TaggedEnum.Constructor`, `TaggedEnum.Kind`, `TaggedEnum.Value`, `TaggedEnum.Args`

### [Data.Class](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:51)

Defines an immutable data class with structural equality and hashing.

```ts
class User extends Data.Class<{ readonly id: string }> {}
const user = new User({ id: "u1" });
```

### [Data.TaggedClass](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:96)

Creates a `Data.Class` variant with a literal `_tag` discriminator.

```ts
class Admin extends Data.TaggedClass("Admin")<{ readonly id: string }> {}
const admin = new Admin({ id: "u1" });
```

### [Data.TaggedEnum](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:149)

Provides the type-level shape for a discriminated union of immutable variants.

```ts
type State = Data.TaggedEnum<{
  Loading: { readonly startedAt: number };
  Ready: { readonly value: string };
}>;
```

### [Data.taggedEnum](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:590)

Generates constructors and matchers for a `TaggedEnum` definition.

```ts
type State = Data.TaggedEnum<{ Loading: {}; Ready: { value: string } }>;
interface StateDef extends Data.TaggedEnum.WithGenerics<0> {
  readonly taggedEnum: State;
}
const { Ready } = Data.taggedEnum<StateDef>();
const state = Ready({ value: "done" });
```

### [Data.Error](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:723)

Creates a yieldable error class with structural data behavior.

```ts
class DecodeError extends Data.Error<{ readonly input: string }> {}
const error = new DecodeError({ input: "?" });
```

### [Data.TaggedError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:770)

Creates a yieldable error class with a stable `_tag` for tag-based recovery.

```ts
class NotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}
const error = new NotFound({ id: "u1" });
```
