import { Git } from "../../services/git/server/git.ts";
import { pagedClient, serializeClient } from "../app.ts";
import { Paged } from "../machines/paged.ts";
import { Serialize } from "../machines/clients.ts";
import { grownStory } from "./structure.ts";

/**
 * One repository name in its composed (NFC) and decomposed spellings, committed while the first is
 * on the wire.
 */
export const twoSpellings = grownStory("lanes/two-spellings")
  .ensure(serializeClient)
  .world(Git.sync.hold())
  .send(serializeClient, Serialize.E.Commit({ repo: "café" }))
  .send(serializeClient, Serialize.E.Commit({ repo: "café" }))
  .checkpoint("both")
  .world(Git.sync.release());

/**
 * Page 0 and page -0 of one repository, committed while the first is on the wire.
 */
export const negativeZero = grownStory("lanes/negative-zero")
  .ensure(pagedClient)
  .world(Git.sync.hold())
  .send(pagedClient, Paged.E.CommitPage({ repo: "flow", page: 0 }))
  .send(pagedClient, Paged.E.CommitPage({ repo: "flow", page: -0 }))
  .checkpoint("both")
  .world(Git.sync.release())
  .checkpoint("drained");
