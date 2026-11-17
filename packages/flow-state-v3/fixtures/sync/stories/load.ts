import { clientOf, repoOf } from "../app.ts";
import { Git } from "../../services/git/server/git.ts";
import { repoStory } from "./usual.ts";

const REPOS = 64;

/**
 * 64 repositories, each on its own client; each syncs, every other one's sync is rate limited and
 * every fourth one's answer is lost; a second later the clients still cooling are those limited.
 */
export const manyRepos = Array.from({ length: REPOS }, (_, n) => n)
  .reduce((story, n) => {
    const opened = story.ensure(clientOf(n)).ensure(repoOf(n));
    const limited = n % 2 === 0 ? opened.world(Git.rateLimit({ retryAfterMs: 60_000 })) : opened;
    const lossy = n % 4 === 3 ? limited.world(Git.sync.drop({ at: "response" })) : limited;

    return lossy.send(clientOf(n), { _tag: "SyncRepo", repo: `repo-${String(n)}` });
  }, repoStory("sync/stress-many-repos"))
  .advance("1 second")
  .checkpoint("end");
