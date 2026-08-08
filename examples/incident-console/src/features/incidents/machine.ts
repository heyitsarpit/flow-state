import { Option, Result } from "effect";

import * as flow from "flow-state";
import type { FlowActorSnapshotTree, FlowResourceSnapshot } from "flow-state";

import {
  IncidentCommand,
  IncidentSchema,
  RunbookSchema,
  decideIncidentCommand,
  type Incident,
  type Runbook,
} from "../../domain/incidents";
import { conflictFrom, failureMessage, type IncidentApiFailure } from "../../services/incident-api";
import { incidentDetailResource, incidentListResource, runbookResource } from "./resources";
import { runbookMachine } from "./runbook";
import { runbookLease } from "./runbook-lease";
import { resourceValue } from "./selectors";
import { incidentTimeline } from "./timeline";
import { cancelRunbook, mutateIncident, startRunbook } from "./transactions";
import {
  activeRunId,
  defaultFilters,
  dismissNotification,
  queryFromContext,
  selectedIncidentId,
  successNotification,
  type IncidentConsoleContext,
  type IncidentConsoleEvent,
} from "./types";
import { IncidentEvents, IncidentStates, type IncidentConsoleState } from "./vocabulary";

const listParams = ({ context }: flow.ResourceParams<IncidentConsoleContext>) =>
  [queryFromContext(context)] as const;

const detailParams = ({ context }: flow.ResourceParams<IncidentConsoleContext>) =>
  [selectedIncidentId(context)] as const;

const acceptsStatusCommand = (
  status: Incident["status"],
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
) => {
  const incident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
  return (
    incident !== undefined &&
    Result.isSuccess(decideIncidentCommand(incident, IncidentCommand.changeStatus(status)))
  );
};

const runbookFromSnapshot = (snapshot: FlowActorSnapshotTree): Runbook | undefined => {
  return resourceValue(snapshot.resources, runbookResource.id, RunbookSchema);
};

const runbookChild = flow.child({
  id: "incidents.runbook",
  machine: runbookMachine,
  supervision: "continue-on-failure",
  input: ({ context }: { readonly context: IncidentConsoleContext }) => ({
    incidentId: Option.some(selectedIncidentId(context)),
    runId: Option.some(activeRunId(context)),
    runbook: Option.none(),
    error: Option.none(),
    retryCount: 0,
  }),
  routes: flow.outcomes<FlowActorSnapshotTree, flow.FlowIssue, IncidentConsoleEvent>({
    success: ({ value }) => IncidentEvents.runbookFinished(runbookFromSnapshot(value)),
    failure: () => IncidentEvents.runbookFinished(undefined),
    defect: () => IncidentEvents.runbookFinished(undefined),
    interrupt: () => IncidentEvents.runbookFinished(undefined),
  }),
});

const appendTimelineEvent = ({
  context,
  event,
}: {
  readonly context: IncidentConsoleContext;
  readonly event: IncidentConsoleEvent;
}) => {
  if (event.type !== "TIMELINE_EVENT") return {};
  if (context.timeline.some(({ id }) => id === event.event.id)) return {};
  const sequenceMatch = /^evt-(\d+)$/.exec(event.event.id);
  const sequence = sequenceMatch === null ? undefined : Number(sequenceMatch[1]);
  const previousSequence = Option.getOrUndefined(context.timelineLastSequence);
  const timeline = [...context.timeline, event.event];
  return {
    timeline: timeline.slice(-100),
    timelineLastSequence:
      sequence === undefined
        ? context.timelineLastSequence
        : Option.some(Math.max(previousSequence ?? sequence, sequence)),
    timelineGap:
      context.timelineGap ||
      timeline.length > 100 ||
      (sequence !== undefined && previousSequence !== undefined && sequence > previousSequence + 1),
  };
};

const shouldRefreshFromTimeline = ({
  event,
  transactions,
}: {
  readonly event: IncidentConsoleEvent;
  readonly transactions: Readonly<Record<string, flow.FlowTransactionSnapshot>>;
}) =>
  event.type === "TIMELINE_EVENT" &&
  (event.event.type === "assignment" || event.event.type === "status") &&
  transactions[mutateIncident.id]?.status !== "pending";

const detailOwners = [
  flow.observe(incidentListResource, { params: listParams }),
  flow.observe(incidentDetailResource, { params: detailParams }),
  incidentTimeline,
] as const;

type IncidentHandlers = Partial<{
  readonly [Type in IncidentConsoleEvent["type"]]: flow.FlowEventTransitions<
    IncidentConsoleContext,
    IncidentConsoleEvent,
    IncidentConsoleState
  >;
}>;

const leaveDetail = () => ({
  selectedIncidentId: Option.none<string>(),
  runId: Option.none<string>(),
  timeline: [],
  timelineLastSequence: Option.none<number>(),
  timelineGap: false,
  timelineConnection: "idle" as const,
  conflict: Option.none<Incident>(),
  actionFailure: Option.none<string>(),
});

