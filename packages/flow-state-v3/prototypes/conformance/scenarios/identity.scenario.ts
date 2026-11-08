// Round 14 (OD30, rule 74, 2.7.19): an actor is its machine plus its input. A ref built from a value is named by the machine's `Flow.input`
// fields, in field-name order, and only those; the value is the input. A singleton has a literal name and takes input at ensure. Every
// expectation is the design's text, worked by hand.
import { actorRef, ensureArgs, type ActorRefOf } from "../compile/index.ts";
import { Editor1, Editor2, Editor3, Editor4, Editor5, EditorId, editor1Format1, editorFixture, editorFormat1Fixture, editorRef, SessionRef, sessionFixture, type Release } from "../typed/identity.ts";
import type { Step } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const T42 = { workspaceId: "north", ticketId: "T-42" };
// A ref as the suite's step: the actor it names, and the ensure the design gives it (a value ref with its value as input, and no input of its own).
const at = <I, F extends "value" | "singleton">(r: ActorRefOf<I, F>) => ({ actor: r.machine, id: r.id });
const ensureStep = (a: ReturnType<typeof ensureArgs>): Step => ({ ensure: { actor: a.machine, id: a.id }, ...(a.input === undefined ? {} : { input: a.input }), ...(a.identity ? { identity: a.identity } : {}) });

