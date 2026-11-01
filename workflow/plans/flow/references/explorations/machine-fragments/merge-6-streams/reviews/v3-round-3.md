# Proposal v3 review, round 3 of 3 (final)

Status: advice to the main session, which decides. Nothing here is an owner decision. Reviewed
[../proposal-v3.md](../proposal-v3.md), revision 3. Bare ids such as G11 are rows in [../requirements-v3.md](../requirements-v3.md).
H, Med and Low are this review's. RV1 and RV2 are rounds 1 and 2. Code marks are against v3: `// NEW`, `// RENAMED`,
`// existing`, `// user-defined`.

## 1. Verdict

**Do not accept it as written. Accept it with the edits in section 2; they change no word and no sample's shape.
Trimmed v2 does not win.**

| # | High | One line |
| --- | --- | --- |
| H1 | A greeting's `at` writes the bookmark before the first read finishes | Chat exactly as sampled: drop or reload during first load, and the room's history never comes back. Empty list, green dot, no notice |
| H2 | A turn during the wait for a releasing predecessor sets `held` false | "Clear and re-enter" and A→B→A lose their void if any other event lands first. RV1 H2's symptom returns |

Both were invisible for a reason. Section 12's oracle excuses everything before first registration (`base`), so H1 passes it: I
ran `head`, `C` and `doneAt` together on that model and it is clean, while my stricter oracle hits in 38 states. Its turns only run
in a placed state, so no turn ran in the wait.

**`fills` and `held` are the right idea.** All attacks in the brief either hold or fail on one clause. With section 2's edits my
model is clean on every chat path I ran. The remaining silent cases are stated limits, except one: a wipe that leaves a residue
(Med3).

## 2. The edits, together

No new author word. One sentence each in T1, T2, T3.

| # | Where | Edit | Fixes |
| --- | --- | --- | --- |
| 1 | T2 rows 3, 5, 7 | With `C`, a greeting's `at` is kept in session variable `greeted` and not written. `complete(at)` settles `at ?? seen ?? greeted`. No `C`: as now | H1 |
| 2 | T3's `held` row | "...whose key's session stays placed **and has connected**." A session waiting for its predecessor writes nothing | H2 |
| 3 | T3 | Every partition write that creates an entry takes `held` from the field. A releasing turn may raise `held`, never lower it | Med1 |
| 4 | T3 `O.x.bookmark` | `held` = field not empty, on the after memory, not `true` | Med2 |
| 5 | T1 variables | A reset for each: `lose` clears `liveSince`; `connect` clears `voided`; `stalls` resets on `movedHere` or `complete` | Med4 |
| 6 | Inspection | NEW flag `FillsUntouched`; a stated rule for residue | Med3 |

**After edits 1 to 4, model, exhaustive:** chat with drop, leave and wipe, a turn in the wait, reload (8,248 states); replay server
(7,614); `more` with `at` (3,960); no `catchUp` (2,672): **clean**. One hit remains, on the from-now log: a drop in the moment
between `complete` and its `settle`'s admission. Stated below.

## 3. High

### H1. A greeting's `at` writes the bookmark before the first read finishes

**Failing scenario, section 2.1 unchanged.** Room has m1, m2. Open.

| Step | T1, T2 | State |
| --- | --- | --- |
| `hello { head: 2 }` | `Feed.live({ at: 2 })`, row 3: "`at` given: `b = { at, held: false }`... `C`: `Repairing`, `from` undefined" | `b = { at: 2 }`, memory empty, read running |
| Socket drops, or the tab reloads, before `done` | `lose`, buffer discarded | `b` stays |
| Reconnect | `held` false, field empty: **not void**. `claim = 2`. Row 6: `Repairing` from 2 | |
| Read from 2 | Nothing after 2. `done` | **m1, m2 gone. No notice. `Live`** |
| A replay server | `hello` echoes 2. Row 4: `Live`, no read at all | Same |

Ran: `place > connect > server-registers > rx > drop > backoff-connect > server-registers > rx > page > commit`: `rec={at: 2, held: false} mem=[]`.
Same on reload, with `more`'s `at`, on a replay server, and on a void read (A→B→A, drop during the re-read). Section 7's first row,
and the proposal's claim for an interrupted first read, hold only for a greeting with no head. The chat sample sends one.

