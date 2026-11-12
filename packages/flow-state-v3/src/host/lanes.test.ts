import assert from "node:assert/strict";
import {
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
  Scheduler,
  Schema,
} from "effect";
import { describe, it } from "vite-plus/test";
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

// An unkeyed write whose key-less members run from external events, outside any ending's handler.
const Gate = definition({
  id: "Test/Gate",
  states: ["OPEN"],
  events: { Ring: {}, Again: {}, Stop: {} },
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

const GateMachine = machine(Gate, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Ring: { actions: [O.ring.commit(() => ({ tone: "high" }))] },
    Again: { guard: [O.ring.retryable({ times: 3 })], actions: [O.ring.retry] },
    Stop: { actions: [O.ring.cancel] },
    Rang: {},
    NotRung: {},
    Unsure: {},
  },
}));

const gates = app({ id: "test", machines: { gate: GateMachine } });

const side = { machine: "Test/Gate", name: "side" };

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
  const rings: Array<string> = [];

  const layer = Layer.succeed(
    Bell,
    Bell.of({
      ring: (attempt) =>
        Effect.callback<string, string>((resume) => {
          rings.push(attempt);
          waiting.set(attempt, resume);
        }),
    }),
  );

  return { layer, waiting, rings };
};

const boot = (store: Map<string, string>, seed: number, settled = true, served = doors) => {
  const page = pageOver(store, seed);
  const bell = bellOf();
  const seen: Array<Evidence> = [];

  const built: TestRuntime = testing.build(
    { app: served, services: bell.layer, scope: "test", persistence: { captureMs: 0 } },
    page.platform,
  );

  attachInspector(built.runtime, (e) => void seen.push(e));
  Effect.runSync(built.runtime.ready());

  if (settled) page.settle();

  return { built, page, bell, seen };
};

const tagsOf = (seen: ReadonlyArray<Evidence>, attempt: string, tags: ReadonlyArray<string>) =>
  seen.flatMap((e) =>
    tags.includes(e._tag) && (!("attempt" in e) || attempt === "" || sameAttempt(e, attempt))
      ? [e._tag]
      : [],
  );

const sameAttempt = (e: Evidence, attempt: string) =>
  "attempt" in e &&
  (Predicate.isString(e.attempt) ? e.attempt === attempt : Option.contains(e.attempt, attempt));

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
    assert.deepStrictEqual(second.bell.rings, [], "nothing is invoked once disposal starts");
    assert.deepStrictEqual(tagsOf(second.seen, attempt, ["Sent"]), []);
  });

  it("dispose() waits for the core's disposal: a call settling inside the bound is parked, then heard by the next incarnation (Actors R22)", async () => {
    const store = new Map<string, string>();
    const first = boot(store, 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the ring is on the wire");

    const disposing = Effect.runFork(first.built.runtime.dispose());
    first.page.settle();
    assert.strictEqual(disposing.pollUnsafe(), undefined, "dispose() waits for the call");

    first.bell.waiting.get(attempt)?.(Effect.succeed("ding"));
    first.page.settle();

    assert.ok(Exit.isSuccess(await Effect.runPromise(Effect.exit(Fiber.join(disposing)))));
    assert.deepStrictEqual(endingsOf(first.seen, attempt), ["success success"]);
    assert.deepStrictEqual(tagsOf(first.seen, attempt, ["Ended", "Parked", "RuntimeDisposed"]), [
      "Ended",
      "Parked",
      "RuntimeDisposed",
    ]);

    const second = boot(store, 2);
    testing.attach(second.built, front, "host", true);
    second.page.settle();

    assert.deepStrictEqual(
      second.seen.flatMap((e) =>
        e._tag === "Delivered" && Option.contains(e.attempt, attempt) ? [e.event] : [],
      ),
      ["Rang"],
    );
  });

  it("dispose() past the bound: a call that never answers ends unknown Disposed after 5 s, then the disposal ends (Actors R22)", async () => {
    const first = boot(new Map(), 1);

    testing.attach(first.built, front, "host", false);
    testing.send(first.built, front, "Ring", {});
    first.page.settle();

    const [attempt] = [...first.bell.waiting.keys()];
    assert.ok(attempt !== undefined, "the ring is on the wire");

    const disposing = Effect.runFork(first.built.runtime.dispose());
    first.page.advance(4999);
    assert.strictEqual(disposing.pollUnsafe(), undefined, "dispose() waits out the bound");

    first.page.advance(1);

    assert.ok(Exit.isSuccess(await Effect.runPromise(Effect.exit(Fiber.join(disposing)))));
    assert.deepStrictEqual(endingsOf(first.seen, attempt), ["unknown Disposed"]);
    assert.deepStrictEqual(tagsOf(first.seen, attempt, ["Parked", "RuntimeDisposed"]), [
      "Parked",
      "RuntimeDisposed",
    ]);
  });

  it("a key-less retry and retryable on an unkeyed operation, outside an ending's handler, name its one lane (WriteLanes R9)", () => {
    const first = boot(new Map(), 1, true, gates);

    testing.attach(first.built, side, "host", false);
    testing.send(first.built, side, "Ring", {});
    first.page.settle();

    const [attempt] = first.bell.rings;
    assert.ok(attempt !== undefined, "the ring is on the wire");
    first.bell.waiting.get(attempt)?.(Effect.fail("lost"));
    first.page.settle();

    testing.send(first.built, side, "Again", {});
    first.page.settle();

    assert.deepStrictEqual(first.bell.rings, [attempt, attempt], "the Held Attempt is re-sent");
  });

  it("a key-less cancel on an unkeyed operation, outside an ending's handler, releases its one lane (WriteLanes R9, R14)", () => {
    const first = boot(new Map(), 1, true, gates);

    testing.attach(first.built, side, "host", false);
    testing.send(first.built, side, "Ring", {});
    first.page.settle();

    const [attempt] = first.bell.rings;
    assert.ok(attempt !== undefined, "the ring is on the wire");
    first.bell.waiting.get(attempt)?.(Effect.fail("lost"));
    first.page.settle();

    testing.send(first.built, side, "Stop", {});
    testing.send(first.built, side, "Ring", {});
    first.page.settle();

    assert.deepStrictEqual(
      first.seen.flatMap((e) => (e._tag === "Lane" ? [e.kind] : [])),
      ["Released"],
    );
    assert.strictEqual(first.bell.rings.length, 2, "the released lane takes a new commit");
  });
});
