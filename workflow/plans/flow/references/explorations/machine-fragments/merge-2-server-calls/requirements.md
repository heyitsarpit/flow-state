# Synthesis: requirements and problems for server calls in the machine

Sources: the 51-case interaction catalog (`../calls/catalog.md`), the prior-art survey
(`../calls/prior-art.md`), 21 use cases built by five builders against
`in-machine-calls-proposal.md` (about 5,800 lines in `payments/`, `editing/`, `auth/`, `jobs/`,
`lifecycle/`, each with a `FRICTION.md`), and four reviews (`reviews/correctness.md`,
`complexity.md`, `specification.md`, `workarounds.md`). Review finding ids are cited as
`correctness C1`, `complexity C2`, `workarounds W3`, `specification Q-5`.

## Part 1. Requirements, as features

Every requirement below appeared in at least one real product case. Ids R1…R36.

### Starting a write, and its identity

- **R1** Start a write from a user action, with input from the actor's state and the triggering
  event, including values written in the same turn.
- **R2** Each write has a stable identity (the Attempt) that survives re-sends and reload and is
  the server's idempotency key.
- **R3** Tell a new write (new identity: a new card, merged content) from sending the same write
  again (same identity). A replaced write is never re-sent.
- **R4** Several independent writes on one screen, per row or key (list items, challenges,
  documents), concurrently.
- **R5** At most one write in flight per key, with a defined answer when another is declined. A
  decline is never a silent no-op.
- **R6** Latest-wins coalescing for intent that changes faster than the server (rapid toggles,
  autosave while typing), where a failed older write never undoes newer intent.
- **R7** Order per key where order matters, including writes that depend on an earlier create
  (temporary id replaced by the server's id).

### Endings

- **R8** Every write ends in exactly one classified ending that reaches the machine. Nothing is
  silently lost: not a decline, a cancel, a restore, or an ending after the user left.
- **R9** Endings are typed and exhaustively handled, but only endings that can actually occur
  must be handled.
- **R10** An ending means something about the **write**, not one send: a definite failure on a
  re-send of a write whose earlier send was unknown does not prove it did not happen.
- **R11** A success that is not completion (3DS `requires_action`, `202 Accepted`) leads to a
  follow-up step.
- **R12** Per-item results of a batch (some done, some failed, some unknown), with the cache rules
  applied per item.
- **R13** An ending reaches the activation that is current when the machine handles it, not the
  one that was current when the network settled.

### Waiting and time

- **R14** Show "still working" after a delay without cancelling.
- **R15** Stop waiting (soft) while the write continues and its real ending still counts.
- **R16** Abort a hung request (hard), and know the write is now uncertain.
- **R17** A deadline racing a write (a seat hold expiring during payment) has a defined winner.
- **R18** Time rules per key: a lockout per challenge, a cooldown per phone number, a retry timer
  per row.
- **R19** Honour delays the server dictates (`Retry-After`, "cooldown until T").

### Retry and recovery

- **R20** A visible retry with a budget the user can see ("retrying 2 of 3"), stopping when the
  user leaves. A manual retry after giving up gets a fresh budget.
- **R21** Invisible transport retries inside the commit.
- **R22** Reconcile an unknown: send the same write again (idempotent), or read the resource to
  learn the truth.
- **R23** Interpret a response using the write's history (404 on a re-sent delete means already
  done).
- **R24** Send the same write again after a sub-flow (step-up, sign in again), or send a modified
  write (new etag, merged text) as a new identity.

### Leaving, lifetime and compensation

- **R25** Leaving a screen mid-write does not cancel it; its ending still updates the app
  elsewhere (a toast) without moving the user.
- **R26** Compensate a write whose result arrived after the user left (refund, release a hold).
  Compensation may need its own retries and must be able to finish.
- **R27** A late result never takes the user out of live work.
- **R28** Cancel what can be stopped (upload, generation), with defined behaviour when nothing is
  running, when it already settled, and when it races its own completion; clean-up must not race
  the request that is still running.
