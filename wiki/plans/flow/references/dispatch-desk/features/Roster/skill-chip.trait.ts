// One skill on the technician form: a chip with a remove button. A pure trait (no I/O), placed once per entry of
// the form's `skills` list with `.each` (F4). The host owns membership (rule 9): a chip cannot remove itself, it
// asks with a callback, and the host writes its own list.
import { Schema } from "effect";
import { Flow, trait } from "flow-state";

export const SkillChip = trait(
  {
    id: "SkillChip",
    events: { Remove: {} }, // the chip's own button: `E.chips.key(skill).Remove()`
    callbacks: { onRemove: Flow.Callback({ skill: Schema.String }) },
    memory: { skill: Flow.input(Schema.String) },
  },
  ({ callbacks }) => ({
    on: {
      Remove: {
        target: "self",
        notify: [callbacks.onRemove.from(({ memory }) => ({ skill: memory.skill }))],
      },
    },
  }),
);
