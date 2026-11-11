# Effect simplification audit (2026-11-11, `packages/flow-state-v3/src/`)

**Verdict: make two changes first.**

1. **The host.** Build it from Effect's own `Clock` and `Scheduler`. Run every call, timer and persistence
   wake as a keyed fiber in one `FiberMap`, owned by the Runtime's one `Scope`.
2. **The core.** Compile every Schema codec once, onto `Compiled`, and use the ones that are already
   built. Today event payloads are never decoded: `compiled.events` is built and never read.

These two remove the most code and fix four bugs. Third, give each closed vocabulary and each shape one
Schema or type, and derive the rest from it. The rest is small convention work.

The core stays plain, pure and synchronous. Every core recommendation here uses only `Option`, `Result`,
`Data`, `Schema`, `Brand` or `Struct`, and none of them adds per-element allocation to a hot loop.

Scope: the user narrowed this pass to `src/`, both the core and `src/host/`. The conformance edges get one
closing section on what carries over. Everything is **proposed**: nothing is applied until the user
confirms. A builder is working in `src/` right now. It split `core/step.ts` into `tx.ts`, `lanes.ts`,
`serve.ts` and others during this audit. Line numbers are from 2026-11-11 and will drift.

| #  | Change                                                                  | Area       | Effort         |
| -- | ----------------------------------------------------------------------- | ---------- | -------------- |
| R1 | Host from `Clock` and `Scheduler`; one Scope with a `FiberMap`           | host       | about 0.5 day  |
| R2 | Every codec compiled once onto `Compiled`; events decoded at `Send`      | core       | about 0.5 day  |
| R3 | One Schema per closed vocabulary; one type per shape; branded ids        | core       | about 2-3 h    |
| R4 | `Store` as an Effect service; `Stored` split into `Stored` and `Refused` | host, core | about 0.5 day  |
| R5 | Guard verdict as a tagged enum, not `Result<Option<string>>`             | core       | about 1 h      |
| R6 | Option and Result idioms, and `Struct` and `Record` helpers              | core       | about 1-2 h    |
| R7 | Host conventions: named `Effect.fn`, typed `FlowError`, one JSON codec, `TypeId` | host | about 1 h |
| R8 | Drop `Host.later`: an urgent batch is a `yieldNow` wake                  | host       | about 1 h, gated |

Order: R1 before R4, since R4 uses R1's fibers. R2 and R3 are independent of the host work. R8 is safe
only if the suite passes unchanged.

## R1. Build the Host from Effect's Clock and Scheduler; one Scope owns every fiber

### Problem

The `Host` duplicates two Effect services and then adapts itself back into one of them:

- `code:packages/flow-state-v3/src/host/host.ts#Host` (lines 39-48) declares `now`, `monotonic`, `arm` and
  `scheduler`. Effect's `Clock` covers the first three, and its `Scheduler` reference is the fourth.
- `src/host/driver.ts:15-28` (`hostClock`) turns those fields back into a `Clock.Clock`. The driver then
  provides it by hand at `driver.ts:91-93` (`Context.add(..., Clock.Clock, clock)` plus `{ scheduler }`).
- `src/host/runtime.ts:117-129` (`realHost`) rebuilds Effect's default clock with `Date.now`,
  `performance.now` and `setTimeout`, and constructs a `MixedScheduler`, which is already Effect's default.
- There is hand-written timer and fiber bookkeeping in three places:
  - `driver.ts:75-76` keeps a `fibers` map and a `timers` map;
  - `driver.ts:133-147` handles Arm and Disarm, `driver.ts:181-184` is `stop`, and the fiber observer
    deletes its own entry;
  - `src/host/edge.ts:25,46-47,121-134` keeps `stopWake`, which stops the old wake before arming a new
    one.

Two bugs come from this (both verified):

- **`dispose` leaks call fibers.** `runtime.ts:241-249` calls `driver.stop()`, which only clears timers,
  and then closes the services Scope. Call fibers forked at `driver.ts:91` belong to no Scope, so they keep
  running and settle into the core after dispose.
- **Long timers fire at once.** `runtime.ts:120` calls `setTimeout(fire, at - Date.now())` with no clamp,
  so a delay over 2^31-1 ms (about 24.8 days) fires immediately. Effect's default Clock clamps and chunks
  the delay (`node_modules/effect/src/internal/effect.ts:6306-6333`).

### Effect feature

- `Clock.Clock` is a `Context.Reference` with a platform default (`effect/src/Clock.ts:192`), and so is
  `Scheduler.Scheduler` (`effect/src/Scheduler.ts:82`). `Context.get` on a missing Reference returns its
  default (`effect/src/Context.ts:1518`). So the real host provides nothing, and a test provides its own.
- `FiberMap` (`effect/src/FiberMap.ts`) gives keyed fibers that:
  - are owned by a Scope (`make`, line 166);
  - remove themselves on exit, and setting a key interrupts that key's previous fiber (`setUnsafe`,
    lines 344 and 448-490);
  - can be looked up synchronously (`getUnsafe`, line 679);
  - are all interrupted when the Scope closes.
- `Effect.sleep` (`effect/src/Effect.ts:9027`) reads the fiber's Clock. `Scope.makeUnsafe`
  (`effect/src/Scope.ts:277`) builds a Scope synchronously, which `construct()` needs because it is sync.
- `Effect.runForkWith` evaluates synchronously up to the first async boundary
  (`internal/effect.ts:5680-5689`). So a timer's sleep registers during the step, in command order, as
  `host.arm` does today. `interruptUnsafe` on a suspended fiber runs its finalizer at once
  (`internal/effect.ts:558-578`). So a Disarm cancels synchronously, and `core/step.ts:43-46` already
  ignores a stale `Fired`.
- Convention: STYLE.md says "Read time through `Clock.currentTimeMillis`; use Effect sleeps instead of
  native timer bookkeeping" (`tools/lint-bomb/STYLE.md:303`). The API references are
  `.claude/skills/effect-api-documentation/references/Clock.md`, `FiberMap.md`, `Scope.md` and
  `TestClock.md`.

### Before (real code, today)

