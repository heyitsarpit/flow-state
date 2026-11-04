# For Arpit's read: the v3 prototype phase

Status: **everything here is proposed** unless marked **decided** (you said yes). Written at `3425db81`, branch `flow-rewrite`. Paths are under `packages/flow-state-v3/prototypes/`. Read this to accept or overrule each call before production starts. Answer section 7 as `Q1 A`.

## 1. Status in five lines

- **Proves:** the runtime keeps Pay's money path correct (one charge, no hold lost) across kills, reloads, bfcache, a torn store and Safari. 761/761 cases with searches, every gate shown to fail on a broken runtime, and 75 of 75 lying runtimes caught (`round-13/RESULTS.md`).
- **Proves:** the public API compiles to `Compiled` and the suite boots only that output (round 12). Eight Stories run in the Story API. `flow graph` matches 78,543 observed turn parts with 0 disagreements (round 13).
- **Doesn't prove:** entities, streams, record migration, React, phones, production performance budgets. Safari ran once, on its own, and real browsers were not rerun on round 13.
- **Last verdict** (`round-13/review.md`): the Story API, `flow story/trace/graph` and targeted lies can be built on. D221 and D222 can't yet: H1 and H2 (section 5).
- **Your input is needed** on the 20 calls in section 2 and the 8 questions in section 7.

## 2. Your calls

"Rec." is my recommendation. Decision ids link to `convergence-N.md`.

