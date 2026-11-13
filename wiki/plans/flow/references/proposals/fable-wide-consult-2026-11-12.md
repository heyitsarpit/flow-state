# Wide consult: the questions the V3 Epic should be asking (2026-11-12)

**Status: proposed, nothing here is decided.** Bottom line: the Epic's biggest risks are not in the core's
internals. They are (1) nothing a person or a real app can use exists until the last feature Task, while weekly
usage stood at 86 percent of a 95 reserve at 07:17 today; (2) every gate proves "code equals Spec" and none
proves the Specs or the public types are right; (3) one concrete money-path defect passes every gate (Attempt
ids carry 32 bits of entropy). Part 1 ranks 13 questions. Part 2 answers W1 (recommend: Flow's own endings get
their own keys, `cancelAll` deferred), W2 (recommend: `ManagedRuntime`, a `Store` service, a pure edge step) and
W3 (recommend: split T20 and T17, pull a browser slice forward).

Read-only except this file; no gates run. One type spike was compiled (TypeScript 7.0.2, strict) outside the
repository. Four Haiku sidecars ran; their log is at the end. Paths are under `packages/flow-state-v3/` unless
they start with `workflow/` or `node_modules/`. Consult rounds 1 to 3 are not redone here.

## Part 1: the questions, ranked

| #   | Question                                              | Decides | Answer in one line                         |
| --- | ----------------------------------------------------- | ------- | ------------------------------------------ |
| 1   | What ships first, and does the run reach it?          | user    | name a preview cut; pull React forward     |
| 2   | What checks the Specs and the public types?           | models  | typecheck the reference apps against `src` |
| 3   | Are Attempt ids unique enough as idempotency keys?    | models  | no; widen the seed to 128 bits now         |
| 4   | What is the store contract, and one atomic batch?     | both    | Flow's own `Store`; one batch per Runtime  |
| 5   | Who reads the agents' user-visible rulings, and when? | user    | a digest per slice, with a lag bound       |
| 6   | Do `outcomes` and the handles check what they claim?  | user    | no; W1 option B closes it                  |
| 7   | Where does the procedure cost more than it returns?   | user    | drop the timer review; keep blind sidecars |
| 8   | Must round-14 stay a gate until entities?             | models  | retire it per area as each slice closes    |
| 9   | Which planned features has no app ever used?          | user    | `cancelAll` has zero uses; defer it        |
| 10  | Will Stories be a third fake world?                   | both    | build fakes as Layers of the host services |
| 11  | Which open Plan gaps will stop T17?                   | models  | rule the five fragment gaps before T17b    |
| 12  | Does the model search find real conflicts (T46)?      | models  | run it inside T18's suite half or drop it  |
| 13  | Is the World's copy-per-write shape safe to build on? | models  | yes, behind setters; track the cost number |

### 1. What ships first, and does the run reach it?

- **Why it matters.** The dependency chain is T30 (React) ← T31 ← T29 (Stories) ← T49 ← T28 (IndexedDB) ← T48 ←
  T27 ← T24 (entities) ← T25 (streams) ← T23 (`workflow show @task.V3.T30` and its chain). So no component can
  render an actor, and no real browser store exists, until after streams, entities, a second tab, lazy features
  and inspection. The Plans do not ask for that order: `wiki/plans/flow/FlowState.plan` O2 puts React at
  "needs S3" and Stories at "needs S3".
- **The budget.** `wiki/tasks/V3/log.task` (07:17:14Z) reads 86 percent, "about 3.5 an hour", the reserve
  "about 2.5 hours away". From 58 percent at the run's start (11-11 15:32) the run finished T45 and T51 and most
  of T47, about 9.5 of the replan's effort units for 28 points. The replan estimates about 60 more units for
  slices 1 to 10 (`replan-2026-11-11.md`, part 3), before React, examples, docs and hardening. That is several
  more weekly windows. Nobody owns "what exists if the run stops here".
- **Answer (proposed).** The user names a preview cut: the core (slices 1 to 5), a minimal React binding,
  IndexedDB persistence, `flow check`, and checkout's Pay running in a real browser. Entities, streams, SSR,
  lazy features, Stories playback and inspection follow as later releases; none is cut. W3 gives the order.
  Until the user decides, the orchestrator should not start T54 inside the last hours before the reserve: a
  five-step refactor should not straddle a stop.
- **Would prove it wrong:** entities or streams changing the core's shape so much that a preview built without
  them is thrown away. Round 3's C6 and C1 found no such case for the ledger or the batch.

### 2. What checks the Specs and the public types themselves?

- **Why it matters.** The suite is 35,810 lines against 5,933 of production, and it proves production equals the
  Spec model. Both are written by the same model family from the same Specs, so a wrong or silent Spec passes
  every gate. Evidence that this is live: question 3; the blind sidecars' Spec gaps "no requirement list had"
  (log.task 03:29:53Z, 04:08:53Z); and the type holes of question 6.
