# Proposal: streams (merge 6)

Status: **revision 1 accepted by the owner on 2026-10-30, with the decisions in section 10. Revision 2 (2026-10-31)
answers [review 1](reviews/review-1.md) and is proposed, not accepted**: section 0 names the root causes behind the
review's findings, and the design changes they force are marked `Revision 2` in the text. Two of them supersede parts
of accepted decisions; both are recorded in section 10 as proposals (M6-D8, M6-D9) and change nothing until the owner
accepts them. [reviews/review-1-response.md](reviews/review-1-response.md) maps every finding to its cause and its
resolution. Designed from the sources in [gaps.md](gaps.md). Builds on the merged design (machine-design.md, rules
1–25) and on the accepted entity proposal (merge 4, rules 26–38). Nothing here edits a `.plan` file; section 6 lists the
amendments. All syntax is a working draft.

**Marks in code** (AGENTS.md, "Showing designs"): `// NEW` is added by this proposal, `// NEW (r2)` by revision 2,
`// NEW MEANING` is an existing word whose meaning changes, `// existing` is unchanged design, `// user-defined` is the
author's own name. A line with no mark is ordinary Effect or TypeScript.

**Revision (multiplicity audit, 2026-10-31).** [audit-multiplicity.md](../audit-multiplicity.md) changed four things,
each marked with these words: a streaming write's progress is read from the snapshot's lane row and exists only where a
lane has one addressable Attempt (rule 48, M6-D5); the upload walk is `reject` per upload (7.5); two sessions of one
`listen` entry are stated and warned (rule 49, M6-D6); a keyed activity's sessions meet rule 47 (M6-D7).

Short names for citations (all under `workflow/plans/flow/`):

| Short name | File |
| --- | --- |
| GAPS | `references/explorations/machine-fragments/merge-6-streams/gaps.md` |
| R1 | `references/explorations/machine-fragments/merge-6-streams/reviews/review-1.md` |
| OPS | `Operations.plan` |
| MCH | `Machines.plan` |
| MD | `references/explorations/machine-fragments/machine-design.md` |
| M3 | `references/explorations/machine-fragments/merge-3-stories/proposal.md` (being revised, not accepted) |
| M4 | `references/explorations/machine-fragments/merged/entities.md` (accepted) |
| OID | `references/explorations/machine-fragments/merged/operations/proposal.md` (merged into the design 2026-10-30) |
| EDP | `EntityDomains.plan` |
| ED | `references/design/entity-domain.md` |
| PER | `Persistence.plan` |
| RT | `Runtime.plan` |
| TST | `Testing.plan` |
| INS | `Inspection.plan` |
| MT | `references/design/multi-tab.md` |
| SE | `references/design/sync-engine-adapter.md` |
| DD | `references/dispatch-desk/` |
| EFX | `node_modules/effect/src/` (Effect 4.0.5, the installed package) |

"Flow" means Flow's own runtime: nothing in Flow reads an HTTP status, a close code or an author error type
(MD:775-776). "The adapter" is the author's `subscribe` (or `commit`) and the Effect services it calls.

## 0. Root causes (revision 2)

Review 1 found 7 high and 14 medium problems. They come from seven causes. Each row names the cause, the findings it
explains, and the one decision that removes it. The rest of the document applies these decisions.

| # | Root cause | Findings it explains (R1) | The decision that removes it |
| --- | --- | --- | --- |
| C1 | **A connection was never a unit.** Flow inferred "open" from data and had no grammar for what one connection is, so a quiet connection never opened, a second `open` meant nothing, and a buffer could evict a signal. | H1 quiet reconnect never opens; signal semantics (`open` while open, the first signal of a connection, `Opened` vs `Reconnected`); H6 a sliding queue evicting `down` | **A session is a sequence of connections, and each connection starts with exactly one claim.** The claim (`open`, `resumed` or `gap`) is made when the transport opens, not when data arrives. `Session.reconnect`'s `connect` now returns the opened connection with its claim, so a quiet connection still opens (4.1.2, 4.1.3, rule 40) |
| C2 | **Liveness and freshness were one field.** `connection: "Open"` with `data` read as "this is the current value". After a reconnect it was not. | H2 `latest` data looks fresh when it isn't; the quiet-feed staleness recipe; the restored lane's age; values while down | **The lane is typed by freshness.** `data` exists only while the lane is `Live`. A `latest` lane is `Live` only after a value has arrived on the current connection; otherwise it holds `lastKnown`. An `every` lane has no data at all, because its facts live in memory or the store (4.1.5) |
| C3 | **A continuity claim was not defined against a position or a kind.** "Resumed" did not say "from where" or "for which kind", so a snapshot counted as a resumption. | H3 continuity claimed too generously (silent re-opens; "a full snapshot counts as resumed" on `every`); the SSE proof; `Last-Event-ID` | **`resumed` means one thing:** every fact after the position this connection was opened from will come, in order, before anything newer. On `every`, a snapshot is a `gap`. On `latest`, claims carry no continuity at all. An in-band server answer is the only proof (4.1.4, rule 41) |
| C4 | **The resume position had no defined meaning.** "The position it has handled" was read as "the highest seen". | H4 the chat recipe loses messages: highest-seen as the cursor, a failed catch-up forgotten, a server reset below `lastSeq` | **The resume parameter is a watermark:** the consumer holds every fact at or before it. A gap is an obligation that only a successful catch-up discharges. Positions are scoped by the source's epoch (rule 45, 4.3.2) |
| C5 | **The lifecycle edges had no stated meaning.** Rules were written for a live session of one kind, so end, release, restore, supersede and cancel each fell through. | H5 persistence suppresses equal values on `every`; a `listen` that ends or sits down leaves answers fresh; a clean server close ends a feed; progress wiped by a superseded Attempt; rule 8 and the mailbox cap; the release/restart race; `Stream.timeout` ending silently; retry after Stop under `reject` | **One table gives every edge its meaning at each layer** (4.5). Every rule that differs by kind says which kind it is for |
| C6 | **The push boundary and the clock were each adapter's private business.** Each adapter re-implemented buffering, overflow and timing, and a Story could only replace the whole adapter. | H6 per-adapter buffers and overflow; `Stream.callback`'s unbounded default; untestable fakes; adapters using `Date.now`; Stories missing controls for most sequences | **Flow owns the push boundary:** `Session.push(register, { capacity })`, which is bounded, turns loss into a gap and never evicts a signal. **Adapters are written over a structural transport service** (Effect's `Socket.WebSocketConstructor`, or the author's subset of an SDK), and Stories fake that service. **Adapter time is Effect's `Clock`** (4.1.6, 7.0, rule 52) |
| C7 | **Data flowed only inward.** Nothing modelled state the client keeps on the server while a session lives. | H7 outbound ephemeral sends (a cursor at 30 Hz) | **`publish`: latest-wins state an activity carries on its session**, re-sent on every connection, with no Attempt and no ending (4.1.9, open question R2.1) |

Two findings were errors in examples, not causes: `Schedule.both` does not exist in Effect 4.0.5 (`Schedule.max` does,
EFX `Schedule.ts:856`), and the retry budget's reset was unstated. Both are fixed in 4.1.3.

**What revision 2 keeps:** the four signals, `delivers`, the three layers, `progress` on writes, `listen`'s consistency
with merges 4 and 5, Flow keeping no cursor, and the four SDK adapters (now rewritten over `Session.push` and
`Session.reconnect`). Section 11 lists what changes if OID moves declarations onto the definition.

## 1. The problem

Streams have had no design round. Operations O4 (OPS:119-134) and the stream half of O6 (OPS:166-169) predate the
server-call design, and GAPS lists thirteen gaps. In short:

- **What a value means depends on the machine** (G1). Mapping `value` changes delivery from "may skip, equal values
  silent" to "every value, pulled after each turn" (OPS:126-130). A notification feed loses its second equal "sync
  now"; whether a `listen` push can be skipped is unspecified.
- **Nothing says what was missed or how a feed resumes** (G2, G5). A re-opened session loses what the source said
  meanwhile, and nothing records it. Parameters are fixed at start (OPS:120-121); a terminal session restarts only on
  re-entry and its lane then is unstated (OPS:131-133). "Reconnect" in EntityDomains means the browser's connection
  restored (EDP:82, OPS:59-62), not a stream re-opening, so a `listen` answer can stay stale with a fresh frontier.
- **No connection status** (G3): a lane is `Running` from open to end (OPS:166-168). The sync-engine adapter already
  puts status inside the value to work around it (SE:182-185, SE:420-421).
- **Endings predate merge 2** (G4): mappers get values only (OPS:70), `defect` and `interrupt` are separate keys
  (MCH:139-140), deliveries have no place in the FIFO list (P21, MD:2130), and a duplicate session leaves the lane
  undefined with the activity waiting (OPS:122-124), the silent decline D5 rejected (MD:2396-2401).
- **Nobody owns classification or reconnect** (G6). Rule 25 says Flow retries nothing (MD:609-610), but not what that
  means for a stream; the browser hides almost every reason (GAPS, "The sources").
- **Ownership is one clause** (G7): "facts from an ended activation are discarded by design" (RT:88-90).
- **Backpressure is deferred** (G8, OPS:204), yet `fetch` bodies have it and WebSockets do not.
- **Writes that stream** (G9) are deferred (MD:2242): a transaction reports nothing before its ending.
- **`listen` ordering, duplicates and the first-live race** (G10, ED:568-569, ED:691-692).
- **Persistence and tabs** (G11): a restored lane has no idea how stale it is; a handover opens "a fresh generation"
  (PER:96-98, PER:32-33, MT:334).
- **Stories cannot drive a feed** (G12) without merge 3's fixture controls (M3:422-427, M3:450-457).
- **Nothing is checked** (G13, INS:28-29, INS:86-88).

### 1.1 Where gaps.md is wrong or imprecise

Each citation was re-read. All but these hold:

- **G12's M3 citation** (M3:938-941) points at the end of M3's "Added" table. Fixture controls are M3:422-427 and
  M3:450-457, decided as Q24 (M3:1275-1279).
- **G3's SE:67** for "status can recover from `error` to `ready`" is SE:66; SE:67 is the `truncate` event.
- **G1's "a `listen` stream is not exempt from skipping"** overstates the text: OPS:126-127 defers domain listeners to
  EDP O1, which says nothing about delivery. It is unspecified, not stated.
- **G4's "there is no `Flow.uncertain`"** is not a gap. A stream is a read, and reads keep two channels because a
  read changes nothing (MD:877-878, C5 MD:2140, rule 37 M4:622-623). Streams need an honest answer about *what was
  missed*, not an unknown channel (section 4.1.4).
- **G8 is half answered already.** With `value` mapped, OPS:127-128 pulls the adapter's Stream only after each turn,
  which is backpressure into the adapter. The gap is upstream of that (push sources) and the unmapped case.
- **DD's polling citation** (`next/http-api.ts:173-185`) covers only half of `technicianUpdates`; the two polling
  adapters are `next/http-api.ts:151-194`. GAPS misses two facts there: both turn every failure into a defect
  (`Effect.orDie`, `next/http-api.ts:160`, `:164`, `:182`, `:186`), so one dropped poll is a terminal `Defect` lane
  and an issue; and every new session starts at cursor `"0"` (`next/http-api.ts:150`), replaying everything.

## 2. Where the data comes from

The browser gives every source the same shape: **a session that delivers a sequence of messages over one or more
transport connections, each of which may break.** What differs is who reconnects, whether anything proves continuity,
and whether reading pushes back. For each source, what Flow must model and what belongs to the adapter:

| Source | Flow models | The adapter (an Effect service and the `subscribe` that calls it) owns |
| --- | --- | --- |
| **WebSocket** | the session's life (owned by an activity); delivery into the actor; the connection status the adapter reports; the continuity claim at each open; the session's ending | `new WebSocket`, auth (cookie, URL token, first message), heartbeats and the half-open check, reading close codes into its own errors (`SignedOut` from 4401, `Dropped { code }` from 1006), reconnecting with its own backoff, the resume message. Revision 2: written over the `Socket.WebSocketConstructor` transport service, so a Story can fake the socket (4.1.6) |
| **SSE** | the same | `EventSource`; its built-in reconnect is the adapter's reconnect: `readyState` CONNECTING is "down", a later message is "open"; whether the server honoured `Last-Event-ID` (an app event says so) |
| **`fetch` body** (feed) | the same; pull-based reading keeps the TCP window honest | the terminator (`[DONE]`, a final frame, a length) that tells completion from a clean cut; the status and headers |
| **`fetch` body** (a write: LLM answer) | the transaction's Attempt and its three endings (2.7.1); **progress** before the ending (4.1.10) | the same terminator; that a cut answer is `unknown` |
| **Upload progress** (XHR) | progress before the ending; the ending | `xhr.upload.onprogress` into progress; `load`/`error`/`abort` into `Outcome` |
| **Polling with a cursor** | the same as a WebSocket | the loop, the cursor, the delay; that a failed GET is "down", not a defect |
| **Sync engine** | the same; its recoverable `error` is "down" | everything else: the engine owns log replay, offline catch-up and completeness (SE) |
| **`BroadcastChannel`** | the same | nothing more: no failure, no reconnect |

What follows from the table:

- **Reconnecting is the adapter's, inside one session.** SSE reconnects by itself, sync engines recover from `error`,
  and only the adapter sees close codes. So a Flow session spans transport connections, and the adapter *reports*
  each drop and each re-open. This is merge 2's split for sends: a retry inside one send is the adapter's
  (`Effect.retry` in the commit, MD:921; a transport deadline inside the commit, MD:1116); a retry that needs a
  decision is the machine's states and schedules (2.7.6). For streams, a session that ends with a failure is the
  machine's decision.
