# Folder structure recommendation

Status: non-normative recommendation

This recommendation describes how reference applications may organize Flow State code. It does not
change the runtime contract, package exports, machine identity, module admission, `App.M`, or any
existing `REV-*` rule. A file move MUST NOT change a machine ID, module ID, `App.M` property, actor ref,
or operation ID.

The recommendation borrows the useful part of a React component layout: a feature is the unit that
explains one product concern, and its implementation, local types, helpers, selectors, host hooks, UI,
and tests stay near one another. It does not require every feature to have the same files or every
machine to have its own app module.

## REC-FS-001 — Organize by feature and concern

A feature directory SHOULD contain the code that changes together to implement one user or domain
concern. A Flow machine SHOULD be treated like a React component: it is a reusable behavior boundary
inside the feature, not a reason to put unrelated feature support into one global machine file.

Feature names SHOULD match the product vocabulary and the corresponding UI feature names, such as
`NewIntent`, `Wallet`, and `Intents`. Technical subdirectories SHOULD describe a real secondary concern,
such as `operations`, `selectors`, `hooks`, `components`, `tests`, `services`, or `utils`.

The preferred shape is flexible rather than prescriptive:

```text
features/
  NewIntent/
    machines/
      new-intent.ts
    types.ts
    operations/
    selectors/
    hooks/
    components/
    tests/
    utils/
  Wallet/
    machines/
      wallet.ts
  Intents/
    machines/
      intents.ts
```

The `machines/` directory SHOULD contain one machine per file. Each machine file SHOULD define the
machine's static `definition(...)` immediately above its `machine(...)` behavior, keeping the static
interface beside the function that implements it:

```ts
// machines/new-intent.ts
const NewIntent = flow.definition({
  // states, events, memory, and operations
});

const newIntentMachine = flow.machine(NewIntent, ({ S, E, O }) => ({
  // behavior
}));

export { NewIntent, newIntentMachine };
```

The definition and machine implementation SHOULD remain in the same file; `definition.ts` and
`behavior.ts` SHOULD NOT be introduced as a default split. A machine file MAY import types, operations,
selectors, or helpers from its owning feature and shared directories. No rule requires one file per state
or one file per operation; the one-machine-per-file convention is the machine boundary.

## REC-FS-002 — Keep app composition separate from feature behavior

The application composition root SHOULD contain only admission and host wiring:

```text
app/
  app.ts          # module, app, and AppPlan composition
  refs.ts         # stable actor refs
  runtime.ts      # RuntimeFactory boundary
  routes/         # only when route integration exists
```

One app module MAY admit several feature machines. A feature directory does not imply a module, and a
machine does not need a module of its own. `module({ machines })` remains the explicit admission record;
folder discovery, barrel imports, and directory names MUST NOT register machines automatically.

An app file SHOULD not contain machine definitions, operation implementations, selectors, React hooks,
or test fixtures merely because those values are ultimately imported by the app. If composition grows,
split it into `app.ts`, `refs.ts`, `runtime.ts`, and host-specific files instead of creating a second
catch-all application file.

## REC-FS-003 — Split files when the concern changes, not at an arbitrary size

The first split SHOULD follow semantic ownership:

- static definition and machine behavior belong together in one file under the feature's `machines/`
  directory;
- operation descriptors and their input/key types belong to the owning feature's `operations/` files
  when they are shared by that feature's machines;
- passive selectors belong to the owning feature's `selectors/` files;
- React hooks and command unifiers belong to the owning feature's `hooks/` files;
- UI components belong to the feature's `components/` files;
- Test and Story source belongs under the relevant feature or app `tests/` directory.

A file MAY contain several related exports when they are one cohesive concern. Splitting a file only to
make every export have a separate filename is discouraged. Conversely, a file SHOULD be split when it
contains unrelated feature state, unrelated operation families, unrelated selector projections, or a
host layer that could be understood independently.

The recommendation intentionally has no line-count threshold. A file is too large when its readers must
understand unrelated ownership or lifecycle rules to change one concern, not when it reaches an arbitrary
number of lines.

## REC-FS-004 — Keep types at their narrowest useful scope

Types SHOULD live beside the first code that gives them meaning:

- a type used by one function MAY remain in that file;
- a type shared by one feature's machine, operations, selectors, and components SHOULD live in that
  feature's `types.ts` or the nearest owning subdirectory;
- an operation input or canonical-key type SHOULD live beside its operation descriptor;
- a type SHOULD move to `shared/types/` only after unrelated features genuinely share the same concept;
- package-wide public types belong to the package's public type surface, not to an example feature folder.

