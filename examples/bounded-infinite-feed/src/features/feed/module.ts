import * as flow from "flow-state";

import { feedMachine } from "./machine";
import { projectPageResource } from "./resources";
import { feedView } from "./view";

export const FeedModule = flow.module("Feed", {
  resources: { page: projectPageResource },
  machines: { window: feedMachine },
  views: { window: feedView },
});
