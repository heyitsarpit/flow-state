import { Git } from "../../sync/server.ts";
import { pagedClient } from "../app.ts";
import { serializeClient } from "../machine.ts";
import { grownStory } from "./structure.ts";

/**
 * One repository name in its composed (NFC) and decomposed spellings, committed while the first is
 * on the wire.
 */
export const twoSpellings = grownStory("lanes/two-spellings")
  .ensure(serializeClient)
  .world(Git.sync.hold())
  .send(serializeClient, { _tag: "Commit", repo: "café" })
  .send(serializeClient, { _tag: "Commit", repo: "café" })
  .checkpoint("both")
  .world(Git.sync.release());

/**
 * Page 0 and page -0 of one repository, committed while the first is on the wire.
 */
export const negativeZero = grownStory("lanes/negative-zero")
  .ensure(pagedClient)
  .world(Git.sync.hold())
  .send(pagedClient, { _tag: "CommitPage", repo: "flow", page: 0 })
  .send(pagedClient, { _tag: "CommitPage", repo: "flow", page: -0 })
  .checkpoint("both")
  .world(Git.sync.release())
  .checkpoint("drained");
