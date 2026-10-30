// One line per Story (2.10.13). Pending merge 6.
import { test } from "vite-plus/test";
import {
  answered,
  askedAgain,
  refused,
  reloaded,
  stalled,
  stopped,
  streaming,
  truncated,
} from "./assistant.story.js";

test("assistant answered", () => answered.run());
test("assistant streaming shows progress", () => streaming.run());
test("assistant stopped keeps the partial and releases the hold", () => stopped.run());
test("assistant asked again after a stop", () => askedAgain.run());
test("assistant truncated body is incomplete", () => truncated.run());
test("assistant stalled body is cut", () => stalled.run());
test("assistant refused", () => refused.run());
test("assistant reload while asking", () => reloaded.run());
