import { machine } from "../../../src/index.ts";
import { docsRepo, client } from "../app.ts";
import { AutoPull } from "../machines/auto-pull.ts";
import { Sync } from "../machines/sync.ts";
import { Git } from "../../services/git/server/git.ts";
import { repoStory } from "./usual.ts";

const backingOffClient = (id: string) =>
  repoStory(id)
    .ensure(client)
    .world(Git.rateLimit({ retryAfterMs: 9000 }))
    .send(client, Sync.E.SyncRepo({ repo: "docs" }));

const backingOff = (id: string) =>
  repoStory(id)
    .ensure(client)
    .ensure(docsRepo)
    .world(Git.rateLimit({ retryAfterMs: 9000 }))
    .send(client, Sync.E.SyncRepo({ repo: "docs" }));

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

/**
 * A repository is opened while its client already backs off.
 */
export const repoOpenedInBackoff = backingOffClient("sync/repo-opened-in-backoff")
  .ensure(docsRepo)
  .checkpoint("opened");

/**
 * A head reaction written in the paused state's body, where no reaction is declared (S7): refused
 * when the machine is built, since only the root declares `onContext`. The types refuse the state
 * body's extra key too; construction refuses a body the types did not see.
 */
export const pausedPull = () =>
  machine(AutoPull, ({ S, E, C }) => ({
    default: S.WATCHING,
    on: { Throttled: {}, HeadMoved: {} },
    states: {
      WATCHING: { on: { Pause: S.PAUSED } },
      PAUSED: {
        // @ts-expect-error Types R2: a state body has no onContext
        onContext: [C.head.change({ event: E.HeadMoved.from((head) => ({ head })) })],
        on: { Resume: S.WATCHING },
      },
    },
  }));
