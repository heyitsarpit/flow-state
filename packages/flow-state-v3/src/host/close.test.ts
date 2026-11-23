import assert from "node:assert/strict";
import { Cause, Context, Duration, Effect, Exit, Layer, Option, Result, Schema } from "effect";
import { describe, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  Outcome,
  resource,
  RuntimeDefaults,
  runtimeSetup,
  transaction,
} from "../index.ts";
import type { Platform } from "./host.ts";
import { Store } from "./store.ts";
import type { Runtime } from "./runtime.ts";
import { platformOver, testing } from "./testing/seam.ts";

class Bell extends Context.Service<
  Bell,
  { readonly ring: (tone: string) => Effect.Effect<string> }
>()("flow-state-v3/src/host/close.test/Bell") {}

const ring = transaction({
  id: "Test/ring",
  input: { tone: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Bell],
  commit: (input) =>
    Effect.flatMap(Effect.service(Bell), (bell) => bell.ring(input.tone)).pipe(
      Effect.catch((e) => Outcome.unknown(e)),
    ),
});

const Door = definition({
  id: "Test/Door",
  states: ["SHUT"],
  events: { Ring: { tone: Schema.String } },
  internalEvents: { Rang: {}, RingUnsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    ring: ring.outcomes({ success: E.Rang, failure: {}, unknown: E.RingUnsure }),
  }),
});

const DoorMachine = machine(Door, ({ S, O }) => ({
  default: S.SHUT,
  on: {
    Ring: {
      actions: [
        O.ring.commit(({ event }) => ({
          tone: event.tone,
        })),
      ],
    },
    Rang: {},
    RingUnsure: {},
  },
}));

const Note = definition({
  id: "Test/Note",
  persist: true,
  states: ["KEPT"],
  events: { Write: { text: Schema.String } },
  memory: { text: Flow.initial(Schema.String, "") },
});

const NoteMachine = machine(Note, ({ S }) => ({
  default: S.KEPT,
  on: { Write: { updateMemory: ({ event }) => ({ text: event.text }) } },
}));

const notes = app({ id: "notes", machines: { door: DoorMachine, note: NoteMachine } });

const front = actorRef(DoorMachine, "front");

const note = actorRef(NoteMachine, "today");

const bell = Layer.succeed(Bell, Bell.of({ ring: (tone) => Effect.succeed(tone) }));

// The bell's line, which fails to close when the services are released.
const brokenLine = Layer.merge(
  bell,
  Layer.effectDiscard(Effect.addFinalizer(() => Effect.die("the bell's line did not close"))),
);

// A FlowError's code, or none for anything else.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call rejected or failed with.
const codeOf = (e: unknown) => (e instanceof FlowError ? Option.some(e.code) : Option.none());

// The whole Cause a FlowError keeps, printed.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a call rejected or failed with.
const causeOf = (e: unknown) =>
  e instanceof FlowError && Cause.isCause(e.cause) ? Cause.pretty(e.cause) : "";

// A tab whose store writes never answer, and whose interrupted write's cleanup dies with `cleanup`.
const brokenStoreTab = (cleanup: string) => {
  const tab = platformOver(new Map(), 1);

  const store: Store["Service"] = {
    load: Effect.succeed(new Map<string, string>()),
    write: () => Effect.onInterrupt(Effect.never, () => Effect.die(cleanup)),
  };

  return {
    ...tab,
    platform: Context.add(tab.platform, Store, store),
  };
};

// A Runtime of the notes app over a tab, ready.
const readyOver = (platform: Platform, services: Layer.Layer<Bell>) => {
  const built = testing.build(
    { app: notes, services, scope: "test", persistence: { captureMs: 0 } },
    platform,
  );

  Effect.runSync(built.runtime.ready());

  return built.runtime;
};

// A bell whose ring never answers; `hangUp` is what an interrupted ring runs.
const ringingBell = (hangUp: Effect.Effect<void>) =>
  Layer.succeed(Bell, Bell.of({ ring: () => Effect.onInterrupt(Effect.never, () => hangUp) }));

// A dispose run past the disposal's bound and then past the close's: what it ended with, if it did.
const disposedPastBounds = (
  tab: { readonly settle: () => void; readonly advance: (ms: number) => void },
  runtime: Runtime,
  options: { readonly forget: boolean } = { forget: false },
) => {
  const disposing = Effect.runFork(runtime.dispose(options));
  tab.settle();
  tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));
  tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

  return Option.fromUndefinedOr(disposing.pollUnsafe());
};

// The codes of every FlowError a dispose's Cause keeps, in order.
const codesIn = (exit: Option.Option<Exit.Exit<void, FlowError>>) =>
  Option.match(exit, {
    onNone: () => ["still running"],
    onSome: (ended) =>
      Exit.isSuccess(ended)
        ? []
        : ended.cause.reasons.flatMap((r) => (Cause.isFailReason(r) ? [r.error.code] : [])),
  });

