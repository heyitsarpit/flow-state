import assert from "node:assert/strict";
import { Context, Duration, Effect, Option, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import { RuntimeDefaults } from "../core/defaults.ts";
import { actorRef, app, definition, Flow, machine } from "../index.ts";
import { Host } from "./host.ts";
import { attachInspector, type Evidence } from "./inspect.ts";
import { browserPlatform } from "./platform/browser.ts";
import { buildRuntime } from "./runtime.ts";

const Tally = definition({
  id: "Slow/Tally",
  persist: true,
  states: ["COUNTING"],
  events: { Bump: { by: Schema.Number } },
  memory: { count: Flow.initial(Schema.Number, 0) },
});

const TallyMachine = machine(Tally, ({ S }) => ({
  default: S.COUNTING,
  on: { Bump: { updateMemory: ({ event, memory }) => ({ count: memory.count + event.by }) } },
}));

const tally = actorRef(TallyMachine, "t");

const BUDGET = Duration.toMillis(RuntimeDefaults.slowWorkBudget);

// A Runtime whose host's work clock moves `cost.ms` at each reading, so every step it times takes
// exactly that long, or a Runtime with no work clock at all, as production has.
const timed = (clock: Option.Option<{ ms: number }>) => {
  const store = new Map<string, string>();
  const seen: Array<Evidence> = [];
  let at = 0;

  const { runtime } = buildRuntime(
    {
      app: app({ id: "slow", machines: { tally: TallyMachine } }),
      scope: "slow",
      persistence: { captureMs: 0 },
    },
    Context.make(
      Host,
      Host.of({
        hidden: () => false,
        onHidden: () => () => undefined,
        store: Option.some({
          load: Effect.sync(() => new Map(store)),
          write: (writes) =>
            Effect.sync(() => {
              for (const w of writes)
                Option.match(w.value, {
                  onNone: () => store.delete(w.key),
                  onSome: (text) => store.set(w.key, text),
                });
            }),
        }),
        sessionSeed: "0".repeat(32),
        freezeValues: true,
        workClock: Option.map(clock, (cost) => () => (at += cost.ms)),
      }),
    ),
    () => undefined,
  );

  attachInspector(runtime, (e) => void seen.push(e));

  return { runtime, seen };
};

const slow = (seen: ReadonlyArray<Evidence>) =>
  seen.flatMap((e) =>
    e._tag === "SlowWork" ? [`${e.work} ${e.input} ${e.ms} of ${e.budgetMs}`] : [],
  );

describe("SlowWork (Diagnostics; RuntimeDefaults.slowWorkBudget)", () => {
  it("a dev host's turn and capture slower than the budget are each reported SlowWork with their time and the budget", async () => {
    const cost = { ms: 0 };
    const { runtime, seen } = timed(Option.some(cost));
    await Effect.runPromise(runtime.ready());
    const handle = runtime.ensureActor(tally);
    cost.ms = BUDGET + 1;
    handle.send({ _tag: "Bump", by: 1 });
    await Effect.runPromise(Effect.yieldNow);

    assert.deepStrictEqual(slow(seen), [
      `turn Send ${BUDGET + 1} of ${BUDGET}`,
      `capture Capture ${BUDGET + 1} of ${BUDGET}`,
    ]);
    await Effect.runPromise(runtime.dispose());
  });

  it("a step that takes exactly the budget is not reported", async () => {
    const { runtime, seen } = timed(Option.some({ ms: BUDGET }));
    await Effect.runPromise(runtime.ready());
    runtime.ensureActor(tally).send({ _tag: "Bump", by: 1 });
    await Effect.runPromise(Effect.yieldNow);

    assert.deepStrictEqual(slow(seen), []);
    await Effect.runPromise(runtime.dispose());
  });

  it("a host with no work clock, as production is, times nothing and reports nothing", async () => {
    const { runtime, seen } = timed(Option.none());
    await Effect.runPromise(runtime.ready());
    runtime.ensureActor(tally).send({ _tag: "Bump", by: 1 });
    await Effect.runPromise(Effect.yieldNow);

    assert.deepStrictEqual(slow(seen), []);
    assert.ok(Option.isNone(Context.get(browserPlatform(), Host).workClock));
    await Effect.runPromise(runtime.dispose());
  });
});
