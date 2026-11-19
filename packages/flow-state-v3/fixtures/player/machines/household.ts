import { Schema } from "effect";
import {
  actorRef,
  definition,
  deny,
  Flow,
  type Machine,
  machine,
  send,
} from "../../../src/index.ts";
import { PlayerMachine } from "./player.ts";

/**
 * The household's speakers as a group: the rooms still to start, the track they play, and how many
 * rooms it has started.
 */
export const Household = definition({
  id: "Music/Household",
  states: ["HOME"],
  events: {
    PlayGroup: { rooms: Schema.Array(Schema.String), trackId: Schema.String },
    Next: {},
  },
  memory: {
    pending: Flow.initial(Schema.Array(Schema.String), []),
    current: Flow.initial(Schema.String, ""),
    trackId: Flow.initial(Schema.String, ""),
    started: Flow.initial(Schema.Number, 0),
  },
});

const home = () => actorRef(HouseholdMachine, "home");

/**
 * The household plays a group of rooms together: it starts one room at a time, in the group's
 * order, telling itself to go on with the next room and that room's player to play the track.
 */
export const HouseholdMachine: Machine<typeof Household> = machine(Household, ({ S }) => ({
  default: S.HOME,
  on: {
    PlayGroup: {
      updateMemory: ({ event }) => ({ pending: event.rooms, trackId: event.trackId }),
      actions: [send(home, () => ({ _tag: "Next" }))],
    },
    Next: [
      {
        guard: [({ memory }) => memory.pending.length > 0 || deny("GroupDone")],
        updateMemory: ({ memory }) => ({
          current: memory.pending[0] ?? "",
          pending: memory.pending.slice(1),
          started: memory.started + 1,
        }),
        actions: [
          send(home, () => ({ _tag: "Next" })),
          send(
            ({ memory }) => actorRef(PlayerMachine, { room: memory.current }),
            ({ memory }) => ({ _tag: "Play", trackId: memory.trackId }),
          ),
        ],
      },
      {},
    ],
  },
}));