// The whole Cause of a dispose's first FlowError, printed.
const firstCauseIn = (exit: Option.Option<Exit.Exit<void, FlowError>>) =>
  Option.match(Option.filter(exit, Exit.isFailure), {
    onNone: () => "",
    onSome: (ended) => causeOf(Option.getOrUndefined(Cause.findErrorOption(ended.cause))),
  });

describe("a cleanup outside a call that fails at the close (Actors R23, I33)", () => {
  it("Actors R23, I33: a store write cut at the bound whose interrupt cleanup dies rejects dispose with CleanupFailed keeping its Cause, and a second dispose shares it", () => {
    const tab = brokenStoreTab("the store's transaction did not abort");
    const runtime = readyOver(tab.platform, bell);
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    tab.settle();

    const first = disposedPastBounds(tab, runtime);
    const second = disposedPastBounds(tab, runtime);

    for (const ended of [first, second]) {
      assert.deepStrictEqual(codesIn(ended), ["CleanupFailed"]);
      assert.ok(firstCauseIn(ended).includes("the store's transaction did not abort"));
    }
  });

  it("Actors R23, I33: every forked fiber whose interrupt cleanup dies at the close is in CleanupFailed: a call's and a store write's, each Cause kept", () => {
    const tab = brokenStoreTab("the store's transaction did not abort");
    const runtime = readyOver(tab.platform, ringingBell(Effect.die("the bell did not hang up")));
    runtime.ensureActor(front).send({ _tag: "Ring", tone: "ding" });
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    tab.settle();

    const ended = disposedPastBounds(tab, runtime);

    assert.deepStrictEqual(codesIn(ended), ["CleanupFailed"]);
    assert.ok(firstCauseIn(ended).includes("the store's transaction did not abort"));
    assert.ok(firstCauseIn(ended).includes("the bell did not hang up"));
  });

  it("Actors R23, Restore R10: dispose({ forget: true }) that fails CleanupFailed keeps the forget's StorageFailure beside it", () => {
    const tab = platformOver(new Map(), 1, true);
    const runtime = readyOver(tab.platform, brokenLine);
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    tab.settle();

    assert.deepStrictEqual(codesIn(disposedPastBounds(tab, runtime, { forget: true })), [
      "CleanupFailed",
      "StorageFailure",
    ]);
  });
});

describe("a cleanup that does not end (Actors R22, R23)", () => {
  it("Actors R22, Operations R8 (Releases): a call that cannot be interrupted is waited for no longer than the bound; dispose rejects ReleaseOverdue", () => {
    const tab = platformOver(new Map(), 1);

    const stuck = Layer.succeed(
      Bell,
      Bell.of({ ring: () => Effect.uninterruptible(Effect.never) }),
    );

    const runtime = readyOver(tab.platform, stuck);
    runtime.ensureActor(front).send({ _tag: "Ring", tone: "ding" });
    tab.settle();

    assert.deepStrictEqual(codesIn(disposedPastBounds(tab, runtime)), ["ReleaseOverdue"]);
  });

  it("Actors R22, Operations R8 (Releases): an interrupt cleanup that never ends is waited for no longer than the bound; dispose rejects ReleaseOverdue", () => {
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab.platform, ringingBell(Effect.never));
    runtime.ensureActor(front).send({ _tag: "Ring", tone: "ding" });
    tab.settle();

    assert.deepStrictEqual(codesIn(disposedPastBounds(tab, runtime)), ["ReleaseOverdue"]);
  });

  it("Actors R23, Restore R10: a forget after a work close past its bound fails StorageFailure beside ReleaseOverdue and deletes nothing", () => {
    const store = new Map<string, string>();
    const tab = platformOver(store, 1);
    const runtime = readyOver(tab.platform, ringingBell(Effect.never));
    runtime.ensureActor(note).send({ _tag: "Write", text: "milk" });
    runtime.ensureActor(front).send({ _tag: "Ring", tone: "ding" });
    tab.settle();
    const kept = new Map(store);

    assert.ok(kept.size > 0, "the note landed");

    assert.deepStrictEqual(codesIn(disposedPastBounds(tab, runtime, { forget: true })), [
      "ReleaseOverdue",
      "StorageFailure",
    ]);

    assert.deepStrictEqual(store, kept);
  });

  it("Actors R22, Operations R8 (Releases): a services finalizer that never ends is waited for no longer than the bound; dispose rejects ReleaseOverdue", () => {
    const tab = platformOver(new Map(), 1);

    const hungLine = Layer.merge(
      bell,
      Layer.effectDiscard(Effect.addFinalizer(() => Effect.never)),
    );

    const runtime = readyOver(tab.platform, hungLine);

    assert.deepStrictEqual(codesIn(disposedPastBounds(tab, runtime)), ["ReleaseOverdue"]);
  });
});

// What a promise rejected with.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a promise rejected with.
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