| # | Call | Old → new behaviour | Why | Id | Rec. |
| --- | --- | --- | --- | --- | --- |
| 1 | **First-send click loss** (2.10.15) | A kill before the first send lands: `NotSent { Restored }` → the state before the click comes back with no message (`PAYING` → `CARD`) | A first send is one batch, so a head on disk may have been sent. Nothing was charged. | D86, D96 (`round-7/RESULTS.md`, `convergence-8.md`) | Accept (Q3) |
| 2 | **H3: Chrome wipes the origin on a torn log**, so money needs business keys | A kill can tear LevelDB's log. The next open deletes the whole origin, holds included. With `idempotencyKey: attempt.id`, a second key can go out beside an unsure first. With a business key the server sees one key. | Chrome does it by design (`round-8/RESULTS.md`, "H3"). Every site is exposed. | REV8-WIPE; enforcement is D121 | Business keys for money: **decided** (`round-8/RESULTS.md`). Enforcing them as contract data is proposed (Q6) |
| 3 | **A second tab's Pay button is dead** | A tab without the lock may send → it ends `NotSent { NoPersistence }`, "Your payment wasn't sent. You haven't been charged." | Cross-tab exactly-once isn't promised. Declining is the honest answer. | D26 (`round-7/RESULTS.md:227`) | Accept for now (Q4) |
| 4 | **5 s capture interval and the hidden flush** | Plain memory coalesces at 5 s, with a flush on `visibilitychange` hidden and on `pagehide`. Lane and send writes are not delayed. | 100 ms would throttle the app. Safari loses the last batch on tab close (0/6), so on Safari the loss window is 5 s. | D80 | **Decided** (2026-11-02). The Safari loss is new for you to read |
| 5 | **A spin is never stopped or slowed** | D110 rate budget → D115's slowing to 1 per 30 s → nothing paced, dropped or cut. Mail is served in slices that yield to the page. A spin runs at task rate, hidden tabs included. | "Every ask ends" is correct only without a cut. A backoff belongs on an explicit retry. | D122; hidden tab: `convergence-10.md:332` | Accept (Q5) |
| 6 | **Mail order across actors is per actor** | Global FIFO → follow-ups first. Otherwise one mail per actor, taken in rotation, oldest first within an actor. Nothing orders two actors' turns unless a turn links them. | Bulk work on one actor must not starve another | D122, rule 4 (`convergence-10.md:326`) | Accept. Entities must not assume a global order |
| 7 | **Rule 32 is replaced by two levels of doubt, with no clock** | A later write's success clears a mark → it can't, and neither can time. After give-up, `uncertain` lasts until the next read, then `unconfirmed` (quiet) until proof. A seen version past `basedOn` proves it. | A clock is a guess that decides. Rule 32 ends "unmarked and wrong" in 13 of 13 traces. | `round-9/entity-proposal-2.md` §5 | Accept (Q7). Plan edits wait for your yes |
| 8 | **A mapper that throws ends in `Defect`** | A read's domain mapper throws, or returns something with no shape → the read fails with `Defect`, and the store's `UserClosure` says why. Before, the machine heard `Listed`. | A machine must not believe it has data nobody stored | D147 | Accept |
| 9 | **bfcache releases the lock, and a return reloads** | The page held the lock for its whole life → it releases the lock on `pagehide persisted` after its flush. `pageshow persisted` reloads, which is a new boot. | Without it, the next page isn't the owner (Chrome). Safari drops the lock while cached anyway. | D148 | Accept. It's a host requirement (section 6) |
| 10 | **A turn refused twice is kept** | Each kind had its own fate → one rule: it stays with what owes it and ends with that. A kept ending gets one try per boot. It blocks its key (`Rejected`), and `cancel` lets it go. | Nothing a turn owes is lost silently | D118, D123 | Accept |
| 11 | **Key fields are required** | Rule 39 said "no default" but nothing checked it → an optional or defaulted key field is refused at compile time (`KeyFieldOptional`) | A missing value is never a key value | D221 | **Decided** |
| 12 | **Key fields are part of an op's version** (D217 → D221) | D217 matched an older lane by shape. The first D221 matched by projection and then renamed. Now a release that changes the key's field set makes a new version of the op. An old lane is an old-version hold, never renamed. **Every** commit of that op declines until the hold ends. | Three inference designs failed review. Old and new can't be compared, so the upfront contract is the honest one. | D221 | Accept the rule. Fix H2 and M3 first (Q1, Q2) |
| 13 | **One default per field** | A constructor default at creation and a decoding default at restore → one default, used at both. Two different defaults are refused (`TwoDefaults`). | Splitting by entry point quarantined old actors or refused creations | D222 | Accept the rule. The code has H1 |
| 14 | **The codec choice** | `JSON.parse(JSON.stringify(compiled))` plus a code table → no runtime codec. The compile runs in the same process, and the Runtime boots `machine()`'s output. Tools read `toData`. Records are stored as JSON strings. | It is the only form where the suite's object is production's. Pay compiles in 0.035 ms warm. A string put beats an object put in Chrome (2.4 vs 3.1 ms at 1.7 MB). Safari wasn't measured. | D194 (`round-11/codec/`, `round-11/RESULTS.md` "The codec") | Accept. Measure Safari in production |
| 15 | **Services on contracts** | The commit's `R` was a type only → `services: [ShopApi]` beside `commit`, and `servicesFor(machine, ctx)` at boot | A boot that lacks a service is refused by name. Inspection can print requirements. | D213 | Accept. In production it becomes a `Layer<R>` |
| 16 | **The Story API as built** | Design 2.10 → the subject is a `Fixture` (machine plus client half). Sends come from `story.E`. `options.fakes: [Shop]`. `Fake.call({ route })` answers `{ ok }` or `{ fail }`. `run()` is synchronous. `reload()` works on a machine Story. A request can be `aborted`. | Each is a slot the harness lacks (a fixture Layer, a lane listing, a microtask executor) | D224 (`round-13/api-changes.md`) | Accept as prototype spellings. Rebuild against the design in production (Q8) |
| 17 | **`flow trace` runs a Story**, with no trace file | `trace summarize <file>` → `flow trace <id> [--at cp]` | There's no trace file format yet | D225 | Accept |
| 18 | **`flow graph`: one edge per alternative**, marked `late`, `shadowed`, `unreached` or `unsourced` | Nodes and edges → an edge named by its own place in the source, so it matches what the runtime reports | That shared name is what makes the graph a conformance check | D226, D227 | Accept |
| 19 | **Smaller calls** | `1n` as a key restores as `"$1n"` (D119). The lie gate runs only on recorded cases by default (D228). A kept ending stays in `W` and shows it (round 8 call 1). | | D119, D228 | Accept |
| 20 | **The ending check's 15 stated limits** | L1-L15: cases that would pass, each with why it stays | One row, for you to accept as limits | `conformance-audit/ending-check-design.md` §4 | Accept. L3 (no order across actors) follows from call 6 |

