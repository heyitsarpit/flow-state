import { Story } from "../../src/host/testing/index.ts";
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

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, long };
