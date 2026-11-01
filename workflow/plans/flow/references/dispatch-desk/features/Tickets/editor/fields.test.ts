// The description fields' and the body's checks (`@flow-state/vitest`, proposed; editor.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Desk } from "../../../testing/desk.fake.js";
import { Autosave } from "./autosave.trait.js";
import { Body } from "./body.trait.js";
import {
  accessCodeRejected,
  bodyCoalesced,
  bodyConflict,
  bodyUnsureThenConflict,
  fieldsIndependent,
  summarySuperseded,
  waitsBehindUnsure,
} from "./fields.story.js";
import { T42 } from "./editor.story.js";

const summary = { ...T42, field: "summary" as const };

// A copy's public memory, by its key (rule 9).
const copy = (cut: { memory: { fields: ReadonlyArray<{ key: string }> } }, field: string) =>
  cut.memory.fields.find((c) => c.key === field) as
    | {
        key: string;
        saved: string;
        problem: string | null;
        check: { value: string; error: unknown };
      }
    | undefined;

storyTest(summarySuperseded, ({ at }) => {
  expect(copy(at["typing-summary"], "summary")?.check.value).toBe("Lobby light");
  expect(at["typing-summary"].schedules.settle).toMatchObject([{ key: { field: "summary" } }]); // one timer per dirty field
  // One on the wire, one waiting; the middle value was replaced before it was sent.
  expect(Autosave.O.save.get(at["summary-superseded"], summary)).toMatchObject({
    pending: true,
    waiting: true,
  });
  expect(
    at["summary-superseded"].read(Story.records("lane", { operation: Autosave.O.save })),
  ).toContainEqual(
    expect.objectContaining({ cell: expect.objectContaining({ evidence: "Superseded" }) }),
  );
  const sent = at["summary-saved"].read(Desk.saveField).map((r) => r.input.value);
  expect(sent).toEqual(["Lobby light", "Lobby light, flickering, east wing"]); // two requests for three edits
  expect(at["summary-saved"].read(Desk).desk.details["north/T-42"]?.fields.summary).toBe(
    "Lobby light, flickering, east wing",
  );
  expect(at["summary-saved"].memory.lastFieldSaved).toBe("summary"); // the badge (F17)
});

storyTest(fieldsIndependent, ({ at }) => {
  expect(at["both-on-the-wire"].read(Desk.saveField)).toHaveLength(2); // two lanes, both sent at once
  expect(at["both-saved"].operations.fields).toMatchObject([
    { key: "summary", save: [] },
    { key: "locationNote", save: [] },
    { key: "accessCode", save: [] },
  ]);
});

storyTest(waitsBehindUnsure, ({ at }) => {
  expect(Autosave.O.save.get(at["waiting-behind-unsure"], summary)).toMatchObject({
    uncertain: true,
    waiting: true,
  });
  expect(at["waiting-behind-unsure"].read(Desk.saveField)).toHaveLength(1); // nothing newer while it may land
  expect(at["caught-up"].read(Desk.saveField).map((r) => r.input.value)).toEqual([
    "Lobby light",
    "Lobby light", // the re-send: the same Attempt
    "Lobby light, east",
  ]);
});

storyTest(accessCodeRejected, ({ at }) => {
  expect(copy(at.rejected, "accessCode")).toMatchObject({ problem: "rejected", saved: "" });
});

storyTest(bodyConflict, ({ at }) => {
  expect(at["body-conflict"].memory.body).toMatchObject({
    status: "conflict",
    body: "Ladder needed; bulb is a 40 W.", // the author's text, kept
    theirs: "Bulb replaced; still flickers.",
    etag: "e2",
  });
  expect(at["body-conflict"].memory.error).toBe(
    "Someone else changed the description. Compare and choose.",
  );
  expect(at["kept-mine"].read(Desk.saveBody).map((r) => r.input.ifMatch)).toEqual(["e1", "e2"]);
  expect(at["kept-mine"].memory.body.status).toBe("clean");
});

storyTest(bodyUnsureThenConflict, ({ at }) => {
  expect(Body.O.save.get(at["body-unsure"], T42).uncertain).toBe(true);
  expect(
    at["body-unsure-conflict"].read(Story.records("ending", { operation: Body.O.save })),
  ).toMatchObject([
    { channel: "unknown", reason: { _tag: "NoResponse" } },
    { channel: "unknown", reason: { _tag: "StillUnknown", failure: { _tag: "BodyConflict" } } },
  ]);
  expect(at["body-unsure-conflict"].memory.body.status).toBe("conflict");
  expect(Body.O.save.get(at["body-unsure-conflict"], T42)).toMatchObject({
    uncertain: false,
    pending: false,
  });
});

storyTest(bodyCoalesced, ({ at }) => {
  expect(at.coalescing.read(Desk.saveBody)).toHaveLength(1);
  expect(at.coalescing.memory.body.body).toBe("Ladder needed today");
  expect(at.coalesced.read(Desk.saveBody).map((r) => [r.input.body, r.input.ifMatch])).toEqual([
    ["Ladder", "e1"],
    ["Ladder needed today", "e2"], // the newest text, with the etag the first answer returned
  ]);
  expect(at.coalesced.memory.body.status).toBe("clean");
});
