import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { Git } from "../../services/git/server/git.ts";
import { GitFake } from "../../services/git/server/layer.ts";
import { cancelClient, lanesSetup, latestClient, serializeClient } from "../app.ts";
import { Cancel, Latest, Serialize } from "../machines/clients.ts";
import { GitFakeSteadfast, GitFakeUnanswered } from "../server/layer.ts";

/**
 * The lanes app over the Git port fake, with no steps yet: every lanes Story starts here.
 */
export const lanesStory = (id: string) => Story.app(lanesSetup, { id, fixtures: [GitFake] });

const flow = { repo: "flow" };

/**
 * Each client syncs while a sync is on the wire: `latest` keeps the newest waiting sync, `serialize`
 * sends both in order, and `cancel` interrupts the first; then a lost answer holds each lane and a
 * cancel lets it go.
 */
export const usual = lanesStory("lanes/usual")
  .ensure(latestClient)
  .ensure(serializeClient)
  .ensure(cancelClient)
  .world(Git.sync.hold())
  .send(latestClient, Latest.E.Commit(flow))
  .send(latestClient, Latest.E.Commit(flow))
  .send(latestClient, Latest.E.Commit(flow))
  .send(serializeClient, Serialize.E.Commit(flow))
  .send(serializeClient, Serialize.E.Commit(flow))
  .send(cancelClient, Cancel.E.Commit(flow))
  .send(cancelClient, Cancel.E.Commit(flow))
  .checkpoint("waiting")
  .world(Git.sync.release())
  .advance("1 second")
  .checkpoint("settled")
  .world(Git.sync.drop())
  .send(serializeClient, Serialize.E.Commit(flow))
  .send(serializeClient, Serialize.E.Commit(flow))
  .checkpoint("held")
  .send(serializeClient, Serialize.E.Cancel(flow))
  .advance("1 second")
  .checkpoint("released");

const tags = ["Commit", "Twice", "RetryCommit", "CancelCommit", "Cancel", "Retry"] as const;

const clients = [
  { ref: latestClient, E: Latest.E },
  { ref: serializeClient, E: Serialize.E },
  { ref: cancelClient, E: Cancel.E },
];

/**
 * The repository name's edge value: a million characters, so a lane record holds megabytes; the
 * bench times it.
 */
export const longRepo = { repo: "r".repeat(1_000_000) };

const latestLong = Latest.E.Commit(longRepo);
const serializeLong = Serialize.E.Commit(longRepo);
const cancelLong = Cancel.E.Commit(longRepo);

const lanesSamples = (
  values: Readonly<Record<string, { readonly _tag: "Commit"; readonly repo: string }>>,
) =>
  samplesOf({
    id: "lanes",
    story: lanesStory("lanes/samples"),
    names: { setup: "lanesSetup", fixtures: ["GitFake"] },
    actors: { latestClient, serializeClient, cancelClient },
    servers: { Git },
    failures: [Git.rateLimit({ retryAfterMs: 2000 })],
    landedFailures: [],
    values,
    controls: [],
    steps: (story) =>
      clients.reduce(
        (s, { ref, E }) =>
          [...tags.map((tag) => E[tag](flow)), ...Object.values(values)].reduce(
            (t, event) => t.send(ref, event),
            s,
          ),
        story,
      ),
  });

/**
 * What the three clients and the Git host can do, for generated runs: every member sequence on one
 * repository's lane under each policy; the host rate-limits.
 */
export const samples = lanesSamples({});

/**
 * The samples with the repository names' edge values, for the stress runs: commits of a
 * million-character repository.
 */
export const stressSamples = lanesSamples({ longCommit: latestLong });

const commit = Cancel.E.Commit(flow);

/**
 * A stress run from seed 36, printed by the generator and pasted here. The saved-stress test checks
 * it is still what that seed prints.
 */
