export const launchWorkspaceFutureScenarios = [
  {
    id: "offline-save-undo",
    title: "queues offline save commits with preview patches and rolls them back on undo",
    note: "Parked until the transaction runner intentionally restores queue semantics.",
  },
  {
    id: "offline-reconnect-conflict",
    title: "reconnect serializes queued saves and preserves draft on typed conflict",
    note: "Parked until offline queue, reconnect replay, and undo return as real behavior.",
  },
] as const;
