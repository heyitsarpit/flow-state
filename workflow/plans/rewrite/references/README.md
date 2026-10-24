# Dispatch Desk API reference

This example edits repair tickets using shared reads, local drafts, explicit saves, session permissions,
React views, deterministic Stories, and CLI evidence. Read it as a small consumer application.

**These are proposed rewrite APIs, not a runnable application or passing implementation proof.**
Current and archived Plans supply the API design. Unresolved forms stay marked beside their examples.
Paths in source comments are relative to this reference root unless they explicitly name a Plan.

## Structure and ownership

| Location                                                | Responsibility                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [features/Session](features/Session/)                   | Session vocabulary, machine, and selected permissions                          |
| [features/Tickets](features/Tickets/)                   | Shared ticket types, service port, and operation descriptors                   |
| [features/Tickets/editor](features/Tickets/editor/)     | Editor definition, behavior, selectors, UI, Stories, and assertions            |
| [features/Tickets/watcher](features/Tickets/watcher/)   | Self-contained alternate memory-driven subscription examples                   |
| [features/Tickets/progress](features/Tickets/progress/) | Optional technician stream candidate, separate from the main app               |
| [app](app/)                                             | Closed app graph, providers, setup, actor refs, host, persistence, and gateway |
| [testing/fixtures.ts](testing/fixtures.ts)              | Complete service substitutions shared by Stories                               |
| [tools](tools/)                                         | Consumer-facing inspection, diagnostic, and CLI examples                       |

## Start here

Follow [ticket.operations.ts](features/Tickets/ticket.operations.ts), then
[editor.definition.ts](features/Tickets/editor/editor.definition.ts) and
[editor.machine.ts](features/Tickets/editor/editor.machine.ts).
The definition fixes vocabulary; the machine supplies behavior; operations own shared data and work.

[app.ts](app/app.ts) admits the machines.
[implementation.ts](app/implementation.ts) supplies application services, and
[setup.ts](app/setup.ts) closes the Runtime configuration without importing Stories.
[host.ts](app/host.ts) demonstrates readiness, actor ownership, bridges, and cleanup.
[view.tsx](app/view.tsx) supplies that existing Runtime to the feature's
[TicketPanel.tsx](features/Tickets/editor/TicketPanel.tsx).

[editor.story.ts](features/Tickets/editor/editor.story.ts) owns recipes and reusable scenario plans.
[editor.test.ts](features/Tickets/editor/editor.test.ts) owns assertions after execution.
[behaviour.ts](app/behaviour.ts) registers selected Stories under external CLI IDs.
It uses the library's `behavior` function; the filename uses British spelling.
[cli.ts](tools/cli.ts) demonstrates all ten commands against `app/behaviour.ts`.
[api-reference.ts](api-reference.ts) maps every public target name and remaining call-form gap.

## File conventions

| Shape                                          | Owns                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| `<name>.definition.ts` / `<name>.machine.ts`   | Inert vocabulary / reusable behavior                      |
| `<name>.operations.ts` / `<name>.selectors.ts` | Operation descriptors / passive reads of captured truth   |
| `<name>.story.ts` / `<name>.test.ts`           | Scenario plans / test assertions                          |
| `PascalCase.tsx`                               | React components                                          |
| `types.ts` / `ticket-api.ts`                   | Shared domain values / replaceable application capability |

Keep small features in their parent directory. A cohesive submodule such as `editor/` owns its code,
Stories, tests, and UI together. Add `machines/`, `operations/`, `hooks/`, or `components/` only when
several independently useful files make that grouping easier to navigate. Extract a hook for reused
host integration, not merely to move a `useActor` call. Name helpers by their job instead of `utils/`.
Create no empty category folders or forwarding barrels.

Production feature code depends on domain values, operations, and exact provider definitions.
It imports neither app hosts nor testing code. Story and test modules are composition boundaries:
they may import app setup and shared fixtures. The app gateway selects Stories; setup never imports
that gateway. Adding a feature does not require editing a shared machine registry at runtime.

The in-memory demo adapter belongs to `app/demo-api.ts`. Each Runtime acquisition gets fresh state.
A production adapter would replace it and own transport and remote journaling. Closing the editor
releases its continuing read; only a lease or Runtime owns disposal.

Imports are inert except for test registration in `editor.test.ts`. The workspace test glob targets
`packages/**/*.test.ts`, so these proposed reference tests are not run by the workspace suite.
A consuming project supplies its own manifest, installed dependencies, and test setup.
Relative `.js` imports refer to the corresponding `.ts`/`.tsx` sources.

Semantic owners: [capability map](../README.md), [delivery entry](../ProjectDelivery.plan).
