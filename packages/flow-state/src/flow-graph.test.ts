import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { graphOf } from "./inspect.js";
import { test } from "./testing.js";

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

  it("includes terminal status, child specs, timed transitions, and eventless transitions", () => {
    const childMachine = flow.machine<{}, never, "idle">({
      id: "flow-graph.child-machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }>,
      "draft" | "review" | "timedOut"
    >({
      id: "flow-graph.metadata-machine",
      initial: "draft",
      context: () => ({}),
      states: {
        draft: {
          invoke: flow.child({
            id: "autosave",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
          after: flow.after({
            id: "graph.timeout",
            delay: "1 second",
            target: "timedOut",
          }),
          always: {
            target: "review",
          },
        },
        review: {},
        timedOut: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const draft = graph.nodes.find((node) => node.id === "draft");
    const timedOut = graph.nodes.find((node) => node.id === "timedOut");

    expect(draft).toMatchObject({
      terminal: false,
      childSpecs: [
        {
          id: "autosave",
          machineId: childMachine.id,
          supervision: "continue-on-failure",
        },
      ],
      timedTransitions: [
        {
          id: "graph.timeout",
          delay: "1 second",
          target: "timedOut",
        },
      ],
      eventlessTransitions: [
        {
          id: "draft:always:0",
          target: "review",
        },
      ],
    });
    expect(timedOut).toMatchObject({
      terminal: true,
      childSpecs: [],
      timedTransitions: [],
      eventlessTransitions: [],
    });
  });

  it("answers basic graph queries without reopening machine config", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.queries-machine",
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

    expect(graph.findState("review")).toMatchObject({
      id: "review",
      terminal: false,
    });
    expect(graph.outgoingEvents("draft")).toEqual(["SET_NAME", "REVIEW"]);
    expect(
      graph.incomingEdges("published").map((edge) => ({
        source: edge.source,
        eventType: edge.eventType,
      })),
    ).toEqual([
      {
        source: "review",
        eventType: "PUBLISH",
      },
    ]);
    expect(graph.reachableStates().map((node) => node.id)).toEqual([
      "draft",
      "review",
      "published",
    ]);
  });

  it("shares path traversal behavior with test.model and supports explicit event playback", () => {
    type GuardedEvent =
      | Readonly<{ readonly type: "NEXT" }>
      | Readonly<{ readonly type: "ALLOW" }>
      | Readonly<{ readonly type: "PROCEED" }>;

    const machine = flow.machine<
      { readonly allowed: boolean },
      GuardedEvent,
      "start" | "idle" | "done"
    >({
      id: "flow-graph.path-machine",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: {
              target: "idle",
            },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const model = test.model(machine);
    const reachesDone = (snapshot: Readonly<{ readonly value: string }>) =>
      snapshot.value === "done";

    expect(
      graph
        .shortestPaths({
          toState: reachesDone,
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([["NEXT", "ALLOW", "PROCEED"]]);
    expect(
      model
        .getShortestPaths({
          toState: reachesDone,
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([["NEXT", "ALLOW", "PROCEED"]]);
    expect(
      graph
        .simplePaths({
          toState: reachesDone,
          maxDepth: 2,
        })
        .map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual([]);

    const path = graph.pathFromEvents([{ type: "NEXT" }, { type: "ALLOW" }, { type: "PROCEED" }]);

    expect(path?.steps.map((step) => step.event.type)).toEqual(["NEXT", "ALLOW", "PROCEED"]);
    expect(path?.state.value).toBe("done");
    expect(path?.description).toBe('Reaches state "done": NEXT -> ALLOW -> PROCEED');
    expect(graph.pathFromEvents([{ type: "PROCEED" }])).toBeUndefined();
  });

  it("exports a stable UI-independent JSON graph shape", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published"
    >({
      id: "flow-graph.json-machine",
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
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = graphOf(machine);
    const exported = graph.toJSON();

    expect(exported).toEqual({
      kind: "graph",
      machineId: machine.id,
      initial: "draft",
      nodes: [
        {
          id: "draft",
          terminal: false,
          childSpecs: [],
          timedTransitions: [],
          eventlessTransitions: [],
        },
        {
          id: "review",
          terminal: false,
          childSpecs: [],
          timedTransitions: [],
          eventlessTransitions: [],
        },
        {
          id: "published",
          terminal: true,
          childSpecs: [],
          timedTransitions: [],
          eventlessTransitions: [],
        },
      ],
      edges: [
        {
          id: "draft:SET_NAME:0",
          source: "draft",
          target: "draft",
          eventType: "SET_NAME",
          label: "SET_NAME",
        },
        {
          id: "draft:REVIEW:0",
          source: "draft",
          target: "review",
          eventType: "REVIEW",
          label: "REVIEW",
        },
        {
          id: "review:PUBLISH:0",
          source: "review",
          target: "published",
          eventType: "PUBLISH",
          label: "PUBLISH",
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(graph))).toEqual(exported);
  });
});
