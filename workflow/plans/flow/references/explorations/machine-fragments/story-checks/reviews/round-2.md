# Stories and Fake, amended: deep review, round 2 of 2

Advice to the main session. Everything recommended here is **proposed**. Reviewed: `stories-amended.md`, `fakes-v2.md`, against `decisions.md`, `reviews/round-1.md` (RV1), `machine-design.md`, `merge-6-streams/proposal-v2.md`, the plans, the desk and Checkout. C1-C5 and W1-W41 are not reopened; where one has a failing consequence, the fix keeps it.

## Verdict

**One High remains. The amendment is close, and the fix for the High removes machinery.**

The pump is sound. It builds on Effect 4.0.5. Effect's HTTP client and Socket both settle under it on Bun, Node and Chromium, and all five state tables recount correctly. What fails is part 2 of the settle, owner-based classification: it rejects real Stories in Checkout and the desk (H1, run).

"Never depends on host speed" can be kept, but only if the executor never yields to the host during a run. Rule 61 does not say that, and it has two consequences the text misses: its third part never fires, and `run({ signal })` and test-runner timeouts cannot act mid-run (M1).

C1's additions compose and none of them is Flow owning assertions. But `StoryFakeError` can be masked by a later error (M6), `UnusedWireRule` is invisible under the test runner (M7), and `SubjectAbsent` poisons shrinking (M5).

Merge 6 can follow per section 11, with one added item (section 9).