## 3. One real example: Pay in the public API, after rounds 11-13

A trimmed copy of `conformance/typed/pay.ts`, which the suite boots: only the pay and intent operations, with PAYING and UNSURE. Every line is the real spelling.

```ts
// existing: transaction, resource, definition, machine, Flow.initial, Flow.uncertain, deny, Outcome, outcomes, schedules, armOn
// NEW (D213): services, servicesFor          RENAMED (round 12): lookup (was commit on a resource)
// RENAMED (round 12): O.pay.retryable(k, {times}), O.pay.retry(k) (were .retryable({times,key}), .retry.key(k))
// user-defined: ShopApi, pay, intentStatus, Pay, IDLE..PAID, every event name, capturable, intent
import { Context, Effect, Schema } from "effect";
import { Outcome } from "../fixtures/compiled.ts";
import { definition, deny, Flow, machine, resource, servicesFor, transaction } from "../compile/index.ts";

// Where the data comes from: the app's own fetch client, wrapped in an Effect service. Flow is not a network library.
type Lost = { readonly _tag: "NoResponse" } | { readonly _tag: "ServerError" };
type CardDeclined = { readonly _tag: "CardDeclined"; readonly code: string };
class ShopApi extends Context.Service<ShopApi, {
  readonly confirm: (i: { intentId: string; paymentMethodId: string }, o: { idempotencyKey: string })
    => Effect.Effect<{ status: string }, CardDeclined | Lost>;
  readonly intent: (i: { intentId: string }) => Effect.Effect<{ status: string }, { readonly _tag: "NoResponse" }>;
}>()("ShopApi") {}

const pay = transaction({                                     // existing
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  key: ["intentId"],                                          // D221 (decided): a required, default-free field
  concurrency: "reject",
  services: [ShopApi],                                        // NEW (D213)
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) => api.confirm(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catch((e) => e._tag === "CardDeclined" ? Effect.fail(e) : Outcome.unknown(e)), // lost → unknown
    ),
});
const intentStatus = resource({                               // existing
  id: "Checkout/intent-status",
  input: { intentId: Schema.String },
  key: ["intentId"],
  services: [ShopApi],                                        // NEW (D213)
  lookup: (input) => Effect.flatMap(Effect.service(ShopApi), (api) => api.intent(input)), // RENAMED from commit
});

const Pay = definition({                                      // existing
  id: "Checkout/Pay",
  states: ["IDLE", "CARD", "PAYING", "UNSURE", "PAID"],      // RENAMED (round 12): an ordered list, was a nested object
  events: { Start: { intentId: Schema.String }, PayRequested: { paymentMethodId: Schema.String } },
  internalEvents: {
    Confirmed: { status: Schema.String }, Declined: { code: Schema.String },
    PayUnsure: Flow.uncertain({}),                            // existing: the only kind an `unknown:` may name
    CheckTick: {}, IntentRead: { status: Schema.String }, IntentReadFailed: {},
  },
  memory: {
    intentId: Flow.initial(Schema.String, ""),                // D222: this constant is the field's one default
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    pay: pay.outcomes({
      success: E.Confirmed.from((v: { status: string }) => ({ status: v.status })),
      failure: { CardDeclined: E.Declined.from((e: CardDeclined) => ({ code: e.code })), NotSent: E.Declined.from(() => ({ code: "not_sent" })) },
      unknown: E.PayUnsure,
    }),
    intent: intentStatus.outcomes({
      success: E.IntentRead.from((v: { status: string }) => ({ status: v.status })),
      failure: { NoResponse: E.IntentReadFailed, Defect: E.IntentReadFailed, Interrupted: E.IntentReadFailed }, // Defect: D147
    }),
  }),
});

const capturable = ({ event }: { readonly event: { readonly status: string } }) =>
  event.status === "requires_capture" || deny("NotAuthorized");
const intent = ({ memory }: { readonly memory: { readonly intentId: string } }) => ({ intentId: memory.intentId });

export const PayMachine = machine(Pay, ({ S, E, O }) => ({   // existing
  default: S.IDLE,
  states: {
    IDLE: { on: { Start: { target: S.CARD, updateMemory: ({ event }) => ({ intentId: event.intentId }) } } },
    CARD: { on: { PayRequested: { target: S.PAYING, actions: [O.pay.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }))] } } },
    PAYING: {
      on: {
        Confirmed: [{ target: S.PAID, guard: [capturable] }, { target: S.CARD }],
        Declined: { target: S.CARD, updateMemory: ({ event }) => ({ notice: `Your card was declined (${event.code}).` }) },
        PayUnsure: { target: S.UNSURE },
      },
    },
    UNSURE: {
      schedules: { check: { schedule: "3 seconds", send: E.CheckTick, armOn: ["entry", "CheckTick"] } },
      on: {
        CheckTick: { actions: [O.intent.lookup(intent)] },
        IntentRead: [
          { target: S.PAID, guard: [capturable], actions: [O.pay.cancel(intent)] },
          { target: S.PAYING, guard: [O.pay.retryable(intent, { times: 3 })], actions: [O.pay.retry(intent)] }, // RENAMED
          {},
        ],
        IntentReadFailed: {},
      },
    },
    PAID: {},
  },
}));
// At boot: servicesFor(PayMachine, Context.make(ShopApi, shopApi))   // NEW (D213), typed by the machine's R
```

