---
review code-quality-review-2
status open 2026-11-16
description Confirms the first code-quality review and adds three root causes, with construction-side shape checks disagreeing.
---
# Second code-quality review of flow-state-v3 (2026-11-16)

Nothing here is decided; the builder of each Task decides each item.

**Bottom line:** the first review (@review.code-quality-review, queued as @task.V3.T79 and @task.V3.T80)
holds, with one correction (C1). This pass found three new root causes, and they carry real bugs. (1) The
construction side checks shapes by hand in three places that disagree. A probe confirmed four bugs: an event with a
transforming field (`Schema.DateFromString`) passes `E.X` and is then refused by `send`; a malformed payload or
handler throws a raw `TypeError`, not a `FlowError`; and a bad `context` slot is accepted at all. (2) Closed
vocabularies are re-typed as strings. The worst case is that a user error whose `_tag` is `Rejected`, `Cancelled`
or another decline name escapes the StillUnknown rule (cells.ts:166). About 100 of the 132 diagnostic codes have no
producer. (3) Tests repeat helpers, and the pair sweeps burn 1000 seeds whenever a phase is unreachable. They are
63% of the default suite's CPU (82 s of 131 s; wall 15.8 s, 667 tests). The fix that collapses most code is to
decode construction config with Schema (abstraction A1). The one that removes the most bug classes is one
Schema per vocabulary, with total tables (A2).

Reviewed at `eb973a51` in a detached worktree. Paths are under `packages/flow-state-v3/`. Sizes: S under an hour, M
a few hours, L a day or more. Risk is the risk to behaviour. Tags: **T79** (fold into @task.V3.T79), **T80** (fold
into @task.V3.T80), or **new Task**.

## 1. Construction: three shape checkers that disagree (bugs)

Probe: a throwaway test in the worktree, deleted afterwards. P1, P2, P3 and P7 below ran; the rest were read.

- **1a (bug, probe)** `definition.ts:418` checks an event payload's Type side (`Schema.is`), while
  `host/driver.ts:231` decodes the same payload's Encoded side (`decodeUnknownOption(event.payload)`). With
  `events: { At: { at: Schema.DateFromString } }`, `actor.send(D.E.At({ at: new Date(0) }))` throws
  `InvalidEvent`. The payload Struct is also built three times per event (`definition.ts:418`, `:568-570`,
  `compiled-parts.ts:107`). **Fix** A5. **Size** S. **Risk** low. **T79.**
- **1b (bug, probe)** `{ "~flow": X }` with no `fields` passes `construction.ts:371` (two-key test), but
  `definition.ts:390` `fieldsOf` uses `isUncertain` (`construction.ts:21`, one-key test). It returns `undefined`,
  and `Schema.Struct(undefined)` throws `TypeError: Reflect.ownKeys called on non-object`. A third detector is
  `compiled-parts.ts:109`. **Fix** one `uncertainFields(x): Option<Fields>`, or A1. **Size** S. **T79.**
- **1c (bug, probe)** `context` is never validated. `definition.ts:534` filters it out, `construction.ts:452`
  `KNOWN` omits it, and `machine.ts:187-195` reads `provider`/`select` unchecked. `context: { c: 5 }` is
  accepted and fails later at `host/wiring.ts:47-53` ("provided by undefined"). **Fix** a `context` case. **T79.**
- **1d (bug, probe)** Handler values are not shape-checked. `on: { X: null }` throws `TypeError` from
  `compile-body.ts:135` (`config.guard`). `on: { X: "A" }` compiles silently to a no-op. `armOn` drops
  non-strings silently (`compile-body.ts:237`). **Fix** A1. **T79** (or the A1 Task).
- **1e** Token identity is checked for states (`compile-body.ts:93`, `compile.tokens.get`), by name for guards and
  actions (`:100`, `:142`, `Object.hasOwn(operations, name)`), and not at all for `onContext` events
  (`machine.ts:196-202`, `mappingOf` keeps `event.event`). A token from another definition with the same name
  passes. Types prevent it in TypeScript; JS and casts do not. **Fix** A6. **Size** S. **T79.**
- **1f** Paths are re-parsed from dotted strings (`compile-body.ts:56` `pathOf`). Event, operation and schedule
  names may contain `.` (`construction.ts:64-78`, `compile-body.ts:218`), so event `a.b` reports
  `["on","a","b"]` from `compile-body.ts:170-174` but `["events","a.b"]` from construction. **Fix** carry path
  arrays (A1). **Size** M. **T79.**
