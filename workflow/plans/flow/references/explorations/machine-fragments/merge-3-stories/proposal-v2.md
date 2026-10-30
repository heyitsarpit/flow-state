# Stories, designed from the brief (merge 3, proposal v2, revision 2)

Status: **revision 2, written 2026-10-31.** The main session decided **T1–T5** under the owner's delegation
([decisions-v2.md](decisions-v2.md)): continue with this proposal (T1); no ending injection (T2, C3); one constructor,
`Story.make` (T3, C10, B6); controls as data, applied with `world`, raced with `together` (T4, C4/C12); and the big
changes B1–B5 (T5). Those parts are marked **decided (T*n*)**; everything else is *proposed*. Revision 2 answers
[reviews/v2-review-1.md](reviews/v2-review-1.md) (RV, 3 High, 11 Medium, 8 Low), the executable model of section 3
([model/RESULTS.md](model/RESULTS.md), MDL: one counterexample, 15 ambiguities, two unreachable cells) and the review's
finding that Effect's socket finalizer does not wait for a close, all at once by root cause (1.1). Revision 1 is kept
as prior art outside the repository. Built only from [brief.md](brief.md) (SG1–SG7, STR1–STR72, C1–C19, STF1–STF79),
[../machine-design.md](../machine-design.md) (MD), the operations and fragment decisions (OD, F),
[../merge-6-streams/proposal-v2.md](../merge-6-streams/proposal-v2.md) (M6, decisions S1–S7), [../../playback.md](../../playback.md)
(PB), the plans, and Effect 4.0.5's `effect/testing/TestClock.ts` and `effect/socket/Socket.ts`. The earlier
`proposal.md` and its reviews were not read.

Keyword marks in code: `// NEW:` a word this proposal adds; `// RENAMED:` an existing word under a new name;
`// NEW MEANING:` an existing word whose meaning changes; `// existing:` in MD or the plans; `// user-defined:` the
author's own name; `// Effect:` an Effect 4.0.5 export. A word is marked once per code block.

## 1. The answer in short

**One idea.** Production gets input from three places: **the user** (sends and lifecycle), **time** (the Clock) and
**the world** (servers, the network, storage). A Story is a plan of those inputs, as data. Each input is applied to the
production Runtime, which is then left to do everything it would do before the next input could arrive. The world is a
set of **fakes** that hold server truth and answer through the real transport boundary; Flow never injects an ending,
so the commit's own classification always runs (T2). What a Story checks is a value read from the **cut** a step
leaves, with one read function, one way to name a thing (an **address**) and one home per kind of record.

**Six rules** (every requirement and failure in sections 4–5 is answered by citing them):

| Rule | Statement |
| --- | --- |
| **R-Settle** | Every step applies its input, then **settles**: the scheduler runs until no task is runnable and every fiber is finished or suspended on the Clock, a Story gate or input that is not coming. Anything still waiting on the host (a real timer, an unowned promise) is `HostTimeWait` at once, never after a grace. `advance(d)` settles at every deadline it passes, in a documented total order. There is no `process()` (T5, B1). |
| **R-World** | Everything outside the client is a **fake server**: one per run, holding typed truth and a log of what it received, shared by every tab and reload, and **set up before the subject starts** (the `world` option). It is reached through declared **endpoints** whose wire the Story controls with four words (`hold`, `release`, `drop`, `duplicate`). The network can keep a request after its client is gone; local storage cannot. A fake never writes client truth and never produces an ending (T2, T5 B2). |
| **R-Data** | Plans, controls, reads and expectations are data. Code lives only in fakes (they are Layers) and in properties, which are options, never steps (T4, C4). |
| **R-Cut** | Every step ends with a **step cut**: its latest publication frame plus the evidence position, fake truth and wire state at the step's end, so a step that publishes nothing still reads its own effects. Every committed publication is also a frame. Every cumulative fact is one record in one ordered evidence list (T5 B4). |
| **R-Address** | One **address** names a thing everywhere: `{ actor?, instance?, copy?, operation?, schedule?, key?, tab?, life? }`. Wire `match`, `Story.attempt`, record filters, `advance({ next })` and step targets take it; a request's `via` and every record carry the same fields. No ordinal across actors, hosts or tabs. |
| **R-Owner** | Each behaviour is decided by the declaration that owns it: the stand-in host's placement by the fragment's declaration, what a lost request raises by the transport binding, what a server failure looks like on the wire by the binding, and a hydration source's world by the run it hydrates into. Never by later steps or by the fake author's Effect code. |

**Concepts per tier** (section 7 has the full list with marks):

| Tier | Count | Words |
| --- | --- | --- |
| **Common** (a scripted test of one machine) | **13** | `Story.make` (with `world`), `send`, `advance` (with `{ next }`), `checkpoint`, `expect`, `world`, `run`, `read`; `Fake.server` (with `truth`, `endpoints`); the wire words `hold`, `release`; `Story.attempt` |
| **Uncommon** (fragments, domains, reloads, tabs, streams, SSR) | **18** new, 8 reused | new: `together`, `drop`, `duplicate`, `controls`, `match`, `Fake.storage`, `Fake.stream`, `Fake.webSocket`, `Fake.fetch`, `dispose`, `reload`, `guards`, `Story.records`, `Story.inspection`, `Story.entity`, `advance(…, { suspended })`, `checkpoint(…, { at })`, `Story.property` (an option); reused: `ensure`, `openTab` (with `from`), `closeTab`, `enter`, `leave`, `setContext`, `dehydrate`, `hydrate` |
| **Rare** (policy cells, property tests, upgrades) | **5** | `advance({ to })`, `reset` (a fragment alone), `release({ nth })`, `Fake.storage.from(story)`, `propertyTest(story, …)` |

Thirty-six in all, thirteen common. **Removed** from the plans' Story surface: `process()`, `advanceTo`,
`advanceToNextTimer`, the `frames` option and frame collapse, `run.calls`, `checkpoint.exit`, the checkpoint predicate
(MD C16), `Story.ending` (never adopted), `story.app` / `story.machine` (renamed), M6 2.11's `.do(…)` and
`story.suspend`, TST O4's `pending` for work. Removed in revision 2: `advance("next")` without an address, `lost` on
endpoints, `hold({ at: "close" })`, the trailing `{ tab }` option on steps, the host-time grace.

**Decided.**

- **C3: no injection (T2).** Every ending comes from what a service returned or what the Runtime did, through the
  commit's real classification (2.6). `NotSent { Disposed }` is reached only by the policy suite's internal
  `disposeRuntime` step (C11). TST O3 stays as written.
- **C10: one constructor (T3).** `Story.make(subject)` for an app setup, a machine, a trait or a subroutine; the
  subject's kind decides which steps type-check; a fragment alone runs in an invisible stand-in host.
- **C4/C12: controls as data (T4).** A control is a value on a fake's handle, applied with `.world(…)`; `together`
  is the only race word; TST O1's no-callbacks rule stays unamended.
- **B1–B6 (T5, T3).** B1 every step settles, `process()` removed; B2 the `Fake` module; B3 `expect` makes `run()`
  reject; B4 a frame per publication, amending TST O4; B5 `propertyTest(story)`; B6 `Story.make`.

### 1.1 Revision 2: root causes and what changed

| # | Root cause | Findings it answers | Change |
| --- | --- | --- | --- |
| RC1 | A step's read was a publication frame, but truth, request logs and verdicts change without one | RV H1, M9 (part), L1; MDL W2 | **R-Cut**: every step has its own cut; checkpoints and step cuts are exempt from the frame cap |
| RC2 | "Nothing can happen" was partly decided by host time, and some order inputs had no owner | RV H2, M5, M6; MDL E1, W7 | **R-Settle** without a grace; ranks for setup-scoped fibers and `Fake.storage`; requests reach a fake in invocation order (tab, then turn); one rule per request, first set first |
| RC3 | The subject started before any `world` step, and the same lifecycle was restated per tab and reload | RV H3; friction cases 1–4 | the **`world` option**, applied before the subject or bootstrap; **`reload(tab)`**; **`openTab(name, { from })`** |
| RC4 | Things were named by ordinal, by operation only, or by a reused tab name | RV M1–M4, L5, L6 | **R-Address**; tab identity `{ name, open }`; `since` takes a checkpoint name; `copy` is always its own field |
| RC5 | Behaviour was chosen by later steps or by the fake's own code | RV M7, M8, M10, M11, L3, L4; the socket-finalizer finding | **R-Owner**: placement from the declaration; `lost` and server failures from the binding; a hydration source in the destination's world; stream cells no transport can produce go to the policy suite; `connections` read from the socket's request log |
| RC6 | The wire's tables mixed delivery to a remote server with local storage, and left rows out | MDL F1, W1, W3–W7, S1–S5, H1 | storage writes are **local**: FIFO per tab and **aborted** when the tab closes (closes F1); `release` ends standing rules (W1); section 3 completed, every state a column |

**New changes, for the owner** (each delegated; before/after in 2.x):

- **N1, the `world` option** (RC3, code shape of every Story that needs a populated server):
  ```ts
  // before: the actor's first read already ran against empty truth
  Story.make(ChatRoomMachine, { id, input, fixtures }).world(ChatServer.post({ text: "hi" }))
  // after: the server holds "hi" before the actor starts
  Story.make(ChatRoomMachine, { id, input, fixtures, world: [ChatServer.post({ text: "hi" })] })   // NEW: world option
  ```
- **N2, the address** (RC4, signature of `Story.attempt`, `match`, `advance`, step targets):
  ```ts
  // before: an ordinal across actors; any next deadline; a trailing tab option
  Story.attempt(LikeButton.O.set, 1); .advance("next"); .send(Workspace, edit("x"), { tab: "b" })
  // after: named by what it is
  Story.attempt(LikeButton.O.set, { actor: IssuePageC7 }); .advance({ next: { schedule: "CheckTick" } }); .send({ actor: Workspace, tab: "b" }, edit("x"))
  ```
- **N3, `reload` and `openTab(…, { from })`** (RC3):
  ```ts
  // before
  .closeTab("main").openTab("main").ensure(Checkout1, { input: { intentId: "pi_1" } })
  // after: the reopened tab ensures what it had ensured, with the same options
  .reload("main")                                                                            // NEW: reload
  ```
- **N4, `together` takes a time move** (the review's timeout-against-answer race): `together({ advance: "30 seconds" },
  Stripe.confirm.release())` fires the timer and lands the answer before either is admitted.

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
  .expect(Tickets.save, [{ input: { title: "Replace foyer light" }, via: { attempts: [Story.attempt(O.save)] } }])   // user-defined: Tickets (a Fake.server); NEW: Story.attempt
// editor.test.ts
test("editor saved", () => saved.run())                                         // existing: run; NEW MEANING: rejects with every failed expectation
```

Added: `Story.make`, `expect`, `Story.attempt`, a fake server (`Tickets`, below). Dropped: `process()`, the separate
assertion file. The "Saving…" moment is still recorded: it is a publication frame inside the `SaveRequested` step
(2.7), and a checkpoint can name it only if something real keeps the save going (the fake's 2-second latency here,
or a `hold`).

### 2.2 What a Story is

`Story.make(subject, options)` (decided, T3) returns an inert plan (STR2): the subject, its options and an ordered list
of steps. Constructing, importing and discovering it start nothing. Each chained step returns a new plan; a prefix
never changes, and nothing in a prefix depends on later steps (R-Owner), so branches are plain variables and each
branch runs in a fresh Runtime.

