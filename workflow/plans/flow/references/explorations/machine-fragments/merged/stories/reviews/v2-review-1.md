# Stories proposal-v2: review 1 (correctness and real code)

Reviewed: [../proposal-v2.md](../proposal-v2.md) with [../decisions-v2.md](../decisions-v2.md) T1–T5 taken as fixed,
against [../brief.md](../brief.md), [../../machine-design.md](../../../machine-design.md) (MD), Testing.plan (TST),
Inspection.plan (INS), Persistence.plan (PER), [../../../playback.md](../../../../playback.md) (PB),
[../../merge-6-streams/proposal-v2.md](../../../merge-6-streams/proposal-v2.md) revision 4 (M6), the lane model and the
stream model results, and Effect 4.0.5 as installed (`effect/testing/TestClock.ts`, `effect/socket/Socket.ts`). Real
Story code for the four cases is in the scratchpad (paths at the end); the friction table summarises it. Findings are
advice to the main session. Nothing here is decided.

## Verdict

**Sound direction; not ready to merge.** The five rules carry most of the brief: R-Settle removes the `process()` traps
(STF20, STF21, STF25, STF74) for real, R-World's two lifetimes answer STF13–STF15, and T2's "no injection" holds up:
every reachable write-lane cell I walked can be reached by a fake's answer or a lifecycle step (including two the
proposal does not list: G1's "acknowledged but never invoked" restore, by `Fake.storage.write.hold({ at: "response",
match: { purpose: "acknowledge" } })` then `closeTab`, and a `W` entry's `NotSent { Restored }`). The remaining
problems come from five root causes. Three give **Highs**: a step's cut is defined as a publication frame, so anything
a step changes without publishing (server truth, request logs, verdicts) is read stale; settling waits on host time
for a grace period, so order and results depend on host speed; and a machine Story's subject starts before any
`world` step, so a populated server cannot be set up per Story (the proposal's own chat Stories assume it can). Each
has a small fix that changes no public word.

**Highs: 3.** Mediums: 11. Lows: 8.

## Root causes and fixes

| # | Root cause | Findings | Fix |
| --- | --- | --- | --- |
| RC1 | **The step cut is a publication frame.** A step that publishes nothing (an `Unhandled` send, a `world` control, anything while the only tab is closed) gets the previous frame, whose `seq` and truth predate the step. But truth, request logs, `control`/`request`/`verdict` records and wire state change without a publication. | H1, M9 | Every step ends with its own **step cut**: `{ frame (the latest publication), seq = the step's last evidence position, truth and wire state at the step's end }`. `expect` and `checkpoint` read the step cut, never a bare publication frame. Publication frames stay as they are for properties and playback. |
| RC2 | **"Nothing can happen" is decided partly by host time.** `HostTimeWait` fires "after a short host-time grace"; fibers resumed from host promises within the grace run in completion order; some order inputs are unowned (sleeps in setup-scoped SDK services, cross-tab invocation order). | H2, M5, M6 | Quiescence = the scheduler has no runnable task after one macrotask flush (microtask-only promises then resolve deterministically; TestClock 4.0.5 already counts woken tasks with its wake tracker). Anything still awaiting a non-Flow async op at that point is `HostTimeWait` **at once**, with no grace. Give every order input an owner and a rank, including unowned sleeps (rank by arming order after adapters) and the order requests reach a fake (invocation order: tab, then turn). |
| RC3 | **The subject starts at frame 0.** A machine (or fragment) Story's actor exists before step 1, so its first reads run against the fake's `initial` truth; `world` can only change truth afterwards. | H3 | An option `world: [controls]` applied before the subject starts (and before bootstrap for app Stories), printed by `describe`. Data, one place, no new step word. |
| RC4 | **Addressing by ordinal and by operation only.** `Story.attempt(O.x, n)` counts mints across actors, hosts and tabs; `match` has `operation`, `tab`, `purpose` but no actor, instance or tab life; `advance("next")` takes any owner; tab names are reused across reloads; `since` takes a run value. | M1, M2, M3, M4, L5 | One **address** shape shared by `match`, `Story.attempt`, `Story.records` filters and `advance`: `{ actor?, instance?, copy?, operation?, key?, tab?, life? }` (the `via` record already holds every field). `Story.attempt(O.x, { …address, n? })`; `advance({ next: address })`; `since: "checkpointName"`; tab identity `{ name, open }` in `via` and records. |
| RC5 | **Behaviour chosen from the rest of the plan or from the author's fake.** The stand-in host's placement depends on whether `reset` appears later; a server handler's defect becomes a client defect; `lost` lives on the endpoint, not the binding; SSR's source Story has its own world. | M7, M8, M10, M11, L3 | Decide each from the declaration that owns it: placement from the fragment's own declaration; what a server failure looks like from the transport binding; `lost` on the binding (with `Fake.fetch` and `Fake.webSocket` defaults); a hydration source runs in the destination's world. |

## High

**H1. A step that publishes nothing reads stale truth and drops its own records (RC1).** 2.7 defines a step's frame
as "the previous one" when it published nothing, a frame as holding "each fake server's truth" and `seq` "the position
in the evidence list it has seen", and `expect` as checking "the latest step frame". Scenarios:
- The proposal's own `checkout/paying` (4.1): `.send(pay, pay)` is two steps; the second is `Unhandled` and
  publishes nothing, so the step frame is the first send's last publication, whose `seq` is before the second
  verdict. `.expect(Story.records("verdict"), [Allowed, Unhandled])` **fails** on a correct app.
- Worse, the passing direction: in an app Story, `.closeTab("main").world(Stripe.confirm.release())
  .expect(Stripe, { charges: [] })` **passes** although the server charged, because no tab published and the step
  frame holds the truth from before the release. "The server never got it" is asserted wrongly; the same with
  `expect(Docs.put, [])` after any control that publishes nothing (`Docs.editElsewhere`, `Stripe.busy`).
- `checkpoint` after such a step names a cut whose evidence does not include the step, so `flow explain --at` misses
  the step's own `request` and `control` records.
Fix: RC1's step cut. It also gives playback a frame for every step (STR53) without inventing a publication.

**H2. `HostTimeWait`'s grace makes results and order depend on host speed (RC2).** 2.3: "a fiber neither finished nor
suspended on the Clock, a gate or a known external input after a short host-time grace" is a failure. So a fiber
awaiting a host promise that resolves inside the grace is accepted, and resumes in completion order. Scenario: two
tabs whose client halves sign the request body with `crypto.subtle.digest` (common for HMAC-signed APIs, and any
Promise-based SDK subset run with `Effect.promise`). Both settle within the grace on a fast machine; which reaches
`Fake.server` first decides `n`, `Story.attempt` indices and, with a conditional fake (`If-Match`), which tab gets
`412`. On a slow CI box the same Story fails with `HostTimeWait`. C6 ("host time and randomness never choose order")
is broken, and the failure is intermittent. Fix: RC2 (no grace; one macrotask flush, then fail at once, naming the
owner). Microtask-only promises (an `async` client half that never awaits I/O) still work deterministically.

**H3. A machine Story cannot start against a populated server, and 4.3's Stories are wrong under the stated
semantics (RC3).** `Story.make(ChatRoomMachine, …)` creates the actor in its initial frame; LOADING's history read runs
inside that first settle against `initial: { log: [] }`. 4.3's prefix `.world(ChatServer.post("hi"),
ChatServer.post("there"))` is commented "LOADING's history read, then LIVE from seq 2", but the read has already
returned empty and the first connection opened with no `from` (answered `fresh`); the posts arrive as live frames.
`dropAndReplay`'s `expect(ChatServer, { connections: [{ from: { epoch: 1, seq: 2 } }, …] })` then fails for the first
connection, or, if an author "fixes" the expectation to match, the Story never exercises the populated-history path
it is named for. The only workaround is a second fake definition per starting truth, or an app Story. Every "the
server already holds X when the screen opens" case (a doc that exists, a cart with items, a thread with history) is
affected for machine Stories, which are the common tier. Fix: RC3's `world` option. (App Stories are fine: `world`
then `ensure`, as 4.4's `desk` does.)

## Medium

**M1. `Story.attempt(O.x, n)` is an ordinal across actors, hosts and tabs (RC4; STF37 is not met).** Case 4: the
board's and the page's likes are `Story.attempt(LikeButton.O.set, 0)` and `1` only because the board sent first;
swapping two `send` lines silently swaps every `via.attempt` check. With `.each` copies (`Autosave.O.save` for d1 and
d2) or two tabs, the index depends on cross-actor mint order. Fix: address-qualified attempts (RC4).

**M2. `match` cannot name a host, so "a fragment reused on two hosts" relies on request order (RC4).** 2.5 gives
`match: { operation?, tab?, purpose? }`; a fragment's operation is the same contract on every host, so
`Issues.setLike.drop({ at: "response" })` hits whichever host sends first. 2.6's claim for STF10 ("`via.instance`,
`match`") is not true of `match`. Fix: `match` takes RC4's address; `via` already records the fields.

**M3. `advance("next")` takes any owner, and it is used in common Stories while tiered rare.** 4.1, 4.3 and 4.5 use it
to mean "the retry tick", "the backoff", "the debounce". Adding any earlier deadline to the app (a typing indicator,
a heartbeat, a toast timeout) moves every such Story to the wrong deadline, which may still pass. Fix:
`advance({ next: address })` (rank and owner already exist in 3.5), and count it in the common tier.

**M4. Tab identity is a reused name.** `closeTab("main")` then `openTab("main")`: `via.tab`, `ending.tab` and the closed
tab's kept records all say `"main"`. Case 1 cannot tell the closed tab's orphaned request from the reopened tab's
retry. STR26 already seeds by open count. Fix: `tab: { name, open }` in `via` and records; filters accept the name
alone.

**M5. Equal-instant ranks miss unowned sleeps.** Ranks 1–4 cover fakes, adapters (by actor and operation), Runtime
waits and schedules. A sleep in a setup-scoped service has no actor or operation: recipe S's SDK client (M6 2.4,
heartbeats and its own reconnect backoff, forked at layer build), a shared rate limiter, a cache sweeper. Its rank is
undefined, so STR14's "total" order is not shown. Fix: a rank for setup-scoped fibers (after adapters, by layer order
then arming), stated in 3.5.

**M6. Cross-tab request order at a fake is unstated.** "Tabs run … one turn at a time round-robin" orders turns, not
invocations and handler fibers. In case 2 both tabs invoke a `PUT` in one settle; which reaches `Docs.put` first
decides who gets `412`. Fix: invocations reach fakes in invocation order (tab order, then turn), stated in 3.2.

**M7. The stand-in host's placement depends on later steps.** 2.13: "a `resetOn` placement when `reset` is used".
So `base = Story.make(Autosave, …).enter({ docId: "d1" }).send(…)` runs in a one-copy `.each` in `base.leave()` and
in a `resetOn` placement in `base.reset("d2")`: the same prefix has different subject paths and adoption rules in
two branches (against STR2's "extending a Story never changes an earlier prefix"), and a Story with both `leave` and
`reset` has no stated placement. Fix: placement from the fragment's declaration alone (a writing trait: one-copy
`.each` keyed by the subject, with `resetOn` on the same key; resumable: a resumable node), never from the plan.

**M8. A server handler that dies is not how a client gets `unknown { Defect }`.** 2.6 maps `{ Defect }` and
`{ Interrupted }` to "a handler that dies, or is interrupted". A server crash reaches a real client as a 500 or a
dropped connection, never as a defect in the client's fiber; letting the wire carry a defect is a fake behaviour no
transport has (SG7, C16), and a Story could pass a client path production never takes. The client's real `Defect` is
a bug in the adapter, reached by a response it cannot decode (a malformed body), which the fake already can send.
Fix: a server defect becomes the binding's `lost()` (or a 500 for `Fake.fetch`) plus an `issue` naming the fake;
document "malformed response" as the Defect path.

**M9. Request provenance from the calling fiber is not general.** `via` is "recorded by Flow from the fiber that
called". A batched request (Effect's `RequestResolver`, one request for several Attempts) has several Attempts; in
recipe S the SDK's own fiber sends, so `via.attempt` is absent. "Charged once" by `via.attempt` (STF3) then misreads
both. Fix: `via.attempts` (a list), and a stated "no Flow caller" value for SDK-owned sends, where the Story checks the
idempotency key in `input` instead.

**M10. `ReleaseOverdue` is unreachable through `Fake.webSocket`.** 2.10 reaches it by `hold({ at: "close" })` then
`advance("5 seconds")`. Effect's socket finalizer is `Effect.sync(() => ws.close(1000))` (`socket/Socket.ts:915`): it
does not await the close, so the scope closes at once and the bound never passes. The same holds for several 3.1
`Releasing` cells (a signal or value arriving after release begins): Flow interrupts the reader, so no transport fake
can produce them. STR66 is claimed "met"; it is met only through a `Feed.callback` client half whose finalizer awaits.
Fix: say which stream cells need such a client half (and ship one in `Fake`), and mark the rest as Runtime-internal
races for the policy suite.

**M11. `hydrate(source)` runs the server render in another world.** TST O7's source is "an independently executed
source Story", so its fakes are a second run's servers. A Story that renders on the server, hydrates, then refetches
reads two truths that may differ, which production (one server) never shows; R-World's "one per run" does not hold
across the boundary. Fix: a hydration source Story runs against the destination run's fake servers (shared world),
or the step is `dehydrate` in the same run.

## Low

**L1. Frame cap versus B4.** `run.frames` keeps 10,000 publication frames; a minute of a 10 ms poll or a 150-message
flood across two tabs reaches it, and "a check over truncated frames fails closed". Step cuts and checkpoints should
be exempt, as the trace never drops checkpoints (INS O4).

**L2. `Story.inspection` is not `inspect(runtime)`.** `work` lists "a held request, response, frame or write": those are
Story gates, unknown to a production Runtime. Keep Runtime work in `inspect(runtime)`; held wire items belong to the
`request` records and fake reads, or `Story.inspection` must be described as `inspect(runtime)` plus the wire.

**L3. `lost` sits on the endpoint, not the transport.** `Docs.put` declares `NoResponse`, chat's `history` declares
`TypeError("Failed to fetch")`. What a lost request raises is the binding's (fetch: `TypeError`; WebSocket: close
1006), and an endpoint reached through two bindings needs two. Locality says the binding; `Fake.fetch` and
`Fake.webSocket` can default it, leaving `lost` only for app-service client halves.

**L4. Stream fakes restate what the wire already records.** `connections: [{ from }]` is kept by hand in `open`, while
the `socket` endpoint's request log already holds every open with its `from`. Read `expect(ChatServer.socket, [{ input:
{ from } }])` and drop the truth field (open-items 15).

**L5. `since: run.checkpoints.locked` puts a run value in a plan.** R-Data forbids it and plans exist before runs.
Take a checkpoint name.

**L6. Small inconsistencies.** 3.2's `Orphan` state has no request `phase` word in 2.5; `instance: ["likes", { copy:
"c7" }]` (4.7) contradicts 2.7's separate `copy` field; whether `hold()` is one-shot or standing is only inferable from
4.2 (`editDuringSave`); `{ x: undefined }` in a partial (absent, or present and undefined) is unstated; `withhold({
replay: true })` sets `replay = false`.

**L7. STF4 is reported only when the author asserts the ending.** A Story that checks only `state: S.DONE` passes on the
`unknown ServerError` path; coverage then shows the `Busy` handler unreached. Acceptable, but say "reported by
coverage", and keep the intermediate state check (`S.WAITING`) in the documented shape.

**L8. `dehydrate` moves time inside a step.** TST O7's "advancing controlled time through delays until quiet or within"
is a time motion outside `advance`, so 2.4's per-deadline settling and 3.5's order should be stated to apply inside it.

## STF walk (only where the proposal's claim does not hold as written)

| STF | Proposal | This review |
| --- | --- | --- |
| STF3 | impossible | holds for one caller per request; not for batched or SDK-owned sends (M9) |
| STF4 | reported | reported by coverage only (L7) |
| STF10 | met: `via.instance`, `match` | `match` cannot name an instance (M2) |
| STF14, STF15 | met / impossible | hold; wire rules' counters (`times: 2` across a reload) should be stated run-scoped |
| STF19 | reported | reported, but nondeterministically within the grace (H2) |
| STF22 | met | not total: unowned sleeps, cross-tab invocation (M5, M6) |
| STF37 | met | ordinal across actors and tabs (M1) |
| STF55 | met with `since` | `since` takes a run value (L5) |
| STF63 | impossible | the step is kept, but its read omits its own evidence (H1) |
| STF77 | met | `ReleaseOverdue` and `Releasing` cells not through `Fake.webSocket` (M10) |
| STF79 | met by search; enumeration cut | an honest cut; shrinking gives a local minimum, not "the shortest way in". Say so |

Every other STF holds as the proposal states it. STF7, STF8, STF9 and STF11 hold under T2 with no extra mechanism.

## Executor tables (section 3)

- **3.1 is complete** for the steps it lists. Two gaps: a step's read cut (H1), and `dehydrate`'s time motion (L8).
- **3.2** is complete for one client; cross-tab arrival order at the server is missing (M6), and `Orphan` has no
  phase (L6).
- **3.3** needs a row for frames sent while a client close is held (is the connection `Open` for controls?), and the
  note that `hold({ at: "close" })` has no effect on Effect's socket (M10).
- **3.4** is consistent with 2.13 except for the plan-dependent placement (M7).
- **3.5** is deterministic at equal instants once unowned sleeps get a rank (M5).
- **R-Settle with schedules, holds, streams and tabs together** holds once RC2's quiescence rule replaces the grace:
  holds and open streams are gates, deadlines are Clock sleeps, a suspended tab is excluded by construction. No
  deadlock found: every `together` input either reaches a mailbox without a turn or is `NothingHeld`. One scenario it
  cannot express: a **timer firing** queued between a settlement and its admission (`together` takes sends and
  controls, and `advance` admits after each deadline). The lane cell is still reachable with a user cancel; the
  timeout-cancel race (PAYING's `TookTooLong` against a landing answer) is not. Worth `together(advance(d), …)` if the
  owner wants that race in app Stories; otherwise state it.
- **Reaching every cell without injection (T2): yes** for MD 2.7.13's 33 holding cells, the `cancel`/`allow` table,
  `Held (parked)`, 2.9.3 and the releasing rows, and M6 3.1, 3.3, 3.4, 3.5, with M10's exceptions. The proposal should
  add G1's restore cell by `hold({ at: "response" })` on the acknowledgement write, which is the cleanest path to it.

## B1–B6

| | Gain | Code-shape cost | Smaller way to the same gain | Judgement |
| --- | --- | --- | --- | --- |
| **B1** settle every step | removes STF20, STF21, STF25, STF74 by construction | every Story loses `.process()`; `advance` changes results (DD's `lockedOut` now runs) | none that keeps the guarantees; a draining `process()` keeps STF74 | **justified**, with RC1's step cut and RC2's quiescence |
| **B2** `Fake` module | STF13–STF17, the wire gate, provenance | a new module and a fake per server | fixtures-only with a pattern leaves each author to rebuild the gate | **justified**; trim by moving `lost` to bindings (L3) and dropping hand-kept `connections` (L4) |
| **B3** `expect` rejects `run()` | test, CLI and player agree (SG4, SG6) | assertions move from test files into Stories | none; a `strict` flag would bring back two meanings | **justified** |
| **B4** a frame per publication | STF46, STF47, STR45 | amends PB's accepted O4; `frames` option gone | keep publications always and add step cuts (RC1); collapse is the only thing that must go | **justified** once step cuts exist and are exempt from the cap (L1) |
| **B5** `propertyTest(story)` | one-runtime search (STR68, STR70) | widens TST O6 | add `steps` generators to TST O6's existing form; the same thing | **justified only if** generated steps that are invalid in the current state (`release` with nothing held, `leave` when not entered) are skipped, not `StoryInvalidCommand`, and shrinking keeps hold/release pairs together; otherwise most generated runs reject as execution errors (TST O6) |
| **B6** `Story.make` | one constructor, Effect's `Module.make` convention | renames every DD Story | none smaller; T3 decided | **acceptable**; mechanical |

## Integration

- **Story reads: merge 3 spots.** 6.1 covers all eleven (MD header, rules 11, 21, 47, 58, 2.5, 2.7.2, 2.7.3, 2.7.11,
  2.7.13, 2.7.16, 2.8's introduction) and C27, C30, C53, C63, items 17 and 19. Complete.
- **Testing O1.** "No arbitrary callbacks" is kept, but `Story.property` puts a callback in options; the amendment
  should say properties are options, not commands, and that `describe` prints them by name.
- **Testing O2–O4.** Amendments listed. O4 also needs the step cut (RC1) and the frame cap exemption (L1). PB's
  `minDwell` rationale ("frames from one `process()` share the same `now`") needs a rewrite.
- **Inspection.** O4 needs `tab` (with open count, M4) and the run-wide sequence beside each Runtime's own in its
  closed schema; 6.2 lists the new kinds but not these fields. L2 for O1.
- **Playback.** Consistent: step stepping, addressed-event highlight, closed-tab gaps, fragment Stories not playable.
- **`flow check`, `flow explain`.** Consistent; they read records the trace keeps. `explain --at` depends on H1's fix to
  include a step's own records.
- **SSR.** M11, L8.
- **Persistence.** PER O7's Web Lock needs a run-scoped fake lock shared by tabs; not named (part of `Fake.storage`
  seems natural).

## Friction for the four cases

Code: `/private/tmp/claude-501/-Users-arpit-Developer-flow-state/f0eec56b-0d13-4e1b-81a5-261b36564f95/scratchpad/stories/`
(`c1-reload-held-payment.story.ts`, `c2-two-tabs-conflict.story.ts`, `c3-stream-reset-catchup.story.ts`,
`c4-fragment-two-hosts-held.story.ts`).

| Case | Story lines (prefix) | Fake lines | Hacks | Wiring every author repeats (open-items 15) | Absorb as |
| --- | --- | --- | --- | --- | --- |
| 1. Reload while a payment is held | 17 (2) | 0 (4.1's) | `advance("next")` meaning "the retry tick"; two `via.tab: "main"`; orphaned answer has no phase; the second-press verdict is invisible (H1) | `closeTab` + `openTab` + `ensure(ref, { input })` with the input restated, in every reload Story | `reload(tab?)`: close, reopen, and re-ensure every ref the closed tab had ensured with the same options |
| 2. Two tabs, one record, a conflict | 15 + 9 (3) | 0 (4.2's) | 1 ms stagger to choose the winner; request order at the server unstated (M6) | `{ tab: "b" }` on 5 of 13 steps; the prefix (`ensure`, `Open`) restated per tab; the server's body and etag restated in `E.Open` | `openTab("b", { replay: "prefix" })` is a callback-free option that re-applies the plan's lifecycle prefix in the new tab; and the doc's starting data should come from a read, not a forged event (a product-case point, not an API one) |
| 3. A stream that resets and is caught up | 12 (1) | 21 + ~25 helpers | `advance("next")` twice; `since` with a run value; `withhold({ replay: true })` inverted; H3 for any pre-populated start | the server's cursor protocol (`greeting`, `page`, `message`, URL parsing) per app; `connections` bookkeeping; `lost` per endpoint | `connections` from the socket's request log (L4); `lost` default per binding (L3); `Fake.fetch` and `Fake.webSocket` route helpers (deferred in section 8; worth doing); the protocol itself stays the author's (C16) |
| 4. A fragment on two hosts, one held write | 14 (4) | 0 (4.4's) | the board's request is targeted by being first; Attempts by ordinal 0 and 1; two shapes of `instance` | truth seeded before every `ensure` in each prefix | RC4's address in `match` and `Story.attempt`; RC3's `world` option for seeding |

**Every case** repeats the same two things the system could absorb: telling one actor, host or tab life apart (RC4)
and setting the world before the subject exists (RC3). Neither needs a new concept: both are an option or a field on
words the proposal already has.
