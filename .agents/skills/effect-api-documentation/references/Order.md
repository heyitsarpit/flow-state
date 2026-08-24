# `Order`

Source: [Effect v4 `Order` API](https://www.effect.website/docs/v4/api/effect/Order). Examples assume `import { Order } from "effect"`.

## API index

1. [Order.Order](#orderorder)
2. [Order.mapInput](#ordermapinput)
3. [Order.combine](#ordercombine)
4. [Order.Struct](#orderstruct)
5. [Order.Tuple](#ordertuple)
6. [Order.Number](#ordernumber)
7. [Order.String](#orderstring)
8. [Order.flip](#orderflip)
9. [Order.clamp](#orderclamp)
10. [Order.min](#ordermin)
11. [Order.max](#ordermax)
12. [Order.isBetween](#orderisbetween)
13. [Order.isLessThan](#orderislessthan)
14. [Order.isGreaterThan](#orderisgreaterthan)

### Additional known APIs (not expanded)

`make`, `Boolean`, `BigInt`, `Date`, `alwaysEqual`, `combineAll`, `Array`, `isLessThanOrEqualTo`, `isGreaterThanOrEqualTo`, `isBetween`, `makeReducer`

### [Order.Order](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:53)

Represents a total ordering that returns `-1`, `0`, or `1`.

```ts
const byLength: Order.Order<string> = (a, b) => Order.Number(a.length, b.length);
```

### [Order.mapInput](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:444)

Orders a larger value by mapping it to a value with an existing order.

```ts
const byAge = Order.mapInput(Order.Number, (user: { age: number }) => user.age);
```

### [Order.combine](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:315)

Uses the second order only when the first order reports equality.

```ts
const byName = Order.mapInput(Order.String, (user: { name: string }) => user.name);
const byAge = Order.mapInput(Order.Number, (user: { age: number }) => user.age);
const byNameThenAge = Order.combine(byName, byAge);
```

### [Order.Struct](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:618)

Builds lexicographic ordering for object fields in declaration order.

```ts
const byUser = Order.Struct({ name: Order.String, age: Order.Number });
const result = byUser({ name: "Ada", age: 30 }, { name: "Ada", age: 31 });
```

### [Order.Tuple](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:513)

Orders fixed-length tuples position by position.

```ts
const byPair = Order.Tuple([Order.Number, Order.String]);
const result = byPair([1, "b"], [1, "a"]);
```

### [Order.Number](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:177)

Orders numbers numerically.

```ts
const result = Order.Number(2, 10);
```

### [Order.String](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:144)

Orders strings lexicographically.

```ts
const result = Order.String("apple", "banana");
```

### [Order.flip](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:269)

Reverses an existing order.

```ts
const descending = Order.flip(Order.Number);
const result = descending(1, 2);
```

### [Order.clamp](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:873)

Restricts a value to an inclusive minimum and maximum.

```ts
const clamp = Order.clamp(Order.Number)({ minimum: 0, maximum: 10 });
const value = clamp(12);
```

### [Order.min](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:800)

Selects the smaller of two values according to an order.

```ts
const value = Order.min(Order.Number)(3, 8);
```

### [Order.max](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:835)

Selects the larger of two values according to an order.

```ts
const value = Order.max(Order.Number)(3, 8);
```

### [Order.isBetween](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:926)

Checks whether a value falls inside an inclusive range.

```ts
const inRange = Order.isBetween(Order.Number)({ minimum: 1, maximum: 5 });
const accepted = inRange(3);
```

### [Order.isLessThan](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:662)

Turns an order into a strict less-than predicate.

```ts
const isEarlier = Order.isLessThan(Order.Number);
const accepted = isEarlier(1, 2);
```

### [Order.isGreaterThan](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Order.ts:696)

Turns an order into a strict greater-than predicate.

```ts
const isLater = Order.isGreaterThan(Order.Number);
const accepted = isLater(2, 1);
```
