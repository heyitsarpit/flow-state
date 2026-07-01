import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { graphOf } from "./inspect.js";

describe("flow graph descriptors", () => {
  it("projects event transitions into explicit nodes, edges, and the initial state", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.project-machine",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            REOPEN: "draft",
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);

    expect(graph.kind).toBe("graph");
    expect(graph.machine).toBe(machine);
    expect(graph.initial).toBe("draft");
    expect(graph.nodes.map((node) => node.id)).toEqual(["draft", "review", "published"]);
    expect(graph.edges).toMatchObject([
      {
        source: "draft",
        target: "draft",
        eventType: "SET_NAME",
        label: "SET_NAME",
      },
      {
        source: "draft",
        target: "review",
        eventType: "REVIEW",
        label: "REVIEW",
      },
      {
        source: "review",
        target: "draft",
        eventType: "REOPEN",
        label: "REOPEN",
      },
      {
        source: "review",
        target: "published",
        eventType: "PUBLISH",
        label: "PUBLISH",
      },
    ]);
  });
});
