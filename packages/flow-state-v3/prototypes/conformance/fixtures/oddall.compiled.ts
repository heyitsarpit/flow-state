// Review H1: SEARCH-ODD fed values to one fixture with few closures. This one has a closure of every kind, each returning what a
// step set: every closure kind crossed with every odd value, by machine and not by value. `odd` is { kind, value } in memory, and in
// a commit's input so that the module's closures and the mappers can read it.
import type { Effect } from "effect";
import type { Api } from "../fake-world.ts";
import type { Fixture } from "../harness.ts";
import { fixtureOf } from "./build.ts";
import type { Compiled, Fragment, Op } from "./compiled.ts";

export const ODD_KINDS = [
  "patch",
  "guard",
  "followUp",
  "raiseKey",
  "raiseFrom",
  "notifyFrom",
  "exitFrom",
  "schedule",
  "portGuard",
  "memberKey",
  "commitInput",
  "opKey",
  "lookupInput",
  "placementInput",
  "resetOn",
  "fragInitial",
  "tokenKey",
  "success",
  "failure",
  "unknown",
  "predicts",
  "confirms",
  "reads",
  "repair",
] as const;
export type OddKind = (typeof ODD_KINDS)[number];
const pick = (odd: any, kind: OddKind, normal: unknown) =>
  odd?.kind === kind ? odd.value : normal;
