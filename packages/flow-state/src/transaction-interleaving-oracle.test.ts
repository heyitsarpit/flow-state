import { Context, Effect, Layer } from "effect";
import { FastCheck } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { readyWorkPendingCount } from "./core/scheduling/ready-work.js";
import { flowTest } from "./testing.js";

type TransactionCommand =
  | "START_A"
  | "START_B"
  | "STOP"
  | "COMPLETE_OLDEST"
  | "COMPLETE_NEWEST"
  | "FLUSH";
type TransactionEvent =
  | Readonly<{ readonly type: "START_A" }>
  | Readonly<{ readonly type: "START_B" }>
  | Readonly<{ readonly type: "STOP" }>
  | Readonly<{ readonly type: "SAVED"; readonly name: string }>;
type TransactionState = "idle" | "saving";

const transactionCommandArbitrary = FastCheck.constantFrom<TransactionCommand>(
  "START_A",
  "START_B",
  "STOP",
  "COMPLETE_OLDEST",
  "COMPLETE_NEWEST",
  "FLUSH",
);

const transactionId = "BT38.saveName";

class SaveNameApi extends Context.Service<
  SaveNameApi,
  {
    readonly save: (name: string) => Effect.Effect<string, never>;
  }
>()("test/BT38/SaveNameApi") {}

type AttemptRecord = Readonly<{
  readonly id: number;
  readonly name: string;
  readonly interrupted: boolean;
  readonly completed: boolean;
}>;

type OracleTransactionSnapshot =
  | Readonly<{ readonly status: "pending" | "interrupt" }>
  | Readonly<{ readonly status: "success"; readonly value: string }>
  | undefined;

type OracleState = Readonly<{
  readonly value: TransactionState;
  readonly draft: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly nextAttemptId: number;
  readonly activeAttemptId: number | undefined;
  readonly attempts: ReadonlyArray<AttemptRecord>;
  readonly transaction: OracleTransactionSnapshot;
  readonly issue: "interrupt" | null;
  readonly scheduled: ReadonlyArray<number>;
  readonly pending: ReadonlyArray<number>;
  readonly deferred: ReadonlyArray<number>;
}>;

type AbortableSaveEntry = Readonly<{
  readonly name: string;
  readonly signal: AbortSignal;
  readonly abortCount: () => number;
  readonly succeed: (value: string) => void;
}>;

function initialOracleState(): OracleState {
  return {
    value: "idle",
    draft: "",
    savedNames: [],
    nextAttemptId: 0,
    activeAttemptId: undefined,
    attempts: [],
    transaction: undefined,
    issue: null,
    scheduled: [],
    pending: [],
    deferred: [],
  };
}

function replaceAttempt(
  attempts: ReadonlyArray<AttemptRecord>,
  attemptId: number,
  patch: Partial<AttemptRecord>,
): ReadonlyArray<AttemptRecord> {
  return attempts.map((attempt) => (attempt.id === attemptId ? { ...attempt, ...patch } : attempt));
}

function applyCompletion(current: OracleState, attemptId: number): OracleState {
  if (current.activeAttemptId !== attemptId || current.value !== "saving") {
    return current;
  }

  const attempt = current.attempts.find((candidate) => candidate.id === attemptId);
  if (attempt === undefined || attempt.interrupted) {
    return current;
  }

  return {
    ...current,
    value: "idle",
    draft: "",
    savedNames: [...current.savedNames, attempt.name],
    activeAttemptId: undefined,
    transaction: {
      status: "success",
      value: attempt.name,
    },
    issue: null,
  };
}

function flushPendingOracle(current: OracleState): OracleState {
  let next = current;
  for (const attemptId of current.pending) {
    next = applyCompletion(next, attemptId);
  }

  return {
    ...next,
    pending: [],
  };
}

