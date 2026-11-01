# Stories, amended

**Status: proposed, revised from review rounds 1 to 3 ([reviews/round-1.md](reviews/round-1.md), [reviews/round-2.md](reviews/round-2.md), [reviews/round-3.md](reviews/round-3.md)) and the model's gaps ([model/RESULTS.md](model/RESULTS.md)). Nothing is merged.** Once accepted this file replaces `machine-design.md` section 2.10, rules 11 and
61–66, the Stories row of section 3.6, the "Removed" row of the Stories merge, and the matching rows of section 5. Section
8 lists every other line that then has to change. No `.plan` file, app or other proposal was edited.

It amends the merged Stories design using the owner's decisions in [decisions.md](decisions.md) (C1–C5, W1–W41) and the
`Fake` module in [fakes-v2.md](fakes-v2.md), and it amends the accepted format in `workflow/plans/flow/Testing.plan`.

**Marks used throughout.**

| Mark | Meaning |
| --- | --- |
| `[C1]`, `[W25]` | **Decided** by the owner, in decisions.md |
| `[fakes-v2]` | **Proposed**: the direction is approved (W35, W36), the spellings are the main session's and the owner has not read them |
| `[P]` | **Proposed** by this file: a resolution of a hole, or a main-session call from the review. Never read one of these as decided. `RV1 M4`, `RV2 M4`, `RV3 M4` cite a review's finding; `MDL G2` cites a model gap |
| no mark | **Carried**: unchanged from the merged design. "Stories T*n*" there means delegated, not confirmed by the owner, unless a W row confirms it |
| `*Stream details: merge 6*` | Depends on `merge-6-streams/proposal-v3.md` ("v3"), which is **not merged** |

Citations carried from the merged design (STR*n*, STF*n*, SG*n*, brief C*n*, SP …) name its brief and proposal under
`merged/stories/`. They are provenance; nothing here needs them to be read. Effect 4.0.5 and Vitest 5.0.5 are the versions
checked.

## 1. What changed

### 1.1 One example, before and after

```ts
// BEFORE: the merged design. The Story held its own checks.
export const busyThenPaid = Story.make(CheckoutMachine, { id: "checkout/busy-then-paid", input: { intentId: "pi_1" }, fixtures: [StripeFake] })
  .world(Stripe.busy({ times: 1 }))
  .send(pay)
  .expect({ state: S.WAITING, memory: { busyTries: 1 } })
  .advance("2 seconds")
  .expect({ state: S.DONE })
  .expect(Stripe, { charges: [{ key: Story.attempt(O.pay, { n: 1 }) }] })
test("busy then paid", () => busyThenPaid.run())
```

```ts
// AFTER
// checkout.story.ts: inputs and checkpoints, nothing else
export const busyThenPaid = Story.machine(CheckoutMachine, {  // RENAMED: Story.make -> Story.machine [W1]  // existing: id, input, fixtures  // user-defined: CheckoutMachine
  id: "checkout/busy-then-paid",
  input: { intentId: "pi_1" },
  fixtures: [StripeFake],                                     // user-defined: StripeFake (a client half, 2.10.4)
})
  .world(Stripe.busy({ times: 1 }))                           // existing: world  // user-defined: Stripe, busy
  .send(pay)                                                  // existing: send
  .checkpoint("waiting")                                      // existing: checkpoint; camelCase [C2, C5]
  .advance("2 seconds")                                       // existing: advance
  .checkpoint("paid")

// checkout.test.ts: the runner's own expect [C1]
test("busy then paid", async () => {
  const { waiting, paid } = (await busyThenPaid.run()).checkpoints        // existing: run, checkpoints
  expect(waiting.state).toBe(S.WAITING)                                   // NEW on a checkpoint: state
  expect(waiting.memory).toMatchObject({ busyTries: 1 })                  // NEW on a checkpoint: memory
  expect(paid.state).toBe(S.DONE)
  expect(paid.read(Stripe)).toMatchObject({                               // existing: read [W23]
    charges: [{ key: paid.attempt(O.pay, { n: 1 }) }],                    // RENAMED: Story.attempt -> checkpoint.attempt [W24]
  })
})
```

### 1.2 Added, renamed, dropped

| Change | Words | Why |
| --- | --- | --- |
| **Renamed** | `Story.make` → `Story.app`, `Story.machine`, `Story.fragment` | W1 |
| **Renamed** | `Story.records(k, f)` → `cp.records(k, f)`; `Story.inspection` → `cp.inspection`; `Story.entity(E, k)` → `cp.entity(E, k)`; `Story.attempt(O.x)` → `cp.attempt(O.x)`; `Story.now` → `cp.now` | C3, W23, W24 |
| **Renamed** | `Fake/Lost` → `Fake.Lost` (tag `FakeLost`); `accept` → `refuse` | fakes-v2 |
| **Renamed** | `AmbiguousAttempt` → `AmbiguousRead` (H4); `Domain.propertySteps` → `domainPropertyOptions` (H10, RV1 L12); `Story.World` → `Story.Step` (RV2 M10); the record kind `frame` → `delivery` (RV1 L2) | P |
| **Added, decided** | `cp.lane(O.x, key)` (C3), `cp.state`, `cp.memory`, `cp.operations` (as C1's example reads them), `run.frames.truncated` (W25) | |
| **Added, fakes-v2** | `frame`, `refuse`, `end`, `send` as a list, `socket.frames`, `.close`, `.end`, `Fake.Refused`, `Fake.Closed`, the client stream read `server.socket(…)`, the route table (`endpoint`, `input`, `params`, `query`, `body`, `headers`), `after`, `match: { input }`, the `delivery` record | |
| **Added, P** | `cp.tabs.<name>.inspection` (H5), `cp.schedules` and `cp.lane(address)` (RV1 M15, M5), `whenQuiet` on `propertyTest` (H9), the types `Story.Frame<Subject>` (RV1 M7) and `Story.Step` (RV2 M10), `release({ match })` (RV2 M9), a `storage` field on a cut (RV2 L1), `result.source` (RV1 L9). Raised, not typed: `PropertyTestFailed` (H8), `StoryFakeError` (RV1 H4), `SubjectAbsent` (RV1 M4), `NoConnection` (RV1 H5). Recorded: the `UnusedWireRule` diagnostic (RV1 M17). A data form for every step, with no new word (RV1 H3) | |
| **Dropped, decided** | `.expect`, `StoryExpectationFailed`, Stories T5 B3 (C1); `@flow-state/vitest`, `storyTest`, `at` as a read (C2, C4 and the decisions' proposed list, confirmed by the brief for this file); matchers `toHaveLane`, `toHaveRecord`, `toBeIn` deferred (C4); `Story.property`, the `properties` option on a Story (W25); `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.now` (W24); `.do(…)` (W37); `process()` (W2); `model()` (W39); `run.calls`, `checkpoint.exit` (W34); the `frames` option (W22) | |
| **Dropped, fakes-v2** | `accept`, every tuple result, `{ to, send }`, `Fake/Lost` as a string, a handler that is an Effect | |
| **Dropped, P** | `latency`, `response` as an Effect, `headers` on `Fake.stream`, public `run.steps` (RV1 M1, section 8; main session's cuts); `message` on `Fake.stream`, `signal` on `run` (RV2 section 8; main session's cuts); owner recording on gates, late wakes (RV2 H1, M1); `Fake.storage.from`'s `{ at }` (RV1 M6); the fake-server rank's handler sleeps (only a `ping` sleeps now, v3); `Entity.get`'s `shape`, `descriptor.get(checkpoint, …)`, `Domain.entry.get(checkpoint, …)`, `Entity.queue(checkpoint, …)` (RV1 M15); `services?` on a machine Story (Testing O1; `fixtures` covers it, RV1 section 5); a failure's `{ step, cut, target, path, expected, actual }` shape, expectations and violations shown in the player (H3, H11) | |
| **Unchanged** | every step except `expect`, the words `hold`, `release`, `drop`, `duplicate`, `world`, `together`, the order at equal instants other than rank 1, the stand-in host, tabs, `checkpoint(…, { at })` | |

### 1.3 The holes left by removing `expect`, and how each is resolved

All of these are **[P]** unless a decision is cited. "H*n*" here is this table; "RV1 H*n*" is the review.

| # | Hole | Resolution | Where |
| --- | --- | --- | --- |
| H1 | Rule 1: objects match the listed keys | `toMatchObject`. Probed on Vitest 5.0.5: extra keys ignored, nested | 2.10.6 |
| H2 | Rule 1b: "a key listed as `undefined` matches only an absent key" | **`toMatchObject` does the opposite.** Probed: `expect({}).toMatchObject({ a: undefined })` **fails**, `expect({ a: undefined })` passes. Use `.toBeUndefined()` on the read. `.not.toHaveProperty` fails on a key held as `undefined`, which memory and logged input can have (RV1 L1) | 2.10.6 |
| H3 | Rules 2 and 3: arrays element by element with equal length; primitives exact | `toMatchObject` already does both. Probed: a longer actual array fails, `[]` against `[x]` fails. The failure shape `{ step, cut, … }` is gone; the runner prints its own diff, and the checkpoint's name in the test says where. If that proves weak, C4's deferred matchers answer it | 2.10.6 |
| H4 | Rule 4: a state token matches at or below it. Rule 5: `Story.attempt` as a matcher, and `AmbiguousAttempt` | Leaf: `expect(cp.state).toBe(S.X)` (C1; a snapshot's `state` is the leaf token by identity). Parent: `expect(S.WIZARD.is(cp.state)).toBe(true)`, the existing `token.is` (Machines O2), so no new word and C4's `toBeIn` stays deferred. `cp.attempt` is a plain read returning the Attempt's id or `undefined` (W24 settles where; the desk's design gap in `editor.test.ts` asked what it returns). Several matches without `n` throws `AmbiguousRead`, never guesses | 2.10.6 |
| H5 | `Story.inspection({ tab })` has no spelling once `inspection` is a value on a checkpoint (W24) | `cp.tabs.b?.inspection`, using Testing O7's existing `tabs.<name>`. `inspection` alone is tab `"main"`, as every default is (RV1 M3) | 2.10.6 |
| H6 | Reads run **after** the run, when the Runtime is gone, so a read can no longer ask a live Runtime | Cuts and named `{ at }` frames capture the full `inspection`; other frames capture `work` and lanes only (RV1 M6). **Memory is unmeasured** | 2.10.6 |
| H7 | "This never shows", across a whole run | A loop over `run.frames` (W25), with a plain function a test and `propertyTest` can share. The iterator throws `FramesTruncated` after the last kept frame, so a `for … of` cannot finish quietly (RV1 M14); `.every` and `.map` can (RV2 L5) | 2.10.6, 2.10.18.4 |
| H8 | `propertyTest` must judge (W25, W38), while C1 removes `StoryExpectationFailed` | It resolves on `Pass` and **rejects** with `PropertyTestFailed { result }` on `Fail` or `Inconclusive`, so `test("x", () => propertyTest(…))` cannot pass silently. Prior art: fast-check's `assert`. `FramesTruncated` becomes a `Fail` reason. All runs complete unless one fails (RV1 H2). Flow's own read errors are `PropertyDefect`, never violations (RV2 M5) | 2.10.16 |
| H9 | A property about the end of a run ("nothing left on a card"). The Checkout app assumed a `frame.settled` no design defines | `whenQuiet` beside `properties`, at a quiet phase defined as ordinary steps (RV1 H2) | 2.10.16 |
| H10 | The emitted counterexample Story had its properties in its options. Now it holds none, so running it passes | The result carries `{ story, source, property, violation, at }`. `source` is the appended steps, chained from the author's `base` (RV2 M12). To keep it as a regression, paste `source` and run the same function in a test. The domain preset supplies steps and properties both, so it becomes `domainPropertyOptions`, exported from `flow-state/testing` (RV1 L12) | 2.10.16 |
| H11 | The player showed expectations and violations at their frames (SG4) | Dropped: a Story holds none. The player still shows the emitted Story, and `result.at` says where to inspect | 2.10.13 |
| H12 | `describe` lines | W40: no expectation or property lines. Prints subject, options, steps, checkpoints, and every fake the plan names (RV1 M9) | 2.10.14 |
| H13 | `flow story run` exit status | W40: reports what ran, no pass or fail on correctness. **[P]** It exits 2 when `run()` rejected, under CommandLine's "Story execution" failure, prints `issue` records and unused wire rules, and a product `issue` alone never fails it (RV1 H4, M17) | 2.10.14 |
| H14 | Coverage text | Coverage reads records of Stories, so it is unaffected, and it says **reached, not checked** | 2.10.14 |
| H15 | When `run()` rejects (decisions "to settle") | On a real Story error, and on a broken fake (`StoryFakeError`, RV1 H4), never on a value. After a resolve `run.checkpoints` has every declared key. After a rejection, partial evidence is on the `FlowError` (Testing O8) with the checkpoints reached | 2.10.1 |
| H16 | `state`, `memory`, `operations` on an app Story, and on an absent subject | They exist only on `Story.machine` and `Story.fragment` cuts (a type error on an app Story, which uses `read(ref)`). They are not nullable and **throw `SubjectAbsent`** when the subject is absent; `read()` is the one that returns `undefined` (RV1 M4) | 2.10.6 |
| H17 | `lane(O.x, key)` when an app or a fragment has several | `lane(address)`, the same address as `match`, for an app Story and for a fragment's read or stream (RV1 M5). A mismatch throws `AmbiguousRead`. For a write, it reads the Inspection listing, so an unbound or unplaced lane is **not** reported as gone | 2.10.6 |
| H18 | Rule 63 said "reads and expectations are data" and "code lives in properties, which are options" | Rewritten: the Story is data; code lives in fakes and in tests | rule 63 |
| H19 | Rule 65 listed `Story.attempt` | `attempt` on a cut | rule 65 |
| H20 | `since` in a record filter took a name "since a plan exists before any run" | The reason is gone but the spelling stays: a name is type-checked on a Story's own cuts, and `string` on `Story.Frame<Subject>` (RV1 M7) | 2.10.6 |
| H21 | `run.frames` when truncated: which frames stay? | The first 10,000 stay; a named `{ at }` frame and every step cut are kept regardless | 2.10.6 |
| H22 | Streams' `expect(…, { connections })` (merge 6's 2.11 names it) | `cp.read(Chat.socket)`, the endpoint's log. Section 11 lists the rest for merge 6 | 2.10.9, 11 |
| H23 | Record-kind count. fakes-v2 said "fifteen" because 3.6 said "fourteen" | Counting 2.10.6's table: **21** names with `delivery`. It is "the kinds `records` takes", not all of Inspection O4's (RV1 L3) | 2.10.6, 3.6 |

### 1.4 The revision from round 1, by root cause

`reviews/round-1.md` is "RV1"; RC*n* is its section 7. All **[P]**.

| Root cause | What changed | Findings |
| --- | --- | --- |
| **RC1. A property was asserted with no mechanism** | The settle is a fixed-budget drain (rule 61; its classification and late wakes were replaced in 1.5). Probed in Chromium. The server registry is stated. Frame capture is narrower | RV1 H1, M6, M9 |
| **RC2. No rule for how words combine across kinds** | One combination rule above the wire tables, then the missing rows. Attempts and frames have separate rule lists. A word on a handle is the whole device. Stream phases, refusal per binding, and storage holes are defined | RV1 H5, M11, M12, L11 |
| **RC3. Steps had no data form, though a Story is data** | Every step has a form keyed by its method name, used by `together` and `propertyTest`. `result.source`, `Story.World` | RV1 H3, L5, L9 |
| **RC4. C1 removed the place that noticed things** | A broken fake rejects the run. An unused wire rule is a diagnostic. A truncated loop throws. A no-op `drop` is `NoConnection` | RV1 H4, M14, M17 |
| **RC5. The quiet point was not a step** | The quiet phase ends the world in ordinary steps, which the emitted Story keeps | RV1 H2 |
| **RC6. Slow answers added states to one table** | `latency` and `response` as an Effect are cut. `handle` is pure and always answers synchronously. One FIFO answer list. The crash row is five cases. W17's recipe is in 2.10.4 | RV1 M1, M2 |
| **RC7. Which tab, which subject, was a default stated in several places** | "main" everywhere. `SubjectAbsent`. Absent is defined per stand-in state | RV1 M3, M4, M15 |
| **Not a root cause** | M7, M8 (types, spiked under the repo's flags), M10 (documented, C5 kept), M13 (one clock), M16 (the chat example), L1–L12 | |

### 1.5 The revision from round 2 and the model

`reviews/round-2.md` is "RV2"; `model/RESULTS.md` is "MDL". All **[P]**.

| Root cause | What changed | Findings |
| --- | --- | --- |
| **Rule 61 attributed per fiber and per settle what is only knowable for the whole run** | A run never yields to the host between its first step and its cleanup. `HostTimeWait` is classified once, at the end, from the world. Owner recording on gates and late wakes go. Idle hops reset on any arrival at something of Flow's. A hop cap per instant. Batched `via.attempts` is stated as it is | RV2 H1, M1, M2, M11, MDL (d) |
| **A connection's held state had no owner, and frames rules competed like arrivals** | One general rule in 2.10.4: arrivals take one rule; frames rules do not compete, and a connection is silent while any hold covers it; `release` ends its rules first, then delivers; queues are per connection in open order. `release({ match })`. These answer eleven gaps at once | RV2 M8, M9, L4; MDL G2, G4, G5, G6, G7, G8, G9, G12, G16, (a), (b) |
| **The answer order had two readings** | One order for a handler's outcome: copy, marks, `gone`, otherwise. Released answers join the list before released requests' handlers run | MDL G1, G3, (c), (e) |
| **A thrown read and a found violation shared a channel** | `PropertyDefect`; `StoryTurnLimit` and `HostTimeWait` under generation are `Inconclusive`; truncation does not stop the search | RV2 M5 |
| **Noticed, but nobody was told** | The earliest error is primary. `console.warn` for diagnostics at the end of `run()`; "fired" is defined | RV2 M6, M7, L5 |
| **A claim without a mechanism** | `source`, a cut's `storage`, the executor's own Clock, quiet's definition, step forms in full | RV2 M4, M10, M12, L1, L2, L3 |
| **Cuts** | `message`, `signal`. `checkpoint(…, { at })` **stays**: the owner saw it in the walk, and presentations need the moment | RV2 section 8 |

Section 1.6 replaces this table's "classified from the world".

### 1.6 The revision from round 3 and the model's re-run

`reviews/round-3.md` is "RV3"; MDL N1–N6 are the re-run's. All **[P]**. No new word.

| Root cause | What changed | Findings |
| --- | --- | --- |
| **Classification asked who could wake a fiber, rather than waking what can be woken** | Finish the world, then look. Connection owners and the deadline-owner test go; Clock owners stay for ranks. `HostTimeWait` is reworded, and the four cases it misses are stated | RV3 M1, M7 |
| **Limits stopped at "per instant" and "before cleanup"** | A deadline limit per `advance`. Cleanup has a free-running Clock and its own bounds. Runner timeouts are stated correctly | RV3 M2, M3 |
| **A run's end was treated as always reached, and the Clock's edge as obvious** | A zero sleep is a yield. A parked build rejects at the start. Classification runs at every rejection boundary | RV3 M4, M5 |
| **A rule's exception was written in one table and not in the general rule** | Two sentences join 2.10.4's rules: **a `release` must do something**, and **a rule ends when it has nothing left to do**. Counts and duplicates are defined per rule | RV3 M6, L2, L3, L4; MDL N1–N6 |

### 1.7 The revision from streams proposal v3

`merge-6-streams/proposal-v3.md` section 10 is "v3". All **[P]**. Its 12 changes are applied: a fake's heartbeat (`ping`) and its rank, rules and table row; `timer` values; row and `session` fields; reload Stories; jitter; coverage. The addendum's U1–U3 are folded into rule 61, 2.10.4 and 2.10.17. Section 10 lists what v3 asked that needs your eye. Section 11 is rewritten for v3.

## 2. Rules

Replaces rules 11 and 61–66 of `machine-design.md` 2.4.

11. **Tested alone** (Stories T3; W1, W5, W30–W34). `Story.fragment(fragment, { id, fixtures?, world? })` runs the fragment
    in an invisible **stand-in host** whose placement its declaration alone decides (2.10.12). `enter(input?, { subject? })`
    starts it, with its `Input` record; `leave()` ends it, or freezes a resumable trait; `leave({ end: true })` ends a
    frozen one; `reset(subject)` (traits) changes its reset value; `guards(answers)` sets the stand-in's guard answers
    (default: allow); public `events` and `hostEvents` may be sent. Notifications, `whenAbandoned` included, are `callback`
    records and exits are `exit` records, the same as in a host (rule 58).

61. **Every step settles** (W2, W4; Stories T5 B1, T7; the mechanism is [P, RV1 H1, RV2 H1, M1]). A run never yields to the host between
    its first step and its cleanup. Every step applies its input, then settles on a microtask-only run scheduler (Effect 4.0.5's
    `MixedScheduler` with `executionMode: "sync"`): the settle's drain re-queues microtasks until `K` consecutive hops show no arrival at
    anything of Flow's and no scheduler activity. A settle that does not end within the hop cap is `StoryTurnLimit` with `reason: "Settle"`.
    After the last cut, if a commit or read fiber is parked, the run **finishes the world**: it releases held items, closes connections and fires deadlines up to a fixed horizon, settling after each, with nothing of this reaching the evidence. It looks only at fibers already parked at the last cut; a fiber the phase itself starts is not reported [P, MDL U3]. A fiber still parked is `HostTimeWait`: real host work, or something only a later step could wake. A session or setup-scoped fiber may wait. An `advance` fires at most 100,000 deadlines (`StoryTurnLimit`, `reason: "Advance"`). During cleanup the Clock runs free, and cleanup may yield. `advance(d)` settles at every deadline it passes, in a
    documented total order (2.10.17.5; W8). There is no `process()`. **Limits, stated:** a commit on an in-app latch only a later step opens is rejected; a real wait under its own timeout, a cancelled fiber's real wait, and fire-and-forget host work (a `setTimeout` nobody awaits) are not caught [P, RV3 M1].

62. **The world is fakes** (W11, W12; Stories T2, T5 B2). Everything outside the client is a **fake server**: one per
    run, holding typed truth and a log of what it received, shared by every tab and reload, and set up before the
    subject starts (the `world` option, W13). It is reached through declared **endpoints** whose wire the Story controls
    with four words (`hold`, `release`, `drop`, `duplicate`; W18). A handler decides the result and never the wire
    [fakes-v2]. The network can keep a request after its client is gone; local storage cannot. A fake never writes client
    truth and never produces an ending: every ending comes from a fake's answer through the commit's real classification,
    or from a lifecycle step. No ending is injected (Testing O3). A broken fake is a broken run: `StoryFakeError` [P, RV1 H4].

63. **A Story is data; checks are the test's** (C1, W25; T4). A Story is a transcript of inputs and checkpoints, and
    plans and controls are data. Code lives only in fakes and in tests. Flow owns no assertions: tests use the runner's own
    `expect` over `run.checkpoints` and `run.frames`. `propertyTest` is the one thing in Flow that judges, because it
    must search and shrink (W25, W38); its properties are plain functions, never part of a Story. Every step has a data form,
    keyed by its method name [P, RV1 H3]. Testing O1's no-callbacks rule holds for steps.

64. **Every step has its own cut** (W22; Stories T5 B4). Every step ends with a **step cut**: its latest publication
    frame plus the evidence position, fake truth and wire state at the step's end, so a step that publishes nothing still
    reads its own effects. Every committed publication is also a frame. Every cumulative fact is one record in one ordered
    evidence list. A checkpoint names a step cut, and is read after the run: every read is answered from what was
    captured then (C3, W23, W24) [P]. The list of cuts is internal, for the player; a test reads named checkpoints [P, RV1 section 8].

65. **One address** (Stories T6). One **address** names a thing everywhere: `{ actor?, instance?, copy?, operation?,
    schedule?, timer?, key?, tab?, life? }`. Wire `match` (an address plus kind fields such as `purpose` and `input`), the
    `attempt` read (with the kind field `n`), the `lane` read, record filters, `advance({ next })` (W7) and step targets take it; a request's `via` and
    every record carry the same fields. No ordinal across actors, hosts or tabs. `operation` takes a visible handle (a
    definition's `O.x`, or a fragment's write through `Fragment.O.x`, as a name only, so rule 50 holds); a fragment's read
    or stream is named by `instance` and the operation's name (2.10.6; delegated, at merge). `timer` names Flow's own session sleeps (*Stream details: merge 6*).

66. **The owner decides.** Each behaviour is decided by the declaration that owns it: the stand-in host's placement by
    the fragment's declaration (W30), what a lost request raises by the transport binding, what a server failure looks
    like on the wire by the binding, a hydration source's world by the run it hydrates into (W29), and whether a value is
    right by the test. Never by later steps or by the fake author's Effect code.

## 3. Section 2.10, as it should read

### 2.10 Stories

Rules 61–66 are normative; this section shows them, and 2.10.17's tables are normative for the executor. The examples
are 2.10.18.

**Where the inputs come from.** Production gets input from three places: **the user** (sends and lifecycle), **time**
(the Clock) and **the world** (servers, the network, storage). A Story is a plan of those inputs, as data, with named
**checkpoints** (C1). Each input is applied to the production Runtime, which is then left to do everything it would do
before the next input could arrive (rule 61). The world is a set of **fakes** that hold server truth and answer through
the real transport boundary; Flow never injects an ending, so the commit's own classification always runs (rule 62, W12).
What a **test** checks is a value read from a checkpoint, a **cut** a step left (rule 64), with the runner's own `expect`,
one way to name a thing (an **address**, rule 65) and one home per kind of record.

**Concepts per tier** (recounted **[P]**; section 7 has the words with their marks). The merged table said 13, 18 + 8 and
5. That omitted options and every word inside a fake, so it undercounted. Below is every word this section shows an author typing,
on the Story side and the fake side. Not counted: the runner's `expect`; fields read off a record (`phase`, `via`, `channel`,
`reason`, …), since they are read, not written; record-kind strings (21, 2.10.6); error names, since they are raised; and words of
the design used here, such as `deny` (RV1 L4).

| Tier | Count | Words |
| --- | --- | --- |
| **Common** (a scripted test of one machine, as 2.10.18.1–2) | **34** new, 5 reused | Story, 10: `Story.machine`, `id`, `fixtures`, `world`, `send`, `advance`, `next`, `checkpoint`, `run`, `checkpoints`. Reads, 8: `read`, `lane`, `records`, `since`, `attempt`, `n`, `now`, `run.end`. Fake, 11: `Fake.server`, `truth`, `initial`, `endpoints`, `Fake.call`, `request`, `handle`, `response`, `controls`, `Fake.control`, `Fake.Lost`. Wire, 5: `hold`, `release`, `drop`, `at`, `times`. Reused: `input`, `state`, `memory`, `operations`, `schedules` |
| **Uncommon** (apps, fragments, domains, reloads, tabs, streams, transports, SSR) | **43** new, 13 reused | Subjects, 2: `Story.app`, `Story.fragment`. Steps and options, 12: `together`, `dispose`, `how`, `reload`, `guards`, `suspended`, `from`, `subject`, `end` (on `leave`), `settled`, `turn`, `step` (the last three in `checkpoint(…, { at })`). Wire, 4: `duplicate`, `match`, `purpose`, `after`. Fake, 20: `Fake.storage`, `Fake.stream`, `frame`, `open`, `ping`, `every`, `frames`, `refuse`, `end` (on `open`, and `socket.end`), `send`, `close`, `Fake.fetch`, `endpoint`, `params`, `query`, `body`, `headers` (the route context), `Fake.webSocket`, `Fake.Refused`, `Fake.Closed`. Reads, 5: `inspection`, `entity`, `tabs`, `run.frames`, `truncated`. Reused: `ensure`, `openTab`, `closeTab`, `enter`, `leave`, `setContext`, `dehydrate`, `hydrate`, `within`, `maxBytes`, `label`, `serverView`, `input` (in a route) |
| **Rare** (policy cells, property tests, upgrades) | **17** | `to`, `reset`, `nth`, `storage`, `Fake.storage.seed`, `Fake.storage.from`, `seed`, `propertyTest`, `steps`, `properties`, `whenQuiet`, `runs`, `length`, `quietWithin`, `domainPropertyOptions`, `Story.Frame`, `Story.Step` |
| **Total** | **94** new, 18 reused | v3's `ping` and `every` add 2 [v3 item 1]. Round 2's cuts of `message` and `signal` took 2. `Story.World` became `Story.Step`, same count. `release({ match })`, the data forms and round 3's rules add no word |

**Removed** from the plans' Story surface: `process()` (W2), `advanceTo`, `advanceToNextTimer` (W6), the `frames` option and
frame collapse (W22), `run.calls`, `checkpoint.exit` (W34), the checkpoint predicate (C2, C16), `Story.ending` (never
adopted, W12), `Story.make` and the lowercase `story.app` / `story.machine` (W1), `.expect`, `StoryExpectationFailed`,
`Story.property`, the `properties` option on a Story (C1, W25), `Story.records`, `Story.inspection`, `Story.entity`,
`Story.attempt`, `Story.now` (W24), merge 6's `.do(…)` (W37) and `story.suspend` (its 2.11; W9), `model()` (W39), `run`'s `signal` and `frames` (W22; P, RV2 section 8), and
Testing O4's `pending` for work.

#### 2.10.1 What a Story is

`Story.app(setup, options)`, `Story.machine(machine, options)` and `Story.fragment(fragment, options)` (W1) each return an
inert plan (STR2): the subject, its options and an ordered list of steps. The kind is visible on the line; handing the
wrong kind to a constructor is a type error. Constructing, importing and discovering a Story start nothing. Each chained
step returns a new plan; a prefix never changes, and nothing in a prefix depends on later steps (rule 66), so branches are
plain variables and each branch runs in a fresh Runtime. A plan holds inputs and checkpoints, and no checks (C1).

| Constructor | Subject | Options (exactly what the subject declares, STR1) | Steps that type-check beyond the common ones |
| --- | --- | --- | --- |
| `Story.app` | an app setup (`RuntimeSetup`) | `id`, `fixtures?`, `world?`, `storage?`, `seed?` | `ensure(ref)`, `dispose(ref, { how? })`, `send(target, …events)`, `openTab`, `closeTab`, `reload`, `dehydrate`, `hydrate` |
| `Story.machine` | a machine | `id`, `input` (iff declared), `context` (iff declared), `fixtures?`, `world?`, `seed?` | `send(…events)`, `setContext`, `dispose()`, `ensure()` (another incarnation of the same identity) |
| `Story.fragment` | a trait or a subroutine alone | `id`, `fixtures?`, `world?`, `seed?` (input is given at `enter`) | `enter(input?, { subject? })`, `leave(options?)`, `guards(answers)`, `reset(subject)` (traits), `send` of `events` and `hostEvents` |

**The start** (SP RC3, SP N1; W13). A run builds the fake servers, applies the `world` option's controls to them in order
(server controls and standing wire rules; nothing is held yet, since nothing has been sent), and only then bootstraps
the first tab (an app) or starts the subject's actor (a machine; a fragment is started by `enter`). So "the server
already holds X when the screen opens" is one option, printed by `describe`, and the actor's first read meets it.
`world` is the same data `.world(…)` takes; there is no second spelling.

**Targets** (rule 65, SP N2). In an app Story a step names its actor with a ref, or with an address when more must be
said: `{ actor: Workspace, tab: "b" }`. A send takes a target, then events: `send(target, …events)`; there is no
trailing options object, so the event list stays unambiguous to the type checker. A machine Story's steps need no
target. A fragment inside an author-written test host is a machine Story over that host. Every subject's Effect
requirements (`R`, a fragment's through rule 57) must be met by `fixtures`, so a missing fake is a type error at the
constructor (STR12, STR63).

**Ids and discovery** (STR4, STF61, STF73). An id is non-empty and **unique across the configuration**, so `flow story
run <id>` needs no scope. `defineConfig({ apps: [{ app, stories }], stories })` lists app Stories under their app and
Stories with no app at the top level; a trace of the latter has `appId: null`. Discovery rejects duplicate ids before
acquiring anything (Testing O1).

**Every step has a data form** [P, RV1 H3, RV2 M10], keyed by its own method name, with no new word. `Story.Step` is the type of any of them (RENAMED from `Story.World`), so a helper can annotate one, since an unannotated literal widens to an array and fails to assign; the `world` option is `ReadonlyArray<Story.Step>` narrowed to controls.

| Step | Data form |
| --- | --- |
| `send` | `{ send: [target?, ...events] }`; a bare event on a machine or fragment Story |
| `world` | a control; `{ world: [...controls] }` |
| `advance` | `{ advance: d }`, `{ advance: { next } }`, `{ advance: { to } }`, `{ advance: [d, { suspended }] }` |
| `together` | `{ together: [...inputs] }` |
| `ensure`, `dispose` | `{ ensure: [ref?, options?] }`, `{ dispose: [ref?, options?] }` |
| `enter`, `leave`, `reset`, `guards` | `{ enter: [input?, options?] }`, `{ leave: options }`, `{ reset: subject }`, `{ guards: answers }` |
| `setContext` | `{ setContext: context }` |
| `openTab`, `closeTab`, `reload` | `{ openTab: [name, options?] }`, `{ closeTab: name }`, `{ reload: name }` |
| `dehydrate`, `hydrate` | `{ dehydrate: [label, options] }`, `{ hydrate: [source, label?] }` |
| `checkpoint` | `{ checkpoint: [name, options?] }` |

**`together` takes a send, a control or `{ advance }`, and anything else is a type error**, since nothing else has a defined meaning there; a nested `together` is one. `propertyTest`'s `steps` take every form but `checkpoint`. `describe` prints these.

**Running** (STR3). `story.run()` is the one execution boundary. It takes no `signal`: a run never yields to the host (rule 61), so `abort()` could not be called during one, and a runner's timeout cannot interrupt a run; it reports when the run ends, so a finished run over the limit fails with "Test timed out" [P, RV2 M1, RV3 M2]; the hop cap, the turn limit and the deadline limit bound it. Section 10 lists the change to Testing O8. It returns a `StoryRun` (`frames`, `steps`,
`checkpoints`, `end`, `evidence`, `payloads`, `trace`; cuts for every step exist per W22, and their list is internal, for the player [P, RV1 section 8]), or rejects with a `FlowError` that carries the same evidence up to
the failing boundary (Testing O8). **It rejects on a real Story error** (`StoryTurnLimit`, `HostTimeWait`,
`StoryInvalidCommand`, `InvalidDuration`, a failed acquisition, a cleanup failure) **or a broken fake**
(`StoryFakeError`, 2.10.4), never because of a value (C1), so after a resolve every declared checkpoint is present and typed
**[P, H15, RV1 H4]**. **The earliest recorded error is primary, and later ones are listed** [P, RV2 M6]: a route typo that makes a later `release` `NothingHeld` reports the route. **Classification runs at every rejection boundary, and "earliest" orders by the step where a fiber parked** [P, RV3 M5], so a commit parked on a real `fetch` at step 2 and a `NothingHeld` at step 4 report the `fetch`. A fiber's parked step is the last step whose settle saw it run; how to read that is left to the executor (`currentOpCount` is untested) [RV3 section 2]. `InvalidInput` is the one edge where a value rejects: it is a contract check by the fake's author, and a Story of the server refusing bad input declares a loose `request` and answers 422. **`run()` writes each diagnostic through `console.warn` at its end** (`UnusedWireRule`, 2.10.4); it fails nothing, and it is how a test runner's reader is told [P, RV2 M7]. Each `run()` is a fresh run; a test that reads several checkpoints runs once and destructures. A checkpoint
and its Story cannot share a name there: `const { paid } = (await paid.run()).checkpoints` is TS2448. Keep C5, and name the
Story differently: `const { paid } = (await paidFirstTime.run()).checkpoints` [P, RV1 M10]. Direct and CLI runs agree.

#### 2.10.2 Steps, and what each one runs (rule 61)

**Settling** (W2, W4; Stories T5 B1, T7; the mechanism is [P, RV1 H1, RV2 H1, M1, M2]). **A run never yields to the host between its first step and its cleanup.** The executor runs every tab's Runtime and every fake on one deterministic, **microtask-only** run scheduler: Effect 4.0.5's `MixedScheduler` with `executionMode: "sync"`, whose dispatcher uses `setMicrotask` and never hands a fiber to a macrotask. So no host task runs during a run, and the result never depends on host speed. The start acquires fixtures and bootstraps as a step would, settling [RV2 L3]. **A build still parked after the start's settle with no deadline rejects there**, since nothing can wake it [P, RV3 M5]; a fixture needing host work finishes it before the Story runs, by a top-level `await` in the module, so its result reaches the Layer. **What a run uses is built in the run**: a `Queue` made by `Effect.runPromise` at module level keeps its creator's dispatcher and never wakes its taker (`Queue.ts:488`) [RV3 L1]. Two parts:

1. **The settle's drain, not an emptiness check.** Nothing can observe an empty microtask queue from inside one, and the scheduler's task count reaches 0 while a promise chain still runs (RV1, `settle.ts`); a fiber working through promises shows no scheduler activity at all (RV2 `http.ts`: 20,000 chunks stopped at exactly 4,096 reads). So the settle re-queues one microtask until `K` consecutive hops show **no scheduler activity and no arrival at anything of Flow's**: a mailbox, a gate, the Clock, a connection's or body's pull. `K` is a fixed constant, proposed 4096, about 0.06 ms on Bun and 0.72 ms in Chromium. A chain of up to `K` idle hops completes; a longer one is cut there, at the same point on all three engines, since hop cost is identical (RV2 `engines.ts`) [MDL (d)]. The drain also runs the answer list: a settle ends with the list empty (2.10.4). A settle still showing activity at the **hop cap** (proposed 1,048,576 per instant) rejects as `StoryTurnLimit` with `reason: "Settle"`, naming the step, the instant and the fiber's owner that scheduled most, which catches a loop below the commit that takes no turns (`Stream.paginate`, `Effect.forever`) [RV3 section 2]. A synchronous `while (true)` in a handler hangs as in any JS; only a debugger helps. **An `advance` fires at most 100,000 deadlines** (proposed): `StoryTurnLimit` with `reason: "Advance"`, naming the owner that fired most, since a settle costs `K` hops whatever it does, and `advance("1 day")` over a 1 ms ticker is hours [P, RV3 M2].
2. **Finish the world, then look** [P, RV2 H1, RV3 M1]. No fiber is attributed at each settle: an owner does not cross a promise, a queue, a shared lock or a batch, so per-settle attribution rejected Checkout's 3-D Secure and the desk's batches (RV2 `owner.ts`). And since no host task runs during a run, a host-waiting fiber cannot progress, so nothing is lost by asking at the end. Asking who *could* wake a fiber brings the same attribution back, so the run wakes what can be woken instead. After the last cut, only if a commit or read fiber is parked: release every held item, close every open connection as the network would, and fire deadlines up to a fixed horizon (proposed 1 hour of virtual time, or the deadline limit, whichever is first), settling after each. **A fiber still parked is `HostTimeWait`: "still parked at the end of the run: real host work, or something only a later step could wake", naming its owner and the step it parked at.** The run then rejects. A session or setup-scoped fiber may wait. **It looks only at fibers already parked at the last cut; a fiber the phase itself starts is not reported** [P, MDL U3]. **Nothing from this phase reaches the evidence:** no frame, record, truth read or diagnostic, and a rule it fires does not count as fired; what fakes do in it, a crash included, is not reported. `HostTimeWait` can also mean "a chain longer than `K`". The Clock records each sleep's owner, for the ranks only; gates and connections record none.

| Case (run on Bun, Node and Chromium with RV3's own minimum, not Flow) | Result |
| --- | --- |
| 3-D Secure, a batch, a semaphore, `Effect.cached`: released, or ending on the hold | Fine |
| A batch mid-window; its first commit cancelled mid-window | Fine |
| A streaming write with a silent body, opened in the commit or by an SDK's fiber | Fine: closing wakes it |
| RPC over a setup socket, the Story stopping before the push; a token bucket; an SDK sender mid-window | Fine |
| A fake's Clock `ping` on an open connection: a session waiting on it, not host work (2.10.4) [P, v3 item 10] | Fine |
| A real wait, alone, with a setup-scoped heartbeat, with another connection open, with an unrelated hold, or with another operation's backoff | `HostTimeWait` |

**The four cases it does not catch, stated:**

1. **An in-app latch a later step opens, the Story stopping first: rejected**, though no host work exists. Add the step that wakes it. The message says so.
2. **A real wait under its own `Effect.timeout`: passes**, since the fired deadline wakes it. A stall test can pass without reaching a fake; section 11 item 9 is the real case.
3. **A cancelled fiber's real wait: passes.**
4. **Fire-and-forget host work**, such as a `setTimeout` nobody awaits: passes. No parked fiber exists, so a "nothing was sent" test can pass falsely.

Flow's own suite (V3) tests for false passes: a matrix of host primitives against exemptions, an always-on sentinel (a `setTimeout(0)` and a `MessageChannel` armed at run start, checked before cleanup, and firing is an internal error), and running Stories at `K` and 2`K` and comparing evidence [RV3 section 2].

**A Story is checked on the engine its tests run on** [P, RV2 M3]. The result never depends on host speed. It does depend on the engine, for one engine and version, because engines differ in what finishes in microtasks:

| Work, inside a settle | Bun | Node | Chromium |
| --- | --- | --- | --- |
| A 500-`await` chain; a `Response` subclass with resolved bodies; a plain `Response.body` reader | yes | yes | yes |
| `Response` or `Request` `.json`, `.text`, `.arrayBuffer`, `Blob.text` | yes | yes | **no** |
| `crypto.subtle.digest` | **no** | **no** | yes |
| `process.nextTick` | yes | **no** | n/a |
| A dynamic import in a commit | **no** | yes | not meaningful: the bundle inlined it [RV3 L7] |

So a client half returning `new Response(…)` can pass under Vitest on Node and reject in `StoryPlayer`, which records in the browser, and `flow story run` can differ from the tests. Playback may reject what tests accept. There are no guards on `fetch`, `WebSocket` or `crypto`. Microtask-only promises resolve inside the drain, in a fixed order. Firefox and Safari were not run.

While it runs, turns, pending resets, adoption deliveries, settlements, invocations, acknowledgements, fake handlers and
adapter pulls happen in production's order (2.5, P21; the FIFO mailbox). **Interleaving is fixed**: tabs take turns
one at a time in each name's first-open order (a reloaded tab keeps its rank); Attempts invoked in one settle reach their fakes in invocation order (tab order, then
the turn that promoted them); fakes' handlers run in arrival order. What waits for time or the world stays, and is read
as work (2.10.6).

| Step | Input applied | Then |
| --- | --- | --- |
| `send(target?, …events)` | each event is one step, queued as a view's send would be | settle; the verdict is a record (STR7) |
| `together(…inputs)` | admission is held in every tab while each listed input (a send, a control or `{ advance }`) arrives, in order: a send is queued; a control runs until its effects reach a mailbox or a gate; `{ advance: d }` moves time, firing each deadline so its event is queued, without turns | admission resumes, then settle (STR16); answers wait for that settle [P, MDL (e)] |
| `world(…controls)` | each control, in order: a wire word, or a server control (2.10.4) | settle (STR24) |
| `advance(d)` | time moves to now + d, stopping at every deadline on the way, in the order of 2.10.3, settling at each | settle at now + d |
| `advance({ next: address })`, `advance({ to })` | to the earliest unfrozen deadline the address matches; to an epoch millisecond at or after now | as `advance` |
| `advance(d, { suspended })` | a page in the background (2.10.3) | the tab's overdue timers fire, then settle |
| `ensure`, `dispose`, `openTab`, `closeTab`, `reload`, `enter`, `leave`, `reset`, `setContext` | the lifecycle command, as a host would issue it | settle |
| `guards(answers)` | the stand-in host's answers from now on (2.10.12) | nothing to settle |
| `dehydrate`, `hydrate` | Testing O7; dehydrate's time motion follows 2.10.3, deadline by deadline; a source runs on the run's clock (2.10.11) | settle |
| `checkpoint(name, { at? })` | nothing: it names the latest step cut (2.10.6) | nothing |

**`together` is the only concurrency word** (W3, W10; T4). It states a real interleaving: these inputs arrived before
the actor ran any of them. Its inputs are steps' data forms (2.10.1), so a targeted send is `{ send: [target, ...events] }`, and two tabs racing is `together({ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] })` [P, RV1 H3]. `together(Stripe.confirm.release(), E.Cancel())` settles the charge and queues its ending,
then queues `Cancel`; listed the other way round, `Cancel` is admitted while the ending waits, which is 2.7.13's "the
real ending if it had already settled" cell and the spike's P1 race. `together({ advance: "30 seconds" },
Stripe.confirm.release())` is the timeout-against-answer race: PAYING's `TookTooLong` and the landing answer are both
queued before either is admitted (SP N4). Inside `together({ advance })` **every woken fiber** (an
adapter's backoff, a setup-scoped heartbeat) runs until it reaches a mailbox, a gate or the Clock; only admission is
held, so a woken backoff may send a request, whose handler answers at once. A timer chain does not re-arm there,
because no turn runs. `together(E.Cancel(), { advance: d })` models a busy main thread: production fires a timer while
a click waits only when the thread is blocked.
Outside `together` a send never sits behind queued arrivals, because the previous step settled.

**Limits and errors** (STR5, Testing O2, O8). Each step may run 10,000 turns per instant; the 10,001st rejects with
`StoryTurnLimit` naming the step and the instant (a fake that always answers with another page loops at one instant
and is stopped here; the author bounds the fake). `InvalidDuration` rejects a negative, non-finite or backwards move.
`StoryInvalidCommand` names the step and one reason: `ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`,
`TabClosed`, `NothingHeld` (a `release` with nothing held **and** no standing rule to end, or a `release({ nth: k })`
when no queue has k, 2.10.4), `NoConnection` (a stream `drop()` with nothing to close, 2.10.4), `NoDeadline` (an
`advance({ next })` whose address matches nothing, W7), or a negative `hold({ after })` [fakes-v2]. `HostTimeWait` is above. Cleanup follows Testing O8.

#### 2.10.3 Time

One `advance`, with `{ next }` and `{ to }` (W6). One controlled clock per run: the executor's own `Clock`, since Effect's `TestClock` cannot rank owners or skip one tab's sleeps [P, RV2 L2]; a fixture providing `TestClock` hides its sleeps from it, so use the run's Clock [RV3 L6]. **A sleep of zero or less is a yield, as in Effect's Clock, and is not a deadline** [P, RV3 M4], so `Effect.retry({ times: 3 })` and `Schedule.spaced(0)` finish in the settle, and a `sleep(0)` loop reaches the hop cap. Work takes no virtual time (STR13). `advance(d)` is what
production does if d passes with nothing else happening: each deadline fires at its instant, the turns it causes run,
and a timer they re-arm inside the window fires too, so the dispatch desk's `lockedOut` runs its whole chain (STF20).

**A total order at equal instants** (W8; STR14, STF22). Every sleep has an owner, attached by Flow to the fiber that sleeps;
2.10.17.5 is normative. At one instant the sleeps wake one at a time, settling after each, by rank: **a fake's `ping`, so a tie with a client's `idle` keeps the connection alive** (by server name, then connection open order) [P, v3 item 1]; adapters (by tab, actor, operation, key), **setup-scoped fibers** (an SDK
client's heartbeat or backoff forked at layer build, a rate limiter: by layer order), the Runtime's own waits, then
actor schedules (by tab, actor, instance path in placement order, copy in list order, schedule key in list order).
Ties within an owner go by arming order. "Outside before inside" is a documented choice; a Story that needs the other
order uses `together({ advance })`.

**One clock** [P, RV1 M13]: a hydration source runs on it too (2.10.11).

**The next deadline** (W7; STR15, STF23, SP RV M3). `advance({ next: address })` moves to the earliest unfrozen deadline whose
owner the address matches: `{ schedule: "checkTick" }` (schedule names are type-checked against the subject, so a
typo is a type error, not a `NoDeadline`), `{ operation: O.messages, timer: "backoff" }` (a session's sleeps are Flow's,
so they carry `timer`: `backoff`, `page`, `healthy`, `idle` [P, v3 item 4]; `{ timer: "page" }` under the default schedule uses its own copy of it [v3 item 9]; the default is jittered, so a fixed `advance("500 millis")` cannot land on it, and a Story uses `next` [v3 item 11]; *Stream details: merge 6*), `{ actor: Checkout1 }`. An author's own adapter sleeps
(an idle deadline in the adapter's code) are addressed by operation only, the earliest of them. Adding an unrelated timer to the app (a toast, a heartbeat) cannot move the Story. A frozen
schedule has no sleep (rule 1), so it is never chosen. `advance({ to })` stays for the rare exact instant.

**A suspended page** (W9; STR17, STF78). `advance(d, { suspended: true })` (or `{ suspended: "b" }`) moves time while the
tab runs nothing: its timers, adapters and Runtime are paused; fake servers keep running and their pushes wait in the
tab's transport. At now + d the tab's overdue deadlines fire in deadline order, then its waiting transport input is
delivered, each settling.

**Time is readable** (W24; STR18, STF24). `cp.now` on any cut or frame; schedules keep the design's reads (`s.schedules.<path>.dueAt`,
keyed lists of `{ key, dueAt }`); `inspection.work` names every deadline with its owner, `dueAt` and `frozen` (2.10.6).

#### 2.10.4 The world: fakes

(Decided: the module, W11; `Fake` stands alone with its own narrow capabilities, and a mocking library is optional, W17, whose wording section 10 flags; no MSW binding now, W15. The spelling below is **[fakes-v2]**.) A fake has two
halves with two lifetimes, which is what makes one server per run possible without breaking per-tab fixtures (STR22,
STF13–STF15):

| Half | What it is | Lifetime | May depend on |
| --- | --- | --- | --- |
| **the server** (`Fake.server`) | typed truth, a request log per endpoint, handlers, controls | **one per run**: built first, given the `world` option, shared by every tab and reload, released last | nothing from a tab |
| **the client half** (a fixture: an ordinary Layer, or a binding `Fake.fetch` / `Fake.webSocket`) | the app's service or a transport, calling the server's endpoints | **one per tab**, as Testing O3's fixtures are | setup services (STF14) |

**Everything a fake remembers is server truth**, and so is every wire rule's remaining count (`times: 2` survives a
reload): a reload rebuilds only the client half, which holds no state (STF15). The dispatch desk's `DemoServer` is shadowed in
Stories by a fixture that provides it from the run's server (STF13).

**Where a server comes from** [P, RV1 M9]. `Stripe` is an Effect that gets or builds the server from a **run-scoped registry** the executor
provides. So it is not in a Layer's `R`, and "a missing fake is a type error" holds for the app's services, which is its point. A Layer is opaque,
so nothing can list the fakes behind a fixture until it runs (2.10.14). A server is a module value with no parameters; seeds are `initial` or a
`world` control. Controls and endpoints named `hold`, `release`, `drop` or `duplicate`, or one name used for both, are construction errors
[P, RV1 L8].

**A fake has three parts, and each answers one question** [fakes-v2]:

- **The result** of any handler: what changed, what is answered, what connections hear.
- **The wire** (W18): whether and when that reaches the client. Handlers never decide it.
- **The binding**: how the app's own transport reaches an endpoint.

Flow never asks the engine to do work that needs a host task (rule 61).

```ts
// stripe.fake.ts (test code). Source: fetch to the payment API, wrapped by the app's StripeApi service.
import { Fake } from "flow-state/testing"
import { Effect, Layer, Schema } from "effect"

