// Round 14 (OD30, rule 74, 2.7.19): an actor is its machine plus its input. A ref built from a value is named by the machine's `Flow.input`
// fields, in field-name order, and only those; the value is the input. A singleton has a literal name and takes input at ensure. Every
// expectation is the design's text, worked by hand.
import { actorRef, ensureArgs, type ActorRefOf } from "../compile/index.ts";
import { Editor1, Editor2, Editor3, EditorId, editorFixture, editorRef, SessionRef, sessionFixture, type Release } from "../typed/identity.ts";
import type { Step } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const T42 = { workspaceId: "north", ticketId: "T-42" };
// A ref as the suite's step: the actor it names, and the ensure the design gives it (a value ref with its value as input, and no input of its own).
const at = <I, F extends "value" | "singleton">(r: ActorRefOf<I, F>) => ({ actor: r.machine, id: r.id });
const ensureStep = (a: ReturnType<typeof ensureArgs>): Step => ({ ensure: { actor: a.machine, id: a.id }, ...(a.input === undefined ? {} : { input: a.input }), ...(a.identity ? { identity: a.identity } : {}), persist: a.persist });

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
        c.eq("the value is the input", [c.mem().workspaceId, c.mem().ticketId], ["north", "T-42"]);
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
        c.eq("listed at ready, by field set and Schema", c.r.evidence("OldVersionActor").map((e) => [e["fields"], e["now"]]), [[["ticketId:<String><-<String>", "workspaceId:<String><-<String>"], ["region:<String><-<String>", "ticketId:<String><-<String>", "workspaceId:<String><-<String>"]]]);
        c.eq("never restored", c.r.state(at(r1)), undefined);
        const r2 = actorRef(Editor2, { ...T42, region: "eu" });
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("a fresh actor of the new version", [c.r.memory(at(r2))?.title, c.r.memory(at(r2))?.region], ["", "eu"]);
        c.yes("the old record is still on disk, for forget", c.record(at(r1)) !== undefined);
      },
      // The same names, one field's Schema changed (a string becomes a number encoded as a string): a new version too, not a rename.
      "a-fields-schema-changed-is-a-new-version"(c0) {
        const rel: Release = { v: 1 };
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const c = new Ctx(c0.fresh([editorFixture(rel)], { captureMs: 0 }), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { ok: {} });
        c.h.release(() => void (rel.v = 3), () => void (rel.v = 1));
        c.reload();
        c.eq("listed at ready", c.r.evidence("OldVersionActor").map((e) => e["now"]), [["ticketId:<Number><-<String>", "workspaceId:<String><-<String>"]]);
        const r3 = actorRef(Editor3, { workspaceId: "north", ticketId: 42 });
        c.eq("the same encoded name", r3.id, r1.id);
        c.do(ensureStep(ensureArgs(r3)));
        c.eq("a fresh actor, the old record not matched", c.r.memory(at(r3))?.title, "");
      },
    },
  },
  {
    // A singleton: a literal name, for a machine with no input (rule 74, D4: the form is fixed per machine by the types). `ConflictingActorRef` is
    // left for two refs of one identity that disagree on `persist`.
    id: "R14-ID-03",
    kind: "example",
    fixtures: [sessionFixture, editorFixture()],
    cites: ["rule:74", "sec:2.7.19"],
    namedIssues: ["ConflictingActorRef"],
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
      "two-refs-that-disagree-on-persist-conflict"(c0) {
        const r1 = editorRef(T42);
        const c = new Ctx(c0.fresh([editorFixture()]), at(r1));
        c.do(ensureStep(ensureArgs(r1)));
        const r2 = actorRef(Editor1, T42, { persist: false });
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("refused at ensure", c.r.issues().filter((i) => i.code === "ConflictingActorRef").map((i) => i.input), [{ key: c.r.actorKey(at(r1)), persist: [true, false] }]);
        void EditorId;
      },
    },
  },
];
