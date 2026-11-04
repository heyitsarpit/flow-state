// Round 11: `fixtures/issues.compiled.ts` and its variants in `lab.compiled.ts`, with the machine in the public API and the domain in `Compiled`'s shape (D209).
// machine-design 2.8.2's list, flat: one READY state. The domain's `repair` reads through the fake, so the machine is made per world: `(api) => machine`.
import { Effect, Schema } from "effect";
import type { Api } from "../fake-world.ts";
import { server } from "../fixtures/issues.compiled.ts";
import { definition, deny, Flow, machine, resource, transaction, type DomainIn } from "../compile/index.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";

export { MAX_LIKE_RESENDS, issueRef, server } from "../fixtures/issues.compiled.ts";
import { MAX_LIKE_RESENDS, issueRef } from "../fixtures/issues.compiled.ts";

const S = Schema;
const U = S.Unknown;
type Opts = { readonly persisted?: boolean; readonly local?: boolean; readonly throwing?: boolean; readonly doubleCancel?: boolean; readonly denySettled?: boolean };
const contracts = (throwing: boolean) => ({
  like: transaction({ id: "issues/like", input: { id: U, liked: U }, key: ["id"], concurrency: "latest", services: [FakeApi], commit: write<unknown, "Gone" | "Refused">("like") }),
  rename: transaction({ id: "issues/rename", input: { id: U, title: U }, key: ["id"], concurrency: "latest", services: [FakeApi], commit: write<unknown, "Gone" | "Refused">("rename") }),
  remove: transaction({ id: "issues/remove", input: { id: U }, key: ["id"], concurrency: "reject", services: [FakeApi], commit: write<unknown, "Gone" | "Refused">("remove") }),
  list: resource({ id: "issues/in-project", input: {}, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("list")(i) }),
  // M8, H3: a write with no `unknownWhenLost`, as the hand `poke` has (`issuesThrowing`).
  ...(throwing ? { poke: transaction({ id: "issues/poke", input: { id: U }, key: ["id"], concurrency: "latest", services: [FakeApi], commit: (i, { attempt }) => call<unknown, "Gone" | "Refused">("poke")(i, attempt.id) }) } : {}),
});
const domainOf = (api: Api, throwing: boolean): DomainIn => ({
  writes: {
    like: {
      predicts: (i: { readonly id: string; readonly liked: boolean }) => [
        { ref: issueRef(i.id), patch: { liked: i.liked, likes: (b: { likes: number; liked: boolean }, x: { liked: boolean }) => b.likes + (x.liked === b.liked ? 0 : x.liked ? 1 : -1) } },
      ],
      confirms: (v: { readonly id: string } | null) => (v ? [{ ref: issueRef(v.id), fields: v }] : []),
    },
    // The answer carries `title` only, so `slug` stays predicted: `unconfirmed` (2.8.6's success row).
    rename: {
      predicts: (i: { readonly id: string; readonly title: string }) => [{ ref: issueRef(i.id), patch: { title: i.title, slug: i.title.toLowerCase() } }],
      confirms: (v: { readonly title: string }, i: { readonly id: string }) => [{ ref: issueRef(i.id), fields: { title: v.title } }],
    },
    remove: {
      predicts: (i: { readonly id: string }) => [{ ref: issueRef(i.id), remove: true }],
      confirms: (_v: unknown, i: { readonly id: string }) => [{ ref: issueRef(i.id), removed: true }],
    },
    ...(throwing
      ? {
          poke: {
            predicts: (i: { readonly id: string }) => [
              {
                ref: `Issue|${i.id}`,
                patch: {
                  title: () => {
                    throw new Error("field function");
                  },
                },
              },
            ],
          },
        }
      : {}),
  },
  reads: { list: (v: ReadonlyArray<{ readonly id: string }>) => v.map((row) => ({ ref: issueRef(row.id), fields: row })) },
  repair: (ref: string) => api.call("repair", { ref }) as Effect.Effect<unknown, unknown, never>,
});
const issues = (o: Opts) => (api: Api) => {
  const c = contracts(o.throwing ?? false);
  const d = definition({
    id: "Issues/List",
    states: ["READY"],
    events: {
      Load: {}, Toggle: { id: U, liked: U }, Edit: { id: U, title: S.String }, Delete: { id: U }, ReconcileLike: { id: U }, CancelLike: { id: U }, CancelRename: { id: U },
      ...(o.throwing ? { Poke: { id: U }, TwoBad: { id: U } } : {}),
    },
    internalEvents: { Listed: {}, ListFailed: {}, Settled: {}, IssueGone: {}, Failed: { message: S.String }, LikeUnsure: Flow.uncertain({ id: U }), RenameUnsure: Flow.uncertain({ message: S.String }), RemoveUnsure: Flow.uncertain({ message: S.String }) },
    memory: { toast: Flow.initial(U, null) },
    persisted: o.persisted ?? false,
    ...(o.local ? { local: true as const } : {}),
    uses: ["entities"],
    domain: domainOf(api, o.throwing ?? false),
    operations: ({ E }) => {
      const fail = (message: string) => E.Failed.from(() => ({ message }));
      return {
        like: c.like.outcomes({ success: E.Settled, failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") }, unknown: E.LikeUnsure.from((_v, x) => ({ id: (x.key as { readonly id: unknown }).id })) }),
        rename: c.rename.outcomes({ success: E.Settled, failure: { Gone: E.IssueGone, Refused: fail("Couldn't save the title"), NotSent: fail("Couldn't save the title") }, unknown: E.RenameUnsure.from(() => ({ message: "Couldn't confirm" })) }),
        remove: c.remove.outcomes({ success: E.Settled, failure: { Gone: E.Settled, Refused: fail("Couldn't delete"), NotSent: fail("Couldn't delete") }, unknown: E.RemoveUnsure.from(() => ({ message: "Couldn't confirm" })) }),
        list: c.list.outcomes({ success: E.Listed, failure: { NoResponse: E.ListFailed, Defect: E.ListFailed, Interrupted: E.ListFailed } }),
        ...(c.poke ? { poke: c.poke.outcomes({ success: E.Settled, failure: { Gone: E.IssueGone, Refused: fail("Could not update"), NotSent: fail("Could not update") }, unknown: E.LikeUnsure.from((_v, x) => ({ id: (x.key as { readonly id: unknown }).id })) }) } : {}),
      };
    },
  });
  return machine(d, ({ S: St, O }) => {
    const named = ({ event }: { readonly event: { readonly id: unknown } }) => ({ id: event.id });
    const ops = O as typeof O & { readonly poke?: { readonly commit: (f: (a: { readonly event: unknown }) => { readonly id: unknown }) => (typeof O)["like"]["retry"] } };
    return {
      default: St.READY,
      on: {
        Load: { actions: [O.list.lookup(() => ({}))] },
        Listed: {},
        ListFailed: {},
        Toggle: { actions: [O.like.commit(({ event }) => ({ id: event.id, liked: event.liked }))] },
        Edit: { guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle")], actions: [O.rename.commit(({ event }) => ({ id: event.id, title: event.title }))] },
        Delete: { guard: [O.remove.idle(named)], actions: [O.remove.commit(({ event }) => ({ id: event.id }))] },
        ReconcileLike: { actions: [O.like.retry(named)] },
        CancelLike: { actions: [O.like.cancel(named)] },
        CancelRename: { actions: [O.rename.cancel(named)] },
        // D22, F3.1: a success whose handler always denies (`issuesDenySettled`).
        Settled: o.denySettled ? { guard: [() => deny("Nope")] } : {},
        IssueGone: {},
        Failed: { updateMemory: ({ event }) => ({ toast: event.message }) },
        // D22: an unknown's handler with two key-less cancels (`issuesDoubleCancel`).
        LikeUnsure: o.doubleCancel
          ? { actions: [O.like.cancel, O.like.cancel] }
          : [{ guard: [O.like.retryable({ times: MAX_LIKE_RESENDS })] }, { updateMemory: () => ({ toast: "Couldn't confirm your like" }), actions: [O.like.cancel] }],
        RenameUnsure: { updateMemory: ({ event }) => ({ toast: event.message }) },
        RemoveUnsure: { updateMemory: ({ event }) => ({ toast: event.message }) },
        ...(o.throwing && ops.poke
          ? {
              Poke: { actions: [ops.poke.commit(({ event }) => ({ id: (event as { readonly id: unknown }).id }))] },
              // Two members, so a module can fail on the first and a closure refuse the turn on the second (L6).
              TwoBad: {
                actions: [
                  O.like.commit(({ event }) => ({ id: (event as { readonly id: unknown }).id, liked: true })),
                  O.rename.commit(({ event }) => ({ id: (event as { readonly id: unknown }).id, title: "t" })),
                ],
              },
            }
          : {}),
      },
    };
  });
};
export const issuesFixture = fixture(issues({}), server);
// lab.compiled.ts's variants of the same list.
export const issuesPersisted = fixture(issues({ persisted: true }), server);
export const issuesLocal = fixture(issues({ local: true }), server);
export const issuesThrowing = fixture(issues({ throwing: true }), server);
export const issuesDoubleCancel = fixture(issues({ doubleCancel: true }), server);
export const issuesDenySettled = fixture(issues({ denySettled: true }), server);