function startAttempt(current: OracleState, draft: string): OracleState {
  const interruptedCurrent =
    current.value === "saving" && current.activeAttemptId !== undefined
      ? {
          ...current,
          attempts: replaceAttempt(current.attempts, current.activeAttemptId, {
            interrupted: true,
          }),
          activeAttemptId: undefined,
          transaction: {
            status: "interrupt",
          } as const,
          issue: "interrupt" as const,
          deferred: [...current.deferred, current.activeAttemptId],
        }
      : current;
  const attemptId = interruptedCurrent.nextAttemptId + 1;

  return {
    ...interruptedCurrent,
    value: "saving",
    draft,
    nextAttemptId: attemptId,
    activeAttemptId: attemptId,
    attempts: [
      ...interruptedCurrent.attempts,
      {
        id: attemptId,
        name: draft,
        interrupted: false,
        completed: false,
      },
    ],
    transaction: {
      status: "pending",
    },
    issue: null,
  };
}

function applyDispatchEvent(
  current: OracleState,
  command: "START_A" | "START_B" | "STOP",
): OracleState {
  switch (command) {
    case "START_A":
      return startAttempt(current, "A");
    case "START_B":
      return startAttempt(current, "B");
    case "STOP": {
      if (current.value !== "saving" || current.activeAttemptId === undefined) {
        return current;
      }

      return {
        ...current,
        value: "idle",
        draft: "",
        activeAttemptId: undefined,
        attempts: replaceAttempt(current.attempts, current.activeAttemptId, {
          interrupted: true,
        }),
        transaction: {
          status: "interrupt",
        },
        issue: "interrupt",
        deferred: [...current.deferred, current.activeAttemptId],
      };
    }
  }
}

function applyDispatchCommand(
  current: OracleState,
  command: "START_A" | "START_B" | "STOP",
): OracleState {
  return applyDispatchEvent(flushPendingOracle(current), command);
}

function applyOracleCommand(current: OracleState, command: TransactionCommand): OracleState {
  switch (command) {
    case "START_A":
    case "START_B":
    case "STOP":
      return applyDispatchCommand(current, command);

    case "COMPLETE_OLDEST":
    case "COMPLETE_NEWEST": {
      const candidates = current.attempts.filter((attempt) => !attempt.completed);
      const target =
        command === "COMPLETE_OLDEST" ? candidates[0] : candidates[candidates.length - 1];
      if (target === undefined) {
        return current;
      }

      return flushPendingOracle({
        ...current,
        attempts: replaceAttempt(current.attempts, target.id, {
          completed: true,
        }),
        pending: [...current.pending, ...current.scheduled, target.id, ...current.deferred],
        scheduled: [],
        deferred: [],
      });
    }

    case "FLUSH": {
      return flushPendingOracle({
        ...current,
        pending: [...current.pending, ...current.scheduled, ...current.deferred],
        scheduled: [],
        deferred: [],
      });
    }
  }
}

