import { Fake } from "../../../src/host/testing/index.ts";
import { badge } from "../app.ts";
import { grownStory } from "./structure.ts";

const badgeRecord = "actor/Workspace/Badge/badge";

// A saved text of 2 MB, as a store left behind by another app might hold.
const PAST_RECORD_BOUND = 2_097_153;

/**
 * The badge's saved record is not JSON at all when the tab opens; the badge is ensured.
 */
export const corruptRecord = grownStory("session/corrupt-record")
  .world(Fake.storage.put(badgeRecord, "{not valid json"))
  .reload({ reattach: false })
  .checkpoint("boot")
  .ensure(badge)
  .checkpoint("fresh");

/**
 * The badge's saved record is a 2 MB text that is no record when the tab opens; the badge is
 * ensured.
 */
export const oversizedRecord = grownStory("session/stress-oversized-record")
  .world(Fake.storage.put(badgeRecord, `"${"x".repeat(PAST_RECORD_BOUND - 2)}"`))
  .reload({ reattach: false })
  .checkpoint("boot")
  .ensure(badge)
  .checkpoint("fresh");
