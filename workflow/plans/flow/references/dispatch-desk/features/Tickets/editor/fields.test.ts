// The description fields' and the body's checks, read from the Stories' checkpoints (2.10.6). Each test runs its
// Story once. `summarySuperseded` and `bodyConflict` are also checkpoint names, so those are read under an alias.
import { expect, test } from "vite-plus/test";
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

test("a field's debounce and lane are its own: a newer value replaces the queued one unsent", async () => {
  const {
    typingSummary,
    summarySuperseded: superseded,
    summarySaved,
  } = (await summarySuperseded.run()).checkpoints;

  expect(copy(typingSummary, "summary")?.check.value).toBe("Lobby light");
  expect(typingSummary.schedules.settle).toMatchObject([{ key: { field: "summary" } }]); // one timer per dirty field
  // One on the wire, one waiting; the middle value was replaced before it was sent.
  expect(superseded.lane(Autosave.O.save, summary)).toMatchObject({
    pending: true,
    waiting: true,
  });
  expect(superseded.records("lane", { operation: Autosave.O.save })).toContainEqual(
    expect.objectContaining({ cell: expect.objectContaining({ evidence: "Superseded" }) }),
  );
  const sent = summarySaved.read(Desk.saveField).map((r) => r.input.value);
  expect(sent).toEqual(["Lobby light", "Lobby light, flickering, east wing"]); // two requests for three edits
  expect(summarySaved.read(Desk).desk.details["north/T-42"]?.fields.summary).toBe(
    "Lobby light, flickering, east wing",
  );
  expect(summarySaved.memory.lastFieldSaved).toBe("summary"); // the badge (F17)
});

test("two fields are two lanes: neither waits for the other", async () => {
  const { bothOnTheWire, bothSaved } = (await fieldsIndependent.run()).checkpoints;

  expect(bothOnTheWire.read(Desk.saveField)).toHaveLength(2); // two lanes, both sent at once
  expect(bothSaved.operations.fields).toMatchObject([
    { key: "summary", save: [] },
    { key: "locationNote", save: [] },
    { key: "accessCode", save: [] },
  ]);
});

test("a field edit waits behind that field's unsure save, then goes", async () => {
  const { waitingBehindUnsure, caughtUp } = (await waitsBehindUnsure.run()).checkpoints;

  expect(waitingBehindUnsure.lane(Autosave.O.save, summary)).toMatchObject({
    uncertain: true,
    waiting: true,
  });
  expect(waitingBehindUnsure.read(Desk.saveField)).toHaveLength(1); // nothing newer while it may land
  expect(caughtUp.read(Desk.saveField).map((r) => r.input.value)).toEqual([
    "Lobby light",
    "Lobby light", // the re-send: the same Attempt
    "Lobby light, east",
  ]);
});

test("a value the server refuses says why and the field stays dirty", async () => {
  const { rejected } = (await accessCodeRejected.run()).checkpoints;

  expect(copy(rejected, "accessCode")).toMatchObject({ problem: "rejected", saved: "" });
});

test("a body save that meets someone else's: theirs beside mine, keep mine sends again", async () => {
  const { bodyConflict: conflict, keptMine } = (await bodyConflict.run()).checkpoints;

  expect(conflict.memory.body).toMatchObject({
    status: "conflict",
    body: "Ladder needed; bulb is a 40 W.", // the author's text, kept
    theirs: "Bulb replaced; still flickers.",
    etag: "e2",
  });
  expect(conflict.memory.error).toBe("Someone else changed the description. Compare and choose.");
  expect(keptMine.read(Desk.saveBody).map((r) => r.input.ifMatch)).toEqual(["e1", "e2"]);
  expect(keptMine.memory.body.status).toBe("clean");
});

test("an unsure body save that then meets a conflict releases and asks the author", async () => {
  const { bodyUnsure, bodyUnsureConflict } = (await bodyUnsureThenConflict.run()).checkpoints;

  expect(bodyUnsure.lane(Body.O.save, T42)).toMatchObject({ uncertain: true });
  expect(bodyUnsureConflict.records("ending", { operation: Body.O.save })).toMatchObject([
    { channel: "unknown", reason: { _tag: "NoResponse" } },
    { channel: "unknown", reason: { _tag: "StillUnknown", failure: { _tag: "BodyConflict" } } },
  ]);
  expect(bodyUnsureConflict.memory.body.status).toBe("conflict");
  expect(bodyUnsureConflict.lane(Body.O.save, T42)).toBeUndefined(); // released: neither pending nor held
});

test("typing during a body save is coalesced and sent after the answer, with its etag", async () => {
  const { coalescing, coalesced } = (await bodyCoalesced.run()).checkpoints;

  expect(coalescing.read(Desk.saveBody)).toHaveLength(1);
  expect(coalescing.memory.body.body).toBe("Ladder needed today");
  expect(coalesced.read(Desk.saveBody).map((r) => [r.input.body, r.input.ifMatch])).toEqual([
    ["Ladder", "e1"],
    ["Ladder needed today", "e2"], // the newest text, with the etag the first answer returned
  ]);
  expect(coalesced.memory.body.status).toBe("clean");
});
