// The list subscription follows memory and context; polling adapts to whether the list loads; "assign to
// me" is one lane per ticket, reconciled while its answer is unknown.
import { Schedule } from "effect";
import { deny, Flow, machine } from "flow-state";
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

type Draft = Memory["creating"][number];

const draftOf = (memory: Memory, draftId: string) =>
  memory.creating.find((d) => d.draftId === draftId);

const editDraft = (memory: Memory, draftId: string, change: Partial<Draft>) => ({
  creating: memory.creating.map((d) => (d.draftId === draftId ? { ...d, ...change } : d)),
});

const draftIs =
  (status: Draft["status"], code: string) =>
  ({ memory, event }: { memory: Memory; event: { draftId: string } }) =>
    draftOf(memory, event.draftId)?.status === status || deny(code);

const ofDraft = ({ event }: { event: { draftId: string } }) => ({ draftId: event.draftId });

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
      // The tabs: each list is placed only while it is chosen, so leaving a tab releases its read.
      O.unassigned.subscribe(workspace, { when: ({ memory }) => memory.tab === "unassigned" }),
      O.triage.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId, now: memory.now }), {
        when: ({ memory }) => memory.tab === "triage" && memory.now > 0,
      }),
      O.mentions.subscribe(({ memory, context }) => ({
        workspaceId: memory.workspaceId,
        me: context.userId,
      })),
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
      // The triage list's clock. Its input holds the minute, not the instant (OD4: normalised in the caller), so
      // it reads once a minute rather than on every tick. The first tick is at once.
      firstMinute: {
        schedule: "0 millis",
        armOn: [Flow.entry],
        send: E.Minute.from(({ now }) => ({ now: Math.floor(now / 60_000) * 60_000 })),
      },
      minute: {
        schedule: Schedule.spaced("1 minute"),
        send: E.Minute.from(({ now }) => ({ now: Math.floor(now / 60_000) * 60_000 })),
      },
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
      TabChosen: { target: "self", updateMemory: ({ event }) => ({ tab: event.tab }) },
      Minute: { target: "self", updateMemory: ({ event }) => ({ now: event.now }) },

      // A new ticket: a draft in memory, shown apart until a list holds the server's id (rule 33).
      CreateTicket: {
        target: "self",
        guard: [
          ({ event }) => event.title.trim() !== "" || deny("EmptyTitle"),
          ({ memory, event }) =>
            draftOf(memory, event.draftId) === undefined || deny("DuplicateDraft"),
        ],
        updateMemory: ({ memory, event }) => ({
          creating: [
            ...memory.creating,
            {
              draftId: event.draftId,
              title: event.title,
              priority: event.priority,
              status: "sending" as const,
              failure: null,
              id: null,
            },
          ],
        }),
        actions: [
          O.create.commit(({ memory, event }) => ({
            workspaceId: memory.workspaceId,
            draftId: event.draftId,
            title: event.title,
            priority: event.priority,
            dueAt: event.dueAt,
          })),
        ],
      },
      Created: {
        target: "self",
        updateMemory: ({ memory, event }) =>
          editDraft(memory, event.draftId, { status: "created", id: event.ticketId }),
      },
      CreateFailed: {
        target: "self",
        updateMemory: ({ memory, event }) =>
          editDraft(memory, event.draftId, { status: "failed", failure: event.reason }),
      },
      // Key-less: `create` alone maps it, so these name this ending's Attempt (rule 43).
      CreateUnsure: [
        { target: "self", guard: [O.create.retryable({ times: 2 })], actions: [O.create.retry] },
        {
          target: "self",
          updateMemory: ({ memory, event }) =>
            editDraft(memory, event.draftId, { status: "unsure" }),
        },
      ],
      // A failed draft is a new write; an unsure one asks about the same Attempt again.
      RetryCreate: [
        {
          target: "self",
          guard: [draftIs("failed", "NotFailed"), O.create.idle(ofDraft)],
          updateMemory: ({ memory, event }) =>
            editDraft(memory, event.draftId, { status: "sending", failure: null }),
          actions: [
            O.create.commit(({ memory, event }) => {
              const draft = draftOf(memory, event.draftId);

              return {
                workspaceId: memory.workspaceId,
                draftId: event.draftId,
                title: draft?.title ?? "",
                priority: draft?.priority ?? 1,
                dueAt: null,
              };
            }),
          ],
        },
        {
          target: "self",
          guard: [draftIs("unsure", "NothingToRetry"), O.create.retryable(ofDraft, { times: 3 })],
          updateMemory: ({ memory, event }) =>
            editDraft(memory, event.draftId, { status: "sending" }),
          actions: [O.create.retry(ofDraft)],
        },
      ],
      DiscardDraft: [
        {
          target: "self",
          guard: [draftIs("failed", "NotFailed")],
          updateMemory: ({ memory, event }) => ({
            creating: memory.creating.filter((d) => d.draftId !== event.draftId),
          }),
        },
        // An unsure draft may exist on the server: release it and keep the line, so the list can still show it.
        {
          target: "self",
          guard: [draftIs("unsure", "NotUnsure")],
          updateMemory: ({ memory, event }) =>
            editDraft(memory, event.draftId, { status: "created" }),
          actions: [O.create.cancel(ofDraft)],
        },
      ],
      // The list holds a draft's id: the draft's job is done (housekeeping; the view's filter is what shows).
      ListLoaded: {
        target: "self",
        updateMemory: ({ memory, event }) => ({
          creating: memory.creating.filter((d) => d.id === null || !event.ticketIds.includes(d.id)),
        }),
      },

      // Archiving predicts a delete: the ticket leaves every list at once. A 403 puts it back (rule 30).
      Archive: {
        target: "self",
        guard: [O.archive.idle(assignKey)],
        actions: [O.archive.commit(assignKey)],
      },
      Archived: { target: "self" },
      ArchiveRefused: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
      ArchiveUnsure: { target: "self", actions: [O.archive.cancel] }, // release; the record stays marked uncertain

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
        on: {
          ListLoaded: {
            target: S.HEALTHY,
            updateMemory: ({ memory, event }) => ({
              creating: memory.creating.filter(
                (d) => d.id === null || !event.ticketIds.includes(d.id),
              ),
            }),
          },
          ListUnavailable: { target: "self" },
        },
      },
    },
  };
});
