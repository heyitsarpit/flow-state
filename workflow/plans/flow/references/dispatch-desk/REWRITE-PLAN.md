# Dispatch Desk rewrite plan

**Status: done.** Batches B0–B13 are written (not committed here). Nothing in the proposals is decided until the owner
says so. This
plan rewrites Dispatch Desk on the new design and expands it so that every major piece appears in code that looks
real.

**Sources.** The design is [machine-design.md](../explorations/machine-fragments/machine-design.md) ("MD"). It contains
merges 1–5, operations in the definition (2.7, rules 39–47, OD1–OD26), entities (2.8, rules 26–38), fragment
operations (2.9, rules 48–60, F1–F10) and Stories (2.10, rules 61–66, T1–T7). Streams are **not merged**. They follow
[merged/streams/proposal-v2.md](../explorations/machine-fragments/merged/streams/proposal-v2.md) revision 7 ("M6")
with [decisions-v2.md](../explorations/machine-fragments/merged/streams/decisions-v2.md) S1–S10. Every file that uses
them is marked **pending merge 6**. The file must say so in its header comment, and it must be revisited when merge 6
lands.

**Words.** _Kept_: the file stays as it is, or changes only in its imports. _Rewritten_: same path, new content.
_Renamed_: a new path. _Removed_: deleted, with what replaces it. _Added_: a new file. "PM6" marks a file or a part
that is pending merge 6.

## 1. File map

### 1.1 Old files (49)