- **Unowned.** The Plans' authoring type proofs have partial owners only. Machines V1 is reached through
  `wiki/specs/core/Compile.spec` T6 (T17). Operations V1 ("reject invalid options, outcome mappings, reserved
  reasons, missing services and key-less members") has no type test in any Spec or Task.
  `tools/plan-coverage/check.ts` gates outcomes only, never verification items.
- **The cheapest independent judge already exists and is not run.** `wiki/plans/flow/references/checkout`
  and `dispatch-desk` are two full apps written against the planned API. They typecheck today only against a
  stand-in (`references/typecheck/standin/flow-state.ts`), by hand.
- **Answer (proposed, models decide).** Add a reported number to every slice's close: the count of type errors
  when `references/checkout` compiles against `src/index.ts` in place of the stand-in. It gates nothing; it must
  fall. It measures API drift and progress in the user's terms, and it is the only check not derived from the
  Specs. Add Operations V1's type tests to T18 (W1 gives them). Keep the Fable sample read.
- **Would prove it wrong:** the reference apps being so far from production's surface that the count is noise
  until T21 (then start it with checkout's Pay feature alone, which production already runs).

### 3. Are Attempt ids unique enough to be idempotency keys?

- **Finding.** An Attempt id is `${prefix}-${env.seed}-${world.counter}` (`src/core/tx.ts:109-112`). The seed is
  one `Uint32` (`src/host/browser.ts:8`), and the counter starts at 0 on every boot
  (`src/core/world.ts:276`, `src/host/driver.ts:83`). Two boots that draw the same seed mint the same ids.
- **Why it matters.** `wiki/specs/core/WriteLanes.spec` R5 says the id "is unique across devices and scopes
  ... because a server may use it as its idempotency key". With 32 bits the chance that some two of n boots
  share a seed is about n²/2³³: about 1 percent at 10,000 page loads and about 70 percent at 100,000. A payment
  API then answers the second user's request with the first user's result. The suite cannot see it: its seeds
  are `seed * 1000 + page` (`conformance/world/page.ts:67`), and WriteLanes I28 only says the seed is fresh.
- **Answer (models decide; internal).** The host supplies at least 128 bits as a string (`crypto.randomUUID()`
  or Effect's `Crypto.randomUUIDv4`); `Env.seed` becomes a string; the id's public type stays `string`. Add an
  Invariant beside I28 that states the width, and a check on the real host's seed. Fix the doc comment at
  `browser.ts:5`. "Business keys for money" stays good advice but does not excuse R5.
- **Would prove it wrong:** nothing found; the adversary sidecar confirmed the counter is not restored.

### 4. What is the store contract, and what is one atomic batch?

- **Why it matters.** Three records disagree, and T19 builds on the answer.
  - `wiki/plans/flow/Persistence.plan` O1 and FlowState D4 say the user supplies Effect's `KeyValueStore`.
  - That interface has per-key `get`, `set`, `remove` and `modify` and no multi-key write
    (`node_modules/effect/src/persistence/KeyValueStore.ts:40-96`); its IndexedDB layer opens one transaction
    per call. WriteAhead R9 and R12 need atomic batches (WriteAhead Q4 records this, with no decision).
  - WriteAhead R7, R9 and R10 read as one capture per scope with "everything dirty"; the code batches per actor
    (`Persist { scope: actorKey }`), so A can hear an ending and send to B, B's record can land without A's, and
    a crash repeats the send (round 3, C6).
- **Answer (proposed).** The user decides the public half: Flow's own `Store` service with `load` and one atomic
  `write(batch)`, shipped as `layerIndexedDb` and `layerMemory`; the Plans' `KeyValueStore` wording changes, and
  no `fromKeyValueStore` adapter is offered because it cannot be atomic. The models decide the internal half:
  one batch stream per Runtime, not per actor. T54's flat per-step write list already is that batch, the edge
  shrinks from N scope states to one, and an awaited acknowledgement carries everything dirty, as R10 says.
- **Also (T19 requirement).** `Store.write` takes `purpose` and `acknowledges` (`src/host/host.ts:31-35`). Those
  are suite instrumentation in a public adapter contract. The planned disk reader should derive them from bytes.
- **Would prove it wrong:** a measured cost of Runtime-wide batches on the 500-lane part (S16), or an entity
  write (T24) needing two scopes in one batch.

### 5. Who reads the agents' user-visible rulings, and when?

- **Why it matters.** Agents have ruled on behaviour app authors will see: a refused ending is redelivered
  once and then kept; a kept ending blocks its key; an ending is applied at settlement; what `disposeActor`
  saves; the reason `Error` for an untagged failure. The task files carry 55 "User's read" lines, the Specs and
  Plans 54 "proposed name" marks, `Pending.plan` four decisions waiting for a yes, and every Plan is still
  `status proposed`. The Epic has no stop or date for any of it, so reversal cost grows with each slice.
- **Answer (the user decides).** At each slice's close the orchestrator writes one page, "what an app author
  will notice", listing only user-visible behaviour and names decided since the last page, ordered by cost to
  reverse. The run does not wait for it, with one bound: a second slice may not close on top of an unread page.
- **Would prove it wrong:** the user preferring to read the Specs' diffs directly (then drop the page, keep the
  bound).

### 6. Do `outcomes` and the handles check what they claim?

- **Finding.** `E.X.from` is `<V>(map: (value: V) => P) => Ending` (`src/definition.ts:43`), and the contract
  erases the mapper to `value: never` (`src/contract.ts:46`). So `E.Declined.from((e: AnyType) => …)` compiles
  whatever the commit fails with; the fixtures annotate by hand (`fixtures/transfers.ts:44-46`). Every write
  handle is `WriteHandle<M, Values>` (`src/definition.ts:98-102`), so `O.x.commit(select)` does not check the
  selected input against the contract. The services Layer is `Layer.Layer<any>` (`src/host/runtime.ts:149`).
- **Why it matters.** FlowState D3 ("likely authoring mistakes become type errors") is the product's claim for
  agent authors. Today a wrong mapper or a wrong commit input is found at run time or not at all.
- **Answer.** W1's option B types every mapper from the contract and the handle from its input and policy; the
  spike compiles. The user decides the shape; the typing itself is the models' to build in T18.

### 7. Where does the procedure cost more than it returns?

- **What returns.** Of the seven blocking findings in reviews that ran a blind and an adversary sidecar, the
  blind one sourced five and the adversary two (the review files `t51-step2-review`, `t51-completion`,
  `t47-steps1-2` under proposals). Step-done and completion reviews each found real defects.
- **What costs.**
  - The 90-minute timer review duplicates event reviews: four timer reviews ran on T45, one covered the same
    range as the completion event (log.task 23:47:29Z and 00:02:40Z), and the orchestrator already skipped one
    "to save usage" (07:17:14Z).
  - 17 process amendments in three days; six replaced a rule under 24 hours old (one after 7 minutes). The
    Epic's own rule batches amendments at a close-out.
  - Since 11-11: 124 commits and about 40,000 added lines in `conformance/` against 22 commits and 8,900 lines
    in `src/`; about 21,000 of the suite's lines are checked-in sweep output (`catch-sweep.prototype.tsv`).
  - The log disagrees with its review files in four places (60 rows against 47; "three missed requirements"
    against five; "all accepted" against six rejected sidecar claims). Notes written at speed are drifting.
- **Answer (the user decides the cadence).** Drop the timer review and keep the wake for stall and usage only.
  Keep step-done and completion reviews with both sidecars. Move the blind Spec pass into requirements
  gathering (T51's retrospective already proposes it), so its findings arrive before code. Stop checking in
  sweep output (round 2, B9). Record per Task the usage spent and the blocking findings per review, so cost per
  correctness is a number; no record holds it today.
- **Would prove it wrong:** a defect that only a timer review caught. The four on T45 did find blockers, but
  each on a checkpoint that a step-done review would now cover under the 2026-11-12 rule.

### 8. Must round-14 stay a gate until entities?

- **Why it matters.** T53 retires round-14 after T24. Until then T18, T20 and T17 each owe "the same verdict
  per case on round-14 and production", twins, and mutants mapped from round-14, on 19,000 lines of prototype
  and 44,000 of old suite. Round 2 (B9) kept it because it hosts 154 mutants against production's 18.
- **Answer (models decide; a small amendment to an accepted Task).** Retire it per area. When a slice closes
  with production mutants and model mutation covering its oracles, that area's round-14 cases, mutants and
  twins-on-round-14 go in the same commit, under the phase-out's four validations. T53 then deletes only what
  entities and streams still need. The no-lost-catch sweep decides each deletion, not the calendar.
- **Would prove it wrong:** a round-14 mutant no production mutant or model cell can express (keep that one as
  a frozen regression script).

### 9. Which planned features has no app ever used?

- **Finding.** `cancelAll` has zero uses in both reference apps (ts and tsx), and zero member calls in
  round-14's own source; only six conformance fixtures call it. The user cut `concurrency: "allow"` for three
  corpus uses (`revisit.md`, 2026-11-07); `cancelAll` has none. It costs T18 one member, one cue reach, its
  cells, and the pairs `lt+cA`, `ca+cA` and `cA+gr`.
- **Answer (the user decides; it removes a feature).** Defer `cancelAll` to `revisit.md` with the prior art, and
  apply the same test to each code a slice declares: no use in either reference app means it needs a reason to
  be built now. The kept-ending machinery passes that test only for persisted identities; keep it, since T54
  makes it one `Delivery` state.
- **Would prove it wrong:** an example app in P6 that needs "stop the whole queue" and cannot key its way out.

### 10. Will Stories be a third fake world?

- **Why it matters.** There is the prototype harness, the conformance `world/` (clock, page, storage, network),
  and, planned for T29, the product's `Fake.server`, `Fake.storage` and Story clock. Nothing says they share
  code, and T19 is about to fix the host services they would all stand on.
- **Answer (models decide the layout; the user decides the testing API).** Shape the host services so a fake is
  only a Layer of one (`Store`, `Page`, `Clock`, `Scheduler`, `Crypto`; W2). The conformance world becomes those
  Layers when T19 lands, and T29's fakes are the same modules behind `flow-state/testing`.
- **Would prove it wrong:** the conformance world's synchronous settle needing hooks a public fake must not
  expose (then share the Layers and keep the settle driver private).

### 11. Which open Plan gaps will stop T17?

- **Why it matters.** `revisit.md` lists five undecided fragment rules dated 2026-11-11 (`.each` `max` and `by`,
  a frozen trait's `resetOn`, a raise into a trait the same transition enters, a raise into a removed copy),
  plus Actors I29 against R22 and the unbuilt `KeyRequired`. T17 is the largest Task (effort 8) and meets all of
  them with no owner or date.
- **Answer (models decide, under the 2026-11-11 Spec delegation).** Rule them in T17's requirements step, each
  with the dispatch-desk code that assumes an answer, and list them on question 5's page. W3 splits T17 so the
  fragment half starts after those rulings.

### 12. Does the model search find real protocol conflicts (T46)?

- **Why it matters.** Every slice now rests on "the Spec model plus search finds what a hand suite misses". T46
  is the backtest of that, open and unblocked, and on nobody's path.
- **Answer (models decide).** Run it once, bounded, as the first step of T18's suite half, where the policies
  give the search the most cells; if the run is not worth its usage, close T46 as dropped. An open Task that
  tests the method's premise should not stay open unnoticed.

### 13. Is the World's copy-per-write shape safe to build on?

- **Why it matters.** `withEntry` copies a whole map per write (`src/core/tx.ts:51-52`); budgets are P9, the
  last phase. Round 3 (C5) already orders the measurements, and T54's A0 records a baseline.
- **Answer (models decide).** Safe: every write goes through the setters, so the structure can change behind
  them. Keep the A0 numbers as a per-slice reported figure beside the work fingerprint.

## Part 2

### W1. The public API T18 will change

**Bottom line (proposed; the user decides).** Take option B for endings (Flow's own endings get their own keys
and typed values), keep the four policy names, and defer `cancelAll` (K0). `retryable` stays the guard it is.

**Where the data comes from.** The contract is the same in every option. It is an upload queue: one album's
photos go up one at a time.

```ts
// photos.contracts.ts                    existing: transaction, Outcome, Effect, Schema, Context, Data
// user-defined: Api, TooLarge, Lost, upload
import { Context, Data, Effect, Schema } from "effect";
import { Outcome, transaction } from "flow-state";

export class TooLarge extends Data.TaggedError("TooLarge")<{ readonly maxBytes: number }> {}
export class Lost extends Data.TaggedError("Lost")<{ readonly status: number }> {}

export class Api extends Context.Service<Api, { readonly baseUrl: string }>()("photos/Api") {}

export const upload = transaction({
  id: "Photos/upload",
  input: { albumId: Schema.String, photoId: Schema.String, bytes: Schema.Number },
  key: ["albumId"],
  concurrency: "serialize", // existing name; built by T18
  services: [Api],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(Api), (api) =>
      Effect.tryPromise({
        try: (signal) =>
          fetch(`${api.baseUrl}/albums/${input.albumId}/photos`, {
            method: "POST",
            signal,
            headers: { "Idempotency-Key": attempt.id, "Content-Type": "application/json" },
            body: JSON.stringify({ photoId: input.photoId }),
          }),
        catch: () => new Lost({ status: 0 }),
      }),
    ).pipe(
      Effect.flatMap((response) => {
        if (response.ok) return Effect.succeed({ photoId: input.photoId });
        if (response.status === 413) return Effect.fail(new TooLarge({ maxBytes: 10_000_000 }));
        return Effect.fail(new Lost({ status: response.status }));
      }),
      Effect.catchTag("Lost", (e) => Outcome.unknown(e)), // a lost answer may have applied
    ),
});
```

**Before** (today's `src/`, with the Plans' unbuilt `cancelAll` and by-tag `unknown`):

```ts
// photos.definition.ts                   existing: definition, Flow.initial, Flow.uncertain, outcomes, E.X.from
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { type Lost, type TooLarge, upload } from "./photos.contracts.ts";

export const Photos = definition({
  id: "Photos/Uploads",
  persist: true,
  states: ["READY"],
  events: {
    Add: { albumId: Schema.String, photoId: Schema.String, bytes: Schema.Number },
    Skip: { albumId: Schema.String },
    StopAll: { albumId: Schema.String },
    TryAgain: { albumId: Schema.String },
  },
  internalEvents: {
    Uploaded: { photoId: Schema.String },
    Refused: { maxBytes: Schema.Number },
    NotSent: { why: Schema.String },
    Stopped: Flow.uncertain({}),
    Unsure: Flow.uncertain({ why: Schema.String }),
  },
  memory: {
    done: Flow.initial(Schema.Array(Schema.String), []),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    upload: upload.outcomes({
      success: E.Uploaded.from((photo: { readonly photoId: string }) => ({ photoId: photo.photoId })),
      failure: {
        TooLarge: E.Refused.from((e: TooLarge) => ({ maxBytes: e.maxBytes })), // the annotation is unchecked
        NotSent: E.NotSent.from((n: { readonly why: string }) => ({ why: n.why })), // shares the author's map
      },
      unknown: {
        Cancelled: E.Stopped, //                       Flow's reason
        Lost: E.Unsure.from((e: Lost) => ({ why: `status ${e.status}` })), // the author's tag, same map
        Restored: E.Unsure.from(() => ({ why: "Restored" })),
        Interrupted: E.Unsure.from(() => ({ why: "Interrupted" })),
        Defect: E.Unsure.from(() => ({ why: "Defect" })),
        StillUnknown: E.Unsure.from(() => ({ why: "StillUnknown" })),
        StorageRefused: E.Unsure.from(() => ({ why: "StorageRefused" })),
        Disposed: E.Unsure.from(() => ({ why: "Disposed" })),
      },
    }),
  }),
});
```

```ts
// photos.machine.ts                      existing: machine, O.x.commit, cancel, retry, retryable; Plan: cancelAll
import { machine } from "flow-state";
import { Photos } from "./photos.definition.ts";

const album = ({ event }: { readonly event: { readonly albumId: string } }) => ({ albumId: event.albumId });

export const PhotosMachine = machine(Photos, ({ S, O }) => ({
  default: S.READY,
  on: {
    Add: { actions: [O.upload.commit(({ event }) => event)] },
    Skip: { actions: [O.upload.cancel(album)] },
    StopAll: { actions: [O.upload.cancelAll(album)] },
    TryAgain: [
      { guard: [O.upload.retryable(album, { times: 3 })], actions: [O.upload.retry(album)] },
      { actions: [O.upload.cancel(album)], updateMemory: () => ({ notice: "Gave up." }) },
    ],
    Uploaded: { updateMemory: ({ memory, event }) => ({ done: [...memory.done, event.photoId], notice: "" }) },
    Refused: { updateMemory: ({ event }) => ({ notice: `Too large (max ${event.maxBytes} bytes).` }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: `Not sent: ${event.why}.` }) },
    Stopped: { actions: [O.upload.cancel], updateMemory: () => ({ notice: "Stopped." }) },
    Unsure: { updateMemory: ({ event }) => ({ notice: `Unconfirmed (${event.why}).` }) },
  },
}));
```

What is wrong with it, with evidence:

- Flow's reasons and the author's tags share two maps, so about 18 names are reserved (`ReservedReason`) and
  every new Flow reason breaks apps. At run time an author failure tagged like a decline is treated as one
  (`src/core/cells.ts:131`, `src/core/serve.ts:35`).
- With the Plan's "one event for an untagged failure" form, `NotSent` has no place to go.
- Mapper inputs are unchecked claims (question 6). The `unknown` mapper gets the author's error, or
  `undefined` for Flow's reasons (`src/core/answers.ts:28-29`, `src/core/cells.ts:165`).
- The by-tag `unknown` record is long. The four real ones list 8 to 9 tags to reach 2 or 3 events
  (dispatch-desk `assistant.definition.ts:37-46`, `body.trait.ts:48-58`, `editor.definition.ts:119-128`,
  `upload.trait.ts:65-75`); `open-items.md` item 14 already doubts it.

**Option A: keep the shape, type the values.** Nothing moves; mappers are inferred; `ReservedReason` stays.

```ts
// photos.definition.ts, operations only; the rest of the definition is the Before block's
// existing: every key     CHANGED: mapper parameters are inferred from the contract (no annotations)
// NEW: the mapper's second parameter { input, key, attempt }
  operations: ({ E }) => ({
    upload: upload.outcomes({
      success: E.Uploaded.from((photo) => ({ photoId: photo.photoId })),
      failure: {
        TooLarge: E.Refused.from((e) => ({ maxBytes: e.maxBytes })),
        NotSent: E.NotSent.from((n) => ({ why: n.why })), // n: { why: NotSentWhy }
      },
      unknown: {
        Cancelled: E.Stopped,
        Lost: E.Unsure.from((e) => ({ why: `status ${e.status}` })),
        Restored: E.Unsure.from(() => ({ why: "Restored" })),
        Interrupted: E.Unsure.from(() => ({ why: "Interrupted" })),
        Defect: E.Unsure.from(() => ({ why: "Defect" })),
        StillUnknown: E.Unsure.from(() => ({ why: "StillUnknown" })),
        StorageRefused: E.Unsure.from(() => ({ why: "StorageRefused" })),
        Disposed: E.Unsure.from(() => ({ why: "Disposed" })),
      },
    }),
  }),
```

The machine is the Before block's, unchanged. Added: inferred mapper types, the mapper context, the
`ReservedReason` type error and compile check. Dropped: nothing. Cost: the reserved list and the long record
stay, and the untagged-failure hole stays.

**Option B (recommended): origin is structural.** `failure` holds only the author's tags. Flow's decline is its
own key. `unknown` is one event, or a short record over Flow's reasons with a required `otherwise`; the author's
own unknown error arrives inside the value.

```ts
// photos.definition.ts
// existing: definition, Flow.initial, Flow.uncertain, outcomes, success, failure, unknown, E.X.from
// RENAMED: failure.NotSent -> notSent     NEW: otherwise; the value's `why`; the mapper context
// DROPPED: author tags and Flow reasons in one record; ReservedReason
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { upload } from "./photos.contracts.ts";

export const Photos = definition({
  id: "Photos/Uploads",
  persist: true,
  states: ["READY"],
  events: {
    Add: { albumId: Schema.String, photoId: Schema.String, bytes: Schema.Number },
    Skip: { albumId: Schema.String },
    TryAgain: { albumId: Schema.String },
  },
  internalEvents: {
    Uploaded: { photoId: Schema.String },
    Refused: { maxBytes: Schema.Number },
    NotSent: { why: Schema.String },
    Stopped: Flow.uncertain({}),
    Unsure: Flow.uncertain({ why: Schema.String, resends: Schema.Number }),
  },
  memory: {
    done: Flow.initial(Schema.Array(Schema.String), []),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    upload: upload.outcomes({
      success: E.Uploaded.from((photo) => ({ photoId: photo.photoId })),
      failure: { TooLarge: E.Refused.from((e) => ({ maxBytes: e.maxBytes })) }, // exhaustive, author tags only
      notSent: E.NotSent.from((n) => ({ why: n.why })), //                         n: { why: NotSentWhy }
      unknown: {
        Cancelled: E.Stopped,
        otherwise: E.Unsure.from((u, { attempt }) => ({
          why: u.why === "Outcome" ? `status ${u.error.status}` : u.why, // u.error: Lost, the commit's own
          resends: attempt.retryCount,
        })),
      },
    }),
  }),
});
```

```ts
// photos.machine.ts                      existing: every member; no change from B itself
import { machine } from "flow-state";
import { Photos } from "./photos.definition.ts";

const album = ({ event }: { readonly event: { readonly albumId: string } }) => ({ albumId: event.albumId });

export const PhotosMachine = machine(Photos, ({ S, O }) => ({
  default: S.READY,
  on: {
    Add: { actions: [O.upload.commit(({ event }) => event)] }, // CHANGED: the input is checked against the contract
    Skip: { actions: [O.upload.cancel(album)] },
    TryAgain: [
      { guard: [O.upload.retryable(album, { times: 3 })], actions: [O.upload.retry(album)] },
      { actions: [O.upload.cancel(album)], updateMemory: () => ({ notice: "Gave up." }) },
    ],
    Uploaded: { updateMemory: ({ memory, event }) => ({ done: [...memory.done, event.photoId], notice: "" }) },
    Refused: { updateMemory: ({ event }) => ({ notice: `Too large (max ${event.maxBytes} bytes).` }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: `Not sent: ${event.why}.` }) },
    Stopped: { actions: [O.upload.cancel], updateMemory: () => ({ notice: "Stopped." }) },
    Unsure: { updateMemory: ({ event }) => ({ notice: `Unconfirmed (${event.why}, ${event.resends} re-sends).` }) },
  },
}));
```

The values Flow hands a mapper (new types, exported from the root as `Flow.NotSent` and `Flow.Unknown`):

```ts
// NEW: Flow.NotSent, Flow.Unknown        U: the commit's Outcome.unknown errors; F: its failures
export type NotSent = { readonly why: NotSentWhy };
export type Unknown<U, F> =
  | { readonly why: "Outcome"; readonly error: U } //            the commit said Outcome.unknown(error)
  | { readonly why: "StillUnknown"; readonly failure: F } //     a definite failure after an unknown send
  | { readonly why: "Defect"; readonly cause: Cause.Cause<never> }
  | { readonly why: "Cancelled" | "Restored" | "Interrupted" | "StorageRefused" | "Disposed" };
```

- **Added:** `notSent`; `otherwise`; the tagged values; the mapper context; a handle typed by the contract's
  input and policy. **Dropped:** `failure.NotSent`; author tags in the `unknown` record; `ReservedReason` as a
  rule, an error code and a compile check. `flow check`'s "NotSent mapped only where it can occur" reads the
  new key. Static edges stay: one per failure tag, one for `notSent`, one per listed reason and one for
  `otherwise`.
- **Spike.** The typing compiles: mapper parameters infer with no annotation, a missing failure tag and a
  wrong annotation are errors, an author tag named `Cancelled` is allowed. The `otherwise` record form was not
  in the spike.
- **Prior art.** Flow's own streams already group Flow's failures under one key apart from the author's
  (`Operations.plan` O4, "with Feed covering Flow's"). Effect separates a typed failure from a defect in `Cause`
  for the same reason. Temporal's `ActivityFailure` wraps the application's failure in a cause and keeps its own
  kinds (timeout, cancelled) outside the application's type space.
- **Wider effect.** T21 should give reads the same rule (`failure` author-only; Flow's `Defect` and
  `Interrupted` under their own key). T20 gains a precise answer to "what of an ending is saved": `why` always
  encodes; `error` and `value` need the contract's Schemas.

**Option C: one result event.** Rejected, shown for completeness.

```ts
// photos.definition.ts, the parts that differ from option B; states, events and memory are option B's
// NEW: outcomes(event) with one tagged payload     DROPPED: success, failure, notSent, unknown keys
  internalEvents: {
    UploadEnded: Flow.uncertain({ result: Schema.Unknown }),
  },
  operations: ({ E }) => ({ upload: upload.outcomes(E.UploadEnded) }),

// photos.machine.ts, the ending's handler; the other handlers are option B's
    UploadEnded: [
      {
        guard: [({ event }) => event.result._tag === "Success" || deny("NotSuccess")],
        updateMemory: ({ memory, event }) => ({ done: [...memory.done, event.result.value.photoId] }),
      },
      {
        guard: [({ event }) => event.result._tag === "Unknown" || deny("NotUnknown")],
        updateMemory: () => ({ notice: "Unconfirmed." }),
      },
      { updateMemory: () => ({ notice: "Failed." }) },
    ],
```

It turns outcome edges into guard callbacks, so `flow graph`, `flow check` and the `Flow.uncertain` rule lose
them (FlowState D1), and every app rewrites the same three-way branch.

**Against real apps** (from the two reference apps; line counts are `outcomes` sites, 14 and 45):

| App code                                              | A                 | B                                    |
| ----------------------------------------------------- | ----------------- | ------------------------------------ |
| Pay `pay` (reject, keyed; own `PayNotSent`)           | no change         | move one line up a level             |
| Cart `setQuantity` (latest; NotSent to the success)   | no change         | `notSent: E.QuantitySet`             |
| Refunds (serialize; 65th is Overloaded)               | no change         | same move; `why` is a typed literal  |
| Assistant `suggest` (policy cancel; 9 tags, 2 events) | 9 lines stay      | 2 lines: `Cancelled`, `otherwise`    |
| Editor body save (`StillUnknown` to its own event)    | 9 lines stay      | `StillUnknown` and `otherwise`       |
| Attachments upload (`Restored` means bytes are gone)  | 9 lines stay      | `Cancelled`, `Restored`, `otherwise` |
| A Stripe.js call whose error is tagged `Cancelled`    | must rename a tag | compiles as written                  |

Every `NotSent` mapping and all four by-tag records convert mechanically. No author tag in either app
collides with a Flow reason today, so A's reserved list costs nothing there yet; its cost is future.

**Lane policies and members (B7).**

- **Declaring a policy: keep the four names** (existing). The three axes are internal (one `Commit` cue). Axes
  as public config would allow invalid points and lose the familiar contract (RxJS `exhaustMap`, `concatMap`,
  `switchMap`; ember-concurrency `drop`, `enqueue`, `restartable`, `keepLatest`). One hazard worth the user's
  eye: the policy `cancel` and the member `cancel` are different things on one operation (dispatch-desk
  `assistant.contracts.ts:27` with `assistant.machine.ts:56`; checkout's own comment at
  `order-summary.trait.ts:78` calls its case a "design gap"). If a rename is wanted, `switch` is the cited
  prior art. No rename is recommended without a second confusing case.
- **`retryable`: no change** (existing guard, existing `retry` action). The budget must stay a guard so a
  spent budget picks the give-up alternative; both apps pair them that way 30 times, with `times` of 1, 2 and
  3 per site, so a budget on the contract would be wrong for some sites.
- **`cancelAll`: three options.** The definition is option B's; `StopAll: { albumId: Schema.String }` is added
  to its events for K1 and K2.

```ts
// K0 (recommended): no member. The option B machine above is the whole machine; "stop everything" is
// one Skip per queued photo, or a keyed design.          DROPPED: cancelAll (deferred to revisit.md)

// K1: its own member, present only where the policy queues.     existing name: cancelAll
// NEW: O.x.cancelAll is a type error on a reject or cancel lane (it would equal cancel there)
export const PhotosMachineK1 = machine(Photos, ({ S, O }) => ({
  default: S.READY,
  on: {
    Add: { actions: [O.upload.commit(({ event }) => event)] },
    Skip: { actions: [O.upload.cancel(album)] }, //       ends the head, promotes the next
    StopAll: { actions: [O.upload.cancelAll(album)] }, // ends the queue, then the head, promotes nothing
    TryAgain: [
      { guard: [O.upload.retryable(album, { times: 3 })], actions: [O.upload.retry(album)] },
      { actions: [O.upload.cancel(album)], updateMemory: () => ({ notice: "Gave up." }) },
    ],
    Uploaded: { updateMemory: ({ memory, event }) => ({ done: [...memory.done, event.photoId], notice: "" }) },
    Refused: { updateMemory: ({ event }) => ({ notice: `Too large (max ${event.maxBytes} bytes).` }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: `Not sent: ${event.why}.` }) },
    Stopped: { actions: [O.upload.cancel], updateMemory: () => ({ notice: "Stopped." }) },
    Unsure: { updateMemory: ({ event }) => ({ notice: `Unconfirmed (${event.why}, ${event.resends} re-sends).` }) },
  },
}));

// K2: one member with a reach.          NEW: the second argument { queued: true }     DROPPED: cancelAll
export const PhotosMachineK2 = machine(Photos, ({ S, O }) => ({
  default: S.READY,
  on: {
    Add: { actions: [O.upload.commit(({ event }) => event)] },
    Skip: { actions: [O.upload.cancel(album)] },
    StopAll: { actions: [O.upload.cancel(album, { queued: true })] },
    TryAgain: [
      { guard: [O.upload.retryable(album, { times: 3 })], actions: [O.upload.retry(album)] },
      { actions: [O.upload.cancel(album)], updateMemory: () => ({ notice: "Gave up." }) },
    ],
    Uploaded: { updateMemory: ({ memory, event }) => ({ done: [...memory.done, event.photoId], notice: "" }) },
    Refused: { updateMemory: ({ event }) => ({ notice: `Too large (max ${event.maxBytes} bytes).` }) },
    NotSent: { updateMemory: ({ event }) => ({ notice: `Not sent: ${event.why}.` }) },
    Stopped: { actions: [O.upload.cancel], updateMemory: () => ({ notice: "Stopped." }) },
    Unsure: { updateMemory: ({ event }) => ({ notice: `Unconfirmed (${event.why}, ${event.resends} re-sends).` }) },
  },
}));
```

  K0 because no app uses it (question 9). If it stays, K1 over K2: "skip one" and "stop all" are two intents
  that read at a glance, K2 hides a change of promotion behind a boolean, and typing the member by policy
  follows the row, which `Operations.plan` O6 already varies by policy. The spike compiles K1's typing.

**Small calls the orchestrator may make with T18 (proposed):** the row gains `waiting` and `outstanding` as
the Plan says; a row should show that a kept ending blocks its key (a view cannot otherwise explain a declined
commit), as one boolean, name open; `Attempt.mayHaveApplied` stays public and is derived inside.

### W2. The host and edge architecture

**Bottom line (proposed; internal, the models decide, except the `Store` contract in question 4).** The host is
small but not yet idiomatic: it rebuilds `ManagedRuntime` by hand, bundles four facts into one `Host` service,
and the edge is an implicit state machine. Target: about five modules, no runner or `Unsafe` call outside one
place, every fake a Layer.

What is there today, checked against Effect 4.0.5 in `node_modules/effect/src`:

- **`runtime.ts` re-creates `ManagedRuntime`.** `Scope.makeUnsafe`, a mutable `services` context,
  `Layer.buildWithScope`, the `booted` Deferred with `started` and `open` (`src/host/runtime.ts:163-168`,
  `:194-234`). `ManagedRuntime.make` is synchronous and inert, forks the build once as a root fiber that every
  caller awaits, keeps a failed build failed, and interrupts its fibers on `disposeEffect`
  (`ManagedRuntime.ts:291-331`, `:349-358`). That is `Runtime.plan` O2 word for word, including "interrupting
  one waiter interrupts only that wait", which the code states as a limit (`runtime.ts:219-221`). Its
  `runPromise` is the Plan's `runtime.runPromise`.
- **`fibers.ts` re-creates `FiberMap.makeRuntime`** with `Effect.runSync`, `runForkWith`, `setUnsafe` and
  `interruptUnsafe` (`src/host/fibers.ts:14-36`; `FiberMap.ts:219-235`). Built inside the bootstrap, the map
  needs no runner at construction. Interrupting one key has no synchronous API in 4.0.5, so one
  `interruptUnsafe` stays.
- **`Host` holds four unrelated facts** (`src/host/host.ts:49-57`): visibility as a callback with no removal,
  the store as an `Option` inside a service, and the seed. Each has an Effect form: `Effect.serviceOption`
  (`Effect.ts:12378`), `Stream.fromEventListener`, which removes its listener with the scope
  (`Stream.ts:1466-1487`), and `effect/Crypto` with `TestCrypto.layer(seed)` for tests (`Crypto.ts:159`; both
  unstable, and `@effect/platform-browser` is not installed, so the browser layer is `Crypto.make` over
  `globalThis.crypto` for now).
- **`edge.ts` is an implicit state machine**: `out`, `due` at plus or minus infinity, and the `flushes` array
  encode Clean, Waiting, Ready, Out and Flushing (`src/host/edge.ts:11-23`, `:58-66`; round 2, item 11).
  AGENTS.md forbids that.
- **Order.** Storage is read before services, but records are validated inside the `Boot` step, after services
  are acquired (`runtime.ts:195-215`); Actors I4 wants validation first (a gap already owed by T9).
  `Store.load` has no error channel, so a failed read is a defect where the Plan wants `StorageFailure`.

What it should look like:

```ts
// host/store.ts      NEW: Store as its own service (was Host.store)     existing: Bytes, StoreRefused
export class Store extends Context.Service<
  Store,
  {
    readonly load: Effect.Effect<ReadonlyMap<string, string>, StoreUnavailable>; // NEW: a typed failure
    readonly write: (batch: ReadonlyArray<Bytes>) => Effect.Effect<void, StoreRefused>; // atomic; no purpose
  }
>()("flow-state/Store") {}

// host/page.ts       NEW: Page (was Host.hidden and Host.onHidden)
export class Page extends Context.Service<
  Page,
  { readonly hidden: () => boolean; readonly hides: Stream.Stream<void> }
>()("flow-state/Page") {}

// host/runtime.ts    CHANGED: the Runtime is a ManagedRuntime plus the driver
const managed = ManagedRuntime.make(
  config.services.pipe(
    Layer.provideMerge(Loaded.layer), // reads and validates storage; built before any app service
    Layer.provideMerge(platform), //     Store (optional), Page, Crypto, Clock, Scheduler
  ),
);
// ready    = managed.contextEffect, then one Boot input; every caller shares the build's Exit
// dispose  = send DisposeRuntime, await Out.life === "Disposed" (T55), then managed.disposeEffect
// runPromise = managed.runPromise
```

- `Layer.provideMerge` builds its dependency first and sequentially (`Layer.ts:1960-1966`, `:1981-1983`), so
  "storage before services" is structure, not a comment. `Loaded` needs the core to expose record validation
  as a pure function that `Boot` then takes decoded.
- **The edge follows the core's convention:** a pure `edgeStep(state, input)` returning the next state and
  commands, with a tagged state (`Clean`, `Waiting`, `Out`), and a runner that only performs store writes and
  sleeps. The crash gate can then enumerate it, and with question 4's single batch stream it holds one state,
  not one per actor. The capture window stays here, as T54's decision 4 says.
- **The driver's synchronous inbox stays.** `send`, `ensureActor` and `getSnapshot` are synchronous for React,
  and the effect-simplification audit already rejected `Queue` and `PubSub` for that reason.
- **Several Runtimes** (a request each under SSR, a Story each): one `ManagedRuntime` per `construct()`, each
  with its own memo map, gives "each service is acquired once per Runtime" with no module state. **A second
  tab** (Persistence O7): the Web Lock is a scoped acquisition inside the `Store` layer, released by the scope
  after the final write; a lock that is not available provides no `Store`, which is the existing
  no-persistence path.
- **Split of work:** T55 takes the `ManagedRuntime` shell with `Life`; T19 takes `Store`, `Page`, the seed and
  the edge step.
- **Would prove it wrong:** `ManagedRuntime`'s build needing a scheduler the first `ready()` caller does not
  carry (it takes the caller's, `ManagedRuntime.ts:328`); or the conformance world being unable to drive a
  root build fiber through its page queue. Both need a failing-first host test before the swap.

### W3. The order of the remaining slices

**Bottom line (proposed; a reorder and two splits are within the orchestrator's authority, the preview cut is
the user's).** T19 before T17 is still right. Split T20 and T17, and pull a thin browser slice ahead of streams
and entities.

1. **T47 → T52 → T54 → T18 → T55 → T19: keep.** Durability early is right because the crash gate then judges
   every later slice as it is built, where the reverse order retrofits persistence onto T17's eight units.
   Changes inside: T18 takes the W1 decision and Operations V1's type tests and drops `cancelAll` if the user
   agrees; T19 takes question 4 and W2's `Store` and edge; the seed fix (question 3) goes in whichever of T54 or
   T19 touches the mint first.
2. **Split T20.** T20a after T19: reload, owed endings at boot, format tags, unreadable-record quarantine,
   `forget`. T20b after T9: key fingerprints, identity versions, saved-shape resets and `previous` holds. A
   "saved shape" is only defined once T17 fixes private and computed fields and fragments, and identity versions
   need T9's value-named actors; built now, T20b would be built on Pay-shaped machines and rebuilt.
3. **Split T17** (its own note allows a split). T17a: the compiler, Diagnostics, compound states, history,
   `Flow.input`, private and computed fields, the snapshot shape. T17b: fragments, `.each`, subject paths
   (replacing `owner` and `current`), multi-step schedules. T17b waits for question 11's rulings.
4. **Order after T19:** T20a → T17a → T9 → **browser slice** → T17b → T21 → T20b → T22 → T15 → T23. `Life` leaving
   T9 and batch scope going to T19 make T9 smaller and independent of the host, which is what lets it sit
   before T17b.
5. **The browser slice (new, proposed; built with the roadmap skill if accepted):** the IndexedDB `Store` layer
   (T28's small half), `FlowProvider`, `useActorByRef` and `useView` (T30's small half), and checkout's Pay
   running in real Chrome and Safari. It is T16's twin for the outside of the library, and it is the preview cut
   of question 1. T28 and T30 keep the rest.
6. **Later phases.** P5 stays streams → entities → second tab → lazy, then tooling. T29 (Stories) moves ahead
   of T24 if the user wants entity property tests to use `propertyTest` (FlowState O2 has S5 need S7). T53
   shrinks under question 8. T46 is settled by question 12. T55 stays its own Task as accepted.

**Would prove it wrong:** T17a's compound states changing the lane table or records enough to redo T20a (round
3's C1 says `owner` and `current` are the only contact); or the browser slice needing reads beyond the lookup
production already has.

## Sidecar log

Four Haiku sidecars at effort high, read-only. Every item below was re-checked against the files before use.

| Sidecar   | Finding                                                            | Result                     |
| --------- | ------------------------------------------------------------------ | -------------------------- |
| Adversary | Seed is 32-bit, counter starts at 0 each boot                      | accepted (re-read)         |
| Adversary | Machines V1 has an owner through Compile T6; Operations V1 none    | accepted; my claim changed |
| Adversary | `cancelAll`: 0 uses in the apps and round-14; 6 old fixtures       | accepted                   |
| Adversary | `from` and handle types unchecked                                  | accepted (re-read)         |
| Adversary | T30 and T28 blocked behind T24 and T25 transitively only           | accepted; wording changed  |
| Adversary | `KeyValueStore.modify` is not atomic either                        | accepted                   |
| Adversary | "about 0.4 at 65,536 boots"                                        | accepted (0.39 by formula) |
| Procedure | 11 reviews, 4 timer; blind sourced 5 of 7 sidecar blockers         | accepted (files read)      |
| Procedure | 17 amendments, 6 replacing a rule under 24 hours old               | accepted                   |
| Procedure | Usage 86 percent at 07:17                                          | accepted (log re-read)     |
| Procedure | Git line counts; 21,000 lines are sweep output                     | accepted, not re-run       |
| Procedure | Four log lines disagree with their review files                    | accepted, two re-read      |
| Effect    | `ManagedRuntime`, `FiberMap`, `serviceOption`, `fromEventListener` | accepted (source read)     |
| Effect    | `Crypto` is unstable; platform-browser not installed               | accepted; W2 says so       |
| Effect    | "all eight facts check out"                                        | rejected as a verdict      |
| Real apps | Counts of `outcomes`, `NotSent` sharing, policies                  | accepted                   |
| Real apps | The by-tag `unknown` events have different handlers                | accepted; changed W1       |
| Real apps | Assistant's `Stopped` and `Cut` handlers are identical             | accepted, not re-read      |

The last real-apps finding changed the design: my first draft made `unknown` always one event, and three of
the four real records need two or three events with different actions, so option B keeps a record with
`otherwise`.

## Least sure

- **The usage arithmetic in question 1.** Effort units to usage points is a rough ratio from one slice, and the
  consult rounds themselves spent part of it.
- **Question 8.** Per-area retirement of round-14 rests on production mutants being written to the same
  strength as the 154 they replace; the catch matrix must show it per area, and I did not read the liar gate.
- **W2's `Loaded` layer.** That a layer can validate records before app services start, on the conformance
  world's scheduler, is read from Effect's source and not run.
- **W1's `otherwise` record** was not in the type spike, and a mapper that returns a non-encodable `error` at a
  reload is T20's open question, not answered here.
