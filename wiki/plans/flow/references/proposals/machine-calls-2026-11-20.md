# Calls made from a machine: timing, waits, reloads and input (proposed, 2026-11-20; revised after review)

**Status:** Questions: the user accepted every recommendation (2026-11-20); see advisor-holes-2026-11-20.md, 17 to 21.

**Bottom line (proposed):** Flow adds no timing or retry option. Time spent *inside one send* (a deadline, an
immediate re-send of a failure that applied nothing) lives in the contract function's Effect; any wait the user
can see, and every wait between sends, lives in the machine (a state, a schedule, `O.x.retry`). Before invocation
a call waits only on facts Flow owns (acknowledgement, capture, and, if the user adopts it, the Host's offline
signal); a reload never sends work by itself. Every call's input, read or write, is decoded once at admission, and
the function receives the decoded value: the same value live and after a reload. The freedom removed: **a second
place to state a call's policy** (contract options, call-site overrides, a hidden Flow retry) and **a call input
the function receives without it having passed the decode**.

Answers question 5 of `advisor-questions-2026-11-20.md` (open items 4, 9, 10 and the lookup's input). Unblocks
@task.V3.T21. The lane record's fields are defined once in `saved-records-2026-11-20.md`; the decode is the shared
`decodeExit` of that file and `raw-throws-2026-11-20.md`; who holds a read is `fragment-lifetimes-2026-11-20.md`'s.

## Where the data comes from

`fetch` (or an SDK) → the app's adapter Layer (Effect `HttpClient`, `AbortSignal` from Effect's own interruption)
classifies the wire into tagged errors (`NoResponse`, `ServerError`, `Busy`) → the service (`ShopApi`) → the
contract function (`commit`/`lookup`), which is ordinary Effect and owns everything about *one send* → Flow
classifies the fiber's Exit into an ending → the operation's mapping → a machine event. `navigator.onLine` and the
`online`/`offline` events would be a Host fact, like `hidden`/`onHidden` today
(code:packages/flow-state-v3/src/host/host.ts#Host; no `online` member exists yet).
Prior art: TanStack Query pauses mutations while offline (`networkMode: "online"`) and resumes persisted paused
mutations only when the app registers defaults; XState and Effect have no offline concept.

## 1. Timing and retry (open item 4)

Already decided and kept: no timeout reason (@plan.Operations.O3: "a call's deadline is its commit's Effect"), and
Flow never retries automatically (O2, O3). The fixtures follow it: `pay` uses `Effect.timeoutOrElse` →
`Outcome.unknown(new TimedOut())` (code:packages/flow-state-v3/fixtures/services/shop/operations/writes.ts, line
56); `pay`'s `Busy` carries `retryAfterMs` into memory and `WAITING` re-commits on a schedule.

Proposed rule, one sentence each:

- **Inside the function:** the deadline, and an immediate re-send (no delay) of a failure the adapter classifies as
  having applied nothing (`Busy`), under the same `attempt.id`. Never a re-send after a lost answer: that is a doubt
  the machine must hear (`mayHaveApplied`). Flow sees one send; `retryCount` counts `O.x.retry` only, and hidden
  re-sends show as the adapter's own Effect spans.
- **In the machine:** every wait (a backoff, a `Retry-After`) and anything the user sees (a notice, a limit). A
  delay inside the function is a window in which nothing is on the wire, yet a cancel there still ends
  `unknown { Cancelled }` and holds the lane (@plan.Operations.O7), because Flow cannot tell the window from a
  send. Keeping delays in the machine removes the window; a cancel during an immediate re-send is a true doubt.
- **No per-call override:** a screen that needs another deadline uses another contract (or a non-key input field
  the function reads). No fixture needs one.
- **Streams are the one exception, already decided:** `reconnect: { schedule }` is a contract option because Flow,
  not the author, runs the next connection (O4).

```ts
export const pay = transaction({                                  // existing: transaction
  commit: (input, { attempt }) =>                                 // existing: commit, attempt
    ShopApi.use((api) => api.confirm(input, { idempotencyKey: attempt.id })).pipe(
      Effect.retry({ while: (e) => e._tag === "Busy", times: 2 }), // existing Effect: immediate, same Attempt
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),    // existing: Outcome.unknown
      Effect.timeoutOrElse({ duration: "60 seconds",               // existing Effect: the deadline
        orElse: () => Outcome.unknown(new TimedOut()) }),          // user-defined: TimedOut
    ),
  // ...id, input, key, concurrency, services as today
});
// Machine side, unchanged: Busy → WAITING { schedules: { retry: { schedule: ({ memory }) => memory.retryInMs } } }
```

The `Effect.retry` line is an illustration; no fixture has it yet. **Shown by:** a type test that
`transaction`/`resource` have no `timeout`/`retry` key; the existing `pay` Stories. **Cost:** a doc recipe; an
optional `flow check` hint when a commit's `Effect.retry` has a schedule or retries an `Outcome.unknown`.

## 2. What waits before invocation (open item 9; the user's choice, question 1)

Today an admitted Attempt waits in InFlight for its turn's acknowledgement, record queues and lane-record capture
(@spec.WriteLanes.R8). Reads wait on nothing, and "Offline status blocks and cancels nothing" (@plan.Operations.O2).

- **A. No offline wait (status quo).** The adapter maps a failed `fetch` to its own tag; the machine shows it. Cost:
  zero; every app writes the "you're offline" branch, and a never-sent write offline may be classified unknown.
- **B. Offline is one more wait, for writes only.** `Host` gains `online()`/`onOnline` (NEW; the browser Layer reads
  `navigator.onLine`, and an app whose browser reports offline wrongly provides its own). The core sees it as an
  input fact (deterministic, Story-steppable). A head waiting to be invoked stays waiting while offline: one more
  value of the lane's existing phase tag, `Waiting` (**proposed name**), after Acknowledging; no flag. It is a head
  like any other: its predictions stay shown and its lane's concurrency rule applies to later commits. Its exits
  are the ones @plan.Operations.O3 and O7 already give a head not yet invoked, by its history:

  | Exit | Never sent (`retryCount` 0) | A re-send |
  | --- | --- | --- |
  | online | sent | sent |
  | cancel | `NotSent { Cancelled }`, the next commit promoted | back to Held, released |
  | a `latest` replacement | `Superseded`, evidence | does not arise (Held is not replaced) |
  | disposal | nothing sent; stays in the record | the same |
  | reload | `NotSent { Restored }` (changes @spec.Restore.R3) | `unknown { Restored }`, as today |

  Reads stay ungated (they need an ending to render). `navigator.onLine === true` proves nothing, so
  classification is unchanged once sent.
- **C. B plus a per-contract opt-out** (`whenOffline: "send"`, proposed name) for local or service-worker APIs.

**Recommendation: B**, with C only when a fixture needs it. **Shown by:** a Story (`Fake` host goes offline, commit,
row waiting, fake server received nothing, online, one send), one per exit in the table; a run rule "no Invoke
while offline"; planted fault: invoke while offline. **Cost:** one Host member, one input, one phase value.

## 3. What survives a reload (open item 10; the user's choice, question 2)

Kept: an acknowledged Attempt restores `unknown { Restored }`; queued commits end `NotSent { Restored }`; one-off
reads are not persisted except a parked `Interrupted` (O3, @plan.Persistence.O4).

**Needed with §2-B:** a head that waited offline was captured but never sent, so restoring it as
`unknown { Restored }` would be a false doubt. The lane record's `head.phase` (saved-records; it replaces the
`inFlight` boolean) saves `Waiting`, and the phase change to `InFlight` is captured before the invocation, for a
head that waited only. With `retryCount` it tells the two reload rows above apart; nothing else is stored. A head
that never waited is sent right after its first capture, as today, so the common path pays nothing.