- **Continuity is a claim only the adapter can make, and its honest default is "unproven".** GAPS's three answers
  (continuous, broken, don't know) map to: the adapter proved it (`resumed`), the adapter knows it lost something
  (`gap`), and every other open.
- **The meaning of a value is the source's.** A chat message is a fact that must be delivered; a price is the current
  state, and only the newest matters. That is a property of the data, so it is declared on the descriptor, not chosen
  by whichever machine maps it.

## 3. What carries over

Each server-call and entity concept, judged from the design text.

### 3.1 From server calls (MD 2.7, rules 13–25)

| Concept | Verdict | How or why |
| --- | --- | --- |
| Three channels: success, failure, unknown (2.7.1) | **adapted** for sessions; **as is** for writes that stream | A session is a read: it ends `complete` or `failure`, as reads do (MD:877-878, C5). A streaming write keeps all three channels. The question "what did I miss?" gets its own three answers (4.1.4), which describe the data, not the server's state |
| `Outcome` in the commit (2.7.1) | **adapted** | `Session` is the subscribe function's vocabulary: plain elements are values (as a plain `return` is success), and `Session.open / down / resumed / gap` are signals (4.1.2) |
| The classifier outside the fiber (MD:844-863) | **as is** | A session's `Exit` and whole `Cause` are classified the same way, with a read's two channels: author error → failure; die → `Defect` and an issue; outside interruption → `Interrupted`; Flow's release → nothing |
| Flow's reasons (MD:814-826) | **adapted** | `Defect` and `Interrupted` arrive on `failure` (rule 37); `DuplicateSession` joins them (rule 47). `NotSent`, `Cancelled`, `Restored`, `StillUnknown` belong to Attempts and do not apply. A new reason, `Unproven`, is Flow's gap reason (4.1.4) |
| `outcomes` mapping onto author events (rule 13, D1) | **as is** | `value`, `gap`, `complete`, `failure` map onto declared events; a failure or gap mapping is one event or an exhaustive tag record |
| Mappers receive `(value, context)` (C6) | **adapted** | `(value, { params, key })`; the session has no Attempt |
| `Flow.uncertain` (rule 13, D3) | **not carried** | No unknown channel on a read. A gap's reason (`Unproven` or the adapter's) is information in the payload |
| The commit value as handle: `retry`, `cancel`, `idle`, `pending`, `retryCount` (D4) | **not carried** for sessions; **extended** for streaming writes | A session is declarative: it starts with its activity, stops when released or `when` is false, re-opens only by starting the activity again. Its lane is read like any activity lane. A streaming write's lane row gains one field, `progress` (4.1.10; Revision (multiplicity audit, 2026-10-31): lanes are the snapshot's `calls` rows, the design's D18) |
| The lane per actor, transaction and key (rule 21) | **adapted** | Streams already have activity lanes (OPS O6). `Running` gains `connection`, and revision 2 types the lane by freshness (4.1.5) |
| Owner, current or late, decided at admission (rule 14) | **adapted** | The owner is the activity's activation. A delivery is mapped at admission (as an ending is); if its session was released, it is discarded, never routed late (rule 44): a session owes nothing after release, and the next session's continuity says what it missed |
| Late turns (rule 15) | **not carried** | No late stream deliveries |
| Declines are endings (rule 16, D5) | **adapted** | A duplicate session is a failure ending (`DuplicateSession`), never silence (rule 47) |
| Every start ends once (rule 17) | **adapted** | A session ends at most once; a planned release ends it without an ending (OPS:133, kept) |
| The Attempt's ending, `StillUnknown` (rule 18) | **not carried** | No Attempt |
| The key is the Attempt's id (rule 19) | **adapted** | The idempotency key's counterpart is the resume position: the author puts it on the wire through `params` (rule 45). Flow keeps no cursor |
| Required handling (rule 20) | **adapted** | `value`, `gap` and (r2) `complete` are required for an `every` stream; `Defect` and `Interrupted` in a tag record (rule 37); `DuplicateSession` where it can occur. Current only |
| Memory reads: before for decisions, after for effects (rule 22) | **as is** | Activity `params` and `when` read after. So a handler that writes `lastSeq` and re-enters the state opens the next session from it |
| Schedules and keyed schedules (rule 23, 2.7.10) | **as is** | Backoff after a terminal failure, give-up budgets and "stale after a quiet minute" are schedules |
| Cancel (rule 24) | **not carried** for sessions; **as is** for streaming writes | A session is released, not cancelled. Stopping a generation is `gen.cancel(key)`: `unknown(Cancelled)` |
| No Flow timeout, no Flow retry (rule 25) | **as is, extended** | Flow never re-opens a session (rule 43). The adapter may reconnect inside one, and reports it |
| Mailbox FIFO with endings, timers, `onContext` (P21) | **as is, extended** | Stream deliveries queue in the same FIFO (rule 46) |
| Concurrency modes (2.7.8) | **not carried** for sessions; **as is** for streaming writes | One session per activity; a second one is `DuplicateSession` |
| Attempt durability (Persistence O6, C17) | **not carried** for sessions; **as is** for streaming writes | Progress is never persisted (rule 48) |
| The cache table (MD:865-876) | **not carried** | A stream never writes resource data (OPS:126, kept); `listen` writes records under section 4.2 |
| `orphaned` (P19) | **not carried** | Nothing to finish across a version change |

### 3.2 From entity domains (M4 rules 26–38, EDP, ED)

The owner's scope note applies: the domain is client-side coherence, not a sync engine. `listen` keeps the store
coherent and honest; log replay, offline catch-up and completeness belong to a sync engine behind SE.

| Concept | Verdict | How or why |
| --- | --- | --- |
| One split: domain owns shared data, machine owns workflow (rule 26) | **as is** | The domain applies pushes and repairs after gaps; a machine needs no handler for a `listen`'s gaps |
| Settlement for the store, admission for the lane (rule 27) | **adapted** | A push changes the store when it arrives (its "settlement"), before any machine turn; a machine that maps the same session's `value` sees it later, at admission |
| A start publishes with its turn (rule 28) | **as is, by analogy** | A session that starts in a turn shows `Running` with `connection: "Opening"` in that turn's publication |
| Actor first, then the record queue (rule 29) | **not carried** | A push is not a write: it never joins a record queue. Predictions replay over the pushed base (ED:507-510) |
| The store follows the Attempt's ending (rule 30), retry (rule 31) | **not carried** | No Attempt |
| What clears `uncertain` (rule 32) | **as is, extended** | A push is an observation, like a read: it clears no mark (rule 49) |
| No temporary ids (rule 33) | **as is** | A pushed new record enters lists only through repair (EDP:118-119) |
| Lane key of a domain write (rule 34) | **not carried** | |
| Overflow is an ending (rule 35) | **adapted** | A push buffer's overflow is a gap, a known loss, never a silent drop; revision 2 makes the buffer Flow's (`Session.push`, rule 52) |
| Callback reads (rule 36) | **not carried** | |
| Reads carry confirmed data; `Defect`/`Interrupted` mapped (rule 37) | **as is** | A session's failures (rule 42) |
| Lanes and predicted keys persist together (rule 38) | **not carried** | Deliveries are not persisted at all (rule 48) |
| Positions and frontiers (ED 5.3) | **adapted** | An unproven open, or a gap, lowers the frontier of covered answers (rule 49); "reconnect" in EDP:82 gains this meaning |
| Versions, contests, tombstones (EDP:63-71, ED:598-601, ED:688-692) | **as is** | They already make out-of-order and duplicated pushes safe with versions, and self-heal without (section 4.2) |

## 4. Design

Three layers, each in its own section, then the layer table (4.4) and the lifecycle table (4.5), which revision 2 adds.

### 4.1 The stream operation (Operations O1, O4, O6, O7)

#### 4.1.1 The descriptor, from the WebSocket up

The data starts at the browser's `WebSocket`. Revision 2 writes the adapter over Effect's own socket module, so the
transport is a service a Story can replace (EFX `socket/Socket.ts:864-875`, `WebSocketConstructor`) and every close is
an error with its code (EFX `socket/Socket.ts:444-452`: "Sockets never classify closes").

```ts
// chat.operations.ts (outside the machine)
import { Data, Effect, Schedule, Schema, Stream } from "effect"
import { Socket } from "effect/socket"                       // existing (Effect 4.0.5): makeWebSocket, readerString, SocketError
import { Session, stream } from "flow-state"                  // NEW: Session; existing: stream

export const Message = Schema.Struct({ epoch: Schema.String, seq: Schema.Number, text: Schema.String })   // user-defined
export type Message = typeof Message.Type
export class Dropped extends Data.TaggedError("Dropped")<{ readonly code: number }> {}        // user-defined: a down reason
export class SignedOut extends Data.TaggedError("SignedOut")<{}> {}                            // user-defined: ends the session
export class Reset extends Data.TaggedError("Reset")<{ readonly epoch: string }> {}           // user-defined: a gap reason

const Hello = Schema.fromJsonString(Schema.Union([                                              // user-defined: the server's answer to "resume"
  Schema.Struct({ t: Schema.Literal("resumed") }),
  Schema.Struct({ t: Schema.Literal("gap"), epoch: Schema.String }),                            // "I cannot replay from there; my log is now `epoch`"
]))
const Frame = Schema.fromJsonString(Schema.Union([
  Schema.Struct({ t: Schema.Literal("msg"), message: Message }),
  Schema.Struct({ t: Schema.Literal("pong") }),
]))

const classify = (e: Socket.SocketError): Dropped | SignedOut =>                                // the author reads the close code; Flow never does
  e.reason._tag === "SocketCloseError" && e.reason.code === 4401 ? new SignedOut({})
    : new Dropped({ code: e.reason._tag === "SocketCloseError" ? e.reason.code : 1006 })

export const messages = stream({                                                                // existing
  id: "chat/messages",
  key: (p: { roomId: string; epoch: string; after: number }) => ({ roomId: p.roomId }),        // existing: the key names the feed
  delivers: "every",                                                                            // NEW
  result: Message,
  subscribe: (p) => Session.reconnect({                                                         // NEW (shape revised in r2, M6-D8)
    connect: (from) => Effect.gen(function* () {                                                // NEW (r2): an Effect of one opened connection
      const socket = yield* Socket.makeWebSocket(`/rooms/${p.roomId}/live`)
      const pull = (yield* Socket.readerString(socket).pipe(Effect.mapError(classify))).pipe(Effect.mapError(classify))   // acquiring the reader waits for "open"
      const writer = yield* socket.writer
      const start = from ?? { epoch: p.epoch, after: p.after }                                  // this session's watermark (rule 45), or this session's last value
      yield* writer.write(JSON.stringify({ t: "resume", ...start })).pipe(Effect.mapError(classify))
      const [first, ...rest] = yield* pull.pipe(Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(new Dropped({ code: 4000 })) }))
      const hello = Schema.decodeUnknownSync(Hello)(first)
      yield* Effect.forkScoped(Effect.forever(Effect.sleep("15 seconds").pipe(                  // a heartbeat on Effect's Clock (rule 52)
        Effect.andThen(writer.write(JSON.stringify({ t: "ping" }))), Effect.ignore)))
      return {
        claim: hello.t === "resumed" ? Session.resumed() : Session.gap(new Reset({ epoch: hello.epoch })),   // NEW (r2): the claim, made at open
        values: Stream.fromIterable(rest).pipe(
          Stream.concat(Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable))),
          Stream.timeoutOrElse({ duration: "40 seconds", orElse: () => Stream.fail(new Dropped({ code: 4000 })) }),   // silence fails; it never ends quietly
          Stream.flatMap((raw) => {
            const f = Schema.decodeUnknownSync(Frame)(raw)                                       // an undecodable frame is a defect
            return f.t === "msg" ? Stream.succeed(f.message) : Stream.empty                      // pongs only keep the deadline alive
          })),
      }
    }),
    position: (m) => ({ epoch: m.epoch, after: m.seq }),                                        // existing
    schedule: Schedule.max([Schedule.exponential("500 millis"), Schedule.recurs(8)]),           // r2: was Schedule.both, which does not exist
    while: (e) => e._tag === "Dropped" || e._tag === "ConnectionEnded",                         // NEW (r2): a clean end is offered to `while` too
  }),
})
```

`delivers` and the key's meaning are unchanged from revision 1:

| | `"every"` | `"latest"` |
| --- | --- | --- |
| A value is | a fact: a message, a notification, a delta | the current state: a price, a presence set |
| Flow may coalesce or skip | never | yes |
| Equal values | delivered, also after a restore (r2, rule 51) | silent under `Equal.equals` |
| Reading the adapter's Stream | pulled one element at a time, by its consumer (rule 46) | drained continuously into the lane |
| Claims carry continuity | yes (4.1.4) | no: every claim only opens (r2) |
| The lane holds | no data: facts live in memory or the store (r2, 4.1.5) | `data` while `Live`, else `lastKnown` (r2) |
| In a machine | `value`, `gap` and `complete` must be mapped (r2: `complete` added) | `value` optional |
| In `listen` | required | a type error |

**The key names the feed; parameters outside it say where a session starts** (OPS:41-43 amended, rule 45). A new
session reads the current parameters; a running one keeps its originals (OPS:120-121).

#### 4.1.2 The connection grammar (revision 2)

A session is a sequence of connections. The adapter's Stream is read by this grammar, which Flow enforces:

```text
session     := connection* ending?
connection  := claim item* (down | the session's ending)
claim       := open | resumed | gap(reason)      made when the transport opens, before any of its values
item        := value | gap(reason)               a gap after the claim is a loss inside the connection
between     := value*                            values after a down and before the next claim (a cache serving data)
```

- **The claim opens the connection.** `Session.open()` claims nothing about continuity, `Session.resumed()` proves
  it, and `Session.gap(reason)` reports a loss (4.1.4). The claim is made when the transport opens. A connection that
  stays quiet is still open.
- **The session's first value with no claim before it counts as `open()`.** This keeps M6-D2: a plain Stream with
  no signals (`Stream.fromIterable`, a polling loop) still works.
- **A claim inside an open connection is ignored**, with an `ExtraClaim` evidence entry (an adapter bug made
  visible). A `down` while down replaces the reason.
- **`Unproven { why }`:** `"Opened"` for the session's first connection, `"Reconnected"` for every later one.
- **Values between a `down` and the next claim** update a `latest` lane's `lastKnown` (Firestore's cache, 7.7.4). On
  `every` they are delivered: a fact is a fact. They open nothing.
- **Signals are never lost.** Flow's push buffer (4.1.6) never evicts a signal, and Flow never coalesces two claims.

The vocabulary itself is the four signals of revision 1, with two Flow reasons added:

```ts
Session.open()        // NEW: the connection is open; continuity unproven
Session.resumed()     // NEW: open; every fact after this connection's start position follows, in order (4.1.4)
Session.gap(reason)   // NEW: as a claim, open with a known loss; as an item, a loss inside the connection
Session.down(reason)  // NEW: the connection dropped; the adapter is trying again
// Flow's own reasons (NEW): Unproven { why: "Opened" | "Reconnected" } (a gap), Overflow { lost } (a gap, 4.1.6),
// ConnectionEnded (offered to Session.reconnect's `while` when a connection's values complete, 4.1.3)
```

#### 4.1.3 `Session.reconnect` (revision 2, M6-D8)

```ts
Session.reconnect<A, P, G, E, R>(options: {                                                     // NEW
  readonly connect: (from: P | undefined) =>
    Effect.Effect<{ readonly claim: Session.Claim<G>; readonly values: Stream.Stream<A | Session.Gap<G>, E, R> }, E, R | Scope.Scope>
  readonly position: (value: A) => P
  readonly schedule: Schedule.Schedule<unknown, E | Session.ConnectionEnded, never, R>
  readonly while: (error: E | Session.ConnectionEnded) => boolean
}): Stream.Stream<A | Session.Signal<E | Session.ConnectionEnded, G>, E, R>   // a refused ConnectionEnded completes the session
```

- **`connect` returns the opened connection** (r2). Its Effect succeeds when the transport is open and the claim is
  known. The combinator emits the claim at that moment, then the values. So a quiet connection opens (finding H1).
  The type requires a claim, so a connection cannot start without one.
