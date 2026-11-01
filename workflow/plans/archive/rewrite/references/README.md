# Dispatch Desk API reference

A small dispatcher application: a ticket queue with search and filters, a ticket editor with
saves, autosave and lock handling, session permissions, React views, deterministic Stories and
CLI evidence. Read it as a consumer application written against the proposed rewrite API.

**These are proposed APIs, not a runnable application or implementation proof.** The reference
applies the decisions in [SurfaceSimplification.plan](../SurfaceSimplification.plan) (D1–D60).
Choices the Plans have not made yet are listed in [api-reference.ts](api-reference.ts).

## Structure

| Location                                              | Responsibility                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [features/Session](features/Session/)                 | Permission and current-user truth that other machines read                               |
| [features/Tickets](features/Tickets/)                 | Ticket domain Schemas and tagged errors, the service port, operation descriptors         |
| [features/Tickets/editor](features/Tickets/editor/)   | Editor definition, machine, selectors, UI, Stories and tests                             |
| [features/Tickets/queue](features/Tickets/queue/)     | Queue with derived list keys, context-driven resubscription and health-aware polling     |
| [features/Tickets/watcher](features/Tickets/watcher/) | Standalone examples: redirects, ordered alternatives, reentry, conditional root activity |
| [app](app/)                                           | Closed app, refs with their wiring, services, persistence, host and view                 |
| [testing/fixtures.ts](testing/fixtures.ts)            | Failure-variant service Layers shared by Stories                                         |
| [flow.config.ts](flow.config.ts)                      | Apps and Story globs the CLI discovers                                                   |
| [tools](tools/)                                       | Inspection, diagnostics and CLI examples                                                 |

## Start here

1. [ticket.operations.ts](features/Tickets/ticket.operations.ts): the network data and mutations.
2. [editor.definition.ts](features/Tickets/editor/editor.definition.ts): the editor's whole
   vocabulary in one place.
3. [editor.machine.ts](features/Tickets/editor/editor.machine.ts): the behaviour, readable as
   the spec.
4. [queue.machine.ts](features/Tickets/queue/queue.machine.ts): a second machine reading the
   session, with schedules that adapt to feed health.
5. [app/actors.ts](app/actors.ts) and [app/host.ts](app/host.ts): stable identities, wiring
   and ownership.
6. [editor.story.ts](features/Tickets/editor/editor.story.ts) and
   [editor.test.ts](features/Tickets/editor/editor.test.ts): scenarios and assertions.

## What each scenario exercises

| Scenario                    | Features                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Save a title                | Static actions, outcome events, writes into the cache, partial-key invalidation of queue pages        |
| Autosave                    | A `schedules` entry restarted by `reenter` on each edit (debounce)                                    |
| Save while locked           | Failure routed by error tag into a `LOCKED` state, memory-driven backoff, `deny("RetryLimitReached")` |
| Permission revoked mid-save | A context reaction that closes the editor and cancels the in-flight save                              |
| Empty or long title         | `deny("EmptyTitle")`, `deny("TitleTooLong", { length, max })`, `can(…, { explain: true })`            |
| Queue search                | A derived key: `"Lobby "` and `"lobby"` share one cache entry                                         |
| "Mine only" + user switch   | Subscription parameters read context, so a new user replaces the subscription by key                  |
| Queue feed down             | `HEALTHY`/`DEGRADED` states, `Schedule.spaced` polling vs capped, jittered exponential backoff        |
| Model exploration           | `model(…).getShortestPaths` with a `stateKey` over the predicted snapshot                             |

## Findings: what looks complicated or weird

Applying the decisions surfaced these. Each is a candidate for the next round of changes.

1. **Updating memory while staying in the current state needs a target.** D1 requires one, so
   the queue repeats its filter handlers in both health states through a `filterHandlers(stay)`
   builder. A transition that keeps the current leaf has no clean spelling at a parent or root.
2. **Shared guards lose inference.** Hoisting `canSave` out of a transition needs a hand-written
   parameter type. Either the machine callback needs exported helper types
   (`GuardOf<typeof Editor>`), or sharing must stay inline. `commitDraft` avoided the problem by
   deriving its request id from memory, which also removed the `requestId` payload from
   `SaveRequested`.
3. **A schedule restarts on every state entry,** so backoff across retries that pass through
   another state never grows. The lock retry computes its delay from memory instead; multi-step
   Schedules only pay off while an actor stays in one state, such as queue polling.
4. **Outcome payload rule is unsettled.** The reference spreads the success value's fields
   (`SaveSucceeded: Ticket.fields`) and passes a tagged error's fields. The Plan says only "the
   Runtime passes the result to the constructor".
5. **Context reactions and payload events don't fit.** D23 calls the event with
   `(current, previous)`, but events now take one object. The reference only uses bare reaction
   events.
6. **State tokens are objects,** so anything serialised (model `stateKey`, traces) must encode
   through `Schema.encodeSync(Editor.State)`. A path string on the token might be simpler.
7. **Readers must keep identity for unchanged entries.** Real view models hold cached objects
   (`editorView` returns `ticket`, QueueList holds `list`). If `getState`/`getData` return a new
   object each publication, field-wise comparison fails and every publication re-renders. This
   should become a reader requirement in the Resources plan, not a documentation note.
8. **Some Story outcomes depend on adapter timing.** "Revoked mid-save" cannot say whether the
   save finished before the cancel without a fixture that holds the request open, and no
   fixture pattern for that exists yet.
9. **The editor still declares 15 events,** most of them timer, reaction and outcome plumbing.
   Users and other actors cause only seven of them.
10. **UI reads machine states, not operation lanes.** The realistic editor UI decides everything
    from `S.X.is`, memory and `can`; operation lanes matter only for cached data and the honest
    "may have saved" case. Errors arrive already translated into memory by the machine, so no
    component matches on error tags. `Match.valueTags` appears once, in the queue list body,
    where every lane renders differently. The "data / loading / failed" reading appears in one
    view model, which is not yet enough repetition to justify a Flow-owned projection.
11. **Opening a durable editor from the UI has no path.** `useActorByRef` never ensures, so a
    ticket opened from the queue uses a component-owned local actor (`OpenTicket`), which is not
    persisted. A durable per-ticket editor would need the host to ensure it first.
12. **The actor handle type has no public name.** Components that receive a handle need one; the
    reference writes `Actor<typeof EditorMachine>`.

## Conventions

| Shape                                          | Owns                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `<name>.definition.ts` / `<name>.machine.ts`   | Vocabulary / behaviour                                     |
| `<name>.operations.ts` / `<name>.selectors.ts` | Operation descriptors / passive reads of one snapshot      |
| `<name>.story.ts` / `<name>.test.ts`           | Scenario plans / assertions                                |
| `PascalCase.tsx`                               | React components                                           |
| `types.ts` / `ticket-api.ts`                   | Domain Schemas and tagged errors / the replaceable service |

Keep small features in their parent directory; give a cohesive submodule (`editor/`, `queue/`)
its code, Stories, tests and UI together. Production feature code never imports app hosts or
testing code. Story and test modules are composition boundaries and may import app setup and
fixtures. Imports are inert except test registration. The workspace test glob targets
`packages/**/*.test.ts`, so these tests are not run. Relative `.js` imports refer to `.ts`/`.tsx`.

Semantic owners: [capability map](../README.md), [delivery entry](../ProjectDelivery.plan),
[simplification decisions](../SurfaceSimplification.plan).