```ts
// src/host/host.ts
export type Host = {
  readonly now: () => number;
  readonly monotonic: () => number;
  readonly arm: (at: number, fire: () => void) => () => void;
  readonly later: (task: () => void) => void;
  readonly scheduler: Scheduler.Scheduler;
  readonly hidden: () => boolean;
  readonly onHidden: (listener: () => void) => void;
  readonly store: Option.Option<Store>;
  readonly sessionSeed: number;
};

// src/host/driver.ts
export const hostClock = (host: Host): Clock.Clock => ({
  currentTimeMillisUnsafe: host.now,
  currentTimeMillis: Effect.sync(host.now),
  currentTimeNanosUnsafe: () => BigInt(host.now()) * 1_000_000n,
  currentTimeNanos: Effect.sync(() => BigInt(host.now()) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(Math.round(host.monotonic() * 1_000_000)),
  monotonicTimeNanos: Effect.sync(() => BigInt(Math.round(host.monotonic() * 1_000_000))),
  sleep: (duration) =>
    Effect.callback<void>((resume) => {
      const stop = host.arm(host.now() + Duration.toMillis(duration), () => resume(Effect.void));

      return Effect.sync(stop);
    }),
});

// inside makeDriver
const fibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
const timers = new Map<string, () => void>();
const clock = hostClock(host);

const fork = (call: string, effect: Effect.Effect<unknown, unknown, unknown>) => {
  const provided = effect as Effect.Effect<unknown, unknown>;
  const fiber = Effect.runForkWith(Context.add(options.services, Clock.Clock, clock))(provided, {
    scheduler: host.scheduler,
  });

  fibers.set(call, fiber);
  fiber.addObserver((exit) => {
    fibers.delete(call);
    input(Input.Settled({ call, result: resultOf(exit) }));
  });
};

// inside perform's Command.$match
Interrupt: ({ call }) => {
  const fiber = fibers.get(call);

  if (fiber !== undefined) fiber.interruptUnsafe();
},
Arm: ({ timer, at }) => {
  timers.set(
    timer,
    host.arm(at, () => {
      timers.delete(timer);
      input(Input.Fired({ timer }));
    }),
  );
},
Disarm: ({ timer }) => {
  timers.get(timer)?.();
  timers.delete(timer);
},

// inside run
const env: Env = { now: host.now(), seed: host.sessionSeed };

// returned
stop: () => {
  for (const stop of timers.values()) stop();
  timers.clear();
},

// src/host/runtime.ts
const realHost = (): Host => ({
  now: () => Date.now(),
  monotonic: () => performance.now(),
  arm: (at, fire) => {
    const handle = setTimeout(fire, Math.max(0, at - Date.now()));

    return () => clearTimeout(handle);
  },
  later: (task) => void setTimeout(task, 0),
  scheduler: new Scheduler.MixedScheduler(),
  hidden: () => false,
  onHidden: () => undefined,
  store: Option.none(),
  sessionSeed: entropy(),
});

// inside constructOn
let scope = Option.none<Scope.Closeable>();
let services = Context.empty();
// ready(): const owned = yield* Scope.make(); scope = Option.some(owned);
//          services = yield* Layer.buildWithScope(config.services, owned)
dispose: () =>
  Effect.suspend(() => {
    driver.stop();

    return Option.match(scope, {
      onNone: () => Effect.void,
      onSome: (s) => Scope.close(s, Exit.void),
    });
  }),

// src/host/edge.ts (the wake)
const wakeAt = (name: string, at: number) => {
  const scope = scopeOf(name);

  if (at >= scope.due) return;
  stop(scope);

  const wake = host.arm(at, () => {
    scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY, stopWake: Option.none() });
    pump(name);
  });

  scopes.set(name, { ...scope, due: at, stopWake: Option.some(wake) });
};
```

### After (proposed)

