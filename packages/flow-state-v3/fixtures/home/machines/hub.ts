import { Duration, Schedule, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { House } from "./house.ts";

const Device = { id: Schema.String, every: Schema.Number, firmware: Schema.String };

type Devices = ReadonlyArray<{
  readonly id: string;
  readonly every: number;
  readonly firmware: string;
}>;

const deviceOf = (devices: Devices, id: string) => devices.find((d) => d.id === id);

// The major version of a device's firmware text, such as 3 for "3.1.4"; a report the hub cannot
// read throws, as a parser does.
const majorOf = (firmware: string) => {
  const major = /^(\d+)\./.exec(firmware)?.[1];

  if (major === undefined) throw new Error(`unreadable firmware "${firmware}"`);

  return Number(major);
};

/**
 * The house's hub, named by its name: the devices paired with it, each as the device reports
 * itself (how often it asks to be pinged, in milliseconds, and its firmware text), and when each
 * was last pinged; the house's mode is read as context.
 */
export const Hub = definition({
  id: "Home/Hub",
  persist: true,
  states: ["LISTENING"],
  events: {
    Paired: Device,
    Reported: Device,
    Unpaired: { id: Schema.String },
    Quiet: {},
    Rescan: {},
  },
  internalEvents: { Pinged: { id: Schema.String, at: Schema.Number } },
  memory: {
    hub: Flow.input(Schema.String),
    devices: Flow.initial(Schema.Array(Schema.Struct(Device)), []),
    pings: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
  },
  context: { mode: Flow.context(House.state) },
  schedules: {
    ping: { key: { id: Schema.String }, pausedBy: ["Away"], restartOn: Schema.Number },
  },
});

/**
 * The hub: it pings each paired device on the interval the device reports, from its pairing,
 * and from the start again when the device reports a new major firmware version; pings are held
 * while the house is away or on vacation. Quiet stops every ping until a device pairs or updates
 * again; a rescan listens afresh. An interval past the longest timer, or firmware text the hub
 * cannot read, is that device's issue until the device reports again.
 */
export const HubMachine = machine(Hub, ({ S, E }) => ({
  default: S.LISTENING,
  on: {
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
    Pinged: {
      updateMemory: ({ event, memory }) => ({ pings: { ...memory.pings, [event.id]: event.at } }),
    },
  },
  states: {
    LISTENING: {
      on: { Rescan: { target: S.LISTENING } },
      schedules: {
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
    },
  },
}));
