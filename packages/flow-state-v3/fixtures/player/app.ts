// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { SpeakerHttp } from "./adapters/speaker.ts";
import { PlayerMachine } from "./machines/player.ts";
import { SleepTimerMachine } from "./machines/sleep-timer.ts";

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
 * The player the Stories use, named by its room.
 */
export const player = actorRef(PlayerMachine, { room: "lounge" });

/**
 * The lounge's sleep timer.
 */
export const loungeTimer = actorRef(SleepTimerMachine, { room: "lounge" });

/**
 * The sleep timer of the `n`th of many rooms.
 */
export const timerOf = (n: number) => actorRef(SleepTimerMachine, { room: `room-${String(n)}` });

/**
 * The player app grown with each room's sleep timer.
 */
export const musicTimed = app({
  id: "music",
  machines: { player: PlayerMachine, timers: SleepTimerMachine },
});

/**
 * The timed player app's real setup, as the player app's: the speaker over HTTP, with no
 * persistence.
 */
export const musicTimedSetup = runtimeSetup({
  app: musicTimed,
  services: SpeakerHttp("https://speaker.example").pipe(Layer.provide(FetchHttpClient.layer)),
});
