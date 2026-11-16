import { docsRepo } from "../app.ts";
import { client } from "../machine.ts";
import { Git } from "../server.ts";
import { repoStory } from "./usual.ts";

const backingOff = (id: string) =>
  repoStory(id)
    .ensure(client)
    .ensure(docsRepo)
    .world(Git.rateLimit({ retryAfterMs: 9000 }))
    .send(client, { _tag: "SyncRepo", repo: "docs" });

/**
 * The repository is disposed while its client backs off; the backoff ends.
 */
export const repoFirst = backingOff("sync/repo-first")
  .dispose(docsRepo)
  .checkpoint("disposed")
  .advance("9 seconds")
  .checkpoint("cooled");

/**
 * The tab reloads while the client backs off.
 */
export const reloadedInBackoff = backingOff("sync/reloaded-in-backoff")
  .reload()
  .checkpoint("reloaded");

/**
 * The client is disposed while the repository is bound to it.
 */
export const syncFirst = () => backingOff("sync/sync-first").dispose(client);
