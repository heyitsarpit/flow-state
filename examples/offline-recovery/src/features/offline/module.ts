import * as flow from "flow-state";

import { offlineMachine } from "./machine";
import { movieResource, outboxResource } from "./resources";
import { connectivityStream } from "./streams";
import { drainOutbox, queueFirstComment, queueSecondComment } from "./transactions";
import { offlineView } from "./view";
import { outboxWorkerMachine } from "./worker";

export const OfflineModule = flow.module("OfflineRecovery", {
  resources: { movie: movieResource, outbox: outboxResource },
  transactions: {
    queueFirst: queueFirstComment,
    queueSecond: queueSecondComment,
    drain: drainOutbox,
  },
  streams: { connectivity: connectivityStream },
  machines: { recovery: offlineMachine, worker: outboxWorkerMachine },
  views: { recovery: offlineView },
});
