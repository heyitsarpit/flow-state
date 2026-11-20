import { Duration, Option, Schedule, Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { setTarget } from "../operations/writes.ts";
import { House } from "./house.ts";

const Sensor = { id: Schema.String, kind: Schema.Literals(["temperature", "motion"]) };

type Sensors = ReadonlyArray<{ readonly id: string; readonly kind: "temperature" | "motion" }>;

const POLL_EVERY = { temperature: Duration.minutes(1), motion: Duration.seconds(10) } as const;

const kindOf = (sensors: Sensors, id: string) =>
  sensors.find((s) => s.id === id)?.kind ?? "temperature";

/**
 * A room, named by its name: its sensors and when each was last polled, its target temperature,
 * how many heating checks and boosts it has run, and the house's mode, read as context.
 */
export const Room = definition({
  id: "Home/Room",
  persist: true,
  states: ["OFFLINE", { ONLINE: ["IDLE", "HEATING"] }],
  events: {
    Connected: {},
    Disconnected: {},
    AddSensor: Sensor,
    RemoveSensor: { id: Schema.String },
    SensorChanged: Sensor,
    SetTarget: { celsius: Schema.Number },
    Reached: {},
    Boost: {},
    CancelBoost: {},
    WindowOpened: {},
    RetrySave: {},
  },
  internalEvents: {
    Polled: { id: Schema.String, at: Schema.Number },
    Checked: { attempt: Schema.Number },
    Nudged: { attempt: Schema.Number },
    BoostEnded: {},
    Saved: {},
    Refused: {},
    Unsure: Flow.uncertain({}),
  },
  memory: {
    room: Flow.input(Schema.String),
    sensors: Flow.initial(Schema.Array(Schema.Struct(Sensor)), []),
    polls: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
    target: Flow.initial(Schema.Number, 20),
    checks: Flow.initial(Schema.Array(Schema.Number), []),
    boosts: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { mode: Flow.context(House.state) },
  operations: ({ E }) => ({
    setTarget: setTarget.outcomes({
      success: E.Saved,
      failure: { Offline: E.Refused },
      unknown: E.Unsure,
    }),
  }),
});

/**
 * The room: a target is saved to the thermostat whether the room is online or not, and an unsure
 * save may be retried twice. Online, it polls each sensor on its own timer (a motion sensor every 10 seconds, a
 * temperature sensor every minute), restarted when the sensor's kind changes; temperature polls
 * are held while the house is on vacation or a target is being applied, since a reading then is
 * stale, and motion keeps polling. Heating, it checks the temperature three times,
 * five minutes apart, from each new target; an open window stops the checks. A boost runs for
 * half an hour until cancelled. A save that lands after the room reached its target is not heard;
 * one that lands while heating clears a notice, and with none shown it is denied. Offline, it
 * reminds the owner to reconnect, an hour first and fifty times longer each time.
 */
export const RoomMachine = machine(Room, ({ S, E, O }) => {
  const saveTarget = {
    updateMemory: ({ event }: { readonly event: { readonly celsius: number } }) => ({
      target: event.celsius,
    }),
    actions: [O.setTarget.commit(({ memory }) => ({ room: memory.room, celsius: memory.target }))],
  };

  const byRoom = ({ memory }: { readonly memory: { readonly room: string } }) => ({
    room: memory.room,
  });

  return {
    default: S.OFFLINE,
    on: {
      SetTarget: saveTarget,
      RetrySave: [
        {
          guard: [O.setTarget.retryable(byRoom, { times: 2 })],
          actions: [O.setTarget.retry(byRoom)],
        },
        {},
      ],
      AddSensor: {
        updateMemory: ({ event, memory }) => ({
          sensors: [...memory.sensors, { id: event.id, kind: event.kind }],
        }),
      },
      RemoveSensor: {
        updateMemory: ({ event, memory }) => ({
          sensors: memory.sensors.filter((s) => s.id !== event.id),
        }),
      },
      SensorChanged: {
        updateMemory: ({ event, memory }) => ({
          sensors: memory.sensors.map((s) =>
            s.id === event.id ? { id: s.id, kind: event.kind } : s,
          ),
        }),
      },
      Disconnected: S.OFFLINE,
      Refused: { updateMemory: () => ({ notice: "The heater is offline." }) },
      Unsure: { updateMemory: () => ({ notice: "Check the thermostat." }) },
    },
    states: {
      OFFLINE: {
        on: {
          Connected: S.ONLINE,
          Nudged: {
            updateMemory: ({ event }) => ({
              notice: `Reconnect the thermostat (reminder ${String(event.attempt)}).`,
            }),
          },
        },
        schedules: {
          reconnect: {
            schedule: Schedule.exponential("1 hour", 50),
            send: E.Nudged.from(({ attempt }: { readonly attempt: number }) => ({ attempt })),
          },
        },
      },
      ONLINE: {
        default: S.ONLINE.IDLE,
        on: {
          SetTarget: { target: S.ONLINE.HEATING, ...saveTarget },
          Polled: {
            updateMemory: ({ event, memory }) => ({
              polls: { ...memory.polls, [event.id]: event.at },
            }),
          },
        },
        schedules: {
          poll: Flow.keyed({
            keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
            schedule: ({ key, memory }) =>
              Schedule.spaced(POLL_EVERY[kindOf(memory.sensors, key.id)]),
            restartOn: ({ key, memory }) => kindOf(memory.sensors, key.id),
            paused: {
              Vacation: ({ key, memory, context }) =>
                context.mode === "VACATION" && kindOf(memory.sensors, key.id) === "temperature",
              Saving: ({ key, memory, operations }) =>
                kindOf(memory.sensors, key.id) === "temperature" &&
                Option.exists(
                  O.setTarget.get(operations, { room: memory.room }),
                  (row) => row.pending,
                ),
            },
            send: E.Polled.from(({ key, firedAt }) => ({ id: key["id"] ?? "", at: firedAt })),
          }),
        },
        states: {
          HEATING: {
            on: {
              Reached: S.ONLINE.IDLE,
              Saved: {
                guard: [({ memory }) => memory.notice !== "" || deny("NothingToClear")],
                updateMemory: () => ({ notice: "" }),
              },
              Checked: {
                updateMemory: ({ event, memory }) => ({
                  checks: [...memory.checks, event.attempt],
                }),
              },
              BoostEnded: { updateMemory: ({ memory }) => ({ boosts: memory.boosts + 1 }) },
            },
            schedules: {
              check: {
                schedule: Schedule.spaced("5 minutes").pipe(Schedule.upTo({ times: 3 })),
                send: E.Checked.from(({ attempt }: { readonly attempt: number }) => ({ attempt })),
                armOn: [Flow.entry],
                restartOn: ({ memory }) => memory.target,
                disarmOn: [E.WindowOpened],
                paused: { Vacation: ({ context }) => context.mode === "VACATION" },
              },
              boost: {
                schedule: Duration.minutes(30),
                send: E.BoostEnded,
                armOn: [E.Boost],
                disarmOn: [E.CancelBoost],
              },
            },
          },
        },
      },
    },
  };
});
