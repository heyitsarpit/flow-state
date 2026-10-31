// The editor's checks, read from its Stories' checkpoints. A Story is a transcript (editor.story.ts); every
// check lives here, through the test adapter.
//
// PROPOSED, not designed: `@flow-state/vitest` (COVERAGE.md section 6, decided Q4 A). `storyTest(story, fn)`
// runs the Story once and hands `fn` the checkpoints as `at`, typed by the Story's own names, so `at.saaved` is a
// type error. `at.<name>` is that checkpoint's step cut (2.10.6): for a machine Story it carries the subject's
// snapshot (`state`, `memory`, `operations`, `schedules`), and `read(target)` is 2.10.6's one read for
// everything else (a fake, an endpoint's log, `Story.records`, `Story.inspection`, `Story.entity`).
// design gap: `Story.attempt(op)` is an expectation matcher in 2.10.6. Outside `expect` this file reads it as a
// target, `at.x.read(Story.attempt(O.save))`, whose value is that Attempt's id; the design names no such read.
import { storyTest } from "@flow-state/vitest"; // NEW (proposed): the test adapter
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Editor } from "./editor.definition.js";
import {
  attached,
  autosaved,
  editedWhileSaving,
  emptyTitle,
  escaped,
  FIRST,
  heldLaneReadopted,
  lockedOut,
  lockLifts,
  readonly,
  reopenedInFlight,
  reopenedUnsure,
  saved,
  SEEDED,
  stopped,
  T42,
  unsureGaveUp,
  unsureResend,
} from "./editor.story.js";

const { S, E, O } = Editor;

storyTest(saved, ({ at }) => {
  expect(at.opened.memory).toMatchObject({ saved: SEEDED, draft: SEEDED });
  expect(at.draft.state).toBe(S.OPEN.EDITING);
  expect(at.saving.state).toBe(S.OPEN.SAVING);
  expect(O.save.get(at.saving, T42)).toMatchObject({ pending: true, uncertain: false });
  expect(at.saved.state).toBe(S.OPEN.SAVED);
  expect(at.saved.memory).toMatchObject({ saved: FIRST, draft: FIRST });
  expect(at.saved.operations.save).toEqual([]); // a keyed list of the lanes that exist (2.10.7)
  expect(at.saved.read(Desk.saveTitle)).toMatchObject([
    { phase: "answered", via: { attempts: [at.saved.read(Story.attempt(O.save))] } },
  ]);
});

storyTest(autosaved, ({ at }) => {
  expect(at.restarted.state).toBe(S.OPEN.EDITING);
  expect(at.restarted.read(Desk.saveTitle)).toEqual([]);
  expect(at.autosaved.state).toBe(S.OPEN.SAVED);
  expect(at.autosaved.memory.saved).toBe(FIRST);
});

storyTest(editedWhileSaving, ({ at }) => {
  expect(at["moved-on"].state).toBe(S.OPEN.EDITING);
  expect(at["moved-on"].memory).toMatchObject({ saved: FIRST, draft: `${FIRST}s` });
  expect(at["caught-up"].state).toBe(S.OPEN.SAVED);
  expect(at["caught-up"].read(Desk.saveTitle)).toMatchObject([
    { phase: "answered" },
    { phase: "answered" },
  ]);
});

storyTest(emptyTitle, ({ at }) => {
  expect(at.denied.read(Story.records("verdict", { event: E.SaveRequested }))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "EmptyTitle" }] } },
  ]);
  expect(at.denied.read(Desk.saveTitle)).toEqual([]); // denied before any commit
});

storyTest(escaped, ({ at }) => {
  expect(at.discarded.state).toBe(S.OPEN.EDITING);
  expect(at.discarded.memory.draft).toBe(SEEDED);
  expect(at.closed.state).toBe(S.CLOSED);
});

storyTest(readonly, ({ at }) => {
  expect(at.denied.read(Story.records("verdict", { event: E.SaveRequested }))).toMatchObject([
    { result: { _tag: "Denied", reasons: [{ code: "NoPermission" }] } },
  ]);
});