| Old file                                       | Status → new                                                                | Purpose after the rewrite                                                                                                                                                                                                                       | Demonstrates                                   | Batch             |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------- |
| `README.md`                                    | rewritten                                                                   | entry point (outline in section 5)                                                                                                                                                                                                              | —                                              | B13               |
| `flow.config.ts`                               | rewritten                                                                   | apps, app Story globs, and fragment Stories with no app at the top level                                                                                                                                                                        | 2.10.1 ids and discovery                       | B11               |
| `app/app.ts`                                   | rewritten                                                                   | the closed app: Session, Toasts, Queue, lazy Editor, DeskFeed, Presence, Assistant, with context wiring                                                                                                                                         | Runtime O2; LazyFeatures O1                    | B11 (PM6 entries) |
| `app/setup.ts`                                 | rewritten                                                                   | `DeskSetup`: one Layer for every port, over the demo server                                                                                                                                                                                     | OD11, the swap point                           | B11               |
| `app/demo-api.ts`                              | rewritten                                                                   | the in-memory server as Effect Layers for every port (tickets, comments, attachments, socket, presence, assistant), over `desk-server.ts`                                                                                                       | Effect-only; OD11                              | B0                |
| `app/host.ts`                                  | rewritten                                                                   | the imperative host: ready, ensure, `beforeunload` with `runtime.unsettledWrites()`, sign-out that refuses while writes are unsettled, FlowError                                                                                                | rule 44, C43, C64; Diagnostics O1              | B11               |
| `app/persistence.ts`                           | rewritten                                                                   | browser setup, plus a doc block on what a reload restores now: lane records under (identity, contract, key), subject paths, releasing marks, `unknown { Restored }`, fact-feed `registered`                                                     | rules 38, 46, 51, 60; 2.9.4; M6 2.10           | B11               |
| `app/view.tsx`                                 | rewritten                                                                   | `Desk` and a new `TicketScreen` that composes TicketPanel, Viewers, AssistantPanel and ActivityLog; lazy panel chunk                                                                                                                            | React O1–O5                                    | B11 (PM6 parts)   |
| `features/Session/session.definition.ts`       | rewritten                                                                   | memory through `Flow.input` / `Flow.initial`; no top-level `input` or `initial`                                                                                                                                                                 | 2.2.2                                          | B3                |
| `features/Session/session.machine.ts`          | kept                                                                        | permission and sign-out                                                                                                                                                                                                                         | —                                              | —                 |
| `features/Session/session.ref.ts`              | kept                                                                        | `SessionRef`                                                                                                                                                                                                                                    | —                                              | —                 |
| `features/Toasts/toasts.definition.ts`         | rewritten                                                                   | `Flow.initial` memory                                                                                                                                                                                                                           | 2.2.2                                          | B3                |
| `features/Toasts/toasts.machine.ts`            | kept                                                                        | expiry schedule, ordered alternatives                                                                                                                                                                                                           | —                                              | —                 |
| `features/Toasts/toasts.ref.ts`                | kept                                                                        | `ToastsRef`                                                                                                                                                                                                                                     | —                                              | —                 |
| `features/Toasts/ToastStack.tsx`               | kept                                                                        | the toast view                                                                                                                                                                                                                                  | —                                              | —                 |
| `features/Tickets/types.ts`                    | rewritten                                                                   | Schemas and errors as `Schema.TaggedError`; adds `NoResponse`, `ServerError`, `AlreadyAssigned`, `TicketEvent` with `{ epoch, seq }` cursors, `ActivityEntry`                                                                                   | 2.7.1, 2.7.2; Effect-only                      | B0                |
| `features/Tickets/ticket-api.ts`               | rewritten                                                                   | the port: `{ idempotencyKey, signal }` per call, `NoResponse` when `fetch` rejects, `eventsSince(cursor)` for catch-up pages; no Streams (they move to `feed/desk-socket.ts`)                                                                   | 2.7.2 "where the data comes from"; Effect-only | B0                |
| `features/Tickets/ticket.operations.ts`        | removed → `ticket.contracts.ts` (B1) and `feed/feed.contracts.ts` (B8, PM6) | `*.operations.ts` is gone (3.6, "Removed")                                                                                                                                                                                                      | rule 39                                        | B1                |
| `features/Tickets/ticket.domain.ts`            | rewritten                                                                   | `Ticket` entity and `TicketsDomain`: `ticketById`, `list` (where, orderBy, pagedBy), `openCount` (derivedFrom), `saveTitle` and `assign` with `.predicts`; reads `output`, not `result`. The push `listen` entry moves to `feed/feed.domain.ts` | rules 26–38; 2.8.2                             | B1                |
| `features/Tickets/editor/editor.definition.ts` | rewritten                                                                   | named `operations: ({ E }) => ({ ticket, save })`, `Flow.input` memory, `Flow.uncertain` event, `traits: { comments: Comments, uploads: AttachmentUpload.each(…) }`; no Attempt in memory                                                       | rules 13, 39–43, 49; 2.2.2                     | B6                |
| `features/Tickets/editor/editor.machine.ts`    | rewritten                                                                   | spec-readable editor: SAVING, SAVED, FAILED, LOCKED (definite failure, new Attempt), UNSURE (the hold: `retryable({ times: 3 })`, then `cancel`), root handlers for late and adopted endings, fragment fillings                                 | rules 14–25, 31, 44, 45; 2.7.4, 2.7.6, 2.7.13  | B6                |
| `features/Tickets/editor/editor.ref.ts`        | kept                                                                        | persisted per-ticket identity, `retain`                                                                                                                                                                                                         | rule 46 needs a persisted identity             | —                 |
| `features/Tickets/editor/useEditor.ts`         | rewritten                                                                   | the one hook: commands for title, save, retry, attach, remove an attachment, and comment through `E.comments.*`                                                                                                                                 | React O2                                       | B6                |
| `features/Tickets/editor/TicketPanel.tsx`      | rewritten                                                                   | reads `Ticket.get(s, key, Ticket.pick(…))` (`predicted`, `uncertain`), `O.save.get(s, key)` (`pending`, `uncertain`, `retryCount`), `check()` for Save, and renders `CommentsPanel` and `Attachments`                                           | 2.8.1 store versus lane; 2.7.16                | B6                |
| `features/Tickets/editor/editor.story.ts`      | rewritten                                                                   | machine Stories: `Story.make(EditorMachine, { id, input, context, fixtures: [DeskClient], world })`; `send`, `advance`, `world(Desk.saveTitle.hold())`, `expect`                                                                                | rules 61–65; 2.10.18.1                         | B6                |
| `features/Tickets/editor/editor.test.tsx`      | renamed → `editor.test.ts`                                                  | one line per Story (`test(…, () => story.run())`); the React render test moves to `desk.test.tsx`                                                                                                                                               | 2.10.1 running                                 | B6                |
| `features/Tickets/editor/editor.tabs.story.ts` | rewritten                                                                   | app Stories: `reload()`, `openTab("b", { from: "main" })`, `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`; restore delivers `unknown { Restored }`                                                                            | 2.10.10; rules 44, 46                          | B12               |
| `features/Tickets/editor/editor.tabs.test.ts`  | removed                                                                     | its assertions become `expect` steps in `editor.tabs.story.ts`; the run is a line in `desk.test.tsx`                                                                                                                                            | rule 63                                        | B12               |
| `features/Tickets/queue/queue.definition.ts`   | rewritten                                                                   | named operations `list`, `open`, `assign` (keyed lanes); `preview: Comments` with `resetOn`; `ReconcileAssign`, `AssignUnsure`                                                                                                                  | rules 21, 23, 43, 51; 2.7.10                   | B7                |
| `features/Tickets/queue/queue.machine.ts`      | rewritten                                                                   | list placement with `placeholder`, HEALTHY/DEGRADED polling, `O.assign.idle(row)` guard, keyed reconcile schedule over uncertain lanes, `retryable` then `cancel`                                                                               | rules 16, 21, 23, 43; N1                       | B7                |
| `features/Tickets/queue/queue.ref.ts`          | kept                                                                        | one queue per workspace                                                                                                                                                                                                                         | —                                              | —                 |
| `features/Tickets/queue/QueueList.tsx`         | rewritten                                                                   | rows from the answer, fields from the record, "Assigning…" from `Queue.O.assign.get(s, row)`, preview drawer with `CommentsPanel`                                                                                                               | 2.8.1; rule N3                                 | B7                |
| `features/Tickets/queue/queue.story.ts`        | rewritten                                                                   | machine Stories: search key, mine only, paging, degraded backoff, keyed assignments with held and dropped wires                                                                                                                                 | rules 61–65; 2.10.5                            | B7                |
| `features/Tickets/queue/queue.test.ts`         | rewritten                                                                   | one line per Story                                                                                                                                                                                                                              | —                                              | B7                |
| `features/Tickets/queue/queue.ssr.story.ts`    | rewritten                                                                   | `dehydrate` and `hydrate` against one world; the hydrated tab's request log shows no list or count lookup                                                                                                                                       | 2.10.11                                        | B12               |
| `features/Tickets/queue/queue.ssr.test.ts`     | rewritten                                                                   | React `renderToString` / `hydrateRoot` agreement; counts lookups with a small counting Layer in the test                                                                                                                                        | ServerRendering O1–O7                          | B12               |
| `next/app/layout.tsx`                          | kept                                                                        | root session hydration                                                                                                                                                                                                                          | —                                              | —                 |
| `next/app/desk/[workspace]/page.tsx`           | kept                                                                        | streamed queue segment                                                                                                                                                                                                                          | —                                              | —                 |
| `next/app/desk/[workspace]/queue-client.tsx`   | kept                                                                        | client boundary                                                                                                                                                                                                                                 | —                                              | —                 |
| `next/auth.ts`                                 | kept                                                                        | throwing auth stub                                                                                                                                                                                                                              | —                                              | —                 |
| `next/providers.tsx`                           | kept                                                                        | FlowProvider per scope                                                                                                                                                                                                                          | —                                              | —                 |
| `next/browser-setup.ts`                        | rewritten                                                                   | `HttpDeskApi` (every port) plus IndexedDB                                                                                                                                                                                                       | OD11                                           | B11               |
| `next/server-setup.ts`                         | rewritten                                                                   | `HttpDeskApi(token)`; no socket ports on the server                                                                                                                                                                                             | M6 2.10 SSR: sessions are released at capture  | B11               |
| `next/http-api.ts`                             | rewritten                                                                   | fetch-based ports; fixes today's `exactOptionalPropertyTypes` error at line 35 (section 4); the socket, presence and assistant ports over `WebSocket` and a streamed body                                                                       | 2.7.2; M6 4.1, 4.2, 4.4; Effect-only           | B0                |
| `testing/fixtures.ts`                          | removed → `testing/desk.fake.ts`                                            | `SlowSave` → `Desk.saveTitle.hold()`; `LockedSave` → `Desk.lock(…)`; `UnavailableQueue` → `Desk.listOutage(…)`; `RenamedElsewhere` → `Desk.renameElsewhere(…)`; `countingTicketApi` → the endpoint's request log                                | rules 62, 66                                   | B2                |
| `testing/tickets.property.test.ts`             | renamed → `testing/desk.property.test.ts`                                   | `propertyTest(story, { steps: Domain.propertySteps([TicketsDomain], inputs), properties })`, with the fake's truth as the oracle; plus one editor property that replaces `model()` (T1)                                                         | 2.10.16                                        | B12               |
| `tools/cli.ts`                                 | rewritten                                                                   | `flow story list / describe / run`, `flow check` findings (`UnresolvedHold`, `SharedContract`, `KeyRequired`, `VerbMismatch`, `FeedUnhandled` PM6), `flow explain` for a fragment's operations, `flow stories --coverage`                       | 2.9.5, 2.10.14                                 | B12               |
| `tools/diagnostics.ts`                         | rewritten                                                                   | the codes this app can meet now: `InvalidTurn`, `StoryInvalidCommand`, `HostTimeWait`, `StoryExpectationFailed`                                                                                                                                 | Diagnostics O1–O2                              | B12               |
| `tools/inspection.ts`                          | rewritten                                                                   | `inspect(runtime)` lanes (`binding`, `subject`, `releasing`, parked endings), incarnations, `runtime.unsettledWrites()`; sessions (PM6)                                                                                                         | C64, C78; 2.9.5                                | B12               |

