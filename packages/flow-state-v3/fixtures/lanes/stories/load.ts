import { actorRef } from "../../../src/index.ts";
import { Git } from "../../services/git/server/git.ts";
import { Serialize, SerializeMachine } from "../machines/clients.ts";
import { serializeClient } from "../app.ts";
import { lanesStory } from "./usual.ts";

const commit = Serialize.E.Commit({ repo: "flow" });

/**
 * How many commits `serialize-deep` queues behind its head: well past any queue a real client
 * builds.
 */
export const DEEP_QUEUE = 1000;

/**
 * Under `serialize`, a head on the wire and `queued` commits behind it; then the head's answer
 * comes and the queue drains, every commit sent in order. Built on call and kept out of `stories`:
 * the reload sweep would run it once per step.
 */
export const serializeDeepOf = (queued: number) =>
  Array.from({ length: queued }, (_, n) => n)
    .reduce(
      (story) => story.send(serializeClient, commit),
      lanesStory(queued === DEEP_QUEUE ? "lanes/serialize-deep" : `lanes/serialize-deep-${queued}`)
        .ensure(serializeClient)
        .world(Git.sync.hold())
        .send(serializeClient, commit)
        .checkpoint("on the wire"),
    )
    .checkpoint("queued")
    .world(Git.sync.release())
    .checkpoint("drained");

/**
 * `serializeDeepOf` at `DEEP_QUEUE`.
 */
export const serializeDeep = () => serializeDeepOf(DEEP_QUEUE);

// The commits the first crowd client queues behind its head.
const CROWD_QUEUE = 64;

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
 * `clients` serialize clients and 64 queued behind the first, across a reload: one point of the
 * bench's world-size series, built on call.
 */
export const crowdOf = (clients: number) =>
  crowd(`lanes/stress-crowd-${clients}`, clients, CROWD_QUEUE);

/**
 * The same at 256 clients and 64 queued: the bench's world-size Story, built on call and kept
 * out of `stories`, since each run is over 300 steps.
 */
export const stressCrowd256 = () => crowd("lanes/stress-crowd-256", 256, CROWD_QUEUE);

/**
 * The same at 16 clients and 64 queued: the bench's small world for the same work per client.
 */
export const stressCrowd16 = () => crowd("lanes/stress-crowd-16", 16, CROWD_QUEUE);
