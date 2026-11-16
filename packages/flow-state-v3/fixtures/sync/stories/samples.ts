import { samplesOf } from "../../../src/host/testing/index.ts";
import { docsRepo } from "../app.ts";
import { client } from "../machine.ts";
import { Git } from "../server.ts";
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
      .send(docsRepo, { _tag: "SetToken", token: "tok-docs" })
      .send(client, { _tag: "Peek", repo: "docs" })
      .send(client, { _tag: "SyncRepo", repo: "docs" })
      .send(client, { _tag: "Pushed", repo: "docs" }),
});
