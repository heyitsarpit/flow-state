# Stories, designed from the brief (merge 3, proposal v2)

Status: **proposal, written 2026-10-31. Nothing here is decided.** Every shape, word and rule is *proposed*; the
main session settles C3, C10 and C4/C12 (section 8, round 1) and the owner the rest. Built only from
[brief.md](brief.md) (the requirements SG1–SG7, STR1–STR72, C1–C19, STF1–STF79), [../machine-design.md](../machine-design.md)
(MD, every merge), [../merged/operations/decisions.md](../merged/operations/decisions.md) (OD),
[../merged/fragment-operations/decisions.md](../merged/fragment-operations/decisions.md) (F),
[../merge-6-streams/proposal-v2.md](../merge-6-streams/proposal-v2.md) (M6) with its decisions S1–S7 (M6D),
[../../playback.md](../../playback.md) (PB), `workflow/plans/flow/*.plan` (TST, INS, …, the brief's short names), and
Effect 4.0.5's `effect/testing` (`TestClock.ts`: `adjust`, `setTime`, `withLive`, the "using time without advancing"
warning). The earlier draft `proposal.md` and its reviews were not read. Citations use the brief's short names.

Keyword marks in code: `// NEW:` a word this proposal adds; `// RENAMED:` an existing word under a new name;
`// NEW MEANING:` an existing word whose meaning changes; `// existing:` in MD or the plans; `// user-defined:` the
author's own name; `// Effect:` an Effect 4.0.5 export. A word is marked once per code block.

## 1. The answer in short

**One idea.** Production gets input from three places: **the user** (sends and lifecycle), **time** (the Clock) and
**the world** (servers, the network, storage). A Story is a plan of those inputs, as data. Each input is applied to the
production Runtime, which is then left to do everything it would do before the next input could arrive. The world is a
set of **fakes** that hold server truth and answer through the real transport boundary; Flow never injects an ending,
so the commit's own classification always runs. What a Story checks is a value read from a **frame**, with one read
function and one home per kind of record.

**Five rules** (every requirement and failure in sections 4–5 is answered by citing them):

| Rule | Statement |
| --- | --- |
| **R-Settle** | Every step applies its input, then **settles**: the Runtime runs until nothing can happen without time moving or the world acting. `advance(d)` settles at every deadline it passes, in a documented total order. There is no `process()`: a Story cannot observe a cut production would have left already (STR8, STR13). |
| **R-World** | Everything outside the client is a **fake server**: one per run, holding typed truth and a log of what it received, shared by every tab and reload. It is reached through declared **endpoints** whose wire the Story controls with four words (`hold`, `release`, `drop`, `duplicate`); server behaviour is the fake author's Effect code and named **controls**. A fake never writes client truth and never produces an ending (STR19–STR25, C16). |
| **R-Data** | Plans, controls, reads and expectations are data. Code lives only in fakes (they are Layers) and in properties, never in a step, so `describe`, property tests and playback read a Story without running it (C4, STR2, STR23, STR64). |
| **R-Frame** | Every committed publication of every tab is a **frame**; every command is a **step** with exactly one cause, even when it published nothing. Every cumulative fact is one record in **one ordered evidence list** (INS O1's sequence, run-wide), never copied into frames (STR45–STR53). |
| **R-Subject** | One constructor, `Story.make(subject, options)`. The subject's kind (app setup, machine, trait, subroutine) decides which steps type-check. A fragment alone runs in a stand-in host that no read can see (STR1, STR10, C10). |

**Concepts per tier** (words an author writes or reads; section 7 has the full list with marks):

| Tier | Count | Words |
| --- | --- | --- |
| **Common** (a scripted test of one machine) | **12** | `Story.make`, `send`, `advance`, `checkpoint`, `expect`, `world`, `run`, `read`; `Fake.server` (with `truth`, `endpoints`); the wire words `hold`, `release`; `Story.attempt` |
| **Uncommon** (fragments, domains, reloads, tabs, streams, SSR) | **18** new, 8 reused | new: `together`, `drop`, `duplicate`, `controls`, `Fake.storage`, `Fake.stream`, `Fake.webSocket`, `Fake.fetch`, wire `match`, `dispose`, `guards`, `Story.records`, `Story.inspection`, `Story.entity`, `advance(…, { suspended })`, `checkpoint(…, { at })`, `Story.property`, `lost`; reused: `ensure`, `openTab`, `closeTab`, `enter`, `leave`, `setContext`, `dehydrate`, `hydrate` |
| **Rare** (policy cells, property tests, upgrades) | **5** | `advance("next")` and `advance({ to })`, `reset` (a fragment alone), `release({ nth })`, `storage: Fake.storage.from(story)`, `propertyTest(story, …)` |

Thirty-five in all, twelve common. **Removed** from the plans' Story surface: `process()`, `advanceTo`,
`advanceToNextTimer`, the `frames` option and frame collapse, `run.calls`, `checkpoint.exit`, the checkpoint
predicate `.checkpoint(name, ({ truth }) => …)` (MD C16), `Story.ending` (MD rule 47, never adopted), `story.app` /
`story.machine` (renamed), M6 2.11's `.do(({ fake }) => …)` and `story.suspend`, and TST O4's `pending` for work.

**The three decisions** (section 8, round 1):

- **C3, endings: no injection.** `Story.ending` is not added; TST O3's "fixtures cannot inject operation outcomes
  directly" stays and MD 2.7.2 wins. Every ending comes from what a service returned (a value, a failure, a defect, an
  interruption) or from what the Runtime did (a cancel, a reload, a refused acknowledgement), and the commit's real
  classification turns it into the ending. Section 2.6 shows every reason of MD 2.7.1 reached that way; the one that
  an app cannot reach, `NotSent { Disposed }`, belongs to Flow's policy suite (C11).
- **C10, the fragment constructor: the subject decides.** `Story.make(Autosave, …)` and `Story.make(Confirm, …)`, the
  same constructor as `Story.make(Checkout, …)`. Neither rule 58's `story.machine(fragment)` (a trait is not a machine)
  nor D1's one constructor per kind (a second statement of what the value already says) is kept.
- **C4/C12, controls without callbacks.** A control is a value made by a fake's handle (`Chat.socket.drop()`,
  `Chat.post({ text })`), applied with `.world(…)`, ordered by R-Settle like a send. TST O1's "no arbitrary
  callbacks" stands unamended; MD 2.7.11's predicate and M6 2.11's `.do` callbacks are replaced.

**Big changes, marked** (each is a question in section 8): **(B1)** `process()` is removed and every step settles,
which changes the code shape of every existing Story; **(B2)** a new module, `Fake`, in `flow-state/testing`;
**(B3)** data expectations make `run()` reject when one fails, so a Story is its own test; **(B4)** frames are taken
at every publication and steps are recorded beside them, amending PB's accepted TST O4 wording; **(B5)**
`propertyTest` takes any Story, which widens TST O6 beyond domains; **(B6)** `story.app` and `story.machine` are
renamed `Story.make`.

## 2. The design

### 2.1 Before and after: the common case

The SG2 case: an editor actor with input and a fake for its one service; two sends; time passes; the state, one
memory field, one lane row and what the server received are checked.

Before (DD `editor.story.ts` `saved`, 8 lines; assertions in `editor.test.tsx`):

```ts
export const saved = desk("ticket-save")                                        // existing: story.app via desk()
  .send(Editor42, E.TitleChanged({ title: "Replace foyer light" }))
  .send(Editor42, E.SaveRequested())
  .process()                                                                    // existing: process (removed here)
  .checkpoint("saving")
  .advance("2 seconds")
  .process()
  .checkpoint("saved");
// editor.test.tsx: const run = await saved.run(); expect(run.checkpoints.saved.actor(Editor42)?.snapshot.state)…
```

After (6 lines with its assertions; the test file is one line):

```ts
import { Fake, Story } from "flow-state/testing"                                 // NEW: Fake; RENAMED: Story (was story)

export const saved = Story.make(Editor, { id: "editor/saved", input: T42, fixtures: [TicketsFake] })   // RENAMED: Story.make; existing: id, input, fixtures
  .send(E.TitleChanged({ title: "Replace foyer light" }), E.SaveRequested())      // existing: send; each event is its own step
  .advance("2 seconds")                                                         // NEW MEANING: advance settles at every deadline (R-Settle)
  .expect({ state: S.SAVED, memory: { title: "Replace foyer light" }, operations: { save: { pending: false } } })   // NEW: expect (a partial of the snapshot)
  .expect(Tickets.save, [{ input: { title: "Replace foyer light" }, via: { attempt: Story.attempt(O.save) } }])    // user-defined: Tickets (a Fake.server); NEW: Story.attempt
// editor.test.ts
test("editor saved", () => saved.run())                                         // existing: run; NEW MEANING: rejects with every failed expectation
```

Added: `Story.make`, `expect`, `Story.attempt`, a fake server (`Tickets`, below). Dropped: `process()`, the separate
assertion file. The "Saving…" moment is still recorded: it is a publication frame inside the `SaveRequested` step
(2.7), and a checkpoint can name it only if something real keeps the save going (the fake's 2-second latency here,
or a `hold`).

### 2.2 What a Story is

`Story.make(subject, options)` returns an inert plan (STR2): the subject, its options and an ordered list of steps.
Constructing, importing and discovering it start nothing. Each chained step returns a new plan; a prefix never changes,
so branches are plain variables (`const base = …; base.advance(…)`), and each branch runs in a fresh Runtime.

| Subject | Options (exactly what the subject declares, STR1) | Steps that type-check beyond the common ones |
| --- | --- | --- |
| an app setup (`RuntimeSetup`) | `id`, `fixtures?`, `storage?`, `seed?` | `ensure(ref)`, `dispose(ref)`, `send(ref, event)`, `openTab`, `closeTab`, `dehydrate`, `hydrate`; every step takes `{ tab? }` |
| a machine | `id`, `input` (iff declared), `context` (iff declared), `fixtures?`, `seed?` | `send(event)`, `setContext`, `dispose()`, `ensure()` (another incarnation of the same identity) |
| a trait or a subroutine alone | `id`, `fixtures?`, `seed?` (input is given at `enter`) | `enter(input?, { subject? })`, `leave()`, `guards(answers)`, `reset(subject)` (traits), `send` of `events` and `hostEvents` |

