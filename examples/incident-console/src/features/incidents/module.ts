import * as flow from "flow-state";

import { incidentConsoleMachine } from "./machine";
import { incidentDetailResource, incidentListResource, runbookResource } from "./resources";
import { runbookMachine } from "./runbook";
import { runbookLease } from "./runbook-lease";
import { incidentTimeline } from "./timeline";
import { cancelRunbook, mutateIncident, startRunbook } from "./transactions";
import {
  incidentConsoleView,
  incidentDetailView,
  incidentDiagnosticsView,
  incidentHeaderView,
  incidentNotificationView,
  incidentQueueView,
  incidentRunbookView,
  incidentTimelineView,
} from "./view";

export const IncidentsModule = flow.module(
  "Incidents",
  {
    resources: {
      list: incidentListResource,
      detail: incidentDetailResource,
      runbook: runbookResource,
    },
    transactions: {
      mutate: mutateIncident,
      startRunbook,
      cancelRunbook,
    },
    streams: { timeline: incidentTimeline, runbookLease },
    machines: { console: incidentConsoleMachine, runbook: runbookMachine },
    views: {
      console: incidentConsoleView,
      header: incidentHeaderView,
      queue: incidentQueueView,
      detail: incidentDetailView,
      timeline: incidentTimelineView,
      runbook: incidentRunbookView,
      notification: incidentNotificationView,
      diagnostics: incidentDiagnosticsView,
    },
  },
  { screens: ["Incident console"] },
);
