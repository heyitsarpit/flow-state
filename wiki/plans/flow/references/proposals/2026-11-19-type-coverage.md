---
review type-coverage
status resolved 2026-11-19 [@task.V3.T104]
    open 2026-11-19
description Resolved, folded into T104: tool-driven pass finds Flow's type gaps are not `any` but narrowed carrier types.
---
# Type coverage, tool-driven pass (proposed)

Folded into @task.V3.T104. The text below is prior art. It tests @task.V3.T104 and the deep survey
(@review.type-gaps-deep) against user-shaped code, and does not
repeat them.

The standard tools find almost nothing, because Flow's gaps are not `any`. The `noPropertyAccessFromIndexSignature`
option flags 25 reads, typescript-eslint's `no-unsafe-*` rules flag 26 sites, and `type-coverage` reports 99.86%.
None of the `any` sites comes through a Flow API, and 23 of the 25 index reads are the one known erased snapshot. The
real gaps are `Values`, plain `string`, `never` and unchecked excess keys, and only review with two-sided probes and
hover types finds them.

That review confirms the survey on user-shaped code: every one of its nine families shows up in the fixtures,
Stories or tests, and a probe confirms the top five. It also finds 17 gaps T104 does not have (2 overlap a family in
part). The worst new ones:

- `ReadEndings.failure` is `Readonly<Record<string, Ending>>`, so a misspelt failure tag on a read compiles and the
  real tag is never required.
- `Flow.initial(schema, (fields) => …)` hands the callback `fields: Readonly<Record<string, unknown>>`, so
  `fields["emial"]` reads `undefined`.
- `story.run({ steps })` and every `(run: StoryRun)` helper drop the checkpoint names.
- A guard callback's `state` is `string`, though the machine holds the leaf union.

By use count, the costliest public types are, in order:

1. The ref parameters typed `<D extends AnyDefinition>` (F4): 3,007 sites.
2. Returned object literals with no excess check (F9): 431.
3. Tokens without a definition brand (F3): 290.
4. The erased `Ending` (F2): 148 `outcomes` fields, plus 90 `.from` maps.
5. The operation handles returning into `Values` (F1): 137.

As a permanent guard, the lint rules are the cheap one; see "Guards worth turning on".

Paths are relative to `packages/flow-state-v3/`. Probes, configs and outputs are throwaway files in the session
scratchpad (`eco/` and `typecoverage/`), outside the repository. T102 was editing `src/core/` while this ran, so line
numbers there are as they stood on 2026-11-19.

## Method

The mechanical checks use tools TypeScript and its ecosystem already have:

1. **The compiler option.** A scratch tsconfig extends the package's with `noPropertyAccessFromIndexSignature` on, and
   runs the repository's `tsc` (TypeScript 7.0.2) over `src`, `tests`, `fixtures` and `bench` by absolute path.
2. **The lint rules.** oxlint 1.94 in type-aware mode runs `no-unsafe-member-access`, `no-unsafe-argument`,
   `no-unsafe-return`, `no-unsafe-call`, `no-unsafe-assignment` and `no-unsafe-type-assertion` from a scratch config,
   as the repository already runs `no-unsafe-type-assertion`.
3. **`type-coverage --strict --detail --ignore-catch`** (2.31.2), installed in the scratchpad. It runs on its own
   TypeScript 5.9.3, since TypeScript 7 has no JavaScript compiler API.
4. **Wide `string` and `number`, by review.** No tool catches these. Sidecars read each area, and every candidate gets
   its exact type from a hover and a two-sided probe.
5. **Casts,** from a grep and the existing lint rule's output.

How probes and hovers work:

- **Probes** are type-checked with `tsc --noEmit --noErrorTruncation`, so each error shows the complete inferred type.
- **Hover types** come from a twoslash-style script. Each `// ^?` line under an expression asks the TypeScript 5.9
  language service for its quickinfo (the tsserver hover).
- **Use counts** in the ranked table were counted once by a compiler-API walk over the same files. The walk was then
  dropped for the standard tools, so the counts are a one-off measure, not a gate.

## Coverage numbers

| Check                                | Scope               | Result                                                    | Through a Flow API |
| ------------------------------------ | ------------------- | --------------------------------------------------------- | ------------------ |
| `noPropertyAccessFromIndexSignature` | all four folders    | 25 errors (TS4111): src tests 6, tests 19                 | 25                 |
| type-aware `no-unsafe-*`             | all four folders    | 26: src 10, tests 14, fixtures 1, bench 1                 | 0                  |
| `no-unsafe-type-assertion`           | all four folders    | 0 reported; 28 production casts carry a disable           | n/a                |
| `type-coverage --strict`             | package tsconfig    | 139,486 of 139,676 typed (99.86%); 190 `any`              | 0                  |
| Wide `string` / `number` review      | public declarations | 5 new candidates, 4 accepted                              | 4                  |
| Two-sided probes                     | 65 files            | 70 controls fail on their own lines; no wrong line errors | n/a                |

**`noPropertyAccessFromIndexSignature`:**

- 23 of the 25 errors are `Option.map(handle.getSnapshot(), (s) => s.memory.x)`. `Actor.getSnapshot()` returns the
  erased `Snapshot`, whose `memory` is `Readonly<Record<string, unknown>>` (F5; `src/host/runtime.ts:119`,
  `src/host/snapshot.ts:37`). Examples: `tests/actors/identity.test.ts:87`, `tests/actors/context.test.ts:419` and
  `src/machine.test.ts:56`.
- The other 2 are `cut.read(r)?.memory.pushed` over an array of refs typed with a wide `D`
  (`tests/sync/sends.test.ts:39`, `:40`).
- **Blind spot:** bracket reads are invisible to it, and the codebase already writes index reads as
  `x["name"]`. So `fields["emial"]`, `d.details["reson"]` and `context["shoper"]` pass.

**`no-unsafe-*`:** every site is a local `any`, not a Flow type.

