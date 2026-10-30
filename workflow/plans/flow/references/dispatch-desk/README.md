# Dispatch Desk: the reference application

A dispatcher's desk, written against the design in
[machine-design.md](../explorations/machine-fragments/machine-design.md) ("MD"). It has a ticket queue (search,
filters, paging, keyed "assign to me"), a ticket editor (autosave, lock retries, the hold on an unknown save, writes that
outlive the screen), two fragments placed by hosts (Comments, Attachments), three streams (a live workspace feed,
presence on a ticket, a streamed assistant reply), a ticket entity domain, and Stories on a fake server. It is the
example an implementer builds the library against. The design behind it is [REWRITE-PLAN.md](REWRITE-PLAN.md).

**Status: illustrative.** The library does not exist. Only the files that import nothing but `effect` type-check today
(see "Status" below). Streams are not merged: they follow
[merge-6-streams/proposal-v2.md](../explorations/machine-fragments/merge-6-streams/proposal-v2.md) revision 7 ("M6",
decisions S1–S10) and are marked **pending merge 6** (PM6).

## Status

Type-checks today (Effect-only, no `flow-state` import), from the repo root:

```sh
nubx tsc -p workflow/plans/flow/references/dispatch-desk/tsconfig.effect-only.json   # passes
nubx vp fmt workflow/plans/flow/references/dispatch-desk --check                       # every file
```

| Effect-only file                                                                                                                | Holds                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `features/Tickets/types.ts`, `ticket-api.ts`                                                                                    | schemas, errors, the ticket port                           |
| `features/Comments/comments-api.ts`, `features/Attachments/attachments-api.ts`                                                  | comment and upload ports, `PendingFiles`                   |
| `features/Tickets/feed/desk-socket.ts`, `features/Presence/presence-api.ts`, `features/Assistant/assistant-api.ts` (PM6 shapes) | socket, presence and assistant ports as Streams            |
| `app/desk-server.ts`, `app/demo-api.ts`                                                                                         | the server's rules as pure functions; the in-memory Layers |
| `next/http-api.ts`                                                                                                              | every port over `fetch`, `XMLHttpRequest`, `WebSocket`     |

Everything else imports `flow-state`, `flow-state/react`, `flow-state/testing`, `flow-state/server` or `next`, so it is
illustrative: it uses the design's spellings and nothing is faked in it. `nub run check`, `test` and `verify` do not
cover this folder, so passing them proves nothing about the desk. Where the design is silent, the file says
`// design gap:` (43 of them, listed below).

## Start here

1. [ticket.contracts.ts](features/Tickets/ticket.contracts.ts): where data comes from (reads, writes, outcome
   classification beside the status).
2. [ticket.domain.ts](features/Tickets/ticket.domain.ts): what those contracts mean for shared ticket records.
3. [editor.definition.ts](features/Tickets/editor/editor.definition.ts) and
   [editor.machine.ts](features/Tickets/editor/editor.machine.ts): the editor, readable as the spec.
4. [comments.trait.ts](features/Comments/comments.trait.ts) and
   [upload.trait.ts](features/Attachments/upload.trait.ts): the two fragments the editor places.
5. [queue.machine.ts](features/Tickets/queue/queue.machine.ts): keyed lanes and a comments preview.
6. [feed/\*](features/Tickets/feed/) (PM6): the live feed with catch-up.
7. [editor.story.ts](features/Tickets/editor/editor.story.ts), then [desk.story.ts](features/Tickets/desk.story.ts):
   one actor's Stories, then the whole app's.

## Where the data comes from

Real API to our world. Flow is not a network library: the adapter (the Effect-only files) turns the API into typed
values and errors, and the contract's `commit` decides what is definite and what is unknown (MD 2.7.1, 2.7.2).

