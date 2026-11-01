// The queue's behaviour. The list subscription follows memory and context; polling adapts to whether the list
// loads; the rows' copies, flashes, presence sessions and SLA timers all follow the list's confirmed value.
//
// Where each kind of key comes from (rule 9, rule 23: membership is host data, keyed things are key records):
//   toggles   (copies)          `visibleRows`, written by ListLoaded
//   flashes   (copies)          `flashing`, a row whose revision moved between two values; the copy asks to go
//   viewers   (sessions)        the visible rows, `subscribe.each`
//   assignees (sessions)        the distinct assignees that name a technician, `subscribe.each`
//   sla       (keyed schedule)  open rows with a deadline not yet breached, one timer each
import { Duration, Schedule } from "effect";
import { deny, Flow, machine } from "flow-state";
import type { TicketListInput } from "../types.js";
import { Queue } from "./queue.definition.js";

type Memory = typeof Queue.Memory.Type;

type Draft = Memory["creating"][number];

// Computed from memory and context. When the session's user changes while "mine only" is on, the key changes and
// the subscription is replaced; no reaction or event is needed. Empty filters are absent, which the domain reads as
// "no constraint". Normalisation lives in the caller (decided, OD4): "Lobby " and "lobby" share one cache entry
// because the applied search is trimmed and lowercased here, before the input exists.
export const listInput = ({
  memory,
  context,
}: {
  memory: Memory;
  context: { userId: string };
}): TicketListInput => {
  const search = memory.appliedSearch.trim().toLowerCase();

  return {
    workspaceId: memory.workspaceId,
    status: memory.status ?? undefined,
    assignee: memory.mineOnly ? context.userId : undefined,
    search: search === "" ? undefined : search,
  };
};

const workspace = ({ memory }: { memory: Memory }) => ({ workspaceId: memory.workspaceId });

const ticketKey = ({ memory, event }: { memory: Memory; event: { ticketId: string } }) => ({
  workspaceId: memory.workspaceId,
  ticketId: event.ticketId,
});

// The part of the snapshot these guards read: the list lane, paged (derived from the definition).
type Lanes = (typeof Queue.Snapshot.Type)["operations"];

const hasMorePages = ({ operations }: { operations: Lanes }) =>
  operations.list?.hasMore === true || deny("NoMorePages");

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

// What a new confirmed list value does to memory: the rows, the copies' membership, the flashes, the drafts.
const listed = ({ memory, event }: { memory: Memory; event: { rows: Memory["rows"] } }) => {
  const before = new Map(memory.rows.map((row) => [row.ticketId, row.revision]));
  const moved = event.rows
    .filter((row) => before.has(row.ticketId) && before.get(row.ticketId) !== row.revision)
    .map((row) => row.ticketId);
  const ids = event.rows.map((row) => row.ticketId);

  return {
    rows: event.rows,
    visibleRows: ids,
    flashing: [
      ...memory.flashing.filter((id) => ids.includes(id)),
      ...moved.filter((id) => !memory.flashing.includes(id)),
    ],
    selected: memory.selected.filter((id) => ids.includes(id)),
    creating: memory.creating.filter((d) => d.id === null || !ids.includes(d.id)),
  };
};

