// desk Comments/comments.trait.ts, the post and delete paths, flattened: no thread subscribe (round 4), `lookup` in its place;
// no pin, edit, react, markRead. Two hosts as the real one: the editor's root trait (path []) and the queue's preview with
// `resetOn` (path [ticketId], rule 51). `serialize`, a held head, Resend, GiveUp, adoption by A, B, A. Reads are bare of paging.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import { deny, type Compiled, type Fragment, type Node, type Op } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

export const commentRef = (ticket: string, id: string) => `Comment|${ticket}/${id}`;
const t = fixtureOf("Comments");
const upsert = (drafts: any[], mine: any, patch: object = {}) =>
  drafts.some((d) => d.clientId === mine.clientId)
    ? drafts.map((d) => (d.clientId === mine.clientId ? { ...d, ...patch } : d))
    : [...drafts, { ...mine, sent: false, problem: null, ...patch }];
const draftOf = (drafts: any[], id: string) => drafts.find((d) => d.clientId === id);
const ticketKey = ({ memory }: any) => ({ ticketId: memory.ticketId });
const commentKey = ({ memory, event }: any) => ({
  ticketId: memory.ticketId,
  commentId: event.commentId,
});
const isDraft =
  (problems: readonly (string | null)[], code: string) =>
  ({ memory, event }: any) =>
    problems.includes(draftOf(memory.drafts, event.clientId)?.problem ?? null) || deny(code);

const Comments: Fragment = {
  id: "Comments",
  root: "root",
  default: "root",
  nodes: {
    root: {
      id: "root",
      schedules: [],
      on: t.on("", {
        Load: [{ members: t.lookup("thread", ticketKey) }],
        Loaded: [{}],
        LoadFailed: [{}],
        Post: [
          {
            guards: [
              ({ memory }: any) => memory.ticketId !== "" || deny("NoTicket"),
              ({ event }: any) => event.text.trim() !== "" || deny("EmptyComment"),
              ({ memory, event }: any) =>
                !draftOf(memory.drafts, event.clientId) || deny("DuplicateDraft"),
            ],
            patch: ({ memory, event }: any) => ({ drafts: upsert(memory.drafts, event) }),
            members: t.commit("post", ({ memory, event }: any) => ({
              ticketId: memory.ticketId,
              clientId: event.clientId,
              text: event.text,
            })),
          },
        ],
        Resend: [
          {
            guards: [isDraft(["unsure"], "NotUnsure")],
            tokens: [
              {
                op: "post",
                verb: "retryable",
                times: 3,
                key: t.slot("on.Resend[0].guard[1]", ticketKey),
              },
            ],
            patch: ({ memory, event }: any) => ({
              drafts: memory.drafts.map((d: any) =>
                d.clientId === event.clientId ? { ...d, problem: null } : d,
              ),
            }),
            members: t.member("post", "retry", ticketKey),
          },
        ],
        GiveUp: [
          {
            guards: [isDraft(["unsure"], "NotUnsure")],
            patch: ({ memory, event }: any) => ({
              drafts: memory.drafts.map((d: any) =>
                d.clientId === event.clientId ? { ...d, problem: "gaveUp" } : d,
              ),
            }),
            members: t.member("post", "cancel", ticketKey),
          },
        ],
        Delete: [
          {
            tokens: [
              { op: "remove", verb: "idle", key: t.slot("on.Delete[0].guard[0]", commentKey) },
            ],
            members: t.commit("remove", commentKey),
          },
        ],
        Posted: [
          {
            patch: ({ memory, event }: any) => ({
              drafts: upsert(memory.drafts, event, { sent: true, problem: null }),
            }),
          },
        ],
        PostRejected: [
          {
            patch: ({ memory, event }: any) => ({
              drafts: upsert(memory.drafts, event, { problem: "rejected" }),
            }),
          },
        ],
        PostNotSent: [
          {
            patch: ({ memory, event }: any) => ({
              drafts: upsert(memory.drafts, event, { problem: "notSent" }),
            }),
          },
        ],
        PostUnsure: [
          {
            patch: ({ memory, event }: any) => ({
              drafts: upsert(memory.drafts, event, { problem: "unsure" }),
            }),
          },
        ],
        Changed: [{ patch: () => ({ notice: "" }) }],
        ChangeRefused: [{ patch: ({ event }: any) => ({ notice: event.notice }) }],
        DeleteUnsure: [
          {
            tokens: [{ op: "remove", verb: "retryable", times: 1 }],
            members: t.member("remove", "retry"),
          },
          {
            patch: () => ({ notice: "We couldn't confirm that delete" }),
            members: t.member("remove", "cancel"),
          },
        ],
      }),
    },
  },
  memory: {
    initial: t.slot("memory.initial", (i: any) => ({
      ticketId: i.ticketId,
      drafts: [] as any[],
      notice: "",
    })),
  },
};

const mine = (_e: any, c: any) => ({ clientId: c.input.clientId, text: c.input.text });
const opsFor = (api: Api): Record<string, Op> => {
  const write = (
    id: string,
    key: (i: any) => unknown,
    concurrency: Op["concurrency"],
    outcomes: Op["outcomes"],
  ): Op => ({
    id,
    contract: `comments/${id}`,
    kind: "write",
    fragment: "Comments",
    key: t.key(id, key),
    concurrency,
    commit: (input, { attempt }) =>
      api.call(id, input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
        unknown,
        unknown
      >,
    outcomes,
  });
  const refused = (notice: string) =>
    t.mapped("remove", "failure", "ChangeRefused", () => ({ notice }));
  return {
    post: write("post", (i) => ({ ticketId: i.ticketId }), "serialize", {
      success: t.mapped("post", "success", "Posted", mine),
      failure: {
        CommentRejected: t.mapped("post", "failure.CommentRejected", "PostRejected", mine),
        NotSent: t.mapped("post", "failure.NotSent", "PostNotSent", mine),
      },
      unknown: t.mapped("post", "unknown", "PostUnsure", mine),
    }),
    remove: write("remove", (i) => ({ ticketId: i.ticketId, commentId: i.commentId }), "reject", {
      success: { event: "Changed" },
      failure: {
        EditWindowClosed: refused("Past the edit window: the comment stays"),
        CommentGone: { event: "Changed" },
        NotSent: refused("That delete was not sent"),
      },
      unknown: { event: "DeleteUnsure" },
    }),
    thread: {
      id: "thread",
      contract: "comments/thread",
      kind: "read",
      fragment: "Comments",
      key: t.key("thread", (i) => i),
      concurrency: "reject",
      commit: (i) => api.call("thread", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Loaded" },
        failure: {
          NoResponse: { event: "LoadFailed" },
          Defect: { event: "LoadFailed" },
          Interrupted: { event: "LoadFailed" },
        },
      },
    },
  };
};
const domain = (api: Api): Compiled["domain"] => ({
  writes: {
    post: { predicts: t.slot("domain.post.predicts", () => []) },
    remove: {
      predicts: t.slot("domain.remove.predicts", (i: any) => [
        { ref: commentRef(i.ticketId, i.commentId), remove: true },
      ]),
      confirms: (_v, i) => [{ ref: commentRef(i.ticketId, i.commentId), removed: true }],
    },
  },
  reads: {
    thread: (v: any[], i: any) =>
      v.map((c) => ({ ref: commentRef(i.ticketId, c.commentId), fields: c })),
  },
  repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
});

const host =
  (id: string, placementExtra: object, on: Record<string, any>, memory: () => object) =>
  (api: Api): Compiled => {
    const h = fixtureOf(id);
    const root: Node = {
      ...h.node("root", on),
      placements: [{ name: "comments", fragment: "Comments", ...placementExtra } as never],
    };
    return {
      id,
      root: "root",
      default: "READY",
      fragments: { Comments },
      nodes: { root, READY: h.node("READY") },
      memory: h.memory(memory),
      ops: opsFor(api),
      persisted: false,
      uses: ["entities"],
      domain: domain(api),
    };
  };
const server: ServerModel = {
  init: () => ({
    posts: [] as string[],
    comments: {
      c1: { commentId: "c1", text: "one", aged: false },
      c2: { commentId: "c2", text: "two", aged: true },
    },
  }),
  apply(op, i, s) {
    if (op === "post")
      return { s: { ...s, posts: [...s.posts, i.text] }, value: { clientId: i.clientId } };
    const cur = s.comments[i.commentId];
    if (!cur) return { s, fail: { _tag: "CommentGone" } };
    if (cur.aged) return { s, fail: { _tag: "EditWindowClosed" } };
    const { [i.commentId]: _gone, ...rest } = s.comments;
    return { s: { ...s, comments: rest }, value: {} };
  },
  read: (op, i, s) =>
    op === "thread" ? Object.values(s.comments) : (s.comments[i.ref.split("/")[1]] ?? null),
};
const editorInput = fixtureOf("Desk/Editor");
export const editorFixture: Fixture = {
  id: "Desk/Editor",
  server,
  make: host(
    "Desk/Editor",
    { input: editorInput.slot("traits.comments.input", () => ({ ticketId: "T-42" })) },
    {},
    () => ({}),
  ),
};
const queueHost = fixtureOf("Desk/Queue");
export const queueFixture: Fixture = {
  id: "Desk/Queue",
  server,
  make: host(
    "Desk/Queue",
    {
      input: queueHost.slot("traits.comments.input", ({ memory }: any) => ({
        ticketId: memory.previewId,
      })),
      resetOn: queueHost.slot("traits.comments.resetOn", ({ memory }: any) => memory.previewId),
    },
    { Preview: [{ patch: ({ event }: any) => ({ previewId: event.id }) }] },
    () => ({ previewId: "T-1" }),
  ),
};
