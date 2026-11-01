// S2's commit matrix on the real driver. `behaviour` picks the commit's shape; the fake tracks it as a request, so the
// suite can check the wire claim. Translated from s2-completion/main.ts's scenarios.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api } from "../fake-world.ts";
import type { Compiled } from "./compiled.ts";
import { fixtureOf } from "./build.ts";
import { Outcome } from "./compiled.ts";

const D = "Drv";
const { node, commit, member, memory, key } = fixtureOf(D);
const ys = (n: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < n; i++) yield* Effect.yieldNow;
  });
export const BEHAVIOURS: Readonly<Record<string, Effect.Effect<unknown, unknown>>> = {
  success: ys(3).pipe(Effect.as({ ok: 1 })),
  failure: ys(2).pipe(Effect.andThen(Outcome.failure({ _tag: "Nope" }))),
  unknown: ys(2).pipe(Effect.andThen(Outcome.unknown({ _tag: "Lost" }))),
  defect: ys(2).pipe(Effect.andThen(Effect.die("bug"))),
  sync: Effect.succeed({ ok: 1 }),
  finalizer: Effect.acquireUseRelease(
    ys(1),
    () => ys(3).pipe(Effect.as({ ok: 1 })),
    () => ys(4),
  ),
  uninterruptible: Effect.uninterruptible(ys(4)).pipe(Effect.as({ ok: 1 })),
  hang: Effect.never,
  uninterruptibleHang: Effect.uninterruptible(Effect.never),
};
const nodes = {
  root: node(
    "root",
    {
      Go: [{ members: commit("job", ({ event }) => event) }],
      GoOther: [{ members: commit("other", ({ event }) => event) }],
      GoBoth: [
        {
          members: (p) => [...commit("job", ({ event }) => event)(p), ...commit("other", ({ event }) => event)(p)],
        },
      ],
      Cancel: [{ members: member("job", "cancel", () => ({})) }],
      Ended: [{ patch: ({ memory: m, event }) => ({ ends: [...m.ends, event.how] }) }],
    },
    [],
    undefined,
  ),
  READY: node("READY"),
};
const outcome = (how: string) => ({
  event: "Ended",
  from: {
    run: () => ({ how }),
    at: { definition: D, path: `operations.${how}` },
  },
});
const op = (api: Api, id: string, timeoutMs?: number) => ({
  id,
  contract: `drv/${id}`,
  kind: "write" as const,
  key: key(id, () => ({})),
  concurrency: "reject" as const,
  ...(timeoutMs === undefined ? {} : { timeoutMs }),
  commit: (input: any, { attempt }: any) =>
    api.track(id, attempt.id, BEHAVIOURS[input.behaviour]!) as Effect.Effect<unknown, unknown>,
  outcomes: {
    success: outcome("success"),
    failure: { Nope: outcome("failure"), NotSent: outcome("notSent") },
    unknown: outcome("unknown"),
  },
});
const make = (api: Api): Compiled => ({
  id: D,
  nodes,
  root: "root",
  default: "READY",
  memory: memory(() => ({ ends: [] })),
  ops: { job: op(api, "job", 1000), other: op(api, "other") },
  persisted: false,
  uses: [],
});
export const drvFixture: Fixture = { id: D, make };
