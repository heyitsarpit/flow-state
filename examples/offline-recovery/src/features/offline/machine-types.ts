import type { Option } from "effect";

import type { OutboxEntry } from "../../domain/offline";

export type QueuePair = readonly [OutboxEntry, OutboxEntry];

export interface OfflineContext {
  readonly nextQueueId: number;
  readonly drafts: Option.Option<QueuePair>;
  readonly connectivityError: Option.Option<string>;
}

export type OfflineEvent =
  | Readonly<{ readonly type: "START" }>
  | Readonly<{ readonly type: "ONLINE" }>
  | Readonly<{ readonly type: "OFFLINE" }>
  | Readonly<{ readonly type: "CONNECTIVITY_FAILED"; readonly message: string }>
  | Readonly<{ readonly type: "QUEUE_PAIR"; readonly first: string; readonly second: string }>
  | Readonly<{ readonly type: "CANCEL_QUEUE" }>;

export type OfflineState = "idle" | "offline" | "queueing" | "online";
