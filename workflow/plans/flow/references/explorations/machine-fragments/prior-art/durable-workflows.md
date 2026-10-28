# Prior art: durable execution and workflow engines

**Scope.** Temporal, Azure Durable Functions, AWS Step Functions, Restate, and the saga pattern,
read against [proposal-v3.md](../proposal-v3.md) sections 1, 2 and 5, the committed
`Operations.plan` and `Persistence.plan` (HEAD `0b7a4ab1`), and [principles.md](../principles.md)
section 4. The focus is v3's I/O rules: fenced commits (P2), uncertain outcomes and `notSent` (P9),
`retry` (P4), `abandoned` (P10), restore in flight (P12) and `revertOnUnknown` (P13). Sources are
at the end. Where a claim comes from documentation, the link is given; where it is my reading of
v3 or the plans, the rule is cited.

**One framing difference matters throughout.** These engines run the workflow on a server and
**keep it running until the remote call has a definite answer**. Delivery is at-least-once, so
"unknown" is never terminal for them. The engine retries the same logical call under a stable
identity, and the remote side is expected to deduplicate it. Flow State runs in a browser tab that
can close at any moment, so it gives up on keeping work running. Instead it makes `unknown` a
terminal, typed outcome and hands reconciliation to the host. Most findings below come from that
difference. v3 has the engines' bookkeeping (Attempt ids, acknowledgment before invocation, fenced
delivery). It lacks their **contract with the remote side**: what a retry is allowed to assume
about the server.

---

## 1. The systems

### 1.1 Temporal

**Composition.** A workflow is ordinary code: a deterministic function, plus **activities** (all
I/O), timers, child workflows, and message handlers. Behaviour is reused by calling functions and
child workflows. There are no states. "Where am I" is the program counter, recovered by replay.

**Execution semantics.**
- *Replay.* The workflow function runs again against its Event History. Each command it emits
  (schedule activity, start timer) must match the recorded event at that position, or replay fails
  with a nondeterminism error. Time, randomness and ids come from the workflow context, so replay
  gives the same values. The history records `ActivityTaskScheduled` before dispatch, which is a
  write-ahead log of intent.
