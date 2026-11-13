// Who is shopping: a guest, or a signed-in customer with a saved address. A shared actor the checkout reads as
// context (F22): signing in changes which steps the checkout has and how much a guest may pay, without the checkout
// importing the account code. Starts no actor.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { Address } from "../../adapters/types.js";

export const Shopper = definition({
  id: "Checkout/Shopper",
  states: ["GUEST", "SIGNED_IN"],
  events: { SignedIn: { customerId: Schema.String, address: Address }, SignedOut: {} },
  memory: {
    customerId: Flow.initial(Schema.NullOr(Schema.String), null),
    savedAddress: Flow.initial(Schema.NullOr(Address), null),
  },
});
