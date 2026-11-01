// Session vocabulary and the permission truth that editors and queues read; starts no actor.
import { Schema } from "effect";
import { definition } from "flow-state";

export const Session = definition({
  id: "DispatchDesk/Session",
  states: ["AVAILABLE"],
  events: {
    PermissionChanged: { canEdit: Schema.Boolean },
    UserSwitched: { userId: Schema.String },
  },
  memory: { canEdit: Schema.Boolean, userId: Schema.String },
  initial: () => ({ canEdit: true, userId: "dispatcher-7" }), // No input: a void-input machine.
});
