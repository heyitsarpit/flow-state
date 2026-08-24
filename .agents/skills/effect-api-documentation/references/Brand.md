# `Brand`

Source: [Effect v4 `Brand` API](https://www.effect.website/docs/v4/api/effect/Brand). Recipe: [branded types](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/code-style/branded-types.mdx:190). Examples use `Brand` from `effect`.

## API index

1. [Brand.make](#brandmake)
2. [Brand.nominal](#brandnominal)
3. [Brand.all](#brandall)
4. [Brand.Constructor.is](#brandconstructoris)
5. [Brand.Constructor.option](#brandconstructoroption)
6. [Brand.Constructor.result](#brandconstructorresult)
7. [Brand.Branded](#brandbranded)
8. [Brand.FromConstructor](#brandfromconstructor)
9. [Brand.Unbranded](#brandunbranded)

### Additional known APIs (not expanded)

`Brand`, `Constructor`, `BrandError`, `check`, `Brand.Keys`, `Brand.Brands`, `Brand.EnsureCommonBase`

### [Brand.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:249)

Creates a branded constructor that validates inputs at runtime while preserving a distinct compile-time type.

```ts
import { Brand } from "effect"

type UserId = Brand.Branded<string, "UserId">
const UserId = Brand.make<UserId>((value) => value.length > 0)
const id = UserId("user-1")
```

### [Brand.nominal](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:228)

Creates a zero-runtime-check constructor for identifiers that need type separation rather than validation.

```ts
import { Brand } from "effect"

type OrderId = Brand.Branded<string, "OrderId">
const OrderId = Brand.nominal<OrderId>()
const id = OrderId("order-1")
```

### [Brand.all](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:308)

Combines multiple brand checks so a value must satisfy every domain invariant.

```ts
import { Brand } from "effect"

type Int = Brand.Branded<number, "Int">
type Positive = Brand.Branded<number, "Positive">
const Int = Brand.make<Int>(Number.isInteger)
const Positive = Brand.make<Positive>((value) => value > 0)
const PositiveInt = Brand.all(Int, Positive)
```

### [Brand.Constructor.is](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:80)

Checks a value without throwing and narrows it to the branded type when valid.

```ts
import { Brand } from "effect"

type UserId = Brand.Branded<string, "UserId">
const UserId = Brand.make<UserId>((value) => value.length > 0)
const raw: string = "user-1"
if (UserId.is(raw)) {
  const id: UserId = raw
}
```

### [Brand.Constructor.option](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:69)

Returns `Some` for a valid branded value and `None` for invalid input.

```ts
import { Brand } from "effect"

type Port = Brand.Branded<number, "Port">
const Port = Brand.make<Port>((value) => value >= 1 && value <= 65535)
const maybePort = Port.option(8080)
```

### [Brand.Constructor.result](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:75)

Returns a typed `Result` that preserves the `BrandError` when validation fails.

```ts
import { Brand } from "effect"

type Port = Brand.Branded<number, "Port">
const Port = Brand.make<Port>((value) => value >= 1 && value <= 65535)
const checked = Port.result(0)
```

### [Brand.Branded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:211)

Adds a compile-time brand to an existing base type without changing its runtime representation.

```ts
import { Brand } from "effect"

type UserId = Brand.Branded<string, "UserId">
declare const id: UserId
const raw: string = id
```

### [Brand.FromConstructor](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:159)

Extracts the branded value type produced by a constructor.

```ts
import { Brand } from "effect"

const UserId = Brand.nominal<Brand.Branded<string, "UserId">>()
type UserId = Brand.FromConstructor<typeof UserId>
```

### [Brand.Unbranded](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Brand.ts:167)

Recovers the underlying base type when an API needs to accept either a branded value or its raw input.

```ts
import { Brand } from "effect"

type UserId = Brand.Branded<string, "UserId">
type UserIdInput = Brand.Unbranded<UserId>
const input: UserIdInput = "user-1"
```
