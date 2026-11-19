import assert from "node:assert/strict";
import {
  Cause,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Predicate,
  Brand,
  Result,
  Schema,
  Scope,
} from "effect";
import { describe, it } from "vite-plus/test";
import { Evidence } from "../core/evidence.ts";
import type { TicketId } from "../core/world.ts";
import { makeEdge } from "./edge.ts";
import { makeOwner } from "./owners/owners.ts";
import { buildRuntime } from "./runtime.ts";
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

  return reporting({
    ...tab,
    platform: Context.add(tab.platform, Host, Host.of({ ...host, store: Option.some(store) })),
  });
};

type Tab = {
  readonly platform: Platform;
  readonly settle: () => void;
  readonly advance: (ms: number) => void;
};

// A tab whose host collects each Cause reported to it after the close stopped waiting.
const reporting = <T extends Tab>(tab: T) => {
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
  // FLOW_STATE_ALLOW_UNKNOWN: a late cleanup fails with whatever it threw.
  readonly tab: Tab & { readonly reports: ReadonlyArray<Cause.Cause<unknown>> };
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
      const tab = reporting(platformOver(new Map(), 1));
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
      const tab = reporting(platformOver(new Map(), 1));
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
      const tab = reporting(platformOver(new Map(), 1));
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
      const tab = reporting(platformOver(new Map(), 1));

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

describe("every forked fiber's interrupt cleanup at Runtime disposal (Actors R23, I33; Diagnostics R8)", () => {
  for (const kind of kinds)
    for (const outcome of outcomes.filter(
      (o) => kind.typed || o.name !== "fails with a typed error",
    ))
      it(`Actors R23: ${kind.name} whose cleanup ${outcome.name} at Runtime disposal ${Option.isSome(outcome.failure(lineDropped)) ? "rejects dispose with CleanupFailed keeping its failure" : "leaves dispose a success"}`, async () => {
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
      });
});

describe("a read's interrupt cleanup at actor disposal (Actors R23)", () => {
  for (const outcome of outcomes)
    it(`Actors R23: a read whose cleanup ${outcome.name} when its actor is disposed ${Option.isSome(outcome.failure(lineDropped)) ? "quarantines the ref: a later ensure throws CleanupFailed keeping its failure" : "leaves the ref free"}`, () => {
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
    });
});

describe("a runPromise Effect's interrupt cleanup when its signal aborts (Actors R27; Diagnostics R8)", () => {
  for (const outcome of outcomes)
    it(`Actors R27: an aborted runPromise whose cleanup ${outcome.name} rejects RunFailed with its whole Cause: the interrupt${Option.isSome(outcome.failure(lineDropped)) ? " and the cleanup's failure" : " alone"}`, async () => {
      const tab = reporting(platformOver(new Map(), 1));
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
    });
});

const BOUND = Duration.toMillis(RuntimeDefaults.disposalBound);

const late = new Error("the cleanup ended late");

// A cleanup that waits until the test opens its gate, then dies.
// RETURN_TYPE: the Outcome contract keeps its generic cleanup.
const hangsUntil = (gate: Deferred.Deferred<void>): Outcome => ({
  name: "hangs",
  cleanup: () => Effect.andThen(Deferred.await(gate), Effect.die(late)),
  failure: () => Option.some(late),
});

// Whether a Cause holds the close's own failure for a cleanup it stopped waiting for.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it was given.
const overdue = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some((r) => Cause.isFailReason(r) && Predicate.isTagged(r.error, "CleanupOverdue"));

describe("a cleanup that outlives the close's bound (Actors R22, R23)", () => {
  for (const kind of kinds)
    it(`Actors R22, R23: ${kind.name} whose cleanup hangs past the bound rejects dispose with CleanupOverdue, and its late failure goes to the host's report once`, () => {
      const gate = Deferred.makeUnsafe<void>();
      const started = kind.start(hangsUntil(gate));
      const ended = disposedPastBounds(started);

      assert.ok(Option.isSome(ended), "the dispose ended within its bounds");
      assert.ok(Exit.isFailure(ended.value), "dispose rejected");

      const rejected = Option.flatMap(Cause.findErrorOption(ended.value.cause), (e) => flowOf(e));

      assert.deepStrictEqual(
        Option.map(rejected, (r) => r.code),
        Option.some("CleanupFailed"),
      );
      assert.ok(
        Option.exists(rejected, (r) => overdue(r.cause)),
        "CleanupOverdue kept",
      );
      assert.equal(started.tab.reports.length, 0, "nothing reported before the cleanup ends");

      Deferred.doneUnsafe(gate, Exit.void);
      started.tab.settle();

      assert.equal(started.tab.reports.length, 1, "one late report");
      assert.ok(
        started.tab.reports.every((cause) => keeps(cause, late)),
        "the late failure kept",
      );
    });
});

describe("an ended actor's cleanup that outlives the Runtime's close (Actors R23)", () => {
  it("Actors R23: a read whose cleanup fails only after dispose stopped waiting goes to the host's report, as no ensure can hear it", () => {
    const gate = Deferred.makeUnsafe<void>();
    const tab = reporting(platformOver(new Map(), 1));

    const runtime = readyOver(
      tab,
      lineWith(Effect.andThen(Deferred.await(gate), Effect.die(late))),
    );

    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();
    tab.advance(BOUND);
    tab.settle();

    assert.ok(
      Option.exists(Option.fromUndefinedOr(disposing.pollUnsafe()), Exit.isFailure),
      "dispose rejected CleanupOverdue",
    );

    Deferred.doneUnsafe(gate, Exit.void);
    tab.settle();

    assert.equal(tab.reports.length, 1, "one late report");
    assert.ok(tab.reports.every((cause) => keeps(cause, late)));
  });
});

// A Runtime of the app over a tab, ready, with every Issue code it reported.
const readyObserved = (tab: Tab, services: Layer.Layer<Line>) => {
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

describe("a read cancelled while its actor lives (Actors R23)", () => {
  it("Actors R23: a read replaced while open whose cleanup dies is an Issue CleanupFailed at once, and quarantines the ref when its actor ends", () => {
    const tab = platformOver(new Map(), 1);
    const { runtime, issues } = readyObserved(tab, lineWith(Effect.die(died)));
    const handle = runtime.ensureActor(phone);
    handle.send({ _tag: "Look" });
    tab.settle();
    handle.send({ _tag: "Look" });
    tab.settle();

    assert.deepStrictEqual(issues, ["CleanupFailed"]);
    assert.equal(
      thrownBy(() => runtime.ensureActor(phone)),
      undefined,
      "the live ref is not refused",
    );

    runtime.disposeActor(phone);
    tab.settle();

    const quarantined = flowOf(thrownBy(() => runtime.ensureActor(phone)));

    assert.deepStrictEqual(
      Option.map(quarantined, (r) => r.code),
      Option.some("CleanupFailed"),
    );
    assert.ok(
      Option.exists(quarantined, (r) => keeps(r.cause, died)),
      "its Cause kept",
    );
  });
});

const ticket = Brand.nominal<TicketId>();

// The CleanupFailed a dispose rejected with, keeping the cleanup's own failure, if it did.
const disposeHeard = (runtime: Runtime, tab: Tab) => {
  const disposing = Effect.runFork(runtime.dispose());
  tab.settle();

  return Option.flatMap(Option.fromUndefinedOr(disposing.pollUnsafe()), (exit) =>
    Exit.isFailure(exit)
      ? Option.flatMap(Cause.findErrorOption(exit.cause), (e) => flowOf(e))
      : Option.none(),
  );
};

describe("a quarantine no ensure reported (Actors R23)", () => {
  it("Actors R23: an actor disposed while its read is out, whose cleanup dies, and never ensured again: dispose rejects CleanupFailed keeping its failure", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();

    const heard = disposeHeard(runtime, tab);

    assert.deepStrictEqual(
      Option.map(heard, (r) => r.code),
      Option.some("CleanupFailed"),
    );
    assert.ok(
      Option.exists(heard, (r) => keeps(r.cause, died)),
      "its Cause kept",
    );
  });

  it("Actors R23: a quarantine lifted by disposeActor before any ensure reported it goes to dispose's CleanupFailed", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();
    runtime.disposeActor(phone);

    assert.equal(
      thrownBy(() => runtime.ensureActor(phone)),
      undefined,
      "the lift frees the ref",
    );
    assert.ok(
      Option.exists(disposeHeard(runtime, tab), (r) => keeps(r.cause, died)),
      "dispose heard the lifted failure",
    );
  });

  it("Actors R23: a quarantine an ensure reported is not reported again at dispose", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab, lineWith(Effect.die(died)));
    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    tab.settle();
    assert.deepStrictEqual(
      Option.map(flowOf(thrownBy(() => runtime.ensureActor(phone))), (r) => r.code),
      Option.some("CleanupFailed"),
      "an ensure reported it",
    );

    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();

    assert.ok(
      Option.exists(Option.fromUndefinedOr(disposing.pollUnsafe()), Exit.isSuccess),
      "dispose settled with a success",
    );
  });
});