| Subject | Options (exactly what the subject declares, STR1) | Steps that type-check beyond the common ones |
| --- | --- | --- |
| an app setup (`RuntimeSetup`) | `id`, `fixtures?`, `world?`, `storage?`, `seed?`, `properties?` | `ensure(ref)`, `dispose(ref)`, `send(target, …events)`, `openTab`, `closeTab`, `reload`, `dehydrate`, `hydrate` |
| a machine | `id`, `input` (iff declared), `context` (iff declared), `fixtures?`, `world?`, `seed?`, `properties?` | `send(…events)`, `setContext`, `dispose()`, `ensure()` (another incarnation of the same identity) |
| a trait or a subroutine alone | `id`, `fixtures?`, `world?`, `seed?`, `properties?` (input is given at `enter`) | `enter(input?, { subject? })`, `leave(options?)`, `guards(answers)`, `reset(subject)` (traits), `send` of `events` and `hostEvents` |

**The start** (RC3, N1). A run builds the fake servers, applies the `world` option's controls to them in order
(server controls and standing wire rules; nothing is held yet, since nothing has been sent), and only then bootstraps
the first tab (an app) or starts the subject's actor (a machine; a fragment is started by `enter`). So "the server
already holds X when the screen opens" is one option, printed by `describe`, and the actor's first read meets it.
`world` is the same data `.world(…)` takes; there is no second spelling.

**Targets** (R-Address, N2). In an app Story a step names its actor with a ref, or with an address when more must be
said: `{ actor: Workspace, tab: "b" }`. A send takes a target, then events: `send(target, …events)`; there is no
trailing options object, so the event list stays unambiguous to the type checker. A machine Story's steps need no
target. A fragment inside an author-written test host is a machine Story over that host. Every subject's Effect
requirements (`R`, a fragment's through rule 57) must be met by `fixtures`, so a missing fake is a type error at
`Story.make` (STR12, STR63).

**Ids and discovery** (STR4, STF61, STF73). An id is non-empty and **unique across the configuration**, so `flow story
run <id>` needs no scope. `defineConfig({ apps: [{ app, stories }], stories })` lists app Stories under their app and
Stories with no app at the top level; a trace of the latter has `appId: null`. Discovery rejects duplicate ids before
acquiring anything (TST O1).

**Running** (STR3). `story.run({ signal? })` is the one execution boundary. It returns a `StoryRun` (`frames`, `steps`,
`checkpoints`, `end`, `evidence`, `payloads`, `trace`) or rejects with a `FlowError` that carries the same evidence up
to the failing boundary (TST O8). It rejects with `StoryExpectationFailed` when any expectation or property failed,
after the whole plan ran, carrying the complete run and every failure (decided, T5 B3), so playback can still show
it. Direct and CLI runs agree.

### 2.3 Steps, and what each one runs (R-Settle)

**Settling** (decided, T5 B1; quiescence proposed, RC2). After a step applies its input, the executor runs every tab's
Runtime and every fake on one deterministic scheduler. It stops when, after a macrotask flush, **no task is runnable**
and every fiber is finished or suspended on one of three things: the Clock (a deadline), a Story gate (a held request,
answer or frame, a held storage write), or input that is not coming (an open stream with nothing sent). Effect 4.0.5's
`TestClock` already tracks the tasks it wakes; the executor uses the same signal for the whole scheduler. A fiber
still waiting on anything else at that point (a real `setTimeout`, `crypto.subtle`, a host promise) is `HostTimeWait`
**at once**, naming its owner, with no host-time grace, so neither the result nor the order can depend on host speed
(STR27, STF19, C6). Microtask-only promises (an `async` client half that awaits no I/O) resolve inside the flush and
are deterministic.

While it runs, turns, pending resets, adoption deliveries, settlements, invocations, acknowledgements, fake handlers and
adapter pulls happen in production's order (MD 2.5, P21; the FIFO mailbox). **Interleaving is fixed**: tabs take turns
one at a time in tab-open order; Attempts invoked in one settle reach their fakes in invocation order (tab order, then
the turn that promoted them); fakes' handlers run in arrival order. What waits for time or the world stays, and is read
as work (2.7).

| Step | Input applied | Then |
| --- | --- | --- |
| `send(target?, …events)` | each event is one step, queued as a view's send would be | settle; the verdict is a record (STR7) |
| `together(…inputs)` | admission is held in every tab while each listed input arrives, in order: a send is queued; a control runs until its effects reach a mailbox or a gate; `{ advance: d }` moves time, firing each deadline so its event is queued, without turns | admission resumes, then settle (STR16) |
| `world(…controls)` | each control, in order: a wire word, or a server control (2.5) | settle (STR24) |
| `advance(d)` | time moves to now + d, stopping at every deadline on the way, in the order of 2.4, settling at each | settle at now + d |
| `advance({ next: address })`, `advance({ to })` | to the earliest unfrozen deadline the address matches; to an epoch millisecond at or after now | as `advance` |
| `advance(d, { suspended })` | a page in the background (2.4) | the tab's overdue timers fire, then settle |
| `ensure`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`, `leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it | settle |
| `guards(answers)` | the stand-in host's answers from now on (2.13) | nothing to settle |
| `dehydrate`, `hydrate` | TST O7; dehydrate's time motion follows 2.4, deadline by deadline | settle |
| `checkpoint(name, { at? })`, `expect(target?, partial)` | nothing: they name or check the latest step cut (2.7) | nothing |

**`together` is the only concurrency word** (decided, T4). It states a real interleaving: these inputs arrived before
the actor ran any of them. `together(Stripe.confirm.release(), E.Cancel())` settles the charge and queues its ending,
then queues `Cancel`; listed the other way round, `Cancel` is admitted while the ending waits, which is 2.7.13's "the
real ending if it had already settled" cell and the spike's P1 race. `together({ advance: "30 seconds" },
Stripe.confirm.release())` is the timeout-against-answer race: PAYING's `TookTooLong` and the landing answer are both
queued before either is admitted (N4). A timer chain does not re-arm inside `together`, because no turn runs there.
Outside `together` a send never sits behind queued arrivals, because the previous step settled.

**Limits and errors** (STR5, TST O2, O8). Each step may run 10,000 turns per instant; the 10,001st rejects with
`StoryTurnLimit` naming the step and the instant (a fake that always answers with another page loops at one instant
and is stopped here; the author bounds the fake). `InvalidDuration` rejects a negative, non-finite or backwards move.
`StoryInvalidCommand` names the step and one reason: `ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`,
`TabClosed`, `NothingHeld` (a `release` with nothing held **and** no standing rule to end, 3.2), `NoDeadline` (an
`advance({ next })` whose address matches nothing). `HostTimeWait` is above. Cancellation and cleanup follow TST O8.

### 2.4 Time

One controlled clock per run (Effect's `TestClock`). Work takes no virtual time (STR13). `advance(d)` is what
production does if d passes with nothing else happening: each deadline fires at its instant, the turns it causes run,
and a timer they re-arm inside the window fires too, so DD's `lockedOut` runs its whole chain (STF20).

**A total order at equal instants** (STR14, STF22). Every sleep has an owner, attached by Flow to the fiber that sleeps;
3.5 is normative. At one instant the sleeps wake one at a time, settling after each, by rank: the world (fake servers
in `fixtures` order, then `Fake.storage`), adapters (by tab, actor, operation, key), **setup-scoped fibers** (an SDK
client's heartbeat or backoff forked at layer build, a rate limiter: by layer order), the Runtime's own waits, then
actor schedules (by tab, actor, instance path in placement order, copy in list order, schedule key in list order).
Ties within an owner go by arming order. "Outside before inside" is a documented choice; a Story that needs the other
order uses `together({ advance })`.

**The next deadline** (STR15, STF23, RV M3). `advance({ next: address })` moves to the earliest unfrozen deadline whose
owner the address matches: `{ schedule: "CheckTick" }`, `{ operation: O.messages }` (that operation's adapter backoff),
`{ actor: Checkout1 }`. Adding an unrelated timer to the app (a toast, a heartbeat) cannot move the Story. A frozen
schedule has no sleep (rule 1), so it is never chosen. `advance({ to })` stays for the rare exact instant.

**A suspended page** (STR17, STF78). `advance(d, { suspended: true })` (or `{ suspended: "b" }`) moves time while the
tab runs nothing: its timers, adapters and Runtime are paused; fake servers keep running and their pushes wait in the
tab's transport. At now + d the tab's overdue deadlines fire in deadline order, then its waiting transport input is
delivered, each settling.

**Time is readable** (STR18, STF24). `frame.read(Story.now)`; schedules keep MD's reads (`s.schedules.<path>.dueAt`,
keyed lists of `{ key, dueAt }`); the work listing names every deadline with its owner, `dueAt` and `frozen` (2.7).

### 2.5 The world: fakes

(Decided, T5 B2: the module. Its parts below are proposed.) A fake has two halves with two lifetimes, which is what
makes one server per run possible without breaking per-tab fixtures (STR22, STF13–STF15):

| Half | What it is | Lifetime | May depend on |
| --- | --- | --- | --- |
| **the server** (`Fake.server`) | typed truth, a request log per endpoint, handlers, controls | **one per run**: built first, given the `world` option, shared by every tab and reload, released last | nothing from a tab |
| **the client half** (a fixture: an ordinary Layer, or a binding `Fake.fetch` / `Fake.webSocket`) | the app's service or a transport, calling the server's endpoints | **one per tab**, as TST O3's fixtures are | setup services (STF14) |

**Everything a fake remembers is server truth**, and so is every wire rule's remaining count (`times: 2` survives a
reload): a reload rebuilds only the client half, which holds no state (STF15). DD's `DemoServer` is shadowed in
Stories by a fixture that provides it from the run's server (STF13).

```ts
// stripe.fake.ts (test code)
import { Fake } from "flow-state/testing"                                         // NEW: Fake
import { Effect, Layer, Schema } from "effect"

const Charge = Schema.Struct({ intentId: Schema.String, key: Schema.String })
export const Stripe = Fake.server("Stripe", {                                     // NEW: Fake.server; user-defined: Stripe
  truth: { charges: Schema.Array(Charge), busy: Schema.Int },                    // NEW: truth
  initial: { charges: [], busy: 0 },
  endpoints: {                                                                   // NEW: endpoints
    confirm: Fake.call({                                                         // NEW: Fake.call
      request: { intentId: Schema.String, key: Schema.String },                  // logged; redacted by INS O5
      handle: (truth, req) =>                                                    // (truth, request) → [truth, response]
        truth.busy > 0 ? [{ ...truth, busy: truth.busy - 1 }, { ok: false, status: 429, retryAfterMs: 2000 }]
        : truth.charges.some((c) => c.key === req.key) ? [truth, { ok: true, status: 200, intent: succeeded(req.intentId) }]   // the fake's own dedupe (C16)
        : [{ ...truth, charges: [...truth.charges, req] }, { ok: true, status: 200, intent: succeeded(req.intentId) }],
    }),
  },
  controls: { busy: Fake.control({ times: Schema.Int }, (truth, { times }) => ({ ...truth, busy: times })) },   // NEW: controls, Fake.control
})

