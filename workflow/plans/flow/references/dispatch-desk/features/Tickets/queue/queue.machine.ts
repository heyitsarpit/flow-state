// The list subscription follows memory and context; polling adapts to whether the list loads.
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import type { TicketListInput } from "../types.js";
import { Queue } from "./queue.definition.js";

type Memory = typeof Queue.Memory.Type;

// Computed from memory and context. When the session's user changes while "mine only" is on,
// the key changes and the subscription is replaced; no reaction or event is needed. Empty
// filters are absent, which the domain reads as "no constraint".
export const listInput = ({
  memory,
  context,
}: {
  memory: Memory;
  context: { userId: string };
}): TicketListInput => ({
  workspaceId: memory.workspaceId,
  status: memory.status ?? undefined,
  assignee: memory.mineOnly ? context.userId : undefined,
  search: memory.search === "" ? undefined : memory.search,
});

const workspace = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId });

// Guards read the pre-turn snapshot, lanes included, so check() can tell a view whether these
// commands do anything (minimal-library decision 8): the button state is never a view rule.
type Lanes = {
  list?: {
    hasMore: boolean;
    data?: ReadonlyArray<{ tickets: ReadonlyArray<{ ticketId: string; status: string }> }>;
  };
};

const hasMorePages = ({ activities }: { activities: Lanes }) =>
  activities.list?.hasMore === true || deny("NoMorePages");

const canAssign = ({ activities, event }: { activities: Lanes; event: { ticketId: string } }) => {
  const row = activities.list?.data
    ?.flatMap((page) => page.tickets)
    .find((ticket) => ticket.ticketId === event.ticketId);

  return row === undefined
    ? deny("NotListed")
    : row.status === "open" || deny("NotOpen", { status: row.status });
};

export const QueueMachine = machine(Queue, ({ S, E, O }) => ({
  default: S.HEALTHY,

  // Root activities live for the actor's lifetime.
  activities: {
    list: O.Tickets.list.subscribe(listInput, {
      outcomes: {
        value: E.ListLoaded,
        failure: { QueueUnavailable: E.ListUnavailable.from(({ retryAfter }) => ({ retryAfter })) },
      },
      // Keep showing the old rows while the search changes, but not when the filters do.
      placeholder: ({ previous, input }) =>
        previous?.input.status === input.status && previous.input.assignee === input.assignee
          ? previous.data
          : undefined,
    }),
    open: O.Tickets.openCount.subscribe(workspace),
    feed: O.Tickets.events.subscribe(workspace), // pushes from other dispatchers; no events here
  },

  // Filter edits stay in the current health state: declared once, at the root (Machines.plan O2).
  on: {
    SearchChanged: { target: "self", updateMemory: ({ event }) => ({ search: event.search }) },
    StatusChanged: { target: "self", updateMemory: ({ event }) => ({ status: event.status }) },
    MineOnlyToggled: {
      target: "self",
      updateMemory: ({ memory }) => ({ mineOnly: !memory.mineOnly }),
    },
    LoadMore: { target: "self", guard: hasMorePages, actions: [O.Tickets.list.more(listInput)] },
    PollDue: { target: "self", actions: [O.Tickets.list.refetch(listInput)] },
    // Assignment is predicted by the domain: the row shows the new assignee at once and the
    // lists and counts that can be wrong repair when it settles.
    AssignToMe: {
      target: "self",
      guard: canAssign,
      updateMemory: () => ({ notice: "" }),
      actions: [
        O.Tickets.assign.commit(
          ({ memory, context, event }) => ({
            workspaceId: memory.workspaceId,
            ticketId: event.ticketId,
            assignee: context.userId,
          }),
          {
            outcomes: {
              failure: {
                TicketNotFound: E.AssignFailed.from(() => ({ reason: "That ticket was removed" })),
              },
            },
          },
        ),
      ],
    },
    AssignFailed: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
  },

  states: {
    HEALTHY: {
      schedules: { poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue } },
      on: { ListUnavailable: S.DEGRADED },
    },
    DEGRADED: {
      schedules: {
        // Back off from 5 seconds with jitter to spread clients, never waiting longer than 5
        // minutes: the cap applies after the jitter, so it holds.
        poll: {
          schedule: Schedule.min([
            Schedule.exponential("5 seconds").pipe(Schedule.jittered),
            Schedule.spaced("5 minutes"),
          ]),
          send: E.PollDue,
        },
      },
      on: { ListLoaded: S.HEALTHY },
    },
  },
}));
