import { describe, expect, it } from "vite-plus/test";

import { runInspectionScope } from "../../scripts/function-outputs/inspection-scope";

function createScopeProbe() {
  const releases: Array<string> = [];
  const dependencies = {
    acquireRuntime: () => ({ kind: "runtime" as const }),
    releaseRuntime: () => {
      releases.push("runtime");
    },
    acquireSinkSubscription: () => ({ kind: "sink-subscription" as const }),
    releaseSinkSubscription: () => {
      releases.push("sink-subscription");
    },
    acquireRuntimeSubscription: () => ({ kind: "runtime-subscription" as const }),
    releaseRuntimeSubscription: () => {
      releases.push("runtime-subscription");
    },
    acquireActor: () => ({ kind: "actor" as const }),
    releaseActor: () => {
      releases.push("actor");
    },
  };

  return { dependencies, releases } as const;
}

describe("function output collector cleanup", () => {
  it("releases every acquired inspection owner exactly once after a failed output write", async () => {
    const probe = createScopeProbe();

    await expect(
      runInspectionScope(probe.dependencies, async () => {
        throw new Error("output write failed");
      }),
    ).rejects.toThrow("output write failed");

    expect(probe.releases).toEqual([
      "actor",
      "runtime-subscription",
      "sink-subscription",
      "runtime",
    ]);
  });

  it("releases every acquired inspection owner exactly once after normal completion", async () => {
    const probe = createScopeProbe();

    await expect(runInspectionScope(probe.dependencies, async () => "complete")).resolves.toBe(
      "complete",
    );
    expect(probe.releases).toEqual([
      "actor",
      "runtime-subscription",
      "sink-subscription",
      "runtime",
    ]);
  });
});
