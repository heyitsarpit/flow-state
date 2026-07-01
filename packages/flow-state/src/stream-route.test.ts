import { describe, expect, it } from "vite-plus/test";

import { resolveStreamRouteEvent } from "./core/streams/stream-callbacks.js";

type StreamEvent =
  | Readonly<{ readonly type: "TOKEN"; readonly token: string }>
  | Readonly<{ readonly type: "DONE" }>
  | Readonly<{ readonly type: "FAILED"; readonly error: "denied" }>
  | Readonly<{ readonly type: "DEFECT"; readonly cause: unknown }>
  | Readonly<{ readonly type: "INTERRUPTED" }>;

describe("stream route resolution", () => {
  it("resolves each stream route lane", () => {
    const routes = {
      value: (token: string) => ({ type: "TOKEN", token }) as const,
      done: () => ({ type: "DONE" }) as const,
      failure: (error: "denied") => ({ type: "FAILED", error }) as const,
      defect: (cause: unknown) => ({ type: "DEFECT", cause }) as const,
      interrupt: () => ({ type: "INTERRUPTED" }) as const,
    };

    expect(resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "value", "a")).toEqual({
      type: "TOKEN",
      token: "a",
    });
    expect(resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "done")).toEqual({
      type: "DONE",
    });
    expect(
      resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "failure", "denied"),
    ).toEqual({
      type: "FAILED",
      error: "denied",
    });
    expect(
      resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "defect", "boom"),
    ).toEqual({
      type: "DEFECT",
      cause: "boom",
    });
    expect(resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "interrupt")).toEqual({
      type: "INTERRUPTED",
    });
  });

  it("rejects mismatched payloads for selected stream lanes at type-check time", () => {
    const routes = {
      value: (token: string) => ({ type: "TOKEN", token }) as const,
      done: () => ({ type: "DONE" }) as const,
      failure: (error: "denied") => ({ type: "FAILED", error }) as const,
      defect: (cause: unknown) => ({ type: "DEFECT", cause }) as const,
      interrupt: () => ({ type: "INTERRUPTED" }) as const,
    };

    // @ts-expect-error done routes do not accept payloads
    resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "done", "a");
    // @ts-expect-error value routes require a value payload
    resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "value");
    // @ts-expect-error failure routes require the stream error payload
    resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "failure", "oops");
    // @ts-expect-error interrupt routes do not accept a defect payload
    resolveStreamRouteEvent<string, "denied", StreamEvent>(routes, "interrupt", "boom");
  });
});