- Eight sit under a `@ts-expect-error` in `tests/types/*.compile.ts`, on error-typed values.
- The rest come from four kinds of code:
  - `Array.isArray` narrowing to `any[]`: `src/core/data-view.ts:43`, `src/core/same.ts:128`,
    `fixtures/session/machines/nests.ts:56` and `tests/compile/corruption.test.ts:43`.
  - `Object.getPrototypeOf`: `tests/rules/rules.ts:506`.
  - A `Function` call: `src/host/print.ts:38` and `tests/generated/planted.test.ts:16`.
  - JSON walks: `src/core/codec.ts:62`, `:157` and `tests/rules/records.ts:92`.

**`type-coverage`:** the 190 `any` identifiers come from places outside Flow's public API.

- 83 are in production `src`: Schema AST internals, codecs, `driver.ts` effects and `contract.ts:141-175` helpers.
- About 40 are vitest's `expect.objectContaining(…)`, which returns `any`, so
  `memory: expect.objectContaining({ … })` is unchecked.
- The rest are casts (`value as never` and similar), `new Map()` inferred as `Map<any, any>`, and `Array.isArray`.

## Ranked originating public types

Ranked by false-pass risk, then by site count. Each entry is one public declaration.

- **Risk:** High means a test passes, or the app runs, on a silently wrong value. Medium means a typo reads
  `undefined` or matches nothing. Low means construction or the run refuses it.
- **Probe:** every entry has a two-sided probe. The wrong line compiles, and the control fails on its own line for
  the stated reason; this was checked by stripping each `@ts-expect-error` and reading the full error.
- **Hover:** the exact type the hover shows at the gap.

Each entry reads: declaration, sites, risk, probe, T104 status.

1. **Ref parameters, `<D extends AnyDefinition>`.**
   - Declarations: `src/host/testing/story.ts:69-73`, `src/host/testing/run.ts:73` and `src/host/runtime.ts:175`.
   - Sites: 3,007 (send 1,839, ensure 546, read 367, ensureActor 151, dispose 65, detach 39).
   - Risk: High for `read`, Low for `send`.
   - Probe: lead-top f4. T104: F4.
   - Hover: `read: <D extends AnyDefinition>(ref: ActorRef<D>) => Snapshot<D> | undefined`. `D` is not tied to the
     app.
2. **Returned object literals with no excess check:** the `updateMemory` return, the machine body and `operations`.
   - Declarations: `src/definition.ts:271`, `src/machine.ts:152` and `src/definition.ts:351`.
   - Sites: 431 (209, 168, 54). Risk: High.
   - Probe: lead-top f9. T104: F9.
   - Hover: `updateMemory` returns `Partial<WritableOf<…>>`. The type is narrow; only the excess check is missing.
3. **Operation handles:** `commit`, `lookup`, `retry`, `cancel`, `retryable`, `idle` and `get`, with the selector's
   `event`.
   - Declarations: `src/definition.ts:234-249` and `src/handles.ts:9`.
   - Sites: 137. Risk: High.
   - Probes: lead-top f1 and fxm-handles. T104: F1; the `never` event only partly.
   - Hover: `commit: (select: (input: SelectArg<Flat<…>>) => Readonly<Record<string, unknown>>) => ActionToken`, and
     the selector's `event: never`.
4. **Evidence rows:** `Turn.event`, `from` and `to`, `Ended.reason`, `operation` and `attempt`.
   - Declaration: `src/core/evidence.ts:93-149`.
   - Sites: about 100. Risk: High (vacuous negatives).
   - Probe: srct f6-evidence. T104: F6.
   - Hover: `const to: string | undefined`.
5. **`ReadEndings.failure`.**
   - Declaration: `src/contract.ts:69-72`.
   - Sites: 10. Risk: High.
   - Probe: adv a01. T104: **new**.
   - Hover: `failure: Readonly<Record<string, Ending>>`.
6. **`Cut.calls` and `CallEntry.input`.**
   - Declarations: `src/host/testing/run.ts:70` and `src/host/testing/fake.ts:65`.
   - Sites: 38. Risk: High at zero-count asserts.
   - Probe: tests t2. T104: item 2, seam 11.
   - Hover: `server: string; endpoint: string`, and `input: Readonly<Record<string, unknown>>`.
7. **`Ending`, `WriteEndings` and `.from`.**
   - Declarations: `src/contract.ts:58-62` and `src/definition.ts:102`.
   - Sites: 148 fields, 90 maps and 82 hand annotations. Risk: Medium.
   - Probe: fxm-from. T104: F2.
   - Hover: `.from<{ receiptt: number }>(map: …)`, so the hand annotation becomes the type.
8. **`Fake.storage.put`.**
   - Declaration: `src/host/testing/fake.ts:773`.
   - Sites: 54. Risk: Medium; a quarantine Story can pass with nothing quarantined.
   - Probe: fxs h-put-key. T104: item 2, seam 12.
   - Hover: `(key: string, text: string) => …`.
9. **Tokens without a definition brand.**
   - Declarations: `src/machine.ts:60`, `:87`, `:150` and `src/definition.ts:284`.
   - Sites: 290. Risk: Low to Medium.
   - Probes: lead-top f3 and fxs c-same-name. T104: F3.
   - Hover: `Other.S.IDLE` and `Cart.S.IDLE` are both `StateToken<"IDLE">`.
10. **`Snapshot.memory` and `context` through `Values`,** reached via `Actor.getSnapshot`.
    - Declarations: `src/host/snapshot.ts:37`, `:40` and `src/host/runtime.ts:119`.
    - Sites: 25 dot reads (the compiler option) plus bracket reads. Risk: Medium.
    - Probes: tests t4, srct f5 and fxs f-snapshot. T104: F5.
    - Hover: `getSnapshot: () => Option<Snapshot>`, with `memory: Readonly<Record<string, unknown>>`.
11. **`Fake.call` and `Fake.control` hand annotations.**
    - Declarations: `src/host/testing/fake.ts:734` and `:742`.
    - Sites: 42. Risk: Medium.
    - Probe: fxm-fake. T104: F9 in part; **new** that a wrong annotation compiles.
    - Hover: `Fake.call<Fatter, …>`; `T` is taken from the annotation.
