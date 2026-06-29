import { Effect, Equivalence } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./diagnostics.js";
import { createKey, flow, selectView } from "./index.js";
import { createControlledStream } from "./testing.js";
import { deriveSource, selectSource } from "./store/selected-source.js";

describe("views", () => {
  it("throws a tagged diagnostic from selectView when the projection throws", () => {
    const selectCause = new Error("select exploded");
    const machine = flow.machine<
      { readonly selectedId: string | null },
      { readonly type: "NOOP" },
      "active"
    >({
      id: "views.throwing-select.machine",
      initial: "active",
      context: () => ({ selectedId: "project-1" }),
      states: {
        active: {},
      },
    });
    const view = flow.view<
      { readonly selectedId: string | null },
      "active",
      { readonly selectedId: string | null }
    >({
      id: "views.throwingSelect",
      sources: ["context"],
      select: () => {
        throw selectCause;
      },
    });

    let failure: unknown;
    try {
      selectView(machine.getInitialSnapshot(), view);
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-VIEW-001",
      title: "View callback 'select' threw for 'views.throwingSelect'",
      debug: {
        callback: "select",
        cause: expect.objectContaining({
          message: "select exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        viewId: "views.throwingSelect",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("select exploded");
    expect((failure as { cause?: unknown }).cause).toBe(selectCause);
  });

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
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    actor.send({ type: "START" });
    tokens.emit("Ready");
    await actor.flush();
    tokens.fail("offline");
    await actor.flush();

    expect(
      selectView(actor.snapshot(), view, {
        issues: actor.issues(),
      }),
    ).toEqual({
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
    ).toEqual(
      selectView(actor.snapshot(), view, {
        issues: actor.issues(),
      }),
    );

    await actor.dispose();
    await runtime.dispose();
  });

  it("reading a view does not mutate actor state, receipts, or issues", async () => {
    const machine = flow.machine<
      { readonly selectedId: string | null },
      { readonly type: "OPEN"; readonly selectedId: string },
      "idle"
    >({
      id: "views.runtime.readonly",
      initial: "idle",
      context: () => ({ selectedId: null }),
      states: {
        idle: {
          on: {
            OPEN: {
              update: ({ event }) =>
                event.type === "OPEN" ? { selectedId: event.selectedId } : {},
            },
          },
        },
      },
    });

    const view = flow.view<
      { readonly selectedId: string | null },
      "idle",
      {
        readonly state: "idle";
        readonly selectedId: string | null;
        readonly issueCount: number;
        readonly receiptCount: number;
      }
    >({
      id: "views.runtime.readonlyProjection",
      sources: ["context", "issues", "receipts"],
      select: ({ context, value, issues, receipts }) => ({
        state: value,
        selectedId: context.selectedId,
        issueCount: issues.length,
        receiptCount: receipts.length,
      }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    actor.send({ type: "OPEN", selectedId: "project-7" });
    await actor.flush();

    const beforeSnapshot = actor.snapshot();
    const beforeIssues = actor.issues();
    const beforeReceipts = actor.receipts();

    expect(
      selectView(actor.snapshot(), view, {
        issues: actor.issues(),
      }),
    ).toEqual({
      state: "idle",
      selectedId: "project-7",
      issueCount: 0,
      receiptCount: beforeReceipts.length,
    });
    expect(
      selectView(actor.snapshot(), view, {
        issues: actor.issues(),
      }),
    ).toEqual({
      state: "idle",
      selectedId: "project-7",
      issueCount: 0,
      receiptCount: beforeReceipts.length,
    });
    expect(actor.snapshot()).toEqual(beforeSnapshot);
    expect(actor.issues()).toEqual(beforeIssues);
    expect(actor.receipts()).toEqual(beforeReceipts);

    await actor.dispose();
    await runtime.dispose();
  });

  it("view reads stay pure and do not restart runtime-owned effects", async () => {
    const lookups: string[] = [];
    const stream = createControlledStream<string, never>("views.runtime.pure");
    let streamStarts = 0;

    const projectResource = flow.resource<[projectId: string], { readonly id: string }>({
      id: "View.project",
      key: (projectId) => createKey("view", projectId),
      lookup: (projectId) =>
        Effect.sync(() => {
          lookups.push(projectId);
          return { id: projectId };
        }),
    });

    const childMachine = flow.machine<{}, never, "running">({
      id: "views.runtime.child",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const machine = flow.machine<{ readonly projectId: string }, never, "active">({
      id: "views.runtime.pureMachine",
      initial: "active",
      context: () => ({ projectId: "project-1" }),
      states: {
        active: {
          invoke: [
            flow.ensure(projectResource.ref("project-1")),
            flow.stream({
              id: "View.pureStream",
              subscribe: () => {
                streamStarts += 1;
                return stream.stream();
              },
            }),
            flow.child({
              id: "View.child",
              machine: childMachine,
            }),
          ],
          after: flow.after({
            id: "View.pureTimer",
            delay: "5 seconds",
            target: "active",
          }),
        },
      },
    });

    const view = flow.view<
      { readonly projectId: string },
      "active",
      {
        readonly projectId: string;
        readonly resourceStatus: string;
        readonly streamStatus: string;
        readonly timerStatus: string;
        readonly childStatus: string;
        readonly receiptCount: number;
      }
    >({
      id: "views.runtime.pureProjection",
      sources: ["context", "resources", "streams", "timers", "children", "receipts"],
      select: ({ context, resources, streams, timers, children, receipts }) => ({
        projectId: context.projectId,
        resourceStatus: resources["View.project"]?.status ?? "idle",
        streamStatus: streams["View.pureStream"]?.status ?? "idle",
        timerStatus: timers["View.pureTimer"]?.status ?? "idle",
        childStatus: children["View.child"]?.status ?? "idle",
        receiptCount: receipts.length,
      }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    await actor.flush();

    const baselineSnapshot = actor.snapshot();
    const baselineReceipts = actor.receipts();

    expect(lookups).toEqual(["project-1"]);
    expect(streamStarts).toBe(1);
    expect(baselineSnapshot.resources["View.project"]).toMatchObject({
      status: "success",
    });
    expect(baselineSnapshot.streams["View.pureStream"]).toMatchObject({
      status: "running",
    });
    expect(baselineSnapshot.timers["View.pureTimer"]).toMatchObject({
      status: "scheduled",
    });
    expect(baselineSnapshot.children["View.child"]).toMatchObject({
      status: "active",
    });

    const first = selectView(actor.snapshot(), view, {
      issues: actor.issues(),
    });
    const second = selectView(actor.snapshot(), view, {
      issues: actor.issues(),
    });
    const fromSnapshot = selectView(actor.snapshot(), view, {
      issues: actor.issues(),
    });

    expect(second).toEqual(first);
    expect(fromSnapshot).toEqual(first);
    expect(lookups).toEqual(["project-1"]);
    expect(streamStarts).toBe(1);
    expect(actor.snapshot()).toEqual(baselineSnapshot);
    expect(actor.receipts()).toEqual(baselineReceipts);
    expect(actor.issues()).toEqual([]);

    await actor.dispose();
    await runtime.dispose();
  });

  it("view selection sources read the latest actor snapshot even before subscribing", async () => {
    const machine = flow.machine<
      { readonly selectedId: string; readonly ignored: number },
      { readonly type: "SELECT"; readonly selectedId: string },
      "active"
    >({
      id: "views.runtime.selected-source-fresh",
      initial: "active",
      context: () => ({ selectedId: "project-1", ignored: 0 }),
      states: {
        active: {
          on: {
            SELECT: {
              update: ({ event }) =>
                event.type === "SELECT" ? { selectedId: event.selectedId } : {},
            },
          },
        },
      },
    });

    const view = flow.view<
      { readonly selectedId: string; readonly ignored: number },
      "active",
      { readonly selectedId: string }
    >({
      id: "views.runtime.selected-source-fresh.view",
      sources: ["context"],
      select: ({ context }) => ({
        selectedId: context.selectedId,
      }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    const viewSource = selectSource(
      actor,
      (snapshot) =>
        selectView(snapshot, view, {
          issues: actor.issues(),
        }),
      Equivalence.Struct({
        selectedId: Equivalence.String,
      }),
    );

    expect(viewSource.getSnapshot()).toEqual({ selectedId: "project-1" });

    actor.send({ type: "SELECT", selectedId: "project-2" });

    expect(viewSource.getSnapshot()).toEqual({ selectedId: "project-2" });

    await actor.dispose();
    await runtime.dispose();
  });

  it("view selection sources suppress stable notifications and detach from actors", async () => {
    const machine = flow.machine<
      { readonly selectedId: string; readonly ignored: number },
      { readonly type: "SELECT"; readonly selectedId: string } | { readonly type: "IGNORE" },
      "active"
    >({
      id: "views.runtime.selected-source-equality",
      initial: "active",
      context: () => ({ selectedId: "project-1", ignored: 0 }),
      states: {
        active: {
          on: {
            SELECT: {
              update: ({ event }) =>
                event.type === "SELECT" ? { selectedId: event.selectedId } : {},
            },
            IGNORE: {
              update: ({ context }) => ({ ignored: context.ignored + 1 }),
            },
          },
        },
      },
    });

    const view = flow.view<
      { readonly selectedId: string; readonly ignored: number },
      "active",
      { readonly selectedId: string }
    >({
      id: "views.runtime.selected-source-equality.view",
      sources: ["context"],
      select: ({ context }) => ({
        selectedId: context.selectedId,
      }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    const viewSource = selectSource(
      actor,
      (snapshot) =>
        selectView(snapshot, view, {
          issues: actor.issues(),
        }),
      Equivalence.Struct({
        selectedId: Equivalence.String,
      }),
    );

    const initialSelection = viewSource.getSnapshot();
    const notifications: Array<{ readonly selectedId: string }> = [];
    const unsubscribe = viewSource.subscribe(() => {
      notifications.push(viewSource.getSnapshot());
    });

    actor.send({ type: "IGNORE" });

    expect(notifications).toEqual([]);
    expect(viewSource.getSnapshot()).toBe(initialSelection);

    actor.send({ type: "SELECT", selectedId: "project-2" });

    expect(notifications).toEqual([{ selectedId: "project-2" }]);

    unsubscribe();
    actor.send({ type: "SELECT", selectedId: "project-3" });

    expect(notifications).toEqual([{ selectedId: "project-2" }]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) => receipt.type === "actor:subscribe" || receipt.type === "actor:unsubscribe",
        )
        .map((receipt) => receipt.type),
    ).toEqual(["actor:subscribe", "actor:unsubscribe"]);

    await actor.dispose();
    await runtime.dispose();
  });

  it("view selection graphs handle sibling projections with a single notification", async () => {
    const machine = flow.machine<
      { readonly count: number; readonly ignored: number },
      { readonly type: "INC" },
      "active"
    >({
      id: "views.runtime.derived.diamond",
      initial: "active",
      context: () => ({ count: 0, ignored: 0 }),
      states: {
        active: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1, ignored: context.ignored + 1 }),
            },
          },
        },
      },
    });

    const countView = flow.view<
      { readonly count: number; readonly ignored: number },
      "active",
      { readonly count: number }
    >({
      id: "views.runtime.derived.count",
      sources: ["context"],
      select: ({ context }) => ({ count: context.count }),
    });
    const parityView = flow.view<
      { readonly count: number; readonly ignored: number },
      "active",
      { readonly parity: number }
    >({
      id: "views.runtime.derived.parity",
      sources: ["context"],
      select: ({ context }) => ({ parity: context.count % 2 }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    const countSource = selectSource(
      actor,
      (snapshot) => selectView(snapshot, countView, { issues: actor.issues() }),
      Equivalence.Struct({ count: Equivalence.Number }),
    );
    const paritySource = selectSource(
      actor,
      (snapshot) => selectView(snapshot, parityView, { issues: actor.issues() }),
      Equivalence.Struct({ parity: Equivalence.Number }),
    );
    const summarySource = deriveSource([countSource, paritySource], ([count, parity]) => ({
      count: count.count,
      parity: parity.parity,
    }));
    const notifications: Array<{ readonly count: number; readonly parity: number }> = [];

    const unsubscribe = summarySource.subscribe(() => {
      notifications.push(summarySource.getSnapshot());
    });

    expect(summarySource.getSnapshot()).toEqual({ count: 0, parity: 0 });

    actor.send({ type: "INC" });

    expect(summarySource.getSnapshot()).toEqual({ count: 1, parity: 1 });
    expect(notifications).toEqual([{ count: 1, parity: 1 }]);

    unsubscribe();
    await actor.dispose();
    await runtime.dispose();
  });

  it("view selection graphs avoid stale intermediate reads across reused branches", async () => {
    const machine = flow.machine<
      { readonly count: number; readonly label: string },
      { readonly type: "INC" },
      "active"
    >({
      id: "views.runtime.derived.complex",
      initial: "active",
      context: () => ({ count: 1, label: "Count 1" }),
      states: {
        active: {
          on: {
            INC: {
              update: ({ context }) => {
                const nextCount = context.count + 1;
                return {
                  count: nextCount,
                  label: `Count ${nextCount}`,
                };
              },
            },
          },
        },
      },
    });

    const countView = flow.view<
      { readonly count: number; readonly label: string },
      "active",
      { readonly count: number }
    >({
      id: "views.runtime.derived.complex.count",
      sources: ["context"],
      select: ({ context }) => ({ count: context.count }),
    });
    const labelView = flow.view<
      { readonly count: number; readonly label: string },
      "active",
      { readonly label: string }
    >({
      id: "views.runtime.derived.complex.label",
      sources: ["context"],
      select: ({ context }) => ({ label: context.label }),
    });

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(machine);
    const countSource = selectSource(
      actor,
      (snapshot) => selectView(snapshot, countView, { issues: actor.issues() }),
      Equivalence.Struct({ count: Equivalence.Number }),
    );
    const labelSource = selectSource(
      actor,
      (snapshot) => selectView(snapshot, labelView, { issues: actor.issues() }),
      Equivalence.Struct({ label: Equivalence.String }),
    );
    const doubledSource = deriveSource([countSource], ([count]) => ({
      doubled: count.count * 2,
    }));
    const summarySource = deriveSource(
      [doubledSource, countSource, labelSource],
      ([doubled, count, label]) => ({
        label: label.label,
        count: count.count,
        doubled: doubled.doubled,
      }),
    );
    const notifications: Array<{
      readonly label: string;
      readonly count: number;
      readonly doubled: number;
    }> = [];

    const unsubscribe = summarySource.subscribe(() => {
      notifications.push(summarySource.getSnapshot());
    });

    expect(summarySource.getSnapshot()).toEqual({
      label: "Count 1",
      count: 1,
      doubled: 2,
    });

    actor.send({ type: "INC" });

    expect(summarySource.getSnapshot()).toEqual({
      label: "Count 2",
      count: 2,
      doubled: 4,
    });
    expect(notifications).toEqual([
      {
        label: "Count 2",
        count: 2,
        doubled: 4,
      },
    ]);

    unsubscribe();
    await actor.dispose();
    await runtime.dispose();
  });
});