const Charge = Schema.Struct({ intentId: Schema.String, key: Schema.String })        // user-defined
type Truth = { readonly charges: ReadonlyArray<typeof Charge.Type>; readonly busy: number }   // user-defined

export const Stripe = Fake.server("Stripe", {                                       // existing: Fake.server  // user-defined: Stripe
  truth: { charges: Schema.Array(Charge), busy: Schema.Int },                       // existing: truth
  initial: { charges: [], busy: 0 },                                                // existing: initial
  endpoints: {                                                                      // existing: endpoints
    confirm: Fake.call({                                                            // existing: Fake.call
      request: { intentId: Schema.String, key: Schema.String },                     // existing: request; logged, redacted by Inspection O5
      handle: (truth: Truth, req) =>                                                // existing: handle, pure; CHANGED: an object [W14]
        truth.busy > 0 ? { truth: { ...truth, busy: truth.busy - 1 }, response: { ok: false, status: 429, retryAfterMs: 2000 } }
        : truth.charges.some((c) => c.key === req.key) ? { response: { ok: true, status: 200, intent: succeeded(req.intentId) } }   // the fake's own dedupe (brief C16); truth omitted: unchanged
        : { truth: { ...truth, charges: [...truth.charges, req] }, response: { ok: true, status: 200, intent: succeeded(req.intentId) } },   // user-defined: succeeded
    }),
  },
  controls: {                                                                       // existing: controls
    busy: Fake.control({ times: Schema.Int }, (truth: Truth, { times }) => ({ truth: { ...truth, busy: times } })),   // existing: Fake.control; same result shape
  },
})

// The client half: the app's StripeApi, over the run's server.
export const StripeFake = Layer.effect(StripeApi, Effect.map(Stripe, (server) => StripeApi.of({
  confirm: (input, { idempotencyKey }) => server.confirm({ intentId: input.intentId, key: idempotencyKey }).pipe(
    Effect.catchTag("FakeLost", () => new NoResponse())),                           // RENAMED: "Fake/Lost" -> FakeLost; the client half says what a lost request raises
})))
```

A second fake, with a stream and a route table, showing every part [fakes-v2]:

```ts
const Message = Schema.Struct({ room: Schema.String, text: Schema.String, from: Schema.String })  // user-defined
type Truth = { readonly messages: ReadonlyArray<typeof Message.Type> }                            // user-defined

const socket = Fake.stream({                                       // existing: Fake.stream
  request: { room: Schema.String, clientId: Schema.String },       // existing: request
  frame: Schema.fromJsonString(Message),                           // NEW: frame, required; Schema.String for raw
  open: (truth: Truth, req) => ({                                  // existing: open; object result
    frames: truth.messages.filter((m) => m.room === req.room),     // existing: frames
    // or: refuse: 4403                                            // NEW: refuse, replaces accept
    // and, for a finished body: end: true                         // NEW: end, this connection, after its frames
  }),
})

export const Chat = Fake.server("Chat", {                          // user-defined: Chat
  truth: { messages: Schema.Array(Message) },
  initial: { messages: [] },
  endpoints: {
    socket,
    post: Fake.call({
      request: { room: Schema.String, text: Schema.String, from: Schema.String },
      handle: (truth: Truth, req) => ({                            // W14: an object; pure
        truth: { messages: [...truth.messages, req] },             // omitted means unchanged
        response: { status: 201 },                                 // under Fake.fetch: status, body?, headers?
        send: [socket.frames((c) => c.room === req.room && c.clientId !== req.from, [req])],
        // NEW: send, an ordered list; NEW: socket.frames(where, frames); where reads the connection's request
      }),
    }),
    logout: Fake.call({
      request: { clientId: Schema.String },
      handle: (_truth: Truth, req) => ({
        response: { status: 204 },                                 // no body, as Effect's omitsBody
        send: [socket.close((c) => c.clientId === req.clientId, 4401, "expired")],
        // NEW: socket.close(where, code, reason?)
      }),
    }),
  },
  controls: {
    finish: Fake.control({ room: Schema.String }, (_truth: Truth, a) => ({
      send: [socket.end((c) => c.room === a.room)],                // NEW: socket.end(where), a clean end
    })),
  },
})

