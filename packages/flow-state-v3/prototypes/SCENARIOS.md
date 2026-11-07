# Scenarios

Status: proposed. The shared catalog every round runs, written against `conformance/harness.ts` in [convergence-1.md](convergence-1.md) section 12: inputs are `Step`s, outputs are `Reads`. No world shape appears here. Expected results are worked out by hand from the cited text and change only by a line in `conformance/expected-changes.log`.

**Machine-read.** The runner parses every table below whose first column header is `id`, and each ` ```scenario ` block. Columns:

- `R`: first round it applies.
- `kind`: `example`, `bounded` (exhaustive to a stated cap; truncated means inconclusive), `fault`.
- `src`: `order` exhaustive event orders; `table` the design's tables; `flow` real Checkout and desk flows; `lib` other libraries' tests and issues; `hostile`; `inject` fault injection.
- `cites`: rule, cell or decision ids, comma-separated, `no-decision` if none. A `no-decision` is a finding, reported on every run.
- `thin`: `*` means thinner than it looks; the note says how.

Round 1 scenarios are in full. Later ones are specified to the line their round expands, before writing code. Round 1 is deliberately small, because the `Harness` is unproven.

**Checks on every run of every scenario, not repeated below:** after each step `quiet()` obeys L3 (no waiting Attempt in an idle world, unless a `Held` lane names its owner); `issues()` has only what the scenario names; `replay().same` is true; each `requests()` entry with a key is one Attempt; each send has one ending.

---

## Round 1: Pay (14 + 1 search)

**Updated in round 2 with `conformance/expected-changes.log`; convergence-2 D29-D36.** Fixture: `conformance/fixtures/pay.compiled.ts`, see convergence-1 section 11. `A = { actor: "Checkout/Pay", id: "shopper-1" }`. Answers: `req_cap = { ok: { status: "requires_capture", clientSecret: "" } }`. All timers virtual. Fake server's `truth().charges` is keyed by idempotency key, and counts distinct keys, the oracle.

| id         | R   | kind    | src     | cites                                                                                                                                                                                                                                    | thin | what it shows                                                                                                      |
| ---------- | --- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| PAY-01     | 1   | example | flow    | rule:17, rule:21, cell:lane.commit.Idle, cell:lane.success.InFlight, sec:2.7.12, D4                                                                                                                                                      |      | `paidFirstTime`                                                                                                    |
| PAY-02     | 1   | example | flow    | rule:16, cell:lane.commit.InFlight, sec:2.7.1.NotSent                                                                                                                                                                                    |      | `doubleClicked`                                                                                                    |
| PAY-03     | 1   | example | flow    | rule:24, cell:lane.cancel.Held, cell:lane.unknown.InFlight                                                                                                                                                                               |      | `lostConfirm`, it applied                                                                                          |
| PAY-04     | 1   | example | flow    | rule:19, cell:lane.retry.Held, cell:lane.invoked.InFlight, S6                                                                                                                                                                            |      | `neverArrived`, same id                                                                                            |
| PAY-05     | 1   | example | table   | rule:18, sec:2.7.1.StillUnknown                                                                                                                                                                                                          |      | definite failure after unknown                                                                                     |
| PAY-06     | 1   | fault   | hostile | D8, D5, S4, rule:25                                                                                                                                                                                                                      |      | never-answering server, then the answer comes                                                                      |
| PAY-07     | 1   | example | flow    | rule:14, rule:15, rule:17                                                                                                                                                                                                                |      | `leaveMidCharge`: late ending voids                                                                                |
| PAY-08     | 1   | example | flow    | rule:46, cell:lane.restore.InFlight, S10, sec:2.7.15                                                                                                                                                                                     |      | `reloadDuringCharge`                                                                                               |
| PAY-09     | 1   | fault   | hostile | sec:2.7.1.NotSent, cell:lane.restore.InFlight, S7, rule:46                                                                                                                                                                               |      | reload before ack                                                                                                  |
| PAY-10     | 1   | fault   | inject  | cell:lane.storageRefused.InFlight, D30, S7                                                                                                                                                                                               |      | storage refuses, storage never answers                                                                             |
| PAY-11     | 1   | fault   | hostile | rule:12, F3, F6, D46, D50, sec:2.5                                                                                                                                                                                                       |      | throwing guard: origin named, ending kept, redelivered once                                                        |
| PAY-12     | 1   | fault   | inject  | rule:17, D5, D6, F2, S4                                                                                                                                                                                                                  | *    | defect, sync completion, duplicated completion, shuffled scheduler. _Thin: one seed list, S2's interleavings only_ |
| PAY-13     | 1   | fault   | hostile | D6, L5, cell:lane.runtimeDisposal.InFlight                                                                                                                                                                                               | *    | disposal with a hung uninterruptible commit. _Thin: no real finalizer_                                             |
| PAY-14     | 1   | example | order   | S11                                                                                                                                                                                                                                      |      | input-log replay across a whole paid path with a reload                                                            |
| PAY-16     | 1   | fault   | hostile | D5, rule:18, D8, cell:lane.storageRefused.InFlight, rule:16, D23, rule:46, D6, rule:22, rule:24, sec:2.7.1                                                                                                                               |      | Added in round 2: one case per mutant review H2 found surviving, and H3                                            |
| PAY-17     | 1   | fault   | inject  | D46, L5                                                                                                                                                                                                                                  |      | a hook's throw by input kind (H5), and a fatal core throw                                                          |
| PAY-18     | 1   | fault   | hostile | D30, S7, rule:46                                                                                                                                                                                                                         |      | M3: silence never says "not charged"                                                                               |
| PAY-19     | 1   | example | flow    | rule:15, rule:14                                                                                                                                                                                                                         |      | Pins P1 (H4): both orders                                                                                          |
| PAY-15     | 1   | example | table   | cell:lane.commit.Held, cell:lane.cancel.Idle, cell:lane.cancel.InFlight, cell:lane.idle.Idle, cell:lane.failure.InFlight, cell:lane.interrupt.InFlight, cell:lane.restore.Held, cell:lane.runtimeDisposal.Held, cell:lane.retryable.Held |      | Added in round 1 from the UNTESTED report: owed cells Pay can reach                                                |
| SEARCH-PAY | 1   | bounded | order   | L3, S6, S7, D29, D32                                                                                                                                                                                                                     | *    | below. _Thin: one actor, two intents; BFS on `stateHash`; the fake answers what the search picks_                  |

Scripts. `expect` compares only the fields named. Hand-derived from `pay.machine.ts`.

```scenario
id: PAY-01
steps:
  - ensure: A
  - send: [A, Start, { cartId: c1, intentId: pi1 }]         # expect state CARD
  - send: [A, PayRequested, { paymentMethodId: visa }]      # expect state PAYING; row(pay,pi1).pending true; requests(pay) = 0: waits for ack
  - storage: ack                                            # expect requests(pay) = 1, key k1
  - answer: [pay, req_cap]                                  # expect state PLACING; row(pay,pi1) undefined; requests(place) = 1 after its ack
  - storage: ack
  - answer: [place, { ok: { order: { orderId: o1 }, alreadyPlaced: false } }]
