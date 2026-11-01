# Stories and Fake, amended: deep review, round 1 of 2

Advice to the main session. Everything recommended here is **proposed**. Reviewed: `stories-amended.md`, `fakes-v2.md`, against `decisions.md`, `fakes-review-1.md`, `machine-design.md`, `merge-6-streams/proposal-v2.md`, the plans, and the desk and Checkout. No decision C1-C5 or W1-W41 is reopened; where one has a failing consequence I say so and the fix keeps it.

## Verdict

**The shape is right; it is not ready to accept.** C1's split (a Story is a transcript, the test checks) holds up on every real file I rewrote, and the amended text is consistent to a high standard: all table cell counts are correct, and every ending in 2.10.5 stays reachable with the new result shape.

Five things stop it:

1. Rule 61 cannot be built as written. A scheduler cannot see a promise chain end or tell a host wait from a parked fiber. I ran this. A fix exists that keeps W2, W4 and "no host task runs".
2. `propertyTest` as written rejects on almost every correct app that generates `hold`.
3. `together` has no spelling for a targeted send, so a real Story in Checkout (`twoTabs`) cannot be written, and `propertyTest` cannot generate app sends or lifecycle steps.
4. With `expect` gone, a broken fake (a bad route, a crashed handler) produces a passing test.
5. The wire words on a server handle and on stream endpoints have no rule for attempts, so "an offline device" still connects its socket.

Streams can merge on this after the list in section 6; only one item there is more than respelling. A few of the 91 words could go (section 8), and doing so removes several holes outright.

## What I ran, and what I did not

Scripts are in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-Sy75Xy/b97bafc6-720f-455d-b91c-5aa81d337285/scratchpad/r1/`.

| Probe | File | Result |
| --- | --- | --- |
| Scheduler-level settle, Effect 4.0.5, `MixedScheduler("sync")`, Bun | `settle.ts` | Task count reaches 0 after **1** microtask hop while a 200-`await` promise chain is unfinished. Fibers on `Queue.take`, `Effect.never` and a host `setTimeout` have the same public state |
| Fixed-budget microtask pump, Bun and Node 24.21 | `pump.ts` | 4096 idle hops: no host task ran; a 500-`await` chain and `new Response(...).json()` finished; `crypto.subtle.digest` did not; `Queue.take` stayed parked. Same on both engines |
| Answer order, written as the proposal's order rule | `wire.ts` | A small simulation, not Flow. Nested settle answers B before A; a FIFO answer list answers A then B |
| Vitest 5.0.5 | `vt/r.test.ts` | Array with enumerable `truncated`: `toEqual` and `toMatchObject` against a plain array **fail**; non-enumerable passes; `.filter` loses it. `expect({ draft: undefined }).not.toHaveProperty("draft")` **fails** |
| `tsc` strict plus the repo's `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; mocks only | `ts/spike.ts`, `spike2.ts`, `spike3.ts` | See M7, M8, M10. Mocks show what these signatures can do, not what the real ones will |
| Counts over the desk and Checkout, by script | inline | 190 Stories with checkpoints; 74 share a name with one of their checkpoints; 75 `at.x.memory.y`; 197 `at.x.{memory,state,operations}`; 40 `O.x.get(at…)`; `latency`, `response` as an Effect, `match: { input }`, `run.steps`, `checkpoint(…, { at })`: 0 uses |

Effect facts are from `node_modules/effect/src` (4.0.5): `Scheduler.ts`, `testing/TestClock.ts`, `socket/Socket.ts`.

**Not run:** Chromium, Firefox, Safari; any Flow code (the rewrite has no `Fake`); the executable model. I did not extend `merged/stories/model/`: its `Conn` and `Req` shapes lack `Closing`, `latency` and `send`, and H1 below changes what a settle is, so that work should follow round 2. Node's `process.nextTick` is still untested against the pump. Section 5's rewrites are by hand.

## 1. High

### H1. Rule 61 cannot be built as written

**The text.** A settle "ends once Flow's queue and the microtask queue are both empty", the wake tracker "is the signal used", and "a fiber waiting on the host ... is **always** `HostTimeWait`".

**Two failing facts, both run (`settle.ts`).**

- *Nothing can observe an empty microtask queue from inside one, and the tracker does not see promise chains.* It counted to 0 after one hop with 200 `await`s still to run. `FetchHttpClient`, `Fake.fetch`'s shim and an `async` client half are all such chains. So the tracker ends the settle early, and the only other "empty" check is a macrotask, which `merged/stories/reviews/v2-review-2.md` H1 already rejected because host I/O runs at that boundary.
- *A parked fiber does not say why.* `Effect.promise(() => fetch(...))`, `Queue.take` and `Effect.never` are all `Effect.callback` with equal public state. "Suspended on input that is not coming" is allowed and "suspended on the host" must reject, and nothing tells them apart. The model only has this because `srv.hostwait` is a hand-set flag.

**Scenario.** A setup-scoped SDK client awaits `crypto.subtle` in an operation's commit. The Story reads as "input not coming"; the settle ends; the step passes; the digest resolves during a later step. Whether that is before or after the next `await` in the runner depends on the host. W4's guarantee does not hold and C6's determinism goes with it.

**Fix, keeping W2 and W4.** Three parts, and I ran the first:

1. *A pump, not an emptiness check.* The settle keeps re-queueing one microtask until `K` consecutive hops see no scheduler activity (`K` a fixed constant). No host task can run while the microtask queue is non-empty, so **the result cannot depend on host speed**, in Bun and Node (`pump.ts`). A chain longer than `K` simply reads as a host wait, deterministically.
2. *Owner-based classification.* A clock sleep and a gate wait record the waiting fiber and its owner (rank 2.10.17.5 already needs this). After the pump, a commit or read fiber with no gate or clock wait under its owner is `HostTimeWait`, naming the owner. Session and setup-scoped fibers may wait.
3. *Late wakes.* Any scheduler task arriving outside a settle is a host wake: `HostTimeWait` at the next boundary.

**Rule 61, proposed text.**

> Every step applies its input, then settles on a microtask-only run scheduler. The settle pumps microtasks until `K` consecutive hops show no scheduler activity, so no host task can run during it. An operation's fiber then waiting on neither the Clock nor a Story gate is `HostTimeWait`, naming its owner. A session or setup-scoped fiber may wait. A fiber woken from outside a settle is `HostTimeWait`.

**Limit, stated.** Rule 2 cannot catch a stream adapter that waits on the host and whose promise never resolves within the run. "Always" becomes "an operation's fiber, always; other fibers, when they wake". That is a cut for correctness.

**Also fix:** the "Effect 4.0.5's `TestClock` counts the tasks it wakes... which is the signal used" sentence, 2.10.17.1's closing paragraph, C70, and Testing O2's amendment. `TestClock.layer`'s wake path also waits on a live-clock `timeoutOrElse` for its warning, so the executor needs its own clock or `warningDelay` handling; check this when the executor is built.

### H2. `propertyTest` rejects on correct apps that generate `hold`

