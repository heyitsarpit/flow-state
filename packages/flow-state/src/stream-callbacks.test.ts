import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./index.js";
import {
  resolveCoalescedStreamPressureKey,
  resolveStreamParams,
  resolveStreamRouteEventWithDiagnostics,
  resolveStreamSubscription,
} from "./core/streams/stream-callbacks.js";

type StreamEvent =
  | Readonly<{ readonly type: "TOKEN"; readonly token: string }>
  | Readonly<{ readonly type: "DONE" }>
  | Readonly<{ readonly type: "FAILED"; readonly error: "offline" }>
  | Readonly<{ readonly type: "DEFECT"; readonly cause: unknown }>
  | Readonly<{ readonly type: "INTERRUPTED" }>;

function expectStreamCallbackDiagnostic(
  thunk: () => unknown,
  callback:
    | "params"
    | "subscribe"
    | "pressure.key"
    | "routes.value"
    | "routes.done"
    | "routes.failure"
    | "routes.defect"
    | "routes.interrupt",
): FlowDiagnostic & { readonly cause?: unknown } {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-STREAM-001",
      title: `Stream callback '${callback}' threw for 'Stream.tokens'`,
      debug: {
        callback,
        cause: expect.objectContaining({
          message: `${callback} exploded`,
          name: "Error",
          stack: expect.any(String),
        }),
        streamId: "Stream.tokens",
      },
    });
    expect(
      (error.debug.cause as Readonly<{ readonly stack?: string }> | undefined)?.stack,
    ).toContain(`${callback} exploded`);

    return error as FlowDiagnostic & { readonly cause?: unknown };
  }

  throw new Error("expected stream callback to throw a FlowDiagnostic");
}

function expectCoalescedPressureStrategyDiagnostic(
  thunk: () => unknown,
  pressureStrategy: "queue" | null,
): void {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-STREAM-002",
      title: "Coalesced pressure requires 'coalesce-latest' for 'Stream.tokens'",
      debug: {
        strategy: pressureStrategy,
        streamId: "Stream.tokens",
      },
    });
    return;
  }

  throw new Error("expected coalesced stream pressure resolution to throw a FlowDiagnostic");
}

