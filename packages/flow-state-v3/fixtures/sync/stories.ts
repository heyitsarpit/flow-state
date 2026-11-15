import { samplesOf, Story } from "../../src/host/testing/index.ts";
import { client, gitSetup } from "./machine.ts";
import { Git, GitFake } from "./server.ts";

/**
 * The sync app over its port fake, with no steps yet: every sync Story starts here.
 */
export const gitStory = (id: string) => Story.app(gitSetup, { id, fixtures: [GitFake] });

const syncRepo = (repo: string) => ({ _tag: "SyncRepo", repo }) as const;

/**
 * A client peeks and syncs, meets a broken head read and a rate limit it cools down from, is
 * closed and opened again, and a second sync of a repository already on the wire is turned away.
 */
export const usual = gitStory("sync/usual")
  .ensure(client)
  .advance("700 millis")
  .send(client, { _tag: "Peek", repo: "flow" })
  .advance("500 millis")
  .send(client, syncRepo("docs"))
  .advance("500 millis")
  .send(client, syncRepo("docs"))
  .world(Git.outage({}))
  .send(client, { _tag: "Peek", repo: "docs" })
  .checkpoint("peeked")
  .world(Git.rateLimit({ retryAfterMs: 9000 }))
  .send(client, syncRepo("site"))
  .checkpoint("cooling")
  .send(client, syncRepo("flow"))
  .advance("9 seconds")
  .checkpoint("cooled")
  .send(client, syncRepo("flow"))
  .send(client, syncRepo("effect"))
  .dispose(client)
  .ensure(client)
  .world(Git.sync.hold())
  .send(client, syncRepo("docs"))
  .send(client, syncRepo("docs"))
  .checkpoint("on the wire")
  .world(Git.sync.release())
  .advance("700 millis")
  .send(client, { _tag: "Peek", repo: "docs" })
  .checkpoint("end");

type GitStory = ReturnType<typeof gitStory>;

const repos = ["flow", "effect", "docs", "site"] as const;

const round = (story: GitStory, n: number) => {
  const repo = repos[n % repos.length] ?? "flow";

  const next = story
    .send(client, syncRepo(repo))
    .send(client, { _tag: "Pushed", repo })
    .send(client, { _tag: "Pushed", repo: "site" })
    .send(client, { _tag: "Peek", repo })
    .world(Git.sync.drop({ at: "response" }))
    .send(client, syncRepo(`fork-${n}`))
    .world(Git.rateLimit({ retryAfterMs: 2000 }))
    .send(client, syncRepo("effect"))
    .send(client, syncRepo("flow"))
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

const flow = { _tag: "SyncRepo", repo: "flow" } as const;
const docs = { _tag: "SyncRepo", repo: "docs" } as const;
const pushedFlow = { _tag: "Pushed", repo: "flow" } as const;
const pushedDocs = { _tag: "Pushed", repo: "docs" } as const;
const peekFlow = { _tag: "Peek", repo: "flow" } as const;
const peekDocs = { _tag: "Peek", repo: "docs" } as const;

/**
 * A stress run from seed 42, printed by the generator and pasted here (each sample event under a
 * name the samples give it). The reload sweep and the bench run it as any Story.
 */
export const seededStress = Story.app(gitSetup, { id: "sync/stress-42", fixtures: [GitFake] })
  .world(Git.outage({}))
  .ensure(client)
  .send(client, peekFlow)
  .world(Git.remoteHead.drop({ at: "response" }))
  .send(client, flow)
  .world(Git.sync.drop({ at: "response" }))
  .send(client, flow)
  .world(Git.sync.drop({ at: "response" }))
  .send(client, flow)
  .send(client, peekFlow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .advance("15 millis")
  .send(client, pushedDocs)
  .world(Git.sync.hold())
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, docs)
  .send(client, docs)
  .advance("12 millis")
  .advance("18 millis")
  .send(client, pushedFlow)
  .advance("12 millis")
  .send(client, pushedFlow)
  .advance("4 millis")
  .send(client, docs)
  .advance("19 millis")
  .send(client, peekFlow)
  .world(Git.remoteHead.hold())
  .advance("15 millis")
  .send(client, peekFlow)
  .advance("19 millis")
  .reload()
  .advance("5 millis")
  .send(client, flow)
  .advance("12 millis")
  .disposeRuntime()
  .reload({ reattach: false })
  .advance("14 millis")
  .send(client, docs)
  .advance("1 millis")
  .send(client, peekFlow)
  .send(client, pushedFlow)
  .advance("14 millis")
  .advance("10 millis")
  .advance("10 millis")
  .send(client, flow)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, pushedDocs)
  .send(client, peekFlow)
  .send(client, pushedFlow)
  .send(client, flow)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, peekDocs)
  .send(client, flow)
  .send(client, docs)
  .send(client, docs)
  .send(client, pushedDocs)
  .reload()
  .send(client, peekDocs)
  .send(client, peekDocs)
  .advance("7 millis")
  .send(client, docs)
  .send(client, docs)
  .send(client, docs)
  .send(client, flow)
  .send(client, peekFlow)
  .send(client, peekFlow)
  .send(client, flow)
  .send(client, peekDocs)
  .send(client, docs)
  .advance("19 millis")
  .advance("7 millis")
  .send(client, docs)
  .advance("20 millis")
  .advance("1 millis")
  .advance("4 millis")
  .send(client, pushedDocs)
  .send(client, peekDocs)
  .send(client, docs)
  .send(client, docs)
  .reload()
  .advance("5 millis")
  .advance("16 millis")
  .advance("16 millis")
  .send(client, docs)
  .send(client, docs)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .advance("16 millis")
  .advance("2 millis")
  .send(client, flow)
  .send(client, pushedDocs)
  .send(client, docs)
  .send(client, peekFlow)
  .send(client, peekFlow)
  .send(client, peekFlow)
  .send(client, peekFlow)
  .advance("5 millis")
  .send(client, pushedFlow)
  .advance("42946 millis")
  .advance("16 millis")
  .send(client, peekDocs)
  .send(client, docs)
  .send(client, flow)
  .advance("15 millis")
  .send(client, peekFlow)
  .advance("20 millis")
  .send(client, pushedDocs)
  .send(client, flow)
  .advance("3 millis")
  .send(client, peekFlow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, flow)
  .send(client, pushedDocs)
  .world(Git.remoteHead.release())
  .world(Git.sync.release())
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
