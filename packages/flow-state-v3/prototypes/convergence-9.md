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
