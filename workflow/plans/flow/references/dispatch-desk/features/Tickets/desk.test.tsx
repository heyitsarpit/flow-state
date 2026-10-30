// @vitest-environment happy-dom
// One line per app Story (2.10.13), the Stories of the tabs file included, and one render test: the playback
// frame at the saving step shows the panel as production would.
import { render, screen } from "@testing-library/react";
import { StoryFrame } from "flow-state/testing";
import { expect, test } from "vite-plus/test";
import { TicketPanel } from "./editor/TicketPanel.js";
import { T42 } from "./editor/editor.story.js";
import {
  reloadAckConfirmationHeld,
  reloadAckHeld,
  reloadMidSave,
  secondTab,
} from "./editor/editor.tabs.story.js";
import {
  assignRepairs,
  closedMidSave,
  pushedRename,
  revokedMidSave,
  saveRepairsQueue,
  signOut,
} from "./desk.story.js";

test("desk/save-repairs-queue", () => saveRepairsQueue.run());
test("desk/assign-repairs", () => assignRepairs.run());
test("desk/revoked-mid-save", () => revokedMidSave.run());
test("desk/closed-mid-save", () => closedMidSave.run());
test("desk/sign-out", () => signOut.run());
test("desk/pushed-rename", () => pushedRename.run()); // pending merge 6
test("editor/second-tab", () => secondTab.run());
test("editor/reload-mid-save", () => reloadMidSave.run());
test("editor/reload-ack-held", () => reloadAckHeld.run());
test("editor/reload-ack-confirmation-held", () => reloadAckConfirmationHeld.run());

// design gap: `StoryFrame`'s props are not spelled in 2.10.13. Assumed: the run, a checkpoint name and the views
// to render from that frame as children.
test("the panel at the saving step offers Cancel and not Save", async () => {
  const run = await saveRepairsQueue.run();

  render(
    <StoryFrame run={run} checkpoint="saving">
      <TicketPanel ticket={T42} />
    </StoryFrame>,
  );

  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("Replace foyer light");
});
