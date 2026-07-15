import * as flow from "flow-state";

import { OfflineServicesLive } from "../services/layers";
import { OfflineApp } from "./app";

export const OfflineClientLayer = OfflineApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [OfflineServicesLive],
});
