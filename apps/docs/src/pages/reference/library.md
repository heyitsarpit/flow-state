# Library Reference [Aspirational API inventory]

Status: aspirational.

This reference is not an implementation contract yet. It is a quick interface map for planning and example design.

## Package Shape

| Package                | Purpose                                                         | Status                       |
| ---------------------- | --------------------------------------------------------------- | ---------------------------- |
| `@flow-state/core`     | Framework-independent runtime and primitives.                   | Stub exists.                 |
| `@flow-state/react`    | React provider and hooks.                                       | Planned.                     |
| `@flow-state/devtools` | Debugging UI for cache, mutations, machines, and Effect traces. | Later.                       |
| `@flow-state/test`     | Test helpers for examples and user apps.                        | Planned or folded into core. |

## Core Imports

| Import             | Kind      | Description                                                                                                | Status                                 |
| ------------------ | --------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `flow`             | Namespace | Machine-first API surface for workflows, invoked Effects, queries, mutations, streams, helpers, and tests. | Primary hypothesis.                    |
| `createRuntime`    | Function  | Creates the app runtime from Effect layers and Flow State options.                                         | Planned.                               |
| `createModule`     | Function  | Groups related resources, mutations, machines, and local state.                                            | Provisional.                           |
| `atom`             | Function  | Defines local state when machine context is too heavy.                                                     | Internal or secondary.                 |
| `computed`         | Function  | Defines derived state from atoms, resources, or selectors.                                                 | Internal or secondary.                 |
| `resource`         | Function  | Defines cached remote reads backed by Effect.                                                              | Internal or secondary.                 |
| `mutation`         | Function  | Defines typed writes, invalidation, optimistic update, and rollback.                                       | Internal or secondary.                 |
| `machine`          | Function  | Defines explicit workflow state.                                                                           | May be exposed through `flow.machine`. |
| `stream`           | Function  | Defines subscription-like pushed values backed by Effect Stream.                                           | Planned.                               |
| `cache`            | Namespace | Cache keys, tags, invalidation, snapshots, and refresh helpers.                                            | Planned.                               |
| `key`              | Function  | Creates or brands cache keys.                                                                              | Open.                                  |
| `tag`              | Function  | Creates or brands invalidation tags.                                                                       | Open.                                  |
| `fromEffectResult` | Function  | Converts an Effect into an actor result where expected failures are data.                                  | Planned.                               |
| `fromEffectStream` | Function  | Converts an Effect Stream into an invoked actor or subscription.                                           | Planned.                               |
| `effectAction`     | Function  | Runs fire-and-forget Effects for non-critical actions such as telemetry.                                   | Planned with caution.                  |
| `testRuntime`      | Function  | Creates a runtime suitable for tests.                                                                      | Planned.                               |

## React Imports

| Import         | Kind      | Description                                                           | Status   |
| -------------- | --------- | --------------------------------------------------------------------- | -------- |
| `FlowProvider` | Component | Provides Flow State runtime to React.                                 | Planned. |
| `useFlow`      | Hook      | Uses a machine-first flow in React.                                   | Planned. |
| `useMachine`   | Hook      | Subscribes to machine state and sends events.                         | Planned. |
| `useSelector`  | Hook      | Selects a stable slice of runtime, machine, cache, or context state.  | Planned. |
| `useResource`  | Hook      | Reads a resource directly if standalone resources survive API review. | Open.    |
| `useMutation`  | Hook      | Runs a mutation directly if standalone mutations survive API review.  | Open.    |
| `useAtom`      | Hook      | Reads and writes local atom state if atoms survive as public API.     | Open.    |

## Flow Namespace

| Member          | Description                                                                            | Status              |
| --------------- | -------------------------------------------------------------------------------------- | ------------------- |
| `flow.machine`  | Defines a workflow with states, context, events, guards, assignments, and invocations. | Primary hypothesis. |
| `flow.query`    | Defines a cached Effect invocation used by a machine state.                            | Primary hypothesis. |
| `flow.mutation` | Defines a typed write invocation used by a machine state.                              | Primary hypothesis. |
| `flow.stream`   | Defines a stream invocation used by a machine state.                                   | Planned.            |
| `flow.effect`   | Defines a non-cached Effect invocation.                                                | Planned.            |
| `flow.assign`   | Defines typed context assignment.                                                      | Planned.            |
| `flow.guard`    | Defines typed transition guards.                                                       | Planned.            |
| `flow.action`   | Defines synchronous or fire-and-forget transition actions.                             | Planned.            |
| `flow.schema`   | Attaches Effect Schema or schema-like type metadata.                                   | Open.               |
| `flow.option`   | Declares optional context fields.                                                      | Open.               |
| `flow.some`     | Creates present optional values.                                                       | Open.               |
| `flow.none`     | Creates absent optional values.                                                        | Open.               |
| `flow.unwrap`   | Reads required optional values at controlled boundaries.                               | Open.               |
| `flow.runtime`  | Creates or accesses runtime configuration.                                             | Open.               |
| `flow.test`     | Test helper namespace.                                                                 | Open.               |

## Conceptual Interfaces

| Interface    | Purpose                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Runtime      | Owns the Effect runtime, cache state, actors, subscriptions, and test/runtime configuration.      |
| Machine      | Owns workflow state, allowed events, context, invoked work, and typed success/failure routing.    |
| Query        | Represents a cached read attached to a state boundary.                                            |
| Mutation     | Represents a typed write with invalidation and later optimistic rollback.                         |
| Stream       | Represents pushed values or long-running subscriptions that stop on state exit.                   |
| Cache        | Stores query results, freshness, subscribers, invalidation state, and later optimistic snapshots. |
| Test Runtime | Supplies fake services, runs transitions, records cache/effect logs, and exposes assertions.      |

## State Unions To Design Later

Resource state:

- Idle.
- Loading.
- Refreshing.
- Success.
- Failure.

Mutation state:

- Idle.
- Running.
- Success.
- Failure.

Machine state:

- Open until Project Editor creates concrete needs.

Stream state:

- Open until File Upload creates concrete needs.