export const QueueMachine = machine(Queue, ({ S, E, O }) => ({
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
    O.unassigned.subscribe(workspace, { when: ({ memory }) => memory.tab === "unassigned" }),
    O.triage.subscribe(({ memory }) => ({ workspaceId: memory.workspaceId, now: memory.now }), {
      when: ({ memory }) => memory.tab === "triage" && memory.now > 0,
    }),
    O.mentions.subscribe(({ memory, context }) => ({
      workspaceId: memory.workspaceId,
      me: context.userId,
    })),
    // One session per distinct key of the selected inputs (rule 41): a key that leaves releases its session.
    O.assignees.subscribe.each(({ memory }) =>
      [
        ...new Set(
          memory.rows
            .map((row) => row.assignee)
            .filter((id): id is string => id?.startsWith("tech-") === true),
        ),
      ].map((technicianId) => ({ workspaceId: memory.workspaceId, technicianId })),
    ),
    O.viewers.subscribe.each(({ memory }) =>
      memory.visibleRows.map((ticketId) => ({ workspaceId: memory.workspaceId, ticketId })),
    ),
  ],

  // The drawer, the row toggles and the flashes. The preview's reset value is the subject path, so a post held for
  // A while B is previewed is parked, and A's next preview adopts it ("A, B, A"). No `Comments.O.post.idle` guard on
  // the transitions that change `previewId`: rule 56's structural warning is accepted here, on purpose.
  traits: {
    preview: {
      input: ({ memory }) => ({
        workspaceId: memory.workspaceId,
        ticketId: memory.previewId ?? "",
      }),
      resetOn: ({ memory }) => memory.previewId ?? "",
      callbacks: {
        onTicketGone: {
          updateMemory: () => ({ previewId: null, notice: "That ticket was removed" }),
          actions: [O.list.refetch(listInput)],
        },
      },
    },
    // A row's copy: its write is its own. A row removed by the list while its toggle is on the wire keeps the write
    // (no release on leave: an assignment is intent); `visibleRows` is written with no `AssignToggle.O.set.idle`
    // guard, so rule 56's structural warning stands here too, and the next copy of that row adopts the ending.
    toggles: {
      input: ({ memory, item }) => ({ workspaceId: memory.workspaceId, ticketId: item }),
      callbacks: {
        onHeld: {
          updateMemory: ({ payload }) => ({
            notice: `${payload.ticketId} is with ${payload.holder}`,
          }),
        },
      },
    },
    flashes: {
      input: ({ item }) => ({ ticketId: item }),
      callbacks: {
        onFaded: {
          updateMemory: ({ memory, payload }) => ({
            flashing: memory.flashing.filter((id) => id !== payload.ticketId),
          }),
        },
      },
    },
  },

  schedules: {
    // The search box's debounce (S1): the applied search, and so the live read's input, changes only after a pause.
    settle: {
      schedule: "300 millis",
      send: E.SearchSettled,
      restartOn: ({ memory }) => memory.search,
    },
    // The triage list's clock, rounded to the minute (OD4: normalised in the caller), so it reads once a minute.
    firstMinute: {
      schedule: "0 millis",
      armOn: [Flow.entry],
      send: E.Minute.from(({ now }) => ({ now: Math.floor(now / 60_000) * 60_000 })),
    },
    minute: {
      schedule: Schedule.spaced("1 minute"),
      send: E.Minute.from(({ now }) => ({ now: Math.floor(now / 60_000) * 60_000 })),
    },
    // One timer per open row with a deadline (a keyed schedule, S2): armed when the row first appears, cancelled if
    // it closes or leaves, firing once at its deadline. The view shows "breaches in 12 min" from the same `dueAt`.
    sla: {
      keys: ({ memory }) =>
        memory.rows
          .filter(
            (row) => row.open && row.dueAt !== null && !memory.breached.includes(row.ticketId),
          )
          .map((row) => ({ workspaceId: memory.workspaceId, ticketId: row.ticketId })),
      schedule: ({ key, memory, now }) =>
        Duration.millis(
          Math.max(
            0,
            (memory.rows.find((row) => row.ticketId === key.ticketId)?.dueAt ?? now) - now,
          ),
        ),
      send: E.SlaBreached.from(({ key }) => ({
        workspaceId: key.workspaceId,
        ticketId: key.ticketId,
      })),
    },
  },

  // Filter edits stay in the current health state: declared once, at the root (Machines.plan O2).
  on: {
    SearchChanged: { target: "self", updateMemory: ({ event }) => ({ search: event.search }) },
    SearchSettled: {
      target: "self",
      updateMemory: ({ memory }) => ({ appliedSearch: memory.search }),
    },
    StatusChanged: { target: "self", updateMemory: ({ event }) => ({ status: event.status }) },
    MineOnlyToggled: {
      target: "self",
      updateMemory: ({ memory }) => ({ mineOnly: !memory.mineOnly }),
    },
    // PROPOSED, not decided: `more` and `hasMore` are the plan's (gap 23); the domain's `.pagedBy` must agree.
    LoadMore: { target: "self", guard: hasMorePages, actions: [O.list.more(listInput)] },
    PollDue: { target: "self", actions: [O.list.refetch(listInput)] },
    PreviewOpened: { target: "self", updateMemory: ({ event }) => ({ previewId: event.ticketId }) },
    PreviewClosed: { target: "self", updateMemory: () => ({ previewId: null }) },
    TabChosen: { target: "self", updateMemory: ({ event }) => ({ tab: event.tab }) },
    Minute: { target: "self", updateMemory: ({ event }) => ({ now: event.now }) },
    ListLoaded: { target: "self", updateMemory: listed },
    SlaBreached: {
      target: "self",
      updateMemory: ({ memory, event }) => ({
        breached: [...memory.breached, event.ticketId],
        notice: `${event.ticketId} has breached its deadline`,
      }),
    },

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
        updateMemory: ({ memory, event }) => editDraft(memory, event.draftId, { status: "unsure" }),
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

    // Archiving predicts a delete: the ticket leaves every list at once. A 403 puts it back (rule 30).
    Archive: {
      target: "self",
      guard: [O.archive.idle(ticketKey)],
      actions: [O.archive.commit(ticketKey)],
    },
    Archived: { target: "self" },
    ArchiveRefused: { target: "self", updateMemory: ({ event }) => ({ notice: event.reason }) },
    ArchiveUnsure: { target: "self", actions: [O.archive.cancel] }, // release; the record stays marked uncertain

    // Bulk close: the selected rows, from memory, in one write on the workspace's FIFO. No `idle` guard: a second
    // bulk while one is on the wire queues behind it (`outstanding`), in order; the 65th is declined.
    Select: {
      target: "self",
      updateMemory: ({ memory, event }) => ({
        selected: event.selected
          ? [...memory.selected.filter((id) => id !== event.ticketId), event.ticketId]
          : memory.selected.filter((id) => id !== event.ticketId),
      }),
    },
    CloseSelected: {
      target: "self",
      guard: [({ memory }) => memory.selected.length > 0 || deny("NothingSelected")],
      updateMemory: () => ({ selected: [], notice: "" }),
      actions: [
        O.bulkClose.commit(({ memory }) => ({
          workspaceId: memory.workspaceId,
          tickets: memory.selected.map((ticketId) => ({
            workspaceId: memory.workspaceId,
            ticketId,
          })),
        })),
      ],
    },
    BulkClosed: {
      target: "self",
      updateMemory: ({ event }) => ({
        notice:
          event.skipped.length === 0
            ? `Closed ${String(event.closed)}`
            : `Closed ${String(event.closed)}; ${event.skipped.join(", ")} still being worked on`,
      }),
    },
    BulkNotSent: {
      target: "self",
      updateMemory: ({ event }) => ({ notice: `Not sent (${event.why}): too many at once` }),
    },
    // The head of the FIFO may have closed them all: every listed record is marked uncertain. One re-send of the same
    // Attempt; its success clears every mark (rule 32). Under `serialize` the key-less form is the head's own (rule 43).
    BulkUnsure: [
      {
        target: "self",
        guard: [O.bulkClose.retryable({ times: 1 })],
        actions: [O.bulkClose.retry],
      },
      {
        target: "self",
        updateMemory: () => ({ notice: "We couldn't confirm that bulk close" }),
        actions: [O.bulkClose.cancel],
      },
    ],
  },

  states: {
    HEALTHY: {
      schedules: { poll: { schedule: Schedule.spaced("30 seconds"), send: E.PollDue } },
      on: { ListUnavailable: S.DEGRADED },
    },
    DEGRADED: {
      schedules: {
        // Back off from 5 seconds with jitter to spread clients, never waiting longer than 5 minutes: the cap
        // applies after the jitter, so it holds.
        poll: {
          schedule: Schedule.min([
            Schedule.exponential("5 seconds").pipe(Schedule.jittered),
            Schedule.spaced("5 minutes"),
          ]),
          send: E.PollDue,
        },
      },
      on: {
        ListLoaded: { target: S.HEALTHY, updateMemory: listed },
        ListUnavailable: { target: "self" },
      },
    },
  },
}));
