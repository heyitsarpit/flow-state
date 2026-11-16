// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Duration, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { NoResponse, play, SpeakerApi, Unavailable } from "./contracts.ts";

const Player = definition({
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
    trackId: Flow.initial(Schema.String, ""),
    pos: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
    device: Flow.private(Flow.initial(Schema.String, "living-room")),
    label: Flow.initial(Schema.String, (fields) => `Speaker: ${String(fields["device"])}`),
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

const lost = () => Effect.fail(new NoResponse());

/**
 * The speaker port over HTTP: `POST /play` with the Attempt's id as the idempotency key.
 */
export const SpeakerHttp = (origin: string) =>
  Layer.effect(
    SpeakerApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));

      return SpeakerApi.of({
        play: (input, { idempotencyKey }) =>
          HttpClientRequest.post("/play").pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe(input),
            client.execute,
            Effect.flatMap(
              HttpClientResponse.matchStatus({
                "2xx": () => Effect.void,
                409: () => Effect.fail(new Unavailable({ why: "not in your region" })),
                orElse: lost,
              }),
            ),
            Effect.catchTag("HttpClientError", lost),
          ),
      });
    }),
  );

/**
 * The player app: one machine.
 */
export const musicApp = app({ id: "music", machines: { player: PlayerMachine } });

/**
 * The player app's real setup: the speaker over HTTP, with no persistence.
 */
export const musicSetup = runtimeSetup({
  app: musicApp,
  services: SpeakerHttp("https://speaker.example").pipe(Layer.provide(FetchHttpClient.layer)),
});

/**
 * The player the Stories use.
 */
export const player = actorRef(PlayerMachine, "player");
