// One technician's card: a copy per technician the panel shows (F5: `.each` over keys a live read fills). Pure: it
// owns only whether it is expanded. Its data are the Technician record and the pulse row, both read by the view.
import { Schema } from "effect";
import { Flow, trait } from "flow-state";

export const TechCard = trait(
  {
    id: "TechCard",
    events: { Toggle: {} },
    memory: { expanded: Flow.initial(Schema.Boolean, false) },
  },
  () => ({
    on: {
      Toggle: { target: "self", updateMemory: ({ memory }) => ({ expanded: !memory.expanded }) },
    },
  }),
);