const D = "Odd/All";
const f = fixtureOf(D);
const k = fixtureOf("OddKid");
const Kid: Fragment = {
  id: "OddKid",
  root: "root",
  default: "root",
  nodes: {
    root: k.node("root", {
      Poked: [
        {
          notify: [
            {
              name: "Told",
              from: k.slot("notify.Told.from", ({ event }: any) =>
                pick(event.odd, "notifyFrom", {}),
              ),
            },
          ],
        },
      ],
      Guarded: [{ tokens: [{ port: "go" }] }],
      Leave: [
        {
          exit: {
            name: "Out",
            from: k.slot("exit.Out.from", ({ event }: any) => pick(event.odd, "exitFrom", {})),
          },
        },
      ],
    }),
  },
  memory: {
    initial: k.slot("memory.initial", (i: any) => pick(i?.odd, "fragInitial", { n: 0 }) as object),
  },
};
const Each: Fragment = {
  id: "OddEach",
  root: "root",
  default: "root",
  nodes: { root: k.node("root", { Hit: [{}] }) },
  memory: { initial: k.slot("each.initial", () => ({})) },
};
const op = (api: Api, id: string): Op => ({
  id,
  contract: `odd/${id}`,
  kind: "write",
  key: f.key(id, (i: any) => pick(i?.odd, "opKey", { id: "x" })),
  concurrency: "reject",
  commit: (input, { attempt }) =>
    api.call(id, input, { idempotencyKey: attempt.id }) as Effect.Effect<unknown, unknown>,
  outcomes: {
    success: f.mapped(
      id,
      "success",
      "Done",
      (_v, c) => pick(c.input?.odd, "success", {}) as object,
    ),
    failure: {
      Refused: f.mapped(
        id,
        "failure",
        "Done",
        (_v, c) => pick(c.input?.odd, "failure", {}) as object,
      ),
      NotSent: { event: "Done" },
    },
    unknown: f.mapped(
      id,
      "unknown",
      "Done",
      (_v, c) => pick(c.input?.odd, "unknown", {}) as object,
    ),
  },
});
const make = (api: Api): Compiled => ({
  id: D,
  root: "root",
  default: "ON",
  fragments: { OddKid: Kid, OddEach: Each },
  nodes: {
    root: f.node("root", {
      Set: [{ patch: ({ event }: any) => ({ odd: event.odd }) }],
      Patch: [{ patch: ({ memory }: any) => pick(memory.odd, "patch", {}) as object }],
      Guard: [{ guards: [({ memory }: any) => pick(memory.odd, "guard", true)] }],
      Follow: [
        {
          followUps: [
            ({ memory }: any) => pick(memory.odd, "followUp", { tag: "Done", payload: {} }) as any,
          ],
        },
      ],
      Raise: [
        {
          raises: [
            {
              to: "each",
              key: f.slot(
                "on.Raise.key",
                ({ memory }: any) => pick(memory.odd, "raiseKey", "x") as string,
              ),
              event: "Hit",
              from: f.slot("on.Raise.from", ({ memory }: any) => pick(memory.odd, "raiseFrom", {})),
            },
            {
              to: "kid",
              event: "Poked",
              from: f.slot("on.Raise.kid", ({ memory }: any) => ({ odd: memory.odd })),
            },
          ],
        },
      ],
      RaiseLeave: [
        {
          raises: [
            {
              to: "kid",
              event: "Leave",
              from: f.slot("on.RaiseLeave", ({ memory }: any) => ({ odd: memory.odd })),
            },
          ],
        },
      ],
      Arm: [{ target: "TIMED" }],
      Back: [{ target: "ON" }],
      Commit: [
        {
          members: f.commit("w", ({ memory }) =>
            pick(memory.odd, "commitInput", { odd: memory.odd }),
          ),
        },
      ],
      Lookup: [
        {
          members: f.lookup("r", ({ memory }) =>
            pick(memory.odd, "lookupInput", { odd: memory.odd }),
          ),
        },
      ],
      Cancel: [
        {
          members: f.member("w", "cancel", ({ memory }) =>
            pick(memory.odd, "memberKey", { id: "x" }),
          ),
        },
      ],
      TokenGo: [
        {
          tokens: [
            {
              op: "w",
              verb: "idle",
              key: f.slot("on.TokenGo.key", ({ memory }: any) =>
                pick(memory.odd, "tokenKey", { id: "x" }),
              ),
            },
          ],
        },
      ],
      PortHit: [
        {
          raises: [
            {
              to: "kid",
              event: "Guarded",
              from: f.slot("on.PortHit", ({ memory }: any) => ({ odd: memory.odd })),
            },
          ],
        },
      ],
      Done: [{}],
      Read: [{}],
      Tick: [{}],
      Told: [{}],
      Out: [{}],
    }),
    ON: {
      ...f.node("ON"),
      placements: [
        {
          name: "kid",
          fragment: "OddKid",
          input: f.slot("placement.input", ({ memory }: any) =>
            memory.odd?.kind === "placementInput" ? memory.odd.value : { odd: memory.odd },
          ),
          resetOn: f.slot("placement.resetOn", ({ memory }: any) =>
            pick(memory.odd, "resetOn", "same"),
          ),
          guards: {
            go: f.slot(
              "placement.guard",
              ({ memory }: any) => pick(memory.odd, "portGuard", true) as any,
            ),
          },
          callbacks: { Told: f.alts("cb.Told", [{}]) },
          exits: { Out: f.alts("exit.Out", [{ target: "TIMED" }]) },
        },
        { name: "each", fragment: "OddEach", each: { of: "ids", max: 4 } },
      ],
    },
    TIMED: f.node("TIMED", { Tock: [{ target: "ON" }] }, [
      {
        id: "tick",
        send: "Tock",
        schedule: f.slot(
          "schedule.tick",
          ({ memory }: any) => pick(memory.odd, "schedule", 1000) as number,
        ),
        armOn: ["entry"],
        disarmOn: [],
      },
    ]),
  },
  memory: f.memory(() => ({ odd: undefined, ids: ["x"] })),
  ops: {
    w: op(api, "w"),
    r: {
      id: "r",
      contract: "odd/r",
      kind: "read",
      key: f.key("r", () => ({})),
      concurrency: "reject",
      commit: (i) => api.call("r", i) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Read" },
        failure: {
          NoResponse: { event: "Read" },
          Defect: { event: "Read" },
          Interrupted: { event: "Read" },
        },
      },
    },
  },
  persisted: false,
  uses: ["entities"],
  domain: {
    writes: {
      w: {
        predicts: f.slot(
          "domain.w.predicts",
          (i: any) => pick(i?.odd, "predicts", [{ ref: "Odd|x", patch: { n: 1 } }]) as never,
        ),
        confirms: (_v: any, i: any) =>
          pick(i?.odd, "confirms", [{ ref: "Odd|x", fields: { n: 1 } }]) as never,
      },
    },
    reads: {
      r: (_v: any, i: any) => pick(i?.odd, "reads", [{ ref: "Odd|x", fields: { n: 2 } }]) as never,
    },
    repair: (ref) => api.call("repair", { ref }) as Effect.Effect<any, any, never>,
  },
});
export const oddAllFixture: Fixture = { id: D, make };
