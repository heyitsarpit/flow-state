# Dispatch Desk: the reference application

A dispatcher's desk: a ticket queue with search, filters, paging, assignment and a live feed; a
ticket editor with saves, autosave, lock retries and permission handling; toasts other actors
send to; React views; deterministic Stories, tests and an entity property test; inspection and
the CLI.

It is written against the adopted design: [FlowState.plan](../../FlowState.plan), with
[minimal-library.md](../design/minimal-library.md) for the actor, operation and view surface
and [entity-domain.md](../design/entity-domain.md) for shared records. It is the example an
implementer builds the library against. **It is not runnable yet**: the library does not
exist. Only the Effect-only service, adapter and fixture files can be typechecked today; the
Flow-dependent examples and tests remain illustrative. Stage S10 of the plan makes it a running app.

## Start here

1. [ticket.operations.ts](features/Tickets/ticket.operations.ts): plain requests, which import
   no entity.
2. [ticket.domain.ts](features/Tickets/ticket.domain.ts): what those requests mean for shared
   ticket records.
3. [editor.definition.ts](features/Tickets/editor/editor.definition.ts) and
   [editor.machine.ts](features/Tickets/editor/editor.machine.ts): the editor, readable as the
   spec.
4. [queue.machine.ts](features/Tickets/queue/queue.machine.ts): a second machine reading the
   session, with polling that adapts to list availability.
5. [TicketPanel.tsx](features/Tickets/editor/TicketPanel.tsx) and
   [QueueList.tsx](features/Tickets/queue/QueueList.tsx): narrow views.

[editor.story.ts](features/Tickets/editor/editor.story.ts),
[editor.test.tsx](features/Tickets/editor/editor.test.tsx) and
[queue.test.ts](features/Tickets/queue/queue.test.ts): scenarios and assertions.

## Structure

| Location                                            | Responsibility                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [features/Session](features/Session/)               | permission and current-user truth others read                                                                                                 |
| [features/Toasts](features/Toasts/)                 | a shared actor other actors send to                                                                                                           |
| [features/Tickets](features/Tickets/)               | Schemas and errors, the service port, operations, the ticket entity and domain                                                                |
| [features/Tickets/editor](features/Tickets/editor/) | the editor: definition, machine, ref, hook, UI, Stories, tests                                                                                |
| [features/Tickets/queue](features/Tickets/queue/)   | the queue: definition, machine, ref, UI, Stories, tests                                                                                       |
| [app](app/)                                         | the closed app, lazy editor entry, setup, demo server, persistence, sign-out host and browser view                                            |
| [next](next/)                                       | request-scoped HTTP services and auth stub, a FlowProvider that owns one Runtime per scope, root session hydration and streamed queue segment |
| [testing](testing/)                                 | fixtures as Layers and the entity property test                                                                                               |
| [flow.config.ts](flow.config.ts)                    | Apps and Story globs the CLI discovers                                                                                                        |
| [tools](tools/)                                     | inspection, CLI and diagnostics examples                                                                                                      |

## Where each decision shows

Capability plans own semantics; FlowState remains the entry plan. Where a design example and
a plan differ, the plan wins; in particular shared multi-tab behaviour is deferred, and a second
tab only runs without persistence ([Persistence.plan](../../Persistence.plan) O7). The [SSR](../design/server-rendering.md) and
[lazy-feature](../design/lazy-features.md) designs explain the recipes.

