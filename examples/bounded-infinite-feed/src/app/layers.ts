import * as flow from "flow-state";

import { ProjectFeedLive } from "../services/layers";
import { FeedApp } from "./app";

export const FeedAppLayer = FeedApp.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [ProjectFeedLive],
});

export const FeedTestAppLayer = FeedApp.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [ProjectFeedLive],
});
