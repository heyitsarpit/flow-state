import { Context, Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { createKey } from "./public/keys.js";
import { transactionConcurrencyKey } from "./services/orchestrator-transaction-concurrency.js";
import { createTransactionConcurrency } from "./services/orchestrator-transaction-concurrency.js";
import type { QueuedTransaction } from "./services/orchestrator-transaction-types.js";

interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

interface PerfSaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

type PerfSaveEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

interface PerfSaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: readonly string[];
  readonly error: "conflict" | null;
}

const iterations = Object.freeze({
  base: 1_000,
  doubled: 2_000,
});

class PerfSaveApi extends Context.Service<
  PerfSaveApi,
  {
    readonly save: (params: PerfSaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/PerfSaveApi") {}

const perfProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "performance.project",
  key: (projectId) => createKey("performance", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const serializedOverlapTransaction = flow.transaction<
  PerfSaveParams,
  ProjectRecord,
  "conflict",
  PerfSaveApi,
  PerfSaveEvent
>({
  id: "performance.serialize-overlap",
  params: ({ context }: { readonly context: PerfSaveContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: perfProjectResource.ref(params.id),
        replace: params.draft,
      },
    ],
  },
  commit: (params) => Effect.flatMap(PerfSaveApi, (api) => api.save(params)),
  routes: flow.outcomes<ProjectRecord, "conflict", PerfSaveEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
  }),
  concurrency: "serialize",
});

const overlapMachine = flow.machine<PerfSaveContext, PerfSaveEvent, "ready", "ready">({
  id: "performance.serialize-machine",
  initial: "ready",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Draft v0" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: serializedOverlapTransaction,
          update: ({ context, event }) =>
            event.type === "SAVE"
              ? {
                  draft: {
                    ...context.draft,
                    name: event.name,
                  },
                }
              : {},
        },
        SAVED: {
          update: ({ context, event }) =>
            event.type === "SAVED"
              ? {
                  savedNames: [...context.savedNames, event.project.name],
                  error: null,
                }
              : {},
        },
        SAVE_FAILED: {
          update: ({ event }) =>
            event.type === "SAVE_FAILED"
              ? {
                  error: event.error,
                }
              : {},
        },
      },
    },
  },
});

type CounterEvent = Readonly<{ readonly type: "TICK" }>;

const counterMachine = flow.machine<{ readonly count: number }, CounterEvent, "ready">({
  id: "performance.counter-machine",
  initial: "ready",
  context: () => ({ count: 0 }),
  states: {
    ready: {
      on: {
        TICK: {
          update: ({ context }) => ({ count: context.count + 1 }),
        },
      },
    },
  },
});

function minDuration(samples: ReadonlyArray<number>): number {
  return Math.min(...samples);
}

async function measureScenario(run: () => Promise<void>, repetitions = 2): Promise<number> {
  await run();

  const samples: number[] = [];
  for (let index = 0; index < repetitions; index += 1) {
    const startedAt = performance.now();
    await run();
    samples.push(performance.now() - startedAt);
  }

  return minDuration(samples);
}

function expectBoundedGrowth(name: string, baseDuration: number, doubledDuration: number): void {
  if (doubledDuration >= baseDuration * 2.5) {
    throw new Error(
      `${name} doubled duration ${doubledDuration.toFixed(3)}ms exceeded 2.5x base ${baseDuration.toFixed(3)}ms`,
    );
  }
}

const serializedOverlapConcurrencyKey = transactionConcurrencyKey(serializedOverlapTransaction);

function queuedOverlapTransaction(index: number): QueuedTransaction<typeof overlapMachine> {
  return {
    concurrencyKey: serializedOverlapConcurrencyKey,
    definition: serializedOverlapTransaction,
    params: {
      id: "project-1",
      draft: {
        id: "project-1",
        name: `Draft ${index}`,
      },
    } satisfies PerfSaveParams,
    options: {
      parentState: "ready",
      trigger: "event",
      stateOwned: false,
      correlationId: undefined,
      event: {
        type: "SAVE",
        name: `Draft ${index}`,
      },
    },
  };
}

async function measureSerializedTransactionOverlap(totalSaves: number): Promise<{
  readonly dequeuedCount: number;
  readonly firstQueuedName: string | undefined;
  readonly lastQueuedName: string | undefined;
}> {
  const concurrency = createTransactionConcurrency<typeof overlapMachine>();

  for (let index = 0; index < totalSaves; index += 1) {
    concurrency.queue(queuedOverlapTransaction(index));
  }

  let dequeuedCount = 0;
  let firstQueuedName: string | undefined;
  let lastQueuedName: string | undefined;

  for (;;) {
    const queued = concurrency.dequeue(serializedOverlapConcurrencyKey);
    if (queued === undefined) {
      return {
        dequeuedCount,
        firstQueuedName,
        lastQueuedName,
      };
    }

    const queuedName = (queued.params as PerfSaveParams).draft.name;
    firstQueuedName ??= queuedName;
    lastQueuedName = queuedName;
    dequeuedCount += 1;
  }
}

