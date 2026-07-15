export const launchWorkspaceUnsupportedScenarios = [
  {
    id: "offline-save-undo",
    title: "queues offline save commits with preview patches and rolls them back on undo",
    note: "Launch Workspace does not implement transaction queue persistence or undo.",
  },
  {
    id: "offline-reconnect-conflict",
    title: "reconnect serializes queued saves and preserves draft on typed conflict",
    note: "Launch Workspace does not implement reconnect replay; use the offline-recovery example.",
  },
] as const;