| Contract                                                                                                   | Shown in                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FlowState D1: structure is data                                                                            | [editor.machine.ts](features/Tickets/editor/editor.machine.ts), [inspection.ts](tools/inspection.ts)                                                                                |
| Machines plan O1–O3: definitions, states, turns and internal events                                        | [editor.definition.ts](features/Tickets/editor/editor.definition.ts), [host.ts](app/host.ts)                                                                                        |
| Machines plan O2, O4: self, re-entry, ordered alternatives, nearest-handler fallthrough, deny/check        | [editor.machine.ts](features/Tickets/editor/editor.machine.ts), [TicketPanel.tsx](features/Tickets/editor/TicketPanel.tsx)                                                          |
| Machines plan O5–O7: schedules, outcomes and context reactions                                             | [editor.machine.ts](features/Tickets/editor/editor.machine.ts), [queue.machine.ts](features/Tickets/queue/queue.machine.ts), [toasts.machine.ts](features/Toasts/toasts.machine.ts) |
| Runtime plan O1–O4: wiring, Layers, shared/local actors, composite identities, sends                       | [app.ts](app/app.ts), [host.ts](app/host.ts), [editor.ref.ts](features/Tickets/editor/editor.ref.ts)                                                                                |
| Runtime plan O6–O7: bounded disposal and scope isolation                                                   | [host.ts](app/host.ts), [view.tsx](app/view.tsx), [providers.tsx](next/providers.tsx)                                                                                               |
| Operations plan O1–O4: keys, freshness, commit concurrency, attempts and streams                           | [ticket.operations.ts](features/Tickets/ticket.operations.ts)                                                                                                                       |
| Operations plan O5–O7: predictions, lane tags, hasMore and cancellation                                    | [QueueList.tsx](features/Tickets/queue/QueueList.tsx), [TicketPanel.tsx](features/Tickets/editor/TicketPanel.tsx)                                                                   |
| EntityDomains plan O1–O4: confirmed records, dependencies, repair and property tests                       | [ticket.domain.ts](features/Tickets/ticket.domain.ts), [queue.test.ts](features/Tickets/queue/queue.test.ts), [tickets.property.test.ts](testing/tickets.property.test.ts)          |
| Persistence plan O1–O6: storage, restore, attempt durability; O7: a second tab runs without persistence    | [persistence.ts](app/persistence.ts), [editor.tabs.story.ts](features/Tickets/editor/editor.tabs.story.ts)                                                                          |
| LazyFeatures plan O1–O3: declared lazy entry, synchronous adoption and dormant records                     | [app.ts](app/app.ts), [view.tsx](app/view.tsx), [editor.tabs.story.ts](features/Tickets/editor/editor.tabs.story.ts)                                                                |
| ServerRendering plan O1–O7: request Runtime, settle, payload, H1 and Next.js                               | [next](next/), [queue.ssr.story.ts](features/Tickets/queue/queue.ssr.story.ts), [queue.ssr.test.ts](features/Tickets/queue/queue.ssr.test.ts)                                       |
| React plan O1–O5: provider ownership, handles, views and eligibility                                       | [view.tsx](app/view.tsx), [useEditor.ts](features/Tickets/editor/useEditor.ts), [TicketPanel.tsx](features/Tickets/editor/TicketPanel.tsx)                                          |
| Testing plan O1–O8: Stories, fixtures, checkpoints, models, hydration and cleanup                          | [editor.story.ts](features/Tickets/editor/editor.story.ts), [editor.test.tsx](features/Tickets/editor/editor.test.tsx), [fixtures.ts](testing/fixtures.ts)                          |
| Diagnostics plan O1–O4: FlowError at host boundaries                                                       | [diagnostics.ts](tools/diagnostics.ts), [host.ts](app/host.ts)                                                                                                                      |
| Inspection plan O1–O6: async structural and passive live inspection, sinks, traces, keyed export redaction | [inspection.ts](tools/inspection.ts)                                                                                                                                                |
| CommandLine plan O1–O6: CLI and discovery                                                                  | [cli.ts](tools/cli.ts), [flow.config.ts](flow.config.ts)                                                                                                                            |
| Package plan O1–O3: core, React, server and inspection routes                                              | [next](next/), [tools](tools/)                                                                                                                                                      |

## What each scenario exercises

| Scenario                    | Features                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Save a title                | the domain predicts the title across this Runtime, confirms it and repairs affected lists                 |
| Edit while saving           | ordered Saved alternatives compare the moving draft with the confirmed response                           |
| Autosave                    | restartOn resets the two-second debounce; opening alone does not save                                     |
| Escape                      | discard edits first; a declined guard falls through to the parent's Close                                 |
| Save while locked           | tagged failure, backoff in memory and a final exhausted alternative                                       |
| Permission revoked mid-save | closes the editor; cancelling an invoked save honestly carries an unknown Attempt                         |
| Queue search                | normalized keys share a cache entry; placeholders retain rows during search                               |
| Mine only                   | context supplies the signed-in user's id; a user switch creates a new Runtime and scope                   |
| List unavailable            | HEALTHY/DEGRADED reflect list availability; polling uses bounded jittered backoff                         |
| Paging                      | 20 records a page, loaded pages in order, hasMore gates LoadMore; no unrepairable list total              |
| Assign to me                | prediction appears immediately; filtered lists and openCount repair on confirmation                       |
| Renamed elsewhere           | push updates confirmed records and repairs only answers that can be wrong                                 |
| Lazy editor                 | opening loads the panel chunk using React state; ensuring its ref adopts the declared entry               |
| SSR and hydration           | separate server/browser Stories; fresh list and openCount both reuse payload data; React no-mismatch test |
| Two tabs (v1)               | second tab is independent and reports SecondTabNoPersistence; no forwarding or handover                   |
| Reload mid-save             | abrupt close/reopen restores UNCERTAIN with the acknowledged Attempt; no replay of the save               |
| Sign-out                    | send SignedOut before dispose({ forget: true }); remount for a new user; no cross-tab broadcast           |
| Model exploration           | shortest paths include declared internal producers, replayed against live behavior                        |

