import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
import { Git, GitFake } from "../sync/server.ts";
import { cancelClient, lanesSetup, latestClient, serializeClient } from "./machine.ts";
import { GitFakeSteadfast, GitFakeUnanswered } from "./server.ts";

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
  .send(latestClient, { _tag: "Commit", ...flow })
  .send(latestClient, { _tag: "Commit", ...flow })
  .send(latestClient, { _tag: "Commit", ...flow })
  .send(serializeClient, { _tag: "Commit", ...flow })
  .send(serializeClient, { _tag: "Commit", ...flow })
  .send(cancelClient, { _tag: "Commit", ...flow })
  .send(cancelClient, { _tag: "Commit", ...flow })
  .checkpoint("waiting")
  .world(Git.sync.release())
  .advance("1 second")
  .checkpoint("settled")
  .world(Git.sync.drop())
  .send(serializeClient, { _tag: "Commit", ...flow })
  .send(serializeClient, { _tag: "Commit", ...flow })
  .checkpoint("held")
  .send(serializeClient, { _tag: "Cancel", ...flow })
  .advance("1 second")
  .checkpoint("released");

const events = (repo: string) =>
  (["Commit", "Twice", "RetryCommit", "CancelCommit", "Cancel", "Retry"] as const).map((tag) => ({
    _tag: tag,
    repo,
  }));

const clients = [latestClient, serializeClient, cancelClient];

/**
 * The repository name's edge value: 200,000 characters, so ten commits on its one lane come near
 * the 2,097,152 bytes a lane record may hold.
 */
export const longRepo = { repo: "r".repeat(200_000) };

const longCommit = { _tag: "Commit", ...longRepo } as const;

/**
 * Repository names at a string's 262,144-byte bound and one byte past it: a commit of the second
 * cannot be saved.
 */
const atStringBound = { _tag: "Commit", repo: "r".repeat(262_144) } as const;
const pastStringBound = { _tag: "Commit", repo: "r".repeat(262_145) } as const;

const longEvents = { atStringBound, pastStringBound, longCommit };

/**
 * What the three clients and the Git host can do, for generated runs: every member sequence on one
 * repository's lane under each policy, and commits of a 200,000-character repository and of ones at
 * and just past a string's byte bound; the host rate-limits.
 */
export const samples = samplesOf({
  id: "lanes",
  story: lanesStory("lanes/samples"),
  names: { setup: "lanesSetup", fixtures: ["GitFake"] },
  actors: { latestClient, serializeClient, cancelClient },
  servers: { Git },
  failures: [Git.rateLimit({ retryAfterMs: 2000 })],
  landedFailures: [],
  values: longEvents,
  controls: [],
  steps: (story) =>
    clients.reduce(
      (s, client) =>
        [...events("flow"), ...Object.values(longEvents)].reduce(
          (t, event) => t.send(client, event),
          s,
        ),
      story,
    ),
});

const commit = { _tag: "Commit", ...flow } as const;

/**
 * A stress run from seed 36, printed by the generator and pasted here. The saved-stress test checks
 * it is still what that seed prints.
 */
