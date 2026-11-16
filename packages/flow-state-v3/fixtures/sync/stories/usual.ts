import { Story } from "../../../src/host/testing/index.ts";
import { docsRepo, emptyRepo, gitGrownSetup } from "../app.ts";
import { client } from "../machine.ts";
import { Git, GitFake } from "../server.ts";

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
  .send(docsRepo, { _tag: "SetToken", token: "tok-docs" })
  .checkpoint("opened")
  .send(client, { _tag: "Peek", repo: "docs" })
  .checkpoint("synced")
  .world(Git.rateLimit({ retryAfterMs: 9000 }))
  .send(client, { _tag: "SyncRepo", repo: "docs" })
  .checkpoint("cooling")
  .advance("9 seconds")
  .checkpoint("cooled");

/**
 * A repository with an empty name is opened and its client peeks it.
 */
export const emptyName = repoStory("sync/empty-name")
  .ensure(client)
  .ensure(emptyRepo)
  .send(client, { _tag: "Peek", repo: "" })
  .checkpoint("opened");
