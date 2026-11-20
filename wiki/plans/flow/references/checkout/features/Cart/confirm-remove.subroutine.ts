// "Remove the lamp from your cart?": a leaf subroutine whose exit carries WHICH line (F8, F10), so the host removes
// exactly the line the dialog was opened for, even if the cart changed under it.
import { Schema } from "effect";
import { Flow, subroutine } from "flow-state";

export const ConfirmRemove = subroutine(
  {
    id: "ConfirmRemove",
    events: { Yes: {}, No: {} },
    exits: { Remove: Flow.Exit({ lineId: Schema.String }), Keep: Flow.Exit({}) },
    memory: { lineId: Flow.input(Schema.String) },
  },
  ({ exits }) => ({
    on: { Yes: exits.Remove.from(({ memory }) => ({ lineId: memory.lineId })), No: exits.Keep },
  }),
);
