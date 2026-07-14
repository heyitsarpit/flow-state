import * as flow from "flow-state";
import type { FlowRuntime } from "flow-state";

import { OptimisticAppLayer, OptimisticTestAppLayer } from "./layers";

export const createOptimisticRuntime = (): FlowRuntime => flow.runtime(OptimisticAppLayer);
export const createOptimisticTestRuntime = (): FlowRuntime => flow.runtime(OptimisticTestAppLayer);
