"use client";

// A development page: "Pay safely" in a `StoryPlayer` (playback.md 6), and the property test's counterexample
// replayed (X6). The player records each Story once on mount and then only renders frames; the shop is rendered
// below the player's Flow context, so `ShopPages` builds no FlowProvider of its own.
//
// A counterexample is a Story the author pastes: `PropertyTestFailed`'s `result.source` is the appended steps,
// chained from `payMoney` (machine-design 2.10.16). `regressions` below holds those pasted Stories; empty while the
// properties hold, and each one is played under its own heading.
import { useEffect, useState } from "react";
import { StoryPlayer } from "flow-state/testing";
import { CartScreen } from "../features/Cart/Cart.js";
import { MiniCartBadge } from "../features/Cart/MiniCart.js";
import { CheckoutScreen } from "../features/Pay/Pay.js";
import { paidFirstTime } from "../features/Pay/pay.story.js";
import { RefundsScreen } from "../features/Refunds/Refunds.js";
import { paySafely } from "./presentation.js";

type Run = Awaited<ReturnType<typeof paidFirstTime.run>>;

// Paste `result.source` here, e.g.
//   export const chargedTwice = payMoney.world(Stripe.confirm.drop({ at: "response" })).send(...)
const regressions: ReadonlyArray<{ readonly run: () => Promise<Run> }> = [];

function ShopPages() {
  return (
    <>
      <MiniCartBadge cartId="cart-1" />
      <CartScreen cartId="cart-1" />
      <CheckoutScreen paymentMethodId="pm_card_visa" />
      <RefundsScreen />
    </>
  );
}

export function CheckoutDemo() {
  const [part, setPart] = useState(0);
  const [failures, setFailures] = useState<ReadonlyArray<Run>>([]);

  useEffect(() => {
    Promise.all(regressions.map((story) => story.run())).then(setFailures); // none: the properties held
  }, []);

  return (
    <main>
      <h1>Pay safely</h1>
      <StoryPlayer key={part} presentation={paySafely[part]!}>
        <ShopPages />
      </StoryPlayer>
      <button disabled={part + 1 >= paySafely.length} onClick={() => setPart(part + 1)}>
        Next part
      </button>
      {failures.map((failure, i) => (
        <section key={i} aria-label="Property counterexample">
          <h2>A shrunk failure of the property test</h2>
          <StoryPlayer run={failure}>
            <ShopPages />
          </StoryPlayer>
        </section>
      ))}
    </main>
  );
}
