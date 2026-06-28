import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey } from "../public/keys.js";
import type { FlowRuntimeTransport } from "./context.js";
import { createResourceSource } from "./resource-source.js";
import { flow } from "../public/flow.js";

describe("createResourceSource", () => {
  it("reads snapshots and forwards subscription cleanup through runtime resources", () => {
    const projectRef = flow
      .resource({
        id: "resource-source.project",
        key: (projectId: string) => createKey("resource-source", projectId),
        lookup: (_projectId: string) =>
          Effect.die(new Error("lookup should not run in source test")),
      })
      .ref("project-1");
    const snapshot = {
      id: projectRef.id,
      status: "success" as const,
      availability: "value" as const,
      activity: "idle" as const,
      freshness: "fresh" as const,
      value: { id: "project-1", name: "Source test" },
      isPlaceholderData: false,
    };
    let cleanupCalls = 0;
    let subscribeCalls = 0;
    let listenerCalls = 0;
    let getCalls = 0;
    let subscribedRef: typeof projectRef | null = null;
    const subscribe: FlowRuntimeTransport["resources"]["subscribe"] = (ref, listener) => {
      subscribeCalls += 1;
      subscribedRef = ref as typeof projectRef;
      listener(snapshot);
      return () => {
        cleanupCalls += 1;
      };
    };
    const runtime = {
      kind: "runtime" as const,
      resources: {
        seedResources: () => undefined,
        subscribe,
        patch: () => undefined,
        get: () => {
          getCalls += 1;
          return snapshot;
        },
      },
      orchestrators: {
        start: () => {
          throw new Error("not needed");
        },
        get: () => null,
        stop: async () => undefined,
      },
      createActor: () => {
        throw new Error("not needed");
      },
      dispose: async () => undefined,
    } satisfies FlowRuntimeTransport;

    const source = createResourceSource(runtime, projectRef);
    const listener = () => {
      listenerCalls += 1;
    };

    expect(source.getSnapshot()).toBe(snapshot);
    expect(getCalls).toBe(1);

    const unsubscribe = source.subscribe(listener);

    expect(subscribeCalls).toBe(1);
    expect(subscribedRef).toBe(projectRef);
    expect(listenerCalls).toBe(1);

    unsubscribe();
    expect(cleanupCalls).toBe(1);
  });
});
