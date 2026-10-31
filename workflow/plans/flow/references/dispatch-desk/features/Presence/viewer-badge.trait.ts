// One viewer's badge: a copy per member the SDK reports (F5: `.each` over keys a live source fills). Pure. It
// flashes for two seconds when the viewer joins, so the list shows who just arrived.
import { Schema } from "effect";
import { Flow, trait } from "flow-state";

export const ViewerBadge = trait(
  {
    id: "ViewerBadge",
    internalEvents: { Settled: {} },
    memory: { fresh: Flow.initial(Schema.Boolean, true) },
  },
  ({ E }) => ({
    schedules: { settle: { schedule: "2 seconds", armOn: [Flow.entry], send: E.Settled } },
    on: { Settled: { target: "self", updateMemory: () => ({ fresh: false }) } },
  }),
);
