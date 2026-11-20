# Convergence 2: round 2's decisions, all findings at once

Status: **everything here is proposed.** Written under the owner's delegation while he sleeps; nothing is decided until he says so. It gathers round 1's `RESULTS.md` F1-F9, `review.md` H1-H6, M1-M11, L1-L6 and its 14 items, and answers them as one design rather than one by one. Revision read: `b27552db`. `D1`..`D24` are convergence-1's; `D25`.. are new. No keyword below is public API; all of it is internal to the runtime or the suite.

## Read this in the morning

These were "ask the owner first" in `review.md`, or they change something he decided. Each can be flipped; the cost of flipping is stated.

| # | Decision | Why it might be wrong | Cost to flip |
| --- | --- | --- | --- |
| Item 1, D25 | Module seam: a **capability object**, own slice only, no world access | Effect lists are purer on paper | One file (`seam.ts`), and each hook's body |
| Item 1, D26 | **Write-ahead is core**, not a module. Only the codec and the storage are swappable | An app with no persistence carries about 200 lines | Would need the seam to grow lane rows again (H6) |
| Item 2, D27 | **D10 replaced.** A hook throw disables that module with an issue and the core's work stands. A throw in core code is **fatal to the Runtime** | A disabled store means no record ordering for the rest of the session. Fatal means a bug kills the tab's writes until reload | Small: one wrapper, one driver branch |
| Item 3, D28 | `Attempt` has one `phase`; the table's columns are phases | None found; this is the one I am sure of | Large later, small now |
| Item 5, D30 | **D14 replaced. Silent storage means pending**, not refused. Evidence at 10 s, no ending | L1's "every wait has a bound" no longer holds for ack and capture. A shopper can sit on "Paying…" with a dead disk until the machine's own timer speaks | Small: one cell |
| Item 12, D36 | **Converted Pay is not changed.** Its five bugs are pinned: list below, with fixes | Suite pins real money bugs as "expected", marked | Apply the list |

## Before and after, for the two that shape everything

```ts
// BEFORE (round 1). The module holds the transaction and writes lanes itself.
onInput(raw, input, tx) { tx.w = { ...tx.w, lanes: { ...tx.w.lanes, [l.id]: next } } }   // who wrote this lane?
waits: { ack: boolean; capture: boolean }; wire?: {...}; settled?: Ending; cancelled?: boolean   // four states spelled by flags

// AFTER (round 2)
type Cx = {                                            // NEW: capability object, D25. Local to one step, so purity holds
  readonly now: number; gen(): string                  // NEW: time and generations come from the step
  arm(key: string, dueAt: number): void; disarm(key: string): void   // NEW: the module's own timers, routed back to its `timer` hook
  command(cmd: unknown): void                          // NEW: to its own driver half
  wake(attempts: readonly string[]): void              // NEW: "these may be eligible now". The only way a module touches a lane
  note(kind: string, f?: object): void; issue(code: string, f?: object): void; visible(): void
  user<A, B>(slot: Slot<(a: A) => B>, a: A): B         // NEW: a user closure. Its throw refuses the turn (D11); any other throw is a module defect (D27)
}
type Phase =                                           // NEW: D28. Replaces waits, wire, settled, cancelled, Lane.state
  | { t: "queued" }                                    // in W behind the head
  | { t: "durable"; on: "ack" | "capture"; ticket: string }   // a write is out; the ticket fences its answer (H3: nothing to forget)
  | { t: "ready" }                                     // only the store can hold it now
  | { t: "wire"; gen: string; cancelled: boolean }
  | { t: "settled"; ending: Ending }                   // in mail, row still pending
  | { t: "held" }                                      // Held is a phase, so "Held with a wire" cannot be written
```

What is added: `Cx`, `Phase`, `Module.exec` (driver half), `Harness.raw`, `Harness.subscribe`, `Reads.record`, `Reads.outside`, `Reads.stateHash`, `lane.w`, `serialize` (Refunds needs it). What is dropped: `Tx` in hooks, `Attempt.waits`, `Attempt.acked`'s dual role, `Slice.asked`, `onTimer` as a core concept, `TurnStorm` in the adapter, `afterAbort`, `AbortPay` in Pay's fixture.

## The 14 items

