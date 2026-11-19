import assert from "node:assert/strict";
import {
  Cause,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Result,
  Schema,
} from "effect";
import { describe, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  resource,
  RuntimeDefaults,
  transaction,
} from "../index.ts";
import { Host, type Platform, type Store, StoreRefused } from "./host.ts";
import type { Runtime } from "./runtime.ts";
import { platformOver, testing } from "./testing/seam.ts";

class LineDropped extends Data.TaggedError("LineDropped")<Record<string, never>> {}

class Line extends Context.Service<
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

const phone = actorRef(PhoneMachine, "home");

const note = actorRef(NoteMachine, "today");

// An Effect that never ends on its own; once interrupted it runs `cleanup`.
const hung = <E>(cleanup: Effect.Effect<void, E>) =>
  Effect.onInterrupt(Effect.never, () => cleanup);

// A line whose holds and watches hang, each running `cleanup` once interrupted.
const lineWith = (cleanup: Effect.Effect<void, LineDropped>) =>
  Layer.succeed(Line, Line.of({ hold: hung(cleanup), watch: hung(cleanup) }));

const quietLine = lineWith(Effect.void);

// A tab whose store writes never answer, each running `cleanup` once interrupted.
const hungStoreTab = (cleanup: Effect.Effect<void, StoreRefused>) => {
  const tab = platformOver(new Map(), 1);
  const host = Context.get(tab.platform, Host);

  const store: Store = {
    load: Effect.succeed(new Map<string, string>()),
    write: () => hung(cleanup),
  };

  return {
    ...tab,
    platform: Context.add(tab.platform, Host, Host.of({ ...host, store: Option.some(store) })),
  };
};

type Tab = {
  readonly platform: Platform;
  readonly settle: () => void;
  readonly advance: (ms: number) => void;
};

// A Runtime of the app over a tab, ready.
const readyOver = (tab: Tab, services: Layer.Layer<Line>) => {
  const built = testing.build(
    { app: calls, services, scope: "test", persistence: { captureMs: 0 } },
    tab.platform,
  );

  Effect.runSync(built.runtime.ready());

  return built.runtime;
};

// What a promise rejected with, or nothing when it resolved.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a promise rejected with.
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

// What a call threw, or nothing when it returned.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call threw.
const thrownBy = (call: () => unknown) =>
  Result.match(Result.try({ try: call, catch: (e: unknown) => e }), {
    onSuccess: () => undefined,
    onFailure: (e) => e,
  });

// A FlowError's code and the Cause it keeps, or none for anything else.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call rejected or threw.
const flowOf = (e: unknown) =>
  e instanceof FlowError && Cause.isCause(e.cause)
    ? Option.some({ code: e.code, cause: e.cause })
    : Option.none();

// Whether a Cause keeps a cleanup's own failure: its typed error or its defect, the same value.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it was given.
const keeps = (cause: Cause.Cause<unknown>, failure: unknown) =>
  cause.reasons.some(
    (r) =>
      (Cause.isFailReason(r) && r.error === failure) ||
      (Cause.isDieReason(r) && r.defect === failure),
  );

/**
 * How an interrupted fiber's cleanup ends: its Effect, given the typed error its kind fails with,
 * and the failure a report must keep, if any. Only a cleanup that dies or fails has failed; one that
 * is interrupted itself leaves a pure interrupt.
 */
type Outcome = {
  readonly name: string;
  readonly cleanup: <E>(error: E) => Effect.Effect<void, E>;
  readonly failure: <E>(error: E) => Option.Option<unknown>;
};

const died = new Error("the cleanup died");

const outcomes: ReadonlyArray<Outcome> = [
  { name: "succeeds", cleanup: () => Effect.void, failure: () => Option.none() },
  { name: "dies", cleanup: () => Effect.die(died), failure: () => Option.some(died) },
  { name: "fails with a typed error", cleanup: Effect.fail, failure: Option.some },
  { name: "is interrupted", cleanup: () => Effect.interrupt, failure: () => Option.none() },
];