// The client half: the app's StripeApi (production wraps fetch), over the run's server.
export const StripeFake = Layer.effect(StripeApi, Effect.map(Stripe, (server) => StripeApi.of({   // Effect: Layer.effect
  confirm: (input, { idempotencyKey }) => server.confirm({ intentId: input.intentId, key: idempotencyKey }).pipe(
    Effect.catchTag("Fake/Lost", () => new NoResponse())),                       // NEW: Fake/Lost — the client half says what a lost request raises
})))
```

A handler returns `[truth, response]`, or an Effect of it for latency (`Effect.sleep`) or atomic updates through the
server's truth `Ref`. **A server failure never reaches the client as a defect** (R-Owner, RV M8): a handler that dies
is a crashed server, which the wire turns into the binding's failure (`Fake/Lost` for a client half, `500` for
`Fake.fetch`, close `1011` for `Fake.webSocket`), plus an `issue` naming the fake. Nothing in Flow reads a status, a
header or an error type: `429` means busy because the fake author wrote it and the commit classifies it.

**What a lost request raises is the binding's** (R-Owner, RV L3). Every endpoint call fails with `Fake/Lost` when the
wire loses it; `Fake.fetch` turns that into `fetch`'s `TypeError`, `Fake.webSocket` into a close with `1006`, and an
app-service client half maps it itself, as above. Endpoints declare no `lost`.

**The wire.** Every endpoint call goes through a gate Flow owns, between the client half and the handler; 3.2 and 3.3
are normative. Its words are delivery facts true of any transport, never server meanings (C16, STF17):

| Word | On a call endpoint | On a stream endpoint (2.10) | Options |
| --- | --- | --- | --- |
| `hold()` | a standing rule: matching requests wait in transit, unseen by the server | frames stop reaching the client (silence, half-open) | `at: "request"` (default) or `"response"` (handled, the answer waits); stream: `"frames"` (default) or `"open"` |
| `release()` | held items are delivered in arrival order, and every standing rule on this target ends | held frames flow; held opens complete; standing rules end | `{ drop: true }`: the held items are lost instead; `{ nth }` (rare): deliver the n-th held item first (a reorder) |
| `drop()` | matching requests are lost before the server; `at: "response"`: handled, the answer is lost | open connections close as the network would; `at: "open"`: matching attempts are refused | `times` (default 1, or `"always"` until `release`) |
| `duplicate()` | a matching request reaches the server twice; the client gets the first answer, the second is discarded (`phase: "duplicate"`) | the next frame arrives twice | `times` |

`hold` is standing (until `release`) unless `times` is given; `drop` and `duplicate` default to once. Every word takes
`match: address` (R-Address): `{ actor: BoardP1 }`, `{ operation: LikeButton.O.set, actor: IssuePageC7 }`, `{ tab: "b"
}`, `{ purpose: "acknowledge" }`. **One rule per request**: a request takes the earliest-set rule that matches it, and
only that one. Applied to the server handle (`Stripe.drop({ times: "always" })`), a word covers every endpoint: an
offline device.

**Remote and local.** A request to a remote server that has left the device **stays in transit** after its client is
gone (a cancel, a closed tab): released, the server handles it and the answer goes nowhere (`phase: "orphan"`). That is
MD 2.7.2's "the server finished after a cancel", and it makes "charged once across a reload" (STF12) a fact the Story
sets. **Local storage is not remote** (RC6, MDL F1): `Fake.storage`'s writes are FIFO per tab, as one writer's writes
are (PER O7), and a closed tab's unfinished writes are **aborted** (`phase: "aborted"`), never applied later, as a
crashed page's storage transaction is. So a held acknowledgement for an Attempt the Story then cancels either lands
before the Runtime's next capture (which removes it) or, if the tab closes first, never lands: no reload can restore an
ended Attempt.

**Server controls** are the author's typed messages to the server (`Stripe.busy({ times: 1 })`, `Chat.post({ text })`):
their arguments are Schemas, so they are data, `describe` prints them and a property test generates them (STF16,
STF52). Pushing, refusing, going silent, resetting a log, keeping the last n and greeting with or without a replay are
each a control or a wire word (STR23); flapping and flooding are loops at construction, data once built.

**Provenance** (STR21, STR26, STF3, RV M9). Each logged request is `{ n, input, phase, via }`. `phase` is one of `held`,
`handled`, `answered`, `lost`, `dropped`, `duplicate`, `orphan`. `via` is the **client side**, recorded by Flow, never
seen by the server: `{ tab: { name, open }, actor, instance, copy, operation, attempts, purpose }`. `attempts` is a
list, since a batched request (Effect's `RequestResolver`) carries several; a send an SDK's own fiber makes has
`via: undefined`, and the Story checks the idempotency key the server saw in `input` instead. So "charged once" is
checked by values: requests whose `via.attempts` hold the same Attempt and one charge whose `key` is that Attempt's id
is a deduplicated retry; two Attempts and one charge is a different, wrong case.

**Storage** (STR25, STF5, STF6). `Fake.storage` is Flow's own in-memory `KeyValueStore` plus PER O7's scope lock, one
per run, used by every tab (STR42). Its endpoints are `read` and `write`, under the same wire words, and Flow knows
each write's purpose: `acknowledge`, `capture`, `flush`. `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`
opens the acknowledgement window without delaying bootstrap restore, which reads (STF6); `hold({ at: "response",
match: { purpose: "acknowledge" } })` stores the acknowledgement but holds its confirmation, which is MD G1's
"acknowledged, never invoked" restore cell once the tab closes; `drop(…)` refuses (`StorageRefused`). Storage starts
fresh and may be seeded with encoded records, which restore validates (TST O3): `storage: Fake.storage.seed(records)`,
or (rare) `Fake.storage.from(story, { at? })`, the storage an earlier Story's run left, which is how records written by
an earlier definition are made (STR41).

**Transport bindings** (uncommon). Most apps put `fetch` behind their own service (OD11), and a client half replaces
that service; the commit's classification still runs (STR19). Where the adapter itself calls a transport, Flow ships
`Fake.fetch(server, route)` (provides `FetchHttpClient.Fetch`) and `Fake.webSocket(server, route)` (provides
`Socket.WebSocketConstructor`). `route` maps a web `Request` or socket URL to an endpoint and input; Flow parses
nothing else.

### 2.6 Endings: how every one is produced (decided, T2)

An ending is the commit fiber's `Exit`, classified (MD 2.7.1), or a reason Flow's Runtime adds. A Story produces the
first by what the fake returns and the second by the lifecycle step that causes it. No step names an ending.

| Ending (MD 2.7.1, rule 20, rule 37) | Produced by |
| --- | --- |
| success; each failure tag; each author unknown tag | the handler's response, classified by the commit (`429` → `Busy`, `5xx` → `unknown ServerError`) |
| author unknown after a lost request or answer | `drop()` or `drop({ at: "response" })`: `Fake/Lost`, mapped by the binding, reaches the commit's `catchTag("NoResponse", Outcome.unknown)` |
| `unknown { Defect }`; a read's `Defect` | a response the adapter cannot handle (a malformed body it throws on): an adapter bug, which is what `Defect` means. A server crash is not this (2.5) |
| `unknown { Interrupted }`; a read's `Interrupted` | a client half that interrupts its call, as an SDK whose own fiber is interrupted does; it is client code, so the wire stays honest |
| `StillUnknown { failure }` | a lost answer, then a retry the server refuses definitely |
| `unknown { Cancelled }` | `hold()`, then the send whose transition cancels |
| `NotSent { Cancelled }` | `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`, or a head held in a record queue, then the cancel (STF5) |
| `unknown { Restored }` | `reload` with the Attempt acknowledged and on the wire; with the acknowledgement stored but its confirmation held (MD G1: acknowledged, never invoked); a rebind (`dispose`, `ensure`) adopting a held lane |
| `NotSent { Restored }` | `reload` with the acknowledgement held (not stored: aborted with the tab, 2.5); each queued `W` entry of the restored lane |
| `NotSent { Rejected }` | `hold()`, then a second commit on a `reject` lane; or a commit from another subject path (rule 51) |
| `NotSent { Overloaded }` | `hold()` on the head, then 64 queued commits and one more (STF11; 4.4) |
| `NotSent { StorageRefused }`, `unknown { StorageRefused }` | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })`; the same on a persisted re-send's `capture` |
| evidence `Superseded`, `Released`, `NothingToResend`, `InFlight` | a second `latest` commit while the first waits; `cancel` in `Held`; `retry` in `Idle`; `retry` while held on the wire |
| `NotSent { Disposed }` | only Runtime disposal, through the policy suite's internal `disposeRuntime` step (decided, T2; OD23 Q41, C11) |

**Why no injection** (decided, T2; STF8). `Story.ending(O.x, "unknown")` would skip the commit's classification and the
adapter's decoding, so a Story could pass along a path the real response never takes (RQ R38). Every reason above is
reachable without it (RQ R34), and the cases that seemed to need it are covered by R-World and R-Address:

- **an unbound lane** (STF9): the fake answers the request it still holds; the wire does not care who is bound;
- **a fragment's operation** (STF10): `match: { operation: Autosave.O.save, actor, copy }` names its request in a host,
  and alone;
- **a lane with nothing on the wire** (STF7): there is nothing to `release`, which is `NothingHeld`;
- **the wrong path passing** (STF4): the ending record names its channel and reason, so a Story that asserts
  `{ channel: "failure", reason: { _tag: "Busy" } }` fails if the fake answers 503. A Story that checks only the final
  state is **reported by coverage**, which shows the `Busy` handler unreached; the documented shape also checks the
  intermediate state (`S.WAITING`).

Prior art kept: alternatives B (injection at the lane) and C (`Story.ending(O.x, exit)`, a scripted fake without
truth) were rejected in revision 1 for the reasons T2 records.

### 2.7 Step cuts, frames, reads and expectations

**Step cuts** (R-Cut, RC1, RV H1; decided T5 B4 for the frames). Every step ends with its own cut: `{ frame, seq,
truth, wire }`, where `frame` is the latest publication frame (of each open tab), `seq` the evidence position at the
step's end, `truth` each fake server's truth then, and `wire` each endpoint's held items and standing rules then. A
step that publishes nothing (an `Unhandled` send, a `world` control, a `release` after the only tab closed) still has a
cut that includes its own `verdict`, `request` and `control` records and the server's new truth. `run.steps[i]` is
`{ command, cut, frames: [from, to], evidence: [from, to] }`. `checkpoint` names a step cut and `expect` checks one;
neither ever reads a bare publication frame. `end` is reserved, so `checkpoint("end")` is a type error (STF75).

**Frames** (STR45, STR50). A frame is the cut after one committed publication of one tab (a turn, a settlement or a
Runtime step, MD 2.5), plus the initial frame: every actor's snapshot and one store revision per open tab, `now`, and
the truth and `seq` at that publication. Snapshots and truth are immutable and shared (MCH O8, PB 4); records are
referred to by position, never copied (STF66), so memory is linear. A frame has exactly one cause (STF64). Frames
serve properties, `checkpoint(…, { at })` and playback. `run.frames` keeps at most 10,000 and marks truncation; step
cuts and checkpoints are **never** truncated, as the trace never drops checkpoints (INS O4; RV L1), and a property over
truncated frames fails closed (`FramesTruncated`).

**One read.** `frame.read(target)` and `cut.read(target)` return a typed value; `.expect(target, partial)` checks the
same read against the latest step cut. Targets are data:

| Target | Reads | Tier |
| --- | --- | --- |
| omitted (a machine or fragment Story), an actor `ref`, or an address `{ actor, tab }` | the snapshot, as views read it but with private fields typed (MD 2.2.2), or `undefined` if absent or the tab is closed (N3) | common |
| a fake server (`Stripe`) | its truth | common |
| an endpoint (`Stripe.confirm`) | its request log, in arrival order, with phases (2.5) | common |
| `Story.now` | the epoch millisecond | common |
| `Story.records(kind, filter?)` | the run's records of one kind up to this cut; `filter` is an address plus kind fields | uncommon |
| `Story.inspection`, `Story.inspection({ tab })` | `inspect(runtime)` (INS O1) at this cut: lanes by identity, incarnations, work, sessions, domain queues and marks, persistence. Held wire items are not Runtime facts and are read from endpoints (RV L2) | uncommon |
| `Story.entity(Entity, key, { tab? })` | the record as a view reads it, `{ data, predicted, uncertain, unconfirmed }`, or `undefined` (STR31) | uncommon |

In test code the same values are also reachable as MD's reads on a snapshot (`O.like.get(s, k)`, `Issue.get(s, k)`).

**One home per kind of record** (STR48, STF33, STF55). `run.evidence` is one list in run order; each record has the
run-wide `seq`, the Runtime's own sequence, and `tab: { name, open }`, so a closed tab's records and the reopened tab's
are told apart (STR42, RV M4); filters accept the name alone. `Story.records(kind, { …address, since?: "checkpoint" })`
selects one kind; `since` takes a checkpoint **name**, since a plan exists before any run (RV L5). Records are kept for
the whole run in process, independent of the trace's 4,096-event window (STR49, STF76). Every kind is an INS O4 event
kind (STF72; members added in section 6):

