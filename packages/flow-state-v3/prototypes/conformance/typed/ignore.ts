// Round 14 (OD28, 2.7.18): `Flow.ignore`, an ending that needs no reaction. `send` ignores every channel but one failure; `put` (serialize) ignores
// its unknown, so a commit waiting behind it is promoted; `hold` keeps NoResponse as a hold and ignores Restored. `log` is every turn this actor ran.
import { Schema } from "effect";
import { definition, Flow, machine, transaction } from "../compile/index.ts";
import { FakeApi, fixture, write } from "./lab.ts";

export const IgnoreId = "Lab/Ignore";
const S = Schema;
const send = transaction({ id: "ig/send", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write<unknown, "Refused" | "Kept">("send") });
const put = transaction({ id: "ig/put", input: { n: S.Number }, key: [], concurrency: "serialize", services: [FakeApi], commit: write("put") });
const hold = transaction({ id: "ig/hold", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("hold") });
const ignoring = (persisted: boolean) => {
  const d = definition({
    id: IgnoreId,
    states: ["A", "B"],
    events: { Send: {}, Put: { n: S.Number }, Hold: {}, CancelSend: {}, Note: {} },
    internalEvents: { KeptIt: {}, PutOk: {}, PutNo: {}, Unsure: Flow.uncertain({}), HoldOk: {}, HoldNo: {} },
    memory: { log: Flow.initial(S.Array(S.String), []) },
    persisted,
    operations: ({ E }) => ({
      send: send.outcomes({ success: Flow.ignore, failure: { Refused: Flow.ignore, Kept: E.KeptIt, NotSent: Flow.ignore }, unknown: Flow.ignore }),
      put: put.outcomes({ success: E.PutOk, failure: { NotSent: E.PutNo }, unknown: Flow.ignore }),
      hold: hold.outcomes({ success: E.HoldOk, failure: { NotSent: E.HoldNo }, unknown: { NoResponse: E.Unsure, ServerError: E.Unsure, Restored: Flow.ignore } }),
    }),
  });
  return machine(d, ({ S: St, O }) => {
    const heard = (what: string) => ({ memory }: { memory: { log: readonly string[] } }) => ({ log: [...memory.log, what] });
    return {
      default: St.A,
      on: {
        Send: { target: St.B, actions: [O.send.commit(() => ({}))] },
        CancelSend: { actions: [O.send.cancel(() => ({}))] },
        Put: { actions: [O.put.commit(({ event }) => ({ n: event.n }))] },
        Hold: { actions: [O.hold.commit(() => ({}))] },
        Note: { updateMemory: heard("note") },
        KeptIt: { updateMemory: heard("kept") },
        PutOk: { updateMemory: heard("putOk") },
        PutNo: { updateMemory: heard("putNo") },
        Unsure: { updateMemory: heard("unsure") },
        HoldOk: { updateMemory: heard("holdOk") },
        HoldNo: { updateMemory: heard("holdNo") },
      },
    };
  });
};
const igP = fixture(ignoring(true));
const igU = fixture(ignoring(false));
export const ignoreFixture = (o: { persisted?: boolean } = {}) => ((o.persisted ?? false) ? igP : igU);