storyTest(lockedOut, ({ at }) => {
  expect(at.locked.state).toBe(S.OPEN.LOCKED);
  expect(at.locked.memory.error).toBe("Locked by dispatcher-2");
  expect(at["first-retry"].memory.lockRetries).toBe(1);
  expect(at["gave-up-on-lock"].state).toBe(S.OPEN.FAILED);
  // The first send and five retries, each its own Attempt: a definite failure is never the same write.
  const sends = at["gave-up-on-lock"].read(Desk.saveTitle);
  expect(sends).toHaveLength(6);
  expect(new Set(sends.map((request) => request.input.key)).size).toBe(6);
});

storyTest(lockLifts, ({ at }) => {
  expect(at.saved.state).toBe(S.OPEN.SAVED);
  expect(at.saved.memory).toMatchObject({ saved: FIRST, lockRetries: 0 });
});

storyTest(unsureResend, ({ at }) => {
  expect(at.unsure.state).toBe(S.OPEN.UNSURE);
  expect(O.save.get(at.unsure, T42)).toMatchObject({
    pending: false,
    uncertain: true,
    retryCount: 0,
  });
  expect(at.resending.state).toBe(S.OPEN.UNSURE);
  expect(O.save.get(at.resending, T42)).toMatchObject({ uncertain: true, retryCount: 1 });
  expect(at.saved.state).toBe(S.OPEN.SAVED);
  expect(at.saved.operations.save).toEqual([]);
  // One Attempt in all four requests; the server stored it once.
  const attempt = at.saved.read(Story.attempt(O.save));
  expect(at.saved.read(Desk.saveTitle).map((request) => request.input.key)).toEqual([
    attempt,
    attempt,
    attempt,
    attempt,
  ]);
  expect(at.saved.read(Desk).desk.nextSeq).toBe(2); // one change in the log
});

storyTest(unsureGaveUp, ({ at }) => {
  expect(at["gave-up"].state).toBe(S.OPEN.FAILED);
  expect(at["gave-up"].memory.error).toBe("We couldn't confirm your last save");
  expect(at["gave-up"].operations.save).toEqual([]);
  expect(at["gave-up"].read(Story.inspection).lanes).toEqual([]); // no hold without an owner
  expect(at["gave-up"].read(Desk.saveTitle)).toHaveLength(4); // the first send and three re-sends
});

storyTest(stopped, ({ at }) => {
  expect(at.stopped.state).toBe(S.OPEN.EDITING);
  expect(at.stopped.operations.save).toEqual([]);
  expect(at.stopped.read(Story.inspection).lanes).toEqual([]);
});

storyTest(heldLaneReadopted, ({ at }) => {
  expect(at["closed-while-saving"].state).toBe(S.CLOSED);
  expect(O.save.get(at["closed-while-saving"], T42).uncertain).toBe(true);
  expect(at.disposed.read(Story.inspection).lanes).toMatchObject([
    { contract: "DispatchDesk/save-title", state: "Held", binding: "unbound" },
  ]);
  expect(at.readopted.state).toBe(S.OPEN.UNSURE); // `unknown { Restored }`, current from the active leaf
  expect(at.saved.state).toBe(S.OPEN.SAVED);
});

storyTest(reopenedUnsure, ({ at }) => {
  expect(at["closed-while-saving"].state).toBe(S.CLOSED);
  expect(at["reopened-unsure"].state).toBe(S.OPEN.UNSURE);
});

storyTest(reopenedInFlight, ({ at }) => {
  expect(at.reopened.state).toBe(S.OPEN.EDITING); // OPEN's default leaf, never SAVING (M2)
  expect(O.save.get(at.reopened, T42).pending).toBe(true);
  expect(at["settled-late"].memory.saved).toBe(FIRST);
  expect(at["settled-late"].operations.save).toEqual([]);
});

storyTest(attached, ({ at }) => {
  expect(at.attached.memory.uploads).toMatchObject([{ key: "r-1" }]); // a copy's public memory (rule 9)
  expect(at.removed.memory).toMatchObject({ attachments: [], uploads: [] });
  expect(at.removed.read(Story.inspection).lanes).toEqual([]);
});
