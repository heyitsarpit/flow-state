import { test } from "vite-plus/test";
import {
  aBA,
  emptyDenied,
  gaveUp,
  leftWhileSending,
  lostThenResent,
  posted,
  ticketGone,
} from "./comments.story.js";

test("comments/posted", () => posted.run());
test("comments/empty-denied", () => emptyDenied.run());
test("comments/lost-then-resent", () => lostThenResent.run());
test("comments/gave-up", () => gaveUp.run());
test("comments/ticket-gone", () => ticketGone.run());
test("comments/left-while-sending", () => leftWhileSending.run());
test("comments/a-b-a", () => aBA.run());
