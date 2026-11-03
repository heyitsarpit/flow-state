// Round 11: `fixtures/cells.compiled.ts` on typed Pay. Pay plus one event the real machine lacks, so lane.cancel.InFlight and its neighbours are
// reachable; review L2: the event does not belong in Pay's own definition, so, as the hand fixture does, it is added to the compiled output, here typed
// Pay's. The census counts these cases as typed output a case edits.
import type { Alternative } from "../fixtures/compiled.ts";
import type { Fixture } from "../harness.ts";
import { typedPayFixture } from "./pay.ts";

const D = "Checkout/Pay";
export const cellsFixture: Fixture = {
  ...typedPayFixture,
  typed: undefined as never,
  make: (api) => {
    const c = typedPayFixture.make(api);
    const AbortPay: readonly Alternative[] = [
      {
        target: "self",
        at: { definition: D, path: "on.AbortPay[0]" },
        tokens: [],
        guards: [],
        members: [{ op: "pay", verb: "cancel", key: { run: ({ memory }: { readonly memory: { readonly intentId: string } }) => ({ intentId: memory.intentId }), at: { definition: D, path: "on.AbortPay[0].actions[0]" } } }],
      },
    ];
    const root = c.nodes["root"]!;
    return { ...c, nodes: { ...c.nodes, root: { ...root, on: { ...root.on, AbortPay } } } };
  },
} as Fixture;
