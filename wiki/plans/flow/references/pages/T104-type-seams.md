---
page T104-type-seams
---
# Type seams: what an app author notices (T104, 2026-11-20)

**Bottom line:** more mistakes fail to compile. A token, ending or state read now carries its own definition, so using
one machine's word in another's place is a type error, and a turn that writes a `Flow.input` field is refused both
by the types and at run time.

```ts
// A definition keeps its id as a literal type (Pay.id: "shop/Pay"); every token, ending and handle carries it.
machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: Other.S.ON } }))    // fails to compile: Other's state
machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: { actions: [Cart.O.add.cancel] } } }))
                                                                           // fails to compile: Cart's operation

// memory: { who: Flow.input(Schema.String), count: Flow.initial(Schema.Number, 0) }
updateMemory: ({ memory }) => ({ count: memory.count + 1, who: "x" })     // fails to compile: `who` is input,
                                                                           // and the turn refuses it whole

runtimeSetup({ app, services, scope: "shop", persistence: { captureMs: -1 } })
                                                                           // NEW: refused at construction
                                                                           // (it silently acted as 0)
runtimeSetup({ app, services, persistence: { captureMs: 5000 } })          // fails to compile: no scope
```

A fake's control can no longer share an endpoint's name (the transfers fixture's was renamed `setBalance`).

In Stories, the run, its cut, `turnsOf`, `inspection`, `unsettledWrites` and trace reads are all typed by your app,
and a Story step for another app's actor is refused with `ForeignActorRef`.

New public types: `StateToken`, `HistoryToken`, `ActionToken`, `GuardToken`, `StateRead`, `RootToken`, `GuardArg`,
`Ending`, `UnknownEnding`, `WriteEndings`, `ReadEndings`, `NamedEvidence`, `ServiceIds`, `Saving`, `ControlWord`.

## Still compiles

- A misspelt key inside a handler's body, alternative or list compiles; construction refuses it at load. A misspelt
  key in a returned write compiles and is refused at the turn. TypeScript does not check returned objects for extra
  keys, and the exact-body shape tried broke the typing of handles and sends.
- `unsettledWrites<typeof Pay>()` lets a caller name a narrower app than the real one; @task.V3.T105 removes the
  parameter.

## For your decision

**Q1.** The public testing entry no longer exports `Step.ensure`, `Step.detach`, `Step.send`, `Step.dispose`,
`WorldWord` or `FakeWorld` (commit `2dcd3cf4`). Each had a Story or Fake word that builds the same step from a checked
ref, so Stories lose nothing; hand-built step data is still refused when it runs.

- **A (recommended):** keep them removed: one typed way to write a step.
- **B:** export them again.

## Status

Read by the user, 2026-11-20. Q1 A, final (2026-11-20): the words stay removed.
