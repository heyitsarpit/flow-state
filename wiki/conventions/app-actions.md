---
convention app-actions
---
# App actions

**The rule:** a contract calls the app's own code through an Effect service it lists in `services`; the app supplies
every service once, in the Runtime's Layer.

## When it applies

Any operation whose work the app defines: an HTTP client, an SDK, a command registry, storage.

## Before and after

```ts
// BEFORE (removed in 2026-10, decision D15): each machine carries its own implementations
const PaletteForApp = PaletteMachine.provide({ runCommand: ({ command }) => commands[command]() })
```

```ts
// AFTER
export class CommandsApi extends Context.Service<CommandsApi, {
  readonly run: (input: { readonly command: string }) => Effect.Effect<void, CommandFailed>
}>()("Palette/CommandsApi") {}

export const runCommand = transaction({
  id: "Palette/run",
  input: { command: Schema.String },
  key: ["command"],
  concurrency: "reject",
  services: [CommandsApi],                                           // the runtime record of what it needs
  commit: (input) => Effect.flatMap(Effect.service(CommandsApi), (api) => api.run(input)),
})

const services = Layer.succeed(CommandsApi, { run: ({ command }) => commands[command]() })
runtimeSetup({ app: PaletteApp, services })                          // a missing service is a type error
```

## Why

|                          | One Layer per Runtime                                |
| ------------------------ | ---------------------------------------------------- |
| A missing implementation | a type error, then refused by name at boot           |
| Lifetime                 | acquired once, released when the Runtime is disposed |
| Tests and Stories        | swap one Layer (`Fake.http`, `Fake.storage`)         |
| Server and browser       | a server Layer and a browser Layer                   |
| The graph                | one machine, never provided variants                 |

Two instances that need different actions are two factory calls, not one dispatching service
(@convention.reusable-primitives).

## Prior art

Effect's services and Layers; `references/checkout/app/setup.ts` and `references/dispatch-desk/app/setup.ts`.

## Status

Built (`packages/flow-state-v3/src/host/runtime.ts`). Not built: the boot's refusal by service name, and reading the
`services` list at run time
(`ui-primitives-decisions` Q6d; full text: git show 3a84b878:wiki/plans/flow/references/proposals/2026-11-16-ui-primitives-decisions.md).
