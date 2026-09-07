import { Effect, Option, Stream } from "effect";

import * as flow from "flow-state";

import {
  IncidentApi,
  type IncidentApiFailure,
  type TimelineSignal,
} from "../../services/incident-api";
import type { IncidentConsoleContext, IncidentConsoleEvent } from "./types";
import { selectedIncidentId } from "./types";
import { IncidentEvents } from "./vocabulary";

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
    incidentId: selectedIncidentId(context),
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
        ? IncidentEvents.timelineConnected()
        : signal.type === "reconnecting"
          ? IncidentEvents.timelineReconnecting()
          : IncidentEvents.timelineEvent(signal.event),
    failure: IncidentEvents.timelineFailed,
  },
});