- **R29** Writes that must complete although the page is closing (undo send, unsaved flush):
  guaranteed, or explicitly out of scope with the server-side alternative named.
- **R30** Reload mid-write: the write's identity and ending continue.

### Reads around writes

- **R31** Poll a long job with backoff until it ends; a status read is not a write.
- **R32** Truth that arrives on another channel (webhook, stream ack) completes the write.

### Data and type flow (the reason the operations side exists)

- **R37** Every value the machine uses has a traceable path from its real source to where it is
  read, with its type preserved at each hop and inferred, never asserted:
  browser or library API → service (adapter) → commit → `Outcome` channel → Attempt → the call's
  mapping → event payload → memory → guard, view and Story. Types follow from the commit's
  Effect, not from parallel declarations, and a hop that loses a type (a `!`, a cast, `unknown`)
  is a defect.
- **R38** The same path runs with a fixture in place of the real service, so a Story exercises
  the real classification and mapping code.

### Observability, testing, analysis

- **R33** Views and guards can read, per key: in flight, waiting to retry, tries so far, last
  ending.
- **R34** Stories mock the server through services, control time, assert server truth, and can
  produce every ending (including `NotSent` and `unknown`).
- **R35** Statically analysable: endings, schedules and retries are visible to `flow check`.
- **R36** Errors carry information, not configuration. Flow interprets no HTTP status and no
  author error type.

## Part 2. Problems hit with the current proposal (verified, deduplicated)

Ranked. "Hit by" counts builders whose code showed it.

