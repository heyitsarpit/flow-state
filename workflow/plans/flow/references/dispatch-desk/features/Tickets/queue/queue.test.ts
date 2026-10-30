// One line per Story (2.10.13).
import { test } from "vite-plus/test";
import {
  alreadyAssigned,
  assigned,
  assignedMany,
  assignUnsure,
  degraded,
  mineOnly,
  paged,
  previewABA,
  searched,
} from "./queue.story.js";

test("queue/search-key", () => searched.run());
test("queue/mine-only", () => mineOnly.run());
test("queue/paged", () => paged.run());
test("queue/degraded", () => degraded.run());
test("queue/assign", () => assigned.run());
test("queue/assign-many", () => assignedMany.run());
test("queue/assign-unsure", () => assignUnsure.run());
test("queue/already-assigned", () => alreadyAssigned.run());
test("queue/preview-a-b-a", () => previewABA.run());
