# `Pipeable`

Source: [Effect v4 `Pipeable` API](https://www.effect.website/docs/v4/api/effect/Pipeable). Examples assume `import { Pipeable } from "effect"`.

`Pipeable` defines the public type-level contract and implementation helpers for values with a composable `.pipe(...)` method. It does not prescribe the domain operations represented by the functions passed to `.pipe`.

## API index

1. [Pipeable.Pipeable](#pipeablepipeable)
2. [Pipeable.pipeArguments](#pipeablepipearguments)
3. [Pipeable.Prototype](#pipeableprototype)
4. [Pipeable.Class](#pipeableclass)
5. [Pipeable.PipeableConstructor](#pipeablepipeableconstructor)
6. [Pipeable.Mixin](#pipeablemixin)

### Additional known APIs (not expanded)

None. All confirmed public exports in this module are expanded below.

## Type-level and implementation contract

### [Pipeable.Pipeable](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pipeable.ts:43)

`Pipeable` overloads `.pipe` for zero or more unary functions, carrying each function's output type into the next function and returning the final output type. A custom abstraction can implement this contract while choosing its own value representation.

```ts
import { Pipeable } from "effect"

class SearchQuery extends Pipeable.Class {
  constructor(
    readonly text: string,
    readonly page: number
  ) {
    super()
  }
}

const request = new SearchQuery("  effects  ", 2).pipe(
  ({ text, page }) => new SearchQuery(text.trim().toLowerCase(), page),
  ({ text, page }) => ({ q: text, page })
)
console.log(request) // { q: "effects", page: 2 }
```

### [Pipeable.pipeArguments](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pipeable.ts:563)

`pipeArguments(self, args)` applies the functions in a JavaScript `arguments` object from left to right. With no functions it returns `self`; the helper leaves the custom method responsible for choosing its initial value and public overloads.

```ts
import { Pipeable } from "effect"

class NumberBox {
  constructor(readonly value: number) {}

  pipe(..._fns: ReadonlyArray<(value: number) => number>): number {
    return Pipeable.pipeArguments(this.value, arguments) as number
  }
}

console.log(new NumberBox(5).pipe((n) => n + 2, (n) => n * 3)) // 21
```

### [Pipeable.Prototype](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pipeable.ts:606)

`Prototype` is a reusable prototype object whose `pipe` method delegates to `pipeArguments`. Assign it to a compatible object prototype when a base class is unnecessary.

```ts
import { Pipeable } from "effect"

const value = Object.create(Pipeable.Prototype) as Pipeable & { value: number }
value.value = 5
console.log(value.pipe((box) => box.value + 1)) // 6
```

### [Pipeable.Class](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pipeable.ts:624)

`Class` is a base constructor whose instances inherit the standard `.pipe` implementation.

```ts
import { Pipeable } from "effect"

class NumberBox extends Pipeable.Class {
  constructor(readonly value: number) {
    super()
  }
}

console.log(new NumberBox(5).pipe((box) => box.value + 1)) // 6
```

### [Pipeable.PipeableConstructor](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pipeable.ts:645)

`PipeableConstructor` describes the constructor side of a class whose instances implement `Pipeable`.

```ts
import { Pipeable } from "effect"

const acceptsPipeable = (constructor: Pipeable.PipeableConstructor): Pipeable.Pipeable =>
  new constructor()
```

### [Pipeable.Mixin](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Pipeable.ts:668)

`Mixin` returns a subclass of an existing constructor with `.pipe` support while preserving the original constructor and instance members.

```ts
import { Pipeable } from "effect"

class NumberBox {
  constructor(readonly value: number) {}
}

const PipeableNumberBox = Pipeable.Mixin(NumberBox)
const result = new PipeableNumberBox(5).pipe((box) => box.value + 1)
console.log(result) // 6
```
