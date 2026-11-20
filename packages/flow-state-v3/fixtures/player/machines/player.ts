import { Duration, Schema } from "effect";

import { definition, Flow, machine } from "../../../src/index.ts";
import { play } from "../operations/writes.ts";

export const Player = definition({
  id: "Music/Player",
  states: ["OFF", { ON: ["BUFFERING", "PLAYING", "PAUSED"] }],
  events: {
    Play: { trackId: Schema.String },
    Pause: {},
    Resume: {},
    Stop: {},
    Seek: { pos: Schema.Number },
  },
  internalEvents: {
    Started: {},
    Refused: { why: Schema.String },
    Unsure: Flow.uncertain({}),
    Tick: {},
  },
  memory: {
    room: Flow.input(Schema.String),
    trackId: Flow.initial(Schema.String, ""),
    pos: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
    device: Flow.private(Flow.initial(Schema.String, "living-room")),
  },
  operations: ({ E }) => ({
    play: play.outcomes({
      success: E.Started,
      failure: { Unavailable: E.Refused.from((e: { readonly why: string }) => ({ why: e.why })) },
      unknown: E.Unsure,
    }),
  }),
});

/**
 * The player's label, its room and its speaker, derived where it is shown.
 */
export const labelOf = (memory: { readonly room: string; readonly device: string }) =>
  `${memory.room}: ${memory.device}`;

/**
 * A music player: OFF, or ON while BUFFERING, PLAYING or PAUSED. Play buffers a track on the
 * speaker, the tick counts seconds while PLAYING, Pause and Resume move within ON, and Resume from
 * OFF returns to ON's last sub-state by history. A seek at the root restarts the tick, and a start
 * that lands after BUFFERING was left is heard by ON.
 */
export const PlayerMachine = machine(Player, ({ S, E, O }) => ({
  default: S.OFF,
  on: {
    Play: {
      target: S.ON.BUFFERING,
      updateMemory: ({ event }) => ({ trackId: event.trackId, pos: 0, notice: "" }),
      actions: [
        O.play.commit(({ memory }) => ({ device: memory.device, trackId: memory.trackId })),
      ],
    },
    Stop: S.OFF,
    Seek: { updateMemory: ({ event }) => ({ pos: event.pos }) },
    Refused: { target: S.OFF, updateMemory: ({ event }) => ({ notice: event.why }) },
    Unsure: { target: S.OFF, updateMemory: () => ({ notice: "Check the speaker." }) },
  },
  states: {
    OFF: { on: { Resume: S.ON.history } },
    ON: {
      default: S.ON.BUFFERING,
      on: {
        Pause: S.ON.PAUSED,
        Started: { updateMemory: () => ({ notice: "The speaker started while you were away." }) },
      },
      states: {
        BUFFERING: { on: { Started: S.ON.PLAYING } },
        PLAYING: {
          schedules: {
            tick: {
              schedule: Duration.seconds(1),
              send: E.Tick,
              armOn: [Flow.entry, E.Tick.tag, E.Seek.tag],
            },
          },
          on: { Tick: { updateMemory: ({ memory }) => ({ pos: memory.pos + 1 }) } },
        },
        PAUSED: { on: { Resume: S.ON.PLAYING } },
      },
    },
  },
}));