## What I ran, and what I did not

Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/r2/rv/`. Effect 4.0.5, Bun 1.4.2, Node 24.21, Chromium 149 headless shell.

| Probe | File | Engines | Result |
| --- | --- | --- | --- |
| Owner classification against seven real shapes | `owner.ts` | Bun, Node | Only the direct call and the first of a group pass. See H1 |
| Real `FetchHttpClient`, `filterStatusOk`, `retryTransient`, `schemaBodyJson` over a fake `Fetch` | `http.ts` | all three | Shim `Response`: finished in the settle everywhere. Real `Response`: finished on Bun and Node, **parked in Chromium**. The body arrives as `Uint8Array` (a `Buffer` on Bun and Node), as fakes-v2 says |
| Streamed body over real `HttpClientResponse.stream` | `http.ts` | all three | 10, 500, 2,000 chunks finish. **20,000 chunks stop at exactly 4,096 reads, with scheduler activity 0**, on all three (M2) |
| Real `Socket.makeWebSocket`, `toStream`, over a `WebSocketLike` | `socket.ts` | all three | Opens, delivers, close 1006 and close 1000 are both `SocketCloseError` (1000 keeps the frame before it), interrupt closes with 1000 without waiting, a never-open socket stays parked. Agrees with fakes-v2 |
| `Effect.forever(Effect.void)` under the pump | `spin.ts` | Bun, Node | Activity on every hop; I capped it at 200,000. A `setTimeout(0)` never fired (M1) |
| Hop cost per shape | `engines.ts` | all three | Identical on all three for every promise shape: `await` 1, thenable 2, `async` returning a promise 3, `for await` 2. So K's boundary is stable across engines. Engine splits are in M3 |
| Cost and body reads | `misc.ts` | all three | One settle at K 4096: 0.06 ms Bun, 0.08 ms Node, 0.72 ms Chromium, so cost is not a concern. A plain `Response.body` reader finishes in Chromium, so a shim's `.stream` is fine |
| `Frames` subclass, custom iterator, Vitest 5.0.5 | `vt/f.test.ts` | Node | `for of`, spread, `Array.from` throw. `every`, `map`, `filter`, `some`, `forEach`, `toEqual`, `toMatchObject` do **not** (L5) |
| `tsc`, repo flags, mocks only | `ts/spike.ts` | | Data forms pass in context; a helper with no annotation fails, and no `Story.Step` type exists (M10). A named cut assigns to `Frame<S>` in this mock, with the same caveat as the proposal |
| Table cell counts, by script | inline | | Call 52/23, stream 96/73, stand-in 28/25, storage 40/16, read 12/6: all correct. Word count 34 + 42 + 18 = 94: correct |
| Real usage counts, by grep over the desk and Checkout | inline | | Section 8 |

**Not run:** any Flow code (the rewrite has no `Fake`); the executable model (another agent has it); Firefox, Safari. Owner classification was exercised with my own `Context.Reference` and `Deferred` gate, which follows rule 61's description, not Flow's code. The fix in H1 is reasoned against the same seven shapes, and is not implemented. Section 7's rewrites are by hand.

## 1. High

### H1. Owner-based classification rejects real Stories

**The text.** Rule 61, 2.10.2 part 2: "a commit or read fiber with no gate or clock wait under its owner is `HostTimeWait`." An owner reaches a fiber by inheritance. Nothing carries it across a promise, a queue, a shared lock or a batch.

**Run (`owner.ts`).** The gate records the owner of the fiber that reaches it.

| Shape | Real code | Who waits at the gate | Verdict |
| --- | --- | --- | --- |
| Client half called in the commit's fiber | `stripe.fake.ts`, `StripeFake` confirm | the commit | ok |
| A promise from a fiber run with the layer's context | `checkout/adapters/stripe.ts` `handleNextAction`, `StripeJsOverFake`, under `Stripe.nextAction.hold()`: **Checkout's 3-D Secure** | `setup` | **false `HostTimeWait`** |
| `FiberSet.runtimePromise` at layer build | `presence.contracts.ts` publish, `presence.fake.ts`, under a hold on `Collab.publish` | `setup` | **false `HostTimeWait`** |
| `RequestResolver` batch below the commit | `queue.story.ts` `bulkAssigned`, `roster-api.ts` invites | the first commit only (`runForkWith(fiber.context)`, `internal/request.ts`) | second commit: **false `HostTimeWait`** |
| An SDK's own setup-scoped sender | what 2.10.4's Provenance names: "a send an SDK's own fiber makes" | `setup` | **false `HostTimeWait`** |
| A shared `Semaphore` (a rate limiter) | RV1's and 2.10.3's example of a setup service | the first holder | second: **false `HostTimeWait`** |
| `Effect.cached` token refresh | a common adapter shape | whoever filled it | **false `HostTimeWait`** |

**Scenario.** `bulkAssigned`: `.send(toggle("T-43"), toggle("T-42"))`. After the second send's settle, commit 2 waits on its request entry. The batch fiber's sleep is under commit 1. `run()` rejects, and the Story cannot be written. Checkout's whole 3-D Secure group is the same, whenever the challenge is held, and that hold is how `stripe.fake.ts` models a customer on the bank's page.

One more shape, not probed: a streaming **write** whose body is open and silent. Rule 61 says "an operation's fiber, always", and 2.10.2 exempts only session and setup fibers. Under `Fake.fetch` the commit parks in `reader.read()`, which no gate records. So `assistant.story.ts midStream` over the real adapter also rejects.

**Root cause.** It tries to prove a negative per fiber, at each settle, by attribution that Effect does not propagate. A patch per shape would be case-by-case. Since no host task runs during a run (M1), a host-waiting fiber cannot progress, so nothing is lost by asking once, at the end.

**Fix, keeping W2 and W4.** Classify at the end of the run, from the world, not per fiber at each settle.

> **Rule 61, part 2, proposed.** At the end of the run, before cleanup, a commit or read fiber that is still parked is `HostTimeWait`, naming its owner and the step it parked at, unless the run still holds something that could wake it: a held item, a deadline an operation owns, or an open connection its owner opened. The run finishes, then rejects. A session or setup-scoped fiber may wait.

Walked against the seven shapes and the real wait:

| Case | Result |
| --- | --- |
| 3-D Secure, presence, batch, SDK fiber, semaphore, cached, with a hold released later | They resumed, so nothing is parked at the end: ok |
| The same, with the Story ending on the hold | A held item exists: ok |
| `bulkAssigned` mid-window | The batch fiber's sleep is forked with the commit's context, so an operation owns it: ok |
| A real `fetch` in a commit, nothing held | Still parked at the end: **`HostTimeWait`** naming the step, also with a heartbeat running, since setup sleeps do not count |
| `crypto.subtle` on Bun and Node, or a real `Response` in Chromium | Still parked: `HostTimeWait` |
| A generated run | The quiet phase ends every hold, so every real wait is caught there. Stricter than today |

**What it gives up, stated.**

- A real host wait in a Story that ends with an unrelated hold is not reported. Its lane reads pending, which the test sees.
- A commit awaiting a push (RPC over a socket, the reply not sent by the end) is a false positive only if the Story stops there, and only if no connection under its owner is open.
- A cancelled fiber's real wait is not reported.

**Added:** nothing. **Dropped:** owner recording on gates. Clock owners stay, since 2.10.17.5's ranks need them. "Late wakes" go too (M1).

Update rule 61, 2.10.2, 2.10.17.1's closing paragraph, C70 and 2.10.14's `HostTimeWait` text. Evidence for the failing step is what `StoryFakeError` already has (M6).

## 2. Medium

### M1. "No host task" must cover the whole run, and then part 3 and `signal` cannot act

Rule 61 promises no host task **during a settle**. Between settles, it is silent.

- **If the executor yields between steps,** a real promise can resolve between steps 3 and 7 or after the end, depending on the machine. Part 3 then rejects or not by host speed, and the promise is broken.
- **If it never yields,** the promise holds, and no late wake can arrive during a run. The Chromium probe saw them only because it waited 300 ms with `setTimeout`. Part 3 is then dead text.
- `Testing.plan` O8's cancellation and `run({ signal })` (0 real uses) cannot be observed mid-run, since `abort()` needs a host task to call it. A Vitest timeout cannot fire either.
- **A hang.** `spin.ts`: `Effect.forever(Effect.void)` shows activity on every hop, so the settle never ends and no timer fires. Rule 61 has no bound; `StoryTurnLimit` counts turns. 2.10.2's "a fake that always answers with another page loops at one instant and is stopped here" is false for a loop below the commit (`Stream.paginate` in an adapter), which takes no turns. A CI worker hangs with no message.

**Fix.** State: **a run never yields to the host between its first step and its cleanup.** Drop part 3. `signal` is read before the first step and between `propertyTest` runs, or cut it (section 8). Add a hop cap per instant, rejecting as `StoryTurnLimit` with `reason: "Settle"`, so no new word. Rule 61's limit becomes simpler: a session or setup fiber waiting on the host is never seen.

### M2. "Scheduler activity" barely measures progress

Promise resumes call `fiber.evaluate` directly, so a fiber working through promises shows **no activity**. Run: a 20,000-chunk `res.stream` stops at exactly 4,096 reads with activity 0. The cut then falls mid-body for a reason that has nothing to do with the app, and the remaining chunks run during the next step. A session fiber "may wait", so nothing is reported. A `for await` over about 2,100 items does the same to a commit.

Hop cost is the same on all three engines, so this is deterministic, but an author sees only a wrong count or `HostTimeWait`.

**Fix.** Reset the idle count on any arrival at something of Flow's (a mailbox, a gate, the Clock, a connection's or body's pull), not only on scheduler tasks. Say in the `HostTimeWait` text that it can mean "a chain longer than K", and say K. Keep K fixed.

### M3. Engines differ, and the player is on a different engine from the tests

The proposal states the crypto split. There are three splits, and the author's experience is the concern:

| Work, inside a settle | Bun | Node | Chromium |
| --- | --- | --- | --- |
| `Response` or `Request` `.json`, `.text`, `.arrayBuffer`, `Blob.text` | yes | yes | **no** |
| `crypto.subtle.digest` | **no** | **no** | yes |
| `process.nextTick` | yes | **no** (not previously run) | n/a |

**What an author sees.** A client half returning `new Response(...)` passes under Vitest on Node, then rejects in `StoryPlayer` (2.10.13 records in the browser) with `HostTimeWait`. An SDK using `nextTick` passes on Bun and rejects on Node, and `flow story run` and the tests can run on different engines.

So "never depends on host speed" is a promise that can be kept with M1, for one engine and version. "Same result everywhere" is not, and the proposal already says so.

**Fix.** Put this table in 2.10.2. Say a Story is checked on the engine its tests run on, and playback may reject what tests accept. Export nothing new. **Optional, owner's call:** guards on `fetch`, `WebSocket` and `crypto.subtle` for the length of a run, which is safe because a run never yields; these would give one answer on all engines and name the call. I would not add this now.

### M4. Quiet still rejects correct apps (RV1 H2, part open)

2.10.16: "no work at or before the horizon except recurring schedules". But `work` lists "an open session" (2.10.6), and a setup-scoped or adapter sleep that re-arms (an SDK heartbeat) is not a schedule, so it is always at or before the horizon. So read literally, the desk's `desk converges`, whose base opens the queue's feed, is `Inconclusive`, and `propertyTest` rejects. Separately, "ends every standing rule" misses an item held by a rule that is used up (`hold({ times: 1 })`): the rule is gone, the item stays, and "no held item" is never true.

**Fix, one sentence each.** Quiet is: no lane `InFlight`, no held item, no queued arrival, and no deadline at or before the horizon that an operation owns. Open sessions, actor schedules that recur and setup-scoped sleeps do not count. The quiet phase releases every target with a standing rule **or a held item**. EntityDomains O4 takes the same line.

### M5. Thrown reads in a property: false violations, and shrinking slips

2.10.16: "A function that throws counts as a violation". `frame.memory` throws `SubjectAbsent` on any frame where the subject is absent: after a generated `dispose`, or before `enter` in a fragment's run.

**Scenario.** A real violation of `(frame) => { expect(frame.memory.total).toBeGreaterThan(0) }` starts shrinking. "Retained only if the same property fails." A candidate that drops the `enter` and `leave` pair now throws `SubjectAbsent` on the first frame: the same property fails. The shrinker keeps it and returns an empty Story, losing the real failure. `AmbiguousRead` does the same.

Also: `HostTimeWait` and `StoryTurnLimit` are "real Story errors" (2.10.1) but also Testing O6's `Inconclusive` reasons ("turn exhaustion, pending external work"), and 2.10.16 does not map them. A truncated run's `Fail` stops the search, though it is no counterexample, so it can hide a real `Fail` later.

**Fix.** Flow's read errors thrown in a property are not violations: the run reports `reason: "PropertyDefect"` and rejects as a `FlowError` naming the property. Shrinking keeps a candidate only if the violation is not one of these. Map: `StoryTurnLimit` and `HostTimeWait` under generation are `Inconclusive`. Truncation is recorded and the search continues, and a later `Fail` wins.

### M6. `StoryFakeError` can be masked

"`run()` finishes the run, then rejects." A run often cannot finish.

**Scenario.** A route typo makes `POST /confirm` `NoRoute`, a 404. The Story then writes `.world(Stripe.confirm.release())`. Nothing is held, so **`NothingHeld` rejects at that step**. The author is told about a `release`, and the real cause is one step back. `HostTimeWait` at the end of a run (H1) can be masked the same way. Testing O8 makes "execution failure primary", which does not say which of two.

**Fix.** The earliest recorded error is primary, and later ones are listed. `StoryFakeError` is recorded when it happens. This is the only change needed.

**A cut to consider.** Stop at the end of the step where a fake broke. Evidence up to there is what a reader needs, and the five-case crash table in 2.10.17.2 and the crashed-`open` branch then serve no test, since no resolved run can reach them. I lean to keeping "finishes", since its table is written, but the stop is simpler.

**Does C1 compose?** Yes. None of these judges a product value, with one edge to state: `InvalidInput` from an app that sends a structurally wrong payload does reject on a value. That is a contract check by the fake's author. Say so, and say that a Story of the server refusing bad input declares a loose `request` and answers 422. Checkout's 422s pass structurally.

### M7. `UnusedWireRule` is invisible where it matters (RV1 M17, part open)

It prints under `flow story run` and is a record. The four real Stories RV1 found (`uploaded`, `lostThenResent`, `removedWhileUploading`, `midStream`) run through `vitest`, where nobody looks: they still pass silently, which is what the finding was about. A new one, by the same mechanism: `queue/toggled` holds `assignBatch`, sends, and releases with no `.advance("10 millis")`, so the batched request is never sent and `assigned` reads pending (grounds: `ticket-api.ts` 149).

**Fix, keeping C1 and C4.** `run()` writes each diagnostic through `console.warn` at its end. It is not an assertion and fails nothing. Define "fired": a call or attempt took it, or it applied to an open connection, so a `hold()` on a silent socket counts.

### M8. Handle and endpoint disagree inside a connection (RV1 H5, part open)

- 2.10.17.2: "A held item belongs to the rule that held it"; "a handle's `release` does not end an endpoint's rules, nor the reverse". 2.10.17.3's `release()` row says `Silent` → `Open`, with no owner. **Scenario:** `Chat.hold()`, then `Chat.socket.release()`. By the first it is `NothingHeld`; by the row the connection opens. And `Chat.socket.hold()` then `Chat.release()`, the mirror.
- `Chat.drop()` with an open connection and default `times`: closes it, and then? "On a handle it stands for the next call" sits under "no connection". Two readings: the next `post` is lost or not.
- `times` on a plain `hold` of a stream or a handle: `Chat.hold({ times: 1 })` silences connections with no arrival to consume it. Standing forever or removed?

**Fix, proposed.** A frames hold belongs to its rule as a call hold does: state "a connection is silent while any rule of its own or its handle's holds it; `release` on one target ends only that target's". `Chat.drop()` always closes, and stands for the next arrival only when no connection matched. `times` on a stream or handle `hold` counts arrivals; frames silence ends with the rule. Add the three rows and have the model check them.

### M9. Two requests in flight, one answered: unwritable

`release` takes no `match` (2.10.4), and the same section says "Every word takes `match: address`", a contradiction in the text. Section 10 item 7 accepts this and says to use separate targets. There are none for two copies on one endpoint, nor for two `purpose`s on `Fake.storage.write`.

**Scenario.** Two Autosave copies, d1 and d2, both saving; check both pending; answer d1; check d2 still saving. `hold({ match })` on only one gets the other answered before the checkpoint. `release({ nth: 1 })` delivers the rest in the same step. An important state of a keyed lane has no Story. 0 real uses of `match` other than `purpose`, so this is not blocking.

**Fix, keeping W21.** `release({ match })`, no new word:

```ts
.world(Docs.put.hold())                                    // existing: hold
.send(edit("d1", "A"), edit("d2", "B"))                    // user-defined: edit
.advance("800 millis")
.checkpoint("bothSaving")                                  // existing: checkpoint
.world(Docs.put.release({ match: { input: { docId: "d1" } } }))  // CHANGED: match on release; existing: match, input
.checkpoint("oneSaved")
```

It delivers the matching held items and leaves the rest held. The standing rule stays until a `release()` with no `match`. If this is not wanted, fix the sentence at 2.10.4's "Every word takes".

### M10. Data forms admit what `together` does not define (RV1 H3, part open)

- 2.10.2's `together` defines three kinds of input: a send, a control, `{ advance }`. 2.10.1 says "`together` and `propertyTest`'s `steps` take these", meaning every form. `together({ closeTab: "b" }, Stripe.confirm.release())` type-checks and has no meaning, nor does a nested `{ together }`.
- `advance(d, { suspended })` has no form, and neither do `reset`, `guards`, `setContext`, `dehydrate`, `hydrate`, though "every step" does. `{ advance: d }` and `{ send: [...] }` differ in shape.
- Run (`spike.ts`): a helper `const races = [{ send: [payRef, pay] }]` fails to assign, since a literal widens to an array. `Story.World` exists for `world`, nothing for a step.

**Fix.** `together` takes a send, a control or `{ advance }`, and anything else is a type error; a real lifecycle race can be defined later. List every step's form in 2.10.1, including `{ advance: [d, { suspended: "b" }] }`. Replace `Story.World` with **`Story.Step`** (RENAMED, same count), `world` being `ReadonlyArray<Story.Step>` narrowed by the option.

### M11. `via.attempts` for a batch has no mechanism

Provenance: "`attempts` is a list, since a batched request carries several". Run: the gate in the batch fiber sees the first commit's context only. Nothing in `RequestResolver` hands the others to the gate. So `via.attempts` is `[first]`, and "requests whose `via.attempts` hold the same Attempt" misreads a batch.

**Fix.** State that a batched request carries the Attempt of the fiber that formed it, and that a test reads each item's idempotency key in `input`, as the text already says of an SDK's own fiber. Otherwise it needs a Flow-owned resolver, which is a new capability.

### M12. `result.source` cannot be written as shown

2.10.16's pasted Story names `PayMachine`, `signedIn`, `StripeFake`, `CART_1`. At run time these are values: a Layer has no name, a ref's variable has no name, and `Fake.server("Stripe")`'s name need not match its variable. The H10 regression path depends on this string.

**Fix.** `source` is the appended steps only, chained from the base: `base.world(Stripe.confirm.drop({ at: "response" })).send({ _tag: "PayPressed" })`. Its options come from the author's own `base`. Controls print by server name and endpoint (document that the variable must match), events as literals (bare events are allowed), refs by the identity the author passed to `steps`, by generator index. Add a line to 2.10.16.

## 3. Low

- **L1. Rule 64's cut omits storage.** RV1 M6 was half closed: `read(Fake.storage)` has a row, "every frame has the same reads", but 2.10.6's cut is `seq`, `truth`, `wire`. Add `storage` to a cut; a frame's type omits this read, as it narrows `inspection`.
- **L2. "Effect's `TestClock`"** (2.10.3). It cannot rank owners or skip one tab's sleeps, and its sleeps carry no owner (`testing/TestClock.ts`). The executor provides its own `Clock`; say that, and drop the warning-delay note.
- **L3. A start has no row** in 2.10.17.1, though `.checkpoint("quiet")` relies on it, and a fixture Layer awaiting a real promise at start or at `reload` is unspecified. Add: acquisition settles as a step; under H1, a build still parked at the end rejects.
- **L4. `drop()` on `Opening`** is `Closed { 1006 }` while `release({ drop: true })` there is lost → `None`. Same physical event, two logs. Use the second.
- **L5. `FramesTruncated`.** `run.frames.every(…)` and `.map` finish quietly (run). "A loop cannot finish quietly" holds only for `for of`. Say so, or override them. Truncation at 10,000 frames is rare, so I would say so.
- **L6. `serverView`** has no row in the reads table, though 2.10.11 keeps it.
- **L7. `Fake.storage.from` and the clock.** A restored `dueAt` meets a new run starting at the fixed epoch, so "reopened after a week" reads as not overdue. Say the new run starts at the source's final `now`, or that a time gap needs one run with `closeTab`, `advance`, `openTab`.
- **L8. `openTab(…, { from: "b" })`** where b's refs came from an earlier `from`: "this Story's steps ensured" should say these count.
- **L9. A byte body.** "An object body becomes JSON": a `Uint8Array` download becomes garbage. Pass `Uint8Array` and `ArrayBuffer` through, as `formData` and `blob` on the shim need a line.
- **L10. The W17 recipe covers a service client half only.** An app using `HttpClient` has no seam: with `response` as an Effect gone, it writes its own `FetchHttpClient.Fetch` Layer, and the shim is not exported, so a real `Response` means Chromium's `HostTimeWait`. 0 real uses. Add it to `revisit.md` as `Fake.response(body, init)`; it can wait.
- **L11. Change list misses `FlowState.plan`** lines 19, 45, 93 ("models", "`@plan.Testing.V2 to V5`"), since C77 removes V5.
- **L12. "The pump".** Merge 6's 3.2 is "Delivery (the pump)". Two different pumps; call this one the settle's drain.
- **L13. `attempt` with a tab.** An Attempt minted in `main` and restored in b reads `undefined` under `{ tab: "b" }`, but `bRestored.attempt(O.save, { actor })` works with main closed. State that `attempt` reads mints, wherever they were restored.

## 4. Round 1, closure

| RV1 | Closed? |
| --- | --- |
| H1 | Pump yes. Classification no: **H1 here**. Late wakes: M1 |
| H2 | Text yes; quiet definition M4 |
| H3 | Yes for sends and lifecycle; M10 |
| H4 | Yes; M6 |
| H5 | Mostly; M8, M9 |
| M1, M2 | Yes. The crash table, FIFO order and rank table agree, walked |
| M3, M4, M5 | Yes; M5 here is a property consequence of M4 |
| M6 | Part; L1 |
| M7 | Text yes; a real-type check is still owed |
| M8, M9, M10, M11, M12, M13, M15, M16 | Yes. Chat example walked: seed, `after: 2`, drop, `from: 2` all hold |
| M14 | Part; L5 |
| M17 | Part; M7 here |
| L1-L12 | Yes |

## 5. The new combination rules, walked

Every cell of 2.10.17.2, 2.10.17.3 and 2.10.17.6, against arrival, handle and frames rules.

**Sound:** one rule per arrival; earliest-set with `times`; `Docs.drop({ times: "always" })` as offline, with `lost` on every call and attempt (2.10.18.3's test holds); `hold({ after })` with `end: true`, which reaches `Closing { 1000 }`; `Closing` against `drop`, `release`, `release({ drop })`, `nth`; a client close from each state; suspension; storage `HeldConfirm` on tab close; 2.10.5's restore cells. `hold()`, `drop()`, `release()` on one target ends the `drop` too, which is by the text and shows as `UnusedWireRule`.

**Open:** M8's three, M9, L4. Also a `Closing` connection then `drop`: the log's `closed` code goes from 4401 to 1006. A later read differs, an earlier read keeps its value, which is right.

**Data form in `propertyTest`:** sound with M10. Pairs, skips and the emitted Story hold. `result.source` is M12.

## 6. Removing `latency` and `response` as an Effect

Nothing real broke. 0 uses before and after.

- `hold`, `advance`, `release` covers every case in 2.10.2's `together` examples and Testing O6's delay.
- Rank 1's removal is clean. `together({ advance })`'s woken backoff answers at once, as it says.
- A server's own periodic push (a heartbeat frame) has no clock now; it is a loop at construction, which the design already says of flapping.
- The W17 recipe type-checks and works for a service client half. `server.gate` under `hold`, `drop` behaves as stated, and H1's fix does not touch it. Its limits are honest. The hole is L10.

## 7. Integration

**Endings, 2.10.5.** Every row is reachable as written, walked with the new result shape. `unknown { Interrupted }` still needs a client half. `Defect` still needs an adapter that throws. No row depended on the removed words. Under the current rule 61, `Stripe.nextAction`-based endings reject (H1).

**Write lanes, 2.7.13.** 2.10.15's table holds. `lane` over Inspection's listing is right for parked lanes.

**Entities, 2.8.** Sound. See below.

**Fragments, rules 48-60.** Sound; `lane(address)` reads a fragment's read, and rule 50 holds.

**Persistence.** Sound; L1, L7, L8.

**SSR.** Sound; L6. The source's fixtures and destination's server hold through the registry.

**Inspection, `flow check`, coverage.** No loss; "reached, not checked" is right.

**Playback.** M3 is the issue: recording runs on a different engine. A run that rejects has partial evidence, which the player can show.

**Accepted plans.** `Testing.plan` amendments are as listed, plus L11. O8's cancellation needs M1's sentence, which section 4 lacks.

### Real Stories, by hand

**An entity domain with optimistic writes (`queue.story.ts toggled`).** Reads well. It needs the resolver's window, so the plan is wrong today (M7).

```ts
export const toggledStory = queue("queue/toggled", [Desk.assignBatch.hold({ at: "response" })])  // user-defined: queue; existing: hold, at
  .send(toggle("T-43"))                                       // user-defined: toggle
  .advance("10 millis")                                       // ADDED by me: the resolver's window; missing in the real Story
  .checkpoint("assigning")
  .send(toggle("T-43", null), toggle("T-43"))
  .checkpoint("toggled")
  .world(Desk.assignBatch.release())
  .advance("10 millis")                                       // the queued one's window
  .checkpoint("assigned")