- **A. Never resume (status quo).** Every never-sent commit ends `NotSent { Restored }`; the machine (or the user)
  decides. Honest; no send nobody asked for in this session.
- **B. Resume never-sent work** (TanStack's `resumePausedMutations`): queued and waiting heads re-admit in order on
  reload. Costs: an age bound (open item 12's cousin), optimistic layers are not persisted (@spec.Reads I16) so
  the screen disagrees until settled, and it breaks "a commit starts only from an accepted action". (The queue is
  already in the lane record.)
- **C. Opt-in per contract** (`resume: true`, proposed name), serialize only, with a required age bound: an outbox.

**Recommendation: A** now; C later as an "outbox" feature if the user wants offline-first apps, built on §2-B.

## 4. Where a call's input is decoded

Today a write's input is checked by the operation's input walker at commit (`Unencodable` otherwise,
code:packages/flow-state-v3/src/core/lanes.ts), but the commit then receives the caller's own object through a
cast (`trusted`, code:packages/flow-state-v3/src/contract.ts), while the lane record saves the encoded text. The
two differ: the encoding drops fields the Schema does not name (spike `walk2.ts`), so a live send and a restored
`O.x.retry` of the same `attempt.id` can carry different bodies, which an idempotency-keyed API refuses. A lookup's
input is cast with no check at all, and types do not cover refinements: `memory.paymentMethodId ?? ""` type-checks
against a `NonEmpty` field.

Proposed rule: **one admission for every call, and the function gets what it produced.** The core encodes the
selected input by the operation's Schema and decodes that encoding back through `decodeExit`; that decoded value
is what `commit` or `lookup` receives, and for a write its text is what the lane record saves. `trusted` goes. A
write that fails declines `Unencodable`, as today. A one-off `lookup` that fails ends `Defect` (a read has no
`NotSent`) with an actor issue `InvalidInput` (**proposed name**) and no request. A live resource whose input fails
is question 3: its input often follows memory the user is still typing. **Shown by:** a Story whose select returns
`""` for a `NonEmpty` key (fake server received nothing); a Story that commits with a stray field, reloads and
retries (the fake server sees the same body twice); a run rule "every Invoke/Lookup input `is` its Schema and
equals its record's decode"; planted faults: skip the decode on lookup; pass the caller's object.
**Cost:** one encode and decode per call, unmeasured (bench with T21); the text is kept per input, as now.

## Fixtures

| App, call | Timing today | Offline (2-B) | Reload (3-A) | Input (4) |
| --- | --- | --- | --- | --- |
| shop cart `addLine`, `setQuantity` | unknown on `NoResponse` | waits | queued edit → NotSent | decoded |
| shop `pay`, `intentStatus` | 60 s; `Busy` → `WAITING` | pay waits; lookup fails | unknown, as today | lookup new |
| transfers `transfer`, `balance` | 30 s; `retryable(times: 1)` | waits, not unknown | unsent → NotSent | lookup new |
| sign-in `save`, `me` | `retryable(times: 3)` in machine | waits | as transfers | lookup new |

No fixture needs a Flow timing option or a per-call override; every visible retry is already a machine state.

## Spikes

- `q5/walk.ts` (bun, real `walkerOf`): the commit path's walker rejects a refinement failure, a wrong type and a
  missing field, and accepts extra fields; the same walker suffices for lookups.
- `q5/retry.ts` (`tsc --strict`, real `transaction`/`resource`): `Effect.retry({ schedule, times, while })` and
  `Effect.timeoutOrElse` inside `commit` and `lookup` type-check today, error tags intact.
- `holes/walk2.ts` (run, real `walkerOf`): `text({ intentId: "x", stray: 1, at: Date })` saves
  `{"at":"1970-01-01T00:00:00.000Z","intentId":"x"}`; the live commit receives the object with `stray`.

## Open questions for the user

1. **Offline wait (item 9).** A: none. B: writes wait on the Host's offline signal (recommended). C: B plus a
   per-contract opt-out.
2. **Never-sent work on reload (item 10).** A: never resume (recommended now). B: resume all. C: an opt-in outbox,
   later.
3. **An invalid input on a live resource.** A: `Defect` and an `InvalidInput` issue, as for a one-off lookup. B: the
   resource is not placed while its input is invalid, with evidence only, as a `resetOn` of null is not placed
   (recommended: a search box's `""` is correct code, not a defect).
4. **Hidden re-sends inside the function.** A: allowed only immediately and only for a failure that applied
   nothing; every delay goes to the machine; `flow check` hints otherwise (recommended). B: none; every re-send
   goes through `O.x.retry`.
5. **Per-call deadline override.** A: none, use another contract (recommended). B: an option on `O.x.commit`.

## Uncovered

- Stream sessions under offline (O4 already "retries while offline"); not revisited.
- Prior-art claims about TanStack Query were not re-read from source; check before adopting question 2 C.
- Domain writes (`EntityDomains`): a waiting head holds its record queue while offline, by the rule above; the
  interplay with entity repair was not checked.
- The cost of encode-then-decode per call, and whether a non-idempotent transformation Schema makes the decoded
  value differ from what the select returned in a way an author would not expect.
- `Waiting` after disposal when the connection returns: nothing sends (O7); the next boot ends it by the table.

## Revision log

Review = the Sonnet review; Hole and HQ = `advisor-holes-2026-11-20.md` §5 holes and questions. No sidecars were
started for the revision; items were checked against `record.ts`, `lanes.ts`, `contract.ts`, `host.ts` and
@plan.Operations.O3 and O7.

- Review 1: fixed. No `sent`; `head.phase` replaces `inFlight` in the one lane record (saved-records).
- Review 2: fixed. `retryCount` tells a first send from a re-send; the exit table covers both.
- Review 3: fixed. `Waiting` is a phase value after Acknowledging, not a row flag.
- Review 4: fixed in the text (a waiting head is a head: predictions stay, concurrency applies); repair Uncovered.
- Review 5: fixed. `Host.online` is marked NEW and replaceable by the app; a wrong offline report has `cancel`.
- Review 6, Hole 2, HQ3: fixed as a rule (immediate re-sends of applied-nothing failures only); question 4.
- Review 7: fixed. `retryCount` counts `O.x.retry` only; hidden re-sends are the adapter's spans.
- Review 8: fixed. The deadline's real location is cited; the retry line is marked an illustration.
- Hole 1, HQ1: fixed. The function receives the decoded value, the same live and restored; `trusted` goes.
- Hole 3, HQ2: left to the user (question 3).
- Hole 4, HQ4: fixed by the exit table, using O3's and O7's existing endings; rejected: new `Disposed` and
  `Superseded` reasons (O3 already ends a replaced never-sent head `Superseded` as evidence, not as a doubt).
- First-pass question 3 (`sent`): dissolved by `head.phase`. Its claim that resume needs the queue stored was
  wrong: `encodeLane` saves `queue` today.
