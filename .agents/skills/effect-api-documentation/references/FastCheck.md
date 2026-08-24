# `FastCheck`

Source: [Effect v4 `FastCheck` API](https://www.effect.website/docs/v4/api/effect/testing/FastCheck). `FastCheck` is imported from `effect/testing` and re-exports the `fast-check` package.

## API index

1. [FastCheck.FastCheck](#fastcheckfastcheck)

### Additional known APIs (not expanded)

`property`, `assert`, `check`, `integer`, `float`, `boolean`, `string`, `array`, `tuple`, `record`, `oneof`, `constant`

### [FastCheck.FastCheck](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/FastCheck.ts:89)

Re-exports `fast-check` for property-based tests that generate many inputs and shrink failures to small counterexamples.

```ts
const property = FastCheck.property(
  FastCheck.array(FastCheck.integer()),
  (values) => values.slice().reverse().reverse().join() === values.join(),
);
FastCheck.assert(property);
```
