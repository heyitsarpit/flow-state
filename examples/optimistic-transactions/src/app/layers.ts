import * as flow from "flow-state";

import { createTodoServiceLayer } from "../services/layers";
import { OptimisticApp } from "./app";

export const OptimisticAppLayer = OptimisticApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [createTodoServiceLayer()],
});

export const OptimisticTestAppLayer = OptimisticApp.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [createTodoServiceLayer()],
});
