import { client } from "../app.ts";
import { Git } from "../server/git.ts";
import { repoStory } from "./usual.ts";

const syncDocs = { _tag: "SyncRepo", repo: "docs" } as const;

/**
 * The host asks to retry after 0 ms, then 2^31 - 1 ms, then 2^31 ms: the retry-after at the edges
 * of a computed schedule's range.
 */
export const retryEdges = repoStory("sync/retry-edges")
  .ensure(client)
  .world(Git.rateLimit({ retryAfterMs: 0 }))
  .send(client, syncDocs)
  .advance("1 millis")
  .checkpoint("zero")
  .world(Git.rateLimit({ retryAfterMs: 2 ** 31 - 1 }))
  .send(client, syncDocs)
  .checkpoint("longest")
  .dispose(client)
  .ensure(client)
  .world(Git.rateLimit({ retryAfterMs: 2 ** 31 }))
  .send(client, syncDocs)
  .checkpoint("past");
