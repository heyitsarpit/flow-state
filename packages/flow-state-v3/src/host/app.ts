import { Result } from "effect";
import { appFindings } from "../core/well-formed.ts";
import { entry } from "../entry.ts";
import { refuse } from "../error.ts";
import { made, madeOf } from "../made.ts";
import type { CheckedEntries } from "./context-refs.ts";
import { type App, type AppEntry, machineOf } from "./setup.ts";

/**
 * Declares an app: the closed list of machines a Runtime may run.
 *
 * **When to use**
 *
 * Once per application, in `app.ts`; `runtimeSetup` takes it.
 *
 * **Gotchas**
 *
 * - Unknown fields, two machines with one id, one machine under two keys, or two contracts with
 *   one id throw one {@link FlowError} naming every entry.
 */
export const app = entry(
  "app",
  // RETURN_TYPE: the App contract runtimeSetup takes, keeping its machines' types.
  <const M extends Readonly<Record<string, AppEntry>>>(
    config: App<M> & { readonly machines: CheckedEntries<NoInfer<M>> },
  ): App<M> => {
    refuse(
      Object.entries(config.machines).flatMap(([key, entry]) =>
        Result.match(
          madeOf("machine")(
            machineOf(entry),
            entry === machineOf(entry) ? ["machines", key] : ["machines", key, "machine"],
          ),
          { onFailure: (finding) => [finding], onSuccess: () => [] },
        ),
      ),
    );

    refuse(
      appFindings({
        ...config,
        machines: Object.fromEntries(
          Object.entries(config.machines).map(([key, entry]) => [key, machineOf(entry)]),
        ),
      }),
    );

    return made("app", APPS, { ...config, machines: { ...config.machines } }, {});
  },
);

// The owner of every app: an app is compared by identity, never by owner.
const APPS = Symbol("flow-state/app");
