import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FlowProvider, createRuntime, flow, useFlow, useSelector, useView } from "@flow-state/core";

import "./styles.css";
import {
  agentWorkspaceMachine,
  agentWorkspaceView,
  formatPercent,
  selectGraphSummary,
} from "./agentWorkspaceFlow";
import type { AgentProgress, ChildTask, ChildTaskKind, ProposedAction } from "./agentWorkspaceFlow";

const runtime = createRuntime();

const progressTicks: readonly AgentProgress[] = [
  {
    step: "plan",
    message: "Mapped parent run and child tasks.",
    percent: 18,
  },
  {
    step: "implement",
    message: "Drafted the API descriptors.",
    percent: 52,
  },
  {
    step: "verify",
    message: "Collected replay and graph coverage.",
    percent: 86,
  },
];

const childKinds: readonly ChildTaskKind[] = ["research", "implementation", "verification"];

const proposedAction: ProposedAction = {
  id: "action-apply-docs",
  label: "Apply docs and example wiring",
  risk: "medium",
  details: "Patch the example package and examples.md section.",
};

function AgentWorkspaceExample(): React.ReactElement {
  const actor = useFlow(agentWorkspaceMachine);
  const snapshot = useSelector(actor, (current) => current);
  const overview = useView(actor, agentWorkspaceView);
  const graph = selectGraphSummary();
  const nextProgress = progressTicks[snapshot.context.progress.length % progressTicks.length];

  function start(): void {
    actor.send({
      type: "START_RUN",
      goal: "Build the Agent Workspace example",
      runId: "run-ui-1",
    });
  }

  function spawn(kind: ChildTaskKind): void {
    actor.send({
      type: "SPAWN_CHILD_TASK",
      kind,
      title: `${kind} child task`,
    });
  }

  function completeLatestChild(): void {
    const child = [...snapshot.context.children]
      .reverse()
      .find((item: ChildTask) => item.status === "running");
    if (child === undefined) {
      return;
    }

    actor.send({
      type: "CHILD_COMPLETED",
      childId: child.id,
      result: {
        childId: child.id,
        summary: `${child.title} complete.`,
      },
    });
  }

  return (
    <main className="workspaceShell">
      <section className="workspacePanel" aria-labelledby="workspace-heading">
        <header className="workspaceHeader">
          <div>
            <p className="eyebrow">Example 5</p>
            <h1 id="workspace-heading">Agent Workspace</h1>
          </div>
          <span className={`statusPill ${snapshot.value}`}>{snapshot.value}</span>
        </header>

        <section className="toolbar" aria-label="Agent commands">
          <button
            type="button"
            className="primary"
            disabled={!flow.can(actor, { type: "START_RUN", goal: "" })}
            onClick={start}
          >
            Start
          </button>
          <button
            type="button"
            disabled={snapshot.value !== "running" || nextProgress === undefined}
            onClick={() => {
              if (nextProgress !== undefined) {
                actor.send({ type: "AGENT_PROGRESS", progress: nextProgress });
              }
            }}
          >
            Progress
          </button>
          <button
            type="button"
            disabled={snapshot.value !== "running"}
            onClick={() => actor.send({ type: "PROPOSE_ACTION", action: proposedAction })}
          >
            Propose
          </button>
          <button
            type="button"
            disabled={!flow.can(actor, { type: "COMPLETE_RUN" })}
            onClick={() => actor.send({ type: "COMPLETE_RUN" })}
          >
            Complete
          </button>
        </section>

        <section className="metrics" aria-label="Workspace summary">
          <Metric label="progress" value={formatPercent(overview.progressPercent)} />
          <Metric label="children" value={`${overview.completedChildren}/${overview.childCount}`} />
          <Metric label="trace" value={String(overview.traceEvents)} />
          <Metric label="graph" value={`${graph.nodes}n ${graph.edges}e`} />
        </section>

        <section className="childControls" aria-label="Child task commands">
          {childKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={snapshot.value !== "running"}
              onClick={() => spawn(kind)}
            >
              Spawn {kind}
            </button>
          ))}
          <button
            type="button"
            disabled={snapshot.value !== "running"}
            onClick={completeLatestChild}
          >
            Finish child
          </button>
        </section>

        {snapshot.value === "awaitingApproval" && snapshot.context.proposedAction !== null ? (
          <section className="approvalBand" aria-label="Approval request">
            <div>
              <strong>{snapshot.context.proposedAction.label}</strong>
              <span>{snapshot.context.proposedAction.risk} risk</span>
            </div>
            <div>
              <button
                type="button"
                className="primary"
                onClick={() => actor.send({ type: "APPROVE_ACTION", reason: "Approved in demo." })}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => actor.send({ type: "REJECT_ACTION", reason: "Needs replanning." })}
              >
                Reject
              </button>
            </div>
          </section>
        ) : null}

        <ChildList children={snapshot.context.children} />
        <TraceList trace={snapshot.context.trace} />
      </section>
    </main>
  );
}

function Metric(props: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <div>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function ChildList(props: { readonly children: readonly ChildTask[] }): React.ReactElement {
  if (props.children.length === 0) {
    return <p className="emptyState">No child tasks yet</p>;
  }

  return (
    <ol className="childList">
      {props.children.map((child) => (
        <li key={child.id}>
          <div>
            <strong>{child.title}</strong>
            <span>{child.kind}</span>
          </div>
          <span className={`childStatus ${child.status}`}>{child.status}</span>
          <div className="meter" aria-label={`${child.title} ${child.percent}%`}>
            <span style={{ width: `${child.percent}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function TraceList(props: {
  readonly trace: readonly {
    readonly id: string;
    readonly kind: string;
    readonly summary: string;
  }[];
}): React.ReactElement {
  return (
    <ol className="traceList" aria-label="Trace">
      {props.trace.map((event) => (
        <li key={event.id}>
          <span>{event.kind}</span>
          <p>{event.summary}</p>
        </li>
      ))}
    </ol>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <FlowProvider runtime={runtime}>
      <AgentWorkspaceExample />
    </FlowProvider>
  </StrictMode>,
);
