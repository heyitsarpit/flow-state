import { Option } from "effect";

import * as flow from "flow-state";
import type { FlowActorSnapshotTree, FlowResourceSnapshot } from "flow-state";

import { IncidentSchema, RunbookSchema, type Incident, type Runbook } from "../../domain/incidents";
import { incidentDetailResource, incidentListResource, runbookResource } from "./resources";
import { runbookMachine } from "./runbook";
import { runbookLease } from "./runbook-lease";
import { resourceValue } from "./selectors";
import { incidentTimeline } from "./timeline";
import { cancelRunbook, mutateIncident, startRunbook } from "./transactions";
import {
  apiConflict,
  defaultFilters,
  queryFromContext,
  type IncidentConsoleContext,
  type IncidentConsoleEvent,
} from "./types";

const listParams = ({ context }: flow.ResourceParams<IncidentConsoleContext>) =>
  [queryFromContext(context)] as const;

const detailParams = ({ context }: flow.ResourceParams<IncidentConsoleContext>) =>
  [Option.getOrElse(context.selectedIncidentId, () => "missing")] as const;

const canChangeStatus = (
  status: Incident["status"],
  selectedIncidentId: Option.Option<string>,
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
) => {
  const incident = resourceValue(resources, incidentDetailResource.id, IncidentSchema);
  return (
    Option.isSome(selectedIncidentId) &&
    incident !== undefined &&
    ((status === "acknowledged" && incident.status === "open") ||
      (status === "resolved" && incident.status !== "resolved") ||
      (status === "open" && incident.status === "resolved"))
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
    incidentId: Option.getOrElse(context.selectedIncidentId, () => "missing"),
    runId: Option.getOrElse(context.runId, () => "missing"),
    runbook: Option.none(),
    error: Option.none(),
    retryCount: 0,
  }),
  routes: flow.outcomes<FlowActorSnapshotTree, flow.FlowIssue, IncidentConsoleEvent>({
    success: ({ value }) => ({ type: "RUNBOOK_FINISHED", runbook: runbookFromSnapshot(value) }),
    failure: () => ({ type: "RUNBOOK_FINISHED", runbook: undefined }),
    defect: () => ({ type: "RUNBOOK_FINISHED", runbook: undefined }),
    interrupt: () => ({ type: "RUNBOOK_FINISHED", runbook: undefined }),
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

export const incidentConsoleMachine = flow.machine<IncidentConsoleContext, IncidentConsoleEvent>()({
  id: "incidents.console",
  initial: "queue",
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
    feedback: Option.none(),
  }),
  states: {
    queue: {
      invoke: flow.ensure(incidentListResource, { params: listParams }),
      on: {
        SET_SERVICE_FILTER: {
          target: "queue",
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, service: event.value },
            cursor: Option.none(),
          }),
        },
        SET_SEVERITY_FILTER: {
          target: "queue",
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, severity: event.value },
            cursor: Option.none(),
          }),
        },
        SET_STATUS_FILTER: {
          target: "queue",
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, status: event.value },
            cursor: Option.none(),
          }),
        },
        SET_ASSIGNEE_FILTER: {
          target: "queue",
          reenter: true,
          update: ({ context, event }) => ({
            filters: { ...context.filters, assignee: event.value },
            cursor: Option.none(),
          }),
        },
        CLEAR_FILTERS: {
          target: "queue",
          reenter: true,
          update: () => ({ filters: defaultFilters, cursor: Option.none() }),
        },
        NEXT_PAGE: {
          target: "queue",
          reenter: true,
          update: ({ event }) => ({ cursor: Option.some(event.cursor) }),
        },
        FIRST_PAGE: {
          target: "queue",
          reenter: true,
          update: () => ({ cursor: Option.none() }),
        },
        REFRESH_QUEUE: { target: "queue", reenter: true },
        OPEN_INCIDENT: {
          target: "detail",
          update: ({ event }) => ({
            selectedIncidentId: Option.some(event.incidentId),
            timeline: [],
            timelineLastSequence: Option.none(),
            timelineGap: false,
            timelineConnection: "connecting",
            conflict: Option.none(),
          }),
        },
      },
    },
    detail: {
      invoke: detailOwners,
      on: {
        BACK_TO_QUEUE: {
          target: "queue",
          update: () => ({
            selectedIncidentId: Option.none(),
            runId: Option.none(),
            timelineConnection: "idle",
          }),
        },
        OPEN_INCIDENT: {
          target: "detail",
          reenter: true,
          update: ({ event }) => ({
            selectedIncidentId: Option.some(event.incidentId),
            timeline: [],
            timelineLastSequence: Option.none(),
            timelineGap: false,
            timelineConnection: "connecting",
            conflict: Option.none(),
          }),
        },
        REFRESH_DETAIL: {
          target: "refreshing-detail",
          update: () => ({ detailRefreshReason: "manual" }),
        },
        ASSIGN: { submit: mutateIncident },
        CHANGE_STATUS: [
          {
            submit: mutateIncident,
            guard: ({ context, event, resources }) =>
              event.type === "CHANGE_STATUS" &&
              canChangeStatus(event.status, context.selectedIncidentId, resources),
          },
        ],
        MUTATION_SUCCEEDED: {
          update: ({ event }) => ({
            feedback: Option.some(`Incident ${event.incident.id} updated`),
            conflict: Option.none(),
          }),
        },
        MUTATION_FAILED: {
          update: ({ event }) => {
            const conflict = apiConflict(event.error);
            return {
              conflict: Option.fromNullishOr(conflict),
              feedback: Option.some(
                conflict === undefined ? event.error.message : "Server version changed",
              ),
            };
          },
        },
        MUTATION_DEFECT: { update: () => ({ feedback: Option.some("Mutation defect") }) },
        MUTATION_INTERRUPTED: {
          update: () => ({ feedback: Option.some("Mutation interrupted") }),
        },
        ACCEPT_SERVER_VERSION: {
          target: "refreshing-detail",
          update: () => ({ conflict: Option.none(), detailRefreshReason: "manual" }),
        },
        TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" }) },
        TIMELINE_RECONNECTING: { update: () => ({ timelineConnection: "reconnecting" }) },
        TIMELINE_EVENT: [
          {
            target: "refreshing-detail",
            guard: shouldRefreshFromTimeline,
            update: (args) => ({ ...appendTimelineEvent(args), detailRefreshReason: "live" }),
          },
          { update: appendTimelineEvent },
        ],
        TIMELINE_FAILED: {
          update: ({ event }) => ({
            timelineConnection: "failed",
            feedback: Option.some(event.error.message),
          }),
        },
        START_RUNBOOK: "starting-runbook",
      },
    },
    "refreshing-detail": {
      invoke: [
        flow.observe(incidentListResource, { params: listParams }),
        flow.refresh(incidentDetailResource, {
          params: detailParams,
          routes: flow.outcomes<
            Incident,
            import("../../services/incident-api").IncidentApiFailure,
            IncidentConsoleEvent
          >({
            success: ({ value }) => ({ type: "DETAIL_REFRESHED", incident: value }),
            failure: ({ error }) => ({ type: "DETAIL_REFRESH_FAILED", error }),
            defect: () => ({ type: "DETAIL_REFRESH_DEFECT" }),
            interrupt: () => ({ type: "DETAIL_REFRESH_INTERRUPTED" }),
          }),
        }),
        incidentTimeline,
      ],
      on: {
        DETAIL_REFRESHED: {
          target: "detail",
          update: ({ context }) => ({
            feedback:
              context.detailRefreshReason === "manual"
                ? Option.some("Incident refreshed")
                : context.feedback,
          }),
        },
        DETAIL_REFRESH_FAILED: {
          target: "detail",
          update: ({ event }) => ({ feedback: Option.some(event.error.message) }),
        },
        DETAIL_REFRESH_DEFECT: {
          target: "detail",
          update: () => ({ feedback: Option.some("Refresh defect") }),
        },
        DETAIL_REFRESH_INTERRUPTED: "detail",
        BACK_TO_QUEUE: "queue",
        TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" }) },
        TIMELINE_RECONNECTING: { update: () => ({ timelineConnection: "reconnecting" }) },
        TIMELINE_EVENT: { update: appendTimelineEvent },
      },
    },
    "starting-runbook": {
      invoke: [...detailOwners, flow.run(startRunbook)],
      on: {
        RUNBOOK_STARTED: {
          target: "runbook",
          update: ({ event }) => ({
            runId: Option.some(event.runId),
            feedback: Option.some(`Runbook ${event.runId} started`),
          }),
        },
        RUNBOOK_START_FAILED: {
          target: "detail",
          update: ({ event }) => ({ feedback: Option.some(event.error.message) }),
        },
        BACK_TO_QUEUE: "queue",
        TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" }) },
        TIMELINE_RECONNECTING: { update: () => ({ timelineConnection: "reconnecting" }) },
        TIMELINE_EVENT: { update: appendTimelineEvent },
      },
    },
    runbook: {
      invoke: [...detailOwners, runbookLease, runbookChild],
      on: {
        CANCEL_RUNBOOK: { submit: cancelRunbook },
        REPLACE_RUNBOOK: "replacing-runbook",
        RUNBOOK_CANCELLED: {
          target: "detail",
          update: ({ event }) => ({
            runId: Option.none(),
            feedback: Option.some(`Runbook ${event.runbook.status}`),
          }),
        },
        RUNBOOK_CANCEL_FAILED: {
          update: ({ event }) => ({ feedback: Option.some(event.error.message) }),
        },
        RUNBOOK_FINISHED: {
          target: "detail",
          update: ({ event }) => ({
            runId: Option.none(),
            feedback: Option.some(
              event.runbook === undefined ? "Runbook stopped" : `Runbook ${event.runbook.status}`,
            ),
          }),
        },
        TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" }) },
        TIMELINE_RECONNECTING: { update: () => ({ timelineConnection: "reconnecting" }) },
        TIMELINE_EVENT: { update: appendTimelineEvent },
      },
    },
    "replacing-runbook": {
      invoke: [...detailOwners, flow.run(cancelRunbook)],
      on: {
        RUNBOOK_CANCELLED: {
          target: "starting-runbook",
          update: () => ({ runId: Option.none(), feedback: Option.some("Replacing runbook") }),
        },
        RUNBOOK_CANCEL_FAILED: {
          target: "detail",
          update: ({ event }) => ({
            runId: Option.none(),
            feedback: Option.some(event.error.message),
          }),
        },
        TIMELINE_CONNECTED: { update: () => ({ timelineConnection: "live" }) },
        TIMELINE_RECONNECTING: { update: () => ({ timelineConnection: "reconnecting" }) },
        TIMELINE_EVENT: { update: appendTimelineEvent },
      },
    },
  },
});

export type IncidentConsoleState = flow.InferMachineState<typeof incidentConsoleMachine>;
