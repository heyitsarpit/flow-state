# Desk trial of proposal-v3 streams: results

Paper test of [proposal-v3.md](../../proposal-v3.md) against the desk's `Tickets/feed`, `Presence` and `Assistant`, with their fakes,
Stories and tests, in the forms of [stories-amended.md](../../../merged/story-checks/stories-amended.md) and [fakes-v2.md](../../../merged/story-checks/fakes-v2.md).
Nothing outside `trials/desk/` was edited. Every claim is **proposed** until the owner reads it; nothing here is decided.

**What ran.** `node_modules/.bin/tsc -p trials/desk/tsconfig.json` passes clean under `tsconfig.base.json`'s flags, with real Effect
4.0.5 and two stand-ins I wrote from the spec (`standin/flow-state.ts`, `standin/testing.ts`, plus three tiny stubs). No `any` and no
explicit generics in `features/` or `testing/` (the one `Schema.TaggedError<Stalled>()` is Schema's own, in an unchanged file).
Nothing executed: no Flow, no Story, no browser. `checks/negative.ts` tries 11 of the spec's "compile error" claims against the
stand-in, and all fire. That proves the stand-in matches the spec's words, not that Flow can type it. Formatted with `oxfmt` defaults;
`oxlint` not run. Imports of unchanged desk files go through an `@desk/*` alias, so the Stories do not run with the desk.

## 1. Line counts, before to after

"Code" leaves out blank and comment-only lines. After the formatter, 100 columns, as the desk is.

| File | Total | Code |
| --- | --- | --- |
| feed.contracts.ts | 158 to 120 | 114 to 101 |
| feed.definition.ts | 68 to 40 | 58 to 34 |
| feed.machine.ts | 93 to 46 | 77 to 39 |
| feed.story.ts | 92 to 76 | 54 to 52 |
| feed.test.ts | 96 to 103 | 79 to 77 |
| desk.socket.fake.ts | 169 to 171 | 113 to 133 (about 100 once the trial's stand-in `Desk` and the one `renameElsewhere` control it added are taken out) |
| presence.contracts.ts | 148 to 148 | 112 to 126 |
| presence.definition.ts | 64 to 49 | 52 to 44 |
| presence.machine.ts | 53 to 49 | 45 to 45 |
| presence.story.ts / presence.test.ts | 60 to 56 / 60 to 65 | 39 to 39 / 53 to 53 |
| presence.fake.ts | 213 to 210 | 171 to 174 |
| assistant.contracts / definition / machine | 66 / 52 / 72, unchanged | 44 / 43 / 59, unchanged |
| assistant.story.ts / assistant.test.ts | 84 to 76 / 82 to 92 | 54 to 53 / 70 to 71 |
| assistant.fake.ts | 100 to 101 | 77 to 79 |

Unchanged and not copied: `desk-socket.ts`, `ActivityLog.tsx`, `collab-sdk.ts`, `viewer-badge.trait.ts`, `assistant-api.ts`,
`Viewers.tsx`, `AssistantPanel.tsx`. `feed.domain.ts` is copied, and differs only in one import path.

**By feature (code lines, five feature files):** feed 382 to 303 (minus 21 percent); Presence 301 to 307; Assistant 270 to 270.
The saving is all in the positioned feed with catch-up and its machine. Presence and Assistant do not get shorter.
**Outside the files I wrote:** `desk.fake.ts` must change at about 11 call sites (see 3.5). The estimate is +22 lines.

## 2. What got simpler

1. **Feed memory and machine.** `cursor`, `reopenInMs`, `Healthy`, `slower`, `bothLive`, `schedules.healthy` and the three-field
   `MayHaveMissed` (`why`, `restartAt`, `initial`) are gone. The two-branch guard that read `initial` is one line. The machine falls from
   77 to 39 code lines, and `Healthy` leaves the 6 internal events.
2. **`failure` maps.** Feed: 2 maps of 6 entries each, now 2 of 2 (`SignedOut`, `Feed`). Presence: 2 maps of 5 constant entries, now 2
   of 2, and the `broke(reason)` factory is one mapper (`reason: e._tag.toLowerCase()`).
3. **`catchUp`.** The `AbortController` and `acquireUseRelease` go (`signal` is in the context), and so do `Option` and the
   `Stream.paginate` tuple. `Feed.gone`, `Feed.more` and `Feed.done` say what a page means where the old code returned a tuple or failed.
4. **Fakes.** The 14-line `route` regex is a 6-line route table, and params arrive typed (`params.workspaceId` is a `string`).
   The `text()` helper goes with the `frame` codec. The fake's client half loses the 45 s `timeoutOrElse` and the `NoHello`
   check, because both move to the contract; `next/http-api.ts` loses the same two pieces (not touched). Controls return objects
   instead of `[truth, { to, send }]` tuples. Presence's fake drops `Schema.Unknown` and both `as` casts for a real frame Schema.
   `hold({ after })` was a "design gap" in three files and is now spelled.
5. **Retry glue.** The feed's backoff, deadline-in-memory and reset are Flow's now; `RETRY_WAIT` shrinks to one `schedules` line.
6. **Streaming write.** `assistant.contracts.ts`, `.definition.ts` and `.machine.ts` are the desk's files with two import paths
   changed. They type-check against the stand-in's `transaction` and `progress`. Tokens stay a streaming **write**, not a stream:
   Stop, Regenerate (`cancel`), the idempotency key and `unknown` endings are write words the stream API has none of. v3 never
   touches it, and that holds.

## 3. What could not be written, or needed a guess

1. **`activity` is a from-now feed with no head.** The wire's `hello` carries no head, so `catchUp` must start with
   `if (after === undefined) return Feed.done([])`, and the `Feed.live({ at })` of section 3 Q2 cannot be written. Result per the spec:
   `{ at: undefined }`, and one notice per reconnect until the first entry. That matches the old behaviour (a reconnect with no
   cursor also noticed), but the spec's own precondition is broken, and the first-window loss it describes applies to the desk's
   log. The fix is a protocol change (`hello.head`), which is not mine to make.
2. **`fills` cannot be checked.** The spec shows `fills: "activity"` inside `outcomes`, and `outcomes` is not told the memory, so the
   stand-in types it `string | false`. `checks/negative.ts` shows a wrong name compiles. Only the run-time `FillsUntouched` finds it.
   Nothing in section 4 says how the name is tied to the memory type.
3. **`ticketChanges` and `activity` cannot share the frame helper.** `Feed.live({ restartAt })` carries the position type, so a feed with no
   position cannot emit it. The old `toItems<A>` was one function with a generic. Now two switches (about +12 lines), and each returns
   a mixed array that needs an annotation naming `Feed.Signal<P>`. The spec says `Feed.Signal` "stays exported" without giving its arity;
   I guessed one parameter.
4. **Hoisted mappers need an annotation.** `const gaveUp = E.Ended.from((e) => ...)` leaves `e` unknown outside `outcomes`. Presence
   annotates `(e: CollabFailed)`. Inline use infers.
5. **`pushes` is gone, and it is not free.** Every desk handler that appends to the log must now say `send: pushed(truth, next)`: saveTitle, assign, assignBatch,
   closeMany, postComment, createTicket, and the controls renameElsewhere, changeElsewhere, removeElsewhere, commentsElsewhere
   (about 11). Each is today a one-liner (`step(truth, Server.assign(...))`) and becomes 3 to 4 lines with a `before` kept. All of
   `desk.fake.ts` (33 `call` and `control`) also moves from tuples to `{ truth, response }` (W14), which this trial did not touch.
   A wrapper helper would bring that to one line per site, but no spec word gives it. I wrote `pushed` and converted `renameElsewhere`.
6. **Inline frames widen.** `open: () => ({ frames: [{ t: "status", ... }] })` types `t` as `string` in the stand-in, so the fake annotates
   `ReadonlyArray<typeof Frame.Type>`. This may be a stand-in artifact (inference through `Fake.stream`'s type parameters), and the
   spec does not say. `send` lists do not have the problem.
7. **NDJSON has no codec.** The model's body is JSON lines, and `frame` is "Schema.String for raw". Frames lose their type in the Assistant's
   fake, and `end: true` must be written or the body never ends (the old fake ended implicitly). Easy to forget.
8. **`Fake.fetch` still does not reach the desk's adapter.** `next/http-api.ts` calls the global `fetch` (line 86), not `FetchHttpClient.Fetch`, so the
   Assistant keeps a hand-written client half over `server.suggest(...)` (22 lines). Only the socket's `Socket.WebSocketConstructor`
   is a real seam, and the fake still copies the socket adapter to reach it.
9. **`O.x.commit(select)`'s `event` has no stated type.** The desk reads `event.prompt` and `event.memberId` there. The stand-in loosens it
   to an index type (the one `any`, in the stand-in).
10. **Row shapes for writes and `session` records are guessed.** `cp.operations.suggest` as a lane list, `cp.lane(O.ping, key)`, and the
    `session` record's `{ answer: "proven", basis }` are carried from the old tests. v3 does not define them.
11. **Automatic re-open (a guess).** The old machine re-opened after a session ended, with a delay that doubled per ended session, was
    kept in memory (a reload kept the deadline) and was reset by `Healthy`. v3 ends a session only on `Flapping` or a defect, and its
    recipe is a `Retry` event. I kept a fixed `RETRY_WAIT` of 30 s so the feed still reopens by itself. That wait is mine.

## 4. Behaviour that changed

| Old | New | Requirement lost? |
| --- | --- | --- |
| A first frame that is not `hello` or `reset` fails the connection (`NoHello`) and retries | A ping before any greeting re-arms `idle`; the row stays `Connecting` with a `PingsWithoutLive` record, forever | **Yes.** A server that pings and never greets hangs the row; nothing retries it |
| 8 tries then the session ends; offline ends it in minutes | Offline retries every 30 s for ever, free; 8 quick registered-then-dead connections end it `Flapping` | Intended by Q5. The UI used to learn of an outage by the session ending; now it must read `connection` |
| Backoff doubles per ended session, deadline persisted, reset after a healthy minute | A fixed 30 s (my guess) | **Yes.** Escalation and the persisted deadline |
| `Feed.live({ lost: "log reset", restartAt })` on a feed with no position (`ticketChanges`) | Plain `Feed.live()`: `listen` refetches whatever a start cannot prove | Unverified: relies on v2 3.6 |
| `bufferSize: 256` (a Story overran it with 400 messages) | Fixed 1,024; the burst is 3,000 | **Yes.** An author's own bound |
| Reload while asking: server log `code: 1001` | `code: 1000, by: "client"`; 1001 is not spelled | Yes, in tests only |
| `Feed.down(new CollabDown(...))` | `Feed.down({ reason })`, same `drop.reason` | No |
| Presence's channel `first` flag, the proof rule | Kept verbatim in `wire` | No |

Same, by test: `activity` order and dedupe, `missed Lost` before the kept entry (`gone`), reset notice, `SignedOut` to `SIGNED_OUT`,
the SDK's `resumed` proof, one attach, the back-pressure burst.

## 5. Story words missing

1. **A read of the bookmark.** Five old assertions read `memory.cursor`. v3 says the bookmark is in `session` records and Inspection only,
   but no read is spelled. `feed.test.ts` kept one as a request log (`eventsSince` `after`), weakened one to an entry count, and dropped
   three ("does not move backwards", the cursor after a catch-up, the cursor after a reload). Needs something like `cp.bookmark(O.activity, key)`.
2. **A `fills` / `held` read,** to test "stays cleared".
3. **No Story for `Flapping` or `idle`.** The old code had none to convert. Writing one needs 8 drop-and-advance cycles in a chain;
   there is no loop word, and the builder is typed by checkpoint names.
4. **`session` record shape,** as 3.10.
5. **`test` is not in the repo's `vite-plus/test` shim** (it exports `it`); the tests import `it as test`.
6. Spelled and used, and they fit: `Story.app`/`machine`, camelCase checkpoints, `hold({ after })`, `release`, `records`, `lane`, `inspection`,
   `read(endpoint)`, `advance({ next })`, `reload`.

## 6. Files

`standin/` (types only, mine), `features/Tickets/feed/`, `features/Presence/`, `features/Assistant/`, `testing/{desk.socket,presence,assistant}.fake.ts`,
`checks/negative.ts`, `tsconfig.json`. `feed.ref.ts` has its comment trimmed; `assistant.{contracts,definition,machine,ref}.ts` are the
desk's, with import paths changed.
