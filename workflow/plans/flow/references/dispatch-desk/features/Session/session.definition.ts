// Permission and current-user truth that editors and queues read. Starts no actor.
// The signed-in user is input, not an event: a different user is a new Runtime and scope, never a
// change inside one (Runtime plan), so nothing cached for one user can be shown to another.
// Signing out is session truth in this Runtime before its scope's stored records are removed.
import { Schema } from "effect";
import { definition } from "flow-state";

export const Session = definition({
  id: "DispatchDesk/Session",
  states: ["AVAILABLE", "SIGNED_OUT"],
  events: { PermissionChanged: { canEdit: Schema.Boolean }, SignedOut: {} },
  input: { userId: Schema.String },
  memory: { canEdit: Schema.Boolean, userId: Schema.String },
  initial: ({ input }) => ({ canEdit: true, userId: input.userId }),
});
