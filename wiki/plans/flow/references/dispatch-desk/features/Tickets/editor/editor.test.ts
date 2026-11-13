// The editor's checks, read from its Stories' checkpoints (2.10.6). A Story is a transcript (editor.story.ts);
// every check lives here. Each test runs its Story once and destructures the checkpoints it reads. `cut.lane` reads
// a write that is in progress and is `undefined` once it settles; `cut.operations.save` is the keyed list of the
// lanes that exist (2.10.7), so a settled save reads `[]` there as well.
import { expect, test } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Editor } from "./editor.definition.js";
import {
  autosavePaused,
  editedWhileSaving,
  emptyTitle,
  escaped,
  FIRST,
  fileAttached,
  heldLaneReadopted,
  lockedOut,
  lockLifts,
  readonly,
  reopenedInFlight,
  reopenedUnsure,
  saved,
  saveStopped,
  SEEDED,
  T42,
  unsureGaveUp,
  unsureResend,
} from "./editor.story.js";

const { S, E, O } = Editor;

test("a save: predicted while on the wire, then confirmed once", async () => {
  // `saved` is also a checkpoint's name, so the Story's own is read under an alias.
  const { opened, draft, saving, saved: confirmed } = (await saved.run()).checkpoints;

  expect(opened.memory).toMatchObject({ saved: SEEDED, draft: SEEDED });
  expect(draft.state).toBe(S.OPEN.EDITING);
  expect(saving.state).toBe(S.OPEN.SAVING);
  expect(saving.lane(O.save, T42)).toMatchObject({ pending: true, uncertain: false });
  expect(confirmed.state).toBe(S.OPEN.SAVED);
  expect(confirmed.memory).toMatchObject({ saved: FIRST, draft: FIRST });
  expect(confirmed.operations.save).toEqual([]); // a keyed list of the lanes that exist (2.10.7)
  expect(confirmed.read(Desk.saveTitle)).toMatchObject([
    { phase: "answered", via: { attempts: [confirmed.attempt(O.save)] } },
  ]);
});

test("autosave is a debounce: only the pause after the last edit saves", async () => {
  const { restarted, autosaved } = (await autosavePaused.run()).checkpoints;

  expect(restarted.state).toBe(S.OPEN.EDITING);
  expect(restarted.read(Desk.saveTitle)).toEqual([]);
  expect(autosaved.state).toBe(S.OPEN.SAVED);
  expect(autosaved.memory.saved).toBe(FIRST);
});

test("typing during a save is kept and saved without another keystroke", async () => {
  const { movedOn, caughtUp } = (await editedWhileSaving.run()).checkpoints;

  expect(movedOn.state).toBe(S.OPEN.EDITING);
  expect(movedOn.memory).toMatchObject({ saved: FIRST, draft: `${FIRST}s` });
  expect(caughtUp.state).toBe(S.OPEN.SAVED);
  expect(caughtUp.read(Desk.saveTitle)).toMatchObject([
    { phase: "answered" },
    { phase: "answered" },
  ]);
});

test("an empty title is denied before any commit", async () => {
  const { denied } = (await emptyTitle.run()).checkpoints;

  expect(denied.records("verdict", { event: E.SaveRequested })).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "EmptyTitle" }] } },
  ]);
  expect(denied.read(Desk.saveTitle)).toEqual([]); // denied before any commit
});

test("escape discards edits, then closes", async () => {
  const { discarded, closed } = (await escaped.run()).checkpoints;

  expect(discarded.state).toBe(S.OPEN.EDITING);
  expect(discarded.memory.draft).toBe(SEEDED);
  expect(closed.state).toBe(S.CLOSED);
});

test("a read-only editor denies the save", async () => {
  const { denied } = (await readonly.run()).checkpoints;

  expect(denied.records("verdict", { event: E.SaveRequested })).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NoPermission" }] } },
  ]);
});

test("a lock backs off and retries, each retry its own Attempt, then fails", async () => {
  const { locked, firstRetry, gaveUpOnLock } = (await lockedOut.run()).checkpoints;

  expect(locked.state).toBe(S.OPEN.LOCKED);
  expect(locked.memory.error).toBe("Locked by dispatcher-2");
  expect(firstRetry.memory.lockRetries).toBe(1);
  expect(gaveUpOnLock.state).toBe(S.OPEN.FAILED);
  // The first send and five retries, each its own Attempt: a definite failure is never the same write.
  const sends = gaveUpOnLock.read(Desk.saveTitle);
  expect(sends).toHaveLength(6);
  expect(new Set(sends.map((request) => request.input.key)).size).toBe(6);
});

