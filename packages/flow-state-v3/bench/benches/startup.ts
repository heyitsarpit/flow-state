import { Effect, Option } from "effect";
import type { Manifest } from "../../fixtures/index.ts";
import { attachInspector } from "../../src/host/inspect.ts";
import type { App } from "../../src/index.ts";

type Setup = Manifest["setup"];

/**
 * A Runtime of an app's own setup, built and booted with nothing saved (no store on this host),
 * then disposed; the boot alone is timed.
 */
export const bootSubject = async (setup: Setup, app: App) => {
  const boot = () => {
    const start = performance.now();
    const runtime = setup.construct();
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the bench is a host boundary: it boots a Runtime synchronously to time it
    Effect.runSync(runtime.ready());
    const ms = performance.now() - start;

    return { runtime, ms };
  };

  return {
    op: async () => {
      const { runtime, ms } = boot();
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above: the bench disposes what it booted
      Effect.runSync(runtime.dispose());

      return { units: 1, counters: { boots: 1 }, sample: Option.some(ms) };
    },
    proof: async () => {
      const { runtime } = boot();
      const seen = { disposed: 0 };

      attachInspector(runtime, (e) => {
        if (e._tag === "RuntimeDisposed") seen.disposed += 1;
      });
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- as above
      Effect.runSync(runtime.dispose());

      return seen.disposed === 1 ? Option.none() : Option.some("a booted Runtime did not dispose");
    },
    shape: async () => ({ machines: Object.keys(app.machines).length }),
  };
};
