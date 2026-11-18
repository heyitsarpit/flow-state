# Trust boundaries and errors (2026-11-18, proposed)

**Bottom line:** T20 and T81 failed for four structural reasons. No fifth missing check explains them:

- Flow-made tokens are trusted by a `~flow` or `~owner` mark that anyone can copy.
- Builders read and compute from their arguments before any door has decoded them.
- Construction decodes with Effect's call-stack parser rather than the cycle-safe walker that Codec R6 already
  requires.
- No public function has a catch-all, so whatever was missed escapes as a raw `TypeError`.

**Superseded (2026-11-18):** by [replan-2026-11-18.md](replan-2026-11-18.md); `module-composer` is not adopted.

Proposed fix, all of it **proposed**:

- **Builders capture.** They return a branded token holding their arguments and site.
- **Doors decode.** A ~20-line `configDoor` / `callDoor` pair decodes each public call's arguments with the
  existing walker, maps issues to Diagnostics and turns any stray throw into an `origin: "flow"` Defect.
- **Tokens are unforgeable.** A class private-field brand marks object tokens and a module `WeakMap` marks callable
  ones. This replaces every `~` mark and `HandleId`.
- **Callback results are checked.** One callback wrapper keeps the cause and checks each result's shape.
- **Errors say where.** Diagnostic gains `door` and `origin`; FlowError gains a dev-cheap `site`.

I weighed this full-door design against "types first at author time". Full-door wins on the two things T81 was
really about: silent accepts (NaN delays, `{ sec: 5 }`, `retryable(5)`) and errors with a path for JS users, agents
and `flow check` (see "Alternative"). Its drift cost is closed by a type test. Prevention is structural:

- a surface walk that fails on any public function that is neither a door nor a builder;
- a fuzzer derived from each door's argument Schema;
- a lint rule that only `door.ts` and `error.ts` may `throw`;
- internals that take only branded decoded types.

The rebuild is five Tasks. B1 (foundation) lands first and T81 and T92 are rebuilt on it. Nothing in `packages/`
changed.

**Why now:** @task.V3.T20 and @task.V3.T81 each hit the Epic's failure limit on this class after 3 to 4 review
rounds. The same raw throws are routed from `app`, `runtimeSetup`, `actorRef`, `resource` and `transaction`. Each
fix closed one hole and left the next open.

**Read first:** @task.V3.T81 and @task.V3.T20 comments, @task.V3.T92, @spec.Codec (R6), @spec.Diagnostics (R1 to R3,
I9), @spec.Compile (R1, R2, R14), code:packages/flow-state-v3/src/core/boundary.ts#walkerOf,
code:packages/flow-state-v3/tests/compile/corruption.test.ts.

**Risk:**

- Two Plan-level changes need the user: Diagnostic's public Schema gains two fields (Q2), and tokens become nominal
  types (Q4).
- The callback-result check on `updateMemory` costs an extra walk on large patches (Q3).
- Effect 4.1.4 filters returning nested issues are assumed, not yet proven (B1 checks it first).

## 1. The boundary map

### The kinds of input, corrected by the code

The orchestrator's three kinds hold, with two corrections from the code:

- **Data** (config, payloads, inputs, records, callback results): decoded at a door by a walker compiled once per
  Schema. The walker already exists and already does what the analysis asked for: it is cycle-safe and catches
  throws (code:packages/flow-state-v3/src/core/boundary.ts#walkerOf, Codec R6). Construction doesn't use it:
  `findingsAgainst` calls `Schema.decodeUnknownResult` with no catch (`src/config.ts:286-296`). That is T81
  blocker 3.
- **Flow-made tokens** (states, history, events, guards, actions, entry, markers, contracts, bounds, definitions,
  machines, refs, handles, denials): today, kinds are told apart by `hasProperty(x, "~flow")` (`src/config.ts:21`).
  `machine()` accepts a definition on `hasProperty(definition, "~owner")` (`src/machine.ts:150`), and handles on
  the string key `"~flow-state/Handle"` (`src/host/runtime.ts:198,513`). Effect's own `isSchema` and `isLayer` are
  forgeable the same way (string `TypeId` keys). Effect's `Redacted` uses a module `WeakMap` and is the precedent
  for an unforgeable check.
- **User code** (guards, actions, selectors, `updateMemory`, mappers, delays, commits, Layers): this is the kind
  the analysis had wrong. Callbacks are already wrapped, twice and inconsistently:
  - `call` in `src/core/turn.ts:141` and `callSlot` in `src/core/compiled.ts:18` both drop the cause;
  - `updateMemory`'s result is spread and `Object.keys`-ed outside the try (`src/core/turn.ts:325-336`);
  - an ending mapper's result goes into the turn unchecked against its event's Schema
    (`src/core/serve.ts:253-291`).
- **Server answers have no Schema.** Contracts declare `input` and `key` only; the answer type `A` comes from the
  commit's Effect (`src/contract.ts:222-257`). The world-in door for an answer is therefore the payload Schema of
  the event it is mapped into, not an answer Schema. Adding answer Schemas isn't worth it: the raw answer is read
  only by the user's mapper, which is user code.

### The doors

- **L1**: `definition` (`src/definition.ts`); what crosses: config, `operations` callback result, markers,
  contracts; kind: data, tokens, code; mechanism: `configDoor`, `DefinitionArgs`
- **L1**: `machine` (`src/machine.ts`); what crosses: definition, body callback, body result with tokens
  and captured builder args; kind: tokens, code, data; mechanism: `configDoor`, `MachineArgs`
- **L2**: `app` (`src/host/runtime.ts`); what crosses: machine entries, refs, cross-machine rules; kind:
  tokens, data; mechanism: `configDoor`, then rules on the decoded value
- **L2**: `runtimeSetup` (`src/host/runtime.ts`); what crosses: app, services Layer, store, defaults; kind:
  tokens, data; mechanism: `configDoor`; `construct()` only builds
- **L3**: `Actor.send`, `E.X(payload)`; what crosses: event; kind: data; mechanism: `callDoor`,
  compiled check and top-level narrowing
- **L3**: `ensureActor`, `createActor`, `disposeActor`; what crosses: ref or handle, input; kind: tokens,
  data; mechanism: `callDoor`; ref brand, identity walker
- **L3**: `ready`, `dispose(options)`; what crosses: options; kind: data; mechanism: `callDoor`
  (Effect form: the refusal is `Effect.fail`)
- **L3**: Story steps (`src/host/testing/story.ts`); what crosses: refs, events; kind: tokens, data;
  mechanism: the same doors, reused
- **L4**: callback wrapper (`src/core/callback.ts`, new); what crosses: each callback's return or throw;
  kind: code; mechanism: `callback(slot, Result, run)`
- **L5**: boot decode (`src/core/record.ts`, `actor-record.ts`); what crosses: saved records; kind: data;
  mechanism: `decodeAt` over T92's meaning Schemas
- **L5**: mapped ending (`src/core/serve.ts`); what crosses: the mapper's payload; kind: code, data;
  mechanism: wrapper plus the event's compiled check
- **L5**: services Layer build (`src/host/runtime.ts:383`); what crosses: Layer failure; kind: code;
  mechanism: Effect channel, `origin: "callback"`
- **L6**: capture (`src/core/persist.ts`); what crosses: memory and inputs out; kind: data; mechanism
  (proposed): encodability only (existing)
- **L7**: `flow check`, CLI (`src/host/cli/`); what crosses: loaded config; kind: all; mechanism
  (proposed): reuses the L1 and L2 doors

**Not doors (builders, made inert):**

- `S.*` tokens;
- `E.X` as a token, and `E.X.from(f)`;
- `O.*.commit`, `retry`, `cancel`, `idle`, `retryable` and `lookup`;
- `Flow.initial`, `input`, `private`, `uncertain` and `entry`;
- `deny`;
- `Provider.select`;
- `transaction`, `resource` and `.outcomes`;
- `actorRef`.

### Current sites in the wrong layer, or relying on unchecked input

- `src/handles.ts:71-86` `retryable`: problem: reads `first.times` inside `make`, at compile; moves to: builder
  captures; machine door decodes `RetryableArgs`
- `src/handles.ts:55-58,66,94` `commit`, `idle`, `lookup`: problem: args unchecked until a turn runs them; moves to:
  captured; machine door checks `Fn`
- `src/machine.ts:150`: problem: definition trusted by the `~owner` mark; moves to: `DefinitionToken` brand in
  `MachineArgs`
- `src/config.ts:21-37` `decodedWhole`: problem: tokens decoded by shape; partial or forged tokens; moves to:
  `Token.Schema(kind)`: brand, then args
- `src/config.ts:286-296`: problem: Effect parser on the call stack; cycles and getters escape raw; moves to: `decodeAt`
  over the walker
- `src/events.ts:61-77`: problem: builds tokens eagerly; mark fields `~payload`, `~walk` on a public function; moves to:
  callable token behind a `WeakMap`; E.X(payload) is a `callDoor`
- `src/events.ts:115-128` `isAdmitting`: problem: reads a token back by mark; moves to: token lookup
- `src/contract.ts:222-257,266-292`: problem: `Schema.Struct(config.input)` and `codecsOf` eager, raw throws; moves to:
  builder; the definition door builds codecs
- `src/flow.ts:76-82`: problem: `Flow.initial` branches on its argument; moves to: captures
- `src/host/runtime.ts:141-146` `actorRef`: problem: reads `options?.context`; moves to: captures; the ensure door
  decodes
- `src/host/runtime.ts:484-490`: problem: `{ _tag, ...payload } = event` throws raw on a Proxy or getter; moves to:
  `callDoor`
- `src/host/runtime.ts:198-208,493,513-515`: problem: `HandleId` property on a public object; moves to: per-Runtime
  `WeakMap<Actor, ActorId>`
- `src/host/runtime.ts:312-336`: problem: `construct()` refuses the app and computes ids; moves to: `runtimeSetup` door
  decodes; `construct` builds
- `src/core/turn.ts:325-336`: problem: `updateMemory` result spread outside the try; values unchecked; moves to:
  callback wrapper with `Patch` Result
- `src/core/serve.ts:253-291`: problem: mapper result enters the turn unchecked; moves to: wrapper, then the event's
  check
- `src/core/turn.ts:141`, `src/core/compiled.ts:18`: problem: two wrappers, cause dropped; moves to: one `callback`
  keeping cause and slot
- `src/core/record.ts:226-370`, `src/core/actor-record.ts:347-359`: problem: meaning checked field by field by hand;
  moves to: T92's Schemas through `decodeAt`
- `src/core/well-formed.ts`, `src/operation-checks.ts`: problem: contract id and key-in-input checked twice; moves to:
  key-in-input as a filter on the contract Args; contract id once, at the app door

### T20 and T81 findings, by the door each one missed

Row numbers are the sidecar's rows for each Task; review dates are in the Task comments.

- **T81 1, 11: `send` checked payloads differently, kept extra keys**: missed door or mechanism: one compiled check at
  `callDoor` (fixed; keep)
- **T81 2, 3, 4, 15, 16, 17, 18, 23: wrong-kind config, `{ sec: 5 }`, constant start, `definition(null)`**: missed door
  or mechanism: L1 door Schema (fixed one by one; now structural)
- **T81 5, 22: foreign guard, action or event passes by name**: missed door or mechanism: token `owner` read from a
  branded token
- **T81 8, 21, 44: throwing `operations` or body escapes raw**: missed door or mechanism: callback wrapper inside the
  door
- **T81 24, 32: partial bound or ending passes `isBound` or the mark**: missed door or mechanism: brand: a partial token
  isn't a token
- **T81 25, 27, 33, 38, 39: `E.X(null)`, `send(5)`, `E.X(new Date())`**: missed door or mechanism: `callDoor` Args: a
  plain record, not any object
- **T81 26: NaN delay compiles as 0 ms**: missed door or mechanism: refinement in `DelayArgs`
- **T81 28: state named `~path` overwrote its token**: missed door or mechanism: tokens no longer carry `~` fields, so
  there is no clash; reserved names stay a filter
- **T81 35: `O.save.retryable(undefined)` throws in the body**: missed door or mechanism: builder read its argument;
  captured args decoded by `RetryableArgs`
- **T81 36: `machine({ "~owner": Symbol() })`, `states: null`**: missed door or mechanism: brand check in `MachineArgs`
- **T81 37: cyclic or throwing config gives Effect's adapter error**: missed door or mechanism: `decodeAt` over the
  walker; throws become findings with a cause
- **T81 41: raw throws from `app`, `runtimeSetup`, `actorRef`, `createActor`, `resource`, `transaction`**: missed door
  or mechanism: no door, and builders that read
- **T81 42: forged Effect Schema passes `FieldSchema`**: missed door or mechanism: not checkable (contract); its
  parser's throw is caught as `origin: "config"`
- **T81 43: `idle(5)`, `lookup(undefined)` accepted until run**: missed door or mechanism: captured args decoded at the
  machine door
- **T81 30: computed -1 ms delay**: missed door or mechanism: callback result Schema (Turn R14 decides clamp or refuse;
  unchanged)
- **T20 5, 6, 7, 9: unencodable or oversize callback results reach persistence**: missed door or mechanism: L4 result
  check (shape); L6 encodability (existing)
- **T20 18, 22: `~` name or undecodable name restored**: missed door or mechanism: L5: T92 `Identity` Schema
- **T20 29: key names another identity than the content**: missed door or mechanism: L5: identity stored once, in the
  key
- **T20 32, 33: lane key text, owed records of undeclared machines**: missed door or mechanism: L5: lane-key and machine
  literals inside `Identity`
- **T20 35: context bindings unchecked**: missed door or mechanism: L5: bindings derived or decoded by `Identity` (T92)
- **T20 36, 37: read-operation lane, headless `queue` and `inFlight`**: missed door or mechanism: L5: `LaneRecord`
  Schema by operation kind; facts stored once
- **T20 39: saved state the machine lacks**: missed door or mechanism: L5: state literal union from Compiled (T56 owns
  versions)

## 2. The mechanisms

### FlowError and Diagnostic

```ts
// src/error.ts
export const Origin = Schema.Literals(["config", "callback", "call", "server", "storage", "flow"]); // NEW

export class Diagnostic extends Schema.TaggedError<Diagnostic>()("Diagnostic", { // existing
  classification: Classification, // existing
  code: Code, // existing: no new codes
  door: Schema.String, // NEW: the public call, "machine", "Actor.send", "boot"
  origin: Origin, // NEW
  path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])), // existing
  details: Schema.Record(Schema.String, Detail), // existing
  summary: Schema.String, // existing
  help: Schema.String, // existing
}) {}

export class Site extends Data.Class<{ readonly error: Error }> { // NEW: the frame stays lazy
  get line() {
    return this.error.stack?.split("\n")[2]?.trim() ?? "";
  }
}

export class FlowError extends Data.TaggedError("FlowError")<{ // existing
  readonly code: Code; // existing
  readonly diagnostics: readonly [Diagnostic, ...Array<Diagnostic>]; // existing
  readonly cause?: unknown; // existing
  readonly site?: Site; // NEW: in process only (Diagnostics I9); absent when the stack is the site
}> {}
```

**Decided (lead):**

- `door` and `origin` are on Diagnostic, so they encode, reach `flow check` and production logs, and are safe data.
- `site` and `cause` stay on FlowError only, because Diagnostics I9 forbids stacks in leaving values.
- No new codes:
  - A user callback's throw is `Defect` with `origin: "callback"`.
  - A Flow bug is `Defect` with `origin: "flow"`. This keeps the user's T81 ruling ("Defect, not CallbackDefect")
    and fixes the disguise problem by origin, not by a code.
- A rule across machines names one participant in `path` and the rest in `details.with`.

**Site capture:**

- **Builders** capture a site when called: `new Error()` with `Error.stackTraceLimit` toggled to 3, the way
  `Effect.fn` does it (`effect/src/internal/effect.ts:1346-1356`). Builders run once per module load, so this
  happens in every mode. The cost is checked on `startup.*`.
- **Doors** capture nothing. A door's own throw already has the caller's line in its stack.
- **Callbacks** keep their own throw as `cause`.

### Doors: `configDoor`, `callDoor`, `decodeAt`

```ts
// src/door.ts NEW: the only module besides error.ts that throws
// The walker (existing), now returning its Issue rather than "schema" (renamed: decode → decodeIssue).
export const decodeAt = <A>(walker: Walker<A, unknown>, door: string, origin: Origin, value: unknown) =>
  Result.mapError(walker.decodeIssue(value), (issue) => findingsOf(issue, door, origin));

type Spec<S extends Schema.Top> = { readonly door: string; readonly refuses: Code; readonly args: S };

const doors = new WeakMap<Function, Spec<Schema.Top>>(); // NEW: what the surface walk and the fuzzer read

const guarded =
  <S extends Schema.Top, R>(spec: Spec<S>, admit: (args: unknown) => Result.Result<S["Type"], Findings>,
    run: (args: S["Type"]) => R) =>
  (...given: ReadonlyArray<unknown>): R =>
    Result.match(Result.flatMap(admit(given), (args) => Result.try({ try: () => run(args), catch: stray(spec) })),
      { onSuccess: identity, onFailure: (refusal) => { throw toFlowError(refusal); } });

export const configDoor = <S extends Schema.Top, R>(spec: Spec<S>, run: (args: S["Type"]) => R) => {
  const walker = walkerOf(spec.args); // existing, cached per Schema object
  const entry = guarded(spec, (args) => decodeAt(walker, spec.door, "config", args), run);
  doors.set(entry, spec);
  return entry;
};

export const callDoor = <S extends Schema.Top, R>(spec: Spec<S>, run: (args: S["Type"]) => R) => {
  const walker = walkerOf(spec.args);
  const entry = guarded(spec, (args) => admittedAt(walker, spec, args), run); // check and narrow, no rebuild
  doors.set(entry, spec);
  return entry;
};
```

`stray(spec)` turns any non-FlowError thrown by `run` into `Defect` with `origin: "flow"`, the path being read and
the cause. A FlowError that `run` raised passes through unchanged.

`refuses` is the boundary's specific code, which wins over a generic one under Diagnostics R5: `InvalidEvent` for
`Actor.send`, `SchemaValidation` for refs, `InvalidConfiguration` for config.

An Effect-returning door, such as `ready` or `dispose`, uses `callDoor.effect`. Its refusal is `Effect.fail` rather
than a throw (Diagnostics R1).

**Decided (lead): a helper, not a convention.** A convention ("export an Args Schema, map issues, add a catch-all")
is the discipline that failed three times. The catch-all is exactly what each fix forgot. The helper is about 20
lines and buys three things a convention can't:

- every public function has the catch-all by construction;
- registration in `doors` lets the surface walk reach nested public functions that `src/index.ts` doesn't list:
  `E.X`, `O.*`, `actor.send` and the Runtime's methods;
- the fuzzer reads each door's `args` to generate hostile values.

Inside, it uses only what exists: Effect Schema, `Result`, and the walker.

### Tokens: language brands, no registry subsystem

```ts
// src/token.ts NEW
export class Token<K extends Kind, A> { // object tokens
  readonly #token = true; // the brand: a copy, Proxy or partial object never has it
  constructor(readonly kind: K, readonly owner: object, readonly args: A, readonly site: Site) {}
  static is(x: unknown): x is Token<Kind, unknown> {
    return Predicate.isObject(x) && #token in x; // never runs a Proxy trap or a getter
  }
}

const behind = new WeakMap<Function, Token<Kind, unknown>>(); // callable tokens: E.X, keyless retry, cancel

export const callable = <F extends Function>(f: F, token: Token<Kind, unknown>) => (behind.set(f, token), f);

export const tokenOf = (x: unknown) => (Token.is(x) ? Option.some(x) : Option.fromUndefinedOr(
  Predicate.isFunction(x) ? behind.get(x) : undefined));
```

**Which get which (decided, lead):**

- **Class brand.** These are objects: state, history, guard, action, entry, `Flow.*` markers, `Provider.select` slot,
  contract, bound, ending mapping (`E.X.from(f)`), `deny` (Denial), `actorRef`, Definition and Machine. The door
  makes Definition and Machine as `Token` subclasses; their public fields (`S`, `E`, `O`, `Event`, `compiled`)
  stay.
- **`WeakMap` behind a function.** These are callable: `E.X`, a keyless `O.x.retry` and `O.x.cancel`. A `WeakMap`
  rather than a `WeakSet`, because the token behind the function carries the args and owner. That moves `~payload`,
  `~walk`, `~names` and `ending` off the public function.
- **Per-Runtime `WeakMap<Actor, ActorId>`.** This is for Actor handles. Another Runtime's handle simply isn't in
  the map, so `ForeignActorRef` needs no field.

`Token.Schema(kind)` is `Schema.declare(isKind)` with a filter. The filter decodes `token.args` by its builder's
Args Schema and reports the Issue under `args`. This is the one Effect feature B1 must prove first (risk).

### Builders

```ts
// src/token.ts NEW: the only way a builder is written
export const builder = <K extends Kind, S extends Schema.Top>(kind: K, args: S, owner: object) => {
  const make = (...given: ReadonlyArray<unknown>) => new Token(kind, owner, given, siteHere());
  builders.set(make, { kind, args }); // what the fuzzer and Token.Schema(kind) read
  return make;
};
```

### The callback wrapper

```ts
// src/core/callback.ts NEW: replaces call (turn.ts:141) and callSlot (compiled.ts:18); the one module with try
export type Failed = { readonly slot: string; readonly cause: unknown; readonly returned: boolean };

export const callback = <A, R>(slot: Slot<(input: A) => unknown>, result: Check<R>, input: A) => {
  let value: unknown;
  try {
    value = slot.run(input);
  } catch (cause) {
    return Result.fail<Failed>({ slot: slot.slot, cause, returned: false });
  }
  return result(value)
    ? Result.succeed(value as R)
    : Result.fail<Failed>({ slot: slot.slot, cause: value, returned: true });
};
```

`Check<R>` is a compiled type-side check (`walker.is`), or a brand check such as `r === true || Denial.is(r)`. It is
never a full decode on the hot path. The turn reports `Defect` with `origin: "callback"` at `slot`. The pure core
validates nothing else; it imports `callback.ts` and the walker's check, never a door.

### Before and after, on four real exports

**1. `machine()`.** Data comes from the user's `cart.machine.ts`; T81 blockers 1 and 2.

```ts
// Where it comes from: fixtures/shop/machines/cart.ts (user-defined: Cart, Add, adding)
export const CartMachine = machine(Cart, ({ S, O }) => ({ // existing: machine, S, O
  default: S.Open, // existing: S token
  on: {
    Add: { // user-defined: Add
      guard: [({ memory }) => memory.adding === "" || deny("AddInFlight"), O.add.retryable({ times: 3 })],
      actions: [O.add.commit(({ memory }) => ({ sku: memory.adding }))], // existing: commit
    },
  },
}));
```

```ts
// BEFORE: src/machine.ts (today, abridged to the trust points)
export const machine = (definition, body) => {
  if (!Predicate.hasProperty(definition, "~owner")) refuse([wrongKind("definition")]); // a forged mark passes
  if (!Predicate.isFunction(body)) refuse([wrongKind("body")]);
  const tokens = { S: definition.S, E: definition.E, O: definition.O };
  const written = Result.try({ try: () => body(tokens), catch: (c) => c });
  refuse(bodyFindings(written.success)); // Effect parser: a cycle or getter escapes raw
  return compileMachine(definition, written.success); // retryable's make reads first.times here: raw TypeError
};
```

```ts
// AFTER: src/machine.ts
const MachineArgs = Schema.Tuple([Definition.Schema, Fn]); // NEW: Definition.Schema = Token.Schema("definition")

export const machine = configDoor( // NEW: configDoor
  { door: "machine", refuses: "InvalidConfiguration", args: MachineArgs },
  ([definition, body]) => {
    const written = callback({ slot: "body", run: body }, isAnything, definition.tokens); // NEW: callback
    if (Result.isFailure(written)) throw callbackDefect(written.failure); // origin "callback"
    const config = decodeOrThrow(definition.bodySchema, "machine", written.success); // NEW: per-definition Schema
    return Machine.make(definition, compileMachine(definition, config)); // existing compile, now on Decoded
  },
) as <D extends AnyDefinition>(definition: D, body: Body<D>) => Machine<D>; // the one cast: literal inference
```

**Added:**

- `configDoor`;
- `Definition.Schema`;
- `definition.bodySchema`, a body Schema built once per definition that holds `Token.Schema` for its own state,
  guard, action and event tokens, with the owner checked;
- `Machine.make`.

**Dropped:**

- the `~owner` mark check;
- `decodedWhole`;
- the separate `ForeignToken` loop over `onContext` (`src/machine.ts:211-221`), which the body Schema's owner
  filter replaces.

**2. `O.save.retryable(...)`.** A builder; T81 blocker 1.

```ts
// BEFORE: src/handles.ts:71-86
retryable: (first, second = { times: 0 }) => ({
  "~flow": "guard", "~owner": owner, operation,
  make: (at) => Predicate.isFunction(first) // read at compile: retryable(undefined) throws in machine()
    ? Guard.Retryable({ operation, key: Option.some({ slot: `${at}.key`, run: erase(first) }), times: second.times })
    : Guard.Retryable({ operation, key: Option.none(), times: first.times }),
}),
```

```ts
// AFTER: src/handles.ts
const Times = Schema.Struct({ times: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }); // NEW
const RetryableArgs = Schema.Union([Schema.Tuple([Fn]), Schema.Tuple([Fn, Times]), Schema.Tuple([Times])]); // NEW

retryable: builder("retryable", RetryableArgs, owner), // NEW: builder; reads nothing, throws nothing
```

```ts
// AFTER: src/compile-body.ts, the guard's make runs on decoded args only
const retryableGuard = (operation: string, at: string, args: typeof RetryableArgs.Type) =>
  Match.value(args).pipe(
    Match.when([Predicate.isFunction], ([key]) => Guard.Retryable({ operation, key: Option.some({ slot: `${at}.key`,
      run: erase(key) }), times: 0 })),
    Match.when([Predicate.isFunction, Predicate.isObject], ([key, { times }]) => Guard.Retryable({ operation,
      key: Option.some({ slot: `${at}.key`, run: erase(key) }), times })),
    Match.orElse(([{ times }]) => Guard.Retryable({ operation, key: Option.none(), times })),
  );
```

**Added:** `builder`, `RetryableArgs`, `Times`.

**Dropped:**

- the `~flow` and `~owner` fields and the `make` closure from the public token;
- `retryable(5)` now refuses: "WrongKind at on.Add.guard.1.args.0", with the builder's site.

**3. `Actor.send`.** Data comes from a text field; L3 hot path.

```ts
// Where it comes from: the app's UI
input.addEventListener("input", (e) => palette.send({ _tag: "Typed", text: e.currentTarget.value })); // user code
```

```ts
// BEFORE: src/host/runtime.ts:484-490 and src/host/driver.ts:256-275
send: (event) => {
  if (!Predicate.hasProperty(event, "_tag") || !Predicate.isString(event._tag)) return driver.send(actor, "", {});
  const { _tag: tag, ...payload } = event; // a Proxy or throwing getter escapes raw
  driver.send(actor, tag, payload); // looks up the event, admitted(walk, names, payload), else InvalidEvent
},
[HandleId]: { runtime: driver, actor }, // internal wiring on a public object
```

```ts
// AFTER: src/host/runtime.ts
const handleOf = (machine: Machine, actor: ActorId): Actor => {
  const handle = {
    machine, // existing
    send: callDoor( // NEW: callDoor
      { door: "Actor.send", refuses: "InvalidEvent", args: machine.compiled.sendArgs }, // NEW: built once at L1
      ([event]) => driver.send(actor, event), // the event is checked and narrowed; the driver trusts it
    ),
    getSnapshot: () => Option.map(snapshotOf(driver, actor), (x) => outside(machine, x)), // existing
  };
  handles.set(handle, actor); // NEW: this Runtime's WeakMap<Actor, ActorId>
  return handle;
};
```

**Added:**

- `compiled.sendArgs`: `Schema.Tuple([publicEvents])`, checked by the existing type-side walker and top-level
  narrowing (the existing `admitted`, keyed by `_tag`);
- a `handles` `WeakMap` per Runtime.

**Dropped:** `HandleId`, the hand `_tag` check and the driver's own refusal branch.

Per call, the cost is the same check as today plus one closure call and one `Result.try`.

**4. An ending mapper's result.** Data comes from the server; L5. Shown on `fixtures/shop/machines/cart.ts:46-58`.

```ts
// Where it comes from: CartApi over HttpClient answers a Line (user-defined: Line, CartApi)
export const addLine = transaction({ // existing: transaction, now a builder
  id: "Shop/AddLine", input: { cartId: Schema.String, sku: Schema.String }, key: ["cartId", "sku"],
  concurrency: "reject", services: [CartApi],
  commit: (input, { attempt }) => CartApi.use((api) => api.add(input, attempt.id)), // Effect<Line, SoldOut>
});
// in definition({ operations }): success: E.Added.from((l: Line) => l) // existing: from
```

```ts
// BEFORE: src/core/serve.ts:253-291
const payload = Option.match(mapping.value.from, {
  onNone: () => Result.succeed<Values>({}),
  onSome: (from) => callSlot(from, ending.value), // the cause is dropped
});
return turn(incarnation, mapping.value.event, payload.success, { /* ... */ }); // the payload is never checked
```

```ts
// AFTER: src/core/serve.ts
const event = compiled.events.get(mapping.value.event); // existing: the event's compiled walker and names
const payload = Option.match(mapping.value.from, {
  onNone: () => Result.succeed<Values>({}),
  onSome: (from) => callback(from, event.admits, ending.value), // NEW: callback; admits = check and narrow
});
if (Result.isFailure(payload)) return refuseTurn(incarnation, "Defect", "callback", payload.failure); // cause kept
return turn(incarnation, mapping.value.event, payload.success, { /* unchanged */ });
```

**Added:** `callback`, and `event.admits`, the same check `send` uses.

**Dropped:** `callSlot` and the unchecked payload. A mapper that returns `{ lineId: 5 }` for a string field is
now refused at the mapper's slot. Today it enters memory and fails at capture or never.

## 3. The hard parts, decided

### Hot paths

**Decided (lead):**

- L3 and L4 use check-and-narrow with walkers compiled at L1, never a full decode. T81's 8x came from rebuilding a
  100,000-entry payload.
- The door wrapper adds one closure call and one `Result.try`, an estimated under 1 % of a ~0.2 ms turn.
- Mapped endings add one payload check per ending, the same check as `send`.
- Guard results add a brand check costing nanoseconds.

The one real cost is `updateMemory`. The palette's `Configure` patches `commands: event.commands`, so checking
patch values walks 100,000 entries a second time on that turn: an expected 2x on Configure and under 5 % elsewhere.

- Patch keys (a plain record whose keys are declared fields) are always checked, at O(keys).
- Patch values are checked by each field's compiled check in dev and test hosts, behind the same switch as
  `freezeValues`.
- In production, values are checked when the bench says it is affordable (Q3).

**Measure:** before and after B4, on `nub run bench --only scale.command-palette.list-length-100000.per-turn-ms --dev`,
then each `turn.<story>.per-turn-ms` and `startup.<app>.cold-boot-ms`, in the background capped tier
(wiki/conventions/bench.md).

**Budget:** at most 10 % on the per-turn medians and 5 % on cold boot. A door that misses it is narrowed, not the
rule dropped.

### Branded types against literal inference

**Decided (lead):**

- Each door's Args Schema is `.pipe(Schema.brand("Decoded"))`. Effect's brand is type-only and leaves the AST
  unchanged (`effect/src/Schema.ts:5359`), so it costs nothing at runtime.
- Internals (`compileMachine`, `buildRuntime`, `driver.send`) accept only `Decoded` types, so raw config doesn't
  type-check past a door.
- The public signature keeps its `const` generics. The one cast per export sits on the export line, as
  `configDoor(...) as <D>(…) => Machine<D>`, with a `SAFETY:` reason.
- The `trusted<T>()` casts spread through `definition.ts` and `events.ts` go away. The door's decoded value is used
  instead of being discarded, which was T81 acceptance-2's open item.

### Cycles and throwing getters

**Decided (lead):** every data door decodes through the walker (Codec R6). A value met again on its own path fails,
and a throw from a getter, Proxy trap or user Schema filter becomes a finding with `cause`. Because decode copies
records, user getters never run again after the door. Tokens are checked by `#token in x`, which runs no trap.
Builders capture `given` without touching it.

### Deferring the eager computations in builders

**Decided (lead):**

- `transaction` and `resource` capture their config. The contract token's identity is the token object, replacing
  `Symbol(config.id)`.
- `.outcomes(endings)` captures and builds no codecs.
- The definition door builds the input Struct, key codecs and walkers from decoded config. The public
  `contract.input` Struct isn't read anywhere in fixtures or tests, so it is dropped.
- `E.X` tokens are made inside the definition door after the events config decodes. That door is already where
  `tokensOf` runs, so this is no change.
- `Flow.initial` stops branching on its argument.
- `actorRef` stops reading `options`.

### What stays unvalidatable: the contract

This goes into Diagnostics as a new requirement:

- **Callbacks.** They are pure, deterministic and terminating, and they don't mutate what they are given.
  - Dev and test hosts deep-freeze admitted values, so a mutation throws on the user's line.
  - Slow work is reported after the fact (Diagnostics R11).
  - A callback that never returns can't be stopped, because the core is synchronous by design.
- **Effect Schemas.** A field Schema is trusted to be Effect's own, since `isSchema` checks a string `TypeId`. A
  forged one fails when its parser throws, and that is reported as `origin: "config"`.
- **Services and commit Effects.** Their answers are trusted only as input to the user's mapper. What Flow keeps is
  the mapped payload, which is checked.
- **Production patch values,** if Q3 is answered A: trusted to the declared types and checked in dev and test.

## 4. Prevention

All of it is structural first, with discipline last.

1. **Surface walk (test, B1).** For each fixture app, build the definition, machine, app, Runtime and an actor. Walk
   every function-valued property reachable from them and from `src/index.ts`. Each must be in `doors` or
   `builders`; otherwise the test names its path (for example `definition().O.save.retryable`). There is no
   hand-kept list: a new export is found because it is reachable.
2. **Derived fuzzer (test, B1).** For every registered door and builder, hostile values are generated from the Args
   Schema's AST, per position:
   - wrong primitives and `null`/`undefined`;
   - NaN, ±Infinity and -0;
   - a lone surrogate;
   - `__proto__` and `~` keys, an extra key and a missing key;
   - a `Date`, `Map` or class instance where a record is expected;
   - a function where data is expected;
   - a Proxy that throws on every trap, and a throwing getter;
   - a self-cycle and a 10,000-deep nest;
   - a copied token (own fields of a real one), a partial token and another definition's token.

   **Builders:** must return a token, never throw, and touch no trap.

   **Doors:** may return only when the value decodes by Args. They may refuse only with a FlowError whose
   Diagnostics decode and whose origin isn't `"flow"`. Each case runs under a 1 s bound.

   This replaces `SLOTS` in code:packages/flow-state-v3/tests/compile/corruption.test.ts, which is hand-listed.
   T81 blockers 1 and 2 were outside those hand-listed slots.
3. **Lint (B1, extending `tools/lint-bomb/FLOW-STATE.md`):**
   - `throw` is allowed only in `src/door.ts` and `src/error.ts`, replacing the ~20 `no-throw-in-core` disables;
   - plain `try` is allowed only in `src/core/callback.ts`, as the existing note already plans;
   - `src/core/` may not import `door.ts`, `Schema.decode*` or `SchemaParser` outside `boundary.ts`
     (`no-restricted-imports` and `no-restricted-syntax`);
   - `hasProperty(_, "~` is banned in `src/` (`no-restricted-syntax`).
4. **Types:** internals take `Decoded` brands. A type test asserts that each door's `Args` Type and the erased public
   config type are mutually assignable, which catches drift between the Schema and the TS types.
5. **Review checklist** (added to the Epic's review instructions):
   - Is every new public function a door or a builder?
   - Does a builder read its arguments?
   - Does a callback result enter the core unchecked?
   - Does a new fact get stored twice?
   - Is any `~` mark or hand meaning-check left after a decode?
6. **Spec edits (agent, each with a `specs.log` note, once B1 lands):**
   - Diagnostics R1: FlowError carries `site` in process.
   - Diagnostics R2: Diagnostic gains `door` and `origin`.
   - Diagnostics R3: a stray throw in a door is `Defect`, `origin: "flow"`.
   - New Diagnostics R12: the unvalidatable contract above.
   - New invariant: no public call throws anything but a FlowError, and a hostile argument is never
     `origin: "flow"`.
   - Compile R1: builders read and check nothing; construction doors decode their tokens' args.
   - Codec R6: add construction config and callback results to "every value that crosses into Flow".
   - Actors: `send`, `ensureActor`, `createActor` and `disposeActor` refuse through their doors.
   - Restore and Codec text for records stays T92's.
7. **Plan edits (need the user's yes; see Q2 and Q4):**
   - @plan.Diagnostics O1: Diagnostic's fields gain `door` and `origin`.
   - @plan.Machines O1: tokens are Flow-made values, unforgeable and nominal in types.

## 5. Refactor plan as Tasks

- **B1**: Foundation: `Origin`, `door`, `site`; walker `decodeIssue`; shared `findingsOf`; `door.ts`, `token.ts`,
  `core/callback.ts`; surface walk and fuzzer harness (the not-yet-doored surface starts as an expected-red list); the
  lint rules; the Spec edits; proves `Token.Schema`'s nested-issue filter on Effect 4.1.4 first; size: M; lands: first
- **B2**: Tokens and builders: every builder inert via `builder`; Definition, Machine, refs and handles branded;
  `~flow`, `~owner`, `HandleId`, `decodedWhole` and `isAdmitting` deleted; contract codecs deferred; size: L; lands:
  second
- **B3 = T81 rebuilt**: L1 and L2 doors: `definition`, `machine`, `app`, `runtimeSetup` on `configDoor`, config
  decode on the walker; T81's open blockers 1 to 3 and acceptance-2 leftovers; T81 closes when the fuzzer is green for
  L1 and L2; size: M; lands: third
- **T92**: Records decoded into meaning, on B1's `decodeAt` and `origin: "storage"`; the T92 description stands,
  with one line added: "built on @B1's `decodeAt`"; size: L; lands: fourth
- **B4**: L3, L4 and L5 calls: `send`, `E.X`, actor calls, `ready`/`dispose`, Story steps on `callDoor`; mapped
  endings, `updateMemory`, guard results through `callback`; the bench gate; size: M; lands: fifth

**Why this order:**

- B1 first, so every later Task inherits the error shape, the helpers and a red list it must shrink.
- B2 before B3, because the doors' Schemas need branded tokens.
- T92 before B4, because it must land before @task.V3.T56.
- T92 stays its own Task rather than merging. Its proof (corrupt one field of real records) and its Spec area
  (Restore, Codec) are separate, and merging would make an XL Task. What it shares with the rest is B1's
  mechanism, not code.

**Risks:**

- `Token.Schema` depends on an Effect filter reporting a nested Issue. If it can't, the fallback is a second pass
  over the decoded body that decodes each token's args, with paths from pass one.
- Nominal token types may break the type tests' `@ts-expect-error` twins: each one must be re-read, not deleted.
- B4's patch-value check may miss the bench budget (Q3).
- Diagnostic's new fields change every Diagnostic snapshot in tests. This is mechanical and done in B1.

## Alternative: types first at author time

Strategy B: trust TypeScript for L1 and L2 shape, as XState's `setup` and `createMachine` do. XState validates no
config shape at runtime and throws only for unresolvable targets and missing implementations
(`codebases/xstate/packages/core/src/stateUtils.ts:441-503`, `guards.ts:354-360`). B checks at runtime only what
types can't express, keeps the token brands and puts one catch-all per entry point. L3, L5 and callback results
stay fully checked in both strategies.

- **Error quality, TS users**: **A:** Editor errors first; runtime refusals with path, door, site
  for what types miss (`gaurd` misspelled in a body passes tsc, T81 row 19; nested schedule literals widen); b: types
  first: Editor errors; misses fall to the catch-all: `Defect` with a cause, no field path
- **Error quality, JS or `any` users**: **A:** WrongKind at `on.Add.guard.1.args.0`, with help;
  **B:** `Defect, origin config, cause: TypeError: cannot read 'times'`, at best; silent accepts stay silent:
  NaN delay as 0 ms, `{ sec: 5 }`, `retryable(5)`, `armOn: [5]` dropped, a refused constant start (T81 rows 4, 16, 17,
  26, 35)
- **Code to maintain**: **A:** Config Schemas (~360 lines in `config.ts` today) mirror the TS
  types: two sources, with drift caught by the mutual-assignability type test; **B:** Deletes most of
  `config.ts`; keeps the rules, plus a growing list of "what types can't express" checks
- **Review churn**: **A:** The list is the Schema, and the fuzzer derives coverage from it:
  completeness is checked mechanically; **B:** The list is "what types can't express": open-ended, found by
  review, which is exactly T81's 3 to 4 rounds
- `flow check` and agents: **A:** Diagnostics with a path and help for any loaded config, typed
  or not; agents generating JS or casting get actionable errors; **B:** `flow check` must run `tsc` to be
  useful; the CLI is kept to check, explain, graph, story and trace; path-less Defects
- **T20**: **A:** Same (L5 is fully decoded in both); **B:** Same
- **T81**: **A:** Every row in "by the door each one missed" is caught by the Schema or the
  brand, at a path; **B:** Throws are caught as Defects, while silent accepts are not; each needs its own
  runtime check (the churn)
- **Correctness**: **A:** The construction contract is what the Schema accepts; b: types first:
  The construction contract is what tsc accepted, which `any` and casts void

**Recommendation (proposed): A, taking two lessons from B.**

- B's real advantage is one source of truth. A closes most of that gap with the type test and by using the decoded
  value (no more `trusted<T>()` casts).
- B's catch-all and token brands are already in A.
- A's Schema is already written (T81 built it at bafacd30). What failed was everything around it: marks, eager
  builders, the call-stack parser and the missing catch-all. B keeps all four fixes and drops the one part that
  was working.

What A doesn't take from B: runtime rules that duplicate pure type facts. Those stay in the Schema because the
Schema is also what `flow check` and the fuzzer read.

## 6. Open decisions for the user

**Q1. Strategy for L1 and L2 config.**

- A: full door (Schema per door, brands, catch-all).
- B: types first (brands and catch-all only, plus rules types can't express).
- C: A for `machine` and `app`, B for `definition`.

Recommendation: **A**. C gives two contracts for one construction.

**Q2. Where `door` and `origin` live.** This is a @plan.Diagnostics O1 edit.

- A: on Diagnostic (encoded, safe, seen by `flow check` and logs).
- B: on FlowError only (in process).

Recommendation: **A**. `site` stays in process either way (Diagnostics I9).

**Q3. `updateMemory` patch values in production.**

- A: dev and test check values, production checks keys only.
- B: always check values.
- C: B if B4's bench shows at most 10 % on palette stress per-turn, else A.

Recommendation: **C**. Correctness first, with the fallback named in advance.

**Q4. Tokens become nominal types.** A copied or hand-built ref or token becomes a type error as well as a runtime
refusal.

- A: nominal per kind; ForeignToken stays a runtime refusal.
- B: also a per-definition type brand (T81 ruling c), a larger public type change.

Recommendation: **A**. B needs a unique type per `definition()` call, which TS can't mint from a generic.

**Q5. T92.**

- A: stays its own Task, built on B1.
- B: merged into B4.

Recommendation: **A**.

**Q6. `E.X(payload)`.**

- A: stays a validating constructor (Compile R14), using `send`'s compiled check.
- B: becomes inert, and only `send` checks.

Recommendation: **A**. The Spec names it, and no fixture calls it on a hot path (fixtures send plain
`{ _tag }` records, 28 sites).

## Sidecar findings log

Four Haiku sidecars ran read-only at effort high: an inventory, findings to doors, prior art, and API usage. I
checked each item used here against the code.

- **Inventory:**
  - **Accepted (re-read):**
    - the mark-only definition check (`src/machine.ts:150`);
    - `retryable` reads `first.times` in `make` (`src/handles.ts:71-86`);
    - `findingsAgainst` has no catch (`src/config.ts:286-296`);
    - the raw destructure in `send` (`src/host/runtime.ts:484-490`);
    - `HandleId` (`src/host/runtime.ts:198,513`);
    - `updateMemory` spread outside the try (`src/core/turn.ts:325-336`);
    - the mapper result is unchecked (`src/core/serve.ts:253-291`);
    - two wrappers that drop the cause.
  - **Changed:** the claim that `perform` defects rethrow raw from `drainInbox` (`src/host/driver.ts:202,218-223`)
    wasn't verified, so it is carried into B4 as a check rather than a finding.
- **Findings to doors:**
  - **Accepted** as the evidence base for the mapping table, with T81 rows 30, 31 and 34 left with their current
    owners.
  - **Accepted, informational:** T81's header still says `review` although V3.log records the stop; T20's size-bound
    rows (9, 11, 12) were superseded by D23 and so are left out of the table.
- **Prior art:**
  - **Accepted:** Effect's decode has no visited set (consistent with the walker's reason to exist); `Schema.is`
    runs with default options and ignores excess keys (relevant to `decodedWhole`); `isSchema`, `isEffect` and
    `isLayer` use forgeable string TypeIds, while `Redacted` uses a `WeakMap`; `Effect.fn` captures its site with a
    toggled `stackTraceLimit`; `Schema.brand` is type-only; XState validates config only by types.
  - **Rejected:** nothing.
  - **Changed:** the sidecar's Zod notes aren't used. Zod is transitive only and adds nothing over Effect's Issue
    shape.
- **API usage:**
  - **Accepted:** the `*-faults.ts` files are mutation lists, not hostile inputs (this corrects the brief); the
    hostile inputs are in `tests/compile/corruption.test.ts` with a hand-listed `SLOTS`; there is no palette-named
    bench, and its stress point is `scale.command-palette.list-length-100000`; fixtures send plain `{ _tag }`
    records (re-counted: 28) and never call `E.X(payload)`; `contract.input` is never read.
  - **Rejected:** nothing.