const lineDropped = new LineDropped({});

const storeRefused = new StoreRefused({});

/**
 * A Runtime with one forked fiber of a kind on the wire, whose interrupt cleanup ends as the
 * outcome says, and the Promise of a runPromise when the fiber is one.
 */
type Started = {
  readonly tab: Tab;
  readonly runtime: Runtime;
  readonly ran: Option.Option<Promise<unknown>>;
  readonly failure: Option.Option<unknown>;
};

// Every kind of fiber the Runtime forks or releases with a cleanup at Runtime disposal. A services
// finalizer is typed never to fail, so it has no typed-failure cell.
const kinds: ReadonlyArray<{
  readonly name: string;
  readonly typed: boolean;
  readonly start: (outcome: Outcome) => Started;
}> = [
  {
    name: "a call",
    typed: true,
    start: (outcome) => {
      const tab = platformOver(new Map(), 1);
      const runtime = readyOver(tab, lineWith(outcome.cleanup(lineDropped)));
      runtime.ensureActor(phone).send({ _tag: "Dial" });
      tab.settle();

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(lineDropped) };
    },
  },
  {
    name: "a store write",
    typed: true,
    start: (outcome) => {
      const tab = hungStoreTab(outcome.cleanup(storeRefused));
      const runtime = readyOver(tab, quietLine);
      runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
      tab.settle();

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(storeRefused) };
    },
  },
  {
    name: "a read",
    typed: true,
    start: (outcome) => {
      const tab = platformOver(new Map(), 1);
      const runtime = readyOver(tab, lineWith(outcome.cleanup(lineDropped)));
      runtime.ensureActor(phone).send({ _tag: "Look" });
      tab.settle();

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(lineDropped) };
    },
  },
  {
    name: "a runPromise Effect",
    typed: true,
    start: (outcome) => {
      const tab = platformOver(new Map(), 1);
      const runtime = readyOver(tab, quietLine);
      const ran = rejection(runtime.runPromise(hung(outcome.cleanup(lineDropped))));
      tab.settle();

      return { tab, runtime, ran: Option.some(ran), failure: outcome.failure(lineDropped) };
    },
  },
  {
    name: "a services finalizer",
    typed: false,
    start: (outcome) => {
      const tab = platformOver(new Map(), 1);

      const runtime = readyOver(
        tab,
        Layer.merge(
          quietLine,
          Layer.effectDiscard(
            Effect.addFinalizer(() => Effect.orDie(outcome.cleanup(lineDropped))),
          ),
        ),
      );

      return { tab, runtime, ran: Option.none(), failure: outcome.failure(died) };
    },
  },
];

// A dispose run past the disposal's bound and then past the close's: what it ended with, if it did.
const disposedPastBounds = ({ tab, runtime }: Started) => {
  const disposing = Effect.runFork(runtime.dispose());
  tab.settle();
  tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));
  tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

  return Option.fromUndefinedOr(disposing.pollUnsafe());
};

// The red cells of this table before every interrupted fiber's Cause was judged by one rule.
const red = new Set([
  "a call fails with a typed error",
  "a store write fails with a typed error",
  "a read fails with a typed error",
  "a runPromise Effect fails with a typed error",
  "a services finalizer is interrupted",
  "actor disposal: a read fails with a typed error",
  "aborted: dies",
  "aborted: fails with a typed error",
]);

const cell = (name: string) => (red.has(name) ? it.fails : it);

