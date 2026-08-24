# `Cause`

Source: [Effect v4 `Cause` API](https://www.effect.website/docs/v4/api/effect/Cause). Examples assume `import { Cause } from "effect"`.

## API index

1. [Cause.fail](#causefail)
2. [Cause.die](#causedie)
3. [Cause.interrupt](#causeinterrupt)
4. [Cause.combine](#causecombine)
5. [Cause.map](#causemap)
6. [Cause.findErrorOption](#causefinderroroption)
7. [Cause.findDefect](#causefinddefect)
8. [Cause.hasFails](#causehasfails)
9. [Cause.hasDies](#causehasdies)
10. [Cause.hasInterrupts](#causehasinterrupts)
11. [Cause.squash](#causesquash)
12. [Cause.pretty](#causepretty)
13. [Cause](#cause)

### Additional known APIs (not expanded)

`TypeId`, `ReasonTypeId`, `Reason`, `Fail`, `Die`, `Interrupt`, `fromReasons`, `empty`, `makeFailReason`, `makeDieReason`, `makeInterruptReason`, `hasInterruptsOnly`, `findFail`, `findError`, `findDie`, `hasInterrupts`, `findInterrupt`, `interruptors`, `filterInterruptors`, `prettyErrors`, `isCause`, `isReason`, `isFailReason`, `isDieReason`, `isInterruptReason`, `annotate`, `reasonAnnotations`, `annotations`, `NoSuchElementError`, `TimeoutError`, `UnknownError`

### [Cause.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:490)

Creates a cause containing one expected, typed failure.

```ts
const cause = Cause.fail({ _tag: "NotFound" as const });
```

### [Cause.die](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:516)

Creates a cause containing an unexpected defect that is not part of the typed error channel.

```ts
const cause = Cause.die(new Error("invariant violated"));
```

### [Cause.interrupt](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:538)

Creates a cause representing interruption by an optional fiber ID.

```ts
const cause = Cause.interrupt(42);
```

### [Cause.combine](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:712)

Combines two structured causes while retaining their individual reasons.

```ts
const combined = Cause.combine(Cause.fail("first"), Cause.fail("second"));
```

### [Cause.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:676)

Transforms only typed `Fail` errors; defects and interruptions pass through unchanged.

```ts
const mapped = Cause.map(Cause.fail("bad"), (error) => error.toUpperCase());
```

### [Cause.findErrorOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:869)

Extracts the first typed error as an `Option`, discarding the rest of the cause.

```ts
const error = Cause.findErrorOption(Cause.fail("bad"));
```

### [Cause.findDefect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:952)

Extracts the first defect as a `Result`, preserving the original cause when none exists.

```ts
const defect = Cause.findDefect(Cause.die("bug"));
```

### [Cause.hasFails](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:781)

Checks whether a cause contains at least one typed failure.

```ts
const hasExpectedError = Cause.hasFails(Cause.fail("bad"));
```

### [Cause.hasDies](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:894)

Checks whether a cause contains at least one defect.

```ts
const hasDefect = Cause.hasDies(Cause.die("bug"));
```

### [Cause.hasInterrupts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:973)

Checks whether a cause contains at least one interruption reason.

```ts
const interrupted = Cause.hasInterrupts(Cause.interrupt(42));
```

### [Cause.squash](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:756)

Collapses a structured cause into the single value used by throwing runners.

```ts
const thrown = Cause.squash(Cause.fail("bad"));
```

### [Cause.pretty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:1159)

Renders a cause as a human-readable string for logs and diagnostics.

```ts
const message = Cause.pretty(Cause.fail(new Error("request failed")));
```

### [Cause](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:77)

`Cause<E>` is the structured failure value that can preserve typed errors, defects, and interruptions together.

```ts
const cause: Cause.Cause<string> = Cause.fail("invalid");
```