test("assign, release, assign", async () => {
  const { assigning, toggled, assigned } = (await toggledStory.run()).checkpoints
  const t43 = { workspaceId: "north", ticketId: "T-43" }
  expect(assigning.entity(Ticket, t43)).toMatchObject({ data: { assignee: "dispatcher-7" }, predicted: true })  // existing: entity [W24]
  expect(toggled.records("queue", { reason: "Superseded" })).toHaveLength(1)                                    // existing: records [C3]
  expect(assigned.entity(Ticket, t43)).toMatchObject({ predicted: false, uncertain: false })
  expect(assigned.read(Desk.assignBatch)).toHaveLength(2)                                                       // two requests, never the release
})
```

Rejects today under H1 only for `bulkAssigned`, the two-commit form.

**SSR with hydration (`queue.ssr.story.ts`).** Converts directly and reads well. The render test keeps `(await queuePage.run()).payloads.page`.

```ts
export const queueHydrated = Story.app(DeskSetup, { id: "queue/ssr-browser", fixtures: [DeskClient] })  // RENAMED: Story.app [W1]
  .hydrate(queuePage, "page")                                 // existing: hydrate; a leading step
  .checkpoint("active")
  .advance("1 second")
  .checkpoint("stillFresh")                                   // RENAMED: camelCase [C5]

