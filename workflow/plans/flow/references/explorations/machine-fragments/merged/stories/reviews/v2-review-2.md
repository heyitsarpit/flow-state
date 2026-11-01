# Stories proposal-v2: review 2 (final review of revision 2)

Reviewed: [../proposal-v2.md](../proposal-v2.md) revision 2, with [../decisions-v2.md](../decisions-v2.md) T1–T6 taken
as fixed, against [../brief.md](../brief.md), [v2-review-1.md](v2-review-1.md) (RV1) and its four Story files, the
model's counterexample and ambiguities ([../model/RESULTS.md](../model/RESULTS.md), MDL; the file on disk is still the
revision-1 run, so I walked F1 and every ambiguity against revision 2's tables by hand), [../../machine-design.md](../../../machine-design.md)
(MD), [../../merge-6-streams/proposal-v2.md](../../../merged/streams/proposal-v2.md) revision 5 (M6), and Effect 4.0.5 as
installed at the repository root (`effect/src/testing/TestClock.ts`, `effect/src/Scheduler.ts`). These findings are
advice to the main session. Nothing here is decided.

## Verdict

**One High. Everything else closes.** RV1's three Highs and eleven Mediums are closed by R-Cut, R-Settle, the `world`
option, R-Address and R-Owner, and the four Story files rewrite cleanly under revision 2 with no hacks left (below).
The one High is a narrower version of RV1 H2. Settling ends "after a macrotask flush", and that flush gives host I/O a
turn, so whether a host promise resolves before the check still depends on how fast the host is. The fix is one
sentence in 2.3 and 3.1, with no change to the public API. With it applied, **zero High findings** remain, and the
proposal is ready to merge with the polish listed at the end.

**Highs: 1.** Mediums: 9. Lows: 14.

## High

**H1. A macrotask flush lets host I/O choose results (2.3, 3.1; RV1 H2 not fully closed).** 2.3 says settling stops
"when, after a macrotask flush, no task is runnable", and that a fiber still waiting on the host "at that point" is
`HostTimeWait`. A macrotask boundary is exactly where the host delivers I/O completions: Node's poll phase runs before
the next `setImmediate`, and a browser runs other tasks before a `MessageChannel` task. Effect 4.0.5's default
dispatcher is a macrotask (`Scheduler.ts`: `setImmediate`, or `setTimeout(f, 0)`). Take RV1's scenario, two tabs whose
client halves sign the body with `crypto.subtle.digest`. On a fast host the digest completes inside the flush, the
fiber resumes, and the Story passes. Which request reaches `Docs.put` first then follows completion order, and that
decides who gets the `412`. On a slow host the digest is still pending at the check, and the run rejects with
`HostTimeWait`. The result is nondeterministic, and C6 and STF19 do not hold. The window is now one event-loop turn
rather than a grace period, but its shape is unchanged.

The fix keeps everything 2.3 promises. Settle on a run scheduler that dispatches as microtasks and never yields to
the host's task queue. Effect 4.0.5's `Scheduler` accepts `executionMode: "sync"`, which uses `setMicrotask`;
`shouldYield` must also never hand the fiber to a macrotask. Decide quiescence when Flow's queue and the microtask
queue are both empty. Host I/O never completes inside a microtask drain, so a fiber waiting on it is **always**
`HostTimeWait`, even if its promise would have resolved a moment later. Microtask-only promises (an `async` client half
that awaits no I/O) still resolve inside the drain, in a fixed order. The 4.0.5 TestClock's wake tracker (`WakeTracker`
in `TestClock.ts`) only counts tasks scheduled through the scheduler, so it is the right signal and needs no
macrotask. Replace "after a macrotask flush" with "once Flow's scheduler and the microtask queue are empty (no host
task runs during a settle)" in 2.3, 3.1's footnote and Testing O2's amendment.

## Medium

