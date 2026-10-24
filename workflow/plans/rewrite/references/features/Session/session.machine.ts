import { Result } from "effect";
import { machine } from "flow-state";
import { Session } from "./session.definition.js";

export const SessionMachine = Result.getOrThrow(
  machine(Session, ({ S }) => ({
    default: S.AVAILABLE,
    states: {
      AVAILABLE: {
        on: {
          PermissionChanged: {
            target: S.AVAILABLE,
            updateMemory: ({ event }) => ({ canEdit: event.canEdit }),
          },
        },
      },
    },
  })),
);