```ts
// src/host/host.ts
import { Context, type Option } from "effect";

/**
 * The platform facts Effect has no service for: page visibility, the durable store and the boot's
 * entropy. Time and fiber scheduling are Effect's own `Clock` and `Scheduler`, in the same Context.
 */
export class Host extends Context.Service<                     // NEW: a Context.Service, was a plain type
  Host,
  {
    readonly later: (task: () => void) => void;                // existing (R8 removes it)
    readonly hidden: () => boolean;                            // existing
    readonly onHidden: (listener: () => void) => void;         // existing
    readonly store: Option.Option<Store>;                      // existing
    readonly sessionSeed: number;                              // existing
  }
>()("flow-state/Host") {}
// DROPPED: now, monotonic, arm, scheduler

/**
 * What a Runtime runs over: the Host, plus `Clock` and `Scheduler` where they are not Effect's defaults.
 */
export type Platform = Context.Context<Host>;                  // NEW

// src/host/fibers.ts                                           NEW file
import { type Context, Effect, type Exit, FiberMap, Option, type Scope } from "effect";

/**
 * The Runtime's keyed fibers (calls, timers, persistence wakes), all owned by its one Scope.
 * Forking under a live key interrupts the old fiber, and closing the Scope interrupts every fiber.
 */
export const makeFibers = (scope: Scope.Scope, context: () => Context.Context<never>) => {
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- construct() is synchronous; the host builds its registry here
  const map = Effect.runSync(Scope.provide(FiberMap.make<string>(), scope));

  return {
    fork: <A, E>(key: string, effect: Effect.Effect<A, E>, onExit: (exit: Exit.Exit<A, E>) => void) => {
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the host boundary runs fibers
      const fiber = Effect.runForkWith(context())(effect);
      FiberMap.setUnsafe(map, key, fiber);
      fiber.addObserver(onExit);
    },
    cancel: (key: string) =>
      // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- a cancel interrupts at once; its exit settles
      Option.map(FiberMap.getUnsafe(map, key), (fiber) => fiber.interruptUnsafe()),
  };
};

export type Fibers = ReturnType<typeof makeFibers>;

// src/host/driver.ts: makeDriver's changed parts
export const makeDriver = (options: {
  readonly machines: Machines;
  readonly platform: Platform;                                 // NEW, replaces host
  readonly fibers: Fibers;                                     // NEW, replaces services + both maps
  readonly persistence: boolean;
  readonly captureMs: number;
  readonly sink: (evidence: ReadonlyArray<Evidence>) => void;
}) => {
  const { machines, fibers } = options;
  const clock = Context.get(options.platform, Clock.Clock);    // existing Effect API: the default if absent
  const host = Context.get(options.platform, Host);
  let world: World = emptyWorld(options.persistence);
  const inbox: Array<Input> = [];
  let running = false;
  let disposed = false;                                        // NEW: see Risks

  const edge = makeEdge(options.platform, fibers, {
    captureMs: options.captureMs,
    stored: (ticket, ok) => input(Input.Stored({ ticket, ok })),
  });

  const perform = (command: Command) =>
    Command.$match(command, {
      Invoke: ({ call, machine, operation, input: given, attempt }) => {
        const op = machines.get(machine)?.operations.get(operation);

        if (op === undefined) return;

        const context = {
          attempt: Option.match(attempt, {
            onNone: () => ({ id: "", operation, key: {}, input: given, retryCount: 0, mayHaveApplied: false }),
            onSome: (a) => ({ ...a, operation, input: given }),
          }),
        };
        // SAFETY: the boot provides every service the machines' contracts list (Actors R1).
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a contract's services are erased in Compiled
        const effect = Effect.suspend(() => op.call.run(given, context)) as Effect.Effect<unknown, unknown>;

        fibers.fork(`call/${call}`, effect, (exit) => input(Input.Settled({ call, result: resultOf(exit) })));
      },
      Interrupt: ({ call }) => fibers.cancel(`call/${call}`),
      Arm: ({ timer, at }) =>
        fibers.fork(
          `timer/${timer}`,
          Effect.sleep(Duration.millis(Math.max(0, at - clock.currentTimeMillisUnsafe()))),
          (exit) => {
            if (Exit.isSuccess(exit)) input(Input.Fired({ timer }));
          },
        ),
      Disarm: ({ timer }) => fibers.cancel(`timer/${timer}`),
      Persist: ({ scope, writes, ticket }) => edge.accept(scope, writes, ticket),
    });

  const run = () => {
    running = true;

    for (let next = inbox.shift(); next !== undefined; next = inbox.shift()) {
      const env: Env = { now: clock.currentTimeMillisUnsafe(), seed: host.sessionSeed };
      const out = step(machines, world, next, env);
      world = out.world;

      if (out.evidence.length > 0) options.sink(out.evidence);

      for (const command of out.commands) perform(command);
    }

    running = false;
  };

  const input = (next: Input) => {
    if (disposed) return;
    inbox.push(next);

    if (!running) run();
  };

  return {
    input,
    world: () => world,
    pending: () => inbox.length > 0,
    send: (actor: ActorId, tag: string, payload: Values) => input(Input.Send({ actor, tag, payload })),
    dispose: () => {                                           // NEW, replaces stop
      input(Input.DisposeRuntime());
      disposed = true;
    },
  };
};
// DROPPED: hostClock, the fibers and timers Maps, the fork helper, stop

// src/host/runtime.ts: the changed parts
const realPlatform = (): Platform =>                           // NEW, replaces realHost
  Context.make(Host, {
    later: (task) => void setTimeout(task, 0),
    hidden: () => false,
    onHidden: () => undefined,
    store: Option.none(),
    sessionSeed: entropy(),
  });
// Clock and Scheduler are absent, so Effect's defaults apply: Date.now, a clamped setTimeout, MixedScheduler.

export const constructOn = (config: RuntimeConfig, platform: Platform): Runtime => {
  const machines = new Map(Object.values(config.app.machines).map((m) => [m.compiled.id, m]));
  const sinks = new Set<(evidence: Evidence) => void>();
  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the Runtime owns one Scope for its whole life; dispose() closes it
  const scope = Scope.makeUnsafe();
  let services = Context.empty();
  const fibers = makeFibers(scope, () => Context.merge(services, platform));
  const persistence =
    config.persistence !== undefined && config.scope !== undefined && Option.isSome(Context.get(platform, Host).store);

  const driver = makeDriver({
    machines: new Map([...machines].map(([id, m]) => [id, m.compiled])),
    platform,
    fibers,
    persistence,
    captureMs: config.persistence?.captureMs ?? 5000,
    sink: (batch) => {
      for (const e of batch) for (const sink of sinks) sink(e);
    },
  });

  const ready = Effect.fn("Runtime.ready")(function* () {
    if (config.services !== undefined)
      services = yield* Layer.buildWithScope(config.services, scope).pipe(
        Effect.mapError((cause) => new FlowError({ code: "ServiceFailed", problems: [String(cause)], cause })),
      );
    // the stored-records read is unchanged here; R4 turns it into an Effect
  });

  return {
    ready,
    ensureActor: (ref) => ensureActorOn(driver, ref),          // existing body, unchanged
    dispose: () => Effect.suspend(() => (driver.dispose(), Scope.close(scope, Exit.void))),
    [TypeId]: { driver, sinks, machines },                     // R7: string TypeId
  };
};

export const runtimeSetup = (config: RuntimeConfig): RuntimeSetup => ({
  construct: () => constructOn(config, realPlatform()),
});

// src/host/edge.ts: the wake becomes a keyed fiber; stopWake is gone
const wakeAt = (name: string, at: number) => {
  if (at >= scopeOf(name).due) return;
  scopes.set(name, { ...scopeOf(name), due: at });
  fibers.fork(`wake/${name}`, Effect.sleep(Duration.millis(Math.max(0, at - clock.currentTimeMillisUnsafe()))), (exit) => {
    if (Exit.isFailure(exit)) return;
    scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY });
    pump(name);
  });
};
// issue() calls fibers.cancel(`wake/${name}`) where it called stop(scope).
// DROPPED: Scope.stopWake, the stop helper, and stopWake in fresh and in every scopes.set.

// A host-level Effect test, now possible with TestClock (@effect/vitest is installed)
it.effect("a plain batch waits captureMs, then issues", () =>
  Effect.gen(function* () {
    const platform = yield* Layer.build(Layer.mergeAll(TestClock.layer(), Layer.succeed(Host, memoryHost)));
    const runtime = testing.constructOn(setup, platform);
    yield* runtime.ready();
    testing.send(runtime, actor, "Edit", { title: "a" });
    yield* TestClock.adjust("4999 millis");
    expect(memoryHost.batches).toHaveLength(0);
    yield* TestClock.adjust("1 millis");
    expect(memoryHost.batches).toHaveLength(1);
  }),
);
```

### What it removes and what it touches

- **Removed:**
  - `hostClock` (14 lines) and the Host's `now`, `monotonic`, `arm` and `scheduler`;
  - `realHost`'s clock, timer and scheduler fields;
  - the driver's two Maps, the self-delete in its fiber observer, and `stop`;
  - `Context.add(..., Clock.Clock, ...)` and the `{ scheduler }` option;
  - the edge's `stopWake` field, its `stop` helper, and the field in five `scopes.set` calls;
  - the runtime's `Option<Scope>` and its services getter.
- **Added:** `host/fibers.ts` (about 20 lines) and `Host` as a `Context.Service`.
- **Downstream:**
  - `testing.constructOn` takes a `Platform`. `testing.ts` re-exports `Host` as a value, not just a type.
  - The core is untouched: `Arm`, `Disarm`, `Interrupt` and `Fired` stay data, so Stories, replays and
    CLI inspection are unchanged.
  - Every Effect a call runs sees the same Clock and Scheduler through ordinary Context. That includes a
    commit's own `Effect.timeoutOrElse`, which `hostClock` existed to support.

### Risks

- **Pure-core rule: not broken.** Only `src/host/` changes.
- **Dispose must close the core before the Scope.** Closing the Scope interrupts call fibers. Each
  interrupt settles as `Interrupted` and runs a step. If the core retries, the closed `FiberMap` interrupts
  the new fiber at once, which can loop. So `dispose` sends `Input.DisposeRuntime` first and the driver
  drops later inputs.
  - Today only `testing.disposeRuntime` sends `DisposeRuntime`. The public `dispose` doesn't.
  - Check the order against the Runtime Spec's dispose Requirements before building. If the Spec wants a
    drain before the interrupt, `dispose` waits for it.