test("a fresh payload is not read again", async () => {
  const { active, stillFresh } = (await queueHydrated.run()).checkpoints
  const serverOnly = [{ via: { tab: { name: "server" } }, phase: "answered" }]
  expect(active.read(North)?.state).toBe(Queue.S.HEALTHY)     // existing: read [W23]
  expect(active.read(Desk.list)).toMatchObject(serverOnly)
  expect(stillFresh.read(Desk.list)).toMatchObject(serverOnly)
})
```

**A resumable trait (`panels.story.ts frozenAndThawed`).** Reads well. A fragment's read, by address, is a long line, and that is correct: it has no outside handle.

```ts
export const frozenAndThawed = panels("panels/frozen-and-thawed", [Desk.history.hold({ at: "response" })])  // user-defined: panels
  .send(E.history.LoadEarlier())
  .send(E.OpenTab({ tab: "parts" }))
  .checkpoint("frozen")
  .world(Desk.history.release())                              // goes nowhere: the lookup ended at the freeze
  .send(E.OpenTab({ tab: "history" }))
  .checkpoint("thawed")

test("a read cut by a freeze, delivered at thaw", async () => {
  const { frozen, thawed } = (await frozenAndThawed.run()).checkpoints
  expect(frozen.inspection.incarnations).toContainEqual(expect.objectContaining({ instance: ["history"], status: "frozen" }))  // existing: inspection [W24]
  expect(frozen.read(Desk.history).at(-1)?.phase).toBe("held")
  expect(thawed.records("ending", { instance: ["history"], since: "frozen" })).toMatchObject([{ reason: { _tag: "Interrupted" } }])  // existing: since
  expect(thawed.lane({ instance: ["history"], operation: "entries" })).toBeDefined()   // NEW form: lane(address); user-defined: entries
})
```

**A multi-tab persistence restore (written fresh).** Works, and shows how much the tab-less default matters.

```ts
const inB = { actor: Editor42, tab: "b" }                     // user-defined
export const scopeMoves = desk("editor/scope-moves-to-b", [Desk.saveTitle.hold()])  // user-defined: desk
  .openTab("b", { from: "main" })                             // existing: b runs without persistence
  .send(Editor42, E.TitleChanged({ title: "New" }), E.SaveRequested())
  .closeTab("main")                                           // existing: releases the scope; the request keeps travelling
  .reload("b")                                                // existing [W26]: b now takes the scope and restores
  .checkpoint("restored")
  .world(Desk.saveTitle.release())                            // the first answer goes nowhere
  .advance("3 seconds")                                       // re-send of the same Attempt
  .checkpoint("resent")