describe("stream callback resolution", () => {
  it("resolves params, subscribe, routes, and pressure callbacks from one stream definition", async () => {
    const stream = flow.stream<
      void,
      StreamEvent,
      { readonly projectId: string },
      string,
      "offline",
      never,
      "Stream.tokens"
    >({
      id: "Stream.tokens",
      params: (args) => ({ projectId: String(args.projectId) }),
      subscribe: ({ params }) => Stream.succeed(`token:${params.projectId}`),
      pressure: {
        strategy: "coalesce-latest",
        key: (value: string) => value,
      },
      routes: {
        value: (token) => ({ type: "TOKEN", token }),
        done: () => ({ type: "DONE" }),
        failure: (error) => ({ type: "FAILED", error }),
        defect: (cause) => ({ type: "DEFECT", cause }),
        interrupt: () => ({ type: "INTERRUPTED" }),
      },
    });

    const params = resolveStreamParams(stream, { projectId: "project-1" });
    expect(params).toEqual({ projectId: "project-1" });
    if (params === undefined) {
      throw new Error("expected stream params");
    }

    expect(
      await Effect.runPromise(
        Stream.runCollect(resolveStreamSubscription(stream, params)).pipe(
          Effect.map((values) => Array.from(values)),
        ),
      ),
    ).toEqual(["token:project-1"]);
    expect(resolveCoalescedStreamPressureKey(stream, stream.config.pressure, "a-1")).toBe("a-1");
    expect(resolveStreamRouteEventWithDiagnostics(stream, "value", "token")).toEqual({
      type: "TOKEN",
      token: "token",
    });
    expect(resolveStreamRouteEventWithDiagnostics(stream, "done")).toEqual({
      type: "DONE",
    });
    expect(resolveStreamRouteEventWithDiagnostics(stream, "failure", "offline")).toEqual({
      type: "FAILED",
      error: "offline",
    });
    expect(resolveStreamRouteEventWithDiagnostics(stream, "defect", "boom")).toEqual({
      type: "DEFECT",
      cause: "boom",
    });
    expect(resolveStreamRouteEventWithDiagnostics(stream, "interrupt")).toEqual({
      type: "INTERRUPTED",
    });
  });

  it("wraps synchronous stream callback throws in tagged diagnostics with preserved causes", () => {
    const paramsCause = new Error("params exploded");
    const subscribeCause = new Error("subscribe exploded");
    const pressureCause = new Error("pressure.key exploded");
    const valueCause = new Error("routes.value exploded");
    const doneCause = new Error("routes.done exploded");
    const failureCause = new Error("routes.failure exploded");
    const defectCause = new Error("routes.defect exploded");
    const interruptCause = new Error("routes.interrupt exploded");

    const throwingParams = flow.stream({
      id: "Stream.tokens",
      params: () => {
        throw paramsCause;
      },
      subscribe: () => Stream.empty,
    });
    const throwingSubscribe = flow.stream({
      id: "Stream.tokens",
      subscribe: () => {
        throw subscribeCause;
      },
    });
    const throwingPressure = flow.stream({
      id: "Stream.tokens",
      subscribe: () => Stream.empty,
      pressure: {
        strategy: "coalesce-latest" as const,
        key: () => {
          throw pressureCause;
        },
      },
    });
    const throwingRoutes = flow.stream<
      void,
      StreamEvent,
      void,
      string,
      "offline",
      never,
      "Stream.tokens"
    >({
      id: "Stream.tokens",
      subscribe: () => Stream.empty,
      routes: {
        value: () => {
          throw valueCause;
        },
        done: () => {
          throw doneCause;
        },
        failure: () => {
          throw failureCause;
        },
        defect: () => {
          throw defectCause;
        },
        interrupt: () => {
          throw interruptCause;
        },
      },
    });

    const paramsError = expectStreamCallbackDiagnostic(
      () => resolveStreamParams(throwingParams, {}),
      "params",
    );
    const subscribeError = expectStreamCallbackDiagnostic(
      () => resolveStreamSubscription(throwingSubscribe, undefined),
      "subscribe",
    );
    const pressureError = expectStreamCallbackDiagnostic(
      () =>
        resolveCoalescedStreamPressureKey(throwingPressure, throwingPressure.config.pressure, {
          assetId: "asset-1",
        }),
      "pressure.key",
    );
    const valueError = expectStreamCallbackDiagnostic(
      () => resolveStreamRouteEventWithDiagnostics(throwingRoutes, "value", "token"),
      "routes.value",
    );
    const doneError = expectStreamCallbackDiagnostic(
      () => resolveStreamRouteEventWithDiagnostics(throwingRoutes, "done"),
      "routes.done",
    );
    const failureError = expectStreamCallbackDiagnostic(
      () => resolveStreamRouteEventWithDiagnostics(throwingRoutes, "failure", "offline"),
      "routes.failure",
    );
    const defectError = expectStreamCallbackDiagnostic(
      () => resolveStreamRouteEventWithDiagnostics(throwingRoutes, "defect", "boom"),
      "routes.defect",
    );
    const interruptError = expectStreamCallbackDiagnostic(
      () => resolveStreamRouteEventWithDiagnostics(throwingRoutes, "interrupt"),
      "routes.interrupt",
    );

    expect(paramsError.cause).toBe(paramsCause);
    expect(subscribeError.cause).toBe(subscribeCause);
    expect(pressureError.cause).toBe(pressureCause);
    expect(valueError.cause).toBe(valueCause);
    expect(doneError.cause).toBe(doneCause);
    expect(failureError.cause).toBe(failureCause);
    expect(defectError.cause).toBe(defectCause);
    expect(interruptError.cause).toBe(interruptCause);
  });

  it("fails closed when coalesced pressure keys are requested without coalesce-latest pressure", () => {
    const missingPressure = flow.stream({
      id: "Stream.tokens",
      subscribe: () => Stream.empty,
    });
    const queuedPressure = flow.stream({
      id: "Stream.tokens",
      subscribe: () => Stream.empty,
      pressure: {
        strategy: "queue" as const,
        limit: 1,
      },
    });

    expectCoalescedPressureStrategyDiagnostic(
      () =>
        resolveCoalescedStreamPressureKey(missingPressure, missingPressure.config.pressure, "a"),
      null,
    );
    expectCoalescedPressureStrategyDiagnostic(
      () => resolveCoalescedStreamPressureKey(queuedPressure, queuedPressure.config.pressure, "a"),
      "queue",
    );
  });
});