- **One scheduler hop per timer.** A timer's `Fired` now arrives one Scheduler hop after it fires.
  Equal-time timers still fire in arm order, because each sleep registers synchronously at Arm. Run the
  suite on `--runtime production` to confirm.
- **Cost.** One fiber per armed timer, in microseconds, at the host, where Effect is allowed.

## R2. Compile every codec once onto `Compiled`; decode event payloads at `Send`

### Problem

The house rule is "decode once at the boundary with Schema and trust the result". The code breaks it in
both directions:

- **Event payloads are never decoded (a bug, verified).**
  - `machine.ts:211-217` (`eventsOf`) builds a codec per event, and `machine.ts:292-293` stores them as
    `compiled.events` and `compiled.external`.
  - Nothing reads either. A search for `.events` in `src/` finds only `definition.ts` and `machine.ts`.
  - `Input.Send` (`core/step.ts:80-86`) enqueues the raw `payload`, and `serve.ts:235-240` hands it to the
    turn. So a malformed or internal event from `actor.send` reaches guards and `updateMemory` unchecked.
- **The same codec is derived again on every use:**
  - `record.ts:187` and `:233` call `Schema.toCodecJson(compiled.memory)` and
    `Schema.toCodecJson(operation.input)` inside the boot's decode loop, once per record.
  - `record.ts:97-98` (`jsonOf`) does the same on every save.
  - `keyCodecOf` is built twice per write operation, at `definition.ts:329` and `machine.ts:186`.
- **`keyCodecOf` duck-types a struct it was given as a struct.** At `definition.ts:285-296`,
  `Predicate.hasProperty(input, "fields")` reads fields that `contract.ts:77` erased by typing
  `Bound.input` as `Schema.Codec`. A key field that is not found is silently dropped (`: []`), so two keys
  can share one canonical text.
- **Memory change is detected by reference.** At `serve.ts:148`,
  `after.memory !== incarnation.memory` is always true once an `updateMemory` runs, because `turn.ts:259`
  spreads a new object. So an update that writes equal values still publishes.

### Effect feature

- `Schema.toCodecJson` (`effect/src/Schema.ts:17103`) derives a new codec on every call, so it belongs at
  compile time.
- `Schema.decodeUnknownResult` gives the core a synchronous `Result`, with no Effect runtime.
- `Schema.toEquivalence` (`Schema.ts:16851`) is the house's equality (FLOW-STATE.md: "equality goes
  through `Schema.toEquivalence`").
- `Schema.Struct` keeps `.fields` public and typed (`Schema.ts:3481`). `Struct.pick`
  (`effect/src/Struct.ts:261`) picks fields by name.

### Before

```ts
// core/compiled.ts
export type Compiled = {
  readonly id: string;
  readonly persist: boolean;
  readonly initial: string;
  readonly states: ReadonlyMap<string, Node>;
  readonly root: Level;
  readonly events: ReadonlyMap<string, Schema.Codec<Values, Values>>;
  readonly external: ReadonlySet<string>;
  readonly memory: Schema.Codec<Values, Values>;
  readonly initialMemory: Values;
  readonly operations: ReadonlyMap<string, Operation>;
};

// core/step.ts
Send: ({ actor, tag, payload }) => {
  if (!open) return;

  if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))
    incarnations.ensure(actor, Option.none(), true);

  if (incarnationOf(actor) !== undefined) enqueue(Mail.Event({ actor, tag, payload }));
},

// core/record.ts, inside decodeRecords' loop
Result.match(Schema.decodeUnknownResult(Schema.toCodecJson(compiled.memory))(r.memory), {
  onFailure: () => undefined,
  onSuccess: (memory) =>
    void records.push({ actor: { machine: r.machine, name: r.name }, state: r.state, memory, schedules: r.schedules }),
});

// core/record.ts
const jsonOf = (schema: Schema.Codec<Values, Values>, value: Values) =>
  Schema.encodeUnknownResult(Schema.toCodecJson(schema))(value);

// definition.ts
export const keyCodecOf = (input: Schema.Codec<Values, Values>, fields: ReadonlyArray<string>) => {
  const all = Predicate.hasProperty(input, "fields") ? input.fields : {};

  const picked = Object.fromEntries(
    [...fields]
      .toSorted()
      .flatMap((name) =>
        Predicate.hasProperty(all, name) && Schema.isSchema(all[name]) ? [[name, all[name]]] : [],
      ),
  );

  return codecOf<string>(Schema.fromJsonString(Schema.toCodecJson(Schema.Struct(picked))));
};

// core/serve.ts
if (after.memory !== incarnation.memory || after.state !== incarnation.state)
  publish(after);
```

### After

```ts
// core/compiled.ts
export type Compiled = {
  readonly id: string;
  readonly persist: boolean;
  readonly initial: string;
  readonly states: ReadonlyMap<string, Node>;
  readonly root: Level;
  readonly external: ReadonlyMap<string, Schema.Codec<Values, Values>>;  // CHANGED: was events + external
  readonly memory: Schema.Codec<Values, Values>;
  readonly memoryJson: Schema.Codec<Values, Values>;                     // NEW: toCodecJson(memory), once
  readonly sameMemory: Equivalence.Equivalence<Values>;                  // NEW: Schema.toEquivalence(memory), once
  readonly initialMemory: Values;
  readonly operations: ReadonlyMap<string, Operation>;                   // Operation gains inputJson
};
// DROPPED: events (internal events never cross Send), the separate external Set

// machine.ts
const memoryJson = Schema.toCodecJson(memory.schema);
// compiled: { ..., external: eventsOf(definition.events), memory: memory.schema, memoryJson,
//             sameMemory: Schema.toEquivalence(memory.schema), ... }

// core/step.ts
Send: ({ actor, tag, payload }) => {
  if (!open) return;
  const decoded = Option.flatMap(
    Option.fromUndefinedOr(tx.machines.get(actor.machine)?.external.get(tag)),
    (codec) => Result.getSuccess(Schema.decodeUnknownResult(codec)(payload)),
  );

  if (Option.isNone(decoded)) {
    tx.emit(Evidence.Issue({ code: "InvalidEvent", ending: Option.none() }));   // NEW Issue code (R3)
    return;
  }

  if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))
    incarnations.ensure(actor, Option.none(), true);

  if (incarnationOf(actor) !== undefined) enqueue(Mail.Event({ actor, tag, payload: decoded.value }));
},

// core/record.ts
Result.match(Schema.decodeUnknownResult(compiled.memoryJson)(r.memory), {
  onFailure: () => undefined,
  onSuccess: (memory) =>
    void records.push({ actor: { machine: r.machine, name: r.name }, state: r.state, memory, schedules: r.schedules }),
});
const jsonOf = (schema: Schema.Codec<Values, Values>, value: Values) => Schema.encodeUnknownResult(schema)(value);
// callers pass compiled.memoryJson and operation.inputJson

// contract.ts: Bound.input keeps its struct type
readonly input: Schema.Struct<Schema.Struct.Fields>;                     // CHANGED: was Schema.Codec<Values, Values>

// definition.ts
export const keyCodecOf = (input: Schema.Struct<Schema.Struct.Fields>, fields: ReadonlyArray<string>) =>
  codecOf<string>(
    Schema.fromJsonString(Schema.toCodecJson(Schema.Struct(Struct.pick(input.fields, [...fields].toSorted())))),
  );
// built once in machine.ts operationOf and reused by definition.ts's handle

// core/serve.ts
if (!compiled.sameMemory(after.memory, incarnation.memory) || after.state !== incarnation.state)
  publish(after);
```

