import type { FlowActorSnapshotTree } from "@flow-state/core";
import { flow } from "@flow-state/core/react";

import type { LaunchProject, ProjectDraft } from "./domain";
import {
  launchApiCoverage,
  Launch,
  type LaunchWorkspaceEvent,
  launchWorkspaceActorId,
  launchWorkspaceDebugView,
  launchWorkspaceMachine,
  launchWorkspaceView,
  projectResource,
  Trace,
} from "./launchWorkspace";
import type { LaunchWorkspaceTab } from "./launchWorkspace";
import { LaunchWorkspaceHeader } from "./launchWorkspaceHeader";
import {
  LaunchWorkspaceEditorPanel,
  LaunchWorkspaceDebugPanel,
  LaunchWorkspaceOverviewPanel,
  LaunchWorkspaceTracePanel,
} from "./launchWorkspacePanels";
import { LaunchWorkspaceRail } from "./launchWorkspaceRail";
import { LaunchWorkspaceRuntimeStatusStrip } from "./launchWorkspaceRuntimeStatusStrip";

function nextDraft(draft: ProjectDraft): ProjectDraft {
  return {
    ...draft,
    name: draft.name.endsWith(" Review") ? draft.name : `${draft.name} Review`,
    summary: draft.summary.endsWith("Trace stays visible.")
      ? draft.summary
      : `${draft.summary} Trace stays visible.`,
  };
}

export function LaunchWorkspaceShell(
  props: Readonly<{ readonly workspaceSnapshot?: FlowActorSnapshotTree }>,
) {
  const actor = flow.use(launchWorkspaceMachine, {
    id: launchWorkspaceActorId,
    ...(props.workspaceSnapshot === undefined ? {} : { snapshot: props.workspaceSnapshot }),
  });
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
  const canEditProject = flow.can(snapshot, editEvent);
  const canSaveProject = flow.can(snapshot, { type: "SAVE_PROJECT" });
  const canRequestApproval = flow.can(snapshot, { type: "REQUEST_APPROVAL" });
  const canRunAssistant = flow.can(snapshot, { type: "RUN_ASSISTANT" });

  const navigate = (tab: LaunchWorkspaceTab): void => {
    actor.send({ type: "NAVIGATE", tab });
  };
  const canNavigate = (tab: LaunchWorkspaceTab): boolean => {
    const event: LaunchWorkspaceEvent = { type: "NAVIGATE", tab };
    return flow.can(snapshot, event);
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
      <LaunchWorkspaceRail
        activeTab={workspace.activeTab}
        canNavigate={canNavigate}
        onNavigate={navigate}
      />

      <section className="workspace">
        <LaunchWorkspaceHeader
          canEditProject={canEditProject}
          canRequestApproval={canRequestApproval}
          canRunAssistant={canRunAssistant}
          canSaveProject={canSaveProject}
          connection={snapshot.context.connection}
          onEditProject={editProject}
          onRequestApproval={requestApproval}
          onRunAssistant={runAssistant}
          onSaveProject={saveProject}
          onToggleConnection={toggleConnection}
        />

        <LaunchWorkspaceRuntimeStatusStrip
          activeTab={workspace.activeTab}
          connection={snapshot.context.connection}
          saveStatus={workspace.saveStatus}
          state={snapshot.value}
          traceLabel={workspace.traceLabel}
        />

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
