import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Team } from "./team.ts";

const Badge = definition({
  id: "Workspace/Badge",
  persist: true,
  states: ["SHOWN"],
  events: { Ping: {} },
  memory: { pings: Flow.initial(Schema.Number, 0) },
  context: { team: Team.Provider.select(Schema.String, (t) => t.memory.name) },
});

/**
 * An avatar badge that shows the name of the team it is bound to, and counts pings: the leaf of a
 * tree four layers deep, organisation to session to team to badge.
 */
export const BadgeMachine = machine(Badge, ({ S }) => ({
  default: S.SHOWN,
  on: { Ping: { updateMemory: ({ memory }) => ({ pings: memory.pings + 1 }) } },
}));