### What it removes and what it touches

- **Removed:** about 4 codec derivations on every save or boot record, one duplicate `keyCodecOf` per
  write operation, the `Predicate.hasProperty` duck-typing and its silent drop, and the dead
  `compiled.events` and `external` pair.
- **Downstream:**
  - `machine.ts` builds the codecs; `record.ts`, `serve.ts` and `step.ts` read them.
  - Stories and the CLI see one more Issue code, `InvalidEvent`.
  - The typed `Envelope` stays the compile-time check. The Schema check is the runtime boundary for
    untyped callers and Stories.

### Risks

- **Pure-core rule: not broken.** Decoding is a synchronous `Result`, once per `Send`. `Send` is not a
  per-element loop.
- Rejecting a bad event is a behaviour change. Confirm the Turn Spec's rule for an undecodable or internal
  event (drop with an Issue, or a defect) before building.
- Publishing only on a value change is a behaviour change too. Confirm it against the Spec's publication
  rule (Turn R23).

## R3. One Schema per closed vocabulary, one type per shape, branded ids

### Problem

Several facts live in two places, and several closed sets are typed as `string`:

- **Closed vocabularies typed as `string`:**
  - `core/tx.ts:49-59` `DECLINES: ReadonlySet<string>`, probed with `.has(reason)` at `lanes.ts:361`,
    `disposal.ts:25` and `serve.ts:33`;
  - `turn.ts:68` `Refused: { code: string }` (only `CallbackDefect`, `InvalidTurn` and `GuardDefect`);
  - `evidence.ts:112` `Issue.code: string`;
  - `error.ts:11` `FlowError.code: string`, though its doc says "closed code".
- **One vocabulary declared twice:** `evidence.ts:7` `Channel` and `record.ts:55`
  `Schema.Literals(["success", "failure", "unknown"])`. Likewise `world.ts:168-172` (the
  `ActorRecord.schedules` item) and `record.ts:17-21` `ScheduleRecord`.
- **One shape, several names:**
  - `world.ts:8` `ActorId` and `evidence.ts:58` `Who`, with `tx.ts:64` `who()` copying one into the other;
  - `compiled.ts:142` `Attempt` against the inline attempt in `world.ts:247-251`;
  - `edge.ts:8` `Ticket` and `edge.ts:14` `Write` against the inline shapes in `world.ts:258-266`
    (`Command.Persist`).
- **Ids that mix silently:** `tx.ts:118-122` `mint` returns a plain `string` for tickets, timers, calls and
  incarnations. At `answers.ts:130-138`, `world.tickets` maps a ticket to a timer id, and both are typed
  `string`.

### Effect feature

- `Schema.Literals` (`Schema.ts:5022`), with `typeof X.Type` for the type and `Schema.is` (`Schema.ts:1450`)
  for the guard.
- `Brand.nominal` (`effect/src/Brand.ts:235`) is type-only, so it costs nothing at run time.
- House rule: "each fact lives in one place" (AGENTS.md).

### Before

```ts
// core/tx.ts
export const DECLINES: ReadonlySet<string> = new Set([
  "Cancelled", "Restored", "Rejected", "Overloaded", "StorageRefused",
  "Disposed", "NoPersistence", "OldVersion", "Unencodable",
]);
export const who = (actor: ActorId) => ({ machine: actor.machine, name: actor.name }) satisfies Who;

// core/evidence.ts
export type Channel = "success" | "failure" | "unknown";
export type Who = { readonly machine: string; readonly name: string };
//   Issue: { code: string; ending: Option.Option<...> }

// core/turn.ts
//   Refused: { code: string; slot: string }

// core/world.ts, Command.Persist
ticket: Option.Option<{
  readonly id: string;
  readonly attempt: string;
  readonly purpose: "acknowledge" | "capture";
}>;
// src/host/edge.ts
export type Ticket = { readonly id: string; readonly attempt: string; readonly purpose: "acknowledge" | "capture" };
```

### After

```ts
// core/vocabulary.ts                                          NEW: every closed set once, as a Schema
import { Schema } from "effect";

export const Decline = Schema.Literals([
  "Cancelled", "Restored", "Rejected", "Overloaded", "StorageRefused",
  "Disposed", "NoPersistence", "OldVersion", "Unencodable",
]);
export type Decline = typeof Decline.Type;
export const isDecline = Schema.is(Decline);                    // replaces DECLINES.has

export const Channel = Schema.Literals(["success", "failure", "unknown"]);
export type Channel = typeof Channel.Type;                      // record.ts's ParkedJson uses Channel

export type RefusedCode = "CallbackDefect" | "InvalidTurn" | "GuardDefect";
export type IssueCode = "Defect" | "InvalidEvent";              // InvalidEvent from R2

// core/world.ts
export type ActorId = { readonly machine: string; readonly name: string };
export type TicketId = string & Brand.Brand<"TicketId">;       // NEW, type-only
export type TimerId = string & Brand.Brand<"TimerId">;         // NEW
export type CallId = string & Brand.Brand<"CallId">;           // NEW
export type Ticket = { readonly id: TicketId; readonly attempt: string; readonly purpose: "acknowledge" | "capture" };
export type Write = { readonly key: string; readonly record: Option.Option<Values> };
//   Command.Persist: { scope: string; writes: ReadonlyArray<Write>; ticket: Option.Option<Ticket> }
//   world.tickets: ReadonlyMap<TicketId, TimerId>

// core/evidence.ts
export type Who = ActorId;                                      // was a second declaration; who() is dropped
//   Issue: { code: IssueCode; ... }
// core/turn.ts
//   Refused: { code: RefusedCode; slot: string }
// src/error.ts
//   code: "InvalidMachine" | "DuplicateMachine" | "ServiceFailed"
// src/host/edge.ts imports Ticket and Write from core/world.ts; its own declarations are dropped
```

### What it removes and what it touches

