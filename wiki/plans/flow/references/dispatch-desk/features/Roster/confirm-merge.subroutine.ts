// ConfirmMerge: the dialog that decides which of two customer records survives a merge. A subroutine, because the
// admin goes into it and nothing under it may be done meanwhile (MD 2.1: "does the actor have it, or go into it?").
//
// Its exit carries data (F10): `Merge { survivorId, mergedId }`, so the host commits the merge it describes and
// never reads the dialog's memory after it ended. `Cancelled` carries nothing. Both are filled by the host, and an
// exit filling must leave the subroutine's state (rule 6).
import { Schema } from "effect";
import { deny, Flow, subroutine } from "flow-state";

export const ConfirmMerge = subroutine(
  {
    id: "ConfirmMerge",
    events: { Pick: { survivorId: Schema.String }, Confirm: {}, Cancel: {} },
    exits: {
      Merge: Flow.Exit({ survivorId: Schema.String, mergedId: Schema.String }),
      Cancelled: Flow.Exit({}),
    },
    memory: {
      first: Flow.input(Schema.String), // the two customer ids, as the admin picked them
      second: Flow.input(Schema.String),
      survivorId: Flow.initial(Schema.NullOr(Schema.String), null),
    },
  },
  ({ exits }) => ({
    on: {
      Pick: {
        target: "self",
        guard: ({ memory, event }) =>
          event.survivorId === memory.first ||
          event.survivorId === memory.second ||
          deny("NotOneOfThem"),
        updateMemory: ({ event }) => ({ survivorId: event.survivorId }),
      },
      // Refused until a survivor is picked, so `check()` disables the button and says why.
      Confirm: {
        guard: ({ memory }) => memory.survivorId !== null || deny("PickOne"),
        target: exits.Merge.from(({ memory }) => ({
          survivorId: memory.survivorId ?? memory.first,
          mergedId: memory.survivorId === memory.first ? memory.second : memory.first,
        })),
      },
      Cancel: exits.Cancelled,
    },
  }),
);