What the CLI prints for the full typed Pay (`bun round-13/cli/flow.ts …`, run once at `3425db81`):

```text
$ flow explain typed-pay --state UNSURE --event IntentRead
IntentRead in UNSURE (Checkout/Pay), nearest first
  [0] states.UNSURE.on.IntentRead[0]  -> PLACING
      guard    states.UNSURE.on.IntentRead[0].guard[0]  opaque: stopped here, nothing was run
      cancels  pay (Checkout/pay, one lane per intentId)
      commits  place (Checkout/place-order, reject, one lane per cartId)
  [2] states.UNSURE.on.IntentRead[2]  -> PAYING
      guard    pay.retryable, 3 times: a lane fact, known only at run time
      retries  pay (Checkout/pay, one lane per intentId)
  [3] states.UNSURE.on.IntentRead[3]  -> self
decided statically: no. 2 of 3 alternatives depend on values

$ flow graph typed-pay          (first lines of 51 edges)
flow graph Checkout/Pay: 10 nodes, 51 edges; 14 depend on a value, 0 late, 0 shadowed, 0 unreached, 1 unsourced
  root -CartLoaded-> self                  on.CartLoaded[0]   unsourced
  PAYING -Busy-> WAITING                   states.PAYING.on.Busy[0]   if closure:states.PAYING.on.Busy[0].guard[0]
  WAITING -RetryNow-> PAYING               states.WAITING.on.RetryNow[0]   if idle:pay(k); commit:pay

$ flow trace checkout/reload-mid-charge      (abridged)
[2] send PayRequested {"paymentMethodId":"pm_card"}   t=0  PAYING
         4  mint     pay  att-1-1
      wire  Shop.confirm  held  att-1-1
      checkpoint sent  seq 8
[4] reload main   t=0  UNSURE
         9  ending   pay  unknown Restored  att-1-1
[5] world Shop.confirm.release()   t=0  UNSURE
      wire  Shop.confirm  held -> orphan  att-1-1
[7] advance {"next":{"schedule":"check"}}   t=3000  PAID
        22  turn     IntentRead  UNSURE -> PLACING  states.UNSURE.on.IntentRead[0]
        31  turn     Placed  PLACING -> PAID  on.Placed[0]
      checkpoint settled  seq 32
```

The Story behind that trace is `round-13/story/pay.story.ts`, `reloadMidCharge`. One fact for you: Pay's `CartLoaded` has no source in the pinned Pay. Only FRAG-09 sends it.

