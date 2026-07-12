import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./core/api/flow-core.js";
import { createOrchestratorActorLifecycle } from "./core/orchestrator/orchestrator-actor-lifecycle.js";
import { OrchestratorSystem } from "./core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import {
  Greeter,
  projectResource,
  RuntimeModule,
} from "./testing/fixtures/runtime-test-fixtures.js";

type Expect<Type extends true> = Type;

function expectType<Type>(_value: Type): void {
  void _value;
}

describe("runtime lifecycle and actor ownership contracts", () => {
  it("joins concurrent actor disposal and awaits owned finalizers before eviction", async () => {
    const machine = flow.machine<{ readonly count: number }, { readonly type: "STEP" }, "idle">({
      id: "runtime.actor.dispose-join",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });
    let snapshot: ReturnType<typeof machine.getInitialSnapshot> = machine.getInitialSnapshot();
    let releaseChildFinalizer!: () => void;
    let childFinalized = false;
    let evicted = false;

    const lifecycle = createOrchestratorActorLifecycle<typeof machine>({
      actorId: "runtime.actor.dispose-join",
      machine,
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.runPromise(effect as Effect.Effect<A, E, never>),
    });
    const actor = lifecycle.createActor({
      dispatchMachineEvent: () => undefined,
      replaceSnapshot: (next) => {
        snapshot = next;
      },
      appendReceipt: (receipt) => {
        snapshot = Object.freeze({
          ...snapshot,
          receipts: [...snapshot.receipts, receipt],
        });
      },
      buildDisposedSnapshot: () => snapshot,
      activateStateOwnedWork: () => undefined,
      restoreStateOwnedWork: () => undefined,
      initialSnapshotProvided: false,
      ownedChildActors: () => [
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.promise(
            () =>
              new Promise<void>((resolve) => {
                releaseChildFinalizer = () => {
                  childFinalized = true;
                  resolve();
                };
              }),
          ),
        },
      ],
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      onDispose: () => {
        evicted = true;
      },
    });

    const firstDispose = actor.dispose();
    const secondDispose = actor.dispose();
    let firstResolved = false;
    let secondResolved = false;
    void firstDispose.then(() => {
      firstResolved = true;
    });
    void secondDispose.then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(childFinalized).toBe(false);
    expect(evicted).toBe(false);
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);

    releaseChildFinalizer();
    await Promise.all([firstDispose, secondDispose]);

    expect(childFinalized).toBe(true);
    expect(evicted).toBe(true);
    expect(firstResolved).toBe(true);
    expect(secondResolved).toBe(true);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
  });

  it("runs every owned finalizer and evicts even when one finalizer fails", async () => {
    const machine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.dispose-failure",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    let snapshot: ReturnType<typeof machine.getInitialSnapshot> = machine.getInitialSnapshot();
    const finalizerError = new Error("owned finalizer failed");
    let successfulFinalizerRan = false;
    let evicted = false;

    const lifecycle = createOrchestratorActorLifecycle<typeof machine>({
      actorId: "runtime.actor.dispose-failure",
      machine,
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.runPromise(effect as Effect.Effect<A, E, never>),
    });
    const actor = lifecycle.createActor({
      dispatchMachineEvent: () => undefined,
      replaceSnapshot: (next) => {
        snapshot = next;
      },
      appendReceipt: (receipt) => {
        snapshot = Object.freeze({
          ...snapshot,
          receipts: [...snapshot.receipts, receipt],
        });
      },
      buildDisposedSnapshot: () => snapshot,
      activateStateOwnedWork: () => undefined,
      restoreStateOwnedWork: () => undefined,
      initialSnapshotProvided: false,
      ownedChildActors: () => [
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.die(finalizerError),
        },
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.sync(() => {
            successfulFinalizerRan = true;
          }),
        },
      ],
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      onDispose: () => {
        evicted = true;
      },
    });

    const disposeExit = await Effect.runPromiseExit(Effect.promise(() => actor.dispose()));

    expect(Exit.isFailure(disposeExit)).toBe(true);
    if (Exit.isFailure(disposeExit)) {
      expect(Cause.squash(disposeExit.cause)).toBe(finalizerError);
    }
    expect(successfulFinalizerRan).toBe(true);
    expect(evicted).toBe(true);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
  });

  it("routes snapshot compatibility through the preferred getSnapshot implementation", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.snapshot-alias",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            STEP: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("SnapshotAlias", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.orchestrators.start(actorMachine);

    expect(actor.snapshot).toBe(actor.getSnapshot);

    const initialSnapshot = actor.getSnapshot();
    expect(actor.snapshot()).toBe(initialSnapshot);
    expect(actor.getSnapshot()).toBe(initialSnapshot);
    expect(actor.receipts()).toHaveLength(initialSnapshot.receipts.length);

    actor.send({ type: "STEP" });
    await actor.flush();
    const steppedSnapshot = actor.getSnapshot();
    expect(actor.snapshot()).toBe(steppedSnapshot);
    expect(steppedSnapshot.context.count).toBe(1);

    await actor.dispose();
    const disposedSnapshot = actor.getSnapshot();
    expect(actor.snapshot()).toBe(disposedSnapshot);
    expect(disposedSnapshot.receipts.at(-1)).toMatchObject({
      type: "actor:dispose",
      id: actor.id,
    });

    await runtime.dispose();
  });

  it("builds a managed runtime that preserves service requirements and runtime-owned resources", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [Greeter.layer],
    });

    const runtime = flow.runtime(appLayer);
    const projectRef = projectResource.ref("project-1");

    expectType<Promise<string>>(
      runtime.runPromise(
        Effect.gen(function* () {
          const greeter = yield* Greeter;
          return yield* greeter.greet("Atlas");
        }),
      ),
    );
    expectType<Promise<Exit.Exit<"ok", "boom">>>(
      runtime.runPromiseExit(Effect.fail("boom" as const).pipe(Effect.as("ok" as const))),
    );

    type _ManagedRuntimeServices = Expect<
      Greeter | ResourceStore extends ManagedRuntime.ManagedRuntime.Services<
        typeof runtime.managedRuntime
      >
        ? true
        : false
    >;
    void [true as _ManagedRuntimeServices];

    expect(ManagedRuntime.isManagedRuntime(runtime.managedRuntime)).toBe(true);

    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const snapshot = await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        return yield* store.get(projectRef);
      }),
    );
    expect(snapshot).toMatchObject({
      id: "runtime.project",
      status: "success",
      value: { id: "project-1", name: "Seeded" },
    });

    const greeting = await runtime.runPromise(
      Effect.gen(function* () {
        const greeter = yield* Greeter;
        return yield* greeter.greet("Atlas");
      }),
    );
    expect(greeting).toBe("hello Atlas");

    const failed = await runtime.runPromiseExit(Effect.fail("boom" as const));
    expect(Exit.isFailure(failed)).toBe(true);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("disposes layer finalizers exactly once", async () => {
    let acquired = 0;
    let finalized = 0;

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [
        Layer.effectDiscard(
          Effect.acquireRelease(
            Effect.sync(() => {
              acquired += 1;
            }),
            () =>
              Effect.sync(() => {
                finalized += 1;
              }),
          ),
        ),
      ],
    });

    const runtime = flow.runtime(appLayer);

    expect(acquired).toBe(0);
    expect(finalized).toBe(0);

    await runtime.runPromise(Effect.void);
    expect(acquired).toBe(1);
    expect(finalized).toBe(0);

    await runtime.dispose();
    expect(finalized).toBe(1);

    await runtime.dispose();
    expect(finalized).toBe(1);
  });

  it("shares the same in-flight dispose work across concurrent callers", async () => {
    let releaseDispose: (() => void) | undefined;
    let finalized = 0;

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [
        Layer.effectDiscard(
          Effect.acquireRelease(Effect.void, () =>
            Effect.promise<void>(
              () =>
                new Promise((resolve) => {
                  releaseDispose = () => {
                    finalized += 1;
                    resolve();
                  };
                }),
            ),
          ),
        ),
      ],
    });

    const runtime = flow.runtime(appLayer);
    await runtime.runPromise(Effect.void);

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();
    let secondResolved = false;
    void secondDispose.then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    releaseDispose?.();
    await Promise.all([firstDispose, secondDispose]);
    expect(finalized).toBe(1);
  });

  it("installs OrchestratorSystem in the runtime and uses it for actor ownership", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const app = flow.app({
      modules: [
        RuntimeModule,
        flow.module("RuntimeActor", {
          machines: {
            actor: actorMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(actorMachine, {
      id: "runtime-actor-1",
      policy: "keep-alive",
    });
    const viaService = await runtime.runPromise(
      Effect.flatMap(OrchestratorSystem, (system) => system.get("runtime-actor-1")),
    );

    expect(viaService).toBe(actor);

    await runtime.dispose();
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "actor:dispose", id: "runtime-actor-1" }),
      ]),
    );
  });

  it("scopes default actor ids by app, module, and machine ownership", async () => {
    const sharedAlphaMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.shared-machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });
    const sharedBetaMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.shared-machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const AlphaModule = flow.module("Alpha", {
      machines: {
        editor: sharedAlphaMachine,
      },
    });
    const BetaModule = flow.module("Beta", {
      machines: {
        editor: sharedBetaMachine,
      },
    });
    const app = flow.app({
      modules: [AlphaModule, BetaModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const alphaActor = runtime.createActor(sharedAlphaMachine);
    const betaActor = runtime.createActor(sharedBetaMachine);

    expect(alphaActor.id).toBe("app:5:Alpha|4:Beta/Alpha/editor");
    expect(betaActor.id).toBe("app:5:Alpha|4:Beta/Beta/editor");
    expect(runtime.orchestrators.get(alphaActor.id)).toBe(alphaActor);
    expect(runtime.orchestrators.get(betaActor.id)).toBe(betaActor);

    await runtime.dispose();
  });

  it("releases disposed actors from the orchestrator registry without double-disposing them later", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.self-dispose",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const app = flow.app({
      modules: [
        RuntimeModule,
        flow.module("RuntimeSelfDispose", {
          machines: {
            actor: actorMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(actorMachine, {
      id: "runtime-actor-self-dispose",
    });

    await actor.dispose();
    expect(
      await runtime.runPromise(
        Effect.flatMap(OrchestratorSystem, (system) => system.get("runtime-actor-self-dispose")),
      ),
    ).toBe(null);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "actor:dispose" && receipt.id === "runtime-actor-self-dispose",
        ),
    ).toHaveLength(1);

    await runtime.dispose();
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "actor:dispose" && receipt.id === "runtime-actor-self-dispose",
        ),
    ).toHaveLength(1);
  });

  it("releases actor subscriptions after runtime disposal", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.subscription-dispose",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const app = flow.app({
      modules: [
        RuntimeModule,
        flow.module("RuntimeSubscriptionDispose", {
          machines: {
            actor: actorMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(actorMachine, {
      id: "runtime-actor-subscription-dispose",
    });
    let notifications = 0;
    const unsubscribe = actor.subscribe(() => {
      notifications += 1;
    });

    actor.send({ type: "STEP" });
    expect(notifications).toBe(1);

    await runtime.dispose();
    expect(notifications).toBe(2);

    actor.send({ type: "STEP" });
    expect(notifications).toBe(2);

    unsubscribe();
  });

  it("keeps a leased actor alive until the final attachment releases", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.lease.shared",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            STEP: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeSharedLease", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const first = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-shared",
      policy: "keep-alive",
    });
    const second = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-shared",
      policy: "keep-alive",
    });

    expect(second.actor).toBe(first.actor);
    first.actor.send({ type: "STEP" });
    await first.actor.flush();

    await first.release();

    expect(runtime.orchestrators.get("runtime-actor-lease-shared")).toBe(first.actor);
    expect(second.actor.getSnapshot().context.count).toBe(1);
    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(0);

    await second.release();

    expect(runtime.orchestrators.get("runtime-actor-lease-shared")).toBe(null);
    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("rejects incompatible same-id leased actors instead of casting the live incarnation", async () => {
    const firstMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.lease.incompatible",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const secondMachine = flow.machine<{ readonly value: string }, never, "idle">({
      id: "runtime.actor.lease.incompatible",
      initial: "idle",
      context: () => ({ value: "different" }),
      states: {
        idle: {},
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeIncompatibleLease", {
              machines: {
                first: firstMachine,
                second: secondMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const lease = await runtime.orchestrators.attach(firstMachine, {
      id: "runtime-actor-lease-incompatible",
      policy: "keep-alive",
    });

    let incompatibleError: unknown;
    try {
      await runtime.orchestrators.attach(secondMachine, {
        id: "runtime-actor-lease-incompatible",
        policy: "keep-alive",
      });
    } catch (error) {
      incompatibleError = error;
    }

    expect(incompatibleError).toMatchObject({
      code: "FLOW-ORCH-001",
    });

    await lease.release();
    await runtime.dispose();
  });

  it("lets explicit stop override outstanding leases without double finalization", async () => {
    const actorMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.lease.stop",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeStopLease", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const first = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-stop",
      policy: "keep-alive",
    });
    const second = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-stop",
      policy: "keep-alive",
    });

    await runtime.orchestrators.stop("runtime-actor-lease-stop");

    expect(runtime.orchestrators.get("runtime-actor-lease-stop")).toBe(null);

    await first.release();
    await second.release();

    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("makes repeated lease release idempotent", async () => {
    const actorMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.lease.idempotent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeIdempotentLease", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const lease = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-idempotent",
      policy: "keep-alive",
    });

    await lease.release();
    await lease.release();

    expect(
      lease.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });
});
