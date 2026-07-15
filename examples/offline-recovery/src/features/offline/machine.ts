import { Option } from "effect";

import * as flow from "flow-state";

import type { OfflineContext, OfflineEvent, OfflineState } from "./machine-types";
import { movieResource } from "./resources";
import { connectivityStream } from "./streams";
import { queueFirstComment, queueSecondComment } from "./transactions";
import { outboxWorker } from "./worker";

const connectivityFailure = ({ event }: { readonly event: OfflineEvent }) =>
  event.type === "CONNECTIVITY_FAILED" ? { connectivityError: Option.some(event.message) } : {};

export const offlineMachine = flow.machine<OfflineContext, OfflineEvent, OfflineState>({
  id: "offline.recovery",
  initial: "idle",
  context: () => ({
    nextQueueId: 1,
    drafts: Option.none(),
    connectivityError: Option.none(),
  }),
  states: {
    idle: { on: { START: "offline" } },
    offline: {
      invoke: [connectivityStream, flow.ensure(movieResource.ref("movie-1"))],
      on: {
        ONLINE: "online",
        OFFLINE: {},
        CONNECTIVITY_FAILED: { update: connectivityFailure },
        QUEUE_PAIR: {
          target: "queueing",
          update: ({ context, event }) =>
            event.type === "QUEUE_PAIR"
              ? {
                  nextQueueId: context.nextQueueId + 2,
                  drafts: Option.some([
                    {
                      id: `outbox-${context.nextQueueId}`,
                      movieId: "movie-1",
                      comment: event.first,
                    },
                    {
                      id: `outbox-${context.nextQueueId + 1}`,
                      movieId: "movie-1",
                      comment: event.second,
                    },
                  ] as const),
                }
              : {},
        },
      },
    },
    queueing: {
      invoke: [connectivityStream, flow.run(queueFirstComment), flow.run(queueSecondComment)],
      on: {
        CANCEL_QUEUE: "offline",
        ONLINE: "online",
        OFFLINE: "offline",
        CONNECTIVITY_FAILED: { update: connectivityFailure },
      },
    },
    online: {
      invoke: [connectivityStream, flow.observe(movieResource.ref("movie-1")), outboxWorker],
      on: {
        ONLINE: {},
        OFFLINE: "offline",
        CONNECTIVITY_FAILED: { update: connectivityFailure },
      },
    },
  },
});