## 4. The API change log, rounds 11-13

Full lists: `round-11/api-changes.md`, `round-12/api-changes.md`, `round-13/api-changes.md`. The main changes, all proposed except the key rule:

| Change | Before | After |
| --- | --- | --- |
| Placement lives in the definition (round 12) | `traits: { x: { fragment: F, ...fill } }` in the body, plus `places` | `traits: { x: F }` in the definition, and the body fills `traits.x` |
| State tree (round 12) | `states: { A: {}, B: { C: {} } }`, bodies flat by id | `states: ["A", { B: ["C"] }]`, bodies nested the same way (`UnknownState` otherwise) |
| Fragment constructors (round 12) | `fragment(d, b)` | `trait(d, b)`, `subroutine(d, b)`. `Lockout(...).each({ of, max })`, `Countdown(...).resumable()` |
| Lane members by key (round 12) | `O.x.retry.key(k)`, `O.x.retryable({ times, key })` | `O.x.retry(k)`, `O.x.retryable(k, { times })` |
| A resource's function (round 12) | `resource({ commit })` | `resource({ lookup })` |
| `unknown` by reason (round 11) | `unknown: { byReason: { NoResponse: E.Unsure } }` | `unknown: { NoResponse: E.Unsure }`, and only `Flow.uncertain` events (`UnknownNotUncertain`) |
| An optional field (round 11) | `Flow.absent(Schema.Unknown)` | `Schema.optionalKey(Schema.Unknown)` |
| An exit behind a guard (round 12) | `{ guard, exit: exits.Done.from(f).exit }` | `{ guard, target: exits.Done.from(f) }` |
| Services (round 12, D213) | the commit's `R`, as a type only | `services: [ShopApi]`, plus `servicesFor(machine, ctx)` |
| Defaults (round 13, D222) | the creation default and restore default could differ | one default per field, `TwoDefaults` refused |
| Key fields (round 13, D221) | unchecked, and lanes renamed across releases | required (**decided**). A changed field set is a new op version (proposed) |
| `Compiled` (round 13, D223) | fragments: only nodes and memory | plus `kind`, `events` with payloads, and `ports` |
| Stories (round 13, D224) | 2.10 | section 2, call 16 |

## 5. Open: must fix before production builds on them

From `round-13/review.md`. Each fix is small.

- **H1. D222's default is computed once and reused for every actor.** `withConstructorDefault(Effect.sync(() => new Date()))` or a `randomUUID()` gives every actor the same value, and creation and restore freeze different values. Fix: keep only "has a default" as data, evaluate the default per call at each entry point, and check `TwoDefaults` on the Schema's structure rather than its values. Pin it with a counter default. File: `conformance/compile/memory.ts:45-125`.
- **H2. D221 tells key versions apart by field names only.** Change `k` from `S.String` to `S.Number` under the same name: no `OldVersionLane` appears, and a second charge `att-1-2` is sent beside the unsure `att-1-1`. Fix: stamp each lane with a fingerprint of the key's field set plus each field's encoded JSON Schema. What counts as "the same encoding" is your call (Q1). Files: `round-13/lane.ts:539-554`, `gate.ts:243-247`, `durable.ts:91`.
- **M1.** The graph gate checks only one direction, two of its checks confirm themselves, and the gate itself is never falsified. Falsify it and run it on every final commit.
- **M2.** 7 of D221's 12 paths have no pinned case, including a send while an old hold is on the wire.
- **M3.** D221's cost to an app: every key is blocked, with no end date. The app sees `Rejected`, and the only keyed way out is an `as never` cast. Proposed: `previous: [{ key }]`, `NotSent { OldVersion }`, and `OldVersionLane` as an issue (Q2).
- **M4.** `flow story list` prints `callbacks run: 0` as a constant (`cli/story.ts:128`).
- **M5.** A key-less `cancel` of an unsure hold inside its own `unknown` handler is flagged red by oracle (h). It isn't settled whether the runtime or the ledger is wrong. The review leans to the ledger.

## 6. What production must carry over, and its requirements

