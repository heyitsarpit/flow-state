import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Session } from "./session.ts";

export const Team = definition({
  id: "Workspace/Team",
  persist: true,
  states: ["ACTIVE"],
  events: { Rename: { name: Schema.String } },
  memory: { name: Flow.initial(Schema.String, "") },
  context: { user: Flow.context(Session.M.user) },
});

/**
 * A team: a consumer of the session whose user leads it, and the provider every badge reads its
 * team's name from.
 */
export const TeamMachine = machine(Team, ({ S }) => ({
  default: S.ACTIVE,
  on: { Rename: { updateMemory: ({ event }) => ({ name: event.name }) } },
}));