**The chain.** 2.10.16's own example generates `Stripe.confirm.hold()`. Testing O6 says "pending external work" and "a quiet horizon" are `Inconclusive`. H8 **[P]** makes `Inconclusive` reject.

**Scenario.** Take 2.10.16's sample with 30 steps and groups chosen uniformly. A step is `hold` or `release` with probability 1/12 each, so about half of all runs end with `hold` as the last of the two. A Pay under it stays `InFlight` past `quietWithin`. So a correct app gets `Inconclusive` within the first few of 200 runs, and the test rejects. "Shrinking keeps pairs" does not help, because a generated run has no obligation to have a pair.

Also unspecified:

- Whether the search stops at the first `Inconclusive`. If it does, an `Inconclusive` at run 3 hides a real `Fail` at run 50.
- `result.frame` for a `whenQuiet` failure, which has a cut, not a frame.
- Whether the emitted Story holds the quiet-seeking advances. If it omits them, H10's pasted regression never reaches the failure and passes.

**Fix.** Text only, no new word:

- **The quiet phase ends the world.** After the generated steps, it ends every standing rule, in the order set, with a `release()` on each target, then moves time. These are ordinary steps and are part of the emitted Story, so the paste reproduces.
- **All runs complete** unless one fails. `Fail` wins over `Inconclusive`; `Inconclusive` reports `completedRuns` and how many.
- `Fail` gains `at: { frame: n } | { quiet: true }`, in place of `frame`.
- A machine with a recurring schedule never goes quiet. `whenQuiet` needs "no lane `InFlight`, no held item, no work at or before the horizon except recurring schedules", or every polling app is `Inconclusive`. EntityDomains O4's "at quiet" needs the same line.

### H3. `together` and `propertyTest` have no spelling for a targeted send or a lifecycle step

**Scenario.** `checkout/features/Pay/pay.story.ts` `twoTabs` writes `together({ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] })`, a shape no design defines. 2.10.2 shows only bare events (`together(Stripe.confirm.release(), E.Cancel())`), and "a send takes a target, then events" has no form inside `together`. So the one case that most needs a race, two tabs paying, cannot be written. W3 makes `together` the one word for races.

`propertyTest`'s steps are "what `together` takes ... plus a lifecycle value whose spelling waits for the type spike". So on an app Story it cannot generate a send at all, nor a `reload`, though Testing O6's faults require "crash and restore". Races are also not generable, so a property test cannot find 2.7.13's P1 race.

**Fix: one rule. Every step has a data form, keyed by its own method name.** No new words. `describe` already needs this form.

```ts
Story.app(ShopSetup, { id: "pay/two-tabs", fixtures: [StripeFake] })         // existing: Story.app [W1]
  .openTab("b", { from: "main" })                                            // existing: openTab, from
  .together(                                                                 // existing: together [W3]
    { send: [payRef, pay] },                                                 // NEW form: { send: [target?, ...events] }; a bare event stays allowed on a machine Story
    { send: [{ actor: payRef, tab: "b" }, pay] },
    Stripe.confirm.release(),                                                // existing: a control
    { advance: "30 seconds" },                                               // existing: { advance } [W10]
  )
  .checkpoint("twoTabs")

propertyTest(base, {                                                         // existing
  steps: [
    [{ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] }], // same form
    [{ reload: "main" }, { closeTab: "b" }, { openTab: ["b", { from: "main" }] }],  // NEW form: a lifecycle step, keyed by its method
    [{ together: [{ send: [payRef, pay] }, Stripe.confirm.release()] }],     // NEW form: a generated race
    [Stripe.confirm.hold(), Stripe.confirm.release()],
  ],
  properties: { chargedOnce },                                               // user-defined: chargedOnce
  seed: 11,
})
```

Added: forms only. Dropped: nothing. Bare events stay on `send`-free machine Stories, since that is the decided example.

### H4. C1's failing consequence: a broken fake makes a passing test

**The text.** "No matching route, or invalid `input`, is an `issue` ... and a 404 or 400." "A handler that throws is a crashed server ... plus an `issue`." "A stream not placed on this server is an `issue`." `run()` rejects "only on a real Story error", and section 5 says a test may write `run.end.records("issue")`.

**Scenario.** The author types `"POST /api/intent/:id/confirm"`. Every confirm gets a 404, which the commit classifies as a definite failure. A decline test asserts `expect(declined.state).toBe(S.CARD)`, and passes without the decline ever being exercised. Before C1, the Story's checks at least failed on the wrong path sometimes; now nothing is ever looked at unless the author remembers. A handler `TypeError` is worse: it becomes `Fake.Lost`, then `NoResponse`, then a plausible `unknown`.

**Fix, keeping C1.** These are errors in the test's own world, not values, so H15's list **[P]** should include them. C1 says Flow owns no assertions about the *app*; a broken fixture is a broken run, like `StoryTurnLimit`.

```ts
// Fake-authoring problems end the run with an error. The run finishes first, so the evidence is complete.
await paid.run()                  // rejects with a FlowError: NEW: StoryFakeError { fake, endpoint, reason }
                                  // reason: "NoRoute" | "InvalidInput" | "Crashed" | "UnplacedStream"
```

- Nothing is lost: a Story that wants a 500 writes `response: { status: 500 }`; one that wants a 404 writes a route.
- Product `issue`s stay records and never reject, as CommandLine.plan's "Product failures recorded as Story issues do not alone fail the invocation" says.
- `propertyTest` reports it as a rejecting `FlowError`, like an acquisition defect (Testing O6).
- `flow story run` then exits 2 under CommandLine's "Story execution" failure, which H13 should say explicitly rather than "non-zero".
- 2.10.17.2's crash row stays; the rejection comes at the end of the run.

### H5. The wire words on a handle and on stream endpoints are not defined

The tables are complete cell by cell for the words on one endpoint. They are not for how the words combine. One root cause: `drop()` on a stream is an **action now**, on a call it is a **rule at arrival**, and nothing reconciles them.

| Scenario | What the text says | Result |
| --- | --- | --- |
| `Docs.drop({ times: "always" })`, "an offline device" (2.10.4), on a server with a socket | The attempt rows are only "rule none", `hold({ at: "open" })`, `drop({ at: "open" })`. An at-less `drop` is a frames word | **`open` runs and the socket connects while offline** |
| `Chat.drop()` on a handle | Streams "close at once"; calls take a rule with `times: 1` | Does the socket closing use up `times`, so the next post gets through? Unspecified |
| `Chat.socket.drop()` with no connection, for example in the `world` option | "nothing, recorded", and `times` is consumed or not | A silent no-op. A call's `drop()` waits for the next request; a stream's does not. `Story.machine(Room, { world: [Chat.socket.drop()] })` does nothing |
| `Chat.socket.drop({ times: 3 })` | `times` "(default 1, or `"always"` until `release`)"; no meaning at frames | Unspecified: closures, or connections? |
| `Chat.socket.duplicate()` with two open connections (the desk has `changes` and `activity`) | "the next frame"; columns are per connection, rule list is per server | One frame in the run or one per connection? `feed.story.ts duplicateFrame` passes either way, so it may not test what it says |
| `release({ nth: 2 })` with two `Silent` connections | "the k-th queued frame", per column | Which queue? |
| `hold()` and `hold({ at: "open" })` both set | "One rule per request"; attempts and frames evidently use separate lists, though 2.10.4 says one list | Contradiction in wording |
| `Stripe.hold({ at: "response" })` or `{ at: "open" }` on a handle | Only `after` is listed as a type error there | Unspecified |
| A `hold` with `match` on two rooms, then `release()` | `release` takes no `match`, and ends every rule on the target | Cannot release one room. Accept it, but say so |

