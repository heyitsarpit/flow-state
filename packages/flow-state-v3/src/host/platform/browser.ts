import { Context, Option, Predicate } from "effect";
import { flowErrorOf } from "../../error.ts";
import { Host } from "../host.ts";

// A fresh 128-bit seed per boot from the platform's entropy, as 32 hex digits, so no two boots
// mint equal Attempt ids.
const entropy = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16).padStart(8, "0"),
  ).join("");

// A page's document, or none on a server, where nothing hides.
const page = () =>
  Predicate.hasProperty(globalThis, "document") ? Option.some(globalThis.document) : Option.none();

// The hidden listener hears a visibilitychange to hidden, which fires first, and a pagehide, which
// a page entering the bfcache or closing still fires; a visibilitychange to visible is not heard.
const onHidden = (listener: () => void) =>
  Option.match(page(), {
    onNone: () => () => undefined,
    onSome: (document) => {
      const heard = () => {
        if (document.visibilityState === "hidden") listener();
      };

      document.addEventListener("visibilitychange", heard);
      globalThis.addEventListener("pagehide", listener);

      return () => {
        document.removeEventListener("visibilitychange", heard);
        globalThis.removeEventListener("pagehide", listener);
      };
    },
  });

/**
 * The real host's platform: the only module that touches the browser's own APIs.
 *
 * **Details**
 *
 * `Clock` and `Scheduler` are absent, so Effect's defaults apply (Date.now, a clamped timer,
 * MixedScheduler). Visibility is the page's: `hidden` reads `document.visibilityState`, and the
 * hidden listener hears a visibilitychange to hidden and a pagehide. On a server nothing hides.
 */
export const browserPlatform = () =>
  Context.make(
    Host,
    Host.of({
      hidden: () => Option.exists(page(), (document) => document.visibilityState === "hidden"),
      onHidden,
      sessionSeed: entropy(),
      freezeValues: false,
      workClock: Option.none(),
      // A cleanup that failed after dispose stopped waiting is reported as an unhandled error is,
      // as a FlowError keeping its whole Cause.
      report: (cause) =>
        globalThis.reportError(
          flowErrorOf(
            [
              {
                code: "CleanupFailed",
                path: ["dispose"],
                summary: "a cleanup failed after dispose stopped waiting for it",
                help: "Fix the failing cleanup; its cause is on this error.",
              },
            ],
            cause,
          ),
        ),
    }),
  );
