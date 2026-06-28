import { Effect } from "effect";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "../public/flow.js";
import { createKey } from "../public/keys.js";
import { FlowProvider } from "./provider.js";

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
});
