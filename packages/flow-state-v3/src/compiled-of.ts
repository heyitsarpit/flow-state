import { Option, Result } from "effect";
import type { Compiled } from "./core/compiled.ts";
import { type Container, internalsOf, madeOf } from "./made.ts";

/**
 * What a machine keeps for the core under the internals key: its Compiled, which holds every
 * callback its body wrote, off its public face.
 */
export type MachineInternals = { readonly compiled: Compiled };

/**
 * The Compiled of a machine Flow made: for code past the door that read it as a machine.
 */
export const compiledOf = (machine: Container) =>
  internalsOf<MachineInternals>("machine", machine).compiled;

/**
 * The Compiled of a value when it is a machine Flow made; none for any other value.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value a callback returned as a machine, read as made.
export const compiledOption = (value: unknown) =>
  Option.map(
    Result.getSuccess(madeOf<MachineInternals>("machine")(value, [])),
    (card) => card.internals.compiled,
  );
