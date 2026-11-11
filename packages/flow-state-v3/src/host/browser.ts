import { Context, Option } from "effect";
import { Host } from "./host.ts";

/**
 * A fresh 32-bit seed per boot from the platform's entropy, so two tabs never share one
 * (WriteLanes R5, I28).
 */
const entropy = () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;

/**
 * The real host's platform: the only module that touches the browser's own APIs.
 *
 * **Details**
 *
 * `Clock` and `Scheduler` are absent, so Effect's defaults apply (Date.now, a clamped timer,
 * MixedScheduler). Visibility and storage are stubs for the walking skeleton, owed by T19.
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