| Kind | One record per | Fields beyond `seq`, `tab` |
| --- | --- | --- |
| `step` | command | the command as data |
| `verdict` | send, raise, guard check of a lifecycle command | `actor`, `instance`, `copy`, `event`, `result` (`Allowed`, `Denied { reasons }`, `Unhandled`) |
| `ending` | ending delivered, parked, applied with no incarnation, or turned into evidence | `actor`, `instance`, `copy`, `operation`, `contract`, `verb`, `key`, `attempt`, `channel`, `reason`, `event`, `route` (`{ kind: "current" \| "late", from, owner }`, state paths), `declined` (`LateMayNotLeave`), `subject`, `disposition` |
| `lane` | write-lane cell applied (rule 21, 2.7.13, 2.9.3) | lane identity, `cell` (row and state), `before`, `after`; evidence words are cells |
| `life` | fragment incarnation event | `actor`, `instance`, `copy`, `life`, `change` (`created`, `ended`, `frozen`, `thawed`, `reset`), `why` |
| `callback`, `exit` | callback told; exit taken | `actor`, `instance`, `copy`, `life`, `name`, `payload` |
| `listRepair`, `drop` | `.each` or keyed-schedule repair; dropped raise or timer delivery (rule 9) | `actor`, `instance`, `copy`, `reason` |
| `schedule` | armed, fired, discarded, retracted by a freeze | owner (an address), `dueAt` |
| `queue`, `store` | record-queue join, release, removal (`Superseded`, `Cancelled`, `Released`); predictions, confirmations, `uncertain` set or cleared, repairs, skips, tombstones | `entity`, `key`, `attempt`, `reason` |
| `session` | stream-session evidence (M6 2.12) | `actor`, `instance`, `operation`, `key`, `cell`, each start's `answer` and basis, `missed`, drops, `Overflow`, `Discarded`, reconnect phase |
| `request`, `control` | a fake's request (each phase change) or control | 2.5 |
| `issue`, `diagnostic`, `persistence`, `hydration`, `entry` | as INS O4 | as INS O4 |

One shape everywhere: `instance` is a list of placement names (`["likes"]`), `copy` is the `.each` copy's key string,
`key` is the contract's key record, `subject` is the subject path (STF38). A callback and an exit with the same name
are two kinds (STF59). An owner is a state path (STF40). An `Overloaded` commit never joined a queue, so it is an
`ending` record, not a `queue` removal (STR32).

**Work** (STR51, STF31, STF32, STF34). `Story.inspection.work` lists the Runtime's unfinished things with what each
waits for, and nothing else: a queued mailbox item (`{ actor, item: "event" | "reset" | "adoption", event, from }`); an
Attempt waiting (`waitsFor: "acknowledgement" | "recordQueue" | "capture" | "server"`, the last with the request's
`n`); a deadline (owner address, `dueAt`, `frozen`); an open session. A lane's state is never repeated there. `pending`
keeps MD's one meaning, the lane row's `InFlight`; the record's old `pending` is `predicted` (E16).

**Expectations** (decided, T5 B3; STR47, STF2, SG4, SG6). `expect(target?, partial)` checks the read by five rules:
objects match the keys listed, and a key listed as `undefined` matches only an absent key (RV L6); arrays match element
by element with equal length; primitives match exactly; a state token matches at or below it; `Story.attempt(op,
address?)` matches the Attempt of `op` that address names (R-Address): `Story.attempt(O.pay)` is unambiguous when one
actor commits it once, `Story.attempt(LikeButton.O.set, { actor: BoardP1 })` names the board's, and `{ n }` (from 0)
picks among one address's Attempts in mint order. An address that matches several Attempts without `n` fails with
`AmbiguousAttempt`, never by guessing. A failure is `{ step, cut, target, path, expected, actual }`, printed the same
way by a test runner and by `flow story run`, and shown by the player at its cut.

**Properties** (STR45, STF47). `Story.property(name, (frame) => violation | undefined)`, listed in the `properties`
option: pure code over every frame after the run, failing with the first violating frame and the returned value.
Properties are options, not steps; `describe` prints them by name (TST O1's no-callbacks rule holds for steps).

**A moment inside a step** (uncommon; STF46). `checkpoint(name, { at: { settled: O.like } })` names the latest frame of
the previous step whose cause matches; the other causes are `{ turn: E.X }` and `{ step: "invoked" }`. The
confirmed-but-saving moment of MD 2.8.1 is then a named frame.

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
`expect(Issues, { issues: { c7: { likes: 4 } } })` and `expect(Story.entity(Issue, { id: "c7" }, { tab: "b" }), { data:
{ likes: 4 }, predicted: false })` (STF51). The three moments of a domain write (start, settlement, admission) are
three publications, hence three frames (STR33, STF46); `predicted` is read per record and omitted fields are listed in
`unconfirmed`, which is what an expectation at settlement states (STF45, STF50). A record queue's members, with
Attempt and retry count, are in `Story.inspection`; a removal is one `queue` record with its reason (STR32, STF48). A
deleted record reads `undefined` like a never-loaded one, as a view sees it, and the tombstone that tells them apart
is in `Story.inspection` and in `store` records while it lives (STR31, STF49). The boundaries (64/65 with no partial
join, FIFO across two actors, a forced repair holding the queue, `uncertain` set and cleared) are reached by holds and
sends (STR35; 6.4).

### 2.10 Streams (controls decided, T4)

A stream endpoint is a connection: `Fake.stream({ request, open, message? })`, where `open(truth, request)` returns the
truth, the first frames (a greeting) and whether to accept, and `message` handles client frames. A control returns
frames to send on open connections, or a close with a code. `Fake.webSocket` binds stream endpoints to
`Socket.WebSocketConstructor`; an `EventSource`, a streamed `fetch` body or an SDK subscription is a client half over
the same endpoint (STR19). So every `Feed` signal comes from the real adapter reading real frames (STR36, STF77):

| Real sequence | Story step |
| --- | --- |
| a greeting that proves a replay, or registers without one | `open` returns the author's greeting; a control `Chat.greet({ replay: false })` changes it |
| a drop, then a reconnect from the resume position | `world(Chat.socket.drop())`, then `advance({ next: { operation: O.messages } })` |
| refused attempts, a flap | `drop({ at: "open", times: 3 })`; a loop of drop and advance |
| a quiet or half-open connection | `hold()` on the socket (frames stop, nothing closes) |
| a server close code (token expiry) | a control that closes with `4401` |
| a log reset, retention shorter than the gap | controls `Chat.resetLog({ epoch })`, `Chat.retain({ last })` |
| a catch-up page held, answered, failed | the history endpoint under `hold`, `release`, `drop` |
| a flood past `bufferSize` | a control that sends n frames |

**The resume position the server saw** is the socket endpoint's request log, read directly: `expect(Chat.socket,
[{ input: { from: { epoch: 1, seq: 2 } } }, …])`. The fake keeps no `connections` field
by hand (RV L4).

Rows (`connection`, `drop`, `value`, `last { value, at }`) are snapshot data; each start's answer, `missed`, drops,
`Overflow`, `Discarded`, the reconnect phase and release are `session` records (STR37). Settling never waits for an
open stream (STR38). A streaming write's `progress` publishes as Runtime steps, so each token is a frame; Stop
mid-stream is the send that cancels while the body is open (STR39; 4.6). Backoff, heartbeats and `resetAfter` run on
the TestClock (C12).

**What no transport can produce** (RC5; the socket-finalizer finding, RV M10). Effect 4.0.5's socket finalizer closes
with `Effect.sync(() => ws.close(1000))` and does not await the close, so a session's scope closes at once on release.
`ReleaseOverdue` and 3.1's `Releasing` cells in which a signal or value arrives after release begins therefore cannot
be produced through `Fake.webSocket` or any binding whose finalizer does not wait, and revision 1's `hold({ at:
"close" })` is removed. They are reached in **Flow's policy suite**, whose purpose-built `Feed.callback` adapter has a
finalizer that awaits a gate (2.16). An app whose own adapter awaits its close (an SDK `removeChannel`) can reach them
through its own client half; the cells stay listed as suite cells.

### 2.11 Persistence, reload and tabs

An app Story's tabs are independent Runtimes of its setup that share the run's fake servers and `Fake.storage`
(STR42, TST O7). A tab's identity is `{ name, open }`: the name and how many times that name has been opened (STR26's
seed already counts it), carried by `via` and every record (RV M4).

- `openTab(name, { from? })` constructs and readies one. With `from: "main"` it then ensures, in the new tab, every
  ref that tab had ensured, with the same options, in the same order (RC3). Sends are not repeated: memory comes from
  the server or storage, as in production.
- `closeTab(name)` ends it abruptly with no final flush, releases its scope ownership (C11, C14), aborts its storage
  writes and leaves its remote requests in transit (2.5).
- `reload(name = "main")` is `closeTab(name)` then `openTab(name, { from: name })` in one step (N3): the reopened tab
  ensures what the closed one had ensured. It is the one-line reload every reload Story was writing by hand.

A reload mid-charge is written exactly (STR40, STF12): what was acknowledged, what the server applied, and when, are
each a step. After the reopen, restore, `Restored` endings, held lanes, parked endings and the delivery order before
any external event are records and frames. A tab opened while another holds the scope runs without persistence
(`SecondTabNoPersistence` in `Story.inspection`'s persistence status). While a tab is closed, `read({ actor, tab })` is
`undefined` and its records stay (STR55, STF69). A focused machine Story's actor is a local identity, whose lanes are
never persisted (C14), so `closeTab` and `reload` there are type errors. Rebind is `dispose()` then `ensure()`; retain
expiry is `dispose(ref)` then `advance` past the retain; `dispose(ref, { how: "now" })` is `disposeActor` and
`{ how: "forget" }` is `forget` (STR9, STF43). Upgrades start from `storage: Fake.storage.from(oldStory)` (STR41).

### 2.12 SSR and lazy entries

`dehydrate(label, { within })` and `hydrate(source, label?)` are TST O7's, with two rules (RC5). **One world**: a
hydration source Story runs against the destination run's fake servers, not a second run's, so the server render and
the client's refetch read one truth, as in production (RV M11). **Time**: `dehydrate`'s time motion settles deadline by
deadline in 2.4's order (RV L8). A commit in flight at dehydration is a `hydration` record `DehydrateCommitInFlight`
naming the actor, state and instance path, and no client lane exists (C15). A state stream's `last` arrives rebased by
its age (STR43). Lazy adoption at a chosen step is TST O7's (STR44).

### 2.13 Fragments (constructor decided, T3)

**In a host** (STR11, STR12, STF53, STF55, STF60). Every fact about a fragment is a record at its actor, instance path
and copy: `life`, `callback`, `exit`, `listRepair`, `drop`, and its operations' `ending` and `lane` records with
`subject`. `Story.inspection.incarnations` lists each live or frozen incarnation (`{ instance, copy, life, status:
"active" | "frozen" }`), so a frozen slice no longer looks active (STF54). A fragment on two hosts gives the same
records at each host's address, and `match`, `Story.attempt` and filters tell them apart by `actor` (RV M1, M2).

**Alone** (STR10, F7, rule 58). A trait or subroutine Story runs in a **stand-in host** Flow builds, whose placement
is decided by the **fragment's declaration alone**, never by later steps (R-Owner, RV M7):

| Fragment | Placement | `leave()` | `leave({ end: true })` | `reset(subject)` |
| --- | --- | --- | --- | --- |
| a trait | one `.each` copy keyed by the Story's `subject` (default `""`), on a node, with `resetOn` returning the same subject | its node is left: the incarnation ends (`whenAbandoned`, rule 60's release) | the same | the reset value changes: a pending reset, a new life |
| a `.resumable()` trait | the same, on a resumable node | its node is left: the incarnation **freezes** | the copy is removed: a frozen or active incarnation **ends** | as above; a frozen one resets on its next `enter` |
| a subroutine | a state | the state is left: abandoned | the same | a type error |

So one prefix has one placement in every branch, a Story may use `leave` and `reset` together, and every placement is
one rule 48 allows. Nothing about the stand-in is readable (STF57): `read()` is the fragment's own snapshot (its memory
with private fields, schedules, rows); records carry the fragment's instance path `[]` and a subject path made only of
the Story's own `subject` (empty when none is given); a send after `leave` is `Unhandled`.

```ts
Story.make(Lockout({ limit: 2, length: "1 minute" }), { id: "lockout/locks" })   // a trait alone; no input declared, none written
  .enter()                                                                        // existing: enter (rule 11)
  .guards({ canStrike: deny("Paused") })                                          // NEW: guards — the stand-in's answers from now on (default: allow)
  .send(L.E.Strike())                                                             // public events; hostEvents are sendable alone
  .leave()                                                                        // existing: leave — ends, or freezes if resumable
