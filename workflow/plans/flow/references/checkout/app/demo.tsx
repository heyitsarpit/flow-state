"use client";

// A development page: "Pay safely" in a `StoryPlayer` (playback.md 6), and the property test's counterexample
// replayed (X6). The player records each Story once on mount and then only renders frames; the shop is rendered
// below the player's Flow context, so `ShopPages` builds no FlowProvider of its own.
//
// design gap: playback.md 8 names failure replay of "the Story a property test emits" as a follow-up. Assumed:
// `propertyTest`'s `counterexample` option writes the shrunk run as a Story module under
// testing/__counterexamples__/, exporting `counterexample`, which this page imports when it exists.
import { useEffect, useState } from "react";
import { StoryPlayer } from "flow-state/testing";
import { CartScreen } from "../features/Cart/Cart.js";
import { MiniCartBadge } from "../features/Cart/MiniCart.js";
import { CheckoutScreen } from "../features/Pay/Pay.js";
import { paid } from "../features/Pay/pay.story.js";
import { RefundsScreen } from "../features/Refunds/Refunds.js";
import { paySafely } from "./presentation.js";

type Run = Awaited<ReturnType<typeof paid.run>>;

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
  const [failure, setFailure] = useState<Run | null>(null);

  useEffect(() => {
    import("../testing/__counterexamples__/pay-property-counterexample.story.js").then(
      (m) => m.counterexample.run().then(setFailure),
      () => setFailure(null), // the property held: nothing to replay
    );
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
      {failure !== null && (
        <section aria-label="Property counterexample">
          <h2>The property test's shrunk failure</h2>
          <StoryPlayer run={failure}>
            <ShopPages />
          </StoryPlayer>
        </section>
      )}
    </main>
  );
}
