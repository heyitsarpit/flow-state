# Effect realization (target: effect-v4)

Read after the Spec is implementation-ready. A lookup table from Spec blocks to Effect's concrete forms, plus two pitfalls specific to TypeScript. Confirm API names against the installed version's types — Effect v4 has churned across betas.

## Mapping

| Spec block                       | Effect                                                                                 |
|----------------------------------|----------------------------------------------------------------------------------------|
| `value ... where ...`            | branded `Schema`, decoded once at the boundary                                         |
| `state` + `transition`           | `Data.TaggedEnum`, matched exhaustively                                                |
| `operation`                      | `(Input) => Effect<Output, DomainError, Requirements>`                                 |
| `concern` (transformer)          | a plain function                                                                       |
| `concern` (capability) / `owner` | a `Service`, exposing only operations                                                  |
| `boundary`                       | the service's method signatures; `protocol` = the method's input/output type           |
| `rule.commit`                    | one atomic update — `Ref.modify`, `SynchronizedRef`, or a store transaction            |
| `error`                          | a tagged error in the `E` channel                                                      |
| `depends`                        | the `Layer` graph; consumers depend on the tag, never `...Live`                        |
| `verify`                         | Schema tests, transition tests, service tests, property tests, Layer integration tests |

```ts
class Scheduler extends Context.Service<Scheduler, {
  readonly submit: (job: NewJob) => Effect.Effect<JobId, SubmitError>
}>()("app/Scheduler") {}
```

## Pitfall 1: a refinement alone does not preserve a fact

```ts
// still just a number — nothing stops any number reaching here
const Priority = Schema.Int.pipe(Schema.between(0, 100))

// brand it
const Priority = Schema.Number
  .check(Schema.isInt())
  .check(Schema.isBetween({ minimum: 0, maximum: 100 }))
  .pipe(Schema.brand("Priority"))
```

Apply this to every `value` block, not only the sensitive-looking ones.

## Pitfall 2: TypeScript has no linear types

```text
Rust:        complete(job: RunningJob)   -- consumed; reuse doesn't compile
TypeScript:  the old value stays in scope; other fibers may hold copies
```

So "complete the same job twice" is `REJECTED` or `GUARANTEED` by an atomic re-check inside the commit — never `IMPOSSIBLE`. Prefer an id plus a re-check inside `Ref.modify` over a state-typed input, unless nothing else could hold that value concurrently. This is `correctness.md`'s stale-evidence attack, specific to what TypeScript can't stop.
