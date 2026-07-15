import * as flow from "flow-state";
import type { FlowResourceSnapshot } from "flow-state";

import type { DurableOutbox, Movie } from "../../domain/offline";
import type { OfflineContext, OfflineState } from "./machine-types";
import { outboxWorker } from "./worker";

const isMovie = (value: unknown): value is Movie =>
  typeof value === "object" && value !== null && "title" in value && "comment" in value;
const isOutbox = (value: unknown): value is DurableOutbox =>
  typeof value === "object" && value !== null && "pending" in value && Array.isArray(value.pending);

const valueOf = <Value>(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  id: string,
  guard: (value: unknown) => value is Value,
) => {
  const snapshot = resources[id];
  return snapshot?.availability === "value" && guard(snapshot.value) ? snapshot.value : undefined;
};

export interface OfflineSelection {
  readonly state: OfflineState;
  readonly online: boolean;
  readonly movie: Movie | undefined;
  readonly queuedCount: number;
  readonly workerStatus: "idle" | "active" | "failure" | "stopped";
  readonly failed: boolean;
}

export const offlineView = flow.view<OfflineContext, OfflineState, OfflineSelection>({
  id: "offline.recovery.view",
  sources: ["context", "resources", "transactions", "children", "issues"],
  select: ({ value, resources, children }) => {
    const child = children[outboxWorker.id];
    const childTransaction = child?.snapshot?.transactions["offline.drain-one"];
    const status = child?.status;
    return {
      state: value,
      online: value === "online",
      movie: valueOf(resources, "offline.movie", isMovie),
      queuedCount: valueOf(resources, "offline.outbox", isOutbox)?.pending.length ?? 0,
      workerStatus:
        status === "active" || status === "failure" || status === "stopped" ? status : "idle",
      failed: status === "failure" || childTransaction?.status === "failure",
    };
  },
});