| Item | Decision | Reason |
| --- | --- | --- |
| 1 Seam (H6) | **D25** capability object, hook returns its new slice, the wrapper assigns it after the hook returns. **D26** write-ahead is core | The bug in round 1 (a spread evaluated before the hook) cannot be written. Entities on paper needs only: a verdict at start, a wake at release, a timer, a repair command, a read. No hook needs a lane. Persistence needed lanes because invoked, storage-refused and restore are lane rows, so it was never a module. Effect list rejected: a generation handed out inside a hook would need effect ordering rules |
| 1b Store (D16) | **D42** `Store` merges into `Module`. `start`, `settled`, `withdraw`, `released`, `blocks`, `read`, `input`. An engine later implements the same hooks with `blocks: false` | Two interfaces for one seam fail "question each addition". Nothing else uses `Store` |
| 2 D10 (H5) | **D27**, by input kind, one rule: hooks run after the core's own work, in their own attempt, so a throw cannot lose a `sent`, `timer`, `acked` or `turn`. Core throw: fatal; world frozen; fibers interrupted; every later input is evidence; reload recovers | A per-kind recovery table was the case-by-case answer. Separate attempts makes every kind safe at once. A core bug is deterministic and would repeat; continuing risks writes on a world we cannot trust |
| 3 Phases (M8) | **D28**, above; table keyed `(row, column)`, columns `Idle`, `Waiting` (never sent), `Resend`, `Wire`, `Settled`, `Held`. `idle` and `retryable` become table rows | Invalid combinations stop being writable. Fixes M8 at the root before `W` multiplies it |
| 4 L3 (M1) | **D29** `quiet()` returns structured claims; the suite cross-checks each against what it owns: `wire` has a request, `ack`/`capture` a held write, `timer` a host timer, `queue`/`W` an edge to an older Attempt. Keep `flow check` for hold reachability; the search's money oracle stands in | L3 was the runtime reporting on itself. Fails today on H3, H5 and F2 |
| 5 D14 (M3) | **D30** silent means pending. Real refusal stays `NotSent { StorageRefused }` | "You haven't been charged" was a sentence the UI could not know. Correctness first. Rejected: a tombstone, which needs the same silent storage |
| 6 F1, F3 | **Stay as built:** two writes per Attempt, ordinary timers persist with `dueAt`. Both forms go to S3 | Nothing here measures it; S3 runs with persistence in round 5. Not re-decided twice |
| 7 F7 | **D31** keep: the turn is refused, the fact is not redelivered, the issue carries the mapped event so a human can find it | A refusal is deterministic, so redelivery would loop. In Stories it fails the run. It is a bug report, not a recovery path |
| 8 Search (M2) | **D32** `Reads.stateHash`, opaque, normalised; the suite joins the fake's state. BFS over states, stateless replay to reach each. Money oracles independent of the design. Causal `intent`. Wider alphabet. Revises section 11's "no BFS over world values" in form: the search still only sees `Reads`, and the runtime's hash is opaque text | Depth 8 by replay alone took 6 minutes with blind oracles |
| 9 Gate (H1, H2, M6, M7) | **D33** every citation needs a mutant of that id which fails a test citing it, or it goes to `near:` and stays UNTESTED. `sec:` ids validated. Lock hashes scenario bodies, helpers and fixtures, compares before any `--lock`, exempts per hash. `pins:` marks pinned bugs. One process per mutant in the OS temp folder under a watchdog. A second author writes a mutant set from rule text and its kill rate is the reported number | 22/22 measured convergence on the builder's own list; an independent 16 mostly survived |
| 10 Harness (M11) | **D34** settled first: `raw` and `subscribe` (D2 observable), rows per key, ops from the fixture, declared-but-unbuilt faults removed, `Fixture` gains `uses`, one generic `api.call`. Edits to old scenarios counted against section 12's 10% | A contract called stable took seven amendments |
| 11 D13 (M9) | **D35** follow-ups bounded in the step per admitted item (64), past it `InvalidTurn` naming the chain. Subscriber ping-pong bounded in the driver per notify chain (64), past it `TurnStorm` and the send is dropped with evidence; an outside input resets the count. Commands run before sinks; sinks and listeners are guarded. The driver retains nothing: log and frames are the adapter's | Counting evidence stopped a legitimate hour of polling |
| 12 Pay | **D36** not changed. Pinned below | Owner's instruction |
| 13 World (L4) | **D37** plain objects copied on write, with indexes in place of scans (`byAttempt`, touched sets). Measure at 1,000 actors against Effect `HashMap`; a persistent map only if the numbers demand it | Section 11's rule: no library unless measured |
| 14 Budgets (M10) | **D38** table below | The stop line was set before any code |

