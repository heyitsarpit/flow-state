import { Option } from "effect";

import type { Incident, IncidentEvent, IncidentFilters } from "../../domain/incidents";
import type {
  AssigneeFilter,
  IncidentConsoleEvent,
  ServiceFilter,
  SeverityFilter,
  StatusFilter,
} from "./vocabulary";

export type {
  AssigneeFilter,
  IncidentConsoleEvent,
  ServiceFilter,
  SeverityFilter,
  StatusFilter,
} from "./vocabulary";

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
  readonly notificationSequence: number;
  readonly notification: Option.Option<Notification>;
  readonly actionFailure: Option.Option<string>;
}

export interface Notification {
  readonly id: number;
  readonly kind: "success";
  readonly message: string;
}

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

export const selectedIncidentId = (context: IncidentConsoleContext): string =>
  Option.getOrThrowWith(
    context.selectedIncidentId,
    () => new Error("detail ownership requires a selected incident"),
  );

export const activeRunId = (context: IncidentConsoleContext): string =>
  Option.getOrThrowWith(context.runId, () => new Error("runbook ownership requires an active run"));

export const successNotification = (
  context: IncidentConsoleContext,
  message: string,
): Pick<IncidentConsoleContext, "notificationSequence" | "notification"> => {
  const id = context.notificationSequence + 1;
  return {
    notificationSequence: id,
    notification: Option.some({ id, kind: "success", message }),
  };
};

export const dismissNotification = (
  context: IncidentConsoleContext,
  event: IncidentConsoleEvent,
): Pick<IncidentConsoleContext, "notification"> | Readonly<Record<never, never>> =>
  event.type === "DISMISS_NOTIFICATION" &&
  Option.isSome(context.notification) &&
  context.notification.value.id === event.notificationId
    ? { notification: Option.none() }
    : {};
