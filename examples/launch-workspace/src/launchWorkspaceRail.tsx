import type { LaunchWorkspaceTab } from "./launchWorkspace";

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

interface LaunchWorkspaceRailProps {
  readonly activeTab: LaunchWorkspaceTab;
  readonly canNavigate: (tab: LaunchWorkspaceTab) => boolean;
  readonly onNavigate: (tab: LaunchWorkspaceTab) => void;
}

export function LaunchWorkspaceRail({
  activeTab,
  canNavigate,
  onNavigate,
}: LaunchWorkspaceRailProps) {
  return (
    <aside className="rail" aria-label="Launch workspace sections">
      <p className="rail-label">Screens</p>
      {workspaceTabs.map((item) => (
        <button
          aria-pressed={activeTab === item.value}
          className={activeTab === item.value ? "active" : ""}
          disabled={!canNavigate(item.value)}
          key={item.value}
          type="button"
          onClick={() => onNavigate(item.value)}
        >
          {item.label}
        </button>
      ))}
    </aside>
  );
}