**How much it matters.** First load is the slowest read a session makes, on the worst network it will see. A phone that drops during it gets an
empty room for that room's lifetime, across reloads, and nothing says so. G11, R1 and R5 fail on the commonest path.

**Fix: edit 1.** No word changes.

```ts
// T2 row 3, with C, as an implementer reads it
if (signal.at !== undefined) session.greeted = signal.at     // not the bookmark
startRepair({ from: undefined })
// complete(at), T1
settle(at ?? seen ?? session.greeted)                        // the read finished: now the place is true
```

An interrupted first read leaves no record: row 3 again, no notice, reads again. An interrupted void read leaves `{ at: undefined }`:
row 7, one false notice, reads again. Safe.

**Cost, stated.** A from-now feed (`from === undefined ? Effect.succeed(Feed.done([]))`) now has its head settled at `complete`, not at registration. Its read is
immediate, so the window is one queue turn. A drop inside it, then a reconnect before the settle is admitted, loses what posted since the first greeting. Model hit;
a backoff of 500 ms outlasts the queue unless a turn is very slow. Say so beside Q2's precondition.

### H2. A turn during the wait for a releasing predecessor sets `held` false

**Failing scenario.** Section 3 says "Reload everything: clear, and re-enter the state: void". T9 says a placement "waits for a releasing predecessor, then `connect`". T3 writes
`held` on "any committed turn whose key's session stays placed". The room had m1.

| Step | What happens |
| --- | --- |
| `Reload: { target: S.LIVE, updateMemory: () => ({ messages: [] }) }` | Releases: `held` stays true. New placement waits, up to 5 s |
| Any event: a keystroke, a schedule, another feed's value | A committed turn, key placed. **`held = false`** |
| `connect` | `held` false, not void. `from = 1`. Row 6 reads after 1 |
| Result | **m1 gone. Empty list, green dot, no notice.** RV1 H2's exact symptom |

Same for A→B→A inside the predecessor's clean-up, and for a return after a sign-out. Ran:
`...leave+wipe > place > unrelated-turn > connect > server-registers > rx > page > commit`: `rec={at: 1, held: false} mem=[]`. With no turn in the wait: clean.

The window is real wherever release is asynchronous: a `removeChannel`, an interrupt the mailbox can pass. Section 7.5's finalizer races 3 s.

**This is why the "void at registration" mutant survived, and it hides this rule.** The same hole one step later: with void at registration, a turn in `Connecting` kills it. I added that turn:
**mutant killed** (60 states). Void at connect is right, and needs edit 2 to be enough.

**Fix: edit 2.** A clear during the wait then comes back, visibly, the same as Q1's "clear and leave in one turn".

## 4. Medium, by root cause

**`held` has more writers than T3 lists.**

**Med1. A fill that no later turn follows is never recorded.** Two paths.

| Path | Scenario | Result as written |
| --- | --- | --- |
| `settle` creates the entry | Greeting with no head. First read lands (`Page` turn: no entry, nothing to write). `settle` makes `{ at: p }`; T3's cell says only `at = p`. Quiet room. The first turn after is `SwitchRoom`, which releases, so it writes nothing. Back to the room | `held` false, not void, reads after `p`: **history gone, no notice.** Ran, with `held` false at creation. Section 12's model silently takes `held` from the field here (`every.ts`, `commit`); the table does not say so |
| A turn fills and leaves | `Message: { target: S.SEEN, updateMemory: add }`. It releases, so `held` is unwritten and stays false. Sign-out later wipes while not placed. Back | Same. Ran |

**Fix: edit 3.** Ran both: clean.

**Med2. `O.x.bookmark` sets `held = true` over an empty field.** T3: "`b.at = at`, `held = true`". An SSR read of an empty room, or a `Loaded` in a state before the feed, writes `{ at: head, held: true }` with `messages: []`.
`connect` then voids: `from` undefined, the head is thrown away. Replay server, no `C`: a **false notice on every hydrated empty room** (G10). Ran: hit; with edit 4, clean. With `C`, safe, one wider read. With
`fills: false`, "always empty" plus `held = true` voids, against Q1's "Toast: never void".

**Fix: edit 4.**

**`fills` can be wrong without anyone seeing.**

**Med3. Answers to the brief's questions.**