A fragment inside an author-written test host is a machine Story over that host. Every subject's Effect requirements
(`R`, a fragment's through rule 57) must be met by `fixtures`, so a missing fake is a type error at `Story.make`
(STR12, STR63).

**Ids and discovery** (STR4, STF61, STF73). An id is non-empty and **unique across the configuration**, so `flow story
run <id>` needs no scope. `defineConfig({ apps: [{ app, stories }], stories })` lists app Stories under their app and
Stories with no app (a library fragment, a test host) at the top level; a trace of the latter has `appId: null` and
says so. Discovery rejects duplicate ids before acquiring anything (TST O1).

**Running** (STR3). `story.run({ signal? })` is the one execution boundary. It returns a `StoryRun` (`frames`,
`steps`, `checkpoints`, `end`, `evidence`, `payloads`, `trace`) or rejects with a `FlowError` that carries the same
evidence up to the failing boundary (TST O8). It rejects with `StoryExpectationFailed` when any expectation failed,
after the whole plan ran, carrying the complete run and every failure (2.7), so playback can still show it. Direct and
CLI runs agree.

### 2.3 Steps, and what each one runs (R-Settle)

**Settling.** After a step applies its input, the executor runs the Story's Runtimes on a deterministic scheduler
until every fiber is finished or suspended on one of three things: the Clock (a deadline), a Story gate (a held
request, response, frame or storage write), or external input that is not coming (an open stream with nothing sent).
While it runs, turns, pending resets, adoption deliveries, settlements, invocations, acknowledgements, fake handlers and
adapter pulls all happen in production's order (MD 2.5, P21; the FIFO mailbox). What waits for time or the world
stays, and `Story.inspection` lists it as work (2.7). Tabs run in tab-open order, one turn at a time round-robin, so
two Runtimes interleave deterministically (C6).

This replaces TST O2's split between commands that "make work eligible" and `process()`, which three findings showed
to be wrong in both directions: time that runs no turns stops a timer chain (STF20), a drain that runs everything hides
the race it was meant to show (STF21), and a checkpoint taken before draining captures stale state silently (STF74).
Under R-Settle a checkpoint never processes (STR46) because there is nothing left to process at the instant it is
taken.

| Step | Input applied | Then |
| --- | --- | --- |
| `send(event)`, `send(ref, event)`, several events | each event is one step, queued as a view's send would be | settle; the verdict is a record (STR7) |
| `together(…inputs)` | admission is held in every tab while each listed input arrives, in order: a send is queued; a control runs until its effects reach a mailbox or a gate | admission resumes, then settle (STR16) |
| `world(…controls)` | each control, in order: a wire word, or a server control (2.5) | settle (STR24) |
| `advance(d)` | time moves to now + d, stopping at every deadline on the way, in the order of 2.4, settling at each | settle at now + d |
| `advance("next")`, `advance({ to })` (rare) | to the earliest deadline that is not frozen; to an epoch millisecond at or after now | as `advance` |
| `advance(d, { suspended })` | a page in the background (2.4) | the tab's overdue timers fire, then settle |
| `ensure`, `dispose`, `openTab`, `closeTab`, `enter`, `leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it | settle |
| `guards(answers)` | the stand-in host's guard answers from now on (2.13) | nothing to settle |
| `dehydrate`, `hydrate` | TST O7, unchanged (dehydrate advances time within its bound) | settle |
| `checkpoint(name)`, `expect(…)` | nothing: they name or check the latest step frame | nothing |

**`together` is the only concurrency word** (STR16, STF21, STF25). It states a real interleaving: these inputs
arrived before the actor ran any of them. `together(Stripe.confirm.release(), E.Cancel())` settles the charge and
queues its ending, then queues `Cancel`, so the ending's turn runs first; listed the other way round, `Cancel` is
admitted while the Attempt has settled and its ending waits, which is 2.7.13's "the real ending if it had already
settled" cell and the spike's P1 race, with no Story-only mode. Outside `together` a send never sits behind queued
arrivals, because the previous step settled.

**Limits and errors** (STR5, TST O2, O8). Each step may run 10,000 turns **per instant**; the 10,001st rejects with
`StoryTurnLimit` naming the step and the instant before executing (a long `advance` over a 10 ms poll is legitimate; a
zero-time loop is not). `InvalidDuration` rejects a negative, non-finite or backwards move before time changes.
`StoryInvalidCommand` names the step and one reason: `ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`,
`TabClosed`, `NothingHeld` (a `release` with nothing held, which also makes STF7 impossible), `NoDeadline` (an
`advance("next")` with nothing scheduled). `HostTimeWait` (STR27, STF19) rejects a settle in which a fiber is neither
finished nor suspended on the Clock, a gate or a known external input after a short host-time grace, naming the
fiber's owner (a fake, an adapter of an operation, a Runtime wait); it is Effect's TestClock warning ("a test is using
time, but is not advancing the test clock") made a failure with its owner. Cancellation and cleanup follow TST O8.

### 2.4 Time

One controlled clock per run (Effect's `TestClock`; Clock in every adapter, fake and Runtime). Work takes no virtual
time (STR13). `advance(d)` is what production does if d passes with nothing else happening: each deadline fires at its
instant, the turns it causes run, and a timer they re-arm inside the window fires too, so DD's `lockedOut` runs its
whole chain (STF20).

**A total order at equal instants** (STR14, STF22). Every deadline has an owner, attached by Flow to the fiber that
sleeps. At one instant they wake one at a time, settling after each (as separate browser macrotasks would), in this
order:

1. **the world**: fake servers, in the order their fixtures are listed, then by arming;
2. **adapters**: client-side service fibers (heartbeats, `Feed.reconnect` backoff, a commit's own deadline), by tab
   order, actor creation order, operation and key;
3. **the Runtime's own waits**: retain expiry, the release bound;
4. **actor schedules**: by tab order, actor creation order, instance path in placement order, `.each` copy in list
   order (rule 9), keyed schedule key in list order (rule 23), then arming.

"Outside before inside" is a documented choice, not a claim about production, where equal instants have no order; a
Story that needs the other order puts the deadlines 1 ms apart or uses `together`. Firings with the same deadline stay
separate turns (MD 2.5).

**The next deadline** (STR15, STF23). `advance("next")` moves to the earliest deadline whose owner is not frozen,
counting fake and adapter sleeps (they are real time in the world). A frozen schedule keeps its `dueAt` but has no
sleep (rule 1), so it is listed and never chosen. With none, `NoDeadline`.

**A suspended page** (STR17, STF78). `advance(d, { suspended: true })` (or `{ suspended: "b" }` for a tab) moves time
while the tab runs nothing: its timers, adapters and Runtime are paused, as a backgrounded page is; fake servers keep
running and their pushes wait in the tab's transport. At now + d the tab's overdue deadlines fire in deadline order
(then 2.4's order), then its waiting transport input is delivered, each settling. M6 2.11's `story.suspend(d)` is this.

**Time is readable** (STR18, STF24). `frame.read(Story.now)` is the epoch millisecond; schedules keep MD's reads
(`s.schedules.<path>.dueAt`, keyed schedules as keyed lists of `{ key, dueAt }`); `Story.inspection`'s work lists
every deadline with its owner, instance path, copy, key, `dueAt` and `frozen` (2.7). No author computes a time by
hand.

### 2.5 The world: fakes

A fake has two halves with two lifetimes, which is what makes one server per run possible without breaking per-tab
fixtures (STR22, STF13–STF15):

| Half | What it is | Lifetime | May depend on |
| --- | --- | --- | --- |
| **the server** (`Fake.server`) | typed truth, a request log, endpoint handlers, controls | **one per run**: built before the first tab, shared by every tab and reload, released last | nothing from a tab |
| **the client half** (a fixture: an ordinary Layer) | the app's service (`StripeApi`, an SDK's structural subset) or a transport (`fetch`, `WebSocket`), implemented by calling the server's endpoints | **one per tab**, as TST O3's fixtures are | setup services, as TST O3 allows (STF14) |

**Everything a fake remembers is server truth**: a script position, a "dropped first" flag and a retention window are
fields of `truth`, so a reload, which rebuilds only the client half, cannot restart them (STF15). The client half holds
no state. DD's `DemoServer`, a setup service built per Runtime, is shadowed in Stories by a fixture that provides the
same service from the run's server (STF13).

```ts
// stripe.fake.ts (test code; proposed spelling)
import { Fake } from "flow-state/testing"                                         // NEW: Fake
import { Effect, Layer, Schema } from "effect"

const Charge = Schema.Struct({ intentId: Schema.String, key: Schema.String })
export const Stripe = Fake.server("Stripe", {                                     // NEW: Fake.server; user-defined: Stripe
  truth: { charges: Schema.Array(Charge), busy: Schema.Int },                    // NEW: truth (a fields record or a Schema, as OD14)
  initial: { charges: [], busy: 0 },
  endpoints: {                                                                   // NEW: endpoints
    confirm: Fake.call({                                                         // NEW: Fake.call (a request/response endpoint)
      request: { intentId: Schema.String, key: Schema.String },                  // logged, redacted by INS O5
      lost: () => new NoResponse(),                                              // NEW: lost — what the transport raises when the wire loses it
      handle: (truth, req) =>                                                    // the server's behaviour: (truth, request) → [truth, response]
        truth.busy > 0 ? [{ ...truth, busy: truth.busy - 1 }, { ok: false, status: 429, retryAfterMs: 2000 }]
        : truth.charges.some((c) => c.key === req.key) ? [truth, { ok: true, status: 200, intent: succeeded(req.intentId) }]   // the fake's own dedupe (C16)
        : [{ ...truth, charges: [...truth.charges, req] }, { ok: true, status: 200, intent: succeeded(req.intentId) }],
    }),
  },
  controls: { busy: Fake.control({ times: Schema.Int }, (truth, { times }) => ({ ...truth, busy: times })) },   // NEW: controls, Fake.control
})

// The client half: the app's StripeApi (production wraps fetch), implemented over the run's server.
export const StripeFake = Layer.effect(StripeApi, Effect.map(Stripe, (server) => StripeApi.of({   // Effect: Layer.effect
  confirm: (input, { idempotencyKey }) => server.confirm({ intentId: input.intentId, key: idempotencyKey }),
})))
```

A handler returns `[truth, response]`, or an Effect of it for latency (`Effect.sleep`, on the TestClock), a defect
(`Effect.die`) or an interruption; the Effect form receives the server's truth `Ref` for atomic updates. A control is
a pure truth update, or an Effect that also sends frames on open connections (streams, below). Nothing in Flow reads a
status, a header or an error type: `429` means busy because the fake author wrote it and the commit classifies it
(STF4 is reported by the ending record, 2.6).

**The wire.** Every endpoint call goes through a gate Flow owns, between the client half and the handler. Its words are
delivery facts true of any transport, never server meanings (C16, STF17):

| Word | On a call endpoint | On a stream endpoint (2.10) | Options |
| --- | --- | --- | --- |
| `hold()` | the next request waits in transit; the server has not seen it | frames stop reaching the client: silence, a half-open connection | `at: "request"` (default) or `"response"` (the server handled it; the answer waits); stream: `"frames"` (default), `"open"`, `"close"` |
| `release()` | held items are delivered in order; standing rules end | held frames flow; a held open completes | `{ drop: true }`: the held items are lost instead; `{ nth }` (rare): release the n-th held item first (a reorder) |
| `drop()` | the next request is lost (`lost()` raised, server unchanged); `at: "response"`: the server handled it, the answer is lost | open connections close as the network would (the binding's `lost`); `at: "open"`: the next attempts are refused | `times` (default 1, or `"always"` until `release`) |
| `duplicate()` | the next request reaches the server twice; the client sees the first answer | the next frame arrives twice | `times` |

Every word also takes `match: { operation?, tab?, purpose? }` (uncommon), so "the request a commit of `O.pay` sends",
"tab b's" or "the write that acknowledges an Attempt" is named without ids. Applied to the server handle instead of an
endpoint (`Stripe.drop({ times: "always" })`), a word applies to every endpoint: an offline device.

A held request whose client has gone (a cancel, a closed tab) **stays in transit**: released, the server handles it
and the answer is discarded, which is the honest "the server finished after a cancel" of MD 2.7.2 and what makes
"charged once across a reload" (STF12) a fact the Story sets, not a race it hopes for.

**Server controls** are the author's typed messages to the server (`Stripe.busy({ times: 1 })`, `Chat.post({ text })`,
`Chat.retain({ last: 100 })`): their arguments are Schemas, so they are data, `describe` prints them and a property
test generates them (STF16, STF52). Pushing, refusing, going silent, resetting a log, keeping the last n and greeting
or withholding a greeting are each a control or a wire word (STR23); flapping and flooding are a loop at construction
(`...Array.from({ length: 20 }, () => …)`), which is data once built.

**Provenance** (STR21, STR26, STF3). Each logged request is `{ n, input, phase, via }`. `phase` is `held`, `handled`,
`answered`, `lost`, `dropped` or `duplicated`. `via` is the **client side**, recorded by Flow from the fiber that
called, never seen by the server: `{ tab, actor, instance, operation, attempt, purpose }`. So "charged once" is checked
by values: two requests with the same `via.attempt` and one charge with `key` equal to `Story.attempt(O.pay)` is a
same-Attempt retry the server deduplicated; two Attempts with one charge is a different, wrong case (STF3).

**Storage** (STR25, STF5, STF6). `Fake.storage` is Flow's own in-memory `KeyValueStore`, a run-scoped fake server that
every tab's persistence uses (STR42). Its endpoints are `read` and `write`, under the same wire words, and Flow knows
each write's purpose: `acknowledge` (an Attempt's Persistence O6 acknowledgement), `capture`, `flush`. So
`Fake.storage.write.hold({ match: { purpose: "acknowledge" } })` opens the acknowledgement window without delaying
bootstrap restore, which reads (STF6), and `.drop(…)` refuses it (`StorageRefused`). Storage starts fresh; options
seed it with encoded records, which restore validates as production does (TST O3):
`storage: Fake.storage.seed(records)`, or (rare) `Fake.storage.from(story, { at? })`, the storage an earlier Story's
run left, which is how records written by an earlier definition are made without hand-encoding them (STR41).

**Transport bindings** (uncommon). Most apps put `fetch` behind their own service, which is the swap point (OD11), and
the client half above replaces that service; the commit's classification still runs (STR19). Where the adapter itself
calls a transport, Flow ships two bindings that replace Effect's own swap points: `Fake.fetch(server, route)` provides
`FetchHttpClient.Fetch`, and `Fake.webSocket(server, route)` provides `Socket.WebSocketConstructor` (M6 2.11). `route`
maps a web `Request` or socket URL to an endpoint and input; Flow parses nothing else.

### 2.6 Endings: how every one is produced (C3)

An ending is the commit fiber's `Exit`, classified (MD 2.7.1), or a reason Flow's Runtime adds. A Story produces the
first by what the fake returns and the second by the lifecycle step that causes it. No step names an ending.

| Ending (MD 2.7.1, rule 20, rule 37) | Produced by |
| --- | --- |
| success; each failure tag; each author unknown tag | the handler's response, classified by the commit (`429` → `Busy`, `5xx` → `unknown ServerError`) |
| author unknown after a lost answer | `drop({ at: "response" })`: the transport's `lost()` reaches the commit's `catchTag("NoResponse", Outcome.unknown)` |
| `unknown { Defect }`, `{ Interrupted }`; a read's `Defect`, `Interrupted` | a handler that dies, or is interrupted |
| `StillUnknown { failure }` | a lost answer, then a retry the server refuses definitely |
| `unknown { Cancelled }` | `hold()`, then the send whose transition cancels |
| `NotSent { Cancelled }` | `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`, or a head held in a record queue, then the cancel (STF5) |
| `unknown { Restored }`, `NotSent { Restored }` | `closeTab` with the Attempt acknowledged (held on the wire) or not yet acknowledged, then `openTab`; a rebind (`dispose`, `ensure`) adopting a held lane |
| `NotSent { Rejected }` | `hold()`, then a second commit on a `reject` lane; or a commit from another subject path (rule 51) |
| `NotSent { Overloaded }` | `hold()` on the head, then 64 queued commits and one more (STF11; 6.4) |
| `NotSent { StorageRefused }`, `unknown { StorageRefused }` | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })`; the same on a persisted re-send's capture |
| evidence `Superseded`, `Released`, `NothingToResend`, `InFlight` | a second `latest` commit while the first waits; `cancel` in `Held`; `retry` in `Idle`; `retry` while held on the wire |
| `NotSent { Disposed }` | only Runtime disposal, a clean shutdown, which no app Story issues (OD23 Q41, C11): Flow's policy suite reaches it with its internal step (2.16) |

**Why no injection** (C3, STF8). `Story.ending(O.x, "unknown")` would skip the commit's classification and the
adapter's decoding, so a Story could pass along a path the real response never takes (RQ R38); the other reading of MD
rule 47 (drive "through the operation" and reject a lane with nothing on the wire) still has to decide *which* ending a
server answer means, which only the commit knows. Every reason above is reachable without it (RQ R34), and the cases
that seemed to need it are covered by R-World's general mechanisms, not by a fake per reason:

- **an unbound lane** (STF9): the fake answers the request it still holds; the lane's identity does not matter to the
  wire, and the Runtime parks or applies the ending as MD 2.7.13 says;
- **a fragment's operation** (STF10): its request carries `via.instance` and `via.operation`
  (`Autosave.O.save`), so `match` names it in a host and alone;
- **a lane with nothing on the wire** (STF7): there is nothing to `release`, which is `NothingHeld`;
- **the wrong path passing** (STF4): the ending record names its channel and reason, so a Story written for
  retry-after-busy asserts `{ channel: "failure", reason: "Busy" }` and fails, showing `unknown ServerError`, if the
  fake answers 503; coverage lists which handler each Story reached (2.15).

Alternatives considered: (B) `Story.ending` as injection, rejected above; (C) `Story.ending(O.x, exit)` that makes
the next service call return an `Exit`, so classification runs. C is a scripted fake without truth: it duplicates
R-World, cannot say what the server holds (STF1) and still needs a rule for which call it replaces. Rejected.

### 2.7 Frames, steps, reads and expectations

**Frames** (R-Frame, STR45, STR50). A frame is the cut after one committed publication of one tab: a turn, a
settlement or a Runtime step (MD 2.5), plus the initial frame. It holds, per open tab, every actor's published
snapshot and one store revision; the run's `now`; each fake server's truth; and `seq`, the position in the evidence
list it has seen. Snapshots and truth are immutable and shared between frames (MCH O8, PB 4), and records are referred
to by position, never copied (STF66), so memory is linear in run length. An old frame never shows a later row (STF28).
A frame has exactly one cause, `{ tab, kind: "turn" | "settlement" | "step", … }` (STF64). `run.frames` keeps at most
10,000 frames and marks truncation; a check over truncated frames fails closed (`FramesTruncated`).

**Steps** (STR53, STF63). `run.steps[i]` is `{ command, frame, frames: [from, to], evidence: [from, to] }` for every
command, including a denied or unhandled send that published nothing: its `frame` is then the previous one, and its
verdict is in its evidence range. Frames never collapse, so no command is lost. A checkpoint names a step's frame;
`end` is reserved for the run's end, so `checkpoint("end")` is a type error (STF75).

**One read.** `frame.read(target, { tab? })` returns a typed value; `.expect(target, partial)` checks the same read
against the latest step frame. Targets are data:

| Target | Reads | Tier |
| --- | --- | --- |
| omitted (a machine or fragment Story), or an actor `ref` | the snapshot, as views read it but with private fields typed (MD 2.2.2), or `undefined` if absent (N3) | common |
| a fake server (`Stripe`) | its truth | common |
| an endpoint (`Stripe.confirm`) | its request log, in arrival order | common |
| `Story.now` | the epoch millisecond | common |
| `Story.records(kind, filter?)` | the run's records of one kind up to this frame (below) | uncommon |
| `Story.inspection` | `inspect(runtime)` (INS O1) at this cut: lanes by identity, incarnations, work, sessions, domain queues and marks, persistence status | uncommon |
| `Story.entity(Entity, key)` | the record as a view reads it, `{ data, predicted, uncertain, unconfirmed }`, or `undefined` (STR31) | uncommon |

In test code the same values are also reachable as MD's reads on the snapshot (`O.like.get(s, k)`, `Issue.get(s, k)`,
`S.X.is(s)`), since a frame's snapshot is a snapshot.

