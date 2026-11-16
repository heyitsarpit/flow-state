import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { GitLive } from "../sync/git-http.ts";
import { CancelMachine, LatestMachine, SerializeMachine } from "./machine.ts";
import { PagedMachine } from "./machines/paged.ts";

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