*Does "silent: a list shortened by mistake" count as the silent loss the design exists to prevent?* **No.** The value was offered and the consumer's own line dropped it. No design catches `slice(1)`; trimmed v2 does not either. Keep it as a limit.

*A wipe with a residue does count, and it is not in Q1's table.*

```ts
SwitchRoom: {
  target: S.LIVE,
  updateMemory: ({ event }) => ({ roomId: event.roomId, messages: [joinedBanner(event.roomId)] }),   // user-defined: a very natural line
},
```

Back in room A: field not empty, claim stands, reads after `p`. **Banner only, green dot, no notice.** The same comes from carrying pending optimistic rows across a switch. Same class as Q1's shared list, with one feed and one key, so `SharedFills` does not catch it.

*Can `fills` be wrong unnoticed? Yes.* Compiled against my stand-in `definition`, all accepted: `fills: "roomId"` (never empties), `fills: "notice"` (another concern), `fills: "room"` (a nested Struct; my `Emptiable` lets it through as a `Record`, so the real type must reject a closed struct). `fills: false` on a list you could not name, nested or host-kept, turns off all of it, and Q1 recommends that as the way out.

*Would an agent write it correctly?* Chat, yes, one line. Nested memory: I expect `false`, since it is the only thing that compiles. **Not run: A2 is still the real test.**

**Fix, no word:**

```ts
// NEW Inspection flag: FillsUntouched. A value handled, not Denied, whose turn left the named field unchanged, and no upsert of an equal row.
// Finds roomId, notice, a list kept in a host under a wrong name. Printed by `flow explain`; fails no build. Stories assert no flags in their templates.
fills: "messages"                     // existing. Docs: "this field holds only what this feed delivered. Banners and drafts go in another field."
fills: "room.messages"                // proposed, not modelled: a dotted path, typed, so nested memory need not write false
```

**Med4. Three session variables are never reset (T1).** The table lists them, and no cell clears them.

| Variable | Failing scenario | Evidence |
| --- | --- | --- |
| `liveSince` | `lose`: "`flaps += 1` if `liveSince` was set and `healthy` had not elapsed". Only `down` clears it. `healthy` has no cell in `Connecting`, `Waiting`. Up 5 s, then a tunnel: each failed attempt counts | **TestClock: `Flapping` at 69 s, on one registered connection.** Against section 3: "offline... wait forever". Read off the Clock instead: survives alone, but 3 flaps then offline ends at 65 s. **With `lose` clearing it: 125 tries an hour, never ends** |
| `stalls` | "3 repairs in a row" is not what T1 does: nothing resets it. Three overflows in a day, each with good repairs between: row 6's first test skips the repair **for the session's life**, one `Lost` per reconnect, on a two-second blip | Reasoned from T1, T2 |
| `voided` | `connect` sets it, nothing clears it. Row 5 fires on every later reconnect: a whole re-read, or on a from-now log, `Feed.done([])`: **silent** | Ran both: literal hit; cleared at `connect`, clean. Section 12's model clears it; the table does not |

**Fix: edit 5.** A `first` read on `voided` after an interrupted void is row 7, already safe.

**The clear line means two things.**

**Med5. `messages: []` reads as "clear" or "reload" by where the placement sits.** Flow decides by whether this turn releases the session, and the author does not write that word.

| Natural line | Placement | Author wanted | Result |
| --- | --- | --- | --- |
| `Refresh: { target: S.LIVE, updateMemory: () => ({ messages: [] }) }` | On `LIVE` | Reload | Right |
| Same line | On the root or a parent | Reload | Session stays. **Stays cleared. Empty, green, no notice.** No way to reload without leaving a state |
| `ClearAndClose: { target: S.CLOSED, updateMemory: () => ({ notes: [] }) }` | On `OPEN` | Clear | **All notifications return at next open.** Q1's stated limit, but "Clear all" that also closes the panel is an ordinary product shape |

Both are visible. **Fix for the first, no new word**, not modelled: let `at: undefined` mean "forget" on the action already there:

```ts
Refresh: { target: "self", updateMemory: () => ({ messages: [] }),                      // existing
  actions: [O.messages.bookmark(({ memory }) => ({ roomId: memory.roomId, at: undefined }))] },   // existing action. `C`: Repairing from undefined, no notice. No `C`: notice
```

