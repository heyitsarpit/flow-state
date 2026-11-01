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

Fixture: `conformance/fixtures/pay.compiled.ts`, see convergence-1 section 11. `A = { actor: "Checkout/Pay", id: "shopper-1" }`. Answers: `req_cap = { ok: { status: "requires_capture", clientSecret: "" } }`. All timers virtual. Fake server's `truth().charges` is keyed by idempotency key, and counts distinct keys, the oracle.

| id | R | kind | src | cites | thin | what it shows |
| --- | --- | --- | --- | --- | --- | --- |
| PAY-01 | 1 | example | flow | rule:17, rule:21, cell:lane.commit.Idle, cell:lane.success.InFlight, sec:2.7.12, D2, D4 | | `paidFirstTime` |
| PAY-02 | 1 | example | flow | rule:16, cell:lane.commit.InFlight, sec:2.7.1.NotSent | | `doubleClicked` |
| PAY-03 | 1 | example | flow | rule:24, cell:lane.cancel.Held, cell:lane.unknown.InFlight, rule:18, D23 | | `lostConfirm`, it applied |
| PAY-04 | 1 | example | flow | rule:19, cell:lane.retry.Held, cell:lane.invoked.InFlight, S6 | | `neverArrived`, same id |
| PAY-05 | 1 | example | table | rule:18, sec:2.7.1.StillUnknown | | definite failure after unknown |
| PAY-06 | 1 | fault | hostile | D8, D5, S4, rule:25 | | never-answering server, then the answer comes |
| PAY-07 | 1 | example | flow | rule:14, rule:15, rule:17 | | `leaveMidCharge`: late ending voids |
| PAY-08 | 1 | example | flow | rule:38, rule:46, cell:lane.restore.InFlight, S10, sec:2.7.15 | | `reloadDuringCharge` |
| PAY-09 | 1 | fault | hostile | sec:2.7.1.NotSent, cell:lane.restore.InFlight, S7, rule:38 | | reload before ack |
| PAY-10 | 1 | fault | inject | cell:lane.storageRefused.InFlight, D14, S7 | | storage refuses, storage never answers |
| PAY-11 | 1 | fault | hostile | rule:12, F3, F6, D10, sec:2.5.1 | | throwing guard: origin named, ending kept |
| PAY-12 | 1 | fault | inject | rule:17, D5, D6, F2, S4 | * | defect, sync completion, duplicated completion, shuffled scheduler. *Thin: one seed list, S2's interleavings only* |
| PAY-13 | 1 | fault | hostile | D6, L5, cell:lane.runtimeDisposal.InFlight | * | disposal with a hung uninterruptible commit. *Thin: no real finalizer* |
| PAY-14 | 1 | example | order | S11, D1 | | input-log replay across a whole paid path with a reload |
| SEARCH-PAY | 1 | bounded | order | L3, S4, S5, S6, S7, S11, rule:17, rule:19 | * | below. *Thin: one actor, one intent; depth 8; replay per script* |

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
  hang:   { steps: [ensure A, Start, PayRequested, storage hang, advance 10000], expect: { requests(pay): 0, state: CARD, evidence: StorageFailure } }
```

```scenario
id: PAY-11
steps:
  - [ensure A, Start, PayRequested, storage ack]
  - fault: { throwIn: "on.Confirmed[1].guard[1]", times: 1 }   # `capturable` throws during the next turn
  - answer: [pay, req_cap]
expect:
  state: PAYING                                             # the turn is refused
  row(pay,pi1): undefined                                   # the ending's cell is kept: the charge is resolved
  issues: [{ code: InvalidTurn, origin: "Checkout/Pay on.Confirmed[1].guard[1]", input: { k: mail, event: Confirmed } }]
  next-send-works: true                                     # the Runtime is alive