12. **Computed `Flow.initial`.**
    - Declaration: `src/flow.ts:78`.
    - Sites: 10 (3 in fixtures). Risk: Medium.
    - Probes: lead-initial, fxm-initial, srct n1 and adv a05. T104: **new**.
    - Hover: `(parameter) fields: Readonly<Record<string, unknown>>`.
13. **A guard callback's `state`.**
    - Declarations: `src/handles.ts:19` (`GuardArg`), `src/definition.ts:259`, and the `idle` and `retryable` keys at
      `:237-240`.
    - Sites: 0 reads today. Risk: Medium.
    - Probe: wide w1. T104: **new**.
    - Hover: `(parameter) state: string`. The machine holds the `Leaf` union.
14. **`app({ machines })` entries:** an entry is not excess-checked, and a ref is accepted as an entry.
    - Declarations: `src/host/runtime.ts:46` and `:95`.
    - Sites: 39 entries with `context`. Risk: Medium.
    - Probe: adv a02. T104: **new**.
    - Hover: `app<{ c: { machine; contxt: { shopper: ActorRef } } }>` keeps the typo key.
15. **`runtimeSetup` takes `persistence` without `scope`, and the reverse.**
    - Declaration: `src/host/runtime.ts:284`.
    - Sites: 3 apps. Risk: Medium.
    - Probe: adv a03. T104: **new**.
    - Hover: `persistence?: { captureMs?: number }` and `scope?: string`, independent of each other.
16. **`StateToken.is` and `child`, and `RootToken.child`.**
    - Declarations: `src/definition.ts:163-178` and `:357`.
    - Sites: 0 today. Risk: Medium.
    - Probe: adv a04. T104: **new**.
    - Hover: `child: (read: StateRead) => string | undefined`.
17. **A control naming its own server's endpoint takes `Schema.String`.**
    - Declaration: `fixtures/services/shop/server/shop.ts:146`; the gap is `src/host/testing/fake.ts`
      `Fake.server`'s `controls`.
    - Sites: 5. Risk: Low to Medium.
    - Probe: wide w5. T104: **new**.
    - Hover: `Shop.crash: (input: { readonly endpoint: string }) => WorldWord`.
18. **`RuntimeCut` rows, `Diagnostic.details` and `Tab.name`.**
    - Declarations: `src/host/inspect.ts:52-72`, `src/error.ts:63` and `src/host/testing/steps.ts:15`, `:62`.
    - Sites: about 42. Risk: Medium.
    - Probe: tests t3. T104: F8.
    - Hover: `details: { readonly [x: string]: string | number | boolean | null }`.
19. **`StoryRun` names dropped,** by `run({ steps })` and by default `StoryRun` parameters.
    - Declarations: `src/host/testing/story.ts:90-91` and `src/host/testing/run.ts:87`.
    - Sites: 53 checkpoint reads (5 erased). Risk: Low to Medium.
    - Probes: fxs b-names and tests t1. T104: **new**.
    - Hover: `checkpoints: { readonly [x: string]: Cut }`.
20. **Vocabulary with no public name:** `Channel`, `LaneFact`, `ReportCode` and `Phase`.
    - Declarations: `src/core/vocabulary.ts:29`, `src/core/evidence.ts:11`, `:23` and
      `src/host/testing/sweep.ts:20`.
    - Sites: 6 helpers annotate `string` instead. Risk: Low to Medium.
    - Probe: wide w3. T104: **new**.
    - Hover: `lane.kind: LaneFact`. The type exists but cannot be imported.
21. **`Failure.rule: string`.**
    - Declarations: `src/host/testing/generate.ts:1012` and `src/host/testing/samples.ts:16`.
    - Sites: 4. Risk: Low to Medium.
    - Probe: wide w4. T104: **new**.
    - Hover: `const rule: string | undefined`.
22. **`Reaction.when` parameters.**
    - Declaration: `src/machine.ts:80`.
    - Sites: 2. Risk: Low to Medium.
    - Probes: adv a06 and fxm-context. T104: **new**.
    - Hover: `when?: (current: never, previous: never) => boolean`.
23. **`Attempt`'s `id`, `key`, `input` and `operation`.**
    - Declaration: `src/core/compiled.ts:232`.
    - Sites: 25. Risk: Low.
    - Probe: srct f7. T104: F1 and F7; `operation` is **new**.
    - Hover: `operation: string`, and `key: Readonly<Record<string, unknown>>`.
24. **`Definition.Event`.**
    - Declarations: `src/definition.ts:406` and `:595`.
    - Sites: 1. Risk: Low.
    - Probe: adv a12. T104: item 4 (the use is new).
    - Hover: `Codec<Envelope<string, Readonly<Record<string, unknown>>>, …>`.
25. **Testing words:**
    - `samplesOf.failures` takes any `WorldWord`.
    - An endpoint and a control can share a name.
    - An unneeded fixture or services Layer is accepted.
    - Sites: few. Risk: Low.
    - Probes: adv a07, a10 and a09. T104: **new**.
26. **Construction-only refusals:** ten shapes the types accept but construction refuses.
    - Declarations: `definition()` and `transaction()`.
    - Risk: Low.
    - Probe: adv a11. T104: **new** (gap 10 covered `key` only).

Rejected as type gaps, with their counts:

- `deny(code: string)` (`src/flow.ts:114`, 50 uses): no declared code set exists, and the survey keeps it.
- `Flow.uncertain(fields)` taking `Schema.Struct.Fields` (58): the user's own schema.
- Ids such as `story.id`, `samples.id`, `ActorId.name` and `Attempt.id` (about 100): user-chosen text. Their brands
  belong to F7.
- Plain numbers such as `open`, `now`, `sequence`, `step` and `retryCount`: they really are any number.
- `Snapshot.schedules[].key` (`src/host/snapshot.ts:42`): schedule names live in the body, not on `D`. The survey
  already keeps it as a legitimate seam.
