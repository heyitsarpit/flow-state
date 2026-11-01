// The editor's description fields and body: machine Stories over the editor, its world the Desk fake (the details
// port is the real `DetailsHttp` adapter over `Fake.fetch`). Transcripts; fields.test.ts reads them.
//
// Module checkpoints (COVERAGE.md section 6, "ED fields and tabs"): `typing-summary`, `summary-superseded`,
// `body-conflict` here; `reloaded-mid-autosave`, `second-tab`, `quota-refused` in editor.tabs.story.ts.
import { Story } from "flow-state/testing";
import { PendingFilesLive } from "../../Attachments/attachments-api.js";
import { Desk, DeskClient } from "../../../testing/desk.fake.js";
import { Editor } from "./editor.definition.js";
import { EditorMachine } from "./editor.machine.js";
import { T42 } from "./editor.story.js";

const { E } = Editor;

const editor = (id: string, world: ReadonlyArray<unknown> = []) =>
  Story.make(EditorMachine, {
    id,
    input: T42,
    context: { canEdit: true },
    fixtures: [DeskClient, PendingFilesLive],
    world,
  }).checkpoint("opened");

// What a keystroke in one field sends: the field's nested `check` Field, at the copy's key (rule 9, rule 10: the
// view addresses the path; the host cannot).
export const type = (field: "summary" | "locationNote" | "accessCode", value: string) =>
  E.fields.key(field).check.Changed({ value });

// The debounce is per field and the lane is per field, on `latest`. The first pause sends "Lobby light", held on
// the wire; two more pauses each commit a newer value, and the second replaces the first in the queue before it was
// ever sent (`Superseded`, evidence, no ending). When the head answers, only the newest goes: two requests for
// three settled edits, and the server ends with the last one (O4).
export const summarySuperseded = editor("editor/summary-superseded", [
  Desk.saveField.hold({ at: "response" }),
])
  .send(type("summary", "Lobby light"))
  .checkpoint("typing-summary")
  .advance("800 millis") // the field's debounce fires; `Flush` raised into its copy
  .send(type("summary", "Lobby light, flickering"))
  .advance("800 millis") // a newer value, queued behind the one on the wire
  .send(type("summary", "Lobby light, flickering, east wing"))
  .advance("800 millis") // replaces the queued one: it was never sent
  .checkpoint("summary-superseded")
  .world(Desk.saveField.release())
  .checkpoint("summary-saved");

// Two fields are two lanes: neither waits for the other (key `["workspaceId", "ticketId", "field"]`).
export const fieldsIndependent = editor("editor/fields-independent", [
  Desk.saveField.hold({ at: "response" }),
])
  .send(type("summary", "Lobby light"), type("locationNote", "Front desk"))
  .advance("800 millis")
  .checkpoint("both-on-the-wire")
  .world(Desk.saveField.release())
  .checkpoint("both-saved");

// A field edit waits behind that field's unsure save (O5): the first answer is lost, so the lane holds its Attempt;
// the next value is committed and waits (`waiting`) until the re-send answers, then goes.
export const waitsBehindUnsure = editor("editor/field-waits-behind-unsure", [
  Desk.saveField.drop({ at: "response", times: 1 }),
])
  .send(type("summary", "Lobby light"))
  .advance("800 millis")
  .send(type("summary", "Lobby light, east"))
  .advance("800 millis")
  .checkpoint("waiting-behind-unsure")
  .advance("2 seconds") // the copy's `resend`: the same Attempt; then the waiting value is sent
  .checkpoint("caught-up");

// A value the server refuses (an access code is digits): the copy says why, and the field stays dirty.
export const accessCodeRejected = editor("editor/access-code-rejected")
  .send(type("accessCode", "12ab"))
  .advance("800 millis")
  .checkpoint("rejected");

// The body: someone saved first, so our save's `If-Match` is stale and the server answers 412 with their text. The
// trait keeps the author's text, shows theirs beside it, and tells the host (the optional `onConflict`, F15).
// Keep mine sends again with the etag the 412 carried.
export const bodyConflict = editor("editor/body-conflict", [
  Desk.editBodyElsewhere({ ...T42, body: "Bulb replaced; still flickers." }),
])
  .send(E.body.Edited({ body: "Ladder needed; bulb is a 40 W." }))
  .advance("1 second")
  .checkpoint("body-conflict")
  .send(E.body.KeepMine())
  .checkpoint("kept-mine");

// The hold with a version on the wire (O1). The first send is lost on the way out (nothing applied), then someone
// saves: the re-send of the same Attempt carries the old `If-Match` and meets 412. After an unknown send a definite
// failure is `StillUnknown` (rule 18): the trait cannot say "not saved", so it releases and asks the author.
export const bodyUnsureThenConflict = editor("editor/body-unsure-then-conflict", [
  Desk.saveBody.drop({ times: 1 }),
])
  .send(E.body.Edited({ body: "Ladder needed." }))
  .advance("1 second")
  .checkpoint("body-unsure")
  .world(Desk.editBodyElsewhere({ ...T42, body: "Done by the day shift." }))
  .advance("2 seconds") // the re-send
  .checkpoint("body-unsure-conflict");

// Typing during a body save is coalesced in the trait and sent after the answer, with the etag that answer returned.
export const bodyCoalesced = editor("editor/body-coalesced", [
  Desk.saveBody.hold({ at: "response" }),
])
  .send(E.body.Edited({ body: "Ladder" }))
  .advance("1 second")
  .send(E.body.Edited({ body: "Ladder needed" }), E.body.Edited({ body: "Ladder needed today" }))
  .advance("1 second") // settles, but a save is on the wire: `idle` declines, the text waits in memory
  .checkpoint("coalescing")
  .world(Desk.saveBody.release())
  .checkpoint("coalesced");
