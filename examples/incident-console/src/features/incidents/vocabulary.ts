import type {
  Incident,
  IncidentEvent,
  IncidentService,
  IncidentSeverity,
  IncidentStatus,
  Runbook,
} from "../../domain/incidents";
import { assigneeValues } from "../../domain/incidents";
import type { IncidentApiFailure } from "../../services/incident-api";

export type ServiceFilter = IncidentService | "all";
export type SeverityFilter = IncidentSeverity | "all";
export type StatusFilter = IncidentStatus | "all";
export type AssigneeFilter = (typeof assigneeValues)[number] | "all" | "unassigned";

export const IncidentStates = {
  queue: "queue",
  detail: "detail",
  refreshingDetail: "refreshing-detail",
  startingRunbook: "starting-runbook",
  runbook: "runbook",
  replacingRunbook: "replacing-runbook",
} as const;

export type IncidentConsoleState = (typeof IncidentStates)[keyof typeof IncidentStates];

export const IncidentEvents = {
  setServiceFilter: (value: ServiceFilter) => ({ type: "SET_SERVICE_FILTER", value }) as const,
  setSeverityFilter: (value: SeverityFilter) => ({ type: "SET_SEVERITY_FILTER", value }) as const,
  setStatusFilter: (value: StatusFilter) => ({ type: "SET_STATUS_FILTER", value }) as const,
  setAssigneeFilter: (value: AssigneeFilter) => ({ type: "SET_ASSIGNEE_FILTER", value }) as const,
  clearFilters: () => ({ type: "CLEAR_FILTERS" }) as const,
  nextPage: (cursor: string) => ({ type: "NEXT_PAGE", cursor }) as const,
  firstPage: () => ({ type: "FIRST_PAGE" }) as const,
  open: (incidentId: string) => ({ type: "OPEN_INCIDENT", incidentId }) as const,
  back: () => ({ type: "BACK_TO_QUEUE" }) as const,
  refreshQueue: () => ({ type: "REFRESH_QUEUE" }) as const,
  refreshDetail: () => ({ type: "REFRESH_DETAIL" }) as const,
  detailRefreshed: (incident: Incident) => ({ type: "DETAIL_REFRESHED", incident }) as const,
  detailRefreshFailed: (error: IncidentApiFailure) =>
    ({ type: "DETAIL_REFRESH_FAILED", error }) as const,
  detailRefreshDefect: () => ({ type: "DETAIL_REFRESH_DEFECT" }) as const,
  detailRefreshInterrupted: () => ({ type: "DETAIL_REFRESH_INTERRUPTED" }) as const,
  assign: (assignee: string | null) => ({ type: "ASSIGN", assignee }) as const,
  changeStatus: (status: IncidentStatus) => ({ type: "CHANGE_STATUS", status }) as const,
  mutationSucceeded: (incident: Incident) => ({ type: "MUTATION_SUCCEEDED", incident }) as const,
  mutationFailed: (error: IncidentApiFailure) => ({ type: "MUTATION_FAILED", error }) as const,
  mutationDefect: () => ({ type: "MUTATION_DEFECT" }) as const,
  mutationInterrupted: () => ({ type: "MUTATION_INTERRUPTED" }) as const,
  acceptServerVersion: () => ({ type: "ACCEPT_SERVER_VERSION" }) as const,
  timelineConnected: () => ({ type: "TIMELINE_CONNECTED" }) as const,
  timelineReconnecting: () => ({ type: "TIMELINE_RECONNECTING" }) as const,
  timelineEvent: (event: IncidentEvent) => ({ type: "TIMELINE_EVENT", event }) as const,
  timelineFailed: (error: IncidentApiFailure) => ({ type: "TIMELINE_FAILED", error }) as const,
  startRunbook: () => ({ type: "START_RUNBOOK" }) as const,
  runbookStarted: (runId: string) => ({ type: "RUNBOOK_STARTED", runId }) as const,
  runbookStartFailed: (error: IncidentApiFailure) =>
    ({ type: "RUNBOOK_START_FAILED", error }) as const,
  runbookFinished: (runbook: Runbook | undefined) =>
    ({ type: "RUNBOOK_FINISHED", runbook }) as const,
  cancelRunbook: () => ({ type: "CANCEL_RUNBOOK" }) as const,
  replaceRunbook: () => ({ type: "REPLACE_RUNBOOK" }) as const,
  runbookCancelled: (runbook: Runbook) => ({ type: "RUNBOOK_CANCELLED", runbook }) as const,
  runbookCancelFailed: (error: IncidentApiFailure) =>
    ({ type: "RUNBOOK_CANCEL_FAILED", error }) as const,
  dismissNotification: (notificationId: number) =>
    ({ type: "DISMISS_NOTIFICATION", notificationId }) as const,
};

export type IncidentConsoleEvent = ReturnType<(typeof IncidentEvents)[keyof typeof IncidentEvents]>;

