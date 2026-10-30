// The list subscription follows memory and context; polling adapts to whether the list loads; "assign to
// me" is one lane per ticket, reconciled while its answer is unknown.
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import type { TicketListInput } from "../types.js";
import { MAX_ASSIGN_RESENDS, Queue } from "./queue.definition.js";

type Memory = typeof Queue.Memory.Type;

// Computed from memory and context. When the session's user changes while "mine only" is on, the key
// changes and the subscription is replaced; no reaction or event is needed. Empty filters are absent,
// which the domain reads as "no constraint".
// The contract's key is a field list and cannot normalise (OD4), so "Lobby " and "lobby" share a cache
// entry only because the search is trimmed and lowercased here, before the input exists.
// Normalisation lives in the caller (decided, OD4; ticket.contracts.ts says the same).
export const listInput = ({
  memory,
  context,
}: {
  memory: Memory;
  context: { userId: string };
}): TicketListInput => {
  const search = memory.search.trim().toLowerCase();

  return {
    workspaceId: memory.workspaceId,
    status: memory.status ?? undefined,
    assignee: memory.mineOnly ? context.userId : undefined,
    search: search === "" ? undefined : search,
  };
};

const workspace = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId });

// Any value carrying the key's fields names the lane (OD4). The event names the ticket, memory the workspace.
const assignKey = ({ memory, event }: { memory: Memory; event: { ticketId: string } }) => ({
  workspaceId: memory.workspaceId,
  ticketId: event.ticketId,
});

// The reconcile event carries the whole key, so it names the lane itself.
const named = ({ event }: { event: { workspaceId: string; ticketId: string } }) => event;

// The part of the snapshot these guards read: the list lane, paged (derived from the definition).
type Lanes = (typeof Queue.Snapshot.Type)["operations"];

// Guards read the pre-turn snapshot, lanes included, so check() can tell a view whether these
// commands do anything (minimal-library decision 8): the button state is never a view rule.
const hasMorePages = ({ operations }: { operations: Lanes }) =>
  operations.list?.hasMore === true || deny("NoMorePages");

const canAssign = ({ operations, event }: { operations: Lanes; event: { ticketId: string } }) => {
  const row = operations.list?.data
    ?.flatMap((page) => page.tickets)
    .find((ticket) => ticket.ticketId === event.ticketId);

  return row === undefined
    ? deny("NotListed")
    : row.status === "open" || deny("NotOpen", { status: row.status });
};

export const QueueMachine = machine(Queue, ({ S, E, O }) => {
  return {
    default: S.HEALTHY,

    // Root activities live for the actor's lifetime. Pushes from other dispatchers are DeskFeed's.
    activities: [
      O.list.subscribe(listInput, {
        // Keep showing the old rows while the search changes, but not when the filters do.
        placeholder: ({ previous, input }) =>
          previous?.input.status === input.status && previous.input.assignee === input.assignee
            ? previous.data
            : undefined,
      }),
      O.open.subscribe(workspace),
    ],

    // The preview drawer: the Comments trait, one thread per previewed ticket (F7). The reset value is the
    // subject path, so a post held for A while B is previewed is parked, and A's next preview adopts it
    // ("A, B, A"). Previewing nothing is `""`, which places no thread read.
    // No `Comments.O.post.idle` guard on the transitions that change `previewId`: the trait's header says why
    // (B7). Rule 56's structural warning is accepted here (plan 6, item 3).
    traits: {
      preview: {
        input: ({ memory }) => ({
          workspaceId: memory.workspaceId,
          ticketId: memory.previewId ?? "",
        }),
        resetOn: ({ memory }) => memory.previewId ?? "",
        callbacks: {
          // The previewed ticket was removed elsewhere: close the drawer and say so.
          onTicketGone: {
            updateMemory: () => ({ previewId: null, notice: "That ticket was removed" }),
            actions: [O.list.refetch(listInput)],
          },
        },
      },
    },

    // One keyed timer per held assignment, read from the lanes (rule 23), declared once for both health states.
    schedules: {
      reconcile: {
        keys: ({ operations }) =>
          operations.assign.filter((lane) => lane.uncertain).map((lane) => lane.key),
        schedule: "3 seconds",
        send: E.ReconcileAssign.from(({ key }) => ({
          workspaceId: key.workspaceId,
          ticketId: key.ticketId,
        })),
      },
    },

    // Filter edits stay in the current health state: declared once, at the root (Machines.plan O2).
    on: {
      SearchChanged: { target: "self", updateMemory: ({ event }) => ({ search: event.search }) },
      StatusChanged: { target: "self", updateMemory: ({ event }) => ({ status: event.status }) },
      MineOnlyToggled: {
        target: "self",
        updateMemory: ({ memory }) => ({ mineOnly: !memory.mineOnly }),
      },
      // PROPOSED, not decided: `more` and `hasMore` are the plan's (gap 23); the domain's `.pagedBy` must agree.
      LoadMore: { target: "self", guard: hasMorePages, actions: [O.list.more(listInput)] },
      PollDue: { target: "self", actions: [O.list.refetch(listInput)] },

      PreviewOpened: {
        target: "self",
        updateMemory: ({ event }) => ({ previewId: event.ticketId }),
      },
      PreviewClosed: { target: "self", updateMemory: () => ({ previewId: null }) },

      // Assignment is predicted by the domain: the row shows the new assignee at once, and the lists and
      // counts that can be wrong repair when it settles. `idle` refuses a second press on the same ticket
      // (a lane in flight, or one holding an unknown); another ticket has its own lane.
      AssignToMe: {
        target: "self",
        guard: [canAssign, O.assign.idle(assignKey)],
        updateMemory: () => ({ notice: "" }),
        actions: [
          O.assign.commit(({ memory, context, event }) => ({
            workspaceId: memory.workspaceId,
            ticketId: event.ticketId,
            assignee: context.userId,
          })),
        ],
      },
      AssignFailed: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
      // 409: say who has it, and read the list again; the definite failure removed the prediction.
      AssignConflict: {
        target: "self",
        updateMemory: ({ event }) => ({ notice: `Already assigned to ${event.assignee}` }),
        actions: [O.list.refetch(listInput)],
      },
      // Unknown: the same Attempt is re-sent by `reconcile` while the budget lasts; then release the hold.
      // Key-less: `assign` alone maps this event, so these address this ending's Attempt (rule 43).
      AssignUnsure: [
        { target: "self", guard: [O.assign.retryable({ times: MAX_ASSIGN_RESENDS })] },
        {
          target: "self",
          updateMemory: () => ({ notice: "We couldn't confirm that assignment" }),
          actions: [O.assign.cancel],
        },
      ],
      ReconcileAssign: { target: "self", actions: [O.assign.retry(named)] }, // not an ending: the event names the ticket
    },

    states: {
      HEALTHY: {
        schedules: { poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue } },
        on: { ListUnavailable: S.DEGRADED, ListLoaded: { target: "self" } },
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
        on: { ListLoaded: S.HEALTHY, ListUnavailable: { target: "self" } },
      },
    },
  };
});
