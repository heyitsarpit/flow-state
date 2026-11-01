# Stories and Fake, amended: focused review, round 3 (final)

Advice to the main session. Everything recommended here is **proposed**. C and W rows are not reopened. Scope: the settle (rule 61), the three wire rules, and the cuts and new errors.

## Verdict

**No High remains.** "Never yields" builds on real Effect 4.0.5 and broke nothing in Effect, `TestClock`, layer acquisition or either test runner. Checkout's 3-D Secure, the batch, the `Semaphore`, `Effect.cached` and a streaming write opened in its commit all classify correctly on Bun, Node and Chromium.

There are seven Mediums. The largest is M1: the end-of-run classification still rejects some correct Stories and passes some real waits it does not state. Each of those false rejections has a workaround, and that is why it is not a High. M2 and M3 are the two ways a run can still stall with no message.

Merge 6 can follow, with one added item (section 5).

## What I ran, and what I did not

Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/r3/rv/`. Effect 4.0.5, Bun 1.4.2, Node 24.21, Chromium 149 headless shell, Vitest 5.0.5, `bun test`.

| Probe | File | Engines | Result |
| --- | --- | --- | --- |
| Drain, own Clock, gates, connections, both classifiers | `world.ts` | | My own minimum of rule 61, not Flow's code |
| 34 shapes, each with the verdict it should get | `shapes.ts` | all three | Section 1. Same on all three except a dynamic import |
| Layers, cleanup, hop cap, long `advance`, K cut, `TestClock` | `life.ts` | all three | M2, M3, M5, and section 1 |
| A host-task sentinel armed before the shapes and lifecycle probes | `shapes.ts`, `life.ts` | all three | Never fired |
| A run under a runner: timeout, fake timers, sentinel, late real result | `vt/r.test.ts` | Vitest on Node, `bun test` | M2's timeout correction; the rest pass |
| Queue's dispatcher, spinner naming, a parked fiber's readable data | `dbg.ts` | Bun, Node | L1, section 2 |
| Table counts, by script | inline | | 17.2 and 17.3 and the 17.6 write table recount correctly. The script misread the 17.6 read table, so I checked that one by eye |

**Not run:**
- Any Flow code, since the rewrite has no `Fake`.
- The executable model, which another agent has. I read `wire.ts`'s gap tags only, without running or editing it.
- Firefox and Safari.
- An uninterruptible infinite loop in cleanup, since it would hang the machine. M3 is reasoned on that point.
- The "finish" classifier in M1 is my probe's code, and the real Runtime may differ.
- Wire rules were walked by reading, not executed.
- Vitest's result for a dynamic import: my filter did not capture its line.

## 1. Medium: the settle

### M1. End-of-run classification: false rejections and unstated false passes

Rule 61 exempts a parked fiber if a held item, a deadline an operation owns, or an open connection its owner opened exists. "Its owner" brings back the attribution that RV2 H1 removed. "A deadline an operation owns" is the reverse problem: any operation's deadline excuses every parked fiber.

Same results on all three engines:

| Shape | Should be | Rule 61 as written | Finish, then look (below) |
| --- | --- | --- | --- |
| 3DS, batch, semaphore, cached: released, or ending on the hold | ok | ok | ok |
| Batch mid-window; first commit cancelled mid-window | ok | ok | ok |
| Streaming write, silent body, opened in the commit | ok | ok | ok |
| Streaming write opened by an SDK's own fiber | ok | **rejects** | ok |
| RPC over a setup socket, Story stops before the push | ok | **rejects** (stated) | ok |
| Token bucket: a setup fiber refills, commit waits (2.10.3 names rate limiters) | ok | **rejects** | ok |
| SDK's setup-scoped sender, mid-batching-window | ok | **rejects** | ok |
| Commit on an in-app latch a later event opens, Story stops | ok | **rejects** | **rejects** |
| Real wait, nothing else; with a heartbeat; with another owner's connection open | `HostTimeWait` | caught | caught |
| Real wait, unrelated hold at the end | `HostTimeWait` | **passes** (stated) | caught |
| Real wait, another operation's backoff armed | `HostTimeWait` | **passes, not stated** | caught |
| Real wait under its own `Effect.timeout` | `HostTimeWait` | **passes, not stated** | **passes** |
| Real wait, cancelled | `HostTimeWait` | passes (stated) | passes |
| `setTimeout` fire-and-forget that would send an event | see below | **passes, not stated** | **passes** |

**Failing scenario, a rejection.**

```ts
Story.machine(Sender, { id: "sender/throttled", fixtures: [RateLimiterFake] })  // user-defined: Sender, RateLimiterFake
  .send(E.Send())                                                               // user-defined: Send; commit waits for a permit
  .checkpoint("throttled")                                                      // run() rejects: HostTimeWait, though no host work exists
