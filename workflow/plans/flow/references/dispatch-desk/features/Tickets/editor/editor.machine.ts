// Reusable editor behaviour, readable as the spec. Structure is data: targets, operations and
// outcome events are declarations; callbacks only compute payloads, patches and parameters.
import { deny, machine, send } from "flow-state";
import { Toasts } from "../../Toasts/toasts.definition.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { Editor } from "./editor.definition.js";

const MAX_TITLE = 200;

const MAX_LOCK_RETRIES = 5;

type Memory = typeof Editor.Memory.Type;

const ticketKey = ({ memory }: { memory: Memory }) => ({
  workspaceId: memory.workspaceId,
  ticketId: memory.ticketId,
});

// A shared guard types its input from the definition's derived Schemas (Machines.plan O1). Its
// deny codes are literal, so flow check and inspect read them from its return type.
const canSave = ({ memory, context }: { memory: Memory; context: { canEdit: boolean } }) => {
  if (!context.canEdit) return deny("NoPermission");

  if (memory.draft.trim() === "") return deny("EmptyTitle");

  if (memory.draft.length > MAX_TITLE)
    return deny("TitleTooLong", { length: memory.draft.length, max: MAX_TITLE });

  return true;
};

// What every confirmed save does to memory, wherever it lands.
const confirmSaved = ({ event }: { event: { ticket: { title: string } } }) => ({
  saved: event.ticket.title,
  error: "",
  lockRetries: 0,
  uncertain: null,
});

