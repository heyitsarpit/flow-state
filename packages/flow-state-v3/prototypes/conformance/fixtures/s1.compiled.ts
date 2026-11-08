// S1's model as a real machine: one `latest` lane per actor, 2 records, a commit predicts mask 1, 2 or 3. `v` is the
// commit's order in the script, so the server can tell an inversion without any Flow vocabulary (a design-free oracle). `inverted` is
// across actors (commit order, which D3 as directed no longer keeps); `selfInverted` is one actor's own commits landing backwards.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api, ServerModel } from "../fake-world.ts";
import type { Compiled } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

const D = "S1";
const { node, commit, member, memory, key, slot } = fixtureOf(D);
const recsOf = (mask: number) => (mask === 1 ? ["r1"] : mask === 2 ? ["r2"] : ["r1", "r2"]);
export const s1Ref = (r: string) => `R|${r}`;

const nodes = {
  root: node(
    "root",
    {
      Commit: [{ members: commit("w", ({ event }) => event) }],
      Retry: [{ members: member("w", "retry", () => ({})) }],
      Cancel: [{ members: member("w", "cancel", () => ({})) }],
      Done: [{}],
      Refused: [{}],
      NotSent: [{}],
      Unsure: [{}],
    },
    [],
    undefined,
  ),
  READY: node("READY"),
};

const make = (api: Api): Compiled => ({
  id: D,
  nodes,
  root: "root",
  default: "READY",
  memory: memory(() => ({})),
  ops: {
    w: {
      id: "w",
      contract: "s1/w",
      kind: "write",
      key: key("w", () => ({})),
      concurrency: "latest",
      commit: (input, { attempt }) =>
        api.call("w", input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<
          unknown,
          unknown
        >,
      outcomes: {
        success: { event: "Done" },
        failure: { Refused: { event: "Refused" }, NotSent: { event: "NotSent" } },
        unknown: { event: "Unsure" },
      },
    },
  },
  persisted: false,
  uses: ["entities"],
  domain: {
    writes: {
      w: {
        predicts: slot("domain.w.predicts", (i: any) =>
          recsOf(i.mask).map((r) => ({ ref: s1Ref(r), patch: { v: i.v } })),
        ),
        confirms: (_val, i) => recsOf(i.mask).map((r) => ({ ref: s1Ref(r), fields: { v: i.v } })),
      },
    },
    reads: {},
    repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
  },
});

const server: ServerModel = {
  init: () => ({ records: { r1: 0, r2: 0 }, inverted: false, mine: {}, selfInverted: false }),
  apply: (_op, i, s) => {
    let inverted = s.inverted;
    let selfInverted = s.selfInverted;
    const records = { ...s.records };
    const own = { ...s.mine[i.actor] };
    for (const r of recsOf(i.mask)) {
      if (records[r] > i.v) inverted = true;
      if ((own[r] ?? 0) > i.v) selfInverted = true;
      records[r] = i.v;
      own[r] = Math.max(own[r] ?? 0, i.v);
    }
    return { s: { records, inverted, mine: { ...s.mine, [i.actor]: own }, selfInverted }, value: { v: i.v } };
  },
  read: (_op, i, s) => ({ v: s.records[i.ref.split("|")[1]] }),
};

export const s1Fixture: Fixture = { id: D, make, server };
