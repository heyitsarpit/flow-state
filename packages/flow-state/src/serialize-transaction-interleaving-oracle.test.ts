import { Context, Effect, Layer } from "effect";
import { FastCheck } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { readyWorkPendingCount } from "./core/scheduling/ready-work.js";
import { flowTest } from "./testing.js";

type SerializeCommand =
  | "SAVE_A"
  | "SAVE_B"
  | "COMPLETE_OLDEST"
  | "COMPLETE_NEWEST"
  | "SETTLE"
  | "FLUSH";

type SerializeEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly name: string }>;

const serializeCommandArbitrary = FastCheck.constantFrom<SerializeCommand>(
  "SAVE_A",
  "SAVE_B",
  "COMPLETE_OLDEST",
  "COMPLETE_NEWEST",
  "SETTLE",
  "FLUSH",
);

const transactionId = "BT38.serializeSave";

class SaveNameApi extends Context.Service<
  SaveNameApi,
  {
    readonly save: (name: string) => Effect.Effect<string, never>;
  }
>()("test/BT38/SerializeSaveNameApi") {}

type AttemptRecord = Readonly<{
  readonly id: number;
  readonly name: string;
  readonly started: boolean;
  readonly completed: boolean;
}>;

type ReceiptCounts = Readonly<{
  readonly start: number;
  readonly queue: number;
  readonly dequeue: number;
  readonly success: number;
  readonly reject: number;
}>;

type OracleTransactionSnapshot =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly value: string }>
  | undefined;

type OracleState = Readonly<{
  readonly draft: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly nextAttemptId: number;
  readonly activeAttemptId: number | undefined;
  readonly queuedAttemptIds: ReadonlyArray<number>;
  readonly attempts: ReadonlyArray<AttemptRecord>;
  readonly transaction: OracleTransactionSnapshot;
  readonly issue: "failure" | null;
  readonly scheduled: ReadonlyArray<number>;
  readonly pending: ReadonlyArray<number>;
  readonly receiptCounts: ReceiptCounts;
}>;

type ControlledSaveEntry = Readonly<{
  readonly name: string;
  readonly succeed: (value: string) => void;
}>;

function initialOracleState(): OracleState {
  return {
    draft: "",
    savedNames: [],
    nextAttemptId: 0,
    activeAttemptId: undefined,
    queuedAttemptIds: [],
    attempts: [],
    transaction: undefined,
    issue: null,
    scheduled: [],
    pending: [],
    receiptCounts: {
      start: 0,
      queue: 0,
      dequeue: 0,
      success: 0,
      reject: 0,
    },
  };
}

function replaceAttempt(
  attempts: ReadonlyArray<AttemptRecord>,
  attemptId: number,
  patch: Partial<AttemptRecord>,
): ReadonlyArray<AttemptRecord> {
  return attempts.map((attempt) => (attempt.id === attemptId ? { ...attempt, ...patch } : attempt));
}

function lookupAttempt(current: OracleState, attemptId: number): AttemptRecord | undefined {
  return current.attempts.find((attempt) => attempt.id === attemptId);
}

function startedAttemptNames(current: OracleState): ReadonlyArray<string> {
  return current.attempts.filter((attempt) => attempt.started).map((attempt) => attempt.name);
}

function startQueuedAttempt(current: OracleState): OracleState {
  const nextAttemptId = current.queuedAttemptIds[0];
  if (nextAttemptId === undefined) {
    return current;
  }

  return {
    ...current,
    activeAttemptId: nextAttemptId,
    queuedAttemptIds: current.queuedAttemptIds.slice(1),
    attempts: replaceAttempt(current.attempts, nextAttemptId, {
      started: true,
    }),
    transaction: {
      status: "pending",
    },
    receiptCounts: {
      ...current.receiptCounts,
      start: current.receiptCounts.start + 1,
      dequeue: current.receiptCounts.dequeue + 1,
    },
  };
}

function applyQueuedCompletion(current: OracleState, attemptId: number): OracleState {
  if (current.activeAttemptId !== attemptId) {
    return current;
  }

  const attempt = lookupAttempt(current, attemptId);
  if (attempt === undefined || !attempt.started) {
    return current;
  }

  const published = {
    ...current,
    activeAttemptId: undefined,
    savedNames: [...current.savedNames, attempt.name],
    transaction: {
      status: "success",
      value: attempt.name,
    } as const,
    issue: null,
    receiptCounts: {
      ...current.receiptCounts,
      success: current.receiptCounts.success + 1,
    },
  };

  return published.queuedAttemptIds.length === 0 ? published : startQueuedAttempt(published);
}

function flushPendingOracle(current: OracleState): OracleState {
  let next = current;
  for (const attemptId of current.pending) {
    next = applyQueuedCompletion(next, attemptId);
  }

  return {
    ...next,
    pending: [],
  };
}

function applySaveCommand(current: OracleState, name: string): OracleState {
  if (current.activeAttemptId !== undefined && current.queuedAttemptIds.length >= 1) {
    return {
      ...current,
      draft: name,
      issue: "failure",
      transaction: {
        status: "pending",
      },
      receiptCounts: {
        ...current.receiptCounts,
        reject: current.receiptCounts.reject + 1,
      },
    };
  }

  const attemptId = current.nextAttemptId + 1;
  const base = {
    ...current,
    draft: name,
    nextAttemptId: attemptId,
  };

  if (current.activeAttemptId === undefined) {
    return {
      ...base,
      activeAttemptId: attemptId,
      attempts: [
        ...current.attempts,
        {
          id: attemptId,
          name,
          started: true,
          completed: false,
        },
      ],
      transaction: {
        status: "pending",
      },
      issue: null,
      receiptCounts: {
        ...current.receiptCounts,
        start: current.receiptCounts.start + 1,
      },
    };
  }

  return {
    ...base,
    queuedAttemptIds: [...current.queuedAttemptIds, attemptId],
    attempts: [
      ...current.attempts,
      {
        id: attemptId,
        name,
        started: false,
        completed: false,
      },
    ],
    transaction: {
      status: "pending",
    },
    issue: null,
    receiptCounts: {
      ...current.receiptCounts,
      queue: current.receiptCounts.queue + 1,
    },
  };
}

function applyDispatchSaveCommand(current: OracleState, name: string): OracleState {
  return applySaveCommand(flushPendingOracle(current), name);
}

function applyOracleCommand(current: OracleState, command: SerializeCommand): OracleState {
  switch (command) {
    case "SAVE_A":
      return applyDispatchSaveCommand(current, "A");
    case "SAVE_B":
      return applyDispatchSaveCommand(current, "B");
    case "COMPLETE_OLDEST":
    case "COMPLETE_NEWEST": {
      const candidates = current.attempts.filter(
        (attempt) => attempt.started && !attempt.completed,
      );
      const target =
        command === "COMPLETE_OLDEST" ? candidates[0] : candidates[candidates.length - 1];
      if (target === undefined) {
        return current;
      }

      return {
        ...current,
        attempts: replaceAttempt(current.attempts, target.id, {
          completed: true,
        }),
        scheduled: [...current.scheduled, target.id],
      };
    }
    case "SETTLE":
      return {
        ...current,
        pending: [...current.pending, ...current.scheduled],
        scheduled: [],
      };
    case "FLUSH":
      return flushPendingOracle({
        ...current,
        pending: [...current.pending, ...current.scheduled],
        scheduled: [],
      });
  }
}

function createControlledSaveLayer() {
  const calls: Array<string> = [];
  const entries: Array<ControlledSaveEntry> = [];

  const layer = Layer.succeed(
    SaveNameApi,
    SaveNameApi.of({
      save: (name) =>
        Effect.promise<string>(() => {
          return new Promise<string>((resolve) => {
            calls.push(name);
            entries.push({
              name,
              succeed: resolve,
            });
          });
        }).pipe(Effect.orDie),
    }),
  );

  return {
    layer,
    calls,
    entries,
    succeedEntryAt: (index: number) => {
      const entry = entries[index];
      expect(entry).toBeDefined();
      entry!.succeed(entry!.name);
    },
  };
}