function createAbortableSaveNameLayer() {
  const calls: Array<string> = [];
  const entries: Array<AbortableSaveEntry> = [];

  const layer = Layer.succeed(
    SaveNameApi,
    SaveNameApi.of({
      save: (name) =>
        Effect.promise<string>((signal) => {
          let abortCount = 0;
          signal.addEventListener("abort", () => {
            abortCount += 1;
          });

          return new Promise<string>((resolve) => {
            calls.push(name);
            entries.push({
              name,
              signal,
              abortCount: () => abortCount,
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

function createTransactionMachine() {
  const saveTransaction = flow.transaction<
    { readonly name: string },
    string,
    never,
    SaveNameApi,
    TransactionEvent
  >({
    id: transactionId,
    params: ({ context }: { readonly context: { readonly draft: string } }) => ({
      name: context.draft,
    }),
    commit: ({ name }) => Effect.flatMap(SaveNameApi, (api) => api.save(name)),
    routes: flow.outcomes<string, never, TransactionEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        name: value,
      }),
    }),
    concurrency: "reject-while-running",
  });

  return flow.machine<
    { readonly draft: string; readonly savedNames: ReadonlyArray<string> },
    TransactionEvent,
    TransactionState
  >({
    id: "bt38.transaction.machine",
    initial: "idle",
    context: () => ({
      draft: "",
      savedNames: [],
    }),
    states: {
      idle: {
        on: {
          START_A: {
            target: "saving",
            update: () => ({
              draft: "A",
            }),
          },
          START_B: {
            target: "saving",
            update: () => ({
              draft: "B",
            }),
          },
        },
      },
      saving: {
        invoke: flow.run(saveTransaction),
        on: {
          START_A: {
            target: "saving",
            reenter: true,
            update: ({ context }) => ({
              ...context,
              draft: "A",
            }),
          },
          START_B: {
            target: "saving",
            reenter: true,
            update: ({ context }) => ({
              ...context,
              draft: "B",
            }),
          },
          STOP: {
            target: "idle",
            update: ({ context }) => ({
              ...context,
              draft: "",
            }),
          },
          SAVED: {
            target: "idle",
            update: ({ context, event }) =>
              event.type === "SAVED"
                ? {
                    draft: "",
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
  command: TransactionCommand,
): Readonly<{ readonly type: "START_A" | "START_B" | "STOP" }> | undefined {
  switch (command) {
    case "START_A":
      return { type: "START_A" };
    case "START_B":
      return { type: "START_B" };
    case "STOP":
      return { type: "STOP" };
    default:
      return undefined;
  }
}

function expectOracleIssue(
  issues: ReadonlyArray<{ readonly kind: string; readonly source: string; readonly id: string }>,
  oracle: OracleState,
) {
  if (oracle.issue === null) {
    expect(issues).toEqual([]);
    return;
  }

  expect(issues).toEqual([
    expect.objectContaining({
      kind: oracle.issue,
      source: "transaction",
      id: transactionId,
    }),
  ]);
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

function successReceiptCount(
  receipts: ReadonlyArray<{
    readonly id?: string;
    readonly type: string;
  }>,
) {
  return receipts.filter(
    (receipt) => receipt.id === transactionId && receipt.type === "transaction:success",
  ).length;
}

function completeSurfaceCommand(
  controls: ReturnType<typeof createAbortableSaveNameLayer>,
  oracle: OracleState,
  command: "COMPLETE_OLDEST" | "COMPLETE_NEWEST",
) {
  const candidates = oracle.attempts.filter((attempt) => !attempt.completed);
  const target = command === "COMPLETE_OLDEST" ? candidates[0] : candidates[candidates.length - 1];
  expect(target).toBeDefined();
  controls.succeedEntryAt(target!.id - 1);
}

async function settleRawCompletionTurn() {
  await Promise.resolve();
}

async function expectFlowTestSequenceMatchesOracle(commands: ReadonlyArray<TransactionCommand>) {
  const controls = createAbortableSaveNameLayer();
  const machine = createTransactionMachine();
  const harness = flowTest(machine).provide(controls.layer).start();
  let oracle = initialOracleState();

  const assertCurrent = () => {
    expect(harness.state()).toBe(oracle.value);
    expect(harness.context()).toEqual({
      draft: oracle.draft,
      savedNames: oracle.savedNames,
    });
    expect(harness.pendingWork().ready).toBe(oracle.pending.length + oracle.deferred.length);
    expectOracleTransaction(harness.snapshot().transactions[transactionId], oracle);
    expectOracleIssue(harness.issues(), oracle);
    expect(controls.calls).toEqual(oracle.attempts.map((attempt) => attempt.name));
  };

  assertCurrent();

  for (const command of [...commands, "FLUSH" as const]) {
    const event = commandEvent(command);
    if (event !== undefined) {
      harness.send(event);
    } else if (command === "COMPLETE_OLDEST" || command === "COMPLETE_NEWEST") {
      const incompleteAttempts = oracle.attempts.filter((attempt) => !attempt.completed);
      if (incompleteAttempts.length > 0) {
        completeSurfaceCommand(controls, oracle, command);
        await settleRawCompletionTurn();
        await harness.flush();
      }
    } else {
      await harness.flush();
    }

    oracle = applyOracleCommand(oracle, command);
    assertCurrent();
  }
}

async function expectRuntimeSequenceMatchesOracle(commands: ReadonlyArray<TransactionCommand>) {
  const controls = createAbortableSaveNameLayer();
  const machine = createTransactionMachine();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38TransactionRuntime", {
            machines: {
              transaction: machine,
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
    expect(actor.snapshot().value).toBe(oracle.value);
    expect(actor.snapshot().context).toEqual({
      draft: oracle.draft,
      savedNames: oracle.savedNames,
    });
    expect(readyWorkPendingCount(actor)).toBe(oracle.pending.length + oracle.deferred.length);
    expectOracleTransaction(actor.snapshot().transactions[transactionId], oracle);
    expectOracleIssue(actor.issues(), oracle);
    expect(controls.calls).toEqual(oracle.attempts.map((attempt) => attempt.name));
  };

  try {
    assertCurrent();

    for (const command of [...commands, "FLUSH" as const]) {
      const event = commandEvent(command);
      if (event !== undefined) {
        actor.send(event);
      } else if (command === "COMPLETE_OLDEST" || command === "COMPLETE_NEWEST") {
        const incompleteAttempts = oracle.attempts.filter((attempt) => !attempt.completed);
        if (incompleteAttempts.length > 0) {
          completeSurfaceCommand(controls, oracle, command);
          await settleRawCompletionTurn();
          await actor.flush();
        }
      } else {
        await actor.flush();
      }

      oracle = applyOracleCommand(oracle, command);
      assertCurrent();
    }
  } finally {
    await runtime.dispose();
  }
}

async function expectSettledReentryStaysStaleInFlowTest() {
  const controls = createAbortableSaveNameLayer();
  const machine = createTransactionMachine();
  const harness = flowTest(machine).provide(controls.layer).start();

  harness.send({ type: "START_A" });
  controls.succeedEntryAt(0);
  harness.send({ type: "START_B" });

  expect(controls.calls).toEqual(["A", "B"]);
  expect(controls.entries[0]?.signal.aborted).toBe(true);
  expect(controls.entries[0]?.abortCount()).toBe(1);
  expect(harness.state()).toBe("saving");
  expect(harness.context()).toEqual({
    draft: "B",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(1);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(0);

  await settleRawCompletionTurn();
  await harness.flush();

  expect(harness.state()).toBe("saving");
  expect(harness.context()).toEqual({
    draft: "B",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(0);

  controls.succeedEntryAt(1);
  await settleRawCompletionTurn();
  await harness.flush();

  expect(harness.state()).toBe("idle");
  expect(harness.context()).toEqual({
    draft: "",
    savedNames: ["B"],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "success",
    value: "B",
  });
  expect(harness.issues()).toEqual([]);
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(1);
}

async function expectRawCompletionWaitsForExplicitFlushInFlowTest() {
  const controls = createAbortableSaveNameLayer();
  const machine = createTransactionMachine();
  const harness = flowTest(machine).provide(controls.layer).start();

  harness.send({ type: "START_A" });

  expect(controls.calls).toEqual(["A"]);
  expect(harness.state()).toBe("saving");
  expect(harness.context()).toEqual({
    draft: "A",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(0);

  controls.succeedEntryAt(0);

  expect(harness.state()).toBe("saving");
  expect(harness.context()).toEqual({
    draft: "A",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(0);

  await settleRawCompletionTurn();

  expect(harness.state()).toBe("saving");
  expect(harness.context()).toEqual({
    draft: "A",
    savedNames: [],
  });
  expect(harness.pendingWork().ready).toBe(1);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "pending",
  });
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(0);

  await harness.flush();

  expect(harness.state()).toBe("idle");
  expect(harness.context()).toEqual({
    draft: "",
    savedNames: ["A"],
  });
  expect(harness.pendingWork().ready).toBe(0);
  expect(harness.snapshot().transactions[transactionId]).toMatchObject({
    status: "success",
    value: "A",
  });
  expect(harness.issues()).toEqual([]);
  expect(successReceiptCount(harness.snapshot().receipts)).toBe(1);
}

async function expectSettledReentryStaysStaleInRuntime() {
  const controls = createAbortableSaveNameLayer();
  const machine = createTransactionMachine();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38TransactionRuntimeRace", {
            machines: {
              transaction: machine,
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
    actor.send({ type: "START_A" });
    controls.succeedEntryAt(0);
    actor.send({ type: "START_B" });

    expect(controls.calls).toEqual(["A", "B"]);
    expect(controls.entries[0]?.signal.aborted).toBe(true);
    expect(controls.entries[0]?.abortCount()).toBe(1);
    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().context).toEqual({
      draft: "B",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(1);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(0);

    await settleRawCompletionTurn();
    await actor.flush();

    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().context).toEqual({
      draft: "B",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(0);

    controls.succeedEntryAt(1);
    await settleRawCompletionTurn();
    await actor.flush();

    expect(actor.snapshot().value).toBe("idle");
    expect(actor.snapshot().context).toEqual({
      draft: "",
      savedNames: ["B"],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "success",
      value: "B",
    });
    expect(actor.issues()).toEqual([]);
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(1);
  } finally {
    await runtime.dispose();
  }
}

async function expectRawCompletionWaitsForExplicitFlushInRuntime() {
  const controls = createAbortableSaveNameLayer();
  const machine = createTransactionMachine();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38TransactionRuntimeCompletionBoundary", {
            machines: {
              transaction: machine,
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
    actor.send({ type: "START_A" });

    expect(controls.calls).toEqual(["A"]);
    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().context).toEqual({
      draft: "A",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(0);

    controls.succeedEntryAt(0);

    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().context).toEqual({
      draft: "A",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(0);

    await settleRawCompletionTurn();

    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().context).toEqual({
      draft: "A",
      savedNames: [],
    });
    expect(readyWorkPendingCount(actor)).toBe(1);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "pending",
    });
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(0);

    await actor.flush();

    expect(actor.snapshot().value).toBe("idle");
    expect(actor.snapshot().context).toEqual({
      draft: "",
      savedNames: ["A"],
    });
    expect(readyWorkPendingCount(actor)).toBe(0);
    expect(actor.snapshot().transactions[transactionId]).toMatchObject({
      status: "success",
      value: "A",
    });
    expect(actor.issues()).toEqual([]);
    expect(successReceiptCount(actor.snapshot().receipts)).toBe(1);
  } finally {
    await runtime.dispose();
  }
}

describe("transaction interleaving oracle", () => {
  it("matches the independent stale-publication oracle in flowTest", async () => {
    await FastCheck.assert(
      FastCheck.asyncProperty(
        FastCheck.array(transactionCommandArbitrary, {
          maxLength: 10,
        }),
        async (commands) => {
          await expectFlowTestSequenceMatchesOracle(commands);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("matches the independent stale-publication oracle in runtime actors", async () => {
    await FastCheck.assert(
      FastCheck.asyncProperty(
        FastCheck.array(transactionCommandArbitrary, {
          maxLength: 10,
        }),
        async (commands) => {
          await expectRuntimeSequenceMatchesOracle(commands);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("keeps a settled state-owned completion latent until explicit flush in flowTest", async () => {
    await expectRawCompletionWaitsForExplicitFlushInFlowTest();
  });

  it("keeps a settled state-owned completion latent until explicit flush in runtime actors", async () => {
    await expectRawCompletionWaitsForExplicitFlushInRuntime();
  });

  it("keeps a settled state-owned completion stale after immediate reentry in flowTest", async () => {
    await expectSettledReentryStaysStaleInFlowTest();
  });

  it("keeps a settled state-owned completion stale after immediate reentry in runtime actors", async () => {
    await expectSettledReentryStaysStaleInRuntime();
  });
});
