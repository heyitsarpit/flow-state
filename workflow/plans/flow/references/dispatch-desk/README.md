# Dispatch Desk: the reference application

A dispatcher's desk, written against the design in
[machine-design.md](../explorations/machine-fragments/machine-design.md) ("MD"). It has a ticket queue (search,
filters, paging, keyed "assign to me"), a ticket editor (autosave, lock retries, the hold on an unknown save, writes that
outlive the screen), two fragments placed by hosts (Comments, Attachments), three streams (a live workspace feed,
presence on a ticket, a streamed assistant reply), a ticket entity domain, and Stories on a fake server. It is the
example an implementer builds the library against. The design behind it is [REWRITE-PLAN.md](REWRITE-PLAN.md).

**Status: illustrative.** The library does not exist, so nothing here has run (see "Status" below). The code follows machine-design.md with every merge, streams included.

## Status

Type-checks today (Effect-only, no `flow-state` import), from the repo root:

```sh
nubx tsc -p workflow/plans/flow/references/dispatch-desk/tsconfig.effect-only.json   # passes
nubx tsc -p workflow/plans/flow/references/typecheck/tsconfig.dispatch-desk.json      # every file, against stand-ins: see ../CONVERSION.md for what that proves
nubx vp fmt workflow/plans/flow/references/dispatch-desk --check                       # every file
```

| Effect-only file                                                                                                                                                                             | Holds                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `features/Tickets/types.ts`, `ticket-api.ts`                                                                                                                                                 | schemas, errors, the ticket port                           |
| `features/Comments/comments-api.ts`, `features/Attachments/attachments-api.ts`                                                                                                               | comment and upload ports, `PendingFiles`                   |
| `features/Tickets/feed/desk-socket.ts`, `features/Presence/collab-sdk.ts`, `features/Assistant/assistant-api.ts`                                                                             | socket, collaboration SDK and assistant ports              |
| `features/Roster/roster-api.ts`, `features/Find/find-api.ts`, `features/Resolve/resolve-api.ts`, `features/Tickets/editor/details-api.ts`, `features/Tickets/technicians/technicians-api.ts` | ports on Effect's `HttpClient` (B3–B5)                     |
| `app/desk-server.ts`, `app/demo-api.ts`                                                                                                                                                      | the server's rules as pure functions; the in-memory Layers |
| `next/http-api.ts`                                                                                                                                                                           | every port over `fetch`, `XMLHttpRequest`, `WebSocket`     |

Everything else imports `flow-state`, `flow-state/react`, `flow-state/testing`, `flow-state/server` or `next`, so it is
illustrative: it uses the design's spellings and nothing is faked in it. `nub run check`, `test` and `verify` do not
cover this folder, so passing them proves nothing about the desk. Where the design is silent, the file says
`// design gap:` (49 of them, listed below).

## Start here

1. [ticket.contracts.ts](features/Tickets/ticket.contracts.ts): where data comes from (reads, writes, outcome
   classification beside the status).
2. [ticket.domain.ts](features/Tickets/ticket.domain.ts): what those contracts mean for shared ticket records.
3. [editor.definition.ts](features/Tickets/editor/editor.definition.ts) and
   [editor.machine.ts](features/Tickets/editor/editor.machine.ts): the editor, readable as the spec.
4. [comments.trait.ts](features/Comments/comments.trait.ts) and
   [upload.trait.ts](features/Attachments/upload.trait.ts): the two fragments the editor places.
5. [queue.machine.ts](features/Tickets/queue/queue.machine.ts): keyed lanes and a comments preview.
6. [feed/\*](features/Tickets/feed/): the live feed with catch-up.
7. [editor.story.ts](features/Tickets/editor/editor.story.ts), then [desk.story.ts](features/Tickets/desk.story.ts):
   one actor's Stories, then the whole app's.

## Where the data comes from

Real API to our world. Flow is not a network library: the adapter (the Effect-only files) turns the API into typed
values and errors, and the contract's `commit` decides what is definite and what is unknown (MD 2.7.1, 2.7.2).