- **Each connection runs in its own scope**, closed before the next `connect` runs. The old socket is closed before a
  new one opens.
- **Ending a connection.** If `values` fails with `e`, or `connect` fails, the combinator asks `while(e)`. If
  `values` completes, it asks `while(ConnectionEnded)` (r2). A server's clean close is therefore a reconnect when the
  author says so, and never a silent end of the feed. If `while` accepts, the combinator emits `Session.down(e)`,
  sleeps by `schedule` on Effect's Clock, and connects again. If `while` refuses, the session ends: with the error,
  or as `complete` for `ConnectionEnded`.
- **`from` is the position of the last value this session emitted.** Gaps inside the session were already reported
  to the consumer, who owns the repair (4.3.2), so the combinator never holds back. Across sessions the machine's
  watermark is the start (rule 45).
- **The schedule restarts at every open** (r2). It counts the failed attempts since the last connection that
  opened. A server that accepts and immediately drops is still paced by the schedule's first delay.
- The combinator is adapter code. Flow's runtime never re-opens a session (rule 43, rule 25).

Sources that reconnect by themselves (SSE inside one `EventSource`, Supabase realtime, Firestore, a sync engine) do
not use it: they report signals through `Session.push` (4.1.6).

#### 4.1.4 Continuity: what a claim means (revision 2)

| Claim | On `every` | On `latest` |
| --- | --- | --- |
| `resumed()` | **continuous**: every fact after the position this connection was opened from will be delivered, in order, before anything newer. No gap is delivered | opens; nothing else |
| `gap(reason)` | **a known loss**: a gap with the adapter's reason, before the connection's values | opens; no gap is delivered |
| `open()`, or the session's first value with no claim | **unproven**: a gap with `Unproven { why }`, before the connection's values | opens |

