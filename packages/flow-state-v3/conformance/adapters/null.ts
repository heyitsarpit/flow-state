import { Layer, Option } from "effect";
import { Runtime, Snapshot } from "../port.ts";

/**
 * A runtime that does nothing: it boots, accepts every call, reports nothing and shows no actor.
 *
 * **When to use**
 *
 * Falsify runs every case on it; a case that passes here proves nothing.
 */
export const NullRuntime = {
  layer: Layer.succeed(Runtime)({
    ensure: () => undefined,
    ensureExisting: () => undefined,
    release: () => undefined,
    send: () => undefined,
    dispose: () => undefined,
    disposeRuntime: () => undefined,
    snapshot: () => Snapshot.Absent(),
    row: () => Option.none(),
    pending: () => false,
  }),
};
