// A shared actor other actors tell things to (Runtime.plan O4). Only public events can be sent.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";

export const Toasts = definition({
  id: "DispatchDesk/Toasts",
  states: ["EMPTY", "SHOWING"],
  events: { Push: { text: Schema.String }, Dismiss: {} },
  internalEvents: { Expire: {} },
  memory: { messages: Flow.initial(Schema.Array(Schema.String), []) },
});
