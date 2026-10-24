// Session vocabulary and selected permission truth; construction starts no actor.
import { Result } from "effect";
import { definition } from "flow-state";

export const Session = definition({
  id: "DispatchDesk/Session",
  states: ["AVAILABLE"],
  events: {
    PermissionChanged: (canEdit: boolean) => ({ canEdit }),
  },
  memory: () => ({ canEdit: true }),
});

export const sessionDefinition = Result.getOrThrow(Session);