```

The workaround is to add the step that wakes it, here `.advance("1 second")`. The name then misleads, since nothing waited on the host.

**Failing scenario, a false pass.** A live Feed whose adapter keeps a `Stream.timeoutOrElse` deadline armed excuses every real `fetch` in that app's Stories, if the Feed's fibers carry an operation owner. Its `reason` and the test's expected values are all that is left to catch it.

**Proposed fix: finish the world, then look.** It runs only when something is parked after the last step.

> At the end of the run, after the last cut, if a commit or read fiber is parked: release every held item, close every open connection as the network would, and fire deadlines up to a fixed horizon, settling after each. A fiber still parked is `HostTimeWait`. This phase adds nothing to the evidence, and what fakes do in it is not reported.

- **Dropped:** a connection's owner, and the deadline-owner test in classification. Clock owners stay for the ranks.
- **Added:** no word. It is the mechanism the quiet phase already has.
- **It costs:** handlers run after the last cut, so "nothing reaches evidence" must hold in the executor. It is one more phase in an already long section.
- **It does not fix:** the latch, a real wait under a timeout, cancellation, fire-and-forget. State all four, and word `HostTimeWait`: "still parked at the end of the run: real host work, or something only a later step could wake".

**Smaller alternative, if the finish phase is rejected:** keep the rule, state the unstated passes, and change the message. All the false rejections then stay. I prefer the finish phase, since correctness comes first, but this is the owner's call.

### M2. `advance` has no bound, and the text on runner timeouts is wrong

The hop cap and the turn limit are per instant, and each deadline is a new instant. A settle costs K hops whatever it does:

| Run | Bun | Node | Chromium |
| --- | --- | --- | --- |
| One idle settle | 0.063 ms | 0.087 ms | 0.80 ms |
| `advance("1 day")`, 1 s ticker | 5 s | 8 s | 69 s |
| `advance("1 day")`, 1 ms ticker | 91 min | 125 min | 19 hours |

These times are extrapolated from 2,000 settles, with no turns in them.

**Failing scenario.** An SDK's `Effect.forever(Effect.sleep("1 millis"))` under a long `advance` blocks a CI worker or `StoryPlayer`'s tab with no message. A real one: `queue.story.ts` runs `advance("2 days")` over a 30-second poll, which is about 5,760 settles, or about 4.6 s in Chromium before any turn runs.

**Runner timeouts.** 2.10.1 says a test runner's timeout cannot fire. Run on Vitest and `bun test`: it fires as soon as the run ends, so a finished run over the limit fails with "Test timed out". Only a run that never ends gets no timeout.

**Fix.**
- Add a limit on deadlines fired per `advance`, proposed 100,000: `StoryTurnLimit` with `reason: "Advance"`, naming the owner that fired most. No new word.
- Reword 2.10.1: "a runner's timeout cannot interrupt a run; it reports when the run ends".

### M3. Cleanup can hang, and rule 61 says nothing of it

Run on all three: a finalizer with `Effect.sleep("100 millis")` stays parked at scope close, since nothing moves the Clock, and finishes only once time is moved. A real close under `Effect.timeout("5 seconds")` is parked too, and the timeout can never fire.

**Failing scenario.** `Layer.scoped` with a finalizer that flushes after a short sleep. `run()` never resolves. Vitest reports a bare timeout, and with nothing pending a CLI process may just exit. Reasoned, not run: an uninterruptible loop in cleanup starves the host outright.

**Fix, in 2.10.17.1.** During cleanup the Clock runs free: a settle that leaves a finalizer parked jumps to the next deadline. Cleanup may yield to the host and has its own hop cap and a real-time bound, proposed 1 second. Past either, it is a cleanup failure naming the finalizer's scope. The run has already been judged, so a real timer here cannot change the result.

### M4. A zero sleep stalls real retries unless the text says otherwise

Run: `Effect.retry({ times: 3 })` and `Schedule.recurs(3)` both go through `Clock.sleep(0)` (`Schedule.ts:413`). With a Clock built as 2.10.3 and 17.1 read, firing only "each deadline ≤ now + d" under `advance`, the first failure parks with a deadline at now. The commit tried once and reads pending, and the op-owned deadline excuses it from `HostTimeWait`. So a retry story silently tests nothing. Effect's own Clock returns `yieldNow` for `millis <= 0` (`internal/effect.ts:6325`). With that, retries finish in the settle (`n: 3`), and so does `Schedule.spaced(0)`.

**Fix, one sentence in 2.10.3:** "A sleep of zero or less is a yield, as in Effect's Clock, and is not a deadline." A `sleep(0)` loop then reaches the hop cap, as run.

### M5. Earliest-error-primary does not cover a parked fiber or a parked build

`HostTimeWait` and "a build still parked" are found at the end, but a run that stops on an earlier `StoryInvalidCommand` never reaches the end. Layer builds parked as expected in the run, with a real wait or a Clock sleep. How the executor's first send then reports is my reading of the text.

**Failing scenario.** A fixture awaits `WebAssembly.instantiate` in its Layer. The build parks, and the first `send` rejects `ActorAbsent` naming the wrong cause. Likewise, a commit parked on a real `fetch` at step 2, then `release({ nth: 2 })` at step 4, reports `NothingHeld`.

**Fix.**
- A build still parked after the start's settle with no deadline rejects there, since nothing can wake it.
- Classification runs at every rejection boundary, and "earliest" orders by the step where the fiber parked.
- Say that a fixture needing host work finishes before the Story runs, by a top-level `await` in the module, so its result reaches the Layer.

### M6. Wire rules: four cells the general rules do not decide or contradict

The three rules decide nearly everything I walked (section 3). These remain, in `release`'s corners. The model's re-run tags three of them: `N1`, `N2`, `N3`. I read those tags, so they are not independent confirmation.

| # | Conflict | Scenario | Proposed fix |
| --- | --- | --- | --- |
| a | 2.10.4: a used-up rule "is not ended, only `release` ends it". 17.2: "removed at zero" | `save.drop()` is used, then a typo'd `save.release()`: 2.10.4 passes silently, 17.2 says `NothingHeld` | A used-up rule is removed unless it still holds an item or silences a connection. Keeps the "silent no-op" reasoning 2.10.4 gives for `NoConnection`. Amends the reading in section 10 item 5 |
| b | `release({ match })` matching nothing: only 17.3's `None` cell speaks | `Docs.put.release({ match: { input: { docId: "d9" } } })`, a typo with a rule standing, is a silent no-op, and C1 has no check to catch it | `NothingHeld` on all tables when no held item matches |
| c | Rule 3 "takes the frames rules still standing", and `release({ match })` leaves the rule. By rule 3 frames re-queue; by 17.3 they are delivered. 17.3's `Closing` cell closes while a hold stands | `Chat.socket.hold()`, `Chat.hold()`, `Chat.socket.release({ match })`: delivered or kept? | The match's own target's rules do not apply to what it delivers; another target's do. A close comes only when no hold is left |
| d | `release({ nth: k })` "k-th first" vs "answers join the list first", in a mixed queue | `[HeldAnswer a, Held b]`, `nth: 2`: b cannot answer before a | "First" orders within a kind, and answers still join first. Or `nth` counts one kind only. 0 real uses of `nth` on calls |

These are table edits, and the re-run model should check them.

### M7. Merge 6's own streaming write is the false pass

Its 4.4 calls the global `fetch("/api/ask", …)` (line 1168), and 2.9 puts `Effect.timeoutOrElse(… Stalled)` in the commit. `Fake.fetch` binds `FetchHttpClient.Fetch`, so a global `fetch` has no seam, and there are no guards (section 10 item 4).

**Failing scenario.** A Story over that adapter makes a real network call and parks, excused by the stall deadline. `.advance` past it gives `unknown { Stalled }`, and a test of the stall passes without reaching any fake. This is the "own timeout" row of M1, and no form of classification sees it.

**Fix.** Merge 6's 4.4 reads `fetch` from a service (its 2.11 already says "a `fetch` service"). Add it to section 11. Whether guards should return is the owner's call: this is the case they would catch.

## 2. Does "never yields" break anything real? Debugging, and false passes

| Thing | Result |
| --- | --- |
| Effect internals | No break on the paths run. The `setTimeout`s in non-test source: the default Clock (replaced), Atom (not used by a run), and a 5-second abort timer in `HttpClient` only without `FinalizationRegistry` |
| `TestClock` | A run inside a `TestClock` test works. A fixture that provides `TestClock` itself parks, and its warning sleep lands on the run's Clock as an operation's deadline, which excuses it (L6) |
| Layer acquisition | Works; a parked build is M5 |
| Cleanup | M3 |
| Runners | Vitest and `bun test` pass, also under Vitest's default fake timers. Timeout: M2 |
| Long legitimate work | Fiber-only loop of 1.2M items: 7,614 hops. A body of 1.1M pulled chunks hits the cap at one instant (105 ms Bun, 177 ms Node, 989 ms Chromium). I would leave it |

**How an author debugs a Story that hangs:**

| Symptom | What they get today | Fix |
| --- | --- | --- |
| Effect or promise spin | `StoryTurnLimit { Settle }` in 133 ms Bun, 220 ms Node, 340 ms Chromium, naming step and instant, not the fiber | Name the owner: counting by `Fiber.getCurrent()` in `scheduleTask` named the spinner in one line (run) |
| Long `advance` | A silent block | M2 |
| Cleanup | A bare timeout, or an exit | M3 |
| A synchronous `while (true)` in a handler | Nothing, as in any JS. A debugger is the only tool | State it |
| `HostTimeWait` | Owner and "the step it parked at" | A parked fiber showed no span or public frame in my probe, so state the mechanism: the last step whose settle saw it run. `currentOpCount` between settles is a candidate, untested |

**What a false pass looks like.** A green test where a commit never reached a fake: a real wait hidden by a timeout or a hold, or host work nobody awaited, such as a `setTimeout` that never fires, so a "nothing was sent" test passes falsely. That last case leaves no parked fiber for any classifier to see.

**How to test for one, in Flow's suite (V3), no public word:**

1. **A matrix.** Each host primitive (`setTimeout`, `MessageChannel`, real `fetch`, `crypto.subtle`, a dynamic import, `WebAssembly.instantiate`) against each exemption (none, unrelated hold, heartbeat, own timeout, another operation's deadline, another connection), each with an expected verdict. `shapes.ts` is a start.
2. **An always-on sentinel.** Arm a `setTimeout(0)` and a `MessageChannel` at run start and check them before cleanup; if one fired, the executor yielded, and that is an internal error. It stayed silent across the probes, and in Vitest and `bun test` it fired just after the run. This turns "never yields" from a claim into a check.
3. **K doubling.** Run the desk's and Checkout's Stories at K and 2K and compare evidence. A difference means a chain was cut mid-step (`life.ts`: 6,000 awaits, parked after step 1, done after step 2).

## 3. The wire rules, walked

**Walked by reading against** `RESULTS.md` G1–G16 and (a)–(e), `desk.socket.fake.ts`, `presence.fake.ts`, `assistant.story.ts`, `stripe.fake.ts`, and the wire words in real Stories.

- **Decided and agreeing with the tables:** G1, G2, G3, G4, G5, G6 at endpoint level, G7, G8, G9, G12, G16, (a), (b), (c), (e). `fakes-v2.md` agrees with 2.10.4.
- **The crash and normal order** agree row for row. A copy cannot be marked, since an arrival takes one rule, so "copy first" is safe.
- **Real uses hold:**
  - `Desk.socket.drop()` and `duplicate()`.
  - `Collab.channel.hold({ at: "open" })` and `Collab.publish.hold({ at: "response" })`.
  - `Model.suggest.hold({ after: 2 })` with a truncated body: Silent, then `Closing { 1000 }`, then delivered in order.
  - `Stripe.nextAction.hold()` with a promise-bridged call.
  - `storage.write` with `purpose`.
- **Real uses of a word on a server handle: 0.** So the handle's corners below are Low.

**Open:** M6's four, L2, L3, L4.

## 4. Cuts and new errors

They compose. `StoryFakeError`, `PropertyDefect`, `Story.Step`, `result.source` and removing `signal` and `message` create no failing Story I could find beyond these:

- **Earliest primary:** M5.
- **`PropertyDefect`:** sound with shrinking. It rejects before a later `Fail`, which is right for an authoring bug. It has no entry in C75 or 3.6 (L5).
- **`StoryFakeError` under `propertyTest`:** a crash found only on a generated path has no way to reproduce it (L5).
- **`Story.Step`:** consistent with `together`, `world` and `steps`.
- **`source`:** works for the shown case; L5 for what it cannot print.
- **`signal`:** the commit's own `signal` is a different word and is untouched. Stale text remains (L5).
- **`message`:** merge 6's Stories use no client frame. Its Phoenix heartbeat note is an SDK client half, so nothing is lost.

## 5. Merge 6

It can follow per section 11, with M7 as an added item. If M1 is adopted, item 10's "an open connection its owner opened" becomes "closed in the finish phase". `Feed.reconnect`'s tagged sleeps (item 6) still rest on Clock owners, which stay.

## 6. Low

- **L1. `Queue` captures its creator's dispatcher** (`Queue.ts:488`). Run: a queue made by `Effect.runPromise` at module level never wakes its taker in a run; `runSync` or inside the run is fine. A module-level service built that way reads as `HostTimeWait`. Say: "what a run uses is built in the run."
- **L2. A handle's `release` across endpoints has no stated order**: queues, answers, requests. Proposed: connection queues in open order, then answers, then requests. 0 uses.
- **L3. `gone` at an answer's turn.** "By its turn in the answer list → `answered`" does not re-check `gone`: under `together`, a cancel admitted before the list is delivered logs `answered` for a client that left. Add "`gone` at its turn: `orphan`". Also, `release({ drop: true })` on `HeldAnswer` should say "the client, if any".
- **L4. `where` that throws** in a `send` list: evaluate every `where` before delivering, so a crash stays atomic.
- **L5. Text and evidence.**
  - `PropertyDefect` is missing from C75 and 3.6.
  - A `StoryFakeError` under `propertyTest` should carry `seed`, `run` and the unshrunk `source`.
  - `source` should say how a ref prints under "by generator index", and that a non-JSON event payload such as `DateTime` does not paste.
  - 2.10.1's reject list still says "a cancellation", and 2.10.2's closing line still points to cancellation.
  - `flow story run`: a JS SIGINT handler cannot run during a run, so do not install one for mid-run cancellation.
- **L6. A fixture providing `TestClock`** hides sleeps from the run's Clock, and its warning sleep excuses the fiber. Say to use the run's Clock.
- **L7. Engine table.** Add a dynamic import in a commit: parked on Bun (and under `bun test`), resolved in the settle on Node. Chromium's result is not meaningful, since my bundle inlined the module.

## 7. Root causes

| Root cause | Findings |
| --- | --- |
| Classification still asks who could wake a fiber, rather than waking what can be woken | M1, M7 in part |
| Limits and rules stop at "per instant" and "before cleanup" | M2, M3 |
| A run's end is treated as always reached, and the Clock's edge as obvious | M4, M5 |
| A rule's exception is written in one table and not in the general rule | M6 |