**Second:** keep it as a limit, and put both in the docs' first page on `fills`.

**Stories.** Med6 in section 7.

## 5. Low

| # | Finding | Fix |
| --- | --- | --- |
| Low1 | Full Ably: four unannotated locals, `attached`, `update`, `down`, `message`: TS7006 | Annotate, or inline in `ch.on`. A11 passes then |
| Low2 | `Live × O.x.bookmark`'s `C` branch does nothing for safety. See 6.2 | Cut it: T3, values stop moving. Saves a read per late `Loaded` |
| Low3 | T1's `Connecting` cell says "reaches row 5"; row 5 is now void. It means row 6 | Renumber |
| Low4 | T1 has no column for `O.x.bookmark` with no session (`LOADING`, SSR), the first use | Add: T3 only |
| Low5 | `pageSched` is named and never defined. Under the default, a 503 forever: `catchingUp` forever in a quiet room. Bounded only by overflow | State it: the default schedule, no budget, visible |
| Low6 | Rows 5, 7 with `at`, no `C`: `b.at` moves before `missed` is admitted. Reload in between, then a proof: the old gap is unreported | Apply at admission, as row 2 does |
| Low7 | `errors: []` is required when empty: noise on every SDK contract | Optional; absent means none. Stray error still rejected (compiled) |
| Low8 | 256-entry eviction under `subscribe.each`: an evicted, quiet, empty key reads first open. G11 at scale | State beside M9 |
| Low9 | R from an `every` contract enters the server setup's type though it never opens there | SSR amendment says: provide a layer, or exempt |
| Low10 | `healthy` of exactly 1 minute sits on common proxy idle timeouts. Up 59 s ends at 528 s; up 60 s never ends. Only ping-less feeds | Mention in `idle`'s docs |
| Low11 | Bad deploy, each pod greets then dies at 15 s: `Flapping` at 180 s. Chat's `FeedEnded: S.ENDED` is a dead end for every open tab | Sample shows `Retry`; C3's recipe linked from it |
| Low12 | "If messages may be missing, the machine must handle it, or the code does not compile" overclaims | Add "unless your adapter or memory shape breaks one of these N rules", and list them |

## 6. Does it hang together?

### 6.1 The limits and the 15 conditional musts, taken together

**Silent if broken, all of them.**

| Silent case | Who breaks it | Also in trimmed v2? |
| --- | --- | --- |
| Empty read with no head, outside `catchUp` | Author's read shape | Yes |
| From-now feed with no head | Source has none | Yes |
| `from` defined but the read is not a log (R20) | Adapter lies | Yes |
| `from` undefined reads short of registration | Adapter | Yes |
| A wrong `at`; a head from a lagging replica | Adapter | Yes |
| Shared list; `subscribe.each` over a list | Memory shape. Two have findings | **No** |
| Host-kept list; `fills: false` where a list exists | Memory shape | **No** |
| Residue after a wipe (Med3) | Memory shape | **No** |
| A forgotten `cursor: undefined` on any wipe line | Not in F | **Yes, and only there** |
| A list shortened by mistake | App bug | Yes |

**Acceptable, once Low12 is written.** Five of these are the source's contract, which no design can check. Three are where F loses. They share one rule a reader can hold: *the named field holds only this feed's items, in this slice*. The 15 conditional rows are a long list, but read row by row: most are honest "not run" or "a precondition", and none hides a silent loss outside this table.

**F10 failing for Firestore and EventSource: acceptable.** Both are the source's limit, and stated. Firestore's row stays `Live` while half-open, with `fromCache` as the SDK's only signal. EventSource can opt in with a named `ping` event.

**C2's first sentence failing for a server that drops before it greets: acceptable.** No data is lost. The row reads `Connecting`, 125 tries an hour on my clock, and a machine can time a `Connecting` row itself. Flow cannot tell it from offline. Owner reads it as written.

### 6.2 Why three mutants survive