export const seededStress = lanesStory("lanes/stress-36")
  .world(Git.rateLimit({ retryAfterMs: 2000 }))
  .ensure(latestClient)
  .world(Fake.storage.hold())
  .ensure(serializeClient)
  .ensure(cancelClient)
  .send(cancelClient, Cancel.E.CancelCommit(flow))
  .send(cancelClient, Cancel.E.CancelCommit(flow))
  .send(latestClient, Latest.E.Commit(flow))
  .send(latestClient, Latest.E.Commit(flow))
  .send(serializeClient, Serialize.E.RetryCommit(flow))
  .send(cancelClient, Cancel.E.CancelCommit(flow))
  .send(serializeClient, Serialize.E.Retry(flow))
  .send(latestClient, Latest.E.RetryCommit(flow))
  .reload({ reattach: false })
  .send(serializeClient, serializeLong)
  .send(serializeClient, Serialize.E.Cancel(flow))
  .send(cancelClient, Cancel.E.Cancel(flow))
  .send(cancelClient, Cancel.E.Retry(flow))
  .send(serializeClient, Serialize.E.Commit(flow))
  .send(serializeClient, Serialize.E.Retry(flow))
  .send(latestClient, Latest.E.Twice(flow))
  .world(Fake.storage.hold())
  .send(serializeClient, Serialize.E.CancelCommit(flow))
  .send(serializeClient, Serialize.E.Cancel(flow))
  .send(serializeClient, Serialize.E.Cancel(flow))
  .world(Fake.network.offline())
  .send(cancelClient, Cancel.E.Retry(flow))
  .dispose(cancelClient, { how: "forget" })
  .send(latestClient, Latest.E.Twice(flow))
  .send(latestClient, Latest.E.Twice(flow))
  .advance("20 millis")
  .disposeRuntime()
  .reload({ heldWrites: "land" })
  .advance("7 millis")
  .send(serializeClient, Serialize.E.Commit(flow))
  .advance("20 millis")
  .send(serializeClient, Serialize.E.Retry(flow))
  .advance("3 millis")
  .send(latestClient, Latest.E.CancelCommit(flow))
  .world(Fake.storage.refuse())
  .send(cancelClient, Cancel.E.Twice(flow))
  .advance("16 millis")
  .send(cancelClient, Cancel.E.RetryCommit(flow))
  .send(serializeClient, Serialize.E.CancelCommit(flow))
  .send(cancelClient, Cancel.E.Cancel(flow))
  .send(cancelClient, cancelLong)
  .send(serializeClient, Serialize.E.Commit(flow))
  .send(cancelClient, Cancel.E.Commit(flow))
  .send(cancelClient, Cancel.E.Commit(flow))
  .send(serializeClient, Serialize.E.Twice(flow))
  .send(serializeClient, Serialize.E.Twice(flow))
  .advance("5 millis")
  .send(serializeClient, Serialize.E.Twice(flow))
  .advance("2 millis")
  .send(latestClient, latestLong)
  .advance("17 millis")
  .send(latestClient, Latest.E.Twice(flow))
  .send(latestClient, Latest.E.Retry(flow))
  .send(latestClient, Latest.E.CancelCommit(flow))
  .advance("18 millis")
  .send(cancelClient, Cancel.E.RetryCommit(flow))
  .send(latestClient, Latest.E.Twice(flow))
  .send(latestClient, Latest.E.Commit(flow))
  .world(Fake.storage.refuse())
  .send(latestClient, Latest.E.Retry(flow))
  .send(serializeClient, serializeLong)
  .send(serializeClient, serializeLong)
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .advance("4 millis")
  .send(cancelClient, Cancel.E.Twice(flow))
  .advance("10 millis")
  .send(cancelClient, Cancel.E.CancelCommit(flow))
  .send(serializeClient, Serialize.E.Commit(flow))
  .send(cancelClient, Cancel.E.CancelCommit(flow))
  .send(latestClient, latestLong)
  .send(serializeClient, Serialize.E.Cancel(flow))
  .send(latestClient, latestLong)
  .send(cancelClient, Cancel.E.RetryCommit(flow))
  .send(serializeClient, Serialize.E.Cancel(flow))
  .send(latestClient, Latest.E.Retry(flow))
  .send(serializeClient, Serialize.E.RetryCommit(flow))
  .send(serializeClient, Serialize.E.Cancel(flow))
  .send(latestClient, Latest.E.Cancel(flow))
  .advance("20 millis")
  .send(serializeClient, Serialize.E.RetryCommit(flow))
  .send(latestClient, Latest.E.Commit(flow))
  .send(serializeClient, Serialize.E.CancelCommit(flow))
  .send(latestClient, latestLong)
  .advance("15 millis")
  .send(latestClient, Latest.E.Commit(flow))
  .send(serializeClient, Serialize.E.Twice(flow))
  .send(latestClient, Latest.E.Retry(flow))
  .advance("8 millis")
  .send(latestClient, Latest.E.Cancel(flow))
  .send(serializeClient, Serialize.E.Retry(flow))
  .advance("7 millis")
  .send(cancelClient, Cancel.E.Cancel(flow))
  .send(serializeClient, Serialize.E.Retry(flow))
  .send(latestClient, Latest.E.CancelCommit(flow))
  .advance("15 millis")
  .send(cancelClient, cancelLong)
  .advance("15 millis")
  .send(serializeClient, Serialize.E.Retry(flow))
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * A lane of twelve long commits on one serialize lane, 2.4 MB queued; then its head's answer is
 * lost (Held), retried and let go, and a cancel-policy lane of long commits displaces its head.
 * Every commit ends, and no identity is held back. It is a stress Story: its records weigh 2.4 MB.
 */
