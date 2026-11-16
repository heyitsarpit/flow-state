import { Git } from "../../sync/server.ts";
import { serializeClient } from "../machine.ts";
import { lanesStory } from "../stories.ts";

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
