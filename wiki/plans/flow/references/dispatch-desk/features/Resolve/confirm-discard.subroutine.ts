// "Discard this resolution?": a leaf subroutine (no states of its own), nested INSIDE the resolve wizard, which is a
// subroutine itself (F8, F18). Its host is the wizard: the visit screen cannot see it, only the wizard's summary
// (rule 10). Its exits carry nothing; the wizard maps Keep to its own history and Discard to its own exit.
import { Flow, subroutine } from "flow-state";

export const ConfirmDiscard = subroutine(
  {
    id: "ConfirmDiscard",
    events: { Keep: {}, Discard: {} },
    exits: { Kept: Flow.Exit({}), Discarded: Flow.Exit({}) },
  },
  ({ exits }) => ({ on: { Keep: exits.Kept, Discard: exits.Discarded } }),
);