expect: { state: PAID, memory.receipt: { orderId: o1, afterUnsure: false, alreadyPlaced: false }, truth.charges: 1 }
```

```scenario
id: PAY-02
steps: [ensure A, Start, PayRequested, storage ack, PayRequested]
expect: { state: PAYING, requests(pay): 1, evidence(lane).last.cell: lane.commit.InFlight, memory.notice: "" }   # PayNotSent{Rejected}: the double click, guard keeps self
```

```scenario
id: PAY-03
steps:
  - [ensure A, Start, PayRequested, storage ack]
  - answer: [pay, { lostButLanded: req_cap }]               # expect state UNSURE; row.uncertain true; memory.afterUnsure true; truth.charges 1
  - advance: 3000                                           # expect requests(intent) = 1, requests(order) = 1
  - answer: [intent, { ok: { status: requires_capture } }]  # expect state PLACING; row(pay,pi1) undefined (released); evidence Released; requests(pay) still 1
  - answer: [order, { ok: null }]                           # root OrderSeen: self, no change
  - [storage ack, answer place ok]
expect: { state: PAID, memory.receipt.afterUnsure: true, truth.charges: 1 }
```

```scenario
id: PAY-04
steps:
  - [ensure A, Start, PayRequested, storage ack]
  - answer: [pay, { lost: true }]                           # expect UNSURE; truth.charges 0
  - advance: 3000
  - answer: [order, { ok: null }]
  - answer: [intent, { ok: { status: requires_payment_method } }]   # expect PAYING; requests(pay) = 2 after the capture; both keys equal
  - storage: ack
  - answer: [pay, req_cap]
expect: { state: PLACING, row(pay,pi1).retryCount-before-end: 1, truth.charges: 1, requests(pay).keys.distinct: 1, memory.afterUnsure: true }
```

```scenario
id: PAY-05
steps: [..PAY-04 to the re-send, answer pay fail CardDeclined]
expect: { state: UNSURE, row.uncertain: true, evidence(ending).last.reason: StillUnknown, memory.notice: unchanged }   # never "Declined": first send may have landed
```

```scenario
id: PAY-06
steps:
  - [ensure A, Start, PayRequested, storage ack]
  - answer: [pay, { never: true }]
  - advance: 8000                                           # expect PAYING; notice "Still confirming with your bank…"; row.pending
  - advance: 52000                                          # expect UNSURE; row.uncertain; evidence ending reason TimedOut; interrupt issued
  - fault: { lateAnswer: [pay, req_cap] }                   # server's answer finally arrives
expect: { state: UNSURE, row.uncertain: true, evidence(fence).length: 1, truth.charges: 1, endings(pay).length: 1 }   # no second ending; the next reconcile finds it
```

```scenario
id: PAY-07
steps:
  - [ensure A, Start, PayRequested, storage ack]
  - send: [A, Leave]                                        # expect LEFT; row(pay).pending still true; not cancelled (rule 44, D3 none)
  - answer: [pay, req_cap]                                  # late: root Confirmed, guard LEFT: requests(void) = 1 after ack
  - storage: ack
  - answer: [void, { ok: {} }]
expect: { state: LEFT, memory.notice: "The hold on your card was released.", memory.authorized: false }
```

```scenario
id: PAY-08
steps:
  - [ensure A, Start, PayRequested, storage ack]            # on the wire; server applies, answer lost with the page
  - reload: true                                            # process dies
expect-after-boot: { state: PAYING, row.uncertain: false }  # saved leaf, before delivery. Then, settled:
expect: { state: UNSURE, row.uncertain: true, evidence(ending).last.reason: Restored, requests(pay): 1, initial-calls: 0 }
then: [advance 3000, answer order null, answer intent requires_capture, storage ack, answer place ok]
expect-end: { state: PAID, truth.charges: 1 }
```

```scenario
id: PAY-09
steps: [ensure A, Start, PayRequested, reload]              # ack never came
expect: { requests(pay): 0, state: CARD, memory.notice: "Your payment wasn't sent. You haven't been charged.", truth.charges: 0, row: undefined }
```

```scenario
id: PAY-10
variants:
  refuse: { steps: [ensure A, Start, PayRequested, storage refuse], expect: { requests(pay): 0, state: CARD, evidence: StorageFailure } }
  hang:   { steps: [ensure A, Start, PayRequested, storage hang, advance 10000], expect: { requests(pay): 0, state: PAYING, row.pending: true, evidence: StorageSilent } }   # D30
```

```scenario
id: PAY-11
steps:
  - [ensure A, Start, PayRequested, storage ack]
  - fault: { throwIn: "states.PAYING.on.Confirmed[1].guard[0]", times: 1 }   # `capturable` throws during the next turn
  - answer: [pay, req_cap]
expect:
  state: PAYING                                             # the turn is refused
  row(pay,pi1): undefined                                   # the ending's cell is kept: the charge is resolved
  issues: [{ code: InvalidTurn, origin: "Checkout/Pay states.PAYING.on.Confirmed[1].guard[0]", input: { k: mail, event: Confirmed } }]
  next-send-works: true                                     # the Runtime is alive
```

```scenario
id: PAY-12
variants:
  defect:    { steps: [.., answer pay die boom], expect: { state: UNSURE, evidence.reason: Defect, issues: [Defect] } }
  sync:      { fixture: pay commit succeeds without yielding, expect: { state: PLACING, endings: 1, frames in order } }
  duplicate: { fault: { duplicateCompletion: pay }, expect: { endings: 1, evidence(fence): 1 } }
  shuffle:   { fault: { schedulerShuffle: [1..8] }, with: leave and cancel at each tick, two fibers, expect: { sends-with-exactly-one-ending: all, injections-with-a-live-fiber: > 0, picks-with-a-choice: > 0 } }
```

```scenario
id: PAY-13
steps: [ensure A, Start, PayRequested, storage ack, fault: { uninterruptibleHang: pay }, disposeRuntime, advance disposeMs]
expect: { disposed: true, evidence: AbandonedFiber, stored.lane(pay,pi1): present }  # next boot delivers Restored
```

```scenario
id: PAY-14
steps: [..PAY-08 to end]
expect: { replay.same: true, frames(seq).monotonic: true }
```

```scenario
id: SEARCH-PAY
alphabet: conformance/search/pay.search.ts, widened by review M2: storage refuse, hang, landNoAck; pay never, Busy; place lost; void; causal intent and order; a second intent; advance 60000
method: BFS on Reads.stateHash; stateless replay to reach each state (D32)
depth: 8
cap: { states, seconds; rss: 1.8GB by watch.ts }
oracles:
  - truth.charges(key) never more than 1 for a key, and requests(pay).keys.distinct never grows while row(pay,pi1).uncertain or pending    # S5, S6: never a new charge beside a doubtful one
  - a state of CARD with a reason "not charged" implies truth.charges = 0 for that attempt                                              # "never not charged"
  - no ack, no request                                                                                                                  # S7
  - each key has at most one ending per send
  - at depth end, after answering everything: a Held lane or terminal state, never a pending lane with nothing outstanding              # L3
