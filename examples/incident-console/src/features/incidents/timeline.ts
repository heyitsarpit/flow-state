import { Effect, Option, Stream } from "effect";

import * as flow from "flow-state";

import {
  IncidentApi,
  type IncidentApiFailure,
  type TimelineSignal,
} from "../../services/incident-api";
import type { IncidentConsoleContext, IncidentConsoleEvent } from "./types";

export const incidentTimeline = flow.stream<
  IncidentConsoleContext,
  IncidentConsoleEvent,
  Readonly<{ readonly incidentId: string; readonly afterId?: string }>,
  TimelineSignal,
  IncidentApiFailure,
  IncidentApi
>({
  id: "incidents.timeline",
  params: ({ context }) => ({
    incidentId: Option.getOrElse(context.selectedIncidentId, () => "missing"),
    ...(Option.isNone(context.timelineLastSequence)
      ? {}
      : { afterId: `evt-${context.timelineLastSequence.value}` }),
  }),
  subscribe: ({ params }) =>
    Stream.unwrap(
      Effect.map(IncidentApi, (api) => api.timeline(params.incidentId, params.afterId)),
    ),
  pressure: { strategy: "queue", limit: 64 },
  routes: {
    value: (signal) =>
      signal.type === "connected"
        ? { type: "TIMELINE_CONNECTED" }
        : signal.type === "reconnecting"
          ? { type: "TIMELINE_RECONNECTING" }
          : { type: "TIMELINE_EVENT", event: signal.event },
    failure: (error) => ({ type: "TIMELINE_FAILED", error }),
  },
});
