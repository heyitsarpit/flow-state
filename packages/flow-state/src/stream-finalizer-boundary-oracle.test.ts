import { Deferred, Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { createRuntimeBackedTestHarness } from "./testing/runtime-backed-test-harness.js";

type Boundary = "dispose" | "state-exit" | "stop";
type Surface = "rehydrated-harness" | "runtime-actor";

type CaseDef = Readonly<{
  readonly actorId: string;
  readonly boundary: Boundary;
  readonly surface: Surface;
}>;

type TrackedFinalizer = ReturnType<typeof createTrackedFinalizer>;

const cases = [
  {
    actorId: "stream-finalizer-runtime-state-exit",
    boundary: "state-exit",
    surface: "runtime-actor",
  },
  {
    actorId: "stream-finalizer-runtime-stop",
    boundary: "stop",
    surface: "runtime-actor",
  },
  {
    actorId: "stream-finalizer-runtime-dispose",
    boundary: "dispose",
    surface: "runtime-actor",
  },
  {
    actorId: "stream-finalizer-harness-state-exit",
    boundary: "state-exit",
    surface: "rehydrated-harness",
  },
  {
    actorId: "stream-finalizer-harness-stop",
    boundary: "stop",
    surface: "rehydrated-harness",
  },
  {
    actorId: "stream-finalizer-harness-dispose",
    boundary: "dispose",
    surface: "rehydrated-harness",
  },
] as const satisfies ReadonlyArray<CaseDef>;

function createTrackedFinalizer() {
  const acquired = Effect.runSync(Deferred.make<void>());
  const started = Effect.runSync(Deferred.make<void>());
  const released = Effect.runSync(Deferred.make<void>());
  let completionCount = 0;

  return {
    stream: Stream.callback<never, never>(() =>
      Effect.gen(function* () {
        yield* Deferred.succeed(acquired, undefined);
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(released);
            yield* Effect.sync(() => {
              completionCount += 1;
            });
          }),
        );
      }),
    ),
    acquired: Effect.runPromise(Deferred.await(acquired)),
    started: Effect.runPromise(Deferred.await(started)),
    release: () => {
      Effect.runSync(Deferred.succeed(released, undefined));
    },
    completionCount: () => completionCount,
  } as const;
}

function createBoundaryFixture(actorId: string) {
  const finalizers: Array<TrackedFinalizer> = [];
  const machine = flow.machine<
    {},
    Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STOP" }>,
    "idle" | "streaming"
  >({
    id: `stream.finalizer.boundary.${actorId}`,
    initial: "idle",
    context: () => ({}),
    states: {
      idle: {
        on: {
          START: "streaming",
        },
      },
      streaming: {
        invoke: flow.stream({
          id: "Boundary.stream",
          subscribe: () => {
            const finalizer = createTrackedFinalizer();
            finalizers.push(finalizer);
            return finalizer.stream;
          },
        }),
        on: {
          STOP: "idle",
        },
      },
    },
  });

  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`StreamFinalizerBoundary${actorId}`, {
            machines: {
              actor: machine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
  );
  const actor = runtime.orchestrators.start(machine, {
    id: actorId,
    policy: "keep-alive",
  });
  const harness = createRuntimeBackedTestHarness(runtime, actor);

  return {
    actor,
    finalizers,
    harness,
    runtime,
    streamId: "Boundary.stream",
  } as const;
}

function snapshotOf(
  surface: CaseDef["surface"],
  fixture: ReturnType<typeof createBoundaryFixture>,
) {
  return surface === "runtime-actor" ? fixture.actor.getSnapshot() : fixture.harness.getSnapshot();
}

function receiptsOf(
  surface: CaseDef["surface"],
  fixture: ReturnType<typeof createBoundaryFixture>,
) {
  return surface === "runtime-actor" ? fixture.actor.receipts() : fixture.harness.receipts();
}

function issuesOf(surface: CaseDef["surface"], fixture: ReturnType<typeof createBoundaryFixture>) {
  return surface === "runtime-actor" ? fixture.actor.issues() : fixture.harness.issues();
}

async function flushSurface(
  surface: CaseDef["surface"],
  fixture: ReturnType<typeof createBoundaryFixture>,
) {
  if (surface === "runtime-actor") {
    await fixture.actor.flush();
    return;
  }

  await fixture.harness.flush();
}

function sendSurface(
  surface: CaseDef["surface"],
  fixture: ReturnType<typeof createBoundaryFixture>,
  event: Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STOP" }>,
) {
  if (surface === "runtime-actor") {
    fixture.actor.send(event);
    return;
  }

  fixture.harness.send(event);
}

async function disposeFixture(fixture: ReturnType<typeof createBoundaryFixture>) {
  const releases = fixture.finalizers.map((finalizer) => () => finalizer.release());
  for (const release of releases) {
    release();
  }
  await fixture.runtime.dispose();
}

async function expectStateExitBoundary(caseDef: CaseDef) {
  const fixture = createBoundaryFixture(caseDef.actorId);

  try {
    sendSurface(caseDef.surface, fixture, { type: "START" });
    await flushSurface(caseDef.surface, fixture);
    await fixture.finalizers[0]!.acquired;

    expect(snapshotOf(caseDef.surface, fixture).streams[fixture.streamId]).toMatchObject({
      status: "running",
      generation: 1,
      emitted: 0,
    });

    sendSurface(caseDef.surface, fixture, { type: "STOP" });
    await flushSurface(caseDef.surface, fixture);
    await fixture.finalizers[0]!.started;

    expect(snapshotOf(caseDef.surface, fixture).value).toBe("idle");
    expect(snapshotOf(caseDef.surface, fixture).streams[fixture.streamId]).toMatchObject({
      status: "interrupt",
      generation: 1,
      emitted: 0,
    });
    expect(
      receiptsOf(caseDef.surface, fixture).filter(
        (receipt) =>
          receipt.id === fixture.streamId &&
          receipt.type === "stream:interrupt" &&
          receipt.interruptReason === "state-exit",
      ),
    ).toHaveLength(1);
    expect(issuesOf(caseDef.surface, fixture)).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: fixture.streamId,
      }),
    ]);

    sendSurface(caseDef.surface, fixture, { type: "START" });
    await flushSurface(caseDef.surface, fixture);
    await fixture.finalizers[1]!.acquired;

    expect(snapshotOf(caseDef.surface, fixture).value).toBe("streaming");
    expect(snapshotOf(caseDef.surface, fixture).streams[fixture.streamId]).toMatchObject({
      status: "running",
      generation: 2,
      emitted: 0,
    });
    expect(fixture.finalizers[0]!.completionCount()).toBe(0);

    const receiptsBeforeRelease = receiptsOf(caseDef.surface, fixture);
    fixture.finalizers[0]!.release();
    await Promise.resolve();
    await flushSurface(caseDef.surface, fixture);

    expect(fixture.finalizers[0]!.completionCount()).toBe(1);
    expect(snapshotOf(caseDef.surface, fixture).streams[fixture.streamId]).toMatchObject({
      status: "running",
      generation: 2,
      emitted: 0,
    });
    expect(receiptsOf(caseDef.surface, fixture)).toEqual(receiptsBeforeRelease);
  } finally {
    await disposeFixture(fixture);
  }
}

