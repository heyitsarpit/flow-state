# Type gaps, deep pass (proposed)

**Status (2026-11-20):** acted on: folded into @task.V3.T104 (the user, 2026-11-19). The text below is prior art.

Status: proposed. Nothing here is decided. It extends @task.V3.T104 and does not repeat it.

Nine families explain the remaining type gaps. Each family drops a narrow type at one carrier type, and one
change to that carrier restores most of the family. Four carriers matter most:

- `Bound`: the contract's input, key, success value and failure tags.
- `Ending`: an ending's event name, payload and value.
- `RuntimeSetup`: the app's machines.
- `Snapshot`: which view of memory it shows, and its context.

A fifth issue is not a carrier: TypeScript does not check excess keys on an arrow's returned object. That is why
`updateMemory: () => ({ count: 1, who: "x" })` compiles and silently rewrites a `Flow.input` field.

A seam map (section "Seams") shows that 14 of 21 module seams drop a type the producer holds, and each is
closed by one of the carriers.

Counts:

- 34 new gaps, 31 of them confirmed by a two-sided probe.
- A cast inventory of 236 casts (plus 60 non-cast forms): 74 are removable now and 9 once a carrier is fixed.
- Three SAFETY comments state claims that are false.

Probes are throwaway files in the session scratchpad's `typeprobes/` folder, outside the repo.
The lead's own probes are `lead-gaps.ts` and `lead-more.ts`, and the sidecars' are `s1-*` to `s6-*`. Every sidecar
probe was re-run, and every claim is logged under "Sidecar log". Paths below are relative to
`packages/flow-state-v3/`.

## Families

Each family names where the narrow type lives, the carrier that drops it, and one broad fix. In the snippets each
word is marked as new, renamed, existing or user-defined.

### F1. Contract carrier: `Bound` keeps only `R`

- **Where it lives:** `Transaction<F, A, E, R>` and `Resource<F, A, E, R>` (code:src/contract.ts#Transaction).
- **Where it drops:** `outcomes` returns `Bound<"write", R>` (src/contract.ts:184, :201). `BoundFields` stores
  `input` as `Codec<Values, Values>` and `key` as `ReadonlyArray<string>` (src/contract.ts:123). `Handles` then
  maps every operation to `WriteHandle<M, Values>` (src/definition.ts:251).
- **Inference gap underneath:** `transaction` takes `key: ReadonlyArray<keyof F & string>`, not a `const` tuple, so
  the key fields are never captured as literals. `key: ["b"]` on an optional field compiles, and the runtime then
  refuses it (`KeyFieldOptional`; probe s5-h).
- **One fix:** add phantom fields to `Bound` beside the existing `~requires`, and make the key `const`. This
  restores at once T104 item 1 (`commit`, `lookup`, `retry`, `cancel`, `idle`, `retryable`, `get`), `attempt.input`
  and `attempt.key`, and the key type of `Snapshot.operations`. It also feeds F2 the success value `A` and the
  failure union `E`. Probe s1-carrier: wrong field, missing field, non-key field and key typo all fail. The correct
  spelling compiles. The narrow `Bound` still assigns to the wide `Bound` that `definition` constrains `O` with.

Before:

```ts
// existing: Bound, outcomes, Handles, WriteHandle, Values   // user-defined: pay
type Bound<K, R> = BoundFields & { readonly kind: K; readonly "~requires"?: R };
type Handles<O, M> = { readonly [K in keyof O]: WriteHandle<M, Values> };
O.pay.commit(({ memory }) => ({ amnt: memory.cents })); // compiles
```

After:

```ts
// existing: Bound, Handles, WriteHandle, "~requires"   NEW: "~input", "~key", "~success", "~failure", InputOf, KeyOf
// NEW: const Key on transaction/resource                // user-defined: pay
type Bound<K, R, F = Fields, Key = string, A = unknown, E = unknown> = BoundFields & {
  readonly kind: K;
  readonly "~requires"?: R;
  readonly "~input"?: StructType<F>;
  readonly "~key"?: Pick<StructType<F>, Key & keyof StructType<F>>;
  readonly "~success"?: A;
  readonly "~failure"?: E;
};
type Handles<O, M> = { readonly [K in keyof O]: WriteHandle<M, InputOf<O[K]>, KeyOf<O[K]>> };
O.pay.commit(({ memory }) => ({ amnt: memory.cents })); // error: 'amnt' is not in { cents: number }
```

### F2. Ending carrier: `Ending` has no name, payload or value

- **Where it drops:** `Ending.from: Option<(value: never, context: unknown) => Values>` (src/contract.ts:45).
  `WriteEndings.success` is a bare `Ending` that ignores `A` (src/contract.ts:58). `EventToken.from` is
  `<V>(map: (value: V) => P)` with `V` free (src/definition.ts:102). `Reaction.event` (src/machine.ts:81) and
  `ScheduleConfig.send` (src/definition.ts:296) are bare `Ending`s too.
- **What compiles today** (probes lead-gaps L1 to L3, s5-n, s6-b, s6-d):
  - `success: E.Got` where `Got` needs `{ cents }` and there is no mapper.
  - `unknown: E.Ok` where `Ok` is a certain event.
  - `unknown: E.UF` where `UF` is `Flow.uncertain({ why })`, though an unknown ending has no value to fill `why`.
  - `E.Done.from((v: { receiptt: number }) => ...)`, a mapper whose parameter type is a lie.
  - `schedules.t.send: E.Need` where `Need` has a required field.
  - The fixtures write 104 `.from((x: T) => ...)` annotations by hand, each copying a type Flow already holds.
- **One fix:** `Ending<V>` means "an ending that accepts a value of type V".
  - A bare token is an `Ending<unknown>` only when its payload is empty.
  - `.from(map)` gives `Ending<V>` from the map's parameter.
  - An uncertain event with no fields gives an `UnknownEnding`.
  - `WriteEndings<E, A>` asks for `success: Ending<A>`, `failure[T]: Ending<Extract<E, { _tag: T }>>`,
    `unknown: UnknownEnding` and `notSent: Ending<NotSent>`.
  - `schedules.send` takes `Ending<void>`.

  This removes the `as never` in `endingValue` (src/compiled-parts.ts:23). It covers T104 item 4's
  "`Ending.from` carries its value type" and items 1 to 3 of S1's list. Probe s5-n: an unannotated `v` is typed,
  annotated lies fail, and a bare `E.X` still compiles.
- **Limit:** `onContext` written as an object literal cannot infer `V` from a sibling `select` (probe s5-o: `V`
  stays `unknown`). A curried `react(select)(event)` infers it. That is a new public shape, so it is for the user's
  read.

Before:

```ts
// existing: Ending, WriteEndings, outcomes, E   // user-defined: Got, Done, receipt
type Ending = { readonly ending: { readonly event: string; readonly from: Option<(value: never) => Values> } };
pay.outcomes({ success: E.Got, failure: {}, unknown: E.Ok }); // compiles: Got needs a payload, Ok is certain
```

After:

```ts
// existing: Ending (NEW type parameter V), WriteEndings (NEW parameter A), E   NEW: UnknownEnding
// user-defined: Got, Done, receipt
type WriteEndings<E, A> = {
  readonly success: Ending<A>;
  readonly failure: { readonly [T in FailureTag<E>]: Ending<Extract<E, { readonly _tag: T }>> };
  readonly notSent?: Ending<NotSent>;
  readonly unknown: UnknownEnding;
};
pay.outcomes({ success: E.Done.from((v) => ({ receipt: v.id })), failure: {}, unknown: E.Lost }); // v: Confirmed
pay.outcomes({ success: E.Got, failure: {}, unknown: E.Ok }); // two errors
```

### F3. Definition identity is a value, not a type

- **Where it drops:** `definition`'s `id: string` is not a type parameter (`lead-more.ts`: `const id: "d" = D.id`
  fails). Tokens carry only `"~owner": symbol` (src/definition.ts:173, :208, :218), and
  `StateToken<Path>` carries only its path.
