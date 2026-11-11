// Round 13: a subroutine alone (machine-design 2.10.12): Checkout's 3-D Secure (`conformance/typed/threeds.ts`), which places the resumable Countdown trait.
// Source: the bank's challenge page, shown in an iframe; its answer reaches the host as `Answered` or `Failed` (host events, sendable alone). Nothing here
// talks to a server, so the Story names no fake: time is the only world.
import { LENGTH_MS } from "../../conformance/fixtures/pay-full.compiled.ts";
import { ThreeDS } from "../../conformance/typed/threeds.ts";
import { Story } from "./story.ts";

const alone = (id: string) => Story.fragment(ThreeDS as never, { id });
const E = alone("threeds/events").E;

// The bank page shows, the countdown runs out, the subroutine waits two seconds, then leaves by `TimedOut`.
export const timedOut = alone("threeds/timed-out")
  .enter({ intentId: "pi_1" })
  .send(E["BankShown"]!())
  .checkpoint("shown")
  .advance(LENGTH_MS)
  .checkpoint("expired")
  .advance("2 seconds")
  .checkpoint("left");

// Help and back: `CloseHelp` returns by `S.OPEN.history` to where the shopper was, and the private counter counts.
export const helpAndBack = alone("threeds/help-and-back")
  .enter({ intentId: "pi_1" })
  .send(E["BankShown"]!(), E["Help"]!())
  .checkpoint("helping")
  .send(E["CloseHelp"]!())
  .checkpoint("back")
  .send(E["Answered"]!({ authId: "auth_1" }))
  .checkpoint("passed");

export const threedsStories = [timedOut, helpAndBack];