export const seededStress = Story.app(lanesSetup, { id: "lanes/stress-36", fixtures: [GitFake] })
  .world(Git.rateLimit({ retryAfterMs: 2000 }))
  .ensure(latestClient)
  .world(Fake.storage.hold())
  .ensure(serializeClient)
  .ensure(cancelClient)
  .send(serializeClient, { _tag: "RetryCommit", repo: "flow" })
  .send(latestClient, { _tag: "RetryCommit", repo: "flow" })
  .send(latestClient, atStringBound)
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .send(latestClient, { _tag: "CancelCommit", repo: "flow" })
  .send(latestClient, { _tag: "RetryCommit", repo: "flow" })
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .send(serializeClient, longCommit)
  .reload({ reattach: false })
  .send(cancelClient, { _tag: "Twice", repo: "flow" })
  .send(serializeClient, { _tag: "Retry", repo: "flow" })
  .send(cancelClient, { _tag: "CancelCommit", repo: "flow" })
  .send(latestClient, { _tag: "Twice", repo: "flow" })
  .world(Fake.storage.refuse())
  .send(latestClient, { _tag: "Twice", repo: "flow" })
  .send(latestClient, { _tag: "CancelCommit", repo: "flow" })
  .send(serializeClient, { _tag: "Cancel", repo: "flow" })
  .send(serializeClient, pastStringBound)
  .send(latestClient, { _tag: "RetryCommit", repo: "flow" })
  .world(Git.sync.drop())
  .send(latestClient, longCommit)
  .world(Fake.network.offline())
  .send(latestClient, { _tag: "Twice", repo: "flow" })
  .world(Fake.storage.refuse())
  .dispose(cancelClient, { how: "forget" })
  .send(latestClient, pastStringBound)
  .send(serializeClient, { _tag: "Twice", repo: "flow" })
  .advance("20 millis")
  .disposeRuntime()
  .world(Fake.storage.hold())
  .reload()
  .advance("7 millis")
  .send(serializeClient, { _tag: "Twice", repo: "flow" })
  .advance("20 millis")
  .send(latestClient, { _tag: "CancelCommit", repo: "flow" })
  .world(Fake.storage.refuse())
  .advance("3 millis")
  .send(cancelClient, { _tag: "CancelCommit", repo: "flow" })
  .send(serializeClient, atStringBound)
  .advance("16 millis")
  .send(serializeClient, { _tag: "Twice", repo: "flow" })
  .send(serializeClient, { _tag: "Twice", repo: "flow" })
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .send(serializeClient, { _tag: "RetryCommit", repo: "flow" })
  .send(latestClient, pastStringBound)
  .send(serializeClient, longCommit)
  .send(serializeClient, longCommit)
  .send(cancelClient, { _tag: "Retry", repo: "flow" })
  .send(cancelClient, longCommit)
  .advance("5 millis")
  .send(cancelClient, { _tag: "Retry", repo: "flow" })
  .advance("2 millis")
  .send(cancelClient, atStringBound)
  .advance("17 millis")
  .send(serializeClient, pastStringBound)
  .send(serializeClient, { _tag: "Retry", repo: "flow" })
  .send(serializeClient, { _tag: "Commit", repo: "flow" })
  .advance("18 millis")
  .send(latestClient, { _tag: "Cancel", repo: "flow" })
  .send(serializeClient, pastStringBound)
  .send(serializeClient, { _tag: "Commit", repo: "flow" })
  .send(cancelClient, { _tag: "RetryCommit", repo: "flow" })
  .send(cancelClient, { _tag: "Twice", repo: "flow" })
  .send(cancelClient, { _tag: "Twice", repo: "flow" })
  .reload({ reattach: false })
  .advance("4 millis")
  .send(serializeClient, { _tag: "Commit", repo: "flow" })
  .advance("10 millis")
  .send(serializeClient, { _tag: "RetryCommit", repo: "flow" })
  .send(cancelClient, { _tag: "Cancel", repo: "flow" })
  .send(serializeClient, longCommit)
  .send(cancelClient, atStringBound)
  .send(latestClient, { _tag: "Retry", repo: "flow" })
  .world(Fake.storage.refuse())
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .world(Fake.storage.refuse())
  .send(latestClient, { _tag: "Cancel", repo: "flow" })
  .send(serializeClient, { _tag: "RetryCommit", repo: "flow" })
  .send(latestClient, { _tag: "Retry", repo: "flow" })
  .send(cancelClient, atStringBound)
  .send(serializeClient, { _tag: "RetryCommit", repo: "flow" })
  .send(cancelClient, { _tag: "Twice", repo: "flow" })
  .advance("20 millis")
  .send(cancelClient, { _tag: "CancelCommit", repo: "flow" })
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .world(Fake.storage.hold())
  .send(serializeClient, { _tag: "Cancel", repo: "flow" })
  .send(serializeClient, { _tag: "Commit", repo: "flow" })
  .advance("15 millis")
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .world(Fake.storage.refuse())
  .send(latestClient, longCommit)
  .send(serializeClient, longCommit)
  .advance("8 millis")
  .send(serializeClient, pastStringBound)
  .send(latestClient, { _tag: "Commit", repo: "flow" })
  .advance("7 millis")
  .send(serializeClient, { _tag: "CancelCommit", repo: "flow" })
  .send(cancelClient, { _tag: "Commit", repo: "flow" })
  .send(serializeClient, { _tag: "CancelCommit", repo: "flow" })
  .advance("15 millis")
  .send(latestClient, { _tag: "Retry", repo: "flow" })
  .advance("15 millis")
  .send(latestClient, { _tag: "CancelCommit", repo: "flow" })
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Fake.storage.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * A lane driven to its record's byte bound: twelve long commits on one serialize lane, the last
 * ones declined NotSent Unencodable; then its head's answer is lost (Held), retried and let go, and
 * a cancel-policy lane of long commits displaces its head. Every commit ends, and no identity is
 * held back. It is a stress Story: its records weigh 2 MB each.
 */
export const nearBound = Array.from({ length: 12 })
  .reduce<Story>(
    (s) => s.send(serializeClient, longCommit),
    lanesStory("lanes/stress-near-bound")
      .ensure(serializeClient)
      .ensure(cancelClient)
      .world(Git.sync.hold()),
  )
  .checkpoint("full")
  .world(Git.sync.lose())
  .send(serializeClient, { _tag: "Retry", ...longRepo })
  .advance("1 second")
  .send(serializeClient, { _tag: "Cancel", ...longRepo })
  .advance("1 second")
  .world(Git.sync.hold())
  .send(cancelClient, longCommit)
  .send(cancelClient, { _tag: "CancelCommit", ...longRepo })
  .world(Git.sync.release())
  .advance("1 second")
  .checkpoint("settled");

const unanswered = (id: string) =>
  Story.app(lanesSetup, { id, fixtures: [GitFakeUnanswered] }).ensure(cancelClient);

/**
 * A cancel-policy lane whose host never answers: 4,200 events that each cancel the head and commit
 * again, the cancelled head's call staying out, so the lane record's displaced Attempts pass the
 * 4,096 items an array may hold; then the tab reloads and every commit ends once. A stress Story,
 * built on call and kept out of `stories`: a reload at each of its steps is too long for the sweep.
 */
export const displacedPastItems = () =>
  Array.from({ length: 4200 })
    .reduce<Story>(
      (s) => s.send(cancelClient, { _tag: "CancelCommit", ...flow }),
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
