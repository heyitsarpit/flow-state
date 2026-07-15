import type { Incident, IncidentEvent, IncidentPage, Runbook } from "../domain/incidents";

export const fixtureIncident: Incident = {
  id: "INC-001",
  title: "Elevated API latency",
  description: "The public API is exceeding its latency objective.",
  service: "api",
  severity: "critical",
  status: "open",
  assignee: null,
  version: 1,
  updatedAt: "2026-07-15T08:00:00.000Z",
};

export const fixturePage: IncidentPage = {
  incidents: [fixtureIncident],
  nextCursor: null,
};

export const fixtureTimelineEvent: IncidentEvent = {
  id: "evt-2",
  incidentId: fixtureIncident.id,
  type: "note",
  message: "Latency confirmed from two regions",
  at: "2026-07-15T08:01:00.000Z",
  version: 1,
};

export const fixtureRunbook = (status: Runbook["status"], runId = "run-1"): Runbook => ({
  id: runId,
  incidentId: fixtureIncident.id,
  status,
  steps: [
    {
      id: "step-1",
      label: "Confirm impact",
      status:
        status === "queued"
          ? "pending"
          : status === "running"
            ? "running"
            : status === "failed"
              ? "failed"
              : status,
    },
  ],
});
