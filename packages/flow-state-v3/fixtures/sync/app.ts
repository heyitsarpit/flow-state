import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { GitLive } from "./git-http.ts";
import { client, SyncMachine } from "./machine.ts";
import { RepoMachine } from "./machines/repo.ts";

/**
 * The `docs` repository, read through the main client.
 */
export const docsRepo = actorRef(RepoMachine, { repo: "docs" });

/**
 * A repository with an empty name.
 */
export const emptyRepo = actorRef(RepoMachine, { repo: "" });

/**
 * The `n`th of many sync clients.
 */
export const clientOf = (n: number) => actorRef(SyncMachine, `client-${String(n)}`);

/**
 * The `n`th of many repositories, each read through its own client.
 */
export const repoOf = (n: number) =>
  actorRef(
    RepoMachine,
    { repo: `repo-${String(n)}` },
    { context: { head: clientOf(n), cooling: clientOf(n) } },
  );

/**
 * The Git app grown with open repositories around the sync client.
 */
export const gitGrown = app({
  id: "git",
  machines: {
    sync: SyncMachine,
    repo: { machine: RepoMachine, context: { head: client, cooling: client } },
  },
});

/**
 * The grown Git app's real setup: the Git host over HTTP, with no persistence.
 */
export const gitGrownSetup = runtimeSetup({
  app: gitGrown,
  services: GitLive("https://git.example"),
});
