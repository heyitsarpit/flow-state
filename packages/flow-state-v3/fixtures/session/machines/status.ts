import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { TeamMachine } from "../machine.ts";

/**
 * A team's status line: it reads its team's name, and no team is wired by default, so its ref must
 * name one.
 */
export const Status = definition({
  id: "Workspace/Status",
  persist: false,
  states: ["SHOWN"],
  events: { Set: { text: Schema.String } },
  memory: { text: Flow.initial(Schema.String, "") },
  context: { team: TeamMachine.definition.Provider.select(Schema.String, (t) => t.memory.name) },
});

/**
 * The status line: setting it changes its text.
 */
export const StatusMachine = machine(Status, ({ S }) => ({
  default: S.SHOWN,
  on: { Set: { updateMemory: ({ event }) => ({ text: event.text }) } },
}));