### 1.2 Added files

| New file                                                                                  | Purpose                                                                                                                                                                                                                                                                                                                                            | Demonstrates                       | Batch                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------- |
| `tsconfig.effect-only.json`                                                               | type-checks the Effect-only files today (section 4)                                                                                                                                                                                                                                                                                                | —                                  | B0                    |
| `app/desk-server.ts`                                                                      | the server's rules as pure functions over plain truth (filter, declared order, page, idempotency, locks, event log). The demo Layers (`demo-api.ts`) and the Story fake (`desk.fake.ts`) both call it, so "filters and orders exactly as the real server does" has one implementation                                                              | the property-test oracle (2.10.16) | B0                    |
| `features/Tickets/feed/desk-socket.ts`                                                    | **PM6 shape**, Effect-only: the raw workspace socket as `Stream` of decoded frames (`hello`, `reset`, `change`, `activity`, `ping`), with close codes mapped to `SocketDropped` / `SignedOut`                                                                                                                                                      | M6 4.1 adapter side                | B0                    |
| `features/Comments/comments-api.ts`                                                       | port and Schemas: `list(ticket)`, `post({ clientId, text }, { idempotencyKey, signal })`                                                                                                                                                                                                                                                           | Effect-only                        | B0                    |
| `features/Attachments/attachments-api.ts`                                                 | port and Schemas: `put(ref, bytes, { idempotencyKey, signal, onProgress })`, plus `PendingFiles`, a client-side blob store keyed by `ref` (memory holds no `File`; see section 6, item 2)                                                                                                                                                          | Effect-only                        | B0                    |
| `features/Presence/presence-api.ts`                                                       | **PM6 shape**, Effect-only: `frames(ticket)` emitting `presence_state` and `presence_diff`                                                                                                                                                                                                                                                         | M6 4.2                             | B0                    |
| `features/Assistant/assistant-api.ts`                                                     | **PM6 shape**, Effect-only: `suggest(input, { idempotencyKey, signal })` returning the NDJSON body as a `Stream` of `token` / `done` frames                                                                                                                                                                                                        | M6 4.4                             | B0                    |
| `features/Tickets/ticket.contracts.ts`                                                    | `ticketById`, `ticketList`, `openCount` (resources), `saveTitle` and `assignTicket` (transactions; `key: ["workspaceId", "ticketId"]`, `reject`), each with `input`, `output`, `key`, and `Outcome` classification beside the status it reads                                                                                                      | rule 39; 2.7.1, 2.7.3              | B1                    |
| `testing/desk.fake.ts`                                                                    | the `Desk` fake server (truth: tickets, applied keys, locks, outages, comments, attachments, event log), its call endpoints and controls, and `DeskClient`, the client half that provides every port (`Fake/Lost` → `NoResponse`). The `socket` stream endpoint is the PM6 block (it shares truth with the controls, so a rename elsewhere pushes) | rules 62, 66; 2.10.4               | B2 (socket block PM6) |
| `features/Comments/comments.contracts.ts`                                                 | `commentsOn` (resource, `key: ["workspaceId", "ticketId"]`) and `postComment` (transaction, `key: ["clientId"]`, `reject`)                                                                                                                                                                                                                         | rule 39                            | B4                    |
| `features/Comments/comments.trait.ts`                                                     | `Comments`, a writing root trait: a list read in its body `activities`, `post` with `writes` invalidating the thread, drafts pruned against the list (rule 33), a keyed resend schedule over uncertain posts, and `failure.NotSent` mapped (needed on non-empty subject paths)                                                                     | rules 9, 23, 33, 36, 48–59; 2.9.6  | B4                    |
| `features/Comments/CommentsPanel.tsx`                                                     | thread plus drafts; `Comments.O.post.get(s, draft)`; host-agnostic (takes the host's handle and instance)                                                                                                                                                                                                                                          | rule 50                            | B4                    |
| `features/Comments/comments.story.ts`                                                     | fragment Stories: `Story.make(Comments, …)`, `enter`, `leave`, `reset(subject)`; and the A, B, A walk with a held post                                                                                                                                                                                                                             | rules 11, 58; 2.10.12              | B4                    |
| `features/Comments/comments.test.ts`                                                      | one line per Story                                                                                                                                                                                                                                                                                                                                 | —                                  | B4                    |
| `features/Attachments/attachments.contracts.ts`                                           | `putAttachment` (transaction, `key: ["ref"]`, `reject`, `progress: { sent, total }`). The commit's `progress(p)` setter line is **PM6** (S5 Q11)                                                                                                                                                                                                   | rule 39; OD18; M6 2.9              | B5 (one line PM6)     |
| `features/Attachments/upload.trait.ts`                                                    | `AttachmentUpload`, placed `.each({ of: "attachments", by: "ref", max: 10 })`: commits on creation through a 0 ms `Flow.entry` schedule guarded by `O.put.idle(own)`, `Cancel`, a resend budget, and `whenAbandoned: [O.put.cancel]` (release on leave: a removed attachment is worthless)                                                         | rules 54, 60; 2.9.2, 2.9.3         | B5                    |
| `features/Attachments/Attachments.tsx`                                                    | rows with `progress` and "Waiting for the server…" (`progress` is an upper bound)                                                                                                                                                                                                                                                                  | rule 21 rows                       | B5                    |
| `features/Attachments/upload.story.ts`                                                    | fragment Stories: progress, cancel, remove while uploading, then reload with nothing parked and no unsettled write                                                                                                                                                                                                                                 | rule 58 walks                      | B5                    |
| `features/Attachments/upload.test.ts`                                                     | one line per Story                                                                                                                                                                                                                                                                                                                                 | —                                  | B5                    |
| `features/Tickets/feed/feed.contracts.ts`                                                 | **PM6.** `ticketChanges` and `activity` streams (`delivers: "facts"`, `key: ["workspaceId"]`, `after` outside the key), both over `DeskSocket` with `Feed.reconnect({ from, position, while, schedule, catchUp })`, where `catchUp` pages `TicketApi.eventsSince`                                                                                  | M6 2.2–2.4, 4.1; S2–S4, S7         | B8                    |
| `features/Tickets/feed/feed.domain.ts`                                                    | **PM6.** `TicketFeed = domain("ticket-feed", { changes: listen(ticketChanges).as([Ticket], …) })`, a second domain over the same entity                                                                                                                                                                                                            | M6 2.8, 3.6; rule 29               | B8                    |
| `features/Tickets/feed/feed.definition.ts`                                                | **PM6.** `DeskFeed`, one per workspace: `changes` (listen, `failure` mapped), `activity` (`value`, `missed`, `failure`), memory `activity`, `cursor`, `notice`, `reopenInMs`                                                                                                                                                                       | M6 2.7; S4, S10                    | B8                    |
| `features/Tickets/feed/feed.machine.ts`                                                   | **PM6.** LIVE / RETRY_WAIT, the `Healthy` reset of the re-open backoff, `upsert` by id                                                                                                                                                                                                                                                             | M6 2.7                             | B8                    |
| `features/Tickets/feed/feed.ref.ts`                                                       | **PM6.** `feedRef(workspaceId)`, persisted, so the cursor survives a reload                                                                                                                                                                                                                                                                        | M6 2.10                            | B8                    |
| `features/Tickets/feed/ActivityLog.tsx`                                                   | **PM6.** activity list, the "may be missing" notice, and the connection badge from `s.operations.activity.connection` and `drop`                                                                                                                                                                                                                   | M6 2.6                             | B8                    |
| `features/Tickets/feed/feed.story.ts`, `feed.test.ts`                                     | **PM6.** drop and reconnect with catch-up, a history `truncated` → `missed Lost`, a reload that resumes from the cursor, a pushed rename that repairs only the lists that can be wrong                                                                                                                                                             | 2.10.9                             | B8                    |
| `features/Presence/presence.contracts.ts`                                                 | **PM6.** `ticketViewers` (`delivers: "state"`, `key: ["workspaceId", "ticketId"]`) with `Stream.scan` over frames                                                                                                                                                                                                                                  | M6 4.2                             | B9                    |
| `features/Presence/presence.definition.ts`, `presence.machine.ts`, `presence.ref.ts`      | **PM6.** one small actor per ticket (WATCHING / RETRY_WAIT) with a bare operation; shared by the panel and the queue row                                                                                                                                                                                                                           | M6 2.6, K3                         | B9                    |
| `features/Presence/Viewers.tsx`                                                           | **PM6.** `row?.value ?? row?.last?.value`, dimmed while not live                                                                                                                                                                                                                                                                                   | M6 2.6                             | B9                    |
| `features/Presence/presence.story.ts`, `presence.test.ts`; `testing/presence.fake.ts`     | **PM6.** join, drop (value goes, `last` dims), rejoin; its own `Fake.server` with a `Fake.stream` endpoint                                                                                                                                                                                                                                         | 2.10.9                             | B9                    |
| `features/Assistant/assistant.contracts.ts`                                               | **PM6.** `suggestReply` (transaction, `key: ["workspaceId", "ticketId"]`, `reject`, `progress: { text }`)                                                                                                                                                                                                                                          | M6 2.9, 4.4                        | B10                   |
| `features/Assistant/assistant.definition.ts`, `assistant.machine.ts`, `assistant.ref.ts`  | **PM6.** IDLE / ASKING; `unknown` mapped by tag (`Cancelled` → `Stopped`, `NoResponse`, `Stalled`, `Truncated`, `Restored`… → `Cut`); Stop is `O.suggest.cancel`, released in `Stopped`                                                                                                                                                            | rules 13, 21, 24; OD23 Q36         | B10                   |
| `features/Assistant/AssistantPanel.tsx`                                                   | **PM6.** `s.operations.suggest.progress?.text ?? s.memory.last`; "Use as comment" sends the text to the editor's comments composer                                                                                                                                                                                                                 | M6 4.4                             | B10                   |
| `features/Assistant/assistant.story.ts`, `assistant.test.ts`; `testing/assistant.fake.ts` | **PM6.** tokens, Stop mid-stream, a truncated body, a reload while asking                                                                                                                                                                                                                                                                          | 2.10.9                             | B10                   |
| `features/Tickets/desk.story.ts`                                                          | app Stories across actors: a save that repairs the queue, assignment and the open count, revoked mid-save, a write that outlives the screen (`dispose` then `ensure`), `Story.inspection` lanes; PM6: a pushed rename                                                                                                                              | rules 27–30, 44; 2.10.6–2.10.8     | B12 (one Story PM6)   |
| `features/Tickets/desk.test.tsx`                                                          | one line per app Story, plus the `StoryFrame` render test (the panel at the saving step)                                                                                                                                                                                                                                                           | 2.10.13                            | B12                   |

**Dropped.** `technicianUpdates`: presence is now the state-feed example, and two state feeds teach nothing more. The
editor's `model()` exploration: `model` is removed (T1, C82) and replaced by a property in `desk.property.test.ts`.
`uncertain: Attempt` in editor memory: the lane holds the Attempt (rule 21), and views read
`O.save.get(s, key).uncertain`. `editor.tabs.test.ts`, `testing/fixtures.ts` and `ticket.operations.ts`, as listed
above.

## 2. New features

Each feature is listed with its spec, then its files. Specs are user-visible behaviour first, then the design pieces
they exercise.

**F1. Named operations everywhere.** Every definition and fragment declares its server work once, under
`operations: ({ E }) => ({ … })`. The names are `ticket`, `save`, `list`, `open`, `assign`, `post`, `thread`, `put`,
`changes`, `activity`, `viewers` and `suggest`. The machine uses the contract's verb (`commit`, `lookup`, `subscribe`).
Views read `s.operations.<name>` or `X.O.<name>.get(s, k)`. Rules 39–43 and 47. Files: every `*.definition.ts`,
`*.trait.ts` and `*.contracts.ts`.

**F2. Save, lock, and the hold** (editor).

- The title save is `reject`, keyed per ticket, and guarded by `O.save.idle(ticketKey)`, so Save disables through
  `check()`.
- A lock (409) is a **definite failure**. LOCKED backs off from memory (5 s × 2ⁿ, five times), and each retry is a
  **new** Attempt (rule 19).
- A lost answer or a 5xx is **unknown**. The lane is `Held`, and UNSURE re-sends **the same** Attempt every 3 s while
  `O.save.retryable(ticketKey, { times: 3 })` passes. After that, `O.save.cancel` releases it and FAILED says "We
  couldn't confirm your last save". The server dedupes on `attempt.id`.
- Edits typed during a save stay in the draft (ordered `Saved` alternatives).
- Revoking permission mid-save cancels the save; `unknown { Cancelled }` is retained. CLOSED's `Reopen` goes to UNSURE
  while `O.save.idle` denies `Uncertain` (rule 45).
- Files: `ticket.contracts.ts`, `editor.definition.ts`, `editor.machine.ts`, `TicketPanel.tsx`, `editor.story.ts`.

**F3. Keyed lanes** (queue).

- "Assign to me" on several rows at once runs one lane per `[workspaceId, ticketId]`. Each row shows its own
  "Assigning…" (`pending`) or "?" (`uncertain`).
- A keyed reconcile schedule (`keys: ({ operations }) => operations.assign.filter((l) => l.uncertain).map((l) => l.key)`)
  re-sends each held assignment. `retryable({ times: 3 })` sets the budget; then a key-less `O.assign.cancel` in
  `AssignUnsure`'s handler releases it (rule 43).
- A new `AlreadyAssigned` (409) failure toasts and refetches.
- Files: `ticket.contracts.ts`, `queue.definition.ts`, `queue.machine.ts`, `QueueList.tsx`, `queue.story.ts`.

**F4. Writes that outlive the screen** (Runtime-owned lanes).

- The user closes the ticket while a save is held on the wire. The panel unmounts, `retain` expires, and the editor is
  disposed. The Runtime keeps the lane, applies the ending to the store at settlement, and parks the ending for the
  persisted identity.
- Opening the ticket again adopts the ending at the root: `Saved` updates `saved`, and `SaveUnsure` goes to UNSURE.
- The host's `beforeunload` lists `runtime.unsettledWrites()`. Sign-out refuses while it is non-empty, unless the user
  confirms.
- Rules 44 and 53; C43. Files: `editor.machine.ts`, `app/host.ts`, `app/view.tsx`, `desk.story.ts`,
  `tools/inspection.ts`.

**F5. Tickets as an entity domain with predictions.**

- A title save and an assignment predict at once, in every copy (queue row, panel header, counts), as `predicted`.
- They confirm at settlement. A definite failure removes the prediction without repair. An unknown marks the record
  `uncertain` and forces a repair.
- The "open" list and `openCount` repair after an assignment; a rename repairs only lists that read `title` or
  `updatedAt`.
- Memory never copies a record field (rule 26).
- Rules 26–38; 2.8.1–2.8.6. Files: `ticket.domain.ts`, `TicketPanel.tsx`, `QueueList.tsx`, `desk.story.ts`,
  `desk.property.test.ts`.

**F6. Attachment upload trait with progress and cancel** (fragment, `.each`).

- Dropping a file makes a draft `{ ref, name, size }` in editor memory. Its bytes go to `PendingFiles`.
- A copy commits on creation and shows "Sending 40%" from the row's `progress`, then "Waiting for the server…".
  `Cancel` interrupts it; `unknown { Cancelled }` is then released.
- Removing the attachment releases the lane (rule 60).
- After a reload the bytes are gone, so a restored upload ends `FileGone` (a definite failure, from `PendingFiles`)
  and the row offers "Choose the file again".
- Rules 48, 51–54, 57, 60; 2.9.2, 2.9.3. The progress **setter** is PM6 (S5 Q11).
- Files: `attachments-api.ts`, `attachments.contracts.ts`, `upload.trait.ts`, `Attachments.tsx`, `upload.story.ts`,
  `editor.definition.ts` (placement).

**F7. Comments panel on two hosts** (fragment).

- The editor places `comments: Comments` at its root (subject path `[]`).
- The queue's preview drawer places `preview: Comments` with `resetOn: ({ memory }) => memory.previewId ?? ""`. The
  subject path is `[ticketId]`, so a post held for A while the user previews B is parked, and A's next preview adopts
  it ("A, B, A").
- The view mints client ids (2.9.5). A pending post shows as a draft until the thread's refetch holds its id (rule 33).
  `writes` invalidates the thread (rule 36).
- One trait, two hosts, records told apart by `actor` (2.10.12).
- Rules 9, 23, 48–59; 2.9.6. Files: `comments.*`, `CommentsPanel.tsx`, `editor.definition.ts`,
  `queue.definition.ts`, `queue.machine.ts`, `QueueList.tsx`.

**F8. Live queue feed with catch-up** (PM6).

- One `DeskFeed` actor per workspace, persisted.
- `changes` is a `listen` entry. It updates `Ticket` records in place, and every drop or restart refetches the covered
  lists once (M6 3.6).
- `activity` is a fact feed into memory. The cursor is stored by the fact's own turn (S4). `Feed.reconnect` catches up
  from `eventsSince` pages. A history that no longer reaches the cursor gives `missed { why: "Lost" }` and the notice
  "Some activity may be missing".
- An ended session waits in RETRY_WAIT, with a backoff that resets only after a minute live.
- Files: `feed/*`, `desk-socket.ts`, the socket block in `desk.fake.ts`.

**F9. Presence on a ticket** (PM6).

- "Also viewing: dispatcher-2" on the panel and the queue row, from one session per ticket per Runtime.
- `delivers: "state"`; the operation is bare. While not live the list is dimmed from `last`, and a rejoin confirms it.
- Files: `presence-api.ts`, `features/Presence/*`, `testing/presence.fake.ts`.

**F10. Streamed assistant reply** (PM6).

- "Suggest a reply" streams tokens into the panel through `progress` (no turn per token).
- Stop cancels. The partial text is kept, marked incomplete, and the hold is released.
- A stall (20 s), a truncated body or a reload ends `Cut`. "Use as comment" moves the text into the comments
  composer.
- Files: `assistant-api.ts`, `features/Assistant/*`, `testing/assistant.fake.ts`.

**F11. Stories on the new surface.**

- Every Story is `Story.make(subject, { id, fixtures: [DeskClient], world: [...] })`. Steps are `send`, `advance`
  (with `{ next }`), `world`, `expect`, `checkpoint`, `together`, `dispose`, `ensure`, `reload`, `openTab`,
  `enter`, `leave` and `reset`.
- The world is `Desk` (plus the Presence and Assistant fakes, PM6). No ending is injected.
- The old scenarios move as follows:

| Old scenario                       | New Story (batch)                                    | Now driven by                                                                                               |
| ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Save a title                       | `editor/saved` (B6), `desk/save-repairs-queue` (B12) | `Desk.saveTitle` latency; `expect(Desk.saveTitle, [{ via: { attempts: [Story.attempt(Editor.O.save)] } }])` |
| Edit while saving                  | `editor/edit-while-saving` (B6)                      | `world(Desk.saveTitle.hold())`, `send`, `release()`                                                         |
| Autosave                           | `editor/autosave` (B6)                               | `advance`                                                                                                   |
| Escape                             | `editor/escape` (B6)                                 | `send`                                                                                                      |
| Save while locked                  | `editor/locked-out` (B6)                             | `Desk.lock({ ticketId, by, times: "always" })`; `advance("10 minutes")` runs the whole chain                |
| **New:** lost answer, same Attempt | `editor/unsure-resend` (B6)                          | `Desk.saveTitle.drop({ at: "response" })`; three re-sends under one `attempt.id`, one applied               |
| Permission revoked mid-save        | `desk/revoked-mid-save` (B12)                        | `hold`, then a Session send                                                                                 |
| **New:** outlives the screen       | `desk/closed-mid-save` (B12)                         | `hold`, `dispose(Editor42)`, `release`, `ensure(Editor42)`; `Story.inspection` lanes                        |
| Queue search, mine only, paging    | `queue/*` (B7)                                       | the request log replaces `countingTicketApi`                                                                |
| List unavailable                   | `queue/degraded` (B7)                                | `Desk.listOutage({ on: true })`                                                                             |
| Assign to me                       | `queue/assign` (B7), `desk/assign-repairs` (B12)     | held wire, then `release`                                                                                   |
| **New:** keyed assignments         | `queue/assign-many`, `queue/assign-unsure` (B7)      | two holds, one `drop({ at: "response" })`                                                                   |
| Renamed elsewhere                  | `feed/pushed-rename` (B8, PM6)                       | `Desk.renameElsewhere(…)` pushes on the socket endpoint                                                     |
| Lazy editor, SSR and hydration     | `queue/ssr-*` (B12)                                  | `dehydrate` / `hydrate` on one world                                                                        |
| Two tabs, reload mid-save          | `editor/second-tab`, `editor/reload-mid-save` (B12)  | `openTab(…, { from })`, `reload()`, `Fake.storage`                                                          |
| Sign-out                           | `desk/sign-out` (B12)                                | `send`, `dispose(SessionRef, { how: "forget" })`                                                            |
| Model exploration                  | `desk.property.test.ts` (B12)                        | `propertyTest`; the property is "never SAVING with an idle `save` lane"                                     |

## 3. Order of work

**Rules for every batch.** One batch is one commit. A batch writes only the files listed for it; no two batches share a
file. A batch may start once the batches it depends on are committed. Before committing, the batch runs section 4's
commands on its Effect-only files and the formatter on all of its files. Each file states in its header which rules
and sections it demonstrates. A PM6 file also says "Pending merge 6: written against merged/streams/proposal-v2.md
revision 7, S1–S10."

| Batch   | Commit (subject)                                                       | Files                                                                                                                                                                                                                                                                                                                                                       | Depends on                                      | Pending merge 6                                                                                        |
| ------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **B0**  | Dispatch Desk rewrite: Effect-only ports, demo server and HTTP adapter | `tsconfig.effect-only.json`, `features/Tickets/types.ts`, `features/Tickets/ticket-api.ts`, `features/Tickets/feed/desk-socket.ts`, `features/Comments/comments-api.ts`, `features/Attachments/attachments-api.ts`, `features/Presence/presence-api.ts`, `features/Assistant/assistant-api.ts`, `app/desk-server.ts`, `app/demo-api.ts`, `next/http-api.ts` | —                                               | shapes only: `desk-socket.ts`, `presence-api.ts`, `assistant-api.ts` (Effect-only, so they type-check) |
| **B1**  | Ticket contracts and domain                                            | `features/Tickets/ticket.contracts.ts`, `features/Tickets/ticket.domain.ts`; delete `ticket.operations.ts`                                                                                                                                                                                                                                                  | B0                                              | no                                                                                                     |
| **B2**  | Desk fake server and client half                                       | `testing/desk.fake.ts`; delete `testing/fixtures.ts`                                                                                                                                                                                                                                                                                                        | B0                                              | the `socket` endpoint block                                                                            |
| **B3**  | Session and Toasts on Flow memory modifiers                            | `features/Session/session.definition.ts`, `features/Toasts/toasts.definition.ts`                                                                                                                                                                                                                                                                            | —                                               | no                                                                                                     |
| **B4**  | Comments trait                                                         | `features/Comments/comments.contracts.ts`, `comments.trait.ts`, `CommentsPanel.tsx`, `comments.story.ts`, `comments.test.ts`                                                                                                                                                                                                                                | B0, B2                                          | no                                                                                                     |
| **B5**  | Attachment upload trait                                                | `features/Attachments/attachments.contracts.ts`, `upload.trait.ts`, `Attachments.tsx`, `upload.story.ts`, `upload.test.ts`                                                                                                                                                                                                                                  | B0, B2                                          | the `progress(p)` setter line                                                                          |
| **B6**  | Editor on operations, the hold and fragments                           | `features/Tickets/editor/editor.definition.ts`, `editor.machine.ts`, `useEditor.ts`, `TicketPanel.tsx`, `editor.story.ts`, `editor.test.ts`; delete `editor.test.tsx`                                                                                                                                                                                       | B1, B2, B3, B4, B5                              | no                                                                                                     |
| **B7**  | Queue with keyed lanes and a comments preview                          | `features/Tickets/queue/queue.definition.ts`, `queue.machine.ts`, `QueueList.tsx`, `queue.story.ts`, `queue.test.ts`                                                                                                                                                                                                                                        | B1, B2, B3, B4                                  | no                                                                                                     |
| **B8**  | Live desk feed with catch-up                                           | `features/Tickets/feed/feed.contracts.ts`, `feed.domain.ts`, `feed.definition.ts`, `feed.machine.ts`, `feed.ref.ts`, `ActivityLog.tsx`, `feed.story.ts`, `feed.test.ts`                                                                                                                                                                                     | B1, B2                                          | **yes**                                                                                                |
| **B9**  | Presence on a ticket                                                   | `features/Presence/presence.contracts.ts`, `presence.definition.ts`, `presence.machine.ts`, `presence.ref.ts`, `Viewers.tsx`, `presence.story.ts`, `presence.test.ts`, `testing/presence.fake.ts`                                                                                                                                                           | B0                                              | **yes**                                                                                                |
| **B10** | Streamed assistant reply                                               | `features/Assistant/assistant.contracts.ts`, `assistant.definition.ts`, `assistant.machine.ts`, `assistant.ref.ts`, `AssistantPanel.tsx`, `assistant.story.ts`, `assistant.test.ts`, `testing/assistant.fake.ts`                                                                                                                                            | B0, B4 (it sends into `Comments`' public event) | **yes**                                                                                                |
| **B11** | App, host and Next wiring                                              | `app/app.ts`, `app/setup.ts`, `app/host.ts`, `app/persistence.ts`, `app/view.tsx`, `next/browser-setup.ts`, `next/server-setup.ts`, `flow.config.ts`                                                                                                                                                                                                        | B3, B6, B7, B8, B9, B10                         | partly: it registers the B8–B10 machines and composes their views                                      |
| **B12** | App Stories, property test and tools                                   | `features/Tickets/desk.story.ts`, `desk.test.tsx`, `features/Tickets/editor/editor.tabs.story.ts`, `features/Tickets/queue/queue.ssr.story.ts`, `queue.ssr.test.ts`, `testing/desk.property.test.ts`, `tools/cli.ts`, `tools/diagnostics.ts`, `tools/inspection.ts`; delete `editor.tabs.test.ts`, `testing/tickets.property.test.ts`                       | B11                                             | partly: `desk/pushed-rename`, and sessions in `inspection.ts`                                          |
| **B13** | README for the rewritten desk                                          | `README.md`                                                                                                                                                                                                                                                                                                                                                 | B12                                             | the PM6 sections are marked                                                                            |

**Parallel waves.**

1. B0 and B3.
2. B1 and B2, then B9.
3. B4, B5 and B8.
4. B6, B7 and B10.
5. B11.
6. B12.
7. B13.

The stream batches (B8–B10) are written now against M6 revision 7. If merge 6 changes a word, only those batches and
the marked lines in B0, B2, B5, B11 and B12 are revisited.

**Agent briefs.** Batches B1–B10 are writing real code against a proposal, so they are Sonnet work (AGENTS.md). Each
brief gives the batch's rows from sections 1–3, the MD sections cited for its files, and the instruction to flag
anything faked rather than invent API. B13 also goes to Sonnet. The design questions in section 6 go to the owner
before B4, B5, B6 and B7 start.

## 4. Type-checking today

Only files that import nothing but `effect` (and plain TypeScript) can be checked; the library does not exist. After
the rewrite these are:

- `features/Tickets/types.ts`, `features/Tickets/ticket-api.ts` and `features/Tickets/feed/desk-socket.ts`;
- `features/Comments/comments-api.ts`, `features/Attachments/attachments-api.ts`,
  `features/Presence/presence-api.ts` and `features/Assistant/assistant-api.ts`;
- `app/desk-server.ts`, `app/demo-api.ts` and `next/http-api.ts`.

Everything that imports `flow-state`, `flow-state/react`, `flow-state/testing`, `flow-state/server` or `next` (not
installed), or `server-only`, stays illustrative.

**How.** B0 adds `tsconfig.effect-only.json` beside the README. It extends the repo's `tsconfig.base.json` (Effect
language service plugin off, `noEmit`) and includes exactly the files above. Using the pinned toolchain from the repo
root:

```sh
nubx tsc -p workflow/plans/flow/references/dispatch-desk/tsconfig.effect-only.json           # types (tsc 7.0.2, effect 4.0.5)
nubx vp fmt workflow/plans/flow/references/dispatch-desk --check                              # format (every file, not only Effect-only ones)
nubx vp lint <the Effect-only files>                                                          # lint; other files fail on unresolved flow-state imports
```

`nub run check`, `nub run test` and `nub run verify` do not cover this folder. `check` and `lint` are scoped to
`packages/flow-state-rewrite`, and the test include is `packages/**/*.test.ts`. So passing them proves nothing about
the desk, and no batch may claim it does.

**Checked while writing this plan** (a scratch tsconfig with the same options): today's `types.ts`, `ticket-api.ts` and
`demo-api.ts` pass. Today's `next/http-api.ts` **fails** with TS2379 at line 35 (`body: string | undefined` against
`RequestInit` under `exactOptionalPropertyTypes`). B0 fixes it. `vp fmt --check` and `vp lint` pass on `types.ts` and
`demo-api.ts`.