test("a lock that lifts: a later retry saves", async () => {
  const { saved: confirmed } = (await lockLifts.run()).checkpoints;

  expect(confirmed.state).toBe(S.OPEN.SAVED);
  expect(confirmed.memory).toMatchObject({ saved: FIRST, lockRetries: 0 });
});

test("an unsure save is re-sent as the same Attempt and the server stores it once", async () => {
  const { unsure, resending, saved: confirmed } = (await unsureResend.run()).checkpoints;

  expect(unsure.state).toBe(S.OPEN.UNSURE);
  expect(unsure.lane(O.save, T42)).toMatchObject({
    pending: false,
    uncertain: true,
    retryCount: 0,
  });
  expect(resending.state).toBe(S.OPEN.UNSURE);
  expect(resending.lane(O.save, T42)).toMatchObject({ uncertain: true, retryCount: 1 });
  expect(confirmed.state).toBe(S.OPEN.SAVED);
  expect(confirmed.operations.save).toEqual([]);
  // One Attempt in all four requests; the server stored it once.
  const attempt = confirmed.attempt(O.save);
  expect(confirmed.read(Desk.saveTitle).map((request) => request.input.key)).toEqual([
    attempt,
    attempt,
    attempt,
    attempt,
  ]);
  expect(confirmed.read(Desk).desk.nextSeq).toBe(2); // one change in the log
});

test("an unsure save that is never answered gives up and leaves no hold", async () => {
  const { gaveUp } = (await unsureGaveUp.run()).checkpoints;

  expect(gaveUp.state).toBe(S.OPEN.FAILED);
  expect(gaveUp.memory.error).toBe("We couldn't confirm your last save");
  expect(gaveUp.operations.save).toEqual([]);
  expect(gaveUp.lane(O.save, T42)).toBeUndefined();
  expect(gaveUp.inspection.lanes).toEqual([]); // no hold without an owner
  expect(gaveUp.read(Desk.saveTitle)).toHaveLength(4); // the first send and three re-sends
});

test("cancelling a save on the wire returns to editing and releases the lane", async () => {
  const { stopped } = (await saveStopped.run()).checkpoints;

  expect(stopped.state).toBe(S.OPEN.EDITING);
  expect(stopped.operations.save).toEqual([]);
  expect(stopped.inspection.lanes).toEqual([]);
});

test("a held lane is found again by a rebind of the same identity", async () => {
  const {
    closedWhileSaving,
    disposed,
    readopted,
    saved: confirmed,
  } = (await heldLaneReadopted.run()).checkpoints;

  expect(closedWhileSaving.state).toBe(S.CLOSED);
  expect(closedWhileSaving.lane(O.save, T42)).toMatchObject({ uncertain: true });
  expect(disposed.inspection.lanes).toMatchObject([
    { contract: "DispatchDesk/save-title", state: "Held", binding: "unbound" },
  ]);
  expect(readopted.state).toBe(S.OPEN.UNSURE); // `unknown { Restored }`, current from the active leaf
  expect(confirmed.state).toBe(S.OPEN.SAVED);
});

test("reopening a closed editor that holds an unsure save goes to UNSURE", async () => {
  // `reopenedUnsure` is also a checkpoint's name, so that one is read under an alias.
  const { closedWhileSaving, reopenedUnsure: reopened } = (await reopenedUnsure.run()).checkpoints;

  expect(closedWhileSaving.state).toBe(S.CLOSED);
  expect(reopened.state).toBe(S.OPEN.UNSURE);
});

test("reopening while the save is on the wire settles late, never into SAVING", async () => {
  const { reopened, settledLate } = (await reopenedInFlight.run()).checkpoints;

  expect(reopened.state).toBe(S.OPEN.EDITING); // OPEN's default leaf, never SAVING (M2)
  expect(reopened.lane(O.save, T42)).toMatchObject({ pending: true });
  expect(settledLate.memory.saved).toBe(FIRST);
  expect(settledLate.operations.save).toEqual([]);
});

test("a dropped file becomes an upload copy, and removing it releases the lane", async () => {
  const { attached, removed } = (await fileAttached.run()).checkpoints;

  expect(attached.memory.uploads).toMatchObject([{ key: "r-1" }]); // a copy's public memory (rule 9)
  expect(removed.memory).toMatchObject({ attachments: [], uploads: [] });
  expect(removed.inspection.lanes).toEqual([]);
});
