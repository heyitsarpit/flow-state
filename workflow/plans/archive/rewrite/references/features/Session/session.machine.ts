import { machine } from "flow-state";
import { Session } from "./session.definition.js";

export const SessionMachine = machine(Session, ({ S }) => ({
  default: S.AVAILABLE,
  states: {
    AVAILABLE: {
      on: {
        PermissionChanged: {
          target: S.AVAILABLE,
          updateMemory: ({ event }) => ({ canEdit: event.canEdit }),
        },
        UserSwitched: {
          target: S.AVAILABLE,
          updateMemory: ({ event }) => ({ userId: event.userId }),
        },
      },
    },
  },
}));