const openIncident = ({ event }: { readonly event: IncidentConsoleEvent }) =>
  event.type === "OPEN_INCIDENT"
    ? {
        selectedIncidentId: Option.some(event.incidentId),
        runId: Option.none<string>(),
        timeline: [],
        timelineLastSequence: Option.none<number>(),
        timelineGap: false,
        timelineConnection: "connecting" as const,
        conflict: Option.none<Incident>(),
        actionFailure: Option.none<string>(),
      }
    : {};

const navigationHandlers = {
  BACK_TO_QUEUE: { target: IncidentStates.queue, update: leaveDetail },
  OPEN_INCIDENT: {
    target: IncidentStates.detail,
    reenter: true,
    update: openIncident,
  },
} satisfies IncidentHandlers;

const timelineHandlers = {
  TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" as const }) },
  TIMELINE_RECONNECTING: {
    update: () => ({ timelineConnection: "reconnecting" as const }),
  },
  TIMELINE_EVENT: { update: appendTimelineEvent },
  TIMELINE_FAILED: {
    update: ({ event }) =>
      event.type === "TIMELINE_FAILED"
        ? {
            timelineConnection: "failed" as const,
            actionFailure: Option.some(failureMessage(event.error)),
          }
        : {},
  },
} satisfies IncidentHandlers;

const notificationHandlers = {
  DISMISS_NOTIFICATION: {
    update: ({ context, event }) => dismissNotification(context, event),
  },
} satisfies IncidentHandlers;

export const incidentConsoleMachine = flow.machine<
  IncidentConsoleContext,
  IncidentConsoleEvent,
  IncidentConsoleState
