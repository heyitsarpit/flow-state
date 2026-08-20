# Canonical runtime vocabulary

Status: archived accepted decision record; transferred into the active contracts.

The implementation uses these canonical terms:

- `App`: the authored static application composition.
- `AppPlan`: the closed-world compiled plan for one App.
- `Module`: a named grouping of machines inside an App. Modules remain part of the public authored
  structure because they provide tooling and artifact boundaries.
- `Implementation`: the one injectable service-provider boundary supplied to an App or machine. It
  can provide production capabilities or mocks for operation dependencies; different RuntimeSetups
  can select different Implementations. The resolved Runtime has one provider per service identity.
  This replaces the user-facing term `Layer`.
- `RuntimeSetup`: the inert app-bound recipe containing one selected Implementation and other construction
  inputs, created by `runtimeSetup(...)`, that constructs one fresh Runtime. This replaces the
  user-facing term `RuntimeFactory`.
- `Runtime`: one live production execution instance with actor, resource, work, evidence, and cleanup
  ownership.
- `ActorRecipe`: an inert run-local actor construction input.
- `Fixture`: an inert, run-local Story environment descriptor whose primary purpose is to provide or
  replace parts of an Implementation.
- `Story external behavior`: complete service functions supplied by an `Implementation`. The Runtime keeps
  the operation boundary and kernels real; the superseded `Control` and `simulate(...)` concepts are
  migration evidence, not target vocabulary.

`App`, `AppPlan`, `Implementation`, `RuntimeSetup`, `Runtime`, and `ActorRecipe` are distinct because
they have different ownership and lifetime semantics. They must not be collapsed into one mutable
application object. `AppPlan` and the concrete runtime machinery remain package-private where the
public API does not require them; the vocabulary remains canonical in implementation contracts and
proofs.

## Visibility

`App`, `Module`, `Runtime`, and the Story constructors are public API. `Implementation`, `RuntimeSetup`,
and `ActorRecipe` are understood public concepts and may be inferred structurally at API boundaries;
`runtimeSetup(...)` is the construction entry point, and callers should not need extra helper types
merely to use it. `AppPlan` remains package-private.

## Rejected simplifications

- Combining `App` and `Runtime`: rejected because static application identity must remain independent
  from environment-specific capabilities and live resource ownership.
- Combining `Implementation` and `Runtime`: rejected because an Implementation is injectable service
  setup while a Runtime is one acquired, isolated execution instance.
- Combining App Stories and Machine Stories: rejected because they prove different scopes and expose
  different command and evidence rules.
- Removing Modules: rejected because module identity remains necessary for tooling and artifact
  boundaries.
- Adding a separate Control provider system: rejected because complete service Implementations provide
  external behavior while the production operation kernels remain the observation and completion boundary.
