import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { GitLive } from "../sync/adapters/git.ts";
import { CancelMachine, LatestMachine, SerializeMachine } from "./machines/clients.ts";
import { PagedMachine } from "./machines/paged.ts";

/**
 * The lanes app: one sync client per write-lane policy.
 */
export const lanesApp = app({
  id: "lanes",
  machines: { latest: LatestMachine, serialize: SerializeMachine, cancel: CancelMachine },
});

/**
 * The lanes app's real setup: the Git host over HTTP, persisted, each capture written at once.
 */
export const lanesSetup = runtimeSetup({
  app: lanesApp,
  services: GitLive("https://git.example"),
  scope: "lanes",
  persistence: { captureMs: 0 },
});

/**
 * The `latest` client the stories use.
 */
export const latestClient = actorRef(LatestMachine, "latest-1");

/**
 * The `serialize` client the stories use.
 */
export const serializeClient = actorRef(SerializeMachine, "serialize-1");

/**
 * The `cancel` client the stories use.
 */
export const cancelClient = actorRef(CancelMachine, "cancel-1");

/**
 * The lanes app grown with a paged history client, whose lane keys hold numbers.
 */
export const lanesGrown = app({
  id: "lanes",
  machines: {
    latest: LatestMachine,
    serialize: SerializeMachine,
    cancel: CancelMachine,
    paged: PagedMachine,
  },
});

/**
 * The grown lanes app's real setup: the Git host over HTTP, persisted, each capture written at
 * once.
 */
export const lanesGrownSetup = runtimeSetup({
  app: lanesGrown,
  services: GitLive("https://git.example"),
  scope: "lanes",
  persistence: { captureMs: 0 },
});

/**
 * A second `serialize` client, an identity of its own over the same repositories.
 */
export const secondSerialize = actorRef(SerializeMachine, "serialize-2");

/**
 * The paged history client.
 */
export const pagedClient = actorRef(PagedMachine, "paged-1");