test("the scope moves, and the save is re-sent", async () => {
  const { restored, resent } = (await scopeMoves.run()).checkpoints
  expect(restored.tabs.b?.inspection.persistence.status).toBe("Active")   // user-defined value; existing: tabs [Testing O7]
  expect(restored.read(inB)?.state).toBe(S.OPEN.UNSURE)
  expect(restored.read(Editor42)).toBeUndefined()             // main is closed: the tab-less read is honest but easy to misuse
  const id = resent.attempt(O.save, { actor: Editor42 })      // L13: minted in main
  expect(resent.read(Desk.saveTitle)).toMatchObject([{ phase: "orphan", via: { attempts: [id] } }, { phase: "answered", via: { attempts: [id], tab: { name: "b", open: 2 } } }])
})
```

**What reads badly:** only `lane` by address and `attempt` across tabs (L13). **What cannot be written:** only M9's shape, and the batched Stories and 3-D Secure until H1.

## 8. The surface: what could go

The count is honest. 34 is what a common test meets, and most of the rest is the accepted plan's. Real uses across the desk and Checkout:

| Word | Real uses | Recommend |
| --- | --- | --- |
| `settled`, `turn`, `step` in `checkpoint(…, { at })` | 0 `checkpoint({ at })`; a `run.frames` loop reaches the moment | **Cut, 3 words**. Not decided by any W row; decisions lists it only as proposed. Also removes on-demand capture for named frames. Cost: a presentation scene cannot name 2.8.1's moment |
| `message` on `Fake.stream` | 0 | **Cut, 1 word**, and a row in 2.10.17.3. Back with the first duplex fake |
| `signal` | 0, and cannot act mid-run (M1) | **Cut, 1 word**, or keep as M1 says. Amends O8 |
| `Fake.storage.seed` | 2, with an invented record shape | Keep until the desk converts; RV1 L6's limit stands |
| `match: { input }` | 0 | Keep, since M9 needs it |
| `quietWithin` | 0 | Keep: accepted plan |
| `Story.World` | 0 | Becomes `Story.Step` (M10), no change in count |
| `release({ drop })`, `together({ advance })` | 0 | Decided W21, W10. Not reopening |

**Net: 94 → 89.** I would not cut further: `after`, `nth`, `suspended`, `next`, `purpose`, `since`, `n` each have real uses, and `whenQuiet` has a real need.

## 9. Merge 6

It can follow per section 11. Checked its 2.9, 2.11, 3.2, 4.1 and 6.1. One item to add:

- **10. A streaming write's commit fiber** waits on an open body with nothing sent (its 2.9, 4.4). H1's fix handles this through "an open connection its owner opened". Under the current rule 61 it rejects unless the commit has a stall timeout, whose sleep is a clock wait under its owner.

Also L12's naming, and M2's "a connection's pull counts as activity", since a flood past `bufferSize` under `Fake.fetch` otherwise cuts at K.

## 10. Root causes

| Root cause | Findings |
| --- | --- |
| **R1. Rule 61 attributes per fiber and per settle what is only knowable for the run as a whole** | H1, M1, M2, M11, and what remains of RV1 RC1 |
| **R2. Word rules are per target, and a connection's held state has no owner** | M8, M9, L4 |
| **R3. A thrown read and a found violation are one channel** | M5, part of M6 |
| **R4. Noticed, but nobody is told** (C1's remaining gap: the reader is the runner, not the CLI) | M6, M7, L5 |
| **R5. A claim without a mechanism** | M11, M12, L1, L2 |
| Standalone | M3, M4, M10 |

Do R1 first, as one paragraph of rule 61. Then R2 as one table pass. The rest are sentences. A third round is not needed for these unless the owner changes H1's fix.
