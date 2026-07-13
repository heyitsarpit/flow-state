import { FastCheck } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { readyWorkPendingCount } from "./core/scheduling/ready-work.js";
import { createControlledStream, flowTest } from "./testing.js";

type StreamCommand = "START" | "STOP" | "EMIT_A" | "EMIT_B" | "FLUSH";
type StreamEvent =
  | Readonly<{ readonly type: "START" }>
  | Readonly<{ readonly type: "STOP" }>
  | Readonly<{ readonly type: "TOKEN"; readonly token: string }>;
type StreamState = "idle" | "streaming";

const streamCommandArbitrary = FastCheck.constantFrom<StreamCommand>(
  "START",
  "STOP",
  "EMIT_A",
  "EMIT_B",
  "FLUSH",
);

const streamId = "BT38.tokenStream";

type OracleStreamSnapshot = Readonly<{
  readonly status: "running" | "interrupt";
  readonly generation: number;
  readonly emitted: number;
  readonly value?: string;
}>;

type OraclePendingToken = Readonly<{
  readonly generation: number;
  readonly token: string;
}>;

type OracleState = Readonly<{
  readonly value: StreamState;
  readonly partial: string;
  readonly nextGeneration: number;
  readonly hasSubscribed: boolean;
  readonly sourceBuffer: ReadonlyArray<string>;
  readonly activeGeneration: number | undefined;
  readonly stream: OracleStreamSnapshot | undefined;
  readonly issue: "interrupt" | null;
  readonly pending: ReadonlyArray<OraclePendingToken>;
  readonly deferred: ReadonlyArray<OraclePendingToken>;
}>;

function initialOracleState(): OracleState {
  return {
    value: "idle",
    partial: "",
    nextGeneration: 0,
    hasSubscribed: false,
    sourceBuffer: [],
    activeGeneration: undefined,
    stream: undefined,
    issue: null,
    pending: [],
    deferred: [],
  };
}

function applyReadyToken(current: OracleState, pending: OraclePendingToken): OracleState {
  if (
    current.value !== "streaming" ||
    current.activeGeneration === undefined ||
    current.stream?.status !== "running" ||
    pending.generation !== current.activeGeneration
  ) {
    return current;
  }

  return {
    ...current,
    partial: `${current.partial}${pending.token}`,
    stream: {
      ...current.stream,
      emitted: current.stream.emitted + 1,
      value: pending.token,
    },
  };
}

function flushPendingOracle(current: OracleState): OracleState {
  let next = current;
  for (const pending of current.pending) {
    next = applyReadyToken(next, pending);
  }
  return {
    ...next,
    pending: [],
  };
}

function applyDispatchEvent(current: OracleState, command: "START" | "STOP"): OracleState {
  switch (command) {
    case "START": {
      if (current.value !== "idle") {
        return current;
      }

      const generation = current.nextGeneration + 1;
      return {
        value: "streaming",
        partial: "",
        nextGeneration: generation,
        hasSubscribed: true,
        sourceBuffer: [],
        activeGeneration: generation,
        stream: {
          status: "running",
          generation,
          emitted: 0,
        },
        issue: null,
        pending: current.pending,
        deferred: [
          ...current.deferred,
          ...current.sourceBuffer.map((token) => ({
            generation,
            token,
          })),
        ],
      };
    }

    case "STOP": {
      if (current.value !== "streaming" || current.stream?.status !== "running") {
        return current;
      }

      return {
        value: "idle",
        partial: "",
        nextGeneration: current.nextGeneration,
        hasSubscribed: current.hasSubscribed,
        sourceBuffer: current.sourceBuffer,
        activeGeneration: undefined,
        stream: {
          ...current.stream,
          status: "interrupt",
        },
        issue: "interrupt",
        pending: current.pending,
        deferred: current.deferred,
      };
    }
  }
}

function applyDispatchCommand(current: OracleState, command: "START" | "STOP"): OracleState {
  return applyDispatchEvent(flushPendingOracle(current), command);
}

function applyOracleCommand(current: OracleState, command: StreamCommand): OracleState {
  switch (command) {
    case "START":
    case "STOP": {
      return applyDispatchCommand(current, command);
    }

    case "EMIT_A":
    case "EMIT_B": {
      const token = command === "EMIT_A" ? "A" : "B";

      if (current.activeGeneration === undefined) {
        return current.hasSubscribed
          ? current
          : {
              ...current,
              sourceBuffer: [...current.sourceBuffer, token],
            };
      }

      return {
        ...current,
        pending: [
          ...current.pending,
          {
            generation: current.activeGeneration,
            token,
          },
        ],
      };
    }

    case "FLUSH": {
      return flushPendingOracle({
        ...current,
        pending: [...current.pending, ...current.deferred],
        deferred: [],
      });
    }
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
      source: "stream",
      id: streamId,
    }),
  ]);
}

