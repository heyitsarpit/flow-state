# Convergence 9, part one: a runtime and tests entities can trust

Status: **proposed, throwaway**, by the round's first builder under delegated authority. Arpit overrules. Written before the code; "Corrections after building" at the end says what the code changed. Input: [round-8/review.md](round-8/review.md), advice. Not in this part: entities, `.plan` files, `machine-design.md`.

## Findings by root cause

| Root | Findings | Answer |
| --- | --- | --- |
| **A. A loop was treated as volume.** D110 counts asks per second, so it cannot tell 300 presses from one handler asking 300 times. It cuts the first and needs a clock for the second. The real fault: a chain of endings with no I/O between them never lets the drain end, so batches and listeners starve | High, M4, assumptions 12, 34, 39, 40, 41 | D115 |
| **B. Something a turn cannot accept has several fates.** A write parks, a read strands, a firing and a stream's failure vanish, a raise key refuses, and a decline looks like a hold | M1, M2, M3, assumptions 42, 44, 45 | D114, D118 |
| **C. One text does two jobs.** A name must be stable; a carried value must come back. One door answers for both, so `1n` cannot name a lane or a reset | M5, assumption 37 | D119, D120 |
| **D. The suite cannot see what is not there, and its lock can be walked around** | M6, M7, assumption 47, survivor table | D116, D117 |

## Decisions (all proposed)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D114** | **A decline carries what the turn asked to send.** `entered` hands the refused value back, and `decline` puts it on the mail, as every other `NotSent` does. So a mapper reading `input.id` works on `Unencodable`. Mail needs no encoding; a parked one that cannot be carried is written as `{ unencodable: true }`, as a parked value already is. Separately, a kept ending is a hold only if it has an Attempt: `item.attempt &&` | A mapper sees a value that failed the door. It is the author's own value | `gate.ts`, `turn.ts`, `durable.ts` |
| **D115, replaces D110** | **No rate budget. A chain of endings with no I/O yields, and failures back off.** An ending made inside a turn, or answered inside the pump that asked, carries `depth` one past its turn's. Anything from outside (a press, a firing, a real answer) starts at 0. Past `endingChain` (64) the ending waits on a timer before its turn: a failure backs off like storage does (1 s doubling, capped at `retryMaxMs`) and is named by `TurnStorm` once; a success only yields, delay 0, unnamed, since a queue over a local source is a correct program. A `paced` wait says so. **Nothing is dropped, so every ask ends**: a spin stops spinning, and carries on at the rate of a failing network | A handler that spins goes on at 1 per 30 s until the machine leaves. It no longer ends by itself. 64 is a guess, in line with `followUps` and `notifyChain` | `step.ts` onTimer, `turn.ts`, `world.ts`, `driver.ts`, `publish.ts`; `asked`, `askMax`, `askWindowMs`, `mayAsk` deleted |
| **D116** | **Harness.** No lock fails, and only `--first-lock` writes one. A lock line missing for a current id needs a log line, as a changed hash does, so deleting lines does not launder a weakened case. Everything under `scenarios/`, `search/`, `fixtures/`, plus `main.ts`, `report.ts`, `watch.ts`, `gate*`, `mutate*`, `harness.ts`, `drive.ts`, `fake-world.ts` and the round's `cli/` and `typed/`, is hashed by walking, so a new file cannot be forgotten | Every new case needs a log line | `main.ts` |
| **D117** | **Oracle (j), a missing ending,** in `drive.ts`, read by `checkClaims` so it runs in every step of every case and search. The harness counts each `input` Slot a committed turn ran, by operation, and requires that step's evidence to say it became a `mint`, an `invoked`, or an ending. An ending refused twice must leave a `parked`, `stranded` or `held` wait | A little per step | `drive.ts`, `ctx.ts` |
| **D118** | **One rule for what a turn cannot accept: it stays with its owner, at the owner's durability, and says so.** Writes: on the lane, on disk if persisted, in memory if not. A firing: its timer stays on the record until a turn commits, so a reload fires it again; gone when its activation ends. A read and a stream's failure have nothing owed on disk, since a reload asks again: a `stranded` wait until then. A raise or stream key with no name is one more door: named by `UnencodableValue`, the turn runs. D109's sentence becomes: **a turn never loses a write's ending or a deadline; a read's answer and a stream's failure it loses out loud.** Lane: a kept ending is a column of its own, `Kept`: `row` says `undelivered`, `idle` denies, a commit declines `Rejected`, `cancel` lets it go. Yes, `W` is a stuck state; this makes it visible to the app and gives it a way out | One more lane column, one boolean on `Parked`. No fallback API | `turn.ts`, `lane.ts`, `publish.ts`, `durable.ts`, `gate.ts` |
| **D119** | **Two texts, each named for its job.** `canon` names: `1n` is `$1n`, as `NaN` is `$NaN`. `carried` says whether a value comes back from JSON, and bigint does not. Keys, guard keys, member keys and reset values are names. Inputs, module values, memory and parked values are carried. A lane stores its key's normal form, so `1n` restores as `"$1n"`: same lane, and a name need not be reversible (D108) | A restored mapper sees `"$1n"` as `key`. `"$1n"` and `1n` are one lane | `gate.ts`, `record.ts`, `durable.ts`, `sessions.ts` |
| **D120** | **`flow check` lints a key field with no JSON form:** `KeyFieldForm`, warn. `keyFields` are already data; the front end adds which of them have a Schema with no JSON form, so the lint reads tables only | One optional field on `Compiled` | `typed/flow.ts`, `compiled.ts`, `cli/check.ts` |
| **D121** | **Server key as data: not built.** Proposal below, for Arpit | | |

