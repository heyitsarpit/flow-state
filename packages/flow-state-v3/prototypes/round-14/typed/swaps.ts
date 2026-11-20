// main.ts --swap ../round-11/typed/swaps.ts. Round 11 (D196): turned around. The plain pass boots typed output; this pass boots the pinned hand Pay
// and pay-full's hand fragments where the typed suite has them, so the pinned reference still runs every gate.
import { payFixture } from "../../conformance/fixtures/pay.compiled.ts";
import { payFullFixture } from "../../conformance/fixtures/pay-full.compiled.ts";
import type { Fixture } from "../../conformance/harness.ts";
import { typedPayFixture } from "../../conformance/typed/pay.ts";
import { typedPayFullFixture } from "../../conformance/typed/pay-full.ts";

export const swaps = new Map<Fixture, Fixture>([
  [typedPayFixture, payFixture],
  [typedPayFullFixture, payFullFixture],
]);