```

`guards` is the one way to set a stand-in guard (STF58). `enter(input, { subject })` gives the subject a real host's
`.each` key or `resetOn` would; `enter` while frozen thaws (same subject) or resets on return (another). Callbacks and
exits alone and in a host are the same records (STF60); MD rule 11's `run.calls` and `checkpoint.exit` are gone. 3.4
is normative.

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

Every reachable cell is reached through production paths (decided, T2: no injection). Each `lane` and `session` record
names its cell, so coverage counts cells; a "cannot occur" cell firing is a Runtime defect (an issue), which property
tests over the policy suite's machines search for (STR65, STR66).

| MD 2.7.13 holding table row | Reached in `Idle` / `InFlight` / `Held` by |
| --- | --- |
| `commit`, `retry`, `cancel` | the send (or timer) whose transition lists the member, after the lane was brought to the state: `InFlight` by `hold()`, `Held` by `drop({ at: "response" })`; `cancel` while waiting to be invoked by holding the acknowledgement (never sent) or a persisted re-send's `capture` (a re-send) |
| `idle`, `retryable` (guards) | a guarded send in each state; the result is a `verdict` record |
| invoked | settling once the acknowledgement, record queues and capture allow |
| storage refused | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })` (never sent); the same on `capture` for a re-send |
| success, failure, unknown, interrupt | the held request's answer; an interrupting client half, or a cancel's interruption |
| dispose, rebind | `dispose`; `dispose` then `ensure` of the same identity |
| restore | `reload`: acknowledged and on the wire (`unknown { Restored }`); acknowledgement stored, confirmation held (MD G1: acknowledged, never invoked); acknowledgement held, so aborted (`NotSent { Restored }`); with a `W` entry queued (its `NotSent { Restored }`) |
| SSR hydration | `dehydrate` with a commit held on the wire, then `hydrate` |
| Runtime disposal | the policy suite's internal step only (T2) |

The `cancel`/`allow` table adds `turn end`, reached by settling; `Held (parked)` by a persisted identity disposed by
retain expiry (`dispose`, `advance`), an unknown answer released while it has no actor, then `ensure`. 2.9.3's rows:
another path's member by two copies whose commits share a key; freeze and thaw by `leave()` and `enter()` on a
resumable placement; parking in a live actor by removing the copy; the releasing rows by a `whenAbandoned` cancel and
a removal in each state, restore by `reload`, and the cleared mark by re-adding the copy before the lane is `Idle`. The
two hydration cells MD G6 calls untestable stay so.

For streams (M6 3.1–3.5, STR66): 3.1's signal inputs come from `open` and controls, values from controls, `down` from
`drop`, failure and completion from controls that close, defect from a malformed frame, release from leaving the state;
3.4's pages, page failures and `CannotRepair` from the history endpoint and `retain`, its delays from `advance`; 3.3's
queue from floods through a `Feed.callback` client half; 3.5's progress from a streamed body with a superseded
Attempt. **Suite-only cells**: `ReleaseOverdue` and the `Releasing` cells with a late signal or value (2.10), and the
Runtime-disposal cells. The wire's own `interrupt` while in transit or while an answer returns cannot occur under
R-Settle (both are instantaneous within a step, MDL W2), so 3.2 no longer lists them.

**The policy suite** (STR67, MP X33, C11). Flow's own suite is Stories over small purpose-built machines and adapters,
run by the same executor under the TestClock. It uses one step apps cannot import, `disposeRuntime()` from
`flow-state/internal/testing`, and one adapter (a `Feed.callback` client half whose finalizer awaits a gate). The
executable lane, stream and Story models remain design checks (C1); their invariants become properties of the suite.

### 2.17 Property tests and exploration (decided, T5 B5, with RV's condition)

