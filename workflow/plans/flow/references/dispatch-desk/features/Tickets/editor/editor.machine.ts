// Reusable editor behaviour, readable as the spec. Structure is data: targets, operations and
// ending events are declarations; callbacks only compute payloads, patches and parameters.
//
// The save, in one picture:
//   EDITING --Save--> SAVING --Saved--------------> SAVED (or back to EDITING if the draft moved on)
//                       |--SaveFailed-------------> FAILED         a definite failure: a new Attempt next time
//                       |--SaveLocked-------------> LOCKED         a definite failure: backs off, new Attempt each
//                       '--SaveUnsure (root)-----> UNSURE          the hold: the SAME Attempt, 3 s apart
//   UNSURE --ResendDue, retryable({ times: 3 })--> SAVING (retry)
//   UNSURE --ResendDue, budget spent-------------> FAILED, with `cancel` releasing the hold
//
// The lane is the Runtime's, not this actor's (rule 44). Closing the ticket, even disposing the actor, drops and
// cancels nothing: the save lands, the store takes its ending at settlement (rule 27), and the ending is parked
// for the persisted identity. The next incarnation adopts it at the root, before any event. So every ending is
// handled at the root, current or late or adopted. `runtime.unsettledWrites()` lists such a lane while it lives
// (app/host.ts uses it for `beforeunload`).
import { deny, machine, send } from "flow-state";
import { Toasts } from "../../Toasts/toasts.definition.js";
import { ToastsRef } from "../../Toasts/toasts.ref.js";
import { Editor, MAX_ATTACHMENTS, MAX_RESENDS } from "./editor.definition.js";

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

const dirty = ({ memory }: { memory: Memory }) =>
  memory.draft !== memory.saved || deny("NothingToSave");

// What every confirmed save does to memory. It never touches the draft: the user may have typed on.
const confirmed = ({ event }: { event: { ticket: { title: string } } }) => ({
  saved: event.ticket.title,
  error: "",
  lockRetries: 0,
});

// A late or adopted ending, at the root: the confirmed title also becomes the draft while there are no local
// edits (a new incarnation starts with an empty draft and adopts the parked ending first).
const confirmedAtRoot = ({
  event,
  memory,
}: {
  event: { ticket: { title: string } };
  memory: Memory;
}) => ({
  ...confirmed({ event }),
  ...(memory.draft === memory.saved ? { draft: event.ticket.title } : {}),
});

