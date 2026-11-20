import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import { household, musicHomeSetup, room } from "../app.ts";
import { Household } from "../machines/household.ts";
import { Speaker } from "../server/speaker.ts";
import { SpeakerFake } from "../server/layer.ts";

/**
 * The player app grown with the household, over its speaker fake, with no steps yet: every Story
 * of a group play starts here.
 */
export const homeStory = (id: string) => Story.app(musicHomeSetup, { id, fixtures: [SpeakerFake] });

/**
 * The rooms of a group play, in the group's order.
 */
export const GROUP = ["lounge", "kitchen", "study"] as const;

/**
 * A room name with no encoded form: a lone surrogate, which no JSON text can hold.
 */
export const UNNAMEABLE = "\uD800";

/**
 * The lounge, kitchen and study are open; the household plays a track in all three.
 */
export const groupPlay = GROUP.reduce(
  (story, name) => story.ensure(room(name)),
  homeStory("player/group-play"),
)
  .ensure(household)
  .send(household, Household.E.PlayGroup({ rooms: GROUP, trackId: "t1" }))
  .checkpoint("started");

/**
 * The kitchen is closed and still in its grace when the household plays a track there; a second
 * later the grace has long passed.
 */
export const groupInGrace = homeStory("player/group-in-grace")
  .ensure(room("kitchen"))
  .ensure(household)
  .detach(room("kitchen"))
  .send(household, Household.E.PlayGroup({ rooms: ["kitchen"], trackId: "t1" }))
  .checkpoint("delivered")
  .advance("1 second")
  .checkpoint("after the grace");

/**
 * The kitchen is closed and its grace passes, so it ends; then the household plays a track there.
 */
export const groupRoomEnded = homeStory("player/group-room-ended")
  .ensure(room("kitchen"))
  .ensure(household)
  .detach(room("kitchen"))
  .advance("1 second")
  .checkpoint("ended")
  .send(household, Household.E.PlayGroup({ rooms: ["kitchen"], trackId: "t1" }))
  .checkpoint("sent");

/**
 * The kitchen is disposed and the attic never opened; the household plays a track in both.
 */
export const groupRoomsAbsent = homeStory("player/group-rooms-absent")
  .ensure(room("kitchen"))
  .ensure(household)
  .dispose(room("kitchen"))
  .send(household, Household.E.PlayGroup({ rooms: ["kitchen", "attic"], trackId: "t1" }))
  .checkpoint("sent");

/**
 * The household plays a group whose second room has a name with no encoded form.
 */
export const groupBadRoom = homeStory("player/group-bad-room")
  .ensure(room("lounge"))
  .ensure(room("study"))
  .ensure(household)
  .send(household, Household.E.PlayGroup({ rooms: ["lounge", UNNAMEABLE, "study"], trackId: "t1" }))
  .checkpoint("sent");

/**
 * How many rooms the large group plays: a whole building's speakers.
 */
export const BUILDING = 64;

const building = Array.from({ length: BUILDING }, (_, n) => `room-${String(n)}`);

/**
 * Sixty-four rooms are open; the household asks three times in a row for the whole building, each
 * time a new track.
 */
export const groupOfSixtyFour = building
  .reduce((story, name) => story.ensure(room(name)), homeStory("player/group-of-64"))
  .ensure(household)
  .send(household, Household.E.PlayGroup({ rooms: building, trackId: "t1" }))
  .send(household, Household.E.PlayGroup({ rooms: building, trackId: "t2" }))
  .send(household, Household.E.PlayGroup({ rooms: building, trackId: "t3" }))
  .checkpoint("end");

/**
 * How many times in a row the household plays the whole building: enough that their sends together
 * pass the loop guard, though no one play comes near it.
 */
export const REPLAYS = 40;

/**
 * Sixty-four rooms are open; the household plays the whole building forty times in a row, a new
 * track each time.
 */
export const groupReplays = Array.from({ length: REPLAYS }, (_, n) => `t${String(n + 1)}`)
  .reduce(
    (story, trackId) => story.send(household, Household.E.PlayGroup({ rooms: building, trackId })),
    building
      .reduce((story, name) => story.ensure(room(name)), homeStory("player/group-replays"))
      .ensure(household),
  )
  .checkpoint("end");

/**
 * How many rooms the fan-out group names: more than half the loop guard, so its sends (a `Next` and
 * a `Play` per room) pass the guard though the household's chain of `Next`s does not.
 */
export const FAN_OUT = RuntimeDefaults.loopGuard * 0.6;

const fanOut = Array.from({ length: FAN_OUT }, (_, n) => `wing-${String(n)}`);

/**
 * The household plays a group naming every speaker of a large venue, none of them open.
 */
export const groupPastGuard = homeStory("player/group-past-guard")
  .ensure(household)
  .send(household, Household.E.PlayGroup({ rooms: fanOut, trackId: "t1" }))
  .checkpoint("stopped");

const group = Household.E.PlayGroup({ rooms: ["lounge"], trackId: "t1" });

const empty = Household.E.PlayGroup({ rooms: [], trackId: "t1" });

const absent = Household.E.PlayGroup({ rooms: ["lounge", "attic"], trackId: "t2" });

const unnameable = Household.E.PlayGroup({ rooms: [UNNAMEABLE], trackId: "t1" });

const next = Household.E.Next();

/**
 * What a listener can ask the household, for generated runs: play a group, an empty group, a group
 * with a room never opened or a name with no encoded form, and go on with the next room; the
 * speaker refuses a track.
 */
export const householdSamples = samplesOf({
  id: "household",
  story: homeStory("household/samples").ensure(room("lounge")),
  names: { setup: "musicHomeSetup", fixtures: ["SpeakerFake"] },
  actors: { household, lounge: room("lounge") },
  servers: { Speaker },
  failures: [Speaker.block({ trackId: "t1" })],
  landedFailures: [],
  values: { group, empty, absent, unnameable, next },
  controls: [],
  steps: (story) =>
    story
      .send(household, group)
      .send(household, empty)
      .send(household, absent)
      .send(household, unnameable)
      .send(household, next),
});