`propertyTest(story, { steps, properties, seed, runs?, length?, quietWithin? })` generates ordinary Stories by
appending generated steps to a base Story: `steps` lists generators of step values (sends of the subject's public events
with Schema-derived payloads, wire words on the fakes' endpoints with generated addresses, server controls from their
Schemas, `advance`, lifecycle steps); `properties` are `Story.property` values. Two rules make generated runs useful
(RV's B5 condition):

- **A generated step that is invalid in the current state is skipped**, never `StoryInvalidCommand`: a `release` with
  nothing held, a `leave` when not entered, an `ensure` of an existing actor. The skip is a `step` record with
  `skipped: reason`, so the emitted Story still runs, and the same seed skips the same steps.
- **Shrinking keeps pairs**: a `hold` and the `release` that ends it, a `closeTab` and its `openTab`, `enter` and
  `leave`, are removed together or not at all, so a shrunk Story never strands a hold it did not have.

Every fault TST O6 names is one of those steps (hold, release, fail, delay as hold-advance-release, reorder as
`release({ nth })`, duplicate, lose as `drop`, push as a control, disconnect and reconnect, change subscriptions as
sends or `ensure`/`dispose`, invalidate as a step, crash and restore as `reload`, adopt as lazy adoption), so a shrunk
failure is a literal Story that runs and plays back (STR69, STF52). TST O6's domain form becomes a preset
(`Domain.propertySteps(domains, inputs)`), keeping its oracle, quietness and Inconclusive rules.

**After `model()`** (STR68, STF79). Finding a sequence the author did not write is this search on the real Runtime:
write the property "never `LOCKED_OUT`" and shrink the counterexample. Shrinking gives a **local minimum**, a short way
in, not the shortest (RV). Cut, stated: enumerating every simple path and guaranteeing that every reachable
combination was visited; nothing replaces them without a second execution path (MD T1).

**Weighed.** STR70 (worlds from contracts): in reach with no new runtime; the generators already range over every
endpoint a subject's contracts reach, every wire word and every address. STR71 (record and replay): in reach later as a
scripted fake whose truth is the recorded answers, recorded at the transport bindings; it needs stable event tags and
Schemas (present), raw in-process capture (INS O5 digests cannot replay), and it rots loudly when a payload no longer
decodes. STR72 (one controller): yes; user input, time, the network, server state and storage are steps of one plan,
seeded by one option, named by one address.

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

Normative for the executor, and complete enough to rebuild the executable model from this section alone: every state
is a column, every input a row, every cell defined or "—" (cannot occur, with the reason). Revision 2 adds every
column and row the model found missing (MDL W1–W7, S1–S5, H1, E1) and 3.6, local storage (MDL F1).

### 3.1 What a step runs

| Step | Admission | Time | Settles (2.3) | Its cut | Errors |
| --- | --- | --- | --- | --- | --- |
| `send(target?, …events)` | open | fixed | after each event | a step cut per event | `ActorAbsent`, `TabClosed`, `StoryTurnLimit` |
| `together(…inputs)` | held until every input arrived, then open | fixed, or moved by an `{ advance }` input (deadlines fire, events queue, no turns) | after admission resumes | one | as `send`; `NothingHeld`, `InvalidDuration` |
| `world(…controls)` | open | fixed | after each control | one | `NothingHeld` |
| `advance(d)` | open | each deadline ≤ now + d, then now + d | at each deadline (3.5), then at now + d | one | `InvalidDuration`, `StoryTurnLimit` (per instant) |
| `advance({ next })`, `advance({ to })` | open | to the earliest unfrozen deadline the address matches; to `to` | as `advance` | one | `NoDeadline`, `InvalidDuration` |
| `advance(d, { suspended })` | the tab runs nothing during the move | as `advance`, the tab's sleeps skipped | at each world deadline; then the tab's overdue ones in deadline order, then its queued transport input | one | as `advance` |
| `ensure`, `dispose`, `enter`, `leave`, `reset`, `setContext` | open | fixed | after | one | `AlreadyEntered`, `NotEntered`, `ActorAbsent` |
| `openTab(name, { from? })` | open | fixed | after bootstrap, then after each ensure `from` repeats | one | `TabOpen` |
| `closeTab(name)` | the tab stops | fixed | after (other tabs; remote requests keep travelling; local writes abort) | one | `TabClosed` |
| `reload(name)` | as `closeTab` then `openTab(name, { from: name })` | fixed | as both | one | as both |
| `guards(answers)` | — | fixed | no | one (no publication) | — |
| `dehydrate`, `hydrate` | open | `dehydrate` moves time as `advance` does | after | one | TST O7's |
| `checkpoint(name, { at? })`, `expect(target?, partial)` | — | fixed | no | names or checks the latest step cut (`at`: a frame of the previous step) | `StoryExpectationFailed` after the run |

Every settle fails with `HostTimeWait` the moment it ends with a fiber waiting on the host (2.3). A world control
applied while every tab is closed still has a step cut (R-Cut).

### 3.2 A request at a call endpoint

**Rules.** Each target (an endpoint, or a server handle covering its endpoints) keeps an ordered list of rules
`{ word, at, times, match }`. **At arrival** a request takes the earliest-set rule whose `match` it fits, and only that
rule, whose `times` then drops by one (removed at zero; `"always"` stays). Its effect applies at the rule's phase.
Requests from tabs reach the endpoint in invocation order (2.3). Under R-Settle a request is never observable between
leaving the client and reaching the gate, nor between the handler's answer and the client (MDL W2), so those are not
states.

States: `Held` (in transit, unseen by the server), `Server` (the handler runs; it may sleep), `HeldAnswer` (handled;
the answer waits). Each request also has `gone` (its client cancelled, or its tab closed). Terminal phases: `answered`,
`lost`, `dropped`, `orphan` (handled, nobody to answer), `duplicate` (a second copy's answer, discarded).

| Input ↓ / State → | (arriving) | `Held` | `Server` | `HeldAnswer` |
| --- | --- | --- | --- | --- |
| its rule is none | → `Server` | — | — | — |
| its rule is `hold()` | → `Held` | — | — | — |
| its rule is `hold({ at: "response" })` | → `Server`, marked to hold | — | — | — |
| its rule is `drop()` | → `lost`; the client gets `Fake/Lost` | — | — | — |
| its rule is `drop({ at: "response" })` | → `Server`, marked to drop | — | — | — |
| its rule is `duplicate()` | → `Server`, and a copy → `Server` after it | — | — | — |
| `release()` on its target | — | → `Server`, in arrival order | no change | → `answered` (or `orphan` if `gone`), in arrival order |
| `release({ drop: true })` | — | → `lost` | no change | → `dropped`; the client gets `Fake/Lost` |
| `release({ nth: k })` | — | the k-th held item (from 1, arrival order) first, then the rest as `release()` | no change | as `Held`'s cell |
| handler answers | — | — | marked to hold: → `HeldAnswer`; marked to drop: → `dropped` (the client gets `Fake/Lost`); a copy: → `duplicate`; else → `answered`, or `orphan` if `gone` | — |
| handler fails (a crashed server) | — | — | → `answered` with the binding's failure (`Fake/Lost`, `500`, close `1011`), and an `issue` | — |
| its client cancels, or its tab closes | — | stays `Held`, `gone` | continues, `gone` | stays, `gone` |
| a tab is suspended | — | stays | continues (the server is not suspended) | stays; delivered when the tab wakes |

`release()` also removes every standing rule on its target. With no held item and no standing rule it is
`NothingHeld` (MDL W1). Every change is a `request` record. 13 rows × 4 columns: 52 cells, 23 defined, 29 "—" (a
request takes its rule once, at arrival, and a handler acts only on a request at the server).

### 3.3 A connection at a stream endpoint

States: `None` (no connection), `Opening` (an attempt held by `hold({ at: "open" })`), `Open`, `Silent` (frames held),
`Closed { code }`. A tab's transport input waits while the tab is suspended, in every state, and is delivered at wake.

| Input ↓ / State → | `None` | `Opening` | `Open` | `Silent` | `Closed` |
| --- | --- | --- | --- | --- | --- |
| an attempt, rule none | `open` runs: accepts → `Open`, greeting sent; refuses with a code → `Closed { code }`; dies → `Closed { 1011 }`, an `issue` | — | — | — | as `None` (a new connection) |
| an attempt, rule `hold({ at: "open" })` | → `Opening` | — | — | — | → `Opening` |
| an attempt, rule `drop({ at: "open" })` | refused: the binding's `lost` (close `1006`), stays `None` | — | — | — | refused, stays |
| a control sends frames | nothing (no connection) | nothing | delivered in order | queued | nothing |
| a control closes with a code | — | → `Closed { code }` | → `Closed { code }` | → `Closed { code }`, queued frames lost | — |
| `hold()` (frames) | a standing rule: the next connection opens `Silent` | the rule applies when it opens | → `Silent` | — | a standing rule, as `None` |
| `release()` | ends standing rules; `NothingHeld` if none | the open completes as "rule none" | ends standing rules | → `Open`, queued frames delivered | ends standing rules |
| `drop()` (frames) | nothing, recorded | → `Closed { 1006 }` | → `Closed { 1006 }` | → `Closed { 1006 }`, queued frames lost | nothing, recorded |
| `duplicate()` | a standing rule for the next frame | as `None` | the next frame is delivered twice | the next released frame twice | as `None` |
| a client frame (`message`) | — | — | the handler runs; may answer frames | the handler runs; answers queue | — |
| the client closes (release) or its tab closes | — | → `None` | → `None` (Effect's finalizer does not wait, 2.10) | → `None`, queued frames lost | — |

11 rows × 5 columns: 55 cells, 38 defined, 17 "—" (an attempt arrives only with no live connection; nothing closes or
sends where no connection exists).

### 3.4 The stand-in host (a fragment alone)

Placement per 2.13's table. `subject` is the Story's subject value; "same" and "other" compare with the incarnation's.

| Step ↓ / State → | `Absent` | `Active` | `Frozen` (resumable) | `Ended` (exit taken) |
| --- | --- | --- | --- | --- |
| `enter(input, { subject })` | a new incarnation | `AlreadyEntered` | same subject: thaw (parked endings, then `activities`); other: reset on return, a new life | a new incarnation |
| `leave()` | `NotEntered` | resumable: → `Frozen`; else → `Absent`, `whenAbandoned` and rule 60's release | `NotEntered` | `NotEntered` |
| `leave({ end: true })` | `NotEntered` | → `Absent`, `whenAbandoned`, release | → `Absent`: the frozen incarnation ends, `whenAbandoned` runs, its parked read endings become evidence (MDL H1) | `NotEntered` |
| `reset(subject)` (traits) | `NotEntered` | same: nothing; other: a pending reset, a new life | stores the new subject; the next `enter` resets | `NotEntered` |
| `guards(answers)` | stored | stored | stored | stored |
| `send(event)` | `Unhandled` | the fragment's turn | `Unhandled` | `Unhandled` |
| the fragment takes an exit (subroutines) | — | → `Ended`, an `exit` record | — | — |

7 rows × 4 columns: 28 cells, 25 defined, 3 "—" (only an active subroutine takes an exit).

### 3.5 Order: equal instants and settling

| Rank | Owner of a sleep | Then by |
| --- | --- | --- |
| 1 | fake servers, then `Fake.storage` | `fixtures` order, arming order |
| 2 | adapters (fibers of an operation) | tab order, actor creation, operation, key, arming |
| 3 | setup-scoped fibers (an SDK client, a rate limiter) | tab order, layer order, arming |
| 4 | the Runtime's own waits | tab order, actor creation, arming |
| 5 | actor schedules | tab order, actor creation, instance path in placement order, copy in list order, schedule key in list order, arming |

At one instant one sleep wakes, the Runtime settles, then the next. Inside a settle: tabs take turns one at a time in
tab-open order; invoked Attempts reach fakes in invocation order (tab order, then the turn that promoted them); fake
handlers run in arrival order; storage writes are FIFO per tab (3.6).

### 3.6 A write at `Fake.storage` (local)

States: `Queued` (behind an earlier write of the same tab), `Held`, `HeldConfirm` (stored; the caller's confirmation
waits). Terminal: `stored`, `aborted`, `refused`. Reads are never held unless a rule says so, and never queue behind
writes of another purpose (bootstrap restore is a read, STF6).

| Input ↓ / State → | (arriving) | `Queued` | `Held` | `HeldConfirm` |
| --- | --- | --- | --- | --- |
| an earlier write of its tab is unfinished | → `Queued` | — | — | — |
| its rule is none | → `stored` | — | — | — |
| its rule is `hold()` | → `Held` | — | — | — |
| its rule is `hold({ at: "response" })` | applied, → `HeldConfirm` | — | — | — |
| its rule is `drop()` | → `refused` (the caller sees the store's failure: `StorageRefused`) | — | — | — |
| the write ahead of it finishes | — | takes its rule now, as "arriving" | — | — |
| `release()` | — | no change | → `stored` (then the queue behind it moves) | → `stored`, confirmed |
| `release({ drop: true })` | — | no change | → `refused` | → `refused`: the caller sees a failure though the bytes were written |
| its tab closes | — | → `aborted` | → `aborted`: never applied | stays written; the confirmation is lost (MD G1's cell after `reload`) |

So a cancelled Attempt's held acknowledgement either lands before the Runtime's next capture of that lane, which is
queued behind it and removes it, or is aborted with the tab: a reload never restores an ended Attempt (MDL F1).
9 rows × 4 columns: 36 cells, 15 defined, 21 "—".

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
  .send(pay, pay)                                                                   // a second press while paying: two steps, two cuts (R-Cut)
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
  .advance({ next: { schedule: "checkTick" } })                                     // NEW: next by address — UNSURE's timer (user-defined name): retry, the same Attempt
  .expect({ state: S.DONE })
  .expect(Stripe.confirm, [                                                          // three requests, one Attempt, one charge (STF3)
    { phase: "dropped", via: { attempts: [Story.attempt(O.pay)] } },
    { phase: "dropped", via: { attempts: [Story.attempt(O.pay)] } },
    { phase: "answered", via: { attempts: [Story.attempt(O.pay)] } },
  ])
  .expect(Stripe, { charges: [{ key: Story.attempt(O.pay) }] })
```

The two walks that need a persisted identity are app Stories (`ShopSetup` persists `CheckoutRef`):

```ts
const shop = (id: string) => Story.make(ShopSetup, { id, fixtures: [StripeFake] })
  .ensure(Checkout1, { input: { intentId: "pi_1" } })                               // existing: ensure (Runtime O3); a reopened tab repeats it

export const cancelledInAckWindow = shop("checkout/cancel-before-send")
  .world(Fake.storage.write.hold({ match: { purpose: "acknowledge" } }))            // NEW: Fake.storage, match — bootstrap restore is unaffected
  .send(Checkout1, pay)
  .advance({ next: { schedule: "tookTooLong" } })                                   // PAYING's timer: cancel; never sent
  .expect(Story.records("ending", { operation: O.pay }), [{ channel: "failure", reason: { _tag: "NotSent", why: "Cancelled" } }])
  .expect(Stripe.confirm, [])                                                       // the server never heard of it

export const reloadMidCharge = shop("checkout/reload-mid-charge")
  .world(Stripe.confirm.hold())                                                     // acknowledged, sent, in transit
  .send(Checkout1, pay)
  .closeTab("main")                                                                 // existing: closeTab — abrupt; the request still travels
  .world(Stripe.confirm.release())                                                  // the server charges; the answer goes nowhere
  .openTab("main", { from: "main" })                                                // NEW: from — re-ensures Checkout1; restore: unknown { Restored } → UNSURE
  .expect(Checkout1, { state: S.UNSURE })
  .advance({ next: { schedule: "checkTick" } })                                     // retry the same id; the server's dedupe answers
  .expect(Checkout1, { state: S.DONE })
  .expect(Stripe, { charges: [{ key: Story.attempt(O.pay) }] })                     // charged once across the reload (STF12)
  .expect(Stripe.confirm, [{ phase: "orphan", via: { tab: { name: "main", open: 1 } } }, { phase: "answered", via: { tab: { name: "main", open: 2 } } }])

export const reloadAfterPaid = shop("checkout/reload-after-paid")                  // nothing held: the charge settles before the reload
  .send(Checkout1, pay)
  .reload("main")                                                                   // NEW: reload — close, reopen, re-ensure
  .expect(Checkout1, { state: S.DONE })                                             // nothing was in flight: the restored actor is paid
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
export const DocsFake = Layer.effect(DocsApi, Effect.map(Docs, (docs) => DocsApi.of({
  put: (d, { idempotencyKey }) => docs.put({ ...d, key: idempotencyKey }).pipe(Effect.catchTag("Fake/Lost", () => new NoResponse())),   // NEW: Fake/Lost
})))
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
  .expect(Docs.put, Array.from({ length: 4 }, () => ({ phase: "lost", via: { attempts: [Story.attempt(Autosave.O.save)] } })))
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
  truth: { log: Schema.Array(Message), epoch: Schema.Int, kept: Schema.Int, replay: Schema.Boolean },
  initial: { log: [], epoch: 1, kept: 10_000, replay: true },
  endpoints: {
    socket: Fake.stream({                                                           // NEW: Fake.stream
      request: { roomId: Schema.String, from: Schema.optional(Cursor) },            // the request log is the resume position the server saw
      open: (t, r) => [t, [greeting(t, r.from)]],                                   // user-defined: hello { replayedFrom? } plus the replay, or reset
    }),
    history: Fake.call({ request: { roomId: Schema.String, after: Cursor }, handle: (t, r) => [t, page(t, r.after)] }),   // user-defined: page — truncated when kept < gap
  },
  controls: {
    post: Fake.control({ text: Schema.String }, (t, { text }) => { const m = message(t, text); return [{ ...t, log: [...t.log, m] }, { socket: [frame(m)] }] }),
    greet: Fake.control({ replay: Schema.Boolean }, (t, { replay }) => ({ ...t, replay })),
    retain: Fake.control({ last: Schema.Int }, (t, { last }) => ({ ...t, kept: last })),
    resetLog: Fake.control({ epoch: Schema.Int }, (t, { epoch }) => ({ ...t, epoch, log: [] })),
    expireToken: Fake.control({}, (t) => [t, { close: { socket: 4401 } }]),
  },
})
export const ChatTransport = [Fake.webSocket(ChatServer, (url) => ({ endpoint: "socket", request: parseRoomUrl(url) })),   // NEW: Fake.webSocket (lost: close 1006)
                              Fake.fetch(ChatServer, (req) => ({ endpoint: "history", request: parsePageUrl(req.url) }))]   // NEW: Fake.fetch (lost: TypeError)
```

```ts
// chat.story.ts
const history = [ChatServer.post({ text: "hi" }), ChatServer.post({ text: "there" })]
const room = (id: string, world = history) =>
  Story.make(ChatRoomMachine, { id, input: { roomId: "r1" }, fixtures: ChatTransport, world })   // NEW: the world option — LOADING reads two messages
const backoff = { next: { operation: O.messages } }                                  // the session's reconnect delay, by address

export const dropAndReplay = room("chat/drop-and-replay")
  .world(ChatServer.socket.drop())                                                   // the network closes the socket: Feed.down
  .expect({ operations: { messages: { connection: "Connecting", drop: { _tag: "ChatDropped" } } } })
  .world(ChatServer.post({ text: "while away" }))                                    // logged; no connection carries it
  .advance(backoff)                                                                  // reconnect from the cursor; the server replays
  .expect({ operations: { messages: { connection: "Live" } }, memory: { messages: [{ text: "hi" }, { text: "there" }, { text: "while away" }] } })
  .expect(ChatServer.socket, [{ input: { from: { epoch: 1, seq: 2 } } }, { input: { from: { epoch: 1, seq: 2 } } }])   // where each connection resumed

export const pagedRepair = room("chat/failed-then-paged")
  .world(ChatServer.greet({ replay: false }), ChatServer.history.drop(), ChatServer.socket.drop())   // hello without replay; the first page is lost
  .world(ChatServer.post({ text: "a" }), ChatServer.post({ text: "b" }))
  .advance(backoff)                                                                  // reconnect, pending, the page lost: retried with the socket open
  .advance(backoff)                                                                  // the page arrives; the start settles proven
  .expect({ memory: { messages: [{}, {}, { text: "a" }, { text: "b" }] } })

export const historyGone = room("chat/retention", [...history, ...Array.from({ length: 150 }, (_, i) => ChatServer.post({ text: `m${i}` })), ChatServer.retain({ last: 100 })])
  .world(ChatServer.greet({ replay: false }), ChatServer.socket.drop())
  .advance(backoff)                                                                  // catchUp fails Feed.CannotRepair → missed Lost, then the kept 100
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
A reload mid-repair is `pagedRepair` in an app Story with `reload("main")`: `catchUp` runs again from the restored
cursor. A server log reset is `resetLog` then `drop`: `missed Reset`.

### 4.4 Kanban board with likes (uncommon; MD 2.9.6's `Board` and `LikeButton`, 2.8.2's `Issues`)

**Source.** `fetch` behind `IssuesApi` (`PUT /issues/:id/like` with the Attempt's key, `GET` the project's list).
`Issues` is a fake server whose truth is `{ issues: Record<id, Row>, applied }`, with endpoints `list`, `setLike` and
`get`, and controls `add` and `move` (written as 4.2's `Docs`).

```ts
const c7 = Issues.add({ id: "c7", projectId: "p1", likes: 3 })                     // user-defined control
const desk = (id: string) => Story.make(IssuesSetup, { id, fixtures: [IssuesFake], world: [c7] })   // NEW: world — the server holds c7 before bootstrap
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
  .openTab("b", { from: "main" })                                                    // ensures BoardP1 in b too: the same server, b's own store
  .expect(Story.entity(Issue, { id: "c7" }, { tab: "b" }), { data: { liked: true, likes: 4 }, predicted: false })
  .expect(Story.inspection({ tab: "b" }), { persistence: { status: "SecondTabNoPersistence" } })
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
  .advance({ next: { schedule: "saveProfile" } })                                   // its debounce (user-defined name) commits the save
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
  endpoints: { ask: Fake.stream({ request: { prompt: Schema.String, key: Schema.String }, open: (t, r) => [{ asked: [...t.asked, r.prompt] }, []] }) },
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
export const likeAlone = Story.make(LikeButton, { id: "like/alone", fixtures: [IssuesFake], world: [c7] })   // R includes IssuesApi (rule 57)
  .world(Issues.setLike.drop({ at: "response" }))
  .enter({ id: "c7" })                                                               // the trait's Input record
  .send(LikeButton.E.Toggle({ liked: true }))
  .expect({ operations: { set: [{ key: { id: "c7" }, uncertain: true }] } })         // its own rows (rule 59)
  .leave()                                                                           // ends (a one-copy .each, 2.13); no release on leave (F6, F9): the hold stays
  .expect(Story.inspection, { lanes: [{ key: { id: "c7" }, subject: [], binding: "unplaced", state: "Held" }] })   // no stand-in parts
  .enter({ id: "c7" })                                                               // a new life adopts it: unknown { Restored }
  .advance("3 seconds")                                                              // reconcile re-sends the same Attempt
  .expect(Issues, { issues: { c7: { likes: 4 } } })

export const bothHosts = desk("like/both-hosts")                                    // 4.4's desk: one Runtime, two hosts of one fragment
  .ensure(IssuePageC7, { input: { issueId: "c7" } })
  .world(Issues.setLike.drop({ at: "response", match: { actor: IssuePageC7 } }))   // NEW: match by address — only the page's request
  .send(BoardP1, Board.E.likes.key("c7").Toggle({ liked: true }))
  .send(IssuePageC7, IssuePage.E.like.Toggle({ liked: true }))
  .expect(Story.records("ending", { operation: LikeButton.O.set, actor: BoardP1 }), [{ channel: "success", instance: ["likes"], copy: "c7", subject: ["c7"] }])
  .expect(Story.records("ending", { operation: LikeButton.O.set, actor: IssuePageC7 }), [{ channel: "unknown", instance: ["like"], subject: [] }])
  .expect(Issues.setLike, [{ via: { attempts: [Story.attempt(LikeButton.O.set, { actor: BoardP1 })] } }, { via: { attempts: [Story.attempt(LikeButton.O.set, { actor: IssuePageC7 })] } }])

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
| STR4 | met: top-level Stories, `appId: null` (2.2) | STR40 | met: `reload`, `openTab(…, { from })`; transit survives, storage aborts (2.11) |
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
| STR15 | met: `advance({ next: address })` skips frozen; counts fake sleeps (2.4) | STR51 | met: `work` with `waitsFor` (2.7) |
| STR16 | met: `together` (2.3) | STR52 | met: rows in frames (2.14) |
| STR17 | met: `advance(d, { suspended })` (2.4) | STR53 | met: `run.steps`, each with its own cut (2.7) |
| STR18 | met: `Story.now`, schedules, work deadlines (2.4) | STR54 | met: the addressed event is compared (2.14) |
| STR19 | met: client halves and bindings replace the transport (2.5) | STR55 | met: a closed tab reads `undefined` (2.11, 2.14) |
| STR20 | met: 2.6's table; `NotSent { Disposed }` in the policy suite | STR56 | met: queued arrivals in `work` (2.14) |
| STR21 | met: truth and request log in every step cut (2.5, R-Cut) | STR57 | met: not playable, a type error; text frames; PB Q2 open (2.14) |
| STR22 | met: the server is run-scoped (2.5) | STR58 | met: presentations unchanged (2.14) |
| STR23 | met: wire words and controls, as data (2.5, 2.10) | STR59 | met: list, describe, run, explain (2.15) |
| STR24 | met: `world` settles like a send (3.1) | STR60 | met: INS O4 members, INS O5 (2.15, section 6) |
| STR25 | met: `Fake.storage`, `purpose` (2.5) | STR61 | met: cells, handlers, reasons from records (2.15) |
| STR26 | met: seeded ids; `Story.attempt`; `via` (2.5, 2.7) | STR62 | met: the records `flow check` reads (2.15) |
| STR27 | met: `HostTimeWait` at once, no grace (2.3) | STR63 | met: 2.15's list |
| STR28 | met: rows are snapshot data (2.8) | STR64 | met: Stories are data (2.15) |
| STR29 | met: `Story.inspection.lanes` (2.8) | STR65 | met: 2.16; Runtime disposal by the suite; G6's two cells untestable |
| STR30 | met: `ending` records (2.7) | STR66 | met: 2.16; `ReleaseOverdue` and late `Releasing` cells in the suite (2.10) |
| STR31 | met: `Story.entity`; queues and tombstones in inspection (2.9) | STR67 | met: the suite is Stories plus one internal step (2.16) |
| STR32 | met: one `queue` record (2.9) | STR68 | met by search; enumeration cut (2.17) |
| STR33 | met: three publications (2.9) | STR69 | met: every fault is a step (2.17) |
| STR34 | met: truth per run, store per tab (2.9) | STR70 | weighed: in reach, no new runtime (2.17) |
| STR35 | met: holds and sends (2.9, 4.4) | STR71 | weighed: in reach later; needs raw capture (2.17) |
| STR36 | met: frames from fakes; the socket's request log (2.10) | STR72 | weighed: yes, one plan, one wire vocabulary (2.17) |

### 5.2 Failure cases

| # | How | # | How |
| --- | --- | --- | --- |
| STF1 | impossible: truth is a read (2.5) | STF41 | met: lanes by identity (2.8) |
| STF2 | impossible: values, never booleans (2.7) | STF42 | met: `Held (parked)` listed with `uncertain` (2.8) |
| STF3 | impossible: `via.attempts` and `Story.attempt`; SDK-owned sends by the key in `input` (2.5) | STF43 | met: `dispose`, `ensure`, tabs (2.11) |
| STF4 | reported: by the `ending` record when asserted, else by coverage (2.6) | STF44 | met: suite Stories; an undecodable record seeded by `from` (2.16) |
| STF5 | met: hold the acknowledgement (2.5, 4.1) | STF45 | met: `unconfirmed` stated at settlement (2.9) |
| STF6 | impossible: holds match `purpose`; restore reads; 3.6 | STF46 | met: settlement frames; `checkpoint(…, { at })` (2.7) |
| STF7 | impossible: no ending step; `NothingHeld` (2.6) | STF47 | met: a property over every frame (4.4) |
| STF8 | impossible: no injection (2.6) | STF48 | impossible: one `queue` record (2.9) |
| STF9 | met: the wire answers whoever is bound (2.6) | STF49 | met: tombstones in inspection and `store` records (2.9) |
| STF10 | met: `match` by address (2.6, 4.7) | STF50 | met: shown in 4.4 |
| STF11 | met: hold plus 64 commits (4.4) | STF51 | met: 2.9, 4.4 `twoTabs` |
| STF12 | met: remote transit survives, local writes abort; each fact a step (4.1) | STF52 | met: 2.17 |
| STF13 | impossible: one server per run (2.5) | STF53 | met: `callback`, `exit` records in a host (2.13) |
| STF14 | met: client halves per tab; rule counts are run truth (2.5) | STF54 | met: `incarnations[].status` (2.13) |
| STF15 | impossible: all memory is truth (2.5) | STF55 | met: cumulative records with `since: "checkpoint"` (2.7) |
| STF16 | met: controls and wire words; a plain Layer stays a fixture without truth | STF56 | met: placement from the declaration; `leave({ end })` (2.13, 3.4) |
| STF17 | met: four standard wire words; meanings stay the author's (2.5) | STF57 | impossible: reads re-rooted; `Unhandled` after leave (2.13) |
| STF18 | met: 3.1 | STF58 | impossible: `guards` is the one way (2.13) |
| STF19 | reported: `HostTimeWait` at once, naming the owner (2.3) | STF59 | impossible: callbacks and exits are two kinds (2.7) |
| STF20 | impossible: `advance` runs turns per deadline (2.4) | STF60 | impossible: the same records alone and hosted (2.13) |
| STF21 | met: `together` (2.3) | STF61 | met: 2.2 |
| STF22 | met: 3.5, with setup-scoped fibers and invocation order | STF62 | met: each walk is steps (below) |
| STF23 | impossible: a frozen schedule has no sleep (2.4) | STF63 | impossible: every step has its own cut (R-Cut) |
| STF24 | met: reads and `advance({ next: address })` (2.4) | STF64 | impossible: one cause per frame (2.7) |
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
| STF37 | met: `Story.attempt(op, address)`; `AmbiguousAttempt` (2.7) | STF77 | met: 2.10; release-time cells in the suite |
| STF38 | impossible: `key`, `copy`, `subject` (2.7) | STF78 | met: `suspended` (4.3) |
| STF39 | met: `ending.declined`, `verdict` (2.7) | STF79 | met by search (a local minimum); enumeration cut (2.17) |
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
| **Testing O1** | "story.app(setup, …) … story.machine(machine, …)" → `Story.make(subject, options)` over an app setup, a machine, a trait or a subroutine; "Both Story kinds support send, process, advance, advanceTo, advanceToNextTimer, checkpoint and run" → 2.3's steps; "unique within its App" → "unique across the configuration"; adds the stand-in host (placement from the declaration), the `world` option, addressed targets, `reload` and `openTab(…, { from })`; properties are options, printed by name. "Scenario commands accept no arbitrary callbacks…" **kept** |
| **Testing O2** | "process() drains currently eligible work…" and "These commands make work eligible without draining it" → R-Settle; the turn limit is per instant; adds 3.5's order (with setup-scoped fibers and invocation order), `advance({ next: address })`, `together({ advance })`, `suspended`, and `HostTimeWait` at once with no grace |
| **Testing O3** | "Fixtures are Effect Layers…" kept for client halves; adds `Fake.server` (run-scoped truth, endpoints, controls, the wire words), provenance (`via.attempts`), `Fake/Lost` mapped by the binding, a crashed server as the binding's failure, `Fake.storage` with `purpose`, FIFO per tab, aborted on close, and the scope lock; "fixtures cannot inject operation outcomes directly" **kept** |
| **Testing O4** (accepted PB contract; B4) | "a frame after every command by default, or after every committed publication with frames: \"publication\"; frames: \"named\" records only checkpoints. Consecutive identical frames collapse into one" → "a frame after every committed publication; a step per command; frames never collapse"; `checkpoint.actor(ref)` → `frame.read(ref)`; `pending` → `Story.inspection.work`; `Entity.get` returns `{ data, predicted, uncertain, unconfirmed }`; records in one list with `tab: { name, open }`; adds step cuts (checkpoints and `expect` read them), `expect` and properties; step cuts and checkpoints are never truncated |
| **Testing O5** | removed (MD T1) |
| **Testing O6** | `propertyTest(story, { steps, properties, … })`; the domain form becomes a preset; faults are steps |
| **Testing O7** | adds: tabs share fake servers; remote requests in transit survive `closeTab`, local writes abort; a hydration source runs in the destination's world; `dehydrate` moves time as `advance` does |
| **Testing O8** | adds `StoryExpectationFailed`, `StoryInvalidCommand` reasons, `NoDeadline`, `HostTimeWait`, `FramesTruncated`, `AmbiguousAttempt` |
| **Testing O9** | the highlight compares the addressed event; a closed tab renders nothing with a gap; fragment-alone Stories are not playable (type error) |
| **Testing V1–V9** | V5 removed; V3 proves R-Settle and the instant order; V4 proves publication frames and steps |
| **Inspection O1** | `inspect(runtime)` adds `work` (2.7) and `incarnations`; lanes by identity with `binding`, `releasing`, parked endings |
| **Inspection O4** | event kinds gain `ending`, `lane` (with `cell`), `life`, `callback`, `exit`, `listRepair`, `drop`, `session` (with `cell`), and for Story runs `step`, `request`, `control`, `verdict`; `turn` carries mapper read-after-write keys; every event's closed schema gains the run-wide sequence beside the Runtime's and `tab: { name, open }` |
| **Inspection O5** | fake truth and request inputs leave the process as digests; `via` is identity, never redacted |
| **CommandLine O2, O5, O6** | `describe`'s contents (2.15); coverage by cells; top-level Stories in `defineConfig` |
| **Package O1** | `flow-state/testing` exports `Story`, `Fake`, `propertyTest`, `StoryFrame`, `StoryPlayer`, `definePresentation`; `story` and `model` removed; `flow-state/internal/testing` (not public) exports `disposeRuntime` for Flow's suite |
| **Diagnostics** | the error names above |
| **EntityDomains O2, O4** | `Entity.queue` removals are `queue` records; `propertyTest`'s domain preset |
| **M6 (proposal-v2)** | 2.11's control table and `.do` Story → 2.10's mapping; `checkpoint.evidence("feed")` → `session` records; `truth.fake.resumedFrom` → the socket's request log; `ReleaseOverdue` reached in the policy suite |
| **playback.md** (via TST O4, O9) | the player steps by step cut; `minDwell`'s reason ("frames from one `process()` share the same `now`") becomes "frames from one step share the same `now`" |
| **DD migration** (not edited) | `DemoServer` → a `Fake.server`; `fixtures.ts`'s `overriding` fixtures → client halves over it; every `.process()` removed; `exploreEditor` already removed (T1) |

## 7. Concepts and line counts

| Word | Tier | Mark | Why a general concept could not cover it (special cases only) |
| --- | --- | --- | --- |
| `Story.make` (with the `world` option) | common | RENAMED (`story.app`, `story.machine`); `world`: NEW | |
| `send`, `checkpoint`, `run` | common | existing | |
| `advance` (with `{ next: address }`) | common | NEW MEANING (settles); `next`: NEW | |
| `expect`, `read`, `world` | common | NEW | |
| `Fake.server` (`truth`, `endpoints`, `Fake.call`) | common | NEW | |
| `hold`, `release` | common | NEW | |
| `Story.attempt` | common | NEW | generated ids cannot be written as literals |
| `together` (with `{ advance }`) | uncommon | NEW | settling cannot express two arrivals before one admission |
| `drop`, `duplicate`, `match` | uncommon | NEW | |
| `controls` (`Fake.control`) | uncommon | NEW | server meanings are the author's (C16) |
| `Fake.storage` | uncommon | NEW | Flow is its own storage client; `purpose` names its writes; storage is local |
| `Fake.stream`, `Fake.webSocket`, `Fake.fetch` | uncommon | NEW | |
| `dispose`, `reload` | uncommon | NEW | `reload`: one step for close, reopen and re-ensure |
| `guards` | uncommon | NEW | a fragment alone has no host to answer |
| `Story.records`, `Story.inspection`, `Story.entity` | uncommon | NEW | |
| `advance(…, { suspended })` | uncommon | NEW | a backgrounded page freezes only its own timers |
| `checkpoint(…, { at })` | uncommon | NEW | a moment inside a step |
| `Story.property` | uncommon | NEW (an option) | relations a partial cannot state |
| `ensure`, `openTab` (with `from`), `closeTab`, `enter`, `leave`, `setContext`, `dehydrate`, `hydrate` | uncommon | existing; `from`, `leave({ end })`: NEW | |
| `advance({ to })`, `release({ nth })`, `reset`, `Fake.storage.from`, `propertyTest(story)` | rare | NEW / NEW MEANING | `reset`: a fragment alone has no host memory to change |

Errors: `StoryTurnLimit`, `InvalidDuration` (existing); `StoryInvalidCommand`, `NoDeadline`, `HostTimeWait`,
`StoryExpectationFailed`, `FramesTruncated`, `AmbiguousAttempt` (NEW). Record kinds (read, not written): fourteen,
each an INS O4 member. The address is a shape, not a word: its fields are the ones every record already carries.

| Case | Tier | Fake lines | Story lines (with assertions) | Words beyond common |
| --- | --- | --- | --- | --- |
| SG2 common case (2.1) | common | 10 (a `Tickets` like `Stripe`) | 6 | none |
| 4.1 checkout | common | 17 (2.5) | 55 for seven Stories | `drop`, `Fake.storage`, `match`, `openTab(…, { from })`, `reload` |
| 4.2 autosave | common | 22 | 47 for five Stories | `drop`, `dispose`, `Story.inspection` |
| 4.3 chat | common live; repair uncommon | 20 | 38 for seven Stories | `Fake.stream`, `Fake.webSocket`, `Fake.fetch`, `suspended` |
| 4.4 board | uncommon | ~20 (as `Docs`) | 45 for five Stories and a property | `Story.entity`, `Story.inspection`, `Story.property`, `openTab(…, { from })` |
| 4.5 wizard | uncommon | ~12 | 23 for three Stories | `drop`, `dispose` |
| 4.6 LLM | uncommon | 9 | 18 for two Stories | `Fake.stream`, `Fake.fetch` |
| 4.7 fragment on two hosts | uncommon | 0 (4.4's) | 19 for two Stories | `match`, `enter`, `leave` |

Against revision 1: the review's per-case wiring (re-ensuring after a reload, re-ensuring in a second tab, seeding
truth before every `ensure`, targeting a host by request order, attempts by ordinal) is one option, one step or one
address field in each case.

## 8. Open questions, in rounds

T1–T5 are decided and not asked again. New changes N1–N4 are delegated big changes, proposed here for the main
session; answer as `Q1 A`.

### Round 1: revision 2's new changes

**Q1. N1, the `world` option.** A: an option applied before the subject starts or the app bootstraps. B: a `world`
step allowed before any other step, which the executor runs first. **Recommend A**: one place, printed by `describe`;
B makes a step's position change its meaning.

**Q2. N2, the address.** A: one shape `{ actor?, instance?, copy?, operation?, schedule?, key?, tab?, life? }` for
`match`, `Story.attempt`, filters, `advance({ next })` and targets; `AmbiguousAttempt` instead of guessing. B: keep
ordinals and add fields per word. **Recommend A** (code shape of every addressed call): the fields already exist on
`via` and every record; B is RV's M1–M4 again.

**Q3. N3, `reload` and `openTab(…, { from })`.** A: both, re-ensuring with the same options; sends are never repeated.
B: `from` only. **Recommend A**: a reload is the commonest persisted-identity Story, and `reload` reads as what it is.

**Q4. N4, `together({ advance })`.** A: a time move inside `together`, firing deadlines into the mailbox without turns.
B: state the timeout-against-answer race as a limit. **Recommend A**: the race is real (PAYING's `TookTooLong`) and
the mechanism is `together`'s own.

### Round 2: R-Owner and the wire

**Q5. Storage is local.** A: `Fake.storage` writes are FIFO per tab and aborted when the tab closes (3.6). B: storage
writes travel like remote requests. **Recommend A**: B is MDL F1, a ghost restore no page can produce.

**Q6. A crashed server.** A: the binding's failure (`Fake/Lost`, `500`, close `1011`) plus an `issue`; `Defect` comes
from a malformed response. B: the handler's defect reaches the client. **Recommend A** (RV M8): no transport carries a
defect.

**Q7. Cells no transport reaches.** A: `ReleaseOverdue` and late `Releasing` cells belong to the policy suite, with its
own awaiting adapter. B: ship a `Fake` client half with an awaiting finalizer for apps. **Recommend A**: Effect's own
socket cannot produce them, so an app Story reaching them through Flow's adapter would test Flow's adapter, not the app.

**Q8. Settling without a grace.** A: one macrotask flush, then `HostTimeWait` at once. B: a configurable grace.
**Recommend A** (RV H2): any grace lets host speed choose order (C6).

### Round 3: kept from revision 1 (smaller choices)

**Q9.** Equal instants: outside before inside, with setup-scoped fibers at rank 3. **Recommend A.**
**Q10.** Story ids unique across the configuration. **Recommend A.**
**Q11.** `NotSent { Disposed }` only through the suite's internal step: decided by T2; listed for completeness.
**Q12.** Fragment Stories in playback: not playable until PB's question 2. **Recommend A.**
**Q13.** Turn limit per instant per step. **Recommend A.**
**Q14.** Names: `world`, `together`, `reload`, `from`, `Fake/Lost`, `Fake.call` / `Fake.stream`, `guards`, `work`, `via`,
`suspended`, `AmbiguousAttempt`. **Recommend** as written.

### Deferred, for `revisit.md` if the owner agrees

A `Fake.fetch` route-table helper (method and path to endpoint); a typed `match` on `via.subject`; the record and replay
recorder (STR71); an exhaustive small-scope search over the policy suite's machines; `together` with an
`{ advance }` that also runs turns (a chain inside a race), if a case needs it.