function createSerializeMachine() {
  const serializeTransaction = flow.transaction<
    { readonly name: string },
    string,
    never,
    SaveNameApi,
    SerializeEvent
  >({
    id: transactionId,
    params: ({ context }: { readonly context: { readonly draft: string } }) => ({
      name: context.draft,
    }),
    commit: ({ name }) => Effect.flatMap(SaveNameApi, (api) => api.save(name)),
    routes: flow.outcomes<string, never, SerializeEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        name: value,
      }),
    }),
    concurrency: "serialize",
  });

  return flow.machine<
    { readonly draft: string; readonly savedNames: ReadonlyArray<string> },
    SerializeEvent,
    "ready"
  >({
    id: "bt38.serialize.machine",
    initial: "ready",
    context: () => ({
      draft: "",
      savedNames: [],
    }),
    states: {
      ready: {
        on: {
          SAVE: {
            submit: serializeTransaction,
            update: ({ context, event }) =>
              event.type === "SAVE"
                ? {
                    ...context,
                    draft: event.name,
                  }
                : context,
          },
          SAVED: {
            update: ({ context, event }) =>
              event.type === "SAVED"
                ? {
                    ...context,
                    savedNames: [...context.savedNames, event.name],
                  }
                : context,
          },
        },
      },
    },
  });
}

function commandEvent(
  command: SerializeCommand,
): Readonly<{ readonly type: "SAVE"; readonly name: string }> | undefined {
  switch (command) {
    case "SAVE_A":
      return { type: "SAVE", name: "A" };
    case "SAVE_B":
      return { type: "SAVE", name: "B" };
    default:
      return undefined;
  }
}

function expectOracleTransaction(
  observed:
    | Readonly<{
        readonly status?: string;
        readonly value?: unknown;
      }>
    | undefined,
  oracle: OracleState,
) {
  if (oracle.transaction === undefined) {
    expect(observed).toBeUndefined();
    return;
  }

  expect(observed).toMatchObject(oracle.transaction);
}

function receiptCount(
  receipts: ReadonlyArray<{
    readonly id?: string;
    readonly type: string;
  }>,
  type:
    | "transaction:start"
    | "transaction:queue"
    | "transaction:dequeue"
    | "transaction:success"
    | "transaction:reject",
) {
  return receipts.filter((receipt) => receipt.id === transactionId && receipt.type === type).length;
}

function completeSurfaceCommand(
  controls: ReturnType<typeof createControlledSaveLayer>,
  oracle: OracleState,
  command: "COMPLETE_OLDEST" | "COMPLETE_NEWEST",
) {
  const candidates = oracle.attempts.filter((attempt) => attempt.started && !attempt.completed);
  const target = command === "COMPLETE_OLDEST" ? candidates[0] : candidates[candidates.length - 1];
  expect(target).toBeDefined();
  controls.succeedEntryAt(target!.id - 1);
}

async function settleRawCompletionTurn() {
  await Promise.resolve();
}

