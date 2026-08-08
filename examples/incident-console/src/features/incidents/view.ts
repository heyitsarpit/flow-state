import { Option } from "effect";

import * as flow from "flow-state";
import type { FlowViewConfig } from "flow-state";

import {
  IncidentPageSchema,
  IncidentSchema,
  RunbookSchema,
  type Incident,
  type IncidentEvent,
  type IncidentPage,
  type Runbook,
} from "../../domain/incidents";
import { isNotFoundFailure } from "../../services/incident-api";
import { capabilitiesFor, statusCapability, type IncidentCapabilities } from "./capabilities";
import { incidentDetailResource, incidentListResource, runbookResource } from "./resources";
import { matchingResourceSnapshot, resourceValue } from "./selectors";
import type { IncidentConsoleContext, Notification, QueueFilters } from "./types";
import { IncidentStates, type IncidentConsoleState } from "./vocabulary";

type ViewArgs = Parameters<
  FlowViewConfig<string, IncidentConsoleContext, IncidentConsoleState, unknown>["select"]
>[0];

type QueueStatus = "loading" | "ready" | "refreshing" | "empty" | "failure";
type DetailStatus = "idle" | "loading" | "refreshing" | "ready" | "not-found" | "failure";

export interface IncidentFacts {
  readonly state: IncidentConsoleState;
  readonly screen: "queue" | "detail";
  readonly filters: QueueFilters;
  readonly cursor: string | undefined;
  readonly selectedIncidentId: string | undefined;
  readonly page: IncidentPage | undefined;
  readonly incident: Incident | undefined;
  readonly queueStatus: QueueStatus;
  readonly detailStatus: DetailStatus;
  readonly mutationPending: boolean;
  readonly conflict: Incident | undefined;
  readonly timeline: ReadonlyArray<IncidentEvent>;
  readonly timelineGap: boolean;
  readonly timelineConnection: IncidentConsoleContext["timelineConnection"];
  readonly runbook: Runbook | undefined;
  readonly notification: Notification | undefined;
  readonly actionFailure: string | undefined;
  readonly issueCount: number;
  readonly capabilities: IncidentCapabilities;
}

const selectIncidentFacts = ({
  value,
  context,
  resources,
  transactions,
  children,
  issues,
}: ViewArgs): IncidentFacts => {
  const listSnapshot = matchingResourceSnapshot(resources, incidentListResource.id);
  const detailSnapshot = matchingResourceSnapshot(resources, incidentDetailResource.id);
  const page = resourceValue(resources, incidentListResource.id, IncidentPageSchema);
  const cachedIncident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
  const detailError = detailSnapshot?.status === "failure" ? detailSnapshot.error : undefined;
  const incident = isNotFoundFailure(detailError) ? undefined : cachedIncident;
  const child = children["incidents.runbook"];
  const runbook =
    child?.snapshot === undefined
      ? undefined
      : resourceValue(child.snapshot.resources, runbookResource.id, RunbookSchema);
  return {
    state: value,
    screen: value === IncidentStates.queue ? "queue" : "detail",
    filters: context.filters,
    cursor: Option.getOrUndefined(context.cursor),
    selectedIncidentId: Option.getOrUndefined(context.selectedIncidentId),
    page,
    incident,
    queueStatus:
      listSnapshot?.status === "failure"
        ? "failure"
        : listSnapshot?.status === "loading" || listSnapshot === undefined
          ? "loading"
          : page?.incidents.length === 0
            ? "empty"
            : listSnapshot.activity === "fetching"
              ? "refreshing"
              : "ready",
    detailStatus: Option.isNone(context.selectedIncidentId)
      ? "idle"
      : detailSnapshot?.status === "failure"
        ? isNotFoundFailure(detailError)
          ? "not-found"
          : "failure"
        : detailSnapshot?.status === "loading" || detailSnapshot === undefined
          ? "loading"
          : value === IncidentStates.refreshingDetail || detailSnapshot.activity === "fetching"
            ? "refreshing"
            : "ready",
    mutationPending: transactions["incidents.mutate"]?.status === "pending",
    conflict: Option.getOrUndefined(context.conflict),
    timeline: context.timeline,
    timelineGap: context.timelineGap,
    timelineConnection: context.timelineConnection,
    runbook,
    notification: Option.getOrUndefined(context.notification),
    actionFailure: Option.getOrUndefined(context.actionFailure),
    issueCount: issues.length,
    capabilities: capabilitiesFor(value),
  };
};

export interface IncidentHeaderModel {
  readonly state: IncidentConsoleState;
  readonly screen: "queue" | "detail";
  readonly queueStatus: QueueStatus;
  readonly detailStatus: DetailStatus;
  readonly timelineConnection: IncidentConsoleContext["timelineConnection"];
  readonly canRefresh: boolean;
}

export const incidentHeaderView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentHeaderModel
>({
  id: "incidents.console.header",
  sources: ["context", "resources"],
  select: (args) => {
    const facts = selectIncidentFacts(args);
    return {
      state: facts.state,
      screen: facts.screen,
      queueStatus: facts.queueStatus,
      detailStatus: facts.detailStatus,
      timelineConnection: facts.timelineConnection,
      canRefresh: facts.capabilities.refreshQueue || facts.capabilities.refreshDetail,
    };
  },
});