describe("every forked fiber's interrupt cleanup at Runtime disposal (Actors R23, I33; Diagnostics R8)", () => {
  for (const kind of kinds)
    for (const outcome of outcomes.filter(
      (o) => kind.typed || o.name !== "fails with a typed error",
    ))
      cell(`${kind.name} ${outcome.name}`)(
        `Actors R23: ${kind.name} whose cleanup ${outcome.name} at Runtime disposal ${Option.isSome(outcome.failure(lineDropped)) ? "rejects dispose with CleanupFailed keeping its failure" : "leaves dispose a success"}`,
        async () => {
          const started = kind.start(outcome);
          const ended = disposedPastBounds(started);

          assert.ok(Option.isSome(ended), "the dispose ended within its bounds");

          Option.match(started.failure, {
            onNone: () => assert.ok(Exit.isSuccess(ended.value), "dispose succeeded"),
            onSome: (failure) => {
              assert.ok(Exit.isFailure(ended.value), "dispose rejected");

              const rejected = Option.flatMap(Cause.findErrorOption(ended.value.cause), (e) =>
                flowOf(e),
              );

              assert.deepStrictEqual(
                Option.map(rejected, (r) => r.code),
                Option.some("CleanupFailed"),
              );
              assert.ok(
                Option.exists(rejected, (r) => keeps(r.cause, failure)),
                "its Cause kept",
              );
            },
          });

          // A runPromise the close interrupted rejects RunFailed with its whole Cause, the
          // cleanup's failure included.
          for (const ran of Option.toArray(started.ran)) {
            const run = flowOf(await ran);

            assert.deepStrictEqual(
              Option.map(run, (r) => r.code),
              Option.some("RunFailed"),
            );

            for (const failure of Option.toArray(started.failure))
              assert.ok(
                Option.exists(run, (r) => keeps(r.cause, failure)),
                "RunFailed kept it",
              );
          }
        },
      );
});

describe("a read's interrupt cleanup at actor disposal (Actors R23)", () => {
  for (const outcome of outcomes)
    cell(`actor disposal: a read ${outcome.name}`)(
      `Actors R23: a read whose cleanup ${outcome.name} when its actor is disposed ${Option.isSome(outcome.failure(lineDropped)) ? "quarantines the ref: a later ensure throws CleanupFailed keeping its failure" : "leaves the ref free"}`,
      () => {
        const started = kinds[2]?.start(outcome);
        assert.ok(started !== undefined);
        started.runtime.disposeActor(phone);
        started.tab.settle();

        const thrown = thrownBy(() => started.runtime.ensureActor(phone));

        Option.match(started.failure, {
          onNone: () => assert.equal(thrown, undefined),
          onSome: (failure) => {
            const quarantined = flowOf(thrown);

            assert.deepStrictEqual(
              Option.map(quarantined, (r) => r.code),
              Option.some("CleanupFailed"),
            );

            assert.ok(
              Option.exists(quarantined, (r) => keeps(r.cause, failure)),
              "its Cause kept",
            );
          },
        });
      },
    );
});

describe("a runPromise Effect's interrupt cleanup when its signal aborts (Actors R27; Diagnostics R8)", () => {
  for (const outcome of outcomes)
    cell(`aborted: ${outcome.name}`)(
      `Actors R27: an aborted runPromise whose cleanup ${outcome.name} rejects RunFailed with its whole Cause: the interrupt${Option.isSome(outcome.failure(lineDropped)) ? " and the cleanup's failure" : " alone"}`,
      async () => {
        const tab = platformOver(new Map(), 1);
        const runtime = readyOver(tab, quietLine);
        const abort = new AbortController();

        const ran = rejection(
          runtime.runPromise(hung(outcome.cleanup(lineDropped)), { signal: abort.signal }),
        );

        tab.settle();
        abort.abort();
        tab.settle();

        const run = flowOf(await ran);

        assert.deepStrictEqual(
          Option.map(run, (r) => r.code),
          Option.some("RunFailed"),
        );
        assert.ok(
          Option.exists(run, (r) => Cause.hasInterrupts(r.cause)),
          "the interrupt kept",
        );

        Option.match(outcome.failure(lineDropped), {
          onNone: () =>
            assert.ok(
              Option.exists(run, (r) => Cause.hasInterruptsOnly(r.cause)),
              "nothing else",
            ),
          onSome: (failure) =>
            assert.ok(
              Option.exists(run, (r) => keeps(r.cause, failure)),
              "the failure kept",
            ),
        });
      },
    );
});
