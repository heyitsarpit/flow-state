// Reusable editor behavior; app, hosts, Stories and UI consume this exact machine.
import { Result } from "effect";
import { machine } from "flow-state";
import { Editor } from "./editor.definition.js";

export const EditorMachine = Result.getOrThrow(
  machine(Editor, ({ S, E, O, onContext, invalidate, clear }) => {
    onContext.select(
      ({ context }) => context.canEdit,
      (current) => (current ? null : Result.getOrThrow(E.PermissionRevoked())),
    );

    return {
      default: S.OPEN,
      states: {
        OPEN: {
          default: S.OPEN.S.EDITING,
          activities: {
            ticket: ({ memory }) =>
              O.ticketById.subscribe({
                workspaceId: memory.workspaceId,
                ticketId: memory.ticketId,
              }),
          },
          timers: {
            reminder: {
              delay: 60000,
              guard: ({ state }) => state === S.OPEN.S.EDITING,
              target: E.ReminderDue,
            },
          },
          on: {
            Close: S.CLOSED,
            PermissionRevoked: S.CLOSED,
            ReminderDue: {
              target: S.OPEN.S.EDITING,
              updateMemory: ({ memory }) => ({ reminders: memory.reminders + 1 }),
            },
            LoadRequested: {
              target: S.OPEN.S.EDITING,
              actions: ({ memory }) => [O.ticketById.lookup(memory)],
            },
            RefreshRequested: {
              target: S.OPEN.S.EDITING,
              actions: ({ memory }) => [O.ticketById.refetch(memory)],
            },
            CancelLoad: {
              target: S.OPEN.S.EDITING,
              actions: ({ memory }) => [O.ticketById.cancel(O.ticketById.key(memory))],
            },
            InvalidateTicket: {
              target: S.OPEN.S.EDITING,
              actions: ({ memory }) => [invalidate([O.ticketById, O.ticketById.key(memory)])],
            },
            ClearTicket: {
              target: S.OPEN.S.EDITING,
              actions: ({ memory }) => [clear([O.ticketById, O.ticketById.key(memory)])],
            },
          },
          states: {
            EDITING: {
              on: {
                TitleChanged: {
                  target: S.OPEN.S.EDITING,
                  updateMemory: ({ event }) => ({ draft: event.title, error: "" }),
                },
                SaveRequested: {
                  target: S.OPEN.S.SAVING,
                  guard: ({ memory, context }) => context.canEdit && memory.draft.trim().length > 0,
                  actions: ({ event, memory }) => [
                    O.saveTitle.commit(
                      {
                        workspaceId: memory.workspaceId,
                        ticketId: memory.ticketId,
                        title: memory.draft,
                        requestId: event.requestId,
                      },
                      {
                        writes: ({ value }) => [
                          O.ticketById.setData([value.workspaceId, value.ticketId], value),
                        ],
                        outcomes: {
                          success: (ticket) => Result.getOrThrow(E.SaveSucceeded(ticket)),
                          failure: (error) => Result.getOrThrow(E.SaveFailed(error)),
                          defect: () => Result.getOrThrow(E.SaveDefected()),
                          interrupt: () => Result.getOrThrow(E.SaveInterrupted()),
                        },
                      },
                    ),
                  ],
                },
              },
            },
            SAVING: {
              on: {
                SaveSucceeded: {
                  target: S.OPEN.S.SAVED,
                  updateMemory: ({ event }) => ({ draft: event.ticket.title, error: "" }),
                },
                SaveFailed: {
                  target: S.OPEN.S.FAILED,
                  updateMemory: ({ event }) => ({ error: event.error.message }),
                },
                SaveDefected: S.OPEN.S.FAILED,
                SaveInterrupted: S.OPEN.S.FAILED,
                CancelSave: {
                  target: S.OPEN.S.EDITING,
                  actions: ({ memory }) => [
                    O.saveTitle.cancel([memory.workspaceId, memory.ticketId]),
                  ],
                },
              },
            },
            SAVED: {
              on: {
                TitleChanged: {
                  target: S.OPEN.S.EDITING,
                  updateMemory: ({ event }) => ({ draft: event.title }),
                },
              },
            },
            FAILED: {
              on: {
                TitleChanged: {
                  target: S.OPEN.S.EDITING,
                  updateMemory: ({ event }) => ({ draft: event.title, error: "" }),
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
  }),
);
