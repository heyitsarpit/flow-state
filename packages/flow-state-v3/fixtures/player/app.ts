// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { SpeakerHttp } from "./adapters/speaker.ts";
import { PlayerMachine } from "./machines/player.ts";
import { SleepTimerMachine } from "./machines/sleep-timer.ts";
import { HouseholdMachine } from "./machines/household.ts";

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

/**
 * The household that plays groups of rooms.
 */
export const household = actorRef(HouseholdMachine, "home");

/**
 * The player of a named room.
 */
export const room = (name: string) => actorRef(PlayerMachine, { room: name });

/**
 * The player app grown with the household around the rooms and their sleep timers.
 */
export const musicHome = app({
  id: "music",
  machines: { player: PlayerMachine, timers: SleepTimerMachine, household: HouseholdMachine },
});

/**
 * The grown player app's real setup: the speaker over HTTP, with no persistence.
 */
export const musicHomeSetup = runtimeSetup({
  app: musicHome,
  services: SpeakerHttp("https://speaker.example").pipe(Layer.provide(FetchHttpClient.layer)),
});