- **Only an in-band answer proves continuity** (C3). The server must say, on this connection, that it replayed from
  the given position (chat's `{ t: "resumed" }`, an SSE `event: resumed`). A transport opening proves nothing. Neither
  does a browser sending `Last-Event-ID`: the server may have ignored it.
- **A full snapshot is not a resumption on `every`** (finding H3). A snapshot tells you the current state but not the
  facts that happened in between: a deleted message, a notification already dismissed. An adapter whose server
  answers "here is everything" says `gap(new Snapshot())` and delivers the snapshot's items as values, or lets the
  machine re-read. On `latest`, a snapshot is simply the next value.
- **A silent re-open is an adapter defect.** Flow cannot see a transport that re-opened without saying so. Both of
  Flow's constructors make it hard to write one: `Session.reconnect`'s type requires a claim per connection, and
  `Session.push`'s `emit.open()` sits in the SDK's open callback. Inspection reports an `every` session that has
  delivered values but never received a claim (`NoClaims`, 6.4).
- **A gap is delivered before the connection's values,** so a consumer always learns of a loss before it sees
  anything newer.

#### 4.1.5 The lane, typed by freshness (revision 2, M6-D9)

```ts
// A latest stream's lane                                                                       NEW (r2)
type LatestLane<A, D, E> =
  | { readonly _tag: "Running"; readonly connection: "Live"; readonly data: A }                 // a value arrived on the current connection
  | { readonly _tag: "Running"; readonly connection: "Opening"; readonly lastKnown: A | undefined }
  | { readonly _tag: "Running"; readonly connection: "Down"; readonly lastKnown: A | undefined; readonly down: D }
  | { readonly _tag: "Complete"; readonly lastKnown: A | undefined }
  | { readonly _tag: "Failure"; readonly lastKnown: A | undefined; readonly error: E }
  | { readonly _tag: "Defect" | "Interrupted"; readonly lastKnown: A | undefined; readonly cause: Cause.Cause<unknown> }

// An every stream's lane: no data; its facts went to memory or the store                       NEW (r2)
type EveryLane<D, E> =
  | { readonly _tag: "Running"; readonly connection: "Live" | "Opening" }
  | { readonly _tag: "Running"; readonly connection: "Down"; readonly down: D }
  | { readonly _tag: "Complete" }
  | { readonly _tag: "Failure"; readonly error: E }
  | { readonly _tag: "Defect" | "Interrupted"; readonly cause: Cause.Cause<unknown> }
```

- **`"Live"` replaces revision 1's `"Open"`** (r2), because its meaning changed. On `every`, a lane is `Live` from
  the connection's claim (and its gap, if any, is queued first). On `latest`, it is `Live` only once a value has
  arrived on the current connection. Before that it is `Opening`, even if the transport is open. A ticker on a quiet
  symbol after a reconnect therefore shows its old price as `lastKnown`, not as live (finding H2).
- **`data` exists only while `Live`.** A view that renders `lane.data` must first narrow on `connection === "Live"`,
  so the most common mistake, rendering a stale value as current, is a type error. `lastKnown` is there to render
  dimmed.
- **An `every` lane has no data.** A chat message or a push is a fact handled into memory or applied to the store;
  showing "the last message" from a lane invites treating a fact as state.
- **A new session with the same key starts with `lastKnown`** set to the previous session's data, as `Opening`
  (revision 1's G5 answer, renamed). A restore does the same (rule 51).
- Lane updates of a `latest` stream coalesce to at most one publication per Runtime publication (MCH:148-150).

#### 4.1.6 The push boundary: `Session.push` and transports (revision 2)

Callback SDKs (Supabase, Firestore, `EventSource`, a sync engine) push whatever the consumer does. In revision 1, each
adapter wrote its own bounded queue and overflow protocol over `Stream.callback`. `Stream.callback`'s buffer is
unbounded by default (EFX `Stream.ts:698`, `:725`), and its `"sliding"` strategy can evict a signal. Revision 2 makes
this boundary Flow's:

```ts
Session.push<A, D = never, G = never, E = never, R = never>(                                    // NEW (r2)
  register: (emit: Session.Emit<A, D, G, E>) => Effect.Effect<unknown, never, R | Scope.Scope>,
  options: { readonly capacity: number },                                                       // required: no unbounded default
): Stream.Stream<A | Session.Signal<D, G | Session.Overflow>, E, Exclude<R, Scope.Scope>>

interface Emit<A, D, G, E> {                                                                    // NEW (r2): synchronous, callable from any SDK callback
  value(a: A): void
  open(): void
  resumed(): void
  gap(reason: G): void
  down(reason: D): void
  fail(error: E): void
  end(): void
}
```

- **Bounded, and loss becomes a gap.** At most `capacity` values wait. When a value arrives at a full buffer, the
  oldest waiting value is dropped, and Flow places `gap(Overflow { lost })` where it was. On `every`, the gap sits
  exactly at the loss and comes before the surviving values. On `latest`, the newest value survives and the gap is
  dropped (rule 41). One policy is correct for both kinds, so `Session.push` needs no `delivers` option.
- **Signals are never evicted** and never count against `capacity`. A run of `down`s keeps the last reason; claims
  follow 4.1.2.
- **After the session's scope closes, `emit` does nothing.** An SDK callback that fires during or after the
  release (Supabase's asynchronous `removeChannel`) cannot reach a released session (rule 44).
- `register`'s Effect sets the SDK up and returns its clean-up through `Effect.acquireRelease` (EFX `Effect.ts:13366`).

**Transports are services; Stories fake the transport, not the adapter** (finding H6). In revision 1 a Story
replaced the whole adapter, so overflow, close-code classification and heartbeats never ran in a Story. Revision 2
writes every adapter over a structural transport service, and Stories replace only that service:

| Source | The transport service | Production | Story fake (7.0) |
| --- | --- | --- | --- |
| WebSocket | `Socket.WebSocketConstructor` (EFX `socket/Socket.ts:864-875`) | `Socket.layerWebSocketConstructorGlobal` (`:877`) | a scripted `WebSocketLike` (`:790-806`) driven by fixture controls |
| SDK callbacks (Supabase, Firestore) | the author's structural subset of the SDK (`RealtimeLike`, `SnapshotsLike`) | the real client | the same subset, driven by controls |
| `fetch` (a write, an LLM answer) | the author's service returning a `Stream` of parts (7.7.1) | the SDK | a Layer of the same service |

Everything above the transport runs in the Story: `Session.reconnect`, `Session.push`, overflow, decoding,
classification, and heartbeats on the TestClock (rule 52).

#### 4.1.7 Endings and classification

Unchanged from revision 1. A session ends once, as a read: `complete`, or `failure` with the author's error, Flow's
`Defect` (a die, plus an issue) or `Interrupted`, classified from the whole `Cause` outside the session's fiber
(MD:844-863). A planned release ends it with no ending (OPS:133, OPS:178-179). There is no unknown channel. The adapter
classifies (`classify` in 4.1.1); Flow reads no close code.

Revision 2 adds two things:

- **A deadline fails, never completes.** `Stream.timeout` *ends* a stream when the deadline passes (EFX
  `Stream.ts:3431-3454`). That reads as `complete`, or, inside a commit, as a missing terminator. Adapters and commits
  use `Stream.timeoutOrElse({ duration, orElse: () => Stream.fail(e) })` (EFX `Stream.ts:3539`) or
  `Effect.timeoutOrElse` (EFX `Effect.ts:8866`), as 4.1.1 does (rule 52).
- **An `every` session's `complete` must be mapped** (rule 50). A feed that ends is an event the machine must answer;
  leaving it unmapped would leave a state waiting forever, the silent decline that D5 rejected.

#### 4.1.8 Delivery to a consumer

Unchanged: one consumer per session (a machine activity, or the store plus its activity). `every` is pulled one
element at a time, after the previous one is handled; `latest` is drained into the lane.

#### 4.1.9 `publish`: state the client keeps on the session (revision 2, proposed; R2.1)

Some live data flows outward: my cursor, my "typing…" state, my presence status. It is state, not a write: only the
newest value matters, loss is fine, nothing ends, and after a reconnect the server must be told again. Revision 1 had
no home for it (finding H7).

```ts
// the descriptor declares what a session may carry outward
export const cursors = stream({                                                                 // existing
  id: "doc/cursors",
  key: (p: { docId: string }) => p,
  delivers: "latest",
  publishes: CursorPos,                                                                         // NEW (r2): a Schema
  subscribe: (p, { published }) => Session.reconnect({                                          // NEW (r2): published: Stream<CursorPos | undefined>
    connect: () => Effect.gen(function* () {
      const socket = yield* Socket.makeWebSocket(`/docs/${p.docId}/cursors`)
      const pull = (yield* Socket.readerString(socket).pipe(Effect.mapError(toDropped))).pipe(Effect.mapError(toDropped))
      const writer = yield* socket.writer
      yield* Effect.forkScoped(Stream.runForEach(published, (c) =>                             // the current value first, then each change
        writer.write(JSON.stringify({ t: "me", cursor: c ?? null }))).pipe(Effect.ignore))      // re-sent on every connection
      return { claim: Session.open(), values: Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable), Stream.map(decodeOthers)) }
    }),
    position: () => undefined, schedule: backoff, while: isDrop,
  }),
})

// the activity says which memory it publishes
EDITING: {
  activities: {
    others: O.Doc.cursors.subscribe(({ memory }) => ({ docId: memory.docId }), {               // existing
      publish: ({ memory }) => memory.myCursor,                                                 // NEW (r2): after memory (rule 22)
    }),
  },
  on: { Moved: { target: "self", updateMemory: ({ event }) => ({ myCursor: { x: event.x, y: event.y } }) } },   // user-defined event
},
```

- Flow evaluates `publish` on each committed turn's after memory and offers the value to the session when it
  changes under `Equal.equals`. `published` always starts with the current value, so each connection re-sends it.
- No Attempt, no ending, no lane row and no event: it is not a write. A value published while `Down` is sent on the
  next connection, or replaced by a newer one first.
- Anything whose loss matters (a chat message, a like) is a transaction, as before.

#### 4.1.10 Writes that stream: progress

Unchanged in shape (M6-D1, M6-D5). Revision 2 fixes three things:

```ts
export const generate = transaction({                                                           // existing
  id: "assistant/generate",
  input: Schema.Struct({ conversationId: Schema.String, prompt: Schema.String }),
  key: (i) => ({ conversationId: i.conversationId }),
  progress: Schema.Struct({ text: Schema.String }),                                             // NEW
  concurrency: "reject",
  commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {                    // NEW: progress
    const res = yield* Assistant.use((api) => api.generate(input, { clientMessageId: attempt.id, signal })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
    if (res.status !== 200) return yield* Outcome.failure(new Refused({ status: res.status }))
    let text = ""
    let done: Done | undefined
    yield* res.frames.pipe(
      Stream.timeoutOrElse({ duration: "30 seconds", orElse: () => Stream.fail(new Stalled({})) }),   // r2: was Stream.timeout, which ends silently
      Stream.runForEach((f) => {
        if (f._tag === "Done") { done = f; return Effect.void }
        text += f.token
        return progress({ text })
      }),
      Effect.catch((e) => Outcome.unknown(new BodyBroken({ cause: e }))))                       // Stalled included: it may have finished
    if (done === undefined) return yield* Outcome.unknown(new CutOff({}))
    return { messageId: done.messageId, text }
  }),
})
```

- **Progress belongs to its Attempt** (r2; finding "progress wiped by a superseded Attempt"). Flow stores progress
  per Attempt. The row's `progress` (M6-D5) is the addressable Attempt's. An Attempt's ending clears only its own.
  Under `latest`, a superseded Attempt's progress is never shown, and its ending does not touch the newer Attempt's.
  Each mapper's `progress` is its own Attempt's last value.
- **A new question after Stop** (r2). Once Stop's `unknown(Cancelled)` ending is admitted, the lane has nothing
  outstanding, so under `reject` a new start is admitted as a new Attempt. `gen.retry(key)` would re-send the stopped
  Attempt with the same id, which is right only for a server that dedups by it (rule 19). The author chooses.
- **A stalled body fails** (`Stalled`), so it can never look like a clean end.

### 4.2 The entity wrapper: `listen(stream).as(...)` (EntityDomains O1, ED)

The domain is client-side coherence, not a sync engine. Revision 1's four obligations stand: apply every push in
order; a push proves nothing; lower what may be stale after a gap; leave completeness to a sync engine. Revision 2
adds the fifth (finding "a `listen` that ends or sits down leaves answers fresh"): **an answer is never fresher than
the push channel that keeps it coherent.**

```ts
// ticketEvents is 7.7.3's: delivers "every", Session.push over the Realtime transport
events: listen(ticketEvents).as([Ticket], (event) =>                                            // existing (DD ticket.domain.ts:81-88)
  event._tag === "TicketSaved" ? Ticket.save(event.ticket)
    : Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })),

feed: O.Tickets.events.subscribe(workspace, {                                                   // existing
  outcomes: { failure: { Closed: E.FeedLost, SignedOut: E.SignedOut, Defect: E.FeedLost, Interrupted: E.FeedLost }, complete: E.FeedLost },   // NEW (r2): required on listen
}),
```

What each moment of a `listen` session does to the answers it covers (the answers on the entities it changes):

| Moment | Covered answers |
| --- | --- |
| a push | applied at arrival, in order (rule 27's settlement side); never joins a record queue; clears no `uncertain` mark (rule 32) |
| the session is `Opening` or `Down` (r2) | stale, cause `listen` ("the push channel is not live"); no refetch yet |
| a claim `resumed()` | the `listen` cause is withdrawn: nothing was missed |
| a claim `open()` or `gap(r)`, or a gap item | a **reconnect** cause: subscribed answers whose request started before this point refetch in canonical order under `repairSlots`; the rest stay stale (EDP:82, ED:574-576) |
| the session ends (`complete`, `failure`, `Defect`, `Interrupted`) (r2) | stale, cause `listen ended`; the activity's `failure` and `complete` must be mapped (rule 50), so the machine re-opens it |
| a planned release (r2) | a `listen` cause becomes an ordinary stale cause (the answer may have missed pushes); a live session's release changes nothing |

- **The first open counts** (G10): answers whose requests started before the first claim are lowered by
  `Unproven { why: "Opened" }`. The cost is one extra read at page load. Proof from a read's cursor is a sync engine's
  job (SE).
- **Several sessions** (M6-D6): an answer stays stale while any session covering it is not `Live`.
- **Duplicates, replays, versions:** unchanged (versions decide; without them the contest rule heals, EDP:66-69;
  `flow check` warns on unversioned `listen`, EDP:123-124).
- Log replay, offline catch-up, guaranteed completeness: a sync engine behind SE (the scope note).

### 4.3 Streams inside machines (Machines O6, machine-design.md)

#### 4.3.1 Starting, owning, reading

Unchanged in shape. Guards and views read the typed lane:

```ts
Send: { target: "self", guard: ({ activities }) => activities.feed?.connection === "Live" || deny("Offline"), actions: [post] },   // NEW MEANING: "Live"
```

```tsx
const q = useView(m, (s) => s.activities.price)
q?.connection === "Live" ? <Price value={q.data.last} /> : <Price value={q?.lastKnown?.last} dimmed />   // NEW (r2): data only when Live
```

Stream `outcomes` keys: `value`, `gap`, `complete`, `failure`. A `latest` value mapper's context gains `live`
(r2): `(value, { params, key, live })`, because a value can arrive while `Down` (a cache).

#### 4.3.2 Resume through a watermark (revision 2)

Flow keeps no cursor (A6). Revision 1 said the machine keeps "the position it has handled". The chat walk read that
as "the highest position seen" and lost messages three ways (finding H4). Rule 45 now says precisely what a resume
parameter is:

- **It is a watermark:** the consumer holds every fact at or before it. It is not the highest position seen. A
  message that arrives past a hole is held, but the watermark stays below the hole.
- **A gap is an obligation.** The watermark cannot pass a gap until a catch-up discharges it. A failed catch-up is
  retried by a state and a schedule, never forgotten. A session started meanwhile resumes from below the hole, so the
  server replays it or reports a gap again.
- **Positions belong to an epoch.** A server that restarts its log answers `gap(Reset { epoch })`. The consumer
  starts a new watermark in the new epoch, and dedups by `(epoch, seq)`, never by `seq` alone.
- **In-session**, `Session.reconnect` resumes from its own last emitted value (4.1.3): each in-session gap has
  already been delivered to the machine, which repairs it against its watermark.

7.1 shows the full recipe (`hold`, the watermark helper, and the catch-up states).

#### 4.3.3 Deliveries in the turn

Unchanged: deliveries join the FIFO mailbox and are mapped at admission. A released session's deliveries are
discarded at admission. An `every` session has one delivery waiting; a `latest` session has at most one, with its
payload read at admission. Revision 2 adds:

- **Deliveries never count against the mailbox cap.** The 1,024 cap (RT:83-84) bounds external sends. Each session
  has at most one delivery waiting, so deliveries are bounded by work already admitted, as endings and firings are
  (RT:87-88). They are never dropped, except a released session's at admission (rule 44).
- **Release before restart.** A new session for the same activity and key starts only after the previous session's
  finalizers have finished (finding "the release/restart race"). So a Supabase channel is removed before the same
  topic is joined again. A finalizer that outlasts the Runtime's bound (Runtime O6) reports an issue, and the new
  session starts.

#### 4.3.4 Reconnect after a terminal failure

Unchanged: a failure that needs a decision is the machine's, as a state and a schedule (2.7.6). Re-entering the
owning state starts a new session from the watermark.

#### 4.3.5 Schedules around a stream

| Need | Form |
| --- | --- |
| "Live" badge, disabled composer | the lane's `connection === "Live"` |
| The transport is half-open | the adapter's heartbeat on Effect's Clock: no frame within the deadline fails `Dropped` (4.1.1) |
| A quiet feed is stale (r2) | the server's timestamp in each value (`asOf`), and a schedule `armOn: [Flow.entry, E.Price]`; the timestamp also keeps a repeated equal price from being silenced (7.3) |
| Backoff after a terminal failure, a give-up budget | a schedule and memory |
| A catch-up that failed (r2) | a waiting state with a schedule and a budget (7.1) |
| A stalled generation | inside the commit: `Stream.timeoutOrElse` failing (4.1.10) |

### 4.4 The layers: who owns what, and what crosses

| Layer | Owns | Rules |
| --- | --- | --- |
| **The adapter** | the transport service and its production Layer; auth; heartbeats; close codes into errors; resume handshakes; terminators | 52 |
| **Operations: the stream** | the descriptor (`delivers`, `publishes`); the `Session` vocabulary and the connection grammar; `Session.reconnect` and `Session.push`; the typed lane; endings; pulling or draining; progress per Attempt | 39–43, 48, 53 |
| **Entity domains: `listen`** | applying pushes in order; staleness while the channel is not live; gaps as reconnect causes | 49 |
| **Machines** | owning a session; mapping deliveries at admission; discarding released ones; release before restart; the watermark in memory; reconnect and catch-up as states and schedules; `publish` selections | 44–47, 50, 51 |

| From → to | What crosses | Never crosses |
| --- | --- | --- |
| transport → adapter | frames, opens, closes with codes | — |
| adapter → operation | per connection, a claim and values (and gap items); downs; the Stream's `Exit` | close codes, statuses, SDK types |
| operation → entity layer | each value of an `every` session, in order; each gap; whether the session is `Live` | lane coalescing |
| operation → machine | the typed lane; deliveries (value, gap, ending) | the adapter's in-session position; progress events (progress is a row field) |
| machine → operation | `params` (a watermark) at a session's start; `publish` values; release | anything else mid-session |
| entity layer → machine | records and answers with `stale` causes | the push, unless `value` is mapped |

### 4.5 Every lifecycle edge (revision 2)

C5's table: what each edge means at each layer. Where revision 1 said nothing, this is normative.

| Edge | Operation (session, lane) | `listen` (answers) | Machine |
| --- | --- | --- | --- |
| session starts | lane `Opening` (with `lastKnown` from the previous same-key session); waits for the previous session's release to finish | covered answers stale, cause `listen` | `params` read from the after memory |
| a claim | `every`: `Live`, the gap (if any) queued first; `latest`: `Opening` until a value | 4.2's table | a gap delivery, if any |
| a value | `every`: pulled after the last delivery's turn; `latest`: `data`, `Live` | applied in order | `value` delivered (`latest`: at most one waiting) |
| a value between `down` and the next claim | `latest`: `lastKnown`; `every`: delivered | applied | `latest` mapper's `live: false` |
| `down` | `Down`, reason kept | stale, cause `listen` | guards see `Down` |
| a connection's values complete | `Session.reconnect` offers `ConnectionEnded` to `while` | — | — |
| the session completes | `Complete` | stale, cause `listen ended` | `complete` delivered; required on `every` and `listen` |
| the session fails | `Failure` / `Defect` / `Interrupted` | stale, cause `listen ended` | `failure` delivered; required |
| planned release | no ending; `emit` disabled; finalizers awaited | `listen` cause becomes ordinary stale | queued deliveries discarded at admission |
| restore, handover | a fresh session; persisted `latest` data restored as `lastKnown`, `Opening` | restore lowers frontiers (ED:700-701) | `latest`: equal values silent against the persisted last mapped value; `every`: no equality baseline (r2, finding H5) |
| a write's Attempt superseded | its progress dropped; the newer Attempt's untouched | — | — |
| Stop (cancel) on a streaming write | `unknown(Cancelled)` with its own `progress` | — | after admission, nothing outstanding: a new start is admitted under `reject` |

## 5. Rules

Provisional, numbered after merge 4's 38. `(r2)` marks a rule revision 2 changed or added.

39. **`delivers` is declared.** A stream descriptor declares `delivers: "every" | "latest"`. An `every` value is a
    fact: Flow never coalesces, skips or equality-suppresses it, including after a restore (r2). A `latest` value is
    the current state: Flow may coalesce it, and equal values are silent under `Equal.equals`.
40. **The connection grammar** (r2). `subscribe` returns a Stream of values and `Session` signals. A session is a
    sequence of connections. Each connection begins with exactly one claim (`open`, `resumed` or `gap(reason)`), made
    when its transport opens, and ends with `down` or the session's ending. A gap after the claim is a loss. The
    session's first value with no claim before it is an `open`. A second claim inside an open connection is ignored,
    with evidence. Values between a `down` and the next claim open nothing. Flow reads only which signal came;
    reasons are the adapter's information.
41. **Continuity per claim** (r2). On `every`: `resumed` means every fact after the connection's start position
    follows, in order, before anything newer, and delivers nothing; `gap(reason)` delivers that gap; `open` delivers
    `Unproven { why: "Opened" | "Reconnected" }` ("Opened" for the session's first connection). The gap is delivered
    before the connection's values. Only an in-band answer from the server proves continuity, and a snapshot is a
    `gap`, never a `resumed`. A loss inside a connection is a gap item; `Session.push` places
    `Overflow { lost }` at the point of loss. On `latest`, claims only open and no gap is ever delivered.
42. **A session ends as a read.** `complete`, or `failure` with the author's error, `Defect` (with an issue) or
    `Interrupted`, classified from the whole `Cause` outside the session's fiber. A planned release delivers nothing.
    There is no unknown channel. A deadline in an adapter or commit fails; it never completes the stream (r2).
43. **Flow never re-opens a session** (extends rule 25). The adapter may reconnect inside one session, reporting `down`
    and the next claim. `Session.reconnect` (r2): `connect` returns an opened connection with its claim; each
    connection has its own scope, closed before the next; a connection whose values complete is offered to `while` as
    `ConnectionEnded`; the schedule restarts at each open; `from` is the session's last emitted value. A session that
    ended re-opens only when its activity starts again.
44. **A session belongs to its activity's activation.** Its deliveries are mapped at admission; a delivery whose session
    was released is discarded at admission with evidence, never routed late. After release, `Session.push`'s `emit`
    does nothing (r2). A new session for the same activity and key starts only after the previous session's finalizers
    finish, within the Runtime's disposal bound (r2). Rule 8 covers a live session's deliveries.
45. **Resume through a watermark** (r2). A stream's key names the feed; parameters outside it are read when a session
    starts, from the after memory (rule 22), and kept while it runs. A resume parameter is a watermark: every fact at
    or before it is held by the consumer. A delivered gap is an obligation the watermark may not pass until a catch-up
    discharges it. Positions are compared only within one epoch of the source; a reset is a gap that names the new
    epoch. Flow keeps no cursor and dedups nothing.
46. **Delivery order and pace.** Deliveries join the actor's FIFO mailbox (P21). An `every` session has one delivery
    waiting; its next element is pulled after that delivery's turn commits. A `latest` session has at most one waiting,
    whose payload is the lane's value at admission; admission discards it if that equals the last mapped value.
    Deliveries are bounded by sessions, never count against the mailbox's cap on external sends, and are never dropped
    except under rule 44 (r2).
47. **Duplicate sessions end, never wait.** A second same-actor session for the same descriptor and key does not open:
    the second activity's lane is `Failure` with Flow's reason `DuplicateSession`, delivered on `failure`. `flow check`
    warns when two activities of one machine on one descriptor can be active at once, and then requires
    `DuplicateSession` mapped. **Revision (multiplicity audit, 2026-10-31) (M6-D7).** The same holds inside one keyed
    activity: two keys whose params project one descriptor key give the later key's lane `DuplicateSession`.
48. **Progress of a streaming write.** A transaction may declare a `progress` Schema; its commit's context has
    `progress(value)`, latest-wins and non-blocking. **Revision (multiplicity audit, 2026-10-31) (M6-D5).** The lane
    row's `progress` in `s.calls` reads the addressable Attempt's progress, so `progress` may be declared only with
    `reject`, `latest` or `cancel`. Progress is stored per Attempt (r2): an Attempt's ending clears only its own; a
    superseded Attempt's progress is never shown; every ending mapper's `progress` is its own Attempt's. Progress is
    never persisted and never an ending; the ending carries the whole result.
49. **`listen` keeps the store coherent, not complete.** A `listen` entry requires an `every` stream. Each push is
    applied at arrival, in order, before the next is pulled. Pushes never join record queues and clear no `uncertain`
    mark. While a session covering an answer is not `Live`, or after it ended, the answer is stale with cause `listen`
    (r2). A gap (including `Unproven`) is a reconnect cause: covered answers whose request started before it have their
    frontier lowered (subscribed ones refetch, the rest go stale); `resumed` withdraws the `listen` cause. A planned
    release turns a `listen` cause into an ordinary stale cause (r2). Log replay, offline catch-up and completeness
    belong to a sync engine (SE). **Revision (multiplicity audit, 2026-10-31) (M6-D6).** Each live session of a
    `listen` entry is its own source; `flow check` warns `DuplicateListen`.
50. **Required mappings** (extends rules 20 and 37). An activity on a non-`listen` `every` stream must map `value`,
    `gap` and `complete` (r2: `complete` added). A `listen` activity must map `failure` and `complete` (r2). `failure`
    maps every author tag plus `Defect` and `Interrupted`, and `DuplicateSession` where rule 47 says it can occur.
    Each delivery is handled totally in every state under the activity's owner.
51. **What survives reload and handover.** A persisted `latest` stream's data survives with its persisted actor
    (PER:32-33) and is restored as `lastKnown`, `Opening`; its value events stay silent against the persisted last
    mapped value. An `every` stream has no data to persist and no equality baseline (r2). Queued deliveries and
    progress are not persisted; resume comes from persisted memory (rule 45). A handover restores the same way
    (MT:334).
52. **The push boundary, the transport and the clock** (r2). A push source reaches Flow through `Session.push` (a
    required `capacity`; loss becomes `Overflow`; signals are never evicted), or through a bounded buffer that reports
    loss as a gap. An adapter is written over a transport service, so a Story can replace the transport and keep the
    adapter. Adapter time comes from Effect's `Clock` (`Effect.sleep`, `Clock.currentTimeMillis`), never `Date.now`
    or `setTimeout`, so the TestClock drives heartbeats, deadlines and backoff.
53. **`publish`** (r2, proposed in R2.1). A stream descriptor may declare `publishes: Schema`; an activity on it may
    declare `publish(view)`, read from each committed turn's after memory. Flow offers each changed value (under
    `Equal.equals`) to the session as `published`, a Stream that starts with the current value. It has no Attempt,
    ending, lane row or event, and is never persisted.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `delivers: "every" \| "latest"` | descriptor option, required | rule 39 |
| `Session.open`, `.resumed`, `.gap`, `.down`, `Session.Signal` | adapter vocabulary | rule 40 |
| the connection grammar (r2) | contract | rule 40, 4.1.2 |
| `Session.reconnect({ connect, position, schedule, while })`, `Session.ConnectionEnded` | adapter combinator | rule 43 (r2 shape, M6-D8) |
| `Session.push(register, { capacity })`, `Session.Emit` (r2) | adapter constructor | rule 52 |
| a typed stream lane: `connection: "Opening" \| "Live" \| "Down"`, `data` only while `Live`, `lastKnown` otherwise (r2) | lane | 4.1.5, M6-D9 |
| `outcomes.gap`; `complete` required on `every` and `listen` (r2) | stream mapping | rules 41, 50 |
| `Unproven { why }`, `Overflow { lost }` (r2), `DuplicateSession` | Flow reasons | rules 41, 47, 52 |
| `ExtraClaim`, `NoClaims` (r2) | Inspection evidence | rule 40, 4.1.4 |
| the `listen` stale cause (r2) | store | rule 49 |
| `publishes`, `publish`, `published` (r2, proposed) | outbound state | rule 53 |
| `progress` Schema, `progress(value)`, the lane row's `progress`, mapper `progress` | streaming writes | rule 48 |
| `DuplicateListen` | `flow check` warning | rule 49 |
| `session` and `delivery` evidence | Inspection | 6.4 |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Delivery semantics | chosen by whether `value` is mapped (OPS:126-130) | chosen by `delivers` (rule 39) |
| Stream outcomes | `value`, `complete`, `failure`, `defect`, `interrupt`; values only (MCH:139-140, OPS:70) | `value`, `gap`, `complete`, `failure` with `Defect`/`Interrupted`; mappers `(value, { params, key })`, plus `live` on `latest` (r2) |
| Duplicate session | lane undefined, activity waits (OPS:122-124) | `Failure` with `DuplicateSession` (rule 47) |
| The stream lane (r2) | `Running { data, connection: "Opening" \| "Open" \| "Down" }` for every kind (revision 1) | typed by kind and freshness (4.1.5) |
| When a connection opens (r2) | before its first element (revision 1 4.1.3) | when its transport opens, by its claim (rule 40) |
| `resumed` (r2) | "nothing is missing", including "starts with a full snapshot" (revision 1 4.1.2) | every fact after the start position follows, in order; a snapshot is a `gap` (rule 41) |
| The resume parameter (r2) | "the position it has handled" (revision 1 4.3.2) | a watermark, epoch-scoped (rule 45) |
| A connection's clean end (r2) | ended the session | offered to `while` as `ConnectionEnded` (rule 43) |
| Persistence of equal values (r2) | suppressed after restore for every binding (PER:35-38) | only for resources and `latest` streams (rule 51) |
| "Reconnect" in EntityDomains | the browser's connection restored (EDP:82) | that, or a `listen` gap, including an unproven open (rule 49) |
| Deliveries after release | "facts from an ended activation are discarded" (RT:88-90) | discarded at admission with evidence (rule 44) |
| A key's parameters | "include every parameter affecting the result" (OPS:41-42) | for a stream, the key names the feed; a resume watermark stays outside it (rule 45) |

### 6.3 Removed

| Removed | Was | Why |
| --- | --- | --- |
| `defect` and `interrupt` stream outcome keys | MCH:139-140 | rule 42, as C2 did for commits |
| "Without value mapped, lane updates may coalesce …" | OPS:129-130 | rule 39 |
| "Stream buffering integration" as a build-time choice | OPS:204 | rules 46, 52 |
| `data` on `every` lanes and on non-`Live` `latest` lanes (r2) | revision 1 4.1.5 | 4.1.5 |
| per-adapter overflow code over `Stream.callback` (r2) | revision 1 4.1.3, 7.7.3 | `Session.push` (rule 52) |

### 6.4 Amendments by target

The `.plan` files change only when this proposal is accepted (D14). Rows marked (r2) are revision 2's.

**`Operations.plan`**

| Where | Amendment |
| --- | --- |
| O1 (OPS:11-17) | `stream({ id, key?, delivers, subscribe, result?, persist?, publishes? })` (r2: `publishes`); `subscribe(params, { signal, published? })` returns a Stream of values and `Session` signals under rule 40's grammar |
| O1 (OPS:41-43) | add: "A stream's key names its feed; a resume watermark that only says where a session starts stays outside it" |
| O3 (OPS:79-84) | a transaction may declare `progress`; the commit's context gains `progress(value)`; progress is stored per Attempt (rule 48, r2) |
| O4 (OPS:120-124) | duplicate sessions per rule 47; release before restart per rule 44 (r2) |
| O4 (OPS:126-130) | replace with rules 39, 40, 41 and 46 |
| O4 (OPS:130-134) | endings per rule 42; re-opening per rule 43; a new session's starting lane per 4.1.5 |
| O6 (OPS:166-169) | stream lanes per 4.1.5 (r2: typed; `Live`; `lastKnown`) |
| O7 (OPS:178-179) | a planned release ends a session with no delivery and disables `Session.push`'s `emit` (r2) |
| Q1 (OPS:204) | "Choose stream buffering integration" becomes "Choose `Session.push`'s buffer mechanics and the pulling and draining of rule 46" |

**`Machines.plan`**

| Where | Amendment |
| --- | --- |
| O6 (MCH:139-145) | stream outcomes per 6.2; required mappings per rule 50; "value fires only for a changed confirmed value" holds for resources and `latest` streams, not `every`; a `latest` mapper's context has `live` (r2) |
| O6 (new) | deliveries mapped at admission and discarded when their session was released (rule 44); pace per rule 46; `publish` per rule 53 (r2, if R2.1 is accepted) |
| O4 | guards read `activities.<name>.connection`; narrowing on `"Live"` gives `data` (r2) |

**`machine-design.md`**

| Where | Amendment |
| --- | --- |
| 2.4 | add rules 39–53 |
| Rule 8 (MD:431-440) | "call endings, current and late" gains "and a live stream session's deliveries (rule 44)"; deliveries are bounded by sessions (rule 46, r2) |
| Rule 20 (MD:544-550) | stream mappings per rule 50 |
| Rule 25 (MD:609-610) | add "Flow never re-opens a stream session (rule 43)" |
| 2.5 step 1 (MD:651-661) | the FIFO list gains stream deliveries; a released session's delivery is discarded here; a `latest` delivery reads the lane here |
| 2.7.2 (MD:888-907) | rows for a session's claims, its lane's `connection`, progress per Attempt (r2) |
| 2.7.6 (MD:1111-1117) | rows from 4.3.5 |
| P21 (MD:2130) | "User sends, call endings, stream deliveries, timer firings and `onContext` events queue together" |
| Section 7 item 9 (MD:2242) | closed by 4.1.10 |

**`EntityDomains.plan` and `entity-domain.md`**

| Where | Amendment |
| --- | --- |
| EDP O1 (EDP:59-60) | `listen(stream)` requires `delivers: "every"`; its activity maps `failure` and `complete` (r2) |
| EDP O1 (EDP:82) | "Reconnect" defined per rule 49 |
| EDP O1 (new) | rule 49: pushes applied at arrival in order; no record queue; no `uncertain` clearing; the `listen` stale cause while the channel is not live or has ended (r2) |
| EDP C1 (EDP:189-192) | add "no log replay or completeness from `listen`: a sync engine's (SE)" |
| ED 5.2 causes (ED:537-540) | "a reconnect" records which: the browser's connection or a `listen` gap; add the cause `listen` (r2) |
| ED 5.3 (ED:568-576) | the ordered-stream precondition is rule 46's order; reconnects include rule 49's gaps |
| ED 5.5 Status (ED:703-707) | an answer's `stale` lists `listen` while its push channel is not `Live` (r2) |

**`Persistence.plan`**

| Where | Amendment |
| --- | --- |
| O2 (PER:35-38) | "for each activity binding, the last value it mapped to a value outcome" becomes "for each resource binding and `latest` stream binding"; `every` bindings keep no baseline (r2, rule 51) |
| O2 (PER:35-38) | queued stream deliveries and progress are not "pending outcomes" |
| O4 (PER:96-99) | the restored `latest` lane is `Running`, `Opening`, with the retained data as `lastKnown` (r2); resume per rule 45 |

**`Testing.plan`** (depends on merge 3; see 7.0)

| Where | Amendment |
| --- | --- |
| O2 (TST:42-44) | add: an adapter's Effect sleeps inside a session (heartbeats, deadlines, `Session.reconnect`'s backoff) are pending deadlines, owner the session (rule 52) |
| O3 (TST:53-67) | a stream fixture replaces the **transport** service (`Socket.WebSocketConstructor`, an SDK subset), not the adapter; its controls cover open, frame, silence, close with a code, flood, server reset (r2, 7.0) |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:28-29) | per session: `delivers`, `connection`, the current connection's claim, deliveries waiting, gaps so far, values held in `Session.push`'s buffer (r2) |
| O4 (INS:86-88) | `session` evidence (claim, gap, down, end, `ExtraClaim`, `NoClaims`, `Overflow`) and `delivery` evidence (queued, admitted, discarded with why) |
| CommandLine O5 | errors: rule 50's missing mappings; `listen` over a `latest` stream; `publish` without `publishes` (r2). Warnings: rule 47; `DuplicateListen`; an `every` activity under a state that history can re-enter without a resume parameter |

**Outside the targets:** SE 4.2 (SE:182-185) loses its status-in-value workaround: the TanStack binding uses
`Session.push` with `down` on `error` and a claim on `ready`; SE open question 2 (SE:420-421) closes. DD's polling
adapters (section 1.1) would use `Session.reconnect` and take a watermark as a parameter. Merge 3 gains the fixture
kinds of 7.0.

## 7. The product-case walks

### 7.0 Stories: transport fakes and their controls (revision 2)

The Stories use merge 3's `Fixture.stateful({ id, truth, controls, layer })`, `.control(fixture.name(payload))`,
`checkpoint.truth`, `story.app`'s `.closeTab` / `.openTab` for reloads (M3:621-622), and its rule that every
controlled-clock sleep is a pending deadline (M3:639-645). Merge 3 is being revised; if those change, the spelling
changes, not this design. Two things are added there:

- **An adapter's Effect sleep is a pending deadline**, beside the kinds M3:639-645 lists: heartbeats, deadlines and
  `Session.reconnect`'s backoff (rule 52).
- **A stream fixture replaces the transport, not the adapter** (rule 52). Its controls are the transport's events, so
  every sequence a real connection can produce is one `.control` away:

| Control | What the fake transport does | What the adapter above it then does |
| --- | --- | --- |
| `open` / connect accepted | fires `open` | makes its claim |
| `frame(…)`, `post(…)` | delivers a frame | decodes it into a value |
| `silence` | stops answering pings | its deadline fails `Dropped`, then it reconnects |
| `drop({ code })` | closes with the code | classifies the code: `Dropped`, `SignedOut`, … |
| `flood({ count })` | delivers `count` frames in one tick | `Session.push` overflows into a gap, or a socket's `highWaterMark` fails it |
| `restart({ epoch })` | loses its log | answers the next resume with `gap(Reset { epoch })` |
| `refuseCatchUp({ times })` | fails the next catch-up reads | the machine retries from its waiting state |
| `status(s)` (SDK fakes) | fires the SDK's status callback | `emit.open` / `emit.down` / `emit.fail` |

The chat server fake, for example (its socket is a scripted `WebSocketLike`, EFX `socket/Socket.ts:790-806`):

```ts
// fixtures/fake-chat-server.ts
export const FakeChatServer = (o: { epoch: string; history: number }) => Fixture.stateful({     // M3 (proposed)
  id: "FakeChatServer",
  truth: ChatTruth({ epoch: o.epoch, history: o.history }),       // user-defined: { epoch, messages, connects: [{ epoch, after }] }
  controls: {
    post: Schema.Struct({ text: Schema.String }),
    drop: Schema.Struct({ code: Schema.Number }),
    silence: Schema.Struct({}),
    restart: Schema.Struct({ epoch: Schema.String }),
    refuseCatchUp: Schema.Struct({ times: Schema.Number }),
  },
  layer: (truth, controls) => Layer.mergeAll(
    Layer.succeed(Socket.WebSocketConstructor, (url) => fakeSocket(url, truth, controls)),   // existing service, faked: the adapter runs unchanged
    Layer.succeed(ChatApi, { since: (q) => sinceFromTruth(truth, controls, q) }),            // the catch-up read
  ),
})
```

`fakeSocket` (user-defined) answers `resume` from the truth: `resumed` and a replay when the epoch matches and the log
reaches back, otherwise `gap` with the current epoch. It answers `ping` with `pong` unless it was silenced, and
closes with a code on `drop`. It records each resume in `truth.connects`, so a Story asserts the cursor on the server
side.

### 7.1 Chat feed: Wi-Fi drop, quiet reconnect, server reset, failed catch-up (revision 2)

The adapter is 4.1.1's `messages`. The catch-up read and the send:

```ts
// chat.operations.ts (continued)
export const since = resource({                                                                 // existing
  id: "chat/since",
  key: (p: { roomId: string; epoch: string; after: number }) => p,
  lookup: (p) => ChatApi.use((api) => api.since(p)),                                            // user-defined service: { epoch, messages }
  result: Schema.Struct({ epoch: Schema.String, messages: Schema.Array(Message) }),
  staleTime: 0, gcTime: "1 minute",
})
export const post = transaction({                                                               // existing
  id: "chat/post",
  input: Schema.Struct({ roomId: Schema.String, clientId: Schema.String, text: Schema.String }),
  key: (i) => ({ clientId: i.clientId }),                                                       // one lane per message
  concurrency: "reject",
  commit: (i, { attempt }) => ChatApi.use((api) => api.post(i, { idempotencyKey: attempt.id })),
})
```

```ts
// room.definition.ts
export const Room = definition({                                                                // existing
  id: "Chat/Room",
  states: [{ LIVE: ["SYNCED", "CATCHING_UP", "CATCH_UP_WAIT", "OUT_OF_SYNC"] }, "LOST", "SIGNED_OUT", "OFFLINE"],
  events: { Send: { clientId: Schema.String, text: Schema.String }, Reconnect: {}, RetryCatchUp: {} },   // user-defined
  internalEvents: {
    Message: { message: Message },
    Missed: { epoch: Schema.NullOr(Schema.String) },                                            // a string: the server's new epoch
    CaughtUp: { epoch: Schema.String, messages: Schema.Array(Message) },
    CatchUpFailed: {}, CatchUpTick: {},
    FeedEnded: {}, FeedLost: {}, SignedOut: {}, RetryFeed: {},
    Posted: {}, PostFailed: {}, PostUnsure: Flow.uncertain({}),                                 // existing: Flow.uncertain
  },
  memory: {
    roomId: Flow.input(Schema.String),                                                          // existing: Flow.input, Flow.initial
    epoch: Flow.initial(Schema.String, ""),
    through: Flow.initial(Schema.Number, 0),                                                    // the watermark (rule 45)
    held: Flow.initial(Schema.Array(Message), []),
    catchUpTries: Flow.initial(Schema.Int, 0),
    feedTries: Flow.initial(Schema.Int, 0),
  },
  operations: { Chat },
})

// room.machine.ts
type Memory = typeof Room.Memory.Type
const hold = (m: Memory, incoming: ReadonlyArray<Message>, epoch = m.epoch) => {               // user-defined: rule 45's watermark
  const held = [...m.held]
  for (const x of incoming) if (!held.some((h) => h.epoch === x.epoch && h.seq === x.seq)) held.push(x)   // dedup by (epoch, seq)
  held.sort((a, b) => (a.epoch === b.epoch ? a.seq - b.seq : 0))
  let through = epoch === m.epoch ? m.through : 0                                               // a new epoch starts a new watermark
  while (held.some((h) => h.epoch === epoch && h.seq === through + 1)) through++                // never past a hole
  return { epoch, held, through }
}

export const RoomMachine = machine(Room, ({ S, E, O }) => {
  const room = ({ memory }: { memory: Memory }) => ({ roomId: memory.roomId, epoch: memory.epoch, after: memory.through })
  const catchUp = O.Chat.since.lookup(room, {                                                   // existing: a resource call value
    outcomes: { success: E.CaughtUp.from((v) => ({ epoch: v.epoch, messages: v.messages })), failure: { Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed } },
  })
  const post = O.Chat.post.commit(({ memory, event }) => ({ roomId: memory.roomId, clientId: event.clientId, text: event.text }), {
    outcomes: { success: E.Posted, failure: { NotSent: E.PostFailed }, unknown: E.PostUnsure },
  })
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => hold(memory, event.messages, event.epoch) },   // late, after LIVE was left
      CatchUpFailed: { target: "self" },
      Posted: { target: "self" }, PostFailed: { target: "self" }, PostUnsure: { target: "self" },   // the outbox is not this walk
    },
    states: {
      LIVE: {
        default: S.LIVE.SYNCED,
        activities: {
          feed: O.Chat.messages.subscribe(room, {                                               // params: the watermark, read after (rule 22)
            outcomes: {
              value: E.Message.from((m) => ({ message: m })),
              gap: {                                                                            // NEW: a tag record over the gap reasons
                Reset: E.Missed.from((r) => ({ epoch: r.epoch })),
                Unproven: E.Missed.from(() => ({ epoch: null })),
                Overflow: E.Missed.from(() => ({ epoch: null })),
              },
              complete: E.FeedEnded,                                                            // NEW (r2): required on every
              failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
            },
          }),
        },
        on: {
          Message: { target: "self", updateMemory: ({ memory, event }) => ({ ...hold(memory, [event.message]), feedTries: 0 }) },
          Missed: {                                                                             // the gap is an obligation (rule 45)
            target: S.LIVE.CATCHING_UP,
            updateMemory: ({ memory, event }) => (event.epoch === null || event.epoch === memory.epoch ? {} : { epoch: event.epoch, through: 0 }),
            actions: [catchUp.fetch(room)],
          },
          Send: { target: "self", guard: ({ activities }) => activities.feed?.connection === "Live" || deny("Offline"), actions: [post] },
          SignedOut: S.SIGNED_OUT,
          FeedEnded: S.LOST,
          FeedLost: [
            { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
            { target: S.OFFLINE },
          ],
        },
        states: {
          SYNCED: {},
          CATCHING_UP: {
            on: {
              CaughtUp: { target: S.LIVE.SYNCED, updateMemory: ({ memory, event }) => ({ ...hold(memory, event.messages, event.epoch), catchUpTries: 0 }) },
              CatchUpFailed: [
                { target: S.LIVE.CATCH_UP_WAIT, guard: ({ memory }) => memory.catchUpTries < 4 || deny("GaveUp"), updateMemory: ({ memory }) => ({ catchUpTries: memory.catchUpTries + 1 }) },
                { target: S.LIVE.OUT_OF_SYNC },
              ],
            },
          },
          CATCH_UP_WAIT: {
            schedules: { again: { schedule: ({ memory }) => Duration.seconds(2 ** memory.catchUpTries), send: E.CatchUpTick } },
            on: { CatchUpTick: { target: S.LIVE.CATCHING_UP, actions: [catchUp.fetch(room)] } },
          },
          OUT_OF_SYNC: {                                                                        // the view: "Some messages may be missing. Retry"
            on: { RetryCatchUp: { target: S.LIVE.CATCHING_UP, updateMemory: () => ({ catchUpTries: 0 }), actions: [catchUp.fetch(room)] } },
          },
        },
      },
      LOST: {
        schedules: { retry: { schedule: ({ memory }) => Duration.seconds(2 ** memory.feedTries), send: E.RetryFeed } },
        on: { RetryFeed: S.LIVE },                                                              // a new session from the watermark
      },
      SIGNED_OUT: {},
      OFFLINE: { on: { Reconnect: { target: S.LIVE, updateMemory: () => ({ feedTries: 0 }) } } },
    },
  }
})
```

**The walk.**

1. LIVE opens a session with `{ epoch: "", after: 0 }`. The server answers `gap` with epoch `e1`, so `Missed { e1 }`
   arrives before any value. The watermark restarts in `e1`, and CATCHING_UP reads history: 40 messages, `through`
   40.
2. Wi-Fi drops: close 1006, `Dropped`, `down`; the lane is `Down`, so `Send` is denied `Offline`. Message 41 is
   posted.
3. After 500 ms, the reconnect starts from the session's last value `{ e1, 40 }`. The server answers `resumed` and
   replays 41.
4. **Quiet reconnect:** had nothing been posted, the connection still opens at the server's `resumed`, and the lane
   is `Live` (finding H1).
5. **Hole:** a gap at 41 (overflow, or an unproven open), then 42 and 43 arrive live. They are held, but `through`
   stays at 40 until the catch-up returns 41.
6. **Failed catch-up:** CATCH_UP_WAIT retries with a budget, then OUT_OF_SYNC. A session started meanwhile resumes
   from 40, so the hole is replayed or reported again: never skipped.
7. **Server reset:** the next resume answers `gap(Reset { e2 })`. The watermark restarts at 0 in `e2`, and dedup by
   `(epoch, seq)` keeps `e2`'s seq 1 apart from `e1`'s seq 1 (finding H4).

**The Story.**

```ts
const server = FakeChatServer({ epoch: "e1", history: 40 })
export const wifiDrop = story
  .machine(RoomMachine, { id: "Chat/wifi-drop", input: { roomId: "r1" }, fixtures: server })
  .process()                                                     // gap(e1) → catch-up → 40 held
  .checkpoint("loaded")
  .control(server.drop({ code: 1006 })).process()
  .checkpoint("down")
  .control(server.post({ text: "while away" }))
  .advance("500 millis").process()                               // backoff (an adapter deadline), resume from { e1, 40 }
  .checkpoint("back")
  .control(server.silence({})).advance("40 seconds").process()   // the half-open check: the deadline fails Dropped { 4000 }
  .advance("500 millis").process()
  .checkpoint("quietBack")                                        // reconnected, nothing new
  .control(server.restart({ epoch: "e2" })).control(server.refuseCatchUp({ times: 1 })).control(server.drop({ code: 1012 }))
  .advance("500 millis").process()                               // gap(Reset e2) → CATCHING_UP → refused → CATCH_UP_WAIT
  .advance("2 seconds").process()                                // the retry succeeds
  .checkpoint("reset")
// loaded.snapshot.memory.through                    → 40
// check(down.snapshot, E.Send({ clientId: "c1", text: "x" }))  → Denied "Offline"
// back.truth.FakeChatServer.connects                → [{ epoch: "", after: 0 }, { epoch: "e1", after: 40 }]
// back.snapshot.memory.through                      → 41
// quietBack.snapshot.activities.feed?.connection    → "Live"
// reset.snapshot.memory                             → { epoch: "e2", through: <e2's history>, … }; state LIVE.SYNCED
```

**What this walk changed in revision 2:** the watermark replaced "highest seen" (C4); `complete` became required and
the gap mapping a tag record; the catch-up became states with a budget; the fake moved below the adapter, so the
heartbeat, the classification and the resume handshake all run in the Story (C6).

### 7.2 Live presence

The adapter folds the server's `presence_state` and `presence_diff` frames per connection, inside `connect`, so the
fold resets on every connection:

```ts
export const presence = stream({                                                                // existing
  id: "chat/presence",
  key: (p: { roomId: string }) => p,
  delivers: "latest",
  subscribe: (p) => Session.reconnect({
    connect: () => Effect.gen(function* () {
      const frames = yield* PresenceSocket.use((s) => s.frames(p.roomId))                       // user-defined: Effect<Stream<Frame>> that succeeds at open
      return {
        claim: Session.open(),                                                                  // latest: claims only open
        values: frames.pipe(
          Stream.scan(new Set<string>(), (set, f) => f.t === "state" ? new Set(f.ids) : applyDiff(set, f)),
          Stream.drop(1),                                                                       // scan emits its seed first; an empty "nobody online" is not a value
          Stream.map((set) => [...set].sort())),
      }
    }),
    position: () => undefined, schedule: backoff, while: isDrop,
  }),
})
ROOM: { activities: { here: O.Chat.presence.subscribe(({ memory }) => ({ roomId: memory.roomId })) } }   // no outcomes: views read the lane
```

```tsx
const here = useView(room, (s) => s.activities.here)
here?.connection === "Live" ? <Avatars members={here.data} /> : <Avatars members={here?.lastKnown ?? []} dimmed />   // NEW (r2)
```

**The walk.** Joins and leaves coalesce into lane publications. On a drop, the lane is `Down` with `lastKnown` and
the view dims it. On reconnect it stays `Opening` until the new connection's first state frame (the bug window of R1
H2), then `Live`. **The Story** (`FakePresence` over the transport, controls `join`, `leave`, `drop`):
`.control(p.drop({})).process()` reads `connection: "Down"`, `lastKnown: ["ana"]`; after the reconnect and before the
state frame it reads `"Opening"`.

### 7.3 Stock ticker, and a quiet feed (revision 2)

```ts
export const Quote = Schema.Struct({ last: Schema.Number, asOf: Schema.Number })                // user-defined: asOf is the exchange's time
WATCHING: {
  activities: { price: O.Market.quote.subscribe(({ memory }) => ({ symbol: memory.symbol }), { outcomes: { value: E.Price.from((q, { live }) => ({ last: q.last, asOf: q.asOf, live })) } }) },   // NEW (r2): live
  schedules: { quiet: { schedule: "5 seconds", send: E.Quiet, armOn: [Flow.entry, E.Price] } },   // existing: armOn, Flow.entry
  on: {
    Price: [
      { target: "self", guard: ({ memory, event }) => (event.live && event.last >= memory.alertAt) || deny("NoAlert"), updateMemory: () => ({ alerted: true, quiet: false }) },
      { target: "self", updateMemory: () => ({ quiet: false }) },
    ],
    Quiet: { target: "self", updateMemory: () => ({ quiet: true }) },
  },
},
```

```tsx
const p = useView(m, (s) => s.activities.price)
const quiet = useView(m, (s) => s.memory.quiet)
p?.connection === "Live" && !quiet ? <Price q={p.data} /> : <Price q={p?.connection === "Live" ? p.data : p?.lastKnown} stale />
```

**The walk.** At 1,000 ticks a second, one `Price` waits and reads the newest quote at admission. Because each quote
carries `asOf`, a repeated price is not an equal value, so a healthy flat market keeps re-arming `quiet`. Without
`asOf` it would be silenced, and `Quiet` would fire on a healthy feed (R1's trap). After a reconnect on a quiet
symbol, the lane is `Opening` with `lastKnown`, not `Live`: the old price cannot read as current. A restored ticker
is the same (rule 51). An alert fires only on a live value.

**The Story** (`FakeQuotes` over the transport): three `frame`s then `process()` give one `Price` with the third;
`advance("5 seconds")` without frames gives `Quiet`; `drop` then reconnect reads `"Opening"` until the next `frame`.

### 7.4 LLM tokens from a `fetch` body, a cut-off answer, and Stop

The transaction is 4.1.10's `generate`; the service is 7.7.1's `Llm`.

```ts
const gen = O.Assistant.generate.commit(({ memory }) => ({ conversationId: memory.conversationId, prompt: memory.draft }), {
  outcomes: {
    success: E.Answered.from((v) => ({ messageId: v.messageId, text: v.text })),
    failure: { Busy: E.TryLater, Refused: E.TryLater, NotSent: E.TryLater },
    unknown: E.AnswerUnsure.from((r, { progress }) => ({ partial: progress?.text ?? "", stopped: r._tag === "Cancelled" })),   // its own Attempt's progress (r2)
  },
})
const conv = ({ memory }) => ({ conversationId: memory.conversationId })
ASKING: { on: {
  Stop: { target: "self", actions: [gen.cancel(conv)] },
  Answered: S.IDLE, TryLater: S.IDLE,
  AnswerUnsure: [
    { target: S.IDLE, guard: ({ event }) => event.stopped || deny("NotStopped"), updateMemory: ({ event }) => ({ partial: event.partial }) },
    { target: S.CUT, updateMemory: ({ event }) => ({ partial: event.partial }) },
  ] } },
IDLE: { on: { Ask: { target: S.ASKING, guard: [gen.idle(conv)], actions: [gen] } } },   // after Stop's ending is admitted, idle: a new Attempt (r2)
CUT:  { on: { Continue: { target: S.ASKING, updateMemory: ({ memory }) => ({ draft: `Continue: ${memory.partial}` }), actions: [gen] } } },   // a new write, not gen.retry: no idempotency key
```

The view reads `s.calls.Assistant.generate.find((l) => l.key.conversationId === id)?.progress?.text` while asking, and
`memory.partial` after. **The walk** is revision 1's. In addition: a stalled body now fails `Stalled`, so it becomes
`unknown`, never a clean end. Pressing Ask again after Stop is admitted (`idle`). **The Story:**
`FakeLlm({ tokens: ["Hel", "lo"], every: "100 millis" })`; `.send(E.Ask()).advance("100 millis").send(E.Stop())
.process()` gives `unknown(Cancelled)` with `partial: "Hel"`; `.send(E.Ask())` is allowed.

### 7.5 Upload progress

Unchanged (revision 1 with the multiplicity audit's `reject` per upload, M6-D5). Progress is the Attempt's (rule 48).
The XHR service's `onabort` must not look like a clean end: the commit treats a missing `Done` as `unknown(CutOff)`.

### 7.6 `listen` feeding entity records, with a drop and a reconnect (revision 2)

The descriptor is 7.7.3's `ticketEvents` over the `Realtime` transport; the activity maps `failure` and `complete`
(4.2).

**The walk.**

1. The queue loads the ticket list. Until the channel's `SUBSCRIBED`, the list is stale with cause `listen`. The
   claim `open()` is unproven, so the list refetches once.
2. Another dispatcher saves t3. The push is applied, and the list repairs by its rules.
3. The channel errors (`CHANNEL_ERROR`), so `down`. The list is stale again with cause `listen` (r2). In revision 1 it
   looked fresh while pushes were not arriving.
4. Meanwhile t2 is deleted on the server.
5. The SDK rejoins (`SUBSCRIBED`, `open()`, `Unproven { Reconnected }`). The list refetches, and t2 leaves.
6. If the channel closes for good (`CLOSED`), `failure: Closed` reaches the machine (required) and the list is stale
   with cause `listen ended` until the machine re-opens the session.

**The Story.**

```ts
const rt = FakeRealtime({ tickets: ["t1", "t2", "t3"] })        // 7.7.3: the transport fake
export const listenReconnect = story
  .machine(QueueMachine, { id: "Queue/listen-reconnect", input: { workspaceId: "w1" }, fixtures: rt })
  .process()
  .control(rt.status({ status: "SUBSCRIBED" })).process()       // unproven open: one refetch
  .control(rt.status({ status: "CHANNEL_ERROR" })).process()
  .checkpoint("down")
  .control(rt.deleteOnServer({ id: "t2" }))                     // truth only: no push while down
  .control(rt.status({ status: "SUBSCRIBED" })).process()
  .checkpoint("healed")
// Domain.entry.get(down, { workspaceId: "w1" }).stale  → [{ cause: "listen" }]
// Domain.entry.get(healed, { workspaceId: "w1" }).data → t1, t3; .stale → false
```

### 7.7 Third-party SDKs (revision 2)

The pattern of revision 1 holds, with three changes:

- **Push SDKs use `Session.push`** instead of a hand-written queue.
- **Each adapter is written over a structural transport service**, which Stories fake.
- **Deadlines fail**, rather than ending the stream.

**Verified against Effect 4.0.5** (EFX), in addition to revision 1's list:
- `Socket.makeWebSocket`, `Socket.readerString`, `socket.writer`, `Socket.SocketError` with
  `reason: SocketCloseError { code }` (`socket/Socket.ts:896`, `:254`, `:104-108`, `:457-468`, `:507`).
- `Socket.WebSocketConstructor` (`:864-875`) and `layerWebSocketConstructorGlobal` (`:877`). A browser socket buffers
  frames and can fail with `SocketReadError` past `highWaterMark` (`:930-947`).
- `Stream.timeoutOrElse` (`Stream.ts:3539`) and `Effect.timeoutOrElse` (`Effect.ts:8866`). `Stream.timeout` ends the
  stream silently (`Stream.ts:3431`).
- `Stream.fromEffectRepeat` (`:478`), `Stream.scan` (`:14214`) and `Stream.drop` (`:11897`).
- `Schedule.max` (`Schedule.ts:856`), `Schedule.exponential` (`:1127`) and `Schedule.recurs` (`:1565`).
- `Effect.forkScoped` (`Effect.ts:18090`), `Effect.forever` (`:15370`), `Effect.ignore` (`:8106`) and
  `Clock.currentTimeMillis` (`Clock.ts:270`).
- `Layer.effect` / `Layer.succeed` with the service first (`Layer.ts:1418-1421`, `:1068`, `:1100`) and `Layer.mergeAll`
  (`:1691`).
- `Schema.fromJsonString` (`Schema.ts:9829`), `Schema.decodeUnknownSync` (`:1872`) and `Schema.Union` (`:4976`).

**From memory, not verified** (no SDK is installed): every SDK detail listed in revision 1, and the `EventSource`
behaviour in 7.7.5.

#### 7.7.1 The OpenAI Node SDK and 7.7.2 the Vercel AI SDK (writes)

Unchanged from revision 1: both implement one `Llm` service, which the commit reads (4.1.10). The fixture is
`FakeLlm`, which already replaces the transport-level service: the commit's terminator check and classification run
in the Story. The only change is that the commit's stall deadline uses `Stream.timeoutOrElse`.

#### 7.7.3 Supabase realtime over `Session.push`

```ts
// realtime.transport.ts: the structural subset of supabase-js this adapter uses (the transport seam, rule 52)
export interface ChannelLike {                                                                  // user-defined
  on(type: "postgres_changes", filter: { event: "*"; schema: string; table: string; filter: string }, f: (p: ChangePayload) => void): ChannelLike
  subscribe(f: (status: string, err?: Error) => void): ChannelLike
}
export class Realtime extends Context.Service<Realtime, {                                       // user-defined
  readonly channel: (name: string) => ChannelLike
  readonly removeChannel: (c: ChannelLike) => Promise<unknown>
  readonly onSignedOut: (f: () => void) => () => void
}>()("app/Realtime") {}
export const SupabaseRealtime = (supabase: SupabaseClient) => Layer.succeed(Realtime, {
  channel: (name) => supabase.channel(name),
  removeChannel: (c) => supabase.removeChannel(c as RealtimeChannel),
  onSignedOut: (f) => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_OUT") f() })
    return () => data.subscription.unsubscribe()
  },
})

// tickets.operations.ts
export class RealtimeDown extends Data.TaggedError("RealtimeDown")<{ readonly status: string; readonly message?: string }> {}   // user-defined
export class Closed extends Data.TaggedError("Closed")<{}> {}
export class SignedOut extends Data.TaggedError("SignedOut")<{}> {}

export const ticketEvents = stream({                                                            // existing
  id: "DispatchDesk/ticket-events",
  key: (p: { workspaceId: string }) => p,
  delivers: "every",
  subscribe: (p) => Session.push<TicketEvent, RealtimeDown, never, Closed | SignedOut, Realtime>((emit) =>   // NEW (r2)
    Effect.gen(function* () {
      const rt = yield* Realtime
      yield* Effect.acquireRelease(
        Effect.sync(() => rt.channel(`tickets:${p.workspaceId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `workspace_id=eq.${p.workspaceId}` },
            (c) => emit.value(toTicketEvent(c)))                                                // user-defined decoding
          .subscribe((status, err) => {
            if (status === "SUBSCRIBED") emit.open()                                            // the claim at open: no replay, so unproven
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") emit.down(new RealtimeDown({ status, message: err?.message }))
            else if (status === "CLOSED") emit.fail(new Closed({}))                             // after release, emit does nothing (rule 44)
          })),
        (channel) => Effect.promise(() => rt.removeChannel(channel)))                           // awaited before a new session joins the topic
      yield* Effect.acquireRelease(Effect.sync(() => rt.onSignedOut(() => emit.fail(new SignedOut({})))), (off) => Effect.sync(off))
    }), { capacity: 1_000 }),                                                                   // a burst past 1,000 becomes Overflow, then refetch
})
```

```ts
// fixtures/fake-realtime.ts
export const FakeRealtime = (o: { tickets: ReadonlyArray<string> }) => Fixture.stateful({
  id: "FakeRealtime",
  truth: TicketTruth(o),
  controls: {
    status: Schema.Struct({ status: Schema.String }),                                           // fires the channel's status callback
    change: ChangePayloadSchema,                                                                // updates truth, then fires the change callback
    deleteOnServer: Schema.Struct({ id: Schema.String }),                                       // truth only (no callback)
    flood: Schema.Struct({ count: Schema.Number }),                                             // fires `count` change callbacks in one tick
    signOut: Schema.Struct({}),
  },
  layer: (truth, controls) => Layer.mergeAll(
    Layer.effect(Realtime, makeFakeRealtime(truth, controls)),                                  // user-defined: a ChannelLike per channel()
    Layer.succeed(TicketApi, ticketApiFromTruth(truth)),                                        // the list's reads
  ),
})
// .control(rt.flood({ count: 1_200 })).process() → one Overflow gap (200 lost) → the covered answers refetch
```

- **Signals:** the SDK's status callback (from memory: realtime-js rejoins by itself). Each rejoin is unproven.
- **Release before restart:** `removeChannel` is awaited before the same topic is joined again (rule 44), and a late
  `CLOSED` from the removal reaches nobody.
- **Overflow is now testable:** `flood` exercises `Session.push`'s bound, because the fake sits below it.

#### 7.7.4 Firebase `onSnapshot` over `Session.push` (a `latest` stream)

```ts
export class Snapshots extends Context.Service<Snapshots, {                                     // user-defined transport subset
  readonly members: (roomId: string, next: (s: { fromCache: boolean; members: ReadonlyArray<Member> }) => void, error: (code: string) => void) => () => void
}>()("app/Snapshots") {}
export const FirestoreSnapshots = (db: Firestore) => Layer.succeed(Snapshots, {
  members: (roomId, next, error) => onSnapshot(collection(db, "rooms", roomId, "members"), { includeMetadataChanges: true },
    (snap) => next({ fromCache: snap.metadata.fromCache, members: snap.docs.map((d) => toMember(d.data())) }),
    (e) => error(e.code)),
})

