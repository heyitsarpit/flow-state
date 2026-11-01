// machine-design 2.8.2's list, flat: one READY state. Keyed schedules, `create` and `.each` are absent (later rounds).
// CancelLike is added so scenarios can release by hand; the design's LikeUnsure fallback does it too.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import { deny, type Compiled, type DomainSpec, type Op } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

const D = "Issues/List";
const { node, commit, lookup, member, mapped, memory, key, slot } = fixtureOf(D);
export const MAX_LIKE_RESENDS = 3;
export const issueRef = (id: string) => `Issue|${id}`;

const named = ({ event }: any) => ({ id: event.id });
const toast = (message: string) => () => ({ toast: message });

const nodes = {
  root: node(
    "root",
    {
      Load: [{ members: lookup("list", () => ({})) }],
      Listed: [{}],
      ListFailed: [{}],
      Toggle: [{ members: commit("like", ({ event }) => ({ id: event.id, liked: event.liked })) }],
      Edit: [
        {
          guards: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle")],
          members: commit("rename", ({ event }) => ({ id: event.id, title: event.title })),
        },
      ],
      Delete: [
        {
          tokens: [{ op: "remove", verb: "idle", key: slot("on.Delete[0].guard[0]", named) }],
          members: commit("remove", ({ event }) => ({ id: event.id })),
        },
      ],
      ReconcileLike: [{ members: member("like", "retry", named) }],
      CancelLike: [{ members: member("like", "cancel", named) }],
      CancelRename: [{ members: member("rename", "cancel", named) }],
      Settled: [{}],
      IssueGone: [{}],
      Failed: [{ patch: ({ event }) => ({ toast: event.message }) }],
      LikeUnsure: [
        { tokens: [{ op: "like", verb: "retryable", times: MAX_LIKE_RESENDS }] },
        { patch: toast("Couldn't confirm your like"), members: member("like", "cancel") },
      ],
      RenameUnsure: [{ patch: ({ event }) => ({ toast: event.message }) }],
      RemoveUnsure: [{ patch: ({ event }) => ({ toast: event.message }) }],
    },
    [],
    undefined,
  ),
  READY: node("READY"),
};

const write = (
  api: Api,
  id: string,
  concurrency: Op["concurrency"],
  k: (i: any) => unknown,
  outcomes: Op["outcomes"],
): Op => ({
  id,
  contract: `issues/${id}`,
  kind: "write",
  key: key(id, k),
  concurrency,
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
      unknown,
      unknown
    >,
  outcomes,
});

const fail = (op: string, message: string) => mapped(op, "failure", "Failed", () => ({ message }));

const domain = (api: Api): DomainSpec => ({
  writes: {
    like: {
      predicts: slot("domain.like.predicts", (i: any) => [
        {
          ref: issueRef(i.id),
          patch: {
            liked: i.liked,
            likes: (b: any, x: any) => b.likes + (x.liked === b.liked ? 0 : x.liked ? 1 : -1),
          },
        },
      ]),
      confirms: (v) => (v ? [{ ref: issueRef(v.id), fields: v }] : []),
    },
    rename: {
      // The answer carries `title` only, so `slug` stays predicted: `unconfirmed` (2.8.6's success row).
      predicts: slot("domain.rename.predicts", (i: any) => [
        { ref: issueRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } },
      ]),
      confirms: (v, i) => [{ ref: issueRef(i.id), fields: { title: v.title } }],
    },
    remove: {
      predicts: slot("domain.remove.predicts", (i: any) => [{ ref: issueRef(i.id), remove: true }]),
      confirms: (_v, i) => [{ ref: issueRef(i.id), removed: true }],
    },
  },
  reads: {
    list: (v: any[]) => v.map((row) => ({ ref: issueRef(row.id), fields: row })),
  },
  repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
});

const make = (api: Api): Compiled => ({
  id: D,
  nodes,
  root: "root",
  default: "READY",
  memory: memory(() => ({ toast: null })),
  ops: {
    like: write(api, "like", "latest", (i) => ({ id: i.id }), {
      success: { event: "Settled" },
      failure: {
        Gone: { event: "IssueGone" },
        Refused: fail("like", "Could not update"),
        NotSent: fail("like", "Could not update"),
      },
      unknown: mapped("like", "unknown", "LikeUnsure", (_v, c) => ({ id: c.key.id })),
    }),
    rename: write(api, "rename", "latest", (i) => ({ id: i.id }), {
      success: { event: "Settled" },
      failure: {
        Gone: { event: "IssueGone" },
        Refused: fail("rename", "Couldn't save the title"),
        NotSent: fail("rename", "Couldn't save the title"),
      },
      unknown: mapped("rename", "unknown", "RenameUnsure", () => ({ message: "Couldn't confirm" })),
    }),
    remove: write(api, "remove", "reject", (i) => ({ id: i.id }), {
      success: { event: "Settled" },
      failure: {
        Gone: { event: "Settled" },
        Refused: fail("remove", "Couldn't delete"),
        NotSent: fail("remove", "Couldn't delete"),
      },
      unknown: mapped("remove", "unknown", "RemoveUnsure", () => ({ message: "Couldn't confirm" })),
    }),
    list: {
      id: "list",
      contract: "issues/in-project",
      kind: "read",
      key: key("list", () => ({})),
      concurrency: "reject",
      commit: (i) => api.call("list", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Listed" },
        failure: {
          NoResponse: { event: "ListFailed" },
          Defect: { event: "ListFailed" },
          Interrupted: { event: "ListFailed" },
        },
      },
    },
  },
  persisted: false,
  uses: ["entities"],
  domain: domain(api),
});

const row = (id: string) => ({ id, title: `title ${id}`, slug: `title ${id}`, liked: false, likes: 0 });
export const server: ServerModel = {
  init: () => ({ issues: { i1: row("i1"), i2: row("i2") }, writes: [] as string[] }),
  apply(op, i, s) {
    const cur = s.issues[i.id];
    if (!cur) return { s, fail: { _tag: "Gone" } };
    const next = (issues: object, value?: unknown) => ({
      s: { issues, writes: [...s.writes, `${op}:${i.id}:${i.liked ?? i.title ?? ""}`] },
      value,
    });
    if (op === "like") {
      const r = {
        ...cur,
        liked: i.liked,
        likes: cur.likes + (i.liked === cur.liked ? 0 : i.liked ? 1 : -1),
      };
      return next({ ...s.issues, [i.id]: r }, r);
    }
    if (op === "rename") {
      const r = { ...cur, title: i.title, slug: i.title.toLowerCase() };
      return next({ ...s.issues, [i.id]: r }, { title: i.title });
    }
    const { [i.id]: _gone, ...rest } = s.issues;
    return next(rest);
  },
  read: (op, i, s) =>
    op === "list" ? Object.values(s.issues) : (s.issues[i.ref.split("|")[1]] ?? null),
};

export const issuesFixture: Fixture = { id: D, make, server };
