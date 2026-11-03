// Round 11: `fixtures/comments.compiled.ts`, with the machines and the Comments trait in the public API and the domain in `Compiled`'s shape (D209). desk
// Comments/comments.trait.ts's post and delete paths, flattened. Two hosts as the real one: the editor's root trait (path []) and the queue's preview with
// `resetOn` (path [ticketId], rule 51).
import { Effect, Schema } from "effect";
import type { Api, ServerModel } from "../fake-world.ts";
import { definition, deny, Flow, fragment, machine, resource, transaction, type DomainIn } from "./flow.ts";
import { call, fixture, write } from "./lab.ts";

// The ref and the fake server's model, copied from the hand file: that file does not type-check under the types gate's options (`exactOptionalPropertyTypes`),
// and the gate follows imports. The world's model is not a machine.
export const commentRef = (ticket: string, id: string) => `Comment|${ticket}/${id}`;
type CS = { readonly posts: readonly string[]; readonly comments: Readonly<Record<string, { readonly commentId: string; readonly aged?: boolean; readonly [k: string]: unknown }>> };
const server: ServerModel = {
  init: () => ({ posts: [] as string[], comments: { c1: { commentId: "c1", text: "one", aged: false }, c2: { commentId: "c2", text: "two", aged: true } } }),
  apply(op, i, s: CS) {
    if (op === "post") return { s: { ...s, posts: [...s.posts, i.text] }, value: { clientId: i.clientId } };
    if (op === "react") return { s, value: {} };
    if (op === "pin") {
      const c = s.comments[i.commentId];
      if (!c) return { s, fail: { _tag: "CommentGone" } };
      const row = { ...c, pinned: i.pinned };
      return { s: { ...s, comments: { ...s.comments, [i.commentId]: row } }, value: row };
    }
    const cur = s.comments[i.commentId];
    if (!cur) return { s, fail: { _tag: "CommentGone" } };
    if (cur.aged) return { s, fail: { _tag: "EditWindowClosed" } };
    const { [i.commentId]: _gone, ...rest } = s.comments;
    return { s: { ...s, comments: rest }, value: {} };
  },
  read: (op, i, s: CS) => (op === "thread" ? Object.values(s.comments) : (s.comments[(i.ref as string).split("/")[1]!] ?? null)),
};
const handEditor = { server };
const S = Schema;
const U = S.Unknown;
type Draft = { readonly clientId: string; readonly problem: string | null; readonly [k: string]: unknown };
const upsert = (drafts: readonly Draft[], mine: { readonly clientId: string }, patch: object = {}) =>
  drafts.some((d) => d.clientId === mine.clientId) ? drafts.map((d) => (d.clientId === mine.clientId ? { ...d, ...patch } : d)) : [...drafts, { ...mine, sent: false, problem: null, ...patch }];
const draftOf = (drafts: readonly Draft[], id: string) => drafts.find((d) => d.clientId === id);
type Mem = { readonly ticketId: unknown; readonly drafts: readonly Draft[] };
const ticketKey = ({ memory }: { readonly memory: Mem }) => ({ ticketId: memory.ticketId });
const commentKey = ({ memory, event }: { readonly memory: Mem; readonly event: { readonly commentId: unknown } }) => ({ ticketId: memory.ticketId, commentId: event.commentId });
const isDraft =
  (problems: readonly (string | null)[], code: string) =>
  ({ memory, event }: { readonly memory: Mem; readonly event: { readonly clientId: string } }) =>
    problems.includes(draftOf(memory.drafts, event.clientId)?.problem ?? null) || deny(code);

const key2 = ["ticketId", "commentId"] as const;
const post = transaction({ id: "comments/post", input: { ticketId: U, clientId: U, text: U }, key: ["ticketId"], concurrency: "serialize", commit: write<unknown, "CommentRejected">("post") });
const pin = transaction({ id: "comments/pin", input: { ticketId: U, commentId: U, pinned: U }, key: key2, concurrency: "reject", commit: write<unknown, "CommentGone">("pin") });
const react = transaction({ id: "comments/react", input: { ticketId: U, commentId: U, emoji: U, on: U }, key: key2, concurrency: "reject", commit: write<unknown, "CommentGone">("react") });
const remove = transaction({ id: "comments/remove", input: { ticketId: U, commentId: U }, key: key2, concurrency: "reject", commit: write<unknown, "EditWindowClosed" | "CommentGone">("remove") });
const thread = resource({ id: "comments/thread", input: { ticketId: U }, key: ["ticketId"], commit: (i) => call<unknown, "NoResponse">("thread")(i) });
const Comments = fragment(
  {
    id: "Comments",
    events: {
      Load: {}, Pin: { commentId: U, pinned: U }, React: { commentId: U, emoji: U, on: U }, Post: { clientId: S.String, text: S.String }, Resend: { clientId: S.String },
      GiveUp: { clientId: S.String }, Delete: { commentId: U },
    },
    internalEvents: {
      Loaded: {}, LoadFailed: {}, PinUnsure: {}, Reacted: {}, ReactUnsure: {}, Posted: { clientId: S.String, text: U }, PostRejected: { clientId: S.String, text: U },
      PostNotSent: { clientId: S.String, text: U }, PostUnsure: { clientId: S.String, text: U }, Changed: {}, ChangeRefused: { notice: S.String }, DeleteUnsure: {},
    },
    memory: { ticketId: Flow.input(U), drafts: Flow.initial(S.Array(U), []), notice: Flow.initial(U, "") },
    operations: ({ E }) => {
      const mine = (_e: unknown, c: { readonly input: unknown }) => ({ clientId: (c.input as { readonly clientId: string }).clientId, text: (c.input as { readonly text: unknown }).text });
      const refused = (notice: string) => E.ChangeRefused.from(() => ({ notice }));
      return {
        post: post.outcomes({ success: E.Posted.from(mine), failure: { CommentRejected: E.PostRejected.from(mine), NotSent: E.PostNotSent.from(mine) }, unknown: E.PostUnsure.from(mine) }),
        pin: pin.outcomes({ success: E.Changed, failure: { CommentGone: refused("That comment was deleted"), NotSent: refused("Not pinned") }, unknown: E.PinUnsure }),
        react: react.outcomes({ success: E.Reacted, failure: { CommentGone: E.Reacted, NotSent: E.Reacted }, unknown: E.ReactUnsure }),
        remove: remove.outcomes({
          success: E.Changed,
          failure: { EditWindowClosed: refused("Past the edit window: the comment stays"), CommentGone: E.Changed, NotSent: refused("That delete was not sent") },
          unknown: E.DeleteUnsure,
        }),
        thread: thread.outcomes({ success: E.Loaded, failure: { NoResponse: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed } }),
      };
    },
  },
  ({ O }) => {
    const drafts = (m: { readonly drafts: readonly unknown[] }) => m.drafts as readonly Draft[];
    return {
      on: {
        Load: { actions: [O.thread.lookup(ticketKey as never)] },
        Loaded: {},
        LoadFailed: {},
        // comments.trait.ts's Pin and React, as written: a domain write with an idle guard, and a plain write in a machine that uses the store.
        Pin: { guard: [O.pin.idle(commentKey as never)], actions: [O.pin.commit(({ memory, event }) => ({ ticketId: memory.ticketId, commentId: event.commentId, pinned: event.pinned }))] },
        PinUnsure: { actions: [O.pin.cancel] },
        React: { actions: [O.react.commit(({ memory, event }) => ({ ticketId: memory.ticketId, commentId: event.commentId, emoji: event.emoji, on: event.on }))] },
        Reacted: {},
        ReactUnsure: { actions: [O.react.cancel] },
        Post: {
          guard: [
            ({ memory }) => memory.ticketId !== "" || deny("NoTicket"),
            ({ event }) => event.text.trim() !== "" || deny("EmptyComment"),
            ({ memory, event }) => !draftOf(drafts(memory), event.clientId) || deny("DuplicateDraft"),
          ],
          updateMemory: ({ memory, event }) => ({ drafts: upsert(drafts(memory), event) }),
          actions: [O.post.commit(({ memory, event }) => ({ ticketId: memory.ticketId, clientId: event.clientId, text: event.text }))],
        },
        Resend: {
          guard: [isDraft(["unsure"], "NotUnsure") as never, O.post.retryable({ times: 3, key: ticketKey as never })],
          updateMemory: ({ memory, event }) => ({ drafts: drafts(memory).map((d) => (d.clientId === event.clientId ? { ...d, problem: null } : d)) }),
          actions: [O.post.retry.key(ticketKey as never)],
        },
        GiveUp: {
          guard: [isDraft(["unsure"], "NotUnsure") as never],
          updateMemory: ({ memory, event }) => ({ drafts: drafts(memory).map((d) => (d.clientId === event.clientId ? { ...d, problem: "gaveUp" } : d)) }),
          actions: [O.post.cancel.key(ticketKey as never)],
        },
        Delete: { guard: [O.remove.idle(commentKey as never)], actions: [O.remove.commit(commentKey as never)] },
        Posted: { updateMemory: ({ memory, event }) => ({ drafts: upsert(drafts(memory), event, { sent: true, problem: null }) }) },
        PostRejected: { updateMemory: ({ memory, event }) => ({ drafts: upsert(drafts(memory), event, { problem: "rejected" }) }) },
        PostNotSent: { updateMemory: ({ memory, event }) => ({ drafts: upsert(drafts(memory), event, { problem: "notSent" }) }) },
        PostUnsure: { updateMemory: ({ memory, event }) => ({ drafts: upsert(drafts(memory), event, { problem: "unsure" }) }) },
        Changed: { updateMemory: () => ({ notice: "" }) },
        ChangeRefused: { updateMemory: ({ event }) => ({ notice: event.notice }) },
        DeleteUnsure: [{ guard: [O.remove.retryable({ times: 1 })], actions: [O.remove.retry] }, { updateMemory: () => ({ notice: "We couldn't confirm that delete" }), actions: [O.remove.cancel] }],
      },
    };
  },
);
type C = { readonly ticketId: string; readonly commentId: string; readonly pinned?: unknown };
const domainOf = (api: Api): DomainIn => ({
  writes: {
    post: { predicts: () => [] },
    pin: {
      predicts: (i: C) => [{ ref: commentRef(i.ticketId, i.commentId), patch: { pinned: i.pinned } }],
      confirms: (v: { readonly pinned?: unknown } | undefined, i: C) => [{ ref: commentRef(i.ticketId, i.commentId), fields: { pinned: v?.pinned ?? i.pinned } }],
    },
    remove: {
      predicts: (i: C) => [{ ref: commentRef(i.ticketId, i.commentId), remove: true }],
      confirms: (_v: unknown, i: C) => [{ ref: commentRef(i.ticketId, i.commentId), removed: true }],
    },
  },
  reads: { thread: (v: readonly { readonly commentId: string }[], i: { readonly ticketId: string }) => v.map((c) => ({ ref: commentRef(i.ticketId, c.commentId), fields: c })) },
  repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
});
const editor = (api: Api) =>
  machine(
    definition({ id: "Desk/Editor", states: { READY: {} }, events: {}, internalEvents: {}, memory: {}, persisted: false, uses: ["entities"], domain: domainOf(api), places: { comments: Comments }, operations: () => ({}) }),
    ({ S: St }) => ({ default: St.READY, traits: { comments: { input: () => ({ ticketId: "T-42" }) } } }),
  );
const queue = (api: Api) =>
  machine(
    definition({
      id: "Desk/Queue",
      states: { READY: {} },
      events: { Preview: { id: U } },
      internalEvents: {},
      memory: { previewId: Flow.initial(U, "T-1") },
      persisted: false,
      uses: ["entities"],
      domain: domainOf(api),
      places: { comments: Comments },
      operations: () => ({}),
    }),
    ({ S: St }) => ({
      default: St.READY,
      on: { Preview: { updateMemory: ({ event }) => ({ previewId: event.id }) } },
      traits: { comments: { input: ({ memory }) => ({ ticketId: memory.previewId }), resetOn: ({ memory }) => memory.previewId } },
    }),
  );
export const editorFixture = fixture(editor, handEditor.server);
export const queueFixture = fixture(queue, handEditor.server);
