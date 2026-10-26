import { machine } from "flow-state";
import { Session } from "./session.definition.js";

// Handlers that only update memory stay in place with target "self" (FlowState D17).
export const SessionMachine = machine(Session, ({ S }) => ({
  default: S.AVAILABLE,
  states: {
    AVAILABLE: {
      on: {
        PermissionChanged: {
          target: "self",
          updateMemory: ({ event }) => ({ canEdit: event.canEdit }),
        },
        // Editors read canEdit, so signing out also closes every open editor (its reaction).
        SignedOut: { target: S.SIGNED_OUT, updateMemory: () => ({ canEdit: false }) },
      },
    },
    SIGNED_OUT: {},
  },
}));
