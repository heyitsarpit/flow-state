import { Option } from "effect";

import type {
  Incident,
  IncidentEvent,
  IncidentFilters,
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

export interface QueueFilters {
  readonly service: ServiceFilter;
  readonly severity: SeverityFilter;
  readonly status: StatusFilter;
  readonly assignee: AssigneeFilter;
}

export interface IncidentConsoleContext {
  readonly filters: QueueFilters;
  readonly cursor: Option.Option<string>;
  readonly selectedIncidentId: Option.Option<string>;
  readonly runId: Option.Option<string>;
  readonly timeline: ReadonlyArray<IncidentEvent>;
  readonly timelineLastSequence: Option.Option<number>;
  readonly timelineGap: boolean;
  readonly timelineConnection: "idle" | "connecting" | "live" | "reconnecting" | "failed";
  readonly detailRefreshReason: "manual" | "live";
  readonly conflict: Option.Option<Incident>;
  readonly feedback: Option.Option<string>;
}

export type IncidentConsoleEvent =
  | Readonly<{ readonly type: "SET_SERVICE_FILTER"; readonly value: ServiceFilter }>
  | Readonly<{ readonly type: "SET_SEVERITY_FILTER"; readonly value: SeverityFilter }>
  | Readonly<{ readonly type: "SET_STATUS_FILTER"; readonly value: StatusFilter }>
  | Readonly<{ readonly type: "SET_ASSIGNEE_FILTER"; readonly value: AssigneeFilter }>
  | Readonly<{ readonly type: "CLEAR_FILTERS" }>
  | Readonly<{ readonly type: "NEXT_PAGE"; readonly cursor: string }>
  | Readonly<{ readonly type: "FIRST_PAGE" }>
  | Readonly<{ readonly type: "OPEN_INCIDENT"; readonly incidentId: string }>
  | Readonly<{ readonly type: "BACK_TO_QUEUE" }>
  | Readonly<{ readonly type: "REFRESH_QUEUE" }>
  | Readonly<{ readonly type: "REFRESH_DETAIL" }>
  | Readonly<{ readonly type: "DETAIL_REFRESHED"; readonly incident: Incident }>
  | Readonly<{ readonly type: "DETAIL_REFRESH_FAILED"; readonly error: IncidentApiFailure }>
  | Readonly<{ readonly type: "DETAIL_REFRESH_DEFECT" }>
  | Readonly<{ readonly type: "DETAIL_REFRESH_INTERRUPTED" }>
  | Readonly<{ readonly type: "ASSIGN"; readonly assignee: string | null }>
  | Readonly<{ readonly type: "CHANGE_STATUS"; readonly status: IncidentStatus }>
  | Readonly<{ readonly type: "MUTATION_SUCCEEDED"; readonly incident: Incident }>
  | Readonly<{ readonly type: "MUTATION_FAILED"; readonly error: IncidentApiFailure }>
  | Readonly<{ readonly type: "MUTATION_DEFECT" }>
  | Readonly<{ readonly type: "MUTATION_INTERRUPTED" }>
  | Readonly<{ readonly type: "ACCEPT_SERVER_VERSION" }>
  | Readonly<{ readonly type: "TIMELINE_CONNECTED" }>
  | Readonly<{ readonly type: "TIMELINE_RECONNECTING" }>
  | Readonly<{ readonly type: "TIMELINE_EVENT"; readonly event: IncidentEvent }>
  | Readonly<{ readonly type: "TIMELINE_FAILED"; readonly error: IncidentApiFailure }>
  | Readonly<{ readonly type: "START_RUNBOOK" }>
  | Readonly<{ readonly type: "RUNBOOK_STARTED"; readonly runId: string }>
  | Readonly<{ readonly type: "RUNBOOK_START_FAILED"; readonly error: IncidentApiFailure }>
  | Readonly<{ readonly type: "RUNBOOK_FINISHED"; readonly runbook: Runbook | undefined }>
  | Readonly<{ readonly type: "CANCEL_RUNBOOK" }>
  | Readonly<{ readonly type: "REPLACE_RUNBOOK" }>
  | Readonly<{ readonly type: "RUNBOOK_CANCELLED"; readonly runbook: Runbook }>
  | Readonly<{ readonly type: "RUNBOOK_CANCEL_FAILED"; readonly error: IncidentApiFailure }>;

export const defaultFilters: QueueFilters = {
  service: "all",
  severity: "all",
  status: "all",
  assignee: "all",
};

export const queryFromContext = (context: IncidentConsoleContext): IncidentFilters => ({
  ...(context.filters.service === "all" ? {} : { service: context.filters.service }),
  ...(context.filters.severity === "all" ? {} : { severity: context.filters.severity }),
  ...(context.filters.status === "all" ? {} : { status: context.filters.status }),
  ...(context.filters.assignee === "all" ? {} : { assignee: context.filters.assignee }),
  ...(Option.isNone(context.cursor) ? {} : { cursor: context.cursor.value }),
});

export const apiConflict = (failure: IncidentApiFailure): Incident | undefined =>
  failure.kind === "http" && failure.status === 409 ? failure.error?.current : undefined;
