# Effect realization (target: effect-v4)

Apply this guide across the implementation and every concrete Spec design section, including
models, operations, algorithms, and composition; its scope is not limited to `realization`.

Read when Effect is the chosen target. Apply choices in code or the requested proposal.
Confirm API names against the installed version's types; Effect v4 has churned across betas.

## Mapping

| Spec content             | Effect realization                                                                                             |
|--------------------------|----------------------------------------------------------------------------------------------------------------|
| `model` value            | `Schema` owns admission; brand only when the value must remain distinct downstream                             |
| `model` state            | plain data; `Data.TaggedEnum` + `Data.taggedEnum` for trusted, mutually exclusive variants                     |
| `model` transition       | a plain function or `Result` when pure; an owner operation when it changes owned state                         |
| `operations` entry       | plain when pure; otherwise `(Input) => Effect.Effect<Output, DomainError, Requirements>`                       |
| `concern` (transformer)  | a plain function or `Data.taggedEnum<>().$match`                                                               |
| `concern` (capability)   | an argument when local; `Context.Service` when a substitutable capability crosses call levels                  |
| `protocol`               | immutable data; use `Schema` at an untrusted boundary and brand only when nominal distinction helps downstream |
| `owner`                  | a private **owner factory**: constructs the state or lifetime authority and returns narrow operations          |
| `composition.boundaries` | the operation signature and named protocol; a service method only for a contextual capability                  |
| `rules.publication`      | the indivisible decision and state publication promised by the Spec — not a prescribed Effect primitive        |
| `model` error            | expected recoverable failure in `E`; interruption and defects remain outside the domain-error channel          |
| `composition.uses`       | data stays in arguments; contextual capabilities stay in `R`; `Layer` constructs, provides, and releases them  |
| `tests`                  | Public-boundary checks for relevant contract outcomes under testing-policy                                     |

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

So "complete the same job twice" needs an atomic re-check at the owning operation; a state-typed input alone cannot block that attack. Prefer an id plus that re-check unless nothing else could hold the value concurrently. The implementation chooses its atomic mechanism only after the owner and storage medium are known.
