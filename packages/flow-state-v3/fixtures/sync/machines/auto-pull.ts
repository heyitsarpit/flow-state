import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Sync } from "./sync.ts";

/**
 * The editor's auto-pull: the remote head its client last read and whether the client is cooling
 * down from a rate limit, both read as context; the head it last pulled, how many pulls and how
 * many rate limits it has shown.
 */
export const AutoPull = definition({
  id: "Git/AutoPull",
  persist: false,
  states: ["WATCHING", "PAUSED"],
  events: { Pause: {}, Resume: {} },
  internalEvents: { HeadMoved: { head: Schema.String }, Throttled: {} },
  memory: {
    pulled: Flow.initial(Schema.String, ""),
    pulls: Flow.initial(Schema.Number, 0),
    throttles: Flow.initial(Schema.Number, 0),
  },
  context: { head: Flow.context(Sync.M.head), limited: Flow.context(Sync.S.COOLING) },
});

/**
 * The auto-pull: while watching, a moved head is pulled into the editor's view; the user pauses it
 * while they have local edits and resumes it after. Its head reaction is declared in the watching
 * state only; each rate limit is shown in either state.
 */
export const AutoPullMachine = machine(AutoPull, ({ S, E, C }) => ({
  default: S.WATCHING,
  onContext: [C.limited.change({ when: (current) => current, event: E.Throttled })],
  on: { Throttled: { updateMemory: ({ memory }) => ({ throttles: memory.throttles + 1 }) } },
  states: {
    WATCHING: {
      onContext: [C.head.change({ event: E.HeadMoved.from((head: string) => ({ head })) })],
      on: {
        HeadMoved: {
          updateMemory: ({ memory, event }) => ({ pulled: event.head, pulls: memory.pulls + 1 }),
        },
        Pause: S.PAUSED,
      },
    },
    PAUSED: { on: { Resume: S.WATCHING } },
  },
}));