**One home per kind of record** (STR48, STF33, STF55). `run.evidence` is one list in run order, each record with
`seq`, `tab` and the Runtime's own sequence; evidence of a closed tab stays, naming it (STR42). `Story.records(kind,
{ …filter, since? })` selects one kind; `since: run.checkpoints.locked` reads what happened after a checkpoint, so a
per-life or per-checkpoint reading is written, never assumed. Records are kept for the whole run in process,
independent of the trace's 4,096-event window (STR49, STF76). Every kind is an INS O4 event kind (STF72; the members
INS O4 gains are in section 6):

| Kind | One record per | Fields beyond `seq`, `tab` |
| --- | --- | --- |
| `step` | command | the command as data |
| `verdict` | send, raise, guard check of a lifecycle command | `target` (instance path, copy), `event`, `result` (`Allowed`, `Denied { reasons }`, `Unhandled`) |
| `ending` | ending delivered, parked, applied with no incarnation, or turned into evidence | `operation` (instance path and name), `contract`, `verb`, `key`, `attempt`, `channel`, `reason`, `event`, `route` (`current` or `late`, `from`, `owner` as a state path), `declined` (alternatives refused with `LateMayNotLeave`), `subject`, `disposition` |
| `lane` | write-lane cell applied (rule 21, 2.7.13, 2.9.3) | lane identity, `cell` (row and state), `before`, `after`; evidence words (`Superseded`, `Released`, `NothingToResend`, `InFlight`) are cells |
| `life` | fragment incarnation event | `instance`, `copy`, `life`, `change` (`created`, `ended`, `frozen`, `thawed`, `reset`), `why` |
| `callback`, `exit` | callback told; exit taken | `instance`, `copy`, `life`, `name`, `payload` |
| `listRepair`, `drop` | `.each` or keyed-schedule repair; dropped raise or timer delivery (rule 9) | `instance`, `copy`, `reason` |
| `schedule` | armed, fired, discarded, retracted by a freeze | `owner`, `instance`, `copy`, `key`, `dueAt` |
| `queue`, `store` | record-queue join, release, removal (`Superseded`, `Cancelled`, `Overloaded`, `Released`); predictions applied or removed, confirmations, `uncertain` set or cleared, repairs, skips, tombstones | `entity`, `key`, `attempt`, `reason` |
| `session` | stream-session evidence (M6 2.12) | `operation`, `key`, `cell`, each start's `answer` and basis, `missed`, drop reason, `Overflow`, `Discarded`, reconnect phase |
| `request`, `control` | a fake's request (with every phase change) or control | 2.5 |
| `issue`, `diagnostic`, `persistence`, `hydration`, `entry` | as INS O4 | as INS O4 |

Names never collide across kinds (STF59): a callback and an exit with the same name are two kinds. The record's
`key` is always the contract's key record, `copy` is always an `.each` copy's key string and `subject` is always the
subject path (STF38). An owner is a state path, never an activation string (STF40).

**Work** (STR51, STF31, STF32, STF34). `Story.inspection.work` lists every unfinished thing with what it waits for, and
nothing else: a queued mailbox item (`{ actor, item: "event" | "reset" | "adoption", event, from }`, where `from` names
an ending's operation and Attempt, a schedule's owner and key, or a send); an Attempt waiting (`waitsFor:
"acknowledgement" | "recordQueue" | "capture"`) or at a fake (`waitsFor: "server"`, with the request's `n`); a deadline
(owner, path, copy, key, `dueAt`, `frozen`); a held request, response, frame or write; an open session. A lane's state
is never repeated there: it is in the lane listing, which is the same cut (so the two cannot disagree). The word is
**work**; `pending` keeps MD's one meaning, a lane row's `InFlight` flag, and the record's old `pending` is `predicted`
(E16).

**Expectations** (STR47, STF2, SG4, SG6). `expect(target?, partial)` checks the read against `partial` by four rules:
objects match the keys listed; arrays match element by element with equal length; primitives match exactly, and a
state token matches at or below it (`state: S.PAYING`); `Story.attempt(O.x, n?)` matches the n-th Attempt id (from 0)
minted for that operation in this run, so generated ids are compared without literals (STR26, STF37). A failure is
`{ step, frame, target, path, expected, actual }`, printed the same way by a test runner and by `flow story run`, and
shown by the player at its frame. A capture never becomes a boolean.

**Properties** (STR45, STF47). What a partial cannot state ("a draft and its created record are never both shown") is
a property: `Story.property(name, (frame) => violation | undefined)`, listed in options (`properties: [...]`), run over
**every** frame after the run, failing with the first violating frame and the returned value. Properties are pure code
over frames, like a fake's handler; they are not steps, so R-Data holds, and `propertyTest` reuses them (2.17).

**A moment inside a step** (uncommon; STF46). `checkpoint(name, { at: { settled: O.like } })` names the latest frame of the
previous step whose cause matches (here, the settlement publication of that operation's Attempt); the other causes are
`{ turn: E.X }` and `{ step: "invoked" | … }`. The confirmed-but-saving moment of MD 2.8.1 is then a named frame a test
asserts and a presentation shows.

### 2.8 Lanes and rows

Rows are snapshot data (C7; MD 2.7.5), so a frame shows them exactly as a view at that publication reads them
(STR28, STF67). Keyed rows are keyed lists of the lanes that exist; an expectation against `operations.like` lists only
existing lanes, so a wrong key fails instead of reading idle (STF30); MD's `O.like.get(s, k)` stays total for views.
`Story.inspection.lanes` lists every non-`Idle` write lane by identity (actor identity, contract id, key), with subject
path, `binding` (`bound`, `unbound`, `unplaced`), `releasing`, state, flags, queued commits and parked endings: the same
listing as INS O1 and `runtime.unsettledWrites()` (STR29, STF41). A parked lane under `cancel` or `allow` is listed
`Held` with `uncertain: true`, as MD 2.7.13's `Held (parked)` table decides; that listing is where a Story reads it
(STF42). Read lanes and sessions are not write lanes and are never in that listing (STF35). Every ending is an `ending`
record (STR30); "admitted" means only MD 2.5 step 1, and entering the mailbox is "queued" (STF36).

### 2.9 Entities and the store

Server truth is per run, in fakes; client truth is per tab, in the store; a fake never writes the store, and truth
reaches it only through real responses and pushes (STR34). A Story compares them in its own words:
`expect(Issues, { issues: { c7: { likes: 4 } } })` and `expect(Story.entity(Issue, { id: "c7" }), { data: { likes:
4 }, predicted: false }, { tab: "b" })` (STF51). The three moments of a domain write (start, settlement, admission) are
three publications, hence three frames (STR33, STF46); `predicted` is read per record and omitted fields are listed in
`unconfirmed`, which is what an expectation at settlement states (STF45, STF50). A record queue's members, with
Attempt and retry count, are in `Story.inspection`; a removal is one `queue` record with its reason (STR32, STF48). A
deleted record reads `undefined` like a never-loaded one, as a view sees it, and the tombstone that tells them apart
is in `Story.inspection` and in `store` records while it lives (STR31, STF49). The boundaries (64/65 with no partial
join, FIFO across two actors, a forced repair holding the queue, `uncertain` set and cleared) are reached by holds and
sends (STR35; 6.4).

### 2.10 Streams

A stream endpoint is a connection: `Fake.stream({ request, lost, open, message? })`, where `open(truth, request)`
returns the truth, the first frames (a greeting) and whether to accept, and `message` handles client frames. A control
returns frames to send on open connections. `Fake.webSocket` binds stream endpoints to `Socket.WebSocketConstructor`;
an `EventSource`, a streamed `fetch` body or an SDK subscription is a client half written over the same endpoint
(STR19, M6B SR34). So every `Feed` signal comes from the real adapter reading real frames (STR36, STF77):

| Real sequence | Story step |
| --- | --- |
| a greeting that proves a replay, or registers without one | `open` returns `hello { replayedFrom }`, or a control `Chat.withhold({ replay: true })` |
| a drop, then a reconnect from the resume position | `world(Chat.socket.drop())`, then `advance` past the backoff |
| refused attempts, a flap | `drop({ at: "open", times: 3 })`; a loop of drop and advance |
| a quiet or half-open connection | `hold()` on the socket (frames stop, nothing closes) |
| a server close code (token expiry) | a control that closes with `4401` |
| a log reset, retention shorter than the gap | controls `Chat.resetLog({ epoch })`, `Chat.retain({ last })` |
| a catch-up page held, answered, failed | the history endpoint under `hold`, `release`, a handler that fails |
| a flood past `bufferSize` | a control that sends n frames |
| a slow finalizer (`ReleaseOverdue`) | `hold({ at: "close" })`, then `advance("5 seconds")` |

The resume position the server saw is its truth (`connections: [{ from }]`), set by `open` (STR36). Rows
(`connection`, `drop`, `value`, `last { value, at }`) are snapshot data, and each start's answer, `missed`, drops,
`Overflow`, `Discarded`, the reconnect phase and release are `session` records (STR37). Settling never waits for an
open stream (STR38): a session waiting for frames is suspended on its gate. A streaming write's `progress` publishes as
Runtime steps, so each token is a frame, and Stop mid-stream is `hold()` on the body plus the send that cancels (STR39;
6.6). Backoff, heartbeats and `resetAfter` run on the TestClock (C12). M6 2.11's control table maps one to one onto the
wire words and author controls above, with `.world(…)` replacing `.do(({ fake }) => …)` and `expect(Chat, { connections:
… })` replacing `truth.fake.resumedFrom`.

### 2.11 Persistence, reload and tabs

An app Story's tabs are independent Runtimes of its setup that share the run's fake servers and `Fake.storage`
(STR42, TST O7). `openTab(name)` constructs and readies one, seeded ids per tab name and open count (STR26);
`closeTab(name)` ends it abruptly with no final flush and releases its scope ownership (C11, C14). Requests a closed
tab left in transit stay in transit (2.5), so a reload mid-charge is written exactly (STR40, STF12): what was
acknowledged, what the server applied, and when, are each a step. After `openTab`, restore, `Restored` endings, held
lanes, parked endings and the delivery order before any external event are records and frames. A tab opened while
another holds the scope runs without persistence, and its `persistence` record says `SecondTabNoPersistence`. While a
tab is closed, `frame.read(x, { tab })` is `undefined` and its records stay (STR55, STF69). Local actors' lanes are
never persisted (C14); a focused machine Story's actor is a local identity, so reload is an app Story's step, and
`closeTab` on a machine Story is a type error. Rebind is `dispose()` then `ensure()` on the same identity; retain
expiry is `dispose(ref)` then `advance` past the retain; `dispose(ref, { how: "now" })` is `disposeActor` and `{ how:
"forget" }` is `forget` (STR9, STF43). Upgrades start from `storage: Fake.storage.from(oldStory)` run on the earlier
definition (STR41).

### 2.12 SSR and lazy entries

`dehydrate(label, { within })` and `hydrate(source, label?)` are TST O7's, unchanged. A commit in flight at dehydration
is a `hydration` record `DehydrateCommitInFlight` naming the actor, state and instance path, and no client lane exists
(C15). A state stream's `last` arrives rebased by its age, so `expect(Watch, …)` on the hydrated frame reads `last.at ===
now − age` (STR43). Lazy adoption at a chosen step without a module loader is TST O7's (STR44).

### 2.13 Fragments

**In a host** (STR11, STR12, STF53, STF55, STF60). Every fact about a fragment is a record at its instance path and
copy: `life` (created, ended, frozen, thawed, reset), `callback` (with payload and life), `exit`, `listRepair`, `drop`,
and its operations' `ending` and `lane` records with `subject`. `Story.inspection.incarnations` lists each live or
frozen incarnation (`{ instance, copy, life, status: "active" | "frozen" }`), so a frozen slice no longer looks active
(STF54). "A delivery reaches the incarnation it was started under" is an `ending` record's `life`; "a late delivery for
a removed row is dropped even if the key was added again" is a `drop` record with the old `life`. A fragment placed on
two hosts gives the same records at each host's instance path.

**Alone** (STR10, F7, rule 58). A trait or subroutine Story runs in a **stand-in host** Flow builds: one actor whose
only content is the fragment, placed where rule 48 allows everything the Story's steps need (a one-copy `.each` for a
writing trait, so `leave` is a removal; a resumable node for a `.resumable()` trait, so `leave` freezes; a `resetOn`
placement when `reset` is used; a state for a subroutine). Nothing about it is readable (STF57): `frame.read()` is the
fragment's own snapshot (its memory with private fields, schedules, rows); records carry the fragment's instance path
`[]` and a subject path made only of the Story's own `subject`; a send after `leave` is `Unhandled`, the verdict
production gives an inactive fragment. The steps:

```ts
Story.make(Lockout({ limit: 2, length: "1 minute" }), { id: "lockout/locks" })   // a trait alone; no input declared, none written
  .enter()                                                                        // existing: enter (rule 11): a host transition enters its node
  .guards({ canStrike: deny("Paused") })                                          // NEW: guards — the stand-in host's answers from now on (default: allow)
  .send(L.E.Strike())                                                             // a public event; hostEvents are sendable alone
  .leave()                                                                        // existing: leave — freezes if resumable, else abandons (whenAbandoned runs)