export const roomMembers = stream({                                                             // existing
  id: "rooms/members",
  key: (p: { roomId: string }) => p,
  delivers: "latest",
  subscribe: (p) => Session.push<ReadonlyArray<Member>, FromCache, never, MembersDenied | MembersFailed, Snapshots>((emit) =>
    Effect.gen(function* () {
      const s = yield* Snapshots
      yield* Effect.acquireRelease(
        Effect.sync(() => s.members(p.roomId,
          (snap) => {
            if (snap.fromCache) emit.down(new FromCache())                                       // a value from the cache is "between" (4.1.2)
            else emit.open()                                                                    // a server-confirmed snapshot opens
            emit.value(snap.members)
          },
          (code) => emit.fail(code === "permission-denied" ? new MembersDenied() : new MembersFailed({ code })))),
        (unsubscribe) => Effect.sync(unsubscribe))
    }), { capacity: 2 }),                                                                        // latest: the newest survives; signals are never evicted
})
```

A cached snapshot updates `lastKnown` while `Down`. The first server snapshot opens the connection and makes the lane
`Live`. The `open()` emitted on each later server snapshot is an extra claim inside an open connection and is ignored
(4.1.2), so the adapter need not track state. Revision 1's `"sliding"` buffer could evict the `down` and keep the
value; `Session.push` cannot.

#### 7.7.5 Server-Sent Events (`EventSource`) (revision 2, new)

```ts
export class Sse extends Context.Service<Sse, {                                                // user-defined transport subset
  readonly open: (url: string) => EventSourceLike                                              // { readyState, onopen, onmessage, onerror, addEventListener, close }
}>()("app/Sse") {}