- **1g** The same rule is checked in two scopes with different keys. Contract ids: `operation-checks.ts:77-106`
  compares by id, writes only, per definition; `core/well-formed.ts:55-65` compares by identity, all operations,
  per app. Key ⊆ input: `contract.ts:131` (`Struct.pick` silently drops), `operation-checks.ts:40-53`,
  `well-formed.ts:155-161`. **Fix** one rule each, run where the operations are known. **Size** S. **T79.**
- **1h** `definition()` calls the operations callback, which builds internal tokens and their Structs
  (`definition.ts:528`, `:416-418`), before it reads findings (`:533`). So a malformed internal event throws before
  any FlowError. Internal tokens are built twice (`:528` and `:593`), and the tree is walked twice
  (`definition.ts:529`, `machine.ts:145-146` via `treeOfDefinition` and `tokenMaps`). **Fix** findings first;
  `definition()` keeps the tree and a token-to-path map for `machine()`. **Size** S. **T79.**
- **1i** Copies and dead parts on the construction side. `SelectArg`/`GuardArg` appear twice (`definition.ts:207,209`
  = `handles.ts:5,7`). There are two `inputFieldsOf`, with different meanings (`core/identity.ts:13` memory input,
  `compiled-parts.ts:31` operation input AST). The reaction shape is written three times (`machine.ts:70`,
  `:94-100`, `core/compiled.ts:318`). `Part.Refused` is never picked (`compile-body.ts:365`), and neither is
  `Part.Reactions` (`:366`, `pick` at `:432-436`). The unreachable operands are `compiled-parts.ts:74`,
  `construction.ts:176`, `definition.ts:476,479` and `:538` (`persist: config.persist`).
  `FlowError.code` stores `findings[0].code` beside `diagnostics` (`error.ts:251,259`). **Fix** delete or derive
  each. **Size** S. **T79.**
- **1j** `core/identity.ts:19-21` rebuilds the name codec with `Schema.Struct` and `fromJsonString` on every call,
  and `host/runtime.ts:144,159` calls `inputFieldsOf` twice per `actorIdOf`. This extends the first review's 3j
  and 9c: build the codec once and store it on `Compiled`. **Size** S. **T79.**

## 2. Closed vocabularies typed as strings (one bug, drift everywhere)

- **2a (bug, read)** `core/cells.ts:163-168` `delivered` exempts a failure from StillUnknown when
  `isDecline(reason)`. The reasons that reach it come only from call results: the user error's `_tag` via
  `flow.ts:137` `reasonOf` and `host/driver.ts:50-66`, or `"Defect"`/`"Interrupted"` (`core/answers.ts:24-31`).
  Flow's own declines never go through `Answered`. So a user failure tagged `Rejected`, `Cancelled`, `Overloaded`
  or `Disposed` after an earlier unknown send stays a definite failure. **Fix** a Story first (WriteAhead
  StillUnknown rule); then drop the check or tag the origin (A3). **Size** S. **Risk** med. **T79** (as a §9 item).
- **2b (behaviour question)** `core/record.ts:88` writes an owed row's value as `null` when it is not JSON (an
  error class instance, a `Date`), with no issue. After a reload the ending delivers `null`. `UnencodableValue`
  (`error.ts`) has no producer. **Fix** a Story; then raise the issue or encode with the operation's failure Schema.
  **T79.**
- **2c** About 100 of the 132 `Code` literals (`error.ts:6-139`) have no producer outside `error.ts`. Examples:
  the `Hydrat*`/`Dehydrate*` codes, `Stale`, `AmbiguousRead`, `IdentityExhausted`, `KeyOmitsInput`,
  `InvalidUsage`, `OutputFailed`. Five `DEFECTS` members are never raised (`error.ts:176-184`). The list is the
  Plans' future vocabulary, held as a public Schema. **Fix** keep only produced codes; add each with its producer.
  **Size** S. **Risk** public type. **T79**, user's read.
