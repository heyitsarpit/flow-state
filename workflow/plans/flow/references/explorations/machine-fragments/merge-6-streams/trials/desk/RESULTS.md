# Desk trial of proposal-v3 streams: results (second pass, final spec)

Paper test of the final [proposal-v3.md](../../proposal-v3.md) against the desk's `Tickets/feed`, `Presence` and `Assistant`, with
their fakes, Stories and tests, in the forms of [stories-amended.md](../../../merged/story-checks/stories-amended.md) and
[fakes-v2.md](../../../merged/story-checks/fakes-v2.md). Nothing outside `trials/desk/` was edited. Everything is **proposed** until the owner reads it.

**What ran.** `node_modules/.bin/tsc -p trials/desk/tsconfig.json` passes under `tsconfig.base.json`'s flags, with real Effect 4.0.5 and
my stand-ins (`standin/flow-state.ts`, `standin/testing.ts`, three stubs), rewritten for the final API. No `any` in `features/` or
`testing/`. The only explicit generics are the spec's `Feed.callback<A, E>` (three, in `presence.channel.ts`) and Schema's own
`TaggedError<...>` in an unchanged file. Nothing executed. `checks/negative.ts` tries 19 claims of the spec (14 compile errors that
must fire, 5 that must compile) and all hold in the stand-in. That proves the stand-in matches the spec's words, not that Flow can type it.

## 1. What changed from the first pass

