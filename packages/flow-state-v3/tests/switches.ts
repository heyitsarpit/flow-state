import { Config, Effect } from "effect";

/**
 * Whether a named switch turns on a check the usual run leaves out.
 *
 * **When to use**
 *
 * A test kept in the tree but off by default, because its cost buys little the suite does not
 * already catch, reads its switch here; `FLOW_<NAME>=true` turns it back on for one run.
 *
 * **Gotchas**
 *
 * The switch is read once per file, when the file declares its tests.
 */
export const switchedOn = (name: `FLOW_${string}`) =>
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a test reads its switch once, at the edge where it runs
  Effect.runSync(Config.Boolean(name).pipe(Config.withDefault(false)));

/**
 * The item alone when its switch is on, and nothing otherwise, to spread into a list.
 *
 * **When to use**
 *
 * An entry of a list kept in the tree but left out of the usual run, such as a planted fault that
 * gives the same signal as another: `...whenSwitchedOn("FLOW_MERGED_FAULTS", fault)`.
 */
export const whenSwitchedOn = <A>(name: `FLOW_${string}`, item: A) =>
  switchedOn(name) ? [item] : [];