| Mutant | Why | Hides a real rule? |
| --- | --- | --- |
| Void at registration | The model runs no turn in `Connecting` | **Yes.** Killed with one turn. It led to H2 |
| H2's cell with `catchUp` | Not bounds: with `C`, every registration already reads, and a proof means replay. At `A: 3`, `D: 0`, then `D: 1`, still survives on section 12's model (87,510 states) | **No, the rule is extra.** Cut the branch, Low2. The `notice` branch is killed already |
| Two notices | Mutant and base reach the identical 9,065 states: that model's `gone` needs `from` defined, and row 7 reads undefined. So no path | **Real, low stakes.** Reachable in the table: row 7, then `gone`; row 2, then `gone`. Without `noted`: two notices, G3's cost only, no loss. Not run |

### 6.3 New since round 2

| Item | Judgment |
| --- | --- |
| `Flapping`, flap count | Right, after Med4. Flap 1 s ends at 68 s, 8 connections. Up 61 s never ends (176 connections in 3 h). Offline never ends |
| Default schedule | Works only as `exponential` → `jittered` → cap: longest wait 30.0 s. Write the cap with `Schedule.modifyDelay(({ duration }) => …)`. `Schedule.min` plus `jittered` overshoots (RV2: 34.8 s) |
| 3 stalled repairs | The rule is fine, its counter is not (Med4). Modelled at 1, as stated. Honest: a notice and live values. Not re-run |
| `errors` | Compiles, inference holds, stray errors rejected. Unusual only in that `transaction` infers its errors; `callback` is the reason, and a stated one. Low7 |
| `O.x.bookmark` in `Live`, `Dropped` | Right for no `C`. Low2, Low4, Med2 |
| Queued values stop moving | Sound. Duplicates only |
| `after` gone | Fine. `next ?? from` reads well |
| `lost` gone | Fine. O5's spelling preference is overturned, flagged in section 11 |
| `"accept"` gone | Fine. G15 is cleaner, V9 is 2 lines |
| Persistence O5 | Needed and narrow. Word it as "the position inside an entry". A partition that fails its own shape still discards the scope, as O5 |
| Persistence O2 | Buildable: walk each `every` op's position Schema at `persist: true` |
| SSR digest, "never opens" | Right. Row `undefined` on the first render on both sides, so no mismatch. Low9. Not run on a payload |

## 7. Stories

**Med6. The two documents do not yet fit.** Each Story is new form, as stories-amended 2.10.9. **Not run.** No `Fake`, no `Story` exists.