async function expectDisposeBoundary(caseDef: CaseDef) {
  const fixture = createBoundaryFixture(caseDef.actorId);

  try {
    sendSurface(caseDef.surface, fixture, { type: "START" });
    await flushSurface(caseDef.surface, fixture);
    await fixture.finalizers[0]!.acquired;

    const boundary =
      caseDef.boundary === "stop"
        ? caseDef.surface === "runtime-actor"
          ? fixture.runtime.orchestrators.stop(fixture.actor.id)
          : fixture.harness.runtime.orchestrators.stop(fixture.harness.actor.id)
        : caseDef.surface === "runtime-actor"
          ? fixture.runtime.dispose()
          : fixture.harness.dispose();
    let resolved = false;
    void boundary.then(() => {
      resolved = true;
    });

    await fixture.finalizers[0]!.started;
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(snapshotOf(caseDef.surface, fixture).streams[fixture.streamId]).toMatchObject({
      status: "interrupt",
      generation: 1,
      emitted: 0,
    });
    expect(
      receiptsOf(caseDef.surface, fixture).filter(
        (receipt) =>
          receipt.id === fixture.streamId &&
          receipt.type === "stream:interrupt" &&
          receipt.interruptReason === "dispose",
      ),
    ).toHaveLength(1);
    expect(issuesOf(caseDef.surface, fixture)).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: fixture.streamId,
      }),
    ]);

    const receiptsBeforeRelease = receiptsOf(caseDef.surface, fixture);
    fixture.finalizers[0]!.release();
    await boundary;
    await flushSurface(caseDef.surface, fixture);

    expect(resolved).toBe(true);
    expect(fixture.finalizers[0]!.completionCount()).toBe(1);
    expect(receiptsOf(caseDef.surface, fixture)).toEqual(receiptsBeforeRelease);

    if (caseDef.surface === "rehydrated-harness") {
      expect(fixture.harness.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 0,
        mailboxes: [],
        timers: [],
        streams: [],
        transactions: [],
        children: [],
      });
    }
  } finally {
    if (caseDef.boundary !== "dispose") {
      await disposeFixture(fixture);
    }
  }
}

describe("stream finalizer boundary oracle", () => {
  for (const caseDef of cases.filter((entry) => entry.boundary === "state-exit")) {
    it(`proves exact stream finalizer behavior for ${caseDef.surface} on ${caseDef.boundary}`, async () => {
      await expectStateExitBoundary(caseDef);
    });
  }

  for (const caseDef of cases.filter((entry) => entry.boundary !== "state-exit")) {
    it(`proves exact stream finalizer behavior for ${caseDef.surface} on ${caseDef.boundary}`, async () => {
      await expectDisposeBoundary(caseDef);
    });
  }
});
