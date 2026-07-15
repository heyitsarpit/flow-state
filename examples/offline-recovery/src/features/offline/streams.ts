import { Effect, Stream } from "effect";

import * as flow from "flow-state";

import type { Connectivity, ConnectivityUnavailable } from "../../domain/offline";
import { ConnectivityService } from "../../services/services";
import type { OfflineContext, OfflineEvent } from "./machine-types";

export const connectivityStream = flow.stream<
  OfflineContext,
  OfflineEvent,
  void,
  Connectivity,
  ConnectivityUnavailable,
  ConnectivityService
>({
  id: "offline.connectivity",
  subscribe: () =>
    Stream.unwrap(Effect.map(ConnectivityService, (connectivity) => connectivity.changes)),
  pressure: { strategy: "coalesce-latest", limit: 1, key: () => "connectivity" },
  routes: {
    value: (connectivity) => ({ type: connectivity === "online" ? "ONLINE" : "OFFLINE" }),
    failure: ({ message }) => ({ type: "CONNECTIVITY_FAILED", message }),
  },
});
