import { definition, type Machine, machine } from "../src/index.ts";
import { loose } from "../src/test/loose.ts";

/**
 * The tokens a definition hands out, as plain JavaScript reads them: records by name.
 */
// FLOW_STATE_ALLOW_UNKNOWN: plain JavaScript reads tokens by name, with no type for any.
export type Tokens = {
  readonly S: Readonly<Record<string, unknown>>;
  readonly E: Readonly<Record<string, unknown>>;
};

/**
 * `definition` and `machine` called as plain JavaScript calls them: no type checks a config or a
 * body, so construction alone refuses what is wrong.
 */
// FLOW_STATE_ALLOW_UNKNOWN: plain JavaScript passes any config and body.
export const untyped: {
  readonly definition: (config: unknown) => Tokens;
  readonly machine: (definition: unknown, body: (tokens: Tokens) => unknown) => Machine;
} = loose({ definition, machine });
