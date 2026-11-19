import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { client, docsRepo, emptyRepo, gitGrownSetup, gitSetup } from "../app.ts";
import { Repo } from "../machines/repo.ts";
import { Sync } from "../machines/sync.ts";
import { Git } from "../../services/git/server/git.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import {
  GitFake,
  GitFakeCancelsAbandoned,
  GitFakeCleanupThrows,
  GitFakeConnectionCloseFails,
} from "../../services/git/server/layer.ts";

/**
 * The grown Git app over its port fake, with no steps yet: every Story of the repositories starts
 * here.
 */
export const repoStory = (id: string) => Story.app(gitGrownSetup, { id, fixtures: [GitFake] });

/**
 * A repository is opened with a token; its client peeks the remote head, then is rate limited for
 * 9 seconds and cools down.
 */
export const openRepo = repoStory("sync/open-repo")
  .ensure(client)
  .ensure(docsRepo)
  .send(docsRepo, Repo.E.SetToken({ token: "tok-docs" }))
  .checkpoint("opened")
  .send(client, Sync.E.Peek({ repo: "docs" }))
  .checkpoint("synced")
  .world(Git.rateLimit({ retryAfterMs: 9000 }))
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .checkpoint("cooling")
  .advance("9 seconds")
  .checkpoint("cooled");

/**
 * A repository with an empty name is opened and its client peeks it.
 */
export const emptyName = repoStory("sync/empty-name")
  .ensure(client)
  .ensure(emptyRepo)
  .send(client, Sync.E.Peek({ repo: "" }))
  .checkpoint("opened");

/**
 * The sync app over its port fake, with no steps yet: every sync Story starts here.
 */
export const gitStory = (id: string) => Story.app(gitSetup, { id, fixtures: [GitFake] });

/**
 * A client syncs a repository and its user goes to close the tab before the Git host has taken the
 * sync, so the page warns that changes are still syncing; once the host answers nothing is left to
 * warn about.
 */
export const leaveWhileSyncing = gitStory("sync/leave-while-syncing")
  .ensure(client)
  .world(Git.sync.hold())
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .checkpoint("syncing")
  .world(Git.sync.release())
  .checkpoint("synced");

/**
 * A client syncs a repository and its user signs out, so the app disposes its Runtime, over a Git
 * client whose connection to the host fails to close when the services are released.
 */
export const connectionCloseFails = Story.app(gitSetup, {
  id: "sync/connection-close-fails",
  fixtures: [GitFakeConnectionCloseFails],
})
  .ensure(client)
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .checkpoint("synced")
  .disposeRuntime()
  .checkpoint("signed out");

/**
 * A client's sync hangs at the Git host and its user signs out, over a Git client whose cleanup of
 * an abandoned sync throws: the sync ends unknown at the disposal's bound, and its cleanup fails.
 */
export const interruptCleanupFails = Story.app(gitSetup, {
  id: "sync/interrupt-cleanup-fails",
  fixtures: [GitFakeCleanupThrows],
})
  .ensure(client)
  .world(Git.sync.hold())
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .disposeRuntime()
  .advance(RuntimeDefaults.disposalBound)
  .checkpoint("signed out");

/**
 * A client's sync hangs at the Git host and its user signs out, over a Git client that, when a
 * sync is abandoned, reads the remote head and then cancels the push over its connection; the head
 * read is slow, so the cancel goes out only after the disposal's bound has passed.
 */
export const signOutWhileSyncing = Story.app(gitSetup, {
  id: "sync/sign-out-while-syncing",
  fixtures: [GitFakeCancelsAbandoned],
})
  .ensure(client)
  .world(Git.sync.hold())
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .world(Git.remoteHead.hold())
  .disposeRuntime()
  .advance(RuntimeDefaults.disposalBound)
  .checkpoint("bound passed")
  .world(Git.remoteHead.release())
  .checkpoint("signed out");

/**
 * A client peeks and syncs, meets a broken head read and a rate limit it cools down from, is
 * closed and opened again, and a second sync of a repository already on the wire is turned away.
 */
export const usual = gitStory("sync/usual")
  .ensure(client)
  .advance("700 millis")
  .send(client, Sync.E.Peek({ repo: "flow" }))
  .advance("500 millis")
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .advance("500 millis")
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .world(Git.outage({}))
  .send(client, Sync.E.Peek({ repo: "docs" }))
  .checkpoint("peeked")
  .world(Git.rateLimit({ retryAfterMs: 9000 }))
  .send(client, Sync.E.SyncRepo({ repo: "site" }))
  .checkpoint("cooling")
  .send(client, Sync.E.SyncRepo({ repo: "flow" }))
  .advance("9 seconds")
  .checkpoint("cooled")
  .send(client, Sync.E.SyncRepo({ repo: "flow" }))
  .send(client, Sync.E.SyncRepo({ repo: "effect" }))
  .dispose(client)
  .ensure(client)
  .world(Git.sync.hold())
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .send(client, Sync.E.SyncRepo({ repo: "docs" }))
  .checkpoint("on the wire")
  .world(Git.sync.release())
  .advance("700 millis")
  .send(client, Sync.E.Peek({ repo: "docs" }))
  .checkpoint("end");

type GitStory = ReturnType<typeof gitStory>;

const repos = ["flow", "effect", "docs", "site"] as const;

