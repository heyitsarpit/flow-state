# Proposal: streams (merge 6)

Status: **revision 1 accepted by the owner on 2026-10-30, with decisions M6-D1–M6-D7 (section 10). Revision 2
(2026-10-31) answered [review 1](reviews/review-1.md); its M6-D8 and M6-D9 are proposed. Revision 3 (2026-10-31) is
proposed, not accepted.** Nothing here edits a `.plan` file or machine-design.md; section 6.4 lists the amendments.
All syntax is a working draft.

**What revision 3 changed, and why.** Two things. **(1) A rebase.** machine-design.md now contains merges 1, 2, 4
and 5 and operations-in-definition (OD1–OD26). A stream is a contract with flat `input` and `output` and a required
`key` (OD12, OD14, OD23 Q38); it is declared by name under the definition's `operations` and mapped with `.outcomes`
(OD3); the machine places it with `activities: [O.feed.subscribe(select)]`, or one session per key with
`subscribe.each` (OD2, OD9 Q22); views and guards read `s.operations` (rule 42). Every example, rule and amendment is
rewritten in that spelling. What the merged design already settles (keyed activities, `s.calls`, `DuplicatePlacement`,
the mapper's `{ input }`, where mappings live) is removed from here, rules are renumbered 48–61 after MD's 47, and
section 11 now maps the proposal onto the merged design instead of guessing at it. **(2) A root-cause revision.**
[Review 2](reviews/review-2.md)'s eight highs and its mediums come from six causes (C8–C13, section 0.1). Each is fixed
at the cause, as one API: a claim promises registration and every input has one conservative meaning; health needs a
duration; the bound belongs to the session; a gap is a debt with exactly three discharges; freshness has one
discriminant and no side exits; additions without a lifecycle are cut. Net effect: `Emit`'s seven methods,
`Session.cached`, the mapper's `live`, `DuplicateSession` as a failure, `ExtraClaim`, `progress.sync`, the `hold`
algorithm and three of chat's states are gone; `publish` is deferred; `capacity` moves to the contract with a default,
`resumed` takes a witness, `Session.reconnect` gains `stableAfter`, and the lane has one discriminant. The chat machine
goes from about 110 lines to 65, with no algorithm left in it.

**Marks in code** (AGENTS.md, "Showing designs"): `// NEW` is added by this proposal, `// NEW (r2)` by revision 2,
`// NEW (r3)` by revision 3, `// RENAMED` is a renamed word, `// NEW MEANING` is an existing word whose meaning
changes, `// existing` is design already in machine-design.md or the plans, `// user-defined` is the author's own
name. A line with no mark is ordinary Effect or TypeScript.

Short names for citations (all under `workflow/plans/flow/`):

| Short name | File |
| --- | --- |
| GAPS | `references/explorations/machine-fragments/merge-6-streams/gaps.md` |
| R1, R2 | `references/explorations/machine-fragments/merge-6-streams/reviews/review-1.md`, `review-2.md` |
| OPS | `Operations.plan` |
| MCH | `Machines.plan` |
| MD | `references/explorations/machine-fragments/machine-design.md` (merges 1, 2, 4, 5 and operations-in-definition) |
| OD | `references/explorations/machine-fragments/merged/operations/decisions.md` (OD1–OD26, merged) |
| OID | `references/explorations/machine-fragments/merged/operations/proposal.md` (the record, merged) |
| M3 | `references/explorations/machine-fragments/merged/stories/proposal.md` (being revised, not accepted) |
| M4 | `references/explorations/machine-fragments/merged/entities.md` (accepted) |
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
| TQ | `codebases/tanstack-query/packages/query-core/src/` |

"Flow" means Flow's own runtime: nothing in Flow reads an HTTP status, a close code or an author error type
(MD 2.7). "The adapter" is the contract's `subscribe` (or `commit`) and the Effect services it calls.

## 0. Root causes

### 0.1 Revision 3: review 2's findings by cause (proposed)

Review 2 found 8 highs, 8 mediums, 4 lows and an authoring section. They come from six causes. Each row names the
cause, the findings it explains, and the one change that removes it. The rest of the document applies these changes;
[reviews/review-2.md](reviews/review-2.md) is the source, and every row of it appears here.

| # | Root cause | Findings it explains (R2) | The change that removes it (proposed) |
| --- | --- | --- | --- |
| C8 | **A claim said *when*, not *what*.** Revision 2 anchored the claim to a transport event ("made when the transport opens"). An event has no meaning to repeat, to miss, or to wait for, so the grammar had to *ignore* what did not fit, and ignoring fails open | H3 an extra claim is ignored on `every`; H7 no claim moment for SDKs without a subscribe ack; M values before a claim break "the gap comes first"; authoring: `down` with no claim afterwards; L `ExtraClaim` fires on Firestore; M `resumed` on `latest` does nothing | **A claim promises registration**: from the claim on, every fact the source produces reaches this connection, in order. The adapter claims when it knows that, never earlier (7.7.5 for SDKs without an ack). **Every input has one meaning in every connection state, and the conservative one** (the connection table, 4.1.2): a claim while `Live` is a new connection; a value with no claim since a `down` arrives behind an `Unproven` gap; nothing is ignored. `resumed` on `latest` restores the session's last value (rules 49, 50) |
| C9 | **Health was read from a moment, not from a duration.** "It opened" was taken to mean "it works" | H1 the reconnect budget resets on every open | **A connection is healthy once it has stayed up for `stableAfter`** (default 10 s); only then does `Session.reconnect`'s schedule restart (4.1.3, rule 52). Effect's own `Stream.retry` resets at the first element (EFX `Stream.ts:10489`, `Channel.ts:8089-8092`), which loops on a server that greets and drops |
| C10 | **The bound belonged to one constructor, not to the session.** Revision 2 bounded `Session.push` and nothing else, and counted signals as if they could not pile up | H5 bounds exist only on `Session.push` (a browser socket buffers without limit; a flapping SDK's signals grow without limit); authoring: default `capacity` | **One bound per session, `capacity`, on the contract**, with a default by kind (1,000 on `every`, 1 on `latest`). Pull sources wait at the bound; push sources lose into one `Overflow` gap; a transport's own buffer is bounded and its overflow is a drop. **Signals take no buffer**: the connection state is a register, and adjacent gaps are one gap (4.1.6, rule 56) |
| C11 | **A gap had no single debt and no single discharge.** Rule 45 stated a property ("a watermark") and left the algorithm to each author, who inferred holes from positions | H2 the watermark does not discharge (a partial page, a late page from an old epoch, sparse positions, a reload mid-catch-up, `from` ignoring a reset); H8 a feed with no read endpoint and no `hello` can never discharge `Unproven`; M out-of-sync chat has no exit and `held` is never pruned; authoring: the 110-line recipe | **A delivered gap is a debt; the resume position freezes until one of three things discharges it**: a catch-up *started after the gap* that says it is complete; a new session started from the frozen position, which by rule 50 proves continuity or gaps again before any value; or acceptance, where no repair exists. No hole is ever inferred from positions. A claim may carry `at`, so in-session resume follows a reset. The debt is a **state** (`OWED`), so persistence and schedules carry it across a reload. Feeds without a `hello` prove continuity by contiguity in the adapter (4.3.2, rule 54, 7.1, 7.7.4) |
| C12 | **Freshness was typed on the lane but leaked through every other exit**: the union had no shared discriminant, `lastKnown` was assignable as a value, the mapper passed stale values on with a flag, release left no state to read, and equality could hold a lane back | H6 the typed lane does not compile, and still renders stale as fresh; H4 a released `listen` stays fresh; M a cached value goes through the mapper as fresh; M `latest` can stay dimmed forever (equality holds a reconnect `Opening`); M page wake | **One discriminant, `_tag`**, on every variant; **`lastKnown: Stale<A>`** (`{ value, since }`), never assignable as an `A`; **a `latest` value reaches the machine only while `Live`** (the mapper's `live` and `Session.cached` are cut); equality gates deliveries, never lane state; **a `listen` answer is fresh only while every session covering it is `Live`**, so release and end make it stale; page wake is the heartbeat's overdue deadline, as Machines O5 already fires overdue schedules (4.1.5, 4.2, rules 55, 58) |
| C13 | **Additions without a lifecycle.** Things were added for one walk and never given an end, a restore or a rate | M `publish`: no end (ghost cursors), restored state republished, a turn per move at 30 Hz; M `progress(v)` is awkward from DOM callbacks; authoring: `Emit` has seven members, `publishes` is a third schema, `Session.cached` | **Cut or defer**: `publish` is deferred to its own proposal (Q11); callback sources reach `progress` through Effect's own `Stream.callback` (7.5), so there is no `progress.sync`; `Emit` becomes `emit(item)`, `emit.fail`, `emit.end`, reusing the `Session` signals (4.1.6) |

Two kinds of finding are not causes. **Errors in examples** (R2 Low): `new SignedOut({})` on a `Data.TaggedError<{}>`
and `Stream.scan(new Set())` do not compile (`Stream.scan`'s seed is a `LazyArg`, EFX `Stream.ts:14214`); errors are
now `Schema.TaggedError` classes (OD12) and the seed is `() => new Set<string>()`. `ConnectionEnded` is unreachable on
the WebSocket path because Effect's sockets fail on every close, clean or not (EFX `socket/Socket.ts:444-452`); that
is now stated (4.1.3). **Story controls** (R2 M: withhold a `hello`, hold a catch-up, reorder frames, background a
page) are what C8 and C11 need to be tested; 7.0 adds them.

### 0.2 Revision 2's causes (C1–C7), and what revision 3 keeps

| # | Revision 2's cause and fix | In revision 3 |
| --- | --- | --- |
| C1 | A connection was never a unit; each connection starts with exactly one claim | **kept, re-founded by C8**: the claim's meaning, not its moment, defines the connection |
| C2 | Liveness and freshness were one field; the lane is typed by freshness | **kept, completed by C12** |
| C3 | `resumed` was not defined against a position or a kind | **kept**; C8 adds the required witness |
| C4 | The resume position had no meaning; it is a watermark | **replaced by C11**: a watermark with a debt and three discharges |
| C5 | The lifecycle edges had no stated meaning; one table gives every edge its meaning | **kept** (4.6), with release and adoption rows rebased onto the merged design |
| C6 | The push boundary and the clock were each adapter's business | **kept for transports and the clock; the bound moves to the session (C10)** |
| C7 | Data flowed only inward; `publish` | **deferred (C13, Q11)** |

**What revision 3 keeps unchanged from revision 2:** the four signals, `delivers`, the three layers, `progress` on
writes, transport services and Story fakes below the adapter, Effect's `Clock` for adapter time, `Session.reconnect`'s
opened-connection shape, "a deadline fails, never completes", release before restart, and Flow keeping no cursor.

### 0.3 The rebase: what the merged design now settles

| Revision 2 had | The merged design settles it as | So revision 3 |
| --- | --- | --- |
| `stream({ id, key: (p) => …, result, subscribe })` | `input`, `output`, `key: ["field"]` (OD4, OD12, OD14); `key` required on streams, `[]` for one session (OD23 Q38); the resume position is an input field outside the key (OD12) | spells every contract that way; drops its own amendment to OPS O1's key rule |
| `outcomes` on the activity | mappings only on the definition, `name: contract.outcomes({ … })` (OD3, OD17 Q16, MD rule 40) | moves every mapping; rule 59 is checked at the operation |
| `activities: { feed: O.x.subscribe(params, { outcomes }) }` | `activities: [O.feed.subscribe(select)]`, a list of placements (MD rule 41) | uses it |
| keyed activities (M6-D7) | `O.x.subscribe.each(select)`; two selected inputs with one key are one session (OD9 Q22, MD rule 41, 2.7.10) | removes M6-D7's `DuplicateSession` clause (10) |
| `s.activities.feed`, `s.calls.X.y` | `s.operations.feed`, `undefined` while not placed; `O.x.get(s, k)` (MD rule 42, 2.7.5) | reads lanes there |
| mapper `(value, { params, key })` | `(value, { input, key })` (OD12) | uses it |
| two activities on one descriptor and key | `DuplicatePlacement` for one operation placed twice (OD17 Q14, MD rule 41) | cuts `DuplicateSession` as a failure; two operations on one contract and key are two sessions and a warning (M6-D15) |
| progress read from `s.calls` | the write row carries `progress?` (MD 2.7.3 table, 2.7.5) | reads `O.gen.get(s, k)?.progress` |
| Stop leaves the lane free under `reject` (revision 2, 4.1.10) | `cancel` in `InFlight` retains `unknown { Cancelled }`, so the lane is `Held` until `retry` or a second `cancel` (OD5, OD7, MD rule 24) | **follows the merged design**: 7.4 releases the hold with `cancel` in the ending's handler before the next Ask |
| write lanes per actor | Runtime-owned write lanes by (identity, contract id, key) (OD19, OD20, MD rule 44) | decides that **sessions are not Runtime records** (4.4, M6-D16); streaming-write progress lives on the Runtime's write lane |

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
  (MCH:139-140), deliveries have no place in the FIFO list (P21), and a duplicate session leaves the lane undefined
  with the activity waiting (OPS:122-124), the silent decline D5 rejected.
- **Nobody owns classification or reconnect** (G6). Rule 25 says Flow retries nothing, but not what that means for a
  stream; the browser hides almost every reason (GAPS, "The sources").
- **Ownership is one clause** (G7): "facts from an ended activation are discarded by design" (RT:88-90).
- **Backpressure is deferred** (G8, OPS:204), yet `fetch` bodies have it and WebSockets do not.
- **Writes that stream** (G9) were deferred (MD section 7 item 9): a transaction reports nothing before its ending.
- **`listen` ordering, duplicates and the first-live race** (G10, ED:568-569, ED:691-692).
- **Persistence and tabs** (G11): a restored lane has no idea how stale it is; a handover opens "a fresh generation"
  (PER:96-98, PER:32-33, MT:334).
- **Stories cannot drive a feed** (G12) without merge 3's fixture controls (M3:422-427, M3:450-457).
- **Nothing is checked** (G13, INS:28-29, INS:86-88).

### 1.1 Where gaps.md is wrong or imprecise

Unchanged from revision 1: G12's M3 citation is M3:422-427 and M3:450-457; G3's SE:67 is SE:66; G1's "a `listen`
stream is not exempt from skipping" is unspecified, not stated; G4's "there is no `Flow.uncertain`" is not a gap,
because a stream is a read and reads keep two channels (MD 2.7.1, rule 37); G8 is half answered (OPS:127-128 pulls
after each turn); DD's polling adapters are `next/http-api.ts:151-194`, turn every failure into a defect
(`Effect.orDie`) and restart at cursor `"0"`.

## 2. Where the data comes from

The browser gives every source the same shape: **a session that delivers a sequence of messages over one or more
transport connections, each of which may break.** What differs is who reconnects, whether anything proves continuity,
whether reading pushes back, and (revision 3) **whether the adapter can tell when the server has registered it**. For
each source, what Flow models and what belongs to the adapter:

| Source | Flow models | The adapter (an Effect service and the `subscribe` that calls it) owns |
| --- | --- | --- |
| **WebSocket** | the session's life (owned by its placement); delivery into the actor; the connection status the adapter reports; the claim on each connection; the session's bound; its ending | `new WebSocket` through `Socket.WebSocketConstructor` (a Story fakes it); auth; heartbeats and the half-open check; close codes into its own errors; reconnect with its own backoff; the resume handshake; **bounding the browser's own frame buffer** (`highWaterMark`, r3) |
| **SSE** | the same | `EventSource`; its built-in reconnect is the adapter's reconnect (`readyState` CONNECTING is `down`); proof of continuity from a `hello` or by contiguity (r3, 7.7.4) |
| **`fetch` body** (feed) | the same; reading on demand keeps the TCP window honest | the terminator that tells completion from a cut |
| **`fetch` body** (a write: LLM answer) | the transaction's Attempt and its three endings; **progress** before the ending | the same terminator; a cut answer is `unknown` |
| **Upload progress** (XHR) | progress before the ending; the ending | `xhr.upload.onprogress` into a `Stream.callback` (r3, 7.5); `load`/`error`/`abort` into `Outcome` |
| **Polling with a cursor** | the same as a WebSocket | the loop, the cursor, the delay; that a failed GET is `down`, not a defect |
| **Sync engine** | the same; its recoverable `error` is `down` | log replay, offline catch-up and completeness (SE) |
| **SDK with no subscribe ack** (graphql-ws, r3) | the same | **choosing the claim moment**: a server-side ack, or the first value (7.7.5) |
| **`BroadcastChannel`** | the same | nothing more: no failure, no reconnect |

What follows from the table:

- **Reconnecting is the adapter's, inside one session.** SSE reconnects by itself, sync engines recover from `error`,
  and only the adapter sees close codes. So a Flow session spans connections, and the adapter reports each drop and
  each registration. A session that ends with a failure is the machine's decision (MD 2.7.6).
- **Continuity is a claim only the adapter can make, and its honest default is "unproven".**
- **A claim is a promise about the server, not an event in the client** (r3). "The socket opened" says nothing about
  whether the server will send this connection the next fact. Only the adapter knows when the server has registered
  it, and some SDKs never say (7.7.5).
- **The meaning of a value is the source's.** A chat message is a fact; a price is the current state. That is a
  property of the data, so it is declared on the contract, not chosen by whichever machine maps it.

## 3. What carries over

Each server-call and entity concept, judged from the merged design.

### 3.1 From server calls (MD 2.7, rules 13–25 and 39–47)

| Concept | Verdict | How or why |
| --- | --- | --- |
| Three channels (2.7.1) | **adapted** for sessions; **as is** for writes that stream | A session is a read: it ends `complete` or `failure` (MD 2.7.1, rule 37). A streaming write keeps all three. "What did I miss?" gets its own answers (4.1.4) |
| `Outcome` in the commit | **adapted** | `Session` is `subscribe`'s vocabulary: plain elements are values; `Session.open / resumed / gap / down` are signals |
| The classifier outside the fiber | **as is** | A session's `Exit` and whole `Cause`: author error → failure; die → `Defect` and an issue; outside interruption → `Interrupted`; Flow's release → nothing |
| Flow's reasons | **adapted** | `Defect` and `Interrupted` arrive on `failure` (rule 37). Flow's gap reasons are `Unproven` and `Overflow`. `NotSent`, `Cancelled`, `Restored`, `StillUnknown` belong to Attempts. (r3: `DuplicateSession` is no longer a reason, M6-D15) |
| Contracts, operations, `.outcomes` (rules 39, 40; OD3, OD12) | **as is** | `stream({ id, input, output, key, delivers, capacity?, subscribe })`; an operation `feed: Chat.messages.outcomes({ value, gap, complete, failure })` |
| Verbs and placements (rule 41; OD2, OD9 Q22) | **as is** | `activities: [O.feed.subscribe(select)]`, `subscribe.each`; a stream has only `subscribe`; `VerbMismatch` holds |
| Mapper context (OD12) | **as is** | `(value, { input, key })`. r3: no `live` (C12) |
| `Flow.uncertain` | **not carried** | No unknown channel on a read |
| Write members `retry`, `cancel`, `idle`, `retryable` | **not carried** for sessions; **as is** for streaming writes | A session starts with its placement and ends with it. 11.1 parks a `reconnect` member |
| The write lane (rule 21, 2.7.13; OD5–OD10, OD19–OD25) | **not carried** for sessions (4.4); **as is** for streaming writes | A session is per placement (rule 42), owned by its activation, never a Runtime record. A streaming write's lane is the Runtime's, and its row gains `progress` |
| Owner, current or late (rule 14) | **adapted** | A delivery is mapped at admission; a released session's delivery is discarded, never routed late (rule 53) |
| Required handling (rule 20) | **adapted** | `value`, `gap`, `complete` on `every`; `failure` and `complete` on `listen` (rule 59) |
| Memory reads, before and after (rule 22) | **as is** | A placement's select reads the after memory; so writing the watermark and re-entering the state opens the next session from it |
| Schedules (rule 23, Machines O5) | **as is** | Backoff after a terminal failure, a catch-up retry while owed, "stale after a quiet minute". Machines O5's overdue-fires-once rule is the page-wake answer (C12) |
| No Flow timeout, no Flow retry (rule 25) | **as is, extended** | Flow never re-opens a session (rule 52) |
| Mailbox FIFO (P21) | **as is, extended** | Deliveries queue in the same FIFO (rule 55) |
| Concurrency (2.7.8) | **not carried** for sessions | One session per placement (per key under `each`) |
| Lane persistence (rule 46) | **not carried** for sessions; **as is** for streaming writes | `latest` data is kept with the actor's record as `lastKnown` (rule 60); progress is never persisted (rule 57) |
| The cache table, `orphaned` | **not carried** | A stream never writes resource data (OPS:126); `listen` writes records under 4.2 |

### 3.2 From entity domains (M4 rules 26–38, EDP, ED)

The owner's scope note applies: the domain is client-side coherence, not a sync engine.

| Concept | Verdict | How or why |
| --- | --- | --- |
| One split (rule 26) | **as is** | The domain applies pushes and repairs after gaps; a machine needs no handler for a `listen`'s gaps |
| Settlement and admission (rule 27) | **adapted** | A push changes the store at arrival, before any turn |
| The record queue (rule 29), the store following the Attempt (rules 30, 31) | **not carried** | A push is not a write |
| What clears `uncertain` (rule 32) | **as is, extended** | A push is an observation: it clears no mark (rule 58) |
| No temporary ids (rule 33) | **as is** | A pushed new record enters lists only through repair |
| Overflow is an ending (rule 35) | **adapted** | A session's overflow is a gap, a known loss (rule 56) |
| Reads carry confirmed data (rule 37) | **as is** | A session's failures |
| Positions and frontiers (ED 5.3) | **adapted** | A gap, including an unproven claim, lowers covered frontiers; r3: so does every state that is not `Live`, release included (rule 58) |
| Versions, contests, tombstones | **as is** | They already make reordered and duplicated pushes safe |

## 4. Design

Three layers, each in its own section (4.1 the stream contract, 4.2 `listen`, 4.3 machines), then who owns a session
(4.4, r3), the layer table (4.5) and the lifecycle table (4.6).

### 4.1 The stream contract (Operations O1, O4, O6, O7)

#### 4.1.1 The contract, from the WebSocket up

The data starts at the browser's `WebSocket`, reached through Effect's socket module, so the transport is a service a
Story can replace (EFX `socket/Socket.ts:864-875`, `WebSocketConstructor`). Two facts about that module shape the
adapter: **every close fails the reader**, clean or not ("Sockets never classify closes", `:444-452`), and **a browser
socket buffers frames without limit unless `highWaterMark` is set**, past which the reader fails with a
`SocketReadError` (`:930-947`, `:1015-1025`). The module is `@stability unstable` in 4.0.5; only adapters touch it.

```ts
// chat.contracts.ts (outside the machine)                                                      existing file suffix (OD17 Q18)
import { Context, Effect, Schedule, Schema, Stream } from "effect"
import { Socket } from "effect/socket"                       // existing (Effect 4.0.5): makeWebSocket, readerString, SocketError
import { Outcome, resource, Session, stream, transaction } from "flow-state"   // NEW: Session; existing: stream, resource, transaction, Outcome

export class Message extends Schema.Class<Message>("Message")({                                  // user-defined
  epoch: Schema.String, seq: Schema.Number, clientId: Schema.String, text: Schema.String,
}) {}
export class Dropped extends Schema.TaggedError<Dropped>()("Dropped", { code: Schema.Number }) {}         // user-defined: a down reason
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}                       // user-defined: ends the session
export class Reset extends Schema.TaggedError<Reset>()("Reset", { epoch: Schema.String, head: Schema.Number }) {}   // user-defined: a gap reason
export class ChatDown extends Schema.TaggedError<ChatDown>()("ChatDown", { status: Schema.Number }) {}   // user-defined: a failed catch-up read
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}
export class Refused extends Schema.TaggedError<Refused>()("Refused", { status: Schema.Number }) {}
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}

export class ChatHttp extends Context.Service<ChatHttp, {                                         // user-defined service: Stories fake it
  since(p: { roomId: string; epoch: string; after: number }, o: { signal: AbortSignal }): Effect.Effect<Page, ChatDown>   // one page
  post(p: { roomId: string; clientId: string; text: string }, o: { idempotencyKey: string; signal: AbortSignal }): Effect.Effect<{ status: number; seq: number }, NoResponse>
}>()("chat/ChatHttp") {}
const Page = Schema.Struct({ epoch: Schema.String, messages: Schema.Array(Message), through: Schema.Number, complete: Schema.Boolean })   // user-defined
type Page = typeof Page.Type

const Hello = Schema.fromJsonString(Schema.Union([          // the server's answer to "resume", sent once it has registered this socket for the room
  Schema.Struct({ t: Schema.Literal("resumed"), after: Schema.Number }),          // "I will replay everything after `after`, then go live"
  Schema.Struct({ t: Schema.Literal("reset"), epoch: Schema.String, head: Schema.Number }),   // "I cannot; my log is `epoch`, and I stream from `head`"
]))
const Frame = Schema.fromJsonString(Schema.Union([
  Schema.Struct({ t: Schema.Literal("msg"), message: Message }),
  Schema.Struct({ t: Schema.Literal("pong") }),
]))

const classify = (e: Socket.SocketError): Dropped | SignedOut =>                                // the author reads the close code; Flow never does
  e.reason._tag === "SocketCloseError" && e.reason.code === 4401 ? new SignedOut()
    : new Dropped({ code: e.reason._tag === "SocketCloseError" ? e.reason.code : 1006 })        // a read error past highWaterMark is a drop too: reconnect and resume

export const Chat = {
  messages: stream({                                                                            // existing
    id: "chat/messages",
    input: { roomId: Schema.String, epoch: Schema.String, after: Schema.Number },               // existing (OD12): the resume position is input outside the key
    output: Message,                                                                            // existing (OD12)
    key: ["roomId"],                                                                            // existing (OD23 Q38): required; one session per room
    delivers: "every",                                                                          // NEW
    // capacity: 1_000                                                                           NEW (r3): the session's bound; 1,000 is every's default (rule 56)
    subscribe: (input) => Session.reconnect({                                                   // NEW (M6-D8)
      connect: (from) => Effect.gen(function* () {                                              // an Effect of one registered connection
        const at = from ?? { epoch: input.epoch, after: input.after }                           // this session's start, or how far this session has got
        const socket = yield* Socket.makeWebSocket(`/rooms/${input.roomId}/live`, { highWaterMark: 1_048_576 })   // r3: bound the browser's own buffer (rule 56)
        const pull = (yield* Socket.readerString(socket).pipe(Effect.mapError(classify))).pipe(Effect.mapError(classify))   // acquiring the reader waits for "open"
        const writer = yield* socket.writer
        yield* writer.write(JSON.stringify({ t: "resume", ...at })).pipe(Effect.mapError(classify))
        const [first, ...rest] = yield* pull.pipe(Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(new Dropped({ code: 4000 })) }))
        const hello = Schema.decodeUnknownSync(Hello)(first)                                    // an undecodable hello is a defect
        yield* Effect.forkScoped(Effect.forever(Effect.sleep("15 seconds").pipe(                  // a heartbeat on Effect's Clock (rule 61)
          Effect.andThen(writer.write(JSON.stringify({ t: "ping" }))), Effect.ignore)))
        return {
          claim: hello.t === "resumed"
            ? Session.resumed(hello)                                                            // NEW (r3): the server's answer is the witness (rule 50)
            : Session.gap(new Reset({ epoch: hello.epoch, head: hello.head }), { at: { epoch: hello.epoch, after: hello.head } }),   // NEW (r3): at, where this connection streams from
          values: Stream.fromIterable(rest).pipe(
            Stream.concat(Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable))),
            Stream.timeoutOrElse({ duration: "40 seconds", orElse: () => Stream.fail(new Dropped({ code: 4000 })) }),   // silence fails; it never ends quietly
            Stream.flatMap((raw) => {
              const f = Schema.decodeUnknownSync(Frame)(raw)
              return f.t === "msg" ? Stream.succeed(f.message) : Stream.empty                   // pongs only keep the deadline alive
            })),
        }
      }),
      position: (m) => ({ epoch: m.epoch, after: m.seq }),                                      // existing
      schedule: Schedule.max([Schedule.exponential("500 millis"), Schedule.recurs(8)]),
      while: (e) => e._tag === "Dropped",                                                       // SignedOut ends the session
      // stableAfter: "10 seconds"                                                               NEW (r3): the default (rule 52)
    }),
  }),
  since: resource({                                                                             // existing: the catch-up read
    id: "chat/since",
    input: { roomId: Schema.String, epoch: Schema.String, after: Schema.Number },
    output: Page,                                                                               // r3: a page says where it ends and whether it is the last
    key: ["roomId", "epoch", "after"],                                                          // every field changes the page
    staleTime: "0 millis", gcTime: "0 millis",
    lookup: (input, { signal }) => ChatHttp.use((h) => h.since(input, { signal })),
  }),
  post: transaction({                                                                           // existing (OID 5.4)
    id: "chat/post",
    input: { roomId: Schema.String, clientId: Schema.String, text: Schema.String },
    output: { seq: Schema.Number },
    key: ["clientId"],                                                                          // one lane per message
    concurrency: "reject",
    commit: (input, { attempt, signal }) => Effect.gen(function* () {
      const res = yield* ChatHttp.use((h) => h.post(input, { idempotencyKey: attempt.id, signal })).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 201) return { seq: res.seq }
      if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
      return yield* Outcome.failure(new Refused({ status: res.status }))
    }),
  }),
}
```

`delivers` and the key's meaning:

| | `"every"` | `"latest"` |
| --- | --- | --- |
| A value is | a fact: a message, a notification, a delta | the current state: a price, a presence set |
| Flow may coalesce or skip | never | yes |
| Equal values | delivered, also after a restore | silent to the machine under `Equal.equals`; never to the lane's state (r3) |
| Reading the adapter's Stream | pulled one element at a time, by its consumer, read ahead at most `capacity` (rule 55, 56) | drained continuously; the newest value wins |
| Claims carry continuity | yes (4.1.4) | `resumed` restores this session's last value; other claims only register (r3) |
| The lane holds | no data: facts live in memory or the store | `data` while `Live`, else `lastKnown: Stale<A>` (r3) |
| The machine's `value` | every value, in order | only values that arrive while `Live` (r3) |
| Default `capacity` (r3) | 1,000 | 1 |
| In a definition | `value`, `gap` and `complete` must be mapped | `value` optional |
| In `listen` | required | a type error |

**The key names the feed; inputs outside it say where a session starts** (OD12). A new session reads the current
input; a running one keeps its original (OPS:120-121).

#### 4.1.2 Claims, and the connection table (revision 3, M6-D10)

A session is a sequence of connections. Revision 2 defined a connection by *when* its claim came ("when the transport
opens") and ignored what did not fit. Revision 3 defines it by *what* the claim promises:

> **A claim promises registration.** From the claim on, every fact the source produces reaches this connection, in
> order. A claim also says what came before it: `resumed` (nothing after the connection's start position is missing),
> `gap(reason)` (something is), or `open` (unknown).

So the adapter claims at the moment it knows the server has registered it: the server's `hello` (4.1.1), a
subscription ack, the SDK's `SUBSCRIBED` status, or, for an SDK that never says, the first value (7.7.5). A transport
opening is not that moment. A connection that stays quiet after its claim is still registered.

```ts
Session.open()                       // NEW: registered; continuity unknown
Session.resumed(witness)             // NEW (r3: witness required): registered; every fact after this connection's start follows, in order
Session.gap(reason, { at? })         // NEW (r3: at): as a claim, registered with a known loss; as an item, a loss inside the connection
Session.down(reason)                 // NEW: no longer registered; the adapter is trying again
// Flow's reasons: Unproven { why: "Opened" | "Reconnected" } and Overflow { lost } (gaps); ConnectionEnded (offered to `while`)
```

`at` (r3) says where a connection streams from when that is not where it was asked to start: after a reset, the new
epoch's head. `Session.reconnect` uses it as the next connection's `from` until a value arrives (4.1.3). Flow reads
nothing else in it.

**The connection table** (normative; r3). Every input has exactly one meaning in every state, and where the adapter's
sequence is odd the meaning is the conservative one: nothing is ignored. "Deliver" means queue a delivery for the
consumer (4.1.8); `Opening`, `Live` and `Down` are the lane's tags (4.1.5).

| Input ↓ / state → | `Opening` (no claim yet; on `latest`, also claimed with no value yet) | `Live` | `Down` |
| --- | --- | --- | --- |
| **claim `resumed(w)`** | `every`: `Live`, nothing delivered. `latest`: `Live` with this session's last value as `data` if it has one, else `Opening` | **a new connection** (the previous registration lapsed): as from `Down`, evidence `Reclaimed` | `every`: `Live`. `latest`: as from `Opening` |
| **claim `gap(r)`** | `every`: `Live`, deliver `gap(r)`. `latest`: `Opening` (registered, no current value) | a new connection: as from `Down`, evidence `Reclaimed` | as from `Opening` |
| **claim `open()`** | `every`: `Live`, deliver `Unproven { Opened }` on the session's first connection, `{ Reconnected }` on later ones. `latest`: `Opening` | a new connection: as from `Down`, evidence `Reclaimed` | as from `Opening`, with `Reconnected` |
| **value** | at the session's start, an implicit `open()` first (M6-D2: a plain Stream works). Then `every`: deliver. `latest`: `Live`, `data` | `every`: deliver. `latest`: `data` | `every`: deliver `Unproven { Reconnected }` once, then the value; the lane stays `Down` (the adapter said so). `latest`: update `lastKnown` only; nothing is delivered (a cache) |
| **gap item `gap(r)`** | `every`: deliver. `latest`: dropped | `every`: deliver. `latest`: dropped | `every`: deliver. `latest`: dropped |
| **`down(d)`** | `Down` | `Down`; `latest` moves `data` to `lastKnown` | the reason is replaced |
| the session's ending | 4.1.7 | 4.1.7 | 4.1.7 |

What the table fixes, by finding:

- **A claim inside a live connection is a new connection** (R2 H3). An SDK that reconnects and says `open()` without
  a `down` may have missed facts; on `every`, the second claim delivers its gap. Revision 2 ignored it and failed
  open. A duplicate `SUBSCRIBED` callback now costs one catch-up read, never a lost delete. Adapters therefore claim
  once per registration (7.7.3: Firestore claims on the transition from cache to server, not on every snapshot), and
  `Reclaimed` evidence shows an adapter that claims more often (R2 L `ExtraClaim`, cut).
- **A value after a `down`, with no claim** (R2 authoring, "most common mistake"), is a fact from an unregistered
  connection: on `every` it is delivered behind an `Unproven` gap, so nothing newer arrives before a consumer hears of
  a possible loss. The lane stays `Down`, so guards still see the drop.
- **Values before a claim** (R2 M) are covered by the same rows: before the session's first claim they imply `open()`,
  and after a `down` they arrive behind a gap. The gap is always first. `Session.push` holds nothing back.
- **`resumed` on `latest`** (R2 M) restores this session's own last value, which the server has just promised is
  still current. A new session's inherited `lastKnown` (4.1.5) is never promoted: it came from another session.

#### 4.1.3 `Session.reconnect` (M6-D8, revised in r3)

```ts
Session.reconnect<A, P, G, E, R>(options: {                                                     // NEW (M6-D8)
  readonly connect: (from: P | undefined) => Effect.Effect<Session.Connection<A, P, G, E, R>, E, R | Scope.Scope>
  readonly position: (value: A) => P
  readonly schedule: Schedule.Schedule<unknown, E | Session.ConnectionEnded, never, R>
  readonly while: (error: E | Session.ConnectionEnded) => boolean
  readonly stableAfter?: Duration.Input                                                         // NEW (r3): default "10 seconds"
}): Stream.Stream<A | Session.Signal<E | Session.ConnectionEnded, G, P>, E, R>

interface Connection<A, P, G, E, R> {                                                           // NEW (r2)
  readonly claim: Session.Claim<G, P>                                                           // open() | resumed(witness) | gap(reason, { at? })
  readonly values: Stream.Stream<A | Session.Gap<G>, E, R>
}
```

- **`connect` returns a registered connection.** Its Effect succeeds when the adapter can make its claim; the
  combinator emits the claim, then the values. A quiet connection is registered (R1 H1). The type requires a claim.
- **Each connection runs in its own scope**, closed before the next `connect` runs.
- **Ending a connection.** If `values` fails with `e`, or `connect` fails, the combinator asks `while(e)`. If
  `values` completes, it asks `while(ConnectionEnded)`. If `while` accepts, it emits `Session.down(e)`, sleeps by
  `schedule` on Effect's Clock, and connects again; if it refuses, the session ends with the error, or as `complete`
  for `ConnectionEnded`. A WebSocket adapter never sees `ConnectionEnded`: Effect's sockets fail on every close
  (EFX `socket/Socket.ts:444-452`), so a clean close is a `SocketCloseError` the author classifies; `ConnectionEnded`
  is for sources whose values can complete, such as a long-poll or a `fetch` body.
- **`from`** is the position of the last value this session emitted, or the last claim's `at` if no value has arrived
  since it (r3: so a reconnect after a reset asks from the new epoch, R2 H2's last point). Gaps inside the session were
  delivered to the consumer, who owns the repair (4.3.2).
- **The schedule restarts only after a healthy connection** (r3; R2 H1, revision 2's open question R2.3 B). A
  connection is healthy once it has stayed registered for `stableAfter` (default 10 s). Connections that drop sooner
  keep stepping the same schedule, so a draining load balancer that accepts and drops at once is backed off fully, and
  `Schedule.recurs(8)` ends the session after eight such tries; the machine decides what then (4.3.4). Prior art,
  deliberately not followed: Effect's `Stream.retry` resets "as soon as the first element passes through the stream
  again" (EFX `Stream.ts:10489`, `Channel.ts:8089-8092`), which a server that greets and then drops defeats.
- **`values` is pulled, never pushed** (rule 56): Flow reads it at most `capacity` ahead and then waits. A source that
  cannot wait (a browser socket) bounds its own buffer; past the bound its read fails and the connection drops.
- The combinator is adapter code. Flow's runtime never re-opens a session (rule 52, MD rule 25).

Sources that reconnect by themselves (SSE inside one `EventSource`, Supabase realtime, Firestore, a sync engine) do
not use it: they report signals through `Session.push` (4.1.6).

#### 4.1.4 Continuity and its witness

| Claim | On `every` | On `latest` |
| --- | --- | --- |
| `resumed(witness)` | **continuous**: every fact after the position this connection was opened from is delivered, in order, before anything newer; no gap is delivered | registered; this session's last value is current again (r3) |
| `gap(reason)` | **a known loss**: the gap, before the connection's values | registered; no gap is delivered |
| `open()`, or the session's first value with no claim | **unproven**: `Unproven { why }`, before the connection's values | registered |

- **`resumed` takes a witness** (r3; R2 authoring, "most dangerous"). The witness is whatever proved it, and Flow
  records it in the session's evidence, where Inspection, Stories and `flow explain` print it: "resumed by
  `{ t: "resumed", after: 40 }`". A witness is one of two things:
  - **the server's in-band answer** on this connection (chat's `hello`, an SSE `event: resumed`); a transport opening
    proves nothing, and neither does a browser sending `Last-Event-ID`, which the server may ignore;
  - **contiguity of the first value**, for sources whose positions are dense (each fact's position is the previous
    one's plus one): the adapter holds its claim until the first value and checks that it directly follows the
    connection's start (7.7.4). That is the only proof a server without a `hello` can give (R2 H8). Sparse positions
    (timestamps, ULIDs) cannot be proven this way, and their unproven claims stay unproven.

  Flow cannot tell a real witness from `{}`; the requirement makes the claim's basis visible, which is what a review
  or a Story needs. Revision 2's open question R2.2 is answered: contiguity is an adapter recipe, not a Flow option.
- **A full snapshot is not a resumption on `every`.** A snapshot omits the facts in between (a deleted message, a
  dismissed notification): the adapter says `gap(new Snapshot())`. On `latest`, a snapshot is the next value.
- **A silent re-open is an adapter defect** Flow cannot see. Both constructors make it hard to write: `Session.reconnect`
  requires a claim per connection, and on `every` an `Unproven` gap is the price of a value with no claim. Inspection
  reports an `every` session that delivered values but never received a claim (`NoClaims`).
- **A gap is delivered before the connection's values**, always (the table's rows guarantee it).

#### 4.1.5 The lane, typed by freshness (M6-D9, revised in r3)

```ts
type Stale<A> = { readonly value: A; readonly since: number }                                   // NEW (r3): since: Clock millis when it stopped being live

// a latest stream's row: s.operations.price, or O.quotes.get(s, k) under subscribe.each       NEW (r2), r3: one discriminant
type LatestLane<A, K, D, E> = { readonly key: K } & (
  | { readonly _tag: "Live"; readonly data: A }                                                 // a value arrived on the current connection, or resumed restored it
  | { readonly _tag: "Opening"; readonly lastKnown: Stale<A> | undefined }
  | { readonly _tag: "Down"; readonly reason: D; readonly lastKnown: Stale<A> | undefined }
  | { readonly _tag: "Complete"; readonly lastKnown: Stale<A> | undefined }
  | { readonly _tag: "Failure"; readonly error: E; readonly lastKnown: Stale<A> | undefined }
  | { readonly _tag: "Defect" | "Interrupted"; readonly cause: Cause.Cause<unknown>; readonly lastKnown: Stale<A> | undefined })

// an every stream's row: no data; its facts went to memory or the store                       NEW (r2), r3: one discriminant
type EveryLane<K, D, E> = { readonly key: K } & (
  | { readonly _tag: "Live" | "Opening" }
  | { readonly _tag: "Down"; readonly reason: D }
  | { readonly _tag: "Complete" }
  | { readonly _tag: "Failure"; readonly error: E }
  | { readonly _tag: "Defect" | "Interrupted"; readonly cause: Cause.Cause<unknown> })
```

- **One discriminant, `_tag`, on every variant** (r3; R2 H6). Revision 2 put `connection` only on `Running`, so
  `lane?.connection === "Live"` did not compile against the terminal variants, and every example guard failed. Now
  `operations.feed?._tag === "Live"` narrows the whole union, and `Running` with an impossible `Closed` connection
  cannot be written. The tags are per kind (OD3): a resource row keeps OPS O6's `Pending`, `Ready`, `Refreshing`.
- **`data` exists only while `Live`.** Rendering a stale price as current needs `.data`, which the type allows only
  after narrowing.
- **`lastKnown` is a `Stale<A>`, not an `A`** (r3; R2 H6's second half). `show(lane._tag === "Live" ? lane.data :
  lane.lastKnown)` is a type error, because `lastKnown` is `{ value, since }`; writing `.value` is a visible choice,
  and `since` lets a view say "as of 2 minutes ago". `since` is Flow's clock time when the lane left `Live`, not the
  source's time; a quiet feed's staleness still comes from the source's own timestamp (4.3.5).
- **An `every` lane has no data.** A fact is handled into memory or the store.
- **A new session with the same key starts `Opening` with `lastKnown`** set from the previous session's data (G5's
  answer). A restore does the same (rule 60). Neither is promoted to `Live` without a value on the new session.
- **Equality never holds a lane back** (r3; R2 M). A first value on a new connection makes the lane `Live` even when it
  equals `lastKnown`; equality only decides whether the machine is told (rule 55).
- **Every row carries `key`**, as MD's live rows do (MD 2.7.5, R6 L3).
- Lane updates of a `latest` stream coalesce to at most one publication per Runtime publication (MCH:148-150).

#### 4.1.6 The bound, and the push boundary (revision 3, M6-D11)

**One bound per session** (r3; R2 H5). Revision 2 bounded `Session.push` alone. But the session is what has a
consumer and a pace, so the bound is the session's, declared on the contract next to `delivers` (locality), with a
default by kind:

```ts
stream({ id, input, output, key, delivers: "every", capacity: 5_000, subscribe })               // NEW (r3): capacity; default 1,000 on every, 1 on latest
```

| Where values come from | At the bound | Prior art |
| --- | --- | --- |
| **a pull source**: a plain `Stream`, `Session.reconnect`'s `values`, a `fetch` body | Flow stops reading: the source waits, nothing is lost | Effect's `Stream.buffer` with `"suspend"` (EFX `Stream.ts:7645-7656`) |
| **a push source**: `Session.push` | the oldest waiting values are dropped and one `Overflow { lost }` gap stands where they were; on `latest` the newest value survives and no gap is kept | `Stream.callback`'s `"sliding"` (EFX `Stream.ts:699-729`), with a loss marker instead of silence |
| **a transport's own buffer** (a browser `WebSocket`) | the adapter bounds it (`highWaterMark`); past it the read fails, which is a drop | EFX `socket/Socket.ts:930-947` |

**Signals take no buffer.** The connection state is a register: a run of `down`s and claims changes it in place, and
the consumer reads the lane, not a queue of transitions. The deliveries signals cause are gaps, and **adjacent gaps
with no value between them are one gap**, carrying the latest reason (a gap means "something may be missing since the
last value"; two say no more). So a flapping SDK costs one waiting gap, never a growing queue. Because the latest
reason wins, a reason must not be the only carrier of state the consumer needs: a catch-up read reports its own epoch
(7.1's `Page.epoch`).

**`Session.push`** (r2; r3 cuts the option and the seven-member `Emit`):

```ts
Session.push<A, D = never, G = never, E = never, R = never>(                                    // NEW (r2)
  register: (emit: Session.Emit<A, D, G, E>) => Effect.Effect<unknown, never, R | Scope.Scope>,
): Stream.Stream<A | Session.Signal<D, G | Session.Overflow>, E, Exclude<R, Scope.Scope>>       // r3: no { capacity }: the session's bound applies

interface Emit<A, D, G, E> {                                                                    // NEW (r3): three members, was seven
  (item: A | Session.Signal<D, G>): void                                                        // a value, or Session.open() / resumed(w) / gap(r) / down(r)
  readonly fail: (error: E) => void                                                             // ends the session with a failure
  readonly end: () => void                                                                      // ends the session: complete
}
```

- **The vocabulary is the same everywhere** (r3; R2 authoring). A signal is the same `Session.*` value in a Stream
  element and in `emit(…)`, so there is one set of words to learn, not a Stream set and an `Emit` set.
- **`end` and `fail` end the session; there is no connection end on a push source**, because the SDK owns its
  connections. A `Session.reconnect` connection that completes is a different thing, offered to `while` (4.1.3). That
  is the whole difference (R2 L, "inconsistent").
- **After the session's scope closes, `emit` does nothing**, so an SDK callback that fires during release cannot reach
  a released session (rule 53).
- `register` sets the SDK up and returns its clean-up through `Effect.acquireRelease`.

**Transports are services; Stories fake the transport, not the adapter** (kept from r2):

| Source | The transport service | Production | Story fake (7.0) |
| --- | --- | --- | --- |
| WebSocket | `Socket.WebSocketConstructor` (EFX `socket/Socket.ts:864-875`) | `Socket.layerWebSocketConstructorGlobal` (`:877`) | a scripted `WebSocketLike` (`:790-806`) driven by controls |
| SDK callbacks | the author's structural subset (`RealtimeLike`, `SnapshotsLike`, `EventSourceLike`) | the real client | the same subset, driven by controls |
| `fetch`, XHR (writes) | the author's service returning a `Stream` of parts | the SDK or `XMLHttpRequest` | a Layer of the same service |

#### 4.1.7 Endings and classification

Unchanged. A session ends once, as a read: `complete`, or `failure` with the author's error, Flow's `Defect` (a die,
plus an issue) or `Interrupted`, classified from the whole `Cause` outside the session's fiber. A planned release ends
it with no ending. There is no unknown channel. **A deadline fails, never completes**: adapters use
`Stream.timeoutOrElse` / `Effect.timeoutOrElse` with an error (EFX `Stream.ts:3539`, `Effect.ts:8866`), never
`Stream.timeout`, which ends the stream (EFX `Stream.ts:3431-3454`). **An `every` session's `complete` must be mapped**
(rule 59).

#### 4.1.8 Delivery to a consumer

One consumer per session: a machine placement, or the store plus its placement (`listen`). `every` is pulled one
element at a time, after the previous one is handled; `latest` is drained into the lane, and the machine hears only
values that arrive while `Live` (r3, rule 55).

#### 4.1.9 Writes that stream: progress (M6-D1, M6-D5; rebased)

```ts
// assistant.contracts.ts
export const Assistant = {
  generate: transaction({                                                                       // existing
    id: "assistant/generate",
    input: { conversationId: Schema.String, prompt: Schema.String },
    output: { messageId: Schema.String, text: Schema.String },
    key: ["conversationId"],                                                                    // existing (OD4): one lane per conversation
    progress: { text: Schema.String },                                                          // NEW (M6-D1); its own schema (OD18)
    concurrency: "reject",
    commit: (input, { attempt, signal, progress }) => Effect.gen(function* () {                  // NEW: progress
      const res = yield* Llm.use((api) => api.generate(input, { clientMessageId: attempt.id, signal })).pipe(
        Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
      if (res.status === 429) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
      if (res.status !== 200) return yield* Outcome.failure(new Refused({ status: res.status }))
      let text = ""
      let done: Done | undefined
      yield* res.frames.pipe(
        Stream.timeoutOrElse({ duration: "30 seconds", orElse: () => Stream.fail(new Stalled()) }),   // a stall fails; it never looks like an end
        Stream.runForEach((f) => {
          if (f._tag === "Done") { done = f; return Effect.void }
          text += f.token
          return progress({ text })                                                             // latest-wins, non-blocking
        }),
        Effect.catch((e) => Outcome.unknown(new BodyBroken({ cause: e }))))                     // Stalled included: it may have finished
      if (done === undefined) return yield* Outcome.unknown(new CutOff())
      return { messageId: done.messageId, text }
    }),
  }),
}
```

- **Progress belongs to its Attempt**, on the Runtime-owned write lane (MD rule 21, 2.7.13; OD19, OD20). The row's
  `progress` (MD 2.7.3's row `{ pending, uncertain, waiting, retryCount, progress? }`) is the addressable Attempt's.
  An Attempt's ending clears only its own; each ending mapper's `progress` is its own Attempt's last value.
- **Rebased (r3): the lane outlives its actor**, so progress keeps updating while the Runtime runs a commit whose actor
  was disposed, and a rebinding actor of the same identity reads it. **Progress is never persisted** (rule 57): after
  a reload the Attempt ends `unknown { Restored }` (OD20) with `progress` undefined, and an app that needs the partial
  text re-reads the conversation.
- **Rebased (r3): Stop holds the lane.** `O.gen.cancel(k)` in `InFlight` interrupts, and its `unknown { Cancelled }`
  is retained, so the lane is `Held` (OD5, OD7, MD rule 24): revision 2's "a new start is admitted after Stop" was
  wrong under the merged design. The machine releases the hold with a key-less `cancel` in the ending's handler
  (OD8), and the next Ask is a new Attempt (7.4).
- `progress` may be declared only under `reject`, `latest` or `cancel` (M6-D5).
- **Callback sources** (an XHR's `upload.onprogress`) reach `progress` through Effect's `Stream.callback`, not a
  synchronous `progress.sync` (r3; R2 M): 7.5.

### 4.2 The entity wrapper: `listen(stream).as(...)` (EntityDomains O1, ED; r3, M6-D13)

The domain is client-side coherence, not a sync engine. Revision 1's four obligations stand: apply every push in
order; a push proves nothing; lower what may be stale after a gap; leave completeness to a sync engine. Revision 2's
fifth is restated at its cause (r3; R2 H4): **an answer covered by a `listen` is fresh only while every session
covering it is `Live`.** Coverage is a property of the answer, not of a lane, so it holds when the lane is gone.

```ts
// tickets.contracts.ts: ticketEvents is 7.7.2's (delivers "every", Session.push over the Realtime transport)
// tickets.domain.ts
events: listen(ticketEvents).as([Ticket], (event) =>                                            // existing (DD ticket.domain.ts:81-88)
  event._tag === "TicketSaved" ? Ticket.save(event.ticket)
    : Ticket.delete({ workspaceId: event.workspaceId, ticketId: event.ticketId }, { version: event.revision })),

// queue.definition.ts
operations: ({ E }) => ({
  feed: Tickets.events.outcomes({                                                               // existing (OD3): the listen entry is a contract
    complete: E.FeedLost,                                                                       // required on listen (rule 59)
    failure: { Closed: E.FeedLost, SignedOut: E.SignedOut, Defect: E.FeedLost, Interrupted: E.FeedLost },
  }),
}),
// queue.machine.ts
QUEUE: { activities: [O.feed.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId }))] },   // existing (rule 41)
```

What each moment of a `listen` session does to the answers it covers (the answers on the entities it changes):

| Moment | Covered answers |
| --- | --- |
| a push | applied at arrival, in order; never joins a record queue; clears no `uncertain` mark (rule 32) |
| the session is `Opening` or `Down` | stale, cause `listen` ("the push channel is not live"); no refetch yet |
| a claim `resumed(w)` after a `down` in the same session | the `listen` cause is withdrawn: nothing was missed |
| a gap (`open()`, `gap(r)`, an `Unproven` or `Overflow` gap) | a **reconnect** cause: subscribed answers whose request started before it refetch under `repairSlots`; the rest stay stale (EDP:82, ED:574-576) |
| the session ends | stale, cause `listen`; the operation's `failure` and `complete` must be mapped (rule 59), so the machine re-opens it |
| **a planned release, of any session (r3)** | stale, cause `listen`, until a read refreshes the answer. Revision 2 said "a live session's release changes nothing", which left answers fresh with no push channel (R2 H4) |

- **After an ending or a release, the `listen` cause is cleared only by a read** that started after the session left
  `Live`, as any stale cause is; a new session's `resumed` speaks for its own start position, not for the time no
  session was placed. So a page that leaves and comes back costs one read.
- **The first open counts** (G10): answers whose requests started before the first claim are lowered by
  `Unproven { why: "Opened" }`. The cost is one extra read at page load.
- **Several sessions** (M6-D6): an answer is fresh only while every session covering it is `Live`; either's gap lowers.
- Versions decide duplicates and replays; without them the contest rule heals (EDP:66-69). Log replay, offline
  catch-up and completeness belong to a sync engine behind SE.

### 4.3 Streams inside machines (Machines O6, MD 2.7)

#### 4.3.1 Declaring, placing, reading (rebased)

```ts
// room.definition.ts
operations: ({ E }) => ({                                                                       // existing (OD3)
  feed: Chat.messages.outcomes({                                                                // existing: outcomes
    value: E.Message.from((m) => ({ message: m })),
    gap: { Reset: E.Missed.from((r) => ({ epoch: r.epoch })), Unproven: E.Missed.from(() => ({ epoch: null })) },   // NEW: gap, a tag record over the reasons
    complete: E.FeedEnded,                                                                      // NEW: required on every (rule 59)
    failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
  }),
}),
// room.machine.ts
LIVE: { activities: [O.feed.subscribe(({ memory }) => ({ roomId: memory.roomId, epoch: memory.at.epoch, after: memory.at.after }))] },   // existing (rule 41)
Send: { target: "self", guard: ({ operations }) => operations.feed?._tag === "Live" || deny("Offline"), actions: [post] },   // NEW (r3): _tag
```

```tsx
const q = useView(m, (s) => s.operations.price)
q?._tag === "Live" ? <Price value={q.data.last} /> : <Price value={q?.lastKnown?.value.last} since={q?.lastKnown?.since} dimmed />   // NEW (r3)
```

- Stream `outcomes` keys: `value`, `gap`, `complete`, `failure`. A `gap` mapping is one event or an exhaustive tag
  record over the adapter's reasons plus Flow's `Unproven`, and `Overflow` when the session can overflow (a
  `Session.push` source). 7.1's `Session.reconnect` cannot overflow (it pulls), so it needs no `Overflow` key.
- Mappers receive `(value, { input, key })` (OD12). `input` is the session's opening input, not where a gap was.

#### 4.3.2 Resume through a watermark, with a debt (revision 3, M6-D12)

Flow keeps no cursor (A6, A20). Revision 2's rule 45 said the resume parameter is a watermark, and left the algorithm
to each author: the chat recipe inferred holes from positions and lost or stalled in five ways (R2 H2), and a feed
with neither a read endpoint nor a `hello` could never clear (R2 H8). Revision 3 states the debt and its discharges,
so no hole is ever inferred:

- **The resume position is a watermark**: the consumer holds every fact at or before it.
- **A delivered gap is a debt, and the watermark freezes** at the last position before it. Values that arrive while
  the debt is open are kept (merged by identity) but do not move the watermark.
- **Exactly three things discharge a debt**:
  1. **a catch-up that started after the gap and reports itself complete.** A page that is not the last moves the
     watermark to the page's end and keeps the debt; the next page starts from there. A catch-up that started before
     the latest gap cannot discharge it, because the facts it misses may be later than its snapshot; MD rule 42 makes
     this structural, since a newer lookup of the same operation releases the older one and only the latest is
     delivered;
  2. **a new session started from the frozen watermark.** By rule 50 it either proves continuity, so the server
     replays everything after the watermark, or delivers a gap before any value, which is a new debt covering the old.
     So a machine that re-enters its placing state (or reloads) owes nothing for the old gap (*the debt transfers to
     the session*), and a feed without a read endpoint discharges by reconnecting, when its server can prove
     continuity (a `hello`, or contiguity, 4.1.4);
  3. **acceptance**, where no repair exists: a feed with sparse positions, no `hello` and no read endpoint cannot prove
     continuity, so each of its gaps is a possible loss the app tells the user about ("some notifications may be
     missing") and then stops owing. That is honest; pretending otherwise is the bug.
- **The debt is a state** (r3): 7.1's `LIVE.OWED`. A state is persisted with the actor, its schedules' deadlines are
  restored (PER:36, Machines O5), and its state token makes it visible to guards, views and `flow check`. So a reload in the
  middle of a catch-up resumes the repair from the restored schedule; nothing waits on a one-off lookup that a reload
  dropped (MD rule 42: one-off read lanes are not persisted).
- **Positions belong to an epoch.** A server that restarts its log answers `gap(Reset { epoch }, { at })`. The
  consumer starts a new watermark in the new epoch and owes its history from the start; dedup is by `(epoch, seq)`.
  A page reports its own epoch, so a reset the stream's gap reason did not carry still reaches the watermark.
- **In-session**, `Session.reconnect` resumes from its own last emitted value or the last claim's `at` (4.1.3). Each
  in-session gap has already been delivered, and is the consumer's debt.

7.1 shows the recipe: three memory helpers of one line each, and a sub-state.

#### 4.3.3 Deliveries in the turn

Deliveries join the FIFO mailbox and are mapped at admission. A released session's deliveries are discarded at
admission, with evidence. An `every` session has one delivery waiting; a `latest` session at most one, whose payload is
the lane's `data` at admission. **r3:** a `latest` delivery is discarded at admission if the lane is no longer `Live`
(its value went stale while it waited) or if it equals the last mapped value.

- **Deliveries never count against the mailbox cap** (RT:83-84). Each session has at most one delivery waiting, so
  deliveries are bounded by placements, as endings and firings are. They are never dropped, except as above.
- **Release before restart.** A new session for the same placement and key starts only after the previous session's
  finalizers finish, within the Runtime's disposal bound (Runtime O6). So a Supabase channel is removed before the
  same topic is joined again.

#### 4.3.4 Reconnect after a terminal failure

A failure that needs a decision is the machine's, as a state and a schedule (MD 2.7.6). Re-entering the placing state
starts a new session from the watermark, which (4.3.2, discharge 2) also answers any open debt.

#### 4.3.5 Schedules around a stream

| Need | Form |
| --- | --- |
| "Live" badge, disabled composer | the row's `_tag === "Live"` |
| The transport is half-open | the adapter's heartbeat on Effect's Clock: no frame within the deadline fails `Dropped` (4.1.1) |
| **The page was in the background** (r3; R2 M) | nothing new: a backgrounded page's heartbeat deadline is overdue on wake and fires at once, as Machines O5 fires an overdue schedule once (MCH:126), and the lane leaves `Live`. The window is the time to run one overdue timer. Stories drive it with the transport control `suspend({ for })` (7.0) |
| A quiet feed is stale | the server's timestamp in each value (`asOf`) and a schedule `armOn: [Flow.entry, E.Price]` (7.3) |
| Backoff after a terminal failure, a give-up budget | a schedule and memory |
| A catch-up that failed, or a reload mid-catch-up (r3) | a `Schedule.spaced` in the `OWED` state that looks up again while the operation is `idle` (7.1) |
| A stalled generation | inside the commit: `Stream.timeoutOrElse` failing (4.1.9) |

### 4.4 Who owns a session: its activation, not the Runtime (revision 3, M6-D16)

The merged design moved write lanes to the Runtime (OD19, OD20, MD rule 44): disposing an actor never drops a sent
write, and a later incarnation of the same identity adopts it by (identity, contract id, key). The task is whether
stream sessions follow. **They do not**, and the reason is the one that made write lanes the Runtime's: a sent write
may have changed the server, so its ending is owed to someone; a session changes nothing on the server and owes
nothing after release (A7). The truth a session could lose, how far the consumer has got, is the watermark, and it is
already in memory, persisted with the actor.

| | A write lane (MD rule 44, 46) | A stream session (rule 53) |
| --- | --- | --- |
| Owner | the Runtime, by (identity, contract id, key) | the placement's activation |
| Actor disposed | kept, endings parked or adopted | released: finalizers run, nothing is delivered |
| Adopted by a new incarnation | yes, its own identity's lanes | no: the new incarnation's placement opens a new session from its input |
| Persisted | lane records | never; a `latest` lane's last value is kept with the actor's record as `lastKnown` (rule 60) |
| `runtime.unsettledWrites()` | lists it | does not |
| Runtime disposal | queued commits end `NotSent { Disposed }` | sessions are released |

Consequences, stated: a session's identity for `lastKnown` is (actor identity, contract id, key), the write lane's
identity rule, so renaming an operation keeps a restored price; a streaming write's progress lives on its write lane
and so survives actor disposal (4.1.9); nothing about streams adds a Runtime record.

### 4.5 The layers: who owns what, and what crosses

| Layer | Owns | Rules |
| --- | --- | --- |
| **The adapter** | the transport service and its production Layer; auth; heartbeats; close codes into errors; the claim moment and its witness; bounding the transport's own buffer; terminators | 50, 61 |
| **Operations: the stream** | the contract (`delivers`, `capacity`); the `Session` vocabulary and the connection table; `Session.reconnect` and `Session.push`; the session's bound; the typed lane; endings; pulling and draining; progress per Attempt | 48–52, 55–57 |
| **Entity domains: `listen`** | applying pushes in order; staleness while any covering session is not `Live`; gaps as reconnect causes | 58 |
| **Machines** | declaring the operation and its mappings; placing the session; mapping deliveries at admission; discarding released ones; release before restart; the watermark and its debt in memory and state; reconnect and catch-up as states and schedules | 53, 54, 59, 60 |

| From → to | What crosses | Never crosses |
| --- | --- | --- |
| transport → adapter | frames, opens, closes with codes | — |
| adapter → operation | per connection, a claim (with its witness or `at`) and values (and gap items); downs; the Stream's `Exit` | close codes, statuses, SDK types |
| operation → entity layer | each value of an `every` session, in order; each gap; whether the session is `Live` | lane coalescing |
| operation → machine | the typed row in `s.operations`; deliveries (value, gap, ending) | the adapter's in-session position; progress events (progress is a row field) |
| machine → operation | the placement's `input` (a watermark) at a session's start; release | anything mid-session |
| entity layer → machine | records and answers with `stale` causes | the push, unless `value` is mapped |

### 4.6 Every lifecycle edge

What each edge means at each layer. Normative; r3 rows and cells are marked.

| Edge | Operation (session, row) | `listen` (answers) | Machine |
| --- | --- | --- | --- |
| session starts | `Opening` (with `lastKnown` from the previous same-key session); waits for the previous session's release | covered answers stale, cause `listen` | `input` read from the after memory |
| a claim | by the connection table (4.1.2) | 4.2's table | a gap delivery, if any |
| a claim while `Live` (r3) | a new connection; evidence `Reclaimed` | as a gap unless `resumed` | a gap delivery unless `resumed` |
| a value | `every`: pulled after the last delivery's turn; `latest`: `data`, `Live` | applied in order | `value` delivered (`latest`: only while `Live`, at most one waiting) |
| a value while `Down` | `latest`: `lastKnown`; `every`: an `Unproven` gap first (r3) | applied, after the gap's repair starts | `every`: gap then value; `latest`: nothing (r3) |
| `down` | `Down`, reason kept | stale, cause `listen` | guards see `Down` |
| overflow (r3) | `Session.push`: one `Overflow` gap at the loss point; a pull source waits | a reconnect cause | a gap delivery |
| a connection lasts `stableAfter` (r3) | `Session.reconnect`'s schedule restarts | — | — |
| a connection's values complete | `Session.reconnect` offers `ConnectionEnded` to `while` | — | — |
| the session completes | `Complete` | stale, cause `listen` | `complete` delivered; required on `every` and `listen` |
| the session fails | `Failure` / `Defect` / `Interrupted` | stale, cause `listen` | `failure` delivered |
| planned release | no ending; `emit` disabled; finalizers awaited | **stale, cause `listen` (r3)** | queued deliveries discarded at admission |
| the actor is disposed (r3) | released, as above; never adopted (4.4) | as release | — |
| restore, handover | a fresh session; a persisted `latest` value restored as `lastKnown`, `Opening` | restore lowers frontiers (ED:700-701) | `latest`: equal values silent against the persisted last mapped value; `every`: no baseline; an `OWED` state's schedule is restored (r3) |
| page wake (r3) | the heartbeat's overdue deadline fires; `Down` | stale, cause `listen` | — |
| a write's Attempt superseded or released | its progress dropped; the newer Attempt's untouched | — | — |
| Stop (cancel) on a streaming write | `unknown { Cancelled }` with its own `progress`; the lane is `Held` (r3, rebase) | — | a key-less `cancel` in the ending's handler releases it |

## 5. Rules

Provisional, numbered after machine-design.md's 47 (revision 2's 39–53 collided with the operations merge's 39–47).
Each names its revision 2 number; `(r3)` marks a rule revision 3 changed or added. Revision 2's rule 47
(`DuplicateSession`) and rule 53 (`publish`) are cut (6.3).

48. **`delivers` is declared** (was 39). A stream contract declares `delivers: "every" | "latest"`. An `every` value
    is a fact: Flow never coalesces, skips or equality-suppresses it, including after a restore. A `latest` value is
    the current state: Flow may coalesce it, and equal values are silent to the machine under `Equal.equals`, never to
    the lane's state (r3).
49. **Claims and the connection table** (was 40; r3). `subscribe` returns a Stream of values and `Session` signals.
    A session is a sequence of connections. A claim (`open()`, `resumed(witness)`, `gap(reason, { at? })`) promises
    registration: from it, every fact the source produces reaches this connection, in order. Flow reads every input in
    every state by 4.1.2's table, conservatively and never by ignoring it: a claim while `Live` ends that connection and
    starts another (evidence `Reclaimed`); on `every`, a value with no claim since a `down` is delivered behind an
    `Unproven { Reconnected }` gap and the lane stays `Down`; on `latest` it updates `lastKnown` only; the session's
    first value with no claim is an implicit `open()`. A gap after the claim is a loss. Flow reads only which signal
    came; reasons, witnesses and `at` are the adapter's information.
50. **Continuity per claim** (was 41; r3). On `every`: `resumed` means every fact after the connection's start
    position follows, in order, before anything newer, and delivers nothing; `gap(reason)` delivers that gap;
    `open()` delivers `Unproven { why: "Opened" | "Reconnected" }`, "Opened" on the session's first connection. The
    gap is delivered before the connection's values. `resumed` requires a witness, recorded in the session's
    evidence: the server's in-band answer on this connection, or the first value's contiguity with the connection's
    start, checked by the adapter for dense positions. A snapshot is a `gap`, never a `resumed`. On `latest`, no gap is
    ever delivered; `resumed` makes this session's last value `data` again; other claims leave the lane `Opening`
    until a value.
51. **A session ends as a read** (was 42). `complete`, or `failure` with the author's error, `Defect` (with an issue)
    or `Interrupted`, classified from the whole `Cause` outside the session's fiber. A planned release delivers
    nothing. There is no unknown channel. A deadline in an adapter or commit fails; it never completes the stream.
52. **Flow never re-opens a session** (was 43; r3; extends MD rule 25). The adapter may reconnect inside one session,
    reporting `down` and the next claim. `Session.reconnect`: `connect` returns a registered connection with its claim;
    each connection has its own scope, closed before the next; a connection whose values complete is offered to
    `while` as `ConnectionEnded`; `from` is the session's last emitted value's position, or the last claim's `at` if
    no value followed it (r3); the schedule restarts only after a connection has stayed registered for `stableAfter`,
    default 10 seconds (r3). A session that ended re-opens only when its placement starts again.
53. **A session belongs to its placement's activation** (was 44; r3). Sessions are not Runtime records: disposing the
    actor releases them, no incarnation adopts them, and nothing persists them (4.4; contrast MD rule 44). A
    delivery is mapped at admission; one whose session was released is discarded at admission with evidence, never
    routed late. After release, `Session.push`'s `emit` does nothing. A new session for the same placement and key
    starts only after the previous session's finalizers finish, within the Runtime's disposal bound. MD rule 8
    covers a live session's deliveries.
54. **Resume through a watermark, with a debt** (was 45; r3). A stream's key names the feed; inputs outside it are
    read when a session starts, from the after memory (MD rule 22), and kept while it runs. A resume input is a
    watermark: every fact at or before it is held by the consumer. A delivered gap is a debt: the watermark stays at
    the last position before the gap until the debt is discharged, by (a) a catch-up that started after the gap and
    reports itself complete (an incomplete page moves the watermark to its end and keeps the debt), (b) a new session
    started from the frozen watermark, which by rule 50 proves continuity or delivers a new gap first, or (c)
    acceptance, where no repair exists. No hole is inferred from positions. Positions are compared only within one
    epoch; a reset is a gap that names the new start. Flow keeps no cursor and dedups nothing.
55. **Delivery order and pace** (was 46; r3). Deliveries join the actor's FIFO mailbox (P21). An `every` session has
    one delivery waiting; its next element is pulled after that delivery's turn commits. A `latest` session has at
    most one waiting, created only while the lane is `Live`, whose payload is the lane's `data` at admission;
    admission discards it if the lane is no longer `Live` or the payload equals the last mapped value (r3). Deliveries
    are bounded by placements, never count against the mailbox's cap on external sends, and are never dropped except
    under this rule and rule 53.
56. **The session's bound** (was part of 52; r3). A stream contract may declare `capacity`, default 1,000 on `every`
    and 1 on `latest`. Flow reads a pull source at most `capacity` values ahead of its consumer and then waits. A push
    source enters through `Session.push`, which keeps at most `capacity` waiting values; past it, the oldest waiting
    values are dropped and one `Overflow { lost }` gap stands at the point of loss (on `latest`, the newest value
    survives and no gap is kept). A transport with its own buffer bounds it, and its overflow is a connection
    failure. Signals take no buffer: the connection state is a register, and adjacent gaps with no value between are
    one gap carrying the latest reason.
57. **Progress of a streaming write** (was 48; rebased). A transaction may declare a `progress` schema (OD18); its
    commit's context has `progress(value)`, latest-wins and non-blocking. `progress` may be declared only with
    `reject`, `latest` or `cancel` (M6-D5). Progress is stored per Attempt on the Runtime's write lane (MD rule 21):
    the row's `progress` is the addressable Attempt's; an Attempt's ending clears only its own; each ending mapper's
    `progress` is its own Attempt's. It survives actor disposal with the lane and is never persisted, never an
    ending: after a reload it is undefined (r3).
58. **`listen` keeps the store coherent, not complete** (was 49; r3). A `listen` entry requires an `every` stream.
    Each push is applied at arrival, in order, before the next is pulled. Pushes never join record queues and clear no
    `uncertain` mark. An answer covered by a `listen` entry is fresh only while every session covering it is `Live`;
    in any other state, after an ending, and after a release, it is stale with cause `listen`, which only a read that
    started after the session left `Live` clears (r3). A gap (including `Unproven`) is a reconnect cause: covered
    answers whose request started before it have their frontier lowered (subscribed ones refetch, the rest go stale);
    `resumed` after a `down` withdraws the `listen` cause. Log replay, offline catch-up and completeness belong to a
    sync engine (SE). Each live session of a `listen` entry is its own source; `flow check` warns `DuplicateListen`
    (M6-D6).
59. **Required mappings** (was 50; rebased; extends MD rules 20 and 37). An operation on a non-`listen` `every` stream
    maps `value`, `gap` and `complete`. An operation on a `listen` entry maps `failure` and `complete`. `failure` maps
    every author tag plus `Defect` and `Interrupted`; `gap` maps every adapter reason plus `Unproven`, and `Overflow`
    when the `subscribe` Stream's signal type includes it (a `Session.push` source). Checked at the operation (OD3) and, for handling, over every leaf the
    placement's deliveries can reach (MD rule 20).
60. **What survives reload and handover** (was 51; rebased). A persisted actor's `latest` session keeps its last value
    in the actor's record under (contract id, key) (4.4), restored as `lastKnown` (with its `since`) on a row that
    starts `Opening`; its value events stay silent against the persisted last mapped value. An `every` stream has no
    data to persist and no equality baseline. Queued deliveries and progress are not persisted; resume comes from
    persisted memory (rule 54), and a debt held as a state is restored with its schedules (PER:36). A handover restores
    the same way (MT:334).
61. **The transport and the clock** (was the rest of 52). An adapter is written over a transport service, so a Story
    replaces the transport and keeps the adapter. Adapter time comes from Effect's `Clock` (`Effect.sleep`,
    `Clock.currentTimeMillis`, `timeoutOrElse`), never `Date.now` or `setTimeout`, so the TestClock drives
    heartbeats, deadlines, claim timers and backoff.

## 6. Changes

### 6.1 Added

| Added | Kind | Meaning |
| --- | --- | --- |
| `delivers: "every" \| "latest"` | contract option, required | rule 48 |
| `capacity` (r3) | contract option, defaulted | rule 56 |
| `Session.open`, `.resumed(witness)` (r3: witness), `.gap(reason, { at? })` (r3: `at`), `.down`, `Session.Signal` | adapter vocabulary | rules 49, 50 |
| the connection table (r3) | contract | 4.1.2, rule 49 |
| `Session.reconnect({ connect, position, schedule, while, stableAfter? })` (r3: `stableAfter`), `Session.ConnectionEnded` | adapter combinator | rule 52 (M6-D8) |
| `Session.push(register)`, `emit(item)`, `emit.fail`, `emit.end` (r3) | adapter constructor | 4.1.6 |
| the stream row: `_tag: "Opening" \| "Live" \| "Down" \| "Complete" \| "Failure" \| "Defect" \| "Interrupted"`, `data` only while `Live`, `lastKnown: Stale<A>` (r3) | row | 4.1.5 (M6-D9) |
| `Stale<A>` (r3) | type | 4.1.5 |
| `outcomes.gap`; `complete` required on `every` and `listen` | stream mapping | rule 59 |
| `Unproven { why }`, `Overflow { lost }` | Flow gap reasons | rules 50, 56 |
| `Reclaimed`, `NoClaims` (r3: `Reclaimed` replaces `ExtraClaim`) | Inspection evidence | rule 49, 4.1.4 |
| the `listen` stale cause (r3: also on release and ending) | store | rule 58 |
| the debt and its three discharges (r3) | rule | rule 54 |
| `progress` schema, `progress(value)`, the write row's `progress`, mapper `progress` | streaming writes | rule 57 |
| `DuplicateListen`; `DuplicateSession` (r3: a warning, was a failure) | `flow check` warnings | rule 58, M6-D15 |
| `session` and `delivery` evidence | Inspection | 6.4 |

### 6.2 Changed

| Changed | Before | Now |
| --- | --- | --- |
| Delivery semantics | chosen by whether `value` is mapped (OPS:126-130) | chosen by `delivers` (rule 48) |
| Stream outcomes | `value`, `complete`, `failure`, `defect`, `interrupt`, on the activity (MCH:139-140) | `value`, `gap`, `complete`, `failure` with `Defect`/`Interrupted`, on the operation (OD3); mappers `(value, { input, key })` |
| Duplicate session | lane undefined, activity waits (OPS:122-124) | one operation placed twice is `DuplicatePlacement` (MD rule 41); two operations on one contract and key are two sessions and a `DuplicateSession` warning (r3) |
| The stream lane | `Running { data, connection }` for every kind | typed by kind and freshness, one discriminant (4.1.5) |
| What a claim is (r3) | made "when the transport opens" (revision 2) | a promise of registration; the connection table gives every input a meaning (rule 49) |
| A second claim while open (r3) | ignored, with `ExtraClaim` (revision 2) | a new connection; its gap is delivered unless `resumed` (rule 49) |
| A value after `down` (r3) | delivered as is on `every` | behind an `Unproven` gap; `latest`: `lastKnown` only (rule 49) |
| `resumed` (r3) | a bare signal | requires a witness; on `latest` it restores the session's last value (rule 50) |
| The resume parameter (r3) | a watermark that "never passes a hole" (revision 2 rule 45) | a watermark with a debt and three discharges (rule 54) |
| `Session.reconnect`'s schedule (r3) | restarted at every open | restarts after `stableAfter` (rule 52) |
| The bound (r3) | `Session.push(register, { capacity })`, required | `capacity` on the contract, defaulted; pull sources wait (rule 56) |
| `latest` values to the machine (r3) | every value, with `live` in the mapper context | only while `Live` (rule 55) |
| `listen` on release (r3) | "a live session's release changes nothing" | stale, cause `listen` (rule 58) |
| Persistence of equal values | suppressed after restore for every binding (PER:35-38) | only for resources and `latest` streams (rule 60) |
| "Reconnect" in EntityDomains | the browser's connection restored (EDP:82) | that, or a `listen` gap, including an unproven claim (rule 58) |
| Deliveries after release | "facts from an ended activation are discarded" (RT:88-90) | discarded at admission with evidence (rule 53) |
| Stop on a streaming write (r3, rebase) | frees the lane under `reject` (revision 2) | holds it (OD5, OD7); a key-less `cancel` in the ending's handler releases it (7.4) |

### 6.3 Removed and cut

| Removed | Was | Why |
| --- | --- | --- |
| `defect` and `interrupt` stream outcome keys | MCH:139-140 | rule 51, as C2 of merge 2 did for commits |
| "Without value mapped, lane updates may coalesce …" | OPS:129-130 | rule 48 |
| "Stream buffering integration" as a build-time choice | OPS:204 | rules 55, 56 |
| `data` on `every` rows and on non-`Live` `latest` rows | revision 1 | 4.1.5 |
| **`connection` beside `_tag`** (r3) | revision 2 4.1.5 | one discriminant (C12) |
| **`Session.push`'s `{ capacity }` option** (r3) | revision 2 4.1.6 | the bound is the session's (C10) |
| **`Emit`'s `value`, `open`, `resumed`, `gap`, `down` members** (r3) | revision 2 4.1.6 | `emit(item)` takes the same `Session` signals (C13) |
| **The mapper's `live`** (r3) | revision 2 4.3.1 | a `latest` value reaches the machine only while `Live` (C12) |
| **`ExtraClaim`** (r3) | revision 2 4.1.2 | a second claim is a new connection; `Reclaimed` is its evidence (C8) |
| **`DuplicateSession` as a failure reason, and its required mapping** (r3) | revision 2 rule 47 | `DuplicatePlacement` covers one operation; two operations are two sessions, a warning (M6-D15) |
| **`publishes`, `publish`, `published`** (r3, deferred) | revision 2 4.1.9, rule 53 | no end, restore or rate of its own (C13); Q11 |
| **The `hold` helper, `held`, `through`, and chat's `CATCHING_UP`, `CATCH_UP_WAIT`, `OUT_OF_SYNC`** (r3) | revision 2 7.1 | rule 54's debt is a state; the watermark never infers a hole (C11) |
| **Revision 2's "a new start is admitted after Stop"** (r3) | revision 2 4.1.10 | contradicted by OD5 and OD7 |
| **Section 11's OID guesses** (r3) | revision 2 section 11 | the merged design settles them (11) |

Not added, though review 2 suggested them: `Session.cached` (C12 makes it unneeded), `progress.sync` (7.5),
`restartOn: Session.wake` (4.3.5), a Flow-held watermark (A20, Q9), holding values behind the claim in
`Session.push` (the connection table puts the gap first instead).

### 6.4 Amendments by target

The `.plan` files and machine-design.md change only when this proposal is accepted. Rows marked (r3) are new or
rebased in revision 3.

**`machine-design.md`** (now the main target, r3)

| Where | Amendment |
| --- | --- |
| 2.4 | add rules 48–61 after rule 47, under a heading "Streams (merge 6)" |
| Rule 8 | "call endings, current and late" gains "and a live stream session's deliveries (rule 53)"; deliveries are bounded by placements (rule 55) |
| Rule 20 | stream mappings per rule 59 |
| Rule 25 | add "Flow never re-opens a stream session (rule 52)" |
| Rule 41 | "two placements of one key are `DuplicateSession`" (as cited in 2.7.10) becomes "two operations on one stream contract that can hold one key at once draw a `DuplicateSession` warning" (r3) |
| 2.5 step 1 | the FIFO list gains stream deliveries; a released session's delivery is discarded here; a `latest` delivery reads the row here and is discarded if the row is not `Live` (r3) |
| 2.7.3 per-kind table, stream row | outcome keys `value`, `gap`, `complete`, `failure` (rule 59, was "M6 rule 50"); row "merge 6 4.1.5's stream row: `_tag`, `data` only while `Live`, `lastKnown: Stale<A>`" (r3) |
| 2.7.3 "Reads and streams are exempt … end `DuplicateSession` (M6 rule 47)" | "… are two sessions, with a `DuplicateSession` warning (rule 41 amendment)" (r3) |
| 2.7.3 contract shape | the stream example is `input: { roomId, epoch, after }, key: ["roomId"]` with `delivers` and optional `capacity` (r3) |
| 2.7.5 live operation bullet | a stream's row is 4.1.5's; guards narrow on `_tag` (r3) |
| 2.7.6 table | rows from 4.3.5 |
| 2.7.10 "One session per key" | "merge 6 rule 47" becomes rule 53 for release; the `DuplicateSession` clause per the rule 41 amendment (r3) |
| 2.7.13 lifetime table, "a placement's session" | "a released session's delivery is discarded (rule 53); a session is never a Runtime record (4.4)" (r3) |
| 2.7.15 "A live placement" | "re-opens from its input; rule 60 restores a `latest` value as `lastKnown`, keyed by (contract id, key)" (r3) |
| 2.7.16 `flow check` | errors: rule 59's missing mappings; `listen` over a `latest` stream; `capacity` below 1. Warnings: `DuplicateSession`, `DuplicateListen`; an `every` placement under a state that history can re-enter without a resume input (r3) |
| P21 | "User sends, call endings, stream deliveries, timer firings and `onContext` events queue together" |
| Section 7 item 9 | closed by 4.1.9 |
| Citations of "M6 rule 44 / 47 / 50 / 51" in 2.5, 2.7.3, 2.7.8, 2.7.10, 2.7.13, 2.7.15 | become rules 53 / (cut) / 59 / 60 (r3) |

**`Operations.plan`**

| Where | Amendment |
| --- | --- |
| O1 (OPS:11-17) | `stream({ id, input, output, key, delivers, capacity?, subscribe, persist? })` (r3: OD12 shape, `capacity`); `subscribe(input, { signal })` returns a Stream of values and `Session` signals under rule 49 |
| O4 (OPS:120-124) | "DuplicateStreamSession … leaves its lane undefined" becomes MD rule 41's `DuplicatePlacement` and the `DuplicateSession` warning (r3); release before restart per rule 53 |
| O4 (OPS:126-130) | replace with rules 48, 49, 50, 55 and 56 |
| O4 (OPS:130-134) | endings per rule 51; re-opening per rule 52; a new session's starting row per 4.1.5 |
| O6 (OPS:166-169) | stream tags per 4.1.5 (r3: `Opening`, `Live`, `Down`, `Complete`, `Failure`, `Defect`, `Interrupted`; `lastKnown: Stale<A>`) |
| O7 (OPS:178-179) | a planned release ends a session with no delivery and disables `emit` |
| Q1 (OPS:204) | "Choose stream buffering integration" becomes "Implement rule 56's bound for pull and push sources" |

**`Machines.plan`**

| Where | Amendment |
| --- | --- |
| O6 (MCH:131-145) | already replaced by the operations merge (C40); add: stream deliveries mapped at admission and discarded when their session was released (rule 53); pace per rule 55; `value` for `latest` only while `Live` (r3) |
| O4 | guards read `operations.<name>._tag`; narrowing on `"Live"` gives `data` (r3) |

**`EntityDomains.plan` and `entity-domain.md`**

| Where | Amendment |
| --- | --- |
| EDP O1 (EDP:59-60) | `listen(stream)` requires `delivers: "every"`; its operation maps `failure` and `complete` |
| EDP O1 (EDP:82) | "Reconnect" defined per rule 58 |
| EDP O1 (new) | rule 58, including staleness on release and ending (r3) |
| EDP C1 (EDP:189-192) | add "no log replay or completeness from `listen`: a sync engine's (SE)" |
| ED 5.2 causes (ED:537-540) | "a reconnect" records which; add the cause `listen` |
| ED 5.3 (ED:568-576) | the ordered-stream precondition is rule 55's order; reconnects include rule 58's gaps |
| ED 5.5 Status (ED:703-707) | an answer's `stale` lists `listen` while any covering session is not `Live`, and after release (r3) |

**`Persistence.plan`**

| Where | Amendment |
| --- | --- |
| O2 (PER:35-38) | "for each activity binding, the last value it mapped" becomes "for each resource binding and `latest` stream binding"; queued stream deliveries and progress are not "pending outcomes" |
| O4 (PER:96-99) | "Running streams retain their selected latest value and count" becomes rule 60: the value as `lastKnown`, by (contract id, key), on an `Opening` row (r3) |

**`Runtime.plan`** (r3)

| Where | Amendment |
| --- | --- |
| RT:88-90 | rule 53; sessions are released on actor disposal and never adopted (4.4) |

**`Testing.plan`** (depends on merge 3; see 7.0)

| Where | Amendment |
| --- | --- |
| O2 (TST:42-44) | an adapter's Effect sleeps inside a session (heartbeats, deadlines, claim timers, backoff) are pending deadlines, owner the session (rule 61) |
| O3 (TST:53-67) | a stream fixture replaces the **transport**, not the adapter; its controls are 7.0's table (r3: `withhold`, `holdCatchUp`, `reorder`, `flap`, `suspend`) |

**`Inspection.plan`**

| Where | Amendment |
| --- | --- |
| O1 (INS:28-29) | per session: `delivers`, `capacity`, the row's tag, the current connection's claim and witness, deliveries waiting, gaps so far, values held (r3) |
| O4 (INS:86-88) | `session` evidence (claim with witness or `at`, gap, down, end, `Reclaimed`, `NoClaims`, `Overflow`, schedule restarts) and `delivery` evidence (queued, admitted, discarded with why) |

**Outside the targets:** SE 4.2 (SE:182-185) loses its status-in-value workaround: the TanStack binding uses
`Session.push` with `down` on `error` and a claim on `ready`; SE open question 2 closes. DD's polling adapters would
use `Session.reconnect` and take a watermark as input (7.7.6). Merge 3 gains 7.0's controls.

## 7. The product-case walks

### 7.0 Stories: transport fakes and their controls

The Stories use merge 3's `Fixture.stateful({ id, truth, controls, layer })`, `.control(fixture.name(payload))`,
`checkpoint.truth`, `story.app`'s `.closeTab` / `.openTab` for reloads (M3:621-622), and its rule that every
controlled-clock sleep is a pending deadline (M3:639-645). Merge 3 is being revised; if those change, the spelling
changes, not this design. **An adapter's Effect sleep is a pending deadline** (rule 61). **A stream fixture replaces
the transport, not the adapter**, so every sequence a real connection can produce is one `.control` away:

| Control | What the fake transport does | What the adapter above it then does |
| --- | --- | --- |
| `open` / connect accepted | fires `open` | sends its resume message, waits for its claim moment |
| `frame(…)`, `post(…)` | delivers a frame | decodes it into a value |
| `silence` | stops answering pings | its deadline fails `Dropped`, then it reconnects |
| `drop({ code })` | closes with the code | classifies it: `Dropped`, `SignedOut`, … |
| `flood({ count })` | delivers `count` frames in one tick | `Session.push` overflows into one gap; a socket past `highWaterMark` drops |
| `restart({ epoch })` | loses its log | answers the next resume with `reset` |
| `refuseCatchUp({ times })` | fails the next catch-up reads | the machine retries from `OWED` |
| `status(s)` (SDK fakes) | fires the SDK's status callback | `emit(Session.open())`, `emit(Session.down(…))`, `emit.fail(…)` |
| **`withhold("hello")`** (r3) | accepts the resume but sends no answer | the claim deadline fails `Dropped` (4.1.1), or the contiguity timer claims `open()` (7.7.4) |
| **`holdCatchUp` / `releaseCatchUp`** (r3) | keeps the next catch-up response until released | a gap arriving meanwhile starts a newer lookup, which releases the held one (MD rule 42) |
| **`reorder({ frames })`** (r3) | delivers queued frames in the given order | positions arrive out of order; dedup and the watermark must hold |
| **`flap({ times, upFor })`** (r3) | accepts and drops `times` times, each after `upFor` | `Session.reconnect` keeps stepping its schedule (no restart before `stableAfter`) |
| **`suspend({ for })`** (r3) | freezes the transport and advances the clock by `for` (a background tab) | the heartbeat deadline is overdue and fires on resume |

The chat server fake (its socket is a scripted `WebSocketLike`, EFX `socket/Socket.ts:790-806`):

```ts
// fixtures/fake-chat-server.ts
export const FakeChatServer = (o: { epoch: string; history: number }) => Fixture.stateful({     // M3 (proposed)
  id: "FakeChatServer",
  truth: ChatTruth({ epoch: o.epoch, history: o.history }),       // user-defined: { epoch, messages, connects: [{ epoch, after, at }] }
  controls: {
    post: Schema.Struct({ text: Schema.String }),
    drop: Schema.Struct({ code: Schema.Number }),
    silence: Schema.Struct({}),
    restart: Schema.Struct({ epoch: Schema.String }),
    refuseCatchUp: Schema.Struct({ times: Schema.Number }),
    forgetReplay: Schema.Struct({}),                              // the socket's replay buffer no longer reaches back; the HTTP history still does
    flap: Schema.Struct({ times: Schema.Number, upFor: Schema.String }),
    withhold: Schema.Literal("hello"),
  },
  layer: (truth, controls) => Layer.mergeAll(
    Layer.succeed(Socket.WebSocketConstructor, (url) => fakeSocket(url, truth, controls)),   // existing service, faked: the adapter runs unchanged
    Layer.succeed(ChatHttp, chatHttpFromTruth(truth, controls)),                             // the catch-up read and the post
  ),
})
```

`fakeSocket` (user-defined) answers `resume` from the truth: `resumed` and a replay when the epoch matches and the log
reaches back, otherwise `reset` with the current epoch and head. It answers `ping` with `pong` unless silenced,
closes with a code on `drop`, and records each resume and its clock time in `truth.connects`.

### 7.1 Chat feed: drop, quiet reconnect, flapping, reset, failed catch-up, reload (revision 3)

The contracts are 4.1.1's `Chat.messages`, `Chat.since` and `Chat.post`.

```ts
// room.definition.ts
import { definition, Flow } from "flow-state"
import { Schema } from "effect"
import { Chat, Message } from "./chat.contracts"

const Position = Schema.Struct({ epoch: Schema.String, after: Schema.Number })                // user-defined: a resume position

export const Room = definition({                                                                // existing
  id: "Chat/Room",
  states: [{ LIVE: ["SYNCED", "OWED"] }, "LOST", "SIGNED_OUT", "OFFLINE"],                      // r3: OWED is the debt (rule 54)
  events: { Send: { clientId: Schema.String, text: Schema.String }, Reconnect: {} },            // user-defined
  internalEvents: {
    Message: { message: Message },
    Missed: { epoch: Schema.NullOr(Schema.String) },                                            // a reset names its epoch
    CaughtUp: { epoch: Schema.String, messages: Schema.Array(Message), through: Schema.Number, complete: Schema.Boolean },
    CatchUpFailed: {}, ResyncTick: {},
    FeedEnded: {}, FeedLost: {}, SignedOut: {}, RetryFeed: {},
    Posted: { clientId: Schema.String }, PostFailed: { clientId: Schema.String }, PostUnsure: Flow.uncertain({ clientId: Schema.String }),   // existing: Flow.uncertain
  },
  memory: {
    roomId: Flow.input(Schema.String),                                                          // existing: Flow.input, Flow.initial
    messages: Flow.initial(Schema.Array(Message), []),
    at: Flow.initial(Position, { epoch: "", after: 0 }),                                        // the watermark (rule 54)
    feedTries: Flow.initial(Schema.Int, 0),
  },
  operations: ({ E }) => ({                                                                     // existing (OD3)
    feed: Chat.messages.outcomes({
      value: E.Message.from((m) => ({ message: m })),
      gap: {                                                                                    // NEW: a tag record over the gap reasons (rule 59)
        Reset: E.Missed.from((r) => ({ epoch: r.epoch })),                                      // the server could not replay; maybe a new epoch
        Unproven: E.Missed.from(() => ({ epoch: null })),                                       // Flow's; no Overflow: this source pulls (rule 56)
      },
      complete: E.FeedEnded,                                                                    // NEW: required on every
      failure: { SignedOut: E.SignedOut, Dropped: E.FeedLost, Defect: E.FeedLost, Interrupted: E.FeedLost },
    }),
    catchUp: Chat.since.outcomes({                                                              // maps success: looked up (rule 41)
      success: E.CaughtUp.from((p) => p),
      failure: { ChatDown: E.CatchUpFailed, Defect: E.CatchUpFailed, Interrupted: E.CatchUpFailed },
    }),
    post: Chat.post.outcomes({                                                                  // existing (OID 5.4)
      success: E.Posted.from((_v, { key }) => ({ clientId: key.clientId })),
      failure: { Refused: E.PostFailed.from((_r, { key }) => ({ clientId: key.clientId })), NotSent: E.PostFailed.from((_r, { key }) => ({ clientId: key.clientId })) },
      unknown: E.PostUnsure.from((_r, { key }) => ({ clientId: key.clientId })),
    }),
  }),
})
```

```ts
// room.machine.ts
import { deny, machine } from "flow-state"
import { Duration, Schedule } from "effect"
import { Room } from "./room.definition"

type Memory = typeof Room.Memory.Type
type Page = { readonly epoch: string; readonly messages: ReadonlyArray<Message>; readonly through: number }
const merge = (m: Memory, xs: ReadonlyArray<Message>) =>                                        // user-defined: dedup by (epoch, seq), never by seq alone
  ({ messages: [...m.messages, ...xs.filter((x) => !m.messages.some((h) => h.epoch === x.epoch && h.seq === x.seq))] })
const advance = (m: Memory, x: Message) => ({ ...merge(m, [x]), at: { epoch: x.epoch, after: x.seq }, feedTries: 0 })   // SYNCED: the watermark follows the feed
const paged = (m: Memory, p: Page) => ({ ...merge(m, p.messages), at: { epoch: p.epoch, after: p.through } })        // a page holds everything up to its end

export const RoomMachine = machine(Room, ({ S, E, O }) => {                                     // existing
  const from = ({ memory }: { memory: Memory }) => ({ roomId: memory.roomId, epoch: memory.at.epoch, after: memory.at.after })
  const catchUp = O.catchUp.lookup(from)                                                        // existing: lookup; reads the after memory (rule 22)
  return {
    default: S.LIVE,
    on: {
      CaughtUp: { target: "self", updateMemory: ({ memory, event }) => paged(memory, event) },  // late, after LIVE was left: still a valid page
      CatchUpFailed: { target: "self" },                                                        // OWED's tick tries again
      Posted: { target: "self" }, PostFailed: { target: "self" },
      PostUnsure: [{ target: "self", guard: [O.post.retryable({ times: 3 })], actions: [O.post.retry] }, { target: "self", actions: [O.post.cancel] }],   // existing (OD1, OD8): the outbox is not this walk
    },
    states: {
      LIVE: {
        default: S.LIVE.SYNCED,                                                                 // a new session from `at` answers any old debt (rule 54 (b))
        activities: [O.feed.subscribe(from)],                                                   // existing (rule 41)
        on: {
          Missed: {                                                                             // r3: a debt: freeze `at`; a catch-up that starts after the gap
            target: S.LIVE.OWED,
            updateMemory: ({ memory, event }) => (event.epoch === null || event.epoch === memory.at.epoch ? {} : { at: { epoch: event.epoch, after: 0 } }),   // a new epoch is owed from its start
            actions: [catchUp],
          },
          Send: { target: "self", guard: ({ operations }) => operations.feed?._tag === "Live" || deny("Offline"), actions: [O.post.commit(({ memory, event }) => ({ roomId: memory.roomId, clientId: event.clientId, text: event.text }))] },   // NEW (r3): _tag
          SignedOut: S.SIGNED_OUT,
          FeedEnded: S.LOST,
          FeedLost: [
            { target: S.LOST, guard: ({ memory }) => memory.feedTries < 5 || deny("GaveUp"), updateMemory: ({ memory }) => ({ feedTries: memory.feedTries + 1 }) },
            { target: S.OFFLINE },
          ],
        },
        states: {
          SYNCED: { on: { Message: { target: "self", updateMemory: ({ memory, event }) => advance(memory, event.message) } } },
          OWED: {                                                                               // r3: the view says "catching up"; the state survives a reload
            schedules: { resync: { schedule: Schedule.spaced("5 seconds"), send: E.ResyncTick } },   // existing: fires each step while OWED; restored on reload (PER:36)
            on: {
              Message: { target: "self", updateMemory: ({ memory, event }) => merge(memory, [event.message]) },   // kept, but `at` stays below the hole
              CaughtUp: [
                { target: S.LIVE.SYNCED, guard: ({ event }) => event.complete || deny("MorePages"), updateMemory: ({ memory, event }) => paged(memory, event) },   // discharge (a)
                { target: "self", updateMemory: ({ memory, event }) => paged(memory, event), actions: [catchUp] },   // the next page, from this page's end
              ],
              ResyncTick: [{ target: "self", guard: [O.catchUp.idle], actions: [catchUp] }, { target: "self" }],   // a failed catch-up, or one a reload dropped
            },
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

```tsx
// Room.tsx
const live = useView(room, (s) => s.operations.feed?._tag === "Live")                          // NEW (r3)
const owed = useView(room, (s) => s.state.matches(Room.S.LIVE.OWED))                             // "catching up…"; the spelling of a state read is Machines O8's
const unreachable = useView(room, (s) => s.operations.catchUp?._tag === "Failure")               // "some messages may be missing; retrying"
```

**Why each of review 2's five H2 failures cannot happen now:**

| R2 H2 failure | Why it cannot happen |
| --- | --- |
| A partial or empty page moves to SYNCED with messages held above the watermark | `CaughtUp` leaves `OWED` only when the server says the page is the last (`complete`); a partial page moves `at` to its end and asks for the next. No hole is inferred, so no "held above `through`" exists |
| A late `CaughtUp` from the old epoch writes the old epoch back | every `Missed` starts a new lookup, which releases the older one (MD rule 42), and a page carries its own epoch; a page that does arrive started after the latest gap and is complete from its own start |
| "Never past a hole" holds only for dense integer `seq` | the watermark never looks for holes; it freezes on a delivered gap and moves only on discharge, so sparse positions work |
| A reload mid-catch-up leaves CATCHING_UP stuck | `OWED` is restored with its `Schedule.spaced` (PER:36, MCH:126); the tick finds the lookup `idle` (one-off read lanes are not persisted, MD rule 42) and looks up again. Meanwhile the new session from the frozen `at` either replays (`resumed`) or gaps again |
| `from` ignores a `gap(Reset)` claim, so every quiet reconnect gaps again | the claim carries `at`, and `Session.reconnect` resumes from it until a value arrives (rule 52) |

And H8: a feed with no read endpoint replaces `catchUp` with `RetryFeed` (re-entering `LIVE` from the frozen `at`,
discharge (b)) when its server can prove continuity, or with a notice and `SYNCED` (discharge (c)) when it cannot
(7.7.4). Out-of-sync has its exit (R2 M): the tick runs until a page is complete. `messages` is the app's list; a
window ("keep the last 500") is the app's choice, not the protocol's.

**The walk.**

1. `LIVE.SYNCED` opens a session from `{ epoch: "", after: 0 }`. The server answers `reset` with `e1`, head 40: the
   claim is `gap(Reset { e1, 40 }, { at: { e1, 40 } })`, so `Missed { epoch: "e1" }` arrives before any value.
   `OWED`; the catch-up from `{ e1, 0 }` returns 1–40, complete: `SYNCED`, `at` `{ e1, 40 }`.
2. Wi-Fi drops (1006): `Dropped`, `down`; the row is `Down`, so `Send` is denied `Offline`. Message 41 is posted.
3. After 500 ms the reconnect asks from `{ e1, 40 }`, the session's last position (the claim's `at`, since no stream
   value followed it). The server answers `resumed` and replays 41; the witness `{ t: "resumed", after: 40 }` is in
   the evidence; `at` becomes 41.
4. **Quiet reconnect**: with nothing posted, the connection is still registered at the server's `resumed`; the row is
   `Live`.
5. **Flapping** (R2 H1): a draining load balancer accepts and drops nine times, each within a second. No connection
   lasts `stableAfter`, so the schedule keeps stepping (500 ms, 1 s, 2 s, …); after eight retries the session fails
   `Dropped`, `FeedLost`, `LOST`, and the machine's own backoff re-opens it from `{ e1, 41 }`. Revision 2 looped at
   500 ms forever.
6. **A gap with a repair pending**: after a drop, the socket's replay buffer no longer reaches back to 41, so the
   server answers `reset` in the same epoch with head 50. `Missed { epoch: "e1" }`: `OWED`, `at` stays 41; 51 and 52
   arrive and are kept. The catch-up from 41 is refused once (`ChatDown`); the row of `catchUp` shows `Failure`.
7. **Reload while `OWED`**: the tab closes and reopens. The actor is restored in `LIVE.OWED` with `at` 41 and the
   tick's deadline. The new session asks from 41, and the server answers `reset` again, which starts a fresh
   catch-up; had its buffer reached back, it would have answered `resumed` and replayed (discharge (b) then waits
   only for the tick's page). The page from 41 returns 42–52, complete: `SYNCED`, `at` 52.
8. **Server reset**: the next resume is answered `reset` with `e2`, head 7. `Missed { epoch: "e2" }`: `at` becomes
   `{ e2, 0 }`, `OWED`;
   the page from `{ e2, 0 }` returns `e2`'s 1–7, complete: `SYNCED`, `at` `{ e2, 7 }`. Dedup by `(epoch, seq)` keeps
   `e2`'s 1 apart from `e1`'s 1. A quiet reconnect afterwards asks from `{ e2, 7 }`, not from `e1`.

**The Story.**

```ts
const server = FakeChatServer({ epoch: "e1", history: 40 })
export const wifiDrop = story
  .machine(RoomMachine, { id: "Chat/wifi-drop", input: { roomId: "r1" }, fixtures: server })
  .process()                                                     // reset e1 → OWED → page 1–40 → SYNCED
  .checkpoint("loaded")
  .control(server.drop({ code: 1006 })).process()
  .checkpoint("down")
  .control(server.post({ text: "while away" }))
  .advance("500 millis").process()                               // backoff (an adapter deadline), resume from { e1, 40 }
  .checkpoint("back")
  .control(server.flap({ times: 9, upFor: "1 second" })).advance("5 minutes").process()   // r3: H1
  .checkpoint("flapped")
  .control(server.forgetReplay({})).control(server.refuseCatchUp({ times: 1 })).control(server.drop({ code: 1012 }))
  .advance("1 second").process()                                 // reset in e1 → OWED; the catch-up is refused
  .checkpoint("owed")
  .closeTab().openTab().process()                                // reload in OWED
  .advance("5 seconds").process()                                // the restored tick looks up again
  .checkpoint("healed")
  .control(server.restart({ epoch: "e2" })).control(server.drop({ code: 1012 }))
  .advance("1 second").process()
  .checkpoint("reset")
// loaded.snapshot.memory.at                         → { epoch: "e1", after: 40 }; state LIVE.SYNCED
// check(down.snapshot, E.Send({ clientId: "c1", text: "x" }))  → Denied "Offline"
// back.truth.FakeChatServer.connects.map((c) => c.at) → [{ epoch: "", after: 0 }, { epoch: "e1", after: 40 }]
// back.snapshot.memory.at                           → { epoch: "e1", after: 41 }
// flapped.evidence.session                          → nine connections, delays doubling, then failure Dropped; state LOST, then LIVE
// owed.snapshot.state                               → LIVE.OWED; owed.snapshot.memory.at → { epoch: "e1", after: 41 }
// healed.snapshot.state                             → LIVE.SYNCED; healed.snapshot.memory.at.after → the last message's seq
// reset.snapshot.memory.at                          → { epoch: "e2", after: <e2's head> }; state LIVE.SYNCED
```

**Size.** Definition 46 lines, machine 65 (imports and helpers included), against revision 2's 17 + about 110 (R2 authoring). The states
`CATCHING_UP`, `CATCH_UP_WAIT`, `OUT_OF_SYNC`, the `hold` helper, `held`, `through` and `catchUpTries` are gone.

### 7.2 Live presence (a `latest` stream)

The adapter folds the server's `presence_state` and `presence_diff` frames per connection, inside `connect`, so the
fold resets on every connection:

```ts
// presence.contracts.ts
export const Presence = {
  here: stream({                                                                                // existing
    id: "chat/presence",
    input: { roomId: Schema.String },
    output: Schema.Array(Schema.String),
    key: ["roomId"],
    delivers: "latest",                                                                         // capacity 1 by default (r3)
    subscribe: (input) => Session.reconnect({
      connect: () => Effect.gen(function* () {
        const frames = yield* PresenceSocket.use((s) => s.frames(input.roomId))                  // user-defined: succeeds once the server has joined this socket to the room
        return {
          claim: Session.open(),                                                                // latest: registered; Live at the first state frame
          values: frames.pipe(
            Stream.scan(() => new Set<string>(), (set, f) => (f.t === "state" ? new Set(f.ids) : applyDiff(set, f))),   // r3: the seed is lazy (EFX Stream.ts:14214)
            Stream.drop(1),                                                                     // scan emits its seed first
            Stream.map((set) => [...set].sort())),
        }
      }),
      position: () => undefined, schedule: backoff, while: isDrop,
    }),
  }),
}
// room.definition.ts: here: Presence.here                                                     bare: views read the row (MD 2.7.3)
// room.machine.ts:    ROOM: { activities: [O.here.subscribe(({ memory }) => ({ roomId: memory.roomId }))] }
```

```tsx
const here = useView(room, (s) => s.operations.here)
here?._tag === "Live" ? <Avatars members={here.data} /> : <Avatars members={here?.lastKnown?.value ?? []} dimmed />   // NEW (r3)
```

**The walk.** Joins and leaves coalesce into row publications. On a drop the row is `Down` with `lastKnown`, dimmed.
On reconnect it stays `Opening` until the new connection's first state frame, then `Live`, even if the set is the same
(equality never holds a row back, r3). **The Story** (`FakePresence`, controls `join`, `leave`, `drop`, `withhold`):
after `drop` the row reads `Down`, `lastKnown.value` `["ana"]`; after the reconnect and before the state frame,
`Opening`.

### 7.3 Stock ticker, and a quiet feed

```ts
// market.contracts.ts
export const Quote = Schema.Struct({ symbol: Schema.String, last: Schema.Number, asOf: Schema.Number })   // user-defined: asOf is the exchange's time
export const Market = { quote: stream({ id: "market/quote", input: { symbol: Schema.String }, output: Quote, key: ["symbol"], delivers: "latest", subscribe: quoteSession }) }

// watch.definition.ts
operations: ({ E }) => ({ price: Market.quote.outcomes({ value: E.Price.from((q) => ({ last: q.last, asOf: q.asOf })) }) }),   // r3: no `live`: only live values arrive

// watch.machine.ts
WATCHING: {
  activities: [O.price.subscribe(({ memory }) => ({ symbol: memory.symbol }))],
  schedules: { quiet: { schedule: "5 seconds", send: E.Quiet, armOn: [Flow.entry, E.Price] } },   // existing: armOn, Flow.entry
  on: {
    Price: [
      { target: "self", guard: ({ memory, event }) => event.last >= memory.alertAt || deny("NoAlert"), updateMemory: () => ({ alerted: true, quiet: false }) },   // a live value by construction (rule 55)
      { target: "self", updateMemory: () => ({ quiet: false }) },
    ],
    Quiet: { target: "self", updateMemory: () => ({ quiet: true }) },
  },
},
```

```tsx
const p = useView(m, (s) => s.operations.price)
const quiet = useView(m, (s) => s.memory.quiet)
p?._tag === "Live" ? <Price q={p.data} stale={quiet} /> : <Price q={p?.lastKnown?.value} since={p?.lastKnown?.since} stale />
```

**The walk.** At 1,000 ticks a second, one `Price` waits and reads the newest quote at admission. Each quote carries
`asOf`, so a repeated price is not an equal value and a healthy flat market keeps re-arming `quiet`. After a
reconnect on a quiet symbol the row is `Opening` with `lastKnown`, not `Live`. A value that arrives while `Down`
(a cache) updates `lastKnown` and never reaches `Price`, so revision 2's `event.live` guard is unnecessary and the
alert cannot fire on a stale price (R2 M, "freshness leaks through the mapper"). A watchlist is the same contract
placed with `O.price.subscribe.each(({ memory }) => memory.symbols.map((symbol) => ({ symbol })))` and read with
`O.price.get(s, { symbol })` (MD 2.7.10).

### 7.4 LLM tokens from a `fetch` body, a cut-off answer, and Stop (rebased)

The contract is 4.1.9's `Assistant.generate`.

```ts
// chat.definition.ts
operations: ({ E }) => ({
  gen: Assistant.generate.outcomes({
    success: E.Answered.from((v) => ({ messageId: v.messageId, text: v.text })),
    failure: { Busy: E.TryLater, Refused: E.TryLater, NotSent: E.TryLater },
    unknown: E.AnswerUnsure.from((r, { progress }) => ({ partial: progress?.text ?? "", stopped: r._tag === "Cancelled" })),   // its own Attempt's progress
  }),
}),

// chat.machine.ts
const conv = ({ memory }) => ({ conversationId: memory.conversationId })
IDLE:   { on: { Ask: { target: S.ASKING, guard: [O.gen.idle(conv)], actions: [O.gen.commit(({ memory }) => ({ conversationId: memory.conversationId, prompt: memory.draft }))] } } },
ASKING: { on: {
  Stop: { target: "self", actions: [O.gen.cancel(conv)] },                                       // InFlight: interrupts; the unknown { Cancelled } is retained (OD7)
  Answered: S.IDLE, TryLater: S.IDLE,
  AnswerUnsure: [
    { target: S.IDLE, guard: ({ event }) => event.stopped || deny("NotStopped"), updateMemory: ({ event }) => ({ partial: event.partial }), actions: [O.gen.cancel] },   // r3 (rebase): Held → released (OD8: key-less in its own ending)
    { target: S.CUT, updateMemory: ({ event }) => ({ partial: event.partial }) },               // cut off: the unknown holds the lane
  ] } },
CUT:    { on: {
  Continue: { target: S.ASKING, updateMemory: ({ memory }) => ({ draft: `Continue: ${memory.partial}` }), actions: [O.gen.cancel(conv), O.gen.commit(({ memory }) => ({ conversationId: memory.conversationId, prompt: memory.draft }))] },   // release, then a new Attempt, in action order (OD16)
  Dismiss: { target: S.IDLE, actions: [O.gen.cancel(conv)] },
} },
```

The view reads `Chat.O.gen.get(s, { conversationId })?.progress?.text` while asking and `memory.partial` after.
**The walk.** Tokens update the row's `progress`; a stalled body fails `Stalled`, so it becomes `unknown`, never a
clean end. Stop interrupts; the ending `unknown { Cancelled }` arrives with `partial` from its own Attempt and is
retained, so the lane is `Held` and `idle` would deny `Uncertain`; the handler's key-less `cancel` releases it, and the
next Ask is a new Attempt. `UnresolvedHold` passes: every branch that keeps the hold reaches a `cancel` (MD rule 45).
**The Story:** `FakeLlm({ tokens: ["Hel", "lo"], every: "100 millis" })`; `.send(E.Ask()).advance("100 millis")
.send(E.Stop()).process()` gives `AnswerUnsure { partial: "Hel", stopped: true }` and state `IDLE`; `.send(E.Ask())` is
allowed. A reload while asking ends the Attempt `unknown { Restored }` with `partial: ""` (rule 57).

### 7.5 Upload progress (rebased; r3: from a callback through `Stream.callback`)

`progress(v)` is an Effect, and XHR reports through callbacks (R2 M). Effect's answer is `Stream.callback` (EFX
`Stream.ts:725`), which is what the service already is; no `progress.sync` is needed:

```ts
// uploads.service.ts
export class Uploads extends Context.Service<Uploads, {                                         // user-defined transport service
  readonly put: (file: File, o: { idempotencyKey: string }) => Stream.Stream<UploadEvent, NoResponse>   // Progress events, then Done
}>()("app/Uploads") {}
export const XhrUploads = Layer.succeed(Uploads, {
  put: (file, o) => Stream.callback<UploadEvent, NoResponse>((queue) => Effect.acquireRelease(
    Effect.sync(() => {
      const xhr = new XMLHttpRequest()
      xhr.open("PUT", "/uploads"); xhr.setRequestHeader("Idempotency-Key", o.idempotencyKey)
      xhr.upload.onprogress = (e) => { Queue.offerUnsafe(queue, { _tag: "Progress", sent: e.loaded, total: e.total }) }
      xhr.onload = () => { Queue.offerUnsafe(queue, { _tag: "Done", status: xhr.status }); Queue.endUnsafe(queue) }
      xhr.onerror = () => { Queue.failCauseUnsafe(queue, Cause.fail(new NoResponse())) }      // abort is interruption: the release below
      xhr.send(file)
      return xhr
    }),
    (xhr) => Effect.sync(() => xhr.abort())), { bufferSize: 16, strategy: "sliding" }),         // progress is latest-wins; Done is last, never evicted by later events
})

// uploads.contracts.ts
upload: transaction({
  id: "files/upload", input: { uploadId: Schema.String, file: FileSchema }, output: { url: Schema.String },
  key: ["uploadId"], concurrency: "reject", progress: { sent: Schema.Number, total: Schema.Number },   // M6-D5: reject per upload
  commit: (input, { attempt, progress }) => Effect.gen(function* () {
    let done: { status: number } | undefined
    yield* Uploads.use((u) => u.put(input.file, { idempotencyKey: attempt.id })).pipe(
      Stream.runForEach((e) => (e._tag === "Progress" ? progress({ sent: e.sent, total: e.total }) : Effect.sync(() => { done = e }))),
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (done === undefined) return yield* Outcome.unknown(new CutOff())                       // a missing Done is never a clean end
    if (done.status >= 300) return yield* Outcome.failure(new Refused({ status: done.status }))
    return { url: `/files/${input.uploadId}` }
  }),
}),
```

The interruption of the commit's fiber (Stop, or a release) runs the `acquireRelease` finalizer, which aborts the XHR.
A Story replaces `Uploads` with a Layer whose stream emits scripted `Progress` events and `Done`.

### 7.6 `listen` feeding entity records, with a drop, a reconnect and a release (r3)

The contract is 7.7.2's `ticketEvents`; the operation and placement are 4.2's.

**The walk.**

1. The queue loads the ticket list. Until the channel's `SUBSCRIBED`, the list is stale with cause `listen`. The
   claim `open()` is unproven, so the list refetches once.
2. Another dispatcher saves t3. The push is applied, and the list repairs by its rules.
3. The channel errors (`CHANNEL_ERROR`), so `down`: stale again with cause `listen`.
4. Meanwhile t2 is deleted on the server.
5. The SDK rejoins: `SUBSCRIBED`, `open()`, `Unproven { Reconnected }`. The list refetches, and t2 leaves.
6. **The dispatcher opens the settings page** (r3; R2 H4): the queue's state is left, the session is released, and the
   list is stale with cause `listen`. Pushes stop; the list cannot look fresh. Coming back places a new session and
   the next read (the subscribed list refetches on its stale cause) clears it.
7. If the channel closes for good (`CLOSED`), `failure: Closed` reaches the machine (required) and the list is stale
   until the machine re-opens the session.

**The Story.**

```ts
const rt = FakeRealtime({ tickets: ["t1", "t2", "t3"] })
export const listenReconnect = story
  .machine(QueueMachine, { id: "Queue/listen-reconnect", input: { workspaceId: "w1" }, fixtures: rt })
  .process()
  .control(rt.status({ status: "SUBSCRIBED" })).process()       // unproven: one refetch
  .control(rt.status({ status: "CHANNEL_ERROR" })).process()
  .checkpoint("down")
  .control(rt.deleteOnServer({ id: "t2" }))                     // truth only: no push while down
  .control(rt.status({ status: "SUBSCRIBED" })).process()
  .checkpoint("healed")
  .send(E.OpenSettings()).process()                             // r3: the queue state is left; the session is released
  .checkpoint("released")
// Domain.entry.get(down, { workspaceId: "w1" }).stale      → [{ cause: "listen" }]
// Domain.entry.get(healed, { workspaceId: "w1" }).data     → t1, t3; .stale → false
// Domain.entry.get(released, { workspaceId: "w1" }).stale  → [{ cause: "listen" }]
```

### 7.7 Third-party SDKs (revision 3)

The pattern of revision 2 holds, with revision 3's changes: push SDKs call `emit(item)`; each claims once per
registration; `capacity` comes from the contract.

**Verified against Effect 4.0.5** (EFX), in addition to revision 2's list: `Socket.makeWebSocket`'s options
(`socket/Socket.ts:896-901`), the browser buffer and `highWaterMark` (`:930-947`, `:1015-1025`), "Sockets never
classify closes" (`:444-452`); `Stream.retry`'s reset at the first element (`Stream.ts:10489`, `Channel.ts:8089`);
`Stream.buffer` (`Stream.ts:7645`); `Stream.callback`'s buffer options (`:725-729`); `Stream.scan`'s lazy seed
(`:14214`); `Queue.offerUnsafe`, `Queue.endUnsafe`, `Queue.failCauseUnsafe` (`Queue.ts:801`, `:1375`, `:1262`);
`FiberHandle.makeRuntime` (`FiberHandle.ts:201`); `Schedule.max` (`Schedule.ts:856`), `Schedule.spaced` (`:1595`);
`Schema.TaggedError` (`Schema.ts:16653`). **Prior art cited:** TanStack Query's `streamedQuery` keeps a query
`pending` "until the first chunk of data is received" (TQ `streamedQuery.ts:40`), the same rule as a `latest` row's
`Opening` until a value; its `refetchMode: "replace"` keeps old data visible until the new stream finishes (`:13`,
`:46`), which is `lastKnown` in other words.

**From memory, not verified** (no SDK is installed): every SDK detail below and in revision 2, `EventSource`'s
behaviour, and graphql-ws's protocol.

#### 7.7.1 The OpenAI Node SDK and the Vercel AI SDK (writes)

Unchanged: both implement one `Llm` service, which 4.1.9's commit reads. `FakeLlm` replaces that service.

#### 7.7.2 Supabase realtime over `Session.push`

```ts
// realtime.transport.ts: the structural subset of supabase-js this adapter uses (rule 61)
export interface ChannelLike {                                                                  // user-defined
  on(type: "postgres_changes", filter: { event: "*"; schema: string; table: string; filter: string }, f: (p: ChangePayload) => void): ChannelLike
  subscribe(f: (status: string, err?: Error) => void): ChannelLike
}
export class Realtime extends Context.Service<Realtime, {                                       // user-defined
  readonly channel: (name: string) => ChannelLike
  readonly removeChannel: (c: ChannelLike) => Promise<unknown>
  readonly onSignedOut: (f: () => void) => () => void
}>()("app/Realtime") {}

// tickets.contracts.ts
export class RealtimeDown extends Schema.TaggedError<RealtimeDown>()("RealtimeDown", { status: Schema.String }) {}   // user-defined
export class Closed extends Schema.TaggedError<Closed>()("Closed", {}) {}
export class SignedOut extends Schema.TaggedError<SignedOut>()("SignedOut", {}) {}

export const ticketEvents = stream({                                                            // existing
  id: "DispatchDesk/ticket-events",
  input: { workspaceId: Schema.String },
  output: TicketEvent,
  key: ["workspaceId"],
  delivers: "every",                                                                            // capacity 1,000 by default (r3)
  subscribe: (input) => Session.push<TicketEvent, RealtimeDown, never, Closed | SignedOut, Realtime>((emit) =>   // NEW (r2); r3: emit
    Effect.gen(function* () {
      const rt = yield* Realtime
      yield* Effect.acquireRelease(
        Effect.sync(() => rt.channel(`tickets:${input.workspaceId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `workspace_id=eq.${input.workspaceId}` },
            (c) => emit(toTicketEvent(c)))                                                      // user-defined decoding
          .subscribe((status) => {
            if (status === "SUBSCRIBED") emit(Session.open())                                   // registration; no replay, so unproven
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") emit(Session.down(new RealtimeDown({ status })))
            else if (status === "CLOSED") emit.fail(new Closed())                               // after release, emit does nothing (rule 53)
          })),
        (channel) => Effect.promise(() => rt.removeChannel(channel)))                           // awaited before a new session joins the topic
      yield* Effect.acquireRelease(Effect.sync(() => rt.onSignedOut(() => emit.fail(new SignedOut()))), (off) => Effect.sync(off))
    })),
})
```

- A change that fires before `SUBSCRIBED` is delivered behind an implicit `open()`'s gap, and the later `SUBSCRIBED`
  is a second claim: two catch-ups, never a silent loss (rule 49).
- `flood({ count: 1_200 })` gives one `Overflow { lost: 200 }` gap, and the covered answers refetch.

#### 7.7.3 Firebase `onSnapshot` over `Session.push` (a `latest` stream; r3: claim on the transition)

```ts
export const roomMembers = stream({                                                             // existing
  id: "rooms/members",
  input: { roomId: Schema.String },
  output: Schema.Array(Member),
  key: ["roomId"],
  delivers: "latest",
  subscribe: (input) => Session.push<ReadonlyArray<Member>, FromCache, never, MembersDenied | MembersFailed, Snapshots>((emit) =>
    Effect.gen(function* () {
      const s = yield* Snapshots
      let fromServer: boolean | undefined = undefined                                          // r3: claim once per registration, not per snapshot
      yield* Effect.acquireRelease(
        Effect.sync(() => s.members(input.roomId,
          (snap) => {
            if (snap.fromCache && fromServer !== false) { fromServer = false; emit(Session.down(new FromCache())) }   // not registered: a cache
            if (!snap.fromCache && fromServer !== true) { fromServer = true; emit(Session.open()) }                   // the server answered: registered
            emit(snap.members)                                                                  // while Down, a value updates lastKnown only (rule 49)
          },
          (code) => emit.fail(code === "permission-denied" ? new MembersDenied() : new MembersFailed({ code })))),
        (unsubscribe) => Effect.sync(unsubscribe))
    })),
})
```

A cached snapshot is announced as `down` before its value, so it updates `lastKnown` and never reads as `Live`; the
first server snapshot claims and makes the row `Live`. Revision 2's adapter called `open()` on every server snapshot,
which the connection table now reads as a reconnect each time (evidence `Reclaimed`); the `fromServer` flag, one
variable, claims only on the transition. Without the leading `down`, a cached first snapshot would be an implicit
`open()` at the session's start and read as `Live` (rule 49): an adapter on a source with a cache must say so.

#### 7.7.4 Server-Sent Events: proving continuity with no `hello` (r3; R2 H8)

A notes feed whose server honours `?after=` and `Last-Event-ID`, sends dense ids, and has no `hello` and no read
endpoint. The proof is contiguity: the adapter holds its claim until the first event and checks it follows the last
id it has; a quiet connection claims `open()` after three seconds.

```ts
export class Sse extends Context.Service<Sse, { readonly open: (url: string) => EventSourceLike }>()("app/Sse") {}   // user-defined transport subset

export const notes = stream({                                                                   // existing
  id: "notes/feed",
  input: { after: Schema.Number },
  output: Note,
  key: [],                                                                                      // existing (OD23 Q38): one session
  delivers: "every",
  subscribe: (input) => Session.push<Note, Reconnecting, never, Closed, Sse>((emit) => Effect.gen(function* () {
    const sse = yield* Sse
    const timer = yield* FiberHandle.makeRuntime<never>()                                       // existing (EFX FiberHandle.ts:201): one claim timer per connection, on Effect's Clock
    let last = input.after                                                                      // the last id this session has, or its start
    let proving = false
    yield* Effect.acquireRelease(Effect.sync(() => {
      const es = sse.open(`/notes?after=${input.after}`)                                        // later reconnects send Last-Event-ID itself
      es.onopen = () => {
        proving = true
        timer(Effect.sleep("3 seconds").pipe(Effect.andThen(Effect.sync(() => { if (proving) { proving = false; emit(Session.open()) } }))))   // quiet: unproven
      }
      es.onmessage = (e) => {
        const note = { id: Number(e.lastEventId), body: e.data }
        if (proving) { proving = false; emit(note.id === last + 1 ? Session.resumed({ contiguous: { after: last, first: note.id } }) : Session.open()) }   // NEW (r3): the witness
        last = note.id
        emit(note)
      }
      es.onerror = () => { proving = false; es.readyState === 2 /* CLOSED */ ? emit.fail(new Closed()) : emit(Session.down(new Reconnecting())) }
      return es
    }), (es) => Effect.sync(() => es.close()))
  })),
})
```

- **A reconnect that replays** proves itself with its first event and delivers no gap. **A quiet reconnect** is
  unproven after three seconds, which is honest: nothing says the server kept the stream. **A server that cannot
  replay** delivers an `Unproven` gap, and with no read endpoint the machine accepts it (rule 54 (c)): it shows "some
  notes may be missing" and stays `SYNCED`. A feed whose ids are sparse cannot use contiguity, and every reconnect
  is a gap to accept; a `hello` from the server is the fix, and it is the server's to add.
- When the browser gives up (`CLOSED`), the session fails `Closed`, and a new session's `EventSource` carries the
  watermark in its URL.

#### 7.7.5 An SDK with no subscribe acknowledgement: graphql-ws (r3; R2 H7)

From memory: graphql-ws acknowledges the connection (`connection_ack`) but not each subscription; the server
registers a `subscribe` asynchronously and then sends `next` messages. Claiming at `connection_ack` would promise
registration before it exists, and a catch-up started on that claim's gap could finish before the server registered
the subscription, so facts between the two would be lost with the debt discharged. Three honest claim moments:

```ts
// A: the server acknowledges the subscription in-band (recommended where the server can be changed)
onNext: (msg) => msg.extensions?.subscribed ? emit(Session.open()) : emit(decode(msg))          // user-defined server extension: a first `next` saying "registered"
// B: the subscription's first real value is the claim (no server change); a quiet connection stays Opening
onNext: (msg) => { if (!claimed) { claimed = true; emit(Session.open()) } emit(decode(msg)) }
// C: a same-socket round trip the server orders after registration (only if the server processes subscribe before pong)
afterSubscribe: () => client.ping().then(() => emit(Session.open()))                            // from memory: not guaranteed by graphql-ws
```

With B, an `every` row stays `Opening` until the first value, so a guard on `Live` denies sends on a quiet feed; that
is the price of an SDK that cannot say when it is listening, and it is stated rather than hidden. Rule 49 makes the
choice the adapter's and the meaning Flow's.

#### 7.7.6 Polling with a cursor (DD)

DD's polling adapters (`next/http-api.ts:151-194`) become `Session.reconnect` over a long-poll: each `connect` claims
`resumed({ cursor })` when the server answers "from your cursor" and `gap(new Reset(…), { at })` otherwise; values
complete at each poll's end, so `while` accepts `ConnectionEnded` and the next poll starts from the last position. A
failed GET is a `down`, never `Effect.orDie`. The input carries the watermark, so a new session no longer starts at
cursor `"0"`.

#### 7.7.7 What the SDKs confirm

- `Session.reconnect` where the adapter reconnects (WebSocket, polling); `Session.push` where the SDK does (Supabase,
  Firestore, SSE). Both make the claim structural; the claim moment is always the adapter's knowledge of registration.
- No SDK type crosses the transport service. Each fake sits below the adapter, so classification, the bound,
  decoding, heartbeats, claim timers and handshakes run in Stories.
- Cancellation is Effect interruption: the commit's `signal`, or a finalizer (`removeChannel`, `unsubscribe`,
  `close`, `xhr.abort`), awaited before a restart.

### 7.8 Cursors: outbound state (deferred, r3)

Revision 2's `publish` (an activity's latest-wins state re-sent on every connection) is deferred to its own proposal
(M6-D17, Q11). Review 2 found three lifecycle holes it did not answer: nothing clears a cursor when the placement ends
(ghost cursors on a shared socket), a restored memory value is republished as if current, and a turn per move at
30 Hz. Each needs a decision of its own (an end value, a restore rule, a rate), and none blocks streams. Until then an
app writes outbound state from the adapter's own service, outside Flow.

## 8. Alternatives considered

Revisions 1 and 2 (kept as prior art; one line each):

- **A1. Flow re-opens sessions** (a `retry` policy on the contract): rule 25; SSE reconnects regardless.
- **A2. A session is one connection, every reconnect is the machine's**: the row vanishes while waiting, and every
  feed needs two states for a Wi-Fi blip. Kept for decisions (4.3.4).
- **A3. Status inside the value** (SE's workaround): the store cannot act on it, and `flow check` cannot see it.
- **A4. Delivery chosen by the mapping**, **A5. per placement**: what a value is belongs to the data.
- **A6. A Flow-held cursor**, **A20. a Flow-held watermark**: Flow would compare author positions, and the cursor
  would be a second truth beside memory.
- **A7. Late routing for deliveries after release**: a session owes nothing after release.
- **A8. Gaps only on re-opens**: the first-live race.
- **A9. Gaps on the unknown channel**: reads have no unknown.
- **A10. A streaming write as a stream plus a transaction**, **A11. progress as deliveries**: two owners; a turn per
  token.
- **A12. Connection changes as mapped events**: guards and views read the row; no walk needed a turn on `down`.
- **A13. A `receivedAt` row field**: the source's timestamp is the truth for a quiet feed.
- **A14. Persisting queued deliveries**: a reload ends the session; resume and continuity cover them.
- **A15. Sharing one session between two placements**: one value would become two events.
- **A16. `open` before a connection's first element**: a quiet connection never opens (R1 H1).
- **A17. One `fresh: boolean` beside `data`**: correct but ignorable.
- **A18. `Live` after a value on every kind**: an `every` feed is live from its claim.
- **A19. A snapshot as `resumed` on `every`**: a snapshot omits the facts in between.
- **A21. `complete` required instead of `ConnectionEnded`**: both are needed.
- **A22. A `delivers` option on `Session.push`**: one policy is right for both kinds; r3 moves the bound to the
  contract anyway.
- **A23. Outbound sends as transactions**: an Attempt per cursor move.
- **A24. Fake the adapter's service in Stories**: overflow, classification and handshakes never ran.

Revision 3 considered these:

- **A25. Reset the schedule at the first element, as Effect's `Stream.retry` does** (EFX `Stream.ts:10489`).
  Rejected: a server that sends its `hello` and then drops resets the budget every time, which is R2 H1 again.
- **A26. Ignore a second claim on `latest` and treat it as a new connection only on `every`** (R2 H3's suggestion).
  Correct for the facts, but on `latest` a silent re-registration may have missed changes, so the row would read
  `Live` over a possibly stale value. One rule for both kinds costs one flag in an adapter that claims per snapshot
  (7.7.3). Asked as Q4.
- **A27. Hold values that arrive before a claim inside `Session.push`, until the claim** (R2 M). Rejected: if the claim
  never comes, values wait for ever (or overflow), and `Session.reconnect` would need the same rule. The connection
  table puts the gap first instead, for every constructor.
- **A28. `Session.cached(v)`, or a separate `cached` outcome** (R2 authoring and M). Rejected: a third channel for a
  value nobody should act on as fresh; the row's `lastKnown` already shows it.
- **A29. Ship the watermark as a Flow module** (`Watermark.make`, R2 H2's "reusable piece"). With rule 54's debt the
  recipe is three one-line helpers and a sub-state (7.1); a module would add API for little. Asked as Q9.
- **A30. The catch-up as a live placement keyed by a debt counter**, re-opened on restore. Rejected as a hack: the
  counter exists only to force a new cache entry, and `KeyOmitsInput` would have to be silenced for it. A one-off
  lookup per gap (MD rule 42) and a state's schedule do the same honestly.
- **A31. Contiguity as a Flow option** (`follows: (from, first) => boolean` on both constructors, R2's and revision 2's
  R2.2 B). Rejected for now: it is ten lines of adapter code where it is needed (7.7.4), a Flow option would need a
  "within" timeout and a delayed claim in the runtime, and only dense positions can use it.
- **A32. Runtime-owned sessions, adopted by identity, as write lanes are** (OD19). Rejected (4.4): a session owes
  nothing after release, and adoption would keep a socket open for an actor that no longer exists.
- **A33. The Runtime demotes every `Live` row on `visibilitychange`** (R2 M, `restartOn: Session.wake`). Rejected for
  now: the heartbeat deadline is overdue on wake and fires at once (Machines O5's rule for schedules), so the window is
  one timer's run; a Runtime-wide demotion would make every row blink on every tab switch. Asked as Q12.
- **A34. Keep `DuplicateSession` as a failure** for two operations on one contract and key. Rejected: one operation
  placed twice is already `DuplicatePlacement`; two operations are two consumers, and two sessions are only wasteful.
  Asked as Q10.
- **A35. Keep `publish` with three fixes** (an end value, no restore, a rate). Deferred: each fix is a decision, and
  none blocks streams. Asked as Q11.

## 9. Open questions (revision 3)

Revision 2's R1.1 and R1.2 are folded into Q1 and Q2; R2.1 into Q11; R2.2 is answered (A31; contiguity is adapter
code); R2.3 is answered by C9 (Q5 asks only the default). Reply `Q1 A`. Every option below is correct; the questions
are about readability, scope and API.

### Round 1: the row and freshness (M6-D9)

**Q1. How does a row say it is live?**

```ts
// before (revision 2): connection only on Running, so this does not compile against the terminal variants
guard: ({ activities }) => activities.feed?.connection === "Live" || deny("Offline")
// A (recommended): one discriminant on every variant
guard: ({ operations }) => operations.feed?._tag === "Live" || deny("Offline")   // NEW (r3): _tag "Opening" | "Live" | "Down" | "Complete" | "Failure" | "Defect" | "Interrupted"
// B: keep _tag "Running" and add connection to every variant ("Closed" on the terminal ones)
guard: ({ operations }) => operations.feed?.connection === "Live" || deny("Offline")
```

A has one field to read and no impossible combinations (`Running` with `Closed`). B keeps OPS O6's `Running` word.
*Recommendation: A.*

**Q2. What is `lastKnown`?**

```ts
// before (revision 2): lastKnown: A, so this renders a stale price as fresh and type-checks
<Price q={p._tag === "Live" ? p.data : p.lastKnown} />
// A (recommended): Stale<A> = { value, since }
<Price q={p._tag === "Live" ? p.data : p.lastKnown?.value} since={p.lastKnown?.since} />   // NEW (r3): the stale path names itself
// B: lastKnown: A (revision 2)
```

*Recommendation: A.* One word more, and it carries the age a view needs to say "as of 2 minutes ago".

**Q3. What does the machine hear from a `latest` stream that is not live?**

```ts
// before (revision 2): every value, with live in the mapper
price: Market.quote.outcomes({ value: E.Price.from((q, { live }) => ({ last: q.last, live })) })
Price: { guard: ({ event }) => event.live || deny("Stale"), … }
// A (recommended): nothing; only values that arrive while Live are delivered
price: Market.quote.outcomes({ value: E.Price.from((q) => ({ last: q.last })) })
// B: Session.cached(v) in the adapter and a `cached` outcome key
price: Market.quote.outcomes({ value: E.Price.from(…), cached: E.CachedPrice.from(…) })   // NEW, rejected (A28)
```

*Recommendation: A.* It removes a field and an outcome, and a cached price can no longer trigger an alert.

### Round 2: connections and adapters (M6-D8, M6-D10, M6-D11, M6-D14)

**Q4. What is a second claim while `Live`?**

```ts
// an SDK that rejoins silently and reports SUBSCRIBED again, with no CHANNEL_ERROR between
// A (recommended): a new connection on both kinds; every delivers its gap, latest goes Opening until a value
// B: a new connection on every; ignored on latest (A26)
// Firestore under A claims only on the transition (7.7.3):
if (!snap.fromCache && fromServer !== true) { fromServer = true; emit(Session.open()) }
// under B it may claim on every snapshot:
if (!snap.fromCache) emit(Session.open())
```

*Recommendation: A.* One rule for both kinds, and a silent re-registration never shows an old value as live.

**Q5. When does `Session.reconnect`'s schedule restart?**

```ts
// before (revision 2): at every open; a draining load balancer loops at 500 ms
// A (recommended): after a connection lasts stableAfter, default 10 seconds
Session.reconnect({ connect, position, schedule, while })                       // stableAfter: "10 seconds" implied
// B: stableAfter required, no default
Session.reconnect({ connect, position, schedule, while, stableAfter: "10 seconds" })
// C: at the first value, as Effect's Stream.retry (A25)
```

*Recommendation: A.* Ten seconds outlasts a greet-and-drop, and almost no author would choose a different number.

**Q6. Where is the bound, and does it have a default?**

```ts
// before (revision 2): on Session.push only, required
Session.push((emit) => …, { capacity: 1_000 })
// A (recommended): on the contract, defaulted by kind (1,000 every, 1 latest); pull sources wait, push sources gap
stream({ id, input, output, key, delivers: "every", subscribe })                // capacity: 1_000 implied
stream({ id, input, output, key, delivers: "every", capacity: 5_000, subscribe }) // NEW (r3): override
// B: on both constructors, required (Session.push and Session.reconnect)
```

*Recommendation: A.* The bound is a property of the feed (locality); the constructors then need no option.

**Q7. Must `resumed` carry a witness?**

```ts
// before (revision 2)
claim: Session.resumed()
// A (recommended): required, recorded in evidence
claim: Session.resumed(hello)                                                   // NEW (r3): "resumed by { t: "resumed", after: 40 }"
emit(Session.resumed({ contiguous: { after: last, first: note.id } }))
// B: optional
```

*Recommendation: A.* Flow cannot check a witness, but a Story, a reviewer and Inspection can read one, and a bare
`resumed()` is the most dangerous line an adapter can write (R2 authoring).

**Q8. What does a push adapter call?**

```ts
// before (revision 2): seven members
emit.value(v); emit.open(); emit.resumed(); emit.gap(r); emit.down(r); emit.fail(e); emit.end()
// A (recommended): one call for items, the same Session signals as a Stream uses, plus fail and end
emit(v); emit(Session.open()); emit(Session.down(r)); emit.fail(e); emit.end()   // NEW (r3)
// B: revision 2's seven members
```

*Recommendation: A.* One vocabulary for both constructors.

### Round 3: consumers and scope (M6-D12, M6-D15, M6-D16, M6-D17)

**Q9. Does Flow ship the watermark?**

```ts
// A (recommended): a documented recipe; the debt is a state
states: [{ LIVE: ["SYNCED", "OWED"] }, …]
const advance = (m, x) => ({ ...merge(m, [x]), at: { epoch: x.epoch, after: x.seq } })
const paged = (m, p) => ({ ...merge(m, p.messages), at: { epoch: p.epoch, after: p.through } })
// B: a Flow module over memory
at: Watermark.field(Position)                                                    // NEW, proposed only under B
updateMemory: ({ memory, event }) => ({ at: Watermark.value(memory.at, position(event.message)) })
```

*Recommendation: A.* After rule 54, the recipe has no algorithm left to get wrong; the state carries the debt, and a
module would duplicate what the state already says.

**Q10. Two operations on one stream contract and key, placed at once?**

```ts
operations: ({ E }) => ({
  feed: Chat.messages.outcomes({ … }),
  unread: Chat.messages.outcomes({ value: E.Unread.from(…), gap: E.Recount, complete: E.Recount }),   // a second consumer of the same room
})
// A (recommended): two sessions, a flow check warning DuplicateSession
// B: the second fails DuplicateSession, which both operations must map (revision 2 rule 47)
```

*Recommendation: A.* `DuplicatePlacement` already catches the real mistake (one operation placed twice).

**Q11. Outbound state (`publish`)?**

```ts
// revision 2
others: O.Doc.cursors.subscribe(params, { publish: ({ memory }) => memory.myCursor })
// A (recommended): deferred to its own proposal; until then the adapter's own service sends it
// B: keep in merge 6, with an end value, no republish after restore, and a rate
O.cursors.subscribe(select, { publish: { value: ({ memory }) => memory.myCursor, onEnd: null, every: "33 millis" } })   // NEW, proposed only under B
```

*Recommendation: A.* Three lifecycle decisions that do not block streams.

**Q12. A page waking from the background?**

```ts
// A (recommended): no API; the adapter's heartbeat deadline is overdue on wake and fires at once
Stream.timeoutOrElse({ duration: "40 seconds", orElse: () => Stream.fail(new Dropped({ code: 4000 })) })
// B: the Runtime demotes Live rows when the page becomes visible, until the next value or claim
```

*Recommendation: A.* B makes every row blink on every tab switch to close a window of one timer's run.

**Q13. Who owns a session?**

```ts
// A (recommended): the placement's activation; disposed actor = released session; never adopted or persisted (4.4)
// B: the Runtime, by (identity, contract id, key), adopted by the next incarnation, as write lanes are (OD19)
```

*Recommendation: A.* A write's ending is owed because the server may have changed; a session owes nothing, and the
watermark is already in persisted memory.

## 10. Decisions

### 10.1 Accepted (owner, 2026-10-30)

- **M6-D1 `stream()` carries server-pushed data; a write reports on itself through `progress`.** Data the server
  pushes independently of any write (chat, presence, prices, `listen`) goes through `stream()`. A streaming write (an
  LLM answer, an upload) stays a transaction with its Attempt and endings, and its commit reports `progress(value)`;
  Flow counts nothing. *Rebase note (r3): `progress` keeps its own schema (OD18) and lives on the Runtime's write lane
  (OD19).*
- **M6-D2 The contract stays "`subscribe` returns an Effect `Stream`".** Any third-party SDK reaches it through
  `Stream.fromAsyncIterable`, `Stream.fromReadableStream` or `Stream.callback` (or `Session.push`), inside an Effect
  service the author writes. The change those cases forced (only a session's first value implies `open`) is kept; the
  clause "a value while `Down` updates data, not `connection`" is superseded in part by M6-D9 and M6-D10 if accepted.
  *Rebase note (r3): `result` is `output` (OD12).*
- **M6-D3 `Session.reconnect` ships as designed (Q1),** marked for the owner's later review. Superseded in part by
  M6-D8 if accepted.
- **M6-D4 Q2–Q4 take their recommendations:** progress is a read and the ending mapper's `progress`, not a mapped
  event; `every` delivers one value per turn; the names are `delivers` and `connection`. *Superseded in part by M6-D5
  (the read's spelling), and `connection` by M6-D9 (r3) if accepted.*
- **M6-D5 (multiplicity audit, 2026-10-31; supersedes M6-D4's `x.progress(g | s, key)`).** Progress is the write row's
  `progress`, and exists only under `reject`, `latest` and `cancel`, where a lane has one addressable Attempt;
  declaring it on `allow` or `serialize` is a type error. *Rebase note (r3): the row is read with
  `O.gen.get(s, k)?.progress` (MD 2.7.5), not from `s.calls`.*
- **M6-D6 (multiplicity audit).** Two sessions of one `listen` entry on one key in one Runtime are two sources: both
  apply, either's gap lowers frontiers, and `flow check` warns `DuplicateListen` (rule 58). Open for the owner: sharing
  one `listen` session per Runtime.
- **M6-D7 (multiplicity audit).** A keyed activity holds one session per key; two keys projecting one descriptor key
  are `DuplicateSession` for the later key. *Rebase note (r3): settled differently by the merged design, which the
  owner accepted later: `subscribe.each` gives one session per distinct key, and "two selected inputs with the same
  key are one session" (OD9 Q22, MD rule 41, 2.7.10). The `DuplicateSession` clause no longer applies.*

### 10.2 Proposed, not accepted

These change nothing until the owner accepts them. Each names the questions in section 9 that decide its open parts.

- **M6-D8 (r2, revised in r3; supersedes M6-D3 in part).** `Session.reconnect`: `connect` returns a registered
  connection `{ claim, values }`; a connection whose values complete is offered to `while` as `ConnectionEnded`;
  **the schedule restarts only after a connection has stayed registered for `stableAfter`, default 10 seconds** (r3,
  was "at each open"); `from` follows a claim's `at` (r3). Reasons: C1, C9. Q5.
- **M6-D9 (r2, revised in r3; supersedes M6-D2's lane clause and M6-D4's `connection`).** The row is typed by kind and
  freshness with **one discriminant `_tag`** (r3); a `latest` row has `data` only while `Live` and
  **`lastKnown: Stale<A>`** otherwise (r3); an `every` row has no data; **a `latest` value reaches the machine only
  while `Live`**, and the mapper's `live` is cut (r3). Reasons: C2, C12. Q1, Q2, Q3.
- **M6-D10 (r3).** A claim promises registration, and the connection table (4.1.2) gives every input one conservative
  meaning in every state: a claim while `Live` is a new connection; on `every`, a value after `down` with no claim
  arrives behind an `Unproven` gap. Reason: C8. Q4.
- **M6-D11 (r3).** The bound is the session's: `capacity` on the contract, defaulted by kind; pull sources wait, push
  sources gap; signals take no buffer and adjacent gaps merge. `Session.push` loses its option, and `Emit` becomes
  `emit(item)`, `emit.fail`, `emit.end`. Reasons: C10, C13. Q6, Q8.
- **M6-D12 (r3; supersedes revision 2's rule 45 text).** A delivered gap is a debt: the watermark freezes until a
  catch-up started after the gap completes, a new session from the frozen watermark starts, or the app accepts the
  loss. Claims carry `at`. The recipe holds the debt as a state. Reason: C11. Q9.
- **M6-D13 (r3).** A `listen`-covered answer is fresh only while every covering session is `Live`; release and ending
  make it stale until a read. Reason: C12.
- **M6-D14 (r3).** `resumed` requires a witness: the server's in-band answer or the first value's contiguity, recorded
  in evidence. Reason: C8. Q7.
- **M6-D15 (r3; replaces revision 2's rule 47).** `DuplicateSession` is a `flow check` warning, not a failure reason;
  one operation placed twice is `DuplicatePlacement`. Q10.
- **M6-D16 (r3).** Sessions belong to their placement's activation, not the Runtime: released on actor disposal,
  never adopted, never persisted; a `latest` row's last value is kept with the actor's record by (contract id, key).
  Reason: the task's question about OD19 and OD20 (4.4). Q13.
- **M6-D17 (r3).** `publish` is deferred to its own proposal. Reason: C13. Q11.

## 11. Streams in the merged design (operations-in-definition)

Revision 2's section 11 guessed at OID. The merged design now answers every row; this is where each piece of this
proposal lives, which decision placed it there, and what merge 6 still adds.

| Piece | In the merged design | Settled by | Merge 6 adds |
| --- | --- | --- | --- |
| the contract | `stream({ id, input, output, key, subscribe })` in `*.contracts.ts`; `key` required, `[]` for one session; the resume position an input field outside the key | OD4, OD12, OD14, OD17 Q18, OD23 Q38; MD rule 39 | `delivers`, `capacity` (rules 48, 56) |
| its function | `subscribe(input, …)` inline, calling services whose Layer is the swap point | OD11 | the `Session` vocabulary, `Session.reconnect`, `Session.push` (rules 49–52) |
| the operation | `feed: Chat.messages.outcomes({ … })` under `operations`; streams exempt from `SharedContract` | OD3, OD9 Q4, OD17 Q16; MD rule 40 | outcome keys `value`, `gap`, `complete`, `failure` and their requirements (rule 59) |
| a bare stream | `here: Presence.here`: no events, the row for views | MD 2.7.3 | — |
| placing it | `activities: [O.feed.subscribe(select, { when? })]`, `subscribe.each` for one session per key; one verb (`VerbMismatch`); `DuplicatePlacement` | OD2, OD2a, OD9 Q22, Q23, OD17 Q14; MD rule 41 | release before restart; the `DuplicateSession` warning (rules 53, M6-D15) |
| reading it | `s.operations.feed`, `undefined` while not placed; `O.feed.get(s, k)` under `each`; `O.x.get(operations, k)` in guards | OD9 Q21, OD23 Q33; MD rule 42, 2.7.5 | the row's type (4.1.5) |
| mapper context | `(value, { input, key })` | OD12 | — |
| mapped events only from endings | a stream's mapped events are never a schedule's `send`, a `raise` or a view's `send` | OD23 Q33; MD rule 47 | deliveries count as endings for this rule |
| keyed time | keyed schedules with key records; `keys` may read `operations` | OD17 Q13, OD23 Q29 | — |
| write lanes | Runtime records by (identity, contract id, key); adopted; persisted | OD19, OD20, OD21, OD25; MD rules 21, 44, 46 | progress on them (rule 57); sessions are not (rule 53, M6-D16) |
| one-off reads | one lane per operation; the latest lookup delivered; not persisted | OD9 Q6, Q26; MD rule 42 | the catch-up's discharge rule relies on both (rule 54) |
| the hold after `cancel` | `unknown { Cancelled }` retained; `Held` | OD5, OD7; MD rule 24 | 7.4's release before the next Ask |
| `flow check` | `SharedContract`, `DuplicatePlacement`, `VerbMismatch`, `KeyRequired`, `UnresolvedHold`; `KeyOmitsInput` exempts streams | MD 2.7.16 | rule 59's errors; `DuplicateSession`, `DuplicateListen` warnings |

What the merged design does not touch, and merge 6 keeps: the connection table, continuity and witnesses, the
session's bound, the typed row, the debt (rule 54), `listen`'s coverage, the lifecycle table (4.6), and transports
below the adapter.

### 11.1 To explore: a manual reconnect member (owner, 2026-10-30; not decided, parked with streams)

Under operations-in-definition (OD2), a stream is placed with its contract's own verb, `O.feed.subscribe(select)`.
A stream has no manual member today: `Session.reconnect` reconnects inside a session, and a machine reconnects by hand
by leaving and re-entering the placing state (7.1: `LOST` → `LIVE`). Open: whether a "Reconnect now" control that
does not leave the state is needed. If it is, the member is named `reconnect`, not `refetch` (a resource word).
Revision 3 adds one fact for whoever explores it: under rule 54, a reconnect from the frozen watermark is also a
discharge (b), so the member would double as "resync now" for feeds without a read endpoint.

```ts
// today: leave the state and come back
LOST: { on: { RetryFeed: S.LIVE } }
// to explore: a member
ReconnectNow: { target: "self", actions: [O.feed.reconnect] }   // NEW, proposed: reconnect (parked)
```

## 12. The executable models to build next (proposed)

The write lane converged once it was a model (merged/operations/lane-model/: `model.ts`, `events.ts`, `main.ts`,
mutations). Two state machines here would do the same; both are small, and they compose.

**Model 1: the connection (one session, one kind at a time).**

- *State:* the row tag (`Opening`, `Live`, `Down`, terminal); `isFirstConnection`; the session's last value and
  whether it came from the current connection (`latest`); the session buffer (values and at most one gap, capacity
  `c`, small, e.g. 2); the adapter's in-session `from`; the schedule step and the current connection's age; `released`.
- *Alphabet:* adapter `claim(open | resumed | gap(r, at?))`, `value(p)`, `gapItem(r)`, `down(d)`, `valuesComplete`,
  `fail`, `end`; Flow `pull` (the consumer's turn), `release`, `tick(Δ)` (clock); the server's log appends.
- *Invariants to check:*
  1. **Gap first**: on `every`, no value is delivered whose position is not contiguous with the previous delivered
     value in the server's log unless a gap was delivered between them.
  2. **No silent loss**: every fact the server produced after a claim and before the next `down` is delivered or
     covered by a delivered gap.
  3. **Freshness**: on `latest`, the row is `Live` only if `data` equals the server's current value as of the last
     claim or later (modulo in-flight).
  4. **Bounded**: the buffer never exceeds `c` values and one gap, for any sequence of signals.
  5. **Release**: after `release`, nothing is delivered and the row is gone.
  6. **Budget**: a server that drops every connection within `stableAfter` ends the session within the schedule's
     recurrences; one that keeps a connection longer than `stableAfter` restarts it.
  7. **Totality**: every (state, input) pair has a defined successor (the connection table has no "ignored").
- *Mutants worth running:* ignore a second claim on `every` (R2 H3); reset the schedule at open (H1); let a `latest`
  value while `Down` reach the machine (C12); drop a signal when the buffer is full (r1's sliding queue).

**Model 2: the debt (consumer memory against a server log with epochs).**

- *State:* the server log per epoch, the replay window the socket can serve, and the HTTP history; the consumer's
  `at`, `messages`, and state (`SYNCED`, `OWED`, `LOST`); the latest lookup (its start time and from); persisted
  memory and state.
- *Alphabet:* Model 1's deliveries (value, gap with reason, ending) as an abstract feed that may lie only in ways rule
  49 allows; lookup start, page arrival (complete or not, possibly after a newer lookup), lookup failure; tick;
  reload (persist, drop non-persisted lanes, restore, new session from `at`); server reset; replay window shrink.
- *Invariants to check:*
  1. **Watermark** (W1): every fact at or before `at`, in `at`'s epoch, is in `messages`.
  2. **Debt** (W2): in `SYNCED`, every fact up to the last delivered value is in `messages`.
  3. **Liveness** (W3): if lookups eventually succeed, `OWED` is eventually left.
  4. **No stale discharge**: a page whose lookup started before the latest gap never moves the state to `SYNCED`.
  5. **Reload**: a reload in any state preserves 1 and 2, and from `OWED` reaches `SYNCED` under 3's assumption.
- *Mutants:* infer holes from dense positions (revision 2's `hold`); discharge on any page; reset `at` to the highest
  seen; drop the claim's `at`; replace a debt state with a memory flag that is not restored.

## New keywords

| Keyword | Meaning |
| --- | --- |
| `delivers: "every" \| "latest"` | what a stream's values are: facts delivered one by one, or the current state (rule 48) |
| `capacity` (r3) | the session's bound, on the contract; default 1,000 on `every`, 1 on `latest` (rule 56) |
| `Session` | the adapter vocabulary: `open()`, `resumed(witness)`, `gap(reason, { at? })`, `down(reason)` (rule 49) |
| claim | a connection's first signal, a promise of registration: `open`, `resumed` or `gap` (rule 49; r3: its meaning) |
| connection table (r3) | the meaning of every input in every connection state (4.1.2) |
| witness (r3) | what proved a `resumed`: the server's answer or the first value's contiguity, in evidence (rule 50) |
| `at` (r3) | on a claim: where the connection streams from, used as the next `from` (rule 52) |
| `Session.reconnect` | the combinator that reconnects inside one session; `connect` returns `{ claim, values }` (rule 52) |
| `stableAfter` (r3) | how long a connection must last before the reconnect schedule restarts; default 10 s (rule 52) |
| `Session.ConnectionEnded` | offered to `while` when a connection's values complete |
| `Session.push` | the push boundary for callback sources; the session's bound applies (4.1.6) |
| `emit(item)`, `emit.fail`, `emit.end` (r3) | `Session.push`'s calls; `item` is a value or a `Session` signal |
| `_tag` on a stream row (r3) | `"Opening" \| "Live" \| "Down" \| "Complete" \| "Failure" \| "Defect" \| "Interrupted"` (4.1.5) |
| `Stale<A>`, `lastKnown` (r3) | a `latest` row's last value while not `Live`: `{ value, since }` (4.1.5) |
| gap | a delivery saying values may be missing: the adapter's reason, `Unproven` or `Overflow` (rule 50) |
| `Unproven { why }` | Flow's gap reason for an unproven claim: `"Opened"` or `"Reconnected"` |
| `Overflow { lost }` | Flow's gap reason for values `Session.push` dropped at the session's bound |
| watermark | the resume input: every fact at or before it is held (rule 54) |
| debt (r3) | a delivered gap not yet discharged; the watermark freezes (rule 54) |
| `listen` stale cause | an answer's push channel is not `Live`, has ended, or was released (rule 58) |
| `Reclaimed`, `NoClaims` (r3: `Reclaimed` replaces `ExtraClaim`) | Inspection evidence for adapter claim sequences |
| `DuplicateSession` (r3: a warning) | two operations on one stream contract can hold one key at once |
| `DuplicateListen` | two actors can hold sessions of one `listen` entry on one key (rule 58) |
| progress | what a streaming write reports before its ending, stored per Attempt on the write lane (rule 57) |