**Fix.** A short rule above the tables, then the missing rows. Proposed:

- **Calls and attempts take a rule at arrival; open connections take the word when it is applied.** A word applied to a handle does both, and only rule-bearing arrivals consume `times`.
- **`drop()` on a stream or handle:** closes matching open connections at once. If `times` is greater than 1 or `"always"`, it also stands as `drop({ at: "open" })` until used up, so offline means offline. `times` counts attempts.
- **`drop()` with no connection and default `times`:** `NothingHeld`-style, `StoryInvalidCommand { NoConnection }`, except under `propertyTest`, where it is skipped. A no-op is what C1 can no longer catch.
- **`duplicate` and `nth`:** per connection, and `match` narrows. An app wanting one uses `match: { input }`.
- **Attempts and frames have separate rule lists**, each "earliest-set wins". Say this in 2.10.4 and 2.10.17.2.
- **On a handle, `at` is a type error.** The handle is the whole-device spelling. Use endpoints for phases.

Add the attempt rows to 2.10.17.3 (and recount), then have the model check them.

## 2. Medium

### M1. `latency` and `response` as an Effect are underspecified and have no real use: recommend cutting both

**Evidence.** Neither appears in any of the desk's or Checkout's nine fakes; the only `Fake.call` with an Effect is in `fakes-v2` section 5's example. Testing O6 already spells delay as "hold-advance-release".

**Holes they bring.**

- `Server` has three phases now (latency, send, Effect), but the log has no phase for the first, and `read(endpoint)` reads what? `waitsFor: "server"` is the only sign.
- A `hold` set while another request is in latency: the request is "in `Server`, no change", though the server has not seen it. Text says `Held` means "unseen by the server", so latency is a second, unaddressable form of `Held`.
- `drop({ at: "response" })` and `hold({ at: "response" })` with a crash: the row "handler fails" sends the failure regardless of the mark. A `duplicate` copy that crashes also goes `answered`, so **the client gets a second answer**. A `gone` one is `answered` to nobody, where the other row says `orphan`.
- 2.10.17.5 had to change ("due, then arrival"), and the rank table gained a clause.
- Section 10.2's "the spelling has no place for a library's memory" exists only because of the Effect form.
- Chromium: every library-backed `Fake.fetch` Story is expected to be `HostTimeWait`.
- Types: my first spike's signature `(t, r) => { truth?: T; response: R }` rejects a handler with mixed branches, and `response: Effect.fail("boom")` falls through as a plain value rather than being rejected. `spike2.ts` shows a form that works, but it is real machinery.

**Fix.** W17 is met without them: a synchronous library goes in a pure handler, and an async one in a plain Layer as the client half, where it was going anyway. A slow request is `hold`, `advance`, `release`. That cuts `latency`, section 5, the crash row's second half, and section 10.2. If you keep `latency`, add a `waiting` phase, state that a `release` never touches it, and fix the crash row's marked, copy and gone cases.

**The crash row needs fixing either way:**

| Handler fails | Result |
| --- | --- |
| a copy | → `duplicate`, nothing reaches the client |
| `gone` | → `orphan` |
| marked to drop | → `dropped`, `Fake.Lost` |
| marked to hold | → `HeldAnswer`, holding the failure |
| otherwise | → `answered` with the binding's failure |

### M2. "Deliver the list, settling after it; then the answer" nests, so answers come out in reverse

**Run (`wire.ts`).** A and B arrive in one settle and each `send`s frames. A's settle runs B's handler, whose settle ends with B's answer, and then A's: `handle A, frames A, handle B, frames B, answer B, answer A`. Adding a `send` to a handler reorders answers. It is deterministic, but it is an order no one chose, and the model does not cover it (fakes-v2 section 6). It also collides with `together`, where "settling" is not allowed to run turns.

**Fix.** One FIFO answer list: "A handler's answer joins the run's answer list. Each settle ends by delivering the next answer, then settling again." This gives A then B and keeps "frames before their answer", and a request caused by a frame can still reach the server first. Inside `together`, "settling" means what that row already says: run until each fiber reaches a mailbox, gate or the Clock.

### M3. Reads with no tab are silently wrong once `main` closes

Rows: `read(ref)`, `entity(E, k, { tab? })`, `inspection`. Testing O7 says the default is `"main"`; H5 says "the Story's first tab".

**Scenario.** `editor.tabs.story.ts secondTab` closes `main`, then reads. `cp.inspection` has a non-optional type and no value. `cp.entity(Ticket, key)` reads `undefined` though tab b has it, so `expect(...).toBeUndefined()` written to mean "deleted" passes. `cp.read(Editor42)` is the same.

**Fix.** Say "main" everywhere, as Testing O7 does. On an app Story, type `inspection` as `| undefined`, so the case shows at the type. Add `read`'s absence rule to `entity`'s row: `undefined` when the tab is closed. There are now four ways to name a tab (`read`, `lane`, `entity`, `tabs`); `tabs` is Testing O7's, so I would leave it.

### M4. `memory` nullable costs every test a `?.`, and absent is not defined for a fragment

H16 **[P]** types `state`, `memory`, `operations` as nullable.

**Scenario.** The real tests have 75 lines like `expect(at.paid.memory.receipt)`. They become `paid.memory?.receipt` or `paid.memory!.receipt`. C1's example hides this by only using `toMatchObject`. And `expect(cp.memory?.status).toBe(undefined)` passes on an absent subject.

**Also undefined.** "Absent" after a subroutine's exit, and while frozen. `pay.test.ts challengeAlone` reads `Object.keys(at.exited.memory)` after the exit: under H16 that throws or is a type error. 2.10.12 says only `.leave()` on a subroutine reads `undefined`; 2.10.17.4's `Ended` and `Frozen` have no read.

**Fix.** `state`, `memory`, `operations` are non-nullable and **throw** `SubjectAbsent` (NEW), naming the checkpoint; `read()` stays the one that returns `undefined`. It reads at a glance, and a wrong read fails with a clear line. Absence: `Absent` and `Ended` read absent; `Frozen` reads its slice with `read()`, and `inspection.incarnations` says frozen. Fix `challengeAlone`'s test to use a checkpoint before the exit.

