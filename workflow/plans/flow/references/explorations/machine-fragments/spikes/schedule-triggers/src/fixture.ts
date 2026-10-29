import { Schema } from "effect";
import { definition } from "./core.ts";

export const SignIn = definition({
  id: "SignIn",
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING"] }, "SIGNED_IN"],
  events: { Resend: {}, Changed: { value: Schema.String }, Cancel: {}, Verified: {} },
  internalEvents: { CooldownOver: {}, Settled: {} },
});