- **What compiles today** (s6-b:35-48, s5-r r1-r3, lead-gaps L5):
  - `default: Other.S.IDLE` or `target: Other.S.ON` from another definition whose paths coincide.
  - `actions: [Cart.O.add.cancel]` inside `machine(Pay)`.
  - `success: OtherE.E.Boom` in `outcomes`.

  `machine` refuses the first two at construction (`ForeignToken`, src/compile-body.ts:88, :204). A foreign ending
  token that has the same event name as a local one passes silently, because src/operation-checks.ts:14 checks by
  name.
- **One fix:** add `const Id extends string` on `definition`, and brand every token with it:
  `StateToken<Path, Id>`, `HistoryToken<Path, Id>`, `ActionToken<Id>`, `GuardToken<Id>` and
  `EventToken<Name, P, Id>`. The machine body and `operations` then accept only their own `Id`. The runtime check
  stays, for two definitions that share an id. Toy probe s5-t: a same-path foreign token fails, and the definition's
  own token compiles.

Before:

```ts
// existing: StateToken, definition, machine, S   // user-defined: Pay, Other, IDLE
type StateToken<Path extends string = string> = { readonly "~flow": "state"; readonly "~path": Path };
machine(Pay, () => ({ default: Other.S.IDLE })); // compiles; refused at construction
```

After:

```ts
// existing: StateToken (NEW parameter Id), definition (NEW const Id), machine, S   // user-defined: Pay, Other, IDLE
type StateToken<Path extends string = string, Id extends string = string> = {
  readonly "~flow": "state";
  readonly "~path": Path;
  readonly "~id"?: Id;
};
machine(Pay, () => ({ default: Other.S.IDLE })); // error: StateToken<"IDLE", "other"> is not StateToken<_, "pay">
```

### F4. App carrier: `RuntimeSetup<R>` forgets the app

- **Where it drops:** `runtimeSetup<A extends App>` holds `A`, but returns `RuntimeSetup<ServicesOf<A>>`
  (src/host/runtime.ts:197). `Runtime<R>`, `Story.app(setup)` and every ref-taking word then take any
  `D extends AnyDefinition`. That covers `ensureActor`, `createActor` and `disposeActor`
  (src/host/runtime.ts:175); `Story.ensure`, `send`, `detach` and `dispose` (src/host/testing/story.ts:55-71);
  `Cut.read` (src/host/testing/run.ts:74); `publishedOf` (src/host/testing/select.ts:131); and `samplesOf.actors`
  (src/host/testing/samples.ts:75).
- **What compiles today:**
  - `run.end.read(rent)` on a shop run returns `undefined` silently, so
    `expect(cut.read(foreign)).toBeUndefined()` checks nothing (s3-a G2).
  - `publishedOf(shopRun, rent)` returns `[]`.
  - `rt.ensureActor(foreignRef)` and `story.send(foreignRef, ...)` compile and fault late with `ForeignActorRef`
    (s6-b:88, s5-q).
- **One fix:** add a phantom `"~app"?: A` on `RuntimeSetup<R, A>` and `Runtime<R, A>`. Then
  `Story.app(setup)` returns `Story<Names, Ds>`, where `Ds` is the app's definitions, and `Cut<Ds>`,
  `StoryRun<Names, Ds>` and `Recorded<Ds>` follow. The ref words take `D extends Ds`.
- **Probes:**
  - s3-c: `DefsOf<typeof shop>` is neither `any` nor `never`, plain and `{ machine, context }` entries both work,
    in-app refs compile and `rent` fails.
  - s3-d: `Cut<Pay>` assigns to a wide `Cut`, so the roughly 20 `(run: StoryRun)` test helpers keep compiling.
  - s5-q: the same, on `Story.send`.

Before:

```ts
// existing: RuntimeSetup, runtimeSetup, Story.app, read   // user-defined: shopSetup, rent
export type RuntimeSetup<R = never> = { readonly construct: () => Runtime<R>; readonly "~services"?: R };
expect(run.end.read(rent)).toBeUndefined(); // compiles; passes for the wrong reason
```

After:

```ts
// existing: RuntimeSetup (NEW parameter A), Runtime (NEW parameter A)   NEW: "~app", DefsOf
// user-defined: shopSetup, rent
export type RuntimeSetup<R = never, A extends App = App> = {
  readonly construct: () => Runtime<R, A>;
  readonly "~services"?: R;
  readonly "~app"?: A;
};
expect(run.end.read(rent)).toBeUndefined(); // error: rent's definition is not one of the shop app's
```

### F5. Snapshot view: `Snapshot<D>` claims memory and context it does not hold

T104 item 1 types `getSnapshot()` as `Snapshot<D>`. Done as written, that is a lie in two places:

- **Memory:** `Snapshot<D>.memory` is `MemoryOf`, `Flow.private` fields included (src/host/snapshot.ts:27). But
  `Actor.getSnapshot` strips private fields at run time (src/host/runtime.ts:403 calls `outside`, at
  src/host/snapshot.ts:163). `const s: string = snap.memory.secret` compiles (lead-gaps L9) and reads `undefined`.
- **Context:** resting, quarantined and disposed snapshots return `context: {}` (src/host/snapshot.ts:126, :139,
  :159). A quarantined record whose fresh start fails returns `memory: {}` (src/host/snapshot.ts:138), the same
  flaw as T103's stopped `read`. Typing context as `ContextOf<Cx>` would claim slots that are absent.

**One fix:** add a view parameter to `Snapshot<D, View extends "inside" | "outside">`. `memory` is `OutsideOf` for
`"outside"` and `MemoryOf` for `"inside"`. `operations` is keyed by the operation names (F1). `context` is
`Partial<ContextOf<D["context"]>>`. `lifecycle` uses one named `Lifecycle`, which today is declared twice
(src/core/life.ts:190-207 and src/host/snapshot.ts:38). The `memory: {}` fallback becomes a refusal or an
`Option`. Probe s2-b: `Snapshot<D>.state` and the operation keys come out narrow, and `D` with no context gives
`never` keys, not `any`.

