import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, flow, selectView } from "./index.js";

describe("views", () => {
  it("selectView can project every snapshot surface plus issues", () => {
    const machine = flow.machine<
      { readonly selectedId: string | null },
      { readonly type: "NOOP" },
      "active"
    >({
      id: "views.synthetic",
      initial: "active",
      context: () => ({ selectedId: null }),
      states: {
        active: {},
      },
    });

    const view = flow.view<
      { readonly selectedId: string | null },
      "active",
      {
        readonly selectedId: string | null;
        readonly resourceIds: readonly string[];
        readonly transactionIds: readonly string[];
        readonly streamIds: readonly string[];
        readonly timerIds: readonly string[];
        readonly childIds: readonly string[];
        readonly issueIds: readonly string[];
        readonly receiptTypes: readonly string[];
      }
    >({
      id: "views.synthetic.projection",
      sources: [
        "context",
        "resources",
        "transactions",
        "streams",
        "timers",
        "children",
        "issues",
        "receipts",
      ],
      select: ({
        context,
        resources,
        transactions,
        streams,
        timers,
        children,
        issues,
        receipts,
      }) => ({
        selectedId: context.selectedId,
        resourceIds: Object.keys(resources),
        transactionIds: Object.keys(transactions),
        streamIds: Object.keys(streams),
        timerIds: Object.keys(timers),
        childIds: Object.keys(children),
        issueIds: issues.map((issue) => issue.id),
        receiptTypes: receipts.map((receipt) => receipt.type),
      }),
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      context: { selectedId: "project-1" },
      resources: {
        "Project.byId": {
          id: "Project.byId",
          status: "success" as const,
          availability: "value" as const,
          activity: "idle" as const,
          freshness: "fresh" as const,
          value: { id: "project-1", name: "Atlas" },
          isPlaceholderData: false,
        },
      },
      transactions: {
        "Project.save": {
          id: "Project.save",
          status: "failure" as const,
          error: "conflict",
        },
      },
      streams: {
        "Chat.tokens": {
          id: "Chat.tokens",
          status: "failure" as const,
          generation: 2,
          emitted: 1,
          value: "Ready",
          error: "offline",
        },
      },
      timers: {
        "Launch.refresh": {
          id: "Launch.refresh",
          status: "interrupt" as const,
          generation: 1,
          parentState: "active",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      children: {
        "child.worker": {
          id: "child.worker",
          status: "active" as const,
          actorId: "views.synthetic/child.worker",
          state: "running",
          parentState: "active",
        },
      },
      receipts: [
        {
          type: "transaction:failure",
          id: "Project.save",
        },
        {
          type: "stream:failure",
          id: "Chat.tokens",
        },
      ],
    });

    expect(
      selectView(snapshot, view, {
        issues: [
          {
            kind: "failure",
            source: "transaction",
            id: "Project.save",
            error: "conflict",
          },
        ],
      }),
    ).toEqual({
      selectedId: "project-1",
      resourceIds: ["Project.byId"],
      transactionIds: ["Project.save"],
      streamIds: ["Chat.tokens"],
      timerIds: ["Launch.refresh"],
      childIds: ["child.worker"],
      issueIds: ["Project.save"],
      receiptTypes: ["transaction:failure", "stream:failure"],
    });
  });

  it("flow.useView includes live actor issues in projections", async () => {
    const tokens = createControlledStream<string, "offline">("views.runtime.failure");
    const machine = flow.machine<
      { readonly partial: string },
      { readonly type: "START" } | { readonly type: "TOKEN"; readonly token: string },
      "idle" | "streaming"
    >({
      id: "views.runtime.machine",
      initial: "idle",
      context: () => ({ partial: "" }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "View.failureStream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token}` } : {},
            },
          },
        },
      },
    });

    const view = flow.view<
      { readonly partial: string },
      "idle" | "streaming",
      {
        readonly partial: string;
        readonly streamStatus: string;
        readonly issueCount: number;
        readonly latestIssueId: string | null;
        readonly receiptTypes: readonly string[];
      }
    >({
      id: "views.runtime.issueProjection",
      sources: ["context", "streams", "issues", "receipts"],
      select: ({ context, streams, issues, receipts }) => ({
        partial: context.partial,
        streamStatus: streams["View.failureStream"]?.status ?? "idle",
        issueCount: issues.length,
        latestIssueId: issues.at(-1)?.id ?? null,
        receiptTypes: receipts
          .filter(
            (receipt) => typeof receipt.type === "string" && receipt.type.startsWith("stream:"),
          )
          .map((receipt) => receipt.type),
      }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test({ namespace: "views-runtime" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.createActor(machine);
    actor.send({ type: "START" });
    tokens.emit("Ready");
    await actor.flush();
    tokens.fail("offline");
    await actor.flush();

    expect(flow.useView(actor, view)).toEqual({
      partial: "Ready",
      streamStatus: "failure",
      issueCount: 1,
      latestIssueId: "View.failureStream",
      receiptTypes: ["stream:start", "stream:failure"],
    });
    expect(
      selectView(actor.snapshot(), view, {
        issues: actor.issues(),
      }),
    ).toEqual(flow.useView(actor, view));

    await actor.dispose();
    await runtime.dispose();
  });
});
