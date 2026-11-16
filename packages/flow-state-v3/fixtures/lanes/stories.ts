import { samplesOf, Story } from "../../src/host/testing/index.ts";
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

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual };
