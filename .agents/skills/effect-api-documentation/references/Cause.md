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
14. [Cause.Reason](#causereason)
15. [Cause.isCause](#causeiscause)
16. [Cause.isReason](#causeisreason)
17. [Cause.empty](#causeempty)
18. [Cause.hasInterruptsOnly](#causehasinterruptsonly)
19. [Cause.findFail](#causefindfail)
20. [Cause.findDie](#causefinddie)
21. [Cause.findInterrupt](#causefindinterrupt)

### Additional known APIs (not expanded)

`TypeId`, `ReasonTypeId`, `Fail`, `Die`, `Interrupt`, `fromReasons`, `makeFailReason`, `makeDieReason`, `makeInterruptReason`, `findError`, `hasInterrupts`, `interruptors`, `filterInterruptors`, `prettyErrors`, `isFailReason`, `isDieReason`, `isInterruptReason`, `annotate`, `reasonAnnotations`, `annotations`, `NoSuchElementError`, `TimeoutError`, `UnknownError`

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

### [Cause.Reason](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:146)

Represents one structured reason: a typed failure, an unexpected defect, or an interruption.

```ts
const reason: Cause.Reason<string> = Cause.fail("invalid").reasons[0];

if (Cause.isFailReason(reason)) {
  console.log(reason.error);
}
```

### [Cause.isCause](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:97)

Checks whether an unknown value is a `Cause` and narrows it to the structured cause type.

```ts
const input: unknown = Cause.die(new Error("bug"));

if (Cause.isCause(input)) {
  console.log(input.reasons.length);
}
```

### [Cause.isReason](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:115)

Checks whether an unknown value is one of the public reason variants carried by a cause.

```ts
const reason: unknown = Cause.interrupt(7).reasons[0];

if (Cause.isReason(reason)) {
  console.log(reason._tag);
}
```

### [Cause.empty](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:464)

Provides the empty cause, which contains no failure, defect, or interruption reasons.

```ts
const cause = Cause.empty;
console.log(cause.reasons.length); // 0
```

### [Cause.hasInterruptsOnly](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:642)

Checks whether every reason in a cause is an interruption and there are no typed failures or defects.

```ts
const interrupted = Cause.interrupt(7);
console.log(Cause.hasInterruptsOnly(interrupted)); // true
console.log(Cause.hasInterruptsOnly(Cause.fail("stop"))); // false
```

### [Cause.findFail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:811)

Finds the first typed failure and returns the remaining cause as the failure channel when none is found.

```ts
import { Cause, Result } from "effect";

const found = Cause.findFail(Cause.fail("invalid"));
if (Result.isSuccess(found)) {
  console.log(found.success.error);
}
```

### [Cause.findDie](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:923)

Finds the first defect in a cause and preserves the original cause when no defect exists.

```ts
import { Cause, Result } from "effect";

const found = Cause.findDie(Cause.die(new Error("bug")));
if (Result.isSuccess(found)) {
  console.log(found.success.defect);
}
```

### [Cause.findInterrupt](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts:1001)

Finds the first interruption reason in a cause and reports the cause if none is present.

```ts
import { Cause, Result } from "effect";

const found = Cause.findInterrupt(Cause.interrupt(7));
if (Result.isSuccess(found)) {
  console.log(found.success.fiberId);
}
```
