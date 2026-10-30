// One line per Story (2.10.13). Pending merge 6.
import { test } from "vite-plus/test";
import { budgetSpent, dropped, expired, joined, rejoinedChanged } from "./presence.story.js";

test("presence joined", () => joined.run());
test("presence dropped", () => dropped.run());
test("presence rejoined with a changed state", () => rejoinedChanged.run());
test("presence budget spent", () => budgetSpent.run());
test("presence token expired", () => expired.run());