**M1. The `HeldConfirm` path brings back F1's ghost restore (2.5, 3.6).** 3.6 closes F1 for `hold()`, where the write
is aborted with the tab. Its own `HeldConfirm` row reopens it. Take `world(Fake.storage.write.hold({ at: "response",
match: { purpose: "acknowledge" } }))`, then `send(pay)`: the acknowledgement is stored and its confirmation is held.
Then a cancel: `NotSent { Cancelled }`, and the removing capture is `Queued` behind the held write (FIFO per tab).
Then `reload`: `HeldConfirm` "stays written", and the queued removal is `aborted`. Restore finds the acknowledged
record, and MD 2.7.13's restore row turns it into `unknown { Restored }` → `Held`. A `retry` now sends a payment the
user cancelled. Unlike F1, a real page can produce this: the IndexedDB transaction committed and the page crashed
before `oncomplete` and before the removal. So revision 2's sentences "no reload can restore an ended Attempt" (2.5)
and "a reload never restores an ended Attempt (MDL F1)" (3.6) are false. The Story is right to reach this cell; the
proposal is wrong to say it cannot exist. Fix: drop both sentences, list the cell in 2.6 and 2.16 as "a cancelled
Attempt's stored acknowledgement restored as unknown", and send it to MD and Persistence as an open question. Stories
expose it; Stories cannot decide it.

**M2. `openTab(…, { from })` re-ensures refs the tab no longer has (2.11, N3).** "Every ref that tab had ensured" reads
as the tab's history. Take a retain-expiry Story: `dispose(Checkout1)`, `advance` past the retain, then `reload`. That
re-ensures `Checkout1`, which a real reload would not mount, so the parked lane is adopted instead of staying
`Held (parked)`, and the Story reaches a different cell from the one it names. Two other cases are unstated: refs
ensured by app code rather than by steps, and `from` naming a tab that is closed. Fix: "the refs this Story's steps
ensured in that tab's latest life and did not dispose, in first-ensure order". `describe` can then print the list from
the plan alone (STR64).

**M3. `together({ advance })` does not say what woken non-schedule fibers do (2.3, 3.1, N4).** "Firing each deadline
so its event is queued, without turns" covers schedules. It does not cover a fake handler's latency sleep, an
adapter's retry backoff, or a setup-scoped fiber's heartbeat. Does a woken handler answer, does its settlement reach
the mailbox, and does a backoff send a request while admission is held? Each answer changes what the Story checks.
Fix, by analogy with controls: "each woken fiber runs until it reaches a mailbox, a gate or the Clock; only admission
is held". Also note that `together(E.Cancel(), { advance: d })` models a blocked main thread: production cannot fire a
timer while a queued click waits unless the thread is busy.

**M4. Adapter sleeps can be addressed only by operation (2.4; RV1 M3 at a finer grain).** `advance({ next: { operation:
O.messages } })` picks the earliest of that adapter's sleeps: the reconnect backoff, the page retry, and the 45 s idle
deadline once the socket is open. In 4.3's `pagedRepair`, the second `advance(backoff)` means "the page retry". If an
app's page retry is longer than its idle deadline, the same line fires the idle drop instead and may still pass, which
is M3's failure inside one operation. Fix: Flow owns `Feed.reconnect`, so its sleeps can carry a `timer` field (`backoff`,
`page`, `idle`, `resetAfter`) in the address and in `schedule` records. An author's own adapter sleeps stay addressable
by operation, and the proposal should say so.

