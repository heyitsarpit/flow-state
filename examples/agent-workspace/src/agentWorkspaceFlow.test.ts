import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, flowTest } from "@flow-state/core";

import { AgentWorkspaceService, createAgentWorkspaceTestLayer } from "./agentWorkspaceApi";
import {
  agentProgressStream,
  agentWorkspaceDescriptor,
  agentWorkspaceMachine,
  agentWorkspacePersistence,
  childTaskActor,
  createReplayPlan,
  formatPercent,
  selectGraphSummary,
  selectWorkspaceOverview,
} from "./agentWorkspaceFlow";
import type { AgentChildFailure, AgentProgress, AgentProgressFailure } from "./agentWorkspaceFlow";

function createAgentHarness(now?: () => number) {
  const harness = flowTest(agentWorkspaceMachine);
  if (now !== undefined) {
    harness.clock(now);
  }
  return harness.provide(createAgentWorkspaceTestLayer().layer);
}

describe("Example 5 Agent Workspace API pressure", () => {
  it("records final multi-actor vocabulary through core exports", () => {
    expect(agentWorkspaceDescriptor).toMatchObject({
      child: {
        kind: "child",
        config: {
          id: "agent.child-task",
          supervision: "parent",
          mailbox: "fifo",
          meta: {
            parentEdge: "spawned-by",
            includeInGraph: true,
          },
        },
      },
      trace: {
        kind: "trace",
        version: 1,
        source: "snapshot",
      },
      graph: {
        kind: "graph",
        version: 1,
        machineId: "example-5-agent-workspace",
      },
      replay: {
        kind: "replay",
        traceVersion: 1,
      },
      testModel: {
        kind: "model",
      },
      devtools: {
        kind: "devtools",
      },
      playwrightFlow: {
        kind: "playwright-flow",
      },
    });
    expect(agentWorkspaceDescriptor.view.kind).toBe("view");
    expect(agentWorkspaceDescriptor.schema.kind).toBe("schema");
    expect(agentWorkspaceDescriptor.persist).toBe(agentWorkspacePersistence);
  });

  it("describes agent progress streaming separately from child actor lifecycle", () => {
    expect(agentProgressStream.kind).toBe("stream");
    expect(agentProgressStream.config).toMatchObject({
      id: "agent.run.progress",
      pressure: {
        strategy: "coalesce-latest",
      },
      routes: {
        value: expect.any(Function),
        failure: expect.any(Function),
        defect: expect.any(Function),
        done: expect.any(Function),
        interrupt: expect.any(Function),
      },
    });
    expect(
      agentProgressStream.config.pressure.key({
        step: "plan",
        message: "Planning",
        percent: 10,
      }),
    ).toBe("plan");

    const childInput = childTaskActor.config.input;
    expect(childInput).toBeDefined();
    expect(
      childInput?.({
        context: {
          runId: "run-1",
          goal: "Verify graph",
          progress: [],
          children: [
            {
              id: "child-1",
              kind: "verification",
              title: "Verify",
              status: "running",
              percent: 0,
              summary: null,
              failure: null,
            },
          ],
          proposedAction: null,
          decisions: [],
          trace: [],
          replayCursor: 0,
          failure: null,
          nextChildId: 2,
          nextTraceId: 1,
        },
        event: { type: "SPAWN_CHILD_TASK", kind: "verification", title: "Verify" },
      }),
    ).toEqual({
      kind: "verification",
      runId: "run-1",
    });
  });

  it("exposes service, controlled stream, graph, replay, and model metadata", () => {
    const progress = createControlledStream<AgentProgress, AgentProgressFailure>(
      "agent.run.progress",
    );
    const layer = createAgentWorkspaceTestLayer({ progress });

    progress.stream();
    progress.emit({ step: "plan", message: "Mapped the task graph.", percent: 20 });
    progress.fail({ _tag: "AgentProgressFailure", message: "model stream closed" });

    expect(layer.layer.kind).toBe("testLayer");
    expect(layer.layer.service).toBe(AgentWorkspaceService);
    expect(progress.events()).toEqual([
      { type: "start" },
      {
        type: "value",
        value: { step: "plan", message: "Mapped the task graph.", percent: 20 },
      },
      {
        type: "failure",
        error: { _tag: "AgentProgressFailure", message: "model stream closed" },
      },
    ]);
    expect(selectGraphSummary()).toEqual({
      nodes: 8,
      edges: 17,
      requiredEdges: [
        "START_RUN",
        "SPAWN_CHILD_TASK",
        "PROPOSE_ACTION",
        "APPROVE_ACTION",
        "REJECT_ACTION",
      ],
    });
    expect(agentWorkspaceDescriptor.replay.unsupportedReceipts).toEqual([]);
    expect(agentWorkspaceDescriptor.testModel.states).toContain("awaitingApproval");
    expect(agentWorkspaceDescriptor.fuzz.accepted).toBeGreaterThan(0);
  });

  it("keeps child, trace, graph, replay, and test metadata out of runtime slots for now", () => {
    const harness = createAgentHarness();

    expect(harness.snapshot()).toMatchObject({
      resources: {},
      mutations: {},
      streams: {},
      timers: {},
    });
    expect(harness.streams().get("agent.run.progress")).toBeNull();
    expect(harness.cache().snapshot()).toEqual({});
  });
});

