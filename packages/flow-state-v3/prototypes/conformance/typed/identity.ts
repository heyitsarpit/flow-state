// Round 14 (OD30, rule 74, 2.7.19): an actor is its machine plus its input. Editor is named by its value (`workspaceId`, `ticketId`); release 2 adds
// `region`, a new version. Session is a singleton, a machine with no input (D4).
import { Schema } from "effect";
import { actorRef, definition, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

export const EditorId = "Lab/Editor";
export const SessionId = "Lab/Session";
const S = Schema;
export type Release = { v: number };
const save = transaction({ id: "ed/save", input: { ticketId: S.String, title: S.String }, key: ["ticketId"], concurrency: "reject", services: [FakeApi], commit: write("save") });
const editorEvents = { Title: { title: S.String } } as const;
const editorInternal = { Saved: {}, SaveNo: {}, SaveUnsure: Flow.uncertain({}) } as const;
const editorOps = ({ E }: { E: any }) => ({ save: save.outcomes({ success: E.Saved, failure: { NotSent: E.SaveNo }, unknown: E.SaveUnsure }) });
const editorV1 = () => {
  const d = definition({
    id: EditorId,
    states: ["OPEN"],
    events: editorEvents,
    internalEvents: editorInternal,
    memory: { workspaceId: Flow.input(S.String), ticketId: Flow.input(S.String), title: Flow.initial(S.String, ""), saved: Flow.initial(S.Number, 0) },
    persisted: true,
    operations: editorOps,
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.OPEN,
    on: {
      Title: { updateMemory: ({ event }) => ({ title: event.title }), actions: [O.save.commit(({ memory, event }) => ({ ticketId: memory.ticketId, title: event.title }))] },
      Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
      SaveNo: {},
      SaveUnsure: {},
    },
  }));
};
const editorV2 = () => {
  const d = definition({
    id: EditorId,
    states: ["OPEN"],
    events: editorEvents,
    internalEvents: editorInternal,
    memory: { workspaceId: Flow.input(S.String), ticketId: Flow.input(S.String), region: Flow.input(S.String), title: Flow.initial(S.String, ""), saved: Flow.initial(S.Number, 0) },
    persisted: true,
    operations: editorOps,
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.OPEN,
    on: {
      Title: { updateMemory: ({ event }) => ({ title: event.title }), actions: [O.save.commit(({ memory, event }) => ({ ticketId: memory.ticketId, title: event.title }))] },
      Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
      SaveNo: {},
      SaveUnsure: {},
    },
  }));
};
// Release 3: the same field names, `ticketId` now a number encoded as a string: the encoded side is a string still, the type side changed, so by
// rule 74 (U17 B) a new version. Release 4: `ticketId` a non-empty string, a check on both sides: a new version. Release 5: `ticketId` with a
// description only: no new version.
const editorV3 = (ticketId: typeof S.NumberFromString | typeof S.NonEmptyString | typeof S.String = S.NumberFromString) => {
  const d = definition({
    id: EditorId,
    states: ["OPEN"],
    events: editorEvents,
    internalEvents: editorInternal,
    memory: { workspaceId: Flow.input(S.String), ticketId: Flow.input(ticketId), title: Flow.initial(S.String, ""), saved: Flow.initial(S.Number, 0) },
    persisted: true,
    operations: () => ({}),
  });
  return machine(d, ({ S: St }) => ({ default: St.OPEN, on: { Title: { updateMemory: ({ event }) => ({ title: event.title }) } } }));
};
export const Editor1 = editorV1();
export const Editor2 = editorV2();
export const Editor3 = editorV3();
export const Editor4 = editorV3(S.NonEmptyString);
export const Editor5 = editorV3(S.String.annotate({ description: "the ticket" }));
export const editorFixture = (rel: Release = { v: 1 }) => fixture(() => (rel.v === 1 ? Editor1 : rel.v === 2 ? Editor2 : rel.v === 3 ? Editor3 : rel.v === 4 ? Editor4 : Editor5));
const session = definition({
  id: SessionId,
  states: ["ON"],
  events: { Ping: {} },
  internalEvents: {},
  memory: { pings: Flow.initial(S.Number, 0) }, // D4: a singleton's machine has no input
  persisted: true,
  operations: () => ({}),
});
export const Session = machine(session, ({ S: St }) => ({ default: St.ON, on: { Ping: { updateMemory: ({ memory }) => ({ pings: memory.pings + 1 }) } } }));
export const sessionFixture = fixture(Session);
// The refs, as an app writes them (2.7.19).
export const editorRef = (ticket: { readonly workspaceId: string; readonly ticketId: string }) => actorRef(Editor1, ticket, { persist: true });
export const SessionRef = actorRef(Session, "coordinator", { persist: true });
