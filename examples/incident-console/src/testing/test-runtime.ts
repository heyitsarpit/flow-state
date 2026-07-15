import { Effect, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";

import * as flow from "flow-state";

import { IncidentApp } from "../app/app";
import { IncidentApi, type IncidentApiShape } from "../services/incident-api";
import { fixtureIncident, fixturePage, fixtureRunbook } from "./fixtures";

export const incidentApiLayer = (api: IncidentApiShape) =>
  Layer.succeed(IncidentApi, IncidentApi.of(api));

export const fixtureIncidentApi = (
  overrides: Partial<IncidentApiShape> = {},
): IncidentApiShape => ({
  list: () => Effect.succeed(fixturePage),
  detail: () => Effect.succeed(fixtureIncident),
  patch: (_incidentId, patch) =>
    Effect.succeed({
      ...fixtureIncident,
      ...(patch.assignee === undefined ? {} : { assignee: patch.assignee }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      version: fixtureIncident.version + 1,
    }),
  startRunbook: () => Effect.succeed({ runId: "run-1" }),
  getRunbook: () => Effect.succeed(fixtureRunbook("succeeded")),
  cancelRunbook: () => Effect.succeed(fixtureRunbook("cancelled")),
  timeline: () => Stream.never,
  ...overrides,
});

export const createIncidentTestRuntime = (api: IncidentApiShape = fixtureIncidentApi()) =>
  flow.runtime(
    IncidentApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [incidentApiLayer(api), TestClock.layer()],
    }),
  );