export const EditorMachine = machine(Editor, ({ S, E, O }) => {
  // The first send of a title is always a new Attempt (rule 19). Guarded by `idle`, so Save disables through
  // `check()` while a save is on the wire or unconfirmed (the lane, not memory, says so).
  const commitDraft = O.save.commit(({ memory }) => ({
    ...ticketKey({ memory }),
    title: memory.draft,
  }));

  const toastSaved = send(
    ToastsRef,
    Toasts.E.Push.from(({ event }) => ({ text: `Saved “${event.ticket.title}”` })),
  );

  const withinBudget = O.save.retryable(ticketKey, { times: MAX_RESENDS });

  return {
    default: S.OPEN,

    onContext: [
      {
        select: ({ context }) => context.canEdit,
        when: (canEdit) => !canEdit,
        event: E.PermissionRevoked,
      },
    ],

    // Fillings for the two placed traits. `comments` is the editor's thread; its callback closes the editor when
    // the ticket does not exist. `uploads`' callbacks (`onStored`, `onFailed`) are optional and left out: the row
    // shows its own status.
    traits: {
      comments: {
        input: ({ memory }) => ({ workspaceId: memory.workspaceId, ticketId: memory.ticketId }),
        callbacks: { onTicketGone: S.CLOSED },
      },
      uploads: { input: ({ item }) => ({ ref: item.ref, name: item.name, size: item.size }) },
    },

    // Root handlers apply wherever no nearer state handles the event, CLOSED included, and they receive what a
    // new incarnation adopts (rule 44): a save that settles after Close still updates memory and still tells the
    // user; one that was left unconfirmed is found again here.
    on: {
      PermissionRevoked: { target: S.CLOSED, actions: [O.save.cancel(ticketKey)] },
      Saved: { target: "self", updateMemory: confirmedAtRoot, actions: [toastSaved] },
      SaveFailed: { target: "self", updateMemory: ({ event }) => ({ error: event.reason }) },
      SaveLocked: {
        target: "self",
        updateMemory: ({ event }) => ({ error: `Locked by ${event.lockedBy}` }),
      },
      SaveNotSent: { target: "self" }, // the explicit ignore (rule 20): nothing left, nothing to clean up
      // The user's own stop: release the lane now. Key-less, in the handler of an event only `save` maps (rule 43).
      SaveStopped: { target: "self", actions: [O.save.cancel] },
      // The hold. The request may have landed. From SAVING, or adopted by a new incarnation, go where it is
      // reconciled. (CLOSED keeps it without moving: see below.)
      SaveUnsure: S.OPEN.UNSURE,
    },

    states: {
      OPEN: {
        default: S.OPEN.EDITING,
        activities: [O.ticket.subscribe(ticketKey)],
        on: {
          // The server's title becomes the draft only while there are no local edits.
          TicketLoaded: {
            target: "self",
            updateMemory: ({ event, memory }) =>
              memory.draft === memory.saved
                ? { saved: event.title, draft: event.title }
                : { saved: event.title },
          },
          TicketGone: {
            target: S.CLOSED,
            updateMemory: () => ({ error: "This ticket no longer exists" }),
          },
          TicketLoadFailed: { target: "self" }, // the row's Failure shows it; Refresh refetches
          TitleChanged: {
            target: S.OPEN.EDITING, // from SAVED, FAILED or LOCKED: editing again
            updateMemory: ({ event }) => ({ draft: event.title, error: "" }),
          },
          RefreshRequested: { target: "self", actions: [O.ticket.refetch(ticketKey)] },
          AttachFile: {
            target: "self",
            guard: [
              ({ context }) => context.canEdit || deny("NoPermission"),
              ({ memory }) => memory.attachments.length < MAX_ATTACHMENTS || deny("TooManyFiles"),
              ({ memory, event }) =>
                !memory.attachments.some((a) => a.ref === event.ref) || deny("AlreadyAttached"),
            ],
            // A copy is created for the new entry; it commits itself (upload.trait.ts).
            updateMemory: ({ memory, event }) => ({
              attachments: [
                ...memory.attachments,
                { ref: event.ref, name: event.name, size: event.size },
              ],
            }),
          },
          // Removing the entry ends its copy, and the copy releases its lane (rule 60).
          RemoveAttachment: {
            target: "self",
            updateMemory: ({ memory, event }) => ({
              attachments: memory.attachments.filter((a) => a.ref !== event.ref),
            }),
          },
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
              SaveRequested: {
                target: S.OPEN.SAVING,
                guard: [canSave, O.save.idle(ticketKey)],
                actions: [commitDraft],
              },
              AutosaveDue: {
                target: S.OPEN.SAVING,
                guard: [dirty, canSave, O.save.idle(ticketKey)],
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
                  updateMemory: confirmed,
                  actions: [toastSaved],
                },
                { target: S.OPEN.EDITING, updateMemory: confirmed, actions: [toastSaved] },
              ],
              SaveFailed: {
                target: S.OPEN.FAILED,
                updateMemory: ({ event }) => ({ error: event.reason }),
              },
              SaveLocked: {
                target: S.OPEN.LOCKED,
                updateMemory: ({ event }) => ({ error: `Locked by ${event.lockedBy}` }),
              },
              SaveNotSent: {
                target: S.OPEN.EDITING,
                updateMemory: () => ({ error: "That save did not leave this device. Try again." }),
              },
              // Stop waiting. On the wire this interrupts; the ending comes back as SaveStopped, and the root
              // releases it. SaveUnsure needs no handler here: the root takes it to UNSURE.
              CancelSave: { target: S.OPEN.EDITING, actions: [O.save.cancel(ticketKey)] },
            },
          },
          SAVED: {},
          FAILED: {
            on: {
              SaveRequested: {
                target: S.OPEN.SAVING,
                guard: [canSave, O.save.idle(ticketKey)],
                actions: [commitDraft],
              },
            },
          },
          // A definite failure: nothing happened on the server, so every retry is a new write with a new
          // Attempt (rule 19). Its budget is memory, counted across writes (2.7.6).
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
                  guard: [
                    ({ memory }) =>
                      memory.lockRetries < MAX_LOCK_RETRIES ||
                      deny("RetryLimitReached", { attempts: memory.lockRetries }),
                    O.save.idle(ticketKey),
                  ],
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
          // The hold: the save may or may not have reached the server, and the lane is Held with its one
          // Attempt. Re-sending reuses that Attempt (`retry`, never `commit`), so the server deduplicates on
          // `attempt.id`. Each re-send passes through SAVING and, if unconfirmed again, re-enters UNSURE, which
          // restarts the schedule. After the budget, `cancel` releases the hold and FAILED says so honestly.
          UNSURE: {
            schedules: { resend: { schedule: "3 seconds", send: E.ResendDue } },
            on: {
              ResendDue: [
                {
                  target: S.OPEN.SAVING,
                  guard: [withinBudget],
                  actions: [O.save.retry(ticketKey)], // the same Attempt, the same idempotency key
                },
                {
                  target: S.OPEN.FAILED,
                  updateMemory: () => ({ error: "We couldn't confirm your last save" }),
                  actions: [O.save.cancel(ticketKey)], // give up and release; the save may still have landed
                },
              ],
              // "Try again now": the same re-send, on demand, from the same budget.
              SaveRequested: {
                target: S.OPEN.SAVING,
                guard: [withinBudget],
                actions: [O.save.retry(ticketKey)],
              },
              // Typing here keeps the draft and the hold: the re-send schedule must keep running, so the state
              // does not change. When the re-send lands, SAVING's ordered Saved sends a moved-on draft to EDITING.
              TitleChanged: {
                target: "self",
                updateMemory: ({ event }) => ({ draft: event.title }),
              },
            },
          },
        },
      },
      CLOSED: {
        on: {
          // A save that outlives the screen, found unconfirmed: keep the hold where it is. Reopen reconciles it.
          SaveUnsure: { target: "self" },
          // Three ways back, by what the lane is doing (rule 45 gives every hold an owner):
          Reopen: [
            { target: S.OPEN, guard: [O.save.idle(ticketKey)] },
            {
              target: S.OPEN.UNSURE,
              // The row, read in a guard as a view reads it (2.7.5).
              guard: ({ memory, operations }) =>
                O.save.get(operations, ticketKey({ memory })).uncertain || deny("NotUnsure"),
            },
            { target: S.OPEN.SAVING }, // still on the wire: its ending is then current
          ],
        },
      },
    },
  };
});