export const identityScenarios: readonly Scenario[] = [
  {
    id: "R14-ID-01",
    kind: "example",
    fixtures: [editorFixture()],
    cites: ["rule:74", "sec:2.7.19"],
    variants: {
      // The identity is the value's input fields in field-name order: a reordered literal and a wider value name the same actor, and the
      // memory's input fields are the value's.
      "a-value-names-the-actor-and-is-its-input"(c0) {
        const r1 = editorRef(T42);
        const r2 = actorRef(Editor1, { ticketId: "T-42", workspaceId: "north" });
        const wide = { workspaceId: "north", ticketId: "T-42", assignee: "ana" };
        const r3 = editorRef(wide);
        c0.eq("one identity", [r1.id, r2.id, r3.id], ["ticketId=T-42&workspaceId=north", "ticketId=T-42&workspaceId=north", "ticketId=T-42&workspaceId=north"]);
        c0.eq("Flow keeps only the input fields", r3.input, { ticketId: "T-42", workspaceId: "north" });
        const c = new Ctx(c0.fresh([editorFixture()]), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.eq("the value is the input", [c.mem()?.workspaceId, c.mem()?.ticketId], ["north", "T-42"]);
        c.to(at(r2), "Title", { title: "Foyer" });
        c.eq("the reordered ref reached the same actor", [c.mem().title, c.incarnations(at(r1))], ["Foyer", 1]);
      },
      // Lanes stay (actor identity, contract id, key): a fresh incarnation reached by an equal value adopts the lane after `disposeActor`.
      "an-equal-value-adopts-the-identitys-lane"(c0) {
        const r1 = editorRef(T42);
        const c = new Ctx(c0.fresh([editorFixture()]), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.dispose(at(r1));
        const r2 = actorRef(Editor1, { ticketId: "T-42", workspaceId: "north" });
        c.do(ensureStep(ensureArgs(r2)));
        c.answer("save", { ok: {} });
        c.eq("adopted and heard by the new incarnation", [c.mem().saved, c.incarnations(at(r1))], [1, 2]);
      },
    },
  },
  {
    // OD30 Q3: changing a persisted value-named machine's input fields is a new version. The saved record is an old-version record: listed at
    // ready (OldVersionActor), never renamed or matched by shared fields; the new value's ref is a fresh actor.
    id: "R14-ID-02",
    kind: "fault",
    fixtures: [editorFixture({ v: 1 })],
    cites: ["rule:74", "OD:30"],
    variants: {
      "a-field-added-is-a-new-version"(c0) {
        const rel: Release = { v: 1 };
        const r1 = editorRef(T42);
        const c = new Ctx(c0.fresh([editorFixture(rel)], { captureMs: 0 }), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { ok: {} });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        const names = (v: unknown) => (v as string[]).map((f) => f.split(":")[0]);
        c.eq("listed at ready, by field set", c.r.evidence("OldVersionActor").map((e) => [names(e["fields"]), names(e["now"])]), [[["ticketId", "workspaceId"], ["region", "ticketId", "workspaceId"]]]);
        c.eq("never restored", c.r.state(at(r1)), undefined);
        const r2 = actorRef(Editor2, { ...T42, region: "eu" });
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("a fresh actor of the new version", [c.r.memory(at(r2))?.title, c.r.memory(at(r2))?.region], ["", "eu"]);
        c.yes("the old record is still on disk, for forget", c.record(at(r1)) !== undefined);
      },
      // U17 B (OD48; rule 74): a version compares each field's type side and encoded side, ignoring annotations. A string becomes a number
      // encoded as a string: the encoded side is unchanged, the type side is not, so this is a new version, listed, and the new ref, which
      // encodes to the same name, starts fresh. Changed back from fix pass L1's "no new version" (encoded side only).
      "a-type-change-over-the-same-encoded-side-is-a-new-version"(c0) {
        const rel: Release = { v: 1 };
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const c = new Ctx(c0.fresh([editorFixture(rel)], { captureMs: 0 }), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { ok: {} });
        c.h.release(() => void (rel.v = 3), () => void (rel.v = 1));
        c.reload();
        c.eq("listed at ready", c.r.evidence("OldVersionActor").length, 1);
        const r3 = actorRef(Editor3, { workspaceId: "north", ticketId: 42 });
        c.eq("the same encoded name", r3.id, r1.id);
        c.do(ensureStep(ensureArgs(r3)));
        c.eq("a fresh actor, the old record not matched", c.r.memory(at(r3))?.title, "");
      },
      // The runner's format tag: Flow's version encoding says which format wrote it. A record saved before U17 (untagged format 1) is told apart from
      // one saved now (format 2) and compared by the part both write alike (`field:encoded`): with no Schema change it restores, no OldVersionActor.
      "a-record-saved-by-an-earlier-version-format-restores-when-its-schema-did-not-change"(c0) {
        const rel: Release = { v: 0 };
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const r0 = { ...r1, fields: editor1Format1 }; // the same ref as that Flow spelled it
        const c = new Ctx(c0.fresh([editorFormat1Fixture(rel)], { captureMs: 0 }), at(r1));
        c.do(ensureStep(ensureArgs(r0)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { ok: {} });
        c.yes("saved in the untagged format, a real format 1 hash", editor1Format1.every((f) => /#[0-9a-f]{8}$/.test(f)) && editor1Format1.every((f) => JSON.stringify([...c.r.stored().values()]).includes(f)));
        c.h.release(() => void (rel.v = 1), () => void (rel.v = 0));
        c.reload();
        c.eq("not listed", c.r.evidence("OldVersionActor").length, 0);
        c.do(ensureStep(ensureArgs(r1)));
        c.eq("its record, restored", c.r.memory(at(r1))?.title, "Foyer");
      },
      // U17 B: "a brand or a description is not" a new version. The record is restored under the annotated field.
      "a-description-change-is-no-new-version"(c0) {
        const rel: Release = { v: 1 };
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const c = new Ctx(c0.fresh([editorFixture(rel)], { captureMs: 0 }), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { ok: {} });
        c.h.release(() => void (rel.v = 5), () => void (rel.v = 1));
        c.reload();
        c.eq("not listed", c.r.evidence("OldVersionActor").length, 0);
        const r5 = actorRef(Editor5, { workspaceId: "north", ticketId: "42" });
        c.do(ensureStep(ensureArgs(r5)));
        c.eq("its record, restored", c.r.memory(at(r5))?.title, "Foyer");
      },
      // L1: a check on the encoded side (a string becomes a non-empty string) changes the encoded Schema: a new version, not a rename.
      "an-encoded-side-change-is-a-new-version"(c0) {
        const rel: Release = { v: 1 };
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const c = new Ctx(c0.fresh([editorFixture(rel)], { captureMs: 0 }), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { ok: {} });
        c.h.release(() => void (rel.v = 4), () => void (rel.v = 1));
        c.reload();
        c.eq("listed at ready", c.r.evidence("OldVersionActor").length, 1);
        const r4 = actorRef(Editor4, { workspaceId: "north", ticketId: "42" });
        c.eq("the same encoded name", r4.id, r1.id);
        c.do(ensureStep(ensureArgs(r4)));
        c.eq("a fresh actor, the old record not matched", c.r.memory(at(r4))?.title, "");
      },
    },
  },
  {
    // A singleton: a literal name, for a machine with no input (rule 74, D4: the form is fixed per machine by the types). Persistence is the
    // machine's (U15 B), so refs cannot disagree on it.
    id: "R14-ID-03",
    kind: "example",
    fixtures: [sessionFixture, editorFixture()],
    cites: ["rule:74", "sec:2.7.19"],
    variants: {
      "a-singleton-is-its-name"(c0) {
        c0.eq("its name is its identity", SessionRef.id, "coordinator");
        const c = new Ctx(c0.fresh([sessionFixture]), at(SessionRef));
        c.do(ensureStep(ensureArgs(SessionRef)));
        c.send("Ping");
        c.detach();
        c.advance(GRACE);
        c.do(ensureStep(ensureArgs(SessionRef)));
        c.eq("returned from its record", c.mem().pings, 1);
      },
      // U15 B, U19 A (OD48; rule 74): "refs carry no `persist`, so every ref of an identity agrees by construction". Two refs of one identity,
      // made apart, ensure the one persisted actor with no ConflictingActorRef; its record is saved at the end, as the definition says.
      "two-refs-of-one-identity-agree-on-persistence-by-construction"(c0) {
        const r1 = editorRef(T42);
        const r2 = actorRef(Editor1, T42);
        const c = new Ctx(c0.fresh([editorFixture()]), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("one identity", r2.id === r1.id, true);
        c.detach(at(r1));
        c.advance(GRACE);
        c.yes("still live: both ensures are uses of one actor", c.r.state(at(r1)) !== undefined);
        c.detach(at(r1));
        c.advance(GRACE);
        c.yes("persisted by the definition: its record stays", c.record(at(r1)) !== undefined);
        void EditorId;
      },
    },
  },
];
