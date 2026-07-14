import * as flow from "flow-state";

import { FeedAppLayer, FeedTestAppLayer } from "./layers";

export const createFeedRuntime = () => flow.runtime(FeedAppLayer);
export const createFeedTestRuntime = () => flow.runtime(FeedTestAppLayer);