| # | Problem | Rank | Hit by | Evidence |
| --- | --- | --- | --- | --- |
| P1 | `outcomes` vs `abandoned` is chosen at settlement, but the event is handled later from the mailbox. A queued `StopWaiting` or `Back` ahead of the ending misroutes it: the wrong-code strike, the ride cancellation fee and the batch result are lost. Rule 1 never says when "while active" is tested. | high | 3 | correctness C1; specification Q-2; auth FRICTION 4 |
| P2 | A failure on a re-sent Attempt is treated as "definitely did not happen" although an earlier send was unknown. Checkout: send 1 unknown but charged, re-sends get `Busy`, the machine shows "not charged", Pay mints a new key, the card is charged twice. | high | 3 | correctness C3 |
| P3 | `.pending` turns false at settlement, before the ending's turn. `cancel` is undefined when nothing runs, when it settled, or when the ending is undelivered. A timeout and an ending queued together show "not charged" and drop the late result. | high | 3 | correctness C2; workarounds W5; specification Q-5 |
| P4 | v4 rule 6 forbids the compensation chain `abandoned` exists for: a refund's outcomes are late turns that may not move the actor, so the refund can never finish. v4 rule 12 forbids outcome handlers outside the fenced state, which `abandoned` plus root handlers needs. | high | 2 (3 BREAKS) | correctness C4; specification Q-4 |
| P5 | `concurrency: "reject"` declines a commit with no ending (Operations O3: "without work or outcome"), contradicting rule 1. The state waits forever; a declined poll stops polling. Every build added a `!pending` guard at every start. 29 of 31 transactions chose `reject`. | high | 4 | correctness C5; workarounds W2; specification Q-1 |
| P6 | `O.x.retry(attempt)` has no defined mapping or fence, so a re-sent Attempt can end in no event. Five builds wrote five spellings (`retry(select, options)`, `send.retry`, a stored mapping, none). | high | 5 | correctness C7; workarounds W7; specification Q-3 |
| P7 | An unmapped `unknown` in `abandoned` is dropped, so a charge after leaving is never reconciled. There is no explicit "ignore"; `abandoned` copies `outcomes` in 3 of 5 builds. | high | 5 | correctness C6; complexity C7 |
| P8 | `cancel` is final while the request keeps running (unwired signal, or a body already sent): a clean-up `discard` runs before the file lands (orphan), and a retry after cancel can run beside the first request. | high | 2 | correctness C8 |
| P9 | The Attempt is relayed by hand: event field, mapper, nullable memory, copy, clear, `!` at every `retry`. 47 `!` across the builds; a wrong one is a runtime crash nothing flags. `sends` cannot reset, so a fresh manual budget needs `giveUpAt = sends + MAX`. | high | 5 | complexity C2; workarounds W1 |
| P10 | Event plumbing: each ending is renamed in four places (error class, `internalEvents` entry, mapper, handler). 200 internal events in 17 machines; M1's save is ~60 lines across 3 files against an 8-line plain sketch. | high | 5 | complexity C1 |
| P11 | `NotSent` must be mapped on every commit: 40 mapping lines against 6 `cancel` uses, often to an invented message; Stories cannot produce it. | medium | 5 | complexity C3; workarounds W11 |
| P12 | The visible-retry recipe is ~25 lines per loop against ~2 in plain code, written 4–7 times; `armOn` arms on the give-up branch too. A CALL/WAIT state split was shorter and correct. | medium | 4 | complexity C4; workarounds W10 |
| P13 | Commit selects read the pre-turn snapshot (Machines O3), unstated in the proposal: near-duplicate commits (`overwrite`/`merge`/`flushAfter`, `sendNow`/`sendOnExit`) and a stale etag sent in the same turn it is written, producing a false 412. | medium | 4 | correctness C10; complexity C5; workarounds W6 |
| P14 | Which memory a schedule function reads when it arms is unspecified; if pre-turn, the backoff is 0 and `Retry-After` is ignored. `armOn` on an ancestor-accepted event is unspecified. | medium | 3 | correctness C11; specification Q-8 |
| P15 | No per-key schedules and no time in guards: a 45-line earliest-lock timer, a tick over "the first unsure row" that fires spuriously, one undo window instead of a stack. | medium | 3 | workarounds W3 |
| P16 | No coalescing concurrency: rapid toggles took ~75 lines against ~10; "queue dependent writes behind a create" was silently not met. | medium | 2 | workarounds W12; complexity C9 |
| P17 | Per-item batch results are smuggled inside the success value, so per-item unknowns get no cache rule. | medium | 1 | workarounds W8 |
| P18 | Polling was written as a transaction (an Attempt and `unknown` for a GET) or as `refetch` plus a schedule: two builders, two ways. | medium | 2 | workarounds W9 |
| P19 | A page-exit flush cannot send: the mailbox is async and Persistence O6 waits for the Attempt to be stored. | medium | 1 | correctness C9 |
| P20 | Stories cannot assert server truth or produce every ending; assertions are written as comments in every Story file. | medium | 5 | workarounds W13; complexity C10 |
| P21 | Re-sending a settled failure with the same key can return the server's cached failure (idempotency stores failures too). | medium | 1 | correctness C12 |
| P22 | Contradictions: `unknown` may target only `Flow.uncertain` events (outcome proposal, v4) but the calls proposal maps plain events; cancel-before-invocation is silent (Operations O7) vs `NotSent` (rule 4), unmentioned in the change list; `Timeout` is still a Flow reason in the outcome proposal. | medium | 4 | specification |
| P23 | Operations side: no build used `Effect.retry` in a commit, so the "invisible retry" layer went unused; four key selectors returned a scalar (a builder mistake, but the proposal's examples never show `key`). | low | 3 | my pass over the 31 transactions |

## Part 3. What worked (keep)

- Classifying in the commit with `Outcome.*`, beside the status it reads; decode errors mapped to
  `unknown`; `Effect.timeoutOrElse` returning `Outcome.unknown`.
- Exhaustive `failure` mappings by tag.
- A new Attempt for a new card, so a declined write is never re-sent.
- `abandoned` for "charged after the user left".
- Services as the network boundary, fixtures as stateful fake servers.
- Soft waiting as a schedule; "still working" as a schedule.
