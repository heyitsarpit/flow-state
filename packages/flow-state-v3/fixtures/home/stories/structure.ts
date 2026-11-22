import { Duration } from "effect";
import { Flow, machine } from "../../../src/index.ts";
import { house, roomOf } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { Thermostat } from "../server/thermostat.ts";
import { homeStory, lounge, loungeWithSensors } from "./usual.ts";

const HOUR = 3_600_000;

/**
 * The house on vacation holds the lounge's polls and its heating checks; the tab reloads with the
 * room the deepest node; after the reload the house comes home and the held check finishes its
 * time left, then the series goes on at its saved attempt and ends after its third check.
 */
export const reloadedPaused = loungeWithSensors(homeStory("home/reloaded-paused"))
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .advance("7 minutes")
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .checkpoint("paused")
  .reload()
  .ensure(lounge)
  .ensure(house)
  .checkpoint("reloaded")
  .send(house, House.E.Arrive())
  .advance("3 minutes")
  .checkpoint("left finished")
  .advance("5 minutes")
  .checkpoint("step one again")
  .advance("10 minutes")
  .checkpoint("series over");

/**
 * S6, house first: the house's saved vacation is restored before the room, whose temperature poll
 * comes back held with its left and whose motion poll restarts at its first step.
 */
export const houseFirst = loungeWithSensors(homeStory("home/house-first"))
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .reload({ reattach: false })
  .ensure(house)
  .ensure(lounge)
  .checkpoint("room after");

/**
 * S8 × 8 under a live vacation: eight rooms are opened mid-tick, 30 seconds in, each with a
 * temperature sensor: each new key arms while paused and holds its full delay.
 */
export const roomsAddedMidTick = Array.from({ length: 8 }, (_, n) => roomOf(n))
  .reduce(
    (story, ref) =>
      story
        .ensure(ref)
        .send(ref, Room.E.Connected())
        .send(ref, Room.E.AddSensor({ id: "t1", kind: "temperature" })),
    loungeWithSensors(homeStory("home/rooms-added-mid-tick"))
      .send(house, House.E.StartVacation({ until: 10 * HOUR }))
      .advance("30 seconds"),
  )
  .checkpoint("added");

/**
 * The room is opened before the house, while the house is already on vacation in its saved record.
 */
export const roomFirst = homeStory("home/room-first")
  .ensure(house)
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .reload({ reattach: false })
  .ensure(lounge)
  .send(lounge, Room.E.Connected())
  .send(lounge, Room.E.AddSensor({ id: "t1", kind: "temperature" }))
  .checkpoint("room first")
  .ensure(house)
  .checkpoint("house after");

/**
 * The lounge is left unused for twenty minutes during its heating checks and polls, then used
 * again: the overdue check and each overdue poll fire once.
 */
export const unusedReturn = (id: string) =>
  loungeWithSensors(homeStory(id))
    .send(lounge, Room.E.SetTarget({ celsius: 22 }))
    .detach(lounge)
    .advance("20 minutes")
    .checkpoint("waiting")
    .ensure(lounge)
    .checkpoint("returned");

/**
 * The lounge is left unused while its new target is still saving, so it stays live with no use for
 * twenty minutes: its timers sleep, the overdue check and motion poll fire once when it is used
 * again, and the temperature poll stays held by the save until the thermostat answers.
 */
export const unusedWhileSaving = loungeWithSensors(homeStory("home/unused-while-saving"))
  .world(Thermostat.setTarget.hold())
  .send(lounge, Room.E.SetTarget({ celsius: 22 }))
  .detach(lounge)
  .checkpoint("asleep")
  .advance("20 minutes")
  .checkpoint("still saving")
  .ensure(lounge)
  .checkpoint("awake")
  .world(Thermostat.setTarget.release())
  .checkpoint("saved");

/**
 * As {@link unusedReturn}, then the next check is five minutes from the overdue one's firing.
 */
export const unusedOverdue = unusedReturn("home/unused-overdue")
  .advance("5 minutes")
  .checkpoint("next step");

/**
 * A vacation holds the lounge's temperature poll; the tab reloads, and the house comes home
 * before the lounge is opened again: its saved hold's reason is false at the restore, so the poll
 * resumes from its time left.
 */