Before:

```ts
// existing: Snapshot, Actor, getSnapshot   // user-defined: secret
readonly getSnapshot: () => Option.Option<Snapshot>;
```

After:

```ts
// existing: Snapshot (NEW parameter View), Actor, getSnapshot, OutsideOf, ContextOf   NEW: Lifecycle
// user-defined: secret
readonly getSnapshot: () => Option.Option<Snapshot<D, "outside">>; // snap.memory.secret: error
```

### F6. Evidence names: Evidence rows use `string` where the selector holds the name

- **Where it drops:** these `Evidence` fields are all `string` (src/core/evidence.ts:73-150):
  - `Turn.event`, `Turn.from` and `Turn.to`.
  - `Member.operation`.
  - `Part.at` and `Part.target`.
  - `operation` on `Minted`, `Ended` and `Lane`.
  - `Published.state` and `Delivered.event`.

  The selectors already hold the name. `evidenceOf(run, D.E.go)` has the token's tag, and the `{ actor }` overload
  has `D` (src/host/testing/select.ts:40-131).
- **What compiles today:** `turnsOf(run, D.E.go).filter((t) => t.to === "NOPE")` (lead-gaps L7). There are about 30
  such comparisons in tests. A negative assertion over them passes vacuously.
- **One fix:** give `Evidence<N extends Names = WideNames>` one names parameter, with `{ event, state, operation }`
  defaulting to `string` so the core stays unchanged. The selectors return the narrowed form.
- **Second fix, no generic needed:** closed sets typed as `string` inside the core become named unions:
  - `decline(…, why: string)` and `notSent(…, why: string)` use the existing `Decline` and `NotSentWhy`
    (src/core/lanes.ts:126, src/core/lane-moves.ts:99).
  - `SlowWork.input` uses `Input["_tag"]` (src/core/evidence.ts:149).
  - The quarantine reason becomes a `QuarantineWhy` union (src/core/record.ts:185, src/core/world.ts:87).
  - `Ended.reason` becomes a union with the user's failure tags.

  Probe s4-evidence: a `channel` typo already fails, so the control holds.

Before:

```ts
// existing: Evidence, turnsOf   // user-defined: go, NOPE
turnsOf(run, D.E.go).filter((t) => t.to === "NOPE"); // compiles
```

After:

```ts
// existing: Evidence (NEW parameter N), turnsOf   // user-defined: go, NOPE
turnsOf(run, D.E.go).filter((t) => t.to === "NOPE"); // error: "NOPE" is not "IDLE" | "ON"
```

### F7. Ids as plain strings

- **Where it drops:** `attempt`, the lane id, the incarnation id, the record key and the actor key are `string` at
  about 80 sites. Examples: `RuntimeCut.lanes[].attempt` (src/host/inspect.ts:40), `Unsettled.lanes[].attempt`
  (src/host/close.ts:46), `Batch.acknowledges` (src/host/testing/fake.ts), `Bytes.key` (src/host/host.ts:16) and
  `Store.load`.
- **What compiles today:** `laneRecordKey(actorKey(a))` and `l.attempt === keyText` (S4 G4, S2 N5).
- **One fix:** extend T104's `RecordKey` brand into a family: `AttemptId`, `LaneId`, `IncarnationId` and
  `ActorKey`, built with `Brand.nominal` the way `TicketId` and `CallId` already are (src/core/world.ts:45, :55).
  `world.ts:482-489` also widens `TicketId | CallId` to `string` through `Option.some<string>`.

Before:

```ts
// existing: Unsettled   // user-defined: keyText
readonly attempt: string; // l.attempt === keyText compiles
```

After:

```ts
// existing: Unsettled, Brand.nominal   NEW: AttemptId
readonly attempt: AttemptId; // l.attempt === keyText: error, no overlap
```

### F8. Closed vocabularies handed out as `string`

These need no generics, only an existing union or a named one.

- **`RuntimeCut`:** `lanes[].phase`, `owed[].channel`, `owed[].reason`, `owed[].delivery` and `timers[].kind`
  (src/host/inspect.ts:34-55). T104 names Phase, Channel and Timer. `delivery`, `reason` and `Unsettled.state` are
  new. About 51 comparisons.
- **`Diagnostic.details`:** `Record<string, Detail>` (src/error.ts:63). `d.details["reson"] ?? null` turns a typo
  into a silent `null` (lead-gaps L8; 8 test sites). The fix is a `Diagnostic` union by code, each code with the
  detail keys Flow writes (src/host/snapshot.ts:66, :148; src/operation-checks.ts:88; src/error.ts:156).
- **`Tab.name`:** typed `string`, but the only name is `"main"` (src/host/testing/steps.ts:15).
- **Bench:**
  - `quickMemory(m, kind: string)` (bench/benches/index.ts:138). A typo there silently runs no memory probe; probe
    s4-bench confirmed the typo is caught once typed.
  - `bench({ id, concern })` lets the id and the concern disagree (bench/declare.ts:75).
  - The tier union is copied four times.
  - `Row.power`, `Row.runtime` and `Row.budget_state` are `Schema.String`.

### F9. Inference: returned object literals are not checked for excess keys

- **Root:** TypeScript checks a contextually typed arrow's returned object by assignability, not freshness, so an
  excess key beside a valid one passes. A typo alone is still caught, by weak-type detection.
- **What compiles today** (lead-gaps L4 and L6, s5-d, s5-e, s6-b:13-24):
  - `updateMemory: () => ({ count: 1, cuont: 2, who: "x" })`. By code reading, the turn spreads the patch
    (src/core/turn.ts:398) and `admit` only freezes it (src/core/serve.ts:199). So the typo key enters memory, and
    the write to the `Flow.input` field `who` changes an identity field with no refusal. This was not run.
  - `{ default: S.IDLE, onn: {} }`.
  - `{ target: S.ON, updateMemry: ... }`.
  - A bogus key inside a handler list.
  - Excess keys in `.from` and `send` returns.
- **One fix:** add a `const B` type parameter with an exactness check on `machine`'s body:
  `body: (...) => B & Strict<B, MachineBody<D>>`. `Strict` maps over function returns and stops at `~flow` tokens.
  Probe s5-f: four typo shapes fail, and correct handlers and callback parameters still compile. The narrower
  alternative is the same check on `updateMemory` alone, which covers the silent input write.