```

`guards` is the one way to set a stand-in guard (STF58): a step, so a refusal can start and stop mid-run, with
`deny(code)` from `flow-state`, the data a host would forward. `enter(input, { subject })` enters with the subject
part a real host's `.each` key or `resetOn` would give; `enter` while frozen thaws; `reset(subject)` (rare) changes the
reset value while active. Callbacks and exits read alone and in a host are the same records (STF60), so MD rule 11's
`run.calls` and `checkpoint.exit` are gone. A fragment's ending alone is its request's answer (STF10).

**C10.** One constructor serves every requirement: the subject's type already says what the Story is, the extra steps
are typed by it (`enter` on a machine Story is a type error), and a fragment Story handed to anything that needs an app
is a type error (STR63). Rule 58's `story.machine(fragment)` names a trait a machine; D1's `story.trait` and
`story.subroutine` add two words that restate the argument and still share every step. Recommended: `Story.make`.

### 2.14 Playback

Recording is still `run()` once and only rendering after (C5). Every frame is a publication, so lane-gated buttons,
`check()` eligibility, stream connection states and the confirmed-but-saving moment render as production would
(STR52). The player moves by frame, step or scene: a step is never lost (STR53, STF63), and a frame's cause is one
cause (STF64). The next-action highlight compares the clicked control's addressed event, `{ ref?, instance path, copy,
tag, payload }`, with the next step's, so a keyed copy or a nested subroutine is found (STR54, STF68); steps that are
not clicks (`world`, `advance`) play as captioned waits. A frame between a settlement and its ending's turn shows its
queued arrival from `work` in Inspect, so it never looks stuck (STR56, STF70). For a tab that is closed at a frame,
`<StoryFrame tab="b">` renders nothing and reports the gap `{ tab: "b", closed: true }` (STR55, STF69). Expectations
and property violations are shown at their frames (SG4). A fragment-alone Story has no app to render: handing it to
`StoryPlayer` or `StoryFrame` is a type error, and its frames are readable as text (PB 8's agent text frames); PB's
open question 2 stays open (STR57, STF71). Presentations stay typed, name checkpoints and hold no callbacks (STR58).

### 2.15 CLI, `flow check`, `flow explain` and Inspection

- `flow story list`, `describe <id>` and `run <id>` work for every subject (STR59). `describe` prints, from the plan
  alone: subject and kind, options, every step with index, checkpoints, expectations, properties, and every fake
  server reached with its endpoints, controls and their Schemas.
- `flow explain --trace <file> --at <checkpoint>` answers lane, ending, store and session questions from the trace's
  records at that checkpoint's `seq`, and says "evidence unavailable" for what fell outside the trace window (STR59,
  C13).
- Every record kind is an INS O4 member, follows INS O5's redaction, and fake truth leaves a process as digests
  (STR60). Request `via` fields are identities and are never redacted.
- `flow stories --coverage` (MD T2) also lists write-lane cells (from `lane` records' `cell`), stream cells (from
  `session` records' `cell`), ending handlers reached current and late (from `ending` records' `route`) and Flow
  reasons reached (STR61).
- The Story-derived `flow check` warnings read records the trace keeps (STR62): denial codes from `verdict` records,
  repairs and dropped raises, rule 51's declines from `ending` records, and mapper read-after-write from the `turn`
  event, which gains the keys its mappers read that the turn writes (D16).
- Types catch: unknown checkpoint names, a wrong instance path or copy key in an addressed event, a mapped, internal or
  host event sent from outside (rule 47, MD 2.2; host events only alone), a fixture list that does not meet `R`, an
  undeclared control (controls are members of the fake's handle), a read of an operation the subject does not declare,
  and a fragment Story given to an app-only API (STR6, STR63).
- A Story is data: `flow check` and `flow graph` read its steps without running a Runtime (STR64).

### 2.16 Reaching every cell: write lanes, streams and the policy suite

Every reachable cell is reached through production paths, with the steps below. Each `lane` and `session` record names
its cell, so coverage counts cells; a "cannot occur" cell firing is a Runtime defect (an issue), which property tests
over the policy suite's machines search for (STR65, STR66).

| MD 2.7.13 holding table row | Reached in `Idle` / `InFlight` / `Held` by |
| --- | --- |
| `commit`, `retry`, `cancel` | the send (or timer) whose transition lists the member, after the lane was brought to the state: `InFlight` by `hold()`, `Held` by `drop({ at: "response" })` (an unknown); `cancel` while waiting to be invoked by holding the acknowledgement (never sent) or a persisted re-send's capture (a re-send) |
| `idle`, `retryable` (guards) | a guarded send in each state; the result is a `verdict` record |
| invoked | settling once the acknowledgement, record queues and capture allow |
| storage refused | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })` (never sent); the same on `capture` for a re-send |
| success, failure, unknown, interrupt | the held request's answer; a handler that is interrupted, or a cancel's interruption |
| dispose, rebind, restore | `dispose`; `dispose` then `ensure` of the same identity; `closeTab` then `openTab` |
| SSR hydration | `dehydrate` with a commit held on the wire, then `hydrate` |
| Runtime disposal | the policy suite's internal step only |

The `cancel`/`allow` table adds `turn end`, reached by settling; `Held (parked)` is reached by a persisted identity
disposed by retain expiry (`dispose`, `advance`), an unknown answer released while it has no actor, then `ensure`.
2.9.3's rows: another path's member by two copies whose commits share a key; freeze and thaw by leaving and entering a
resumable placement's node; parking in a live actor by removing the copy; the releasing rows by a `whenAbandoned`
cancel and a removal in each state, restore by `closeTab`/`openTab`, and the cleared mark by re-adding the copy before
the lane is `Idle`. The two hydration cells MD G6 calls untestable stay so.

For streams (M6 3.1–3.5, STR66): 3.1's signal inputs come from `open` and controls (greetings with or without replay,
lost, reset), values from controls, `down` from `drop`, failure and completion from controls that close, defect and
interruption from handlers, release from leaving the state, the release bound from `hold({ at: "close" })`; 3.4's
pages and their failures and `CannotRepair` from the history endpoint's handler and `retain`, its delays from
`advance`; 3.3's queue from floods through a `Feed.callback` client half; 3.5's progress from a streamed body with a
superseded Attempt. Internal signals (`fresh`, `pending`, `settle`) are produced by `Feed.reconnect` from those.

**The policy suite** (STR67, MP X33, C11). Flow's own suite is Stories over small purpose-built machines, one per
policy and table, run by the same executor under the TestClock. It uses one step apps cannot import,
`disposeRuntime()` from `flow-state/internal/testing`, for the Runtime-disposal cells and the clean-shutdown test
(OD23 Q41). The executable lane and stream models remain design checks (C1); their invariants become properties of
the suite's Stories.

### 2.17 Property tests and exploration

`propertyTest(story, { steps, properties, seed, runs?, length?, quietWithin? })` (B5) generates ordinary Stories by
appending generated steps to a base Story: `steps` lists generators of step values (sends of the subject's public events
with Schema-derived payloads, wire words on the fakes' endpoints, server controls from their Schemas, `advance`,
lifecycle steps), and `properties` are `Story.property` values. Every fault TST O6 names is one of those steps (hold,
release, fail, delay as hold-advance-release, reorder as `release({ nth })`, duplicate, lose as `drop`, push as a
control, disconnect and reconnect, change subscriptions as sends or `ensure`/`dispose`, invalidate as a step, crash and
restore as `closeTab`/`openTab`, adopt as lazy adoption), so a shrunk failure is a literal Story that runs and plays
back (STR69, STF52). The domain form of TST O6 becomes a preset over this (`Domain.propertySteps(domains, inputs)`),
keeping its oracle, quietness and Inconclusive rules.

**After `model()`** (STR68, STF79). Finding a sequence the author did not write is this search on the real Runtime: to
find the shortest way into `LOCKED_OUT`, write the property "never `LOCKED_OUT`" and shrink the counterexample. The
lost jobs are stated: enumerating every simple path and guaranteeing that every reachable combination was visited;
nothing replaces them without a second execution path (MD T1).

**Weighed.** STR70 (worlds generated from contracts): in reach with no new runtime: the generators already range over
every endpoint a subject's contracts reach and every wire word, and "never charge twice" is a property over truth.
STR71 (record and replay): in reach later as a scripted fake whose truth is the recorded answers, plus a recorder at the
transport bindings; it needs stable event tags and Schemas (present), raw in-process capture that never leaves the
machine (INS O5 digests cannot replay), and it rots loudly when a payload no longer decodes. STR72 (one controller):
yes. User input, time, the network, server state and storage are each a step of one plan, and the wire has one
vocabulary across calls, streams and storage.

### 2.18 Prior art

- **Effect's `TestClock`** (read, `effect/testing/TestClock.ts`): `adjust` runs sleeps up to the new time in order;
  a warning fires when a test uses time without advancing it. R-Settle's per-deadline settling and `HostTimeWait`
  extend both. `TestClock.layer` is the Story clock.
- From memory: **FoundationDB's simulation testing** (one deterministic scheduler, network faults injected between
  processes, seeds reproduce runs): R-Settle and the wire words. **Jepsen** (a nemesis that partitions and drops,
  histories checked against what servers hold): truth, provenance and properties. **XState's test model** (paths
  from a model): cut with `model()`; the job moves to search on the real Runtime. **Storybook** (named states,
  args): checkpoints and presentations. **Playwright traces** (per-action snapshots, a network log): steps, frames,
  request records. **Record and replay** (rr, Replay.io): 2.17's STR71.

## 3. State machines as tables

### 3.1 What a step runs (normative for the executor)

| Step | Admission | Time | Settles | Frames | Errors |
| --- | --- | --- | --- | --- | --- |
| `send` | open | fixed | after | each publication, then the step frame | `ActorAbsent`, `TabClosed`, `StoryTurnLimit` |
| `together` | held until every input arrived, then open | fixed | after release | as `send` | as `send`; `NothingHeld` for a release inside it |
| `world` | open | fixed | after each control | as `send` | `NothingHeld` |
| `advance(d)` | open | each deadline ≤ now + d, then now + d | at each deadline and at the end | as `send` | `InvalidDuration`, `StoryTurnLimit` (per instant) |
| `advance("next")`, `{ to }` | open | to the earliest unfrozen deadline; to `to` | as `advance` | as `send` | `NoDeadline`, `InvalidDuration` |
| `advance(d, { suspended })` | the tab runs nothing during the move | as `advance`, the tab's sleeps skipped | at each world deadline; then the tab's overdue ones in order | as `send` | as `advance` |
| lifecycle (`ensure`, `dispose`, tabs, `enter`, `leave`, `reset`, `setContext`) | open | fixed | after | as `send` | `AlreadyEntered`, `NotEntered`, `TabOpen`, `TabClosed` |
| `guards` | — | fixed | no | the step frame only | — |
| `checkpoint`, `expect` | — | fixed | no | none (names or checks the step frame) | `StoryExpectationFailed` after the run |

Every settle also fails with `HostTimeWait` when a fiber waits on host time.

### 3.2 A request on the wire (one per call to a call endpoint)

States: `Transit` (sent, not at the server), `Held` (held in transit), `Server` (the handler is running), `Answered`
(the answer is returning), `HeldAnswer`, `Done` (delivered), `Lost`, `Dropped`, `Orphan` (its client has gone).

| Input ↓ / State → | `Transit` | `Held` | `Server` | `HeldAnswer` | `Answered` |
| --- | --- | --- | --- | --- | --- |
| a matching `hold()` rule | → `Held` | — | — | — | — |
| a matching `drop()` rule | → `Lost`, client gets `lost()` | — | — | — | — |
| a matching `duplicate()` rule | a second request record enters `Server` | — | — | — | — |
| no rule | → `Server` | — | — | — | — |
| `release()` | — | → `Server` | — | → `Answered` | — |
| `release({ drop: true })` | — | → `Lost` | — | → `Dropped`, client gets `lost()` | — |
| handler done | — | — | truth updated; a matching `hold({ at: "response" })` → `HeldAnswer`; `drop({ at: "response" })` → `Dropped`; else → `Answered` | — | — |
| client interrupted or tab closed | → `Server` (it still travels) | stays `Held`; released, its answer goes nowhere (`Orphan`) | continues; the answer goes nowhere | the answer goes nowhere | the answer goes nowhere |
| delivered to the client | — | — | — | — | → `Done` |

Each change is a `request` record. Rules are matched in the order they were set; each is used `times` times;
`"always"` lasts until `release()`.

### 3.3 A connection on a stream endpoint

