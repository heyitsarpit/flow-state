import { Schema } from "effect";
import { it } from "vite-plus/test";
import { play } from "./case.ts";
import { Pay } from "./fixture.ts";
import { scenarioOf, Script } from "./script.ts";

it("replays a JSON script through the case API", () => {
  const script = Schema.decodeUnknownSync(Script)({
    id: "pay-once",
    fixture: "pay",
    actor: "shopper-1",
    steps: [
      { _tag: "ensure" },
      { _tag: "send", event: "Start", payload: { cartId: "c1", intentId: "pi1" } },
      { _tag: "send", event: "PayRequested", payload: { paymentMethodId: "visa" } },
      { _tag: "ack" },
      { _tag: "answer", operation: "void", answer: { _tag: "ok", value: {} } },
      {
        _tag: "answer",
        operation: "pay",
        answer: { _tag: "ok", value: { status: "requires_capture", clientSecret: "" } },
      },
      { _tag: "ack" },
      { _tag: "answer", operation: "place", answer: { _tag: "ok", value: { orderId: "o1" } } },
    ],
  });

  const { fixtures, run } = scenarioOf(script, [Pay]);

  play(fixtures, (c) => {
    run(c);
    c.actor(Pay, "shopper-1").state("PAID");
  });
});