describe("a store write interrupted at the close (Restore R10, Actors R23)", () => {
  it("Actors R23: a store write whose interrupt cleanup dies is never answered as refused, so no lane hears that a write which may have landed was not sent", () => {
    const tab = hungStoreTab(Effect.die(died));

    // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the test owns the edge's Scope, which its Owner closes
    const work = makeOwner(
      Scope.makeUnsafe(),
      () => tab.platform,
      () => undefined,
      "work",
      Option.none(),
    );

    const answers: Array<boolean> = [];
    // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
    const heard: Array<Cause.Cause<unknown>> = [];

    const edge = makeEdge(tab.platform, work, {
      captureMs: 0,
      capture: () => undefined,
      answered: (_, landed) => void answers.push(landed),
    });

    edge.write(
      [{ key: "k", record: Option.some("v") }],
      new Map(),
      [{ id: ticket("t1"), purpose: "flush" }],
      [],
    );
    tab.settle();
    work.stop((found) => void heard.push(...found));
    tab.settle();

    assert.deepStrictEqual(answers, []);
    assert.ok(
      heard.length === 1 && heard.every((cause) => keeps(cause, died)),
      "its closer heard the cleanup's failure",
    );
  });
});

describe("dispose and forget (Actors R20, R22, R23)", () => {
  it("Actors R20: a dispose({ forget: true }) whose caller is interrupted mid-close still deletes the scope's records", async () => {
    const store = new Map<string, string>();
    const tab = platformOver(store, 1);
    const runtime = readyOver(tab, quietLine);
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    runtime.ensureActor(phone).send({ _tag: "Dial" });
    tab.settle();

    assert.ok(store.size > 0, "the note landed");

    const caller = Effect.runFork(runtime.dispose({ forget: true }));
    tab.settle();

    assert.equal(caller.pollUnsafe(), undefined, "the close still waits for the call");

    caller.interruptUnsafe();
    await Effect.runPromise(Effect.yieldNow);
    tab.advance(BOUND);
    tab.advance(BOUND);
    tab.settle();
    await Effect.runPromise(Effect.yieldNow);

    assert.equal(store.size, 0);
  });

  it("Actors R20, R23: dispose() twice shares one result, and dispose() then dispose({ forget: true }) runs the forget", async () => {
    const store = new Map<string, string>();
    const tab = platformOver(store, 1);
    const runtime = readyOver(tab, quietLine);
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    tab.settle();

    const first = Effect.runFork(runtime.dispose());
    const second = Effect.runFork(runtime.dispose());
    const forgetting = Effect.runFork(runtime.dispose({ forget: true }));
    tab.settle();

    for (const fiber of [first, second, forgetting])
      assert.ok(Exit.isSuccess(await Effect.runPromise(Fiber.await(fiber))));

    assert.equal(store.size, 0);
  });

  it("Actors R22: disposeActor then dispose() releases the services only after the actor's reads have ended", () => {
    const tab = platformOver(new Map(), 1);
    const order: Array<string> = [];
    const gate = Deferred.makeUnsafe<void>();

    const runtime = readyOver(
      tab,
      Layer.merge(
        lineWith(
          Effect.andThen(
            Deferred.await(gate),
            Effect.sync(() => void order.push("read ended")),
          ),
        ),
        Layer.effectDiscard(
          Effect.addFinalizer(() => Effect.sync(() => void order.push("services released"))),
        ),
      ),
    );

    runtime.ensureActor(phone).send({ _tag: "Look" });
    tab.settle();
    runtime.disposeActor(phone);
    const disposing = Effect.runFork(runtime.dispose());
    tab.settle();

    assert.deepStrictEqual(order, [], "the services wait while the read's cleanup runs");

    Deferred.doneUnsafe(gate, Exit.void);
    tab.settle();

    assert.ok(Exit.isSuccess(Option.getOrThrow(Option.fromUndefinedOr(disposing.pollUnsafe()))));
    assert.deepStrictEqual(order, ["read ended", "services released"]);
  });
});