async function expectFlowTestSequenceMatchesOracle(commands: ReadonlyArray<SerializeCommand>) {
  const controls = createControlledSaveLayer();
  const machine = createSerializeMachine();
  const harness = flowTest(machine).provide(controls.layer).start();
  let oracle = initialOracleState();

  const assertCurrent = () => {
    expect(harness.state()).toBe("ready");
    expect(harness.context()).toEqual({
      draft: oracle.draft,
      savedNames: oracle.savedNames,
    });
    expect(harness.pendingWork().ready).toBe(oracle.pending.length);
    expectOracleTransaction(harness.getSnapshot().transactions[transactionId], oracle);
    if (oracle.issue === null) {
      expect(harness.issues()).toEqual([]);
    } else {
      expect(harness.issues()).toEqual([
        expect.objectContaining({
          kind: oracle.issue,
          source: "transaction",
          id: transactionId,
        }),
      ]);
    }
    expect(controls.calls).toEqual(startedAttemptNames(oracle));
    expect(receiptCount(harness.getSnapshot().receipts, "transaction:start")).toBe(
      oracle.receiptCounts.start,
    );
    expect(receiptCount(harness.getSnapshot().receipts, "transaction:queue")).toBe(
      oracle.receiptCounts.queue,
    );
    expect(receiptCount(harness.getSnapshot().receipts, "transaction:dequeue")).toBe(
      oracle.receiptCounts.dequeue,
    );
    expect(receiptCount(harness.getSnapshot().receipts, "transaction:success")).toBe(
      oracle.receiptCounts.success,
    );
    expect(receiptCount(harness.getSnapshot().receipts, "transaction:reject")).toBe(
      oracle.receiptCounts.reject,
    );
  };

  assertCurrent();

  for (const command of [...commands, "FLUSH" as const]) {
    const event = commandEvent(command);
    let shouldAssert = true;
    if (event !== undefined) {
      harness.send(event);
    } else if (command === "COMPLETE_OLDEST" || command === "COMPLETE_NEWEST") {
      shouldAssert = false;
      const incompleteAttempts = oracle.attempts.filter(
        (attempt) => attempt.started && !attempt.completed,
      );
      if (incompleteAttempts.length > 0) {
        completeSurfaceCommand(controls, oracle, command);
      }
    } else if (command === "SETTLE") {
      await settleRawCompletionTurn();
    } else {
      await harness.flush();
    }

    oracle = applyOracleCommand(oracle, command);
    if (shouldAssert) {
      assertCurrent();
    }
  }
}

async function expectRuntimeSequenceMatchesOracle(commands: ReadonlyArray<SerializeCommand>) {
  const controls = createControlledSaveLayer();
  const machine = createSerializeMachine();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38SerializeRuntime", {
            machines: {
              serialize: machine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controls.layer],
      }),
  );
  const actor = runtime.createActor(machine);
  let oracle = initialOracleState();

  const assertCurrent = () => {
    expect(actor.getSnapshot().value).toBe("ready");
    expect(actor.getSnapshot().context).toEqual({
      draft: oracle.draft,
      savedNames: oracle.savedNames,
    });
    expect(readyWorkPendingCount(actor)).toBe(oracle.pending.length);
    expectOracleTransaction(actor.getSnapshot().transactions[transactionId], oracle);
    if (oracle.issue === null) {
      expect(actor.issues()).toEqual([]);
    } else {
      expect(actor.issues()).toEqual([
        expect.objectContaining({
          kind: oracle.issue,
          source: "transaction",
          id: transactionId,
        }),
      ]);
    }
    expect(controls.calls).toEqual(startedAttemptNames(oracle));
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:start")).toBe(
      oracle.receiptCounts.start,
    );
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:queue")).toBe(
      oracle.receiptCounts.queue,
    );
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:dequeue")).toBe(
      oracle.receiptCounts.dequeue,
    );
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:success")).toBe(
      oracle.receiptCounts.success,
    );
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:reject")).toBe(
      oracle.receiptCounts.reject,
    );
  };

  try {
    assertCurrent();

    for (const command of [...commands, "FLUSH" as const]) {
      const event = commandEvent(command);
      let shouldAssert = true;
      if (event !== undefined) {
        actor.send(event);
      } else if (command === "COMPLETE_OLDEST" || command === "COMPLETE_NEWEST") {
        shouldAssert = false;
        const incompleteAttempts = oracle.attempts.filter(
          (attempt) => attempt.started && !attempt.completed,
        );
        if (incompleteAttempts.length > 0) {
          completeSurfaceCommand(controls, oracle, command);
        }
      } else if (command === "SETTLE") {
        await settleRawCompletionTurn();
      } else {
        await actor.flush();
      }

      oracle = applyOracleCommand(oracle, command);
      if (shouldAssert) {
        assertCurrent();
      }
    }
  } finally {
    await runtime.dispose();
  }
}