## 5. README rewrite outline (B13)

1. **What it is.** One paragraph: the desk, what is new (named operations, the hold, keyed lanes, Runtime-owned writes,
   two fragments, three streams, the ticket domain, Stories on fakes). Status: illustrative; the Effect-only list
   type-checks (section 4's command).
2. **Start here.** In reading order:
   1. `ticket.contracts.ts`: where data comes from.
   2. `ticket.domain.ts`.
   3. `editor.definition.ts` and `editor.machine.ts`.
   4. `comments.trait.ts`, `upload.trait.ts`.
   5. `queue.machine.ts`.
   6. `feed/*` (PM6).
   7. `editor.story.ts`, `desk.story.ts`.
3. **Where the data comes from.** One table from `fetch`, `WebSocket`, `XMLHttpRequest` progress and the streamed body
   to port, contract, operation, event, memory, row or record (MD 2.7.2, 2.9.1, M6 2.6).
4. **Structure.** The folder table, with Comments, Attachments, Presence, Assistant and `Tickets/feed` added.
5. **Where each design rule shows.** One table, design section and rules → files, replacing the old plan-by-plan table.
   Group the rows: operations (39–47), write lane and hold (13–25, N1–N3), entities (26–38), fragments (48–60),
   Stories (61–66), and streams (M6, marked pending merge 6).
6. **Scenarios.** Section 2's scenario table: Story id → what it exercises → what drives it.
7. **What writing it found.** Kept rows that still hold, plus the new findings (section 6 of this plan, as answered).
8. **Host assumptions.** The auth stub, HTTP and socket routes, `PendingFiles`, `beforeunload`, and that SSR releases
   stream sessions.
9. **Conventions.** The old table, with `*.contracts.ts` (not `*.operations.ts`), `*.trait.ts`, `*.fake.ts`, and "one
   line per Story" tests.
10. **Pending merge 6.** Every PM6 file and line, so they can be found in one place.

## 6. Hard to demonstrate (proposed questions for the owner)

1. **Paging.** MD lists only `refetch(k?)` as the member of a live read (2.7.3's table). The old queue's `.more`,
   `hasMore` and `pagedBy` come from Operations O6/O7 and are not restated. Proposed: keep them as the plan's, marked
   "not in MD".
2. **A `File` in a persisted actor.** An upload's input needs the bytes, but the editor is persisted, and memory must
   decode on restore. Proposed: memory holds `{ ref, name, size }`, and the commit reads the bytes from a
   `PendingFiles` service. After a reload that is a definite `FileGone`.
3. **Rule 56 under `resetOn` with a `clientId`-keyed write.** The documented default is to guard the transition that
   changes the reset value with `Fragment.O.x.idle` for the current subject. No key names "this subject's posts". A
   guard over `s.operations.preview.post` is not a token, so the structural warning stays. Proposed: accept the warning
   and show it in `flow check`'s example.
4. **A hold whose ending arrives while CLOSED.** Rule 45 needs a path from every arrival to `retry` or `cancel`.
   Proposed: CLOSED's `Reopen` has two alternatives, `[O.save.idle] → OPEN` and else `→ OPEN.UNSURE`. After a
   permission revoke, the retry the user then makes may come back as `StillUnknown` (403), and the editor must say so.
5. **`listen` keeps no position across sessions** (M6 2.7). Every reload or feed restart refetches the covered lists
   once. Catch-up through `catchUp` works only within a session. The cross-session resume (S4) therefore needs the
   separate `activity` fact feed: two channels over one socket service.
6. **One fake must own HTTP truth and the socket.** A rename elsewhere must change `Desk` truth and push on its socket,
   so `desk.fake.ts` mixes merged code and a PM6 block. Fakes cannot share truth across servers.
7. **The progress setter is merge 6.** The row's `progress` field is merged (OD18, rule 21), but `progress(p)` in the
   commit context is S5 Q11. So the upload trait cannot be fully merged-only.
8. **App Stories need the whole app.** `DeskSetup` imports every machine, so cross-actor Stories wait for B11. Feature
   batches use machine and fragment Stories with `context` supplied. What a machine Story does with the editor's
   `send(ToastsRef, …)` when no Toasts actor exists is not specified. Whether `StoryFrame` accepts a machine Story is
   also open (2.10.13 rules out only fragments).
9. **A send into another actor's fragment.** "Use as comment" sends into the editor's `comments` instance from another
   actor and a view. The public-event path is `Editor.E.comments.…` (rule 2), but sending to a ref plus an instance path
   is not shown in MD.
10. **Exploration.** With `model()` gone (T1), a property with shrinking finds a short counterexample, not the shortest
    path. The old shortest-path test has no equivalent.