`domain.ts` SHOULD NOT become the default home for every type and pure function in an application. A
shared type directory is an intentional promotion for stable cross-feature concepts, not a mandatory
staging area for new types.

## REC-FS-005 — Group operations by owning feature

Operation descriptors SHOULD be grouped by the feature that owns their use and lifecycle. A feature MAY
keep several related descriptors in one `operations.ts` file or split them into cohesive files such as
`quotes.ts`, `balances.ts`, and `submission.ts`. One descriptor per file is optional.

An operation shared by several machines in one feature belongs in that feature's `operations/` directory.
An operation used by several unrelated features belongs in `shared/operations/`; its `P` input, key type,
and operation-specific domain values SHOULD move with it. A large `primitives.ts` file that mixes wallet
resources, quote resources, URL transactions, and intent streams SHOULD be replaced by these ownership
boundaries rather than becoming a permanent shared bucket.

External service adapters follow the same rule. Shared adapters belong under `shared/services/`, while a
service used by one feature MAY remain under that feature's `services/`. A catch-all `services.ts` is not
the default organization.

## REC-FS-006 — Selectors are ordinary feature code, not registered views

Because Flow has no public `flow.view`, machine projections SHOULD NOT be collected in `views.ts`, a
`views/` registry, or a module view catalogue. Selectors are ordinary pure functions and SHOULD live
beside the feature or component that consumes them:

```text
NewIntent/
  selectors/
    route.ts
    amount.ts
    recipient.ts
    estimates.ts
    submission.ts
  hooks/
    useNewIntentRoute.ts
    useNewIntentAmount.ts
    useNewIntentCommands.ts
```

A selector that is reused by several components MAY be exported from the feature's `index.ts`, but it
SHOULD remain in the feature's selector area. A selector that is genuinely shared across features MAY
live under `shared/selectors/`. The name `view` MAY still describe a UI component; it SHOULD NOT describe
an obsolete Flow registration mechanism.

The shared selector contract remains the API authority: scalar and non-record selections use complete
value equality, named returned records use fixed-field equality, and a selector should return only the
fields that its consuming component or activity needs.

React components SHOULD subscribe through a feature selector and use the feature's semantic command
facade rather than selecting a whole machine model and passing unrelated state through props:

```tsx
function AmountField() {
  const { amount } = useNewIntentAmount();
  const { changeAmount } = useNewIntentCommands();

  return <AmountInput value={amount} onChange={changeAmount} />;
}
```

The page or feature root SHOULD compose these focused components. A component's local focus, hover, and
DOM-only input state can remain in React; durable state, cross-component coordination, asynchronous
ownership, and state that needs Story coverage are candidates for the feature machine.

## REC-FS-007 — Put utilities in predictable utility directories

Utility placement SHOULD be mechanical:

- feature-only helpers belong under that feature's `utils/` directory;
- helpers shared by unrelated features belong under `shared/utils/`;
- package-wide helpers belong under the package's established utility path;
- a root-level `utils.ts`, `domain.ts`, or `helpers.ts` SHOULD NOT become a miscellaneous bucket.

The utility directory does not erase semantic names. `NewIntent/utils/quote-input.ts` is preferable to a
single `NewIntent/utils.ts` once quote construction and submission construction have different owners.
Pure domain calculations remain close to their feature even when they are called utilities.

## REC-FS-008 — Use tests folders and explicit source suffixes

Features and app compositions MAY have a `tests/` directory. Feature-owned tests and Stories SHOULD live
under `features/<Feature>/tests/`, while cross-feature app tests and Stories SHOULD live under `app/tests/`.
This recommendation deliberately does not define the internal layout or contents of any `tests/` directory.

Test source files SHOULD use `.test.ts` or `.test.tsx`:

```text
machine.test.ts
component.test.tsx
```

Story source files SHOULD use `.story.ts` or `.story.tsx`:

```text
wallet-connect.story.ts
new-intent.story.ts
```

The folder structure SHOULD make unused host factories and unreferenced examples conspicuous. A
`route-host.ts` or `host-usage.ts` file SHOULD exist only when a real route or host imports it; an
unused host abstraction should not be preserved as a required layer of the example.

## REC-FS-009 — Use feature entrypoints deliberately

Each feature MAY expose one `index.ts` as its public local entrypoint:

```ts
export { NewIntent, newIntentMachine } from "./machines/new-intent";
export { useNewIntentCommands } from "./hooks/useNewIntentCommands";
export { selectNewIntentRoute } from "./selectors/route";
```