| Real API                                           | Adapter                                                    | Becomes                                                                 | Read in                                                        |
| -------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `fetch` resolves with a status                     | `next/http-api.ts` decodes it to a value or a tagged error | contract `output`, or a failure the contract classifies                 | `ticket.contracts.ts`, `comments.contracts.ts`                 |
| `fetch` rejects; a 5xx                             | `NoResponse`, `ServerError`                                | `unknown` (the write may have happened); the lane is Held (rule 21)     | `ticket.contracts.ts` (`unknownWhenLost`), `editor.machine.ts` |
| A 4xx the server meant                             | tagged errors (`TicketLocked`, `AlreadyAssigned`)          | definite `failure`; a typed ending event                                | `editor.definition.ts`, `queue.definition.ts`                  |
| `XMLHttpRequest` upload progress                   | `attachments-api.ts` `onProgress`                          | the lane row's `progress` (the setter is PM6, S5 Q11)                   | `attachments.contracts.ts`, `Attachments.tsx`                  |
| A dropped `File`'s bytes                           | `PendingFiles` service (tab memory)                        | memory holds `{ ref, name, size }`; a reload gives `FileGone`           | `useEditor.ts`, `upload.trait.ts`                              |
| `WebSocket` `change` frames (PM6)                  | `desk-socket.ts` decodes frames                            | `listen` entry updating `Ticket` records in place (M6 2.8)              | `feed.contracts.ts`, `feed.domain.ts`                          |
| `WebSocket` `activity` frames (PM6)                | the same socket, a second connection                       | a fact feed into `DeskFeed` memory, cursor by the fact's turn (S4)      | `feed.contracts.ts`, `feed.machine.ts`                         |
| `eventsSince` pages (PM6)                          | `ticket-api.ts` read                                       | `Feed.reconnect` catch-up, `missed { why: "Lost" }` past the history    | `feed.contracts.ts`                                            |
| A presence socket (PM6)                            | `presence-api.ts` `frames(ticket)`                         | a state feed: the row's `last` is the viewer list (`delivers: "state"`) | `presence.contracts.ts`, `Viewers.tsx`                         |
| A streamed NDJSON body and `AbortController` (PM6) | `assistant-api.ts` returns a `Stream` of frames            | a streamed write: tokens through `progress`, no turn per token          | `assistant.contracts.ts`, `AssistantPanel.tsx`                 |
| A close code (4401), a transport loss              | `SignedOut`, `SocketDropped`                               | the feed's SIGNED_OUT / RETRY_WAIT; the presence reopen                 | `feed.machine.ts`, `presence.definition.ts`                    |

## Structure

| Location                                              | Responsibility                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [features/Session](features/Session/)                 | permission and current-user truth others read                                                     |
| [features/Toasts](features/Toasts/)                   | a shared actor other actors send to                                                               |
| [features/Tickets](features/Tickets/)                 | schemas and errors, the ticket port, `ticket.contracts.ts`, the ticket entity domain, app Stories |
| [features/Tickets/editor](features/Tickets/editor/)   | the editor: definition, machine, ref, hook, panel, Stories, tests, tab Stories                    |
| [features/Tickets/queue](features/Tickets/queue/)     | the queue: definition, machine, list view, Stories, SSR Stories, tests                            |
| [features/Tickets/feed](features/Tickets/feed/) (PM6) | the workspace socket, contracts, listen domain, `DeskFeed` machine, activity log, Stories         |
| [features/Comments](features/Comments/)               | the Comments fragment (trait), contracts, panel, Stories; placed by editor and queue              |
| [features/Attachments](features/Attachments/)         | the AttachmentUpload fragment (`.each`), contracts, view, Stories                                 |
| [features/Presence](features/Presence/) (PM6)         | who has a ticket open: a state feed, machine, view, Stories                                       |
| [features/Assistant](features/Assistant/) (PM6)       | a streamed reply: contracts, machine, panel, Stories                                              |
| [app](app/)                                           | the closed app, setup, host, persistence, view; `desk-server.ts` and `demo-api.ts` (the server)   |
| [next](next/)                                         | HTTP adapter, request-scoped and browser setups, auth stub, provider, pages                       |
| [testing](testing/)                                   | the Desk fake (server and client halves), the Presence and Assistant fakes, the property test     |
| [tools](tools/)                                       | inspection, CLI and diagnostics examples                                                          |
| [flow.config.ts](flow.config.ts)                      | the apps and Story globs the CLI discovers                                                        |

## Feature map

Each feature, the files that show it, and the design it demonstrates. Rule numbers are MD's; "OD" is its open
decisions.