describe("runPromise while the Runtime disposes (Actors R22, R27)", () => {
  it("Actors R22, R27: runPromise while the disposal waits for a call rejects RuntimeDisposed, and runs nothing", async () => {
    const rings: Array<string> = [];
    const tab = platformOver(new Map(), 1);
    const runtime = readyOver(tab.platform, ringingBell(Effect.void));
    runtime.ensureActor(front).send({ _tag: "Ring", tone: "ding" });
    tab.settle();
    Effect.runFork(runtime.dispose());
    tab.settle();

    const refused = await rejection(runtime.runPromise(Effect.sync(() => rings.push("dong"))));

    assert.deepStrictEqual(codeOf(refused), Option.some("RuntimeDisposed"));
    assert.deepStrictEqual(rings, []);
  });
});

// An intent-status read that never answers, whose interrupt cleanup is `cleanup`.
const statusOf = (cleanup: Effect.Effect<void>) =>
  resource({
    id: "Test/status",
    input: { intent: Schema.String },
    key: ["intent"],
    services: [],
    staleTime: 0,
    gcTime: 0,
    lookup: () => Effect.onInterrupt(Effect.never, () => cleanup),
  });

const watchingOver = (cleanup: Effect.Effect<void>) => {
  const status = statusOf(cleanup);

  const Watch = definition({
    id: "Test/Watch",
    states: ["OPEN"],
    events: { Look: {} },
    internalEvents: { Seen: {}, Unseen: {} },
    memory: {},
    operations: ({ E }) => ({
      status: status.outcomes({ success: E.Seen, failure: { Defect: E.Unseen } }),
    }),
  });

  const WatchMachine = machine(Watch, ({ S, O }) => ({
    default: S.OPEN,
    on: {
      Look: { actions: [O.status.lookup(() => ({ intent: "pi1" }))] },
      Seen: {},
      Unseen: {},
    },
  }));

  const runtime = runtimeSetup({
    app: app({ id: "watch", machines: { watch: WatchMachine } }),
  }).construct();

  Effect.runSync(runtime.ready());

  return { runtime, watch: actorRef(WatchMachine, "pi1") };
};

// Lets the host's queued tasks run, so a forked read starts and an interrupted one's exit is seen.
const tick = () => Effect.runPromise(Effect.yieldNow);

// What an ensure threw, or nothing when it returned a handle.
// FLOW_STATE_ALLOW_UNKNOWN: whatever an ensure threw.
const ensureThrown = (ensure: () => unknown) =>
  Result.match(Result.try({ try: ensure, catch: (e: unknown) => e }), {
    onSuccess: () => undefined,
    onFailure: (e) => e,
  });

describe("a ref whose ended actor's cleanup failed (Actors R23)", () => {
  // Operations, Releases: a read's request is its entry's, in the Runtime's work, so its released
  // call's failed cleanup is the Runtime's to report; no ref is quarantined for it.
  it("Operations, Releases: an actor disposed while its read is out, whose cleanup dies, leaves its ref free: later ensures run", async () => {
    const { runtime, watch } = watchingOver(Effect.die("the status stream did not close"));
    runtime.ensureActor(watch).send({ _tag: "Look" });
    await tick();
    runtime.disposeActor(watch);
    await tick();

    for (const thrown of [
      ensureThrown(() => runtime.ensureActor(watch)),
      ensureThrown(() => runtime.ensureActor(watch)),
    ])
      assert.equal(thrown, undefined);
  });

  it("Operations, Releases: a cleanup that dies only after the ref was ensured again leaves it free", async () => {
    const { runtime, watch } = watchingOver(
      Effect.andThen(Effect.yieldNow, Effect.die("the status stream did not close")),
    );

    runtime.ensureActor(watch).send({ _tag: "Look" });
    await tick();
    runtime.disposeActor(watch);
    runtime.ensureActor(watch);
    await tick();
    await tick();

    assert.equal(
      ensureThrown(() => runtime.ensureActor(watch)),
      undefined,
    );
  });

  it("Actors R23: a disposeActor of the quarantined ref lifts the quarantine, so the next ensure starts it", async () => {
    const { runtime, watch } = watchingOver(Effect.die("the status stream did not close"));
    runtime.ensureActor(watch).send({ _tag: "Look" });
    await tick();
    runtime.disposeActor(watch);
    await tick();
    runtime.disposeActor(watch);

    assert.equal(
      ensureThrown(() => runtime.ensureActor(watch)),
      undefined,
    );
  });

  it("Actors R23: a read whose cleanup succeeds leaves the ref free", async () => {
    const { runtime, watch } = watchingOver(Effect.void);
    runtime.ensureActor(watch).send({ _tag: "Look" });
    await tick();
    runtime.disposeActor(watch);
    await tick();

    assert.equal(
      ensureThrown(() => runtime.ensureActor(watch)),
      undefined,
    );
  });
});