async function expectSettledSerializedCompletionStartsQueuedSuccessorInFlowTest() {
  const controls = createControlledSaveLayer();
  const machine = createSerializeMachine();
  const harness = flowTest(machine).provide(controls.layer).start();

  harness.send({ type: "SAVE", name: "A" });
  harness.send({ type: "SAVE", name: "B" });

  expect(controls.calls).toEqual(["A"]);
  expect(harness.context()).toEqual({
    draft: "B",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.getSnapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:start")).toBe(1);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:queue")).toBe(1);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:dequeue")).toBe(0);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:success")).toBe(0);

  controls.succeedEntryAt(0);
  await settleRawCompletionTurn();

  expect(controls.calls).toEqual(["A"]);
  expect(harness.context()).toEqual({
    draft: "B",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(1);
  expect(harness.getSnapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:dequeue")).toBe(0);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:success")).toBe(0);

  await harness.flush();

  expect(controls.calls).toEqual(["A", "B"]);
  expect(harness.context()).toEqual({
    draft: "B",
    savedNames: ["A"],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.getSnapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:start")).toBe(2);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:queue")).toBe(1);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:dequeue")).toBe(1);
  expect(receiptCount(harness.getSnapshot().receipts, "transaction:success")).toBe(1);
}

async function expectSettledSerializedCompletionStartsQueuedSuccessorInRuntime() {
  const controls = createControlledSaveLayer();
  const machine = createSerializeMachine();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38SerializeRuntimeBoundary", {
            machines: {
              serialize: machine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controls.layer],
      }),
  );
  const actor = runtime.createActor(machine);

  try {
    actor.send({ type: "SAVE", name: "A" });
    actor.send({ type: "SAVE", name: "B" });

    expect(controls.calls).toEqual(["A"]);
    expect(actor.getSnapshot().context).toEqual({
      draft: "B",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.getSnapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:start")).toBe(1);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:queue")).toBe(1);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:dequeue")).toBe(0);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:success")).toBe(0);

    controls.succeedEntryAt(0);
    await settleRawCompletionTurn();

    expect(controls.calls).toEqual(["A"]);
    expect(actor.getSnapshot().context).toEqual({
      draft: "B",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(1);
    expect(actor.getSnapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:dequeue")).toBe(0);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:success")).toBe(0);

    await actor.flush();

    expect(controls.calls).toEqual(["A", "B"]);
    expect(actor.getSnapshot().context).toEqual({
      draft: "B",
      savedNames: ["A"],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.getSnapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:start")).toBe(2);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:queue")).toBe(1);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:dequeue")).toBe(1);
    expect(receiptCount(actor.getSnapshot().receipts, "transaction:success")).toBe(1);
  } finally {
    await runtime.dispose();
  }
}

describe("serialize transaction interleaving oracle", () => {
  it("matches the independent settle/flush queue oracle in flowTest", async () => {
    await FastCheck.assert(
      FastCheck.asyncProperty(
        FastCheck.array(serializeCommandArbitrary, {
          maxLength: 10,
        }),
        async (commands) => {
          await expectFlowTestSequenceMatchesOracle(commands);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("matches the independent settle/flush queue oracle in runtime actors", async () => {
    await FastCheck.assert(
      FastCheck.asyncProperty(
        FastCheck.array(serializeCommandArbitrary, {
          maxLength: 10,
        }),
        async (commands) => {
          await expectRuntimeSequenceMatchesOracle(commands);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("keeps a settled serialized predecessor latent until flush and starts the queued successor in flowTest", async () => {
    await expectSettledSerializedCompletionStartsQueuedSuccessorInFlowTest();
  });

  it("keeps a settled serialized predecessor latent until flush and starts the queued successor in runtime actors", async () => {
    await expectSettledSerializedCompletionStartsQueuedSuccessorInRuntime();
  });
});
