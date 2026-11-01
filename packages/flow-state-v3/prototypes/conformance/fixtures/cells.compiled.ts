// Pay plus one event the real machine lacks, so lane.cancel.InFlight and its neighbours are reachable. Review L2: the
// event does not belong in Pay's own fixture. Everything else is Pay.
import { payFixture } from "./pay.compiled.ts";
import { fixtureOf } from "./build.ts";
import type { Fixture } from "../harness.ts";

const D = "Checkout/Pay";
const { alts, slot } = fixtureOf(D);

export const cellsFixture: Fixture = {
  ...payFixture,
  make: (api) => {
    const c = payFixture.make(api);
    const AbortPay = alts("on.AbortPay", [
      {
        members: (p) => [
          {
            op: "pay",
            verb: "cancel",
            key: slot(`${p}.actions[0]`, ({ memory }: any) => ({ intentId: memory.intentId })),
          },
        ],
      },
    ]);
    const root = c.nodes["root"]!;
    return { ...c, nodes: { ...c.nodes, root: { ...root, on: { ...root.on, AbortPay } } } };
  },
};
