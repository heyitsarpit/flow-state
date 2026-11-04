// Round 11: `fixtures/order.compiled.ts` and `fixtures/drv.compiled.ts`, written in the public API. Ring records what it saw, so order is visible by memory;
// its head insertions are the `labFollowUps` seam (D203, finding F4). Drv is S2's commit matrix on the real driver.
import { Effect, Schema } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";
import type { Api } from "../fake-world.ts";

export { BEHAVIOURS } from "../fixtures/drv.compiled.ts";
import { BEHAVIOURS } from "../fixtures/drv.compiled.ts";

const S = Schema;
const U = S.Unknown;
const job = transaction({ id: "ring/job", input: { n: U, who: U }, key: ["n"], concurrency: "reject", services: [FakeApi], commit: write("job") });
const ring = definition({
  id: "Ring",
  states: ["READY"],
  events: { Say: { n: U }, SayThenX: { n: U }, Loop: { n: U }, Nest: { n: U }, Nest1: { n: U }, Boom: { n: U }, WorkBad: { n: U, who: U }, Work: { n: U, who: U } },
  internalEvents: { JobDone: {}, JobUnsure: Flow.uncertain({}), JobRefused: {} },
  memory: { log: Flow.initial(S.Array(U), []) },
  persisted: false,
  operations: ({ E }) => ({ job: job.outcomes({ success: E.JobDone, failure: { NotSent: E.JobRefused }, unknown: E.JobUnsure }) }),
});
export const ringFixture = fixture(
  machine(ring, ({ S: St, O }) => {
    const seen = ({ memory, event }: { readonly memory: { readonly log: readonly unknown[] }; readonly event: { readonly n: unknown } }) => ({ log: [...memory.log, event.n] });
    return {
      default: St.READY,
      on: {
        Say: { updateMemory: seen },
        SayThenX: { updateMemory: seen, labFollowUps: [() => ({ tag: "Say", payload: { n: "x" } })] },
        Loop: { updateMemory: seen, labFollowUps: [({ event }) => ({ tag: "Loop", payload: event })] },
        Nest: { updateMemory: seen, labFollowUps: [() => ({ tag: "Nest1", payload: { n: "n1" } }), () => ({ tag: "Say", payload: { n: "n2" } })] },
        Nest1: { updateMemory: seen, labFollowUps: [() => ({ tag: "Say", payload: { n: "n11" } })] },
        Boom: { guard: [() => true], updateMemory: seen },
        WorkBad: { updateMemory: seen, actions: [O.job.commit(({ event }) => ({ n: event.n, who: event.who }))], labFollowUps: [() => ({ tag: "Say", payload: { n: "x" } })] },
        Work: { actions: [O.job.commit(({ event }) => ({ n: event.n, who: event.who }))] },
        JobDone: { updateMemory: ({ memory }) => ({ log: [...memory.log, "done"] }) },
        JobUnsure: {},
        JobRefused: {},
      },
    };
  }),
);

// S2's commit matrix on the real driver. `behaviour` picks the commit's shape; the fake tracks it as a request, so the suite can check the wire claim.
// Finding F8: these commits start their request when the commit is called, as an eager client does (`const p = fetch(); ...`), so the contract closes
// over the client instead of asking for the service: DRV-01 pins the wire order of two members and DRV-02 a start that throws, and a lazy Effect moves
// both to when the runtime runs it. Through `FakeApi` (lazy), DRV-01's two requests go out `other` first: a timed commit starts a tick later.
const drvOp = (api: Api, id: string, timeoutMs?: number) =>
  transaction({
    id: `drv/${id}`,
    input: { behaviour: U },
    key: [],
    concurrency: "reject",
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    commit: (input, { attempt }) => api.track(id, attempt.id, BEHAVIOURS[input.behaviour as string]!) as Effect.Effect<unknown, { readonly _tag: "Nope" }>,
  });
const drvMachine = (api: Api) => {
  const jobOp = drvOp(api, "job", 1000);
  const otherOp = drvOp(api, "other");
  const drv = definition({
  id: "Drv",
  states: ["READY"],
  events: { Go: { behaviour: U }, GoOther: { behaviour: U }, GoBoth: { behaviour: U }, Cancel: {} },
  internalEvents: { Ended: Flow.uncertain({ how: S.String }) },
  memory: { ends: Flow.initial(S.Array(U), []) },
  persisted: false,
  operations: ({ E }) => {
    const outcomes = { success: E.Ended.from(() => ({ how: "success" })), failure: { Nope: E.Ended.from(() => ({ how: "failure" })), NotSent: E.Ended.from(() => ({ how: "notSent" })) }, unknown: E.Ended.from(() => ({ how: "unknown" })) };
    return { job: jobOp.outcomes(outcomes), other: otherOp.outcomes(outcomes) };
  },
});
  return machine(drv, ({ S: St, O }) => ({
    default: St.READY,
    on: {
      // The commit's input is the event as sent, as the hand fixture's.
      Go: { actions: [O.job.commit(({ event }) => event as never)] },
      GoOther: { actions: [O.other.commit(({ event }) => event as never)] },
      GoBoth: { actions: [O.job.commit(({ event }) => event as never), O.other.commit(({ event }) => event as never)] },
      Cancel: { actions: [O.job.cancel(() => ({}))] },
      Ended: { updateMemory: ({ memory, event }) => ({ ends: [...memory.ends, event.how] }) },
    },
  }));
};
// It needs no service, so nothing is provided: `Effect.provide` around a commit is one more step in its fiber, and DRV-01's seeded shuffles pick by step.
export const drvFixture = { id: "Drv", make: (api: Api) => drvMachine(api).compiled, typed: true as const };