function expectOracleStream(
  observed:
    | Readonly<{
        readonly status?: string;
        readonly generation?: number;
        readonly emitted?: number;
        readonly value?: unknown;
      }>
    | undefined,
  oracle: OracleState,
) {
  if (oracle.stream === undefined) {
    expect(observed).toBeUndefined();
    return;
  }

  expect(observed).toMatchObject(oracle.stream);
}

function createStreamMachineForTokens(
  tokens: ReturnType<typeof createControlledStream<string, never>>,
) {
  return flow.machine<{ readonly partial: string }, StreamEvent, StreamState>({
    id: "bt38.stream.machine",
    initial: "idle",
    context: () => ({ partial: "" }),
    states: {
      idle: {
        on: {
          START: {
            target: "streaming",
            update: () => ({ partial: "" }),
          },
        },
      },
      streaming: {
        invoke: flow.stream({
          id: streamId,
          subscribe: () => tokens.stream(),
          routes: {
            value: (token: string) => ({ type: "TOKEN", token }),
          },
        }),
        on: {
          STOP: {
            target: "idle",
            update: () => ({ partial: "" }),
          },
          TOKEN: {
            update: ({ context, event }) =>
              event.type === "TOKEN" ? { partial: `${context.partial}${event.token}` } : {},
          },
        },
      },
    },
  });
}

function commandEvent(command: StreamCommand): StreamEvent | undefined {
  switch (command) {
    case "START":
      return { type: "START" };
    case "STOP":
      return { type: "STOP" };
    default:
      return undefined;
  }
}

async function expectFlowTestSequenceMatchesOracle(commands: ReadonlyArray<StreamCommand>) {
  const tokens = createControlledStream<string, never>("bt38.flow-test.stream");
  const machine = createStreamMachineForTokens(tokens);
  const harness = flowTest(machine).start();
  let oracle = initialOracleState();

  const assertCurrent = () => {
    expect(harness.state()).toBe(oracle.value);
    expect(harness.context()).toEqual({ partial: oracle.partial });
    expect(harness.pendingWork().ready).toBe(oracle.pending.length + oracle.deferred.length);
    expectOracleStream(harness.streams().all()[streamId], oracle);
    expectOracleIssue(harness.issues(), oracle);
  };

  assertCurrent();

  for (const command of [...commands, "FLUSH" as const]) {
    const event = commandEvent(command);
    if (event !== undefined) {
      harness.send(event);
    } else if (command === "EMIT_A") {
      tokens.emit("A");
    } else if (command === "EMIT_B") {
      tokens.emit("B");
    } else {
      await harness.flush();
    }

    oracle = applyOracleCommand(oracle, command);
    assertCurrent();
  }
}

async function expectRuntimeSequenceMatchesOracle(commands: ReadonlyArray<StreamCommand>) {
  const tokens = createControlledStream<string, never>("bt38.runtime.stream");
  const machine = createStreamMachineForTokens(tokens);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38Runtime", {
            machines: {
              stream: machine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
  );
  const actor = runtime.createActor(machine);
  let oracle = initialOracleState();

  const assertCurrent = () => {
    expect(actor.snapshot().value).toBe(oracle.value);
    expect(actor.snapshot().context).toEqual({ partial: oracle.partial });
    expect(readyWorkPendingCount(actor)).toBe(oracle.pending.length + oracle.deferred.length);
    expectOracleStream(actor.snapshot().streams[streamId], oracle);
    expectOracleIssue(actor.issues(), oracle);
  };

  try {
    assertCurrent();

    for (const command of [...commands, "FLUSH" as const]) {
      const event = commandEvent(command);
      if (event !== undefined) {
        actor.send(event);
      } else if (command === "EMIT_A") {
        tokens.emit("A");
      } else if (command === "EMIT_B") {
        tokens.emit("B");
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

describe("stream interleaving oracle", () => {
  it("matches the independent stale-publication oracle in flowTest", async () => {
    await FastCheck.assert(
      FastCheck.asyncProperty(
        FastCheck.array(streamCommandArbitrary, {
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
        FastCheck.array(streamCommandArbitrary, {
          maxLength: 10,
        }),
        async (commands) => {
          await expectRuntimeSequenceMatchesOracle(commands);
        },
      ),
      { numRuns: 40 },
    );
  });
});
