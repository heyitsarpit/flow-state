// Queue behaviour: the list subscription follows memory and context; polling adapts to health.
import { Schedule } from "effect";
import { machine } from "flow-state";
import type { TicketListInput } from "../types.js";
import { Queue } from "./queue.definition.js";

// The list parameters are computed from memory AND context. When the session's user changes
// while "mine only" is on, the key changes and the subscription is replaced automatically —
// no context reaction or event is needed for that.
export const listInput = ({
  memory,
  context,
}: {
  memory: {
    workspaceId: string;
    search: string;
    status: TicketListInput["filters"]["status"];
    mineOnly: boolean;
    page: number;
  };
  context: { userId: string };
}): TicketListInput => ({
  workspaceId: memory.workspaceId,
  filters: {
    status: memory.status,
    search: memory.search,
    assignee: memory.mineOnly ? context.userId : null,
  },
  page: memory.page,
});

export const QueueMachine = machine(Queue, ({ S, E, O }) => {
  // Filter edits keep the current health state. A transition must name its target (D1), so
  // each health state repeats these handlers through one shared builder (see README findings).
  const filterHandlers = (stay: typeof S.HEALTHY | typeof S.DEGRADED) => ({
    SearchChanged: {
      target: stay,
      updateMemory: ({ event }) => ({ search: event.search, page: 0 }),
    },
    StatusChanged: {
      target: stay,
      updateMemory: ({ event }) => ({ status: event.status, page: 0 }),
    },
    MineOnlyToggled: {
      target: stay,
      updateMemory: ({ memory }) => ({ mineOnly: !memory.mineOnly, page: 0 }),
    },
    PageChanged: { target: stay, updateMemory: ({ event }) => ({ page: event.page }) },
    PollDue: { target: stay, actions: [O.ticketList.refetch(listInput)] },
  });

  return {
    default: S.HEALTHY,
    activities: {
      // Root activity: lives for the actor's lifetime (replaces onMemory, D16).
      list: O.ticketList.subscribe(listInput, {
        outcomes: { value: E.ListLoaded, failure: { QueueUnavailable: E.ListUnavailable } },
      }),
    },
    states: {
      HEALTHY: {
        schedules: { poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue() } },
        on: { ...filterHandlers(S.HEALTHY), ListUnavailable: S.DEGRADED },
      },
      DEGRADED: {
        schedules: {
          // Back off from 5 seconds, never wait longer than 5 minutes, spread clients with jitter.
          poll: {
            schedule: Schedule.min([
              Schedule.exponential("5 seconds"),
              Schedule.spaced("5 minutes"),
            ]).pipe(Schedule.jittered),
            send: E.PollDue(),
          },
        },
        on: { ...filterHandlers(S.DEGRADED), ListLoaded: S.HEALTHY },
      },
    },
  };
});
