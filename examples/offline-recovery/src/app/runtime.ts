import * as flow from "flow-state";
import type { FlowRuntime } from "flow-state";

import type { ConnectivityService, MovieService, OutboxPersistence } from "../services/services";
import { OfflineClientLayer } from "./layers";

export type OfflineServices = ConnectivityService | MovieService | OutboxPersistence;

export const createOfflineClientRuntime = (): FlowRuntime<OfflineServices> =>
  flow.runtime(OfflineClientLayer);