export const notes = stream({                                                                   // existing
  id: "notes/feed",
  key: () => ({}),
  delivers: "every",
  subscribe: (p: { after: number }) => Session.push<Note, Reconnecting, Reset, Closed, Sse>((emit) => Effect.gen(function* () {
    const sse = yield* Sse
    yield* Effect.acquireRelease(Effect.sync(() => {
      const es = sse.open(`/notes?after=${p.after}`)                                           // a new EventSource cannot set Last-Event-ID: the watermark goes in the URL
      es.addEventListener("hello", (e) => {                                                     // the server's in-band answer: the only proof (4.1.4)
        const h = JSON.parse(e.data)
        if (h.resumed) emit.resumed(); else emit.gap(new Reset({ epoch: h.epoch }))
      })
      es.onmessage = (e) => emit.value({ id: Number(e.lastEventId), body: e.data })
      es.onerror = () => es.readyState === 2 /* CLOSED */ ? emit.fail(new Closed({})) : emit.down(new Reconnecting({}))
      return es
    }), (es) => Effect.sync(() => es.close()))
  }), { capacity: 1_000 }),
})
```

- **The browser reconnects inside one `EventSource`** and sends `Last-Event-ID` itself, using the server's `retry:`
  delay. Neither is visible to the adapter, so a Story cannot drive the real browser's timing. It drives the fake's
  `onerror`/`hello` instead. Proof comes only from the server's `hello` on each connection: `resumed` if it honoured
  `Last-Event-ID`, `gap` otherwise. A server that sends no `hello` gets `open()` semantics: the adapter emits
  `emit.open()` from `onopen` instead.
- **When the browser gives up** (`CLOSED`: a non-200 or the wrong content type, reason hidden), the session fails
  `Closed` and the machine decides (4.3.4). A new session's `EventSource` carries the watermark in its URL.
- A `contiguous(last, first)` check could prove continuity from the first value instead of a `hello`. It is open
  question R2.2.

#### 7.7.6 What the SDKs confirm (revision 2)

- `Session.reconnect` is used where the adapter must reconnect: WebSocket, `fetch` polling. `Session.push` is used
  where the SDK reconnects by itself: Supabase, Firestore, SSE. Both make the claim structural.
- No SDK type crosses the transport service. Each fake sits below the adapter, so classification, overflow, decoding,
  heartbeats and handshakes run in Stories.
- Cancellation is Effect interruption: the commit's `signal`, or a finalizer (`removeChannel`, `unsubscribe`,
  `close`), awaited before a restart.

### 7.8 Cursors: outbound state with `publish` (revision 2, proposed)

The descriptor and activity are 4.1.9's. **The walk.** Each `Moved` writes `memory.myCursor`. After each committed
turn, Flow offers the changed value to the session, and the adapter writes it on the socket. A drop and reconnect
re-sends the current cursor on the new connection, unasked. While `Down`, moves only update memory. Nothing creates an
Attempt, a turn per send, or an ending. **The Story:** `FakeCursorServer` over `Socket.WebSocketConstructor` records
received frames in its truth: `.send(E.Moved({ x: 1, y: 2 })).process()` then `.control(server.drop({ code: 1006 }))
.advance("500 millis").process()` gives `truth.received` → `[{ x: 1, y: 2 }, { x: 1, y: 2 }]`, the second from the
new connection.

## 8. Alternatives considered

- **A1. Flow re-opens sessions** (a `retry` policy on the descriptor). Rejected: rule 25, configuration on a
  descriptor, and SSE reconnects regardless.
- **A2. A session is one connection, and every reconnect is the machine's** (CALL/WAIT for every drop). Rejected: the
  lane vanishes while waiting (OPS:160-162), SSE's built-in reconnect cannot be expressed, and every feed needs two
  states for a Wi-Fi blip. Kept for decisions (4.3.4).
- **A3. Status inside the value** (SE's workaround). Rejected: the store cannot act on it, `flow check` cannot see it,
  and each adapter spells it differently.
- **A4. Delivery chosen by the mapping** (today, OPS:126-130). Rejected: G1.
- **A5. Delivery chosen per activity.** Rejected: what a value is belongs to the data, so it sits on the descriptor
  (locality).
- **A6. A Flow-held cursor** (`position` on the descriptor; Flow dedups and passes it to the next session). Rejected:
  Flow would compare author positions (string order is collation, ED avoids it), the cursor would be a second truth
  beside memory, and advancing it at handling is exactly what a memory write already does.
- **A7. Late routing for stream deliveries after release.** Rejected: a session owes nothing after release, every feed
  would need late handlers (rule 20), and memory plus continuity already make nothing silently lost.
- **A8. Gaps only on re-opens.** Rejected by the chat and `listen` walks (first-live race).
- **A9. Gaps on the unknown channel with `Flow.uncertain`.** Rejected: reads have no unknown; the reason says whether
  the loss is known.
- **A10. A streaming write as a stream plus a transaction.** Rejected: two owners for one write, no Attempt on the
  stream, and a cut-off could not be `unknown`.
- **A11. Progress as `every` deliveries** (an event per token). Rejected: a turn per token at 100 a second, and the
  ending already carries the whole result.
- **A12. Connection changes as mapped events.** Rejected for now: guards and views read the lane, the adapter's give-up
  is a failure the machine maps, and no walk needed a turn on `down`.
- **A13. A `receivedAt` lane field.** Rejected: the ticker walk; the server's timestamp is the source.
- **A14. Persisting queued deliveries.** Rejected: they belong to a session that a reload ends; resume and continuity
  cover them.
- **A15. Sharing one session between two activities of one actor.** Rejected: each activity maps its own outcomes, so
  one value would become two events; two connections are the author's to choose explicitly (different keys), and one
  shared socket is the adapter's multiplexing (also the answer to SSE's six-connection limit, GAPS "Smaller").

Revision 2 also considered these:

- **A16. Emit `open` before a connection's first element** (revision 1's combinator). Rejected by finding H1: a quiet
  connection never opens. Replaced by the opened-connection shape (M6-D8).
- **A17. One lane field `fresh: boolean` beside `data`.** It is correct but easy to ignore. The common mistake,
  rendering a stale value as current, stays legal. Rejected in favour of typing `data` out of the non-live states
  (M6-D9; open question R1.1).
- **A18. `Open` means a value arrived since the open, on every kind** (R1 H2's first proposal). Rejected for `every`:
  an `every` feed is live from its claim, because its facts go to memory, not to a displayed value. Kept for `latest`.
- **A19. Treat a snapshot as `resumed` on `every`.** Rejected (finding H3): a snapshot omits the facts in between.
- **A20. A Flow-held watermark** (Flow tracks `(epoch, seq)` per activity and passes it). Rejected, as A6 was: it
  would make Flow compare author positions, and the watermark's advance is a memory write the machine already makes.
  Rule 45 states the meaning instead.
- **A21. Require `complete` mapped, instead of `ConnectionEnded`** (R1's second option for the clean close). Revision
  2 does both: a connection's clean end goes to `while`, and an `every` session's `complete` is required. Either alone
  leaves a hole: without `while`, a deploy's clean close ends every feed; without the requirement, a source that ends
  for real leaves its state waiting.
- **A22. `Session.push` with a `delivers` option for its overflow policy.** Rejected: the sliding buffer with a loss
  marker is correct for both kinds, so the option would be configuration with one right value.
- **A23. Outbound sends as transactions** (`concurrency: "latest"`, a mapping-less commit, R1 H7 option a). Rejected:
  an Attempt, an ending turn and a lane row per cursor move at 30 Hz, and nothing re-sends after a reconnect.
- **A24. Fake the adapter's service in Stories** (revision 1). Rejected by finding H6: overflow, classification,
  heartbeats and handshakes never ran.

## 9. Open questions (revision 2)

Revision 1's Q1–Q4 are decided (M6-D3, M6-D4). Revision 2 leaves five choices between options that are equally
correct. They are asked in rounds; reply `R1.1 A`.

### Round 1: the lane

**R1.1 How does a lane say its value is not current?**

```ts
// A (recommended): data exists only while Live
lane.connection === "Live" ? show(lane.data) : showDimmed(lane.lastKnown)
// B: one field, and a flag
lane.fresh ? show(lane.data) : showDimmed(lane.data)
```

Both are correct. A makes the common mistake, rendering an old price as live, a type error. B is one name fewer.
*Recommendation: A.*

**R1.2 The name of the live state.** A: `"Live"` (recommended). The meaning changed (for `latest`, a value arrived on
this connection), so a new word stops readers carrying revision 1's "the transport is open". B: keep `"Open"` with
the new meaning.

### Round 2: adapters

**R2.1 Outbound state** (`publish`, 4.1.9, rule 53).

```ts
// A (recommended): declared, latest-wins, re-sent on every connection
others: O.Doc.cursors.subscribe(params, { publish: ({ memory }) => memory.myCursor })
// B: out of scope in version 1; an app writes it from the adapter's own service, outside Flow and Stories
```

*Recommendation: A.* The re-send after a reconnect is the bug every hand-written version has, and A's cost is one
optional key on the descriptor and one on the activity.

**R2.2 Proving continuity from the first value** (SSE, 7.7.5). A (recommended): only an in-band answer proves it
(`hello`, `{ t: "resumed" }`); a server without one gets `Unproven` on every reconnect. B: add
`contiguous: { check: (last, first) => boolean, within: Duration }` to `Session.reconnect` and `Session.push`. It
holds the claim until the first value proves contiguity, or `within` passes. B saves one catch-up read per blip on
servers that cannot send a `hello`, at the cost of a delayed claim and a second way to prove. *Recommendation: A, and
add B if a real server needs it.*

**R2.3 When `Session.reconnect`'s schedule restarts.** A (recommended): at every open (4.1.3). B: only after a
connection has stayed open for a minimum time, which is a new option. A server that accepts and drops at once is
paced by the schedule's first delay under A, and backs off fully under B. *Recommendation: A, because the adapter
can add a minimum itself.*

## 10. Decisions

Settled by the owner on 2026-10-30: the proposal is accepted with its recommendations, and these decisions.

- **M6-D1 `stream()` carries server-pushed data;** a write reports on itself through `progress`. Data the server pushes
  independently of any write (chat, presence, prices, `listen`) goes through `stream()`. A streaming write (an LLM
  answer, an upload) stays a transaction with its Attempt and endings, and its commit reports `progress(value)` from what
  the request already knows (XHR upload events, the text accumulated from the body); Flow counts nothing. Rejected:
  routing all incremental data through `stream()`, because upload progress has no server stream and progress belongs to
  one write's lifetime and ending.
- **M6-D2 The contract stays "`subscribe` returns an Effect `Stream`".** Any third-party SDK reaches it through
  `Stream.fromAsyncIterable`, `Stream.fromReadableStream` or `Stream.callback`, inside an Effect service the author
  writes; 7.7 shows OpenAI, the Vercel AI SDK, Supabase realtime and Firestore. The one change those cases forced (only a
  session's first value implies `open`; a value while `Down` updates data, not `connection`) is kept. Rejected:
  accepting non-Effect shapes in `subscribe` directly (the owner is content with Effect wrappers).
- **M6-D3 `Session.reconnect` ships as designed (Q1),** marked for the owner's later review.
- **M6-D4 Q2–Q4 take their recommendations:** progress is a read and the ending mapper's `progress`, not a mapped event;
  `every` delivers one value per turn; the names are `delivers` and `connection`. *Superseded in part by M6-D5
  (2026-10-31): the read's spelling and where it exists.*
- **M6-D5 (Revision (multiplicity audit, 2026-10-31); supersedes M6-D4's `x.progress(g | s, key)`).** Progress is still a read and the mapper's
  `progress`, not a mapped event. The read is the lane row's `progress` in `s.calls` (the design's D18), and it exists
  only under `reject`, `latest` and `cancel`, where a lane has one addressable Attempt (the design's rule N2, D20);
  declaring `progress` on an `allow` or `serialize` transaction is a type error. Reason: the upload walk was `allow`,
  so two uploads of one `ref` shared a lane and the bar showed the newer one's progress
  ([audit-multiplicity.md](../audit-multiplicity.md) F1). Consequence: 7.5's upload is `reject` per upload.
- **M6-D6 (Revision (multiplicity audit, 2026-10-31); new).** Two sessions of one `listen` entry on one key in one Runtime are two sources: both apply,
  either's gap lowers frontiers, and `flow check` warns `DuplicateListen` (rule 49). Reason: Operations O4 gives each
  actor its own session, and 4.1.7's "one consumer" did not say what two sessions feeding one store do (audit F10).
  Open for the owner: sharing one `listen` session per Runtime, as resources share requests.
- **M6-D7 (Revision (multiplicity audit, 2026-10-31); new).** A keyed activity (the design's 2.7.10) holds one session per key; two keys projecting one
  descriptor key are `DuplicateSession` for the later key (rule 47). Reason: per-row live data (a watchlist) needs one
  session per row, and rule 47 must say what a collision within one activity does (audit F8).


**Proposed in revision 2, not accepted.** These supersede parts of accepted decisions. They change nothing until the
owner accepts them.

- **M6-D8 (proposed; supersedes M6-D3 in part).** `Session.reconnect` changes in three ways:
  - `connect` returns an Effect of the opened connection, `{ claim, values }`;
  - a connection whose values complete is offered to `while` as `ConnectionEnded`;
  - the schedule restarts at each open.

  **Reason:** root cause C1. Emitting `open` before a connection's first element left a quiet connection unopened, so
  the `listen` frontier was never lowered and a deleted record stayed shown (R1 H1). C5 adds that a server's clean
  close silently ended the feed. M6-D3's "ships as designed, for the owner's later review" stands for everything
  else, and the combinator is still the owner's to review.
- **M6-D9 (proposed; supersedes M6-D2's lane clause, not its contract).** The stream lane is typed by kind and
  freshness (4.1.5):
  - a `latest` lane has `data` only while `connection === "Live"`, which needs a value on the current connection,
    and `lastKnown` otherwise;
  - an `every` lane has no data.

  M6-D2's "a value while `Down` updates data, not `connection`" becomes "updates `lastKnown`". M6-D2's contract,
  "`subscribe` returns an Effect `Stream`", stands. **Reason:** root cause C2. After a reconnect the lane read `Open`
  with the old connection's data, so a quiet ticker showed an old price as live (R1 H2).

M6-D1, M6-D4, M6-D5, M6-D6 and M6-D7 stand. Revision 2 states M6-D5's progress per Attempt (rule 48). That is how
"the addressable Attempt's progress" is kept when a superseded Attempt ends, not a change to M6-D5.

## 11. If declarations move onto the definition (operations-in-definition)

OID (being revised) proposes declaring every server interaction once, under the definition's `operations`, and
placing it in a state's `activities`. This design does not depend on where declarations live. Under OID these would
change spelling, not meaning:

| Here | Under OID |
| --- | --- |
| a module-level `stream({ … })` with `outcomes` mapped at the activity | the contract stays module-level (`stream`, OID 3.1); the site under `operations` maps `value`, `gap`, `complete`, `failure` |
| `activities: { feed: O.x.subscribe(params, { outcomes, publish }) }` | `activities: [O.feed.params(select, { when? })]`; `publish` moves to the site, or stays with the placement (an OID question) |
| `s.activities.feed` (the typed lane, 4.1.5) | `s.operations.feed`, with OID's `Inactive` row while no placement is active |
| `DuplicateSession` (rule 47) for two activities on one descriptor and key | a construction error, `DuplicatePlacement` (OID B12), for one site placed twice; two sites on one contract and key remain `DuplicateSession` |
| `DuplicateListen` (rule 49) | unchanged in meaning; named by site |
| progress in `s.calls.X.y` rows (rule 48) | `s.operations.y.progress` |
| rule 50's required mappings, checked at the activity | checked at the site's declaration |

The adapter vocabulary (`Session.*`), the connection grammar, the lane's typing, the watermark, `listen`'s staleness
and the lifecycle table (4.5) are untouched by OID.

### 11.1 To explore: a manual reconnect member (owner, 2026-10-30; not decided, parked with streams)

Under operations-in-definition (OD2), a stream is placed with its contract's own verb, `O.feed.subscribe(select)`.
A stream has no manual member today: `Session.reconnect` reconnects inside a session, and a machine reconnects by hand
by leaving and re-entering the placing state (7.1: `LOST` → `LIVE`). Open: whether a "Reconnect now" control that
does not leave the state is needed. If it is, the member is named `reconnect`, not `refetch` (a resource word).

```ts
// today: leave the state and come back
LOST: { on: { RetryFeed: S.LIVE } }
// to explore: a member
ReconnectNow: { target: "self", actions: [O.feed.reconnect] }   // NEW, proposed: reconnect
```

## New keywords

| Keyword | Meaning |
| --- | --- |
| `delivers: "every" \| "latest"` | what a stream's values are: facts delivered one by one, or the current state (rule 39) |
| `Session` | the adapter vocabulary: `open`, `resumed`, `gap(reason)`, `down(reason)` (rule 40) |
| claim (r2) | a connection's first signal, made when its transport opens: `open`, `resumed` or `gap` (rule 40) |
| `Session.reconnect` | the combinator that reconnects inside one session; `connect` returns `{ claim, values }` (rule 43, r2) |
| `Session.ConnectionEnded` (r2) | offered to `while` when a connection's values complete |
| `Session.push` (r2) | the bounded push boundary for callback sources; loss becomes `Overflow`; signals are never evicted (rule 52) |
| `Session.Emit` (r2) | `push`'s synchronous `value / open / resumed / gap / down / fail / end` |
| connection | a running stream lane's `"Opening" \| "Live" \| "Down"` (r2: `"Live"` was `"Open"`) |
| `lastKnown` (r2) | a `latest` lane's last value while it is not `Live` |
| gap | a delivery saying the session may have missed values: the adapter's reason, `Unproven` or `Overflow` (rule 41) |
| `Unproven { why }` | Flow's gap reason for an unproven claim: `"Opened"` (the session's first connection) or `"Reconnected"` |
| `Overflow { lost }` (r2) | Flow's gap reason for values `Session.push` dropped |
| watermark (r2) | a resume parameter: every fact at or before it is held (rule 45) |
| `listen` stale cause (r2) | an answer's push channel is not live, or has ended (rule 49) |
| `publishes`, `publish`, `published` (r2, proposed) | outbound latest-wins state on a session (rule 53) |
| `ExtraClaim`, `NoClaims` (r2) | Inspection evidence for adapter claim defects |
| `DuplicateSession` | Flow's failure reason for a second same-actor session on one descriptor and key (rule 47) |
| `DuplicateListen` | a `flow check` warning: two actors can hold sessions of one `listen` entry on one key (rule 49) |
| progress | what a streaming write reports before its ending, stored per Attempt (rule 48) |
| resume parameter | a stream parameter outside its key that says where a new session starts: a watermark (rule 45) |