```ts
expect(paid.memory.receipt).toMatchObject({ afterUnsure: false })   // existing: memory; CHANGED: not nullable; throws SubjectAbsent if absent
expect(left.read()).toBeUndefined()                                 // existing: read() [W23], the check for absence
```

### M5. `lane` has no spelling for a fragment's read or stream, and streams need it

`lane(O.x, key?, address?)` takes a handle first. 2.10.6 says a fragment's read or stream "has no outside handle (rule 50), so it is named by `instance` and the operation's name". So `lane` cannot take it. 2.10.9 says stream rows are "read with `operations` or `lane`". The desk's fragments place streams and reads (`panels`, `Comments`).

**Fix.** A second form, the same address shape as `match`:

```ts
cp.lane({ instance: ["likes"], operation: "get", key: { id: "c7" } })   // NEW form: an address alone; operation is a string, type-checked against the summary (rule 57)
```

This also resolves `lane(O.pay, undefined, { actor: Checkout1 })`, which reads badly: `cp.lane({ actor: Checkout1, operation: O.pay })`. That is the better form for app Stories; `AmbiguousRead` stays. Note `{ n }` in `attempt`'s address is not in rule 65's list; add it as a "kind field".

### M6. H6 goes further than W24, and misses storage

W24 puts `inspection` on the checkpoint. H6 **[P]** captures it on **every frame**, and says "memory stays linear with structural sharing", not measured.

**Scenario.** Inspection O1's sessions include "a ring of the last 256 evidence entries", per session (merge 6 2.12). A desk Story with 8 sessions and 64 lanes captures that at each of up to 10,000 frames. A `propertyTest` runs 200 of them. Sharing does not help unless these lists are persistent structures, which nothing specifies. Also, capture must run inside publication without being a live read.

But playback's Inspect needs per-frame `work` (2.10.13). So:

**Fix.** Frames capture `work` and lanes only (`lane` needs the listing); cuts and named `{ at }` frames capture the full `inspection`, and the executor knows the plan, so it can capture those on demand. Type a frame's `inspection` as that narrower shape. `propertyTest` drops a run's frames once it has checked them. Measure this before accepting.

**Missed by H6: storage.** `Fake.storage.from(story, { at })` needs the store's contents at a checkpoint, and no cut captures them (H6's list and rule 64 omit storage). There is also no `read(Fake.storage)` row. **Fix: cut `at`.** Stories are prefixes, so `Fake.storage.from(saving)` where `saving` is that prefix says the same with no per-cut capture. Add a `read(Fake.storage)` row returning encoded records at the cut's end. `from` has 2 real uses.

### M7. `Story.Frame<S>` binds a helper to one Story's checkpoint names

**Run (`spike.ts`).** Because `since` is checked against names, `Frame<typeof withCheckpoints>` does not accept a frame of another Story: `Reads<"after">` is not assignable to `Reads<"paying">`. A shared helper or 2.10.16's pasted regression fails to compile whenever the annotated base has a checkpoint. Checkout's `charges(cut)` helper is used 6 times in `pay.test.ts`, across Stories with different checkpoints.

