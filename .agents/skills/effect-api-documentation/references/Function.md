# `Function`

Source: [Effect v4 `Function` API](https://www.effect.website/docs/v4/api/effect/Function). Examples assume `import { Function } from "effect"`; root exports are marked explicitly.

The package root re-exports `pipe`, `flow`, `identity`, `absurd`, `cast`, and `hole`. The same declarations are also available through the `Function` namespace.

## API index

1. [root `pipe` / `Function.pipe`](#root-pipe--functionpipe)
2. [root `flow` / `Function.flow`](#root-flow--functionflow)
3. [root `identity` / `Function.identity`](#root-identity--functionidentity)
4. [root `absurd` / `Function.absurd`](#root-absurd--functionabsurd)
5. [root `cast` / `Function.cast`](#root-cast--functioncast)
6. [root `hole` / `Function.hole`](#root-hole--functionhole)
7. [Function.FunctionTypeLambda](#functionfunctiontypelambda)
8. [Function.LazyArg](#functionlazyarg)
9. [Function.FunctionN](#functionfunctionn)
10. [Function.dual](#functiondual)
11. [Function.compose](#functioncompose)
12. [Function.apply](#functionapply)
13. [Function.flip](#functionflip)
14. [Function.tupled](#functiontupled)
15. [Function.untupled](#functionuntupled)
16. [Function.satisfies](#functionsatisfies)
17. [Function.constant](#functionconstant)
18. [Function.memoize](#functionmemoize)
19. [Function constant thunks](#function-constant-thunks)

### Additional known APIs (not expanded)

`Function.SK`

## Type-level APIs

### [Function.FunctionTypeLambda](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:35)

`FunctionTypeLambda` represents ordinary function types in Effect's higher-kinded type operations.

```ts
import type { Function, HKT } from "effect"

type StringToNumber = HKT.Kind<Function.FunctionTypeLambda, string, never, never, number>
const length: StringToNumber = (value) => value.length
```

### [Function.LazyArg](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:204)

`LazyArg<A>` is a zero-argument function that produces an `A` when invoked.

```ts
import type { Function } from "effect"

const loadMode: Function.LazyArg<"safe" | "fast"> = () => "safe"
```

### [Function.FunctionN](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:227)

`FunctionN<Args, Result>` describes a function whose parameters are represented by a tuple type.

```ts
import type { Function } from "effect"

const add: Function.FunctionN<readonly [number, number], number> = (a, b) => a + b
```

## Root exports and function utilities

### [root `pipe` / `Function.pipe`](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:677)

`pipe` applies unary functions from left to right and returns the final result. The root name is the usual form; `Function.pipe` is the namespaced form.

```ts
import { Result, pipe } from "effect"

type SignupInput = { readonly email: string; readonly age: string }

const validateSignup = (input: SignupInput) =>
  pipe(
    input,
    ({ email, age }) => ({ email: email.trim().toLowerCase(), age: Number(age) }),
    (value) =>
      value.email.includes("@") && Number.isInteger(value.age) && value.age >= 18
        ? Result.succeed(value)
        : Result.fail("invalid signup")
  )

const result = validateSignup({ email: " Alice@Example.COM ", age: "21" })
```

### [root `flow` / `Function.flow`](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:1162)

`flow` builds a reusable left-to-right composition. The first function may accept multiple arguments; each later function receives the preceding result.

```ts
import { flow } from "effect"

const toCacheKey = flow(
  (namespace: string, id: number) => `${namespace.trim()}:${id}`,
  (key) => key.toLowerCase(),
  (key) => `cache/${key}`
)

console.log(toCacheKey(" Users ", 42)) // "cache/users:42"
```

### [root `identity` / `Function.identity`](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:248)

`identity` returns its input unchanged while preserving its inferred type.

```ts
import { identity } from "effect"

const value = identity({ id: "u1" as const })
console.log(value.id) // u1
```

### [root `absurd` / `Function.absurd`](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:518)

`absurd` handles an impossible `never` branch and returns the requested type. If it is called at runtime, it throws because the branch was not actually impossible.

```ts
import { absurd } from "effect"

type State = { readonly _tag: "Ready" } | { readonly _tag: "Done" }
const label = (state: State): string => {
  switch (state._tag) {
    case "Ready": return "ready"
    case "Done": return "done"
    default: return absurd(state)
  }
}
```

### [root `cast` / `Function.cast`](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:299)

`cast` changes only the static type and returns the same runtime value. It does not validate or convert the value.

```ts
import { cast } from "effect"

type UserId = string & { readonly UserId: unique symbol }
const id = cast<string, UserId>("u1")
```

### [root `hole` / `Function.hole`](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:1356)

`hole` supplies a typed development placeholder. Evaluating the placeholder throws, so it should not remain in shipped code.

```ts
import { hole } from "effect"

const buildName = (): string => hole<string>()
// Calling buildName() throws because the placeholder is evaluated.
```

### [Function.dual](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:102)

`dual` exposes one implementation in data-first and data-last forms. Pass the data-first arity, or pass a predicate when arity is ambiguous.

```ts
import { Function, pipe } from "effect"

const add = Function.dual<
  (that: number) => (self: number) => number,
  (self: number, that: number) => number
>(2, (self, that) => self + that)

console.log(add(2, 3), pipe(2, add(3))) // 5 5
```

### [Function.compose](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:486)

`compose` combines two unary functions by applying the first and then the second. It also supports the data-last call form supplied by `dual`.

```ts
import { Function } from "effect"

const normalize = (value: string) => value.trim().toLowerCase()
const toUserKey = Function.compose(
  normalize,
  (value) => `user:${value}`
)

console.log([" Alice ", "BOB"].map(toUserKey)) // ["user:alice", "user:bob"]
```

### [Function.apply](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:184)

`apply(value)` adapts a unary function so that the value is supplied in a pipeline.

```ts
import { Function, pipe } from "effect"

const length = pipe((text: string) => text.length, Function.apply("hello"))
console.log(length) // 5
```

### [Function.flip](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:454)

`flip` reverses the argument groups of a curried function.

```ts
import { Function } from "effect"

const subtract = (a: number) => (b: number) => a - b
console.log(Function.flip(subtract)(2)(10)) // 8
```

### [Function.tupled](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:545)

`tupled` adapts a multi-argument function to accept one tuple argument.

```ts
import { Function } from "effect"

const addTupled = Function.tupled((a: number, b: number) => a + b)
console.log(addTupled([2, 3])) // 5
```

### [Function.untupled](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:570)

`untupled` adapts a tuple-argument function back to ordinary positional arguments.

```ts
import { Function } from "effect"

const add = Function.untupled((pair: readonly [number, number]) => pair[0] + pair[1])
console.log(add(2, 3)) // 5
```

### [Function.satisfies](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:279)

`satisfies<A>()` checks assignability to `A` while preserving the narrower inferred type of the value.

```ts
import { Function } from "effect"

const status = Function.satisfies<"draft" | "published">()("draft" as const)
```

### [Function.constant](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:324)

`constant(value)` creates a lazy function that returns the same value on every call.

```ts
import { Function } from "effect"

const retries = Function.constant(3)
console.log(retries()) // 3
```

### [Function constant thunks](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:345)

`constTrue`, `constFalse`, `constNull`, `constUndefined`, and `constVoid` are predefined `LazyArg` values for common constants.

```ts
import { Function } from "effect"

console.log(Function.constTrue(), Function.constVoid()) // true undefined
```

The declarations are [Function.constTrue](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:345), [Function.constFalse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:366), [Function.constNull](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:387), [Function.constUndefined](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:408), and [Function.constVoid](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:430).

### [Function.memoize](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Function.ts:1405)

`memoize` caches synchronous results by object identity in a private `WeakMap`. Structurally equal objects do not share entries, and mutating an object does not invalidate its cached result.

```ts
import { Function } from "effect"

let calls = 0
const read = Function.memoize((input: { readonly value: number }) => {
  calls++
  return input.value * 2
})
const input = { value: 2 }
read(input)
read(input)
console.log(calls) // 1
```
