import { Context, Option } from "effect";
import { Host } from "../host.ts";

// A fresh 128-bit seed per boot from the platform's entropy, as 32 hex digits, so no two boots
// mint equal Attempt ids.
const entropy = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16).padStart(8, "0"),
  ).join("");

/**
 * The real host's platform: the only module that touches the browser's own APIs.
 *
 * **Details**
 *
 * `Clock` and `Scheduler` are absent, so Effect's defaults apply (Date.now, a clamped timer,
 * MixedScheduler). Visibility and storage are stubs for the walking skeleton, owed by a later Task.
 */
export const browserPlatform = () =>
  Context.make(
    Host,
    Host.of({
      hidden: () => false,
      onHidden: () => undefined,
      store: Option.none(),
      sessionSeed: entropy(),
    }),
  );