| Real API                                     | Adapter                                                    | Becomes                                                                             | Read in                                                        |
| -------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `fetch` resolves with a status               | `next/http-api.ts` decodes it to a value or a tagged error | contract `output`, or a failure the contract classifies                             | `ticket.contracts.ts`, `comments.contracts.ts`                 |
| `fetch` rejects; a 5xx                       | `NoResponse`, `ServerError`                                | `unknown` (the write may have happened); the lane is Held (rule 21)                 | `ticket.contracts.ts` (`unknownWhenLost`), `editor.machine.ts` |
| A 4xx the server meant                       | tagged errors (`TicketLocked`, `AlreadyAssigned`)          | definite `failure`; a typed ending event                                            | `editor.definition.ts`, `queue.definition.ts`                  |
| `XMLHttpRequest` upload progress             | `attachments-api.ts` `onProgress`                          | the lane row's `progress` (the setter is PM6, S5 Q11)                               | `attachments.contracts.ts`, `Attachments.tsx`                  |
| A dropped `File`'s bytes                     | `PendingFiles` service (tab memory)                        | memory holds `{ ref, name, size }`; a reload gives `FileGone`                       | `useEditor.ts`, `upload.trait.ts`                              |
| `WebSocket` `change` frames                  | `desk-socket.ts` decodes frames                            | `listen` entry updating `Ticket` records in place (M6 2.8)                          | `feed.contracts.ts`, `feed.domain.ts`                          |
| `WebSocket` `activity` frames                | the same socket, a second connection                       | a fact feed into `DeskFeed` memory, cursor by the fact's turn (S4)                  | `feed.contracts.ts`, `feed.machine.ts`                         |
| `eventsSince` pages                          | `ticket-api.ts` read                                       | the contract's `catchUp`, `Feed.gone` and `missed { why: "Lost" }` past the history | `feed.contracts.ts`                                            |
| A presence socket                            | `collab-sdk.ts` (the collaboration SDK's presence channel) | a state feed: the row's `last` is the viewer list (`delivers: "state"`)             | `presence.contracts.ts`, `Viewers.tsx`                         |
| A streamed NDJSON body and `AbortController` | `assistant-api.ts` returns a `Stream` of frames            | a streamed write: tokens through `progress`, no turn per token                      | `assistant.contracts.ts`, `AssistantPanel.tsx`                 |
| A close code (4401), a transport loss        | `SignedOut`, `SocketDropped`                               | the feed's SIGNED_OUT / RETRY_WAIT; the presence reopen                             | `feed.machine.ts`, `presence.definition.ts`                    |

## Structure

| Location                                            | Responsibility                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [features/Session](features/Session/)               | permission and current-user truth others read                                                     |
| [features/Toasts](features/Toasts/)                 | a shared actor other actors send to                                                               |
| [features/Tickets](features/Tickets/)               | schemas and errors, the ticket port, `ticket.contracts.ts`, the ticket entity domain, app Stories |
| [features/Tickets/editor](features/Tickets/editor/) | the editor: definition, machine, ref, hook, panel, Stories, tests, tab Stories                    |
| [features/Tickets/queue](features/Tickets/queue/)   | the queue: definition, machine, list view, Stories, SSR Stories, tests                            |
| [features/Tickets/feed](features/Tickets/feed/)     | the workspace socket, contracts, listen domain, `DeskFeed` machine, activity log, Stories         |
| [features/Comments](features/Comments/)             | the Comments fragment (trait), contracts, panel, Stories; placed by editor and queue              |
| [features/Attachments](features/Attachments/)       | the AttachmentUpload fragment (`.each`), contracts, view, Stories                                 |
| [features/Presence](features/Presence/)             | who has a ticket open: a state feed, machine, view, Stories                                       |
| [features/Assistant](features/Assistant/)           | a streamed reply: contracts, machine, panel, Stories                                              |
| [app](app/)                                         | the closed app, setup, host, persistence, view; `desk-server.ts` and `demo-api.ts` (the server)   |
| [next](next/)                                       | HTTP adapter, request-scoped and browser setups, auth stub, provider, pages                       |
| [testing](testing/)                                 | the Desk fake (server and client halves), the Presence and Assistant fakes, the property test     |
| [tools](tools/)                                     | inspection, CLI and diagnostics examples                                                          |
| [flow.config.ts](flow.config.ts)                    | the apps and Story globs the CLI discovers                                                        |

## Feature map

Each feature, the files that show it, and the design it demonstrates. Rule numbers are MD's; "OD" is its open
decisions.

| Feature                                                              | Files                                                                                                                                                | Design                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Named operations in every definition                                 | every `*.definition.ts`, `*.trait.ts`, `*.contracts.ts`                                                                                              | rules 39–43, 47; 2.7                              |
| Save, lock and the hold (unknown save, same Attempt)                 | `ticket.contracts.ts`, `editor.definition.ts`, `editor.machine.ts`, `TicketPanel.tsx`, `editor.story.ts`                                             | rules 13–25, 43, 45; 2.7.1, 2.7.3                 |
| Keyed lanes: assign many tickets                                     | `queue.definition.ts`, `queue.machine.ts`, `QueueList.tsx`, `queue.story.ts`                                                                         | rules 39–43; 2.7.3; OD4                           |
| Writes that outlive the screen                                       | `editor.machine.ts`, `app/host.ts` (`unsettledWrites`), `app/view.tsx`, `desk.story.ts`, `editor.story.ts`, `tools/inspection.ts`                    | rules 44, 53; OD21                                |
| Tickets as an entity domain with predictions                         | `ticket.domain.ts`, `TicketPanel.tsx`, `QueueList.tsx`, `desk.story.ts`, `testing/desk.property.test.ts`, `app/desk-server.ts`                       | rules 26–38; 2.8                                  |
| Comments on two hosts (`resetOn`, A-B-A)                             | `comments.trait.ts`, `comments.contracts.ts`, `CommentsPanel.tsx`, `comments.story.ts`, placements in `editor.definition.ts`, `queue.definition.ts`  | rules 9, 23, 33, 36, 48–59; 2.9.6                 |
| Attachment upload: progress, cancel, `FileGone`                      | `upload.trait.ts`, `attachments.contracts.ts`, `Attachments.tsx`, `upload.story.ts`, `useEditor.ts`                                                  | rules 21, 48, 51–54, 57, 60; 2.9.2, 2.9.3         |
| Live feed with catch-up                                              | `feed/feed.contracts.ts`, `feed.domain.ts`, `feed.definition.ts`, `feed.machine.ts`, `ActivityLog.tsx`, `feed.story.ts`                              | M6 2.2–2.8, 3.6, 4.1; S2–S4, S7, S10; rule 25     |
| Presence on a ticket                                                 | `presence.contracts.ts`, `presence.definition.ts`, `presence.machine.ts`, `Viewers.tsx`, `presence.story.ts`, `testing/presence.fake.ts`             | M6 2.6, 2.7, 4.2; rules 25, 47                    |
| Streamed assistant reply                                             | `assistant.contracts.ts`, `assistant.definition.ts`, `assistant.machine.ts`, `AssistantPanel.tsx`, `assistant.story.ts`, `testing/assistant.fake.ts` | M6 2.9, 4.4; S5 Q11                               |
| Stories on fakes                                                     | every `*.story.ts`, `testing/desk.fake.ts`, `desk.test.tsx`, `queue.ssr.story.ts`, `editor.tabs.story.ts`                                            | rules 61–66; 2.10.1–2.10.14                       |
| Property test                                                        | `testing/desk.property.test.ts`, `app/desk-server.ts` (the oracle)                                                                                   | 2.10.16                                           |
| Persistence, tabs, reload                                            | `app/persistence.ts`, `editor.tabs.story.ts`, `next/browser-setup.ts`                                                                                | OD11, OD21; 2.10.4                                |
| SSR and hydration                                                    | `next/`, `queue.ssr.story.ts`, `queue.ssr.test.ts`                                                                                                   | ServerRendering O1–O7; M6 2.10                    |
| Inspection, CLI, diagnostics                                         | `tools/inspection.ts`, `tools/cli.ts`, `tools/diagnostics.ts`, `flow.config.ts`                                                                      | 2.9.5, 2.10.6, 2.10.7, 2.10.14; Diagnostics O1–O2 |
| Comments as an entity on `serialize` (B3)                            | `comments.domain.ts`, `comments.trait.ts`, `comments.story.ts`, `comments.test.ts`                                                                   | O7, E1, E14, rule 29                              |
| Description fields and body: `latest` per field, an etag'd body (B4) | `editor/fields.contracts.ts`, `field.trait.ts`, `autosave.trait.ts`, `body.trait.ts`, `details-api.ts`, `DescriptionFields.tsx`, `fields.story.ts`   | O4, O5, O1 (etag), F15, F17                       |
| Panels: resumable tabs, `resetOn`, a parts hold timer (B4)           | `features/Tickets/panels/`                                                                                                                           | F1–F3, F12, F13, F18                              |
| Queue toggles, bulk close on `serialize`, SLA timers (B4)            | `assign-toggle.trait.ts`, `row-flash.trait.ts`, `queue.bulk.story.ts`, `ticket-api.ts` (`assignResolver`)                                            | O2 (`RequestResolver`), O4, O5, O7, O11, S4       |
| Technicians panel over polling (B4)                                  | `features/Tickets/technicians/`                                                                                                                      | M6 state feed, S4, E4                             |
| Presence over a collaboration SDK (B4)                               | `features/Presence/collab-sdk.ts`, `presence.contracts.ts`, `testing/presence.fake.ts`, `next/collab.ts`                                             | M6 2.6, Y6                                        |
| Roster: several related entities, a merge across two (B3)            | `features/Roster/`                                                                                                                                   | E1, E4, E12, E14, E19, F8, F22, P2                |
| Find palette: one-off lookups (B5)                                   | `features/Find/`                                                                                                                                     | R2, R3, F21                                       |
| Resolve wizard: subroutines, exits, nested dialog, compensation (B5) | `features/Resolve/`                                                                                                                                  | F8–F11, F14–F19, O20, O22, X4                     |
| `flow check` findings, one wrong file each (B6)                      | `tools/findings/`                                                                                                                                    | I3, I4                                            |
| Playback: presentations and a demo page (B8)                         | `app/presentation.ts`, `app/demo.tsx`                                                                                                                | X2–X5                                             |

## Where each design rule shows

| Group (rules)                      | Rule or section                                                          | Shown in                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Operations (39–47)                 | 39 contract states `input`, `output`, `key`                              | `ticket.contracts.ts`, `comments.contracts.ts`, `attachments.contracts.ts`                   |
|                                    | 40–42 named operations, verbs, handler mapping                           | `editor.definition.ts`, `queue.definition.ts`, `editor.machine.ts`, `queue.machine.ts`       |
|                                    | 43 `retryable`, `cancel`, release a held key                             | `editor.machine.ts` (UNSURE), `queue.machine.ts` (`assign`)                                  |
|                                    | 44, 45 outlives the screen; a path from every arrival to retry or cancel | `editor.machine.ts` (CLOSED `Reopen`), `desk.story.ts`                                       |
|                                    | 47 named operations in small actors                                      | `presence.definition.ts`, `assistant.definition.ts`                                          |
| Write lane and hold (13–25, N1–N3) | 13, 19, 21 Attempt in the lane; new Attempt per definite failure         | `editor.machine.ts`, `TicketPanel.tsx`, `editor.story.ts` (`unsure-resend`)                  |
|                                    | 25 a drop is not a transition                                            | `feed.machine.ts`, `presence.definition.ts`                                                  |
| Entities (26–38)                   | 26 memory never copies a record field                                    | `editor.definition.ts`, `ticket.domain.ts`                                                   |
|                                    | 27–38 predictions, repair, dependencies, `writes`                        | `ticket.domain.ts`, `QueueList.tsx`, `desk.story.ts`, `desk.property.test.ts`                |
| Fragments (48–60)                  | 48–51 placement, `resetOn`, subject path                                 | `editor.definition.ts`, `queue.definition.ts`, `comments.trait.ts`                           |
|                                    | 52–59 thread read, parked posts, `failure.NotSent`                       | `comments.trait.ts`, `comments.story.ts`                                                     |
|                                    | 54, 60 `.each`, `whenAbandoned`                                          | `upload.trait.ts`, `upload.story.ts`                                                         |
| Stories (61–66)                    | 61–66, 2.10.1–2.10.13 steps, fakes, `Story.inspection`                   | all `*.story.ts`, `testing/desk.fake.ts`, `desk.test.tsx`                                    |
| Streams                            | 2.2–2.4, 3.6 feeds, `listen`, `Feed`, `delivers`                         | `feed.contracts.ts`, `feed.domain.ts`, `feed.definition.ts`, `presence.contracts.ts`         |
|                                    | 2.6, 2.7 state feeds, ending mapping                                     | `presence.definition.ts`, `feed.definition.ts`                                               |
|                                    | 2.9, 4.4 streamed write, `progress`                                      | `assistant.contracts.ts`, `AssistantPanel.tsx`                                               |
|                                    | 2.10, 2.12 persistence and inspection of sessions                        | `feed.ref.ts`, `app/persistence.ts`, `tools/inspection.ts`, `next/server-setup.ts`           |
|                                    | 2.11 stream fakes                                                        | `feed.story.ts`, `presence.fake.ts`, `assistant.fake.ts`, the socket block of `desk.fake.ts` |

## Scenarios

Story id → what it exercises → what drives it. The full list is `flow stories` ([cli.ts](tools/cli.ts)).

| Story id                                                                                       | Exercises                                                                                              | Driven by                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `editor/saved`, `edit-while-saving`, `autosave`, `empty-title`, `escape`                       | save, ordered `Saved` alternatives, debounce, discard                                                  | `Desk.saveTitle.hold()`, `send`, `advance`                             |
| `editor/locked-out`, `lock-lifts`                                                              | definite failure, backoff from memory, a new Attempt each retry                                        | `Desk.lock({ times: "always" })`, `advance`                            |
| `editor/unsure-resend`, `unsure-gave-up`, `stopped`                                            | the hold: same Attempt re-sent, then `cancel`                                                          | `Desk.saveTitle.drop({ at: "response" })`                              |
| `editor/outlives-close`, `outlives-close-unsure`, `reopened-unsure`                            | Runtime-owned lanes, parked endings                                                                    | `hold`, `dispose`, `ensure`                                            |
| `editor/second-tab`, `reload-mid-save`, `reload-ack-held`, `reload-ack-confirmation-held`      | persistence, tabs, reload                                                                              | `openTab(…, { from })`, `reload()`, `Fake.storage`                     |
| `queue/search-key`, `mine-only`, `paged`, `degraded`                                           | keys, session context, paging, outage polling                                                          | request log, `Desk.listOutage`                                         |
| `queue/assign`, `assign-many`, `assign-unsure`, `already-assigned`                             | keyed lanes, predictions, `retryable` budget, 409                                                      | holds, `drop({ at: "response" })`                                      |
| `queue/preview-a-b-a`, `comments/*`                                                            | `resetOn`, parked posts, `failure.NotSent`, leaving while sending                                      | `enter`, `leave`, `reset`                                              |
| `upload/*`                                                                                     | progress, cancel, give-up, too large, `FileGone`, removed mid-upload                                   | `Kept` bytes, held request, `reload`                                   |
| `queue/ssr-server`, `queue/ssr-browser`                                                        | request Runtime, payload, hydration                                                                    | `dehydrate` / `hydrate` on one world                                   |
| `desk/save-repairs-queue`, `assign-repairs`, `revoked-mid-save`, `closed-mid-save`, `sign-out` | cross-actor effects on the whole app                                                                   | `Desk` holds, Session sends, `dispose(…, { how })`, `Story.inspection` |
| `feed/*`                                                                                       | connect, drop and catch up, history truncated, reload resumes, log reset, token expired, pushed rename | `Desk.socket.drop()`, `withhold`, `expireToken`                        |
| `desk/pushed-rename`                                                                           | a push updates the one Ticket record in every copy                                                     | `Desk.renameElsewhere`                                                 |
| `presence/*`                                                                                   | joined, dropped, rejoin changed, budget spent, token expired                                           | `PresenceFake`, `advance({ next })`                                    |
| `assistant/*`                                                                                  | answered, streaming, stopped, asked again, stalled, truncated, refused, reloaded                       | `AssistantFake`, `hold({ after })`                                     |
| `desk.property.test.ts`                                                                        | convergence against the Desk's truth; never SAVING with an idle `save` lane                            | `propertyTest`, generators                                             |

## What writing it found

| Finding                                     | Current answer                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Edits during a save were lost               | `saved` holds only the confirmed title; compare it with the draft after the outcome                               |
| Ordered alternatives were missing           | first passing guard wins; declining alternatives fall through; `check` collects their reasons                     |
| Nearest handlers do not compose             | a handled child event replaces its parent's handler; `SaveRequested` stays where a new save is legal              |
| Unknown saves had no actionable exit        | the lane holds the Attempt; UNSURE re-sends it with `retryable`, then `cancel` releases it (rules 21, 43)         |
| Composite ids could collide                 | `actorRef` takes part arrays, not string-joined ids                                                               |
| The contract key cannot normalise           | normalisation (trim, lowercase) lives in the caller, before the input exists (OD4); a design gap                  |
| Paging is not in MD                         | `more` and `hasMore` are the plan's (Operations O6/O7), marked as such in `queue.machine.ts`                      |
| A `File` cannot live in persisted memory    | memory holds `{ ref, name, size }`; bytes sit in `PendingFiles`; a reload gives `FileGone`                        |
| Rule 56 under `resetOn` with a keyed write  | the warning stays; the comments preview accepts it                                                                |
| A hold's ending can arrive while CLOSED     | CLOSED's `Reopen` goes to UNSURE while `O.save.idle` denies `Uncertain` (rule 45)                                 |
| `listen` keeps no position across sessions  | every restart refetches covered lists; cross-session resume needs the separate `activity` fact feed               |
| One fake must own HTTP truth and the socket | `desk.fake.ts` mixes merged code and a PM6 block; fakes cannot share truth across servers                         |
| The progress setter is merge 6              | the row's `progress` is merged (rule 21), `progress(p)` in a commit is S5 Q11, so one line in the upload is PM6   |
| App Stories need the whole app              | cross-actor Stories wait for `DeskSetup`; machine Stories use `context`                                           |
| Sending into another actor's fragment       | "Use as comment" sends `Editor.E.comments.Post` to the editor's ref; not shown in MD (a design gap)               |
| `model()` is gone (T1)                      | a property test finds a short counterexample, not the shortest path; the old shortest-path test has no equivalent |
| Browser and server data need the same API   | Next uses token HTTP on the server and cookie HTTP in the browser; the demo keeps the in-memory server            |
| Multi-tab scope                             | v1 refuses persistence in a second tab; mirrors and leader handover are deferred                                  |

These answers are the plan's proposals as the code follows them; the owner has not confirmed each one.

## Host assumptions

- **Auth.** `next/auth.ts` is an explicit throwing stub. A user change replaces the Runtime; v1 does not propagate
  sign-out to other tabs.
- **HTTP and socket routes.** `next/http-api.ts` assumes Schema-shaped JSON routes, status codes, cursor-batch
  `eventsSince`, a workspace socket, a presence socket and an NDJSON assistant body. These are application choices, not
  Flow APIs. Browser requests use the current origin and cookies; replace the localhost origin with the deployment's.
- **`PendingFiles`.** Dropped bytes are tab memory (`PendingFilesLive`), so a reload loses them by design.
- **`beforeunload`.** `app/host.ts` warns while `runtime.unsettledWrites()` is non-empty, and sign-out refuses unless
  the user confirms.
- **SSR releases stream sessions.** `next/server-setup.ts` never ensures a feed, watcher or assistant, and sessions are
  released at capture (M6 2.10).
- **Tabs and reload.** Tabs are independent Runtimes sharing the run's `Fake.storage`; a tab opened while another
  holds the scope runs without persistence. Browser gates in S10 must prove real Web Lock refusal and hydration; these
  illustrative files do not.

## Conventions

| Shape                                        | Owns                                                      |
| -------------------------------------------- | --------------------------------------------------------- |
| `<name>.definition.ts` / `<name>.machine.ts` | vocabulary / behaviour                                    |
| `<name>.ref.ts`                              | the feature's stable actor identities                     |
| `<name>.contracts.ts`                        | plain requests: `input`, `output`, `key`, outcome classes |
| `<name>.trait.ts`                            | a fragment placed by hosts                                |
| `<name>.domain.ts`                           | what contracts mean for shared records                    |
| `<name>-api.ts`                              | a port (Effect-only service) and its errors               |
| `<name>.fake.ts`                             | a Story fake: server truth, controls, a client half       |
| `use<Name>.ts`                               | the feature's one hook                                    |
| `<name>.story.ts` / `<name>.test.ts(x)`      | scenario plans / one line per Story                       |
| `PascalCase.tsx`                             | React components                                          |

Production feature code never imports `app/` or `testing/`. Story and test modules are composition boundaries and
may import app setup and fakes. Relative `.js` imports refer to `.ts` and `.tsx` files.

## Design gaps

Every `// design gap:` comment in this folder's code (grep `design gap:`). 33 gaps; the text is the comment's. Findings against the design from the conversion are in [../CONVERSION.md](../../../archive/flow-design-2026-11/CONVERSION.md).

| #   | File                                                  | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/demo.tsx`                                        | `StoryPlayer`'s `onEnded` (to play the next presentation of a list) is not in playback.md; a list is played here by keeping an index in React state and keying the player.                                                                                                                                                                                                                                                                                                                              |
| 2   | `app/host.ts`                                         | the shape of an `unsettledWrites()` entry is not shown in the design; `contract` and `key` follow the lane's identity (actor, contract, key), as tools/inspection.ts lists them.                                                                                                                                                                                                                                                                                                                        |
| 3   | `app/presentation.ts`                                 | playback.md names `definePresentation` and `StoryPlayer` but not the module they come from; they are assumed to sit beside `StoryFrame` in "flow-state/testing".                                                                                                                                                                                                                                                                                                                                        |
| 4   | `app/presentation.ts`                                 | a presentation names one Story's checkpoints, so a module whose checkpoints span several Stories gets one presentation per Story; the desk tour is a list played in order by app/demo.tsx (no playlist exists).                                                                                                                                                                                                                                                                                         |
| 5   | `features/Attachments/upload.story.ts`                | the full bar. The client half reports half then all of the bytes before the request is held, so the row reads 100% while the server has nothing: "Waiting for the server…".                                                                                                                                                                                                                                                                                                                             |
| 6   | `features/Attachments/upload.test.ts`                 | the full bar. The client half reports half then all of the bytes before the request is held, so the row reads 100% while the server has nothing: "Waiting for the server…" (gap 30).                                                                                                                                                                                                                                                                                                                    |
| 7   | `features/Comments/CommentsPanel.tsx`                 | `s.memory[instance]` and `s.operations[instance]` index by a prop. The design shows the path written out (`s.operations.<instance>.<name>`); a host-agnostic panel needs it as data (REVIEW gap 6).                                                                                                                                                                                                                                                                                                     |
| 8   | `features/Comments/CommentsPanel.tsx`                 | the host passes its own `E[instance]` (`Editor.E.comments`, `Queue.E.preview`) as `events`, since sending to a fragment goes through the host's namespace (rule 2) and the panel must not import a host (gap 7).                                                                                                                                                                                                                                                                                        |
| 9   | `features/Comments/comments.story.ts`                 | how `reset(subject)` refills the Input is not said (2.10.12 gives the subject, not the input). Assumed: the stand-in fills `ticketId` with the subject, as the queue's filling does (`ticketId: memory.previewId`). The A, B, A Story needs that.                                                                                                                                                                                                                                                       |
| 10  | `features/Comments/comments.trait.ts`                 | what a paged live read's `value` mapper receives is not said; here it is every loaded page, as the row's `data` is (the queue reads `operations.list?.data` the same way).                                                                                                                                                                                                                                                                                                                              |
| 11  | `features/Comments/comments.trait.ts`                 | `setData`'s `data` is written as an updater of the entry's current value; 3.4 passes a value.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | `features/Find/find.machine.ts`                       | `send`'s target here is a function of memory (the workspace's queue). The design shows a fixed ref (`send(ToastsRef, …)`); a ref chosen per turn is assumed to be written as a select.                                                                                                                                                                                                                                                                                                                  |
| 13  | `features/Find/find.test.ts`                          | a machine Story's `send` action to an actor that is not running (the queue) has no record kind in 2.10.6. The old file assumed `ActorAbsent` evidence in a `drop` record; nothing in the design says so.                                                                                                                                                                                                                                                                                                |
| 14  | `features/Resolve/signature.trait.ts`                 | rule 48 leaves a step inside a subroutine no way to own a write it can hear. If the owner wants "uploading…, uploaded, failed" on the SIGNOFF step, rule 48's scope needs a case for writes that release on leave.                                                                                                                                                                                                                                                                                      |
| 15  | `features/Roster/Roster.tsx`                          | the pending-changes footer reads `runtime.unsettledWrites()` from a view through `useRuntime()`, which the design does not name (REVIEW gap 15); the entry's fields are the lane listing's (gap 1).                                                                                                                                                                                                                                                                                                     |
| 16  | `features/Roster/roster.domain.ts`                    | COVERAGE.md E19 names `.ignoring(lastSeenAt)`. `.ignoring` takes inputs (entity-domain 2.1); a field that is neither a condition nor an order field repairs nothing already (2.3), so `lastSeenAt` churn needs no word. What `.ignoring` is for here is the `locale` input, which changes neither membership nor order.                                                                                                                                                                                 |
| 17  | `features/Tickets/desk.test.tsx`                      | the shape of a record queue in Inspection (`domains.<name>.queues`) is 2.10.18.4's; its members' fields are not listed. Assumed: per record, its key and the Attempts in order with their operation.                                                                                                                                                                                                                                                                                                    |
| 18  | `features/Tickets/editor/DescriptionFields.tsx`       | "Not saved on this device" reads the tab's persistence status from a view, through `useRuntime()` and `inspect` (REVIEW gap 15); the design names the status for Stories, not for views.                                                                                                                                                                                                                                                                                                                |
| 19  | `features/Tickets/editor/editor.story.ts`             | what a machine Story does with the editor's `send(ToastsRef, ...)` when no Toasts actor exists is not specified (plan section 6, item 8). Assumed: the send is dropped as evidence. The app Stories (desk.story.ts) start Toasts.                                                                                                                                                                                                                                                                       |
| 20  | `features/Tickets/editor/editor.tabs.story.ts`        | `browserSetup` brings `layerIndexedDb`; in a Story the run's `Fake.storage` stands in for the store (2.10.4 says "one per run, used by every tab"), so the `storage` option is written only to seed it.                                                                                                                                                                                                                                                                                                 |
| 21  | `features/Tickets/editor/editor.tabs.story.ts`        | the encoded shape of a seeded lane record is the Persistence plan's, and 2.10.4 says `from` is the only form an app can rely on until it is public; the fields below name the lane's identity (actor, contract, key) and its Attempt.                                                                                                                                                                                                                                                                   |
| 22  | `features/Tickets/editor/useEditor.ts`                | a React hook for the Runtime is not in the design (it shows useActorByRef and useView). Needed because a dropped file's bytes go to the `PendingFiles` service, not into the event.                                                                                                                                                                                                                                                                                                                     |
| 23  | `features/Tickets/feed/feed.domain.ts`                | a patch of a ticket no list holds yet changes nothing; it appears when a list loads it.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 24  | `features/Tickets/panels/panels.machine.ts`           | whether a transition that ENTERS (or thaws) a node may raise into the trait that node places, in the same turn. Rule 12 makes "a raise into a fragment a later state change enters" a defect; this file avoids the question with two events.                                                                                                                                                                                                                                                            |
| 25  | `features/Tickets/queue/QueueList.tsx`                | sending into another actor's fragment (REVIEW gap 3): the editor's ref and its `E.comments` path.                                                                                                                                                                                                                                                                                                                                                                                                       |
| 26  | `features/Tickets/technicians/technicians.machine.ts` | `setData`'s `data` is written as an updater of the entry's current value; 3.4 passes a value.                                                                                                                                                                                                                                                                                                                                                                                                           |
| 27  | `features/Tickets/ticket.domain.ts`                   | a shared `.orderBy` callback has no type for its recorded `record`, so the order is written out in each read rather than in one helper.                                                                                                                                                                                                                                                                                                                                                                 |
| 28  | `next/server-setup.ts`                                | the app's service requirement includes the socket, presence and assistant ports, so the type asks for the whole Layer. The server runtime never ensures a feed, a watcher or an assistant (the page ensures Session and the queue only), so no connection is opened here; sessions are released at capture. Each request owns its authenticated services. No server storage or persistence configuration. The scope matches the browser setup's, so this request's payloads hydrate only for this user. |
| 29  | `tools/findings/findings.test.ts`                     | 2.10.14 names `flow check` as a command over the configuration. A programmatic form a test can call on chosen modules is assumed here: `check({ modules })` returns the findings `flow check --format json` prints, each `{ code, level, at, message }`.                                                                                                                                                                                                                                                |
| 30  | `tools/findings/findings.test.ts`                     | the programmatic `flow check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 31  | `tools/findings/findings.test.ts`                     | no Story can run a bare `stream(...)`, so there is nothing to read `diagnostic` records from; the module would need to export a host and a Story (see the findings file).                                                                                                                                                                                                                                                                                                                               |
| 32  | `tools/findings/findings.test.ts`                     | `wrongSsr` sets `world` on a hydration source, which a source may not do (2.10.11, W29), and it is still built with `Story.make`. The held save belongs on the destination's `world`; the file is not part of this test.                                                                                                                                                                                                                                                                                |
| 33  | `tools/inspection.ts`                                 | the field names of a lane entry follow 2.10.7's list (state, flags, subject path, `binding`, `releasing`, queued commits, parked endings); its exact shape is not shown.                                                                                                                                                                                                                                                                                                                                |

## Build log (B1–B9)

- **B1–B6** (desk): REVIEW fixes and the fake split; Stories as transcripts with checks in `*.test.ts`; entities;
  reshapes and PM6 parts; Find and Resolve; `tools/findings/`.
- **B8**: presentations per module and `app/demo.tsx`; the I2 B `flow explain` lines in `tools/cli.ts`.
- **Skipped, with reasons:**
  - `app/demo-api.ts` (the in-memory demo) does not serve the ports added in B3–B5 (roster, details, technicians,
    find, resolve); `app/setup.ts` points them at a local server and Stories replace their transport.
  - O11 D `NotSent { Disposed }`: no app path commits into a disposed actor; left to the runtime's own suite.
  - Presentations whose scenes span several Stories are lists of presentations (see `app/presentation.ts`).
