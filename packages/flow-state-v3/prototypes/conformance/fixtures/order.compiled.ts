// Small machines for turn order and the bounds. A `Ring` actor only records what it saw, so order is visible by memory.
import { Effect } from "effect";
import type { Fixture } from "../harness.ts";
import type { Api } from "../fake-world.ts";
import type { Compiled } from "./compiled.ts";
import { fixtureOf, unknownWhenLost } from "./build.ts";

const D = "Ring";
const { node, commit, memory, key } = fixtureOf(D);
const seen = ({ memory: m, event }: any) => ({ log: [...m.log, event.n] });

const nodes = {
  root: node(
    "root",
    {
      Say: [{ patch: seen }],
      SayThenX: [
        {
          patch: seen,
          followUps: [() => ({ tag: "Say", payload: { n: "x" } })],
        },
      ],
      Loop: [{ patch: seen, followUps: [({ event }) => ({ tag: "Loop", payload: event })] }],
      Nest: [
        {
          patch: seen,
          followUps: [
            () => ({ tag: "Nest1", payload: { n: "n1" } }),
            () => ({ tag: "Say", payload: { n: "n2" } }),
          ],
        },
      ],
      Nest1: [{ patch: seen, followUps: [() => ({ tag: "Say", payload: { n: "n11" } })] }],
      Boom: [
        {
          guards: [() => true],
          patch: seen,
        },
      ],
      WorkBad: [
        {
          patch: seen,
          members: commit("job", ({ event }) => ({ n: event.n, who: event.who })),
          followUps: [() => ({ tag: "Say", payload: { n: "x" } })],
        },
      ],
      Work: [{ members: commit("job", ({ event }) => ({ n: event.n, who: event.who })) }],
      JobDone: [{ patch: ({ memory: m }) => ({ log: [...m.log, "done"] }) }],
      JobUnsure: [{}],
      JobRefused: [{}],
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
  memory: memory(() => ({ log: [] })),
  ops: {
    job: {
      id: "job",
      contract: "ring/job",
      kind: "write",
      key: key("job", (i) => ({ n: i.n })),
      concurrency: "reject",
      commit: (input, { attempt }) =>
        api
          .call("job", input, { idempotencyKey: attempt.id })
          .pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "JobDone" },
        failure: { NotSent: { event: "JobRefused" } },
        unknown: { event: "JobUnsure" },
      },
    },
  },
  persisted: false,
  uses: [],
});
export const ringFixture: Fixture = { id: D, make };
