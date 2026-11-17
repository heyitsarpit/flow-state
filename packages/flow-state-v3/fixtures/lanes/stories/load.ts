import { actorRef } from "../../../src/index.ts";
import { Git } from "../../sync/server/git.ts";
import { SerializeMachine } from "../machines/clients.ts";
import { serializeClient } from "../app.ts";
import { lanesStory } from "./usual.ts";

const commit = { _tag: "Commit", repo: "flow" } as const;

// A head on the wire and the 64 commits `serialize` queues behind it.
const AT_CAP = 65;

/**
 * Under `serialize`, a head on the wire and 64 commits queued behind it; one more commit; then the
 * head's answer comes and the queue drains.
 */
export const serializeAtCap = Array.from({ length: AT_CAP }, (_, n) => n)
  .reduce(
    (story) => story.send(serializeClient, commit),
    lanesStory("lanes/serialize-at-cap").ensure(serializeClient).world(Git.sync.hold()),
  )
  .checkpoint("full")
  .send(serializeClient, commit)
  .checkpoint("past")
  .world(Git.sync.release())
  .checkpoint("drained");

// The 64 commits `serialize` queues behind a head on the wire.
const QUEUE_CAP = 64;

// `clients` serialize clients each put a sync on the wire, and the first queues `queued` more
// behind its own; the tab reloads, so the boot ends that queue and the first client hears every
// ending in one step; then the held syncs are answered.
const crowd = (id: string, clients: number, queued: number) => {
  const refs = Array.from({ length: clients }, (_, n) => actorRef(SerializeMachine, `crowd-${n}`));
  const [first] = refs;

  const on = refs.reduce(
    (story, ref) => story.ensure(ref).send(ref, commit),
    lanesStory(id).world(Git.sync.hold()),
  );

  const deep = Array.from({ length: first === undefined ? 0 : queued }, (_, n) => n).reduce(
    (story) => (first === undefined ? story : story.send(first, commit)),
    on.checkpoint("on the wire"),
  );

  return deep
    .checkpoint("queued")
    .reload()
    .checkpoint("reloaded")
    .world(Git.sync.release())
    .advance("1 second")
    .checkpoint("answered");
};

/**
 * Four clients with a sync on the wire, the first with 16 more queued, across a reload.
 */
export const crowd4 = crowd("lanes/crowd-4", 4, 16);

/**
 * The same at 256 clients and a full queue: the bench's world-size Story, built on call and kept
 * out of `stories`, since each run is over 300 steps.
 */
export const stressCrowd256 = () => crowd("lanes/stress-crowd-256", 256, QUEUE_CAP);

/**
 * The same at 16 clients and a full queue: the bench's small world for the same work per client.
 */
export const stressCrowd16 = () => crowd("lanes/stress-crowd-16", 16, QUEUE_CAP);
