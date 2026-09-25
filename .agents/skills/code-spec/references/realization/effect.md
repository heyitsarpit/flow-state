# Effect realization (target: effect-v4)

Read after the Spec is implementation-ready. A lookup table from Spec blocks to Effect's concrete forms, plus two pitfalls specific to TypeScript. Confirm API names against the installed version's types — Effect v4 has churned across betas.

## Mapping

| Spec block              | Effect realization                                                                                               |
|-------------------------|------------------------------------------------------------------------------------------------------------------|
| `value ... where ...`   | `Schema` owns admission; brand only when the value must remain distinct downstream                              |
| `state`                 | plain data; `Data.TaggedEnum` + `Data.taggedEnum` for trusted, mutually exclusive variants                      |
| `transition`            | a plain function or `Result` when pure; an owner operation when it changes owned state                          |
| `operation`             | plain when pure; otherwise `(Input) => Effect.Effect<Output, DomainError, Requirements>`                         |
| `concern` (transformer) | a plain function or `Data.taggedEnum<>().$match`                                                                                                |
| `concern` (capability)  | an argument when local; `Context.Service` when a substitutable capability crosses call levels                   |
| `owner`                 | a private **owner factory**: constructs the state or lifetime authority and returns narrow operations           |
| `boundary`              | the operation signature and protocol; a service method only for a contextual capability                        |
| `rule.commit`           | the indivisible decision and state publication promised by the Spec — not a prescribed Effect primitive        |
| `error`                 | expected recoverable failure in `E`; interruption and defects remain outside the domain-error channel           |
| `depends`               | data stays in arguments; contextual capabilities stay in `R`; `Layer` constructs, provides, and releases them   |
| `verify`                | Schema, transition, service, property, concurrency, and Layer integration tests as the guarantee requires       |

An owner factory is ordinary TypeScript or Effect construction, not another framework type. It may close over a `Ref`, queue, scope, repository, or actor and is called at the boundary that owns its lifetime. `Context.Service` is narrower: it keeps a replaceable capability visible in `R` without threading it through intermediate calls; its `Layer` owns construction and release.

```ts
class Sender extends Context.Service<Sender, {
  send: (message: RenderedMessage) => Effect.Effect<Receipt, SendError>
}>()("app/Sender") {}
```

## Pitfall 1: a refinement alone does not preserve a fact

```ts
// validated at admission, but its TypeScript type is still number
const PriorityValue = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 100 }),
)

// use a brand only when that fact must remain distinct downstream
const Priority = PriorityValue.pipe(Schema.brand("Priority"))
```

`Schema.brand` changes the decoded TypeScript type, not the runtime representation or checks. It prevents an arbitrary `number` from being passed where a `Priority` is required. Skip it when validation at admission is enough and downstream code does not benefit from the distinction.

## Pitfall 2: TypeScript has no linear types

```text
Rust:        complete(job: RunningJob)   -- consumed; reuse doesn't compile
TypeScript:  the old value stays in scope; other fibers may hold copies
```

So "complete the same job twice" is `REJECTED` or `GUARANTEED` by an atomic re-check at the owner's commit — never `IMPOSSIBLE`. Prefer an id plus that re-check over a state-typed input unless nothing else could hold the value concurrently. The implementation chooses its atomic mechanism only after the owner and storage medium are known.