## Highs and Mediums

| Id | Decision | Reason |
| --- | --- | --- |
| H1 | `settle` keeps a plan until its tick. The scenario asserts injections with a live fiber and picks with a choice, else fails. Only "no held request" is caught. Second fiber: a bystander actor's commit and the matrix below. `RESULTS` of round 1 stands corrected by `review.md` | Vacuous tests must fail for being vacuous |
| H2 | `ends == sends` in `closing`, counted against **delivered** endings. One scenario per surviving mutant before any reuse. D33 | |
| H3 | Fixed by D28: a re-send's refused capture returns to `Held`; no list of what was asked exists. Scenario `PAY-16` | Fix the class, not the tag |
| H4 | Pay's bug: pinned P1. Money oracle reports it. Nothing in the runtime changes | The runtime did what Pay said |
| H5 | D27. Scenarios for `sent`, `timer`, `acked`, `turn` | |
| H6 | D25, D26 | |
| M1 | D29 | |
| M2 | D32. Report per depth, never one misleading count | |
| M3 | D30 | |
| M4 | Pinned P3 | |
| M5 | F5, F6, M4, H4 are pinned. F7 is D31 and is removed from "Pay's bugs". F1, F3 to S3. F8: stays a stated limit; M3 was its only bad consequence and D30 removes it | Round 1's verdict overclaimed F7 |
| M6 | Each row fixed: PAY-14 and D1 move to ORDER-*, PAY-01's D2 to ORDER-03, PAY-03's D23 to a new superseded-read case, PAY-03's rule:18 removed, PAY-08 and 09's rule:38 become rule:46, PAY-11's sec fixed, PAY-10's cell gets its re-send half, SEARCH-PAY cites only what it can fail | Logged |
| M7 | D33; `pay.story`-shaped pins marked; `SCENARIOS.md` updated with the log | |
| M8 | D28 | |
| M9 | D35 | |
| M10 | D38 | |
| M11 | D34 | |
| L1-L6 | L1: no throw, lane stays unbound with evidence. L2: `AbortPay` moves to `cells.compiled.ts`, path index fixed. L3: D33. L4: D37. L5: `holdCaptures` removed, no user. L6: moot | |

## New decisions the entity module forced

| # | Decision | Reason |
| --- | --- | --- |
| D39 | A re-send waits for its own record's forced repair to settle (S1's reading `n`) | Simplest with no cycle in S1. Bounded by D12 |
| D40 | D12 made exact. At 30 s a repair ends: its predictions go, its mark stays, a late answer is fenced, evidence `RepairOverdue`. If the Attempt was released, its entry leaves then. If still `Held`, the entry stays, because D3 says only resolved or released leaves; the machine still owns it | "Queue released at 30 s" in convergence-1 contradicted D3 for a live hold. The hold outranks the bound |
| D41 | **Cut "contested" (rule 31, E7) for now.** Under D3 no newer write is sent past an unresolved older one, so a re-send's response cannot lose by position to a newer write in one Runtime. Only a released Attempt lands late, and that has no response to read. It returns with server pushes (round 4) if a case appears | Dead branch; question each addition. SEARCH-LIKE's mint-order oracle checks the premise |
| D43 | `serialize` added to the lane now, `W` FIFO at most 64 | Refunds is `serialize` and `W` is a list anyway. The full policy suite stays round 5 |
| D44 | Module names on compiled data: `Compiled.uses: ["entities"]`; the adapter's registry resolves them. A real contract would import the module directly | Fixtures must outlive rounds, and the module lives in the round's folder. Shortcut, stated. Bundling is checked separately |

## Pay: pinned findings for the owner

The converted `pay.machine.ts` is untouched; these are bugs in it, found by running it. Lines are `checkout/features/Pay/pay.machine.ts`. Each fix is proposed, none applied. `conformance/fixtures/pay.fixed.ts` applies them to a copy so the search can say whether they are enough; results in `round-2/RESULTS.md`.