export const EditorMachine = machine(Editor, ({ S, E, O }) => {
  // One set of outcomes serves the button, autosave, lock retries and the retry of an uncertain
  // save. saveTitle is a domain operation, so the domain predicts the title, confirms it from the
  // response and repairs every list that can be wrong (EntityDomains.plan D1).
  const saveOutcomes = {
    success: E.Saved.from((ticket) => ({ ticket })),
    failure: {
      TitleRejected: E.SaveFailed.from(({ reason }) => ({ reason })),
      TicketNotFound: E.SaveFailed.from(() => ({ reason: "This ticket no longer exists" })),
      TicketLocked: E.SaveLocked.from(({ lockedBy }) => ({ lockedBy })),
    },
    defect: E.SaveFailed.from(() => ({ reason: "Save failed unexpectedly" })),
    // Cancelled after the request was sent, or restored mid-flight: the outcome is unknown, and
    // the attempt is kept so a retry reuses its idempotency key.
    unknown: E.SaveUncertain.from((attempt) => ({ attempt })),
  };

  const commitDraft = O.Tickets.saveTitle.commit(
    ({ memory }) => ({ ...ticketKey({ memory }), title: memory.draft }),
    { outcomes: saveOutcomes },
  );

  // Re-issues the uncertain attempt itself (same input, same attempt.id), never a new one.
  const retryUncertain = O.Tickets.saveTitle.retry(({ memory }) => memory.uncertain, {
    outcomes: saveOutcomes,
  });

  const toastSaved = send(
    ToastsRef,
    Toasts.E.Push.from(({ event }) => ({ text: `Saved “${event.ticket.title}”` })),
  );

  return {
    default: S.OPEN,

    onContext: [
      {
        select: ({ context }) => context.canEdit,
        when: (canEdit) => !canEdit,
        event: E.PermissionRevoked,
      },
    ],

    // Root handlers apply wherever no nearer state handles the event, CLOSED included: a save
    // that settles after Close still updates memory and still tells the user.
    on: {
      PermissionRevoked: { target: S.CLOSED, actions: [O.Tickets.saveTitle.cancel(ticketKey)] },
      Saved: { target: "self", updateMemory: confirmSaved, actions: [toastSaved] },
      SaveUncertain: {
        target: "self",
        updateMemory: ({ event }) => ({ uncertain: event.attempt }),
      },
    },

    states: {
      OPEN: {
        default: S.OPEN.EDITING,
        activities: {
          // A domain read: the store keeps the ticket coherent with the queue's copy. Its value
          // outcome fires only when the confirmed ticket changes, never for a prediction, so
          // `saved` only ever holds what the server confirmed.
          ticket: O.Tickets.ticketById.subscribe(ticketKey, {
            outcomes: { value: E.TicketLoaded.from((ticket) => ({ title: ticket.title })) },
          }),
          progress: O.technicianUpdates.subscribe(ticketKey), // read in views as a lane; no events
        },
        on: {
          // The server's title becomes the draft only while there are no local edits.
          TicketLoaded: {
            target: "self",
            updateMemory: ({ event, memory }) =>
              memory.draft === memory.saved
                ? { saved: event.title, draft: event.title }
                : { saved: event.title },
          },
          TitleChanged: {
            target: S.OPEN.EDITING, // from SAVED, FAILED, LOCKED or UNCERTAIN: editing again
            updateMemory: ({ event }) => ({ draft: event.title, error: "" }),
          },
          RefreshRequested: { target: "self", actions: [O.Tickets.ticketById.refetch(ticketKey)] },
          Escape: S.CLOSED,
          Close: S.CLOSED,
        },
        states: {
          EDITING: {
            schedules: {
              // A debounce: the schedule restarts on every change of the draft and stays idle
              // until the first one, so opening a ticket never autosaves (Machines.plan O5).
              autosave: {
                schedule: "2 seconds",
                send: E.AutosaveDue,
                restartOn: ({ memory }) => memory.draft,
              },
            },
            on: {
              TitleChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ draft: event.title, error: "" }),
              },
              SaveRequested: { target: S.OPEN.SAVING, guard: canSave, actions: [commitDraft] },
              AutosaveDue: {
                target: S.OPEN.SAVING,
                guard: (input) =>
                  input.memory.draft !== input.memory.saved
                    ? canSave(input)
                    : deny("NothingToSave"),
                actions: [commitDraft],
              },
              // With edits, Escape discards them. Without, this guard declines and the event
              // falls through to OPEN's handler, which closes (Machines.plan O2).
              Escape: {
                target: "self",
                guard: ({ memory }) => memory.draft !== memory.saved || deny("NothingToDiscard"),
                updateMemory: ({ memory }) => ({ draft: memory.saved }),
              },
            },
          },
          SAVING: {
            on: {
              // Typing during a save is kept: the draft moves on, and it stays unsaved because
              // Saved compares it with what the server confirmed.
              TitleChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ draft: event.title }),
              },
              // Ordered alternatives: the first whose guard passes is taken. A draft typed during
              // the save goes back to EDITING, where Save and autosave are available again.
              Saved: [
                {
                  target: S.OPEN.SAVED,
                  guard: ({ event, memory }) =>
                    event.ticket.title === memory.draft || deny("DraftMovedOn"),
                  updateMemory: confirmSaved,
                  actions: [toastSaved],
                },
                { target: S.OPEN.EDITING, updateMemory: confirmSaved, actions: [toastSaved] },
              ],
              SaveFailed: {
                target: S.OPEN.FAILED,
                updateMemory: ({ event }) => ({ error: event.reason }),
              },
              SaveLocked: {
                target: S.OPEN.LOCKED,
                updateMemory: ({ event }) => ({ error: `Locked by ${event.lockedBy}` }),
              },
              SaveUncertain: {
                target: S.OPEN.UNCERTAIN,
                updateMemory: ({ event }) => ({ uncertain: event.attempt }),
              },
              CancelSave: {
                target: S.OPEN.EDITING,
                actions: [O.Tickets.saveTitle.cancel(ticketKey)],
              },
            },
          },
          SAVED: {},
          FAILED: {
            on: {
              SaveRequested: { target: S.OPEN.SAVING, guard: canSave, actions: [commitDraft] },
            },
          },
          LOCKED: {
            schedules: {
              // Each retry passes through SAVING and re-enters LOCKED, which restarts this
              // schedule, so the backoff grows from memory rather than from a multi-step Schedule.
              retry: {
                schedule: ({ memory }) => 5_000 * 2 ** memory.lockRetries,
                send: E.RetrySave,
              },
            },
            on: {
              RetrySave: [
                {
                  target: S.OPEN.SAVING,
                  guard: ({ memory }) =>
                    memory.lockRetries < MAX_LOCK_RETRIES ||
                    deny("RetryLimitReached", { attempts: memory.lockRetries }),
                  updateMemory: ({ memory }) => ({ lockRetries: memory.lockRetries + 1 }),
                  actions: [commitDraft],
                },
                // Out of retries: stop retrying and say so; a manual save starts afresh.
                {
                  target: S.OPEN.FAILED,
                  updateMemory: ({ memory }) => ({
                    error: `${memory.error}; gave up after ${memory.lockRetries} retries`,
                    lockRetries: 0,
                  }),
                },
              ],
            },
          },
          // The save may or may not have reached the server. Retrying reuses the same attempt,
          // so the server deduplicates it; refreshing shows the server's title meanwhile.
          UNCERTAIN: {
            on: {
              SaveRequested: {
                target: S.OPEN.SAVING,
                guard: ({ memory }) => memory.uncertain !== null || deny("NothingToRetry"),
                actions: [retryUncertain],
              },
            },
          },
        },
      },
      CLOSED: { on: { Reopen: S.OPEN } },
    },
  };
});
