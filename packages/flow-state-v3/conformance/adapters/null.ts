import { Option } from "effect";
import { type Port, Snapshot } from "../port.ts";

/**
 * A runtime that does nothing: it boots, accepts every call, reports nothing and shows no actor.
 *
 * **When to use**
 *
 * Falsify runs every case on it; a case that passes here proves nothing.
 */
export const nullPort: Port = {
  name: "null",
  boot: () => ({
    ensure: () => undefined,
    ensureExisting: () => undefined,
    send: () => undefined,
    dispose: () => undefined,
    snapshot: () => Snapshot.Absent(),
    row: () => Option.none(),
    pending: () => false,
  }),
};