- **Removed:** `DECLINES` and its three `.has` casts, the duplicated `Channel` and schedule shape, `who()`,
  `Who` as a separate shape, and the edge's copies of `Ticket` and `Write`.
- **Downstream:** `tx.mint` takes a brand (`mint<TicketId>("ticket")`), and the compiler then catches a
  ticket passed as a timer. Evidence's public type names stay.

### Risks

- **Pure-core rule: not broken.**
- `reason` stays `string`, because it also carries user `_tag`s (`flow.ts:97`).
- Brands on ids decoded from storage need a cast at the one decode site (`record.ts`), with a `SAFETY:`
  comment.

## R4. Make the Store an Effect service; split `Stored` into `Stored` and `Refused`

### Problem

- `code:packages/flow-state-v3/src/host/host.ts#Store` is callback-shaped. `load` is synchronous, and
  `write` takes an `answer: (ok: boolean) => void` that must be called exactly once.
  - A synchronous `load` can't be built over IndexedDB, because `IDBRequest` is asynchronous. But
    `ready()` is already an Effect.
  - "Answer once" is a contract nobody enforces.
- The boolean flows on into the core:
  - `core/input.ts:35` declares `Stored: { ticket; ok: boolean }`, and `answers.ts:144-145` branches on it;
  - the edge hand-rolls the completion (`edge.ts:90-108`).

### Effect feature

- `Effect.callback` (`effect/src/Effect.ts:1853`) resumes at most once and runs its finalizer on interrupt.
- Expected failures go in `E` as a `Data.TaggedError` (`tools/lint-bomb/STYLE.md:46`, `:264`).
- In the core, a two-way outcome is two `Data.taggedEnum` variants (`effect/src/Data.ts:586`), not a flag.

### Before

```ts
// src/host/host.ts
export type Store = {
  readonly load: () => ReadonlyMap<string, string>;
  readonly write: (
    writes: ReadonlyArray<Bytes>,
    purpose: Purpose,
    answer: (ok: boolean) => void,
    acknowledges: ReadonlyArray<string>,
  ) => void;
};

// src/host/edge.ts, inside issue
store.value.write(
  writes.map((w) => ({ key: w.key, value: Option.map(w.record, (r) => JSON.stringify(r)) })),
  purposeOf(tickets),
  (ok) => {
    const now = scopeOf(name);
    const dirty = new Map(now.dirty);

    if (!ok) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);

    scopes.set(name, { ...now, dirty, out: false });

    for (const t of tickets) options.stored(t.id, ok);
    pump(name);
  },
  tickets.filter((t) => t.purpose === "acknowledge").map((t) => t.attempt),
);

// core/input.ts
Stored: { ticket: string; ok: boolean };
// core/step.ts
Stored: ({ ticket, ok }) => (open ? answers.stored(ticket, ok) : undefined),
```

### After

```ts
// src/host/host.ts
export class StoreRefused extends Data.TaggedError("StoreRefused")<{}> {}   // NEW

export type Store = {
  readonly load: Effect.Effect<ReadonlyMap<string, string>>;                 // CHANGED: was () => Map
  readonly write: (                                                          // CHANGED: no answer callback
    writes: ReadonlyArray<Bytes>,
    purpose: Purpose,
    acknowledges: ReadonlyArray<string>,
  ) => Effect.Effect<void, StoreRefused>;
};

// src/host/edge.ts, inside issue
fibers.fork(
  `store/${name}`,
  store.value.write(
    writes.map((w) => ({ key: w.key, value: Option.map(w.record, encodeJsonText) })),
    purposeOf(tickets),
    tickets.filter((t) => t.purpose === "acknowledge").map((t) => t.attempt),
  ),
  (exit) => {
    if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;   // a killed page answers nothing
    const ok = Exit.isSuccess(exit);
    const now = scopeOf(name);
    const dirty = new Map(now.dirty);

    if (!ok) for (const w of writes) if (!dirty.has(w.key)) dirty.set(w.key, w);

    scopes.set(name, { ...now, dirty, out: false });

    for (const t of tickets) options.answered(t.id, ok ? Input.Stored({ ticket: t.id }) : Input.Refused({ ticket: t.id }));
    pump(name);
  },
);

// src/host/runtime.ts, inside ready
const loaded = persistence
  ? yield* Option.match(host.store, { onNone: () => Effect.succeed(new Map()), onSome: (s) => s.load })
  : new Map<string, string>();

// core/input.ts
Stored: { ticket: TicketId };                                  // CHANGED: no ok flag
Refused: { ticket: TicketId };                                 // NEW variant
// core/step.ts
Stored: ({ ticket }) => (open ? answers.stored(ticket) : undefined),
Refused: ({ ticket }) => (open ? answers.refused(ticket) : undefined),
```

### What it removes and what it touches

- **Removed:** the `answer` callback protocol, its "exactly once" duty, and the core's `ok` branch. A real
  IndexedDB adapter becomes an ordinary `Effect.callback` over `IDBTransaction`, and its abort is a
  finalizer.
- **Downstream:**
  - The edge takes `fibers` (R1).
  - `ready()` reads with `yield*`.
  - `answers.ts` splits `stored` into two functions. Both share their silent-timer disarm.

### Risks

- **Pure-core rule: not broken.**
- An interrupted write is treated as unanswered, the same as a hung store. Confirm this against
  WriteAhead R12 and R13.

## R5. Guard verdict as a tagged enum, not `Result<Option<string>>`

### Problem

At `core/turn.ts:102-112`, a guard's three outcomes (pass, decline with a code, callback defect) are
encoded as `Result<Option<string>, Failed>`, where `None` means "pass". Every reader has to decode two
layers: `turn.ts:178` reads `Result.isFailure(checked) || Option.isSome(checked.success)`, and `:349`
reads `Option.isNone`. The public guard API (`true | Denial`) is separate and stays.

### Effect feature

`Data.taggedEnum` (`effect/src/Data.ts:586`), with `$is` and `$match`.

### Before and after

```ts
// before, core/turn.ts
type Check = Result.Result<Option.Option<string>, Failed>;
const decline = (code: string): Check => Result.succeed(Option.some(code));
const PASSED: Check = Result.succeed(Option.none());
// firstDecline loop
if (Result.isFailure(checked) || Option.isSome(checked.success)) return checked;

// after
type Verdict = Data.TaggedEnum<{
  Pass: {};
  Declined: { code: string };
  Defect: { slot: string };
}>;
const Verdict = Data.taggedEnum<Verdict>();
const PASSED = Verdict.Pass();                                 // shared constant: no per-guard allocation
const decline = (code: string) => Verdict.Declined({ code });
// firstDecline loop
if (!Verdict.$is("Pass")(checked)) return checked;
// the caller: Verdict.$match(checked, { Pass: …accept, Declined: …denied, Defect: …Refused GuardDefect })
```