**M5. A send from an SDK's own fiber loses its tab (2.5, RV1 M9).** "A send an SDK's own fiber makes has `via:
undefined`." Client halves are built per tab, so Flow knows the tab from the layer scope. Without it, `match: { tab:
"b" }` cannot target tab b's SDK traffic (drop only one device's realtime client), and a two-tab Story cannot say which
tab sent a request. That is a scenario a Story cannot express. Fix: `via` always carries `tab`; only the Attempt fields
(`actor`, `instance`, `copy`, `operation`, `attempts`) are absent for SDK-owned sends.

**M6. A hydration source's own `world` and steps have no defined place in the destination run (2.12, RC5).** "A
hydration source Story runs against the destination run's fake servers." The source is a full Story, with its own
`world` option and its own steps. It is not said whether its `world` is applied again to the shared servers (4.3's
`history` would post "hi" twice), when it runs (at the `hydrate` step, against truth the destination has already
changed?), or how its requests appear in the destination's request logs (`via.tab`?). Fix: a hydration source may not
set `world` (a type error), runs at the `hydrate` step against current truth, and its requests carry
`via.tab: { name: "server", open: n }`.

**M7. STF62's "reload that loses a pending reset" uses a step `together` does not accept (5.2).** The walk is written
as "a send …, then `closeTab` in the same step's `together`", but `together` takes sends, controls and `{ advance }`
only (2.3, 3.1). Even if lifecycle steps were allowed, a `closeTab` inside `together` would close the tab before the
send's turn, not between that turn and the pending reset's turn. Fix: write the walk with seeded storage,
`storage: Fake.storage.seed([memory whose reset key differs from the saved incarnation's])`, then `openTab`. That is
the restore path the walk is about, and it needs no new step.

**M8. 4.3's chat Stories disagree with N1 and with M6 revision 5.** Each fails on a correct app; none passes on a
wrong one.
- `historyGone` puts 152 posts and `retain({ last: 100 })` in the `world` option. Under N1 the retention happens
  before LOADING's first read, so the client's cursor is already inside the kept window, `catchUp` succeeds, and
  `Feed.CannotRepair` is never reached. Fix: seed `history` only, then `.world(ChatServer.greet({ replay: false }),
  ChatServer.socket.drop())`, the 150 posts, `ChatServer.retain({ last: 100 })`, then `advance(backoff)`.
- `flapping` expects `connection: "Ended"`. M6 2.11 (RV3 M5) is explicit that "after `FeedEnded` 4.1's machine leaves
  `LIVE`, so a flapping Story expects the row `undefined`". Fix: `.expect({ state: S.RETRY_WAIT })`.

**M9. A replayed shrunk Story can contain skipped steps (2.17).** A generated step that is invalid at that moment is
skipped and recorded as `step { skipped }`, and "the emitted Story still runs". But the emitted Story is an ordinary
plan, and an ordinary plan rejects `release` with nothing held (`NothingHeld`). So the shrunk counterexample does not
replay, against STR69 and STF52. Fix: the emitted and shrunk Story leaves out skipped steps. They had no effect, so the
run is the same.

## Low

- **L1. `purpose` is not in the address shape.** R-Address lists `{ actor?, instance?, copy?, operation?, schedule?,
  key?, tab?, life? }`, but `match: { purpose: "acknowledge" }` is used throughout. Say "an address plus kind fields",
  as 2.7 already says for filters.
- **L2. `Story.attempt(O.pay, 0)` and `(O.pay, 1)` in 4.1's `busyThenPaid`** contradict the signature
  `Story.attempt(op, address?)` with `{ n }`. Write `{ n: 0 }`. The schedule is also spelt `CheckTick` in N2 and
  `checkTick` in 4.1.
- **L3. Schedule names in addresses are not type-checked.** Machine schedules are declared data, so a wrong
  `{ schedule }` could be a type error like a wrong checkpoint name (add it to 2.15's list) instead of a `NoDeadline` at
  run time.
- **L4. Rank 1's "fixtures order" for fake servers.** Servers are not fixtures; client halves and bindings are.
  Define the order: first reference by a fixture, then by name, then `Fake.storage`.
- **L5. Tab order after a reload.** "Tab-open order" after `reload("main")` puts main's second life after `b`, which
  silently changes who wins every equal-instant race. Either keep a name's first-open rank, or say that it moves.
- **L6. Rule precedence between a server handle and its endpoints.** "Each target keeps an ordered list." When a
  request fits both a handle rule (`Docs.drop({ times: "always" })`) and an endpoint rule, it is unclear which applies,
  and whether `Docs.put.release()` ends the handle's rule. Say: one list per server, ordered by when each rule was
  set; `release` on a target ends only that target's rules.
- **L7. 3.6 has no rows for reads.** "Reads are never held unless a rule says so", but `Fake.storage.read.hold()` (a
  slow restore) and `read.drop()` (a failed restore) have no cells.
- **L8. Stream request-log phases.** 2.5's phases are call-endpoint words. 2.10 reads `ChatServer.socket`'s log, but
  the phases of an open (accepted, refused with a code, held, closed with a code) are not listed.
- **L9. Reordered frames (M6 SR12).** 2.5 gives `release({ nth })` as the reorder, but 3.3 has no `release({ nth })`
  row for `Silent`, and 2.10's mapping table has no "reordered frames" line.
- **L10. `session` records lack `copy`.** A stream placed in a trait under `.each` has copies, and 2.7's "one shape
  everywhere" requires the field. Also state that Story records are taken from the INS O4 event stream for the whole
  run, not from Inspection's 256-entry evidence ring in M6 2.12.
- **L11. M6's Inspection flags** (`UnprovenValues`, `RegistrationChurn`, `ReleaseOverdue`) have no record kind in 2.7.
  Say they are `diagnostic` records.
- **L12. Amendments, small gaps.** 6.1 amends MD 3.6's "New, plans" keyword row but not "New, fragments", which still
  lists `story.machine(fragment)` with `run.calls` and `checkpoint.exit`. 6.2's M6 row should also replace 2.11's
  "maps these needs to … `expect(…, { connections })`" and add `cell` to M6's evidence contract, since Stories'
  coverage reads it.
- **L13. `wokenPage`'s fake has no heartbeat.** With no pings, the 45 s idle deadline fires whether or not the tab
  was suspended, so the Story barely separates the two. A `ChatServer.ping` control, applied before and during the
  suspension, would make STF78's case sharp.
- **L14. 3.6's claim that "the Runtime's next capture … removes it"** after a cancel in the acknowledgement window is
  a Persistence fact, not a Stories one. Cite PER O7, or list it for the PER amendment.

## Review 1, closed or not

| RV1 | Status under revision 2 |
| --- | --- |
| H1 step cut | **closed** (R-Cut, 2.7): `paying`'s two verdicts and the closed-tab `release` both read step-end truth; `checkpoint` and `explain --at` include the step's own records |
| H2 grace | **narrowed, not closed**: H1 above |
| H3 world before subject | **closed** (N1, 2.2 "The start"); 4.3 and 4.4 use it. 4.3's `historyGone` was converted wrongly (M8) |
| M1 ordinal attempts | closed (`Story.attempt(op, address)`, `AmbiguousAttempt`) |
| M2 `match` by host | closed (`match: address`; 4.7 `bothHosts`) |
| M3 `advance("next")` | closed for schedules; adapter-level remainder in M4 |
| M4 tab identity | closed (`{ name, open }` in `via` and records) |
| M5 unowned sleeps | closed (rank 3) |
| M6 cross-tab order | closed (invocation order, 2.3 and 3.5) |
| M7 placement from later steps | closed (2.13's table, 3.4) |
| M8 server defect | closed (binding failure plus `issue`; `Defect` from a malformed body) |
| M9 provenance | closed for batching (`attempts`); SDK sends lose the tab (M5) |
| M10 close cells | closed (suite-only; `hold({ at: "close" })` removed) |
| M11 hydration world | closed in principle; the source's own world and steps are undefined (M6) |
| L1–L8 | closed (L6's `{ x: undefined }` and `withhold` inversion included) |
| B5 condition | met, except that replay of skipped steps is not defined (M9) |

## The four Story files under revision 2

Each was rewritten under revision 2. Every hack RV1 listed goes away; what remains is honest production wiring.

| Case | Revision 2 shape | Result |
| --- | --- | --- |
| 1. Reload while held, second press, old request last | `world(hold({ times: 1 }))`, `send`, `reload("main")`, `send`, `advance({ next: { schedule: "checkTick" } })`, `world(release())`, then `expect(Stripe.confirm, [{ phase: "orphan", via: { tab: { name: "main", open: 1 } } }, { phase: "answered", via: { tab: { name: "main", open: 2 } } }])` | **passes on a correct app, fails on a wrong one**: the second press's `Unhandled` is in its own cut; the charge read after the release is step-end truth. `times: 1` is needed, or the reopened tab's retry is held too (standing `hold`). 13 lines, down from 17 |
| 2. Two tabs, one record, a conflict | `openTab("b", { from: "main" })`, then `send({ actor: Workspace, tab: "b" }, E.Open(…))` (sends are not repeated, and b has no persistence, which is correct), edits in each tab, `advance("800 millis")` | deterministic: rank 5 by tab order, one sleep then a settle, so main's save is answered before b's timer fires. "b wins" no longer needs a 1 ms stagger: `world(Docs.put.hold({ match: { tab: "main" } }))`, `advance`, `release`. L5 applies if main is reloaded |
| 3. Stream reset, then caught up | `world: [post a, post b]` option; `checkpoint("before-reset")`; `since: "before-reset"`; `greet({ replay: false })`; `expect(ChatServer.socket, [{ input: { from } }, …])` | closed: H3, L4, L5, the `withhold` inversion. `advance({ next: { operation } })` is exposed to M4 when the page retry is the intended deadline |
| 4. Fragment on two hosts, one held | `world: [c7]`; `drop({ at: "response", match: { actor: BoardP1 } })`; `Story.attempt(LikeButton.O.set, { actor: … })`; `instance: ["likes"], copy: "c7"` | closed: the order of the two sends no longer matters; one `instance` shape |

## The model's counterexample and ambiguities against revision 2

- **F1 (ghost restore):** closed for `hold()`. With the tab closed first, 3.6 aborts the held write; with the release
  first, the stored write is removed by the capture queued behind it. **Reopened by `hold({ at: "response" })`** (M1).
- **W1–W7:** closed. `release` ends standing rules and `NothingHeld` needs both empty; `Transit` and `Answered` are not
  states; the duplicate answer is discarded as `duplicate`; `orphan` is a terminal phase; `release({ nth })` has a
  row; `at: "response"` has rows; one rule per request, earliest set first. L6 is a remainder of W7.
- **S1–S5:** closed. 3.3 has `None` and `Closed` columns for `hold`, `drop` and `duplicate`; `release` completes a held
  open; there is no close hold and so no `Closing`; suspension makes transport input wait in every state.
- **H1 (frozen):** closed by `leave({ end: true })` in 3.4. **E1:** closed (`Fake.storage` after servers; L4 for the
  servers' own order). **L1:** stated (`StoryTurnLimit`, the author bounds the fake). **T1:** the model has no
  mailbox; 2.3 states the race. **W2's unreachable cells:** removed from 3.2.
- **Counts checked:** 3.2 has 52 cells (23 defined), 3.3 has 55 (38), 3.4 has 28 (25) and 3.6 has 36 (15), all as
  stated.

## N1–N4

- **N1 `world` option.** Sound: data, one place, printed by `describe`, applied before bootstrap or actor start, so a
  storage read rule in it holds the bootstrap restore as a real slow disk would. Regression: 4.3's `historyGone` (M8).
  Open: a hydration source's own `world` (M6).
- **N2 address.** Sound, and it removes every ordinal. Remainders: `purpose` (L1), the `{ n }` spelling (L2), schedule
  names untyped (L3), adapter sleeps only by operation (M4), SDK sends without a tab (M5).
- **N3 `reload` and `openTab(…, { from })`.** Sound and production-shaped (sends are never repeated). Needs the "latest
  life, not disposed" rule (M2).
- **N4 `together({ advance })`.** Sound for schedules. Needs the rule for woken non-schedule fibers (M3). No deadlock:
  every input reaches a mailbox, a gate or the Clock without a turn.

## STF walk (only where revision 2's claim does not hold as written)

| STF | Proposal | This review |
| --- | --- | --- |
| STF3 | impossible | holds; SDK sends need `via.tab` (M5) |
| STF12 | met | met; the "never restores an ended Attempt" claim is false on `HeldConfirm` (M1) |
| STF19 | reported at once | deterministic only with H1's microtask-only settle |
| STF22 | met | met once L4 (server order) and L5 (tab order after a reload) are stated |
| STF24 | met | met for schedules; adapter sleeps by operation only (M4) |
| STF52 | met | a shrunk Story with skipped steps does not replay (M9) |
| STF62 | met | the pending-reset walk is written with a step `together` refuses (M7) |
| STF77 | met | met; reordered frames lack a 3.3 row (L9) |
| STF78 | met | met; 4.3's example is weak without a heartbeat (L13) |

Every other STF (1, 2, 4–11, 13–18, 20, 21, 23, 25–51, 53–61, 63–76, 79) holds as revision 2 states it. STF4 is now
correctly "reported by coverage". STF55, STF63 and STF69 hold through R-Cut and tab lives.

## Streams' evidence and what Stories reads

M6 2.11 fixes the contract as "each start's answer and basis, `missed`, drop, `Overflow`, `Discarded`, the reconnect
phase". 2.7's `session` record carries exactly these, plus `cell` for coverage, and so does 6.2's INS O4 row.
Revision 2's mapping covers each M6 2.11 need: `accept` and `refuse` by `open`'s answer and `drop({ at: "open" })`;
`send` and `flood` by controls; `silence` by `hold()`; `drop(code)` and `flap` by `drop()` and controls; `withhold`
by `greet`; `resetLog` and `retain` by controls; the history `hold`, `answer` and `fail` by the history endpoint's wire
words; `story.suspend` by `advance(…, { suspended })`; `resumedFrom` by the socket's request log;
`checkpoint.evidence("feed")` by `session` records. The gaps are small: `reorder` (L9), `copy` and the 256-entry ring
(L10), the Inspection flags (L11), adding `cell` to M6's contract (L12), and M6's two notes for merge 3 (M8's
`flapping`, and `continueAt` in `historyGone`, which N1 broke).

## End-to-end consistency and amendments

- **Single runtime, static analysis, CLI:** no break. Plans stay data. `world`, `from` (with M2's rule) and addresses
  are printable from the plan. Properties are options, printed by name. Tabs are TST O7's Runtimes; the fragment
  stand-in is invisible.
- **Every *Story reads: merge 3* spot** in MD: the header (15), rule 21 (643), rule 47 (861), rule 58 (994), 2.5
  (1164), 2.7.2 (1355), 2.7.3 (1593), 2.7.11 (2015–2024), 2.7.13 (2341), 2.7.16 (2518), 2.8's introduction (2580),
  3.6's "New, plans" (4374), C27, C30, C53 and C63, and items 17 and 19 each have a 6.1 row. **Missing:** 3.6's "New,
  fragments" keyword row (4373) (L12). The decision log's OD23 mention (5181) is history and stays.
- **6.2:** complete for Testing O1–O9, Inspection O1, O4 and O5, CommandLine, Package, EntityDomains, playback and DD.
  Add H1's wording to Testing O2, L12's lines to the M6 row, and (from M1) a Persistence note on the stored-but-cancelled
  acknowledgement.

## Ready to merge

**Once H1's sentence is applied there are zero High findings**, and revision 2 is ready to merge. Polish left, none of
it a public API change:
1. H1: settle on a microtask-only run scheduler, with no host task during a settle (2.3, 3.1, Testing O2).
2. M1: remove the "never restores an ended Attempt" claims; list the `HeldConfirm` restore cell; send it to MD and PER.
3. M2: `from` means the latest life's ensured refs that were not disposed, in first-ensure order.
4. M3: woken non-schedule fibers inside `together({ advance })` run to a mailbox, a gate or the Clock.
5. M4: a `timer` field for `Feed.reconnect`'s own sleeps, or state the limit.
6. M5: `via.tab` is always present.
7. M6: a hydration source has no `world`, runs at the `hydrate` step, with `via.tab: "server"`.
8. M7: STF62's pending-reset walk by seeded storage.
9. M8: fix `historyGone` and `flapping` in 4.3.
10. M9: emitted and shrunk Stories leave out skipped steps.
11. L1–L14 as listed.
