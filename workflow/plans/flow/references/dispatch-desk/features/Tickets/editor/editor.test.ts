// One line per Story (2.10.13): the Story's own `expect` steps are the assertions. The React render test
// moves to features/Tickets/desk.test.tsx.
import { test } from "vite-plus/test";
import {
  attached,
  autosaved,
  editedWhileSaving,
  emptyTitle,
  escaped,
  lockedOut,
  lockLifts,
  outlivesClose,
  outlivesCloseUnsure,
  readonly,
  reopenedUnsure,
  saved,
  stopped,
  unsureGaveUp,
  unsureResend,
} from "./editor.story.js";

test("editor saved", () => saved.run());
test("editor autosave", () => autosaved.run());
test("editor edit while saving", () => editedWhileSaving.run());
test("editor empty title", () => emptyTitle.run());
test("editor escape", () => escaped.run());
test("editor readonly", () => readonly.run());
test("editor locked out", () => lockedOut.run());
test("editor lock lifts", () => lockLifts.run());
test("editor unsure resend", () => unsureResend.run());
test("editor unsure gave up", () => unsureGaveUp.run());
test("editor stopped", () => stopped.run());
test("editor outlives close", () => outlivesClose.run());
test("editor outlives close unsure", () => outlivesCloseUnsure.run());
test("editor reopened unsure", () => reopenedUnsure.run());
test("editor attached", () => attached.run());