| Feature                                              | Files                                                                                                                                                | Design                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Named operations in every definition                 | every `*.definition.ts`, `*.trait.ts`, `*.contracts.ts`                                                                                              | rules 39–43, 47; 2.7                              |
| Save, lock and the hold (unknown save, same Attempt) | `ticket.contracts.ts`, `editor.definition.ts`, `editor.machine.ts`, `TicketPanel.tsx`, `editor.story.ts`                                             | rules 13–25, 43, 45; 2.7.1, 2.7.3                 |
| Keyed lanes: assign many tickets                     | `queue.definition.ts`, `queue.machine.ts`, `QueueList.tsx`, `queue.story.ts`                                                                         | rules 39–43; 2.7.3; OD4                           |
| Writes that outlive the screen                       | `editor.machine.ts`, `app/host.ts` (`unsettledWrites`), `app/view.tsx`, `desk.story.ts`, `editor.story.ts`, `tools/inspection.ts`                    | rules 44, 53; OD21                                |
| Tickets as an entity domain with predictions         | `ticket.domain.ts`, `TicketPanel.tsx`, `QueueList.tsx`, `desk.story.ts`, `testing/desk.property.test.ts`, `app/desk-server.ts`                       | rules 26–38; 2.8                                  |
| Comments on two hosts (`resetOn`, A-B-A)             | `comments.trait.ts`, `comments.contracts.ts`, `CommentsPanel.tsx`, `comments.story.ts`, placements in `editor.definition.ts`, `queue.definition.ts`  | rules 9, 23, 33, 36, 48–59; 2.9.6                 |
| Attachment upload: progress, cancel, `FileGone`      | `upload.trait.ts`, `attachments.contracts.ts`, `Attachments.tsx`, `upload.story.ts`, `useEditor.ts`                                                  | rules 21, 48, 51–54, 57, 60; 2.9.2, 2.9.3         |
| Live feed with catch-up (PM6)                        | `feed/feed.contracts.ts`, `feed.domain.ts`, `feed.definition.ts`, `feed.machine.ts`, `ActivityLog.tsx`, `feed.story.ts`                              | M6 2.2–2.8, 3.6, 4.1; S2–S4, S7, S10; rule 25     |
| Presence on a ticket (PM6)                           | `presence.contracts.ts`, `presence.definition.ts`, `presence.machine.ts`, `Viewers.tsx`, `presence.story.ts`, `testing/presence.fake.ts`             | M6 2.6, 2.7, 4.2; rules 25, 47                    |
| Streamed assistant reply (PM6)                       | `assistant.contracts.ts`, `assistant.definition.ts`, `assistant.machine.ts`, `AssistantPanel.tsx`, `assistant.story.ts`, `testing/assistant.fake.ts` | M6 2.9, 4.4; S5 Q11                               |
| Stories on fakes                                     | every `*.story.ts`, `testing/desk.fake.ts`, `desk.test.tsx`, `queue.ssr.story.ts`, `editor.tabs.story.ts`                                            | rules 61–66; 2.10.1–2.10.14                       |
| Property test                                        | `testing/desk.property.test.ts`, `app/desk-server.ts` (the oracle)                                                                                   | 2.10.16                                           |
| Persistence, tabs, reload                            | `app/persistence.ts`, `editor.tabs.story.ts`, `next/browser-setup.ts`                                                                                | OD11, OD21; 2.10.4                                |
| SSR and hydration                                    | `next/`, `queue.ssr.story.ts`, `queue.ssr.test.ts`                                                                                                   | ServerRendering O1–O7; M6 2.10                    |
| Inspection, CLI, diagnostics                         | `tools/inspection.ts`, `tools/cli.ts`, `tools/diagnostics.ts`, `flow.config.ts`                                                                      | 2.9.5, 2.10.6, 2.10.7, 2.10.14; Diagnostics O1–O2 |

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
| Streams (M6, **pending merge 6**)  | 2.2–2.4, 3.6 feeds, `listen`, `Feed`, `delivers`                         | `feed.contracts.ts`, `feed.domain.ts`, `feed.definition.ts`, `presence.contracts.ts`         |
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
| `feed/*` (PM6)                                                                                 | connect, drop and catch up, history truncated, reload resumes, log reset, token expired, pushed rename | `Desk.socket.drop()`, `withhold`, `expireToken`                        |
| `desk/pushed-rename` (PM6)                                                                     | a push updates the one Ticket record in every copy                                                     | `Desk.renameElsewhere`                                                 |
| `presence/*` (PM6)                                                                             | joined, dropped, rejoin changed, budget spent, token expired                                           | `PresenceFake`, `advance({ next })`                                    |
| `assistant/*` (PM6)                                                                            | answered, streaming, stopped, asked again, stalled, truncated, refused, reloaded                       | `AssistantFake`, `hold({ after })`                                     |
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
| `listen` keeps no position across sessions  | every restart refetches covered lists; cross-session resume needs the separate `activity` fact feed (PM6)         |
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
  released at capture (M6 2.10). PM6.
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

## Pending merge 6

Revisit these when merge 6 lands. A PM6 file says so in its header: "written against
merge-6-streams/proposal-v2.md revision 7".

- **Whole PM6 files:** everything in `features/Tickets/feed/` (`desk-socket.ts`, `feed.contracts.ts`, `feed.domain.ts`,
  `feed.definition.ts`, `feed.machine.ts`, `feed.ref.ts`, `ActivityLog.tsx`, `feed.story.ts`, `feed.test.ts`);
  everything in `features/Presence/` and `features/Assistant/`; `testing/presence.fake.ts`, `testing/assistant.fake.ts`.