export const vacationEndedUnused = loungeWithSensors(homeStory("home/vacation-ended-unused"))
  .send(house, House.E.StartVacation({ until: 10 * HOUR }))
  .advance("30 seconds")
  .reload({ reattach: false })
  .ensure(house)
  .send(house, House.E.Arrive())
  .advance("5 seconds")
  .ensure(lounge)
  .checkpoint("room after");

/**
 * Refused shape: `armOn` on a keyed schedule, a construction error.
 */
export const armOnKeyed = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          poll: {
            keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
            schedule: Duration.minutes(1),
            send: E.Polled.from(({ key, firedAt }) => ({ id: key.id, at: firedAt })),
            armOn: [E.Connected],
            restartOn: () => "temperature",
            paused: { Vacation: () => false, Saving: () => false },
          },
        },
      },
    },
  }));

/**
 * Refused shape: one event in both `armOn` and `disarmOn`, a construction error.
 */
export const armedAndDisarmed = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          boost: {
            schedule: Duration.minutes(30),
            send: E.BoostEnded,
            armOn: [E.Boost],
            disarmOn: [E.Boost],
          },
        },
      },
    },
  }));

/**
 * Refused shape: an event in `armOn` beside `restartOn`, a construction error; only
 * `armOn: [Flow.entry]` may sit there.
 */
export const armOnBesideRestart = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          check: {
            schedule: Duration.minutes(30),
            send: E.BoostEnded,
            armOn: [Flow.entry, E.Boost],
            restartOn: ({ memory }) => memory.target,
            paused: { Vacation: () => false },
          },
        },
      },
    },
  }));

/**
 * Refused shape: a schedule the room's definition does not declare, a construction error.
 */
export const undeclaredSchedule = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        // oxlint-disable-next-line flow-state/no-undeclared-schedule -- the undeclared schedule this builder shows refused
        schedules: {
          // @ts-expect-error Types R8: nudge is not declared on Room
          nudge: { schedule: Duration.minutes(1), send: E.BoostEnded },
        },
      },
    },
  }));

/**
 * Refused shape, the wrong ending of a misspelt reason: `Vacaton` is no declared pause reason of
 * `check`, so it would hold nothing; a type error, and a construction error past the types.
 */
export const misspeltReason = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          check: {
            schedule: Duration.minutes(5),
            send: E.BoostEnded,
            restartOn: () => 20,
            paused: {
              Vacation: () => false,
              // @ts-expect-error Types R2: Vacaton is no declared pause reason
              Vacaton: () => true,
            },
          },
        },
      },
    },
  }));

/**
 * Refused shape: `check` placed without a callback for its declared reason `Vacation`.
 */
export const reasonMissing = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          // @ts-expect-error Types R8: check declares the reason Vacation
          check: { schedule: Duration.minutes(5), send: E.BoostEnded, restartOn: () => 20 },
        },
      },
    },
  }));

/**
 * Refused shape: the keyed `poll` placed without keys.
 */
export const keysMissing = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          // @ts-expect-error Types R8: poll is keyed, so it has keys
          poll: {
            schedule: Duration.minutes(1),
            send: E.BoostEnded,
            restartOn: () => "motion",
            paused: { Vacation: () => false, Saving: () => false },
          },
        },
      },
    },
  }));

/**
 * Refused shape: keys on `boost`, declared without a key.
 */
export const keysUnexpected = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          boost: {
            // @ts-expect-error Types R8: boost is declared without a key
            keys: () => [{ id: "a" }],
            schedule: Duration.minutes(30),
            send: E.BoostEnded,
          },
        },
      },
    },
  }));

/**
 * Refused shape: restartOn on `boost`, declared without one.
 */
export const restartOnUndeclared = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          boost: {
            schedule: Duration.minutes(30),
            send: E.BoostEnded,
            // @ts-expect-error Types R8: boost declares no restartOn
            restartOn: () => 1,
          },
        },
      },
    },
  }));

/**
 * Refused shape: `check`, which declares restartOn, placed without one.
 */
export const restartOnMissing = () =>
  machine(Room, ({ S, E }) => ({
    default: S.OFFLINE,
    states: {
      ONLINE: {
        default: S.ONLINE.IDLE,
        schedules: {
          // @ts-expect-error Types R8: check declares restartOn
          check: {
            schedule: Duration.minutes(5),
            send: E.BoostEnded,
            paused: { Vacation: () => false },
          },
        },
      },
    },
  }));