Internal feature files SHOULD import directly from the owning file when that avoids cycles. Root-level
barrels SHOULD be limited to intentional application or package boundaries; a barrel MUST NOT turn a
directory into an implicit registration mechanism.

## Recommended reference layout

Applied to the Everclear example, a possible target layout is:

```text
everclear-new-intent/
  app/
    app.ts
    refs.ts
    runtime.ts
    tests/
  features/
    NewIntent/
      index.ts
      machines/
        new-intent.ts
        amount-input.ts # only if AmountInput becomes an independent machine
      types.ts
      operations/
        quotes.ts
        order.ts
        balance.ts
        submission.ts
        url.ts
      selectors/
        route.ts
        amount.ts
        recipient.ts
        estimates.ts
        submission.ts
      hooks/
        useNewIntent.ts
        useNewIntentCommands.ts
      components/
        AmountInput.tsx
        CreateIntentButton.tsx
        Estimates.tsx
        SelectDestinationData.tsx
        ToAddress.tsx
      tests/
      utils/
        memory.ts
        quote-input.ts
        submission.ts
        url.ts
    Wallet/
      index.ts
      machines/
        wallet.ts
      operations.ts
      types.ts
      selectors/
      hooks/
      tests/
    Intents/
      index.ts
      machines/
        intents.ts
      operations.ts
      types.ts
      selectors/
      hooks/
      tests/
  shared/
    operations/
      # descriptors used by unrelated feature machines
    services/
      explorer-api.ts
      browser-bridge.ts
    types/
      network.ts
    utils/
    operation-state.ts
```

This layout is illustrative. `NewIntent/operations.ts` is a valid smaller alternative to the nested
`operations/` directory, and a machine file MAY contain all of its behavior while importing shared
operations. The `machines/` directory remains the one-machine-per-file boundary; the choice inside
feature and shared directories follows cohesion and change boundaries rather than a repository-wide
file-count rule.

The current example maps naturally into this shape:

| Current file                       | Recommended ownership                                            | Reason                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `flow-state/app.ts`                | `app/app.ts` and `app/refs.ts`                                   | Keep admission, plan, and stable refs as composition concerns.                                  |
| `flow-state/domain.ts`             | Feature `types.ts` and feature `utils/` files                    | Separate NewIntent, Wallet, Intents, and truly shared concepts.                                 |
| `flow-state/primitives.ts`         | Feature `operations/` plus `shared/operations/`                  | Keep operations together by actual ownership and sharing rather than one global primitive file. |
| `flow-state/machines/*.machine.ts` | `features/<Feature>/machines/<machine>.ts`                       | Keep one definition and one machine implementation together in each machine file.               |
| `flow-state/views.ts`              | Feature `selectors/` and shared passive-state types where needed | There is no registered Flow view surface.                                                       |
| `flow-state/react.ts`              | Feature `hooks/` and component-local selectors                   | Keep `useNewIntentCommands` and related hooks together.                                         |
| `flow-state/services.ts`           | `shared/services/` or feature-local `services/`                  | Split adapters by boundary and actual ownership.                                                |
| `flow-state/stories.ts`            | Feature or app `tests/*.story.ts`                                | Rename Story sources to the explicit `.story.ts` convention.                                    |
| `flow-state/stories.test.ts`       | Feature or app `tests/`                                          | Keep each proof beside the behavior or integration boundary it covers.                          |
| `flow-state/route-host.ts`         | `app/routes/` only if used                                       | Do not preserve an unused host abstraction.                                                     |
| `flow-state/runtime-boundary.ts`   | `app/runtime.ts`                                                 | Keep the runtime factory at the host boundary.                                                  |

## Machine-boundary heuristic

Folder boundaries do not decide machine boundaries. A concern is a good candidate for its own
app-admitted machine when it has an independent state protocol, memory, operation ownership, lifecycle,
or reusable host/component boundary. A concern should remain in an existing machine when it shares the
same invariants, transitions, persistence identity, and activity lifetime with that machine.

`AmountInput` is therefore a valid candidate for a focused machine if its draft, validation, debounce,
and quote interaction form an independently testable component-like protocol. Under the accepted
no-child-machine model, that would be a separate app-admitted machine feature, not a nested child actor.
It is not a candidate merely because it is a component: ephemeral focus or input DOM state should stay
local to React when no other owner needs it.
The folder layout can support either choice without requiring a rename of unrelated features.