- **Removes** the two-layer reads at three sites and the `OPEN` and `IN_FLIGHT` Option constants
  (`turn.ts:113-115`).
- **Downstream:** `turn.ts` only.
- **Risks:** none for the pure-core rule. The shared constants keep the guard loop allocation-free.

## R6. Option and Result idioms, and Effect's `Struct` and `Record` helpers

These are small, mechanical changes that read better. They can go in one pass, file by file.

- **`Option.match` with an identity or empty arm:**
  - `turn.ts:324` (`onSome: (list) => list`) becomes `Option.getOrElse` (`Option.ts:669`).
  - `lanes.ts:168` and `:271` duplicate a ternary that is `Option.orElse` (`Option.ts:769`).
  - `onNone: () => undefined` used for a side effect (`disposal.ts:94`, `serve.ts:91,132`,
    `incarnations.ts:190`, `persist.ts:43`, `edge.ts` in four places) becomes
    `if (Option.isSome(x)) …x.value`. That is shorter and allocates nothing.
- **Nested `Result.match` and `Option.flatMap` pyramids** become `Option.gen` (`Option.ts:4564`). Both are
  plain synchronous iterators, so the pure-core rule allows them. Example, `record.ts:179-197`:

  ```ts
  // before
  Result.match(decodeActorJson(value), {
    onFailure: () => undefined,
    onSuccess: (r) => {
      const compiled = machines.get(r.machine);

      if (compiled === undefined) return;

      Result.match(Schema.decodeUnknownResult(Schema.toCodecJson(compiled.memory))(r.memory), {
        onFailure: () => undefined,
        onSuccess: (memory) =>
          void records.push({ actor: { machine: r.machine, name: r.name }, state: r.state, memory, schedules: r.schedules }),
      });
    },
  });

  // after (with R2's memoryJson)
  const record = Option.gen(function* () {
    const r = yield* Result.getSuccess(decodeActorJson(value));
    const compiled = yield* Option.fromUndefinedOr(machines.get(r.machine));
    const memory = yield* Result.getSuccess(Schema.decodeUnknownResult(compiled.memoryJson)(r.memory));

    return { actor: { machine: r.machine, name: r.name }, state: r.state, memory, schedules: r.schedules };
  });

  if (Option.isSome(record)) records.push(record.value);
  ```

  The same applies at `record.ts:201` and `:222-245`, and at `definition.ts:258-263`, which
  `host/testing.ts:31-36` duplicates: keep one and import it. This runs at boot, once per record, not in
  the turn.
- **`laneAt` returns `undefined` and is re-wrapped:** `lanes.ts:81` should return
  `Option.fromUndefinedOr` once, so `lanes.ts:155` needs no wrapper.
- **Hand-rolled `Struct` and `Record` helpers in compile-time code:**
  - `tx.ts:90` and `record.ts:242` define `pick` twice; use `Struct.pick` (`Struct.ts:261`);
  - about 15 `Object.fromEntries(Object.entries(x).map(...))` in `machine.ts` and `definition.ts` become
    `Record.map` (`effect/src/Record.ts:970`);
  - `runtime.ts:31` finds duplicates with `ids.filter((id, i) => ids.indexOf(id) !== i)`; use
    `Array.dedupe` (`effect/src/Array.ts:9728`), or a Set.

  These run once per definition, never per turn.
- **`_tag ===` beside `$is`:** use `Phase.$is("Held")` at `rows.ts:19-20` and `Delay.$is("Fixed")` at
  `incarnations.ts:132,136`. The `: 0` fallback at `:136` is unreachable after the filter at `:132`.
- **One lane-id builder:** `` `${actorKey(actor)}|${operation}|${keyText}` `` is written at `lanes.ts:82`,
  `:104` and `record.ts:239`. Make it `laneId(actor, operation, keyText)` in `world.ts`, beside `actorKey`.
- **Naming:**
  - `release_` (`lanes.ts:201`) is the only trailing-underscore name in `src/`.
  - `mappingOf` means two things (`machine.ts:163`, `serve.ts:27`).

  Rename both. The wider `xOf` helper names are consistent within the codebase, so leave them.

Effort is about 1-2 hours. There is no behaviour change, and the pure-core rule holds. The `Map.get`
`=== undefined` checks in hot loops stay plain on purpose.

## R7. Host conventions (in the same edit as R1)

- **Named `Effect.fn`.** `runtime.ts:200` (`ready`) is an `Effect.gen` inside a thunk. STYLE.md:207 and
  :242 call for a named `Effect.fn` at trace boundaries. After: `Effect.fn("Runtime.ready")`, shown in R1.
  It gives every boot a span.
