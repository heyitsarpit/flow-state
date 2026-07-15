import type { FlowBehaviorGateway } from "flow-state/inspect";
import { flowStories } from "flow-state/inspect";

import { offlineMachine } from "../features/offline/machine";
import { OfflineApp } from "./app";

export const offlineStories = flowStories(offlineMachine, [
  {
    id: "restored-shell",
    title: "Restored shell before host connectivity starts",
    events: [],
    expectedState: "idle",
  },
]);

export const BehaviorGateway: FlowBehaviorGateway = {
  app: OfflineApp,
  stories: [offlineStories],
};
