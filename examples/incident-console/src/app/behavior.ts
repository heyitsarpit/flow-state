import {
  flowStories,
  type FlowBehaviorGateway,
  type FlowStoriesDescriptor,
} from "flow-state/inspect";

import { incidentConsoleMachine } from "../features/incidents/machine";
import { incidentListResource } from "../features/incidents/resources";
import { IncidentApp } from "./app";

export const incidentStories: FlowStoriesDescriptor<typeof incidentConsoleMachine> = flowStories(
  incidentConsoleMachine,
  [
    {
      id: "queue",
      title: "Incident queue",
      events: [],
      expectedState: "queue",
      seed: {
        resources: [
          { ref: incidentListResource.ref({}), value: { incidents: [], nextCursor: null } },
        ],
      },
    },
    {
      id: "filter-api",
      title: "Filter the queue to API incidents",
      events: [{ type: "SET_SERVICE_FILTER", value: "api" }],
      expectedState: "queue",
      seed: {
        resources: [
          { ref: incidentListResource.ref({}), value: { incidents: [], nextCursor: null } },
          {
            ref: incidentListResource.ref({ service: "api" }),
            value: { incidents: [], nextCursor: null },
          },
        ],
      },
    },
  ],
);

export const BehaviorGateway: FlowBehaviorGateway = {
  app: IncidentApp,
  stories: [incidentStories],
};