async function measureActorSendFlush(totalTicks: number): Promise<{
  readonly count: number;
  readonly eventReceipts: number;
  readonly disposeReceipts: number;
}> {
  let count = 0;
  let eventReceipts = 0;
  let disposeReceipts = 0;

  for (let index = 0; index < totalTicks; index += 1) {
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    try {
      const actor = runtime.createActor(counterMachine);
      actor.send({ type: "TICK" });
      await actor.flush();

      count += actor.snapshot().context.count;
      eventReceipts += actor
        .receipts()
        .filter((receipt) => receipt.type === "machine:event").length;
      await actor.dispose();
      disposeReceipts += actor
        .receipts()
        .filter((receipt) => receipt.type === "actor:dispose").length;
    } finally {
      await runtime.dispose();
    }
  }

  return {
    count,
    eventReceipts,
    disposeReceipts,
  };
}

async function measureResourcePatchNotify(totalPatches: number): Promise<{
  readonly notifications: number;
  readonly finalName: string | undefined;
}> {
  const runtime = flow.runtime(
    flow
      .app({
        modules: [],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
  );
  const projectRef = perfProjectResource.ref("project-1");
  let notifications = 0;

  runtime.resources.seedResources([
    {
      ref: projectRef,
      value: { id: "project-1", name: "Seeded" },
    },
  ]);

  const unsubscribe = runtime.resources.subscribe(projectRef, () => {
    notifications += 1;
  });

  try {
    for (let index = 0; index < totalPatches; index += 1) {
      runtime.resources.patch(projectRef, (current) => ({
        ...current,
        name: `Patched ${index}`,
      }));
    }

    return {
      notifications,
      finalName: runtime.resources.get(projectRef)?.value?.name,
    };
  } finally {
    unsubscribe();
    await runtime.dispose();
  }
}

describe("performance regression guards", () => {
  it("keeps serialized transaction overlap bookkeeping below 2.5x when work doubles", async () => {
    const baseDuration = await measureScenario(() =>
      measureSerializedTransactionOverlap(iterations.base).then((result) => {
        expect(result.dequeuedCount).toBe(iterations.base);
        expect(result.firstQueuedName).toBe("Draft 0");
        expect(result.lastQueuedName).toBe(`Draft ${iterations.base - 1}`);
      }),
    );
    const doubledDuration = await measureScenario(() =>
      measureSerializedTransactionOverlap(iterations.doubled).then((result) => {
        expect(result.dequeuedCount).toBe(iterations.doubled);
        expect(result.firstQueuedName).toBe("Draft 0");
        expect(result.lastQueuedName).toBe(`Draft ${iterations.doubled - 1}`);
      }),
    );

    expectBoundedGrowth(
      "serialized transaction overlap bookkeeping",
      baseDuration,
      doubledDuration,
    );
  });

  it("keeps actor send plus flush below 2.5x when work doubles", async () => {
    const baseDuration = await measureScenario(() =>
      measureActorSendFlush(iterations.base).then((result) => {
        expect(result.count).toBe(iterations.base);
        expect(result.eventReceipts).toBe(iterations.base);
        expect(result.disposeReceipts).toBe(iterations.base);
      }),
    );
    const doubledDuration = await measureScenario(() =>
      measureActorSendFlush(iterations.doubled).then((result) => {
        expect(result.count).toBe(iterations.doubled);
        expect(result.eventReceipts).toBe(iterations.doubled);
        expect(result.disposeReceipts).toBe(iterations.doubled);
      }),
    );

    expectBoundedGrowth("actor send plus flush", baseDuration, doubledDuration);
  });

  it("keeps resource patch plus notify below 2.5x when work doubles", async () => {
    const baseDuration = await measureScenario(() =>
      measureResourcePatchNotify(iterations.base).then((result) => {
        expect(result.notifications).toBe(iterations.base);
        expect(result.finalName).toBe(`Patched ${iterations.base - 1}`);
      }),
    );
    const doubledDuration = await measureScenario(() =>
      measureResourcePatchNotify(iterations.doubled).then((result) => {
        expect(result.notifications).toBe(iterations.doubled);
        expect(result.finalName).toBe(`Patched ${iterations.doubled - 1}`);
      }),
    );

    expectBoundedGrowth("resource patch plus notify", baseDuration, doubledDuration);
  });
});
