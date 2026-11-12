import assert from "node:assert/strict";
import { Clock, Context, Duration, Effect, Exit, Layer, Option, Scheduler, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import type { Operation, Values } from "../core/compiled.ts";
import type { Ending, Head, Phase } from "../core/world.ts";
import { app, definition, Flow, machine, Outcome, transaction } from "../index.ts";
import { attachInspector, type Evidence } from "./inspect.ts";
import { Host, testing, type TestRuntime } from "./testing.ts";

class Bell extends Context.Service<
  Bell,
  { readonly ring: (attempt: string) => Effect.Effect<string, string> }
>()("flow-state-v3/src/host/lanes.test/Bell") {}

const ring = transaction({
  id: "Test/ring",
  input: { tone: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (_input, { attempt }) =>
    Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(attempt.id)).pipe(
      Effect.catch((e) => Outcome.unknown(e)),
    ),
});

const Door = definition({
  id: "Test/Door",
  persist: true,
  states: ["SHUT"],
  events: { Ring: {} },
  internalEvents: { Rang: {}, NotRung: { why: Schema.String }, Unsure: Flow.uncertain({}) },
  memory: {},
  operations: ({ E }) => ({
    ring: ring.outcomes({
      success: E.Rang,
      failure: { NotSent: E.NotRung.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.Unsure,
    }),
  }),
});

const DoorMachine = machine(Door, ({ S, O }) => ({
  default: S.SHUT,
  on: {
    Ring: { actions: [O.ring.commit(() => ({ tone: "low" }))] },
    Rang: {},
    NotRung: {},
    Unsure: { actions: [O.ring.retry] },
  },
}));

const doors = app({ id: "test", machines: { door: DoorMachine } });

const front = { machine: "Test/Door", name: "front" };

/**
 * A page for one boot: fibers queue until `settle`, time moves only on `advance`, and every store
 * write lands at once in `store`.
 */
const pageOver = (store: Map<string, string>, seed: number) => {
  let tasks: ReadonlyArray<() => void> = [];
  let now = 0;
  let timers: ReadonlyArray<{ readonly at: number; readonly fire: () => void }> = [];

  const scheduler: Scheduler.Scheduler = {
    executionMode: "async",
    shouldYield: () => false,
    makeDispatcher: () => ({
      scheduleTask: (task) => {
        tasks = [...tasks, task];
      },
      flush: () => undefined,
    }),
  };

  const settle = () => {
    for (let [task] = tasks; task !== undefined; [task] = tasks) {
      tasks = tasks.slice(1);
      task();
    }
  };

  const clock = Clock.Clock.of({
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.sync(() => now),
    currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    monotonicTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    sleep: (duration) =>
      Effect.callback<void>((resume) => {
        const timer = { at: now + Duration.toMillis(duration), fire: () => resume(Effect.void) };
        timers = [...timers, timer];

        return Effect.sync(() => {
          timers = timers.filter((t) => t !== timer);
        });
      }),
  });

  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);

    for (const t of due) t.fire();
    settle();
  };

  const platform = Context.make(
    Host,
    Host.of({
      hidden: () => false,
      onHidden: () => undefined,
      sessionSeed: seed,
      store: Option.some({
        load: Effect.sync(() => new Map(store)),
        write: (writes) =>
          Effect.sync(() => {
            for (const w of writes)
              Option.match(w.value, {
                onNone: () => store.delete(w.key),
                onSome: (value) => store.set(w.key, value),
              });
          }),
      }),
    }),
  ).pipe(Context.add(Clock.Clock, clock), Context.add(Scheduler.Scheduler, scheduler));

  return { platform, settle, advance };
};

/**
 * A bell whose rings wait until the test answers them, by Attempt id.
 */
const bellOf = () => {
  const waiting = new Map<string, (answer: Effect.Effect<string, string>) => void>();

  const layer = Layer.succeed(
    Bell,
    Bell.of({
      ring: (attempt) =>
        Effect.callback<string, string>((resume) => {
          waiting.set(attempt, resume);
        }),
    }),
  );

  return { layer, waiting };
};

const boot = (store: Map<string, string>, seed: number, settled = true) => {
  const page = pageOver(store, seed);
  const bell = bellOf();
  const seen: Array<Evidence> = [];

  const built: TestRuntime = testing.build(
    { app: doors, services: bell.layer, scope: "test", persistence: { captureMs: 0 } },
    page.platform,
  );

  attachInspector(built.runtime, (e) => void seen.push(e));
  Effect.runSync(built.runtime.ready());

  if (settled) page.settle();

  return { built, page, bell, seen };
};

const endingsOf = (seen: ReadonlyArray<Evidence>, attempt: string) =>
  seen.flatMap((e) =>
    e._tag === "Ended" && Option.contains(e.attempt, attempt) ? [`${e.channel} ${e.reason}`] : [],
  );

describe("write lanes on the production runtime", () => {
  it("a restored Held head retried, then disposed before its re-send, stays Held: it never ends NotSent (WriteLanes I3, model: disposal; Actors R22)", () => {
    const store = new Map<string, string>();
    const first = boot(store, 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the first boot sent the ring");

    // The page dies with the ring on the wire. The next boot restores its lane Held and delivers
    // unknown Restored, whose handler retries; the Runtime is disposed before the re-send leaves.
    const second = boot(store, 2, false);
    testing.disposeRuntime(second.built);
    second.page.settle();

    assert.deepStrictEqual(endingsOf(second.seen, attempt), ["unknown Restored"]);
  });

  it("dispose() waits for the core's disposal: a call settling inside the bound is parked before the Scope closes (Actors R22)", async () => {
    const first = boot(new Map(), 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the ring is on the wire");

    const disposed = Effect.runPromiseExit(first.built.runtime.dispose());
    first.page.settle();
    first.bell.waiting.get(attempt)?.(Effect.succeed("ding"));
    first.page.settle();

    assert.ok(Exit.isSuccess(await disposed));
    assert.deepStrictEqual(
      first.seen.flatMap((e) =>
        (e._tag === "Parked" && Option.contains(e.attempt, attempt)) || e._tag === "RuntimeDisposed"
          ? [e._tag]
          : [],
      ),
      ["Parked", "RuntimeDisposed"],
    );
  });
});

type Flag = "sent" | "cancelled" | "redelivered" | "parked";

type KeysOf<T> = T extends unknown ? keyof T : never;

// A head's history and an ending's tries are tags, never booleans beside them (T51 acceptance).
const noEndingFlags: [Extract<KeysOf<Head | Phase | Ending>, Flag>] extends [never] ? true : false =
  true;

type LookupArguments = Parameters<Extract<Operation, { readonly _tag: "Read" }>["call"]["run"]>;

// A lookup is called with its input alone: no Attempt, and nothing standing in for one (Reads I21).
const lookupTakesInputOnly: LookupArguments extends readonly [Values] ? true : false = true;

describe("lane shapes", () => {
  it("phases and tries are tags, and a lookup gets no Attempt (T51 acceptance, Reads I21)", () => {
    assert.deepStrictEqual([noEndingFlags, lookupTakesInputOnly], [true, true]);
  });
});
