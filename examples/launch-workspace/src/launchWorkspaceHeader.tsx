interface LaunchWorkspaceHeaderProps {
  readonly connection: "online" | "offline";
  readonly canEditProject: boolean;
  readonly canSaveProject: boolean;
  readonly canRequestApproval: boolean;
  readonly canRunAssistant: boolean;
  readonly onToggleConnection: () => void;
  readonly onEditProject: () => void;
  readonly onSaveProject: () => void;
  readonly onRequestApproval: () => void;
  readonly onRunAssistant: () => void;
}

export function LaunchWorkspaceHeader({
  connection,
  canEditProject,
  canSaveProject,
  canRequestApproval,
  canRunAssistant,
  onToggleConnection,
  onEditProject,
  onSaveProject,
  onRequestApproval,
  onRunAssistant,
}: LaunchWorkspaceHeaderProps) {
  return (
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
        <button type="button" onClick={onToggleConnection}>
          {connection === "online" ? "Go offline" : "Reconnect"}
        </button>
        <button type="button" onClick={onEditProject} disabled={!canEditProject}>
          Nudge draft
        </button>
        <button type="button" onClick={onSaveProject} disabled={!canSaveProject}>
          Save
        </button>
        <button type="button" onClick={onRequestApproval} disabled={!canRequestApproval}>
          Request approval
        </button>
        <button type="button" onClick={onRunAssistant} disabled={!canRunAssistant}>
          Run assistant
        </button>
      </div>
    </header>
  );
}