```ts
// Shared. Messages, positions as numbers
const Frame = Schema.Union([                                             // user-defined
  Schema.Struct({ t: Schema.Literal("hello"), head: Schema.Number, replayedFrom: Schema.optional(Schema.Number) }),
  Schema.Struct({ t: Schema.Literal("ping") }),
  Schema.Struct({ t: Schema.Literal("msg"), message: Message }),
])
const socket = Fake.stream({                                             // existing
  request: { room: Schema.String, from: Schema.optional(Schema.Number) },// existing
  frame: Schema.fromJsonString(Frame),                                   // existing
  ping: { every: "30 seconds", frame: { t: "ping" } },                   // NEW: ping (Med6, item 1)
  open: (truth: Truth, req) => ({                                        // existing
    frames: [
      truth.replays && req.from !== undefined ? { t: "hello", head: head(truth), replayedFrom: req.from } : { t: "hello", head: head(truth) },
      ...(truth.replays ? after(truth, req.from).map((message) => ({ t: "msg", message })) : []),   // user-defined: head, after
    ],
  }),
})
export const Chat = Fake.server("Chat", {
  truth: { messages: Schema.Array(Message), replays: Schema.Boolean }, initial: { messages: [], replays: false },
  endpoints: {
    socket,
    history: Fake.call({ request: { room: Schema.String, from: Schema.optional(Schema.Number) },
      handle: (truth: Truth, req) => ({ response: { status: 200, body: { messages: after(truth, req.from), head: head(truth), complete: true } } }) }),
  },
  controls: {
    seed: Fake.control({ messages: Schema.Array(Message) }, (_t: Truth, a) => ({ truth: { messages: a.messages, replays: false } })),
    post: Fake.control({ message: Message }, (t: Truth, a) => ({ truth: { ...t, messages: [...t.messages, a.message] },
      send: [socket.frames((c) => c.room === a.message.room, [{ t: "msg", message: a.message }])] })),
  },
})
const ChatFake = Layer.mergeAll(Fake.webSocket(Chat, socketRoutes), Fake.fetch(Chat, historyRoutes))   // user-defined: routes

// Chat: H1's regression, a drop during first load
export const firstLoadDrop = Story.machine(ChatRoom, {                   // existing
  id: "chat/drop-during-first-load", input: { roomId: "r1" }, fixtures: [ChatFake],
  world: [Chat.seed({ messages: [m1, m2] }), Chat.history.hold()],       // existing: hold. The first read waits
})
  .checkpoint("reading")
  .world(Chat.socket.drop(), Chat.history.release({ drop: true }))       // existing
  .advance({ next: { operation: O.messages, timer: "backoff" } })        // existing
  .checkpoint("back")
test("a dropped first load reads again", async () => {
  const { reading, back } = (await firstLoadDrop.run()).checkpoints
  expect(reading.operations.messages?.catchingUp).toBe(true)             // NEW
  expect(reading.records("session", { operation: O.messages }).at(-1)?.bookmark).toBeUndefined()   // NEW field. Fails as written: { at: 2 }
  expect(back.read(Chat.history).at(-1)?.input.from).toBeUndefined()     // existing. Fails as written: 2
  expect(back.memory.messages).toEqual([m1, m2])                         // existing. Fails as written: []
  expect(back.memory.notice).toBeUndefined()
})

// Quiet room: G11 with a head. Reload needs an app Story: closeTab and reload are type errors on Story.machine
export const quietRoom = Story.app(ChatApp, {                            // existing: Story.app
  id: "chat/quiet-room-reload", fixtures: [ChatFake], storage: Fake.storage,
})
  .ensure(ChatRef, { input: { roomId: "r1" } })                          // existing
  .checkpoint("empty")
  .closeTab("main")                                                      // existing: the two halves of reload, so a message lands between
  .world(Chat.post({ message: m1 }))                                     // user-defined control. Nobody is listening
  .openTab("main", { from: "main" })                                     // existing
  .checkpoint("afterReload")
test("a quiet room is first once, and owes after", async () => {
  const { empty, afterReload } = (await quietRoom.run()).checkpoints
  expect(empty.lane(O.messages, { roomId: "r1" })?.connection).toBe("Live")
  expect(empty.records("session", { operation: O.messages }).at(-1)?.missed).toBeUndefined()   // G10
  expect(afterReload.read(Chat.socket).at(-1)?.input.from).toBe(0)       // existing: the bookmark's head, from hello
  expect(afterReload.read({ actor: ChatRef }).memory.messages).toEqual([m1])
})

// Ticker: half-open, pings, wake
const Market = Fake.server("Market", { truth: { quotes: Schema.Record(Schema.String, Schema.Number) }, initial: { quotes: {} },
  endpoints: { socket: quoteSocket },                                    // user-defined: frames filtered by the connection's symbol; ping every 10 seconds
  controls: { tick: Fake.control({ symbol: Schema.String, price: Schema.Number }, tickHandler) } })
export const halfOpen = Story.machine(Watch, {
  id: "ticker/half-open-then-wake", input: { watchlist: ["AAPL"] }, fixtures: [Fake.webSocket(Market, routes), MarketFeedFromSocket],
  world: [Market.tick({ symbol: "AAPL", price: 100 })],
})
  .advance("10 minutes")                                                 // quiet market, pings: stays current
  .checkpoint("quiet")
  .world(Market.socket.hold())                                           // existing: frames and, NEW, pings stop
  .advance({ next: { operation: O.quotes, timer: "idle" } })             // NEW timer: idle
  .checkpoint("silent")
  .world(Market.socket.release())
  .advance({ next: { operation: O.quotes, timer: "backoff" } })
  .checkpoint("backUp")
  .advance("10 minutes", { suspended: true })                            // existing
  .checkpoint("woke")
test("a price dims at the idle deadline, undims when confirmed, dims on wake", async () => {
  const { quiet, silent, backUp, woke } = (await halfOpen.run()).checkpoints
  const row = (cp: typeof quiet) => cp.lane(O.quotes, { symbol: "AAPL" })
  expect(row(quiet)?.value?.price).toBe(100)
  expect(row(silent)?.connection).toBe("Connecting")                     // existing: T1's row map, Waiting reads Connecting
  expect(row(silent)?.value).toBeUndefined()
  expect(row(silent)?.last?.value.price).toBe(100)
  expect(row(silent)?.drop?._tag).toBe("Silent")                         // NEW reason
  expect(row(backUp)?.value?.price).toBe(100)
  expect(row(woke)?.connection).not.toBe("Live")                         // F10, at resume
})
```