Considered for D115 and not chosen:

- **The review's patch, count only asks from an ending's turn.** Passes the cases, but a burst of real answers whose handlers each ask is exactly a correct bulk flow, and the cut still has no ending. It narrows who is cut; it does not stop cutting.
- **A depth bound that stops the ask.** Exact, but what is stopped has no ending, so "every ask ends" needs an exemption. An ending delivered late needs none.
- **Only yielding in the driver.** The drain already yields past `drainMs`. It answers starvation of the page, not a hot loop: `work()` stays true for good, so nothing after the drain ever runs.

## Effect on the rest

- `Compiled`: gains nothing for D115. `.each.max` needs no budget lint now. D120 adds one optional field.
- Static analysis and CLI: nothing reads the removed bounds. `flow check` gains one lint. `paced` is a wait like the others, so `flow trace` can name it.
- Replay: `sent.inline` is on the logged input, so a replay decides the same. `depth` is in the world, so it is in the hash and a search can reach it. `asked` was neither.
- Entities: bulk writes hit no bound. A `.confirms` over a local source is a success chain: it yields and is not cut.
- Streams: a `deliver` starts at depth 0. A module's own loop is bounded by its backoff, not by this.

## Corrections after building

- **Why `odd` reached depth 1, traced:** not the alphabet. `subject.cycle` cost 1.8 s a step, and every later script replays it. `canon`'s replacer sorted by copying, which defeated JSON's cycle check, so each look at a cycle overflowed the stack, and a stack overflow is an ordinary "no text". A real cost too: any cycle from a server took seconds a turn. `canon` now walks with its own check. `odd` went from 139 states in 120 s to 3,000 in 3 s; the suite from 13 s to 3.5 s.
- **D114: per field, not whole.** A parked input keeps what can be carried, so a mapper's `input.id` still reads after a reload; only the field that cannot be carried stands in.
- **D115: `latest` and freezing.** Reading my own design: a paced read could arrive after a newer ask, and into a frozen life. So a newer ask supersedes it, and a freeze interrupts it (rule 52). So a press beside a spinning read also ends that spin.
- **D115, a limit:** the failure name fires when `over === 1`. A chain of successes that turns into failures past the bound backs off at once, unnamed; the `paced` wait still says so.
- **D118: `EndingKept` evidence removed:** nothing read it (review's Low). A stream key with no name reads `UnencodableValue`, no session; no wait is added for it: that door is at open, and the issue names it.
- **My first pin of `a-hold-parks-nothing` was vacuous:** it copied the round-8 case's `throwIn: "on.Unsure[0]"`, a path with no Slot, so nothing threw. That is why the review's survivor survived there too. A survivor showed it; now it throws in the `unknown` mapper, and refusals are read.
- **`d118.fire-not-touched` led to removing a line:** the record on disk already has the timer. **A survivor kept for its reason:** `gate.lane-key-unchecked`: parsed JSON always has a name. `gate.cycle-unchecked`: only speed changes.
- **Not done, stated:** a kept ending is still redelivered every boot, two more `InvalidTurn` each, wherever the machine then is. `wipe` is in one directed alphabet, on `serialize`: not sessions, not entities. Oracle (a) is off after a wipe in that alphabet, since a second key is the stated limit. A reset with no name still issues per evaluation. `canon` puts a lane's key to its normal form; `input` through Schema with `keyFields` stays for typing `domain`.

## For Arpit's read

1. A kept ending blocks a new commit on that key (`Rejected`), and `cancel` lets it go: D118.
2. A spin never ends by itself: it slows to 1 per 30 s: D115.
3. D109's sentence is narrowed: D118.
4. `1n` as a key restores as `"$1n"`: D119.

## Proposal, D121: the server's key as data on a contract

**Not built. Proposed, for Arpit.** Where the value comes from today: `commit` is a closure, which reads `attempt.id` and puts it in a header. `flow check` cannot see it, so nothing can say "after a wiped origin, this can send twice".

### Before

```ts
// existing: defineContract, Schema, transaction, commit, on, tokens. user-defined: chargeContract, Pay, orderId, cents, Paid, Declined, Unsure
const chargeContract = defineContract({                    // existing
  id: "shop/charge",
  input: { orderId: Schema.String, cents: Schema.Number }, // existing
  success: Schema.Struct({ id: Schema.String }),
});
const Pay = machine({                                      // existing
  operations: {
    charge: transaction(chargeContract, {                  // existing
      key: ["orderId"],                                    // existing: which lane. Not what the server sees
      commit: (input, { attempt, signal }) =>              // existing
        fetch("/api/charge", {                             // the real API. Flow is not a network library
          method: "POST",
          signal,
          headers: { "Idempotency-Key": attempt.id },      // LOOK: a closure. Invisible to `flow check`. A wiped origin mints a new id
          body: JSON.stringify(input),
        }),
      success: "Paid", failure: { NotSent: "Declined" }, unknown: "Unsure",
    }),
  },
  states: { A: { on: { Pay: { target: "W", do: (O) => O.charge.commit(({ event }) => event) } } }, W: {}, Done: {} },
});
const Summary = fragment({ on: { Paid: {} } });            // existing: a fragment reads the same row, and knows no more
```

### After

```ts
// NEW: idempotency, serverKey in commit's context. existing: everything else. user-defined: as above
const chargeContract = defineContract({
  id: "shop/charge",
  input: { orderId: Schema.String, cents: Schema.Number },
  success: Schema.Struct({ id: Schema.String }),
  idempotency: ["orderId"],                                // NEW: the fields the server's key is made from. Or "attempt", stated
});
const Pay = machine({
  operations: {
    charge: transaction(chargeContract, {
      key: ["orderId"],
      commit: (input, { serverKey, signal }) =>            // NEW: serverKey, in place of attempt.id
        fetch("/api/charge", {
          method: "POST",
          signal,
          headers: { "Idempotency-Key": serverKey },       // LOOK: the value is made by the Runtime, from data. "shop/charge:o-17"
          body: JSON.stringify(input),
        }),
      success: "Paid", failure: { NotSent: "Declined" }, unknown: "Unsure",
    }),
  },
  states: { A: { on: { Pay: { target: "W", do: (O) => O.charge.commit(({ event }) => event) } } }, W: {}, Done: {} },
});
const Summary = fragment({ on: { Paid: {} } });            // unchanged
```

**Added:** `idempotency` on a contract; `serverKey` on `commit`'s context; `Compiled`'s `op.idempotency`; `flow explain` saying "after a wiped origin, this can send twice" for `"attempt"`; a `flow check` warning on a persisted, `unknown`-mapped write with `"attempt"`. **Dropped:** nothing; `attempt.id` stays for what is not a server key.

**Against real cases:**

| Case | Fits? |
| --- | --- |
| Stripe `Idempotency-Key` header, per order | Yes: `["orderId"]` |
| A retried refund, where two refunds of one charge are both wanted | Yes: `["chargeId", "requestId"]`, with `requestId` made at the press and carried in `input` |
| A GraphQL mutation with a `clientMutationId` in its body | Yes: `serverKey` goes wherever the closure puts it |
| An SDK that makes its own key | `"attempt"`, and stated: the warning is true |
| A server with no idempotency at all | `"attempt"`, and the warning is true, and the honest answer is a reconcile read |
| A chat message, where a client-made id is the key | The id is in `input`, so `["clientId"]`. A wipe loses the draft, not the send |
| Sync engines (Zero, TanStack DB) with their own mutation ids | Opaque to this; it belongs with the entity design. **Not tested** |

**Prior art, read only as far as stated:** Stripe's docs name the key per request and scope it to the request's parameters [reasoning, from memory, not checked this round]. Check TanStack DB and Effect before accepting.

**Why not now:** it changes a public shape and every fixture's `commit`, and entities may want to say what a key is too. **My recommendation: accept, after the entity redesign shows what it needs from it.** Decided nothing.

---

# Convergence 9, part two: self-looping and what a turn cannot take, settled

Status: **proposed, throwaway**, under delegated authority. Arpit overrules. Input: [round-9/review-fixes.md](round-9/review-fixes.md), advice. Results: [round-9/RESULTS.md](round-9/RESULTS.md). D115 and the Considered list above are prior art now; D118's table is replaced.

## Self-looping: the requirements together

Two designs failed by treating one symptom. Round 8 cut by rate, and dropped work. Part one paced by depth, which needs a timer per ending past the bound, so it stalled correct work, and read the wrong actor's depth. All at once:

| # | Requirement | Traces that fail it |
| --- | --- | --- |
| 1 | Never drop work | Round 8's budget |
| 2 | A page never freezes, however the answer arrives: inside the pump, in a microtask, as a task | H1 |
| 3 | A correct bulk of thousands finishes about as fast as with no yielding | 1,000 rows 4.8 s; 936 timers |
| 4 | A failure is not a spin | 200 failures, 66 minutes; one duplicate, 30 s |
| 5 | One actor's loop cannot delay another | M2 |
| 6 | Hidden tabs and throttled timers do not make correct work take hours | M1's reasoning |
| 7 | No wall-clock number decides anything | 64, 1 s doubling, 30 s |
| 8 | The world stays pure and replayable; a search and the suite can reach it | `inline`, H1 through every case |

Prior art, read: Effect's fiber (`node_modules/effect/src/internal/effect.ts:640-655`) counts ops and yields to `Scheduler.shouldYield`, and its `MixedScheduler` goes to a task; a fiber in a loop never ends and is never cut. `Effect.forever` is a correct program there. React's scheduler, from memory, not in `codebases/`: a 5 ms slice, measured across work, a `MessageChannel` post rather than `setTimeout` because of the 4 ms clamp and background throttling. The browser's `scheduler.yield`, same idea. xstate's `createActor.ts:280-299`: drains, and has no bound. **What none of them does:** decide from a loop's shape that it is wrong.

## Decisions (all proposed)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D122, replaces D115** | **One rule: a slice of work, however it arrived, then a task for the page.** Driver only. `spent` counts work across pumps, and only a yield refills it, so an answer in a microtask is on the same bill as one in the pump. That closes H1, on the path that caused it: past the slice an answer gets its one step, and what that step asks for waits for a real task. No answer chain can pass one. **`drainMs` was already there and now means the whole slice;** it decides when, never what. `Host.later` is a real task: `MessageChannel` on a page, `reality/task.ts`. **Mail is served actor by actor**, so a queue on one does not stand in front of a press on another. **Listeners and batches run at each slice's end**, not at the drain's, so nothing starves. **A spin is not stopped, not slowed, and not cut.** It runs at task rate until a press or a move ends it. It is named, and that decides nothing: `TurnStorm` when the same op fails with the same input `sameFailures` times in a row, and `flow check`'s `AsksForever` when every handler of its own ending asks again. A success spin is not named at run time, since a queue looks the same | **A hot spin burns a core until something ends it, in a hidden tab too.** No backoff protects a server from a handler that retries at once. A success spin has no run-time name. One more world field (`rota`), one for naming (`failing`) | `driver.ts`, `world.ts`, `turn.ts`, `step.ts`, `reads.ts`, `publish.ts`. **Gone:** `depth`, `inline`, `noIo`, `endingChain`, the `pace` timer, the `paced` wait, `dropPaced`, `paced` on mail |
| **D123, replaces D118's table** | **One rule: what a turn refused twice stays with what owes it, and ends with that.** Below. A refusal says what was thrown: `cause` on the issue. A kept ending gets one try per boot or adoption, not two | One more evidence kind | `turn.ts`, `lane.ts`, `step.ts`, `durable.ts`, `reads.ts`, `world.ts` |
| **D124, replaces D120** | **Walk the decoded type of every input field**, into objects, arrays, records and classes, and name each place the door would refuse: `InputFieldForm`. What it cannot see into it says nothing about. `Compiled` field `inputNotCarried`, by path. `hasJsonForm` gone | A longer walk at compile. Rename | `typed/flow.ts`, `cli/check.ts`, `compiled.ts`, `typed/form.typed.ts` |
| **D125, replaces D117's second half** | **Oracle (j) is a ledger of every ending,** by op and Attempt, from evidence the runtime gives and the disk the suite owns. Said: owed until heard, parked or let go. Parked: a wait must name its op and Attempt. On disk at a kill: owed at the boot. Refused once: owed a second try. Refused twice: owed a keep, and a wait naming it | Every step reads waits. Runtime gains the evidence `kept`, `refused`, `ParkedLetGo` | `drive.ts`, `turn.ts`, `lane.ts`, `publish.ts` |
| **D126** | `--first-lock` is refused where the log has history. A log deleted too gets through; `git diff` stays the check | | `main.ts` |
| **D127** | **Plants: a `capture` alphabet,** with a real interval and oracles for what time does: (o) a change waits no longer than the interval, (p) a failed write comes round, (q) a hidden page does not wait, (r) a lane's batch does not wait, (s) a batch that never answers is said. `encodeOnTurn` stays suite-only: same states, only where the encode ran differs | Five more oracles, one alphabet | `flush.search.ts`, `run-plants.sh` |
| **D128** | **Search `chain`,** so a search reaches an op that answers at once: queues and spins on two actors, kills, refusals. (l) a press on another actor is heard in its step, (m) a queue left alone ends or says why, (n) a stopped spin stays stopped. The fake's (k), a frozen page, is in every step of everything | | `search/chain.search.ts` |

### D123's rule, as a table

| What was refused twice | Owed by | Where it stays | Ends when | Blocks |
| --- | --- | --- | --- | --- |
| A sent write's ending | The lane: it may be at the server | Parked, kept, on disk if persisted | Heard, `cancel`, a release, or a local life's end | Its key: column `Kept`. `idle` keyed or key-less denies; a commit declines `Rejected` |
| A hold's | The lane's head | The head | The hold's own ways out | The head does |
| A decline (no Attempt) | The lane of the key it was asked for | Parked, kept, on disk if persisted. One per lane: a newer one says all an older did | Heard, `cancel`, a release, a newer decline | **Nothing:** it sent nothing |
| A deadline | Its activation | `keptFires`, on the record | Heard, or the activation ends | Nothing |
| A read's answer, a stream's failure | The life that asked | `stranded`, by life, in memory | That life's next ask of that op, its end, or a boot | Nothing |

Key-less `idle` reads the column as keyed does. `cancel` lets go whatever else the lane is doing, and a key-less one outside an ending lets go of every kept ending of the op it can see. D22 stands for heads. Only the input's bad field is lost, so a decline's lane comes from the key the input can still give; a key with no name is `null`, reached by key-less `cancel`.

**D118's sentence "a reload asks again" was false, and is withdrawn.** A boot forgets a stranded wait. A machine with a recurring schedule asks again (`machine-design.md` rule 42); one without stays where it was. For Arpit: that is a table lint, not built.

**Why a decline is kept and not stranded,** against the review's proposal: stranded dies at a reload and leaves a persisted `W` with no wait for good. Parked and blocking nothing has neither of the harms the review named: coalescing ends the pile-up, and the real key ends the `null` hole.

## Considered for D122 and not chosen

- **H1's patch on D115, backoff on a same-input run (the review's M1, M2).** Correct, and three mechanisms: `sameTask`, `depth` on the Attempt, `failRun` and its timers. Requirement 7 fails. It would still leave a varying-input spin hot, so it does not close the class it prices.
- **A `later` per invoke.** Works. One per slice costs less, and answers through module fibers on the same bill.
- **Count steps, as Effect counts ops.** One slow turn then holds the page. A clock that decides only *when* is the safer of the two.
- **`scheduler.postTask` or `scheduler.yield`.** Chrome-only here; `MessageChannel` is what they replace for this job.

## Effect on the rest

- **Replay:** `sent.inline` is off the log. `rota` and `failing` are pure, in the world. A slice's clock is outside it, so a replay is the same at any speed.
- **`Compiled`:** `inputNotCarried` only. Runtime bounds are not `Compiled`.
- **Static analysis, CLI:** two warnings, both from tables. `flow trace` still does not name `parked` or `stranded`.
- **Entities:** a `.confirms` over a local source costs a turn. A failed confirm chain is not a storm unless it is one input. **Mail order across actors is no longer global:** entities should not assume one actor's mail lands before another's unless a turn links them.
- **A freeze now interrupts an answer in mail**, not only one on the wire, for any read. It was reachable before, by any answer behind a leaving turn, with no test.