- **`FlowError` keeps its cause.** `runtime.ts:205` turns a typed Layer error into `String(cause)`. Add a
  `cause` field (Effect's standard field on `Data.TaggedError`) and pass the original error. R3 gives the
  closed `code`.
- **One JSON-text codec both ways.** `edge.ts:92` writes with `JSON.stringify`, while `runtime.ts:195-197`
  reads with `Schema.fromJsonString(Schema.Json)`, and rebuilds that decoder per stored entry. After: one
  module-level `const JsonText = Schema.fromJsonString(Schema.Json)` in `src/host/`, with
  `encodeJsonText = Schema.encodeSync(JsonText)` and `decodeJsonText = Schema.decodeUnknownOption(JsonText)`.
- **String `TypeId`, not `Symbol.for`.** At `runtime.ts:79`, `Symbol.for("flow-state/runtime-internal")`
  keys the public `Runtime`. Effect's convention is a string TypeId, for example
  `const TypeId = "~effect/Option"` (`effect/src/Option.ts:37`) with an `is*` guard. After:
  `const TypeId = "~flow-state/Runtime"`. `isRuntime` stays `Predicate.hasProperty(value, TypeId)`.
- **Bugs to fix in the same edit (verified):**
  - `driver.ts:150-164`: `run` sets `running = true` with no `finally`. A throw from an inspector sink
    (`runtime.ts:186-188`) or a defect in `step` leaves it true, and every later input only queues. Wrap the
    loop in `try/finally`. Whether a defect then closes the Runtime is a Runtime Spec call.
  - `driver.ts:107`: an `Invoke` for an unknown operation returns silently, so the call never settles. It is
    unreachable from a valid Compiled, so it should be thrown as a defect.

## R8. Drop `Host.later`: an urgent batch is a `yieldNow` wake (gated)

`Host.later` (`host.ts:43`, `runtime.ts:124`, `edge.ts:150`) is a second task queue next to the
Scheduler. With R1's fibers it can go:

```ts
// before, src/host/edge.ts accept
if (Option.isSome(ticket) || options.captureMs <= 0 || host.hidden()) {
  scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY });
  host.later(() => pump(name));
} else wakeAt(name, clock.currentTimeMillisUnsafe() + options.captureMs);

// after
if (Option.isSome(ticket) || options.captureMs <= 0 || host.hidden()) {
  scopes.set(name, { ...scopeOf(name), due: Number.NEGATIVE_INFINITY });
  fibers.fork(`wake/${name}`, Effect.yieldNow, (exit) => {     // existing Effect API: Effect.ts:2558
    if (Exit.isSuccess(exit)) pump(name);
  });
} else wakeAt(name, clock.currentTimeMillisUnsafe() + options.captureMs);
```

- **Risk:** WriteAhead R10 says "the next host task". A browser `setTimeout(0)` is a macrotask, while
  `MixedScheduler` uses `setImmediate` (`effect/src/Scheduler.ts:111-185`). Both defer past the current
  step, so writes still coalesce, but the order against store answers changes. Adopt it only if the suite
  and the WriteAhead cases pass unchanged. R1 and R4 don't need it.
- **Pure-core rule: not broken.**

## Considered and rejected

- **`HashMap` for the core's copy-on-write maps** (`tx.ts:69-80` `withEntry` and `without`). AGENTS.md
  measures `HashMap` at 5-17x a plain structure, so plain Maps stay.
- **`Exit` in place of `CallResult`** (`core/input.ts:8-19`). `CallResult` carries Flow's `Unknown` ending
  and a `reason`, which `Exit` has no slot for, and `Exit` is not on the core's allowed list.
- **`Option` everywhere for `Map.get` in the core.** In hot loops the plain check avoids an allocation.
  `Option` stays where a value crosses a function boundary.
- **`Result` instead of throwing in `app()` and `machine()`** (`runtime.ts:34-37`, `machine.ts:280`). This
  is a public-API and Spec question (Compile R2, R15), already open as C6 in
  `invariant-audit-2026-11-11.md`.
- **`Schema.encode` in place of the hand-written record encoders** (`record.ts:71,102,122`). They derive
  fields (`inFlight` from `phase`), so they would need a domain-to-wire transformation per record. R2
  already removes their per-call codec cost.
- **`Schema.TaggedStruct` for `Denial`** (`compiled.ts:18`, `flow.ts:66`). This is the public guard API
  (`memory.ready || deny("NotReady")`). The literal is already plain storable data, so this adds a Schema
  without removing code.
- **`kind` to `_tag` on contracts** (`contract.ts:99,116`), and the error tag spelling (`"Flow/Failure"`
  against `"FlowError"`). Both are public names, so they are the user's call. They are not a
  simplification.
- **Splitting `core/world.ts` into one module per concept.** The builder has just split `step.ts`, and
  `world.ts` is the World's data model. That cohesion is worth more than Effect's one-concept-per-module
  shape here. Revisit if it grows past the 500-line warning.
- **`PubSub` for inspector sinks and `Queue` for the driver inbox.** Inspection O3 promises synchronous
  delivery at the end of each step, and the inbox is the one re-entrant synchronous loop by design. Either
  would add an asynchronous hop.
- **`Schedule` at the host.** Retries, backoff and timers are core decisions emitted as `Arm` commands, so
  Stories replay. The host only sleeps.
- **`Random` for `sessionSeed`.** The default `Random` uses `Math.random`, while the seed must be platform
  entropy (WriteLanes R5, I28).
- **`Outcome` building `Effect.succeed` and `Effect.fail`** (`flow.ts:87-90`). That builds Effect values
  for a commit, which runs in a host fiber. It doesn't run the Effect runtime, so it isn't a core breach.

## What carries over to the conformance edges later (out of scope here)

- **The world hands the Runtime a `Clock`.** After R1 the production adapter boots over a `Platform`
  Context. `conformance/world/clock.ts` gains an Effect `Clock` over virtual time, built as `hostClock` is
  now, and drops `arm`. `world/page.ts`'s scheduler is provided as `Scheduler.Scheduler`.
- **Not `TestClock` for the world.** `TestClock.adjust` is asynchronous, and between wakes it waits only on
  scheduler tasks (`effect/src/testing/TestClock.ts:427-458`). The world must settle page tasks and store
  answers between timers, and its steps are synchronous.
- **After R4, the adapter wraps the world's callback store once,** with `Effect.callback`, so hang and kill
  become interruption.
- **Small fixes, verified:**
  - `runner/falsify.ts:43-66` leaks a `flow-mutant-*` directory if a copy throws inside `acquire`.
  - The two adapters each have a `decodeJson`, which R7's `JsonText` can replace.
- **Blocked:** `effect/cli` and `effect/process` need `@effect/platform-node` at a matching version. It is
  installed at `4.0.0-rc.112` against `effect` 4.0.5 (`runner/main.ts:402`).

## Sidecar findings log

There were eight Haiku sidecars, each at effort high and read-only. Four were for the first, wider brief
(host, edges, core, conventions). After the scope change, four more covered core Option and Result, Data
and tagged unions, Schema, and naming and module shape. Each finding used here was re-read against the
code and `node_modules/effect/src` 4.0.5.

- **Host:**
  - Accepted: the dispose leak, the wedge, the clamp, the registries, the silent drop, the stringified
    error, and that the Clock shape is right (the duplicate is `arm`).
  - Changed: `later`, which became gated R8.
  - Rejected: PubSub and Queue, for synchronous contracts; the throw, as a Spec question; the erased R,
    which is unreachable before `Boot`.
- **Option and Result:**
  - Accepted: 1 (the verdict, as R5) and 2, 3, 6-9 (idioms, in R6).
  - Changed: 5 (Stored `ok`), which became variants in R4, not `Result<void, unknown>`.
  - Rejected: 4 (persist's `None`), since the caller branch makes it harmless, and it is a builder-local
    tidy; 10 (`Result.gen` in `accept`), which allocates per turn and is no shorter; 11 (row booleans),
    which are the public O6 shape.
- **Data:**
  - Accepted: 1 (as R6), 3 (as R4), 4 and 5 (as R3), and 6 (brands, as R3).
  - Rejected: 2 (TaggedStruct for Denial) and 7 (`kind` on contracts), as public API.
- **Schema:**
  - Accepted: 1 (events never decoded, verified by search), 2 (codecs rebuilt), 3 (twin types), 5 (memory
    equality), 6 (duck-typed key codec) and 7 (lane id), all in R2, R3 and R6.
  - Changed: 4 (hand encoders) and 8 (null fallback). Both stay, since R2 removes their cost.
  - Not adopted: the "restore trusts stored `keyText`" part of 7. Re-deriving it on restore is a WriteAhead
    question, not Effect.
- **Naming and modules:**
  - Accepted: helpers (`pick`, `Record.map`, `dedupe`), `release_`, `mappingOf`, the twin shapes, and the
    TypeId.
  - Rejected: splitting `world.ts`; `HashMap` copy-on-write (cost); the `xOf` renames (consistent
    in-house).
