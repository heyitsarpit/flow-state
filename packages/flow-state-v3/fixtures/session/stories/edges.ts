import { Fake } from "../../../src/host/testing/index.ts";
import { badge } from "../machine.ts";
import { grownStory } from "./structure.ts";

const badgeRecord = "actor/Workspace/Badge/badge";

// One byte past the 2,097,152 canonical bytes a record may hold.
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
 * The badge's saved record is one byte past a record's bound when the tab opens.
 */
export const oversizedRecord = grownStory("session/stress-oversized-record")
  .world(Fake.storage.put(badgeRecord, `"${"x".repeat(PAST_RECORD_BOUND - 2)}"`))
  .reload({ reattach: false })
  .checkpoint("boot");