The mirror-save/leader-close scenario in the original reference brief is deferred: multi-tab sharing is not in version 1.
The tab Stories retain the documented openTab/closeTab syntax for independent contexts and reload;
its test lock Layer must implement detect-and-refuse, not the deferred coordination design.
Browser gates in S10 must prove actual Web Lock refusal and zero storage I/O in the second tab,
plus reload and hydration in Chromium, Gecko and WebKit; these illustrative tests do not prove them.

## What writing it found

| Finding                                     | Current answer                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Edits during a save were lost               | saved holds only the confirmed title; compare it with the current draft after the outcome                                              |
| Ordered alternatives were missing           | first passing guard wins; all declining alternatives fall through; check collects their reasons                                        |
| Guards needed lane input                    | hasMore and assignment eligibility read the pre-turn activities in the same input check receives                                       |
| Composite ids could collide                 | actorRef takes parts arrays, not string-joined workspace/ticket ids                                                                    |
| List totals could stay stale                | only records and cursor have list repair guarantees; openCount is a separate derived read with a result Schema                         |
| Unknown saves had no actionable exit        | unknown carries the exported Attempt; UNCERTAIN retries that Attempt with the same id and encoded input                                |
| Re-entry differed from self                 | self retains active work; LOCKED is left for SAVING and re-entered on failure, so backoff grows from memory                            |
| Fixtures lacked service access              | fixture Layers are built on setup.services via Layer.provideMerge; duplicate fixture tags reject and replacement is explicit           |
| No-input ensure was ambiguous               | ensureActor(ref) and useActorByRef(ref, {}) ensure; useActorByRef(ref) only looks up; Session now has required userId input            |
| Stories could not create shared actors      | ensure(ref, options) creates them before sends; importing a Story runs nothing                                                         |
| Denial shape was unnamed                    | Denied contains reasons with code and context; view eligibility belongs to the guard                                                   |
| Paging and stream ownership were unclear    | lane data is ordered pages, hasMore gates .more; domain streams are activities and adapters use Stream.unwrap                          |
| Nearest handlers do not compose             | a handled child event replaces its parent's handler; SaveRequested stays in states where a new save is legal                           |
| Browser and server data needed the same API | Next uses token-authenticated HTTP on the server and cookie-authenticated HTTP in the browser; the standalone demo keeps DemoTicketApi |
| Multi-tab scope changed                     | v1 refuses persistence in a second tab; mirrors, shared predictions and leader handover are deferred                                   |

## Host assumptions

The Next authentication lookup is an explicit throwing stub. The HTTP adapter assumes the
Schema-shaped JSON routes, status codes and cursor-batch polling protocol documented in
[http-api.ts](next/http-api.ts); these are application choices, not Flow APIs. Replace the
localhost server origin with the deployment's trusted API origin. Browser fetches use the
current origin and cookies. An auth change must replace the Runtime before another user's
requests can enter it; v1 does not propagate sign-out to other tabs.

Story tabs and reload follow Testing.plan O7: tabs are independent Runtimes sharing the run's
memory storage, and a tab opened while another holds the scope runs without persistence.
Inspection specifies commit attempt identity semantically; the test uses `CommitStarted.attempt.id`
as the illustrative event encoding, pending the library's concrete trace types.

## Conventions

| Shape                                        | Owns                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `<name>.definition.ts` / `<name>.machine.ts` | vocabulary / behaviour                             |
| `<name>.ref.ts`                              | the feature's stable actor identities              |
| `<name>.operations.ts` / `<name>.domain.ts`  | plain requests / what they mean for shared records |
| `use<Name>.ts`                               | the feature's one hook: an actor and its commands  |
| `<name>.story.ts` / `<name>.test.ts(x)`      | scenario plans / assertions                        |
| `PascalCase.tsx`                             | React components                                   |

Production feature code never imports `app/` or `testing/`; app defaults import feature refs,
not the other way round. Story and test modules are composition boundaries and may import app
setup and fixtures. Relative `.js` imports refer to `.ts` and `.tsx` files.