export interface IncidentQueueModel {
  readonly filters: QueueFilters;
  readonly cursor: string | undefined;
  readonly selectedIncidentId: string | undefined;
  readonly page: IncidentPage | undefined;
  readonly status: QueueStatus;
  readonly capabilities: Pick<IncidentCapabilities, "filterQueue" | "openIncident">;
}

export const incidentQueueView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentQueueModel
>({
  id: "incidents.console.queue",
  sources: ["context", "resources"],
  select: (args) => {
    const facts = selectIncidentFacts(args);
    return {
      filters: facts.filters,
      cursor: facts.cursor,
      selectedIncidentId: facts.selectedIncidentId,
      page: facts.page,
      status: facts.queueStatus,
      capabilities: {
        filterQueue: facts.capabilities.filterQueue,
        openIncident: facts.capabilities.openIncident,
      },
    };
  },
});

export interface IncidentDetailModel {
  readonly status: DetailStatus;
  readonly incident: Incident | undefined;
  readonly mutationPending: boolean;
  readonly conflict: Incident | undefined;
  readonly actionFailure: string | undefined;
  readonly capabilities: Pick<
    IncidentCapabilities,
    "back" | "refreshDetail" | "mutate" | "startRunbook"
  >;
  readonly statusActions:
    | Readonly<
        Record<Incident["status"], Readonly<{ enabled: boolean; reason: string | undefined }>>
      >
    | undefined;
}

export const incidentDetailView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentDetailModel
>({
  id: "incidents.console.detail",
  sources: ["context", "resources", "transactions"],
  select: (args) => {
    const facts = selectIncidentFacts(args);
    const available = facts.capabilities.mutate && !facts.mutationPending;
    const statusActions =
      facts.incident === undefined
        ? undefined
        : {
            open: statusCapability(facts.incident, "open"),
            acknowledged: statusCapability(facts.incident, "acknowledged"),
            resolved: statusCapability(facts.incident, "resolved"),
          };
    return {
      status: facts.detailStatus,
      incident: facts.incident,
      mutationPending: facts.mutationPending,
      conflict: facts.conflict,
      actionFailure: facts.actionFailure,
      capabilities: {
        back: facts.capabilities.back,
        refreshDetail: facts.capabilities.refreshDetail,
        mutate: available,
        startRunbook: facts.capabilities.startRunbook && !facts.mutationPending,
      },
      statusActions,
    };
  },
});

export interface IncidentTimelineModel {
  readonly events: ReadonlyArray<IncidentEvent>;
  readonly gap: boolean;
  readonly connection: IncidentConsoleContext["timelineConnection"];
}

export const incidentTimelineView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentTimelineModel
>({
  id: "incidents.console.timeline",
  sources: ["context"],
  select: ({ context }) => ({
    events: context.timeline,
    gap: context.timelineGap,
    connection: context.timelineConnection,
  }),
});

export interface IncidentRunbookModel {
  readonly runbook: Runbook | undefined;
  readonly active: boolean;
  readonly canStart: boolean;
  readonly canCancel: boolean;
  readonly canReplace: boolean;
}

export const incidentRunbookView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentRunbookModel
>({
  id: "incidents.console.runbook",
  sources: ["children", "transactions"],
  select: (args) => {
    const facts = selectIncidentFacts(args);
    return {
      runbook: facts.runbook,
      active:
        facts.state === IncidentStates.startingRunbook ||
        facts.state === IncidentStates.runbook ||
        facts.state === IncidentStates.replacingRunbook,
      canStart: facts.capabilities.startRunbook && !facts.mutationPending,
      canCancel: facts.capabilities.cancelRunbook,
      canReplace: facts.capabilities.replaceRunbook,
    };
  },
});

export interface IncidentNotificationModel {
  readonly notification: Notification | undefined;
}

export const incidentNotificationView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentNotificationModel
>({
  id: "incidents.console.notification",
  sources: ["context"],
  select: ({ context }) => ({ notification: Option.getOrUndefined(context.notification) }),
});

export interface IncidentDiagnosticsModel {
  readonly state: IncidentConsoleState;
  readonly queueStatus: QueueStatus;
  readonly detailStatus: DetailStatus;
  readonly timelineConnection: IncidentConsoleContext["timelineConnection"];
  readonly issueCount: number;
}

export const incidentDiagnosticsView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentDiagnosticsModel
>({
  id: "incidents.console.diagnostics",
  sources: ["context", "resources", "issues"],
  select: (args) => {
    const facts = selectIncidentFacts(args);
    return {
      state: facts.state,
      queueStatus: facts.queueStatus,
      detailStatus: facts.detailStatus,
      timelineConnection: facts.timelineConnection,
      issueCount: facts.issueCount,
    };
  },
});

// Kept as a testing projection while production React consumers use focused models.
export const incidentConsoleView = flow.view<
  IncidentConsoleContext,
  IncidentConsoleState,
  IncidentFacts
>({
  id: "incidents.console.testing",
  sources: ["context", "resources", "transactions", "children", "issues"],
  select: selectIncidentFacts,
});

export type IncidentConsoleSelection = IncidentFacts;
