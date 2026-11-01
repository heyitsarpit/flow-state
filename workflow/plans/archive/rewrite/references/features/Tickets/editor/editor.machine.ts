// Reusable editor behaviour; app, hosts, Stories and UI consume this exact machine.
import { Schedule } from "effect";
import { deny, machine } from "flow-state";
import { Editor } from "./editor.definition.js";

const MAX_TITLE = 200;

export const EditorMachine = machine(Editor, ({ S, E, O, invalidate }) => {
  const ticketRef = ({ memory }: { memory: { workspaceId: string; ticketId: string } }) => ({
    workspaceId: memory.workspaceId,
    ticketId: memory.ticketId,
  });

  // Shared declarations: one guard and one commit serve the button, autosave and lock retries.
  const canSave = ({
    memory,
    context,
  }: {
    memory: { draft: string };
    context: { canEdit: boolean };
  }) => {
    if (!context.canEdit) return deny("NoPermission");

    if (memory.draft.trim() === "") return deny("EmptyTitle");

    if (memory.draft.length > MAX_TITLE) {
      return deny("TitleTooLong", { length: memory.draft.length, max: MAX_TITLE });
    }

    return true;
  };

  // The request id is derived from the draft's edit count, so repeated attempts at the same
  // draft reuse one idempotency identity and a new edit gets a new one.
  const commitDraft = (source: "button" | "autosave" | "retry") =>
    O.saveTitle.commit(
      ({ memory }) => ({
        workspaceId: memory.workspaceId,
        ticketId: memory.ticketId,
        title: memory.draft,
        requestId: `${source}:${memory.ticketId}:${memory.edits}`,
      }),
      {
        writes: [
          O.ticketById.setData(({ value }) => ({
            key: { workspaceId: value.workspaceId, ticketId: value.ticketId },
            data: value,
          })),
        ],
        outcomes: {
          success: E.SaveSucceeded,
          failure: {
            TitleRejected: E.SaveRejected,
            TicketLocked: E.TicketLocked,
            TicketNotFound: E.SaveRejected,
          },
          defect: E.SaveDefected,
          // interrupt omitted: planned cancellation never maps, and nothing else interrupts saves.
        },
      },
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
    states: {
      OPEN: {
        default: S.OPEN.EDITING,
        activities: {
          ticket: O.ticketById.subscribe(ticketRef),
          progress: O.technicianUpdates.subscribe(ticketRef), // Read via getState; no events needed.
        },
        schedules: {
          reminder: { schedule: Schedule.spaced("1 minute"), send: E.ReminderDue() },
        },
        on: {
          Close: S.CLOSED,
          // Revocation must not leave a save running after the editor closes.
          PermissionRevoked: { target: S.CLOSED, actions: [O.saveTitle.cancel(ticketRef)] },
          LoadRequested: { target: S.OPEN.EDITING, actions: [O.ticketById.lookup(ticketRef)] },
          RefreshRequested: { target: S.OPEN.EDITING, actions: [O.ticketById.refetch(ticketRef)] },
        },
        states: {
          EDITING: {
            schedules: {
              autosave: { schedule: "2 seconds", send: E.AutosaveDue() }, // Restarted by each edit's reentry.
            },
            on: {
              TitleChanged: {
                target: S.OPEN.EDITING,
                reenter: S.OPEN.EDITING,
                updateMemory: ({ event, memory }) => ({
                  draft: event.title,
                  edits: memory.edits + 1,
                  error: "",
                }),
              },
              SaveRequested: {
                target: S.OPEN.SAVING,
                guard: canSave,
                actions: [commitDraft("button")],
              },
              AutosaveDue: {
                target: S.OPEN.SAVING,
                guard: canSave,
                actions: [commitDraft("autosave")],
              },
              ReminderDue: {
                target: S.OPEN.EDITING,
                guard: ({ memory }) => memory.draft !== "" || deny("NothingToRemind"),
                updateMemory: ({ memory }) => ({ reminders: memory.reminders + 1 }),
              },
            },
          },
          SAVING: {
            on: {
              SaveSucceeded: {
                target: S.OPEN.SAVED,
                updateMemory: ({ event }) => ({ draft: event.title, error: "", lockRetries: 0 }),
                // Every cached queue page in this workspace may now show a stale title.
                actions: [
                  invalidate(O.ticketList, ({ event }) => ({ workspaceId: event.workspaceId })),
                ],
              },
              SaveRejected: {
                target: S.OPEN.FAILED,
                updateMemory: ({ event }) => ({ error: event.reason }),
              },
              SaveDefected: {
                target: S.OPEN.FAILED,
                updateMemory: () => ({ error: "Save failed unexpectedly" }),
              },
              TicketLocked: {
                target: S.OPEN.LOCKED,
                updateMemory: ({ event }) => ({ error: `Locked by ${event.lockedBy}` }),
              },
              CancelSave: { target: S.OPEN.EDITING, actions: [O.saveTitle.cancel(ticketRef)] },
            },
          },
          SAVED: {
            on: {
              TitleChanged: {
                target: S.OPEN.EDITING,
                updateMemory: ({ event, memory }) => ({
                  draft: event.title,
                  edits: memory.edits + 1,
                }),
              },
            },
          },
          FAILED: {
            on: {
              TitleChanged: {
                target: S.OPEN.EDITING,
                updateMemory: ({ event, memory }) => ({
                  draft: event.title,
                  edits: memory.edits + 1,
                  error: "",
                }),
              },
            },
          },
          LOCKED: {
            schedules: {
              // Each retry leaves LOCKED (through SAVING) and re-enters it, which restarts its
              // schedule. So the backoff grows from memory, not from a multi-step Schedule.
              retry: {
                schedule: ({ memory }) => 5_000 * 2 ** memory.lockRetries,
                send: E.RetrySave(),
              },
            },
            on: {
              RetrySave: {
                target: S.OPEN.SAVING,
                guard: ({ memory }) =>
                  memory.lockRetries < 5 ||
                  deny("RetryLimitReached", { attempts: memory.lockRetries }),
                updateMemory: ({ memory }) => ({ lockRetries: memory.lockRetries + 1 }),
                actions: [commitDraft("retry")],
              },
              TitleChanged: {
                target: S.OPEN.EDITING,
                updateMemory: ({ event, memory }) => ({
                  draft: event.title,
                  edits: memory.edits + 1,
                  error: "",
                  lockRetries: 0,
                }),
              },
            },
          },
        },
      },
      CLOSED: {
        on: { Reopen: S.OPEN },
      },
    },
  };
});