- **Lines in other files:**
  - `app/app.ts`: the `feed`, `presence`, `assistant` machines and their imports.
  - `app/host.ts`: `ensureActor(feedRef(…))`. `app/view.tsx`: `Viewers`, `AssistantPanel`, `ActivityLog`.
  - `app/persistence.ts`: the DeskFeed restore note (M6 2.10).
  - `features/Tickets/queue/QueueList.tsx`: the `Viewers` line.
  - `features/Attachments/attachments.contracts.ts` and `attachments-api.ts`: the `progress(p)` setter (S5 Q11).
  - `features/Tickets/ticket.contracts.ts`, `ticket-api.ts`, `types.ts`, `ticket.domain.ts`: comments pointing at the feed.
  - `features/Tickets/desk.story.ts` and `desk.test.tsx`: `desk/pushed-rename`.
  - `testing/desk.fake.ts`: the streams block (about line 253) and the stream ports (about line 471).
  - `next/http-api.ts`, `next/server-setup.ts`: the socket, presence and assistant ports; sessions released at capture.
  - `flow.config.ts`: the Presence and Assistant Story globs.
  - `tools/cli.ts`: `flow check --finding FeedUnhandled`, `flow stories --coverage --kind session`.
  - `tools/inspection.ts`: stream sessions in the inspection listing (M6 2.12).

## Design gaps

Every `// design gap:` comment in this folder (grep `design gap:`), where the design is silent and the file follows the
plan or makes an assumption. 43 gaps.