| Input ↓ / State → | `Connecting` | `Open` | `Silent` (frames held) | `Closed` |
| --- | --- | --- | --- | --- |
| `drop({ at: "open" })` rule | refused: the binding's `lost` | — | — | — |
| `hold({ at: "open" })` rule | waits until `release` | — | — | — |
| `open` accepts | → `Open`, greeting frames sent | — | — | — |
| `open` refuses with a code | → `Closed { code }` | — | — | — |
| a control sends frames | — | delivered in order | queued | — |
| `hold()` | — | → `Silent` | — | — |
| `release()` | — | — | → `Open`, queued frames delivered | — |
| `drop()` | — | → `Closed`, the binding's `lost` | → `Closed`, queued frames lost | — |
| a control closes with a code | — | → `Closed { code }` | → `Closed { code }` | — |
| the client closes (release) | → `Closed` | → `Closed`; a `hold({ at: "close" })` rule makes the close wait for `release` | → `Closed` | — |
| tab closed or suspended | → `Closed` / paused | → `Closed` / frames queue for wake | same | — |

### 3.4 The stand-in host (a fragment alone)

| Step ↓ / State → | `Absent` | `Active` | `Frozen` (resumable) | `Ended` (exit taken) |
| --- | --- | --- | --- | --- |
| `enter(input, { subject })` | a new incarnation (a copy added, or the node entered) | `AlreadyEntered` | same subject: thaw; another: reset on return | a new incarnation |
| `leave()` | `NotEntered` | resumable: → `Frozen`; else → `Absent` with `whenAbandoned` (and rule 60's release) | `NotEntered` | `NotEntered` |
| `reset(subject)` | `NotEntered` | a reset (pending reset rules apply) | `NotEntered` | `NotEntered` |
| `guards(answers)` | stored | stored; the next guard check reads them | stored | stored |
| `send(event)` | `Unhandled` | the fragment's turn | `Unhandled` | `Unhandled` |
| the fragment takes an exit | — | → `Ended`, an `exit` record | — | — |

### 3.5 Equal instants

| Rank | Owner | Then by |
| --- | --- | --- |
| 1 | fake servers | fixture order, arming order |
| 2 | adapters | tab, actor creation, operation, key, arming |
| 3 | the Runtime's own waits | tab, actor creation, arming |
| 4 | actor schedules | tab, actor creation, instance path in placement order, copy in list order, schedule key in list order, arming |

One deadline wakes, then the Runtime settles, then the next.

## 4. The seven product cases

Each starts at the real source, names the fake that stands in for it, and gives the Stories in full. Machines are
MD's (cited), unchanged; names that come from those sections are not marked again. A word marked once in this section
is not marked again.

### 4.1 Checkout with 3-D Secure (common; MD 2.7.3–2.7.4, ODP 5.1)

**Source.** `fetch` to the payment API with `Idempotency-Key: attempt.id`, wrapped by the app's `StripeApi` service;
the commit classifies `429` as `Busy`, `402` as `CardDeclined`, `5xx` and `NoResponse` as unknown, and retries one
`NoResponse` inside the send (MD 2.7.3). The fake is 2.5's `Stripe` server with its `StripeFake` client half.
3-D Secure's challenge is a control (`Stripe.requireAction()`, user-defined) whose `requires_action` answer the
commit classifies; its Story has the shape of `busyThenPaid`.

```ts
// checkout.story.ts
import { Fake, Story } from "flow-state/testing"                                  // NEW: Fake; RENAMED: Story
import { CheckoutMachine } from "./checkout.machine"
import { E, O, S } from "./checkout.definition"                                    // existing: the definition exports O (OD23)
import { Stripe, StripeFake } from "./stripe.fake"                                 // user-defined (2.5)

const checkout = (id: string) => Story.make(CheckoutMachine, { id, input: { intentId: "pi_1" }, fixtures: [StripeFake] })   // RENAMED: Story.make
const pay = E.Pay({ paymentMethodId: "pm_card" })

export const paid = checkout("checkout/paid")
  .send(pay)                                                                        // settles: committed, invoked, answered, Intent, DONE
  .expect({ state: S.DONE, operations: { pay: { pending: false, uncertain: false } } })                 // NEW: expect
  .expect(Stripe, { charges: [{ intentId: "pi_1", key: Story.attempt(O.pay) }] })   // NEW: Story.attempt — the wire key is the Attempt's id

export const paying = checkout("checkout/paying")
  .world(Stripe.confirm.hold())                                                     // NEW: world, hold — the request waits in transit
  .send(pay, pay)                                                                   // a second press while paying
  .checkpoint("paying")                                                             // existing: checkpoint (the "Paying…" scene)
  .expect({ state: S.PAYING, operations: { pay: { pending: true } } })              // check() disables Pay here; the frame renders it so
  .expect(Story.records("verdict"), [{ result: { _tag: "Allowed" } }, { result: { _tag: "Unhandled" } }])   // NEW: Story.records
  .world(Stripe.confirm.release())                                                  // NEW: release
  .expect({ state: S.DONE })

export const busyThenPaid = checkout("checkout/busy-then-paid")
  .world(Stripe.busy({ times: 1 }))                                                 // user-defined control: the next confirm answers 429
  .send(pay)
  .expect({ state: S.WAITING, memory: { busyTries: 1, retryInMs: 2000 } })
  .advance("2 seconds")                                                             // NEW MEANING: WAITING's timer fires; a new Attempt is sent
  .expect({ state: S.DONE })
  .expect(Story.records("ending", { operation: O.pay }), [
    { channel: "failure", reason: { _tag: "Busy" }, attempt: Story.attempt(O.pay, 0) },   // a 503 here would read unknown, and fail (STF4)
    { channel: "success", attempt: Story.attempt(O.pay, 1) },
  ])

export const droppedThenResent = checkout("checkout/dropped-then-resent")
  .world(Stripe.confirm.drop({ at: "response", times: 2 }))                         // NEW: drop — charged, both answers lost (the in-send retry included)
  .send(pay)
  .expect({ state: S.UNSURE, operations: { pay: { uncertain: true } } })
  .advance("next")                                                                  // UNSURE's CheckTick: retry, the same Attempt
  .expect({ state: S.DONE })
  .expect(Stripe.confirm, [                                                          // three requests, one Attempt, one charge (STF3)
    { phase: "dropped", via: { attempt: Story.attempt(O.pay) } },
    { phase: "dropped", via: { attempt: Story.attempt(O.pay) } },
    { phase: "answered", via: { attempt: Story.attempt(O.pay) } },
  ])
  .expect(Stripe, { charges: [{ key: Story.attempt(O.pay) }] })
```

The two walks that need a persisted identity are app Stories (`ShopSetup` persists `CheckoutRef`):

```ts
const shop = (id: string) => Story.make(ShopSetup, { id, fixtures: [StripeFake] })
  .ensure(Checkout1, { input: { intentId: "pi_1" } })                               // existing: ensure (Runtime O3)

export const cancelledInAckWindow = shop("checkout/cancel-before-send")
  .world(Fake.storage.write.hold({ match: { purpose: "acknowledge" } }))            // NEW: Fake.storage, match — bootstrap restore is unaffected
  .send(Checkout1, pay)
  .advance("next")                                                                  // PAYING's TookTooLong: cancel; never sent
  .expect(Story.records("ending", { operation: O.pay }), [{ channel: "failure", reason: { _tag: "NotSent", why: "Cancelled" } }])
  .expect(Stripe.confirm, [])                                                       // the server never heard of it

export const reloadMidCharge = shop("checkout/reload-mid-charge")
  .world(Stripe.confirm.hold())                                                     // acknowledged, sent, in transit
  .send(Checkout1, pay)
  .closeTab("main")                                                                 // existing: closeTab — abrupt; the request still travels
  .world(Stripe.confirm.release())                                                  // the server charges; the answer goes nowhere
  .openTab("main")                                                                  // existing: openTab
  .ensure(Checkout1, { input: { intentId: "pi_1" } })                               // restore: unknown { Restored } → UNSURE
  .expect(Checkout1, { state: S.UNSURE })
  .advance("next")                                                                  // retry the same id; the server's dedupe answers
  .expect(Checkout1, { state: S.DONE })
  .expect(Stripe, { charges: [{ key: Story.attempt(O.pay) }] })                     // charged once across the reload (STF12)
```

**Walk.** `fetch` → `StripeApi` (fake client half) → the wire → `Stripe.confirm`'s handler → `StripeResponse` → the
commit's `if (res.status === 429)` → `Busy` → `E.Busy` → WAITING. The Pay button reads `s.operations.pay.pending`;
the `paying` frame holds that row, so playback renders it disabled. Playback shows `paying` as a scene; the next step
(`world`) plays as "the server answers".

### 4.2 Autosave (common; MD 2.9.6's `Autosave` under `.each`)

**Source.** `fetch("PUT /docs/:id", { headers: { "If-Match", "Idempotency-Key" }, signal })` behind `DocsApi.put`.

```ts
// docs.fake.ts
const Doc = Schema.Struct({ body: Schema.String, etag: Schema.String })
export const Docs = Fake.server("Docs", {                                          // NEW: Fake.server; user-defined: Docs
  truth: { docs: Schema.Record({ key: Schema.String, value: Doc }), applied: Schema.Array(Schema.String) },   // NEW: truth; applied: idempotency keys
  initial: { docs: { d1: { body: "Hello", etag: "e1" } }, applied: [] },
  endpoints: {                                                                     // NEW: endpoints
    put: Fake.call({                                                               // NEW: Fake.call
      request: { docId: Schema.String, body: Schema.String, ifMatch: Schema.String, key: Schema.String },
      lost: () => new NoResponse(),                                                // NEW: lost
      handle: (t, r) => {
        const doc = t.docs[r.docId]
        if (t.applied.includes(r.key)) return [t, { status: 200, etag: doc.etag }]           // a re-send of an applied write
        if (doc.etag !== r.ifMatch) return [t, { status: 412, etag: doc.etag }]
        const etag = bump(doc.etag)                                                          // user-defined: e1 → e2
        return [{ docs: { ...t.docs, [r.docId]: { body: r.body, etag } }, applied: [...t.applied, r.key] }, { status: 200, etag }]
      },
    }),
  },
  controls: {                                                                      // NEW: controls, Fake.control
    editElsewhere: Fake.control({ docId: Schema.String, body: Schema.String }, (t, e) => ({ ...t, docs: { ...t.docs, [e.docId]: { body: e.body, etag: bump(t.docs[e.docId].etag) } } })),
  },
})
export const DocsFake = Layer.effect(DocsApi, Effect.map(Docs, (docs) => DocsApi.of({ put: (d, { idempotencyKey }) => docs.put({ ...d, key: idempotencyKey }) })))
```

```ts
// workspace.story.ts
const ws = (id: string) => Story.make(WorkspaceMachine, { id, fixtures: [DocsFake] })
  .send(E.Open({ docId: "d1", title: "Notes", body: "Hello", etag: "e1" }))
const edit = (body: string) => E.docs.key("d1").Edited({ body })                    // existing: .key(k) addresses copy d1

export const debounced = ws("autosave/debounce")
  .send(edit("Hello w"))
  .advance("500 millis")
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // one pause after the last edit: one save
  .expect(Docs.put, [{ input: { body: "Hello world", ifMatch: "e1" } }])
  .expect({ memory: { docs: [{ key: "d1", status: "clean" }] } })

export const editDuringSave = ws("autosave/edit-during-save")
  .world(Docs.put.hold())
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // the save is in transit
  .send(edit("Hello world!"), E.Close({ docId: "d1" }))                             // the newer edit waits; Close is refused
  .expect(Story.records("verdict", { event: E.Close }), [{ result: { _tag: "Denied" } }])           // Autosave.O.save.idle and the dirty check
  .world(Docs.put.release())                                                        // Saved → the newer body goes next with the new etag
  .expect(Docs.put, [{ input: { body: "Hello world", ifMatch: "e1" } }, { input: { body: "Hello world!", ifMatch: "e2" } }])

export const conflictKeepMine = ws("autosave/412-keep-mine")
  .world(Docs.editElsewhere({ docId: "d1", body: "Theirs" }))                       // the server's etag moves to e2
  .send(edit("Mine"))
  .advance("800 millis")                                                            // 412 → Conflict, the user's text kept
  .expect({ memory: { docs: [{ key: "d1", status: "conflict", body: "Mine", serverEtag: "e2" }] } })
  .send(E.KeepMine({ docId: "d1" }))
  .advance("800 millis")                                                            // Overwrite → dirty → saved over e2
  .expect(Docs, { docs: { d1: { body: "Mine" } } })

export const offline = ws("autosave/offline")
  .world(Docs.drop({ times: "always" }))                                            // on the server handle: every endpoint, until release
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // NoResponse → SaveUnsure; resend every 2 s
  .advance("6 seconds")                                                             // three re-sends of the same Attempt, then released
  .expect({ memory: { docs: [{ key: "d1", status: "stalled" }] } })
  .expect(Docs.put, Array.from({ length: 4 }, () => ({ phase: "lost", via: { attempt: Story.attempt(Autosave.O.save) } })))
  .expect(Docs, { docs: { d1: { body: "Hello" } } })                                // the server never got it

export const reopenedKeepsText = ws("autosave/unmounted-mid-save")
  .world(Docs.put.hold())
  .send(edit("Mine"))
  .advance("800 millis")
  .dispose()                                                                        // NEW: dispose — the workspace unmounts; the Runtime keeps the lane
  .ensure()                                                                         // a new incarnation of the same (input-free) identity adopts it
  .world(Docs.editElsewhere({ docId: "d1", body: "Theirs" }), Docs.put.release())   // 412 with no copy d1: parked for ["d1"] (rule 53)
  .expect(Story.inspection, { lanes: [{ subject: ["d1"], binding: "unplaced", parked: [{ reason: { _tag: "Conflict" } }] }] })   // NEW: Story.inspection
  .send(E.Open({ docId: "d1", title: "Notes", body: "Theirs", etag: "e2" }))        // the copy returns and adopts the Conflict
  .expect({ memory: { docs: [{ key: "d1", status: "conflict", body: "Mine" }] } })  // the user's text, from the event (FP RV1 M9)
```

**Walk.** `Edited` arms `settle`; `advance` fires it at 800 ms and the commit's `fetch` stand-in reaches `Docs.put`.
8.2's `CloseAnyway` then unmount, and a reload, are `reopenedKeepsText`'s shape in an app Story with `closeTab`.

### 4.3 Chat with catch-up (common live path; M6 4.1)

**Source.** A WebSocket through `effect/socket` (`Socket.makeWebSocket`, so `Socket.WebSocketConstructor` is the
swap point) and `fetchPage`, a paged `fetch` history. M6 4.1's `ChatSocketLive`, `Chat.messages` with
`Feed.reconnect` and `catchUp`, and its `ChatRoom` machine run unchanged.

```ts
// chat.fake.ts
export const ChatServer = Fake.server("Chat", {
  truth: { log: Schema.Array(Message), epoch: Schema.Int, kept: Schema.Int, replay: Schema.Boolean, connections: Schema.Array(Schema.Struct({ from: Schema.optional(Cursor) })) },
  initial: { log: [], epoch: 1, kept: 10_000, replay: true, connections: [] },
  endpoints: {
    socket: Fake.stream({                                                           // NEW: Fake.stream
      request: { roomId: Schema.String, from: Schema.optional(Cursor) },
      open: (t, r) => [{ ...t, connections: [...t.connections, { from: r.from }] }, [greeting(t, r.from)]],   // user-defined: hello { replayedFrom? } plus the replay, or reset
    }),
    history: Fake.call({ request: { roomId: Schema.String, after: Cursor }, lost: () => new TypeError("Failed to fetch"), handle: (t, r) => [t, page(t, r.after)] }),   // user-defined: page — truncated when kept < gap
  },
  controls: {
    post: Fake.control({ text: Schema.String }, (t, { text }) => { const m = message(t, text); return [{ ...t, log: [...t.log, m] }, { socket: [frame(m)] }] }),   // sends on open connections
    withhold: Fake.control({ replay: Schema.Boolean }, (t, { replay }) => ({ ...t, replay: !replay })),
    retain: Fake.control({ last: Schema.Int }, (t, { last }) => ({ ...t, kept: last })),
    resetLog: Fake.control({ epoch: Schema.Int }, (t, { epoch }) => ({ ...t, epoch, log: [] })),
    expireToken: Fake.control({}, (t) => [t, { close: { socket: 4401 } }]),
  },
})
export const ChatTransport = [Fake.webSocket(ChatServer, (url) => ({ endpoint: "socket", request: parseRoomUrl(url) })),   // NEW: Fake.webSocket
                              Fake.fetch(ChatServer, (req) => ({ endpoint: "history", request: parsePageUrl(req.url) }))]   // NEW: Fake.fetch
```

```ts
// chat.story.ts
const room = (id: string) => Story.make(ChatRoomMachine, { id, input: { roomId: "r1" }, fixtures: ChatTransport })
  .world(ChatServer.post({ text: "hi" }), ChatServer.post({ text: "there" }))       // LOADING's history read, then LIVE from seq 2

export const dropAndReplay = room("chat/drop-and-replay")
  .world(ChatServer.socket.drop())                                                   // the network closes the socket: Feed.down
  .expect({ operations: { messages: { connection: "Connecting", drop: { _tag: "ChatDropped" } } } })
  .world(ChatServer.post({ text: "while away" }))                                    // logged; no connection carries it
  .advance("next")                                                                   // the seeded backoff; reconnect from the cursor; the server replays
  .expect({ operations: { messages: { connection: "Live" } }, memory: { messages: [{ text: "hi" }, { text: "there" }, { text: "while away" }] } })
  .expect(ChatServer, { connections: [{ from: { epoch: 1, seq: 2 } }, { from: { epoch: 1, seq: 2 } }] })   // the resume position the server saw

export const pagedRepair = room("chat/failed-then-paged")
  .world(ChatServer.withhold({ replay: true }), ChatServer.history.drop(), ChatServer.socket.drop())   // hello without replay; the first page is lost
  .world(ChatServer.post({ text: "a" }), ChatServer.post({ text: "b" }))
  .advance("next")                                                                   // reconnect, pending, page lost: retried with the socket open
  .advance("next")                                                                   // the page arrives; the start settles proven
  .expect({ memory: { messages: [{}, {}, { text: "a" }, { text: "b" }] } })

export const historyGone = room("chat/retention")
  .world(ChatServer.withhold({ replay: true }), ChatServer.socket.drop())
  .world(...Array.from({ length: 150 }, (_, i) => ChatServer.post({ text: `m${i}` })), ChatServer.retain({ last: 100 }))
  .advance("next")                                                                   // catchUp fails Feed.CannotRepair → missed Lost, then the kept 100
  .expect({ memory: { notice: "Some messages could not be recovered." } })

const flapStart = room("chat/flapping")
export const flapping = Array.from({ length: 20 })                                  // built at construction: data once built (R-Data)
  .reduce<typeof flapStart>((s) => s.advance("1 second").world(ChatServer.socket.drop()), flapStart)   // no connection lives a minute: the budget never resets
  .expect({ operations: { messages: { connection: "Ended" } } })

export const tokenExpired = room("chat/token-expiry")
  .world(ChatServer.expireToken())                                                   // close 4401 → SignedOut, not transient
  .expect({ state: S.SIGNED_OUT })

export const wokenPage = room("chat/suspended")
  .advance("10 minutes", { suspended: true })                                        // NEW: suspended — the 45 s idle deadline fires overdue on wake
  .expect({ operations: { messages: { connection: "Connecting" } } })                // never "Live" with a stale connection (STF78)
```

**Walk.** A server frame → the fake `WebSocket` → `Socket.readerString` → `decodeFrame` → `Feed.live({ proof })` or a
message → `Feed.reconnect` → the session (M6 3.1) → `E.Message` → memory. Each start's answer is a `session` record.
A reload mid-repair is `pagedRepair` with `closeTab`/`openTab` in an app Story: `catchUp` runs again from the restored
cursor. A server log reset is `resetLog` then `drop`: `missed Reset`.

### 4.4 Kanban board with likes (uncommon; MD 2.9.6's `Board` and `LikeButton`, 2.8.2's `Issues`)

**Source.** `fetch` behind `IssuesApi` (`PUT /issues/:id/like` with the Attempt's key, `GET` the project's list).
`Issues` is a fake server whose truth is `{ issues: Record<id, Row>, applied }`, with endpoints `list`, `setLike` and
`get`, and controls `add` and `move` (written as 4.2's `Docs`).

```ts
const desk = (id: string) => Story.make(IssuesSetup, { id, fixtures: [IssuesFake] })
  .world(Issues.add({ id: "c7", projectId: "p1", likes: 3 }))
  .ensure(BoardP1, { input: { projectId: "p1" } })
const toggle = (liked: boolean) => Board.E.likes.key("c7").Toggle({ liked })

export const unknownLikeKept = desk("board/unknown-like-kept")
  .world(Issues.setLike.drop({ at: "response" }))                                    // applied on the server; the answer lost → LikeUnsure
  .send(BoardP1, toggle(true))
  .expect(Story.entity(Issue, { id: "c7" }), { data: { liked: true, likes: 4 }, predicted: true, uncertain: true })   // NEW: Story.entity; after an unknown (STF50)
  .expect(Story.inspection, { lanes: [{ key: { id: "c7" }, subject: ["c7"], state: "Held", binding: "bound" }] })
  .world(Issues.move({ id: "c7", to: "p2" }))                                        // the card leaves the column on the server
  .advance("3 seconds")                                                              // reconcile: the same Attempt; deduped; the repair read moves c7 out
  .expect(Story.entity(Issue, { id: "c7" }), { data: { projectId: "p2" }, predicted: false, uncertain: false })
  .expect(Issues, { issues: { c7: { likes: 4 } } })                                  // liked once

export const queueAcrossActors = desk("board/queue-across-actors")
  .ensure(IssuePageC7, { input: { issueId: "c7" } })
  .world(Issues.setLike.hold())
  .send(BoardP1, toggle(true))                                                       // heads c7's record queue, in transit
  .send(IssuePageC7, IssuePage.E.like.Toggle({ liked: false }))                      // joins behind it: predicted, not sent
  .expect(Issues.setLike, [{ input: { liked: true }, phase: "held" }])
  .world(Issues.setLike.release())
  .expect(Issues.setLike, [{ input: { liked: true }, phase: "answered" }, { input: { liked: false }, phase: "answered" }])   // FIFO across actors

const pages = Array.from({ length: 64 }, (_, i) => issuePageRef(`c7-${i}`))          // user-defined: 64 actors on one issue
export const overloaded = pages
  .reduce((s, page) => s.ensure(page, { input: { issueId: "c7" } }).send(page, IssuePage.E.like.Toggle({ liked: false })),
    desk("board/65th-write").world(Issues.setLike.hold()).send(BoardP1, toggle(true)))   // 1 held head + 63 queued; the 65th is refused
  .expect(Story.records("ending", { channel: "failure" }), [{ reason: { _tag: "NotSent", why: "Overloaded" }, instance: ["like"] }])
  .expect(Story.inspection, { domains: { issues: { queues: [{ key: { id: "c7" }, length: 64 } ] } } })   // no partial join

export const twoTabs = desk("board/two-tabs")
  .send(BoardP1, toggle(true))
  .openTab("b")
  .ensure(BoardP1, { input: { projectId: "p1" }, tab: "b" })                         // the same server; tab b's own store
  .expect(Story.entity(Issue, { id: "c7" }), { data: { liked: true, likes: 4 }, predicted: false }, { tab: "b" })
  .expect(Story.inspection, { persistence: { status: "SecondTabNoPersistence" } }, { tab: "b" })
```

"Never shown twice" (rule 33) is a property over every frame of the list Stories (2.8.2's `List`, which creates):

```ts
const shownOnce = Story.property("a created issue is never shown as a draft too", (frame) => {   // NEW: Story.property
  const s = frame.read(ListP1); if (s === undefined) return undefined                          // NEW: read
  const rows = Issues.list.get(s, { projectId: "p1" })?.rows ?? []
  const both = s.memory.creating.filter((d) => !d.discarded && d.status !== "created" && rows.some((r) => r.id === d.id))
  return both.length > 0 ? both : undefined                                                     // the violation is a value
})
export const created = Story.make(IssuesSetup, { id: "list/created", fixtures: [IssuesFake], properties: [shownOnce] })
  .ensure(ListP1, { input: { projectId: "p1" } })
  .send(ListP1, List.E.Create({ draftId: "dr1", title: "New" }))
```

**Walk.** "A like that ends unknown on a card removed and re-added" is MD 2.9.6's `IssueRow` walk: the same steps over
a host without the keep-busy line, where the list's next answer removes copy c7 (its unknown is parked for `["c7"]`,
read in `Story.inspection`) and `Issues.move` back re-adds it, whose new life adopts and reconciles.

### 4.5 Onboarding wizard (uncommon; MD 3.2's `Confirm`, ODP 9.6)

**Source.** `fetch` behind `AccountsApi`: a profile save keyed by draft (`saveProfile`) and the final `submit`.

```ts
export const confirmYes = Story.make(Confirm, { id: "confirm/yes" })                  // a subroutine alone (C10)
  .enter()                                                                           // existing: enter
  .send(Confirm.E.Yes())
  .expect(Story.records("exit"), [{ instance: [], name: "Confirmed", payload: {} }])

const signup = (id: string) => Story.make(SignupMachine, { id, fixtures: [AccountsFake] })
export const discardDeclined = signup("signup/discard-declined")
  .send(E.Next(), E.Cancel())                                                        // user-defined: Next, ProfileChanged (ODP 9.6's page events)
  .expect({ state: S.CANCELLING })
  .send(E.CANCELLING.No())                                                           // existing: a subroutine's event at its state
  .expect({ state: S.WIZARD.PROFILE })                                               // history restores the page, fields kept
  .expect(Story.records("exit"), [{ instance: ["CANCELLING"], name: "Declined" }])   // the same record shape as alone (STF60)

export const submitWaitsForProfile = signup("signup/submit-guarded")
  .world(Accounts.saveProfile.drop({ at: "response" }))                              // the profile save ends unknown: held
  .send(E.ProfileChanged({ name: "Ada" }))
  .advance("next")                                                                   // its debounce commits the save
  .send(E.Submit())
  .expect(Story.records("verdict", { event: E.Submit }), [{ result: { _tag: "Denied", reasons: [{ code: "Uncertain" }] } }])   // O.save.idle over a partial key
  .expect(Accounts.submit, [])                                                       // an old profile is never submitted
  .dispose()
  .ensure()                                                                          // an input-free local machine is one identity: it adopts the hold
  .expect(Story.records("ending", { operation: O.save }), [{ channel: "unknown" }, { channel: "unknown", reason: { _tag: "Restored" }, route: { kind: "current" } }])
```

`.leave()` on `Confirm` alone abandons it: `Story.records("exit")` stays empty and `frame.read()` is `undefined`.

### 4.6 LLM answer with Stop (uncommon; M6 4.4)

**Source.** `fetch` with a streamed NDJSON body inside `Assistant.ask`'s commit (`reject`, `key: ["threadId"]`,
`progress: { text }`); the body's lines are `token` and a final `done`.

```ts
export const Assistant = Fake.server("Assistant", {
  truth: { asked: Schema.Array(Schema.String) }, initial: { asked: [] },
  endpoints: { ask: Fake.stream({ request: { prompt: Schema.String, key: Schema.String }, lost: () => new TypeError("network error"), open: (t, r) => [{ asked: [...t.asked, r.prompt] }, []] }) },
  controls: {
    token: Fake.control({ text: Schema.String }, (t, { text }) => [t, { ask: [ndjson({ t: "token", text })] }]),
    done: Fake.control({}, (t) => [t, { ask: [ndjson({ t: "done" })], close: { ask: "end" } }]),
    cut: Fake.control({}, (t) => [t, { close: { ask: "end" } }]),                   // the body ends without its terminator
  },
})
const assistant = (id: string) => Story.make(AssistantMachine, { id, input: { threadId: "t1" }, fixtures: [Fake.fetch(Assistant, () => ({ endpoint: "ask" }))] })

export const stopMidStream = assistant("assistant/stop")
  .send(E.Ask({ prompt: "Explain lanes" }))
  .world(Assistant.token({ text: "Lanes " }), Assistant.token({ text: "are " }))     // each token a Runtime-step frame
  .expect({ operations: { ask: { pending: true, progress: { text: "Lanes are " } } } })
  .send(E.Stop())                                                                    // O.ask.cancel: the AbortSignal aborts the body
  .expect(Story.records("ending", { operation: O.ask }), [{ channel: "unknown", reason: { _tag: "Cancelled" } }])
  .expect({ memory: { answer: { text: "Lanes are ", complete: false } } })           // shown as incomplete
  .send(E.Ask({ prompt: "Again" }))                                                  // the handler released the hold, so reject admits it
  .expect(Assistant, { asked: ["Explain lanes", "Again"] })

export const truncated = assistant("assistant/no-terminator")
  .send(E.Ask({ prompt: "Explain lanes" }))
  .world(Assistant.token({ text: "Lanes" }), Assistant.cut())                        // unknown Truncated (the commit's own tag)
  .expect(Story.records("ending", { operation: O.ask }), [{ channel: "unknown", reason: { _tag: "Truncated" } }])
```

### 4.7 A fragment reused on two hosts (uncommon; MD 2.9.6's `LikeButton`)

```ts
export const likeAlone = Story.make(LikeButton, { id: "like/alone", fixtures: [IssuesFake] })   // R includes IssuesApi (rule 57)
  .world(Issues.add({ id: "c7", projectId: "p1", likes: 3 }), Issues.setLike.drop({ at: "response" }))
  .enter({ id: "c7" })                                                               // the trait's Input record
  .send(LikeButton.E.Toggle({ liked: true }))
  .expect({ operations: { set: [{ key: { id: "c7" }, uncertain: true }] } })         // its own rows (rule 59)
  .leave()                                                                           // abandoned: no release on leave (F6, F9), the hold stays
  .expect(Story.inspection, { lanes: [{ key: { id: "c7" }, subject: [], binding: "unplaced", state: "Held" }] })   // no stand-in parts
  .enter({ id: "c7" })                                                               // a new life adopts it: unknown { Restored }
  .advance("3 seconds")                                                              // reconcile re-sends the same Attempt
  .expect(Issues, { issues: { c7: { likes: 4 } } })

export const likeOnBoard = desk("board/like")                                        // 4.4's desk
  .send(BoardP1, Board.E.likes.key("c7").Toggle({ liked: true }))
  .expect(Story.records("ending", { operation: LikeButton.O.set }), [{ channel: "success", instance: ["likes", { copy: "c7" }], subject: ["c7"] }])

export const likeOnPage = Story.make(IssuePageMachine, { id: "page/like", input: { issueId: "c7" }, fixtures: [IssuesFake] })
  .send(IssuePage.E.like.Toggle({ liked: true }))
  .expect(Story.records("ending", { operation: LikeButton.O.set }), [{ channel: "success", instance: ["like"], subject: [] }])

Story.make(IssuePageMachine, { id: "page/no-fake", input: { issueId: "c7" }, fixtures: [] })
//                                                                              ~~ type error: IssuesApi is missing (LikeButton's R)
```

## 5. Traceability

"Met" cites the rule or section; "impossible" means it cannot be written; "reported" means it fails with the fix
named; "cut" states what is not provided.

### 5.1 Requirements

| # | How | # | How |
| --- | --- | --- | --- |
| STR1 | met: one constructor, options per subject (2.2) | STR37 | met: rows on snapshot, `session` records (2.10) |
| STR2 | met: inert plans, prefixes never change (2.2) | STR38 | met: an open stream is a gate, not work to drain (2.3) |
| STR3 | met: `run()` resolves or rejects with all evidence (2.2) | STR39 | met: progress publications, Stop by hold + cancel (4.6) |
| STR4 | met: top-level Stories, `appId: null` (2.2) | STR40 | met: `closeTab`/`openTab`, transit survives (2.11) |
| STR5 | met: limits and named errors (2.3) | STR41 | met: `Fake.storage.from(oldStory)` (2.5, 2.11) |
| STR6 | met: typed sends, host events alone (2.13, 2.15) | STR42 | met: tabs share fakes and storage; closed-tab records stay (2.11) |
| STR7 | met: `verdict` records (2.7) | STR43 | met: TST O7, `hydration` records, `last` rebased (2.12) |
| STR8 | met: R-Settle, 3.1 | STR44 | met: TST O7 unchanged (2.12) |
| STR9 | met: `ensure`, `dispose` modes, rebind, `setContext` (2.11) | STR45 | met: a frame per publication; properties (2.7) |
| STR10 | met: the stand-in host (2.13, 3.4) | STR46 | met: checkpoints apply nothing; work is readable (2.3, 2.7) |
| STR11 | met: fragment records in a host (2.13) | STR47 | met: expectations print value, path, frame, step (2.7) |
| STR12 | met: same records at each host's path; `R` in fixtures (2.2, 4.7) | STR48 | met: one evidence list, `Story.records` (2.7) |
| STR13 | met: `advance` settles per deadline (2.4) | STR49 | met: records kept for the run in process (2.7) |
| STR14 | met: the total order (2.4, 3.5) | STR50 | met: shared snapshots and truth; records by position (2.7) |
| STR15 | met: `advance("next")` skips frozen; counts fake sleeps (2.4) | STR51 | met: `work` with `waitsFor` (2.7) |
| STR16 | met: `together` (2.3) | STR52 | met: rows in frames (2.14) |
| STR17 | met: `advance(d, { suspended })` (2.4) | STR53 | met: `run.steps` (2.7) |
| STR18 | met: `Story.now`, schedules, work deadlines (2.4) | STR54 | met: the addressed event is compared (2.14) |
| STR19 | met: client halves and bindings replace the transport (2.5) | STR55 | met: a closed tab reads `undefined` (2.11, 2.14) |
| STR20 | met: 2.6's table; `NotSent { Disposed }` in the policy suite | STR56 | met: queued arrivals in `work` (2.14) |
| STR21 | met: truth and request log at every frame (2.5) | STR57 | met: not playable, a type error; text frames; PB Q2 open (2.14) |
| STR22 | met: the server is run-scoped (2.5) | STR58 | met: presentations unchanged (2.14) |
| STR23 | met: wire words and controls, as data (2.5, 2.10) | STR59 | met: list, describe, run, explain (2.15) |
| STR24 | met: `world` settles like a send (3.1) | STR60 | met: INS O4 members, INS O5 (2.15, section 6) |
| STR25 | met: `Fake.storage`, `purpose` (2.5) | STR61 | met: cells, handlers, reasons from records (2.15) |
| STR26 | met: seeded ids; `Story.attempt`; `via` (2.5, 2.7) | STR62 | met: the records `flow check` reads (2.15) |
| STR27 | met: `HostTimeWait` (2.3) | STR63 | met: 2.15's list |
| STR28 | met: rows are snapshot data (2.8) | STR64 | met: Stories are data (2.15) |
| STR29 | met: `Story.inspection.lanes` (2.8) | STR65 | met: 2.16; Runtime disposal by the suite; G6's two cells untestable |
| STR30 | met: `ending` records (2.7) | STR66 | met: 2.16 |
| STR31 | met: `Story.entity`; queues and tombstones in inspection (2.9) | STR67 | met: the suite is Stories plus one internal step (2.16) |
| STR32 | met: one `queue` record (2.9) | STR68 | met by search; enumeration cut (2.17) |
| STR33 | met: three publications (2.9) | STR69 | met: every fault is a step (2.17) |
| STR34 | met: truth per run, store per tab (2.9) | STR70 | weighed: in reach, no new runtime (2.17) |
| STR35 | met: holds and sends (2.9, 4.4) | STR71 | weighed: in reach later; needs raw capture (2.17) |
| STR36 | met: frames from fakes; `connections[].from` (2.10) | STR72 | weighed: yes, one plan, one wire vocabulary (2.17) |

### 5.2 Failure cases

| # | How | # | How |
| --- | --- | --- | --- |
| STF1 | impossible: truth is a read (2.5) | STF41 | met: lanes by identity (2.8) |
| STF2 | impossible: values, never booleans (2.7) | STF42 | met: `Held (parked)` listed with `uncertain` (2.8) |
| STF3 | impossible: `via.attempt` and `Story.attempt` (2.5, 4.1) | STF43 | met: `dispose`, `ensure`, tabs (2.11) |
| STF4 | reported: the `ending` record's reason; coverage (2.6) | STF44 | met: suite Stories; an undecodable record seeded by `from` (2.16) |
| STF5 | met: hold the acknowledgement (2.5, 4.1) | STF45 | met: `unconfirmed` stated at settlement (2.9) |
| STF6 | impossible: holds match `purpose`; restore reads (2.5) | STF46 | met: settlement frames; `checkpoint(…, { at })` (2.7) |
| STF7 | impossible: no ending step; `NothingHeld` (2.6) | STF47 | met: a property over every frame (4.4) |
| STF8 | impossible: no injection (2.6) | STF48 | impossible: one `queue` record (2.9) |
| STF9 | met: the wire answers whoever is bound (2.6) | STF49 | met: tombstones in inspection and `store` records (2.9) |
| STF10 | met: `via.instance`, `match` (2.6, 4.7) | STF50 | met: shown in 4.4 |
| STF11 | met: hold plus 64 commits (4.4) | STF51 | met: 2.9, 4.4 `twoTabs` |
| STF12 | met: transit survives the close; each fact a step (4.1) | STF52 | met: 2.17 |
| STF13 | impossible: one server per run (2.5) | STF53 | met: `callback`, `exit` records in a host (2.13) |
| STF14 | met: client halves per tab (2.5) | STF54 | met: `incarnations[].status` (2.13) |
| STF15 | impossible: all memory is truth (2.5) | STF55 | met: cumulative records with `since` (2.7) |
| STF16 | met: controls and wire words; a plain Layer stays a fixture without truth | STF56 | met: the stand-in places where leave and freeze work (2.13) |
| STF17 | met: four standard wire words; meanings stay the author's (2.5) | STF57 | impossible: reads re-rooted; `Unhandled` after leave (2.13) |
| STF18 | met: 3.1 | STF58 | impossible: `guards` is the one way (2.13) |
| STF19 | reported: `HostTimeWait` names the owner (2.3) | STF59 | impossible: callbacks and exits are two kinds (2.7) |
| STF20 | impossible: `advance` runs turns per deadline (2.4) | STF60 | impossible: the same records alone and hosted (2.13) |
| STF21 | met: `together` (2.3) | STF61 | met: 2.2 |
| STF22 | met: 3.5 | STF62 | met: each walk is steps (below) |
| STF23 | impossible: a frozen schedule has no sleep (2.4) | STF63 | impossible: steps are kept (2.7) |
| STF24 | met: reads and `advance("next")` (2.4) | STF64 | impossible: one cause per frame (2.7) |
| STF25 | impossible: the previous step settled; `together` orders (2.3) | STF65 | impossible: the reset is a turn frame and one `life` record (2.7) |
| STF26 | met: a pending reset is a turn inside the settle, its own frame (2.3) | STF66 | impossible: frames refer, never copy (2.7) |
| STF27 | met: work names owner, path, key; a retracted firing is a `schedule` record (2.7) | STF67 | impossible: rows in frames (2.8) |
| STF28 | impossible: frames hold their snapshots (2.7) | STF68 | met: addressed events compared (2.14) |
| STF29 | met: rows on the snapshot; `O` exported (OD23) | STF69 | met: `undefined` plus a gap (2.14) |
| STF30 | met: Stories read keyed lists, where absence fails (2.8) | STF70 | met: work shows the queued arrival (2.14) |
| STF31 | impossible: `work`, `pending`, `predicted` each one meaning (2.7) | STF71 | met: a type error; text frames (2.14) |
| STF32 | impossible: work never repeats lane state (2.7) | STF72 | impossible: every kind is an INS member (2.7) |
| STF33 | impossible: one list (2.7) | STF73 | met: unique across the configuration (2.2) |
| STF34 | met: `waitsFor` names every wait; fake sleeps are owned deadlines (2.7) | STF74 | impossible: R-Settle |
| STF35 | met: the lane listing is write lanes only (2.8) | STF75 | impossible: `end` is reserved (2.7) |
| STF36 | met: "queued" and "admitted" (2.8) | STF76 | met: in-process records whole run; export says unavailable (2.15) |
| STF37 | met: `Story.attempt`, filters by operation and Attempt (2.7) | STF77 | met: 2.10 |
| STF38 | impossible: `key`, `copy`, `subject` (2.7) | STF78 | met: `suspended` (4.3) |
| STF39 | met: `ending.declined`, `verdict` (2.7) | STF79 | met by search; enumeration cut (2.17) |
| STF40 | impossible: owners are state paths (2.7) | | |

**STF62, rule 58's walks as steps.** Two copies on one lane, the second declined: two `send`s to two copies whose
commits share a key, `ending { reason: NotSent Rejected }`. A freeze during catch-up, thaw, `Interrupted`, `resync`:
`hold()` the read, `leave()` a resumable trait, `enter()`, then `advance` to `resync`. A creating raise meeting an
adopted hold: `drop({ at: "response" })`, `leave()`, `enter()` whose turn raises. A copy removed during a 412 save,
re-added, text kept: 4.2's `reopenedKeepsText`. An upgrade from a host-only lane: `storage: Fake.storage.from(oldStory)`,
`openTab`. A removed uploading copy, reload, nothing parked: `hold()`, a removal with rule 60's cancel, `closeTab`,
`openTab`, `expect(Story.inspection, { lanes: [] })`. Two rows of a nested writing trait, one removed: two copies,
`hold()`, a removal, `expect` on the other copy's rows. "A, B, A" under `resetOn`: `reset("B")`, `reset("A")` alone or
the host's sends. A reload while frozen or while owed: `leave()` or `hold()`, `closeTab`, `openTab`. A reload that loses
a pending reset: a send whose part writes the reset key, then `closeTab` in the same step's `together`.

## 6. Amendments (proposed; none applied)

### 6.1 machine-design.md, every *Story reads: merge 3* spot and the rest

| Where | Change |
| --- | --- |
| Header (line 15) and 2.8's introduction | "Parts that need Story reads are marked…" becomes a pointer to merge 3's proposal-v2 |
| Rule 11 | replaced: `Story.make(fragment, { id, fixtures })`; `enter`, `leave`, `guards`, `reset`; callbacks and exits are `callback` and `exit` records (`run.calls`, `checkpoint.exit` removed) |
| Rule 21 (the `checkpoint.evidence` shape) | "visible in `Story.inspection`'s lane listing, the same listing as Inspection" |
| Rule 47 | "Stories produce endings only through fakes and lifecycle steps; no ending is injected (Testing O3)"; the `Story.ending` sentences removed |
| Rule 58 | `Story.make(fragment, …)`; `Story.ending(Autosave.O.save, …)` removed; the walks stay, as steps (5.2) |
| 2.5, "how a Story reads this frame" | "the settlement is its own frame; `checkpoint(name, { at: { settled: O.x } })` names it" |
| 2.7.2, "Server truth in Stories" | "the fake server's truth and request log, read at every frame; no ending is injected (Testing O3)" |
| 2.7.3, the mapped-events bullet | the `Story.ending` sentence removed; "a lane with nothing on the wire has nothing to release (`NothingHeld`)" |
| 2.7.11, the example and its paragraph | rewritten as 4.1's `busyThenPaid` with `world`, `expect`; `Overloaded` and record-queue order by `hold` and sends |
| 2.7.13, "Stories and tests" | endings by the fake's answers; an unbound lane's ending is its held request's; Runtime disposal through the policy suite's internal step |
| 2.7.16, Stories bullet | `ending`, `lane` records; endings from fakes; coverage by cells |
| 3.1's `lockout.test.ts` | `Story.make(L, …).enter().send(…, …).checkpoint("locked").expect({ … }).advance("1 minute").checkpoint("cleared")`; calls read as `callback` records |
| 3.2's `Confirm` Story | 4.5's `confirmYes` |
| 3.6, keywords (New, plans) | remove `Story.ending` and `.checkpoint(name, ({ truth }) => …)`; add section 7's words |
| 5, Testing O1 (fragments row), C16, C27's Testing note, C30's `Entity.queue` note, C53, C63 | replaced by 6.2's Testing rows; C30's removals are `queue` records; C53 and C63 lose `Story.ending` |
| 5, T2 | coverage also lists lane cells, stream cells, current and late handlers and Flow reasons |
| 7, items 17 and 19 | closed by this merge (pointer to 2.6–2.9) |

### 6.2 Plans

| Plan | Replaces or adds |
| --- | --- |
| **Testing**, title | "…checkpoints, models and property tests" → "…checkpoints and property tests" |
| **Testing O1** | "story.app(setup, …) … story.machine(machine, …)" → `Story.make(subject, options)` over an app setup, a machine, a trait or a subroutine; "Both Story kinds support send, process, advance, advanceTo, advanceToNextTimer, checkpoint and run" → 2.3's steps; "unique within its App" → "unique across the configuration"; adds the stand-in host. "Scenario commands accept no arbitrary callbacks…" **kept** |
| **Testing O2** | "process() drains currently eligible work…" and "These commands make work eligible without draining it" → R-Settle; the turn limit is per instant; adds the equal-instant order, `advance("next")`, `suspended`, `HostTimeWait` |
| **Testing O3** | "Fixtures are Effect Layers…" kept for client halves; adds `Fake.server` (run-scoped truth, endpoints, controls, the wire words), provenance, `Fake.storage` with `purpose`; "fixtures cannot inject operation outcomes directly" **kept** |
| **Testing O4** (accepted PB contract; B4) | "a frame after every command by default, or after every committed publication with frames: \"publication\"; frames: \"named\" records only checkpoints. Consecutive identical frames collapse into one" → "a frame after every committed publication; a step per command; frames never collapse"; `checkpoint.actor(ref)` → `frame.read(ref)`; `pending` → `Story.inspection.work`; `Entity.get` returns `{ data, predicted, uncertain, unconfirmed }`; records in one list; adds `expect` and properties |
| **Testing O5** | removed (MD T1) |
| **Testing O6** | `propertyTest(story, { steps, properties, … })`; the domain form becomes a preset; faults are steps |
| **Testing O7** | adds: tabs share fake servers; requests in transit survive `closeTab` |
| **Testing O8** | adds `StoryExpectationFailed`, `StoryInvalidCommand` reasons, `NoDeadline`, `HostTimeWait`, `FramesTruncated` |
| **Testing O9** | the highlight compares the addressed event; a closed tab renders nothing with a gap; fragment-alone Stories are not playable (type error) |
| **Testing V1–V9** | V5 removed; V3 proves R-Settle and the instant order; V4 proves publication frames and steps |
| **Inspection O1** | `inspect(runtime)` adds `work` (2.7) and `incarnations`; lanes by identity with `binding`, `releasing`, parked endings |
| **Inspection O4** | event kinds gain `ending`, `lane` (with `cell`), `life`, `callback`, `exit`, `listRepair`, `drop`, `session` (with `cell`), and for Story runs `step`, `request`, `control`, `verdict`; `turn` carries mapper read-after-write keys |
| **Inspection O5** | fake truth and request inputs leave the process as digests; `via` is identity, never redacted |
| **CommandLine O2, O5, O6** | `describe`'s contents (2.15); coverage by cells; top-level Stories in `defineConfig` |
| **Package O1** | `flow-state/testing` exports `Story`, `Fake`, `propertyTest`, `StoryFrame`, `StoryPlayer`, `definePresentation`; `story` and `model` removed; `flow-state/internal/testing` (not public) exports `disposeRuntime` for Flow's suite |
| **Diagnostics** | the error names above |
| **EntityDomains O2, O4** | `Entity.queue` removals are `queue` records; `propertyTest`'s domain preset |
| **M6 (proposal-v2)** | 2.11's control table and `.do` Story → 2.10's mapping; `checkpoint.evidence("feed")` → `session` records |
| **DD migration** (not edited) | `DemoServer` → a `Fake.server`; `fixtures.ts`'s `overriding` fixtures → client halves over it; every `.process()` removed; `exploreEditor` already removed (T1) |

## 7. Concepts and line counts

| Word | Tier | Mark | Why a general concept could not cover it (special cases only) |
| --- | --- | --- | --- |
| `Story.make` | common | RENAMED (`story.app`, `story.machine`) | |
| `send`, `checkpoint`, `run` | common | existing | |
| `advance` | common | NEW MEANING (settles) | |
| `expect`, `read`, `world` | common | NEW | |
| `Fake.server` (`truth`, `endpoints`, `Fake.call`) | common | NEW | |
| `hold`, `release` | common | NEW | |
| `Story.attempt` | common | NEW | generated ids cannot be written as literals |
| `together` | uncommon | NEW | settling cannot express two arrivals before one admission |
| `drop`, `duplicate`, `lost`, `match` | uncommon | NEW | |
| `controls` (`Fake.control`) | uncommon | NEW | server meanings are the author's (C16) |
| `Fake.storage` | uncommon | NEW | Flow is its own storage client; `purpose` names its writes |
| `Fake.webSocket`, `Fake.fetch`, `Fake.stream` | uncommon | NEW | |
| `dispose` | uncommon | NEW | |
| `guards` | uncommon | NEW | a fragment alone has no host to answer |
| `Story.records`, `Story.inspection`, `Story.entity` | uncommon | NEW | |
| `advance(…, { suspended })` | uncommon | NEW | a backgrounded page freezes only its own timers |
| `checkpoint(…, { at })` | uncommon | NEW | a moment inside a step |
| `Story.property` | uncommon | NEW | relations a partial cannot state |
| `ensure`, `openTab`, `closeTab`, `enter`, `leave`, `setContext`, `dehydrate`, `hydrate` | uncommon | existing | |
| `advance("next" \| { to })`, `release({ nth })`, `reset`, `Fake.storage.from`, `propertyTest(story)` | rare | NEW / NEW MEANING | `reset`: a fragment alone has no host memory to change |

Errors (for SG1's count): `StoryTurnLimit`, `InvalidDuration` (existing); `StoryInvalidCommand`, `NoDeadline`,
`HostTimeWait`, `StoryExpectationFailed`, `FramesTruncated` (NEW). Record kinds (read, not written): fourteen, each
an INS O4 member.

| Case | Tier | Fake lines | Story lines (with assertions) | Words beyond common |
| --- | --- | --- | --- | --- |
| SG2 common case (2.1) | common | 10 (a `Tickets` like `Stripe`) | 6 | none |
| 4.1 checkout | common | 17 (2.5) | 49 for six Stories | `drop`, `Fake.storage`, `match`, tabs |
| 4.2 autosave | common | 22 | 47 for five Stories | `drop`, `dispose`, `Story.inspection` |
| 4.3 chat | common live; repair uncommon | 21 | 39 for seven Stories | `Fake.stream`, `Fake.webSocket`, `Fake.fetch`, `suspended` |
| 4.4 board | uncommon | ~20 (as `Docs`) | 45 for five Stories and a property | `Story.entity`, `Story.inspection`, `Story.property`, tabs |
| 4.5 wizard | uncommon | ~12 | 23 for three Stories | `drop`, `dispose` |
| 4.6 LLM | uncommon | 9 | 18 for two Stories | `Fake.stream`, `Fake.fetch` |
| 4.7 fragment on two hosts | uncommon | 0 (4.4's) | 19 for three Stories | `guards` not needed; `enter`, `leave` |

The common case needs nothing beyond the common tier; nothing it does not use appears in its types (fragment steps,
tabs and SSR are absent from a machine Story's type) or its errors (SG2).

## 8. Open questions, in rounds

Each has options, a recommendation, and **BIG** where it adds a module, widens an API or changes code shape. Answer as
`Q1 A`. Nothing here is recorded as decided.

### Round 1: the three decisions the brief names

**Q1. C3: how endings are produced.** A: no injection; fakes and lifecycle steps produce every ending through real
classification (2.6). B: `Story.ending(O.x, …)` injects at the lane. C: `Story.ending(O.x, exit)` makes the next
service call return an `Exit`. **Recommend A**: R38 and R34 both hold, STF7–STF10 become impossible or general, and
the one unreachable reason is a clean shutdown, which C11 already gives the policy suite. B skips classification
(STF8); C is a second, truthless fake.

**Q2. C10: the fragment constructor.** A: `Story.make(subject, …)` for every subject. B: rule 58's
`story.machine(fragment)` beside `story.app`. C: D1's `story.trait`, `story.subroutine`. **Recommend A** (**BIG**:
renames TST O1's two constructors and every DD Story): the value already says its kind; steps are typed by it; B
calls a trait a machine; C adds two words for one fact.

**Q3. C4/C12: Story controls.** A: controls are data from fake handles, applied by `world` and ordered by R-Settle,
with `together` for races; TST O1 unamended. B: callbacks (`.do(({ fake }) => …)`), amending TST O1. C: one fixed Flow
list of server controls. **Recommend A**: B breaks `describe`, literal shrinking and the static plan (STR23, STR64); C
puts server meaning in Flow (C16).

### Round 2: big changes (owner)

**Q4. B1: settle after every step and remove `process()`.** A: R-Settle. B: keep `process()` and make `advance` drain
(DD's reading). **Recommend A** (**BIG**: every Story's shape): B still leaves a send before a drain observing a cut
production never shows (STF74), and needs a mode for races (STF21); A needs one word, `together`.

**Q5. B3: data expectations, and `run()` rejecting on them.** A: `expect(target, partial)` with 2.7's four rules;
`run()` rejects with `StoryExpectationFailed` carrying the run. B: assertions stay test-runner code over
`run.checkpoints`. **Recommend A** (**BIG**: changes test files): parity with the CLI and playback (STR47, SG4, SG6);
properties keep code where data cannot state a relation.

**Q6. B4: frame granularity** (PB's accepted O4). A: a frame per publication always, plus `run.steps`; no collapse.
B: keep O4's three modes and add `run.steps`. **Recommend A** (**BIG**: amends an accepted contract): "every read on
every frame" and "never shown twice" need every publication (STR45, STF47), and sharing keeps memory linear; B keeps a
mode in which those checks silently miss frames.

**Q7. B2: the `Fake` module with two lifetimes.** A: `Fake.server` (run-scoped truth, endpoints, controls) beside
fixtures (per-tab client halves), and `Fake.storage`, `Fake.fetch`, `Fake.webSocket`, `Fake.stream`. B: fixtures only,
with a documented pattern for run-scoped state. **Recommend A** (**BIG**: a new module): B leaves STF13–STF17 to each
author, and the wire words need a gate Flow owns.

**Q8. B5: `propertyTest` over any Story.** A: generators of steps over a base Story; the domain form a preset;
`model()`'s search job moves here. B: keep TST O6 for domains and state the exploration cut. **Recommend A** (**BIG**:
widens TST O6): it is the only one-runtime answer to STR68 and STR70, and shrinks to literal Stories (STR69).

### Round 3: smaller choices

**Q9. Equal instants.** A: outside before inside (2.4). B: actor schedules first. **Recommend A**; any total order
meets STR14, and A lets a server's due answer land before a client timeout at the same instant.

**Q10. Story ids.** A: unique across the configuration. B: unique per app plus a scope for library Stories.
**Recommend A** (STF73): `flow story run <id>` needs nothing else.

**Q11. The stand-in host's placement.** A: chosen per fragment shape so every step works under rule 48 (2.13). B: one
fixed placement, with `leave` refused where it cannot work. **Recommend A** (STF56).

**Q12. `NotSent { Disposed }`.** A: reached only by the policy suite's internal step. B: a public `disposeRuntime`
step. **Recommend A**: OD23 Q41 and C11 keep clean shutdown out of the app-facing API.

**Q13. Fragment Stories in playback.** A: not playable (a type error) until PB's question 2 is decided; text frames.
B: decide PB Q2 now. **Recommend A** (C5 keeps PB Q2 open).

**Q14. Turn limit.** A: 10,000 per instant per step. B: TST O2's 10,000 per command. **Recommend A**: B fails a
legitimate long `advance` over a fast poll; a zero-time loop still stops.

**Q15. Names.** `Story.make` (or `story(…)`), `world`, `together`, `expect`, `Fake.call` / `Fake.stream`, `guards`,
`work`, `via`, `suspended`. **Recommend** the names as written; each is a plain word for one thing.

### Deferred, for `revisit.md` if the owner agrees

Typed `match` on `via.subject`; a `Fake.fetch` route helper; record and replay's recorder (STR71); an exhaustive
small-scope search over the policy suite's machines (the job `model()` did, on the real Runtime, if ever needed).
