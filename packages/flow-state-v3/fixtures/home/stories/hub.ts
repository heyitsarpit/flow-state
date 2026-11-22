import { samplesOf } from "../../../src/host/testing/index.ts";
import { hall, house } from "../app.ts";
import { House } from "../machines/house.ts";
import { Room } from "../machines/room.ts";
import { homeStory } from "./usual.ts";

/**
 * How many devices the load Story pairs: a household's worth many times over, small enough for
 * the suite's time (a first guess, to be measured on the bench).
 */
export const DEVICES = 64;

const LONGEST = 2 ** 31 - 1;

const lock = (firmware: string, every = 30_000) => Room.E.Paired({ id: "lock", every, firmware });

const lockReport = (firmware: string, every = 30_000) =>
  Room.E.Reported({ id: "lock", every, firmware });

const camera = (every: number) => Room.E.Paired({ id: "cam", every, firmware: "1.0" });

/**
 * The hall's hub with the house, at clock 0.
 */
const hubStory = (id: string) =>
  homeStory(id).ensure(house).ensure(hall).send(hall, Room.E.Connected());

/**
 * The hub pings a lock every 30 seconds and a camera every minute; leaving the house holds both,
 * arriving resumes them; the lock's new major firmware restarts its pings; the camera, unpaired,
 * is pinged no more.
 */
export const hubUsual = hubStory("home/hub-usual")
  .send(hall, lock("2.1"))
  .send(hall, camera(60_000))
  .checkpoint("paired")
  .advance("1 minute")
  .checkpoint("pinged")
  .advance("10 seconds")
  .send(house, House.E.Leave())
  .checkpoint("away")
  .advance("10 minutes")
  .checkpoint("still away")
  .send(house, House.E.Arrive())
  .checkpoint("home")
  .send(hall, lockReport("3.0"))
  .checkpoint("updated")
  .send(hall, Room.E.Unpaired({ id: "cam" }))
  .advance("2 minutes")
  .checkpoint("unpaired");

/**
 * The ping that never comes back: Quiet stops the lock's pings, the lock reports firmware the hub
 * cannot read, the page reloads, and the lock reports a new major version. Right ending: its pings
 * start again from the update. Wrong ending: the reload forgets the version the hub last read, so
 * the update is taken as a first reading and the lock is never pinged again, with no issue shown.
 */
export const hubFirmwareReload = hubStory("home/hub-firmware-reload")
  .send(hall, lock("2.1"))
  .advance("10 seconds")
  .send(hall, Room.E.Quiet())
  .checkpoint("quiet")
  .send(hall, lockReport("beta-2"))
  .checkpoint("unreadable")
  .reload()
  .ensure(house)
  .ensure(hall)
  .checkpoint("reloaded")
  .send(hall, lockReport("3.0"))
  .checkpoint("updated")
  .advance("30 seconds")
  .checkpoint("pinged");

/**
 * A camera reports an interval past the longest timer: its start is refused with an issue, the
 * page reloads and the issue stands, and when the camera reports a valid interval it is pinged.
 */
export const hubIntervalRefused = hubStory("home/hub-interval-refused")
  .send(hall, camera(2 ** 31))
  .checkpoint("refused")
  .reload()
  .ensure(house)
  .ensure(hall)
  .checkpoint("reloaded")
  .send(hall, Room.E.Reported({ id: "cam", every: 60_000, firmware: "1.0" }))
  .checkpoint("valid")
  .advance("1 minute")
  .checkpoint("pinged");

/**
 * A refused camera's issue goes with the camera: unpaired, it shows nothing; paired again with
 * the same interval, Quiet ends its refused start and its issue with it.
 */
export const hubRefusedGone = hubStory("home/hub-refused-gone")
  .send(hall, camera(2 ** 31))
  .checkpoint("refused")
  .send(hall, Room.E.Unpaired({ id: "cam" }))
  .checkpoint("unpaired")
  .send(hall, camera(2 ** 31))
  .checkpoint("refused again")
  .send(hall, Room.E.Quiet())
  .checkpoint("quiet");

/**
 * Intervals at the edge of the longest timer: 2^31 − 1 ms is armed and pinged at it; 2^31 ms is
 * refused with its issue.
 */
export const hubIntervalEdges = hubStory("home/hub-interval-edges")
  .send(hall, Room.E.Paired({ id: "longest", every: LONGEST, firmware: "1.0" }))
  .send(hall, Room.E.Paired({ id: "past", every: 2 ** 31, firmware: "1.0" }))
  .checkpoint("paired")
  .advance(LONGEST)
  .checkpoint("longest pinged");

/**
 * Many devices on one hub, each pinged every ten seconds, held together while the house is away,
 * through two reloads in the hold, and resumed together on arrival (S2 × 64 devices under L1 and
 * L4).
 */
export const hubManyDevices = Array.from({ length: DEVICES }, (_, n) => n)
  .reduce(
    (story, n) =>
      story.send(hall, Room.E.Paired({ id: `d${String(n)}`, every: 10_000, firmware: "1.0" })),
    hubStory("home/hub-many-devices"),
  )
  .advance("5 seconds")
  .send(house, House.E.Leave())
  .checkpoint("held")
  .reload()
  .ensure(house)
  .ensure(hall)
  .reload()
  .ensure(house)
  .ensure(hall)
  .checkpoint("reloaded")
  .send(house, House.E.Arrive())
  .advance("5 seconds")
  .checkpoint("pinged");

/**
 * What a household can do around the hub, for generated runs: devices paired, updated with a new
 * major version, with unreadable or empty firmware, and with an interval at and past the longest
 * timer, unpaired and paired again; Quiet, a rescan, and the house leaving, arriving and going on
 * vacation.
 */
export const hubSamples = samplesOf({
  id: "home-hub",
  story: homeStory("home-hub/samples"),
  names: { setup: "homeSetup", fixtures: ["ThermostatFake"] },
  actors: { house, hall },
  servers: {},
  failures: [],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(hall, Room.E.Connected())
      .send(hall, lock("2.1"))
      .send(hall, camera(60_000))
      .send(hall, lockReport("3.0"))
      .send(hall, lockReport("beta-2"))
      .send(hall, lockReport(""))
      .send(hall, Room.E.Reported({ id: "cam", every: LONGEST, firmware: "1.0" }))
      .send(hall, Room.E.Reported({ id: "cam", every: 2 ** 31, firmware: "1.0" }))
      .send(hall, Room.E.Reported({ id: "cam", every: 60_000, firmware: "1.0" }))
      .send(hall, Room.E.Unpaired({ id: "cam" }))
      .send(hall, camera(2 ** 31))
      .send(hall, Room.E.Quiet())
      .send(hall, Room.E.Rescan())
      .send(house, House.E.Leave())
      .send(house, House.E.StartVacation({ until: 36_000_000 }))
      .send(house, House.E.Arrive()),
});

/**
 * Every named Story of the hub.
 */
export const hubStories = {
  hubUsual,
  hubFirmwareReload,
  hubIntervalRefused,
  hubRefusedGone,
  hubIntervalEdges,
  hubManyDevices,
};
