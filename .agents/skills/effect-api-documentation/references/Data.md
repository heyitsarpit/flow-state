# `Data`

Source: [Effect v4 `Data` API](https://www.effect.website/docs/v4/api/effect/Data). Examples assume `import { Data } from "effect"`.

`Data` provides immutable data helpers with structural equality, hashing, and tagged or class-based constructors for domain values.

## API index

1. [Data.Class](#dataclass)
2. [Data.TaggedClass](#datataggedclass)
3. [Data.TaggedEnum](#datataggedenum)
4. [Data.TaggedEnum.WithGenerics](#datataggedenumwithgenerics)
5. [Data.TaggedEnum.Kind](#datataggedenumkind)
6. [Data.TaggedEnum.Args](#datataggedenumargs)
7. [Data.TaggedEnum.Value](#datataggedenumvalue)
8. [Data.TaggedEnum.Constructor](#datataggedenumconstructor)
9. [Data.taggedEnum](#datataggedenum-1)
10. [Data.Error](#dataerror)
11. [Data.TaggedError](#datataggederror)

### Additional known APIs (not expanded)

`TaggedEnum.ConstructorFrom`, `TaggedEnum.GenericMatchers`

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
Each key becomes the variant's `readonly _tag`; variant records must not define
`_tag` themselves.

```ts
type State = Data.TaggedEnum<{
  Loading: { readonly startedAt: number };
  Ready: { readonly value: string };
}>;
```

### [Data.TaggedEnum.WithGenerics](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:224)

Defines a generic tagged-enum shape. `Count` declares how many type parameters
the shape uses, from one through four, and `this["A"]` through `this["D"]`
stand for those parameters.

```ts
type Box<A> = Data.TaggedEnum<{
  Empty: {};
  Value: { readonly value: A };
}>;

interface BoxDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Box<this["A"]>;
}
```

### [Data.TaggedEnum.Kind](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:265)

Applies concrete type arguments to a `WithGenerics` definition and produces the
corresponding tagged union type.

```ts
type Box<A> = Data.TaggedEnum<{
  Empty: {};
  Value: { readonly value: A };
}>;

interface BoxDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Box<this["A"]>;
}

type StringBox = Data.TaggedEnum.Kind<BoxDefinition, string>;
// { readonly _tag: "Empty" } | { readonly _tag: "Value"; readonly value: string }
```

### [Data.TaggedEnum.Args](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:312)

Extracts the constructor fields for one variant, excluding `_tag`. It resolves
to `void` for a variant with no other fields.

```ts
type Result =
  | { readonly _tag: "Ok"; readonly value: number }
  | { readonly _tag: "Err"; readonly error: string };

type OkArgs = Data.TaggedEnum.Args<Result, "Ok">;
// { readonly value: number }
```

### [Data.TaggedEnum.Value](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:346)

Selects the complete variant type, including its `_tag`, from a tagged union.

```ts
type Result =
  | { readonly _tag: "Ok"; readonly value: number }
  | { readonly _tag: "Err"; readonly error: string };

type Ok = Data.TaggedEnum.Value<Result, "Ok">;
// { readonly _tag: "Ok"; readonly value: number }
```

### [Data.TaggedEnum.Constructor](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:398)

Describes the constructor bundle returned by `taggedEnum`. It contains one
constructor per tag, `$is` for tag-based narrowing, and `$match` for exhaustive
matching in data-first or data-last form.

```ts
type Shape =
  | { readonly _tag: "Circle"; readonly radius: number }
  | { readonly _tag: "Rect"; readonly width: number; readonly height: number };

const Shape: Data.TaggedEnum.Constructor<Shape> = Data.taggedEnum<Shape>();

const area = Shape.$match({
  Circle: ({ radius }) => Math.PI * radius ** 2,
  Rect: ({ width, height }) => width * height
});

const value = area(Shape.Circle({ radius: 5 }));
```

### [Data.taggedEnum](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Data.ts:590)

Generates plain-object constructors and matchers for a `TaggedEnum` definition.
`$is` checks the `_tag` only; use `Schema` to validate untrusted input.

```ts
type Result = Data.TaggedEnum<{
  Ok: { readonly value: number };
  Err: { readonly error: string };
}>;

const Result = Data.taggedEnum<Result>();
const result = Result.Ok({ value: 42 });

const message = Result.$match(result, {
  Ok: ({ value }) => `ok: ${value}`,
  Err: ({ error }) => `error: ${error}`
});
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