- **Safari's four host requirements** (`safari/RESULTS.md`):
  1. A batch says "landed" only if every request in it succeeded. Safari fires `oncomplete` after an `InvalidStateError`.
  2. No batch is left open going into bfcache. One blocked the next owner's reads in 12 of 12 runs.
  3. The lock is lost while the page is cached, so a return must reload (D148).
  4. A tab close loses the last batch (0/6), so 5 s is the real loss window.

  Quota and disk durability couldn't be measured. The fake should learn the bfcache-blocked store and the lying `oncomplete`.
- **Run costs** (`round-13/run-costs.md`):

  | Run | Time | Peak memory |
  | --- | --- | --- |
  | Suite with searches | 63-85 s | 0.9 GB |
  | `mutate-one` | 194-227 s | 1.6 GB |
  | Graph gate | 63-86 s | 1.6 GB |
  | Lie gate, targeted, 8 at once | 65 s | 4.2 GB |
  | Lie gate, full, 8 suites at once | 1,334 s | — |

  Fast parts go into `nub run verify`. Lie, graph and real-browser runs go on final commits.
- **CLI output redesign** (proposed; today's output is in section 3):
  - Source locations (`pay.machine.ts:42`) instead of the Slot paths it prints now (`states.UNSURE.on.IntentRead[0]`).
  - A trace that reads like the Story, instead of evidence sequence numbers.
  - A graph grouped by state, instead of a flat list of 51 edges.
- **Carry over:**
  - `conformance/`, with its lock, falsify, lies and reference model (`conformance/reference/model.ts`).
  - The issue catalog the suite checks names against (`conformance/main.ts`).
  - D221's and D222's rules, D224, D225 and D228, with the fixes in section 5.
  - Business keys in every money example.
- **Not prototyped:**
  - Entities: `round-9/entity-proposal-2.md` is unbuilt, and `listen.load` and `fragstore.row` still fail.
  - Streams, record migration, React, phones and iOS.
  - `Story.app`, tabs and `Fake.storage`.
  - Performance budgets: 10,000 messages at 6x CPU slowdown was a stress test, not a target.
  - TanStack DB.

## 7. Questions for you

**Q1. What counts as the same key version (H2)?**
- A: the field names plus each key field's encoded JSON Schema, so a branded `S.String` stays the same version.
- B: names only, as today. Document a type change as a migration.
- C: any change to the Schema at all.

Rec. A: it closes the double charge and doesn't punish a brand.

**Q2. How does an app reach an old-version hold (M3)?**
- A: `previous: [{ key }]` on the transaction, which gives typed `O.x.previous[i].retry/cancel`, plus `NotSent { OldVersion }`.
- B: A, plus the `within` narrowing, so only keys that agree on the old fields decline.
- C: leave the cast for now.

Rec. A. Cut `within` until collection actors need it.

**Q3. First-send click loss (call 1).**
- A: accept a silent return to the state before the click.
- B: add a notice the app can show ("we couldn't save your last action").

Rec. A. No money moved, and B needs a new record kind.

**Q4. A second tab's Pay button (call 3).**
- A: keep it dead and honest.
- B: let each contract choose to send without the lock.

Rec. A. B brings back cross-tab double sends.

**Q5. Spins (call 5).**
- A: accept. Add a backoff later, only on an explicit `retry` with a delay.
- B: yield to a timer after 2 s hidden.

Rec. A. B slows a correct bulk import to 8 ms a second.

**Q6. Server keys as contract data (D121, call 2).**
- A: `idempotency: "attempt" | fields` on the contract, so `flow check` can warn on money-shaped writes, built with entities.
- B: docs only.

Rec. A.

**Q7. Rule 32 (call 7).**
- A: accept two levels with no clock, and let me list the plan edits for your yes.
- B: keep rule 32 as its stated limit.

Rec. A.

**Q8. The Story API (call 16).**
- A: production builds 2.10 as designed, with fixture Layers and an async `run()`, and keeps this prototype's spellings as prior art.
- B: adopt the prototype's spellings.

Rec. A.