const round = (story: GitStory, n: number) => {
  const repo = repos[n % repos.length] ?? "flow";

  const next = story
    .send(client, Sync.E.SyncRepo({ repo }))
    .send(client, Sync.E.Pushed({ repo }))
    .send(client, Sync.E.Pushed({ repo: "site" }))
    .send(client, Sync.E.Peek({ repo }))
    .world(Git.sync.drop({ at: "response" }))
    .send(client, Sync.E.SyncRepo({ repo: `fork-${n}` }))
    .world(Git.rateLimit({ retryAfterMs: 2000 }))
    .send(client, Sync.E.SyncRepo({ repo: "effect" }))
    .send(client, Sync.E.SyncRepo({ repo: "flow" }))
    .advance("2 seconds")
    .advance("500 millis");

  return n % 3 === 2 ? next.dispose(client).ensure(client) : next;
};

/**
 * Nine rounds of syncs, pushes, peeks, lost answers and rate limits, with the client closed and
 * opened every third round: about a hundred steps, for the bench.
 */
export const long = Array.from({ length: 9 }, (_, n) => n)
  .reduce(round, gitStory("sync/long").ensure(client))
  .checkpoint("end");

const flow = Sync.E.SyncRepo({ repo: "flow" });
const docs = Sync.E.SyncRepo({ repo: "docs" });
const pushedFlow = Sync.E.Pushed({ repo: "flow" });
const pushedDocs = Sync.E.Pushed({ repo: "docs" });
const peekFlow = Sync.E.Peek({ repo: "flow" });
const peekDocs = Sync.E.Peek({ repo: "docs" });

/**
 * A stress run from seed 36, printed by the generator and pasted here (each sample event under a
 * name the samples give it). The reload sweep and the bench run it as any Story.
 */
export const seededStress = Story.app(gitSetup, { id: "sync/stress-36", fixtures: [GitFake] })
  .world(Git.rateLimit({ retryAfterMs: 2000 }))
  .world(Git.remoteHead.hold(), Git.remoteHead.cleanup("dies"))
  .ensure(client)
  .send(client, pushedFlow)
  .send(client, pushedFlow)
  .send(client, flow)
  .send(client, flow)
  .send(client, pushedDocs)
  .send(client, pushedFlow)
  .send(client, flow)
  .send(client, peekDocs)
  .reload({ reattach: false })
  .send(client, docs)
  .send(client, pushedFlow)
  .send(client, pushedDocs)
  .send(client, docs)
  .send(client, docs)
  .send(client, pushedDocs)
  .send(client, peekFlow)
  .send(client, peekFlow)
  .send(client, peekDocs)
  .send(client, pushedFlow)
  .world(Fake.network.offline())
  .send(client, docs)
  .dispose(client, { how: "forget" })
  .send(client, peekFlow)
  .send(client, docs)
  .advance("20 millis")
  .disposeRuntime()
  .reload()
  .advance("7 millis")
  .send(client, docs)
  .advance("20 millis")
  .send(client, pushedDocs)
  .advance("3 millis")
  .send(client, pushedDocs)
  .send(client, flow)
  .advance("16 millis")
  .send(client, peekFlow)
  .send(client, docs)
  .send(client, flow)
  .send(client, pushedFlow)
  .send(client, docs)
  .send(client, pushedFlow)
  .send(client, pushedFlow)
  .send(client, peekDocs)
  .send(client, pushedFlow)
  .advance("5 millis")
  .send(client, peekDocs)
  .advance("2 millis")
  .send(client, pushedDocs)
  .advance("17 millis")
  .send(client, peekFlow)
  .send(client, pushedFlow)
  .send(client, flow)
  .advance("18 millis")
  .send(client, docs)
  .send(client, docs)
  .send(client, pushedDocs)
  .send(client, peekDocs)
  .send(client, docs)
  .send(client, peekFlow)
  .reload({ reattach: false })
  .advance("4 millis")
  .send(client, flow)
  .advance("10 millis")
  .send(client, pushedFlow)
  .send(client, peekFlow)
  .send(client, peekDocs)
  .send(client, pushedDocs)
  .send(client, pushedFlow)
  .send(client, pushedDocs)
  .send(client, docs)
  .send(client, pushedFlow)
  .send(client, pushedFlow)
  .send(client, pushedDocs)
  .send(client, pushedFlow)
  .send(client, docs)
  .advance("20 millis")
  .send(client, flow)
  .send(client, pushedDocs)
  .send(client, peekFlow)
  .send(client, flow)
  .advance("15 millis")
  .send(client, flow)
  .send(client, peekDocs)
  .send(client, pushedFlow)
  .advance("8 millis")
  .send(client, docs)
  .send(client, pushedDocs)
  .advance("7 millis")
  .send(client, pushedDocs)
  .send(client, flow)
  .send(client, flow)
  .advance("15 millis")
  .send(client, peekDocs)
  .advance("15 millis")
  .send(client, pushedDocs)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Git.remoteHead.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a developer and the Git host can do, for generated runs: sync, push and peek at two repos;
 * the host rate-limits or has an outage.
 */
export const samples = samplesOf({
  id: "sync",
  story: gitStory("sync/samples"),
  names: { setup: "gitSetup", fixtures: ["GitFake"] },
  actors: { client },
  servers: { Git },
  failures: [Git.rateLimit({ retryAfterMs: 2000 }), Git.outage({})],
  landedFailures: [],
  values: { flow, docs, pushedFlow, pushedDocs, peekFlow, peekDocs },
  controls: [],
  steps: (story) =>
    story
      .send(client, flow)
      .send(client, docs)
      .send(client, pushedFlow)
      .send(client, pushedDocs)
      .send(client, peekFlow)
      .send(client, peekDocs),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, long, seededStress };
