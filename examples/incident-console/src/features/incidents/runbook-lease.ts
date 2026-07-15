import { Effect, Option, Stream } from "effect";

import * as flow from "flow-state";

import { IncidentApi } from "../../services/incident-api";
import type { IncidentConsoleContext, IncidentConsoleEvent } from "./types";

export const runbookLease = flow.stream<
  IncidentConsoleContext,
  IncidentConsoleEvent,
  string,
  never,
  never,
  IncidentApi
>({
  id: "incidents.runbook-lease",
  params: ({ context }) => Option.getOrElse(context.runId, () => "missing"),
  subscribe: ({ params: runId }) =>
    Stream.never.pipe(
      Stream.ensuring(
        Effect.flatMap(IncidentApi, (api) => api.cancelRunbook(runId)).pipe(Effect.ignore),
      ),
    ),
  pressure: { strategy: "queue", limit: 1 },
  routes: {},
});
