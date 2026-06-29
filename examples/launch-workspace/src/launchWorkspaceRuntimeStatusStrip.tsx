import type { LaunchWorkspaceTab } from "./launchWorkspace";

interface LaunchWorkspaceRuntimeStatusStripProps {
  readonly state: string;
  readonly connection: "online" | "offline";
  readonly activeTab: LaunchWorkspaceTab;
  readonly saveStatus: string;
  readonly traceLabel: string;
}

export function LaunchWorkspaceRuntimeStatusStrip({
  state,
  connection,
  activeTab,
  saveStatus,
  traceLabel,
}: LaunchWorkspaceRuntimeStatusStripProps) {
  return (
    <div className="status-strip" aria-label="Runtime status">
      <span>State: {state}</span>
      <span>Connection: {connection}</span>
      <span>Active tab: {activeTab}</span>
      <span>Save lane: {saveStatus}</span>
      <span>Trace: {traceLabel}</span>
    </div>
  );
}