```

```scenario
id: PAY-12
variants:
  defect:    { steps: [.., answer pay die boom], expect: { state: UNSURE, evidence.reason: Defect, issues: [Defect] } }
  sync:      { fixture: pay commit succeeds without yielding, expect: { state: PLACING, endings: 1, frames in order } }
  duplicate: { fault: { duplicateCompletion: pay }, expect: { endings: 1, evidence(fence): 1 } }
  shuffle:   { fault: { schedulerShuffle: [1..8] }, with: leave and cancel at each tick, expect: { sends-with-exactly-one-ending: all } }
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
alphabet: [PayRequested, Leave, Start, "advance 3000", "storage ack", "answer pay ok", "answer pay lost", "answer pay lostButLanded", "answer pay CardDeclined", "answer intent requires_capture", "answer intent requires_payment_method", "answer place ok", reload]
depth: 8
cap: { scripts: 200000, rss: 1.8GB }
oracles:
  - truth.charges(key) never more than 1 for a key, and requests(pay).keys.distinct never grows while row(pay,pi1).uncertain or pending    # S5, S6: never a new charge beside a doubtful one
  - a state of CARD with a reason "not charged" implies truth.charges = 0 for that attempt                                              # "never not charged"
  - no ack, no request                                                                                                                  # S7
  - each key has at most one ending per send
  - at depth end, after answering everything: a Held lane or terminal state, never a pending lane with nothing outstanding              # L3