**What is missing. Both documents must change.**

| # | Gap | `stories-amended.md` | `fakes-v2.md` | `proposal-v3.md` |
| --- | --- | --- | --- | --- |
| 1 | `ping` on `Fake.stream`. Contradicts "a fake no longer sleeps" (2.10.3) and pure, sleepless fakes | 2.10.3's rank: a new rank above Flow's waits, so a tie keeps a connection alive. **A real choice:** TestClock with ping 45, idle 45 gave `Silent` at 45 s or 90 s by arming order. Without the rank it is flaky | Add `ping`; on the run's Clock | Named |
| 2 | Pings and `hold({ after: n })` | A ping does not count. 2.10.17.3 row | Rule | — |
| 3 | Pings while suspended | Coalesce: a week at 10 s is 60,480 frames in the tab's transport | Rule | — |
| 4 | `timer` values | `resetAfter` → `healthy`; add `idle` (2.10.3, 2.10.9) | — | Named |
| 5 | Row fields | Add `catchingUp` to 2.10.9's row line | — | — |
| 6 | `session` record fields | Add `bookmark`, `held`, T2 row; drop `answer` where T2's row replaces it (line 935) | — | Name them; each T3 write needs a `cell` for coverage |
| 7 | Reload Stories | Stated: must be `Story.app`. Proposal's Story is `Story.machine` and has none | — | Add a reload Story |
| 8 | **SC item 13, global `fetch`** | Stands | — | **Not in section 10's table.** 7.3, section 8's streaming `fetch`, and `new EventSource` still use globals, so a Story reaches no fake and passes while parked. Read `fetch` from a service; EventSource through a service over `server.socket` |
| 9 | `pageSched` | `{ timer: "page" }` needs a defined default | — | Low5 |
| 10 | "A heartbeat is `HostTimeWait`" (line 311) | Corrected for a fake's Clock ping | — | Named |
| 11 | Default's jitter | `advance("500 millis")` in 2.10's old Story cannot work. `next` only | — | Already uses `next` |
| 12 | Coverage | 2.10.15 row: T1 and T3 cells, which are suite-only, including a turn in the wait | — | List |

Sizes: three Stories at about 15 lines each, on the fake above. Fit is good: nothing needs a stream-specific step, and H1 is reachable with `hold`, `drop`, `release`.

## 8. What is untested, tested now

**A11, by inference, `tsc --strict`, Effect 4.0.5.** Real Effect, Schema, `Context.Service`, `RcMap`, `Schedule`. Stand-in Feed, `stream`, `outcomes`; declared vendor stubs. Sample bodies copied verbatim.

| Sample | Result |
| --- | --- |
| Ticker, Supabase, graphql-ws, Phoenix, Electric, EventSource | **Compile**, no explicit generics, no `any` |
| Full Ably | **Fails only on Low1.** `RcMap.get`'s Scope, `Walk`, `head` possibly undefined: fine |
| **`failure` wired to `stream`** | **Works.** Default: `{ SignedOut, Feed }` passes; missing either fails. `Banned` added: fails at the map. Written `schedule`: `ChatDropped` required. `Flapping` by name allowed. `missed` on `latest`, `catchUp` on `latest`, a stray `emit.fail`: all rejected |
| `fills` | **Only a definition can check it:** `.outcomes` does not know memory. A mapped constraint on `operations`' return works; a misspelling fails there. Med3 for what passes |

**Clock, real `Schedule`, `TestClock`, my loop around T1.** Not Flow.

| Case | Result |
| --- | --- |
| Flap up 1 s | `Flapping` at 68 s |
| Up 59 s | `Flapping` at 528 s |
| Up 60 s, up 61 s | Never, 179 and 176 connections in 3 h |
| Offline from the start | Never, 125 an hour, longest wait 30.0 s |
| Up 5 s then offline | **As written: ends at 69 s.** Fixed: never |
| Idle 45, ping 30 | `Live` at 600 s |
| Idle 45, no ping | `Silent` at 45 s |
| Idle 45, ping 45 | `Silent` at 45 or 90 s by arming order |

