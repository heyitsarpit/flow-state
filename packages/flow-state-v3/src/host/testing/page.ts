import { Clock, Context, Duration, Effect, Layer, Option, Predicate, Scheduler } from "effect";
import type { App } from "../../index.ts";
import { attachInspector, type Evidence } from "../inspect.ts";
import { Host, testing, type TestRuntime } from "../testing.ts";

/**
 * The service the suite's commits call: a ring by Attempt id that answers when the test says.
 */
export class Bell extends Context.Service<
  Bell,
  { readonly ring: (attempt: string) => Effect.Effect<string, string> }
>()("flow-state-v3/src/host/testing/page/Bell") {}

/**
 * A page for one boot: fibers queue until `settle`, time moves only on `advance`, and every store
 * write lands at once in `store`, unless `hung`, when no write ever answers.
 */
export const pageOver = (store: Map<string, string>, seed: number, hung = false) => {
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
        // oxlint-disable-next-line lint-bomb/no-stateful-effect-construction -- Effect.callback's register runs when the sleep executes, not at construction
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
          hung
            ? Effect.never
            : Effect.sync(() => {
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
export const bellOf = () => {
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

/**
 * Boots `served` over `store` with an inspector that keeps every report in `seen`, and waits for
 * `ready`.
 */
export const bootWith = (
  served: App,
  store: Map<string, string>,
  seed: number,
  settled = true,
  options: { readonly captureMs: number; readonly hung: boolean } = { captureMs: 0, hung: false },
) => {
  const page = pageOver(store, seed, options.hung);
  const bell = bellOf();
  const seen: Array<Evidence> = [];

  const built: TestRuntime = testing.build(
    {
      app: served,
      services: bell.layer,
      scope: "test",
      persistence: { captureMs: options.captureMs },
    },
    page.platform,
  );

  attachInspector(built.runtime, (e) => void seen.push(e));
  Effect.runSync(built.runtime.ready());

  if (settled) page.settle();

  return { built, page, bell, seen };
};

/**
 * Whether a report names an Attempt.
 */
export const sameAttempt = (e: Evidence, attempt: string) =>
  "attempt" in e &&
  (Predicate.isString(e.attempt) ? e.attempt === attempt : Option.contains(e.attempt, attempt));

/**
 * The tags of the reports of one Attempt (every report when `attempt` is empty) among `tags`.
 */
export const tagsOf = (
  seen: ReadonlyArray<Evidence>,
  attempt: string,
  tags: ReadonlyArray<string>,
) =>
  seen.flatMap((e) =>
    tags.includes(e._tag) && (!("attempt" in e) || attempt === "" || sameAttempt(e, attempt))
      ? [e._tag]
      : [],
  );

/**
 * An Attempt's endings, as `channel reason`.
 */
export const endingsOf = (seen: ReadonlyArray<Evidence>, attempt: string) =>
  seen.flatMap((e) =>
    e._tag === "Ended" && Option.contains(e.attempt, attempt) ? [`${e.channel} ${e.reason}`] : [],
  );