- **2d** Subsets and unions are re-typed by hand. `NotSentWhy` (`core/cells.ts:40`) is a subset of `Decline`
  (`vocabulary.ts:6`). `Purpose` appears five times (`host/host.ts:7`, `core/world.ts:47`, `persist.ts:136`,
  `lane-moves.ts:152`, `cells.ts:88`), re-typed again by `edge.ts:18-26`. `"evidence" | "letGo"` appears four times
  (`ledger.ts:65,181`, `evidence-of.ts:19`, `evidence.ts:22`). Commit cues appear three times (`evidence-of.ts:90-95`,
  `lanes.ts:15-20`, `cells.ts:200-236`). `Concurrency` is a hand union (`core/compiled.ts:238`). Guard verdict codes
  are typed `code: string` (`core/turn.ts:114-132`). `Heard` constants wrap literals (`serve.ts:13-23`). **Fix** A2.
  **Size** M. **T79.**
- **2e** Issue classification is written twice: the `DIAGNOSTIC_OF` table (`host/snapshot.ts:33-38`) and an inline
  ternary on the same codes (`:45-46`). `error.ts:187` `classify` is a third rule. **Fix** A2's total table carries
  both code and classification. **Size** S. **T79.**
- **2f** `Finding` (`error.ts:202-208`) re-declares `Diagnostic`'s fields with a wider `path`. **Fix** derive it from
  the Diagnostic Schema's fields. **Size** S. **T79.**

## 3. Core and host, found on a blind read (not in the first review)

