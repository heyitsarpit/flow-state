import { Effect, Exit, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./core/api/flow-core.js";
import { OrchestratorSystem } from "./services/orchestrator-system.js";
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
      modules: [RuntimeModule],
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

    expect(alphaActor.id).toBe("Alpha+Beta/Alpha/editor");
    expect(betaActor.id).toBe("Alpha+Beta/Beta/editor");
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
      modules: [RuntimeModule],
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
      modules: [RuntimeModule],
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
});