- The `any`s in tests (vitest `expect.objectContaining`, local helpers): none is a Flow return.
- `src/host/testing/seam.ts:47` `send(tag: string, payload: Values)` (35): internal, not exported. The public
  `Actor.send` takes `EventOf<D>`.
- `Pay.Provider.select(Schema.String, (p) => p.state)` (`fixtures/shop/machines/checkout-flow.ts:28`): the user
  chose a `string` slot, and `Pay.State` already offers the union (1 of 44 `select` calls). This is fixture style.

## New findings

Each finding gives the wrong line that compiles today. The fix shapes are proposals; each is for T104's builder to
settle with a two-sided type test.

### N1. `ReadEndings.failure` is a free record

- **Where:** `src/contract.ts:69-72`. A write's endings are exhaustive over `FailureTag<E>`; a read's are
  `Readonly<Record<string, Ending>>`, though `Resource<F, A, E, R>` holds `E`.
- **Wrong today:**
  - A typo such as `NoRespnse` is a new key.
  - The real failure tag is never required.
  - By code reading, an unmapped failure is dropped (not run).
- **Probe:** adv a01.

Before:

```ts
// existing: ReadEndings, outcomes, Ending, E   // user-defined: lookupFails, Gone, Failed, Ok
export type ReadEndings = { readonly success: Ending; readonly failure: Readonly<Record<string, Ending>> };
lookupFails.outcomes({ success: E.Ok, failure: { Gon: E.Failed } }); // compiles; Gone is unmapped
```

After:

```ts
// existing: ReadEndings (NEW parameter E), FailureTag, Ending   // user-defined: lookupFails, Gone, Failed, Ok
export type ReadEndings<E> = {
  readonly success: Ending;
  readonly failure: { readonly [T in FailureTag<E>]: Ending };
};
lookupFails.outcomes({ success: E.Ok, failure: { Gon: E.Failed } }); // error: 'Gon' not in { Gone }; Gone missing
```

This is the same carrier as F2's `WriteEndings<E, A>`, so it lands with F2.

### N2. Computed `Flow.initial` reads its sibling fields as `Values`

- **Where:** `src/flow.ts:78`, the computed form of `Flow.initial`.
- **Wrong today:**
  - `fields["emial"]` compiles.
  - `fields["email"] as number` compiles.
  - Reading another computed field compiles, and is then refused at creation (`src/core/tree.ts:166`).
  - The fixtures wrap reads in `String(…)`, which turns a missing key into the text `"undefined"`
    (`fixtures/sign-in/machines/session.ts:41`).
- **Probes:** lead-initial, fxm-initial, srct n1, adv a05.

Before:

```ts
// existing: Flow.initial, Values   // user-defined: email, handle
memory: { email: Flow.input(Schema.String), handle: Flow.initial(Schema.String, (fields) => String(fields["emial"])) }
```

After:

```ts
// existing: Flow.initial, definition   NEW: InitialFields<M> (the input and constant fields)
// user-defined: email, handle
memory: { email: Flow.input(Schema.String), handle: Flow.initial(Schema.String, (fields) => fields.emial) }
// error: 'emial' does not exist on { readonly email: string }
```

- **Risk to the fix:** the marker is built before `definition` sees its siblings. Typing `fields` needs `definition`
  to contextually type a sibling-dependent literal, or a curried form.
- **Spike first:** if TypeScript cannot infer it, record it as a TypeScript limit, and make the callback take a
  `Schema`-decoded view instead of a free record.

### N3. Checkpoint names are lost across `run({ steps })` and erased helpers

- **Where:**
  - `src/host/testing/story.ts:90-91`: the `steps` overloads return `StoryRun` (that is, `StoryRun<string>`).
  - The default `StoryRun` parameter accepts a named run and drops its names.
  - `Step.checkpoint` takes `name: string` (`src/host/testing/steps.ts:62`).
- **Wrong today:**
  - `run.checkpoints.ad?.now` is silent, and `run.checkpoints.ad!` throws.
  - In `tests/stories/story.test.ts:76`, `?? again.end` would silently compare the end with itself on a typo.
- **Probes:** fxs b-names, tests t1.

Before:

```ts
// existing: Story.run, StoryRun, steps   // user-defined: added, ad
const run = await story.run({ steps: story.steps });
run.checkpoints.ad?.now; // compiles
```

After:

```ts
// existing: Story.run, StoryRun   NEW: Steps<Names> (story.steps keeps its names)   // user-defined: added, ad
(options: { readonly steps: Steps<Names> }): Promise<StoryRun<Names>>;
run.checkpoints.ad?.now; // error: 'ad' not in "added" | "empty"
```

Helpers take `<N extends string>(run: StoryRun<N>)`. The default becomes `StoryRun<never>`, so an erased helper
cannot index by name.

### N4. `app` entries and `runtimeSetup` options accept shapes the runtime ignores

- **App entries** (`src/host/runtime.ts:46`, `:95`):
  - Inside `app({ machines })`, an entry `{ machine, contxt: {…} }` is not excess-checked, because the `const M`
    inference drops freshness. `machineOf` then discards it, so the default wiring is silently empty.
  - An `ActorRef` passes as an entry.
  - Probe: adv a02. The standalone `AppEntry` control is refused.
- **`runtimeSetup` options** (`src/host/runtime.ts:284`):
  - Persistence is on only when both `persistence` and `scope` are set. Either one alone compiles and silently never
    saves.
  - A negative `captureMs` compiles.
  - Probe: adv a03.

Before:

```ts
// existing: app, runtimeSetup, AppEntry   // user-defined: CartMachine, cartRef, shopApp
app({ id: "a", machines: { c: { machine: CartMachine, contxt: { shopper: cartRef } } } }); // compiles
runtimeSetup({ app: shopApp, persistence: { captureMs: 0 } }); // compiles; never saves
```

After:

```ts
// existing: app, runtimeSetup   NEW: an exactness check on each entry; Persisted (scope and persistence together)
// user-defined: CartMachine, cartRef, shopApp
app({ id: "a", machines: { c: { machine: CartMachine, contxt: { shopper: cartRef } } } }); // error: 'contxt'
runtimeSetup({ app: shopApp, persistence: { captureMs: 0 } }); // error: 'scope' is required with 'persistence'
```

### N5. State reads take and return `string`

- **Where:** `StateToken.is(read: StateRead)` and `child(read) => string | undefined`, plus `RootToken.child`
  (`src/definition.ts:163-178`, `:357`). `StateRead` is `string | { state: string }`.
- **Wrong today:** `S.ON.is("NOPE")` and `S.ON.child(s) === "C"` compile and are always false.
- **Uses:** none in user-shaped code yet, but the docs name these as the public state reads.
- **Probe:** adv a04.

Before:

```ts
// existing: StateToken, StateRead, is, child   // user-defined: ON, A, B
readonly child: (read: StateRead) => string | undefined; // S.ON.child(snap) === "C" compiles
```

After:

```ts
// existing: StateToken (Path), is, child   NEW: StateRead<L>, ChildOf<Path>   // user-defined: ON, A, B
readonly child: (read: StateRead<L>) => ChildOf<Path> | undefined; // === "C": error, no overlap with "A" | "B"
```

### N6. `Fake` handlers accept a lying hand annotation

- **Where:** `Fake.call({ handle })` and `Fake.control(fields, apply)` (`src/host/testing/fake.ts:734`, `:742`).
- **Cause:** `T` is free, so it is inferred from the annotation. `Endpoint.handle` and `Control.apply` are methods
  (`src/host/testing/fake.ts:78`, `:89`), so bivariance lets `(truth: T & { extra: number })` through.
- **Wrong today:** a handler reading `truth.extra` feeds `NaN` into the truth.
- **Probe:** fxm-fake. The survey's F9 `Fake.call` item (s5-m) asks only for inference; this finding adds that the
  wrong annotation compiles.
- **Fix:** take `endpoints: ({ call }) => …` with `NoInfer<T>`, as F9 proposes, and declare `handle`/`apply` as
  properties, not methods.

### N7. Smaller new gaps

- **`Reaction.when`** (`src/machine.ts:80`): the parameters are `never`, so `when: (a: string, b: boolean) => …`
  compiles beside a `select` returning a number. There are 2 such hand annotations
  (`tests/actors/context.test.ts:387`, `:723`). The fix shares F2's limit: infer `V` from `select` with a curried or
  builder shape. Probes: adv a06, fxm-context.
- **`Attempt.operation: string`** (`src/core/compiled.ts:232`): the transaction knows its id literal. `key` and
  `input` are already F1. Probe: srct f7.
- **`samplesOf.failures`** takes any `WorldWord`, including storage words (adv a07).
- **`Fake.server`** lets an endpoint and a control share a name, and `Object.assign` keeps one
  (`src/host/testing/fake.ts:727`; adv a10).
- **Unneeded fixtures and services:** a fixture or services Layer the app does not need is accepted (adv a09).
- **Construction-only refusals:** ten shapes the types accept but construction refuses (adv a11). They are a
  duplicate state, the reserved `root`, a multi-key or empty compound, `states: []`, an empty id, a `_tag` payload
  field, an event in both lists, an optional `Flow.input`, and `key: ["a", "a"]`. All are Low. Cheap ones (a
  duplicate key, an empty id, an empty compound) can be types; the rest stay run-time refusals.

### N8. Plain `string` where Flow holds the union

These were found by review, since no tool flags them. Each type below is the hover type, and each was probed (wide
w1, w3, w4, w5).

- **Guards (`src/handles.ts:19`):** `GuardArg.state` is `string` in every guard and in the `idle`/`retryable` key
  callbacks.

  Before:

  ```ts
  // existing: GuardArg, guard   // user-defined: ONN
  type GuardArg<M, P> = { readonly state: string; readonly memory: M; readonly event: P };
  guard: ({ state }) => state !== "ONN"; // compiles, always true
  ```

  After:

  ```ts
  // existing: GuardArg (NEW parameter S), LeavesOf   // user-defined: ONN
  type GuardArg<M, P, S extends string> = { readonly state: S; readonly memory: M; readonly event: P };
  guard: ({ state }) => state !== "ONN"; // error: 'Leaf' and '"ONN"' have no overlap
  ```

- **Controls that name an endpoint:** `Fake.control({ endpoint: Schema.String }, …)`
  (`fixtures/services/shop/server/shop.ts:146`). Then `Shop.crash({ endpoint: "confrim" })` arms nothing. The control
  sits inside the same `Fake.server` literal as the endpoints, so it cannot name them.

  The fix: `controls: ({ endpoints }) => …` hands it `Schema.Literals` of `keyof E`. The probe's control shows the
  narrowed error `'"confrim"' is not assignable to type '"confirm" | "placeOrder"'`.
- **Unexported vocabulary:** `Channel`, `LaneFact`, `ReportCode` and `Phase` are unions in `src/` with no public
  export. Six test helpers therefore annotate `string` (`tests/checkout.ts:158`,
  `tests/command-palette/palette.stress.test.ts:32`). `laneFacts(r, "Releasd")` counts 0 and compiles.

  The fix: export the names. `EvidenceOf<"Lane">["kind"]` already works today.
- **`Failure.rule: string`** (`src/host/testing/generate.ts:1012`): Flow writes `"turn limit"` and `"inconclusive"`
  itself (`:937`, `:939`), and the rest are the user's `Property.rule` texts. A `!==` filter on a typo passes
  vacuously.

  The fix: `Property<R>` and `Failure<R>` with `rule: R | "turn limit" | "inconclusive"`.

### Changes to known families

- **F1:** the selector's `({ event })` is `never` (`src/handles.ts:9`), so `commit(({ event }) => event)` passes
  for any input. Typing the input (F1) does not close this, because `never` assigns to anything. `SelectArg` needs the
  handler's event type. There are about 10 hand-annotated event key helpers (`byTransfer`, `byRepo`, `byKey`).
