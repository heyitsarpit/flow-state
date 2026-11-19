import { samplesOf } from "../../../src/host/testing/index.ts";
import { docsRepo, client } from "../app.ts";
import { Repo } from "../machines/repo.ts";
import { Sync } from "../machines/sync.ts";
import { Git } from "../../services/git/server/git.ts";
import { repoStory } from "./usual.ts";

/**
 * What a developer and the Git host can do around an open repository, for generated runs: set the
 * token, peek and sync it; the host rate-limits (0 ms and an hour among the delays) or has an
 * outage.
 */
export const samples = samplesOf({
  id: "git-repos",
  story: repoStory("git-repos/samples"),
  names: { setup: "gitGrownSetup", fixtures: ["GitFake"] },
  actors: { client, docsRepo },
  servers: { Git },
  failures: [
    Git.rateLimit({ retryAfterMs: 2000 }),
    Git.rateLimit({ retryAfterMs: 0 }),
    Git.rateLimit({ retryAfterMs: 3_600_000 }),
    Git.outage({}),
  ],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(docsRepo, Repo.E.SetToken({ token: "tok-docs" }))
      .send(client, Sync.E.Peek({ repo: "docs" }))
      .send(client, Sync.E.SyncRepo({ repo: "docs" }))
      .send(client, Sync.E.Pushed({ repo: "docs" })),
});
