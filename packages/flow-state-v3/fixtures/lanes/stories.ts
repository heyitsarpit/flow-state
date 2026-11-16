import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
import { Git, GitFake } from "../sync/server.ts";
import { cancelClient, lanesSetup, latestClient, serializeClient } from "./machine.ts";

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
 * What the three clients and the Git host can do, for generated runs: every member sequence on one
 * repository's lane under each policy; the host rate-limits.
 */
export const samples = samplesOf({
  id: "lanes",
  story: lanesStory("lanes/samples"),
  names: { setup: "lanesSetup", fixtures: ["GitFake"] },
  actors: { latestClient, serializeClient, cancelClient },
  servers: { Git },
  failures: [Git.rateLimit({ retryAfterMs: 2000 })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    clients.reduce(
      (s, client) => events("flow").reduce((t, event) => t.send(client, event), s),
      story,
    ),
});

const commit = { _tag: "Commit", ...flow } as const;
const twice = { _tag: "Twice", ...flow } as const;
const retryCommit = { _tag: "RetryCommit", ...flow } as const;
const cancelCommit = { _tag: "CancelCommit", ...flow } as const;
const cancel = { _tag: "Cancel", ...flow } as const;
const retry = { _tag: "Retry", ...flow } as const;

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
  .send(latestClient, retryCommit)
  .send(latestClient, retryCommit)
  .send(serializeClient, commit)
  .send(latestClient, commit)
  .send(latestClient, cancelCommit)
  .send(latestClient, retryCommit)
  .send(latestClient, commit)
  .send(cancelClient, retry)
  .reload({ reattach: false })
  .send(latestClient, twice)
  .world(Git.sync.hold())
  .world(Fake.storage.refuse())
  .send(cancelClient, retryCommit)
  .send(latestClient, cancelCommit)
  .send(latestClient, twice)
  .send(latestClient, twice)
  .send(latestClient, cancelCommit)
  .send(latestClient, cancel)
  .world(Fake.storage.refuse())
  .world(Git.sync.release())
  .send(cancelClient, cancel)
  .send(serializeClient, retry)
  .send(serializeClient, retryCommit)
  .world(Fake.network.offline())
  .send(latestClient, twice)
  .dispose(cancelClient, { how: "forget" })
  .send(cancelClient, cancel)
  .send(latestClient, twice)
  .advance("20 millis")
  .disposeRuntime()
  .world(Fake.storage.hold())
  .reload()
  .advance("7 millis")
  .send(latestClient, twice)
  .advance("20 millis")
  .send(latestClient, cancelCommit)
  .advance("3 millis")
  .send(latestClient, cancelCommit)
  .send(serializeClient, commit)
  .advance("16 millis")
  .send(serializeClient, cancel)
  .send(latestClient, twice)
  .send(latestClient, commit)
  .send(latestClient, retryCommit)
  .send(serializeClient, twice)
  .send(serializeClient, retryCommit)
  .send(serializeClient, retryCommit)
  .send(latestClient, retry)
  .send(serializeClient, retryCommit)
  .advance("5 millis")
  .send(latestClient, retry)
  .advance("2 millis")
  .send(cancelClient, cancelCommit)
  .advance("17 millis")
  .send(cancelClient, cancel)
  .send(cancelClient, retryCommit)
  .send(latestClient, commit)
  .advance("18 millis")
  .send(cancelClient, twice)
  .send(serializeClient, twice)
  .send(serializeClient, cancelCommit)
  .send(serializeClient, retry)
  .send(latestClient, twice)
  .send(serializeClient, cancel)
  .reload({ reattach: false })
  .advance("4 millis")
  .send(latestClient, commit)
  .world(Fake.storage.refuse())
  .advance("10 millis")
  .send(latestClient, retryCommit)
  .send(latestClient, cancel)
  .send(cancelClient, retry)
  .send(cancelClient, cancelCommit)
  .send(cancelClient, retryCommit)
  .send(serializeClient, cancelCommit)
  .send(cancelClient, twice)
  .send(latestClient, retryCommit)
  .send(cancelClient, retryCommit)
  .send(cancelClient, cancelCommit)
  .send(latestClient, retryCommit)
  .world(Fake.storage.refuse())
  .send(latestClient, twice)
  .advance("20 millis")
  .send(cancelClient, commit)
  .send(serializeClient, cancelCommit)
  .send(latestClient, cancel)
  .send(latestClient, commit)
  .advance("15 millis")
  .send(latestClient, commit)
  .send(cancelClient, retry)
  .send(serializeClient, retryCommit)
  .advance("8 millis")
  .send(serializeClient, twice)
  .send(serializeClient, cancelCommit)
  .advance("7 millis")
  .send(latestClient, cancelCommit)
  .send(latestClient, commit)
  .send(cancelClient, commit)
  .advance("15 millis")
  .send(latestClient, retry)
  .advance("15 millis")
  .send(latestClient, cancelCommit)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, seededStress };