- **F3/F4:** the evidence selectors (`turnsOf`, `evidenceOf`) take a token whose machine the run never ran, or a
  `{ actor }` of another definition with a same-named event, and return `[]` (adv a08, fxs g-foreign).
  `publishedOf` was the only selector listed.
- **F5:** `Cut.read(ref)` is already narrow (`state`, `memory`), so a typo in a Story read fails. The erased
  snapshot is reached only through `Actor.getSnapshot()` and `RuntimeCut.actors[].snapshot`. Gap 19's sites are
  smaller than the survey implies.
- **Item 4:** `Definition.Event` is public and decodes to `Envelope<string, Values>`, so `e._tag === "Ad"` on a
  decoded event compiles (adv a12).
- **Seam 11:** two zero-count asserts depend on a literal endpoint compare (`tests/sign-in/session.test.ts:71`,
  `:87`), so a typo in that helper passes both. This raises `Cut.calls` to High.

## Cast inventory

The inventory comes from a grep (string literals and comments stripped) and the existing lint rule. The grep covers
`as X`, `as const`, `satisfies`, the helpers `trusted`, `erase`, `codecOf` and `recordCodec`,
`no-unsafe-type-assertion` disables and SAFETY lines.

- `no-unsafe-type-assertion` reports 0, because every production `as X` already carries a disable with a reason.
- The lint rule therefore guards new casts. It does not judge the kept ones; the classes below do.

| Area             | `as X` | `as never` / double | Helpers                 | `as const` | `satisfies` | Disables | SAFETY |
| ---------------- | ------ | ------------------- | ----------------------- | ---------- | ----------- | -------- | ------ |
| src (production) | 27     | 1                   | 36                      | 68         | 31          | 28       | 29     |
| src `*.test.ts`  | 3      | 4                   | 20 (a local `erase`)    | 12         | 28          | 5        | 5      |
| fixtures         | 0      | 2                   | 3 (`trusted` Story ids) | 16         | 1           | 2        | 2      |
| tests            | 4      | 9                   | 0                       | 62         | 14          | 13       | 13     |
| bench            | 0      | 0                   | 0                       | 24         | 1           | 0        | 0      |

Five raw `as X` grep hits are not casts, and are excluded above: three multi-line `import … as` lines and two prose
lines in `bench/options.ts`.

Classes, as the survey uses them:

- **(a)** removable now.
- **(b)** removable once a T104 carrier lands.
- **(c)** a boundary.
- **(d)** a TypeScript or Effect limit.
- **(n)** not a cast (literal inference, a type-equality check, an exhaustiveness table).

Lines are as they stood when the grep ran.

### Proper casts and helpers, each site

src (production):

- **(a)**
  - `src/handles.ts:38`, `:62`, `:74`, `:91`, `:107` (`erase`), once `SelectArg` drops `event: never`.
  - `src/compile-body.ts:95`, `:181`, `:219` (`erase`).
  - `src/definition.ts:588` (`trusted(schema)`).
  - `src/contract.ts:160`, `:162` (`recordCodec`).
  - `src/events.ts:43`, `:47` (`codecOf`).
  - `src/core/tx.ts:65`, `:73` (`branded` ids; split `mint` per kind), `src/core/tx.ts:381` (owned arrays in a
    `Map`).
  - `src/core/boundary.ts:259` (`Object.create` returns `any`; annotate).
- **(b)**
  - `src/compiled-parts.ts:23` (`as never`, F2).
  - `src/machine.ts:110` (`erasedSelect`, `ContextSlot<V, P>`).
  - `src/machine.ts:116` (`erasedWhen`, F2/N7).
  - `src/definition.ts:595` (`Event`, item 4).
  - `src/host/run-promise.ts:51` (`RuntimeConfig<R>`).
  - `src/compile-body.ts:135`, `:149` (`erase` of send callbacks, F2), new to the inventory.
- **(c)**
  - `src/core/boundary.ts:128`, `:139`, `:154`, `:163`, `:225`, `:439` (Effect Schema internals).
  - `src/core/codec.ts:289` (host JSON).
  - `src/contract.ts:254`, `:306` (the input after the lane walker).
  - `src/host/driver.ts:52` (the `Compiled` call effect).
- **(d)**
  - `src/contract.ts:161`, `:163`, `src/machine.ts:235` (`toCodecJson` types `Encoded` as `Json`).
  - `src/definition.ts:417`, `:505-507`, `:513`, `:536`, `:592`, `:594`, `:596-603`, `src/events.ts:115`,
    `src/host/testing/fake.ts:723`, `:727`, `src/host/testing/run.ts:603` (a runtime record cast into a mapped
    type).
  - `src/core/tx.ts:164` (a generic indexed access).
  - `src/compile-body.ts:241` (`Array.isArray` on a readonly array).
  - `src/entry.ts:46` (the wrapper keeps the signature).
  - `src/machine.ts:126` (`body as AnyBody`).
  - `src/compiled-parts.ts:116`, `src/machine.ts:249` (`codecOf` over a built struct).
  - The helper bodies themselves, one cast per helper: `src/contract.ts:141`, `:175`, `src/events.ts:20`, `:26`,
    `src/handles.ts:24`.

src `*.test.ts`:

- **(a):** `src/host/lane-record.test.ts:52` (`"call-1" as CallId`). Use `Brand.nominal<CallId>()`, as
  `src/core/cells.test.ts` does; its SAFETY claim is false.
- **(c):** `src/host/cleanups.test.ts:454` and `src/host/runtime.test.ts:403` (`seed as unknown as string`, a
  planted bad seed); `src/host/runtime.test.ts:98` (`value as never`).
- **(d):** `src/core/boundary.test.ts:16` and the 20 local `erase(…)` calls at `:29-99` (schemas into `Any`).

fixtures:

- **(b):** `fixtures/transfers/stories/structure.ts:108` (`untyped`, `as never`). Three of its uses compile without
  it (F2, F3; the false SAFETY claim).
- **(c):** `fixtures/sign-in/stories/structure.ts:147` (`untyped`). Its `days: NaN` uses are type-valid, so those
  two calls are (a).
- **(d):** `fixtures/sign-in/stories/structure.ts:123`, `:132`, `:138` (`trusted` Story ids to `Story<never>`).

tests:

- **(c):**
  - `loose = value as never`, copied nine times: `tests/compile/authoring-gaps.test.ts:27`,
    `tests/compile/construction.test.ts:45`, `tests/compile/corruption.test.ts:12`,
    `tests/sign-in/trusted-device.test.ts:42`, `tests/transfers/standing-order.test.ts:52`,
    `tests/transfers/bank-app.test.ts:31`, `tests/session/deep.test.ts:22`, `tests/player/sleep-timer.test.ts:14`
    and `tests/surface/surface.test.ts:21`. One shared helper would do.
  - `tests/compile/compiled.test.ts:73`, `tests/surface/surface.ts:48` and `tests/turn/immutable.test.ts:30`.
- **(d):** `tests/surface/surface.ts:346` (`Effect<unknown, unknown>`).

### `as const` and `satisfies`, grouped

- **(a), named return types would replace them:**
  - `src/core/life.ts:192-198`, `:207` (`Lifecycle`).
  - `src/host/close.ts:72` (2), `src/host/refs.ts:65`, `:72`, `:78`.
  - `src/host/testing/generate.ts:538`, `:576`, `src/host/testing/sweep.ts:217`, `src/host/testing/fake.ts:479`,
    `src/host/testing/mix.ts:112`.
  - `src/core/identity.ts:98`, `src/core/record.ts:339`, `:347`.
  - `satisfies` used as a return annotation: `src/host/testing/sweep.ts:360`, `src/host/testing/samples.ts:80`,
    `fixtures/command-palette/machines/commands.ts:64`, `tests/cli/cli.test.ts:37`,
    `tests/write-lanes/policy-cells.test.ts:112`.
  - bench: `bench/options.ts:90`, `:92`, `:94` (2), `bench/stats.ts:143-147`, `bench/machine.ts:37-41`,
    `bench/run.ts:90` (2), `bench/result.ts:129` (`Tier`, `Verdict`, `Power`, `Tree`).
  - `tests/rules/rules.test.ts:249`, `:252` (`Batch`, `CallStatus`), `tests/rules/records.ts:151` (`Flaw`),
    `tests/rules/deliveries.ts:192-194`, `:199`, `tests/write-lanes/payment-held.test.ts:93`,
    `tests/write-lanes/lane-anchors.test.ts:49`, `:82`.
  - `src/core/ledger.test.ts:83`, `src/host/ledger.test.ts:37`, `src/core/persist.test.ts:279` (annotate the helper
    parameter).
- **(b):**
  - `tests/rules/rules.test.ts:55`, `:266`, `:311`, `:590` (`{ ...real, evidence } satisfies StoryRun`, F6).
  - `tests/rules/records.ts:129` (`["actor/", …] as const`, `RecordKey`).
- **(n):** everything else.
  - Exhaustiveness tables (`as const satisfies Record<…>`) in `src/core/ledger.ts`, `src/core/lanes.ts`,
    `src/core/evidence-of.ts`, `src/core/disposal.ts`, `src/core/cells.ts`, `src/core/serve.ts`,
    `src/core/world.ts`, `src/host/snapshot.ts:51`, `src/host/testing/select.ts:53` and
    `src/host/testing/run.ts:113`.
  - Type-equality checks in `src/core/shapes.test.ts` and `src/host/lane-shapes.test.ts` (24).
  - `satisfies` against a named type in `src/construction.ts`, `src/core/actor-record.ts`, `src/core/record.ts`,
    `src/core/slots.ts`, `src/core/tx.ts:556`, `src/host/owners/owners.ts:432` and `tests/rules/sweep.ts` (6).
  - Literal and tuple `as const` in data: `src/error.ts`, `src/contract.ts:96`, `:100`, `src/compiled-parts.ts`,
    `src/events.ts:65`, `src/core/*` (about 20), the remaining bench and fixture Story data (35), and test word lists
    and tuples (about 40). Tuple `as const` through `.map` is a TypeScript limit, and the rest are not casts.

The survey's 74 removable casts hold, with three corrections:

- `src/compile-body.ts:135` and `:149` are two more (b) sites.
- `src/core/tx.ts:381` and `:164` sit at shifted lines (the survey had `:370` and `:157`).
- `src/core/boundary.ts:261` is now `:259`.

## Re-running the checks

Every command is read-only on the repository and runs from the repository root. `$S` is a scratch folder holding the
configs. Each run takes seconds.

1. **Compiler option.** Write `$S/tsconfig.npa.json`:

   ```json
   {
     "extends": "<repo>/packages/flow-state-v3/tsconfig.json",
     "compilerOptions": { "noEmit": true, "noPropertyAccessFromIndexSignature": true },
     "include": ["<pkg>/src/**/*.ts", "<pkg>/tests/**/*.ts", "<pkg>/fixtures/**/*.ts", "<pkg>/bench/**/*.ts"]
   }
   ```

   Then run `node_modules/.bin/tsc -p $S/tsconfig.npa.json --pretty false --noErrorTruncation`. To group the errors
   by producer, read the receiver at each TS4111 site.
2. **Lint rules.** Write `$S/oxlint.unsafe.json` with `"plugins": ["typescript"]`, every category off, and the rules
   `typescript/no-unsafe-member-access`, `-argument`, `-return`, `-call`, `-assignment` and `-type-assertion` set to
   `"error"`. Then run:

   ```sh
   node_modules/.bin/oxlint --type-aware -c $S/oxlint.unsafe.json --format json \
     packages/flow-state-v3/{src,tests,fixtures,bench}
   ```