| #   | File                                           | Gap                                                                                                                              | What the design would need                                          |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `app/host.ts`                                  | shape of an `unsettledWrites()` entry                                                                                            | the entry type (identity, contract, key)                            |
| 2   | `features/Assistant/AssistantPanel.tsx`        | reading a single-row lane without a key                                                                                          | say how a view reads an unkeyed streamed lane's row                 |
| 3   | `features/Assistant/AssistantPanel.tsx`        | sending into another actor's fragment (`Editor.E.comments.Post` to the editor's ref)                                             | the send form for a ref plus a fragment instance path               |
| 4   | `features/Assistant/assistant.story.ts`        | `hold({ after: 2 })` paces a body                                                                                                | a spelling for letting n frames through before holding              |
| 5   | `features/Assistant/assistant.story.ts`        | `fixtures` order for two client halves                                                                                           | rule for combining several fixtures that provide the same ports     |
| 6   | `features/Comments/CommentsPanel.tsx`          | `s.memory[instance]`, `s.operations[instance]` indexed by a prop                                                                 | a host-agnostic way to address a placed fragment's view as data     |
| 7   | `features/Comments/CommentsPanel.tsx`          | the host passes its own `E[instance]` as `events`                                                                                | a handle that sends to a placed fragment without importing its host |
| 8   | `features/Comments/comments.contracts.ts`      | `unknownWhenLost` repeated (private to `ticket.contracts.ts`)                                                                    | a shared outcome-classification helper for contracts                |
| 9   | `features/Comments/comments.story.ts`          | how `reset(subject)` refills the Input                                                                                           | the stand-in host's rule for deriving an Input from a subject       |
| 10  | `features/Tickets/desk.story.ts`               | plain `dispose` keeps the actor for `retain`; `how: "now"` ends it                                                               | how `retain` and a re-`ensure` behave on a Story clock              |
| 11  | `features/Tickets/desk.test.tsx`               | `StoryFrame`'s props                                                                                                             | the props (run, checkpoint name, views as children)                 |
| 12  | `features/Tickets/editor/editor.story.ts`      | a machine Story's `send(ToastsRef, …)` with no Toasts actor                                                                      | whether it is dropped, fails, or is recorded                        |
| 13  | `features/Tickets/editor/editor.story.ts`      | `ensure()` after `dispose()` re-adopts a parked ending (OD21) for a machine Story's actor                                        | the identity a machine Story's actor has                            |
| 14  | `features/Tickets/editor/editor.tabs.story.ts` | `browserSetup` brings `layerIndexedDb`; `Fake.storage` stands in                                                                 | a statement that a Story's storage replaces the setup's             |
| 15  | `features/Tickets/editor/useEditor.ts`         | a React hook for the Runtime (`useRuntime`)                                                                                      | a hook to reach the Runtime from a view                             |
| 16  | `features/Tickets/feed/feed.contracts.ts`      | the `catchUp` step gets no `signal`                                                                                              | pass the interruption signal to a `catchUp` step                    |
| 17  | `features/Tickets/feed/feed.contracts.ts`      | `listen` has no `from`, `position` or `catchUp`; `eventsSince` pages `ActivityEntry`                                             | cross-session position for `listen`, or a TicketEvent history port  |
| 18  | `features/Tickets/feed/feed.definition.ts`     | SIGNED_OUT terminal state for close 4401                                                                                         | how a non-retriable close ends a stream session in the machine      |
| 19  | `features/Tickets/feed/feed.domain.ts`         | a patch of a ticket no list holds yet changes nothing                                                                            | whether `patch` of an unseen record is ignored, stored or an error  |
| 20  | `features/Tickets/feed/feed.story.ts`          | no replay-withholding control on `Desk.socket`                                                                                   | `fake.withhold("replay")` (M6 2.11) on the multi-endpoint Desk      |
| 21  | `features/Tickets/queue/queue.definition.ts`   | events that set `memory.previewId`                                                                                               | the preview's open and close events                                 |
| 22  | `features/Tickets/queue/queue.machine.ts`      | normalisation lives in the caller                                                                                                | a key function or input normaliser on the contract (OD4)            |
| 23  | `features/Tickets/queue/queue.machine.ts`      | `more` and `hasMore` are the plan's                                                                                              | paging members on a live read (plan section 6, item 1)              |
| 24  | `features/Tickets/queue/queue.ssr.story.ts`    | a source Story's `world` is a type error                                                                                         | how a source Story seeds its server                                 |
| 25  | `features/Tickets/queue/queue.story.ts`        | a machine Story's `context` option stands in for Session                                                                         | a spelling for context in machine Stories                           |
| 26  | `features/Tickets/queue/queue.story.ts`        | `match` filters a rule by request fields (`{ ticketId }`)                                                                        | the match form for request fields                                   |
| 27  | `features/Tickets/ticket.contracts.ts`         | normalisation moves to the caller; the key is a field list                                                                       | same as 22                                                          |
| 28  | `features/Presence/presence.definition.ts`     | a state feed that maps `failure` alone                                                                                           | permit mapping only `failure` (M6 2.7)                              |
| 29  | `features/Presence/presence.story.ts`          | the address of a machine schedule in `advance({ next })`                                                                         | a way to name a machine schedule                                    |
| 30  | `features/Attachments/upload.story.ts`         | the full bar: the client half reports all bytes before the request is held                                                       | a way to hold a request after the upload completes                  |
| 31  | `testing/presence.fake.ts`                     | `open` returns truth, greeting frames and accept; this file's tuple                                                              | the return shape of `open`                                          |
| 32  | `testing/presence.fake.ts`                     | a control returns `{ to, send }` or `{ to, close }`                                                                              | the return shape of a control on open connections                   |
| 33  | `testing/presence.fake.ts`                     | how a client half reads a stream endpoint                                                                                        | a client-half reader for stream endpoints (STR19)                   |
| 34  | `testing/desk.fake.ts`                         | a lost read has no `NoResponse` in the B0 read ports; the fake dies                                                              | a lost-read outcome for read ports                                  |
| 35  | `testing/desk.fake.ts`                         | `DeskTruth` declared structurally with `Schema.declare`                                                                          | a way to declare server truth from plain data                       |
| 36  | `testing/desk.fake.ts`                         | `pushes` (log changes to open sockets) is not in 2.10.4                                                                          | a fake-level declaration of pushes                                  |
| 37  | `testing/desk.fake.ts`                         | `Fake.closeStreams(endpoint, code)` as a control's result                                                                        | a closing result for stream controls                                |
| 38  | `testing/desk.fake.ts`                         | a stream endpoint's failure is `Fake/Closed { code }` or `Fake/Lost`                                                             | the error tags of a stream endpoint                                 |
| 39  | `testing/desk.property.test.ts`                | the generators' spellings (`Generate.sends`, `.wire`, `.controls`, `.advance`, `.lifecycle`)                                     | 2.10.16's generator API                                             |
| 40  | `next/server-setup.ts`                         | the setup type asks for every port, though no stream is opened on the server                                                     | a way to type a setup that needs only the ports its actors use      |
| 41  | `tools/cli.ts`                                 | `--finding` on `flow check`, `--kind` on `flow stories --coverage`                                                               | flags 2.10.14 does not name                                         |
| 42  | `tools/diagnostics.ts`                         | whether the closed `FlowError` code type includes `InvalidTurn`, `StoryInvalidCommand`, `HostTimeWait`, `StoryExpectationFailed` | the closed code list                                                |
| 43  | `tools/inspection.ts`                          | the field names of a lane entry (2.10.7's list)                                                                                  | the entry type                                                      |
