import { type Cause, Context, Effect, Layer, Option, Predicate } from "effect";
import { TestClock } from "effect/testing";
import type { Values } from "../../core/compiled.ts";
import { Input } from "../../core/step.ts";
import type { ActorId, Use, Wiring } from "../../core/world.ts";
import type { Machine, Operations } from "../../definition.ts";
import type { App } from "../../index.ts";
import { Host, type Platform } from "../host.ts";
import { Store, StoreRefused } from "../store.ts";
import { attachInspector, type Evidence } from "../inspect.ts";
import { buildRuntime, type RuntimeConfig, snapshotOf } from "../runtime.ts";
import { tabClock } from "./clock.ts";
import { compiledOf } from "../../compiled-of.ts";

/**
 * A Runtime built for Flow's own tests, with its driver beside it.
 */
export type TestRuntime = ReturnType<typeof buildRuntime>;

/**
 * Flow's own tests' seam into a Runtime, unexported by any route: it builds a Runtime over a given
 * platform and drives what the public API does not reach yet (uses, `forget`, the Runtime's
 * bounded disposal).
 */
export const testing = {
  build: (config: RuntimeConfig, platform: Platform) =>
    buildRuntime(config, platform, () => undefined, Option.none()),
  attach: (
    { driver }: TestRuntime,
    actor: ActorId,
    use: Use,
    existing: boolean,
    wiring: Option.Option<Wiring> = Option.none(),
  ) =>
    driver.input(
      Input.Ensure({
        actor,
        use: Option.some(use),
        start: existing ? "wake" : "create",
        wiring,
      }),
    ),
  detach: ({ driver }: TestRuntime, actor: ActorId, use: Use) =>
    driver.input(Input.Release({ actor, use })),
  forget: ({ driver }: TestRuntime, actor: ActorId) =>
    driver.offer(Input.Forget({ actor }), `forget ${actor.name}`),
  disposeRuntime: ({ driver }: TestRuntime) => driver.input(Input.DisposeRuntime()),
  pending: ({ driver }: TestRuntime) => driver.pending(),
  send: ({ driver }: TestRuntime, actor: ActorId, tag: string, payload: Values) =>
    driver.send(actor, tag, payload),
  snapshot: ({ driver }: TestRuntime, actor: ActorId) => snapshotOf(driver, actor),
  row: (machine: Machine, operations: Operations, operation: string, key: Values) =>
    Option.flatMap(Option.fromUndefinedOr(compiledOf(machine).operations.get(operation)), (op) =>
      Option.flatMap(op.walk.keyText(key), (text) =>
        Option.fromUndefinedOr(operations.get(operation)?.get(text)),
      ),
    ),
};

/**
 * The service the host tests' commits call: a ring by Attempt id that answers when the test says.
 */
export class Bell extends Context.Service<
  Bell,
  { readonly ring: (attempt: string) => Effect.Effect<string, string> }
>()("flow-state-v3/src/host/testing/seam/Bell") {}

/**
 * A platform for one boot over the Stories' own clock and event loop: fibers queue until
 * `settle`, time moves only on `advance` (TestClock), and every write to the platform's Store lands
 * at once in `store`, unless `hung`, when no write ever answers. Each entry in `refusals.left` refuses one
 * write, `StoreRefused`, in turn.
 */
export const platformOver = (
  store: Map<string, string>,
  seed: number,
  hung = false,
  refusals: { readonly left: Array<true> } = { left: [] },
) => {
  // FLOW_STATE_ALLOW_UNKNOWN: a late cleanup fails with whatever it threw.
  const reports: Array<Cause.Cause<unknown>> = [];

  const host = Host.of({
    hidden: () => false,
    onHidden: () => () => undefined,
    sessionSeed: seed.toString(16).padStart(32, "0"),
    freezeValues: true,
    workClock: Option.none(),
    report: (cause) => void reports.push(cause),
  });

  const tab = tabClock(host, 0, () => {
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a host test whose fibers never settle is a broken test
    throw new Error("the boot did not settle within 100,000 tasks");
  });

  // The test host gives its store in the platform, as a setup's services would.
  const platform = Context.add(
    tab.platform,
    Store,
    Store.of({
      load: Effect.sync(() => new Map(store)),
      write: (writes) => {
        if (hung) return Effect.never;

        if (refusals.left.pop() === true)
          return Effect.fail(new StoreRefused({ reason: "failed" }));

        return Effect.sync(() => {
          for (const w of writes)
            Option.match(w.value, {
              onNone: () => store.delete(w.key),
              onSome: (value) => store.set(w.key, value),
            });
        });
      },
    }),
  );

  return {
    platform,
    reports,
    settle: tab.settle,
    perform: tab.perform,
    advance: (ms: number) => void tab.perform(TestClock.adjust(ms)),
  };
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
  refusals: { readonly left: Array<true> } = { left: [] },
) => {
  const tab = platformOver(store, seed, options.hung, refusals);
  const bell = bellOf();
  const seen: Array<Evidence> = [];

  const built: TestRuntime = testing.build(
    {
      app: served,
      services: bell.layer,
      scope: "test",
      persistence: { captureMs: options.captureMs },
    },
    tab.platform,
  );

  attachInspector(built.runtime, (e) => void seen.push(e));
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a boot over the test store is synchronous
  Effect.runSync(built.runtime.ready());

  if (settled) tab.settle();

  return { built, tab, bell, seen };
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
  tags: ReadonlyArray<Evidence["_tag"]>,
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