3. **`type-coverage`.** Install it apart from the repository: `npm install --prefix $S type-coverage@2 typescript@5`.
   Then, in `packages/flow-state-v3`, run `$S/node_modules/.bin/type-coverage -p tsconfig.json --strict --detail
   --ignore-catch`.
4. **Hover types.** `hover.cjs` creates a TypeScript 5.9 language service from a probe folder's tsconfig. For every
   `// ^?` line, it prints `getQuickInfoAtPosition` at the `^` column of the line above.
   `@typescript/twoslash` gives the same result, but needs a virtual file system that can see the repository's
   files.
5. **Probes.** A probe folder's `tsconfig.json` extends the package's, with `noUnusedLocals: false`, `typeRoots`
   pointing at the repository's `node_modules/@types`, and `include: ["./*.ts"]`. Probes import Flow by absolute
   path.
   - Run `tsc -p <folder> --noEmit --noErrorTruncation`. It must exit 0: every wrong line compiles, and every
     `@ts-expect-error` control is used.
   - To check that each control fails for its stated reason, turn every `// @ts-expect-error` into a plain comment
     and run again. Every error must land on a control line, with the expected full type, and none on a wrong line.
   - This pass found 70 controls in 65 files, with no strays.
   - After a T104 fix, the same wrong lines must fail.

## Guards worth turning on

**The lint rules: cheap, and recommended.** The repository already runs type-aware oxlint, so this is one config
edit.

- Today the `no-unsafe-*` rules flag 26 sites:
  - 10 in production `src`: `actor-record.ts:426`, `boundary.ts:260`, `codec.ts:62`, `:157`, `data-view.ts:43`,
    `same.ts:128`, `well-formed.ts:112` and `print.ts:38` (two rules), `:77`.
  - 14 in tests, of which 8 are deliberate error-typed values under `@ts-expect-error` in `tests/types/`.
  - 1 in fixtures and 1 in bench.
- About 18 small fixes, and a reasoned disable for the 8 deliberate ones.
- It keeps `any` from ever leaking through a Flow API, which none does today. It does not catch `Values`, plain
  `string` or excess keys.

**The compiler option: cheap, low value on its own.** Turning `noPropertyAccessFromIndexSignature` on in
`tsconfig.base.json` flags 25 test reads today, and none in production code.

- 23 are `getSnapshot()` memory (F5), and 2 are `cut.read` over a wide ref array.
- The fix is bracket syntax, which the codebase already uses. So the option only makes index reads visible; it
  narrows nothing.
- Once F5 lands, the 23 sites type-check with dot access, so the option then measures F5's reach.
- Worth it only as a marker for review.

**A `type-coverage --at-least` threshold: not worth it.**

- Today it would sit at 99.86% (190 `any`). Most of them are vitest's `expect.objectContaining`, casts and internal
  codec code, not Flow's API.
- It needs TypeScript 5 beside the pinned TypeScript 7 only to duplicate the lint rules.

**None of the three guards the real gaps.** For those, T104's two-sided type tests stay the gate:

- one per carrier, with the wrong line failing and the correct line compiling;
- plus this file's probes as a starting set.

## Sidecar log

Eight Sonnet sidecars ran: six in the first wave, one area each, and two after the change of method.

- tool: hardened the compiler-API walk. That walk was dropped for the standard tools, and only its one-off site
  counts are kept.
- fxm: the fixtures' machines and operations.
- fxs: the fixtures' Stories.
- tests: `tests/`.
- srct: `src/**/*.test.ts`.
- adv: an adversary against all 107 public words.
- hov: read the hover type for every entry and finding.
- wide: reviewed every area for plain `string` and `number` where Flow holds a union.

The lead's own checks:

- Ran the three standard tools.
- Ran every probe folder again with `--noErrorTruncation` (all exit 0).
- Did the strip-and-recheck pass on all 70 controls.
- Read the probe files.

- **tool.**
  - Changed: its walk is replaced by the standard tools.
  - Accepted: its one-off site counts, used in the ranked list only.
- **fxm.**
  - Accepted: N2 (`Flow.initial`), N6 (`Fake` annotations), the F1 handles, and the `never` event.
  - Changed: fxm-6 (`when`) is merged into N7.
  - Rejected, as the sidecar also judged: `deny` codes, the `definition()` return, and the `operations` record.
- **fxs.**
  - Accepted: N3 (merged with tests T1), the F3 same-name event and the false `untyped` claim, the F3/F4 selector
    extension, and seam 12's `put` keys.
  - Rejected: FXS-1's `schedules[].key` as new. The survey already keeps schedule keys as a legitimate seam. Its
    `context` half is F5.
- **tests.**
  - Accepted: T1 (into N3), T2 (seam 11, raised to High by the zero-count asserts), T3 (F8) and T4/T5 (F5).
  - Accepted: the casts table, with `lane-record.test.ts:52` changed to (a).
- **srct.**
  - Accepted: S1 (the same as N2), the S2 and S3 confirmations, and S4's `Attempt.operation` (into N7).
  - Accepted: the `callback-param-never` sites are test-local dead `catch` handlers.
- **adv.**
  - Accepted as new: N1 (as N1), N2 (into N4), N3 (into N4), N4 (as N5), N5 (the same as N2), N6, N7, N9, N10 and
    N12 (into N7).
  - Changed: N8 is the F3/F4 extension, and N11 is item 4.
  - Accepted: its note that `Cut.read` is already narrow (the F5 change above).
- **hov.**
  - Accepted: all 26 entries confirmed by hover.
  - Accepted, with wording changes, four nuances:
    - `updateMemory` is narrow and lacks only the excess check.
    - `send` ties the ref and the event, so only the app link is missing.
    - `ReadEndings`'s hover shows `Bound<"read", never>` for services, not for failures.
    - Bivariance is invisible to a hover, so N6's method half rests on fxm-fake.
- **wide.**
  - Accepted: W1 (entry 13), W3 (entry 20), W4 (entry 21) and W5 (entry 17).
  - Rejected: W2 (provider state mirrored as text) as fixture style.