- *Activities* run at least once. A **Retry Policy** sets the initial interval (default 1 s), the
  backoff coefficient (2.0), the maximum interval (100 times the initial one), the maximum attempts
  (unlimited by default) and the non-retryable error types. By default, every failure except a
  non-retryable one is retried
  ([retry policies](https://docs.temporal.io/encyclopedia/retry-policies)). The activity's input is
  recorded once and every retry resends exactly that input.
- *Timeouts* are kinds of failure with their own rules
  ([detecting activity failures](https://docs.temporal.io/encyclopedia/detecting-activity-failures)):
  - **Start-To-Close** limits one attempt and is retried.
  - **Schedule-To-Close** limits the whole execution, all retries included, and is the recommended
    bound in place of a maximum attempt count.
  - **Schedule-To-Start** limits queue time and is never retried.
  - **Heartbeat** catches a dead worker and is retried. Heartbeats can also carry progress details
    for the next attempt.
- *Cancellation* has three explicit modes
  ([TypeScript cancellation](https://docs.temporal.io/develop/typescript/cancellation)):
  - `TRY_CANCEL` (the default) fails the call immediately, while the activity keeps running until
    its next heartbeat.
  - `WAIT_CANCELLATION_COMPLETED` waits until the activity acknowledges or finishes.
  - `ABANDON` fails the call and never asks the activity to stop.

  An activity that does not heartbeat never sees a cancellation. Cleanup and compensation run in a
  non-cancellable scope.
- *Messages*
  ([message passing](https://docs.temporal.io/develop/typescript/message-passing)):
  - **Signals** are fire-and-forget writes.
  - **Queries** are side-effect-free reads that leave no history.
  - **Updates** are tracked writes with a result. An Update may have a synchronous **validator**
    that runs before anything is written to history. A rejection leaves no trace in history, and the
    caller gets an error.
- *Versioning* ([versioning](https://docs.temporal.io/develop/typescript/versioning)) comes in two
  forms:
  - `patched(id)` writes a marker so that new runs take the new branch while old runs replay the old
    one. `deprecatePatch` retires the patch once the old runs have drained.
  - Worker Versioning pins workflows to a deployment, so old code finishes old runs.
- *Testing* ([testing suite](https://docs.temporal.io/develop/typescript/testing-suite)):
  - A time-skipping test server fast-forwards timers.
  - Activities are mocked.
  - **Replay tests** (`Worker.runReplayHistory(ies)`) run new code against recorded production
    histories in CI and fail on `DeterminismViolationError`.

**Problems it was built for:** process crashes in the middle of a workflow, transient remote
failures, long waits (days), and code that changes while runs are in flight.

### 1.2 Azure Durable Functions (Durable Task Framework)

**Composition.** Orchestrator functions (deterministic, replayed), activity functions (I/O),
sub-orchestrations, durable timers, external events, and **durable entities**: keyed actors with
serialized operations, the closest relative of a Flow actor.

**Execution semantics.**
- Orchestrators are event-sourced and replayed. They must use context time
  (`CurrentUtcDateTime`), deterministic GUIDs (`NewGuid`, a type-5 UUID), and durable timers, and
  may not do I/O
  ([code constraints](https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-code-constraints)).
  Activity results are saved to history, so they are safe to replay.
- `CallActivityWithRetryAsync` takes retry options and a handle predicate.
- A timeout is a race between a durable timer and the task (`Task.WhenAny`). The losing activity is
  **not** cancelled; its result is simply ignored, which is an "abandon" by construction.
- Versioning guidance: changes that break replay should be deployed side by side, or under a new
  task hub, because "Code changes that affect running orchestrations can break replay behavior."

**Problems it was built for:** the same as Temporal, on serverless hosting. Entities exist for
keyed shared state with single-writer access.

### 1.3 AWS Step Functions

**Composition.** A declarative state machine (Amazon States Language) with `Task`, `Choice`,
`Wait`, `Parallel`, `Map` and others. Behaviour is reused through nested state machines. **This is
the only engine here whose shape is a state machine**, so it is the closest to Flow's machines.

**Execution semantics.**
- *Retry and Catch are declared on the state*
  ([error handling](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html)).
  - `Retry` is an ordered list of retriers. Each one has `ErrorEquals` (an allowlist of error names),
    `IntervalSeconds` (default 1), `MaxAttempts` (default 3; 0 means never retry), `BackoffRate`
    (default 2.0), `MaxDelaySeconds` and `JitterStrategy`. Each retrier counts its own attempts
    across the state's execution.
  - `Catch` runs only after the retries are used up. It is an ordered list of
    `{ ErrorEquals, Next, ResultPath }`, and `ResultPath` can keep the original input beside the
    error.
  - `States.ALL` must come last, and `States.TaskFailed` matches everything except
    `States.Timeout`. **Timeouts are named apart from other failures, so a retrier can exclude
    them.**
- *Timeouts:* `TimeoutSeconds` and `HeartbeatSeconds` on a Task both raise `States.Timeout`.
  `States.HeartbeatTimeout` also exists.
- *Callback tasks* (`.waitForTaskToken`): the state pauses until an outside party calls
  `SendTaskSuccess` or `SendTaskFailure` with the token. A token that arrives after the state timed
  out is refused to that party.
- *Delivery guarantees*
  ([Standard vs Express](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html)):
  - Standard workflows are exactly-once per state transition, "unless you have specified `Retry`
    behavior". Starting a second execution with the name of one that is running returns an
    idempotent response.
  - Asynchronous Express workflows are at-least-once; synchronous Express workflows are at-most-once.
  - The guarantee is chosen per workflow type and documented as a contract.
- *Versioning:* published versions and aliases. Executions are bound to the version they started
  on. Redrive restarts a failed execution from the failed state and resets the retry counts.

**Problems it was built for:** orchestrating non-idempotent cloud calls without workflow code,
with a visual, auditable history.

### 1.4 Restate

**Composition.**
- Services are handlers. **Virtual objects** are keyed handlers with single-writer exclusive
  access per key and durable key-value state.
- **Workflows** are a virtual object run once per key.
- `ctx.run(...)` journals a side effect.
- Awakeables are durable promises completed from outside, much like task tokens.

**Execution semantics.**
- *Journal and replay:* each `ctx.run` result is journalled, so a retried invocation replays the
  journal and resumes where it stopped.
- *Retries:* transient errors retry by default. A `TerminalError` stops retrying, so the author
  draws the line between "retryable" and "definite".
- *Idempotency:* an invocation may carry an **idempotency key**. With the same key, Restate returns
  the first invocation's result, or attaches the caller to the run in progress, instead of running
  the handler again ([invocations](https://docs.restate.dev/concepts/invocations)). The result is
  kept for a retention window.
- *Versioning:* deployments are immutable. "Existing requests continue on the original
  deployment"; only new requests go to the latest one. A stuck invocation can be paused and moved
  to a fixed deployment only if the fix fits the journal it has already written
  ([versioning](https://docs.restate.dev/operate/versioning)).
- *Sagas* are ordinary code ([sagas guide](https://docs.restate.dev/guides/sagas)):
  - Push each step's compensation onto a list.
  - On a `TerminalError`, or on cancellation, run the list in reverse.
  - **Register the compensation before the action** for one-shot APIs, so that a success whose
    response was lost is still compensated.
  - Compensations must be idempotent, because they are retried.

### 1.5 The saga pattern

From Garcia-Molina and Salem, *Sagas* (SIGMOD 1987,
[PDF](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf)): a long transaction is a
sequence T1…Tn with compensations C1…Cn-1. The system guarantees either T1…Tn, or T1…Tj followed by
Cj…C1. **A compensation must not fail for business reasons.** It is retried until it succeeds
("backward recovery"), or the saga retries forward. The pattern accepts that other parties see the
intermediate states (no isolation). Every engine above implements it in user code using its own
durability.

---

## 2. Problems these engines handle that Flow State has not considered

Each item gives a failure scenario in Flow State terms.

### G1. Whether a failure tag proves "not applied" is undeclared, so `retry.on` can double-write

Every engine makes the author separate "definite" from "maybe applied":
- Temporal: non-retryable types, with timeouts as a separate kind.
- Step Functions: `States.Timeout` is separate from `States.TaskFailed`.
- Restate: `TerminalError`.

v3's P4 retries "only the named failure tags". P9 keeps `unknown` and `interrupt` out of retry.
**But a typed failure tag can itself be uncertain.** An adapter is an Effect, so its author can turn
a fetch `TypeError`, an `Effect.timeout` `TimeoutException`, or a gateway 504 into a typed failure
such as `Network` or `Timeout`.

*Scenario.* The checkout `pay` commit declares
`retry: { on: ["Busy", "Network"], schedule }`. The request reaches the server and the charge
applies, but the response is lost behind a proxy 502. The adapter maps that to `Network`, P4
retries, and the card is charged twice unless the server deduplicates. H4 and H5 in principles.md
were written for `unknown` and `interrupt`. The same hazard comes back through the tag namespace,
and neither `flow check` nor the types can see it.

### G2. Whether retries keep one idempotency key is unspecified

In Temporal, Restate and Stripe-style APIs, the deduplication identity is fixed for the logical call
across all retries ([Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests);
[IETF Idempotency-Key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)).
Operations O3 says "every admitted commit has an Attempt" and that adapters receive it "for remote
idempotency". P4 says retries resend "the admitted input", but **not whether a scheduled retry is
the same Attempt id**, and not what the adapter's `attempt` argument holds on retry n.

If each retry mints a new id, a `Busy` returned after the server committed (a 503 from a
load-shedder in front of an idempotent store) leads to a second write. If retries share the id
(the correct choice), Persistence O6 must say whether **each retry invocation** is acknowledged
again before it runs. The crash window between "retry 2 acknowledged" and "retry 2 invoked" is
exactly what O6 exists to cover.

### G3. Commits have no timeout, so a hung adapter strands the actor

The engines bound every remote call: Start-To-Close, Schedule-To-Close and Heartbeat in Temporal;
`TimeoutSeconds` and `HeartbeatSeconds` in Step Functions. The Operations plan has none for commits.

*Scenario.* In v3 3.2, SUBMITTING makes `Cancel` Unhandled and handles every outcome unguarded
(rule 8). If `Accounts.create` never settles (a hung keep-alive, or a server that holds the
request), the wizard sits in SUBMITTING with a spinner forever. The author's way out is a host
schedule in SUBMITTING that targets UNSURE. That transition exits the fenced state, so the commit
goes to `abandoned` as `"pending"`. This works, but every author must rediscover it, the result is
labelled "abandoned" rather than "timed out", and the late real outcome then arrives at `abandoned`
rather than at UNSURE, the state that was waiting for it. The engines treat a timeout as an
outcome of the call. In Flow terms it is `unknown` after invocation and `notSent` before it.

### G4. A post-invocation cancel discards the one fact that resolves `unknown`

Operations O7: after invocation, `O.x.cancel` "reports unknown and blocks late results". Temporal's
`WAIT_CANCELLATION_COMPLETED` and Restate's attach-by-key exist because **the eventual settlement is
the cheapest reconciliation there is**.

*Scenario.* A user cancels a slow "delete project" commit. The UI shows "may have been deleted".
Two seconds later the adapter settles `success`, and Flow throws the result away. The host must now
start a lookup to learn what Flow already knew. v3 already routes late results of **fenced exits**
to `abandoned` (P10). An explicit cancel is the only path that still drops them, an inconsistency
v3 adds without noting.

### G5. The idempotency window expires, but an Attempt does not

Stripe prunes idempotency keys after about 24 hours. Restate keeps idempotent results for a
configurable retention. Persistence O6 restores an acknowledged in-flight commit as `unknown` with
its Attempt "unless durable evidence" proves otherwise. Operations O3 lets the host reconcile with
`O.x.retry(attempt)`, which reuses the id.

*Scenario.* A persisted actor with an `unknown` payment is restored nine days later, when the user
reopens the laptop. The host's `uncertain` handler calls `O.Payments.pay.retry(attempt)`. The
server's key store has forgotten the id, so the retry charges again. The Attempt carries no
creation time and the descriptor declares no window, so neither the host nor `flow check` can tell
a safe retry from an unsafe one.

### G6. A version bump discards in-flight Attempts

Every engine refuses to drop in-flight work at deploy time:
- Restate and Step Functions pin a run to its version.
- Temporal patches or pins.
- Durable Functions deploys side by side.

Persistence O1 and O5 match `version` exactly. A mismatch reports `RestoreDiscarded` and starts
fresh, which **discards the whole scope, acknowledged Attempts included**.

*Scenario.* The user submits an order, the tab crashes, and the team deploys with a new `version`.
On reload the scope is discarded. The order may have been placed, but no Attempt, no `unknown` and
no `abandoned` delivery survive. The user sees an empty checkout and orders again. This is L5 and
D5 at deploy time, and v3's P12 does not cover it, because P12 assumes the activation shape still
decodes.

### G7. No replay test against saved state

Temporal's main answer to drift is replaying real recorded histories in CI. Flow restores
snapshots rather than replaying events, so the analogous hazard is **a saved snapshot that no
longer decodes, or decodes into a state whose fenced commits and history pointers (P5, P12) no
longer exist**. Within one `version` string, Persistence O5 promises "compatible shape changes may
use Schema decode transformations". Nothing proves a change is compatible: no saved fixture is
decoded by the new machine in CI. Testing O-sections seed ids, control the clock and generate
crash-and-restore faults, but always within one build.

### G8. Compensation has no defined place to run

Operations O3 says "a compensating write is a separate commit with its own Attempt". v3 P10 makes
`abandoned` an `on`-style handler without `target` that "writes host memory and may raise into root
traits". **It does not say whether `abandoned` may list `actions`, and if it may, what a commit
started there is fenced to** (P2 fences to the state a transition enters; `abandoned` enters none).

*Scenario.* Checkout runs `reserve` (fenced to RESERVING), and the user presses Back. `reserve`
settles `success` into `abandoned`. The stock stays held until the server's TTL expires, because
the one handler that knows about the success cannot start `release`. The saga lesson is that the
compensation must also be **retried until it succeeds**. P4 retries only named tags, with a finite
schedule, and `release` dies with the actor.

### G9. Two actors or two tabs perform the same logical write

Temporal makes workflow ids unique (the business key is the id). Step Functions Standard returns an
idempotent response to a second start with the same name. Restate's virtual objects serialize per
key across all callers. Flow's concurrency is "per actor, descriptor and key" (Operations O3), and
Persistence O6 states "no cross-tab exactly-once guarantee". Attempt ids are minted, so two tabs
submitting the same cart send two different idempotency keys.

*Scenario.* The user double-submits from two tabs (the second runs without persistence under
Persistence O7). The server sees two distinct keys and places two orders. The engines' answer is to
let the author derive the key from business identity.

### G10. Completion through another channel (task tokens and awakeables)

Payments with 3-D Secure, OAuth consent, and any server job that answers by webhook all complete
**outside the request's response**. Step Functions models this with `.waitForTaskToken` and a
heartbeat; Restate with awakeables. In Flow, the commit returns "accepted", the page may navigate
away to the bank and back, and the result appears only through a later read. A reload in between
restores an acknowledged commit as `unknown` (P12), even though the server answered "accepted, see
token X". Nothing in Operations lets a commit settle as "accepted, result pending under token X" so
that a fenced state can wait for the result with a deadline.

### G11. Retry delay cannot read the error

Temporal lets a failure carry `nextRetryDelay`, which is how an HTTP 429 `Retry-After` gets
honoured. P4's `schedule` is an Effect `Schedule`, which can read its input. P4 does not say what
that input is (the failure value, or nothing). P4 also has no total deadline in the style of
Schedule-To-Close, so `retrying (n/3)` can outlast the user's patience with no bounded end other
than the attempt count.

---

## 3. Semantics that match v3, and semantics that differ

### 3.1 Matches (independent validation)

| v3 / plan | Engine equivalent | Comment |
| --- | --- | --- |
| P4: a retry resends the **admitted input**, never live values (D2) | Temporal records the activity input once, and retries reuse it. Stripe errors when a key is reused with different parameters | Same rule, for the same reason. Keep it. |
| P4: an allowlist of tags (`on: [...]`), with uncertain outcomes never retried | Step Functions `ErrorEquals` is an allowlist, with timeouts excluded by name. Temporal's default is the opposite (retry everything) because it assumes idempotent activities | v3 takes the conservative default that fits non-idempotent browser writes. Correct, given G1 is closed. |
| P4: `retrying` before the wait, and the last failure delivered as ordinary `failure` | Step Functions: retriers first, then `Catch` with the last error | Same order. |
| P1: mapper `(value, { input, attempt })` | Step Functions `Catch.ResultPath` keeps the input beside the error | Same need: a failure handler needs the request that failed. |
| Operations O3 and Persistence O6: an Attempt id and acknowledgment **before** invocation | Temporal `ActivityTaskScheduled` written before dispatch; Restate journals `ctx.run` | Flow's write-ahead of intent is the standard design. |
| P9: `notSent` apart from `unknown`, `interrupt` and `defect` | Temporal's never-retried Schedule-To-Start timeout ("never left the queue") apart from Start-To-Close ("may have run") | The engines draw the same "dispatched or not" line. |
| P2 fencing plus P10 `abandoned` (a late result goes elsewhere and never into the new step) | Temporal `ABANDON` cancellation type; Durable Functions' `WhenAny` loser ignored; Step Functions' late task token refused | Known pattern. v3 is stronger in one respect: it keeps and routes the late result instead of dropping it. |
| Rule 6: a late result never preempts live work | No direct equivalent. Temporal workflow code is sequential, so a late result can only land where code awaits it | v3's rule is needed because a statechart has many waiting points. No engine contradicts it. |
| Rules 7 and 8: guards read the pre-turn snapshot; refusal leaves no trace; server deliveries cannot be refused | Temporal Update **validators** run before history and leave no trace when they reject; activity results cannot be rejected, only handled | Same split: a user's request may be refused, a server's answer may not. |
| Persistence O4: restore never replays turns or commits | Durable entities and Restate virtual objects restore keyed state rather than replaying it | Snapshot restore avoids the determinism-versioning tax the replay engines pay. A good trade for a browser. |
| Testing: seeded ids, controlled clock, `process()`, generated faults (lost or duplicated responses, crash and restore) | Temporal time skipping and mocked activities; Durable Functions deterministic GUIDs; Restate journal replay | Flow's Stories already exceed the engines' unit-test tooling on fault generation. Missing: cross-version replay (G7). |

### 3.2 Differences (where v3 is weaker or reinvents)

1. **`unknown` is terminal in Flow, and retried until definite in the engines (P9, Operations O3).**
   This is a forced choice: a browser cannot promise to keep running. But it makes the server's
   idempotency the **only** safe path to resolution, and v3 never asks the descriptor whether the
   server provides it (G1, G2, G5). The engines rest on "activities should be idempotent". v3 rests
   on "never retry uncertainty", then reopens the hole through tags (G1) and `O.x.retry(attempt)`
   (G5).
2. **Cancellation has one mode, plus "leave" (Operations O7, P2).** Leaving a fenced state is
   Temporal's `ABANDON` with the result routed. `O.x.cancel` is `TRY_CANCEL` with the late result
   **dropped** (G4). Temporal names three modes. Flow has two, with different late-result
   behaviour that nobody chose deliberately.
3. **There is no timeout outcome (G3).** Timeout is the single most common uncertain outcome in
   practice, and every engine names it. v3 leaves timeouts to `Effect.timeout` in the adapter, which
   produces a typed **failure** (G1's hazard), or to a host schedule that abandons the commit (G3).
4. **Compensation has no home (G8).** The engines run compensation from code that still holds the
   context. v3's `abandoned` holds the context (`input`, `attempt`, `value`) but may not be able to
   act on it.
5. **Versioning discards rather than pins (G6).** Pinning to old code is impossible after a browser
   reload. But the **Attempt** is version-independent: operation id, key, encoded input. Discarding
   it with the rest of the scope is a choice, not a constraint.
6. **`abandoned` runs twice (P10).** The engines' version of this is "handlers are at-least-once;
   make them idempotent", stated once as a contract. v3 says "each run must be correct on its own",
   which is the same contract, and it should be stated as **idempotence over a settled outcome**:
   a reload between the two runs can deliver the settled run against a restored snapshot (P12).

---

## 4. Recommendations, ranked by value

Each item gives the target, what it replaces or adds, and the cost. All respect one active leaf, no
child actors, TypeScript-first and agent-authored code.

### R1. Declare remote guarantees on the transaction descriptor (closes G1, G2 and G5; high value, low to medium cost)

Add to `transaction({ … })` (Operations O1):

```ts
transaction({
  id: "Payments.pay",
  commit,
  concurrency: "reject",
  idempotency: { window: "24 hours" },          // or omitted: the server does not deduplicate
  failures: { CardDeclined: "definite", Busy: "definite", Network: "uncertain" },
})
```

- `failures` classifies **every** failure tag as either `"definite"` (proves no effect) or
  `"uncertain"`. P4's `retry.on` accepts only definite tags (a type error otherwise). An uncertain
  tag may target only `uncertain(...)` events, as P9 does for `unknown`, which closes H4 and H5 for
  tags.
- `idempotency` declares that the server deduplicates by Attempt id within a window. Only then:
  - `O.x.retry(attempt)` type-checks without an explicit `{ unsafe: true }`;
  - `retry.on` may include `"unknown"` (Temporal's model, opt-in);
  - an Attempt older than `window` (the Attempt gains `createdAt` from the Runtime Clock) makes
    `retry(attempt)` settle `notSent` with an `IdempotencyExpired` reason rather than invoke.
- **Replaces:** P4's "never retries `unknown`…" becomes "…unless the descriptor declares
  `idempotency`". Operations O3's sentence on `retry(attempt)` gains the window rule. **Adds** to
  Operations O1 and O3.
- **Cost:** two descriptor fields, one Attempt field, two type rules. Classifying tags is a
  one-time job per adapter, which an agent does well.

### R2. Specify that one Attempt id covers all retries, with an ordinal and acknowledgment per invocation (closes G2; high value, low cost)

- P4 gains: "A scheduled retry is the **same Attempt** (same id and input). The adapter's `attempt`
  argument carries `n` (1 for the first invocation). Under Persistence O6, each invocation n is
  acknowledged before it runs."
- P12 gains: "A commit restored while waiting between retries (its last invocation settled
  definite) restores as that last `failure`. One restored after an acknowledged invocation n
  restores as `unknown`."
- **Cost:** wording in P4, P12 and Persistence O6, plus one acknowledgment write per retry.

### R3. Add a commit `timeout` whose expiry is an outcome, not a failure (closes G3 and G11; high value, low cost)

- `O.x.commit(select, { timeout: { perAttempt?, total? } })`, modelled on Temporal's Start-To-Close
  and Schedule-To-Close:
  - Expiry before invocation reports `notSent`.
  - Expiry after invocation aborts the signal and reports `unknown` with reason `Timeout`. It
    remains a delivery under rule 8.
  - A per-attempt timeout under `retry` counts as uncertain, so it is retried only with R1's
    `idempotency`.
  - `total` bounds `retrying` as well.
- P4 also states that `schedule` receives the failure value, so a `Retry-After` delay can be
  honoured.
- **Replaces:** the implicit pattern "a host schedule that exits the fenced state". **Adds** to
  Operations O3.
- **Cost:** one option, one reason on `unknown`, and clock integration that already exists for
  schedules.

### R4. Route the late settlement of a cancelled or timed-out commit to `abandoned` instead of dropping it (closes G4; medium-high value, low cost)

- Operations O7's "after invocation it reports unknown and blocks late results" becomes "…reports
  `unknown`. Its eventual settlement is delivered once to the commit's `abandoned`, if it has one,
  and otherwise is evidence only. It never reaches outcome handlers."
- This makes `cancel`, `timeout` (R3) and leaving a fenced state (P2) share one late-result rule,
  and makes `abandoned` the single place where uncertainty is resolved. Rule 6's
  never-preempt-live-work guard already makes this safe.
- **Optional:** a `cancel` mode `"await"` (Temporal's `WAIT_CANCELLATION_COMPLETED`) that holds the
  outcome until settlement or until R3's timeout. Skip it unless an app needs it.
- **Cost:** one sentence plus a `flow check` reachability update. No new keyword.

### R5. Keep in-flight Attempts across version changes (closes G6; medium-high value, medium cost)

- Persistence O5 gains: "On `RestoreDiscarded`, acknowledged Attempts that are unsettled or
  settled but undelivered are kept in a version-independent record (operation id, key, Attempt
  id, encoded input, `createdAt`). After ready, each is delivered once to its transaction
  descriptor's `orphaned` handler if one is declared, and otherwise surfaces as an issue."
- The handler lives on the descriptor, not on a machine, because the machine shape may be gone. It
  receives the Attempt and may call `retry` (subject to R1) or invalidate reads.
- This is the browser's version of the engines' pinning: the code is new, but the obligation
  survives.
- **Cost:** one record kind, one descriptor option, and a decode path that does not depend on
  machine Schemas. Attempt input already has a structural encoding (Operations O3).

### R6. Let `abandoned` run commits, fenced to the actor (closes G8; medium value, low cost)

- P10 gains: "`abandoned` may list `actions`. A commit started there is fenced to the root, as a
  root `"self"` commit is (P2)."
- Document the saga recipe in the plans' guidance: a compensating commit declares `retry` on every
  definite tag with an unbounded schedule. It must be idempotent (R1), and its descriptor should
  declare `idempotency`.
- Do **not** add a `compensate:` option. Restate shows the explicit list in user code is enough,
  and a declarative form would need the "register before acting" ordering, which Persistence O6
  already provides by acknowledging Attempts first.
- **Cost:** one sentence. Rule 6 still forbids moving a busy actor.

### R7. Author-derived idempotency keys (closes G9; medium value, low cost)

- `O.x.commit(select, { attemptId?: ({ input }) => string })`, defaulting to the minted id.
- When it is given, two tabs, two actors or a double click submitting the same logical write share
  one key, and the server deduplicates (Temporal's "workflow id is the business key").
- Operations O3's "Flow mints a unique id" becomes "…mints a unique id unless the call derives one".
  Persistence O6's "never reuses an Attempt identity for an unrelated write" stays: a derived id is
  by definition the same write.
- Because mismatched input under one key is an error on Stripe-style servers, Flow should reject
  locally when a live Attempt with the same derived id has different encoded input.
- **Cost:** one option and one admission check.

### R8. Saved-state compatibility tests, the analogue of Temporal's replay test (closes G7; medium value, medium cost)

- Testing gains `story.restore(fixture)` (a captured scope from a previous build, checked into the
  repo).
- CI decodes every fixture with the current machines and descriptors. It fails when a fixture would
  produce `RestoreDiscarded` under the same `version`, when a fenced commit's activation no longer
  exists (P12), or when a history pointer (P5) names a removed state.
- `flow check --fixtures` can run the decode part statically.
- **Cost:** a fixture format (Inspection already exports captures) and one Story entry point.

### R9. Completion through another channel (closes G10; lower value now, design only)

- Do not add task tokens yet. Write the pattern in the Operations guidance: a commit returns
  `success({ token })` (the server accepted the job). The host enters a waiting state that
  subscribes to a resource keyed by the token, with a schedule-based deadline (R3's spirit).
- The restored actor then restores into the waiting state with `success` already delivered, rather
  than as `unknown`.
- Revisit only if two apps need it. A first-class "accepted" outcome would be Step Functions'
  `.waitForTaskToken` and would need heartbeat-like deadlines.

### R10. State the delivery contract once (low cost, clarity)

Add one sentence to Operations O3, in the style of the Step Functions guarantee table:

> Turns are exactly-once per publication. Outcome deliveries are exactly-once per actor
> incarnation. Remote invocations are at-most-once per Attempt invocation, and at-least-once per
> Attempt only under `retry` or `O.x.retry`.

P10's "each run must be correct on its own" becomes "`abandoned` handlers must be idempotent over
`(attempt.id, outcome)`".

---

## Sources

- Temporal, Retry Policies: https://docs.temporal.io/encyclopedia/retry-policies
- Temporal, Detecting Activity failures (timeouts, heartbeats): https://docs.temporal.io/encyclopedia/detecting-activity-failures
- Temporal, TypeScript cancellation (`ActivityCancellationType`): https://docs.temporal.io/develop/typescript/cancellation
- Temporal, Message passing (signals, queries, updates, validators): https://docs.temporal.io/develop/typescript/message-passing
- Temporal, Versioning (`patched`, `deprecatePatch`, worker versioning): https://docs.temporal.io/develop/typescript/versioning
- Temporal, Testing suite (time skipping, replay tests): https://docs.temporal.io/develop/typescript/testing-suite
- Microsoft, Durable orchestrator code constraints and versioning: https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-code-constraints
- AWS, Step Functions error handling (Retry, Catch, `States.*`): https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html
- AWS, Standard vs Express execution guarantees: https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html
- Restate, Invocations and idempotency keys: https://docs.restate.dev/concepts/invocations
- Restate, Versioning (deployments): https://docs.restate.dev/operate/versioning
- Restate, Sagas: https://docs.restate.dev/guides/sagas
- Stripe, Idempotent requests: https://docs.stripe.com/api/idempotent_requests
- IETF, The Idempotency-Key HTTP Header Field (draft): https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- H. Garcia-Molina, K. Salem, *Sagas*, SIGMOD 1987: https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf
