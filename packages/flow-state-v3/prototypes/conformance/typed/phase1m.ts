// Phase 1 record migration: `Lab/Memo`, a persisted singleton. Release 1 saves a memo by `memoId`. Release 2 migrates it with what the design
// already has: the title's Schema decodes release 1's string into the new shape, a removed field is not declared, a new field is computed over the
// restored ones; and `save` is keyed by `memoId` and `rev`, declaring release 1's key as `previous`. Releases 3 and 4 change the record with no
// migration: a state removed, a memory field reshaped.
import { Schema, SchemaTransformation } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import { FakeApi, fixture, write } from "./lab.ts";

const S = Schema;
export const MemoId = "Lab/Memo";
const Title = S.Struct({ text: S.String, lang: S.String });
const TitleFromRelease1 = S.Union([Title, S.String.pipe(S.decodeTo(Title, SchemaTransformation.transform({ decode: (text: string) => ({ text, lang: "en" }), encode: (t: { readonly text: string }) => t.text })))]);
const internalEvents = { Saved: {}, SaveNo: { why: S.String }, SaveUnsure: Flow.uncertain({}) } as const;
const counts = { unsure: Flow.initial(S.Number, 0), why: Flow.initial(S.String, ""), saved: Flow.initial(S.Number, 0) };
const save1 = transaction({ id: "memo/save", input: { memoId: S.String, body: S.String }, key: ["memoId"], concurrency: "reject", services: [FakeApi], commit: write("save") });
const save2 = transaction({
  id: "memo/save",
  input: { memoId: S.String, rev: S.String, body: S.String },
  key: ["memoId", "rev"],
  previous: [{ key: { memoId: S.String } }],
  concurrency: "reject",
  services: [FakeApi],
  commit: write("save"),
});
const memory1 = { title: Flow.initial(S.String, ""), body: Flow.initial(S.String, ""), legacy: Flow.initial(S.Number, 0), ...counts };
const release1 = () => {
  const d = definition({
    id: MemoId,
    persist: true,
    states: ["DRAFT", "SENT"],
    events: { Title: { title: S.String }, Body: { body: S.String }, Save: {} },
    internalEvents,
    memory: memory1,
    operations: ({ E }) => ({ save: save1.outcomes({ success: E.Saved, failure: { NotSent: E.SaveNo.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.SaveUnsure }) }),
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.DRAFT,
    on: {
      Title: { updateMemory: ({ event }) => ({ title: event.title }) },
      Body: { updateMemory: ({ memory, event }) => ({ body: event.body, legacy: memory.legacy + 1 }) },
      Save: { target: St.SENT, actions: [O.save.commit(({ memory }) => ({ memoId: "m1", body: memory.body }))] },
      Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
      SaveNo: { updateMemory: ({ event }) => ({ why: event.why }) },
      SaveUnsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
// Release 3: release 1 with `SENT` removed; nothing maps a saved `SENT` anywhere.
const release3 = () => {
  const d = definition({
    id: MemoId,
    persist: true,
    states: ["DRAFT"],
    events: { Title: { title: S.String }, Body: { body: S.String }, Save: {} },
    internalEvents,
    memory: memory1,
    operations: ({ E }) => ({ save: save1.outcomes({ success: E.Saved, failure: { NotSent: E.SaveNo.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.SaveUnsure }) }),
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.DRAFT,
    on: {
      Title: { updateMemory: ({ event }) => ({ title: event.title }) },
      Body: { updateMemory: ({ event }) => ({ body: event.body }) },
      Save: { actions: [O.save.commit(({ memory }) => ({ memoId: "m1", body: memory.body }))] },
      Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
      SaveNo: { updateMemory: ({ event }) => ({ why: event.why }) },
      SaveUnsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
const release2 = () => {
  const d = definition({
    id: MemoId,
    persist: true,
    states: ["DRAFT", "SENT"],
    events: { Title: { title: S.String }, Body: { body: S.String }, Save: {}, Abandon: {}, Resend: {} },
    internalEvents,
    memory: {
      title: Flow.initial(TitleFromRelease1, { text: "", lang: "en" }),
      body: Flow.initial(S.String, ""),
      words: Flow.initial(S.Number, (start) => String(start["body"] ?? "").split(" ").filter((w) => w !== "").length),
      ...counts,
    },
    operations: ({ E }) => ({ save: save2.outcomes({ success: E.Saved, failure: { NotSent: E.SaveNo.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.SaveUnsure }) }),
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.DRAFT,
    on: {
      Title: { updateMemory: ({ event }) => ({ title: { text: event.title, lang: "en" } }) },
      Body: { updateMemory: ({ event }) => ({ body: event.body }) },
      Save: { target: St.SENT, actions: [O.save.commit(({ memory }) => ({ memoId: "m1", rev: String(memory.saved + 1), body: memory.body }))] },
      Abandon: { actions: [O.save.previous[0].cancel(() => ({ memoId: "m1" }))] },
      Resend: { actions: [O.save.previous[0].retry(() => ({ memoId: "m1" }))] },
      Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
      SaveNo: { updateMemory: ({ event }) => ({ why: event.why }) },
      SaveUnsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
const release4 = () => {
  const d = definition({
    id: MemoId,
    persist: true,
    states: ["DRAFT", "SENT"],
    events: { Title: { title: S.String }, Body: { body: S.String }, Save: {} },
    internalEvents,
    memory: { title: Flow.initial(Title, { text: "", lang: "en" }), body: Flow.initial(S.String, ""), ...counts },
    operations: ({ E }) => ({ save: save1.outcomes({ success: E.Saved, failure: { NotSent: E.SaveNo.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.SaveUnsure }) }),
  });
  return machine(d, ({ S: St, O }) => ({
    default: St.DRAFT,
    on: {
      Title: { updateMemory: ({ event }) => ({ title: { text: event.title, lang: "en" } }) },
      Body: { updateMemory: ({ event }) => ({ body: event.body }) },
      Save: { target: St.SENT, actions: [O.save.commit(({ memory }) => ({ memoId: "m1", body: memory.body }))] },
      Saved: { updateMemory: ({ memory }) => ({ saved: memory.saved + 1 }) },
      SaveNo: { updateMemory: ({ event }) => ({ why: event.why }) },
      SaveUnsure: { updateMemory: ({ memory }) => ({ unsure: memory.unsure + 1 }) },
    },
  }));
};
const Memo1 = release1();
const Memo2 = release2();
const Memo3 = release3();
const Memo4 = release4();
export const memoFixture = (rel: Release) => fixture(() => (rel.v === 1 ? Memo1 : rel.v === 2 ? Memo2 : rel.v === 3 ? Memo3 : Memo4));