// A client half reads a stream as it makes a call. Each run of the Stream is one connection; its scope closes it.
server.socket({ room, clientId })                                  // NEW: Stream of wire frames: encoded, not Type [P, RV1 L10]
//   failing with Fake.Lost, Fake.Refused { code } or Fake.Closed { code, reason? }   // RENAMED: Fake/Lost -> Fake.Lost

// Bindings: one route table for both [W16, W36]
Fake.fetch(Chat, {                                                 // existing: Fake.fetch
  "POST /api/rooms/:room/messages": {                              // NEW: the key, FindMyWay's path syntax
    endpoint: "post",                                              // NEW: endpoint, a name or a function of the context
    input: ({ params, body, headers }) =>                          // NEW: input; context also has query. params is typed from the key [P, RV1 M8]
      ({ room: params.room, text: body.text, from: headers.get("X-Client") ?? "" }),
  },
  "POST /api/logout": "logout",                                    // short form; input is { ...params, ...query, ...body }
  "POST /graphql": { endpoint: ({ body }) => body.operationName, input: ({ body }) => body.variables },
})
Fake.webSocket(Chat, {                                             // existing: Fake.webSocket
  "GET /api/rooms/:room/socket": { endpoint: "socket", input: ({ params, query }) => ({ room: params.room, clientId: query["client"] }) },
})

// In a Story
Story.machine(Room, { id: "chat/mid-stream", world: [Chat.socket.hold({ after: 2 })] })  // NEW: after
  .world(Chat.socket.hold({ match: { input: { room: "r1" } } }))   // NEW: input in match, reads the logged request
```

`socket`, `Chat.socket` and `server.socket` are one name on three values: the definition, the Story target and the client
read. A standalone `Fake.call` or `Fake.control` that reads `truth` annotates it (`Truth`), since it infers as `unknown`;
`Fake.server` constrains `endpoints` by its truth Schema, so another server's `Truth` is rejected. `input`'s result is typed loosely, since `request`
decodes it and invalid input is `StoryFakeError`; `query` values are `string | undefined` under the repo's `noUncheckedIndexedAccess` [P, RV1 M8].

**A heartbeat** [P, v3 items 1–3, 10]. `Fake.stream({ …, ping: { every, frame } })`: on each open connection, the fake delivers `frame` every `every`, on the run's Clock, so a client's `idle` has something real to see. It is data, like `open`, and runs no handler; it reads no truth. `frame` encodes by the stream's `frame` Schema.

- It takes no count: `hold({ after: n })` does not count a ping, and a `duplicate` does not take one.
- A hold stops pings: while `Silent` or `Closing`, none is sent and none queues, so a half-open connection is really silent. When frames flow again, the next is `every` from then.
- Each is one `delivery` record, with `ping: true`.
- While the tab is suspended, pings **coalesce** to one at wake, after the tab's overdue deadlines: a week at 10 s would be 60,480 frames. So a client's overdue `idle` fires first, as Machines O5's overdue rule says.
- It is not an operation's deadline: quiet ignores it, and it does not hold a run open. It counts toward an `advance`'s 100,000 deadlines (section 10).

`Fake.webSocket`'s `addEventListener("close")` gives a `code` [v3].

**Not added** [fakes-v2]: `pushes`, a `closed` handler, `release({ take })`, a duplex client half, `HttpApi` derivation
(`revisit.md`); `headers` on `Fake.stream`, until the first SSE adapter checks a content type [P, RV1 section 8]; `message` on `Fake.stream`, until the first duplex fake [P, RV2 section 8]. So a stream is server-to-client for now: a client's frame through `Fake.webSocket`'s socket is ignored and logged.

**One result shape** [fakes-v2] for `handle`, `open` and controls: `truth?` and `send?` everywhere, `response`
(required) on a call, `frames?`, `refuse?` and `end?` on `open`. All three are pure. Truth and `send` commit atomically; one
that throws is a crashed server, with no truth and no frames.

**`handle` is pure and always answers synchronously** [P, RV1 M1; main session's cut]. There is no `latency` and no `response` as an Effect: they had no real
use, and added a second form of `Held`, a rank clause and a crash half. **A slow answer is `hold`, `advance`, `release`**, the form Testing O6 already spells:

```ts
Story.machine(Editor, { id: "editor/slow-save", input: T42, fixtures: [TicketsFake] })   // user-defined: T42, TicketsFake
  .world(Tickets.save.hold())                                      // existing: world, hold. The request waits in transit
  .send(E.SaveRequested())
  .checkpoint("saving")
  .advance("2 seconds")                                            // existing: advance. Two seconds pass
  .world(Tickets.save.release())                                   // existing: release. Now the server answers
  .checkpoint("saved")
```

**A mocking library: a recipe** [P, W17 as amended; RV1 M1]. A **synchronous** library goes in a pure handler. An **async** one goes in the client half, an ordinary
Layer, which can still call an endpoint first, so the wire words apply to it:

```ts
const Search = Fake.server("Search", {                             // user-defined: Search
  truth: { asked: Schema.Array(Schema.String) },                   // existing: truth. Only what the server declares is truth
  initial: { asked: [] },
  endpoints: {
    gate: Fake.call({                                              // user-defined: gate, an ordinary endpoint
      request: { q: Schema.String },
      handle: (t: { readonly asked: ReadonlyArray<string> }, r) => ({ truth: { asked: [...t.asked, r.q] }, response: {} }),
    }),
  },
})

const SearchFake = Layer.effect(SearchApi, Effect.gen(function* () {   // existing: a plain Layer  // user-defined: SearchApi
  const server = yield* Search
  const library = makeLibrary(handlers)                            // user-defined: built here, so never module-level
  const askLibrary = (input: { q: string }) => Effect.promise(() => library.answer(input))
  return SearchApi.of({
    search: (input) => server.gate(input).pipe(                    // hold, drop and duplicate apply to the gate
      Effect.andThen(() => askLibrary(input)),
      Effect.catchTag("FakeLost", () => new NoResponse())),
  })
}))
```

Its limits:

- **Truth only if declared on the server.** What the library remembers is not truth: no `cp.read(Search)`, no `propertyTest` oracle. Put what a test reads in `truth`.
- **Memory is per Layer build,** so it cannot leak across runs or a shrink. A client half is built per tab, so a `reload` or second tab starts the library afresh. If that memory must survive a reload, declare it as truth.
- **The library must finish in microtasks,** or the operation's fiber is `HostTimeWait` (rule 61). A real `Response` read needs a host task in Chromium (run), so anything that needs one is Bun and Node only. `response` under `Fake.fetch` never is a web `Response`.
- **The wire only sees the gate.** `hold({ at: "response" })` holds the gate's answer before the library runs; a lost answer never reaches the library.

**A broken fake is a broken run** [P, RV1 H4, RV2 M6; keeps C1, which is about the app]. It is recorded when it happens, one per crash, so a crashed original and its crashed copy are two, listed in order [MDL (c)]. A wrong route otherwise gives a 404 the commit classifies, and a decline test passes
without ever exercising a decline. These are errors in the test's own world, so `run()` **finishes the run, then rejects** with a `FlowError`:

```ts
await paidFirstTime.run()         // rejects: NEW: StoryFakeError { fake, endpoint, reason }
// reason: "NoRoute" | "InvalidInput" | "Crashed" | "UnplacedStream" | "InvalidRefusal"
```

The evidence is complete on the error. A Story that wants a 500 writes `response: { status: 500 }`; one that wants a 404 writes a route. Product `issue`s stay records and never
reject. `propertyTest` reports it as a rejecting `FlowError`, like an acquisition defect. A stream not placed on this server is `UnplacedStream`, at the send. One stream value on
two servers is a construction error.

**Order** [fakes-v2].

| Case | Rule |
| --- | --- |
| A handler's `send` against its answer | Commit truth; deliver the list in order; its answer **joins the run's one FIFO answer list**. Each settle ends by delivering the next answer to its gate, then settling again [P, RV1 M2] |
| `hold()` on the request | The handler has not run, so nothing is sent |
| `hold({ at: "response" })` | Frames are delivered now; the answer waits |
| `drop({ at: "response" })`, `release({ drop: true })` | Truth and frames stand; only the answer is lost |
| `orphan` (client gone) | Frames still go, so a reopened tab hears them |
| `duplicate` | The copy's answer is discarded, its frames are not; the fake's dedupe omits them |
| Frames to a connection `Opening`, `None` or `Closed` | Nothing; `open` replays from truth |

So A and B arriving in one settle answer A then B, frames still come before their answer, and adding a `send` never reorders answers (a nested settle answered B first; RV1 `wire.ts`). A request caused by a frame can reach the server before the first answer arrives. That is real and deterministic. Inside `together`, "settling" means what that row says: run until each fiber reaches a mailbox, a gate or the Clock.

**A server failure never reaches the client as a defect** (rule 66, SP RV M8; W12). A handler that throws is a crashed
server, which the wire turns into the binding's failure (`Fake.Lost` for a client half, `500` for `Fake.fetch`, close `1011`
for `Fake.webSocket`), and the run rejects with `StoryFakeError { reason: "Crashed" }` at its end. Nothing in Flow reads a status, a header or an error type: `429` means
busy because the fake author wrote it and the commit classifies it.

**Failures** [fakes-v2]. A network loss is `Fake.Lost` on a client half, a `TypeError` from `fetch` under `Fake.fetch`, and close
1006 under `Fake.webSocket`; an app-service client half maps it itself, as `StripeFake` does (rule 66). Endpoints declare no
`lost`. A refusal is `Fake.Refused { code }` on a client half. Under `Fake.fetch` its code is the status; a code outside 200–599 is `StoryFakeError { reason: "InvalidRefusal" }`, since `new Response` would throw. Under `Fake.webSocket` it is an error event, then close 1006, as a refused handshake is in a real browser, with the code only in the log; app-level closes use `socket.close` after open [P, RV1 M11]. A server close is `Fake.Closed {
code, reason? }`. A crashed `open` is `Fake.Closed { code: 1011 }`. `end` ends the Stream or body, and is close 1000 under
`Fake.webSocket`, which Effect's `Socket` reports as `SocketCloseError { 1000 }`, not a stream end [P, RV1 M11]. Tags are `FakeLost`, `FakeRefused`, `FakeClosed`, as PascalCase importable error classes (following Effect's
`SocketCloseError`, `HttpClientError`).

**How the words combine** [P, RV1 H5, RV2 M8, M9, L4, RV3 M6; MDL G2, G4–G9, G12, G16, N1–N6]. Five rules, then the tables:

1. **Arrivals take one rule.** A call or an attempt arrives once, and takes the earliest-set arrival rule that covers it, matches it and means something for it, and only that one, consuming its `times`. A `duplicate` means nothing to an attempt, so an attempt skips it without consuming it [MDL G5]. A hold or drop on a handle covers the next arrival, call or attempt [MDL G4].
2. **Frames rules do not compete: every one covering a connection applies to it** [MDL G9]. So a standing `hold()` and a standing `duplicate()` both apply, at open as on an open connection, and each `hold({ after })` counts on its own. **A count is per rule and counts delivered frames**, so it is not a hold until reached, and it pauses while the connection is silent: set on a `Silent` or `Closing` connection, it starts when frames flow again [MDL N4]. The first to reach its count silences the connection, under its own rule; another target's count resumes when that one is released, and a `release` on one target ends all of that target's counts [MDL G8, N6]. **Each `duplicate` rule doubles one frame per connection, and one frame takes only the earliest armed**, so a frame never arrives three times [MDL N5]. **A connection is silent while any hold covering it has taken effect, on its endpoint or its handle; `release` on one target ends only that target's rules** [RV2 M8, MDL G2]. It returns to `Open` and delivers its queue when the last one ends. So `Chat.hold()`, `Chat.socket.hold()`, `Chat.release()` leaves it silent, and a `Chat.socket.release()` with no rule of the endpoint's own is `NothingHeld`.
3. **`release` ends its target's rules first, then delivers** [MDL G16]; what it delivers has no arrival rule to take again. **The frames rules of its own target do not apply to what it delivers, even under `{ match }`, where they stay; another target's do** [RV3 M6]. A `Closing` close or end comes last, only when no hold is left. **A count reaching `n` during a release's own delivery queues the items past `n` again under that rule, whatever form of `release` delivered them** [P, MDL U1; not reached within the model's bounds].
4. **A `release` must do something** [RV3 M6, MDL N1]: it is `NothingHeld` when it ends no rule and delivers no item. A request marked to hold, still at `Server`, counts as a held item for every form of `release` [P, MDL U2]. `release({ match })` is `NothingHeld` when no held item on its target matches, on every table, whether or not a rule stands or other items are held, since a typo'd match has no check left to catch it. This also defines `release({ nth })` and `{ drop: true }` over nothing.
5. **A rule ends when it has nothing left to do** [RV3 M6, MDL N3]: a used-up rule is **removed unless it still holds an item or silences a connection**, and then `release` ends it. So `save.drop()`, used, then `save.release()` is `NothingHeld`, not a silent no-op, and a used-up `hold` can still be released.

The rest follows:

- **One word on a handle is two rules** with separate counters: an arrival rule, and a frames rule [MDL (a)]. `at` on a handle is a type error: use endpoints for phases.
- **`times`** counts arrivals: on a call, requests; on a stream's `hold`, connections taking it; on a stream's or handle's `drop`, calls and attempts. A used-up rule takes no more arrivals; rule 5 says when it goes. A connection it silenced stays silent and held items stay held until `release` [P, RV3 M6, amending my reading of RV2 M8].
- **`drop()` on a stream or a handle** closes matching open connections at once. With default `times` it stands for the next arrival **only when no connection matched** [RV2 M8]: on a handle a rule, on a stream endpoint `StoryInvalidCommand { NoConnection }`, since a silent no-op is what C1 can no longer catch (skipped under `propertyTest`). With `times` above 1 or `"always"`, it closes and also stands, so **offline means offline**.
- **`duplicate` is per connection** at frames; its `match` narrows it.
- **`release({ match })` delivers the matching held items and leaves the rest held; the standing rule stays** until a `release()` with no `match` [RV2 M9; W21 kept]. So two saves in flight can be answered one at a time:

```ts
.world(Docs.put.hold())                                          // existing: hold
.send(edit("d1", "A"), edit("d2", "B"))                          // user-defined: edit
.advance("800 millis")
.checkpoint("bothSaving")                                        // existing: checkpoint
.world(Docs.put.release({ match: { input: { docId: "d1" } } }))  // CHANGED: match on release; existing: match, input
.checkpoint("oneSaved")
```

- **`release({ nth: k })` is per queue** [MDL G6]: an endpoint's held list is one queue, counting `Held` and `HeldAnswer` together in arrival order [MDL (b)], and each connection is one queue. **"First" orders within a kind, and released answers still join the list before released requests run**: in `[HeldAnswer a, Held b]`, `nth: 2` delivers a, then b; in `[Held a, Held b]` it delivers b, then a [RV3 M6, MDL N2]. A queue shorter than k releases in order; it is `NothingHeld`, naming k, only when no queue has k, and then nothing is released. With a call endpoint's one queue this is the old reading.
- **Order across connections is their open order** [MDL G7]: a `send` list item, `release` and `drop` reach matching connections earliest-opened first, across tabs.
- **A handle's `release` across endpoints** reaches connection queues in open order, then answers, then requests [RV3 L2].
- **A `send` list evaluates every `where` before delivering**, so a `where` that throws is a crash with nothing delivered [RV3 L4].
- **"Fired"** [RV2 M7]: a rule fired if a call or attempt took it, or it applied to an open connection, so a `hold()` on a silent socket counts. A rule that never fired is `UnusedWireRule`.

**The wire** (W18). Every endpoint call goes through a gate Flow owns, between the client half and the handler; 2.10.17.2 and
2.10.17.3 are normative. Its words are delivery facts true of any transport, never server meanings (brief C16, STF17):

| Word | On a call endpoint | On a stream endpoint (2.10.9) | Options |
| --- | --- | --- | --- |
| `hold()` | a standing rule: matching requests wait in transit, unseen by the server | frames stop reaching the client (silence, half-open) | `at: "request"` (default) or `"response"` (handled, the answer waits; W20); stream: `"frames"` (default) or `"open"`; stream only: `after: n` [fakes-v2]; not on a handle |
| `release()` | every standing rule on this target ends, then held items are delivered: released answers join the answer list first, in arrival order, and released requests reach the handler in arrival order, whose answers follow [P, MDL G3] | its rules end; a connection with no hold left delivers its queue, then a held close or end; held opens complete | `{ drop: true }`: the held items are lost instead; `{ nth }` (rare): deliver the n-th held item first, a reorder (W21); `{ match }`: only those, and rules stay [P, RV2 M9] |
| `drop()` | matching requests are lost before the server; `at: "response"`: handled, the answer is lost | open connections close as the network would, at once; `at: "open"`: matching attempts are lost | `times` (default 1, or `"always"` until `release`); on a stream, `times` counts attempts |
| `duplicate()` | a matching request reaches the server twice; the client gets the first answer, the second is discarded (`phase: "duplicate"`) | the next frame arrives twice, per connection; the count is per frame | `times`. It has no `at`; a request is duplicated at arrival [RV1 L11] |

`hold` is standing (until `release`) unless `times` is given; `drop` and `duplicate` default to once (W19). A rule that never fires is the `UnusedWireRule` diagnostic, since a rule set after the step that sent its request waits for nothing [P, RV1 M17]. Every word takes
`match: address` (rule 65): `{ actor: BoardP1 }`, `{ operation: LikeButton.O.set, actor: IssuePageC7 }`, `{ tab: "b"
}`, `{ purpose: "acknowledge" }`, `{ input: { room: "r1" } }` (an address plus kind fields; listed `input` keys must equal the
logged request's; at frames, the connection's request). **One rule per request**, as the combination rule says; `release` on a target ends only that target's rules (2.10.17.2). Applied to the server handle (`Stripe.drop({ times: "always"
})`), a word covers every endpoint: an offline device.

**`hold({ after: n })`** [fakes-v2]. Counted per connection: from its first frame if set before open, otherwise from when it is
set. `times` counts connections. `release` behaves as for `hold()`. A connection takes a frames rule at open or when the
rule is set. A later `hold` on a matching open connection still counting takes effect at once, since silence only widens.
`duplicate`'s count is per frame, and a duplicated frame counts as two. A `drop()` always closes. A `close` or `end` while
counting, with no hold yet in effect, passes in order: so `end: true` with fewer than n frames is `Closed { 1000 }`, and once the count is reached, or under a plain `hold()`, it is `Closing { 1000 }` [MDL G12]. `after` with `at`, on a call or on the server handle is a type error; `after: 0` is `hold()`; a
negative is `StoryInvalidCommand`.

**Close under `hold`** [fakes-v2]. A server `close` or `end` is the last queued item: delivered at `release`, lost under
`release({ drop: true })`, which becomes close 1006. A network `drop()` stays immediate. While a close is held, the server sees
the connection as closed: a `send` reaches nothing, the log reads `phase: "closed"` with its `code`, the `delivery` record shows delivery, and
`release({ nth })` does not count the close, which stays last. This is the state `Closing` in 2.10.17.3.

**Remote and local.** A request to a remote server that has left the device **stays in transit** after its client is
gone (a cancel, a closed tab): released, the server handles it and the answer goes nowhere (`phase: "orphan"`). That is
2.7.2's "the server finished after a cancel", and it makes "charged once across a reload" (STF12) a fact the Story
sets. **Local storage is not remote** (SP RC6, SP MDL F1): `Fake.storage`'s writes are FIFO per tab, as one writer's writes
are (Persistence O7), and a closed tab's unfinished writes are **aborted** (`phase: "aborted"`), never applied later, as a
crashed page's storage transaction is. A held acknowledgement for an Attempt the Story then cancels either lands
before the capture that removes it, which is queued behind it (a Persistence fact, Persistence O7's one writer), or is
aborted with the tab. A write that was **stored but whose confirmation was held** (`hold({ at: "response" })`) stays
stored when the tab closes, as an IndexedDB transaction that committed before the page crashed does; the restore then
finds an acknowledged Attempt and delivers `unknown { Restored }` even if the Story had cancelled it. That is
2.7.13's restore row (Stories T7): Stories reach the cell and do not decide it (section 7 item 21 of `machine-design.md`).

**Server controls** (W13) are the author's typed messages to the server (`Stripe.busy({ times: 1 })`, `Chat.finish({ room })`):
their arguments are Schemas, so they are data, `describe` prints them and a property test generates them (STF16,
STF52). Pushing, refusing, going silent, resetting a log, keeping the last n and greeting with or without a replay are
each a control or a wire word (STR23); flapping and flooding are loops at construction, data once built.

**Provenance** (STR21, STR26, STF3, SP RV M9). Each logged request is `{ n, input, phase, via }`. At a call endpoint `phase` is one
of `held`, `handled`, `answered`, `lost`, `dropped`, `duplicate`, `orphan`; at a stream endpoint an open's is one of
`opening` (held), `open`, `refused`, `lost`, `closed`. `via` is the **client side**, recorded by Flow, never
seen by the server: `{ tab: { name, open }, actor, instance, copy, operation, attempts, purpose }`. `phase` is always a plain string, with `code`, `reason` and `by` as fields [P, RV1 M11]: an open's `closed` has `code` and `by: "server" | "network" | "client"`, so a released connection reads `{ phase: "closed", code: 1000, by: "client" }`; a network-refused attempt is `lost`. At `Fake.storage` a write's is `held`, `stored`, `aborted` or `refused`, and a read's `held`, `served`, `refused` or `aborted` [P, RV1 M12]. `attempts` is a list, but a batched request (Effect's `RequestResolver`) carries **the Attempt of the fiber that formed it**, since the gate sees only that fiber's context: a test reads each item's idempotency key in `input` [P, RV2 M11]. `via.tab` is **always** present (a client
half is built per tab); a send an SDK's own fiber makes lacks only the Attempt fields (`actor`, `instance`, `copy`,
`operation`, `attempts`), so `match: { tab: "b" }` still targets one device's SDK traffic, and a test checks the
idempotency key the server saw in `input` instead. So "charged once" is checked by values: requests whose `via.attempts`
hold the same Attempt and one charge whose `key` is that Attempt's id is a deduplicated retry; two Attempts and one charge is
a different, wrong case. The log records the mapped `input` and `via`, never the `Request` or its headers: `init.headers`
carries random `b3` and `traceparent` values [fakes-v2]. A `delivery` record, `{ endpoint, connection, phase: "delivered" | "held" |
"lost", digest }`, is a new Inspection O4 kind, redacted like `input` [fakes-v2].

**Storage** (W28; STR25, STF5, STF6). `Fake.storage` is Flow's own in-memory `KeyValueStore` plus Persistence O7's scope lock, one
per run, used by every tab (STR42). Its endpoints are `read` and `write`, under `hold`, `release` and `drop` (not `duplicate`, 2.10.17.6), and Flow knows
each write's purpose: `acknowledge`, `capture`, `flush`. `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`
opens the acknowledgement window without delaying bootstrap restore, which reads (STF6); `hold({ at: "response",
match: { purpose: "acknowledge" } })` stores the acknowledgement but holds its confirmation, which is 2.7.13's
G1 "acknowledged, never invoked" restore cell once the tab closes; `drop(…)` refuses (`StorageRefused`). Storage starts
fresh and may be seeded with encoded records, which restore validates (Testing O3): `storage: Fake.storage.seed(records)`,
or (rare) `Fake.storage.from(story)`, the storage an earlier Story's run left, which is how records written by
an earlier definition are made (STR41). Stories are prefixes, so a mid-run store is `from(thatPrefix)`, with no per-cut capture [P, RV1 M6]. `from` carries storage, not fake truth: the new run's servers start at `initial` [P, RV1 L7]. The new run's clock starts at the source's final `now`, so a restored `dueAt` is not in the far future; "reopened after a week" is one run with `closeTab`, `advance`, `openTab` [P, RV2 L7]. A seed record's shape is Persistence's encoded record; until that shape is public, `from` is the only form an app can rely on [P, RV1 L6]. A handle word (`Fake.storage.hold()`) covers reads and writes, so it blocks bootstrap; `release({ nth })` here is a type error, as writes are FIFO per tab [P, RV1 M12].

**Transport bindings** (uncommon; W16, W36). Most apps put `fetch` behind their own service (OD11), and a client half replaces
that service; the commit's classification still runs (STR19). Where the adapter itself calls a transport, Flow ships
`Fake.fetch(server, routes)` (provides `FetchHttpClient.Fetch`) and `Fake.webSocket(server, routes)` (provides
`Socket.WebSocketConstructor`). `routes` is the route table above; a function stays for unusual cases (W16).

- **Routes** [fakes-v2]. `::` is one literal colon. A key whose single-colon param does not follow `/` is rejected, because
  `/parts:release` silently parses as a param. No matching route, or invalid `input`, is a 404 or 400, and the run then rejects with `StoryFakeError` (`NoRoute`, `InvalidInput`). Keys ignore the origin. The function form stays, and its `Request` has the same body overrides.
- **Bodies never need a host task** [fakes-v2]. In Chromium every `Request` and `Response` body read does. *Request:* the binding
  reads `init.body`, since `FetchHttpClient` passes `(URL, init)`. Effect's JSON, text and urlencoded bodies arrive as
  `Uint8Array`, decoded synchronously by content type: JSON parsed, urlencoded to `URLSearchParams`, otherwise a string.
  `FormData`, `URLSearchParams` and strings are given as they are. A `ReadableStream` is read with a reader, keeping the arrival
  number. A `Blob` or `File` exposes `name`, `size` and `type`; its bytes stay unread. *Response:* `Fake.fetch` returns a `Response`
  subclass with resolved `text`, `json` and `arrayBuffer`. It keeps `bodyUsed` honest and rejects a second read. A streamed body
  stays a real `ReadableStream`. This is a deliberate shim. An object body becomes JSON; a string stays as is; a `Uint8Array` or `ArrayBuffer` passes through, and the shim's `formData` and `blob` resolve from it [P, RV2 L9]; 204, 205 and 304
  carry no body. An adapter that calls `fetch(new Request(…))` with a body gets `HostTimeWait` in a browser. That is honest; the
  docs say so.
- **Arrival order** [fakes-v2]. A binding takes the arrival number and `via` synchronously at the `fetch` call, and delivers to the
  gate in that order, even from an async route function.
- **Streams under `Fake.fetch`** [fakes-v2]. Open is a 200 streamed body, `refuse` a status, `end` body done, a close a body error.
- **Malformed frames** [fakes-v2]. To reach 2.10.5's `Defect`, declare `Schema.Union([Schema.fromJsonString(M), Schema.String])`. It
  encoded a typed and a raw frame correctly in the review's probe.

**From Effect** [fakes-v2].

| Module | Use |
| --- | --- |
| `FindMyWay` | Reuse for the route table |
| `Queue`, `Stream.fromQueue` | Reuse for a connection: `Queue.fail` for a close, `Queue.end` for an end |
| `Deferred`, `Latch` | Parts of the gate; one `Deferred` per held item, since `nth` needs per-item release |
| `Ref` | One atomic commit of truth and frames |
| `Schema.fromJsonString` | The `frame` codec |
| `FetchHttpClient.Fetch`, `Socket.WebSocketConstructor` | Keep as the seams |
| `HttpServerResponse.omitsBody` | Follow |
| `SocketCloseError`, `HttpClientError` | Follow: PascalCase importable error classes |
| `HttpRouter.toWebHandler` | Do not use: a body read is a host task in Chromium, an abort kills the handler (the wire table says it continues), an unknown route is a silent 404, and the gate and `via` have no place in it |

#### 2.10.5 Endings: how every one is produced (W12; Stories T2)

An ending is the commit fiber's `Exit`, classified (2.7.1), or a reason Flow's Runtime adds. A Story produces the
first by what the fake returns and the second by the lifecycle step that causes it. No step names an ending.

| Ending (2.7.1, rule 20, rule 37) | Produced by |
| --- | --- |
| success; each failure tag; each author unknown tag | the handler's response, classified by the commit (`429` → `Busy`, `5xx` → `unknown ServerError`) |
| author unknown after a lost request or answer | `drop()` or `drop({ at: "response" })`: `Fake.Lost`, mapped by the binding, reaches the commit's `catchTag("NoResponse", Outcome.unknown)` |
| `unknown { Defect }`; a read's `Defect` | a response the adapter cannot handle (a malformed body it throws on; a malformed frame through a union `frame`, 2.10.4): an adapter bug, which is what `Defect` means. A server crash is not this: the app sees the binding's failure, and the run rejects (2.10.4) |
| `unknown { Interrupted }`; a read's `Interrupted` | a client half that interrupts its call, as an SDK whose own fiber is interrupted does; it is client code, so the wire stays honest |
| `StillUnknown { failure }` | a lost answer, then a retry the server refuses definitely |
| `unknown { Cancelled }` | `hold()`, then the send whose transition cancels |
| `NotSent { Cancelled }` | `Fake.storage.write.hold({ match: { purpose: "acknowledge" } })`, or a head held in a record queue, then the cancel (STF5) |
| `unknown { Restored }` | `reload` with the Attempt acknowledged and on the wire; with the acknowledgement stored but its confirmation held (2.7.13's G1: acknowledged, never invoked); the same after the Story cancelled that Attempt (a cancelled Attempt's stored acknowledgement, restored as unknown: the merged design's crash behaviour, Stories T7); a rebind (`dispose`, `ensure`) adopting a held lane |
| `NotSent { Restored }` | `reload` with the acknowledgement held (not stored: aborted with the tab, 2.10.4); each queued `W` entry of the restored lane |
| `NotSent { Rejected }` | `hold()`, then a second commit on a `reject` lane; or a commit from another subject path (rule 51) |
| `NotSent { Overloaded }` | `hold()` on the head, then 64 queued commits and one more (STF11; 2.10.18) |
| `NotSent { StorageRefused }`, `unknown { StorageRefused }` | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })`; the same on a persisted re-send's `capture` |
| evidence `Superseded`, `Released`, `NothingToResend`, `InFlight` | a second `latest` commit while the first waits; `cancel` in `Held`; `retry` in `Idle`; `retry` while held on the wire |
| `NotSent { Disposed }` | only Runtime disposal, through the policy suite's internal `disposeRuntime` step (Stories T2; OD23 Q41, brief C11) |