>({
  id: "incidents.console",
  initial: IncidentStates.queue,
  context: () => ({
    filters: defaultFilters,
    cursor: Option.none(),
    selectedIncidentId: Option.none(),
    runId: Option.none(),
    timeline: [],
    timelineLastSequence: Option.none(),
    timelineGap: false,
    timelineConnection: "idle",
    detailRefreshReason: "manual",
    conflict: Option.none(),
    notificationSequence: 0,
    notification: Option.none(),
    actionFailure: Option.none(),
  }),
  states: {
    [IncidentStates.queue]: {
      invoke: flow.ensure(incidentListResource, { params: listParams }),
      on: {
        SET_SERVICE_FILTER: {
          target: IncidentStates.queue,
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, service: event.value },
            cursor: Option.none(),
          }),
        },
        SET_SEVERITY_FILTER: {
          target: IncidentStates.queue,
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, severity: event.value },
            cursor: Option.none(),
          }),
        },
        SET_STATUS_FILTER: {
          target: IncidentStates.queue,
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, status: event.value },
            cursor: Option.none(),
          }),
        },
        SET_ASSIGNEE_FILTER: {
          target: IncidentStates.queue,
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, assignee: event.value },
            cursor: Option.none(),
          }),
        },
        CLEAR_FILTERS: {
          target: IncidentStates.queue,
          reenter: true,
          update: () => ({ filters: defaultFilters, cursor: Option.none() }),
        },
        NEXT_PAGE: {
          target: IncidentStates.queue,
          reenter: true,
          update: ({ event }) => ({ cursor: Option.some(event.cursor) }),
        },
        FIRST_PAGE: {
          target: IncidentStates.queue,
          reenter: true,
          update: () => ({ cursor: Option.none() }),
        },
        REFRESH_QUEUE: { target: IncidentStates.queue, reenter: true },
        OPEN_INCIDENT: {
          target: IncidentStates.detail,
          update: openIncident,
        },
        ...notificationHandlers,
      },
    },
    [IncidentStates.detail]: {
      invoke: detailOwners,
      on: {
        ...navigationHandlers,
        REFRESH_DETAIL: {
          target: IncidentStates.refreshingDetail,
          update: () => ({ detailRefreshReason: "manual", actionFailure: Option.none() }),
        },
        ASSIGN: {
          submit: mutateIncident,
          guard: ({ event, resources }) => {
            const incident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
            return (
              event.type === "ASSIGN" &&
              incident !== undefined &&
              Result.isSuccess(
                decideIncidentCommand(incident, IncidentCommand.assign(event.assignee)),
              )
            );
          },
        },
        CHANGE_STATUS: [
          {
            submit: mutateIncident,
            guard: ({ event, resources }) =>
              event.type === "CHANGE_STATUS" && acceptsStatusCommand(event.status, resources),
          },
        ],
        MUTATION_SUCCEEDED: {
          update: ({ context, event }) => ({
            ...successNotification(context, `Incident ${event.incident.id} updated`),
            conflict: Option.none(),
            actionFailure: Option.none(),
          }),
        },
        MUTATION_FAILED: {
          update: ({ event }) => {
            const conflict = conflictFrom(event.error);
            return {
              conflict,
              actionFailure: Option.some(
                Option.isSome(conflict) ? "Server version changed" : failureMessage(event.error),
              ),
            };
          },
        },
        MUTATION_DEFECT: { update: () => ({ actionFailure: Option.some("Mutation defect") }) },
        MUTATION_INTERRUPTED: {
          update: () => ({ actionFailure: Option.some("Mutation interrupted") }),
        },
        ACCEPT_SERVER_VERSION: {
          target: IncidentStates.refreshingDetail,
          update: () => ({
            conflict: Option.none(),
            detailRefreshReason: "manual",
            actionFailure: Option.none(),
          }),
        },
        ...timelineHandlers,
        TIMELINE_EVENT: [
          {
            target: IncidentStates.refreshingDetail,
            guard: shouldRefreshFromTimeline,
            update: (args) => ({ ...appendTimelineEvent(args), detailRefreshReason: "live" }),
          },
          { update: appendTimelineEvent },
        ],
        START_RUNBOOK: IncidentStates.startingRunbook,
        ...notificationHandlers,
      },
    },
    [IncidentStates.refreshingDetail]: {
      invoke: [
        flow.observe(incidentListResource, { params: listParams }),
        flow.refresh(incidentDetailResource, {
          params: detailParams,
          routes: flow.outcomes<Incident, IncidentApiFailure, IncidentConsoleEvent>({
            success: ({ value }) => IncidentEvents.detailRefreshed(value),
            failure: ({ error }) => IncidentEvents.detailRefreshFailed(error),
            defect: IncidentEvents.detailRefreshDefect,
            interrupt: IncidentEvents.detailRefreshInterrupted,
          }),
        }),
        incidentTimeline,
      ],
      on: {
        DETAIL_REFRESHED: {
          target: IncidentStates.detail,
          update: ({ context }) => ({
            ...(context.detailRefreshReason === "manual"
              ? successNotification(context, "Incident refreshed")
              : {}),
            actionFailure: Option.none(),
          }),
        },
        DETAIL_REFRESH_FAILED: {
          target: IncidentStates.detail,
          update: ({ event }) => ({ actionFailure: Option.some(failureMessage(event.error)) }),
        },
        DETAIL_REFRESH_DEFECT: {
          target: IncidentStates.detail,
          update: () => ({ actionFailure: Option.some("Refresh defect") }),
        },
        DETAIL_REFRESH_INTERRUPTED: IncidentStates.detail,
        ...navigationHandlers,
        ...timelineHandlers,
        ...notificationHandlers,
      },
    },
    [IncidentStates.startingRunbook]: {
      invoke: [...detailOwners, flow.run(startRunbook)],
      on: {
        RUNBOOK_STARTED: {
          target: IncidentStates.runbook,
          update: ({ context, event }) => ({
            runId: Option.some(event.runId),
            ...successNotification(context, `Runbook ${event.runId} started`),
            actionFailure: Option.none(),
          }),
        },
        RUNBOOK_START_FAILED: {
          target: IncidentStates.detail,
          update: ({ event }) => ({ actionFailure: Option.some(failureMessage(event.error)) }),
        },
        ...navigationHandlers,
        ...timelineHandlers,
        ...notificationHandlers,
      },
    },
    [IncidentStates.runbook]: {
      invoke: [...detailOwners, runbookLease, runbookChild],
      on: {
        CANCEL_RUNBOOK: { submit: cancelRunbook },
        REPLACE_RUNBOOK: IncidentStates.replacingRunbook,
        RUNBOOK_CANCELLED: {
          target: IncidentStates.detail,
          update: ({ context, event }) => ({
            runId: Option.none(),
            ...successNotification(context, `Runbook ${event.runbook.status}`),
            actionFailure: Option.none(),
          }),
        },
        RUNBOOK_CANCEL_FAILED: {
          update: ({ event }) => ({ actionFailure: Option.some(failureMessage(event.error)) }),
        },
        RUNBOOK_FINISHED: {
          target: IncidentStates.detail,
          update: ({ context, event }) => ({
            runId: Option.none(),
            ...successNotification(
              context,
              event.runbook === undefined ? "Runbook stopped" : `Runbook ${event.runbook.status}`,
            ),
            actionFailure: Option.none(),
          }),
        },
        ...navigationHandlers,
        ...timelineHandlers,
        ...notificationHandlers,
      },
    },
    [IncidentStates.replacingRunbook]: {
      invoke: [...detailOwners, flow.run(cancelRunbook)],
      on: {
        RUNBOOK_CANCELLED: {
          target: IncidentStates.startingRunbook,
          update: () => ({
            runId: Option.none(),
            notification: Option.none(),
            actionFailure: Option.none(),
          }),
        },
        RUNBOOK_CANCEL_FAILED: {
          target: IncidentStates.detail,
          update: ({ event }) => ({
            runId: Option.none(),
            actionFailure: Option.some(failureMessage(event.error)),
          }),
        },
        ...navigationHandlers,
        ...timelineHandlers,
        ...notificationHandlers,
      },
    },
  },
});

export type { IncidentConsoleState } from "./vocabulary";
