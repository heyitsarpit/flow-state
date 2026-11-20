import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { GitLive } from "../services/git/adapters/git.ts";
import { SyncMachine } from "./machines/sync.ts";
import { RepoMachine } from "./machines/repo.ts";
import { AutoPullMachine } from "./machines/auto-pull.ts";
import { MirrorMachine, MirrorStatusMachine, ReplicaMachine } from "./machines/mirror.ts";

/**
 * The sync app: one machine.
 */
export const gitApp = app({ id: "git", machines: { sync: SyncMachine } });

/**
 * The sync app's real setup: the Git host over HTTP, with no persistence.
 */
export const gitSetup = runtimeSetup({ app: gitApp, services: GitLive("https://git.example") });

/**
 * The client most stories use.
 */
export const client = actorRef(SyncMachine, "client");

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
 * The push mirror of remote `a`.
 */
export const mirrorA = actorRef(MirrorMachine, { remote: "a" });

/**
 * The push mirror of remote `b`.
 */
export const mirrorB = actorRef(MirrorMachine, { remote: "b" });

/**
 * The status line of mirror `a`.
 */
export const statusA = actorRef(MirrorStatusMachine, "status-a");

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

/**
 * The replica that follows mirror `a`.
 */
export const replicaA = actorRef(ReplicaMachine, "replica-a");

/**
 * A second replica of mirror `a`.
 */
export const replicaB = actorRef(ReplicaMachine, "replica-b");

/**
 * The push mirror of a named remote.
 */
export const mirrorOf = (remote: string) => actorRef(MirrorMachine, { remote });

/**
 * The Git app grown further with push mirrors, a mirror's status line and a replica of a mirror.
 */
export const gitMirrored = app({
  id: "git",
  machines: {
    sync: SyncMachine,
    repo: { machine: RepoMachine, context: { head: client, cooling: client } },
    mirror: MirrorMachine,
    status: { machine: MirrorStatusMachine, context: { seen: mirrorA } },
    replica: { machine: ReplicaMachine, context: { taken: mirrorA } },
  },
});

/**
 * The mirrored Git app's real setup: the Git host over HTTP, with no persistence.
 */
export const gitMirroredSetup = runtimeSetup({
  app: gitMirrored,
  services: GitLive("https://git.example"),
});

/**
 * The editor's auto-pull of the main client's head.
 */
export const autoPull = actorRef(AutoPullMachine, "editor");

/**
 * The mirrored Git app grown with the editor's auto-pull, which reads the main client.
 */
export const gitWatched = app({
  id: "git",
  machines: {
    ...gitMirrored.machines,
    autoPull: { machine: AutoPullMachine, context: { head: client, limited: client } },
  },
});

/**
 * The watched Git app's real setup: the Git host over HTTP.
 */
export const gitWatchedSetup = runtimeSetup({
  app: gitWatched,
  services: GitLive("https://git.example"),
});