Wake cannot be tested on TestClock beyond "an overdue deadline fires at resume". A browser's timers are not run.

## 9. Final judgment

**Should the owner accept it? Yes, with section 2's edits. Not as written.** Both Highs lose data on chat itself.

**Does trimmed v2 win? No.**

| | F, edited | Trimmed v2 |
| --- | --- | --- |
| Failure from a line left out | None | `cursor: undefined` on each wipe: silent |
| Failure from memory shape | Shared, host-kept, residue: silent, named | None |
| Quiet room from-now | Greeting's head, no handler | Head must reach memory: a new event or `pages` field |
| Reset | Flow | Author line |
| Positions in a session | One | Two |
| No-position sources | One partition | **The same partition** |
| Plans changed | O2, O5, SSR O3 | Fewer |
| Words | 29 | About 29 (RV2) |

A forgotten line in the commonest handler is the likelier mistake, and F's silent cases share one sentence an author can learn.

**The caution, plainly.** Three rounds have each found a High in how the bookmark ties to memory: identity, then "never filled against erased", now timing. That is the cost of inferring intent from a field, and the owner prefers upfront contracts to clever hybrids. The Highs are shrinking: this round's are one clause each, and no new concept was needed. I expect the tables to hold after these edits, but **my model is bounded and mine**. If a fourth such High turns up when the code is written, fall back to v2 trimmed; do not add a third bit.

**Is 29 words justified? Yes.** The honest comparison is about 29 for trimmed v2, not v2's 24, because `reconnect`, `idle`, `Feed.done` and friends are needed by both. It pays for `RETRY_WAIT`, the 22-line socket, cursor lines and a six-key map. `errors` earns its place by the compile results above. `pages` is the only easy cut left, and it should stay.

**Before merging, in this order:** section 2's edits; the Med6 table; run A2 (an agent writing clear chat, room switch and nested memory from docs).

## 10. What I ran, and what I did not

Serial, one process at a time, peak 29 MB for the model. Files in
`/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/s3r3/`.

| Probe | Result |
| --- | --- |
| `m3.py`, `out-m3.txt`: my own exhaustive BFS of T1, T2, T3, read from the tables, for one key. Oracle: at a quiet registered `Live`, every log item is held, dismissed or noticed. History before first registration is **not** excused, except for from-now and no-`C` | H1, H2, Med1, Med2, Med4's `voided`. Each edit run separately, then together |
| `mut.ts`, `out-mut.txt`: section 12's own `every.ts`, untouched | Chat with head clean under its oracle: why H1 was missed. Two mutants at larger bounds |
| `samples.ts`, `out-tsc.txt`: `tsc --strict` | Section 8 |
| `clock3.ts`, `out-clock3.txt`: Bun | Section 8, Med4 |

**Model limits.** Pages are 1 item; a read is atomic per page; no overflow, reset, `gone`, `Dropped`, stale duplicates, `subscribe.each`, or fragments. The from-now read is taken as atomic with registration. Budgets: 2 appends, 1 drop, 1 leave, 1 turn in the wait, 1 reload at most. A wipe is either with the leave or while not placed. I took the stated limits' earlier model results as given (dismiss with a stale duplicate, shared list).

**Reasoned, not run:** freeze and thaw (no failing path: the slice and its partition move together, a release writes nothing); `.each` (new slice); `resetOn` (new partition); hydration of `held` (with the actor; persisted beats hydrated, so memory and bit stay paired); Med3's `FillsUntouched` and dotted path; Med5's `at: undefined`; `stalls`; Low items.

**Not run:** any Flow code; any Story; any vendor SDK; a browser; an agent (A2). Vendor behaviour is from prior-art notes; Ably's resume event and Phoenix's rejoin stay unconfirmed.

**Read in full:** the proposal; RV2; requirements; Persistence; ServerRendering; `fakes-v2.md`; section 12's model and `infer.ts`. **In part:** RV1 (verdict, root cause); `stories-amended.md` (2.10.3, 2.10.9, 2.10.17.3, 2.10.18.7, section 11, by search elsewhere); `machine-design.md` (rule 25, 2.7.6, by search); Machines O5; prior art by search; `proposal-v2.md` through RV2's quotes and search.