- **3a** The refuse sequence (Act.Refused, then replace the issue of that source, then write the incarnation) is
  written six times: `serve.ts:146-158`, `:269-280`, `:358-367`, `incarnations.ts:129-137`, `:175-185`, and
  `context.ts:41-56` (with `serve.ts:81-92` `raised`). **Fix** A4. **Size** S. **T79** (pairs with the first
  review's 2e).
- **3b** Booleans pick a mode where a tag exists. `invoke(at, lane, resend: boolean)` (`lane-moves.ts:126`;
  `Move.Send`/`Resend` exist, `cells.ts:89-90`). The `existing: boolean` of `ensure` (`incarnations.ts:228-239`;
  callers `step.ts:112,118`, `incarnations.ts:107,393`) and `from: Option<ActorRecord>` (`:122,142,168`) together encode
  `Origin = Fresh | Restored | Attach`. `answered(ticket, landed)` (`host/driver.ts:100-101`, `edge.ts:52,101`) carries
  a `Stored | Refused` tag as a boolean. `takeOldest(key, rotated)` (`serve.ts:346`). `Persistence`'s `Touched`
  (`persist.ts:29-36`) has `record: "none" | "kept" | "removed"` plus `now`/`owed` flags. **Fix** pass the tag.
  **Size** S each. **T79.**
- **3c** `serve.ts:369-411` runs two loops (`drain`, `followUps`), each with its own `served` counter, and
  `tx.takeFresh()` is a side channel between them. **Fix** one loop over one queue. **Size** S. **Risk** med (the
  serving order is a rule; keep Turn's order tests green). **T79.**
- **3d** `core/context.ts:191-192` calls `selections(compiled, next)[at]` inside the reactions loop, so every select
  reruns once per reaction. `raise` changes only `issues`. **Fix** compute once before the loop. **Size** S. **T79.**
- **3e** `core/turn.ts:298-353` collects every arm refusal and reads only the first (`const [refused]`). The arming
  shape `{name, send, ms}` (`incarnations.ts:43`) re-types `Arming` (`turn.ts:47`), and arming is written twice
  (`incarnations.ts:41-66`, `:193-200`). `core/persist.ts:94-98` re-maps schedules as `record.ts:118-122` does.
  **Size** S. **T79.**
- **3f** Production `buildRuntime` carries a test-only `admit` hook beside `sink` (`host/driver.ts:87-88,151`,
  `runtime.ts:275,546` passes `() => undefined`). It exists only for Story's turn limit (`testing/run.ts:236-240`).
  The name also clashes with `core/life.ts:137` `admit`. **Fix** Story subscribes through the inspector sink
  (`runtime.ts:226`) and fails its run there. **Size** S. **T80.**
- **3g** Two exported types are named `Move` (`core/tree.ts:39`, `core/cells.ts:75`), and both are imported into
  `turn.ts` and `lane-moves.ts`. `Verdict` arms `Run` and `Drop` do the same thing (`host/runtime.ts:382-386`).
  `host/testing/clock.ts:19-32` queues with `indexOf`/`splice`/`shift`, so `settle` is quadratic. **Size** S.
  **T79** (clock: T80).
- **3h** SAFETY reasons that are false. `contract.ts:142` cites `core/lane.ts`, which does not exist.
  `host/testing/run.ts:420-422` says the checkpoints are "exactly its Names (checked above)", but `:403` checks
  only duplicates. A missing checkpoint is typed present. `core/tx.ts` `mint<Id>(prefix)` brands any prefix as any
  `Id`. **Fix** correct the reasons; check that the checkpoint names are complete. **Size** S. **T79.**

## 4. Public API surface

- **4a** `apps/docs` describes the earlier API. It names `runtime`, `App.layer`, `outcomes`, `useActor`,
  `flowTest`, `withRequestRuntime` and others that v3 does not export (`apps/docs/src/pages/reference/api.mdx:11-21,80`,
  `getting-started.md:101-104`, `guide/recipes.md:32,48`, `guide/testing.md:18`). Conversely, `definition`,
  `actorRef`, `runtimeSetup`, `Outcome`, `deny`, `FlowError` and `Diagnostic` are missing from it.
  `package.json` has no `exports`. **Fix** rewrite the docs from the v3 barrel once the routes in
  `wiki/plans/flow/Package.plan` are set. **Size** L. **new Task:** "Docs and package routes to the v3 API".
- **4b** Types are reachable but cannot be named: `Code`, `Classification`, `Denial` (the return type of `deny`),
  `OutcomeFailure`/`OutcomeUnknown` (the error type of `Outcome.failure`). The tag styles are mixed: `Flow/Failure`,
  `Flow/Denial` and `FlowError`. Doc comments are wrong: `core/compiled.ts:16` says Denial carries data, and
  `flow.ts:104` cites a missing `Flow.Denial`. **Size** S. **T79.**
- **4c** `Actor.send: (event: Envelope) => void` (`host/runtime.ts:185`) accepts any tag, though the definition's
  `E` tokens exist. Unknown tags fail only at run time (`driver.ts:239`). `Machine.compiled` (`definition.ts:643`)
  exposes the core's `Compiled`, including `wiring`. **Fix** `send: (event: EventOf<D>) => void`; hide `compiled`
  behind a symbol, as `[DriverId]` is. **Size** S-M. **T79** (small API; decided by the builder and logged).
- **4d** One idea has two names. There are two exported `InputOf`s with different meanings (`contract.ts:21`,
  `definition.ts:73`). Setup input is both `RuntimeConfig` (`runtime.ts:246`) and `SetupConfig` (`:264`).
  The services list is `Services`/`ServicesOf`/`ServicesLayer`. A schedule's name is `name` in records
  (`vocabulary.ts:52`) and `key` in snapshots (`host/snapshot.ts:27,96,108`). **Size** S. **T79.**

## 5. Tests, fixtures and bench

Timing at `eb973a51`: 79 files, 667 tests, all pass, wall 15.8 s, CPU sum 130.8 s. The slowest files are
`pairs-persisted` 15.3 s, `pairs-lanes` 15.3, `pairs-local` 14.0, `pairs-number-input` 13.4, `pairs-transfers` 13.4,
`pairs-cells` 11.1, `rules/sweep` 8.1, `sweep-land` 7.9, `sweep-unattached` 7.6, `generated/mix` 7.4 and
`generated/sweep` 5.9. Everything else is under 2 s.

- **5a** `pairSweep` (`src/host/testing/sweep.ts:303`) stops only when every phase is found. A fixture with a
  phase the lifecycle rules forbid runs all 1000 `DRIVE_SEEDS` (`tests/generated/pairs.ts:70`). That is 82 s of
  the 131 s CPU. **Fix** stop when the found set equals the phases not forbidden by `FORBIDDEN` (`pairs.ts:30-64`),
  or move the long tail behind `FLOW_STRESS`. **Size** S. **Risk** none to the verdict. **T80.**
- **5b** The three reload sweeps (`tests/rules/sweep*.test.ts`) plus `seeds.test.ts` each walk the same slice.
  `planted.test.ts:25` runs `profile: "stress"` in the default suite. Stress stories are built at import by modules
  that default tests load (`fixtures/number-input/stories.ts:84`, `command-palette/stories.ts:183`,
  `player/stories.ts:77`). **Fix** build stress stories lazily, and consider one sweep pass with three reload modes.
  **Size** S. **T80.**
- **5c** `flow.config.ts:1-18` and `tests/rules/sweep.ts:2-17` omit the lanes and player fixtures, so no reload
  sweep or seed run sees them. **Fix** add them. **Size** S. **Risk** may surface breaches. **T80.**
- **5d** Test helpers are copied. `endings` is copied into six files (`tests/stories/{fake,reload,steps,storage,wire}
  .test.ts:8-10`, `tests/transfers/transfers.test.ts:13`), and `tests/checkout.ts:138` has a different `endings`.
  `SWEEP_MS` is declared in six files. `PAY_DEADLINE` is in `tests/checkout.ts:35` and
  `fixtures/pay/contracts.ts:70`. `nextSeed` is in `fixtures/{number-input,command-palette}/stories.ts`. The two
  identical `Lamp`s are `tests/compile/compiled.test.ts:24` and `construction.test.ts:263`. **Fix** a
  `tests/kit.ts`. **Size** S. **T80.**
- **5e** Tests cite no rule, or a dead one. About 48 titles have no Spec id (for example
  `tests/command-palette/ranking.test.ts:17`, `rules/sweep.test.ts:8-19`, `cli/cli.test.ts:208-210`). Old-suite ids
  `PAY-13..23`, `TURN-01..03`, `PALETTE-n` and `NUMBER-n` appear in no Spec. `tests/write-lanes/one-builder.test.ts:46`
  does not catch those forms. **Fix** cite the Spec rule or delete the test. **Size** M. **T80.**
- **5f** Core unit tests reach internals. `src/core/ledger.test.ts:18-66` hand-builds incarnations and reads
  `world.owed`/`mail`. `src/core/persist.test.ts:86-104,219-228` does the same. Storage key literals
  (`owed/<actor>`) appear in about a dozen tests (`tests/write-lanes/write-ahead-records.test.ts:27,105,127`,
  `src/host/life.test.ts:184,252`, and others). **Fix** keep the record-format tests as format tests that cite
  their rule; port the rest with the seam port. **Size** M. **T80.**
- **5g** `tests/actors/identity.test.ts:172` uses a real `Effect.sleep("150 millis")`. The lint ban on sleeps
  (`vite.config.ts`) covers only `src/**/*.test.ts`. **Fix** extend the rule's glob to `tests/`. **Size** S. **T80.**
- **5h** Exports nobody imports: `fixtures/lanes/machine.ts:103` `lanesApp`, `player/machine.ts:123` `musicApp`,
  `command-palette/commands.ts:119` `fuzzyScore`, `number-input/contracts.ts:68,86`, `tests/rules/deliveries.ts:48,62`,
  `tests/rules/sweep.ts:21,74`, `tests/rules/places.ts:8` and `tests/generated/pairs.ts:10`. (`lanesApp` and
  `musicApp` go live with 5c.) **Size** S. **T80.**
- Bench: clean. `bench/` imports every story from `fixtures/`.

## 6. Proposed abstractions

Ranked by lines removed and correctness gained. Each keeps the core pure, synchronous and deterministic.

### A1. Construction config decoded by one Schema (new Task: "Construction config decoded by Schema")

**Collapses** the hand-written shape checks of `construction.ts` (509 lines; 11 `isRecord`/`WrongKind` sites, the
`KNOWN` set at `:452`, `listFindings` at `:137-176`), the `~flow` guards and string paths of `compile-body.ts:33-56`,
the `context` filter at `definition.ts:534`, and the three uncertain detectors (1b). It fixes 1b, 1c, 1d and 1f. An
estimated 250 to 350 lines go. **Before** (`construction.ts:360-395`, abridged by the first review's 3a):

```ts
const payload =
  Predicate.hasProperty(fields, "~flow") && Predicate.hasProperty(fields, "fields") ? fields.fields : fields;
if (!isRecord(payload)) return [...named, invalid(at, "WrongKind", `${name}'s payload is not a record`, help)];
```

**After:**

```ts
// NEW: one Schema per config field; tokens are declared, not guessed
const FieldSchema = Schema.declare(Schema.isSchema, { expected: "a field Schema" });
const Payload = Schema.Record(Schema.String, FieldSchema);
const Uncertain = Schema.Struct({ "~flow": Schema.Literal("uncertain"), fields: Payload });
const EventsConfig = Schema.Record(Name, Schema.Union([Payload, Uncertain]));
const ContextSlot = Schema.Struct({
  "~flow": Schema.Literal("context"),
  provider: Schema.String,
  select: Schema.declare(Predicate.isFunction),
});
const DefinitionConfig = Schema.Struct({
  id: Name,
  persist: Schema.optional(Schema.Boolean),
  states: StatesConfig,
  events: EventsConfig,
  internalEvents: Schema.optional(EventsConfig),
  context: Schema.optional(Schema.Record(Name, ContextSlot)),
  memory: Schema.optional(MemoryConfig),
  operations: Schema.optional(Schema.declare(Predicate.isFunction)),
});

// NEW: every issue becomes a Finding with an array path; decoding never throws
const findingsOf = (config: unknown): ReadonlyArray<Finding> =>
  Result.match(Schema.decodeUnknownResult(DefinitionConfig)(config, { onExcessProperty: "error", errors: "all" }), {
    onSuccess: () => [],
    onFailure: (issue) => issuesToFindings(issue),
  });
```

`Name` is a `Schema.String` with the `checkName` rule as a check. `issuesToFindings` walks `SchemaIssue.Pointer`
paths (`node_modules/effect/dist/SchemaIssue.d.ts:244-282`), and each check's annotation carries its Flow code.
**Bug classes removed:** a raw `TypeError` from malformed config (decode never throws); a config field nobody
validates (excess properties are errors); paths re-parsed from strings. **Prior art:** Effect
`Schema.decodeUnknownResult`, `SchemaIssue.makeFormatterStandardSchemaV1`; lint-bomb "decode once at the
boundary" (`tools/lint-bomb/STYLE.md`); XState's `createMachine` config types. **Cost** L. **Risk** med:
diagnostic codes and summaries must stay as the construction tests cite them. Port one field at a time, with
`tests/compile/construction.test.ts` as the gate.

### A2. One Schema per closed vocabulary, plus total tables (T79)

**Collapses** 2c-2e and 3b's string modes, and the first review's 3p and §7 partial `REPLACED`: `NotSentWhy`,
five `Purpose`s, four `"evidence" | "letGo"`, three commit lists, `RELEASED`/`REPLACED`/`isInFlight`
(`evidence-of.ts:78-95`, `tx.ts:68`), `Heard`, the verdict `code: string`, `Concurrency`, and `DIAGNOSTIC_OF` with
its ternary. About 60 to 90 lines go. **Before:**

```ts
export type NotSentWhy = "Rejected" | "Overloaded" | "Cancelled" | "StorageRefused" | "Disposed"; // cells.ts:40
const RELEASED: ReadonlyArray<string> = ["Recapturing", "Resending", "Held"]; // evidence-of.ts:78
const REPLACED: Readonly<Partial<Record<Phase["_tag"], LaneFact>>> = {
  Acknowledging: "Superseded",
  Unsent: "Superseded",
  Recapturing: "Released",
  Resending: "Released",
  Held: "Released",
};
```

**After:**

```ts
// existing: Decline   // NEW: NotSentWhy derived with Literals.pick
export const NotSentWhy = Decline.pick(["Rejected", "Overloaded", "Cancelled", "StorageRefused", "Disposed"]);

// NEW: one total table of phase facts; adding a Phase is a type error until every fact is decided
const PHASE = {
  Acknowledging: { sent: false, inFlight: true, replaced: Option.some("Superseded") },
  Unsent: { sent: false, inFlight: true, replaced: Option.some("Superseded") },
  Withdrawing: { sent: false, inFlight: true, replaced: Option.none() },
  OnWire: { sent: true, inFlight: true, replaced: Option.none() },
  Cancelling: { sent: true, inFlight: true, replaced: Option.none() },
  Recapturing: { sent: true, inFlight: true, replaced: Option.some("Released") },
  Resending: { sent: true, inFlight: true, replaced: Option.some("Released") },
  Held: { sent: true, inFlight: false, replaced: Option.some("Released") },
} as const satisfies Record<Phase["_tag"], { sent: boolean; inFlight: boolean; replaced: Option.Option<LaneFact> }>;

// NEW: an issue's diagnostic and classification in one total row
const ISSUE = {
  InvalidTurn: { code: "InvalidConfiguration", classification: "Failure" },
  StorageFailure: { code: "StorageFailure", classification: "Failure" },
  CallbackDefect: { code: "Defect", classification: "Defect" },
  GuardDefect: { code: "GuardDefect", classification: "Defect" },
  Defect: { code: "Defect", classification: "Defect" },
} as const satisfies Record<IssueCode, { code: Code; classification: Classification }>;
```

The `sent` column must be checked against `sentBefore` (`cells.ts`) and the WriteAhead Spec before it replaces
it. The values above are read from `REPLACED` and `isInFlight` only. **Bug classes removed:** a subset that drifts
from its parent; a new phase or code silently missing from a partial list; two classification rules that
disagree. **Prior art:** `Schema.Literals` `.pick` (`node_modules/effect/dist/Schema.d.ts:4147`); the core's own
total `table` in `cells.ts:196` is the house pattern. **Cost** M. **Risk** low.

### A3. Ending reasons tagged by origin (T79, after the 2a Story)

**Collapses** the shared string space of `reason`: user `_tag`s, Flow declines, `"Defect"`, `"Interrupted"`,
`"StillUnknown"` (`cells.ts:167`), the `"Restored"` marker (first review 2b), and the `"Error"` fallback
(`flow.ts:137`). It fixes 2a. About 20 lines go. **After:**

```ts
// NEW: Reason   // existing: Decline
export type Reason = Data.TaggedEnum<{
  Declined: { why: typeof Decline.Type }; // Flow refused before sending
  Ended: { why: "Defect" | "Interrupted" | "StillUnknown" | "Restored" }; // Flow's own ending
  App: { tag: string }; // the application's error _tag, never compared with Flow's names
}>;
export const Reason = Data.taggedEnum<Reason>();

const delivered = (head: Head, channel: Channel, reason: Reason) =>
  channel === "failure" && PHASE[head.phase._tag].sent && Reason.$is("App")(reason)
    ? { channel: "unknown" as const, reason: Reason.Ended({ why: "StillUnknown" }) }
    : { channel, reason };
```

The record format encodes `Reason` as today's string plus an origin field, so `FORMAT` bumps. **Bug class
removed:** a user name colliding with a Flow name. **Prior art:** Effect `Cause` keeps `Fail`, `Die` and
`Interrupt` apart rather than one string. **Cost** M. **Risk** med (record format, evidence text).

### A4. One `refuse` step operation (T79)

**Collapses** the six sites in 3a and the issue replacement by source (`context.ts:54`, `serve.ts:84,186`). About
40 lines go. **After:**

```ts
// NEW: refuse   // existing: tx.act, Act.Refused, Issue
const refuse = (tx: Tx, incarnation: Option.Option<Incarnation>, issue: Issue, ending: Option.Option<Ending>) => {
  tx.act(Act.Refused({ code: issue.code, actor: issue.actor, ending, source: issue.source, slot: issue.slot }));

  return Option.map(incarnation, (live) =>
    tx.put("incarnations", actorKey(live.actor), {
      ...live,
      issues: [...live.issues.filter((i) => !sameSource(i.source, issue.source)), issue],
    }),
  );
};
```

`tx.put` is the first review's §1 edit operation, and `sameSource` its 2e `IssueSource` union. **Bug class
removed:** an Act without its issue, or an issue without its Act, so evidence and snapshot disagree. **Cost** S.
**Risk** low.

### A5. One payload codec per event, Type side throughout (T79)

**Collapses** the three Struct builds (1a) and makes `E.X` and `send` agree. **After:**

```ts
// NEW: EventCodec, built once in definition()   // existing: eventToken, driver send
const eventCodec = (fields: Schema.Struct.Fields) => {
  const payload = Schema.Struct(fields);
  return { payload, is: Schema.is(payload) };
};
// E.X keeps its contract:   if (!codec.is(given)) throw invalidEvent(tag, field)
// driver send (changed):    const decoded = event.public && event.is(payload) ? Option.some(payload) : Option.none();
```

`Compiled.events` holds the same codec, so `compiled-parts.ts:107` stops rebuilding it. **Bug class removed:** a
payload one side accepts and the other refuses. **Cost** S. **Risk** low. Add a Story with a `DateFromString` field.

### A6. Tokens owned by their definition (T79)

**Collapses** the four `~flow` guards (`compile-body.ts:33-46`, the first review's 3m) and the name-versus-identity
split (1e). **After:**

```ts
// NEW: Owner symbol on every token kind   // existing: state, guard, action, event tokens
export const Owner = Symbol.for("flow/Owner");
type Token<K extends string> = { readonly "~flow": K; readonly [Owner]: string };
const owned = <K extends string>(compile: Compile, kind: K, x: unknown, at: ReadonlyArray<string | number>) =>
  Predicate.hasProperty(x, "~flow") && x["~flow"] === kind && Predicate.hasProperty(x, Owner) && x[Owner] === compile.id
    ? Option.some(x as Token<K>)
    : (compile.findings.push(foreign(at, kind)), Option.none());
```

**Bug class removed:** a foreign token with a matching name that passes silently. **Cost** S. **Risk** low.

### A7. A test kit (T80)

`tests/kit.ts` exports `endings`, `SWEEP_MS`, `nextSeed` and a shared `Lamp`, and the tests import `PAY_DEADLINE`
from the pay fixture (5d). About 60 lines go. **Bug class removed:** helpers that drift apart under the same name.
**Cost** S.

Where Effect already is the abstraction: `Schema.Literals.pick` (A2), `Schema.decodeUnknownResult` with
`SchemaIssue` paths (A1), and `Data.taggedEnum` (A3). No new service, queue or scheduler is proposed.

## 7. Corrections to the first review

- **C1** Its 3e lists `core/tree.ts:141` as a defect thrower to merge into one `defect`. It is not a defect. The
  throw is caught by `create`'s `Result.try` (`tree.ts:181`) as the computed callback's own failure. Folding it
  into a shared `defect` would mislabel it. Keep it local, or make the read return a failure value.
- **C2** Its 2e treats `IssueSource` as text only. The source string is also the issue's identity for replacement
  (`context.ts:54`, `serve.ts:84,186`), so the union needs an equality, not just a formatter (see A4).
- **C3** Its §8 ("core purity: clean") stands, but production `buildRuntime` carries a test-only hook (3f).

## 8. Sidecar log

There were four Haiku sidecars at effort high: (a) blind, (b) construction, (c) types/errors/API, (d) tests. The
orchestrator removed the first worktree mid-run, and (b), (c) and (d) then read the main checkout. Their cited
lines were re-read at `eb973a51`, where they match except the builder-edited `host/runtime.ts`.

- **Accepted:** (a) 7, 10-13, 16, 18, 22, 24-27, 29, 30, 32, 35, 37, 42, 44, 46, 47, 55, 57, 58. (b) D1-D7, M1, M2,
  M4, M6, P1-P4, P7-P9, P11, R4, X1-X3. (c) A2 (two false SAFETY reasons, `mint`), A7, A8, A13, A14, A15, A17, A19,
  B2-B6, B8-B10, B12, B13. (d) 1, 6-8, 10 (the two compile Lamps), 12-14, 17, 22, 23, 25-32, 34, 35.
- **Changed:** (a) 2, 28 are folded into A2. (a) 8: the constants are dropped, not made a TaggedEnum. (a) 31 is
  folded into A4. (b) R1 extends the first review's 3j. (c) A9 is kept only as the classification duplicate (2e).
  (c) B7: only `Machine.compiled` is accepted.

**Rejected:**
- (a) 1, 3, 4, 5, 14, 19-21, 23, 33, 34, 36, 38-41, 43, 45, 48-50, 53: already in the first review.
- (a) 9, the driver `running` flag: a plain re-entrancy guard with two states.
- (a) 15, disposal `awaiting` arms: not verified as identical, and low value.
- (a) 51, FiberMap: `FiberMap.setUnsafe` already removes a completed fiber (`FiberMap.d.ts:356`).
- (a) 52, `Effect.cached` for `ready`: `ready` must consult the life verdict on every call.
- (a) 54: folded into the first review's 5a.
- (a) 56: seam is deleted by T80.
- (b) M3: types for authors, plus one runtime table for JS and casts, is the intended layering.
- (b) M5: the first review's 3k.
- (b) P5: `App` comes from `app()`, which checks ids.
- (b) P6, nested wiring ignoring ref context: the recursion only checks cycles and kinds; low value.
- (b) R2, R3: caches without a measurement.
- (c) A1: one `any`, lint-disabled with a true reason.
- (c) A4, A5: throwing `FlowError` from authoring and public calls is the stated API contract (the user's call).
- (c) A6: the classification is on each Diagnostic by design.
- (c) A10: covered by 2d.
- (c) A11: `"Interrupted"` is a reason, not the `Interruption` code; covered by A3.
- (c) A12: error classes, not codes.
- (c) A16 = (a) 25.
- (c) A18: mapped totally at the boundary.
- (c) B1, B11: the Package plan's routes are future work, folded into 4a.
- (d) 2, 3, 5: each fixture is a stand-alone sample app, so a shared helper would couple them.
- (d) 9, 11: local names in type tests and unrelated files.
- (d) 15, 16: they test the Compile rule and the Spec's cell table on purpose.
- (d) 18: the golden trace is a declared change detector.
- (d) 19: generator tests.
- (d) 20, 21: unverified.
- (d) 24: the bench is clean.
- (d) 33: small and cited.