describe("Example 5 Agent Workspace product flow", () => {
  it("starts a run, streams progress, spawns a child task, and completes it", () => {
    let now = 1_000;
    const harness = createAgentHarness(() => now).send({
      type: "START_RUN",
      goal: "Ship the Agent Workspace example",
      runId: "run-docs-1",
    });

    expect(harness.state()).toBe("running");
    expect(harness.context().trace).toHaveLength(1);

    now = 1_100;
    harness
      .send({
        type: "AGENT_PROGRESS",
        progress: {
          step: "plan",
          message: "Split parent and child responsibilities.",
          percent: 15,
        },
      })
      .send({
        type: "SPAWN_CHILD_TASK",
        kind: "verification",
        title: "Check graph and replay metadata",
      })
      .send({
        type: "CHILD_PROGRESS",
        childId: "child-1",
        progress: {
          type: "progress",
          childId: "child-1",
          message: "Graph edges covered",
          percent: 80,
        },
      })
      .send({
        type: "CHILD_COMPLETED",
        childId: "child-1",
        result: {
          childId: "child-1",
          summary: "Graph and replay metadata match the contract.",
        },
      });

    expect(harness.context().children).toEqual([
      {
        id: "child-1",
        kind: "verification",
        title: "Check graph and replay metadata",
        status: "done",
        percent: 100,
        summary: "Graph and replay metadata match the contract.",
        failure: null,
      },
    ]);
    expect(selectWorkspaceOverview(harness.snapshot())).toMatchObject({
      state: "running",
      childCount: 1,
      completedChildren: 1,
      progressPercent: 15,
      traceEvents: 5,
    });
  });

  it("gates approval and rejection through the awaitingApproval state", () => {
    const harness = createAgentHarness(() => 2_000).send({
      type: "START_RUN",
      goal: "Approve a filesystem write",
      runId: "run-approval-1",
    });

    expect(harness.can({ type: "APPROVE_ACTION", reason: "looks safe" })).toBe(false);

    harness.send({
      type: "PROPOSE_ACTION",
      action: {
        id: "action-write-docs",
        label: "Write example docs",
        risk: "medium",
        details: "Patch examples.md and package wiring.",
      },
    });

    expect(harness.state()).toBe("awaitingApproval");
    expect(harness.can({ type: "APPROVE_ACTION", reason: "docs-only" })).toBe(true);

    harness.send({ type: "APPROVE_ACTION", reason: "docs-only" });
    expect(harness.state()).toBe("running");
    expect(harness.context().decisions).toEqual([
      {
        actionId: "action-write-docs",
        kind: "approved",
        reason: "docs-only",
        decidedAt: 2_000,
      },
    ]);

    harness
      .send({
        type: "PROPOSE_ACTION",
        action: {
          id: "action-promote-core-api",
          label: "Promote child helper to core",
          risk: "high",
          details: "Add flow.child to @flow-state/core.",
        },
      })
      .send({ type: "REJECT_ACTION", reason: "Coordinate with Worker A first." });

    expect(harness.state()).toBe("running");
    expect(harness.context().proposedAction).toBeNull();
    expect(harness.context().decisions.at(-1)).toMatchObject({
      actionId: "action-promote-core-api",
      kind: "rejected",
    });
    expect(harness.context().progress.at(-1)).toMatchObject({
      step: "replan",
      message: "Rejected action-promote-core-api; agent should replan.",
    });
  });

  it("records replayable trace ids and redacts high-risk proposal summaries", () => {
    const harness = createAgentHarness(() => 3_000)
      .send({
        type: "START_RUN",
        goal: "Replay an agent path",
        runId: "run-replay-1",
      })
      .send({
        type: "PROPOSE_ACTION",
        action: {
          id: "action-secret",
          label: "Write secrets file",
          risk: "high",
          details: "Sensitive details should not appear in replay exports.",
        },
      });

    const plan = createReplayPlan(harness.snapshot());
    expect(plan).toEqual([
      "trace-1:run:start:run-replay-1",
      "trace-2:approval:proposed:run-replay-1",
    ]);

    harness.send({ type: "REPLAY_EVENT", traceId: "trace-2" });
    expect(harness.context().replayCursor).toBe(2);

    const selected = agentWorkspacePersistence.config.select(harness.snapshot());
    const redacted = agentWorkspacePersistence.config.redact(selected);

    expect(redacted).toMatchObject({
      context: {
        goal: "[redacted]",
        trace: [
          {
            summary: "Started Replay an agent path",
          },
          {
            summary: "[redacted]",
            redacted: true,
          },
        ],
      },
    });
  });

  it("routes child failure into the parent failed state", () => {
    const failure: AgentChildFailure = {
      type: "failure",
      childId: "child-1",
      message: "Verification child could not reproduce replay metadata.",
    };
    const harness = createAgentHarness()
      .send({
        type: "START_RUN",
        goal: "Run with a child failure",
      })
      .send({
        type: "SPAWN_CHILD_TASK",
        kind: "verification",
        title: "Replay verification",
      })
      .send({
        type: "CHILD_FAILED",
        childId: "child-1",
        error: failure,
      });

    expect(harness.state()).toBe("failed");
    expect(harness.context().failure).toBe(failure.message);
    expect(harness.context().children[0]).toMatchObject({
      id: "child-1",
      status: "failed",
      failure: failure.message,
    });
    expect(formatPercent(122)).toBe("100%");
  });
});