- **Other inference failures in this family:**
  - **Hoisted `states`:** `const states = ["IDLE", "ON"]` widens `LeavesOf` to `string`, so `S.IDLE` is
    `unknown`. A brand on widened input gives a clear error (s5-j).
  - **`Fake.call`:** `truth` gets no inference source, so 19 fixture handlers annotate it by hand. Taking
    `endpoints: ({ call }) => ...` with `NoInfer<T>` fixes it (s5-m).
  - **Empty payloads:** `E.Ping({ extra: 1 })` compiles when the payload is empty (lead-more), because an empty
    `Record<never, never>` admits any object.
  - **`services`:** the list is never read and is unrelated to `R` (src/contract.ts:186). Both `services: []`
    against a commit that needs `CartApi`, and `services: [Other]`, compile (s5-b, s6-c).

Before:

```ts
// existing: machine, updateMemory   // user-defined: count, who, cuont
machine(D, ({ S }) => ({ default: S.IDLE, on: { go: { updateMemory: () => ({ count: 1, who: "x" }) } } }));
```

After:

```ts
// existing: machine, MachineBody   NEW: const B, Strict   // user-defined: count, who
machine(D, ({ S }) => ({ default: S.IDLE, on: { go: { updateMemory: () => ({ count: 1, who: "x" }) } } }));
// error: 'who' is never in WritableOf<M>
```

## Seams

Most gaps sit at a seam: two modules built apart, where the value crosses and its type does not. 21 seams were
mapped. 14 lose a type the producer holds, and 7 erase it legitimately. Every lossy seam is closed by a carrier
from the Families above, so the seams add no new fixes; they show where each fix has to land.

Four signs mark a lossy seam:

- **(E)** a shared erased intermediate (`Compiled`, `Values`, `Bound`, `Ending`, `Record<string, …>`).
- **(S)** a string key standing in for a typed reference.
- **(D)** two modules each declaring their own copy of one shape.
- **(P)** a phantom the producer has and drops.

The lead read every seam in the code; the gaps they cause were probed above. "Narrow → wide" gives the
producer's type, then the consumer's.

### Lossy seams

1. **Contract → handle.** `transaction`/`resource` (src/contract.ts) → `Handles` (src/definition.ts:251).
   - Types: `Transaction<F, A, E, R>` → `Bound<K, R>` → `WriteHandle<M, Values>`.
   - Sign: (E) `Bound`.
   - Carrier: F1, phantom `~input`, `~key`, `~success`, `~failure` on `Bound`.
   - Closes: T104 item 1 (handles, `attempt`) and gap 10.
2. **Contract → ending → definition events.** `outcomes(endings)` → `operation-checks.ts` and
   `compiled-parts.ts:23`.
   - Types: `A`, `E` and the token's `P` → `Ending` with `from: (value: never)`.
   - Sign: (E) `Ending`. The event is checked by name only, at src/operation-checks.ts:14.
   - Carrier: F2, `Ending<V>` and `WriteEndings<E, A>`.
   - Closes: T104 items 4 and 5 (`Ending.from`, `endingValue`) and gaps 4 to 9.
3. **Definition tokens → machine body and `operations`.** `S`, `E` and `O` tokens → `compile-body.ts`.
   - Types: a definition with its `id` → `"~owner": symbol`, checked at run time (`ForeignToken`).
   - Signs: (S) and (P). The id is held as a value, never as a type.
   - Carrier: F3, a `const Id` brand on tokens.
   - Closes: gaps 11 to 13, and the fixtures' false SAFETY claim.
4. **Definition → `Compiled` → turn callbacks.** `machine(D, body)` → `Compiled` closures (src/machine.ts:107-126,
   src/compile-body.ts).
   - Types: the body's `M`, `P`, `S` and the slot's `V` → `(input: never) => R`, cast back by `erase` and
     `trusted`.
   - Sign: (E) `Compiled`.
   - Verdict: half legitimate. The core is untyped by design, and `Machine<D>` keeps `D` beside `compiled`, so no
     user-facing type is lost here. The defect is the casts' targets. Today they are chosen at each call; with F2
     and `ContextSlot<V, P>` they become derived, one erase point per family.
   - Closes: the (a) and (b) casts in handles.ts, compile-body.ts and machine.ts.
5. **Provider definition → consumer's context slot.** `Provider.select(schema, selector)` → `ContextSlot<V>` →
   `ContextConfig` → the ref's or entry's `context` wiring.
   - Types: the provider's `LeavesOf` and `OutsideOf` and its id → `ContextSlot<V>` with
     `select: (snapshot: ProviderSnapshot<never, never>)`, then `Readonly<Record<string, ActorRef>>` wiring
     (src/host/runtime.ts:51).
   - Signs: (E), (S) and (P). The slot drops which provider it reads, and wiring is keyed by a free string.
   - Carrier: `ContextSlot<V, P>` (T104 item 3), with wiring typed by a NEW
     `{ [K in keyof Cx]: ActorRef<ProviderOf<Cx[K]>> }`.
   - Closes: T104 item 3 and the `erasedSelect` cast.