| Pin | Bug | Trace | Fix |
| --- | --- | --- | --- |
| P1 (H4) | Leave during PLACING voids the hold while the order is on the wire. Void first: PAID with its hold voided. Place first: LEFT, order placed, no receipt | `pay, ack, ok, ack, Leave, ack`, answers in either order | `:113` first alternative: add `O.place.idle(cart)` to its guard, and in PLACING handle `Leave` with no void and no move (denied) until `Placed` |
| P2 (H4) | A late `Placed` is denied `LateMayNotLeave`, so the order exists and nobody is told | `pay, ack, ok, ack, Leave, Start, pay, ack, place ok` | Root `Placed`: a first `{ target: "self", guard: late }` alternative that records the receipt without moving. Rule 15 forbids the move, not the fact |
| P3 (F6, M4) | Late `Confirmed` in a new PAYING routes to the root's bare `self`: charged, `authorized: false`, never voided. Another intent's late charge is never voided either, because `authorized` is one bit | `pay, ack, Leave, Start, pay(rejected or pi2), answer` | `Confirmed` carries `intentId`; root alternative voids what the event names when it differs from `memory.intentId`, as `Authenticated` already handles it at `:157-171` |
| P4 (F5) | Press Pay in UNSURE: moves to PAYING with the commit `Rejected`, and PAYING has no reconcile. Stuck for good | `pay, ack, lost, pay` | `O.pay.idle(intent)` on the moving `onPay` alternative |
| P6 (found by SEARCH-PAY, after this list was written) | Press Pay in PLACING. The lane is idle because `pay` resolved, so a **new id** mints beside the authorization. A reload before its ack then says "You haven't been charged", and a second key can charge one intent | `pay, ack, ok, pay, reload`; or `..., pay, ack, ok` | `onPay`: guard the moving alternative to CARD and PAYING. Rule 16's `flow check` warning covers it |
| P5 (F5) | After Leave with a hold, a new Start and Pay on the same intent has no path while the hold lives | `pay, ack, lost, Leave, Start, pay` | Same guard, plus a `CARD` handler for `Restored`-style holds per rule 45's `UnresolvedHold` |

## Budgets (D38)

Lines of TypeScript, comments included, formatted by `vp fmt`. A stop is a cut, not a soft line.

| Part | Round 2 target | Round 2 stop | Whole, was | Whole, now | Whole stop, now |
| --- | --- | --- | --- | --- | --- |
| Step, turn, world, seam | 1,100 | 1,400 | 1,200 | 1,900 | 2,300 |
| Lane table | 400 | 550 | 500 | 650 | 800 |
| Reads, timers | 150 | 200 | 500 | 600 | 750 |
| Write-ahead (core now) | 220 | 300 | 400 | 500 | 650 |
| Publication, waits | 100 | 150 | 500 | 600 | 750 |
| Driver | 280 | 400 | 1,000 | 1,100 | 1,400 |
| Entities | 450 | 650 | 1,200 | 1,600 | 1,900 |
| Not built yet (incarnations, streams, context) | | | 2,700 | 3,200 | 3,700 |
| **Core + driver** | **2,700** | **3,350** | **8,000** | **10,150** | **12,450** |

If round 3's fragments pass their share, discussion 9.6's cut (fragments lose operations) lands there, first. The suite has no stop: expected 8,000-12,000 by round 6 [estimate from one round]. Adapter: 250, because faults and replay live there and not in the core.

## What must be true at the end of round 2

Green, or a recorded red: `ORDER-*`, `LIKE-*`, `STORE-*`, `CART-*`, `REFUND-01`, `LIB-*`, `DRV-*`, `SEARCH-LIKE`, carried `PAY-*`, `SEARCH-PAY` under money oracles with pins. The entity module absent from Pay's run and from the core's imports. S4 measured or reported not run.

```decisions-changed
D9           changed   D25    capability object; persistence is no longer a module
D10          changed   D27    hook throw disables the module; core throw is fatal
D14          changed   D30    silence is pending; only a real refusal ends the Attempt
D13          changed   D35    bounded chains, no evidence counter
D16          changed   D42    Store is the Module seam
sec:2.8.6.E7.contested cut D41 no newer write passes under D3
rule:31.contested cut  D41
L1.storage   changed   D30    ack and capture have no ending at their bound, only evidence
```

## What this does not verify

Written before any round 2 code ran. Every reason above is reasoning unless `RESULTS.md` says it ran. P1-P5's fixes are unverified until `pay.fixed.ts` runs under the search, and only under the fake, which answers what scripts say.
