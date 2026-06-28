import { flow } from "@flow-state/core";

import type { LaunchProject, ProjectDraft } from "./domain";
import {
  launchApiCoverage,
  Launch,
  type LaunchWorkspaceEvent,
  launchWorkspaceDebugView,
  launchWorkspaceMachine,
  launchWorkspaceView,
  projectResource,
  Trace,
} from "./launchWorkspace";
import type { LaunchWorkspaceTab } from "./launchWorkspace";
import {
  LaunchWorkspaceEditorPanel,
  LaunchWorkspaceDebugPanel,
  LaunchWorkspaceOverviewPanel,
  LaunchWorkspaceTracePanel,
} from "./launchWorkspacePanels";

const workspaceTabs = [
  { value: "overview", label: "Overview" },
  { value: "editor", label: "Editor" },
  { value: "assets", label: "Assets" },
  { value: "approval", label: "Approval" },
  { value: "assistant", label: "Assistant" },
  { value: "chat", label: "Chat" },
  { value: "trace", label: "Trace" },
] as const satisfies ReadonlyArray<
  Readonly<{ readonly value: LaunchWorkspaceTab; readonly label: string }>
>;

function nextDraft(draft: ProjectDraft): ProjectDraft {
  return {
    ...draft,
    name: draft.name.endsWith(" Review") ? draft.name : `${draft.name} Review`,
    summary: draft.summary.endsWith("Trace stays visible.")
      ? draft.summary
      : `${draft.summary} Trace stays visible.`,
  };
}

export function LaunchWorkspaceShell() {
  const actor = flow.use(launchWorkspaceMachine);
  const snapshot = actor.getSnapshot();
  const workspace = flow.useView(actor, launchWorkspaceView);
  const overview = flow.useView(actor, Launch.overviewView);
  const trace = flow.useView(actor, Trace.timelineView);
  const debug = flow.useView(actor, launchWorkspaceDebugView);
  const projectSnapshot = flow.useResource(projectResource.ref(snapshot.context.activeProjectId));
  const project: LaunchProject | undefined = projectSnapshot?.value;
  const editEvent: LaunchWorkspaceEvent = {
    type: "EDIT_PROJECT",
    draft: snapshot.context.draft,
  };

  const navigate = (tab: LaunchWorkspaceTab): void => {
    actor.send({ type: "NAVIGATE", tab });
  };

  const editProject = (): void => {
    actor.send({
      type: "EDIT_PROJECT",
      draft: nextDraft(actor.getSnapshot().context.draft),
    });
  };

  const saveProject = (): void => {
    actor.send({ type: "SAVE_PROJECT" });
  };

  const requestApproval = (): void => {
    actor.send({ type: "REQUEST_APPROVAL" });
  };

  const runAssistant = (): void => {
    actor.send({ type: "RUN_ASSISTANT" });
  };

  const toggleConnection = (): void => {
    actor.send({ type: snapshot.context.connection === "online" ? "GO_OFFLINE" : "RECONNECT" });
  };

  return (
    <main className="workspace-shell">
      <aside className="rail" aria-label="Launch workspace sections">
        <p className="rail-label">Screens</p>
        {workspaceTabs.map((item) => {
          const navigateEvent: LaunchWorkspaceEvent = { type: "NAVIGATE", tab: item.value };
          const canNavigate = flow.can(snapshot, navigateEvent);

          return (
            <button
              aria-pressed={workspace.activeTab === item.value}
              className={workspace.activeTab === item.value ? "active" : ""}
              disabled={!canNavigate}
              key={item.value}
              type="button"
              onClick={() => navigate(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">vNext API proving app</p>
            <h1>Launch Workspace</h1>
            <p className="workspace-intro">
              The shell runs the workspace actor directly, then surfaces joined Overview, Trace, and
              Debug read models beside the flow-owned editor state.
            </p>
          </div>
          <div className="commands" aria-label="Workspace commands">
            <button type="button" onClick={toggleConnection}>
              {snapshot.context.connection === "online" ? "Go offline" : "Reconnect"}
            </button>
            <button type="button" onClick={editProject} disabled={!flow.can(snapshot, editEvent)}>
              Nudge draft
            </button>
            <button
              type="button"
              onClick={saveProject}
              disabled={!flow.can(snapshot, { type: "SAVE_PROJECT" })}
            >
              Save
            </button>
            <button
              type="button"
              onClick={requestApproval}
              disabled={!flow.can(snapshot, { type: "REQUEST_APPROVAL" })}
            >
              Request approval
            </button>
            <button
              type="button"
              onClick={runAssistant}
              disabled={!flow.can(snapshot, { type: "RUN_ASSISTANT" })}
            >
              Run assistant
            </button>
          </div>
        </header>

        <div className="status-strip" aria-label="Runtime status">
          <span>State: {snapshot.value}</span>
          <span>Connection: {snapshot.context.connection}</span>
          <span>Active tab: {workspace.activeTab}</span>
          <span>Save lane: {workspace.saveStatus}</span>
          <span>Trace: {workspace.traceLabel}</span>
        </div>

        <div className="workspace-grid">
          <LaunchWorkspaceEditorPanel
            draft={snapshot.context.draft}
            project={project}
            projectResourceStatus={projectSnapshot?.status ?? "missing"}
            surfaceCount={launchApiCoverage.length}
            workspace={workspace}
          />

          <aside className="inspection-stack" aria-label="Workspace projections">
            <LaunchWorkspaceOverviewPanel overview={overview} workspace={workspace} />
            <LaunchWorkspaceTracePanel trace={trace} traceLabel={workspace.traceLabel} />
            <LaunchWorkspaceDebugPanel debug={debug} />
          </aside>
        </div>
      </section>
    </main>
  );
}
