import { Option, Result } from "effect";
import { type Port, Snapshot } from "../port.ts";

/**
 * A runtime that does nothing: it boots, accepts every call, reports nothing and shows no actor.
 *
 * **When to use**
 *
 * Falsify runs every case on it; a case that passes here proves nothing.
 */
export const nullPort: Port = {
  boot: () => ({
    ensure: () => undefined,
    ensureExisting: () => undefined,
    release: () => undefined,
    send: () => undefined,
    dispose: () => undefined,
    forget: () => undefined,
    disposeRuntime: () => undefined,
    snapshot: () => Result.succeed(Snapshot.Absent()),
    row: () => Result.succeed(Option.none()),
    pending: () => false,
  }),
};
