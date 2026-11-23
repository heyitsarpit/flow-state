import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

export const Org = definition({
  id: "Workspace/Org",
  persist: true,
  states: ["OPEN"],
  events: { Rename: { name: Schema.String } },
  memory: { name: Flow.initial(Schema.String, "") },
});

/**
 * An organisation: the root of a workspace's tree, providing its name to every session in it.
 */
export const OrgMachine = machine(Org, ({ S }) => ({
  default: S.OPEN,
  on: { Rename: { updateMemory: ({ event }) => ({ name: event.name }) } },
}));