6. **App → Runtime and Story.** `runtimeSetup<A>` → `Runtime<R>`, `Story.app` → `Cut`, `publishedOf`,
   `samplesOf`.
   - Types: `A` (the app's machines) → services `R` only.
   - Sign: (P).
   - Carrier: F4, `RuntimeSetup<R, A>`.
   - Closes: gaps 14 to 18.
7. **Runtime → actor handle → snapshot.** `driver` and `snapshotOf` → `Actor<D>.getSnapshot()`
   (src/host/runtime.ts:119) and `Cut.read`.
   - Types: `Actor<D>` → `Snapshot` erased. `Snapshot<D>` keeps `operations: Operations` and `context: Values`.
   - Signs: (P) and (E) `Values`. There is also a view mismatch: the runtime strips private fields, but the type
     says inside memory.
   - Carrier: F5, `Snapshot<D, View>`, with operations keyed by F1 and `context: Partial<ContextOf>`.
   - Closes: T104 item 1 (`getSnapshot`, `operations`), T104 item 3 (`context`) and gaps 19 to 21.
8. **Core lifecycle → snapshot.** `actorLifecycleOf` (src/core/life.ts:190) → `Snapshot.lifecycle`
   (src/host/snapshot.ts:38).
   - Sign: (D). The union is written twice.
   - Carrier: one exported `Lifecycle`.
   - Closes: S4 G6, and the 8 `as const` casts in life.ts.
9. **Runtime → evidence.** The core builds `Evidence` (src/core/evidence.ts:73-150) → the selectors in
   src/host/testing/select.ts and `attachInspector`.
   - Types: the event tag, leaves and operation names (held by the definition, and by the selector's token or
     ref) → `string`.
   - Sign: (E) heterogeneous `string` rows. The core legitimately mixes actors; the selector does not.
   - Carrier: F6, `Evidence<N>` narrowed by the selector. The core keeps the wide default.
   - Closes: gaps 22 to 25, and T104 item 2's "evidence selectable by operation token".
10. **Core state → inspection.** `driver` world → `RuntimeCut` (src/host/inspect.ts:52-77).
    - Types: `Phase["_tag"]`, `Channel`, `Delivery["_tag"]`, the timer kind, `ActorId` and `Snapshot<D>` →
      `phase`, `channel`, `delivery`, `reason` and `kind` as `string`, `actor: string` and an erased `Snapshot`.
    - Sign: (D). `inspect.ts` declares its own row shapes. `lifecycle: Life["_tag"]` shows the right pattern
      already in the same type.
    - Carrier: build the rows from the core types (`Phase["_tag"]`, `Channel`, `Delivery["_tag"]`), with no
      generics. `actors[].snapshot` follows F4 and F5.
    - Closes: T104 item 2 (`RuntimeCut` tags) and gap 28.
11. **Fake server → cut and trace.** `Fake` endpoints (`EndpointHandle`, typed `I`) → `Cut.calls`
    (src/host/testing/run.ts:70) and `TraceRecord.Request` (src/host/trace.ts:22).
    - Types: an endpoint's request `I` and its server and endpoint names → `CallEntry<Values>` with
      `server: string` and `endpoint: string`.
    - Signs: (S) and (D). The call shape is written twice, in `Cut.calls` and `TraceRecord.Request`.
    - Carrier: drop `Cut.calls` for `read(endpoint)`, which is already typed (T104 item 2). Derive
      `TraceRecord.Request` from `CallEntry`.
    - Closes: T104 item 2 (`calls`) and the 19 `c.endpoint === "…"` sites.
12. **Record keys → storage, cut and fake.** `actorRecordKey` and `laneRecordKey` (src/core/record.ts) →
    `Store.load`, `Bytes.key` (src/host/host.ts:16), `Cut.records.stored` and `Fake.storage.put`.
    - Types: a record kind and its identity → `string`.
    - Sign: (S).
    - Carrier: the `RecordKey` brand (T104 item 2), extended to the F7 ids (`AttemptId`, `LaneId`,
      `IncarnationId`, `ActorKey`).
    - Closes: T104 item 2 (records) and gap 26.
13. **Issues → diagnostics.** The core's issue codes and Flow's `Finding`s (src/host/snapshot.ts:66, :148;
    src/operation-checks.ts:88; src/error.ts:156) → `Diagnostic.details`.
    - Types: per-code detail keys (`reason`, `refused`, `slot`) → `Record<string, Detail>`.
    - Sign: (E) a `Record<string, …>`.
    - Carrier: F8, `Diagnostic` as a union by code.
    - Closes: gap 27.
14. **Services → run-promise and driver.** `SetupConfig<A>` (`ServicesLayer<ServicesOf<A>>`) →
    `RuntimeConfig.services: Layer<never, unknown>` (src/host/runtime.ts:225) → `run-promise.ts:51`.
    - Types: `R` → erased.
    - Sign: (P).
    - Carrier: `RuntimeConfig<R>`.
    - Closes: the `run-promise.ts:51` (b) cast.

### Legitimate seams

- **Record encoder → decoder** (src/core/record.ts, src/core/record-format.ts, `Store`). This is a persisted
  format, so it is `Values` and text by necessity.
  - Recovery: decoded once at load with the machine's own codecs (`Format`, `ActorJson`, the memory codec). A
    record that fails goes to quarantine. The type returns at `Snapshot<D>`, not before.
  - One defect: the quarantine reason is free text, so it needs a `QuarantineWhy` union (gap 25).
- **Contract input → commit call** (src/contract.ts:254, :306). Here `Compiled` holds `Values`.
  - Recovery: decoded once, by the lane walker at commit or the lane record at load, then cast once at the single
    call boundary. This is a valid (c).
- **Host JSON → codec** (src/core/codec.ts:288). This is wire data.
  - Recovery: decoded once, by the codec's own walk.
- **`Compiled` call effect → driver** (src/host/driver.ts:52). This is a heterogeneous runtime list of every
  contract's effect.
  - Recovery: the Runtime provides the services that `RuntimeSetup<R>` checked, so the type is not recovered,
    only guaranteed.
- **The core's world and evidence log.** This mixes many actors in one runtime list.
  - Recovery: narrowed per selector (seam 9), not in the core.
- **CLI discovery → Story** (src/host/cli/discover.ts, `Story<string>`). This is a glob and a dynamic import.
  - Recovery: none statically. src/host/cli/discover.ts:100 checks the Story's app at run time.
- **Bench declaration → history CSV** (bench/declare.ts, bench/history.ts). This is a persisted CSV.
  - Recovery: decoded once with `Schema`. Two defects remain on the producer side: a `kind` and `id`/`concern`
    that are not tied together, and `Schema.String` rows where literal unions exist (gaps 30 and 31, S4 G10 and
    G11).

### What the seam map changes

- **Order:** seams 1, 2, 5 and 6 are the four carriers. Each feeds several seams downstream:
  - `Bound` feeds seams 7 and 9.
  - `Ending` feeds seam 4.
  - `ContextSlot<V, P>` feeds seam 7's `context`.
  - `RuntimeSetup<R, A>` feeds seams 7, 9 and 10.

  So the suggested order below stands, with `ContextSlot<V, P>` moved up beside F1.
- **(D) seams need no generics:** 8, 10 and 11. They reuse a type that already exists, so they can land first.

## New gaps

The gaps below are not in T104. Probe "yes" means a two-sided check confirmed it: the wrong line compiles today,
and a control line fails as it should. Each gap gives its family, and the sites are approximate.

1. src/definition.ts:268, F9: `updateMemory: () => ({ count: 1, who: "x" })`. Holds: `WritableOf<M>`. Probe: yes, L4.
   Sites: 237. Risk: High: an input field rewritten silently.
2. src/definition.ts:268, F9: `updateMemory: () => ({ count: 1, cuont: 2 })`. Holds: `WritableOf<M>`. Probe: yes, L4.
   Sites: 237. Risk: High: the write is lost.
3. src/machine.ts:147, F9: `({ default: S.IDLE, onn: {} })`, `{ target, tagret }`. Holds: `MachineBody<D>`. Probe: yes,
   s5-d/e. Sites: all bodies. Risk: Medium: an `on` is lost.
4. src/contract.ts:58, F2: `success: E.Got` with no `.from`, `Got` needs a payload. Holds: `PayloadOf`, `A`. Probe: yes,
   L2. Sites: 75. Risk: Medium.
5. src/contract.ts:58, F2: `unknown: E.Ok`, a certain event. Holds: the uncertain marker. Probe: yes, L1. Sites: 75.
   Risk: Low: refused at construction.
6. src/contract.ts:58, F2: `unknown: E.UF`, `UF = Flow.uncertain({ why })`. Holds: the marker's `F`. Probe: yes, L3.
   Sites: 72. Risk: Medium: silent.
7. src/definition.ts:102, F2: `E.Done.from((v: { receiptt: number }) => ...)`. Holds: `A`, `E`. Probe: yes, s5-n. Sites:
   104. Risk: High: the mapper reads undefined.
8. src/definition.ts:296, F2: `schedules.t.send: E.Need`, `Need` has a required field. Holds: `PayloadOf`. Probe: yes,
   s6-d. Sites: 65. Risk: Medium.
9. src/machine.ts:81, F2: `onContext` `event: E.Count`, `select` returns a string. Holds: `select`'s return. Probe: yes,
   s6-c. Sites: 95. Risk: Medium.
10. src/contract.ts:184, F1: `key: ["b"]` with `b` optional. Holds: `const` key tuple. Probe: yes, s5-h. Sites: 75.
    Risk: Low: refused at construction.
11. src/operation-checks.ts:14, F3: `success: OtherE.E.Boom`, same name as a local event. Holds: definition brand.
    Probe: yes, s6-b. Sites: 75. Risk: Medium: silent.
12. src/definition.ts:173, F3: `default: Other.S.IDLE`, same path. Holds: definition brand. Probe: yes, L5. Sites: all.
    Risk: Low: `ForeignToken`.
13. src/definition.ts:208, F3: `actions: [Cart.O.add.cancel]` in `machine(Pay)`. Holds: definition brand. Probe: yes,
    s6-b. Sites: all. Risk: Low: `ForeignToken`.
14. src/host/testing/run.ts:74, F4: `run.end.read(rent)` on a shop run gives `undefined`. Holds: app's `Ds`. Probe: yes,
    s3-a. Sites: 498. Risk: High.
15. src/host/testing/select.ts:131, F4: `publishedOf(shopRun, rent)` gives `[]`. Holds: app's `Ds`. Probe: yes, s3-a.
    Sites: 3. Risk: High.
16. src/host/runtime.ts:175, F4: `shopRt.ensureActor(foreignRef)`. Holds: app's `Ds`. Probe: yes, s6-b. Sites: 153.
    Risk: Low: `ForeignActorRef`.
17. src/host/testing/story.ts:55, F4: `storeStory.send(rent, ...)`. Holds: app's `Ds`. Probe: yes, s5-q. Sites: ~2,400.
    Risk: Low: run faults.
18. src/host/testing/samples.ts:75, F4: `samplesOf({ actors: { rent }, values: { x: 42 } })`. Holds: `Ds`, `EventOf`.
    Probe: yes, s3-b. Sites: 28. Risk: Low: printed repro only.
19. src/host/snapshot.ts:27, F5: `snap.memory.secret` on an outside snapshot. Holds: `OutsideOf<M>`. Probe: yes, L9.
    Sites: after T104 item 1. Risk: High once typed.
20. src/host/snapshot.ts:126, F5: resting `context: {}` typed as all slots. Holds: `Partial<ContextOf>`. Probe: code
    read. Sites: 3. Risk: High once typed.
21. src/host/snapshot.ts:138, F5: quarantined `memory: {}` typed as `MemoryOf`. Holds: refusal / `Option`. Probe: code
    read. Sites: 1. Risk: Medium.
22. src/core/evidence.ts:73, F6: `turnsOf(run, D.E.go).filter((t) => t.to === "NOPE")`. Holds: leaves, tag, ops. Probe:
    yes, L7. Sites: ~30. Risk: High: vacuous negatives.
23. src/core/lanes.ts:126, F6: `decline(a, op, "Rejectd")`, `Ended.reason: "Canceled"`. Holds: `Decline`, `NotSentWhy`.
    Probe: yes, s4. Sites: ~17. Risk: Medium.
24. src/core/evidence.ts:149, F6: `SlowWork({ input: "Bootz" })`. Holds: `Input["_tag"]`. Probe: yes, s4. Sites: 1.
    Risk: Low.
25. src/core/world.ts:87, F6: `retiredOperation(a, k, "operaton")`. Holds: `QuarantineWhy`. Probe: yes, s4. Sites: 3.
    Risk: Low.
26. src/host/inspect.ts:40, F7: `l.attempt === keyText`, `laneRecordKey(actorKey(a))`. Holds: brands. Probe: yes, s4/s2.
    Sites: ~80. Risk: Medium.
27. src/error.ts:63, F8: `d.details["reson"] ?? null`. Holds: details by code. Probe: yes, L8. Sites: 8. Risk: Medium:
    silent `null`.
28. src/host/inspect.ts:34, F8: `owed[0].delivery === "Typo"`, `reason`, `Unsettled.state`. Holds: core unions. Probe:
    yes, s2-a. Sites: ~51. Risk: Medium.
29. src/host/testing/steps.ts:15, F8: `c.tab.name === "mian"`. Holds: `"main"`. Probe: yes, s3-a. Sites: few. Risk:
    Medium for negatives.
30. bench/benches/index.ts:138, F8: `kind === "leak-per-cyle"`. Holds: `MEASURES` kinds. Probe: yes, s4-bench. Sites: 1.
    Risk: High: no probe runs.
31. bench/declare.ts:75, F8: `bench({ id: "memory.x", concern: "turn" })`. Holds: `` `${Concern}.${string}` ``. Probe:
    no. Sites: all benches. Risk: Medium.
32. src/definition.ts:490, F9: hoisted `const states = [...]` turns the tree into `string`. Holds: literal tree. Probe:
    yes, s5-j. Sites: rare. Risk: Low.
33. src/definition.ts:96, F9: `E.Ping({ extra: 1 })` for an empty payload. Holds: empty payload. Probe: yes, lead-more.
    Sites: few. Risk: Low.
34. src/contract.ts:186, F9: `services: []` with a commit needing `CartApi`. Holds: `R`. Probe: yes, s5-b/s6-c. Sites:
    75. Risk: Low: dead field.

Also logged, but not counted as a type gap:

- `Step.send` and the `WorldWord.*` constructors are exported though the docs say "never by hand"
  (src/host/testing/steps.ts:30), so `control: "typo"` compiles. The fix is to export the types only.
- A control word on a server that no fixture uses sets truth silently (src/host/testing/fake.ts, `makeWorld.word`).
  This is a run-rule gap, not a type gap.
- `Outcome.failure("plain")` makes the failure untagged, so `FailureTag` leaves no key to map (s6-b:71).
  The runtime outcome was not probed.
- `Flow.uncertain` is accepted as a public event (s6-b:95). Whether that is wrong depends on the Plan.

## Cast inventory

Every `as X`, `as const`, `as unknown as`, `as never`, `satisfies`, `trusted`/`erase`/`codecOf`/`recordCodec` call
and `no-unsafe-type-assertion` disable was counted in `src/`, `fixtures/`, `tests/` and `bench/`. Each was judged
on the code, with any SAFETY comment treated as a claim to check. The classes:

- **(a)** removable now, with a type that exists.
- **(b)** removable once a family's carrier is fixed.
- **(c)** a genuine boundary.
- **(d)** a TypeScript or Effect typing limit.

| Area | (a) | (b) | (c) | (d) | Not a cast |
| --- | --- | --- | --- | --- | --- |
| src/*.ts | 13 | 4 | 4 | 20 | 11 |
| src/host (not testing) | 6 | 1 | 5 | 2 | 6 |
| src/host/testing | 9 | 0 | 1 | 5 | 0 |
| src/core | 14 | 0 | 14 | 18 | 14 |
| bench | 13 | 0 | 10 | 1 | 0 |
| fixtures | 3 | 3 | 14 | 2 | 17 |
| tests | 16 | 1 | 12 | 45 | 12 |
| **Total** | **74** | **9** | **60** | **93** | **60** |

The "not a cast" column holds literal-inference `as const`, exhaustiveness tables
(`as const satisfies Record<IssueCode, Code>`), and `satisfies` against a real named type. Of the casts proper,
47 sit behind a `no-unsafe-type-assertion` disable.

### SAFETY claims that are false

- **The fixtures' `untyped` helpers** say "every refused form here is one the types reject"
  (fixtures/transfers/stories/structure.ts:108, fixtures/sign-in/stories/structure.ts:147). Three forms compile
  with the helper removed (s5-r r1-r3):
  - `orderLookingUpFormsBalance` (fixtures/transfers/stories/structure.ts:160), a foreign handle (F3).
  - `orderHearingFormsEvent` (fixtures/transfers/stories/structure.ts:177), a foreign event (F2, F3).
  - `orderWithHandWrittenEnding` (fixtures/transfers/stories/structure.ts:215), a forged ending (F2).

  Replacing the blanket helper with a per-site `@ts-expect-error` makes the compiler check each claim.
- **src/host/lane-record.test.ts:52** says "the brand has no public constructor", but `Brand.nominal<CallId>()`
  is already used in src/core/cells.test.ts:9.
- **`trusted` at src/definition.ts:592-603** names no type. `A` is inferred from the `Definition` return type, so
  if `Definition` changes, the cast follows it silently. T104 item 5 covers this.

### (a), removable now

src/*.ts (13):

- **src/handles.ts:38, :62, :74, :91, :107 (`erase`):** the internal callbacks take `SelectArg<Values>`, and its
  `event: never` is what blocks assignment. Changed from the sidecar's claim: this holds only once the public
  `SelectArg` drops `event: never`, so that reading `event` becomes a missing-property error (probe s1-erase).
- **src/compile-body.ts:95, :181, :219 (`erase`):** `GuardArg`, `SendArg` and `UpdateInput` over `Values` assign
  to the wide input. `:95` also needs `isCallback` to narrow, keeping the element type (s1-erase x4 to x6).
- **src/definition.ts:588 (`trusted(schema)`):** `Codec<V, I>` assigns to `Codec<V, unknown>` (s1-erase x7).
- **src/contract.ts:160 and :162 (`recordCodec`):** `Struct<F>` and `fromJsonString(keyJson)` assign without the
  helper (s1-codec).
- **src/events.ts:47 (`codecOf` over `toType`):** assigns as is (s1-codec).

src/host, not testing (6):

- **src/host/close.ts:72** (2 `as const`) and **src/host/refs.ts:65, :72, :78**: contextual typing keeps the
  literal (s2-c).
- **src/host/lane-record.test.ts:52:** use `Brand.nominal<CallId>()`.

src/host/testing (9; S3 probed the shapes):

- **src/host/testing/select.ts:58 (`isEventRecord`):** a hand-written predicate; build it from
  `Evidence.$is(...)`.
- **src/host/testing/select.ts:66 (`isTurn`):** use `Evidence.$is("Turn")`.
- **src/host/testing/generate.ts:538, :576, src/host/testing/sweep.ts:217, src/host/testing/fake.ts:479:**
  `as const` where a named return type exists (`Answer`, `Write`, `Source`, `Batch["status"]`).
- **src/host/testing/sweep.ts:364 and src/host/testing/samples.ts:99:** `satisfies` where a return annotation
  would do.
- **src/host/testing/mix.ts:112:** a tuple built from a contextually typed `Map`.

src/core (14):

- **src/core/tx.ts:66 (`branded`):** use per-kind `Brand.nominal`; this needs `mint` split per kind (s4-casts2).
- **src/core/tx.ts:370:** keep owned arrays in a `Map` (s4-casts).
- **src/core/boundary.ts:261:** `Object.create` returns `any`, so an annotation is enough.
- **src/core/life.ts:192-198 and :207** (8 `as const`): add a named `Lifecycle` return type (s4-casts4).
- **src/core/identity.ts:98:** already annotated.
- **src/core/record.ts:341 and :349:** annotate the callback `(): RestoredRow =>`.

bench (13, S4; `tierOf` probed in s4-casts4): literal `as const` at bench/options.ts:90, :92, :94 (4),
bench/stats.ts:143-147 (3), bench/machine.ts:37-41 (3), bench/run.ts:90 (2) and bench/result.ts:129. Named `Tier`,
`Verdict`, `Power` and `Tree` types replace them.

fixtures (3; s5-u):

- **fixtures/sign-in/stories/structure.ts:204 and :220:** `untyped({ days: NaN })` is type-valid without the
  helper.
- **fixtures/command-palette/machines/commands.ts:73:** `satisfies Command` where a return annotation would do.

tests (16; S6, read by hand and not probed, low stakes):

- **tests/rules/rules.test.ts:249, :252, :289:** use `Batch` and `CallStatus`.
- **tests/rules/records.ts:151:** use `Flaw`.
- **tests/rules/deliveries.ts:192-194 and :199:** a local union.
- **tests/write-lanes/payment-held.test.ts:93 and the `lostVoid` tuple in tests/write-lanes/lane-anchors.test.ts:**
  needless tuples.
- **tests/cli/cli.test.ts:37, tests/write-lanes/policy-cells.test.ts:112, and tests/rules/rules.test.ts:62, :270,
  :318, :600:** `satisfies` where a return annotation would do.

### (b), removable once a carrier is fixed

| Site | Family | Note |
| --- | --- | --- |
| src/compiled-parts.ts:23 `endingValue` `as never` | F2 | becomes one erase point with a derived target |
| src/machine.ts:110 `erasedSelect` | `ContextSlot<V, P>` (T104 item 3) | the same |
| src/machine.ts:116 `erasedWhen` | F2 (reaction value) | the same |
| src/definition.ts:595 `Event: trusted(...)` | `EventOf<D>` (T104 item 4) | then (d): runtime union to mapped type |
| src/host/run-promise.ts:51 `effect as Effect<A, E>` | `RuntimeConfig<R>` services carrier (S2) | `provideContext` |
| fixtures/transfers/stories/structure.ts:160, :177, :215 (`untyped`) | F2, F3 | becomes `@ts-expect-error` |
| tests/rules/records.ts:129 `["actor/", ...] as const` | `RecordKey` (T104 item 2) | |

Parameter contravariance at the `Compiled` boundary means the first three keep one cast each. Their target is then
derived from the carrier rather than chosen by the writer.

### (c) and (d), grouped

- **(c), 60:**
  - Effect Schema internals that are not in its types: src/core/boundary.ts:128, :139, :154, :163, :225 and :439.
  - Host JSON parse: src/core/codec.ts:288.
  - The contract input after the lane walker checks it: src/contract.ts:254 and :306.
  - The `Compiled` call effect: src/host/driver.ts:52.
  - Hostile test values: nine copies of `loose` in tests, the 14 `untyped` functions in fixtures,
    `new String() as unknown as string`, `writable<A>` and the malformed `Compiled` in
    tests/compile/compiled.test.ts:73.
  - Exhaustiveness tables.

  `loose` is copied nine times and could be one helper.
- **(d), 93:**
  - A runtime-built record cast into a generic mapped type: src/definition.ts:417, :505-507, :513, :536,
    :592-603, src/events.ts:115, src/host/testing/fake.ts:723, :727 and src/host/testing/run.ts:588.
  - `toCodecJson` types `Encoded` as `Json`: src/contract.ts:161, :163 and src/machine.ts:235.
  - The overload implementation is unchecked: src/host/testing/run.ts:445.
  - `Array.isArray` does not narrow a readonly array: src/compile-body.ts:241.
  - The `entry` wrapper keeps the function's own signature: src/entry.ts:46.
  - A generic indexed access: src/core/tx.ts:157.
  - Tuple `as const` through `.map`: 17 in src/core and 38 in tests.
  - The `Machine<typeof X>` cycle annotations.

## Not fixable, and why

- **Excess keys in returned literals.** TypeScript checks a callback's return by assignability, never freshness.
  Only the `Strict<B>` workaround (F9) closes it, at a cost in type complexity. Without it the gap is a limit.
- **`onContext` as an object literal.** `.from`'s `V` cannot be inferred from a sibling `select` (s5-o), so only a
  builder shape closes it.
- **Runtime records into mapped types.** `Object.fromEntries` and `Object.assign` cannot produce a mapped type over a
  generic key set. One named cast per builder stays, at the (d) sites above.
- **The `Compiled` erasure boundary.** Contravariant callback parameters need one erase point per family. A carrier
  fixes the target, but not the cast.
- **Effect's own typings.** `toCodecJson`'s `Json` encoded side, and the AST internals that `boundary.ts` uses.
- **Nothing narrow is held** for these, so they stay legitimate boundaries:
  - `deny(code)` and `Denied.reasons`.
  - Schedule keys, which are named in the body and not in the definition.
  - `Config`'s story-to-app link, a glob.
  - `samplesOf.names`, identifier text.
  - The erased `Actor` handle's `send`, a method by design.
  - A fake's `Fixture` server set, a Layer.

## Suggested order to merge into T104

1. **F1 `Bound` carrier and a `const` key, with `ContextSlot<V, P>` beside it.** This unblocks T104 items 1 and 3,
   `attempt`, `Snapshot.operations` and F2 (seams 1 and 5).
2. **F5 snapshot view, together with T104 item 1's `getSnapshot`.** This fixes the private-memory and `context: {}`
   lies before they are typed in.
3. **F9 `updateMemory` exactness.** The silent input-field write is a correctness bug, not only a typo.
4. **F4 app carrier, with T104 item 2.** `Cut.read` and `publishedOf` are the highest false-pass risk in tests.
5. **F6 evidence names and F8 closed vocabularies, with T104 item 2.** No generics are needed for F8.
6. **F2 `Ending<V>`, with T104 items 4 and 5.** This removes `endingValue` and 104 hand annotations.
7. **F3 definition brand.** This moves `ForeignToken` from construction to compile time.
8. **F7 id brands**, extending T104's `RecordKey`.
9. **The (a) sweep and the fixture SAFETY fix.** These do not depend on the carriers and can go first if a builder
   is idle.

`ContextSlot<V, P>` (T104 item 3), `RuntimeSetup<R, A>`, `Snapshot<D, View>` and the new `Ending` and token
parameters add a type parameter to a public word, so each is for the user's read.

## Sidecar log

Six Sonnet sidecars covered: S1 plumbing, S2 runtime and inspection, S3 testing route, S4 core and bench, S5
inference, S6 adversary. The lead re-ran every probe.

- **S1 (plumbing).**
  - Accepted: the `Bound` carrier (s1-carrier re-run), the `Ending` gaps 1 to 3 and 6, and the casts at
    contract.ts:160 and :162.
  - Changed:
    - handles.ts `erase` holds only if `SelectArg` drops `event: never`.
    - contract.ts:161 and :163 are an Effect typing limit, not a free cast.
    - The four (b) casts keep one erase point.
  - Rejected: gap 7, `actorRef(OM, "bogus")`. S2 and S5 both show `actorRef` checks names.
- **S2 (runtime and inspection).**
  - Accepted: N1 (s6-b:88), N3 (lead-gaps L8), N4 (s2-a), N5, the private-memory trap (code read, snapshot.ts:163),
    the `as const` (a) casts (s2-c), and the false brand claim.
  - Rejected: N6. It is a glob, so nothing narrow is held.
- **S3 (testing route).**
  - Accepted: G1 to G4, G6 to G8 (s3-a and s3-b compile), and the `Ds` carrier (s3-c and s3-d).
  - Rejected:
    - G5 (`checkpoints["typo"]`). `noUncheckedIndexedAccess` forces a check (s3-a:43 errors; S6 agrees).
    - G9, as a run-rule gap.
    - G10, a hand-built shape.
  - Moved: G11 into F7.
- **S4 (core and bench).**
  - Accepted: G1 (lead-gaps L7) and G2 to G11 (s4 probes, with controls failing as they should), plus the cast
    classes.
  - Dropped: `Denial.code`. No declared code set exists.
- **S5 (inference).**
  - Accepted: #1 and #2 (s5-d and s5-e: nested keys are sometimes checked, root and alternative keys are not), #3
    (s5-h), #4 (s5-n), #6 (s5-t plus lead-more's `D.id: string`), #8 (s5-m), #9, #10 (s5-j) and #11 (lead-more).
    Also accepted: the fixtures' false `untyped` claim (s5-r: r1 to r3 compile, r4 to r8 fail) and the correction
    that the 34 `trusted` hits are name matches.
  - Changed: #5 is a TypeScript limit for the literal form.
- **S6 (adversary).**
  - Accepted: the `updateMemory` gaps, owner mixing, foreign endings, the uncertain-ending gaps (re-probed in
    lead-gaps L1 and L3), schedules, `services`, and the erased `Step`/`WorldWord`.
  - Changed:
    - `Outcome.failure("plain")` is logged as unprobed at run time.
    - The duplicate event and the public `Flow.uncertain` are low, because construction refuses them or they are
      Plan-dependent.
  - The test-cast classes are accepted without probes.