report: completed | inconclusive(depth reached)
money (M2, independent of the design, at quiescence after drain): placed implies not voided; a placed order has a receipt; a charge is accounted for by a receipt, a void or a live hold; "not charged" implies not charged. Classes pinned to P1-P5 are reported, others fail
mutants-must-fail: [drop fence, retry mints a new id, invoke before ack, restore as NotSent when acknowledged]
```

The last line is the suite's check on itself: the runner applies each as a fault in a test build of the adapter. _If a mutant survives, the search has no teeth; that is a finding._

---

## Round 2: order across actors, the store

| id          | R   | kind    | src     | cites                                                                                                                                                                      | thin | scenario                                                                                                                                                                                                                                                        |
| ----------- | --- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORDER-01    | 2   | example | order   | D1, sec:2.10.17                                                                                                                                                            |      | `[a1,b1,a2]` runs in arrival order; head insert `x` on `a` runs right after `a1`                                                                                                                                                                                |
| ORDER-02    | 2   | bounded | order   | D1, L4                                                                                                                                                                     |      | all orders of 3 sends across 3 actors plus 2 completions: a person's order preserved per actor; same script, same frames                                                                                                                                        |
| ORDER-03    | 2   | example | table   | D2, sec:3.5                                                                                                                                                                |      | `send` from a subscriber queues, runs after notify; `send` in idle has published on return                                                                                                                                                                      |
| ORDER-04    | 2   | fault   | hostile | D35                                                                                                                                                                        |      | A sends B sends A: `TurnStorm`; page yields; `send` from another actor still lands                                                                                                                                                                              |
| ORDER-05    | 2   | example | table   | rule:27, sec:2.5, S8                                                                                                                                                       |      | one frame between settlement and admission: record confirmed, lane `pending`                                                                                                                                                                                    |
| LIKE-01     | 2   | example | flow    | D3, rule:29, rule:31, F1, sec:2.8.2                                                                                                                                        |      | **the like button**: `commit; unknown; repair; commit; retry`: finishes, last toggle wins                                                                                                                                                                       |
| LIKE-02     | 2   | example | order   | D3, S13, S1:b2-trace                                                                                                                                                       |      | S1's shortest `b2` cycle trace. Finishes                                                                                                                                                                                                                        |
| LIKE-03     | 2   | example | order   | D3, S1:f-trace                                                                                                                                                             |      | S1's two-lane trace. Finishes                                                                                                                                                                                                                                   |
| LIKE-04     | 2   | example | table   | D3, S5                                                                                                                                                                     |      | other actor's write behind a `Held` entry: not sent, row `waiting`, Inspection names the holder. Holder cancels: it goes                                                                                                                                        |
| LIKE-05     | 2   | example | order   | L2, S1:mint-order                                                                                                                                                          |      | `c`'s trace (`commit a0; invoke; commit a0; commit a1; end; invoke#2; end; invoke#1`): sent in mint order, last intent holds                                                                                                                                    |
| LIKE-06     | 2   | example | table   | sec:2.7.14, OD:20.F1, D55                                                                                                                                                  |      | released unknown lands after a newer write: stated limit. The mark clears, a repair runs, a later landing is silent until a read                                                                                                                                |
| SEARCH-LIKE | 2   | bounded | order   | L2, L3, S5, S13, D3                                                                                                                                                        | *    | stateless S1 sweep through the real runtime: 2 actors, 2 records, 3 commits, masks {1,2,3}, late landing on. _Thin: far fewer states than S1's model reached; S1's 33k states are not reachable by replay. Compare with its counts as a differential once only_ |
| STORE-01    | 2   | example | table   | rule:30, cell:store.success, D3                                                                                                                                            |      | success: confirmed fields replace; omitted `unconfirmed`                                                                                                                                                                                                        |
| STORE-02    | 2   | example | table   | cell:store.failure, rule:30, D3                                                                                                                                            |      | failure: removed, no repair, `uncertain` unchanged                                                                                                                                                                                                              |
| STORE-03    | 2   | example | table   | cell:store.unknown, D3                                                                                                                                                     |      | unknown: kept until repair, forced, mark set, entry stays (changed from 2.8.6's table)                                                                                                                                                                          |
| STORE-04    | 2   | example | table   | cell:notsent.Rejected, cell:notsent.Overloaded, cell:notsent.Superseded, cell:notsent.Cancelled, cell:notsent.Restored, cell:notsent.StorageRefused, cell:notsent.Disposed |      | 2.8.5's 8 rows, one variant each                                                                                                                                                                                                                                |
| STORE-05    | 2   | example | table   | rule:32, sec:2.8.6                                                                                                                                                         |      | what clears `uncertain`, per record and Attempt, in order of events                                                                                                                                                                                             |
| STORE-06    | 2   | example | table   | rule:35                                                                                                                                                                    |      | 65th write: `Overloaded`, no partial join across two records                                                                                                                                                                                                    |
| STORE-07    | 2   | fault   | hostile | D40                                                                                                                                                                        |      | forced repair never answers: a released entry leaves at 30 s; a live hold keeps its; mark stays                                                                                                                                                                 |
| STORE-08    | 2   | example | table   | rule:28                                                                                                                                                                    |      | one publication: lane row, prediction, queue join; no frame between                                                                                                                                                                                             |
| STORE-09    | 2   | example | table   | rule:38, rule:30, rule:46, D3                                                                                                                                              |      | predictions not persisted; restored unknown marks and repairs before ready                                                                                                                                                                                      |
| STORE-11    | 2   | example | table   | D39, cell:lane.cancel.InFlight, rule:30, D3                                                                                                                                |      | Added from the second author's survivors: re-send waits for repair; cancel a waiting re-send; StillUnknown keeps its place                                                                                                                                      |
| STORE-10    | 2   | example | flow    | rule:22, rule:28                                                                                                                                                           |      | `optimistic` reads after memory, captured at start, even if the start waits                                                                                                                                                                                     |
| CART-01     | 2   | example | flow    | rule:21, D3                                                                                                                                                                |      | Cart `waitsBehindUnsure` from `cart.story.ts`                                                                                                                                                                                                                   |
| CART-02     | 2   | example | flow    | rule:16, rule:29, D3                                                                                                                                                       |      | Cart `setQuantity` stepping (`quantity-stepper.trait.ts` flattened)                                                                                                                                                                                             |
| REFUND-01   | 2   | example | flow    | rule:30, rule:32, D43, D3                                                                                                                                                  |      | Refunds: held re-send shows `uncertain`                                                                                                                                                                                                                         |
| LIB-01      | 2   | example | lib     | D3                                                                                                                                                                         | *    | Query `mutations.test.tsx:431,540`: same scope serial, scopes parallel. _Titles read, not bodies_                                                                                                                                                               |
| LIB-02      | 2   | example | lib     | D3                                                                                                                                                                         | *    | DB `KeyScheduler.test.ts:106,226`: a later ready write does not pass an earlier retry; second runs after first retries and succeeds. _Titles read; DB's scheduler is one FIFO, so this is stricter than a record queue_                                         |
| LIB-03      | 2   | example | lib     | no-decision                                                                                                                                                                | *    | Query `mutations.test.tsx:1169`: removing one of two observers keeps the write. Finding: nothing says what two observers of one lane mean in Flow, since an actor owns it. _Maps loosely_                                                                       |
| DRV-01      | 2   | fault   | inject  | D5, D6, S4                                                                                                                                                                 |      | S2's scenario matrix, real driver: cancel and dispose at each tick, 8 seeds, every ending exactly once                                                                                                                                                          |
| DRV-02      | 2   | fault   | inject  | D6                                                                                                                                                                         |      | a command whose start throws: rest of the list runs; `Defect` ending                                                                                                                                                                                            |
| DRV-03      | 2   | fault   | inject  | D46                                                                                                                                                                        |      | fault in a module hook: core stands, module fails closed                                                                                                                                                                                                        |
| DRV-04      | 2   | example | lib     | no-decision                                                                                                                                                                | *    | XState `actor.test.ts:1300,1341`: sync completion during self-initialisation does not crash; here during `ensure`. Finding: `ensure` mid-drain order unstated. _Title read_                                                                                     |
| HOST-01     | 2   | fault   | hostile | S4:browser                                                                                                                                                                 | *    | S4's run: turn time on this runtime, Chromium, 6x throttle. _Not an acceptance test until a number is agreed. Output is a measurement_                                                                                                                          |

## Round 3: fragments

| id           | R   | kind    | src     | cites                                                                                    | thin | scenario                                                                                                                              |
| ------------ | --- | ------- | ------- | ---------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| FRAG-01      | 3   | example | flow    | rule:1, rule:9                                                                           |      | `.each`: removal, repair, re-add, one patch, raise into a new key                                                                     |
| FRAG-02      | 3   | example | flow    | rule:1, F3.2, D11, sec:2.5                                                               |      | `resetOn`: new incarnation, before-walk input, raise into the fresh one, pending reset's one snapshot, throw refuses                  |
| FRAG-03      | 3   | fault   | hostile | D35, rule:1                                                                              |      | `resetOn` oscillation stops at the follow-up bound with origin                                                                        |
| FRAG-04      | 3   | example | table   | rule:53, rule:54, sec:2.9.3                                                              |      | ending with no incarnation of the path parks; delivered on re-entry; in flight lands to the new copy; held delivers once              |
| FRAG-05      | 3   | example | table   | rule:54, rule:44, sec:2.7.13                                                             |      | delivery order: parked, then `Restored`                                                                                               |
| FRAG-06      | 3   | example | table   | rule:60, sec:2.9.3, D48                                                                  | *    | release on leave: wire, never sent, held, reload, re-add. _Thin: no `W` under release; no fixture has both_                           |
| FRAG-07      | 3   | example | table   | rule:51, rule:16                                                                         |      | member from another path: `Rejected`, `NothingToResend`, evidence                                                                     |
| FRAG-08      | 3   | example | table   | rule:44, OD:21, OD:22, cell:lane.rebind.Held                                             |      | dispose, unbound lane ends, ensure: ending delivered once, current, from active leaf; hold once; no return is evidence                |
| FRAG-09      | 3   | example | flow    | rule:44, rule:14, rule:18, rule:24                                                       |      | Pay `reloadWhileConfirming`, `webhookWins`, `voidLostRace`, `buyAgain`, guard ports on the real machine with its trait and subroutine |
| FRAG-10      | 3   | example | flow    | rule:6, rule:15, rule:14, rule:1                                                         |      | Pay `lateChallenge`, `lateWhilePaying`, `helpKeepsDeadline`: real 3-D Secure                                                          |
| FRAG-11      | 3   | example | flow    | rule:9, rule:51, rule:53, rule:30, D3                                                    |      | desk Comments: `postedInOrder`, an unconfirmed head, GiveUp, `deleteRefused`, A, B, A                                                 |
| FRAG-12      | 3   | example | table   | D15, OD:5                                                                                |      | unbound hold with a waiter yields at 5 min; bound hold never does; parked `Abandoned` delivered later                                 |
| FRAG-13      | 3   | example | table   | D21, sec:2.7.13                                                                          |      | local actor disposed holding: no adoption by a fresh one; record not blocked                                                          |
| FRAG-14      | 3   | example | table   | D22, rule:43                                                                             |      | `[O.x.cancel, O.x.cancel]` releases own Attempt and does nothing else                                                                 |
| FRAG-15      | 3   | bounded | order   | rule:53, rule:54, L3                                                                     | *    | parking and adoption orders over one fragment: enter, leave, end, reload. _Thin: memory-free handlers; depth 5 in the suite_          |
| FRAG-16      | 3   | fault   | inject  | F3, sec:2.5                                                                              |      | a `Denied` turn keeps the ending's cell and promotes                                                                                  |
| FRAG-17      | 3   | fault   | hostile | sec:2.5, rule:9, rule:7                                                                  |      | a child that cannot react refuses all; a raise into an absent key; schedule ends with the node; one publication                       |
| FRAG-18      | 3   | example | table   | rule:52, rule:1                                                                          |      | `.resumable()`: lookup interrupted and parked; schedule keeps due; reload while frozen                                                |
| FRAG-19      | 3   | example | table   | rule:46, rule:51, sec:2.9.4                                                              |      | copies and subject paths survive a reload; parked survives                                                                            |
| SEARCH-FRAG  | 3   | bounded | order   | rule:53, rule:54, L3                                                                     | *    | FRAG-15 at more depth. _Thin: one copy_                                                                                               |
| HIGH-01      | 3   | fault   | hostile | D45, cell:lane.restore.InFlight, cell:lane.storageRefused.InFlight, rule:18, rule:24, G1 |      | review H1: a restored Attempt is never "never sent"                                                                                   |
| HIGH-02      | 3   | fault   | hostile | D46, rule:46                                                                             |      | review H2: per-record restore, a value that cannot encode                                                                             |
| HIGH-03      | 3   | fault   | hostile | D46, rule:27                                                                             |      | review H3, H6: a user closure outside a turn                                                                                          |
| HIGH-04      | 3   | example | table   | D47, sec:2.8.6, rule:31, rule:32                                                         |      | review H4: a replayed response with a newer value in hand                                                                             |
| HIGH-04b     | 3   | example | table   | D47                                                                                      |      | the common path costs no read                                                                                                         |
| MED-01       | 3   | fault   | hostile | D48, rule:17, rule:24, cell:lane.cancel.InFlight                                         |      | review M1: the ack window                                                                                                             |
| MED-02       | 3   | example | table   | D49, D3, D40                                                                             |      | review M2: `RecordHeld`, row `stalled`                                                                                                |
| MED-03       | 3   | example | table   | D47, sec:2.7.9                                                                           |      | review M3: answer positions                                                                                                           |
| MED-04       | 3   | fault   | hostile | D49, D30                                                                                 |      | review M4: silence on the row                                                                                                         |
| MED-07       | 3   | fault   | hostile | D51, D40, D6                                                                             |      | review M7: module fibers have an owner                                                                                                |
| MED-08       | 3   | fault   | hostile | D46, rule:28                                                                             |      | review M8: a field function at the turn                                                                                               |
| SURV-01      | 3   | example | table   | rule:27, sec:2.8.4                                                                       |      | survivor: a late ending's store effect                                                                                                |
| SURV-02      | 3   | example | table   | rule:15                                                                                  |      | survivor: Held is not live work                                                                                                       |
| SURV-03      | 3   | example | table   | rule:44                                                                                  |      | survivor: restore order                                                                                                               |
| SURV-04      | 3   | fault   | inject  | rule:24, cell:lane.cancel.InFlight                                                       |      | survivor: cancel on a settled Attempt                                                                                                 |
| SURV-05      | 3   | fault   | hostile | D40                                                                                      |      | survivor: a stale repair answer                                                                                                       |
| SURV-06      | 3   | example | table   | sec:2.8.5, cell:lane.interrupt.InFlight                                                  |      | survivor: `Cancelled` forces a repair                                                                                                 |
| SURV-07      | 3   | fault   | hostile | cell:lane.runtimeDisposal.InFlight                                                       |      | survivor: disposal invokes nothing                                                                                                    |
| SURV-08      | 3   | fault   | hostile | rule:30, D3, cell:lane.runtimeDisposal.InFlight                                          |      | survivor: W's prediction at disposal                                                                                                  |
| SURV-09      | 3   | example | table   | rule:30, D3                                                                              |      | survivor: E18 shows nothing                                                                                                           |
| SURV-10      | 3   | example | table   | sec:2.8.6                                                                                |      | survivor: a carried field clears `unconfirmed`                                                                                        |
| SURV-11      | 3   | example | order   | D1                                                                                       |      | survivor: nested follow-ups                                                                                                           |
| STORE-12     | 3   | fault   | inject  | rule:30, D3, F3                                                                          |      | a Denied success still promotes                                                                                                       |
| SEARCH-CROSS | 3   | bounded | order   | D3, D45, D48, rule:17, rule:21, S5, S7, L3                                               | *    | the store crossed with persistence (review H5). _Thin: one fixture, no fragments_                                                     |

## Round 4: the review, real shapes

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| REV4-H1 | 4 | fault | hostile | D58, rule:31, sec:2.8.6 |  | review H1: a read overlapping a confirmed write |
| REV4-H2 | 4 | example | table | D59, rule:32, sec:2.8.6 |  | review H2: a success in doubt applies; the mark outlives a failed repair |
| REV4-H3 | 4 | fault | hostile | D57, D61, rule:46 |  | review H3: stored records this release cannot read, each booted twice |
| REV4-H4 | 4 | fault | hostile | D57, D46, rule:9 |  | review H4: odd values, one send each; a store's mapper of no shape |
| REV4-H5 | 4 | example | table | D57, rule:9, rule:23 |  | review H5: real keys; key order; object reset values |
| REV4-M1 | 4 | fault | hostile | D48, rule:29, rule:35 |  | review M1: a declined replacement |
| REV4-M2 | 4 | example | table | rule:1, rule:52 |  | review M2: freeze under a freeze |
| REV4-M3 | 4 | example | table | rule:9, rule:52, rule:60 |  | review M3, r60: a frozen copy removed |
| REV4-M4 | 4 | fault | hostile | D35, rule:8, rule:54 |  | review M4: adoption past the bound |
| REV4-M5 | 4 | fault | hostile | D50, rule:8 |  | review M5: a firing refused once |
| REV4-M7 | 4 | example | table | rule:9 |  | review M7: copies in the view |
| REV4-L1 | 4 | fault | inject | D46 |  | review L1: a hook that makes effects, then throws |
| REV4-L2 | 4 | example | table | rule:60 |  | review L2: a mark over a capture, W behind |
| REV4-L4 | 4 | example | table | D58, sec:2.8.6 |  | review L4: a read merges |
| REV4-S1 | 4 | example | table | rule:1, F12 |  | survivors: dueAt, re-entry |
| REV4-S2 | 4 | example | table | rule:14, rule:6, rule:52 |  | survivors: late at depth, pre-turn read, an ended lookup aborts |
| REAL-01 | 4 | example | flow | rule:6, rule:1, sec:2.9.2 |  | address.subroutine.ts as written |
| REAL-02 | 4 | example | flow | rule:6, rule:1, sec:2.9.2 |  | resolve-wizard shape: a nested subroutine, an exit that fills an exit |
| REAL-03 | 4 | example | flow | rule:9, rule:13, rule:23, rule:60, rule:51 |  | upload.trait.ts as written |
| REAL-04 | 4 | example | flow | rule:1, rule:52, rule:53, rule:54, D64 |  | panels.machine.ts, history.trait.ts as written |
| REAL-05 | 4 | example | flow | rule:21, rule:43, sec:2.8.6 |  | comments.trait.ts: pin and react |
| SEARCH-ODD-SMALL | 4 | bounded | hostile | D57 |  | SEARCH-ODD at depth 2, in the suite |
| SPIKE-01 | 4 | example | table | rule:68, rule:69, rule:71, T1:Connecting.live, T1:Live.value, T2:3, T3:filled | * | thin streams spike: first open, a value and its bookmark, one in mail. _Thin: no catchUp, `latest`, `listen`_ |
| SPIKE-02 | 4 | example | table | T2:6, T2:4, T2:2, T1:Live.fail, rule:71 | * | thin spike: reload, proof, drop, idle, server reset. _Thin: no catchUp, `latest`, `listen`_ |
| SPIKE-03 | 4 | example | table | T3:bookmark, T3:refetch, rule:71, F3 | * | thin spike: `O.x.bookmark`, `O.x.refetch` as members. _Thin: no catchUp, `latest`, `listen`_ |
| SPIKE-04 | 4 | example | table | T9, rule:70, rule:1, rule:52, D62 | * | thin spike: a session on an incarnation; reset, freeze, thaw, dispose. _Thin: no catchUp, `latest`, `listen`_ |
| SPIKE-05 | 4 | example | table | T1:Live.defect, D50, D46, D57, rule:8 | * | thin spike: refusals, a module's defect, an odd position. _Thin: no catchUp, `latest`, `listen`_ |

## Round 5: the review, real writes

Convergence-5. Fixtures: `desk.compiled.ts`, copied from the desk's domains (`predicts` with no `.one`, `revision`), `oddall.compiled.ts`.

| id | R | kind | src | cites | thin | what it shows |
| -- | --- | ---- | --- | ----- | ---- | ------------- |
| REV6-CAPTURE | 6 | example | table | D80, O3, O6 |  | plain writes coalesce; an awaited one is never coalesced |
| REV6-ENGINE | 6 | example | flow | D81 |  | a small sync engine behind the seam |
| REV6-H1 | 6 | example | flow | D74, D76, sec:2.8.6 |  | review H1: frames and successes before the first row |
| REV6-H2 | 6 | example | flow | D74, sec:2.8.6, rule:32 |  | review H2, L7: three ways to undo a confirmed fact |
| REV6-H3 | 6 | example | flow | D75, sec:2.8.6 |  | review H3: a version's order is declared |
| REV6-TWOFEEDS | 6 | example | flow | D74, sec:2.8.14 |  | two feeds on one entity |
| REV6-H4 | 6 | fault | hostile | D77, D46, D65 |  | review H4, M4, M11, L5: every closure gated |
| REV6-H5 | 6 | fault | hostile | D78, rule:17, rule:46 |  | review H5: a release that changes a key |
| REV6-H7 | 6 | example | table | D79, T1, T2, T6 |  | review H7, M5: a read that never answers; T6 in the runtime |
| REV6-STREAMS | 6 | example | table | D79, D71, T1, T3, T4 |  | review M1-M3, L2, L4, M13 |
| REV6-M7 | 6 | fault | hostile | D80, O5, O3 |  | review M7: a plain write can fail |
| REV6-TEAR | 6 | fault | hostile | D80, O3 |  | a store with no atomic batch |
| REV6-M8 | 6 | fault | hostile | D82, D50, O5 |  | review M8: restored memory |
| REV6-L3 | 6 | fault | hostile | D57, D61, rule:46 |  | review L3: stored names |
| REV5-H1 | 5 | fault | hostile | D65, D57, rule:12 |  | review H1: prototype names at every door, an event of no shape, an unknown machine |
| SEARCH-ODD-ALL | 5 | bounded | hostile | D65, D57 |  | every closure kind crossed with every odd value: by machine, not by value |
| REV5-H2 | 5 | fault | hostile | D65, D61, rule:46, P19 |  | review H2: a frozen ending of a removed operation, stored prototype names, junk in frozen |
| REV5-H3 | 5 | example | flow | D66, D59, sec:2.8.6 |  | review H3: writes with no carried response, from the real domains |
| REV5-H8 | 5 | example | flow | D67, sec:2.8.6 |  | review H8: the version decides; positions are the fallback |
| REV5-H5H6 | 5 | example | table | rule:54, rule:45, rule:17, C2, D72, D73 |  | review H5, H6, M13: rebind walks the tree; W behind a parked hold; a disposed identity sleeps |
| REV5-M1 | 5 | fault | hostile | D72, rule:44, rule:17 |  | review M1: a crash during recovery |
| REV5-M2 | 5 | example | table | rule:1, rule:9 |  | review M2: an `.each` under a pending reset |
| REV5-H4 | 5 | example | table | D68 |  | review H4: a stream and a read on one machine |
| REV5-SESS | 5 | example | table | rule:69, rule:70, rule:68, T1, T2:4, T3:bookmark, T3:filled, T9, D70 |  | review H7, H9, M3-M7: spike cases that can fail, with a slow close |
| REV5-S | 5 | example | table | rule:51, rule:15, D26, D50 |  | review's core survivors |
| STREAM5-PULL | 5 | example | table | D71, T4:every, rule:69 |  | a pulled source waits for the turn |
| STREAM5-REPAIR | 5 | example | table | T1:Repairing, T2:3, T2:6, T3:settle, T4:every, rule:71 |  | catchUp, Repairing, pages, stalls |
| STREAM5-LOSE | 5 | example | table | T1:Live.fail, T6, sec:2.11.10, T9 | * | Flapping, tags, Overflow, `when`. _Thin: T6's signal groups are not built_ |
| STREAM5-LISTEN | 5 | example | table | D67, T7, rule:72, sec:2.8.14 | * | frames on the version answer. _Thin: no cache; a gap reruns the read's commit; `current(r)` not published_ |
| STREAM5-LATEST | 5 | example | table | T5, T4:latest, rule:67 |  | `latest` |

## Round 5: streams

| id             | R   | kind    | src     | cites                                                                                                                                                | thin | scenario                                                                                                                                                                  |
| -------------- | --- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STREAM-01..15  | 99   | example | table   | T1:Connecting.live, T1:Live.value, T1:Dropped.value, T1:Live.fail, T2:1, T2:2, T2:3, T2:4, T2:5, T2:6, T2:7, T3:settle, T3:filled, T4:every, rule:71 |      | S5's 15 named scenarios as data; S5's expected results rechecked by a second reader, since four were corrected after a run                                                |
| STREAM-16      | 99   | example | table   | T2:6, D-T26                                                                                                                                          |      | row 6 all three branches, including `stalls ≥ 3`, which S5 did not run                                                                                                    |
| STREAM-17      | 99   | example | table   | T1:Live.defect, T1:Repairing.pagefail                                                                                                                |      | `end(Defect)`, page failure, `PageStalled`: absent from S5                                                                                                                |
| STREAM-18      | 99   | example | table   | T9, rule:70, I12                                                                                                                                     |      | second session waits for a releasing predecessor; 5 s `ReleaseOverdue`. S1 notes this wait unspecified in T1: must be resolved                                            |
| STREAM-19      | 99   | fault   | hostile | rule:69, T4:every                                                                                                                                    |      | flood: 100k values, pulled source: at most one in mail, a click is admitted within one cycle                                                                              |
| STREAM-20      | 99   | fault   | hostile | T6                                                                                                                                                   |      | pushed source past 2,048: `Overflow`, repair                                                                                                                              |
| STREAM-21      | 99   | fault   | hostile | no-decision                                                                                                                                          |      | frames reordered by an SDK: a value with an older position after a newer one. T3 says last delivered wins, may move back. Finding: list consumer shows order as delivered |
| STREAM-22      | 99   | fault   | hostile | T1:idle, sec:clock-jump                                                                                                                              | *    | wake from sleep: `idle` first, then a queued frame. Reconnect, over-replay, one notice. _Virtual clock; a real browser's order is unknown_                                |
| STREAM-23      | 99   | example | table   | T8                                                                                                                                                   |      | `progress` no turn, one row; superseded's is evidence; restore clears                                                                                                     |
| STREAM-24      | 99   | fault   | hostile | D5                                                                                                                                                   |      | frame from an old connection after a new one opened: fenced                                                                                                               |
| STREAM-25      | 99   | example | flow    | rule:67                                                                                                                                              |      | desk feed: `reset` → `restartAt`; presence `down`, `ChannelFailed`; technician pulse with finding 9's `Feed.live` order                                                   |
| STREAM-26      | 99   | example | flow    | rule:68                                                                                                                                              |      | assistant stream with Stop (2.11.12.5)                                                                                                                                    |
| STREAM-27      | 99   | example | table   | S15, rule:71                                                                                                                                         |      | **S15 check.** The seven 2.11.8 exceptions as scenarios. Three failing or requiring a new exception triggers fallback; that is the round's named question                 |
| SEARCH-SESSION | 99   | bounded | order   | T1, T4, S11                                                                                                                                          |      | drop, value, release, ping, clear over a session; depth 6                                                                                                                 |

## Round 6: rest of the surface

| id         | R   | kind    | src     | cites                                       | thin | scenario                                                                                                                                                      |
| ---------- | --- | ------- | ------- | ------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POLICY-01  | 99   | example | table   | cell:lane.*                                 |      | every reachable cell of the holding table, per holding policy (2.7.13: 33 per policy)                                                                         |
| POLICY-02  | 99   | example | table   | cell:lane.latest.replaceNeverSent, OD:20.F4 |      | `latest` replaces a never-sent head                                                                                                                           |
| POLICY-03  | 99   | example | table   | cell:cancel.*                               |      | `cancel` table, `HeldThisTurn`, `Held (parked)`; Checkout `reserveShipping`                                                                                   |
| POLICY-04  | 99   | example | table   | rule:35, cell:lane.serialize                |      | `serialize` FIFO, 65th `Overloaded`                                                                                                                           |
| CACHE-01   | 99   | example | flow    | no-decision                                 |      | Operations O2 cache: `.plan` only. Finding: the design is silent; read the plan and record conflicts                                                          |
| CACHE-02   | 99   | example | table   | rule:37, rule:42                            |      | reads carry confirmed data; replace latest                                                                                                                    |
| CTX-01     | 99   | example | table   | no-decision                                 | *    | diamond context update, one wave. _Runtime O5 is in a `.plan`; `lineage-trie.ts`'s requirement unread_                                                        |
| PERSIST-01 | 99   | fault   | hostile | F8, rule:46                                 |      | **S3:** IndexedDB, Chromium: per-record ack at 1 MiB scope; crash between lane and actor write restores either way                                            |
| PERSIST-02 | 99   | example | table   | rule:46, sec:2.7.15                         |      | a lane decodes, actor does not: fresh incarnation adopts                                                                                                      |
| PERSIST-03 | 99   | example | flow    | D20, P19                                    |      | changed key schema: `orphaned`; `orphaned: retry` re-sends                                                                                                    |
| PERSIST-04 | 99   | fault   | hostile | sec:2.7.13.idempotencyWindow                | *    | restored hold past the window: fake answers a new write. _Stated limit, only checks it is honest_                                                             |
| HOSTILE-01 | 99   | fault   | hostile | I1, Machines:O8, L4                         |      | 1,000 actors, 100 sends a second, one settlement: only readers of that record see a change; per-turn cost reported                                            |
| HOSTILE-02 | 99   | fault   | hostile | no-decision                                 |      | a long `.each` at 1,000 copies with keyed schedule under a stream: review 2.3's worry; reports cost, fails only past agreed budget. No budget exists: finding |
| HOSTILE-03 | 99   | fault   | hostile | Persistence:O7                              | *    | two tabs, one scope, one writer rule. _Fake only: no real tab_                                                                                                |

## Round 7: from real definitions

| id         | R   | kind    | src   | cites   | thin | scenario                                                                                                                              |
| ---------- | --- | ------- | ----- | ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CARRY-ALL  | 99 | example | flow  | all     |      | every scenario above, its fixture now produced by `compile`; diffs are findings                                                       |
| SIZE-01    | 99 | example | table | D9, F10 |      | budgets per entry point by `bun build --minify` plus gzip; core bundle contains no T1 cell label                                      |
| ENGINE-01  | 99 | example | table | D16     |      | `Store` over TanStack DB: Pay and likes work; stated tear is visible as one frame                                                     |
| ENGINE-02  | 99 | example | lib   | D16     | *    | Zero's `oooMutation` (`zero-client/.../mutation-tracker.test.ts:178`) reaches as an `unknown` or fatal? Finding pending. _Title read_ |
| CONVERT-01 | 99 | example | flow  | all     |      | Checkout end to end, one desk feature                                                                                                 |

## Round 8: world

| id         | R   | kind    | src     | cites                                                  | thin | scenario                                                                                          |
| ---------- | --- | ------- | ------- | ------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------- |
| STORY-ALL  | 99  | example | flow    | rule:58, rule:61, rule:62, rule:63                     |      | Checkout's and desk's Stories through a real executor                                             |
| BROWSER-01 | 99  | fault   | hostile | sec:2.10.2                                             |      | settle on Chromium, Firefox, Safari; timer throttling, tab freeze, wake                           |
| BROWSER-02 | 99  | example | flow    | no-decision                                            |      | React: 200 subscribers, one settlement, uSES tearing check under transitions. Review 2.3's item 3 |
| BROWSER-03 | 99  | fault   | hostile | no-decision                                            | *    | real `fetch` abort racing a landed response. _Only a sample of real behaviour_                    |
| BROWSER-04 | 99  | fault   | hostile | no-decision                                            |      | retained snapshots on a long-lived tab: heap slope                                                |
| SSR-01     | 99  | example | table   | cell:lane.ssrHydration.Idle, sec:2.10.11, CONVERSION:2 |      | `DehydrateCommitInFlight`; settle bound                                                           |

---

## Reports the runner prints

```text
UNTESTED     rule:47 no scenario       (scope: compile-time, flow check) | rule:12 cited | ...
OLD-RULE     PAY-06 cites rule:25: changed to D8, also cites D8: ok   | STORE-03 cites sec:2.8.6.E7: cut, no replacement cited: FLAG
NO-DECISION  LIB-03 DRV-04 CACHE-01 CTX-01 HOSTILE-02 BROWSER-02 BROWSER-03 BROWSER-04 STREAM-21
THIN         PAY-12 PAY-13 SEARCH-PAY ...
```

Compile-time rules (2-5, 10, 20, 45, 47, 50, 55-57) are expected in `UNTESTED` until round 6. It says so rather than hiding them.

## What is thinner than the catalog suggests, overall

- **Oracles.** Few oracles are independent of the design: charges at most once, last intent, no duplicate display. The rest compare against tables whose author is also this design. A wrong rule passes.
- **Stateless search** reaches less than a model's state hash; expect depth 6-8. It is not a proof.
- **Hand-written fixtures** until round 6 can pass on a format nothing can produce. Round 6 is when that is answered.
- **Virtual clock and fakes** to round 6. Nothing here has met a browser.
- **Other libraries' tests** were read by title and a few lines. Their bodies may not map.

## Round 7 (R7)

Convergence-7. Old unbuilt rows (`STREAM-*`, `POLICY-*`, `CACHE-*`, `CTX-*`, `PERSIST-*`, `HOSTILE-*`) renumbered to 99, as round 6's review asked, so `--round 7` can check cites. Fixture: `round7.compiled.ts`.

| id | R | kind | src | cites | thin | what it shows |
| -- | --- | ---- | --- | ----- | ---- | ------------- |
| REV7-H1 | 7 | fault | hostile | D83, O3, O5, O6 |  | review H1: a later write wins, whatever order answers come in; L2's backoff |
| REV7-M1 | 7 | example | table | D84, D80, O3 |  | review M1: a lane flushes now; a machine with no reconcile does not regress |
| REV7-D80 | 7 | example | table | D80, O3 |  | 5 s, hide flush, dispose flush, what a kill loses |
| REV7-M2 | 7 | fault | hostile | D87, O5, O4 |  | review M2: a read that hangs, fails or answers late; the queue's bound |
| REV7-M8 | 7 | fault | hostile | D88, rule:46, rule:17 |  | review M8: a quarantined lane holds its id |
| REV7-M9 | 7 | fault | hostile | D89, O5, D57 |  | review M9: encoding never fails a turn, and a skipped batch keeps its hold |
| REV7-EDGE | 7 | fault | hostile | D83, D80, D84, D89, D26 |  | the edge: the window from first dirty, hidden, frozen, clock back, loud, M2, H1, poison, no persistence, a store-wide hang |
| REV7-SEARCH-FAKE | 7 | example | hostile | D83 |  | the fake's late failure is late |
| REV7-CHAT | 7 | example | table | D80, D84 |  | a lane-free stream still coalesces |
| SEARCH-FLUSH | 7 | bounded | hostile | D80, D83, D84, D93, S6 |  | flush, late failure and kill as actions at any step; four oracles independent of the interval |
| SEARCH-CRASH | 7 | bounded | hostile | D83, O3, S6 |  | late-failing plain writes, kills: no second Attempt beside an undecided one |

## Round 8 (R8)

Convergence-8. Old unbuilt rows (`STORY-ALL`, `BROWSER-*`, `SSR-01`) renumbered to 99, as round 7 did, so `--round 8` can check cites. Fixture: `round8.compiled.ts`.

| id | R | kind | src | cites | thin | what it shows |
| -- | --- | ---- | --- | ----- | ---- | ------------- |
| REV8-H1 | 8 | fault | hostile | D96, D26, O6 |  | review H1: a plain write beside a ticket; a head on disk may have been sent; `W` stays `NotSent`; a refusal leaves no hold |
| REV8-M2 | 8 | fault | hostile | D97, D80 |  | review M2: an answer to a hidden page issues at once; backoff still holds |
| REV8-FATAL | 8 | fault | hostile | D98 |  | a fatal with mail left and a batch pending does not spin; the batch lands |
| REV8-M3 | 8 | fault | hostile | D99 |  | review M3: a boot lost apart from its records repeats no id; a read reaches its own copy |
| REV8-M9 | 8 | fault | hostile | D100, O5 |  | review M9's doors: a guard key denies, a lookup ends failed, a module value drops, a member's key does nothing |
| REV8-KEPT | 8 | fault | hostile | D109, D50 |  | review M4: a refused ending is kept, named, delivered at the next boot; a read's is a stranded wait |
| REV8-STORM | 8 | fault | hostile | D110, D122 |  | review M5: a failure with no I/O and a handler that asks again yields each slice, and is named; a press goes beside it |
| REV8-WIPE | 8 | fault | hostile | D106, O6 |  | a wiped origin and a hold, in both key forms |
| REV8-PINS | 8 | fault | hostile | D102, D80, D84, D88, D72, D83, D89, D29, L6 |  | survivors of the round 7 reviews: hide on two actors, after-drain, poison's lanes, and every survivor reported twice |
| REV9-M1 | 9 | fault | hostile | D114, D109 |  | review M1: a decline carries its input; a refused `NotSent` is parked, not read as a hold; a hold parks nothing |
| REV9-BURST | 9 | fault | hostile | D115, H1 |  | review H1, M4: 300 sends, 300 rows, a queue over a local source, a clock set back: all end, no storm |
| REV9-LOOP | 9 | fault | hostile | D122, H1, M1, M2 |  | a spin over any answer never freezes the page; a correct bulk needs no timer; failure is not a spin; another actor is not delayed; a press, a kill, a dispose and a freeze end it |
| REV9-EDGE | 9 | fault | hostile | D123, M3, M4, M5 |  | what a turn refused twice stays with what owes it and ends with that: key-less guards and cancels, declines on their own key, one try per boot, local lives, stranded by life |
| REV9-KEPT | 9 | fault | hostile | D118, D109, D50 |  | review M2, M3: a refused deadline stays on the record; a kept ending is on the row, blocks its key, can be let go; a raise with no name; a refused turn's commands |
| REV9-STREAM | 9 | fault | hostile | D118, D50 |  | review M2: a stream's failure no turn could take is a stranded wait |
| REV9-NAMES | 9 | fault | hostile | D119, D108, M5 |  | review M5: a bigint names a lane and a reset; it still cannot be carried; two values with no name are one |
| FRAG-20 | 3 | example | table | rule:60, rule:14, rule:15, D15, D21, D46, rule:1, rule:17 |  | a freeze is an ending, not a release; an actor record that does not parse |
| FRAG-21 | 10 | example | table | rule:51, rule:53 |  | two live copies, a failure on the second reaches only it (D164) |
| FRAG-22 | 10 | example | table | rule:51, rule:53, rule:14 |  | two actors of one machine, three copies each: each ending reaches its own actor and copy, also beside another copy's turn in one batch (D169) |
| FRAG-23 | 10 | example | table | rule:51, rule:53, rule:14 |  | equal views: actors with equal memory in one state and in two states, two equal copies, and an ending beside the suite's own send of its event; each lands in its own incarnation (D173, D174) |
| R10-BOOT-ROWS | 10 | fault | hostile | rule:44, D82, D72 |  | two rows of one machine reload with a write in flight each, once through a compiled `memory.restore` and once through the runtime's own branch for none: each restored ending reaches its own row, placed after the boot (D176, D177) |
| R10-BOOT-STATE | 10 | fault | hostile | rule:44, rule:14, D176 |  | two rows reload with a write in flight each; one moved to another state while its write was out. Each restored unknown takes its row's current state's handler, and the boot's state check sees it (D180, D182) |
| R10-BOOT-ORDER | 10 | fault | hostile | rule:44, rule:54, O4 |  | two rows reload with a write in flight each while the store loads slowly; a send to one and a dispose of the other wait for the load. Each row hears its restored ending first, and (j) judges a restored ending at the boot, so a waiting dispose stepped first is red (D184, D186) |
| FRAG-24 | 10 | example | table | rule:44, rule:53, D176 |  | two `.each` copies of one actor reload with a write in flight each; each restored unknown runs in its own copy, placed by the serial the Host's decode minted (D181, D182) |
| PAY-20 | 10 | fault | hostile | D145, rule:19 |  | a server as strict as Stripe's: a 500 that landed and replays, a key the server pruned |
| R10-PINS | 10 | fault | hostile | D123, rule:51 |  | review part two's survivors pinned: a host's cancel and a frozen life's kept ending |
| R10-RUNTIME | 10 | fault | hostile | D136, D137, D138, D139, D140, D141 |  | the slice's bill, one notify per task, one machine per key, reserved state names, values with no form, a linear burst, a hash of values |
| R10-AUDIT | 10 | fault | hostile | D8, rule:25 |  | re-audit M3: a timer cancel that loses the race fires under a newer timer's key, and is fenced |
| R10-AUDIT-ENDINGS | 10 | fault | hostile | rule:44, D125 |  | re-audit H1: a failure to a live actor beside another actor's mail is heard, not evidence |
| R10-AUDIT-READS | 10 | fault | hostile | rule:52 |  | re-audit M3: disposing the runtime aborts a read in flight at the server |
| R12-KEYS | 12 | fault | hostile | D78, rule:39, rule:46 |  | round 11 review M5: a typed release that changes the key's fields rekeys a held lane and mints nothing beside it; one that adds a key field the stored input lacks keeps the lane |
| R12-MEMORY | 12 | fault | hostile | D82, D89 |  | round 11 review Q1: a Date, a NaN and a bigint in typed memory survive a reload, through the fields' codecs |
| R12-SERVICES | 12 | fault | hostile | rule:57 |  | round 11 review L2: two machines whose commits need different services boot together, and both writes leave |
| R12-DEFECT | 12 | fault | hostile | rule:13 |  | round 11 review H1: a commit that dies raises a Defect issue that names its cause |
| R12-DOORS | 12 | fault | hostile | D82, D46, rule:44 |  | mid review M3: an input its Schema refuses makes no actor; a release-added computed field restores computed; a release-added required input quarantines the record and keeps its bytes |
| R12-BOOT | 12 | fault | hostile | rule:57 |  | mid review M3: a boot that does not give a machine's service is refused at the seal, by name |
| R13-KEYS | 13 | fault | hostile | D221, D217, D78, rule:39, rule:46, rule:16 |  | round 12 review H1, round 13 mid review H1, M1, M4: a release that changes an op's key fields leaves old-version holds, never renamed; every commit declines beside one, under reject and serialize, across reloads; its own old key reaches it; a field removed with two holds in either mint order keeps both; another actor and no release are untouched |
| R13-DEFAULTS | 13 | fault | hostile | D222, D219, D214, D46 |  | round 13 mid review M2: a field's one default, constructor or decoding, applies at creation and at restore alike |
| LIFE-01 | 14 | example | proposal | lifetime:work-is-a-use, lifetime:persisted-keeps-record |  | actor-lifetime (PROPOSED): a persisted actor whose last use ends mid-charge stays, hears its endings in the same life, and goes with its record kept once both lanes settle |
| LIFE-02 | 14 | example | proposal | lifetime:work-is-a-use, lifetime:non-persisted-is-gone |  | actor-lifetime (PROPOSED): a non-persisted actor stays while its write is out and is gone, nothing kept, once it lands or at once when idle |
| LIFE-03 | 14 | example | proposal | lifetime:send-restores, lifetime:persisted-keeps-record |  | actor-lifetime (PROPOSED): a send to an absent persisted target restores it from its record and delivers in order; idle again, it goes again |
| LIFE-04 | 14 | example | proposal | lifetime:after-the-commit, lifetime:uses-are-counted |  | actor-lifetime (PROPOSED): a detach and an attach in one host task dispose nothing; one of two uses ending keeps the actor |
| LIFE-05 | 14 | example | proposal | lifetime:work-is-a-use, rule:53 |  | actor-lifetime (PROPOSED): an ending parked for a removed copy's path keeps its unused actor until a copy of the path takes it |