| Spec change | In the trial |
| --- | --- |
| No `errors` | `E` is inferred from `subscribe` and `catchUp` (two type parameters in the stand-in, `E1 \| E2`). Both desk feeds and all three Presence feeds drop the line |
| `while` a predicate, after `subscribe` and `catchUp` | `reconnect: { while: (e) => e._tag === "SocketDropped" }` at the end of both feed contracts. `e` is typed, and a wrong tag does not compile |
| `idleTime` | Renamed. Feed: `"45 seconds"`. Presence: omitted, since the SDK heals itself |
| `Feed.callback<A, E, R>` module function, not a context word | Used in `presence.channel.ts`. The feed needs none (its source is `DeskSocket`'s frames, a Stream) |
| Adapters in services | New `feed.socket.ts` (`DeskFeedSocket`: `changes`, `activity`) and `presence.channel.ts` (`PresenceChannel`: `viewers`, `typing`, `technician`). `subscribe` is one line: `Stream.unwrap(Effect.map(Service, (s) => s.x(key)))`. Stories provide the layer over the fake |
| Read answers as objects | `Feed.done({ items, proof, through })`, `Feed.more({ items, next, through })`, `Feed.gone({ reason, next })`. `proof` is required: "server: page.complete" |
| `Feed.live({ head })` replaces `at` | Not usable: the desk's `hello` carries no head (3.1) |
| `fills` checked in the definition | A wrong name, a string or a boolean does not compile (stand-in; `checks/negative.ts` 5 to 9) |
| `failure` exhaustive over E | `SocketDropped` is back in both maps, unreached under the default |
| `O.x.refetch` | In the stand-in; **the desk has no use for it** (no reload action; see 4) |
| Q5: escalating re-open stays a machine recipe | The machine keeps `reopenInMs`, `Healthy`, `slower` and `bothLive`, as the desk had them. Last pass's fixed 30 s guess is gone |
| `bufferSize` cut | Never used here. The Presence burst is 1,025 frames |
| `clearedAt` | Not used. The bookmark's `filled` appears only as the records' field |
| Bookmark readable (3.8) | Five assertions restored via `records("session", ...).at(-1)?.bookmark` |
| Flapping Story by plain construction | `flapped` in `feed.story.ts`, a `reduce` of 7 drop-and-advance cycles plus the eighth drop |
| `ping: { every, frame }` on `Fake.stream` | The Desk socket pings every 20 s. **Needed**: with `idleTime` 45 s a Story's clock trips `Silent` without it |
| `pushed` helper | Now `{ truth, send }`, so a writer is `return pushed(truth, next)`, one line |

## 2. Line counts, before to after

Code lines leave out blanks and comment-only lines. Formatter: `oxfmt` defaults.

| File | Total | Code |
| --- | --- | --- |
| feed.contracts.ts | 158 to 67 | 114 to 53 |
| **feed.socket.ts (new, the adapter)** | 80 | 72 |
| feed.definition.ts | 68 to 41 | 58 to 36 |
| feed.machine.ts | 93 to 73 | 77 to 64 |
| feed.story.ts / feed.test.ts | 92 to 98 / 96 to 119 | 54 to 70 / 79 to 91 (a Flapping Story and test are new) |
| desk.socket.fake.ts | 169 to 174 | 113 to 136 (about 105 without the trial's stand-in `Desk` and `renameElsewhere`) |
| presence.contracts.ts | 148 to 70 | 112 to 58 |
| **presence.channel.ts (new, the adapter)** | 98 | 84 |
| presence.definition / machine | 64 to 49 / 53 to 49 | 52 to 44 / 45 to 45 |
| presence.story / test | 60 to 63 / 60 to 65 | 39 to 46 / 53 to 53 |
| presence.fake.ts | 213 to 210 | 171 to 174 |
| assistant.contracts / definition / machine | unchanged | 44 / 43 / 59 |
| assistant.story / test | 84 to 76 / 82 to 92 | 54 to 53 / 70 to 71 |
| assistant.fake.ts | 100 to 101 | 77 to 79 |

**By feature, code lines of the six feature files (adapter included):** feed 382 to 386 (+1 percent); Presence 301 to 330 (+10 percent);
Assistant 270 to 270. **The first pass's saving came from putting the adapter in the contract.** With adapters in services the contracts
are 53 and 58 lines, but the code moved to files that did not exist. The feed machine keeps most of its retry glue (77 to 64, from
dropping the cursor and `initial` only). Outside the files here, `desk.fake.ts` needs `return pushed(truth, next)` at about 11 writers.

## 3. What could not be written, or needed a guess

1. **The desk's `hello` has no head.** `catchUp` opens with `if (after === undefined) return Feed.done({ items: [], proof: "nothing before now" })`,
   and `Feed.live({ head })` cannot be written. The spec's own recipe for a from-now feed ("with the greeting's `Feed.live({ head })`")
   is the one the desk breaks: a quiet workspace has `{ at: undefined }`, one notice per reconnect until the first entry. It matches the old behaviour.
   The fix is a `hello.head` on the wire.
2. **`feed.socket.ts` cannot be one switch.** `restartAt` carries a position, so `ticketChanges` (none) and `activity` (a cursor) need two
   switches, each with a `ReadonlyArray<X | Feed.Signal<P>>` annotation. `Feed.Signal` takes one parameter in my stand-in; the spec writes it bare in
   service types (`Stream<Message | Feed.Signal, ...>`) and with `<P>` in 3.2's cost line. I defaulted the parameter to `never`.
3. **`Feed.callback` typing is my guess.** The spec says a signal through it "is not checked against the position type at compile time". I let `emit`
   take any `Signal<unknown>` and return a stream of `Signal<never>`. Inside a service it works without `R`; `CollabClient` is read when the layer
   builds, because a service method with `R` is not assignable to the service type.
4. **`Story.Frame` has no app form.** 3.8's helper is `Story.Frame<typeof ChatRoom>`, by subject. The feed Stories are `Story.app`, so the stand-in has
   `Story.Frame` with no argument. A guess.
5. **`fills` under the final rule is a stand-in construct.** The spec says "checked in the definition" without a spelling. I check each
   operation's `fillsKey` against the memory through `definition`'s `Ops` constraint. "Closed struct versus Record" is told by an index signature, another guess.
6. **`session` record fields are guessed.** `bookmark: { at, filled }` is from 3.8; `drop`, `ended: "Flapping"`, `answer`, `basis` are
   carried or inferred.
7. **Hoisted mappers still need an annotation** (`gaveUp` in `presence.definition.ts`). Same as 3.2's cost line.
8. **`O.x.commit(select)`'s `event` has no stated type.** Loosened to an index type in the stand-in (the one `any`, in the stand-in).
9. **Inline `open` frames** still annotate (`ReadonlyArray<typeof Frame.Type>`) in the Presence fake. fakes-v2 says "to check in the type spike"; here it
   widened. May be the stand-in.
10. **No Story for "a server that pings and never greets".** The fake's `open` always greets and `ping` is a separate rule, so a connection that only
    pings cannot be built. `hold({ after: 0 })` silences pings too. The spec's own `NoHello` row is therefore untested. Needs a control that makes `open` skip the greeting.
11. **`Fake.fetch` still cannot reach the desk's assistant adapter** (global `fetch`, `next/http-api.ts` line 86; the spec records this as item 7). The
    Assistant keeps its hand-written client half.
12. **NDJSON** has no codec (raw `Schema.String`, `end: true` written), as fakes-v2 now says.
13. **Not used by the desk:** `O.x.refetch`, `Feed.live({ head })`, `Feed.live({ restartAt })` on Presence, `schedule`, `idleTime: "Infinity"`, `pages`,
    `Feed.gone`'s `items`. Of the spec's new words, the desk exercises the ones in section 1 that are not on this list.

## 4. Behaviour that changed, and what was lost

| Old | New | Lost? |
| --- | --- | --- |
| A first frame that is not `hello` or `reset` fails the connection (`NoHello`) | `idleTime` runs from connect and a ping does not extend it: a pinging, never-greeting server ends `Silent` and retries | **No**, per 3.3 and Q8. Untested (3.10) |
| 8 tries then the session ends; offline ends it in minutes | Offline retries every 30 s for ever; 8 quick registered-then-dead connections end it `Flapping` | Intended by Q5. Offline no longer reaches `FeedEnded`, so the UI reads the row's `connection` |
| Backoff doubles per ended session, persisted, reset by `Healthy` | The same, still in the machine (Q5's recipe) | **No** |
| `Feed.live({ lost, restartAt })` on `ticketChanges` | Plain `Feed.live()`; `listen` refetches what a start cannot prove | Unverified (Q8 says so) |
| `bufferSize: 256` | Fixed 1,024; the burst is 1,025 | **Yes**, an author's own bound (Q8 cuts it) |
| Reload while asking: server log `code: 1001` | `code: 1000, by: "client"` | **Yes**, in a test only |
| `Feed.down(new CollabDown(...))` | `Feed.down({ reason })` | No |
| The feed's `errors` list also served as the reconnect filter | `while` is a predicate on the inferred union; `SignedOut` is not retried because the predicate says so | No |
| `initial` suppressed the first notice | Row 3 of T2: first open has no notice | No |

Tests that still pass unchanged in meaning: activity order and dedupe, `missed Lost` before the kept entry, the reset notice, `SignedOut` to `SIGNED_OUT`,
the SDK's `resumed` proof, one attach, the back-pressure burst, the streaming write.

## 5. The streaming write

`assistant.contracts.ts`, `.definition.ts` and `.machine.ts` are the desk's files with two import paths changed. They type-check against the stand-in's
`transaction` and `progress`. Tokens stay a streaming **write**, not a stream, and the final spec still says so (6.5): Stop, Regenerate (`cancel`), the
idempotency key and `unknown` endings are write words the stream API has none of.

## 6. Story words

Spelled and used, and they fit: `Story.app` and `machine`, camelCase checkpoints, `hold({ after })`, `release`, `records`, `lane`, `inspection`,
`read(endpoint)`, `advance({ next })`, `reload`, `ping` on `Fake.stream`, `Story.Frame`. Still missing: a read of `filled` outside the records (works through the
bookmark record); a loop-free way to build a many-cycle Story (plain `reduce` works, as 8 says); a control that skips the greeting (3.10);
`test` in the repo's `vite-plus/test` shim (the tests import `it as test`).

## 7. Files

`standin/` (types only, mine), `features/Tickets/feed/` (with `feed.socket.ts`), `features/Presence/` (with `presence.channel.ts`), `features/Assistant/`,
`testing/{desk.socket,presence,assistant}.fake.ts`, `checks/negative.ts`, `tsconfig.json`.