**Why no injection** (W12; Stories T2, STF8). `Story.ending(O.x, "unknown")` would skip the commit's classification and the
adapter's decoding, so a Story could pass along a path the real response never takes (requirements R38). Every reason above is
reachable without it (requirements R34), and the cases that seemed to need it are covered by rule 62 and rule 65:

- **an unbound lane** (STF9): the fake answers the request it still holds; the wire does not care who is bound;
- **a fragment's operation** (STF10): `match: { operation: Autosave.O.save, actor, copy }` names its request in a host,
  and alone;
- **a lane with nothing on the wire** (STF7): there is nothing to `release`, which is `NothingHeld`;
- **the wrong path passing** (STF4): the ending record names its channel and reason, so a test that reads `cp.records("ending", …)` and
  expects `{ channel: "failure", reason: { _tag: "Busy" } }` fails if the fake answers 503. A test that checks only the final
  state still passes, and **coverage reports** the `Busy` handler unreached; the documented shape also checks the
  intermediate state (`S.WAITING`).

Prior art kept: alternatives B (injection at the lane) and C (`Story.ending(O.x, exit)`, a scripted fake without
truth) were rejected in SP revision 1 for the reasons Stories T2 records.

#### 2.10.6 Step cuts, frames, reads and records

**Step cuts** (rule 64, SP RC1, SP RV H1; W22). Every step ends with its own cut. A cut is a frame plus `wire` [P, RV1 M15]: the
latest publication frame (of each open tab), plus `seq` the evidence position at the step's end, `truth` each fake server's
truth then, `storage` the encoded records then, and `wire` each endpoint's held items and standing rules then [RV2 L1]. A plain frame has no `wire` or `storage`, so its type omits `read(Fake.storage)`. `<StoryFrame frame={…}>` takes a frame or a cut. A step that publishes nothing (an `Unhandled` send, a
`world` control, a `release` after the only tab closed) still has a cut that includes its own `verdict`, `request` and `control`
records and the server's new truth. The executor keeps `{ command, cut, frames: [from, to], evidence: [from, to] }` per step for the player and `flow explain`;
that list is not public [P, RV1 section 8]. `checkpoint`
names a step cut (C2); it never reads a bare publication frame, unless `{ at }` says so. `end` is reserved, so `checkpoint("end")`
is a type error (STF75), and `run.end` is the cut after the last step. A `checkpoint` before any step names the cut the start left, once the subject has started and settled **[P]**. Checkpoint names are camelCase by convention, so
destructuring works (C5); duplicate names and unknown names are type errors (Testing O1).

**Frames** (STR45, STR50; W22). A frame is the cut after one committed publication of one tab (a turn, a settlement or a
Runtime step, 2.5), plus the initial frame: every actor's snapshot and one store revision per open tab, `now`, and the truth and
`seq` at that publication. Snapshots and truth are immutable and shared (Machines O8, playback.md 4); records are referred to by
position, never copied (STF66), so memory is linear. A frame has exactly one cause (STF64). Frames serve test loops,
`propertyTest`, `checkpoint(…, { at })` and playback. There is no `frames` option (W22).

**`run.frames`** keeps at most 10,000 and **exposes `truncated`** (W25): a readonly array whose `truncated: boolean` is
**non-enumerable**, since an enumerable one fails `toEqual` and `toMatchObject` against a plain array (run, RV1) **[P, RV1 M14]**. Its
**iterator throws `FramesTruncated`** after yielding the last kept frame, so a `for … of`, spread or `Array.from` over a truncated run cannot finish quietly; `.every`, `.map`, `.some`, `.forEach` and `toEqual` can, which is stated, not fixed, since 10,000 frames is rare [RV2 L5];
`run.frames[i]`, `.length` and `.truncated` stay plain, and `.filter` loses `truncated`. The first 10,000 stay **[P, H21]**. Step cuts,
checkpoints and any frame named by `{ at }` are **never** truncated, as the trace never drops checkpoints (Inspection O4; SP RV L1).

**Reading after the run [P, H6].** Reads run in test code, after `run()` has finished and the Runtime is gone. So every read is
answered from what was captured [P, RV1 M6]. Every frame captures snapshots, store revision, `now`, truth, evidence position, and only
`work` and lanes of `inspection`, which playback's Inspect and `lane` need. Cuts and named `{ at }` frames capture the full `inspection`;
the executor knows the plan, so it captures those on demand. A session's 256-entry ring is therefore not copied per frame. A frame's
`inspection` has that narrower type, and `propertyTest` drops a run's frames once they are checked. **Memory is unmeasured**; measure
before accepting. Reads are pure and start nothing. A
value read at an earlier checkpoint never changes: a logged request's `phase` is its phase **at that cut**.

**The reads** (C3, W23, W24). A checkpoint, `run.end` and every frame have the same reads. **Every read with no tab means tab `"main"`**, as
Testing O7 says [P, RV1 M3]:

| Read | Returns | Subjects | Status | Tier |
| --- | --- | --- | --- | --- |
| `state` | the active leaf's state token; throws `SubjectAbsent` if the subject is absent | machine, fragment | C1's example; the throw is [P, RV1 M4] | common |
| `memory` | the memory, private fields typed (2.2.2); throws `SubjectAbsent` if absent | machine, fragment | as above | common |
| `operations` | the rows `s.operations` (2.7.5); throws `SubjectAbsent` if absent | machine, fragment | as above | common |
| `schedules` | `s.schedules`; throws `SubjectAbsent` if absent | machine, fragment | [P, RV1 M15] | common |
| `read()` | the whole snapshot, or `undefined` if absent (SP N3): the check for absence, and the snapshot `check(cp.read(), event)` and `O.x.get(cp.read(), k)` take | machine, fragment | W23 | common |
| `read(ref)`, `read({ actor, tab })` | that actor's snapshot, or `undefined` | all | W23 | common |
| `read(Stripe)` (a fake server) | its truth | all | W23 | common |
| `read(Stripe.confirm)` (an endpoint) | its request log, in arrival order, with phases (2.10.4) | all | W23 | common |
| `lane(O.x, key?)` | the lane at this cut, or `undefined` when it does not exist | machine, fragment | C3 | common |
| `lane(address)` | the same, by address: `{ actor?, instance?, copy?, tab?, operation, key? }`; `operation` is a handle, or a string for a fragment's read or stream, type-checked against the summary (rule 57) | all; the only form on an app Story | [P, RV1 M5] | common |
| `records(kind, filter?)` | the run's records of one kind up to this cut; `filter` is an address plus kind fields, and `since: "checkpointName"` | all | C3 | common |
| `attempt(O.x, address?)` | the Attempt's id, or `undefined` if none was minted by this cut | all | W24; the return value is [P, H4] | common |
| `now` | the epoch millisecond | all | W24 | common |
| `inspection` | `inspect(runtime)` (Inspection O1) at this cut, of tab `"main"`; `| undefined` on an app Story, where `main` may be closed [P, RV1 M3]; only `work` and lanes on a plain frame: lanes by identity, incarnations, work, sessions, domain queues and marks, persistence. Held wire items are not Runtime facts and are read from endpoints (SP RV L2) | all | W24 | uncommon |
| `tabs.b?.inspection` | the same for tab `b`; `tabs.b` is `undefined` while `b` is closed | app | [P, H5]; `tabs.<name>` is Testing O7's | uncommon |
| `entity(Entity, key, { tab? })` | the record as a view reads it, `{ data, predicted, uncertain, unconfirmed }`, or `undefined` (STR31), also when the tab is closed [P, RV1 M3] | all | W24 | uncommon |
| `read(Fake.storage)` | the encoded records at this cut's end; a cut only | all | [P, RV1 M6, RV2 L1] | rare |
| `serverView(label)` | a `dehydrate` label's first-render view, for comparison | app | Testing O7; [P, RV2 L6] | uncommon |

In test code the same values are also reachable as the design's reads on a snapshot (`O.like.get(cp.read(), k)`, `Issue.get(cp.read(), k)`). A
`toBeUndefined()` on a tab-less read while `main` is closed passes for the wrong reason, so a test of another tab names it. **Absent** [P, RV1 M4]:
2.10.17.4's `Absent` and `Ended` read absent; `Frozen` reads its slice, and `inspection.incarnations` says frozen; on a machine Story, after
`dispose()`. **Dropped** [P, RV1 M15]: `Entity.get`'s `shape`, `descriptor.get(checkpoint, …)`, `Domain.entry.get(checkpoint, …)` and
`Entity.queue(checkpoint, …)`, in favour of `Issues.list.get(cp.read(ref), …)` and `cp.inspection`. To share a helper across Stories, annotate
`Story.Frame<typeof PayMachine>`, by subject, not Story, since a Story's checkpoint names would not assign across Stories [P, RV1 M7].

**`lane` [P, H17].** `lane` differs from `O.x.get` on purpose. `O.x.get` is total, for views, and returns the idle row. `lane` is
for tests, and `undefined` means there is nothing there (C3), so a settled lane reads as gone and a wrong key fails.

- A **write**: its entry in Inspection's lane listing (2.10.7), which is every non-`Idle` lane by identity, with the row's flags:
  `{ key, subject, binding, releasing, state, pending, uncertain, waiting, retryCount, progress?, queued, parked }`. It reads the
  listing rather than the actor's rows so an unbound or unplaced lane still holding an unknown is not reported as gone.
  `paying.lane(O.pay, pi)` matches `{ pending: true }` (C3); once settled it is `undefined`, and `operations.pay` still reads
  `{ pending: false, uncertain: false }` there.
- A **read or live operation**: its row (2.7.5), `undefined` before the first lookup, after `cancel`, or while not placed. A
  settled read is `Ready`, not gone.
- An **unkeyed** operation omits the key. On an app Story that is `lane({ actor: Checkout1, operation: O.pay })`.
- **Conversion risk** [RV1 M15]: 40 real tests use `O.x.get(at, k)`, which returns the idle row on a settled lane where `lane` returns `undefined`.

**Attempts [P, H4].** `attempt(op, address?)` names the Attempt of `op` that the address names (rule 65): `attempt(O.pay)` when one
actor commits it once, `attempt(LikeButton.O.set, { actor: BoardP1 })` for the board's, and `{ n }` (from 0) picks among one
address's Attempts in mint order (`n` is a kind field, rule 65). It reads **mints**, wherever they were restored: an Attempt minted in `main` and restored in b reads under `{ actor }`, even with main closed, and is `undefined` under `{ tab: "b" }` [P, RV2 L13]. An address that matches several without `n`, here or in `lane`, **throws `AmbiguousRead`** in the
test, never guessing (RENAMED from `AmbiguousAttempt`, since `lane` needs the same rule). An address's `operation` takes a handle where
one is visible: a definition's `O.x`, or a fragment's write through `Fragment.O.x`, used only as a name, so rule 50 holds. A
fragment's read or stream has no outside handle (rule 50), so it is named by `instance` and the operation's name, type-checked
against the subject's summary (rule 57), as a schedule is named by its string (2.10.3); alone, its instance is `[]` (delegated, at
merge).

**Checking a read: what replaces `expect`'s five rules** (C1, C3, C4). All **[P]**, and the probes ran on Vitest 5.0.5:

| The old rule | Now | Example |
| --- | --- | --- |
| Objects match the keys listed | `toMatchObject` | `expect(cp.memory).toMatchObject({ busyTries: 1 })` |
| A key listed as `undefined` matches only an absent key | **Not `toMatchObject`**, which fails on an absent key listed as `undefined` and passes on a present one. Use `.toBeUndefined()` on the read. `.not.toHaveProperty` fails on a key held as `undefined`, which snapshots keep faithfully (Testing O4) [RV1 L1] | `expect(cp.lane(O.pay)).toBeUndefined()` |
| Arrays match element by element, equal length | `toMatchObject`, which requires equal length; or `toHaveLength` for a count | `expect(cp.records("ending", { operation: O.pay })).toHaveLength(1)` (C1's example) |
| Primitives match exactly | `toBe`, or inside `toMatchObject` | `expect(cp.now).toBe(t0 + 60_000)` |
| A state token matches at or below it | Leaf: `toBe`. A parent: the existing `token.is` | `expect(cp.state).toBe(S.PAYING)`; `expect(S.WIZARD.is(cp.state)).toBe(true)` |
| `Story.attempt` as a matcher | A plain value inside `toMatchObject` | `expect(cp.read(Stripe)).toMatchObject({ charges: [{ key: cp.attempt(O.pay) }] })` |

Use `toBe` for `state`, never a token inside `toMatchObject`: tokens compare by identity, and a deep subset compare of one says
nothing useful. The runner's `toMatchObject` on a read that has no value fails with a clear diff. An `attempt` that reads `undefined` makes `toMatchObject` compare against `undefined`, which the runner reports
as a mismatch on a present id. No matchers are added for now (C4); `toHaveLane`, `toHaveRecord` and `toBeIn` stay in `revisit.md`.
The same reads work on any runner (C3), and nothing here imports a Flow test adapter: there is no `@flow-state/vitest` or `storyTest`
(decisions' proposed list).

**"This never shows"** [W25, P for the shape]. A loop over frames:

```ts
test("never shown twice", async () => {
  const run = await created.run()                 // existing: run  // user-defined: created
  for (const frame of run.frames) {               // existing: frames; the iterator throws FramesTruncated if any were dropped [P, RV1 M14]
    expect(shownTwice(frame)).toEqual([])         // user-defined: shownTwice, a plain function (2.10.18.4)
  }
})
```

**One home per kind of record** (STR48, STF33, STF55). `run.evidence` is one list in run order; each record has the run-wide
`seq`, the Runtime's own sequence, and `tab: { name, open }`, so a closed tab's records and the reopened tab's are told apart
(STR42, SP RV M4); filters accept the name alone. `cp.records(kind, { …address, since?: "checkpointName" })` selects one kind, in
order, up to `cp`; `since` is exclusive of that checkpoint's `seq` and takes a **name** (type-checked), and a name later than `cp`
gives `[]`; on `Story.Frame<Subject>` it is typed `string` [P, H20, RV1 M7]. Records are kept for the whole run in process, taken from the Inspection O4 event stream, independent of
the trace's 4,096-event window and of Inspection's per-session 256-entry ring (STR49, STF76). Every kind is an Inspection O4 event
kind (STF72; members added in C79). **The table is the kinds `records` takes, 21** [P, H23, RV1 L3]; Inspection O4 has others, such as `turn`,
`lifecycle` and `admission`:

| Kind | One record per | Fields beyond `seq`, `tab` |
| --- | --- | --- |
| `step` | command | the command as data |
| `verdict` | send, raise, guard check of a lifecycle command | `actor`, `instance`, `copy`, `event`, `result` (`Allowed`, `Denied { reasons }`, `Unhandled`) |
| `ending` | ending delivered, parked, applied with no incarnation, or turned into evidence | `actor`, `instance`, `copy`, `operation`, `contract`, `verb`, `key`, `attempt`, `channel`, `reason`, `event`, `route` (`{ kind: "current" \| "late", from, owner }`, state paths), `declined` (`LateMayNotLeave`), `subject`, `disposition` |
| `lane` | write-lane cell applied (rule 21, 2.7.13, 2.9.3) | lane identity, `cell` (row and state), `before`, `after`; evidence words are cells |
| `life` | fragment incarnation event | `actor`, `instance`, `copy`, `life`, `change` (`created`, `ended`, `frozen`, `thawed`, `reset`), `why` |
| `callback`, `exit` | callback told; exit taken (W34) | `actor`, `instance`, `copy`, `life`, `name`, `payload` |
| `listRepair`, `drop` | `.each` or keyed-schedule repair; dropped raise or timer delivery (rule 9). `drop` is not a wire drop: after `Stripe.confirm.drop()` it is `[]`; read the endpoint's log [RV1 L2] | `actor`, `instance`, `copy`, `reason` |
| `schedule` | armed, fired, discarded, retracted by a freeze | owner (an address), `dueAt` |
| `queue`, `store` | record-queue join, release, removal (`Superseded`, `Cancelled`, `Released`); predictions, confirmations, `uncertain` set or cleared, repairs, skips, tombstones | `entity`, `key`, `attempt`, `reason` |
| `session` | stream-session evidence (v3's Inspection; *Stream details: merge 6*) | `actor`, `instance`, `copy`, `operation`, `key`, a `cell` per T1 and T3 write (`<State>.<input>`), T2's row and basis in place of `answer`, `bookmark`, `held`, `missed`, drops, `Overflow`, `Discarded`, `st` [P, v3 item 6] |
| `request`, `control` | a fake's request (each phase change) or control | 2.10.4 |
| `delivery` | a stream frame's delivery [fakes-v2; RENAMED from `frame`, P, RV1 L2] | `endpoint`, `connection`, `phase` (`delivered`, `held`, `lost`), `digest` |
| `issue`, `diagnostic`, `persistence`, `hydration`, `entry` | as Inspection O4; `UnusedWireRule` is a `diagnostic`: a wire rule that never fired by the end of the run [P, RV1 M17]; v3's flags `ValuesWhileDown`, `RegistrationChurn`, `ReleaseOverdue`, `ProofWithoutPosition`, `PingsWithoutLive`, `DeliveryDenied`, `FillsUntouched` are `diagnostic` records (*Stream details: merge 6*) | as Inspection O4 |

One shape everywhere: `instance` is a list of placement names (`["likes"]`), `copy` is the `.each` copy's key string,
`key` is the contract's key record, `subject` is the subject path (STF38). A callback and an exit with the same name
are two kinds (STF59). An owner is a state path (STF40). An `Overloaded` commit never joined a queue, so it is an
`ending` record, not a `queue` removal (STR32).

**Work** (STR51, STF31, STF32, STF34). `cp.inspection.work` lists the Runtime's unfinished things with what each
waits for, and nothing else: a queued mailbox item (`{ actor, item: "event" | "reset" | "adoption", event, from }`); an
Attempt waiting (`waitsFor: "acknowledgement" | "recordQueue" | "capture" | "server"`, the last with the request's
`n`); a deadline (owner address, `dueAt`, `frozen`); an open session. A lane's state is never repeated there. `pending`
keeps the design's one meaning, the lane row's `InFlight`; the record's old `pending` is `predicted` (E16).

**A moment inside a step** (uncommon; STF46). `checkpoint(name, { at: { settled: O.like } })` names the latest frame of
the previous step whose cause matches; the other causes are `{ turn: E.X }` and `{ step: "invoked" }`. The
confirmed-but-saving moment of 2.8.1 is then a named frame. It has every read in the table above. Its `wire` is not captured,
since a frame has none; a held item at that moment shows in `read(endpoint)`'s phases. `at` here is a checkpoint option and needs
no rename now that `at` is not a read **[proposed in decisions.md, not yet decided]**.

#### 2.10.7 Lanes and rows

Rows are snapshot data (brief C7; 2.7.5), so a frame shows them exactly as a view at that publication reads them
(STR28, STF67). Keyed rows are keyed lists of the lanes that exist; `operations.like` lists only
existing lanes, and `lane(O.like, key)` is `undefined` for one that does not exist, so a wrong key fails instead of reading idle (C3, STF30); the design's `O.like.get(s, k)` stays total for views.
`cp.inspection.lanes` lists every non-`Idle` write lane by identity (actor identity, contract id, key), with subject
path, `binding` (`bound`, `unbound`, `unplaced`), `releasing`, state, flags, queued commits and parked endings: the same
listing as Inspection O1 and `runtime.unsettledWrites()` (STR29, STF41). A parked lane under `cancel` or `allow` is listed
`Held` with `uncertain: true`, as 2.7.13's `Held (parked)` table decides; that listing is where a Story reads it
(STF42). Read lanes and sessions are not write lanes and are never in that listing (STF35). Every ending is an `ending`
record (STR30); "admitted" means only 2.5 step 1, and entering the mailbox is "queued" (STF36).

#### 2.10.8 Entities and the store

Server truth is per run, in fakes; client truth is per tab, in the store; a fake never writes the store, and truth
reaches it only through real responses and pushes (STR34). A test compares them in its own words (W24):

```ts
expect(cp.read(Issues)).toMatchObject({ issues: { c7: { likes: 4 } } })
expect(cp.entity(Issue, { id: "c7" }, { tab: "b" })).toMatchObject({ data: { likes: 4 }, predicted: false })   // STF51
```

The three moments of a domain write (start, settlement, admission) are three publications, hence three frames (STR33, STF46);
`predicted` is read per record and omitted fields are listed in `unconfirmed`, which is what a read at settlement states (STF45,
STF50). A record queue's members, with Attempt and retry count, are in `cp.inspection`; a removal is one `queue` record with its
reason (STR32, STF48). A deleted record reads `undefined` like a never-loaded one, as a view sees it, and the tombstone that tells
them apart is in `cp.inspection` and in `store` records while it lives (STR31, STF49). The boundaries (64/65 with no partial join,
FIFO across two actors, a forced repair holding the queue, `uncertain` set and cleared) are reached by holds and sends (STR35;
2.10.18).

#### 2.10.9 Streams (controls decided, W37)

*Stream details: merge 6.* This section reads v3's `Feed`, sessions and rows ([merge-6-streams/proposal-v3.md](../merge-6-streams/proposal-v3.md)), which are not merged; merge 6 resolves it. v3 runs reconnecting and history from the contract (`reconnect`, `idle`, `catchUp`), so an adapter has no combinator and Flow's own sleeps carry the `timer`s. `.do(…)`, `.process()` and checkpoint predicates are gone (C1, C2, W2, W37); section 11 has the list **[P, H22, v3 section 10]**.

A stream endpoint is a connection: `Fake.stream({ request, frame, open, ping? })` (2.10.4) [fakes-v2; `ping`, v3]. `open(truth, request)`
returns `{ frames?, refuse?, end?, truth?, send? }`. Duplex waits for the first duplex fake [P, RV2 section 8]. Any handler or
control reaches open connections through its `send` list: `socket.frames(where, frames)`, `socket.close(where, code, reason?)` and
`socket.end(where)`, where `where` reads the connection's request. `Fake.webSocket` binds stream endpoints to
`Socket.WebSocketConstructor`; `Fake.fetch` binds them to a streamed body; a client half reads one as `server.socket(input)`, and an
`EventSource` or SDK subscription is a client half over that (STR19). So every `Feed` signal comes from the real adapter reading
real frames (STR36, STF77). Stream controls are ordinary wire steps, with no stream-specific step words (W37):

| Real sequence | Story step |
| --- | --- |
| a greeting that proves a replay, or registers without one | `open` returns the author's `frames`; a control `Chat.greet({ replay: false })` changes truth, which `open` reads |
| a drop, then a reconnect from the bookmark | `world(Chat.socket.drop())`, then `advance({ next: { operation: O.messages, timer: "backoff" } })`; `next` only, since the default is jittered [v3 item 11] |
| a reload that keeps the bookmark | a `Story.app`, since `reload` is a type error on `Story.machine` [v3 item 7] |
| network-refused attempts, a flap | `drop({ at: "open", times: 3 })`; a loop of drop and advance |
| a server refusal | `open` returns `refuse: 4403`; under `Fake.webSocket` the client sees an error, then close 1006, as a browser does, and the code is only in the log (2.10.4) |
| a server's heartbeat | `ping: { every, frame }` on the stream [v3 item 1] |
| a quiet or half-open connection | `hold()` on the socket (frames and pings stop, nothing closes), so a client's `idle` ends it with `Silent` |
| silence after n frames | `hold({ after: 2 })` [fakes-v2] |
| a server close code (token expiry) | a handler or control with `send: [socket.close(where, 4401, "expired")]` |
| a clean end of a body | `end: true` on `open`, or `socket.end(where)`. Under `Fake.webSocket` this is close 1000, which Effect's `Socket` fails as `SocketCloseError`, not a stream end; `complete` from a raw socket is adapter code reading code 1000 [RV1 M11] |
| a log reset, retention shorter than the gap | controls `Chat.resetLog({ epoch })`, `Chat.retain({ last })` |
| a catch-up page held, answered, failed | the history endpoint under `hold`, `release`, `drop`, **set before the step that reads it**; a failed page's retry is `next: { operation, timer: "page" }` [v3 item 9] |
| a flood past the buffer, a constant 1,024 [v3] | a control that sends n frames |
| reordered frames (merge 6's SR12) | `hold()`, the frames, then `release({ nth })` |

**The resume position the server saw** is the socket endpoint's request log, read directly:
`expect(cp.read(Chat.socket)).toMatchObject([{ input: { from: { epoch: 1, seq: 2 } } }, { input: { from: { epoch: 1, seq: 5 } } }])`.
The fake keeps no `connections` field by hand (SP RV L4).

Rows (`connection`, `drop`, `failure`, `catchingUp` for `every` [P, v3 item 5]; `value`, `last { value, at }` for `latest`) are snapshot data; the bookmark is in `session` records and Inspection only. They are read with `operations`, or `lane` with an address for one in a fragment (RV1 M5); after `FeedEnded` a
flapping test reads the row as `undefined`, not `Ended` (merge 6's note). T2's row, the bookmark, `held`, `missed`, drops, `Overflow`, `Discarded`,
`st` and release are `session` records (STR37). Settling never waits for an open stream (STR38). A streaming
write's `progress` publishes as Runtime steps, so each token is a frame; Stop mid-stream is the send that cancels while the body is
open (STR39; SP 4.6). `backoff`, `page`, `healthy`, `idle` and a fake's `ping` run on the run's Clock (brief C12).

**What no transport can produce** (SP RC5; the socket-finalizer finding, SP RV M10). Effect 4.0.5's socket finalizer closes
with `Effect.sync(() => ws.close(1000))` and does not await the close, so a session's scope closes at once on release.
`ReleaseOverdue` and v3's T1 `Releasing` cells in which a signal or value arrives after release begins therefore cannot
be produced through `Fake.webSocket` or any binding whose finalizer does not wait, and SP revision 1's `hold({ at:
"close" })` is removed. They are reached in **Flow's policy suite**, whose purpose-built `callback` adapter has a
finalizer that awaits a gate (2.10.15). An app whose own adapter awaits its close (an SDK `removeChannel`) can reach them
through its own client half; the cells stay listed as suite cells.

#### 2.10.10 Persistence, reload and tabs (W26, W27)

An app Story's tabs are independent Runtimes of its setup that share the run's fake servers and `Fake.storage`
(STR42, Testing O7). A tab's identity is `{ name, open }`: the name and how many times that name has been opened (STR26's
seed already counts it), carried by `via` and every record (SP RV M4).

- `openTab(name, { from? })` constructs and readies one. With `from: "main"` it then ensures, in the new tab, the
  refs this Story's steps ensured in that tab's **latest life and did not dispose**, those it got from an earlier `from` included [P, RV2 L8], with the same options, in
  first-ensure order (SP RC3, SP RV2 M2), so `describe` prints the list from the plan alone. Refs app code ensured are
  ensured again by app code, as in production; `from` may name a closed tab (its latest life). Sends are not repeated: memory comes from
  the server or storage, as in production.
- `closeTab(name)` ends it abruptly with no final flush, releases its scope ownership (brief C11, brief C14), aborts its storage
  writes and leaves its remote requests in transit (2.10.4).
- `reload(name = "main")` is `closeTab(name)` then `openTab(name, { from: name })` in one step (SP N3): the reopened tab
  ensures what the closed one had ensured. It is the one-line reload every reload Story was writing by hand.

A reload mid-charge is written exactly (STR40, STF12): what was acknowledged, what the server applied, and when, are
each a step. After the reopen, restore, `Restored` endings, held lanes, parked endings and the delivery order before
any external event are records and frames. A tab opened while another holds the scope runs without persistence
(`SecondTabNoPersistence` in `cp.tabs.b?.inspection`'s persistence status). While a tab is closed, `read({ actor, tab })` is
`undefined` and its records stay (STR55, STF69). A focused machine Story's actor is a local identity, whose lanes are
never persisted (brief C14), so `closeTab` and `reload` there are type errors. Rebind is `dispose()` then `ensure()`; retain
expiry is `dispose(ref)` then `advance` past the retain; `dispose(ref, { how: "now" })` is `disposeActor` and
`{ how: "forget" }` is `forget` (STR9, STF43). Upgrades start from `storage: Fake.storage.from(oldStory)` (STR41).

#### 2.10.11 SSR and lazy entries

`dehydrate(label, { within })` and `hydrate(source, label?)` are Testing O7's, with two rules (SP RC5). **One world** (W29): a
hydration source Story runs against the destination run's fake servers, not a second run's, so the server render and
the client's refetch read one truth, as in production (SP RV M11). A source may not set `world` (a type error), runs at
the `hydrate` step against the truth current then, and its requests carry `via.tab: { name: "server", open }` (SP RV2 M6). **Time**: `dehydrate`'s time motion settles deadline by
deadline in 2.10.3's order (SP RV L8). A commit in flight at dehydration is a `hydration` record `DehydrateCommitInFlight`
naming the actor, state and instance path, and no client lane exists (brief C15). A state stream's `last` arrives rebased by
its age (STR43). **One clock** [P, RV1 M13]: a source runs on the run's clock and advances it. At a leading `hydrate` there is nothing else to fire. At a later one, tabs' sleeps are held as under `suspended` until it ends. `"server"` ranks before every tab. A source's `world` steps, not only the option, are a type error, so `Story.app`'s type carries "has no world"; its fixtures are its own, and its server is the destination's. Lazy adoption at a chosen step is Testing O7's (STR44). A cut keeps Testing O7's `serverView(label)` for first-render comparison, and hydration evidence is `hydration` records; W24's list does not name `serverView`, and no decision removes it [P].

#### 2.10.12 Fragments (constructor W1; W5, W30–W34)

**In a host** (STR11, STR12, STF53, STF55, STF60). Every fact about a fragment is a record at its actor, instance path
and copy: `life`, `callback`, `exit`, `listRepair`, `drop`, and its operations' `ending` and `lane` records with
`subject`. `cp.inspection.incarnations` lists each live or frozen incarnation (`{ instance, copy, life, status:
"active" | "frozen" }`), so a frozen slice no longer looks active (STF54). A fragment on two hosts gives the same
records at each host's address, and `match`, `attempt` and filters tell them apart by `actor` (SP RV M1, M2).

**Alone** (STR10, F7, rule 58). A trait or subroutine Story runs in a **stand-in host** Flow builds, whose placement
is decided by the **fragment's declaration alone**, never by later steps (rule 66, SP RV M7):

| Fragment | Placement | `leave()` | `leave({ end: true })` | `reset(subject)` |
| --- | --- | --- | --- | --- |
| a trait | one `.each` copy keyed by the Story's `subject` (default `""`), on a node, with `resetOn` returning the same subject | its node is left: the incarnation ends (`whenAbandoned`, rule 60's release) | the same | the reset value changes: a pending reset, a new life |
| a `.resumable()` trait | the same, on a resumable node | its node is left: the incarnation **freezes** | the copy is removed: a frozen or active incarnation **ends** | as above; a frozen one resets on its next `enter` |
| a subroutine | a state | the state is left: abandoned | the same | a type error |

So one prefix has one placement in every branch, a Story may use `leave` and `reset` together, and every placement is
one rule 48 allows. Nothing about the stand-in is readable (STF57): `read()` (and `state`, `memory`, `operations`) is the fragment's own snapshot (its memory
with private fields, schedules, rows); records carry the fragment's instance path `[]` and a subject path made only of
the Story's own `subject` (empty when none is given); a send after `leave` is `Unhandled`. Reads are re-rooted at the
fragment: the stand-in's two path parts (its copy key and its reset value, both the subject) are reported as one,
`[subject]`, or `[]` when no subject is given, in every read, `inspection` included (delegated, at merge).
**Rule 20 at the stand-in** reads its path as `[]` until the Story changes the subject (an `enter({ subject })` with
another value, or `reset`), since only then can a decline from another path occur (rule 51): a writing fragment that
does not map `failure.NotSent` may be tested alone, and `flow check`, which reads the Story's steps (2.10.14), reports
rule 20 at the first step that changes the subject (delegated, at merge).

```ts
const L = Lockout({ limit: 2, length: "1 minute" })
export const paused = Story.fragment(L, { id: "lockout/paused" })                    // a trait alone; no input declared, none written
  .enter()
  .guards({ canStrike: deny("Paused") })                                          // the stand-in's answers from now on (default: allow)
  .send(L.E.Strike())                                                             // public events; hostEvents are sendable alone
  .checkpoint("struck")                                                           // existing: checkpoint
  .leave()                                                                        // ends, or freezes if resumable
```

`guards` is the one way to set a stand-in guard (STF58). `enter(input, { subject })` gives the subject a real host's
`.each` key or `resetOn` would; `enter` while frozen thaws (same subject) or resets on return (another). Callbacks and
exits alone and in a host are the same records (STF60); rule 11's `run.calls` and `checkpoint.exit` are gone (W34). 2.10.17.4
is normative. **Reads** [P, RV1 M4]: `Absent` and `Ended` read absent, so `read()` is `undefined` and `state`, `memory`, `operations`, `schedules` throw `SubjectAbsent`; a test of the memory at an exit reads a checkpoint before it. `Frozen` reads its slice, and `inspection.incarnations` says frozen.

#### 2.10.13 Playback

Recording is still `run()` once and only rendering after (brief C5). Every frame is a publication, so lane-gated buttons,
`check()` eligibility, stream connection states and the confirmed-but-saving moment render as production would
(STR52). `<StoryFrame frame={…}>` takes a frame or a cut (2.10.6) [P, RV1 M15]. The player moves by frame, step or scene, from the internal list of cuts: a step is never lost (STR53, STF63), and a frame's cause is one
cause (STF64). The next-action highlight compares the clicked control's addressed event, `{ ref?, instance path, copy,
tag, payload }`, with the next step's, so a keyed copy or a nested subroutine is found (STR54, STF68); steps that are
not clicks (`world`, `advance`) play as captioned waits. A frame between a settlement and its ending's turn shows its
queued arrival from `work` in Inspect, so it never looks stuck (STR56, STF70). For a tab that is closed at a frame,
`<StoryFrame tab="b">` renders nothing and reports the gap `{ tab: "b", closed: true }` (STR55, STF69). A Story holds no expectations (C1), so the player shows no pass or fail; a `propertyTest` result gives the emitted Story and the frame index to look at [P, H11]. A fragment-alone Story has no app to render: handing it to
`StoryPlayer` or `StoryFrame` is a type error (W1 makes the kind visible on the line), and its frames are readable as text (playback.md 8's agent text frames); playback.md's
open question 2 stays open (STR57, STF71). Presentations stay typed, name checkpoints and hold no callbacks (STR58).

#### 2.10.14 CLI, `flow check`, `flow explain` and Inspection

- `flow story list`, `describe <id>` and `run <id>` work for every subject (STR59; W40). `describe` prints, from the plan alone:
  subject and kind (now the constructor's), options, every step with index in its data form, checkpoints, and **every fake server the plan
  names** in `world` or a step, with its endpoints, controls and their Schemas. A Layer is opaque, so a fake reached only through a fixture is
  not printed: `yield* Stripe` resolves per run from the run-scoped server registry (2.10.4), and only `story run` starts work [P, RV1 M9]. It has no expectation or property lines, because a Story holds neither (W40).
- `flow story run <id>` reports **what ran**, with no pass or fail on correctness (W40): steps, checkpoints with their state and
  `seq`, endings reached, requests per endpoint. **[P, H13, RV1 H4, M17]** It exits 2 when `run()` rejected, under CommandLine's "Story
  execution" failure, printing the `FlowError`'s boundary and evidence. It prints the earliest error as primary, `issue` records and `UnusedWireRule` diagnostics; "product
  failures recorded as Story issues do not alone fail the invocation" (CommandLine) stays. Tests answer whether values are right; `flow story run`
  never claims to.
- No SIGINT handler is installed for mid-run cancellation, since one cannot run during a run [RV3 L5].
- `flow explain --trace <file> --at <checkpoint>` answers lane, ending, store and session questions from the trace's
  records at that checkpoint's `seq`, and says "evidence unavailable" for what fell outside the trace window (STR59,
  brief C13).
- Every record kind is an Inspection O4 member, follows Inspection O5's redaction, and fake truth leaves a process as digests
  (STR60). Request `via` fields are identities and are never redacted.
- `flow stories --coverage` (T2; W40) also lists write-lane cells (from `lane` records' `cell`), stream cells (from
  `session` records' `cell`; *Stream details: merge 6*), ending handlers reached current and late (from `ending` records' `route`) and Flow
  reasons reached (STR61). **Coverage says reached, not checked [P, H14]**: it reads what Stories ran, and knows nothing about tests.
- The Story-derived `flow check` warnings read records the trace keeps (STR62): denial codes from `verdict` records,
  repairs and dropped raises, rule 51's declines from `ending` records, and mapper read-after-write from the `turn`
  event, which gains the keys its mappers read that the turn writes (D16).
- Types catch: unknown checkpoint names, a wrong instance path or copy key in an addressed event, a mapped, internal or
  host event sent from outside (rule 47, 2.2; host events only alone), a fixture list that does not meet `R`, an
  undeclared control (controls are members of the fake's handle), a schedule name in an address the subject does not
  declare, a read of an operation the subject does not declare, `state`, `memory`, `operations`, `schedules` or `read()` on an app Story's cut,
  `lane(O.x, …)` on an app Story, `at` on a handle, a `world` control on a hydration source, a subject of the wrong kind for its constructor (W1), and a fragment Story given to an
  app-only API (STR6, STR63).
- A Story is data: `flow check` and `flow graph` read its steps without running a Runtime (STR64).

#### 2.10.15 Reaching every cell: write lanes, streams and the policy suite

Every reachable cell is reached through production paths (W12: no injection). Each `lane` and `session` record
names its cell, so coverage counts cells; a "cannot occur" cell firing is a Runtime defect (an issue), which property
tests over the policy suite's machines search for (STR65, STR66).

| 2.7.13 holding table row | Reached in `Idle` / `InFlight` / `Held` by |
| --- | --- |
| `commit`, `retry`, `cancel` | the send (or timer) whose transition lists the member, after the lane was brought to the state: `InFlight` by `hold()`, `Held` by `drop({ at: "response" })`; `cancel` while waiting to be invoked by holding the acknowledgement (never sent) or a persisted re-send's `capture` (a re-send) |
| `idle`, `retryable` (guards) | a guarded send in each state; the result is a `verdict` record |
| invoked | settling once the acknowledgement, record queues and capture allow |
| storage refused | `Fake.storage.write.drop({ match: { purpose: "acknowledge" } })` (never sent); the same on `capture` for a re-send |
| success, failure, unknown, interrupt | the held request's answer; an interrupting client half, or a cancel's interruption |
| dispose, rebind | `dispose`; `dispose` then `ensure` of the same identity |
| restore | `reload`: acknowledged and on the wire (`unknown { Restored }`); acknowledgement stored, confirmation held (2.7.13's G1: acknowledged, never invoked); acknowledgement held, so aborted (`NotSent { Restored }`); with a `W` entry queued (its `NotSent { Restored }`); a cancelled Attempt whose acknowledgement was stored with its confirmation held (`unknown { Restored }`, Stories T7) |
| SSR hydration | `dehydrate` with a commit held on the wire, then `hydrate` |
| Runtime disposal | the policy suite's internal step only (Stories T2) |

The `cancel`/`allow` table adds `turn end`, reached by settling; `Held (parked)` by a persisted identity disposed by
retain expiry (`dispose`, `advance`), an unknown answer released while it has no actor, then `ensure`. 2.9.3's rows:
another path's member by two copies whose commits share a key; freeze and thaw by `leave()` and `enter()` on a
resumable placement; parking in a live actor by removing the copy; the releasing rows by a `whenAbandoned` cancel and
a removal in each state, restore by `reload`, and the cleared mark by re-adding the copy before the lane is `Idle`. The
two hydration cells 2.7.13 calls untestable (G6) stay so.

For streams (v3's T1–T8, STR66; *Stream details: merge 6*) [P, v3 item 12]: T1's signals come from `open`, controls and `ping`, values from `socket.frames`, `down` from
the adapter reading a `drop`, failure from `socket.close`, completion from `socket.end` or `end: true` on a body or client half (under `Fake.webSocket` close 1000 is adapter code's to read, RV1 M11), defect from a malformed frame, `idle` from `hold()`, release from leaving the state;
its page rows from the history endpoint and a control like `retain`, their delays from `advance({ next })`; T6's
queue from floods through a `callback` client half; T8's progress from a streamed body with a superseded
Attempt. Coverage counts T1 and T3 cells, `<State>.<input>`, from `session` records. **Suite-only cells**: `ReleaseOverdue` and the `Releasing` cells with a late signal or value (2.10.9), T1 and T3's cells for a turn in the wait for a predecessor [v3 item 12], and the
Runtime-disposal cells. The wire's own `interrupt` while in transit or while an answer returns cannot occur under
rule 61 (both are instantaneous within a step, SP MDL W2), so 2.10.17.2 no longer lists them.

**The policy suite** (STR67, operations merge-plan X33, brief C11). Flow's own suite is Stories over small purpose-built machines and adapters,
run by the same executor under its Clock. It uses one step apps cannot import, `disposeRuntime()` from
`flow-state/internal/testing`, and one adapter (a `callback` client half whose finalizer awaits a gate; *Stream details: merge 6*). The
executable lane, stream and Story models remain design checks (brief C1); their invariants become properties of the suite.

**Rule 58's walks, as steps** (STF62). Two copies on one lane, the second declined: two `send`s to two copies whose
commits share a key, `ending { reason: NotSent Rejected }`. A freeze during catch-up, thaw, `Interrupted`, `resync`:
`hold()` the read, `leave()` a resumable trait, `enter()`, then `advance` to `resync`. A creating raise meeting an
adopted hold: `drop({ at: "response" })`, `leave()`, `enter()` whose turn raises. A copy removed during a 412 save,
re-added, text kept: 2.10.18's `reopenedKeepsText`. An upgrade from a host-only lane: `storage:
Fake.storage.from(oldStory)`, `openTab`. A removed uploading copy, reload, nothing parked: `hold()`, a removal with
rule 60's cancel, `closeTab`, `openTab`, and the test reads `cp.inspection.lanes` as empty. Two rows of a nested writing trait,
one removed: two copies, `hold()`, a removal, and the test reads the other copy's rows. "A, B, A" under `resetOn`:
`reset("B")`, `reset("A")` alone, or the host's sends. A reload while frozen or while owed: `leave()` or `hold()`,
`closeTab`, `openTab`. A reload that loses a pending reset: `storage: Fake.storage.seed([an actor record whose reset key
differs from its saved incarnation's reset value])`, then `openTab`: the restore re-takes the value and resets the
trait as the first turn, before rule 44's deliveries (rule 51).

#### 2.10.16 Property tests and exploration (W25, W38, W39; Stories T5 B5, with SP RV's condition)

`propertyTest(story, options)` (W38) generates ordinary Stories by appending generated steps to a base Story. It takes **plain
functions** as its properties, in its own option (W25). It is the one place in Flow that judges, because searching and shrinking need
a verdict (rule 63).

```ts
// money.test.ts. Base Story: inputs only.
const base = Story.machine(PayMachine, { id: "pay/money", context: signedIn, fixtures: [StripeFake] })   // RENAMED: Story.machine [W1]
  .send(E.Start(CART_1))                                                       // user-defined: CART_1, signedIn, PayMachine

test("charged once, never left authorized", () =>
  propertyTest(base, {                                                         // existing: propertyTest; CHANGED: story first [W38]
    steps: [                                                                   // existing: steps
      [E.PayPressed(), E.Leave(), E.CheckAgain()],                             // Testing O6's generator: a sample array of step data [P, RV1 H3]
      [Stripe.confirm.hold(), Stripe.confirm.release(), Stripe.confirm.drop({ at: "response" })],
      [Stripe.busy({ times: 1 })],
      [{ advance: "2 seconds" }, { advance: "5 minutes" }],                    // the shape together takes
    ],
    properties: {                                                              // existing word, CHANGED: own option, plain functions [W25, W38]
      chargedOnce: (frame) => {                                                // user-defined: chargedOnce; the key is its name
        const { charges } = frame.read(Stripe)                                 // existing: read
        const twice = charges.filter((c, i) => charges.findIndex((d) => d.intentId === c.intentId) !== i)
        return twice.length > 0 ? twice : undefined                            // undefined: fine; any other value: the violation
      },
    },
    whenQuiet: {                                                               // NEW [P]: checked once, at the quiet point
      noneLeftOnACard: (cut) => {                                              // user-defined
        const left = cut.read(Stripe).charges.filter((c) => c.status === "authorized")   // this Stripe's Charge has a status (the Checkout's, not 2.10.4's)
        return left.length > 0 ? left : undefined
      },
    },
    seed: 11,                                                                  // existing: seed, required
    runs: 200,                                                                 // existing: runs (default 50)
    length: 30,                                                                // existing: length (default 40, Testing O6's "steps")
  }))
```

**Options.** `propertyTest(story, { steps, properties?, whenQuiet?, seed, runs?, length?, quietWithin? })`. `steps` lists generators
of step values: Testing O6's nonempty sample arrays, or pure `{ sample, shrink }` objects. **A step value is a step's data form** (2.10.1), any but `checkpoint` [P, RV1 H3, RV2 M10], so an app Story can generate targeted sends, lifecycle steps and races:

```ts
steps: [                                                                       // existing: steps; on an app Story
  [{ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] }],     // NEW form: { send: [target?, ...events] }
  [{ reload: "main" }, { closeTab: "b" }, { openTab: ["b", { from: "main" }] }],   // NEW form: a lifecycle step, keyed by its method
  [{ together: [{ send: [payRef, pay] }, Stripe.confirm.release()] }],         // NEW form: a generated race, so 2.7.13's P1 is findable
  [Stripe.confirm.hold(), Stripe.confirm.release()],                           // existing: controls
]
```

The desk and Checkout invented a `Generate` module; no design defines one, so none is added here.

**Properties are plain functions** (W25, W38). `properties` is a record of `(frame) => violation | undefined`, named by its key, run on
every frame of every generated run. `whenQuiet` **[P, H9]** has the same shape, over the cut at the quiet point, and runs once if that is reached.
This replaces the `frame.settled` the Checkout assumed.

**The quiet phase ends the world** [P, RV1 H2]. Otherwise a correct app rejects, since a run ending on `hold` leaves a Pay `InFlight` forever. After the generated steps, it releases every target with a standing rule **or a held item** [RV2 M4],
in the order set, then moves time within `quietWithin`. **These are ordinary steps and are part of the emitted Story**, so a pasted one reproduces. **Quiet** is no lane
`InFlight`, no held item, no queued arrival, and no deadline at or before the horizon that an operation owns. Open sessions, actor schedules that recur and setup-scoped sleeps do not count, so a polling app can go quiet [RV2 M4]. EntityDomains O4's "at quiet" takes the same line. **[P]** A function that throws counts as a violation carrying the error, so the
runner's `expect` works inside one; a function must be pure and has only the frame. **Flow's own read errors are not violations** [P, RV2 M5]: `SubjectAbsent` or `AmbiguousRead` thrown in a property, on a frame where a generated `dispose` left no subject, say, rejects as a `FlowError` with `reason: "PropertyDefect"`, naming the property, and shrinking retains a candidate only if its violation is not one of these. Otherwise a candidate dropping `enter` would "fail" on its first frame, and shrink the real failure to an empty Story. To share one across Stories, annotate
`(frame: Story.Frame<typeof PayMachine>)` **[P, RV1 M7]**, by subject, as a type only, since `StoryFrame` is the component. At least one of `properties` and
`whenQuiet` is required.

**Judging** (Testing O6's distinctions, kept). **[P, H8]** `propertyTest` resolves with `{ _tag: "Pass", seed, runs }` and rejects with a
`PropertyTestFailed` carrying `result`, whose `_tag` is:

| `result._tag` | When | Fields |
| --- | --- | --- |
| `Fail` | a property returned a violation or threw | `property`, `violation`, `at: { frame: n } \| { quiet: true }` [RV1 H2], `story` (the shrunk Story), `source` (the appended steps as a string, section below) [RV1 L9, RV2 M12], `run`, `seed`, `shrinks`, `bound` |
| `Fail` with `reason: "FramesTruncated"` | a generated run's frames were truncated, so some were not checked (W25; a truncated run never passes). No property failed, so nothing is shrunk, and **the search continues; a later real `Fail` wins** [RV2 M5]; lower `length` | `seed`, `run` |
| `Inconclusive` | turn exhaustion, pending external work, a quiet horizon not reached, insufficient evidence. **`StoryTurnLimit` and `HostTimeWait` under generation are here** [RV2 M5]. Never pass | `reason`, `seed`, `completedRuns`, `inconclusiveRuns` |

**All runs complete** unless one fails, and `Fail` wins over `Inconclusive`, so an `Inconclusive` at run 3 cannot hide a real `Fail` at run 50 [P, RV1 H2].

Acquisition, generator and cleanup defects, and `StoryFakeError`, reject as ordinary `FlowError`s, not counterexamples (Testing O6); a `StoryFakeError` here carries `seed`, `run` and the unshrunk `source`, since a crash found only on a generated path has no other way to reproduce [RV3 L5]. Rejecting makes
`test("x", () => propertyTest(…))` honest; a returned `Fail` that nobody checked would pass silently.

Two rules make generated runs useful (SP RV's B5 condition):

- **A generated step that is invalid in the current state is skipped**, never `StoryInvalidCommand`: a `release` with
  nothing held, a `leave` when not entered, an `ensure` of an existing actor. The skip is a `step` record with
  `skipped: reason`, and the same seed skips the same steps. **The emitted and shrunk Story leaves skipped steps
  out**: they had no effect, so the run is the same, and the literal Story replays without `StoryInvalidCommand`
  (STR69, SP RV2 M9).
- **Shrinking keeps pairs**: a `hold` and the `release` that ends it, a `closeTab` and its `openTab`, `enter` and
  `leave`, are removed together or not at all, so a shrunk Story never strands a hold it did not have.

Every fault Testing O6 names is one of those steps (hold, release, fail, delay as hold-advance-release, reorder as
`release({ nth })`, duplicate, lose as `drop`, push as a control, disconnect and reconnect, change subscriptions as
sends or `ensure`/`dispose`, invalidate as a step, crash and restore as `reload`, adopt as lazy adoption), so a shrunk
failure is a literal Story that runs and plays back (STR69, STF52). Shrinking retains a candidate only if the same property fails,
stops at 1,000 candidates or no smaller failure, and reports the bound (Testing O6).

**A counterexample [P, H10, RV2 M12].** The emitted Story holds inputs only (C1), so running it alone reports nothing wrong. `source` is **the appended steps only, chained from the author's `base`**, since at run time a Layer or a ref's variable has no name: `base.world(Stripe.confirm.drop({ at: "response" })).send({ _tag: "PayPressed" })`. Its options come from `base`. Controls print by server name and endpoint, so the variable must match `Fake.server`'s name; events print as literals; refs print as `steps[i]`, by generator index, since the author passed them there; a non-JSON event payload such as `DateTime` does not paste [RV3 L5]. A run between `propertyTest` runs may yield to the host, so a runner's timeout can fire there. Its id is
`<base id>/counterexample/<seed>`, with no option needed. To keep it as a regression, paste `result.source`, lift the property to a `const`, and run the same plain function:

```ts
export const chargedTwice = base                                               // user-defined: base, the author's own  // the rest pasted from result.source
  .world(Stripe.confirm.drop({ at: "response" })).send({ _tag: "PayPressed" }).advance("5 minutes")

test("regression: charged twice", async () => {
  const run = await chargedTwice.run()
  for (const frame of run.frames) expect(chargedOnce(frame)).toBeUndefined()   // user-defined: chargedOnce, the same function
})
```

**Domains are a preset** (W38). Testing O6's domain form becomes `domainPropertyOptions(domains, inputs)`, exported from `flow-state/testing` so a testing helper stays out of a production module **[P: RENAMED from
`Domain.propertySteps`, H10, RV1 L12]**, which returns `{ steps, properties, whenQuiet, quietWithin }` to spread: its steps are the domain's faults
and its properties are EntityDomains O4's, as plain functions over `frame.read(fake)` and `frame.entity`, keeping O4's oracle, quietness
and `Inconclusive` rules.

```ts
propertyTest(base, { ...domainPropertyOptions([Issues], { setLike: likeInputs }), seed: 3 })   // NEW [P]: domainPropertyOptions  // user-defined: base, Issues, likeInputs
```

**After `model()`** (W39; STR68, STF79). `model()` is removed. Finding a sequence the author did not write is this search on the
real Runtime: write the property "never `LOCKED_OUT`" and shrink the counterexample. Shrinking gives a **local minimum**, a short way
in, not the shortest (SP RV). Exhaustive paths and shortest counterexamples are given up; one Runtime and one execution path stay
(W39, T1).

**Weighed.** STR70 (worlds from contracts): in reach with no new runtime; the generators already range over every
endpoint a subject's contracts reach, every wire word and every address. STR71 (record and replay): in reach later as a
scripted fake whose truth is the recorded answers, recorded at the transport bindings; it needs stable event tags and
Schemas (present), raw in-process capture (Inspection O5 digests cannot replay), and it rots loudly when a payload no longer
decodes. STR72 (one controller): yes; user input, time, the network, server state and storage are steps of one plan,
seeded by one option, named by one address.

#### 2.10.17 State machines as tables

Normative for the executor, and complete enough to rebuild the executable model from this section alone: every state
is a column, every input a row, every cell defined or "—" (cannot occur, with the reason). The model's ambiguities
A1–A6 are settled here (delegated, at merge). fakes-v2's order and close rows and RV1 H5's rows are folded in below; the executable model must be
extended with them and the drain before merging, which fakes-v2 section 6 lists and has not been done.

##### 2.10.17.1 What a step runs

| Step | Admission | Time | Settles (2.10.2) | Its cut | Errors |
| --- | --- | --- | --- | --- | --- |
| the start | fixtures acquired, first tab bootstrapped or actor started | fixed | after | one: a checkpoint before any step names it | a build parked after this settle with no deadline rejects here [P, RV3 M5] |
| `send(target?, …events)` | open | fixed | after each event | a step cut per event | `ActorAbsent`, `TabClosed`, `StoryTurnLimit` |
| `together(…inputs)` | held until every input arrived, then open | fixed, or moved by an `{ advance }` input (deadlines fire, events queue, no turns) | after admission resumes | one | as `send`; `NothingHeld`, `InvalidDuration` |
| `world(…controls)` | open | fixed | after each control | one | `NothingHeld`, `NoConnection` |
| `advance(d)` | open | each deadline ≤ now + d, then now + d | at each deadline (2.10.17.5), then at now + d | one | `InvalidDuration`, `StoryTurnLimit` (per instant; `reason: "Advance"` past 100,000 deadlines) |
| `advance({ next })`, `advance({ to })` | open | to the earliest unfrozen deadline the address matches; to `to` | as `advance` | one | `NoDeadline`, `InvalidDuration` |
| `advance(d, { suspended })` | the tab runs nothing during the move | as `advance`, the tab's sleeps skipped | at each world deadline; then the tab's overdue ones in deadline order, then its queued transport input | one | as `advance` |
| `ensure`, `dispose`, `enter`, `leave`, `reset`, `setContext` | open | fixed | after | one | `AlreadyEntered`, `NotEntered`, `ActorAbsent` |
| `openTab(name, { from? })` | open | fixed | after bootstrap, then after each ensure `from` repeats | one | `TabOpen` |
| `closeTab(name)` | the tab stops | fixed | after (other tabs; remote requests keep travelling; local writes abort) | one | `TabClosed` |
| `reload(name)` | as `closeTab` then `openTab(name, { from: name })` | fixed | as both | one | as both |
| `guards(answers)` | — | fixed | no | one (no publication) | — |
| `dehydrate` | open | moves time as `advance` does | after | one | Testing O7's |
| `hydrate` | open; a leading one runs before bootstrap | a source advances the run's clock; at a later one, tabs' sleeps are held as under `suspended` until it ends [P, RV1 M13] | after | one | Testing O7's |
| `checkpoint(name, { at? })` | — | fixed | no | names the latest step cut (`at`: a frame of the previous step) | duplicate or unknown names are type errors |

A run never yields to the host between its first step and its cleanup. Every settle runs the drain until `K` consecutive hops show no scheduler activity and no arrival at anything of Flow's, within the hop cap (`StoryTurnLimit`, `reason: "Settle"`). After the last cut, if a commit or read fiber is parked, the run finishes the world, with nothing reaching the evidence; a fiber still parked is `HostTimeWait` (2.10.2, rule 61) [P, RV2 H1, M1, M2, RV3 M1].

**Cleanup** [P, RV3 M3]. During cleanup the Clock runs free: a settle that leaves a finalizer parked jumps to the next deadline, so a flush after a short sleep and a close under `Effect.timeout` finish. Cleanup may yield to the host, and has its own hop cap and a real-time bound, proposed 1 second. Past either, it is a cleanup failure naming the finalizer's scope. The run has already been judged, so a real timer here cannot change the result. An uninterruptible loop in a finalizer still starves the host (reasoned, not run). A world control applied while every tab is closed still has a step cut (rule 64).

##### 2.10.17.2 A request at a call endpoint

**Rules.** Each server keeps two lists of rules `{ target, word, at, times, match }` (target: the handle, covering every
endpoint, or one endpoint), ordered by when each was set: one for calls and attempts, one for frames (2.10.4) [P, RV1 H5]. **At arrival** a request takes the earliest-set rule whose
target covers its endpoint and whose `match` it fits, and only that
rule, whose `times` then drops by one (at zero it is removed unless it still holds an item, 2.10.4 rule 5 [RV3 M6, MDL N3]; `"always"` stays). Its effect applies at the rule's phase.
Requests from tabs reach the endpoint in invocation order (2.10.2). Under rule 61 a request is never observable between
leaving the client and reaching the gate, nor between the handler's answer and the client (SP MDL W2), so those are not
states.

States: `Held` (in transit, unseen by the server), `Server` (`handle` commits synchronously, its `send` is delivered, and its answer waits in the FIFO answer list; only `together` can observe this state, since a settle delivers the list) [P, RV1 M1, M2], `HeldAnswer` (handled;
the answer waits). Each request also has `gone` (its client cancelled, or its tab closed). Terminal phases: `answered`,
`lost`, `dropped`, `orphan` (handled, nobody to answer), `duplicate` (a second copy's answer, discarded).

| Input ↓ / State → | (arriving) | `Held` | `Server` | `HeldAnswer` |
| --- | --- | --- | --- | --- |
| its rule is none | → `Server` | — | — | — |
| its rule is `hold()` | → `Held` | — | — | — |
| its rule is `hold({ at: "response" })` | → `Server`, marked to hold | — | — | — |
| its rule is `drop()` | → `lost`; the client gets `Fake.Lost` | — | — | — |
| its rule is `drop({ at: "response" })` | → `Server`, marked to drop | — | — | — |
| its rule is `duplicate()` | → `Server`, and a copy → `Server` after it | — | — | — |
| `release()` on its target | — | → `Server`, in arrival order, after the `HeldAnswer`s join the answer list [P, MDL G3] | no change; a request marked to hold: the rule ends for later arrivals, and its answer is delivered once ready [P, MDL U2] | joins the answer list, in arrival order; then → `answered`, or `orphan` if `gone` |
| `release({ match })`; no item matches: `NothingHeld` [MDL N1] | — | matching: → `Server`; else stays | no change | matching: as `release()`; else stays |
| `release({ drop: true })` | — | → `lost` | no change | → `dropped`; the client, if any, gets `Fake.Lost` [RV3 L3] |
| `release({ nth: k })` | — | the k-th held item (from 1, arrival order, `HeldAnswer`s counted) first within its kind, then the rest as `release()`; fewer than k held: `NothingHeld`, naming k, nothing released (2.10.4) [MDL N2] | no change | as `Held`'s cell |
| handler answers | — | — | commits, delivers its `send`, then by the one order: a copy: → `duplicate`; marked to hold: → `HeldAnswer`; marked to drop: → `dropped` (the client, if any, gets `Fake.Lost`); `gone`: → `orphan`; else, at its turn in the answer list, → `answered`, or `orphan` if `gone` by then [RV3 L3] | — |
| `handle` throws (a crashed server): no truth, no frames | — | — | the table below; `StoryFakeError` at the run's end | — |
| its client cancels, or its tab closes | — | stays `Held`, `gone` | continues, `gone`; its frames still go | stays, `gone` |
| a tab is suspended | — | stays | continues (the server is not suspended); its answer waits in the tab's transport | stays; delivered when the tab wakes |

**Handler fails**, in the same order as the row above, so a hold-marked `gone` request is `HeldAnswer` whether it crashes or not, and `release` then makes it `orphan` [P, RV1 M1, MDL G1]:

| Handler fails | Result |
| --- | --- |
| a copy | → `duplicate`, nothing reaches the client |
| marked to hold | → `HeldAnswer`, holding the failure |
| marked to drop | → `dropped`, `Fake.Lost` if a client is there |
| `gone` | → `orphan` |
| otherwise | → `answered` with the binding's failure (`Fake.Lost`, `500`, close `1011`) |

A held item belongs to the rule that held it: `release()` on a target delivers exactly the items its own rules held
(a handle's, on any endpoint) and removes every standing rule whose target is its own (a handle's `release` does not
end an endpoint's rules, nor the reverse). With no held item and no standing rule it is `NothingHeld` (SP MDL W1),
at a call endpoint, a stream endpoint and `Fake.storage` alike. Every change is a `request` record. 14 rows × 4 columns: 56 cells, 26 defined, 30 "—" (a
request takes its rule once, at arrival, and a handler acts only on a request at the server).

##### 2.10.17.3 A connection at a stream endpoint

States: `None` (no connection), `Opening` (an attempt held by `hold({ at: "open" })`), `Open` (including one still counting a
`hold({ after })`), `Silent` (frames held), `Closing { code }` (a server close or end queued behind held frames; the server sees it
as closed, the client as silent) [fakes-v2: "2.10.17.3 gains this state"], `Closed { code }`. A tab's transport input waits while the
tab is suspended, in every state, and is delivered at wake. A clean end is `{ code: 1000 }`. Under a `hold({ after })` a frame counts as
it is delivered, and the frame that reaches the count takes the connection to `Silent`, with later frames queued. Words here are per connection, and 2.10.4's combination rule applies: a word on a handle reaches these rows as the same word on every stream, with `hold` also holding attempts and `drop` as below. Attempts use the arrival list; frames rules the other.

| Input ↓ / State → | `None` | `Opening` | `Open` | `Silent` | `Closing` | `Closed` |
| --- | --- | --- | --- | --- | --- | --- |
| an attempt, rule none | `open` runs. `frames`, `end` absent → `Open`, frames sent (or `Silent`, queued, under a hold in effect); `refuse` → `Closed { code }`, log `refused`, the client sees the binding's refusal (2.10.4); `end: true` → frames, then `Closed { 1000 }` (or `Closing { 1000 }` under a hold in effect, or once a count is reached, [MDL G12]); throws → `Closed { 1011 }`, `StoryFakeError` | — | — | — | — | as `None` (a new connection) |
| an attempt, rule `hold({ at: "open" })`, or a handle's `hold()` | → `Opening` | — | — | — | — | → `Opening` |
| an attempt, rule `drop({ at: "open" })`, or a handle's or a standing `drop` | lost, log `lost`: the binding's lost (`Fake.Lost`, close `1006`), stays `None` | — | — | — | — | lost, stays |
| a `send` of `socket.frames` matches | nothing (no connection) | nothing; `open` replays from truth | delivered in order | queued | nothing: the server sees it closed | nothing |
| a `send` of `socket.close` matches | — | nothing: the server has not seen it [RV1 M11] | → `Closed { code }`, after frames ahead of it | → `Closing { code }`: queued last | — | — |
| a `send` of `socket.end` matches | — | nothing: the server has not seen it [RV1 M11] | → `Closed { 1000 }`, after frames ahead of it | → `Closing { 1000 }`: queued last | — | — |
| a `ping` is due [v3 items 1–3] | — | — | delivered; not counted by `after`, not doubled | nothing; none queues | nothing; none queues | — |
| `hold()` (frames) | a standing rule: the next connection opens `Silent` | the rule applies when it opens | → `Silent` | joins its holds | joins its holds | a standing rule, as `None` |
| `hold({ after: n })` | a standing rule: the next connection counts from its first frame | the rule applies when it opens | counts on its own from now [MDL G8, N6] | a count, starting when frames flow again [MDL N4] | a count, starting when frames flow again [MDL N4] | a standing rule, as `None` |
| `release()`, no other hold left on it | ends standing rules; `NothingHeld` if none | the target's rules end, then the open completes as "rule none" [MDL G16] | ends standing rules, and any count; `NothingHeld` if none | → `Open`, queued frames delivered | queued frames delivered, then the close → `Closed { code }` | ends standing rules; `NothingHeld` if none |
| `release()`, another hold still on it | — | its own attempt: completes, → `Silent`; another target's: no change | ends its rules; a count of another rule goes on | ends its rules, stays `Silent`, queue kept [RV2 M8, MDL G2] | ends its rules, stays `Closing` | — |
| `release({ match })`; no held item on the target matches: `NothingHeld` [MDL N1] | no change | matching: the open completes; else stays | no change | matching: queued frames delivered, unless another target's hold covers it; stays `Silent` while the rule stands [RV3 M6] | matching: frames likewise; the close waits until no hold is left [RV3 M6] | no change |
| `release({ drop: true })` | as `release()` | the attempt is lost, as `drop({ at: "open" })` → `None` | as `release()` | queued frames lost; → `Open` when no hold is left | no hold left: frames and close lost → `Closed { 1006 }`; otherwise frames lost, stays | as `release()` |
| `release({ nth: k })` | as `release()` | as `release()` | as `release()` | no hold left: → `Open`, the k-th queued frame first, then the rest in order; otherwise as `release()` | no hold left: the k-th queued frame first, the rest, then the close, which is not counted; otherwise as `release()` | as `release()` |
| `drop()`, default `times` | if no connection matched: on the endpoint `NoConnection`, on a handle a rule for the next arrival | → `None`, lost, log `lost` [RV2 L4] | → `Closed { 1006 }` | → `Closed { 1006 }`, queued frames lost | → `Closed { 1006 }`, at once; queued frames and the close lost | as `None` |
| `drop({ times })`, above 1 or `"always"` | stands as `drop({ at: "open" })` | → `None`, lost; stands | → `Closed { 1006 }`; stands | → `Closed { 1006 }`, queued frames lost; stands | → `Closed { 1006 }`, queued and close lost; stands | stands |
| `duplicate()` | a standing rule for the next frame | as `None` | the next undoubled frame is delivered twice [MDL N5] | the next released undoubled frame twice | the next released undoubled frame twice | as `None` |
| the client closes (release) or its tab closes | — | → `None` | → `None` (Effect's finalizer does not wait, 2.10.9) | → `None`, queued frames lost | → `None`, queued frames and the close lost | — |

18 rows × 6 columns: 108 cells, 83 defined, 25 "—" (an attempt arrives only with no live connection; a ping needs an open connection; a `where` selects only connections the server sees as live, or a held open; another hold cannot be on a connection that does not exist; nothing is closed by a client that has no connection). 2.10.4's three combination rules are normative over these rows. `release({ nth: k })` with fewer than k queued frames releases that connection in order; it is `NothingHeld`, naming k, only when no queue has k (2.10.4). A count reaching `n` during a release's delivery queues the rest again [MDL U1]. Rows reach connections in their open order [MDL G7]. An answer or frame that reaches a suspended tab waits in its transport and is delivered at wake, after the tab's overdue deadlines, in arrival order (2.10.3); pings coalesce to one [v3 item 3].

Changes **[P]** from the merged table beyond fakes-v2's: `release({ drop: true })` was in 2.10.4's word table with no row here; a second `hold()` on `Silent` was "—", though a Story can write it. `message`'s row is cut (RV2 section 8): a client's frame is ignored and logged in any state. Each `send` to a connection is a `delivery` record. A client close logs `{ phase: "closed", code: 1000, by: "client" }` [RV1 M11].

##### 2.10.17.4 The stand-in host (a fragment alone)

Placement per 2.10.12's table. `subject` is the Story's subject value; "same" and "other" compare with the incarnation's.

| Step ↓ / State → | `Absent` | `Active` | `Frozen` (resumable) | `Ended` (exit taken) |
| --- | --- | --- | --- | --- |
| `enter(input, { subject })` | a new incarnation | `AlreadyEntered` | same subject: thaw (parked endings, then `activities`); other: reset on return, a new life. The subject compared is `enter`'s when it gives one, else the one `reset` stored | a new incarnation |
| `leave()` | `NotEntered` | resumable: → `Frozen`; else → `Absent`, `whenAbandoned` and rule 60's release | `NotEntered` | `NotEntered` |
| `leave({ end: true })` | `NotEntered` | → `Absent`, `whenAbandoned`, release | → `Absent`: the frozen incarnation ends, `whenAbandoned` runs, its parked read endings become evidence (SP MDL H1) | `NotEntered` |
| `reset(subject)` (traits) | `NotEntered` | same: nothing; other: a pending reset, a new life | stores the new subject; the next `enter` resets, unless it gives a subject of its own | `NotEntered` |
| `guards(answers)` | stored | stored | stored | stored |
| `send(event)` | `Unhandled` | the fragment's turn | `Unhandled` | `Unhandled` |
| the fragment takes an exit (subroutines) | — | → `Ended`, an `exit` record | — | — |

7 rows × 4 columns: 28 cells, 25 defined, 3 "—" (only an active subroutine takes an exit).

##### 2.10.17.5 Order: equal instants and settling

| Rank | Owner of a sleep | Then by |
| --- | --- | --- |
| 1 | a fake's `ping` [P, v3 item 1] | server name, connection open order, arming |
| 2 | adapters (fibers of an operation) | tab order, actor creation, operation, key, arming |
| 3 | setup-scoped fibers (an SDK client, a rate limiter) | tab order, layer order, arming |
| 4 | the Runtime's own waits | tab order, actor creation, arming |
| 5 | actor schedules | tab order, actor creation, instance path in placement order, copy in list order, schedule key in list order, arming |

A handler is pure and takes no time (RV1 M1), so a fake's only sleep is its `ping`. It ranks first so a tie with a client's `idle` keeps the connection alive; without this rank, RV3 got `Silent` at 45 s or 90 s by arming order. A client half's own sleep ranks as an adapter under an operation, otherwise as setup-scoped. A hydration source's tab `"server"` ranks before every tab (RV1 M13).

At one instant one sleep wakes, the Runtime settles, then the next. "Tab order" is each name's first-open order; a
reloaded tab keeps its rank (SP RV2 L5). Inside a settle: tabs take turns one at a time in tab order; invoked Attempts reach fakes in invocation order (tab order, then the turn that promoted them); fake
handlers run in arrival order, and answers go through the one answer list: those a `release` freed join first, then handlers' [P, RV1 M2, MDL G3]; connections are reached in open order [MDL G7]; storage writes are FIFO per tab (2.10.17.6).

##### 2.10.17.6 A write at `Fake.storage` (local)

States: `Queued` (behind an earlier write of the same tab), `Held`, `HeldConfirm` (stored; the caller's confirmation
waits). Terminal: `stored`, `aborted`, `refused`. Reads never queue behind writes (bootstrap restore is a read, STF6); their
own rows are below.

| Input ↓ / State → | (arriving) | `Queued` | `Held` | `HeldConfirm` |
| --- | --- | --- | --- | --- |
| an earlier write of its tab is unfinished | → `Queued` | — | — | — |
| its rule is none | → `stored` | — | — | — |
| its rule is `hold()` | → `Held` | — | — | — |
| its rule is `hold({ at: "response" })` | applied, → `HeldConfirm` | — | — | — |
| its rule is `drop()` | → `refused` (the caller sees the store's failure: `StorageRefused`) | — | — | — |
| its rule is `drop({ at: "response" })` | applied, → `refused`: the caller sees a failure though the bytes were written [P, RV1 M12] | — | — | — |
| the write ahead of it finishes | — | takes its rule now, as "arriving" | — | — |
| `release()` | — | no change | → `stored` (then the queue behind it moves) | → `stored`, confirmed |
| `release({ match })` | — | no change | matching: → `stored` | matching: → `stored`, confirmed |
| `release({ drop: true })` | — | no change | → `refused` | → `refused`: the caller sees a failure though the bytes were written |
| its tab closes | — | → `aborted` | → `aborted`: never applied | stays written; the confirmation is lost (2.7.13's G1 cell after `reload`) |

A cancelled Attempt's `Held` acknowledgement either lands before the capture that removes it (queued behind it; a
Persistence fact, Persistence O7) or is aborted with the tab (SP MDL F1). A `HeldConfirm` one stays written, so `reload` restores
it as `unknown { Restored }` (2.10.4; Stories T7). 11 rows × 4 columns: 44 cells, 19 defined, 25 "—".

`duplicate` is not a `Fake.storage` word (a type error): local storage has no network to repeat a request.

A read at `Fake.storage` (a slow or failed restore):

| Input ↓ / State → | (arriving) | `Held` |
| --- | --- | --- |
| its rule is none | → `served` | — |
| its rule is `hold()` | → `Held` | — |
| its rule is `drop()` | → `refused`: the restore fails as the store's failure would | — |
| `release()` | — | → `served` |
| `release({ match })` | — | matching: → `served` |
| `release({ drop: true })` | — | → `refused` |
| its tab closes | — | → `aborted` |

7 rows × 2 columns: 14 cells, 7 defined, 7 "—". While a restore read is held, the tab has not finished bootstrap:
its persisted actors are absent, and a send to one is `ActorAbsent`. Refused, the tab reports `StorageFailure` and runs
without persistence (Persistence O5).

#### 2.10.18 Examples

Each case starts at the real source, names the fake that stands in for it, and gives the Story and its test in full. Machines are
the design's (cited), unchanged. The record's chat (SP 4.3) and LLM (SP 4.6) cases run on v3's `Feed` and sessions, which are not
merged; they port with merge 6 (*Stream details: merge 6*).

Marks in this section: **RENAMED** `Story.make` → `Story.machine`, `Story.app` or `Story.fragment` everywhere (W1), and `Story.x` reads → `cp.x`
(W24). Every example is **[P]** in form: C1's example fixes the shape, and these apply it. Names of fakes, controls, schedules and refs are
user-defined.

##### 2.10.18.1 Before and after: the common case

The SG2 case: an editor actor with input and a fake for its one service; two sends; time passes; the state, one
memory field, one lane row and what the server received are checked.

Before (the merged design, with `.expect` in the Story):

```ts
export const saved = Story.make(Editor, { id: "editor/saved", input: T42, fixtures: [TicketsFake] })
  .send(E.TitleChanged({ title: "Replace foyer light" }), E.SaveRequested())
  .advance("2 seconds")
  .expect({ state: S.SAVED, memory: { title: "Replace foyer light" }, operations: { save: { pending: false } } })
  .expect(Tickets.save, [{ input: { title: "Replace foyer light" }, via: { attempts: [Story.attempt(O.save)] } }])
test("editor saved", () => saved.run())
```

After:

```ts
// editor.story.ts
import { Story } from "flow-state/testing"                                      // existing

export const savesTitle = Story.machine(Editor, {                                // RENAMED: Story.machine [W1]
  id: "editor/saved", input: T42, fixtures: [TicketsFake],                       // existing: id, input, fixtures  // user-defined: T42, TicketsFake
})
  .world(Tickets.save.hold())                                                    // existing: world, hold. A slow answer is hold, advance, release
  .send(E.TitleChanged({ title: "Replace foyer light" }), E.SaveRequested())     // existing: send; each event is its own step
  .checkpoint("saving")                                                          // existing: checkpoint, camelCase [C5]
  .advance("2 seconds")                                                          // existing: advance
  .world(Tickets.save.release())                                                 // existing: release
  .checkpoint("saved")

// editor.test.ts
test("editor saved", async () => {
  const { saving, saved } = (await savesTitle.run()).checkpoints                 // existing: run, checkpoints. The Story is not named saved (RV1 M10)
  expect(saving.lane(O.save)).toMatchObject({ pending: true })                   // NEW: lane [C3]
  expect(saved.state).toBe(S.SAVED)                                              // NEW on a checkpoint: state [C1]
  expect(saved.memory.title).toBe("Replace foyer light")                         // NEW on a checkpoint: memory, not nullable (RV1 M4)
  expect(saved.lane(O.save)).toBeUndefined()                                     // settled, so gone [C3]
  expect(saved.read(Tickets.save)).toMatchObject([                               // existing: read [W23]  // user-defined: Tickets (a Fake.server, as 2.10.4's Stripe)
    { input: { title: "Replace foyer light" }, via: { attempts: [saved.attempt(O.save)] } },   // RENAMED: attempt [W24]
  ])
})
```

Added: three constructors, the reads on a checkpoint. Dropped: `.expect`, `Story.attempt`, `Story.make`. The "Saving…" moment now has a name, because something real keeps the save going: the `hold`.

##### 2.10.18.2 Checkout with 3-D Secure (common; 2.7.3–2.7.4, the operations record's 5.1)

**Source.** `fetch` to the payment API with `Idempotency-Key: attempt.id`, wrapped by the app's `StripeApi` service;
the commit classifies `429` as `Busy`, `402` as `CardDeclined`, `5xx` and `NoResponse` as unknown, and retries one
`NoResponse` inside the send (2.7.3). The fake is 2.10.4's `Stripe` server with its `StripeFake` client half.
3-D Secure's challenge is a control (`Stripe.requireAction()`, user-defined) whose `requires_action` answer the
commit classifies; its Story has the shape of `busyThenPaid`.

```ts
// checkout.story.ts
import { Fake, Story } from "flow-state/testing"
import { CheckoutMachine } from "./checkout.machine"
import { E } from "./checkout.definition"
import { Stripe, StripeFake } from "./stripe.fake"                                 // user-defined (2.10.4)

const checkout = (id: string) => Story.machine(CheckoutMachine, { id, input: { intentId: "pi_1" }, fixtures: [StripeFake] })
export const pay = E.Pay({ paymentMethodId: "pm_card" })

export const paidFirstTime = checkout("checkout/paid")
  .send(pay)                                                                        // settles: committed, invoked, answered, Intent, DONE
  .checkpoint("paid")

export const pressedTwice = checkout("checkout/paying")
  .world(Stripe.confirm.hold())                                                     // the request waits in transit
  .send(pay, pay)                                                                   // a second press while paying: two steps, two cuts (rule 64)
  .checkpoint("paying")                                                             // names the second step's cut
  .world(Stripe.confirm.release())
  .checkpoint("paid")

export const busyThenPaid = checkout("checkout/busy-then-paid")
  .world(Stripe.busy({ times: 1 }))                                                 // user-defined control: the next confirm answers 429
  .send(pay)
  .checkpoint("waiting")
  .advance("2 seconds")                                                             // a new Attempt is sent
  .checkpoint("paid")

export const droppedThenResent = checkout("checkout/dropped-then-resent")
  .world(Stripe.confirm.drop({ at: "response", times: 2 }))                         // charged, both answers lost (the in-send retry included)
  .send(pay)
  .checkpoint("unsure")
  .advance({ next: { schedule: "checkTick" } })                                     // UNSURE's timer (user-defined name): retry, the same Attempt
  .checkpoint("paid")
```

```ts
// checkout.test.ts
import { expect, test } from "vitest"                                               // any runner [C3]
import { O, S } from "./checkout.definition"
import { Stripe } from "./stripe.fake"
// and the Stories above, from ./checkout.story

test("paid first time", async () => {
  const { paid } = (await paidFirstTime.run()).checkpoints
  expect(paid.state).toBe(S.DONE)
  expect(paid.lane(O.pay)).toBeUndefined()                                          // or: operations.pay is { pending: false, uncertain: false }
  expect(paid.read(Stripe)).toMatchObject({ charges: [{ intentId: "pi_1", key: paid.attempt(O.pay) }] })   // the wire key is the Attempt's id
})

test("a second press while paying", async () => {
  const { paying, paid } = (await pressedTwice.run()).checkpoints
  expect(paying.state).toBe(S.PAYING)
  expect(paying.lane(O.pay)).toMatchObject({ pending: true })                       // check() disables Pay here; the frame renders it so
  expect(paying.records("verdict")).toMatchObject([{ result: { _tag: "Allowed" } }, { result: { _tag: "Unhandled" } }])
  expect(paid.state).toBe(S.DONE)
})

test("busy then paid", async () => {
  const { waiting, paid } = (await busyThenPaid.run()).checkpoints
  expect(waiting.state).toBe(S.WAITING)
  expect(waiting.memory).toMatchObject({ busyTries: 1, retryInMs: 2000 })
  expect(paid.state).toBe(S.DONE)
  expect(paid.records("ending", { operation: O.pay })).toMatchObject([
    { channel: "failure", reason: { _tag: "Busy" }, attempt: paid.attempt(O.pay, { n: 0 }) },   // a 503 here would read unknown, and fail (STF4)
    { channel: "success", attempt: paid.attempt(O.pay, { n: 1 }) },
  ])
})

test("dropped then resent: three requests, one Attempt, one charge (STF3)", async () => {
  const { unsure, paid } = (await droppedThenResent.run()).checkpoints
  expect(unsure.state).toBe(S.UNSURE)
  expect(unsure.lane(O.pay)).toMatchObject({ uncertain: true })
  expect(paid.state).toBe(S.DONE)
  const id = paid.attempt(O.pay)
  expect(paid.read(Stripe.confirm)).toMatchObject([
    { phase: "dropped", via: { attempts: [id] } },
    { phase: "dropped", via: { attempts: [id] } },
    { phase: "answered", via: { attempts: [id] } },
  ])
  expect(paid.read(Stripe)).toMatchObject({ charges: [{ key: id }] })
})
```

The two walks that need a persisted identity are app Stories (`ShopSetup` persists `CheckoutRef`). An app Story reads through the ref:

```ts
const shop = (id: string) => Story.app(ShopSetup, { id, fixtures: [StripeFake] })   // RENAMED: Story.app [W1]
  .ensure(Checkout1, { input: { intentId: "pi_1" } })                               // a reopened tab repeats it

export const cancelledInAckWindow = shop("checkout/cancel-before-send")
  .world(Fake.storage.write.hold({ match: { purpose: "acknowledge" } }))            // bootstrap restore is unaffected
  .send(Checkout1, pay)
  .advance({ next: { schedule: "tookTooLong" } })                                   // PAYING's timer: cancel; never sent
  .checkpoint("cancelled")

export const reloadMidCharge = shop("checkout/reload-mid-charge")
  .world(Stripe.confirm.hold())                                                     // acknowledged, sent, in transit
  .send(Checkout1, pay)
  .closeTab("main")                                                                 // abrupt; the request still travels
  .world(Stripe.confirm.release())                                                  // the server charges; the answer goes nowhere
  .openTab("main", { from: "main" })                                                // re-ensures Checkout1; restore: unknown { Restored } → UNSURE
  .checkpoint("reopened")
  .advance({ next: { schedule: "checkTick" } })                                     // retry the same id; the server's dedupe answers
  .checkpoint("settled")

export const reloadAfterPaid = shop("checkout/reload-after-paid")                  // nothing held: the charge settles before the reload
  .send(Checkout1, pay)
  .reload("main")                                                                   // close, reopen, re-ensure [W26]
  .checkpoint("reloaded")

test("cancelled before it was sent", async () => {
  const { cancelled } = (await cancelledInAckWindow.run()).checkpoints
  expect(cancelled.records("ending", { operation: O.pay })).toMatchObject([{ channel: "failure", reason: { _tag: "NotSent", why: "Cancelled" } }])
  expect(cancelled.read(Stripe.confirm)).toEqual([])                                // the server never heard of it
})

test("charged once across a reload (STF12)", async () => {
  const { reopened, settled } = (await reloadMidCharge.run()).checkpoints
  expect(reopened.read(Checkout1)?.state).toBe(S.UNSURE)
  expect(settled.read(Checkout1)?.state).toBe(S.DONE)
  expect(settled.read(Stripe)).toMatchObject({ charges: [{ key: settled.attempt(O.pay, { actor: Checkout1 }) }] })
  expect(settled.read(Stripe.confirm)).toMatchObject([
    { phase: "orphan", via: { tab: { name: "main", open: 1 } } },
    { phase: "answered", via: { tab: { name: "main", open: 2 } } },
  ])
})

test("nothing was in flight: the restored actor is paid", async () => {
  const { reloaded } = (await reloadAfterPaid.run()).checkpoints
  expect(reloaded.read(Checkout1)?.state).toBe(S.DONE)
})
```

**Walk.** `fetch` → `StripeApi` (fake client half) → the wire → `Stripe.confirm`'s handler → `StripeResponse` → the
commit's `if (res.status === 429)` → `Busy` → `E.Busy` → WAITING. The Pay button reads `s.operations.pay.pending`;
the `paying` frame holds that row, so playback renders it disabled. Playback shows `paying` as a scene; the next step
(`world`) plays as "the server answers".

##### 2.10.18.3 Autosave (common; 2.9.6's `Autosave` under `.each`)

**Source.** `fetch("PUT /docs/:id", { headers: { "If-Match", "Idempotency-Key" }, signal })` behind `DocsApi.put`.

```ts
// docs.fake.ts
const Doc = Schema.Struct({ body: Schema.String, etag: Schema.String })
type Truth = { readonly docs: Readonly<Record<string, typeof Doc.Type>>; readonly applied: ReadonlyArray<string> }   // user-defined
export const Docs = Fake.server("Docs", {                                          // user-defined: Docs
  truth: { docs: Schema.Record({ key: Schema.String, value: Doc }), applied: Schema.Array(Schema.String) },   // applied: idempotency keys
  initial: { docs: { d1: { body: "Hello", etag: "e1" } }, applied: [] },
  endpoints: {
    put: Fake.call({
      request: { docId: Schema.String, body: Schema.String, ifMatch: Schema.String, key: Schema.String },
      handle: (t: Truth, r) => {
        const doc = t.docs[r.docId]
        if (t.applied.includes(r.key)) return { response: { status: 200, etag: doc.etag } }   // a re-send of an applied write
        if (doc.etag !== r.ifMatch) return { response: { status: 412, etag: doc.etag } }
        const etag = bump(doc.etag)                                                          // user-defined: e1 → e2
        return {
          truth: { docs: { ...t.docs, [r.docId]: { body: r.body, etag } }, applied: [...t.applied, r.key] },
          response: { status: 200, etag },
        }
      },
    }),
  },
  controls: {
    editElsewhere: Fake.control({ docId: Schema.String, body: Schema.String }, (t: Truth, e) => ({
      truth: { ...t, docs: { ...t.docs, [e.docId]: { body: e.body, etag: bump(t.docs[e.docId].etag) } } },
    })),
  },
})
export const DocsFake = Layer.effect(DocsApi, Effect.map(Docs, (docs) => DocsApi.of({
  put: (d, { idempotencyKey }) => docs.put({ ...d, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", () => new NoResponse())),
})))
```

```ts
// workspace.story.ts
const ws = (id: string) => Story.machine(WorkspaceMachine, { id, fixtures: [DocsFake] })
  .send(E.Open({ docId: "d1", title: "Notes", body: "Hello", etag: "e1" }))
const edit = (body: string) => E.docs.key("d1").Edited({ body })

export const debounced = ws("autosave/debounce")
  .send(edit("Hello w"))
  .advance("500 millis")
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // one pause after the last edit: one save
  .checkpoint("clean")

export const editDuringSave = ws("autosave/edit-during-save")
  .world(Docs.put.hold())
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // the save is in transit
  .send(edit("Hello world!"), E.Close({ docId: "d1" }))                             // the newer edit waits; Close is refused
  .checkpoint("closeRefused")
  .world(Docs.put.release())                                                        // Saved → the newer body goes next with the new etag
  .checkpoint("bothSaved")

export const conflictKeepMine = ws("autosave/412-keep-mine")
  .world(Docs.editElsewhere({ docId: "d1", body: "Theirs" }))                       // the server's etag moves to e2
  .send(edit("Mine"))
  .advance("800 millis")                                                            // 412 → Conflict, the user's text kept
  .checkpoint("conflict")
  .send(E.KeepMine({ docId: "d1" }))
  .advance("800 millis")                                                            // Overwrite → dirty → saved over e2
  .checkpoint("overwritten")

export const offline = ws("autosave/offline")
  .world(Docs.drop({ times: "always" }))                                            // on the server handle: every endpoint, until release
  .send(edit("Hello world"))
  .advance("800 millis")                                                            // NoResponse → SaveUnsure; resend every 2 s
  .advance("6 seconds")                                                             // three re-sends of the same Attempt, then released
  .checkpoint("stalled")

export const reopenedKeepsText = ws("autosave/unmounted-mid-save")
  .world(Docs.put.hold())
  .send(edit("Mine"))
  .advance("800 millis")
  .dispose()                                                                        // the workspace unmounts; the Runtime keeps the lane
  .ensure()                                                                         // a new incarnation of the same (input-free) identity adopts it
  .world(Docs.editElsewhere({ docId: "d1", body: "Theirs" }), Docs.put.release())   // 412 with no copy d1: parked for ["d1"] (rule 53)
  .checkpoint("parked")
  .send(E.Open({ docId: "d1", title: "Notes", body: "Theirs", etag: "e2" }))        // the copy returns and adopts the Conflict
  .checkpoint("reopened")
```

```ts
// workspace.test.ts
test("debounced: one save", async () => {
  const { clean } = (await debounced.run()).checkpoints
  expect(clean.read(Docs.put)).toMatchObject([{ input: { body: "Hello world", ifMatch: "e1" } }])
  expect(clean.memory).toMatchObject({ docs: [{ key: "d1", status: "clean" }] })
})

test("an edit during a save goes next", async () => {
  const { closeRefused, bothSaved } = (await editDuringSave.run()).checkpoints
  expect(closeRefused.records("verdict", { event: E.Close })).toMatchObject([{ result: { _tag: "Denied" } }])   // Autosave.O.save.idle and the dirty check
  expect(bothSaved.read(Docs.put)).toMatchObject([
    { input: { body: "Hello world", ifMatch: "e1" } },
    { input: { body: "Hello world!", ifMatch: "e2" } },
  ])
})

test("412, keep mine", async () => {
  const { conflict, overwritten } = (await conflictKeepMine.run()).checkpoints
  expect(conflict.memory).toMatchObject({ docs: [{ key: "d1", status: "conflict", body: "Mine", serverEtag: "e2" }] })
  expect(overwritten.read(Docs)).toMatchObject({ docs: { d1: { body: "Mine" } } })
})

test("offline: the same Attempt, four times, never applied", async () => {
  const { stalled } = (await offline.run()).checkpoints
  expect(stalled.memory).toMatchObject({ docs: [{ key: "d1", status: "stalled" }] })
  const id = stalled.attempt(Autosave.O.save)
  expect(stalled.read(Docs.put)).toMatchObject(Array.from({ length: 4 }, () => ({ phase: "lost", via: { attempts: [id] } })))
  expect(stalled.read(Docs)).toMatchObject({ docs: { d1: { body: "Hello" } } })    // the server never got it
})

test("reopened keeps the user's text", async () => {
  const { parked, reopened } = (await reopenedKeepsText.run()).checkpoints
  expect(parked.inspection).toMatchObject({ lanes: [{ subject: ["d1"], binding: "unplaced", parked: [{ reason: { _tag: "Conflict" } }] }] })
  expect(reopened.memory).toMatchObject({ docs: [{ key: "d1", status: "conflict", body: "Mine" }] })   // from the event (FP RV1 M9)
})
```

**Walk.** `Edited` arms `settle`; `advance` fires it at 800 ms and the commit's `fetch` stand-in reaches `Docs.put`.
The operations record's 8.2 `CloseAnyway` then unmount, and a reload, are `reopenedKeepsText`'s shape in an app Story with `closeTab`.

##### 2.10.18.4 Kanban board with likes (uncommon; 2.9.6's `Board` and `LikeButton`, 2.8.2's `Issues`)

**Source.** `fetch` behind `IssuesApi` (`PUT /issues/:id/like` with the Attempt's key, `GET` the project's list).
`Issues` is a fake server whose truth is `{ issues: Record<id, Row>, applied }`, with endpoints `list`, `setLike` and
`get`, and controls `add` and `move` (written as 2.10.18.3's `Docs`).

```ts
const c7 = Issues.add({ id: "c7", projectId: "p1", likes: 3 })                     // user-defined control
const desk = (id: string) => Story.app(IssuesSetup, { id, fixtures: [IssuesFake], world: [c7] })   // the server holds c7 before bootstrap
  .ensure(BoardP1, { input: { projectId: "p1" } })
const toggle = (liked: boolean) => Board.E.likes.key("c7").Toggle({ liked })

export const unknownLikeKept = desk("board/unknown-like-kept")
  .world(Issues.setLike.drop({ at: "response" }))                                    // applied on the server; the answer lost → LikeUnsure
  .send(BoardP1, toggle(true))
  .checkpoint("unsure")
  .world(Issues.move({ id: "c7", to: "p2" }))                                        // the card leaves the column on the server
  .advance("3 seconds")                                                              // reconcile: the same Attempt; deduped; the repair read moves c7 out
  .checkpoint("reconciled")

export const queueAcrossActors = desk("board/queue-across-actors")
  .ensure(IssuePageC7, { input: { issueId: "c7" } })
  .world(Issues.setLike.hold())
  .send(BoardP1, toggle(true))                                                       // heads c7's record queue, in transit
  .send(IssuePageC7, IssuePage.E.like.Toggle({ liked: false }))                      // joins behind it: predicted, not sent
  .checkpoint("queued")
  .world(Issues.setLike.release())
  .checkpoint("drained")

const pages = Array.from({ length: 64 }, (_, i) => issuePageRef(`c7-${i}`))          // user-defined: 64 actors on one issue
export const overloaded = pages
  .reduce((s, page) => s.ensure(page, { input: { issueId: "c7" } }).send(page, IssuePage.E.like.Toggle({ liked: false })),
    desk("board/65th-write").world(Issues.setLike.hold()).send(BoardP1, toggle(true)))   // 1 held head + 63 queued; the 65th is refused
  .checkpoint("refused")

export const twoTabs = desk("board/two-tabs")
  .send(BoardP1, toggle(true))
  .openTab("b", { from: "main" })                                                    // ensures BoardP1 in b too: the same server, b's own store
  .checkpoint("bOpen")

test("an unknown like is kept, then reconciled", async () => {
  const { unsure, reconciled } = (await unknownLikeKept.run()).checkpoints
  expect(unsure.entity(Issue, { id: "c7" })).toMatchObject({ data: { liked: true, likes: 4 }, predicted: true, uncertain: true })   // after an unknown (STF50)
  expect(unsure.inspection).toMatchObject({ lanes: [{ key: { id: "c7" }, subject: ["c7"], state: "Held", binding: "bound" }] })
  expect(reconciled.entity(Issue, { id: "c7" })).toMatchObject({ data: { projectId: "p2" }, predicted: false, uncertain: false })
  expect(reconciled.read(Issues)).toMatchObject({ issues: { c7: { likes: 4 } } })   // liked once
})

test("FIFO across actors", async () => {
  const { queued, drained } = (await queueAcrossActors.run()).checkpoints
  expect(queued.read(Issues.setLike)).toMatchObject([{ input: { liked: true }, phase: "held" }])
  expect(drained.read(Issues.setLike)).toMatchObject([{ input: { liked: true }, phase: "answered" }, { input: { liked: false }, phase: "answered" }])
})

test("the 65th write is refused, with no partial join", async () => {
  const { refused } = (await overloaded.run()).checkpoints
  expect(refused.records("ending", { channel: "failure" })).toMatchObject([{ reason: { _tag: "NotSent", why: "Overloaded" }, instance: ["like"] }])
  expect(refused.inspection).toMatchObject({ domains: { issues: { queues: [{ key: { id: "c7" }, length: 64 }] } } })
})

test("a second tab reads the same server, without persistence", async () => {
  const { bOpen } = (await twoTabs.run()).checkpoints
  expect(bOpen.entity(Issue, { id: "c7" }, { tab: "b" })).toMatchObject({ data: { liked: true, likes: 4 }, predicted: false })
  expect(bOpen.tabs.b?.inspection).toMatchObject({ persistence: { status: "SecondTabNoPersistence" } })   // NEW [P, H5]: tabs.b
})
```

"Never shown twice" (rule 33) is a loop over every frame of the list Stories (2.8.2's `List`, which creates). The check is a plain function
the same test file can also hand to `propertyTest` (W25):

```ts
export const created = Story.app(IssuesSetup, { id: "list/created", fixtures: [IssuesFake] })
  .ensure(ListP1, { input: { projectId: "p1" } })
  .send(ListP1, List.E.Create({ draftId: "dr1", title: "New" }))

const shownTwice = (frame: Story.Frame<typeof IssuesSetup>) => {                     // user-defined; NEW [P, RV1 M7]: Story.Frame, by subject
  const s = frame.read(ListP1)                                                       // existing: read
  if (s === undefined) return []
  const rows = Issues.list.get(s, { projectId: "p1" })?.rows ?? []
  return s.memory.creating.filter((d) => !d.discarded && d.status !== "created" && rows.some((r) => r.id === d.id))
}

test("a created issue is never shown as a draft too", async () => {
  const run = await created.run()
  for (const frame of run.frames) expect(shownTwice(frame)).toEqual([])              // the iterator throws FramesTruncated if any were dropped [P, RV1 M14]
})
```

**Walk.** "A like that ends unknown on a card removed and re-added" is 2.9.6's `IssueRow` walk: the same steps over
a host without the keep-busy line, where the list's next answer removes copy c7 (its unknown is parked for `["c7"]`,
read in `inspection`) and `Issues.move` back re-adds it, whose new life adopts and reconciles.

##### 2.10.18.5 Onboarding wizard (uncommon; 3.2's `Confirm`, the operations record's 9.6)

**Source.** `fetch` behind `AccountsApi`: a profile save keyed by draft (`saveProfile`) and the final `submit`.

```ts
export const confirmYes = Story.fragment(Confirm, { id: "confirm/yes" })             // a subroutine alone (rule 11)  // RENAMED: Story.fragment [W1]
  .enter()
  .send(Confirm.E.Yes())
  .checkpoint("answered")

const signup = (id: string) => Story.machine(SignupMachine, { id, fixtures: [AccountsFake] })
export const discardDeclined = signup("signup/discard-declined")
  .send(E.Next(), E.Cancel())                                                        // user-defined: Next, ProfileChanged (the operations record's 9.6 page events)
  .checkpoint("asking")
  .send(E.CANCELLING.No())
  .checkpoint("backOnPage")

export const submitWaitsForProfile = signup("signup/submit-guarded")
  .world(Accounts.saveProfile.drop({ at: "response" }))                              // the profile save ends unknown: held
  .send(E.ProfileChanged({ name: "Ada" }))
  .advance({ next: { schedule: "saveProfile" } })                                    // its debounce (user-defined name) commits the save
  .send(E.Submit())
  .checkpoint("submitDenied")
  .dispose()
  .ensure()                                                                          // an input-free local machine is one identity: it adopts the hold
  .checkpoint("adopted")

test("a subroutine's exit, alone", async () => {
  const { answered } = (await confirmYes.run()).checkpoints
  expect(answered.records("exit")).toMatchObject([{ instance: [], name: "Confirmed", payload: {} }])
})

test("declining a discard restores the page", async () => {
  const { asking, backOnPage } = (await discardDeclined.run()).checkpoints
  expect(asking.state).toBe(S.CANCELLING)
  expect(backOnPage.state).toBe(S.WIZARD.PROFILE)                                    // history restores the page, fields kept
  expect(S.WIZARD.is(backOnPage.state)).toBe(true)                                   // at or below a parent: existing token.is [P, H4]
  expect(backOnPage.records("exit")).toMatchObject([{ instance: ["CANCELLING"], name: "Declined" }])   // the same record shape as alone (STF60)
})

test("submit waits for an unknown profile save", async () => {
  const { submitDenied, adopted } = (await submitWaitsForProfile.run()).checkpoints
  expect(submitDenied.records("verdict", { event: E.Submit })).toMatchObject([{ result: { _tag: "Denied", reasons: [{ code: "Uncertain" }] } }])   // O.save.idle over a partial key
  expect(submitDenied.read(Accounts.submit)).toEqual([])                             // an old profile is never submitted
  expect(adopted.records("ending", { operation: O.save })).toMatchObject([{ channel: "unknown" }, { channel: "unknown", reason: { _tag: "Restored" }, route: { kind: "current" } }])
})
```

`.leave()` on `Confirm` alone abandons it: `cp.records("exit")` stays empty, `cp.read()` is `undefined`, and `cp.memory` throws `SubjectAbsent`.

##### 2.10.18.6 A fragment reused on two hosts (uncommon; 2.9.6's `LikeButton`)

```ts
export const likeAlone = Story.fragment(LikeButton, { id: "like/alone", fixtures: [IssuesFake], world: [c7] })   // R includes IssuesApi (rule 57)
  .world(Issues.setLike.drop({ at: "response" }))
  .enter({ id: "c7" })                                                               // the trait's Input record
  .send(LikeButton.E.Toggle({ liked: true }))
  .checkpoint("unsure")
  .leave()                                                                           // ends (a one-copy .each, 2.10.12); no release on leave (F6, F9): the hold stays
  .checkpoint("left")
  .enter({ id: "c7" })                                                               // a new life adopts it: unknown { Restored }
  .advance("3 seconds")                                                              // reconcile re-sends the same Attempt
  .checkpoint("reconciled")

export const bothHosts = desk("like/both-hosts")                                     // 2.10.18.4's desk: one Runtime, two hosts of one fragment
  .ensure(IssuePageC7, { input: { issueId: "c7" } })
  .world(Issues.setLike.drop({ at: "response", match: { actor: IssuePageC7 } }))     // only the page's request
  .send(BoardP1, Board.E.likes.key("c7").Toggle({ liked: true }))
  .send(IssuePageC7, IssuePage.E.like.Toggle({ liked: true }))
  .checkpoint("both")

test("a like alone", async () => {
  const { unsure, left, reconciled } = (await likeAlone.run()).checkpoints
  expect(unsure.operations).toMatchObject({ set: [{ key: { id: "c7" }, uncertain: true }] })   // its own rows (rule 59)
  expect(left.lane(LikeButton.O.set, { id: "c7" })).toMatchObject({ subject: [], binding: "unplaced", state: "Held" })   // no stand-in parts; not gone [P, H17]
  expect(reconciled.read(Issues)).toMatchObject({ issues: { c7: { likes: 4 } } })
})

test("records tell two hosts apart", async () => {
  const { both } = (await bothHosts.run()).checkpoints
  expect(both.records("ending", { operation: LikeButton.O.set, actor: BoardP1 })).toMatchObject([{ channel: "success", instance: ["likes"], copy: "c7", subject: ["c7"] }])
  expect(both.records("ending", { operation: LikeButton.O.set, actor: IssuePageC7 })).toMatchObject([{ channel: "unknown", instance: ["like"], subject: [] }])
  expect(both.read(Issues.setLike)).toMatchObject([
    { via: { attempts: [both.attempt(LikeButton.O.set, { actor: BoardP1 })] } },
    { via: { attempts: [both.attempt(LikeButton.O.set, { actor: IssuePageC7 })] } },
  ])
})

Story.machine(IssuePageMachine, { id: "page/no-fake", input: { issueId: "c7" }, fixtures: [] })
// type error: IssuesApi is missing (LikeButton's R, rule 57)
```

##### 2.10.18.7 A chat room over a socket (uncommon; *Stream details: merge 6*)

The fake extends 2.10.4's `Chat` with a resume position and a seed control, reached through the real adapter with `Fake.webSocket`. The machine (`ChatRoom`, `O.messages`) is merge 6's and
is not merged; the Story's shape is what this case shows. With `ping`, `hold({ after: 2 })` is a real half-open: pings stop too, so a client's `idle` ends it [v3]. Fixed from RV1 M16: the old example had no messages to deliver, and its `from` was not in `request`.

```ts
const socket = Fake.stream({                                                         // existing: Fake.stream
  request: { room: Schema.String, clientId: Schema.String, from: Schema.optional(Schema.Number) },   // user-defined: from, the resume position
  frame: Schema.fromJsonString(Message),                                             // NEW: frame [fakes-v2]
  open: (truth: Truth, req) => ({                                                    // existing: open
    frames: truth.messages.filter((m) => m.room === req.room).slice(req.from ?? 0),  // existing: frames
  }),
})
export const Chat = Fake.server("Chat", {
  truth: { messages: Schema.Array(Message) },
  initial: { messages: [] },
  endpoints: { socket },
  controls: { seed: Fake.control({ messages: Schema.Array(Message) }, (_t: Truth, a) => ({ truth: { messages: a.messages } })) },   // user-defined: seed
})

export const replayThenDrop = Story.machine(ChatRoom, {
  id: "chat/replay-then-drop", input: { room: "r1" }, fixtures: [ChatSocket],        // user-defined: ChatSocket = Fake.webSocket(Chat, routes)
  world: [Chat.seed({ messages: threeMessages }), Chat.socket.hold({ after: 2 })],   // NEW: after. Quiet after two frames  // user-defined: threeMessages
})
  .checkpoint("quiet")                                                               // a start cut (2.10.6)
  .world(Chat.socket.drop())                                                         // existing: a network loss; a stream control is a wire step [W37]
  .advance({ next: { operation: O.messages, timer: "backoff" } })                    // existing: next [W7]
  .checkpoint("reconnected")

test("resumes from where it stopped", async () => {
  const { quiet, reconnected } = (await replayThenDrop.run()).checkpoints
  expect(quiet.records("delivery", { endpoint: "socket", phase: "delivered" })).toHaveLength(2)   // RENAMED: the delivery record (RV1 L2)
  expect(reconnected.read(Chat.socket)).toMatchObject([                               // replaces merge 6's expect(…, { connections })
    { phase: "closed", code: 1006, by: "network" },                                   // plain phase (RV1 M11)
    { phase: "open", input: { from: 2 } },                                            // the resume position the server saw
  ])
})
```

## 4. How this amends `Testing.plan`

Each row replaces the same-numbered row of `machine-design.md` section 5 ("For Stories"). Rows not listed (C74, C76, C78–C80, C85)
keep their text, with `Story.inspection`, `Story.records`, `Story.entity` and `Story.make` respelled as in section 3 above, except that C74 and O7 say `"main"` for the default. **All proposed**,
following the decisions cited.

| # | Plan | Rule | Replaces or adds |
| --- | --- | --- | --- |
| C69 | Testing (title), O1 | Title "…checkpoints, models and property tests" → "…checkpoints and property tests". `Story.app`, `Story.machine`, `Story.fragment` (W1) over an app setup, a machine, a trait or a subroutine; 2.10.2's steps; ids unique across the configuration; the stand-in host, its placement from the declaration (W30); the `world` option (W13); addressed targets; `reload` and `openTab(…, { from })` (W26); a Story holds inputs and checkpoints and no checks (C1); "Construction, import and discovery start no services, actors, fixtures or assertions" → the last word goes; "Scenario commands accept no arbitrary callbacks…" **kept** (rules 61–66); every step has a data form; `services?` on `story.machine` is removed, `fixtures` covers it; `run({ signal?, frames? })` → `run()` (W22; P, RV2 section 8) | Replaces O1's `story.app` / `story.machine` sentences and "Both Story kinds support send, process, advance, advanceTo, advanceToNextTimer…"; "unique within its App" → "unique across the configuration"; replaces the fragments' Testing O1 row and C63's syntax |
| C70 | Testing O2 | A run never yields to the host between its first step and its cleanup. Every step settles on a microtask-only run scheduler (`executionMode: "sync"`), draining until `K` consecutive hops show no scheduler activity and no arrival at anything of Flow's, within a hop cap per instant (`StoryTurnLimit`, `reason: "Settle"`); after the last cut, if a commit or read fiber is parked, the run finishes the world with nothing reaching the evidence, and a fiber still parked is `HostTimeWait`; a session or setup-scoped fiber may wait; a sleep of zero or less is a yield; 100,000 deadlines per `advance` (`reason: "Advance"`); cleanup's free Clock and bounds; the turn limit is per instant; 2.10.17.5's five ranks; the executor's own Clock; a Story is checked on the engine its tests run on; `advance({ next: address })`, `together({ advance })`, `suspended` (rule 61; W2, W4, W6–W10; RV1 H1, RV2 H1, M1–M3, L2; *Stream details: merge 6* for a session's timers) | Replaces "process() drains currently eligible work…" and "These commands make work eligible without draining it…" |
| C71 | Testing O3 | Fixtures are client halves; `Fake.server` (run-scoped truth, endpoints, controls, the wire words `hold`, `release`, `drop`, `duplicate`); fakes-v2's one result shape, a pure synchronous `handle`, `send`, one answer list, route tables, the combination rule, the run-scoped server registry; provenance (`via`); `Fake.Lost`, `Fake.Refused`, `Fake.Closed`, mapped by the binding; a crashed server is the binding's failure, and a broken fake rejects the run with `StoryFakeError`; `from` carries storage only; `Fake.storage` with `purpose`, FIFO per tab, aborted on close, and the scope lock; "fixtures cannot inject operation outcomes directly" **kept** (rules 62, 66; W11, W12, W14, W16–W21, W28, W35, W36) | Adds to O3; supersedes C16 |
| C72 | Testing O4 | A frame after every committed publication; a step per command, each with its step cut; frames never collapse (W22); a checkpoint names a step cut and has the reads `state`, `memory`, `operations`, `schedules`, `read(target)`, `lane`, `records`, `inspection`, `entity`, `attempt`, `now` (C3, W23, W24); `checkpoint.actor(ref)` → `cp.read(ref)`; `pending` → `cp.inspection.work`; `Entity.get(checkpoint, …)` → `cp.entity(…)`, returning `{ data, predicted, uncertain, unconfirmed }`; records in one list with `tab: { name, open }`; `descriptor.get`, `Domain.entry.get`, `Entity.queue` and `shape` on a checkpoint are removed; every cut captures its full `inspection`, every frame `work` and lanes; `run.frames` keeps at most 10,000, exposes a non-enumerable `truncated` (W25), and its iterator throws `FramesTruncated`; step cuts and checkpoints are never truncated (rule 64) | Replaces "a frame after every command by default … Consecutive identical frames collapse into one", and O4's reads; answers C27's note |
| C73 | Testing O6 | `propertyTest(story, { steps, properties?, whenQuiet?, seed, runs?, length?, quietWithin? })` (W25, W38); plain function properties; steps are data forms; resolves on `Pass`, rejects `PropertyTestFailed { result }` on `Fail` or `Inconclusive`, after every run completes; a truncated run is a `Fail` with `FramesTruncated`; the quiet phase ends the world in ordinary steps, which the emitted Story keeps; invalid generated steps are skipped and left out of emitted Stories; shrinking keeps pairs; faults are steps; the domain form is `domainPropertyOptions` (2.10.16) | Replaces O6's generator shape, and "even when process() drains many turns". O6's "Results distinguish Pass, Fail and Inconclusive" stays. O6's "insufficient evidence is Inconclusive" gains the truncation exception, as the brief asks |
| C75 | Testing O8 | Errors `StoryInvalidCommand` (`ActorAbsent`, `AlreadyEntered`, `NotEntered`, `TabOpen`, `TabClosed`, `NothingHeld`, `NoDeadline`), `NoConnection`, `HostTimeWait`, `PropertyTestFailed`, `PropertyDefect` (a reason) [RV3 L5], `AmbiguousRead`, `StoryFakeError`, `SubjectAbsent`. `run()` rejects on a real Story error or a broken fake, never on a value (C1, RV1 H4); the earliest recorded error is primary (RV2 M6). **O8's cancellation goes with `signal`**: "Cancellation stops admission and later commands", "a blocked send settles once", the cancellation flag; cleanup order and failure evidence stay (RV2 M1, section 8). `StoryExpectationFailed` is removed | Adds |
| C77 | Testing O5, V1–V9 | O5 and V5 removed (W39, T1); V1 adds the reads' types; V3 proves rule 61 and the instant order, with the host-primitive matrix, the always-on sentinel and `K` doubling (RV3 section 2); V4 proves publication frames, steps and captured reads, and loses "recording and collapse"; V6 proves `propertyTest` judging, including `FramesTruncated` | Applies W39 |
| C81 | CommandLine O2, O5, O6 | `describe` prints subject, options, steps, checkpoints and every fake the plan names (W40); `flow story run` reports what ran, exits 2 on a rejected run, and prints `issue` records and unused wire rules; coverage by cells, handlers (current and late) and Flow reasons, stated as reached; Story-derived warnings from `verdict`, `listRepair`, `drop`, `ending` (rule 51's declines) and `turn` records; rule 20 at a stand-in after a subject change (2.10.12); top-level Stories in `defineConfig` (`appId: null`) (2.10.14) | Amends T2 |
| C82 | Package O1 | `flow-state/testing` exports `Story`, `Fake`, `propertyTest`, `domainPropertyOptions`, `StoryFrame`, `StoryPlayer`, `definePresentation`, `defineConfig`, `type StoryRun`, the error classes `PropertyTestFailed` and `Fake.Lost`; `story` and `model` removed (W39); no test-runner adapter package (C4); `flow-state/internal/testing` (not public) exports `disposeRuntime` for Flow's suite | Amends Package O1 |
| C83 | Diagnostics | The error names of C75 | Adds |
| C84 | EntityDomains O2, O4 | `Entity.queue` removals are `queue` records with their reason (`Superseded`, `Cancelled`, `Released`; an `Overloaded` write never joined and is an `ending` record, rule 35); `domainPropertyOptions(domains, inputs)` keeps O4's oracle, quietness (with 2.10.16's line on recurring schedules) and `Inconclusive` rules | Resolves C30's deferred half and delegated-decisions row 3 (K11) |
| C-new | Inspection O4 | Adds the `delivery` kind [fakes-v2, RV1 L2] to C79's list; `records` takes 21 kinds; the diagnostic `UnusedWireRule` | Adds |

From accepted `Testing.plan`, these stay as they are: O1's id rules and checkpoint key types; O2's seeded ids and randomness and the 10,000
turn limit (now per instant); O3's fixture composition and fresh storage; O4's `StoryFrame` and its gaps; O7's tabs (default `"main"`, with `tabs.<name>` now
narrowed to `inspection` [P, H5]), `dehydrate`, `hydrate`, `serverView` and lazy adoption; O8's cleanup order and failure evidence; O9's player and
presentations, except that a scene names a camelCase checkpoint.

## 5. Consequences across the rest of the design

Followed through from the amendments; each is **[P]**.

- **Playback.** A presentation's scenes name checkpoints, so checkpoints still earn their place in a Story with no checks. Adding a
  checkpoint for a test adds nothing to a presentation unless a scene names it.
- **Agents.** `flow story run` no longer answers "did it pass". An agent runs the test runner for values and `flow story run`, `describe`
  and `explain` for what happened. This fits W40; agent docs must say it.
- **Failure messages get worse, and that is accepted by C4.** The merged failure named the step and the path. The runner's diff names the
  test line and the path; the checkpoint name in that line gives the step. C4's deferred matchers are the answer if this hurts.
- **More checkpoints, fewer lines of plan.** Each old `.expect` needed only the latest cut; a test needs a name per moment read. Stories in
  2.10.18 gain one `.checkpoint` for each moment, and lose every check. Two sends with one checkpoint can only read the second's cut.
- **A record read at `end`.** `run.end.records("issue")` is how a test states "no issues". `run.end` has the same reads, so nothing else
  is needed.
- **A test runner's timeout cannot interrupt a run; it reports when the run ends** [RV2 M1, RV3 M2]. The hop, turn and deadline limits are what stop one. `propertyTest` may yield between runs. A real case: `queue.story.ts`'s `advance("2 days")` over a 30-second poll is about 5,760 settles, about 4.6 s in Chromium.
- **Static analysis.** Removing checks from the plan removes nothing that `flow check` read, since no warning used expectations.
- **Conversion traps** [RV1 M10, M15, M17]: 74 of 190 real Stories share a name with a checkpoint (rename the Story); 40 `O.x.get(at, k)` read an idle row where `lane` reads `undefined`; `upload.story.ts` (`uploaded`, `lostThenResent`, `removedWhileUploading`) and `assistant.story.ts` (`midStream`) set a wire rule after the step that sent the request, which now shows as `UnusedWireRule`. `pay.story.ts`'s `duplicate({ at: "request" })` has no form; drop the `at`. `challengeAlone` reads memory after an exit; read a checkpoint before it.
- **The apps.** The desk and Checkout use `storyTest`, hyphenated names, `Story.make`, `Story.property`, `Story.inspection` and handlers in tuple
  form. They convert when this is accepted; they were not touched. Their design gaps on `Story.attempt` and `frame.settled` are answered by H4 and H9.
- **Streams.** Merge 6's Stories need rewriting to this form before it merges (decisions, "to settle"); section 11 has the list.

## 6. Not verified

No Flow code ran; the rewrite has no `Fake`, Story executor or checkpoint reads.

- **Run by RV1 and RV2 on Bun, Node and Chromium 149 headless:** the drain against real `FetchHttpClient` and `Socket`; hop costs; the engine table in 2.10.2; `Effect.forever` never ending a settle. The seven shapes in `owner.ts` were run against per-settle attribution; **the end-of-run classification is reasoned against them, not implemented.** My earlier probes (`r2/pump.ts`, `pump2.ts`, Chromium) showed no host task in a settle, and promise resumes skipping the scheduler. Firefox and Safari not run.
- **Run, `tsc` with `tsconfig.base.json`'s flags, against mock signatures only** (`r3/spike.ts`): `Story.Step` on a helper; `together` rejecting a lifecycle form and a nested `together`; `release({ match })`; a `checkpoint` form rejected in `steps`; `run()` with no options. Also earlier (`r2/ts/spike.ts`): route-key `params`, branching `handle`, the recipe, reads. These show what the signatures can do, not what the real ones will.
- **Run by RV3 on all three engines:** 34 shapes against the finish phase, in its own minimum of rule 61, not Flow; layers, cleanup, the hop cap, long `advance`, zero sleeps; a run under Vitest and `bun test`.
- **Run, this file:** table cell counts by script.
- **The executable model predates this revision.** It passed against the previous tables (47 invariants, 62 of 63 mutants killed), and it chose as MDL states on each gap. This file resolves some gaps differently from its choices: G1's crash order, G2, G5, G8, G9, and (with `message`) its row. So it **must be re-run with these rules before accepting**; it has no end-of-run classification or Clock, so it does not cover the finish phase. Its re-run also chose against N1 and N3, which this file now decides otherwise (section 10).
- **Read from the code, not run:** a snapshot's `state` is the leaf token by identity (`runtime-next/actor/actor-snapshot.ts`).
- **Not run:** converting the desk's fakes. `inspection` and frame **memory is unmeasured**.

## 7. Section 3.6's row

Replaces the "New, Stories" row, and adds the "Removed" row.

| Kind | Words |
|---|---|
| **New, Stories** | (rules 61–66, 2.10; common) `Story.machine` (`id`, `fixtures`, `world`), `send`, `advance` (settles at every deadline; `{ next: address }`), `checkpoint`, `world`, `run`, `run.checkpoints`, `run.end`, the reads `read`, `lane`, `records` (`since`), `attempt` (`n`), `now` beside the existing `state`, `memory`, `operations`, `schedules`, `Fake.server` (`truth`, `initial`, `endpoints`, `controls`), `Fake.call` (`request`, `handle`, `response`), `Fake.control`, `Fake.Lost`, `hold`, `release`, `drop`, `at`, `times`; (uncommon) `Story.app`, `Story.fragment`, `together` (`{ advance }`), `duplicate`, `match` (`purpose`, `input`), `after`, `Fake.storage`, `Fake.stream` (`frame`, `open`, `ping`, `every`, `frames`, `refuse`, `end`), `send` on a result, `.frames`, `.close`, `.end`, `Fake.webSocket`, `Fake.fetch` (`endpoint`, `input`, `params`, `query`, `body`, `headers`), `Fake.Refused`, `Fake.Closed`, `dispose` (`how`), `reload`, `guards`, `inspection` (`work`, `incarnations`), `tabs`, `entity`, `run.frames` (`truncated`), `advance(…, { suspended })`, `checkpoint(…, { at })` (`settled`, `turn`, `step`), `openTab(…, { from })`, `enter(input, { subject })`, `leave({ end })`; (rare) `advance({ to })`, `reset` (a fragment alone), `release({ nth })`, `storage`, `seed`, `Fake.storage.seed`, `Fake.storage.from(story)`, `propertyTest(story, …)` (`steps`, `properties`, `whenQuiet`, `runs`, `length`, `quietWithin`), `domainPropertyOptions`, the types `Story.Frame`, `Story.Step`; the errors `StoryInvalidCommand`, `NoConnection`, `NoDeadline`, `HostTimeWait`, `AmbiguousRead`, `PropertyTestFailed` (with the reason `PropertyDefect`), `StoryFakeError`, `SubjectAbsent`, the diagnostic `UnusedWireRule`, and the `Fail` reason `FramesTruncated`; twenty-one record kinds that `records` takes (read, not written). Reused: `ensure`, `closeTab`, `setContext`, `dehydrate`, `hydrate`, `within`, `maxBytes`, `label`, `serverView`. The address is a shape, not a word |
| **Removed** (Stories, amended) | `Story.make` and `story.app`, `story.machine` (W1), `.expect`, `StoryExpectationFailed`, `AmbiguousAttempt` (C1; P), `Story.property`, a Story's `properties` option (W25), `Story.records`, `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.now` (W24), `process()` (W2), `advanceTo`, `advanceToNextTimer`, the `frames` option and frame collapse (W22), `run.calls`, `checkpoint.exit` (W34), the checkpoint predicate `.checkpoint(name, ({ truth }) => …)` (C2, C16), `Story.ending` (never adopted), `model` and Testing O5 (W39), merge 6's `.do(…)` (W37), `accept`, tuple results, `Fake/Lost`, `{ to, send }` [fakes-v2], `latency`, `response` as an Effect, `headers` on `Fake.stream`, public `run.steps`, `message` on `Fake.stream`, `signal` on `run`, `Fake.storage.from`'s `{ at }`, `services?`, `shape` on a checkpoint read (P), Testing O4's `pending` for work |

## 8. Other lines in `machine-design.md` to change on acceptance

Not edited. Each is **proposed** text to apply at merge.

| Line (today) | Where | Change |
| --- | --- | --- |
| 650 | rule 21 region | "`Story.inspection`'s lane listing" → "a checkpoint's `inspection` lane listing" |
| 999 | rule 58 | `Story.make(fragment, { id, fixtures })` → `Story.fragment(…)` |
| 2057–2068 | 2.7's "Stories read the server's truth" | The example below; "reads it with `expect(fake, partial)`" → "a test reads it with `cp.read(fake)`" |
| 2628 | 2.8 | "Stories read the store with `Story.entity`, and its queues and marks in `Story.inspection`" → "A test reads the store with `cp.entity`, and its queues and marks in `cp.inspection`" |
| 5274–5284 | 3.1 `lockout.story.ts` | The example below |
| 5404–5408 | 3.2 `confirm.story.ts` | 2.10.18.5's `confirmYes` and its test |
| 5759 | C63 | `Story.fragment(fragment, { id, fixtures })` |
| 5908–5910 | section 7 item 17 | `cp.entity`, `cp.inspection` |
| 5684 | C16 | "truth is read with `expect(fake, partial)`" → "with `cp.read(fake)`" |
| 5769 | section 5, Stories' note | `process()` in the note goes |
| 6533, 6535–6536 | Stories decisions, T3, T5, T6 | Add W1 as reversing T3, C1 as reversing T5 B3, and a W row for T6's `Story.attempt`; T rows stay as history |
| — | `open-items.md` 28 | The route table is answered; close it |
| — | `delegated-decisions.md` rows 21, 24; `NEXT.md` 13, 21 | Respell to this form |
| — | `references/COVERAGE.md` section 6 and Q4 | `@flow-state/vitest`, `storyTest` go |
| — | `Testing.plan` O1, O4, O6, O7, V4 | Covered by C69, C72, C73, section 4, C77 |
| — | `Package.plan` O1 | C82; `Diagnostics.plan` C83 |
| — | `FlowState.plan` lines 19, 45, 93 | "models", "`@plan.Testing.V2 to V5`": C77 removes V5 [RV2 L11] |

```ts
// 2.7's example
const busyThenCharged = Story.machine(CheckoutMachine, { id: "checkout/busy-then-charged", input: { intentId: "pi_1" }, fixtures: [StripeFake] })
  .world(Stripe.busy({ times: 1 }))                                   // user-defined control: the next confirm answers 429 (Busy)
  .send(E.Pay({ paymentMethodId: "pm_card" }))
  .checkpoint("waiting")
  .advance("2 seconds")                                               // WAITING's schedule fires; a new Attempt is sent
  .checkpoint("charged")

test("busy then charged", async () => {
  const { waiting, charged } = (await busyThenCharged.run()).checkpoints
  expect(waiting.state).toBe(S.WAITING)
  expect(waiting.memory).toMatchObject({ busyTries: 1, retryInMs: 2000 })
  expect(charged.state).toBe(S.DONE)
  expect(charged.read(Stripe)).toMatchObject({ charges: [{ intentId: "pi_1", key: charged.attempt(O.pay, { n: 1 }) }] })   // the fake's truth, read
})
```

```ts
// 3.1's lockout.story.ts: a fragment alone (rule 11); every step settles (rule 61)
const L = Lockout({ limit: 2, length: "1 minute" });
export const locksThenClears = Story.fragment(L, { id: "lockout/locks-then-clears" })
  .enter()
  .send(L.E.Strike(), L.E.Strike())
  .checkpoint("locked")
  .advance("1 minute")                                               // the lock's timer fires and its turn runs
  .checkpoint("cleared");

test("locks, then clears", async () => {
  const { locked, cleared } = (await locksThenClears.run()).checkpoints;
  expect(locked.memory).toMatchObject({ strikes: 2 });
  expect(locked.records("callback")).toMatchObject([{ name: "onLocked" }]);
  expect(locked.schedules.timer.done.dueAt).toBe(locked.now + 60_000);
  expect(cleared.memory).toMatchObject({ strikes: 0 });
  expect(cleared.records("callback", { since: "locked" })).toMatchObject([{ name: "onUnlocked" }]);
});
```

## 9. Deferred

Add to `revisit.md` when accepted (not edited here): a `Generate` module, if sample arrays prove too verbose for `propertyTest`'s steps; `headers` on `Fake.stream`, with the first SSE adapter that checks a content type (RV1 section 8); a `Fake.client(Stripe, (server) => layer)` carrying metadata, if `describe` must list fakes behind a Layer (RV1 M9); `message` on `Fake.stream`, with the first duplex fake (RV2 section 8). C4's matchers, W15's libraries and fakes-v2's additions are already
there.

## 10. For the main session

Decisions were kept as written in every case. These need an owner's eye.

1. **Testing O8 changes with `signal`** [RV2 M1, section 8]. Since a run never yields, cancellation cannot act during one, and a runner's timeout reports only when the run ends. O8's "Cancellation stops admission and later commands", "a blocked send settles once" and the cancellation flag and direct/CLI cancellation parity go; V8 loses cancellation. Accepted plan text, listed in C75. Scenario if ignored: a plan promises `abort()` works, and it is never called until the run has ended. The other consequence: a run that never ends gets no timeout; the hop cap, turn limit and deadline limit are the bounds.
2. **W17's wording** still needs changing, as round 1 said: "inside a handler" holds only for synchronous libraries, and an async one goes in the client half (2.10.4's recipe). A client half is built per tab, so its memory does not survive a `reload`.
3. **Proposed for `revisit.md`, not edited here** [RV2 L10]: `Fake.response(body, init)`, exporting the shim. An app using `HttpClient` has no seam for the recipe: it writes its own `FetchHttpClient.Fetch` Layer, and a real `Response` is `HostTimeWait` in Chromium. 0 real uses. Also proposed: `message` on `Fake.stream`, with the first duplex fake.
4. **Engines** [RV2 M3]. "Same result everywhere" is not promised, and playback may reject what tests accept: a client half returning `new Response(…)` passes on Node and rejects in `StoryPlayer`. No guards, per your call. W4 is kept, on each engine.
5. **A used-up rule** [RV3 M6, MDL N3]. RV2 M8's "frames silence ends with the rule" and 17.2's "removed at zero" are now one rule: removed unless it still holds an item or silences a connection. This replaces my earlier reading that only `release` ends a rule.
6. **What the model covers.** Its four wire runs (`Calls[dedupe]`, `Frames`, `Closing`, `Handle`) stopped at the 200,000-state cap mid-way through their last depth, to stay under 2 GB, per RESULTS.md, so "PASS" there is that much. It does **not cover the finish phase**, and its re-run chose differently on N1 (no error on a non-matching `release({ match })`) and N3 (`spentStays`). Scenario if unchecked: an executor built from the model passes a typo'd `release` this file rejects. Extend it before accepting.
7. **C1's edge** [RV2 M6]: `InvalidInput` rejects on a value the app sent. It is the fake author's contract, stated in 2.10.1, and is the one place a run's rejection depends on app data.
8. **C1's example vs W1.** C1's snippet spells `Story.make`, which W1 later reversed, and `Stripe.busyOnce()`. W1 wins. **Testing O6 vs the brief:** truncation stays a `Fail`, listed in C73.
9. **`checkpoint(…, { at })`** keeps 3 words with 0 real uses, as you said. Named frames still need on-demand full capture (2.10.6).
10. **Guards on `fetch`** [RV3 M7]. Merge 6's global `fetch` in its 4.4 makes a real network call, parks, and is woken by its own stall deadline, so a stall test passes reaching no fake. v3's samples now read `FetchHttpClient.Fetch` and an `Sse` service, so section 11 item 9 is its check. No classifier sees this; guards would. You said no guards; this is the case they would catch.
11. **The finish phase is the owner's call in substance** [RV3 M1]: handlers run after the last cut, and "nothing reaches evidence" must hold in the executor. The smaller alternative keeps the old rule and all its false rejections.
12. **v3's ping rank is a real choice** [v3 item 1]. Scenario: `ping: { every: "45 seconds" }` against `idle: "45 seconds"`. With rank 1 the ping lands first and the connection lives; without it, `Silent` at 45 s or 90 s by arming order. Taken. It brings back a fake's sleep, which RV1 M1's cut had removed; `handle` stays pure and synchronous.
13. **Ping against the deadline limit** [v3 items 1, 3; RV3 M2]. Coalescing is only while suspended. Scenario: a 1 s `ping` under an awake `advance("1 week")` is 604,800 deadlines: `StoryTurnLimit { Advance }`, and a 10 s one is 60,480 settles, about 48 s in Chromium. The limit is kept. An author writes `suspended`, or a slower `ping`.
14. **v3's Story cannot run as written** [v3 section 10, wire tables]. It sets `Chat.history.drop({ at: "response" })` after the `advance` that reconnects. That settle has already read history, so the rule waits for nothing (`UnusedWireRule`), and `advance({ next: { timer: "page" } })` is `NoDeadline`, which rejects. Tables kept; section 11's Story sets the drop first. v3 should copy it.
15. **v3's other asks.** Its `session` reads and row fields compose with C1 and C3: no decision conflicts. Rule 25's change and its plan amendments are v3's, not applied here. v3 is still unrun: no Story in this file's merge 6 parts has executed.

## 11. What merge 6 must change

[P, RV1 section 6, v3 section 10.] Not merged, and this file does not merge it. Target: `merge-6-streams/proposal-v3.md`, not v2. Items v3 has already done are marked.

1. **Rule numbers:** 67–72. Done in v3. "Rule 65" is **One address** here.
2. **Its old 2.11 and 4.1 Story:** gone; the Story is below. v2's `Feed.reconnect` combinator, `fresh`, `initial`, the handler guard and `cursor` in memory are gone in v3, so nothing here refers to them. Seeds are `initial` on a `Fake.server` or a `world` control; `FakeChatServer({ history })` cannot be.
3. **`lane` for a stream in a fragment** uses `cp.lane(address)` (RV1 M5).
4. **Sleep tags:** Flow's own: `backoff`, `page`, `healthy`, `idle`, on the run's Clock, by Clock owner. `resetAfter` is gone.
5. **`session` records:** cells `<State>.<input>`, T2's row, bookmark, `held`, as 2.10.6's row has them.
6. **`Feed.callback`'s awaiting finalizer** becomes a `callback` client half, suite-only, as 2.10.9 says.
7. **Clean-end wording.** Close 1000 under `Fake.webSocket` is `SocketCloseError`; T1's `stream completes` from a raw socket is adapter code reading code 1000.
8. **A streaming write's commit fiber** waits on an open body with nothing sent (T8). Rule 61's finish phase closes that connection, which wakes it [RV2 section 9, RV3 section 5]. A flood past the buffer under `Fake.fetch` relies on a connection's pull counting as an arrival, or it cuts at `K`.
9. **Global `fetch`** [RV3 M7]. Stands as a check: every sample reads `FetchHttpClient.Fetch` or an `Sse` service, since a global `fetch` has no seam. Its stall test would otherwise pass reaching no fake.
10. **The word "pump":** dropped in v3; here it is "the settle's drain" [RV2 L12].
11. **`fake.send` from a client frame** has no form: `message` is cut. A duplex feed waits for it [RV2 section 8].
12. **Reload Stories** are `Story.app` [v3 item 7]; **`pageSched`** is `{ timer: "page" }` [v3 item 9]; **no fixed `advance` onto a jittered default** [v3 item 11].

| Merge 6's control | Now |
| --- | --- |
| `fake.accept()` | `open` returns |
| `fake.refuse(code)` | `refuse: code` |
| `fake.send`, `flood` | a control with `send: [socket.frames(where, frames)]`; a flood is a long list |
| `fake.silence(d)` | `hold()`, `advance(d)`, `release()` |
| `fake.drop(code)` | `drop()` for 1006; `socket.close(where, code)` for a code |
| `fake.flap(n, { upFor })` | a loop at construction of `drop`, `advance` |
| `fake.withhold(...)`, `greet` | a control that `open` reads |
| a heartbeat frame | `ping: { every, frame }` [v3 item 1] |
| `fake.resetLog`, `retain` | controls |
| `fake.reorder(i, j)` | `hold()`, then frames, then `release({ nth })`: one frame moves first, not an arbitrary swap. Enough for SR12 |
| `fake.hold("history")`, `answer`, `fail` | the history endpoint's wire words and handler |
| `story.suspend(d)` | `advance(d, { suspended: true })` |
| `truth.fake.resumedFrom` | `cp.read(Chat.socket)`'s `input`; the bookmark is in `session` records |
| `checkpoint.evidence("feed")` | `cp.records("session", …)` |

```ts
// v3's chat, in this form. Depends on merge 6. Illustrative; not run. CHANGED from v3: the page's drop is set before the read (section 10).
const ChatFake = Fake.webSocket(Chat, chatRoutes)                         // existing  // user-defined: Chat, chatRoutes
export const chat = Story.machine(ChatRoom, {                             // RENAMED [W1]
  id: "chat/replay-then-reset", input: { roomId: "r1" }, fixtures: [ChatFake, HistoryFake],   // user-defined
  world: [Chat.seed({ history: seed })],                                  // user-defined control
})
  .checkpoint("live")                                                     // a start cut
  .world(Chat.greet({ replay: false }), Chat.history.drop({ at: "response" }), Chat.socket.drop())   // existing: drop [W37]; a page fails once
  .advance({ next: { operation: O.messages, timer: "backoff" } })         // existing: next [W7]; reconnects, reads, the page's answer is lost
  .advance({ next: { operation: O.messages, timer: "page" } })            // existing: next
  .checkpoint("caughtUp")
  .world(Chat.resetLog({ epoch: 9 }), Chat.socket.drop())
  .advance({ next: { operation: O.messages, timer: "backoff" } })
  .checkpoint("reset")

test("replay, then reset", async () => {
  const { live, caughtUp, reset } = (await chat.run()).checkpoints
  expect(live.operations.messages?.connection).toBe("Live")
  expect(caughtUp.records("session", { operation: O.messages }).filter((r) => r.drop)).toHaveLength(1)
  expect(caughtUp.operations.messages?.catchingUp).toBe(false)            // NEW: catchingUp [v3 item 5]
  expect(reset.records("session", { operation: O.messages }).at(-1)?.bookmark?.at?.epoch).toBe(9)   // NEW: bookmark [v3 item 6]
})
```
