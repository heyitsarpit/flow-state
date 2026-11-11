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
    // Round 13 (`flow graph`'s gate): the edit declares the event it handles, as an external one with no payload, so the table stays one `flow check`
    // and `flow graph` read whole. Before, the handler named an event nothing declared or could send.
    const events = c.events ? { ...c.events, external: [...c.events.external, "AbortPay"], payloads: { ...c.events.payloads, AbortPay: {} } } : c.events;
    return { ...c, nodes: { ...c.nodes, root: { ...root, on: { ...root.on, AbortPay } } }, ...(events ? { events } : {}) };
  },
} as Fixture;