**Fix.** Parametrize by subject, not Story: `Story.Frame<typeof PayMachine>`, with `since` typed `string` on that form (still type-checked on a Story's own checkpoints). Same word, same count.

### M8. Types under the repo's strict flags

**Run.** Under `noUncheckedIndexedAccess`, on in `tsconfig.base.json`:

- `fakes-v2`'s `input: ({ params, query }) => ({ room: params.room, clientId: query.client })` is a **type error**: both are `string | undefined`.
- Handlers with branches need `H extends { truth?: T; response: unknown }`, as `spike2.ts` has, or 2.10.4's own `Stripe.confirm` does not compile with the obvious signature.

**Fix.** Infer `params` from the route key (template literals), and type `input`'s result loosely (`unknown`), since `request` decodes it and invalid input is H4's `StoryFakeError`. Do this before accepting the spelling, as fakes-v2 section 6 already asks.

### M9. `describe` cannot print "every fake server reached"

**The text.** `describe` prints "from the plan alone ... every fake server reached". `StripeFake` is `Layer.mergeAll(ShopOverFetch, StripeJsOverFake)`, with `Fake.fetch(Stripe, route)` behind `Layer.provide`. A Layer is opaque, and CommandLine says only `story run` starts work. So `describe` sees only servers named in `world` or steps. Rank 1's "first reference by a fixture" works at run time, by the order of `yield* Stripe`, but the server discovery itself is unspecified: `yield* Stripe` must resolve per run from something the executor provides, and a `Layer`'s `R` is types only.

**Fix.** State the mechanism: `Stripe` is an Effect that gets or builds from a run-scoped registry (so it is not in `R`, and "a missing fake is a type error" survives only for the app's services, which is the point). Change `describe` to "every fake server the plan names". If you want more, add `Fake.client(Stripe, (server) => layer)`, carrying metadata. I would not add it now.

### M10. Name collision: a checkpoint named like its Story

C5's destructuring meets the desk's habit. **Run (`spike3.ts`):** `const { paid } = (await paid.run()).checkpoints` is TS2448. 74 of 190 real Stories have a checkpoint with their own name, so conversion hits this on 4 in 10. 2.10.18.1 quietly renamed `saved` to `savesTitle`, so the author knew.

**Fix.** Keep C5. Document it, and show one of the two forms everywhere: `const { paid } = (await paidFirstTime.run()).checkpoints`. In the conversion, rename the Stories rather than aliasing. No API change.

### M11. Stream phases and refusal

- **A client close has no log phase.** The table goes to `None`; the phases list has `closed { code }`, which is defined only for a server or network close. A test for "released, not leaked" reads `phase: "open"` forever. Say `closed { code: 1000, by: "client" }`.
- **A network-refused attempt has no phase.** `drop({ at: "open" })` is neither `refused { code }` nor `closed`; the word table says "refused", the state table says "lost". Add `lost`, and use "lost" in the word table.
- **`refuse` under `Fake.webSocket` is undefined,** and `refuse: 4403` under `Fake.fetch` is `new Response(..., { status: 4403 })`, which throws a `RangeError`. In real browsers, a refused handshake gives only `error`, then close 1006 (`Socket.ts` makes it `SocketOpenError`), which matches merge 6's "401/1006". **Fix:** under `Fake.webSocket`, `refuse` is an error event then close 1006, with the code visible only in the log. App-level closes use `socket.close` after open. Under `Fake.fetch`, a code outside 200-599 is a construction error.
- **`Opening` and `socket.close`.** A control can close an attempt the server has not seen, against "unseen by the server" and the `Closing` rule's logic. Make those cells "nothing".
- **`phase` has two shapes:** `"answered"` and `{ _tag: "closed", code: 1006 }`. Pick plain `phase` with a `code` field.
- **`end` under `Fake.webSocket`** is close 1000, and Effect's `Socket` fails with `SocketCloseError { 1000 }`, not a stream end. So 2.10.15's "completion from `socket.end`" is only true for a body or client half. Real `closedWith` makes 1000 a `SocketDropped`. Honest, but fix the line.

### M12. Fake.storage's tables have holes

- No row for `drop({ at: "response" })` at arrival, though the word table allows it; `release({ drop: true })` from `HeldConfirm` reaches the same state, so add "applied; → `refused`".
- `release({ nth })` has no row, and FIFO per tab implies it is a type error. Say so.
- A handle word (`Fake.storage.hold()`) covers reads and writes, blocking bootstrap. Say so.
- Log phases for storage (`stored`, `aborted`, `refused`, `served`) are not in the Provenance list.

### M13. SSR: one clock, and a source's rank

2.10.3 says one clock per run. `hydrate(source)` runs a Story "at the `hydrate` step", and a source's `dehydrate` moves time. With one clock, a mid-run `hydrate` fires the client's deadlines during the server's render. With two, a fake's sleep has no clock to wake it. `via.tab: "server"` has no rank in "tab order", and a source's `world` steps (not just the option) need the same type error, so `Story.app`'s type must carry "has no world". Also the source's fixtures are its own, while its server is the destination's.

**Fix.** A source runs on the run's clock, advancing it; at a *leading* `hydrate` there is nothing else to fire. At a later one, tabs' sleeps are held like `suspended` until it ends. "server" ranks before every tab. Add the rows to 2.10.17.1 and 2.10.17.5.

### M14. Section 10.1 (W25's consequence): a fix keeping W25

A hand-written loop can pass on frames it never saw. A cheap fix: the iterator throws `FramesTruncated` after yielding the last kept frame. `run.frames[i]`, `.length`, `.truncated` stay plain. A `for … of` cannot finish quietly, and checking `truncated` first stays optional. Make `truncated` non-enumerable too, because the enumerable form breaks `toEqual` and `toMatchObject` against a plain array (run). `.filter` loses it, which is correct.

### M15. Reads the tests use with no row

- `schedules`: 8 real uses, and `locked.read()?.schedules.timer.done.dueAt` in section 8 reads badly next to `locked.memory`. Add `schedules` to `state`, `memory`, `operations`.
- `check(at.x, event)`: 2 real uses, and `O.x.get(at.x, k)`: 40. 2.10.6 says they work "on a snapshot". Say in the table that a focused checkpoint's `read()` is that snapshot. `cp.lane` replaces most of them; note the different result on a settled lane (`undefined` vs the idle row), which is the conversion's main risk.
- `<StoryFrame frame={…}>`: a cut is `{ frame, seq, truth, wire }` by 2.10.6, yet "has the same reads". Is `cp.frame` public? Does `StoryFrame` take a checkpoint? The desk invented `run={run} checkpoint="saving"`. **Fix:** a cut is a frame plus `wire`, and `StoryFrame` takes either.
- `Entity.get`'s `shape` (Testing O4), `Domain.entry.get(checkpoint, …)` and `Entity.queue(checkpoint, …)`: C72 replaces only the first and does not mention `shape`. State: dropped, `Issues.list.get(cp.read(ref), …)`, and `cp.inspection`.

### M16. The chat example does not run

2.10.18.7 says "the fake is 2.10.4's `Chat`". That `Chat` has `initial: { messages: [] }`, and nothing in the Story adds messages, so `quiet.records("frame", { phase: "delivered" })` has length 0 and the test fails. Its `input.from` is not in `socket`'s `request`, and `roomId` is not `room`. Fix when merge 6 is merged; meanwhile seed a control in `world`, and add `from` to the request.

### M17. Real Stories that are wrong under "every step settles"

These predate the amendment, but conversion will trip on them, and nothing warns:

`upload.story.ts` `uploaded`, `lostThenResent` and `removedWhileUploading`, and `assistant.story.ts` `midStream`, set their wire rule **after** the step that sent the request (`.enter(d).world(Desk.putFile.hold())`; `ask(id).world(hold({ after: 2 }))`). The request has finished by then, and the rule waits for a request that never comes. `drop` and `hold` do not error, since standing rules are legal. A rule that never fired is exactly what C1 can no longer catch.

**Fix.** Print unused rules in `flow story run` and as `diagnostic` records (`UnusedWireRule`, NEW). Do not reject, since a branch may leave one. Convert these with the rule first.

## 3. Low

- **L1. H2's "captured values omit absent keys" is false for memory and logged input.** Run: `expect({ draft: undefined }).not.toHaveProperty("draft")` fails, and Testing O4 keeps snapshots faithful. A route's `from: undefined` is another. Say "use `.toBeUndefined()` on the read"; drop the universal claim.
- **L2. The record kind `frame`.** A property reads `(frame) => frame.records("frame")`; `run.frames`, `frame:` and `socket.frames` add to this. Rename the record `delivery`. **[fakes-v2 spelling, so open.]** Similarly `records("drop")` returns dropped raises, not wire drops: after `Stripe.confirm.drop()` it is `[]`. Note it in the table, or rename to `droppedRaise`.
- **L3. H23's count.** The table's 21 is right as counted, but "every kind is an Inspection O4 kind" is not what the plan lists (`turn`, `lifecycle`, `admission`...), and 2.10.14 reads a `turn` event not in the table. Say the table is "the kinds `records` takes".
- **L4. "Nothing else is typed by an author" is false:** `since`, `n`, `signal`, `run.end`, `deny`, `within`, `maxBytes`, `label`. Soften it, or count them.
- **L5. `world`'s type.** The desk's helpers write `world: ReadonlyArray<unknown>`. Export `Story.World` as a type, or the helpers lose checking.
- **L6. `Fake.storage.seed`'s record shape** is undefined; the desk invents `{ kind: "lane", ... }` with a design gap. Section 2.10.15's "reset key" walk needs it too. Point at Persistence, or make `from` the only form until it exists.
- **L7. `Fake.storage.from` carries storage, not fake truth.** A `continuedFromReload` server starts at `initial`. Say so.
- **L8. Reserved names.** A control or endpoint named `hold`, `drop`, `release`, `duplicate` clashes with the wire words on a handle. Add to the construction error.
- **L9. `result.story` "pasted".** Nothing prints a Story as source. Add `result.source`, a string. Also the example's id `pay/counterexample/11` differs from `<base id>/counterexample/<seed>`.
- **L10. `server.socket(…)`'s frames** are "wire frames": encoded, not `Type`. Say so.
- **L11. `duplicate({ at: "request" })`** in `pay.story.ts` has no form in the word table. Convert it.
- **L12. Where the preset lives.** `Domain.propertyOptions` adds a testing helper to a production module. Consider exporting it from `flow-state/testing`.

## 4. Each part alone: the walk

| Item | Verdict |
| --- | --- |
| Settling | H1 |
| Time, ranks | Sound as text; `advance({ next })` cannot name a fake's latency (moot under M1) |
| Call table | 52 cells recounted, correct. Crash row wrong (M1). Otherwise sound |
| Stream table | 90 cells recounted, correct. Cell logic sound per connection; combination rules missing (H5); log phases (M11) |
| Stand-in table | Sound. `read` in `Ended`, `Frozen` undefined (M4) |
| Storage tables | Counts correct; holes (M12) |
| `read` | M3, M4; overloads spiked by the proposal, fine |
| `lane` | M5; the tab default (M3) |
| `records` | Sound; L2, L3 |
| `inspection` | M3, M6 |
| `entity`, `attempt`, `now` | Sound; M3; `{ n }` (M5) |
| `run.frames` | M14 |
| Closed tabs | Sound for `read`; M3 for the defaults |
| H1, H3, H11, H12, H14, H18, H19, H20, H22 | Agree |
| H2 | Right about `toMatchObject`; the claim about captured values is false (L1) |
| H4 | Agree. `AmbiguousRead` is good |
| H5 | Keep, with M3 |
| H6 | Too broad, and misses storage (M6) |
| H7 | Agree, with M14 |
| H8 | Agree it should reject; needs H2 |
| H9 | Agree the word earns its place; needs H2 |
| H10 | Agree; needs H2, L9 |
| H13 | Agree; needs H4, and "exit 2" |
| H15 | Agree; add H4's fake errors |
| H16 | Change (M4) |
| H17 | Agree; M5 |
| H21 | Agree: a truncated run's kept cuts sit outside `run.frames` |
| H23 | L3 |
| Section 10.1 | M14 |
| 10.2 | Cut, M1 |
| 10.3 | No action |
| 10.4 | Keep as a failure: a run nobody fully checked must never read as a pass; the plan needs the exception |
| 10.5 | Agree with rejecting |

## 5. Integration

### Stories with Fake: the 2.10.5 table

Every row is reachable with `{ truth?, response, send? }`. Checked each. `Fake.Lost` mapping holds on client halves and under `Fake.fetch`. One note: `unknown { Interrupted }` needs a client half; a binding cannot produce it, as stated.

`hold`, `drop` and `after` with `send`, `close`, `end`: walked with the Assistant's body (`end: true`, `hold({ after: 2 })`), and it works: frames to the count, the rest queued, `Closing { 1000 }`, then `release` delivers both. `reload`, `openTab`, `closeTab`: correct on `gone`, `orphan`, and a stream's scope closing. `Fake.storage`: tables above.

### Against the design

- **Write lanes, 2.7.13:** all rows reach by 2.10.15's table. `lane`'s use of the Inspection listing is right for parked lanes.
- **Entities, 2.8:** sound; `predicted` naming is fine; M15's `shape`.
- **Fragments, rules 48-60:** rule 50 holds with `Fragment.O.x` as a name. M5 is the gap.
- **Persistence:** M6, M12.
- **SSR:** M13.
- **Inspection, `flow check`, coverage:** no loss from removing checks; "reached, not checked" is right. A Story with no test now reads as covered, as H14 admits.
- **Playback:** M15's `StoryFrame`. Presentations hold up.
- **Lines the change list misses:**
  - `machine-design.md` 5684, C16: its text says "truth is read with `expect(fake, partial)`". C71 supersedes it, but this sentence stays.
  - 6535-6536, T5, T6: add W rows, as line 6533's treatment says; T6 mentions `Story.attempt`.
  - 5769: `process()` in the record's note.
  - `open-items.md` 28 (route table): now answered. Close it.
  - `delegated-decisions.md` rows 21, 24; `NEXT.md` 13, 21.
  - `references/COVERAGE.md` section 6 and Q4.

### Against accepted plans

`Testing.plan` lines section 4 misses:

- O6: "even when process() drains", still there under C73, which only replaces the generator shape.
- O1: `services?` on `story.machine`, dropped from the options table with no row saying so. One real use (`queue.ssr.test.ts` passes `services:`, though in a non-Story call). Either keep or list it.
- O1: `run({ signal?, frames? })` needs `frames` removed (W22); C69 does not list it.
- O4: `descriptor.get`, `Domain.entry.get`, `Entity.queue` and `shape` (M15).
- O7: "send, ensure and checkpoint reads take an optional tab (default main)": section 4 keeps it, and it disagrees with "the first tab" (M3).
- V4: "recording and collapse"; C77 does not say.

`Package.plan` O1: C82's list drops `defineConfig` and `type StoryRun`. Add them, and the error classes `PropertyTestFailed`, `Fake.Lost`.

`Diagnostics.plan`: C83 covers errors; add `StoryFakeError` and `SubjectAbsent` if taken.

### Real code, rewritten by hand

**A machine (`pay.story.ts doubleClick`).** Reads well. Needs the world first.

```ts
export const doubleClickStory = Story.machine(PayMachine, {                          // RENAMED: Story.machine [W1]  // user-defined: PayMachine
  id: "pay/double-click", context: signedIn, fixtures: [StripeFake],                 // existing: id, context, fixtures
  world: [Stripe.confirm.hold({ at: "response" })],                                  // existing: world, hold, at
})
  .send(E.Start(CART_1))                                                             // existing: send
  .send(pay, pay)
  .checkpoint("doubleClick")                                                         // RENAMED: "double-click" -> camelCase [C5]
  .world(Stripe.confirm.release())                                                   // existing: release
  .checkpoint("paidOnce")

test("double click", async () => {
  const { doubleClick, paidOnce } = (await doubleClickStory.run()).checkpoints       // the Story renamed (M10)
  expect(doubleClick.read(Stripe.confirm)).toHaveLength(1)                           // existing: read [W23]
  expect(doubleClick.records("ending", { operation: O.pay })).toContainEqual(        // NEW on a cut: records [C3]
    expect.objectContaining({ channel: "failure", reason: { _tag: "NotSent", why: "Rejected" } }),
  )
  expect(doubleClick.state).toBe(S.PAYING)
  expect(paidOnce.state).toBe(S.PAID)
})
```

**A trait (`upload.story.ts lostThenResent`).** Fine; it exposed M17.

```ts
export const lostThenResent = Story.fragment(AttachmentUpload, {                     // RENAMED: Story.fragment [W1]
  id: "upload/lost-then-resent", fixtures: [DeskClient, Kept],                       // user-defined: DeskClient, Kept
  world: [Desk.putFile.drop({ at: "response" })],                                    // moved before enter (M17); times defaults to 1 [W19]
})
  .enter(Photo, { subject: Photo.ref })                                              // existing: enter [W32]
  .checkpoint("unsure")
  .advance("3 seconds")
  .checkpoint("stored")

test("lost then resent", async () => {
  const { unsure, stored } = (await lostThenResent.run()).checkpoints
  expect(unsure.memory.status).toBe("unsure")                                        // reads well only with M4
  expect(unsure.operations.put).toMatchObject([{ key: { ref: "r-1" }, uncertain: true }])
  const id = stored.attempt(O.put)                                                   // RENAMED: Story.attempt -> cut.attempt [W24]
  expect(stored.read(Desk.putFile).map((r) => r.input.key)).toEqual([id, id])
})
```

**An app with tabs (`editor.tabs.story.ts secondTab`).** Fine. `tabs.b?.inspection` reads acceptably.

```ts
export const secondTab = desk("editor/second-tab", [Desk.saveTitle.hold()])          // user-defined: desk, wrapping Story.app; world: Story.World (L5)
  .openTab("b", { from: "main" })
  .checkpoint("secondOpen")
  .send(inB, E.TitleChanged({ title: "Only in tab b" }), E.SaveRequested())          // user-defined: inB = { actor: Editor42, tab: "b" }
  .checkpoint("bSaving")
  .closeTab("main")
  .checkpoint("mainClosed")
  .world(Desk.saveTitle.release())
  .checkpoint("bSaved")

test("a second tab saves alone", async () => {
  const { secondOpen, bSaving, mainClosed, bSaved } = (await secondTab.run()).checkpoints
  expect(secondOpen.tabs.b?.inspection.persistence.status).toBe("SecondTabNoPersistence")   // NEW [P, H5]: tabs.b
  expect(bSaving.read(inB)?.state).toBe(S.OPEN.SAVING)
  expect(mainClosed.read(inB)?.state).toBe(S.OPEN.SAVING)
  expect(mainClosed.read(Editor42)).toBeUndefined()                                  // main is closed (M3 says this is what a bare ref means)
  expect(bSaved.read(inB)?.memory.saved).toBe("Only in tab b")
})
```

**A stream (`feed.story.ts dropAndCatchUp`, `desk.socket.fake.ts`).** Fine, once the fake is converted; `pushes` becomes a helper every log-writing handler must call.

```ts
const socket = Fake.stream({                                                         // existing: Fake.stream
  request: { workspaceId: Schema.String, from: Schema.optional(Cursor) },            // existing: request
  frame: Schema.fromJsonString(DeskFrame),                                           // NEW: frame [fakes-v2]
  open: (truth: FakeTruth, req) => ({ frames: greetingAndReplay(truth, req) }),      // existing: open, frames; CHANGED: an object  // user-defined: greetingAndReplay
})

const pushed = (before: FakeTruth, after: FakeTruth) =>                              // user-defined: replaces `pushes`; forgetting it is silent
  appended(before, after).map((i) => socket.frames((c) => c.workspaceId === i.workspaceId, [changeFrame(i), activityFrame(i)]))   // NEW: socket.frames

renameElsewhere: Fake.control({ workspaceId: Schema.String, ticketId: Schema.String, title: Schema.String }, (t: FakeTruth, a) => {
  const next = withDesk(t, Server.rename(t.desk, a))                                 // user-defined
  return { truth: next, send: pushed(t, next) }                                      // existing: truth; NEW: send
}),
expireToken: Fake.control({}, () => ({ send: [socket.close(() => true, 4401, "expired")] })),   // NEW: socket.close

Fake.webSocket(Desk, {                                                               // existing: Fake.webSocket
  "GET /api/workspaces/:workspaceId/socket": {                                       // NEW: route table [W36]
    endpoint: "socket",
    input: ({ params, query }) => ({                                                 // NEW: input (M8: params inferred from the key)
      workspaceId: params.workspaceId,
      ...(query.epoch === undefined ? {} : { from: { epoch: Number(query.epoch), seq: Number(query.seq) } }),   // the spread is exactOptionalPropertyTypes'
    }),
  },
})

export const dropAndCatchUp = desk("feed/drop-and-catch-up")
  .world(rename("T-43", "Fix the loading dock door"))
  .checkpoint("firstEntry")
  .world(Desk.greet({ replay: false }), Desk.socket.drop())                          // existing: drop [W37]; two controls, one cut
  .checkpoint("dropped")
  .world(rename("T-43", "Dock door, second try"), rename("T-42", "Replace foyer light"))
  .advance({ next: { operation: O.activity, timer: "backoff" } })                    // existing: next [W7]; merge 6 must tag this sleep
  .checkpoint("caughtUp")
```

The test converts mechanically. `cut.read(FeedNorth)?.operations.activity?.connection` reads fine, since an app Story keeps `?.`. Note `Desk.socket.drop()` closes both `changes` and `activity`, which the test wants. It relies on H5's "all matching open connections".

The fake's frames must not be JSON-stringified twice: `text(frame)` goes away with `frame:`. The desk has 11 `withDesk` sites, so `pushed` calls are few. The Assistant's body converts directly with `refuse: status` and `end: cut !== undefined`; `Stream.mapError` tests `FakeRefused`, `FakeClosed`.

**A payment (`pay.story.ts reconciled`, `twoTabs`, `checkout.property.test.ts`).**

```ts
const idem = (h: Headers) => h.get("Idempotency-Key") ?? ""                          // user-defined
export const ShopRoutes = Fake.fetch(Stripe, {                                       // existing: Fake.fetch
  "GET /api/products": "products",                                                   // short form
  "GET /api/products/:productId": "product",
  "POST /api/intents/:intentId/confirm": {                                           // NEW: key
    endpoint: "confirm",                                                             // NEW: endpoint
    input: ({ params, body, headers }) => ({ ...params, paymentMethodId: body.paymentMethodId, key: idem(headers) }),   // NEW: input, headers
  },
  // ...15 more. The six keyless ones are short forms; the rest repeat idem(headers).
})

confirm: Fake.call({                                                                 // existing: Fake.call
  request: { intentId: Schema.String, paymentMethodId: Schema.String, key: Schema.String },
  handle: (t: Truth, r) => {                                                         // user-defined: Truth
    const { truth, response } = step(t, Server.confirm(t.shop, r, r.key))            // user-defined: step, now returns the object [W14]
    return { truth, response: response.status === 200 ? withSecret(response, r) : response }   // user-defined: withSecret
  },
}),

export const reconciled = checkout("pay/reconciled", [Stripe.confirm.drop({ at: "response" })])
  .send(pay)
  .checkpoint("payUnsure")
  .advance("3 seconds")
  .checkpoint("reconciledAfter")                                                     // renamed (M10)
```

`twoTabs` cannot be written (H3). The property test needs `Generate.wire(...)` written out as sample arrays, and at 5 endpoints with 6 words that is long (2.10.16's section 9 note holds). It relies on H2 and `whenQuiet`. `StripeJsOverFake` keeps `Effect.runPromiseWith`, whose fiber has no Attempt, so `match: { operation }` does not see it; it's honest, as stated in Provenance.

**Overall.** Everything reads well except: `?.` on memory (M4), names (M10), `together` (H3). No real test wanted anything the reads lack, other than `schedules`, the snapshot for `check`, and storage (M15, M6).

## 6. What merge 6 must change

It can merge on this; item 1 is structural, and item 5 is real design work.

1. **Rule numbers collide.** Its 6.1 makes its rules "61-66". Stories already hold those. Renumber to 67-72, and update every "rule 62", "rule 64", "rule 65", "rule 66" in its 6.1, 6.2, 3.x. Note: "rule 65" is **Positions** there and **One address** here, so a missed reference reads as true and wrong.
2. **2.11 goes.** Point to 2.10.9; its control table maps as below. Keep the two notes for merge 3, which 2.10.9 already has.
3. **4.1's Story** is rewritten below. Also `process()` at its 2.11 end, and 6.2's Testing row ("spelling: merge 3").
4. **`FakeChatServer({ history: seed })`** cannot be: a `Fake.server` is a module value with no parameters. Seeds are `initial` or a `world` control.
5. **`lane` for a stream in a fragment** (M5), and the row reads.
6. **`Feed.reconnect` must tag its sleeps** `backoff`, `page`, `resetAfter` on Effect's `Clock`, by the owner mechanism of H1. It is new work in the adapter combinator; `flow check` is not touched.
7. **`session` records** need named `cell`s, for coverage, from 3.1-3.5. `evidence.feed`'s fields (`answer`, `basis`, `missed`, `proof`) become the row in 2.10.6.
8. **`Feed.callback`'s awaiting finalizer** stays suite-only, as 2.10.9 says.
9. **Clean-end wording:** M11's `end`. 3.1's `complete` from a raw socket is adapter code reading code 1000.

| Merge 6's control | Now |
| --- | --- |
| `fake.accept()` | `open` returns |
| `fake.refuse(code)` | `refuse: code` |
| `fake.send`, `flood` | a control with `send: [socket.frames(where, frames)]`; a flood is a long list |
| `fake.silence(d)` | `hold()`, `advance(d)`, `release()` |
| `fake.drop(code)` | `drop()` for 1006; `socket.close(where, code)` for a code |
| `fake.flap(n, { upFor })` | a loop at construction of `drop`, `advance` |
| `fake.withhold(...)` | a control that `open` reads |
| `fake.resetLog`, `retain` | controls |
| `fake.reorder(i, j)` | `hold()`, then frames, then `release({ nth })`: one frame moves first, not an arbitrary swap. Enough for SR12 |
| `fake.hold("history")`, `answer`, `fail` | the history endpoint's wire words and handler |
| `story.suspend(d)` | `advance(d, { suspended: true })` |
| `truth.fake.resumedFrom` | `cp.read(Chat.socket)`'s `input` |
| `checkpoint.evidence("feed")` | `cp.records("session", …)` |

```ts
// merge 6's 4.1, in this form
const ChatFake = Fake.webSocket(Chat, chatRoutes)                                    // existing  // user-defined: Chat, chatRoutes, carrying from and greet in truth
export const chat = Story.machine(ChatRoom, {                                        // RENAMED [W1]
  id: "chat/replay-then-reset", input: { roomId: "r1" },
  fixtures: [ChatFake, HistoryFake],                                                 // user-defined
  world: [Chat.seed({ history: seed })],                                             // user-defined control, replacing a parameterized fixture
})
  .checkpoint("live")                                                                // a start cut [P]
  .world(Chat.greet({ replay: false }), Chat.socket.drop())                          // existing: drop [W37]; replaces .do(({ fake }) => …)
  .advance("500 millis")
  .world(Chat.history.drop({ at: "response" }))                                      // or a control making the page 503
  .advance("2 seconds")
  .checkpoint("caughtUp")
  .world(Chat.socket.drop())
  .advance("500 millis")
  .checkpoint("resumed")
  .world(Chat.resetLog({ epoch: 9 }), Chat.socket.drop())
  .advance("1 second")
  .checkpoint("reset")

test("replay, then reset", async () => {
  const { live, caughtUp, resumed, reset } = (await chat.run()).checkpoints
  expect(live.operations.messages?.connection).toBe("Live")
  expect(caughtUp.records("session", { operation: O.messages }).filter((r) => r.drop)).toHaveLength(1)   // NEW: session records [C3]
  expect(resumed.read(Chat.socket).at(-1)?.input.from).toMatchObject({ epoch: 8, seq: 41 })              // replaces truth.resumedFrom
  expect(reset.memory.cursor?.epoch).toBe(9)
})
```

No other blocker: stream sessions under settling, `Feed.reconnect` under TestClock, `Feed.callback`'s `emit` back-pressure under a list `send`, and floods all fit.

## 7. Root causes

| Root cause | Findings |
| --- | --- |
| **R1. A property is asserted with no mechanism behind it** (the executor's real signal, the server registry, per-frame capture) | H1, M6, M9 |
| **R2. Each word has its table, but no rule for how words combine across kinds** (call and stream; rule at arrival and action now; handle and endpoint) | H5, M11, M12 |
| **R3. The Story's steps have no data form, though rule 63 says a Story is data** | H3, L9, L5 |
| **R4. C1 removed the place that noticed things** (a broken fake, an unused rule, a truncated loop, an ignored `issue`) | H4, M14, M17, and part of H2 |
| **R5. The quiet point is not defined as a step** | H2 |
| **R6. `latency` and `response` as an Effect add states to one table** | M1, part of M2, section 10.2 |
| **R7. Which tab, which subject, is a default stated in several places** | M3, M4, M15 |

R1, R2 and R3 are the ones worth addressing together, in the holistic pass after round 2.

## 8. Does each addition earn its place

| Cut | Words saved | What it removes | Evidence |
| --- | --- | --- | --- |
| `latency` | 1 | Server's first sub-state, the rank clause, "due then arrival" | 0 real uses; Testing O6's own delay is hold-advance-release |
| `response` as an Effect | 0, but 5 rules | Section 5, the crash half, section 10.2, the Chromium caveat, the type machinery | 0 real uses; W17 met by a Layer |
| `headers` on `Fake.stream` | 1 | One line | 0 real uses; add with the first SSE adapter that checks |
| `Fake.storage.from`'s `{ at }` | 0 | Storage capture per cut | Prefixes say the same |
| `run.steps` (public) | 1 | | 0 real uses; section 5 says "rarely clearer"; keep it internal for the player |
| `checkpoint(…, { at })` with `settled`, `turn`, `step` | 3 | Frame capture of `at`, its own read rules | 0 real uses, though 2.8.1's moment needs it. **Keep** unless the owner agrees; a loop over `run.frames` reaches it |
| `match: { input }` | 0 | One line | 0 real uses, but review M10 had a case. Keep |
| `advance({ to })` | 1 | | 2 uses. Keep |
| `release({ nth })` | decided W21 | | 3 uses |

**Keep:** `hold({ after })` (2 real uses, and no other way), `whenQuiet` (the Checkout needs it), `AmbiguousRead`, `Story.Frame`, `tabs` (Testing O7; used indirectly by 2 real tests).

**Net:** with `latency`, `headers`, `run.steps` out: 88. With H4 and M4's errors: +2 words, both raised, not typed, so not counted.

## 9. Recommended order

1. H1, with a probe in Chromium, since a settle is what everything rests on.
2. H3 and H5 as one table pass.
3. H4, H2, M4: all three are single paragraphs.
4. Owner: M1's cut.
5. Types: M7, M8, on the real spelling.
6. Then extend the executor model (fakes-v2 section 6) with `Closing`, `send`, H5's rows and the pump; round 2 should run it.
