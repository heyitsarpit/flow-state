// @vitest-environment happy-dom

import { Effect } from "effect";
import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "../public/flow.js";
import { createKey } from "../public/keys.js";
import type { FlowResourceSnapshot, FlowRuntime } from "../public/types.js";
import { FlowProvider } from "./provider.js";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "react.useResource.project",
  key: (projectId) => createKey("project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Unexpected lookup",
    }),
});

function createTestRuntime(namespace: string) {
  return flow.runtime(
    flow.app({ modules: [] }).layer({
      store: flow.store.test({ namespace }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
    }),
  );
}

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("flow.useResource", () => {
  it("renders the current runtime resource snapshot through FlowProvider", async () => {
    const runtime = createTestRuntime("react-use-resource");
    const projectRef = projectResource.ref("project-1");

    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: { id: "project-1", name: "React hook project" },
      },
    ]);

    const Reader = (): React.ReactElement => {
      const snapshot = flow.useResource(projectRef);
      return createElement(
        "span",
        null,
        `${snapshot?.status}:${snapshot?.value?.name ?? "missing"}`,
      );
    };

    expect(
      renderToStaticMarkup(
        createElement(FlowProvider, {
          runtime,
          children: createElement(Reader),
        }),
      ),
    ).toBe("<span>success:React hook project</span>");

    await runtime.dispose();
  });

  it("updates live without resubscribing and unsubscribes once on unmount", async () => {
    const runtime = createTestRuntime("react-use-resource-live");
    const projectRef = projectResource.ref("project-1");
    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    let subscribeCount = 0;
    let unsubscribeCount = 0;
    let disposeCalls = 0;
    const instrumentedRuntime = {
      ...runtime,
      resources: {
        ...runtime.resources,
        subscribe: (ref, listener) => {
          subscribeCount += 1;
          const unsubscribe = runtime.resources.subscribe(ref, listener);
          return () => {
            unsubscribeCount += 1;
            unsubscribe();
          };
        },
      },
      dispose: async () => {
        disposeCalls += 1;
        return runtime.dispose();
      },
    } satisfies FlowRuntime;

    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      const snapshot = flow.useResource(projectRef);
      return createElement("span", null, snapshot?.value?.name ?? "missing");
    };

    try {
      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader),
          }),
        );
      });

      expect(container.textContent).toBe("Seeded");
      expect(subscribeCount).toBe(1);
      expect(unsubscribeCount).toBe(0);

      await act(async () => {
        instrumentedRuntime.resources.patch(projectRef, (current) => ({
          ...current,
          id: "project-1",
          name: "Updated",
        }));
      });

      expect(container.textContent).toBe("Updated");
      expect(subscribeCount).toBe(1);
      expect(unsubscribeCount).toBe(0);

      await act(async () => {
        root.unmount();
      });

      expect(unsubscribeCount).toBe(1);
      expect(disposeCalls).toBe(0);
    } finally {
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });

  it("reconciles a snapshot change between render and subscribe", async () => {
    const runtime = createTestRuntime("react-use-resource-race");
    const projectRef = projectResource.ref("project-1");
    const container = createContainer();
    const root = createRoot(container);

    let currentSnapshot: FlowResourceSnapshot<ProjectRecord> | null = {
      id: projectRef.id,
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "First" },
      isPlaceholderData: false,
    };

    const runtimeWithRacyResource = {
      ...runtime,
      resources: {
        ...runtime.resources,
        get: (() => currentSnapshot) as FlowRuntime["resources"]["get"],
        subscribe: (() => {
          currentSnapshot = {
            id: projectRef.id,
            status: "success",
            availability: "value",
            activity: "idle",
            freshness: "fresh",
            value: { id: "project-1", name: "Second" },
            isPlaceholderData: false,
          };
          return () => undefined;
        }) as FlowRuntime["resources"]["subscribe"],
      },
    } satisfies FlowRuntime;

    const Reader = (): ReactElement => {
      const snapshot = flow.useResource(projectRef);
      return createElement("span", null, snapshot?.value?.name ?? "missing");
    };

    try {
      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime: runtimeWithRacyResource,
            children: createElement(Reader),
          }),
        );
      });

      expect(container.textContent).toBe("Second");
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });
});
