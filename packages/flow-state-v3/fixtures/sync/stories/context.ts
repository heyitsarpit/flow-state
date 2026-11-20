import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { autoPull, client, gitWatchedSetup } from "../app.ts";
import { AutoPull } from "../machines/auto-pull.ts";
import { Sync } from "../machines/sync.ts";
import { Git } from "../../services/git/server/git.ts";
import { GitFake } from "../../services/git/server/layer.ts";

/**
 * The Git app with the editor's auto-pull over its port fake, with no steps yet.
 */
export const pullStory = (id: string) => Story.app(gitWatchedSetup, { id, fixtures: [GitFake] });

const peek = Sync.E.Peek({ repo: "docs" });

const push = Sync.E.SyncRepo({ repo: "docs" });

const watching = (id: string) => pullStory(id).ensure(client).ensure(autoPull);

/**
 * The client reads the remote head and the editor pulls it; a sync moves the head and the next
 * read pulls again; a rate limit is shown once, and the cooldown's end shows nothing.
 */
export const pullWatching = watching("sync/auto-pull-watching")
  .send(client, peek)
  .checkpoint("peeked")
  .send(client, push)
  .send(client, peek)
  .checkpoint("pulled")
  .world(Git.rateLimit({ retryAfterMs: 9000 }))
  .send(client, push)
  .checkpoint("cooling")
  .advance("9 seconds")
  .checkpoint("cooled");

/**
 * The editor pulls the first head, then the user pauses it; the head moves twice while it is
 * paused, and the user resumes it; a later move is pulled as usual.
 */
export const pullPaused = watching("sync/auto-pull-paused")
  .send(client, peek)
  .send(autoPull, AutoPull.E.Pause())
  .send(client, push)
  .send(client, peek)
  .send(client, push)
  .send(client, peek)
  .checkpoint("paused")
  .send(autoPull, AutoPull.E.Resume())
  .checkpoint("resumed")
  .send(client, push)
  .send(client, peek)
  .checkpoint("after");

/**
 * The editor pulls the first head and is paused and resumed twice with no move between: the second
 * pause reads the same head again.
 */
export const pullUnchanged = watching("sync/auto-pull-unchanged")
  .send(client, peek)
  .send(autoPull, AutoPull.E.Pause())
  .send(autoPull, AutoPull.E.Resume())
  .send(autoPull, AutoPull.E.Pause())
  .send(client, peek)
  .send(autoPull, AutoPull.E.Resume())
  .checkpoint("resumed");

/**
 * The editor pulls the first head and the user pauses it for the first time: the head the paused
 * state's reaction first sees is already the pulled one, and a read of the same head while paused is
 * no move; the next move while paused shows one new commit.
 */
export const pullFirstPause = watching("sync/auto-pull-first-pause")
  .send(client, peek)
  .send(autoPull, AutoPull.E.Pause())
  .checkpoint("paused")
  .send(client, peek)
  .checkpoint("reread")
  .send(client, push)
  .send(client, peek)
  .checkpoint("moved");

/**
 * The editor pulls a head while watching, is paused and resumed, pulls a newer head while watching,
 * and is paused again: the second pause has no new commit to show, since the editor already pulled
 * the head that moved while the paused state was not active.
 */
export const pullRepaused = watching("sync/auto-pull-repaused")
  .send(client, peek)
  .send(autoPull, AutoPull.E.Pause())
  .send(autoPull, AutoPull.E.Resume())
  .send(client, push)
  .send(client, peek)
  .send(autoPull, AutoPull.E.Pause())
  .checkpoint("repaused");

/**
 * What the user and the Git host can do around the auto-pull, for generated runs: read and move
 * the head of a repository, of one with no name (E1) and of one with a 4,096-character name (E3),
 * pause and resume; the host rate limits a sync or breaks a head read.
 */
export const pullSamples = samplesOf({
  id: "sync-auto-pull",
  story: pullStory("sync/auto-pull-samples"),
  names: { setup: "gitWatchedSetup", fixtures: ["GitFake"] },
  actors: { client, autoPull },
  servers: { Git },
  failures: [Git.rateLimit({ retryAfterMs: 1000 }), Git.outage({})],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(client, peek)
      .send(client, push)
      .send(client, Sync.E.Peek({ repo: "" }))
      .send(client, Sync.E.Peek({ repo: "r".repeat(4096) }))
      .send(autoPull, AutoPull.E.Pause())
      .send(autoPull, AutoPull.E.Resume()),
});