report: completed | inconclusive(depth reached)
mutants-must-fail: [drop fence, retry mints a new id, invoke before ack, restore as NotSent when acknowledged]
```

The last line is the suite's check on itself: the runner applies each as a fault in a test build of the adapter. *If a mutant survives, the search has no teeth; that is a finding.*

---

## Round 2: order across actors, the store

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| ORDER-01 | 2 | example | order | D1, sec:2.10.17.5 | | `[a1,b1,a2]` runs in arrival order; head insert `x` on `a` runs right after `a1` |
| ORDER-02 | 2 | bounded | order | D1, L4 | | all orders of 3 sends across 3 actors plus 2 completions: a person's order preserved per actor; same script, same frames |
| ORDER-03 | 2 | example | table | D2, sec:3.5 | | `send` from a subscriber queues, runs after notify; `send` in idle has published on return |
| ORDER-04 | 2 | fault | hostile | D13 | | A sends B sends A: `TurnStorm`; page yields; `send` from another actor still lands |
| ORDER-05 | 2 | example | table | rule:27, sec:2.5 | | one frame between settlement and admission: record confirmed, lane `pending` |
| LIKE-01 | 2 | example | flow | D3, rule:29, rule:31, F1, sec:2.8.2 | | **the like button**: `commit; unknown; repair; commit; retry`: finishes, last toggle wins |
| LIKE-02 | 2 | example | order | D3, S13, S1:b2-trace | | S1's shortest `b2` cycle trace. Finishes |
| LIKE-03 | 2 | example | order | D3, S1:f-trace | | S1's two-lane trace. Finishes |
| LIKE-04 | 2 | example | table | D3, S5 | | other actor's write behind a `Held` entry: not sent, row `waiting`, Inspection names the holder. Holder cancels: it goes |
| LIKE-05 | 2 | example | order | L2, S1:mint-order | | `c`'s trace (`commit a0; invoke; commit a0; commit a1; end; invoke#2; end; invoke#1`): sent in mint order, last intent holds |
| LIKE-06 | 2 | example | table | sec:2.7.14, OD:20.F1 | | released unknown lands after a newer write: stated limit, record `uncertain` stays, contested repair |
| SEARCH-LIKE | 2 | bounded | order | L2, L3, S5, S13, rule:17 | * | stateless S1 sweep through the real runtime: 2 actors, 2 records, 3 commits, masks {1,2,3}, late landing on. *Thin: far fewer states than S1's model reached; S1's 33k states are not reachable by replay. Compare with its counts as a differential once only* |
| STORE-01 | 2 | example | table | rule:30, cell:store.success | | success: confirmed fields replace; omitted `unconfirmed` |
| STORE-02 | 2 | example | table | cell:store.failure | | failure: removed, no repair, `uncertain` unchanged |
| STORE-03 | 2 | example | table | cell:store.unknown, D3 | | unknown: kept until repair, forced, mark set, entry stays (changed from 2.8.6's table) |
| STORE-04 | 2 | example | table | cell:notsent.Rejected, cell:notsent.Overloaded, cell:notsent.Superseded, cell:notsent.Cancelled, cell:notsent.Restored, cell:notsent.StorageRefused, cell:notsent.Disposed | | 2.8.5's 8 rows, one variant each |
| STORE-05 | 2 | example | table | rule:32, sec:2.8.6.E3 | | what clears `uncertain`, per record and Attempt, in order of events |
| STORE-06 | 2 | example | table | rule:35 | | 65th write: `Overloaded`, no partial join across two records |
| STORE-07 | 2 | fault | hostile | D12 | | forced repair never answers: queue released at 30 s, mark stays |
| STORE-08 | 2 | example | table | rule:28 | | one publication: lane row, prediction, queue join; no frame between |
| STORE-09 | 2 | example | table | rule:38, rule:30 | | predictions not persisted; restored unknown marks and repairs before ready |
| STORE-10 | 2 | example | flow | rule:36, rule:22 | | `optimistic` reads after memory, captured at start, even if the start waits |
| CART-01 | 2 | example | flow | rule:21, D3 | | Cart `waitsBehindUnsure` from `cart.story.ts` |
| CART-02 | 2 | example | flow | rule:16, rule:29 | | Cart `setQuantity` stepping (`quantity-stepper.trait.ts` flattened) |
| REFUND-01 | 2 | example | flow | rule:30, rule:32 | | Refunds: held re-send shows `uncertain` |
| LIB-01 | 2 | example | lib | D3 | * | Query `mutations.test.tsx:431,540`: same scope serial, scopes parallel. *Titles read, not bodies* |
| LIB-02 | 2 | example | lib | D3 | * | DB `KeyScheduler.test.ts:106,226`: a later ready write does not pass an earlier retry; second runs after first retries and succeeds. *Titles read; DB's scheduler is one FIFO, so this is stricter than a record queue* |
| LIB-03 | 2 | example | lib | no-decision | * | Query `mutations.test.tsx:1169`: removing one of two observers keeps the write. Finding: nothing says what two observers of one lane mean in Flow, since an actor owns it. *Maps loosely* |
| DRV-01 | 2 | fault | inject | D5, D6, S4 | | S2's scenario matrix, real driver: cancel and dispose at each tick, 8 seeds, every ending exactly once |
| DRV-02 | 2 | fault | inject | D6 | | a command whose start throws: rest of the list runs; `Defect` ending |
| DRV-03 | 2 | fault | inject | D10 | | fault in a module hook: step aborted, value kept |
| DRV-04 | 2 | example | lib | no-decision | * | XState `actor.test.ts:1300,1341`: sync completion during self-initialisation does not crash; here during `ensure`. Finding: `ensure` mid-drain order unstated. *Title read* |
| HOST-01 | 2 | fault | hostile | S4:browser | * | S4's run: turn time on this runtime, Chromium, 6x throttle. *Not an acceptance test until a number is agreed. Output is a measurement* |

## Round 3: fragments

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| FRAG-01 | 3 | example | flow | rule:1, rule:9 | | `.each` copy removed by list repair, whenAbandoned runs once |
| FRAG-02 | 3 | example | flow | rule:1, F3.2, D11 | | `resetOn` changes: new incarnation; re-check in P7; a throwing one is `InvalidTurn` |
| FRAG-03 | 3 | fault | hostile | D13, rule:1 | | `resetOn` oscillation stops at the follow-up bound with origin |
| FRAG-04 | 3 | example | table | rule:53, cell:lane.parkingCondition, sec:2.9.3 | | ending with no incarnation of the path parks; delivered on re-entry, mapped by current `outcomes` |
| FRAG-05 | 3 | example | table | rule:54, sec:2.7.13.deliveryOrder | | delivery order: parked, `Restored`, external; pending reset first |
| FRAG-06 | 3 | example | table | rule:60, cell:releasing.mark.InFlight, cell:releasing.mark.Held | | release on leave: all 15 cells, per variant |
| FRAG-07 | 3 | example | table | rule:51 | | member from another path: `Rejected`, `NothingToResend`, evidence |
| FRAG-08 | 3 | example | table | rule:44, OD:21, OD:22, cell:lane.rebind.Held | | dispose, unbound lane ends, ensure: ending delivered once, current, from active leaf |
| FRAG-09 | 3 | example | flow | rule:44, rule:14 | | Pay `reloadWhileConfirming`, `webhookWins`, `voidLostRace` on the real machine with its trait and subroutine |
| FRAG-10 | 3 | example | flow | rule:6, rule:15 | | Pay `lateChallenge`, `lateWhilePaying`, `helpKeepsDeadline`: real 3-D Secure |
| FRAG-11 | 3 | example | flow | rule:9 | | desk Comments: `postedInOrder`, `deleteRefused` |
| FRAG-12 | 3 | example | table | D15, OD:5 | | unbound hold with a waiter yields at 5 min; bound hold never does; parked `Abandoned` delivered later |
| FRAG-13 | 3 | example | table | D21, sec:G4 | | local actor disposed holding: no adoption by a fresh one; record not blocked |
| FRAG-14 | 3 | example | table | D22, rule:43 | | `[O.x.cancel, O.x.cancel]` releases own Attempt and does nothing else |
| FRAG-15 | 3 | bounded | order | S1:system, L3, rule:53, rule:54 | * | parking and adoption orders over one fragment: enter, leave, end, reload. *Thin: memory-free handlers, as `lane-model/system.ts`* |
| FRAG-16 | 3 | fault | inject | F3.1, sec:2.5 | | a `Denied` turn keeps the ending's cell and promotes; `InvalidTurn` does too; members dropped |

## Round 4: streams

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| STREAM-01..15 | 4 | example | table | T1:Connecting.live, T1:Live.value, T1:Dropped.value, T1:Live.fail, T2:1, T2:2, T2:3, T2:4, T2:5, T2:6, T2:7, T3:settle, T3:filled, T4:every, rule:71 | | S5's 15 named scenarios as data; S5's expected results rechecked by a second reader, since four were corrected after a run |
| STREAM-16 | 4 | example | table | T2:6, D-T26 | | row 6 all three branches, including `stalls ≥ 3`, which S5 did not run |
| STREAM-17 | 4 | example | table | T1:Live.defect, T1:Repairing.pagefail | | `end(Defect)`, page failure, `PageStalled`: absent from S5 |
| STREAM-18 | 4 | example | table | T9, rule:70, I12 | | second session waits for a releasing predecessor; 5 s `ReleaseOverdue`. S1 notes this wait unspecified in T1: must be resolved |
| STREAM-19 | 4 | fault | hostile | rule:69, T4:every | | flood: 100k values, pulled source: at most one in mail, a click is admitted within one cycle |
| STREAM-20 | 4 | fault | hostile | T6 | | pushed source past 2,048: `Overflow`, repair |
| STREAM-21 | 4 | fault | hostile | no-decision | | frames reordered by an SDK: a value with an older position after a newer one. T3 says last delivered wins, may move back. Finding: list consumer shows order as delivered |
| STREAM-22 | 4 | fault | hostile | T1:idle, sec:clock-jump | * | wake from sleep: `idle` first, then a queued frame. Reconnect, over-replay, one notice. *Virtual clock; a real browser's order is unknown* |
| STREAM-23 | 4 | example | table | T8 | | `progress` no turn, one row; superseded's is evidence; restore clears |
| STREAM-24 | 4 | fault | hostile | D5 | | frame from an old connection after a new one opened: fenced |
| STREAM-25 | 4 | example | flow | rule:67 | | desk feed: `reset` → `restartAt`; presence `down`, `ChannelFailed`; technician pulse with finding 9's `Feed.live` order |
| STREAM-26 | 4 | example | flow | rule:68 | | assistant stream with Stop (2.11.12.5) |
| STREAM-27 | 4 | example | table | S15, rule:71 | | **S15 check.** The seven 2.11.8 exceptions as scenarios. Three failing or requiring a new exception triggers fallback; that is the round's named question |
| SEARCH-SESSION | 4 | bounded | order | T1, T4, S11 | | drop, value, release, ping, clear over a session; depth 6 |

## Round 5: rest of the surface

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| POLICY-01 | 5 | example | table | cell:lane.* | | every reachable cell of the holding table, per holding policy (2.7.13: 33 per policy) |
| POLICY-02 | 5 | example | table | cell:lane.latest.replaceNeverSent, OD:20.F4 | | `latest` replaces a never-sent head |
| POLICY-03 | 5 | example | table | cell:cancel.* | | `cancel` table, `HeldThisTurn`, `Held (parked)`; Checkout `reserveShipping` |
| POLICY-04 | 5 | example | table | rule:35, cell:lane.serialize | | `serialize` FIFO, 65th `Overloaded` |
| CACHE-01 | 5 | example | flow | no-decision | | Operations O2 cache: `.plan` only. Finding: the design is silent; read the plan and record conflicts |
| CACHE-02 | 5 | example | table | rule:37, rule:42 | | reads carry confirmed data; replace latest |
| CTX-01 | 5 | example | table | no-decision | * | diamond context update, one wave. *Runtime O5 is in a `.plan`; `lineage-trie.ts`'s requirement unread* |
| PERSIST-01 | 5 | fault | hostile | F8, rule:46 | | **S3:** IndexedDB, Chromium: per-record ack at 1 MiB scope; crash between lane and actor write restores either way |
| PERSIST-02 | 5 | example | table | rule:46, sec:2.7.15 | | a lane decodes, actor does not: fresh incarnation adopts |
| PERSIST-03 | 5 | example | flow | D20, P19 | | changed key schema: `orphaned`; `orphaned: retry` re-sends |
| PERSIST-04 | 5 | fault | hostile | sec:2.7.13.idempotencyWindow | * | restored hold past the window: fake answers a new write. *Stated limit, only checks it is honest* |
| HOSTILE-01 | 5 | fault | hostile | I1, Machines:O8, L4 | | 1,000 actors, 100 sends a second, one settlement: only readers of that record see a change; per-turn cost reported |
| HOSTILE-02 | 5 | fault | hostile | no-decision | | a long `.each` at 1,000 copies with keyed schedule under a stream: review 2.3's worry; reports cost, fails only past agreed budget. No budget exists: finding |
| HOSTILE-03 | 5 | fault | hostile | Persistence:O7 | * | two tabs, one scope, one writer rule. *Fake only: no real tab* |

## Round 6: from real definitions

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| CARRY-ALL | 6 | example | flow | all | | every scenario above, its fixture now produced by `compile`; diffs are findings |
| SIZE-01 | 6 | example | table | D9, F10 | | budgets per entry point by `bun build --minify` plus gzip; core bundle contains no T1 cell label |
| ENGINE-01 | 6 | example | table | D16 | | `Store` over TanStack DB: Pay and likes work; stated tear is visible as one frame |
| ENGINE-02 | 6 | example | lib | D16 | * | Zero's `oooMutation` (`zero-client/.../mutation-tracker.test.ts:178`) reaches as an `unknown` or fatal? Finding pending. *Title read* |
| CONVERT-01 | 6 | example | flow | all | | Checkout end to end, one desk feature |

## Round 7: world

| id | R | kind | src | cites | thin | scenario |
| --- | --- | --- | --- | --- | --- | --- |
| STORY-ALL | 7 | example | flow | rule:58, rule:61, rule:62, rule:63 | | Checkout's and desk's Stories through a real executor |
| BROWSER-01 | 7 | fault | hostile | sec:2.10.2 | | settle on Chromium, Firefox, Safari; timer throttling, tab freeze, wake |
| BROWSER-02 | 7 | example | flow | no-decision | | React: 200 subscribers, one settlement, uSES tearing check under transitions. Review 2.3's item 3 |
| BROWSER-03 | 7 | fault | hostile | no-decision | * | real `fetch` abort racing a landed response. *Only a sample of real behaviour* |
| BROWSER-04 | 7 | fault | hostile | no-decision | | retained snapshots on a long-lived tab: heap slope |
| SSR-01 | 7 | example | table | cell:lane.ssrHydration.Idle, sec:2.10.11, CONVERSION:2 | | `DehydrateCommitInFlight`; settle bound |

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