export const nearBound = Array.from({ length: 12 })
  .reduce<Story>(
    (s) => s.send(serializeClient, serializeLong),
    lanesStory("lanes/stress-near-bound")
      .ensure(serializeClient)
      .ensure(cancelClient)
      .world(Git.sync.hold()),
  )
  .checkpoint("full")
  .world(Git.sync.lose())
  .send(serializeClient, Serialize.E.Retry(longRepo))
  .advance("1 second")
  .send(serializeClient, Serialize.E.Cancel(longRepo))
  .advance("1 second")
  .world(Git.sync.hold())
  .send(cancelClient, cancelLong)
  .send(cancelClient, Cancel.E.CancelCommit(longRepo))
  .world(Git.sync.release())
  .advance("1 second")
  .checkpoint("settled");

const unanswered = (id: string) =>
  Story.app(lanesSetup, { id, fixtures: [GitFakeUnanswered] }).ensure(cancelClient);

/**
 * A cancel-policy lane whose host never answers: 4,200 events that each cancel the head and commit
 * again, the cancelled head's call staying out, so the lane record holds thousands of displaced
 * Attempts; then the tab reloads and every commit ends once. A stress Story,
 * built on call and kept out of `stories`: a reload at each of its steps is too long for the sweep.
 */
export const stressDisplacedPastItems = () =>
  Array.from({ length: 4200 })
    .reduce<Story>(
      (s) => s.send(cancelClient, Cancel.E.CancelCommit(flow)),
      unanswered("lanes/stress-displaced-past-items"),
    )
    .checkpoint("full")
    .reload()
    .advance("1 second")
    .checkpoint("after");

/**
 * Three commits on a cancel-policy lane over a network that will not interrupt a sync: each new
 * commit displaces the head before it, whose call stays out; the tab reloads with all three out.
 * Built on call and kept out of `stories` while a reload loses those Attempts: it joins them once
 * the reload keeps them.
 */
export const displacedOnWire = () =>
  Story.app(lanesSetup, { id: "lanes/displaced-on-wire", fixtures: [GitFakeSteadfast] })
    .ensure(cancelClient)
    .world(Git.sync.hold())
    .send(cancelClient, commit)
    .world(Git.sync.hold())
    .send(cancelClient, commit)
    .world(Git.sync.hold())
    .send(cancelClient, commit)
    .checkpoint("out")
    .reload()
    .advance("1 second")
    .checkpoint("reloaded");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, seededStress, nearBound };
