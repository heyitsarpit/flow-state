# `Redacted`

Source: [Effect v4 `Redacted` API](https://www.effect.website/docs/v4/api/effect/Redacted). Examples assume `import { Equivalence, Redacted } from "effect"`.

## API index

1. [Redacted.make](#redactedmake)
2. [Redacted.value](#redactedvalue)
3. [Redacted.makeEquivalence](#redactedmakeequivalence)
4. [Redacted.isRedacted](#redactedisredacted)
5. [Redacted.wipeUnsafe](#redactedwipeunsafe)

### Additional known APIs (not expanded)

`Redacted.Value`, `Redacted.Variance`

### [Redacted.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Redacted.ts:185)

Wraps a sensitive value so string, JSON, and inspection output shows a redacted placeholder instead of the value.

```ts
const apiKey = Redacted.make("secret-key", { label: "api-key" });
console.log(String(apiKey)); // <redacted:api-key>
```

### [Redacted.value](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Redacted.ts:244)

Recovers the underlying value at a trusted boundary; keep this operation close to the code that must use the secret.

```ts
const apiKey = Redacted.make("secret-key");
const authorization = `Bearer ${Redacted.value(apiKey)}`;
```

### [Redacted.makeEquivalence](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Redacted.ts:313)

Builds an equality relation for wrapped values without exposing their contents at each comparison site.

```ts
const equals = Redacted.makeEquivalence(Equivalence.strictEqual<string>());
const same = equals(Redacted.make("a"), Redacted.make("a"));
```

### [Redacted.isRedacted](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Redacted.ts:158)

Checks and narrows an unknown value before trusted code retrieves its sensitive contents.

```ts
const candidate: unknown = Redacted.make("secret");
if (Redacted.isRedacted(candidate)) {
  const secret = Redacted.value(candidate);
}
```

### [Redacted.wipeUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Redacted.ts:282)

Removes the wrapped value from the internal registry so later retrieval through that wrapper fails. It does not zero memory or erase other references.

```ts
const temporarySecret = Redacted.make("one-time-token");
Redacted.wipeUnsafe(temporarySecret);
```
