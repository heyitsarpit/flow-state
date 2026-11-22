import { Duration, Option, Schedule, Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { setTarget } from "../operations/writes.ts";
import { House } from "./house.ts";

const Sensor = { id: Schema.String, kind: Schema.Literals(["temperature", "motion"]) };

const POLL_EVERY = { temperature: Duration.minutes(1), motion: Duration.seconds(10) } as const;

const Device = { id: Schema.String, every: Schema.Number, firmware: Schema.String };

const Devices = Schema.Array(Schema.Struct(Device));

const deviceOf = (devices: typeof Devices.Type, id: string) => devices.find((d) => d.id === id);

// The major version of a device's firmware text, such as 3 for "3.1.4"; a report the room cannot
// read throws, as a parser does.
const majorOf = (firmware: string) => {
  const major = /^(\d+)\./.exec(firmware)?.[1];

  if (major === undefined) throw new Error(`unreadable firmware "${firmware}"`);

  return Number(major);
};

const kindOf = (sensors: typeof Room.M.sensors.Type, id: string) =>
  sensors.find((s) => s.id === id)?.kind ?? "temperature";

/**
 * A room, named by its name: its sensors and when each was last polled, its target temperature,
 * how many heating checks and boosts it has run, the devices paired with its hub (each as the
 * device reports itself: how often it asks to be pinged, in milliseconds, and its firmware text)
 * and when each was last pinged, and the house's mode, read as context.
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
    Paired: Device,
    Reported: Device,
    Unpaired: { id: Schema.String },
    Quiet: {},
  },
  internalEvents: {
    Polled: { id: Schema.String, at: Schema.Number },
    Checked: { attempt: Schema.Number },
    Nudged: { attempt: Schema.Number },
    BoostEnded: {},
    Saved: {},
    Refused: {},
    Unsure: Flow.uncertain({}),
    Pinged: { id: Schema.String, at: Schema.Number },
  },
  memory: {
    room: Flow.input(Schema.String),
    sensors: Flow.initial(Schema.Array(Schema.Struct(Sensor)), []),
    polls: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
    target: Flow.initial(Schema.Number, 20),
    checks: Flow.initial(Schema.Array(Schema.Number), []),
    boosts: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
    devices: Flow.initial(Devices, []),
    pings: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
  },
  context: { mode: Flow.context(House.state) },
  operations: ({ E }) => ({
    setTarget: setTarget.outcomes({
      success: E.Saved,
      failure: { Offline: E.Refused },
      unknown: E.Unsure,
    }),
  }),
  schedules: {
    reconnect: {},
    poll: {
      key: { id: Schema.String },
      pausedBy: ["Vacation", "Saving"],
      restartOn: Sensor.kind,
    },
    check: { pausedBy: ["Vacation"], restartOn: Schema.Number },
    boost: {},
    ping: { key: { id: Schema.String }, pausedBy: ["Away"], restartOn: Schema.Number },
  },
});

const byRoom = ({ memory }: { readonly memory: typeof Room.Memory.Type }) => ({
  room: memory.room,
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
 * reminds the owner to reconnect, an hour first and fifty times longer each time. Online, its hub
 * pings each paired device on the interval the device reports, from its pairing, and from the
 * start again when the device reports a new major firmware version; pings are held while the
 * house is away or on vacation. Quiet stops every ping until a device pairs or updates again. An
 * interval past the longest timer, or firmware text the room cannot
 * read, is that device's issue until the device reports again.
 */
export const RoomMachine = machine(Room, ({ S, E, O }) => ({
  default: S.OFFLINE,
  on: {
    SetTarget: {
      updateMemory: ({ event }) => ({ target: event.celsius }),
      actions: [
        O.setTarget.commit(({ memory }) => ({ room: memory.room, celsius: memory.target })),
      ],
    },
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
    Paired: {
      updateMemory: ({ event, memory }) => ({
        devices: [...memory.devices.filter((d) => d.id !== event.id), event],
      }),
    },
    Reported: {
      updateMemory: ({ event, memory }) => ({
        devices: memory.devices.map((d) => (d.id === event.id ? event : d)),
      }),
    },
    Unpaired: {
      updateMemory: ({ event, memory }) => ({
        devices: memory.devices.filter((d) => d.id !== event.id),
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
          send: E.Nudged.from(({ attempt }) => ({ attempt })),
        },
      },
    },
    ONLINE: {
      default: S.ONLINE.IDLE,
      on: {
        SetTarget: {
          target: S.ONLINE.HEATING,
          updateMemory: ({ event }) => ({ target: event.celsius }),
          actions: [
            O.setTarget.commit(({ memory }) => ({ room: memory.room, celsius: memory.target })),
          ],
        },
        Polled: {
          updateMemory: ({ event, memory }) => ({
            polls: { ...memory.polls, [event.id]: event.at },
          }),
        },
        Pinged: {
          updateMemory: ({ event, memory }) => ({
            pings: { ...memory.pings, [event.id]: event.at },
          }),
        },
      },
      schedules: {
        poll: {
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
          send: E.Polled.from(({ key, firedAt }) => ({ id: key.id, at: firedAt })),
        },
        ping: {
          keys: ({ memory }) => memory.devices.map((d) => ({ id: d.id })),
          schedule: ({ key, memory }) =>
            Schedule.spaced(Duration.millis(deviceOf(memory.devices, key.id)?.every ?? 0)),
          restartOn: ({ key, memory }) => majorOf(deviceOf(memory.devices, key.id)?.firmware ?? ""),
          disarmOn: [E.Quiet],
          paused: { Away: ({ context }) => context.mode !== "HOME" },
          send: E.Pinged.from(({ key, firedAt }) => ({ id: key.id, at: firedAt })),
        },
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
              send: E.Checked.from(({ attempt }) => ({ attempt })),
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
}));
