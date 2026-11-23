// The cleanup tests' app and helpers: a phone whose holds and watches hang until interrupted, each
// then running a cleanup the test chooses, and a note that persists.
import { Cause, Context, Data, Effect, Layer, Option, Result, Schema } from "effect";
import { Evidence } from "../../core/evidence.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  resource,
  transaction,
} from "../../index.ts";
import { Host, type Platform } from "../host.ts";
import { buildRuntime } from "../runtime.ts";
import { testing } from "../testing/seam.ts";

export class LineDropped extends Data.TaggedError("LineDropped")<Record<string, never>> {}

export class Line extends Context.Service<
  Line,
  {
    readonly hold: Effect.Effect<string, LineDropped>;
    readonly watch: Effect.Effect<string, LineDropped>;
  }
>()("flow-state-v3/src/host/cleanups.test/Line") {}

const hold = transaction({
  id: "Cleanups/hold",
  input: { line: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Line],
  commit: () => Effect.flatMap(Effect.service(Line), (line) => line.hold),
});

const watch = resource({
  id: "Cleanups/watch",
  input: { line: Schema.String },
  key: ["line"],
  services: [Line],
  staleTime: 0,
  gcTime: 0,
  lookup: () => Effect.flatMap(Effect.service(Line), (line) => line.watch),
});

const Phone = definition({
  id: "Cleanups/Phone",
  states: ["IDLE"],
  events: { Dial: {}, Look: {} },
  internalEvents: {
    Held: {},
    Dropped: {},
    HoldUnsure: Flow.uncertain({}),
    Seen: {},
    Unseen: {},
  },
  operations: ({ E }) => ({
    hold: hold.outcomes({
      success: E.Held,
      failure: { LineDropped: E.Dropped },
      unknown: E.HoldUnsure,
    }),
    watch: watch.outcomes({
      success: E.Seen,
      failure: { LineDropped: E.Unseen, Defect: E.Unseen },
    }),
  }),
});

const PhoneMachine = machine(Phone, ({ S, O }) => ({
  default: S.IDLE,
  on: {
    Dial: { actions: [O.hold.commit(() => ({ line: "one" }))] },
    Look: { actions: [O.watch.lookup(() => ({ line: "one" }))] },
    Held: {},
    Dropped: {},
    HoldUnsure: {},
    Seen: {},
    Unseen: {},
  },
}));

const Note = definition({
  id: "Cleanups/Note",
  persist: true,
  states: ["KEPT"],
  events: { Write: { text: Schema.String } },
  memory: { text: Flow.initial(Schema.String, "") },
});

const NoteMachine = machine(Note, ({ S }) => ({
  default: S.KEPT,
  on: { Write: { updateMemory: ({ event }) => ({ text: event.text }) } },
}));

const calls = app({ id: "cleanups", machines: { phone: PhoneMachine, note: NoteMachine } });

export const phone = actorRef(PhoneMachine, "home");

export const note = actorRef(NoteMachine, "today");

// An Effect that never ends on its own; once interrupted it runs `cleanup`.
export const hung = <E>(cleanup: Effect.Effect<void, E>) =>
  Effect.onInterrupt(Effect.never, () => cleanup);

// A line whose holds and watches hang, each running `cleanup` once interrupted.
export const lineWith = (cleanup: Effect.Effect<void, LineDropped>) =>
  Layer.succeed(Line, Line.of({ hold: hung(cleanup), watch: hung(cleanup) }));

export const quietLine = lineWith(Effect.void);

export type Tab = {
  readonly platform: Platform;
  readonly settle: () => void;
  readonly advance: (ms: number) => void;
};

// A tab whose host collects each Cause reported to it after the close stopped waiting.
export const reporting = <T extends Tab>(tab: T) => {
  // FLOW_STATE_ALLOW_UNKNOWN: a late cleanup fails with whatever it threw.
  const reports: Array<Cause.Cause<unknown>> = [];
  const host = Context.get(tab.platform, Host);

  return {
    ...tab,
    reports,
    platform: Context.add(
      tab.platform,
      Host,
      Host.of({ ...host, report: (cause) => void reports.push(cause) }),
    ),
  };
};

// A Runtime of the app over a tab, ready.
export const readyOver = (tab: Tab, services: Layer.Layer<Line>) => {
  const built = testing.build(
    { app: calls, services, scope: "test", persistence: { captureMs: 0 } },
    tab.platform,
  );

  Effect.runSync(built.runtime.ready());

  return built.runtime;
};

// A Runtime of the app over a tab, ready, with every Issue code it reported.
export const readyObserved = (tab: Tab, services: Layer.Layer<Line>) => {
  const issues: Array<string> = [];

  const built = buildRuntime(
    { app: calls, services, scope: "test", persistence: { captureMs: 0 } },
    tab.platform,
    (batch) => {
      for (const e of batch) if (Evidence.$is("Issue")(e)) issues.push(e.code);
    },
    Option.none(),
  );

  Effect.runSync(built.runtime.ready());

  return { runtime: built.runtime, issues };
};

// What a promise rejected with, or nothing when it resolved.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a promise rejected with.
export const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

// What a call threw, or nothing when it returned.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call threw.
export const thrownBy = (call: () => unknown) =>
  Result.match(Result.try({ try: call, catch: (e: unknown) => e }), {
    onSuccess: () => undefined,
    onFailure: (e) => e,
  });

// A FlowError's code and the Cause it keeps, or none for anything else.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call rejected or threw.
export const flowOf = (e: unknown) =>
  e instanceof FlowError && Cause.isCause(e.cause)
    ? Option.some({ code: e.code, cause: e.cause })
    : Option.none();

// Whether a Cause keeps a cleanup's own failure: its typed error or its defect, the same value.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it was given.
export const keeps = (cause: Cause.Cause<unknown>, failure: unknown) =>
  cause.reasons.some(
    (r) =>
      (Cause.isFailReason(r) && r.error === failure) ||
      (Cause.isDieReason(r) && r.defect === failure),
  );

export const died = new Error("the cleanup died");

export const lineDropped = new LineDropped({});
