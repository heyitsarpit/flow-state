import { Config, Effect } from "effect";
import { samples as cells } from "../../fixtures/cells/stories.ts";
import { samples as palette } from "../../fixtures/command-palette/stories.ts";
import { samples as lanes } from "../../fixtures/lanes/stories.ts";
import { samples as numberInput } from "../../fixtures/number-input/stories.ts";
import { samples as pay } from "../../fixtures/pay/stories.ts";
import { samples as player } from "../../fixtures/player/stories.ts";
import { samples as session } from "../../fixtures/session/stories.ts";
import { samples as signIn } from "../../fixtures/sign-in/stories.ts";
import { samples as sync } from "../../fixtures/sync/stories.ts";
import { samples as transfers } from "../../fixtures/transfers/stories.ts";

/**
 * Every fixture's samples, by the fixture's folder name.
 */
export const samples = {
  cells,
  "command-palette": palette,
  lanes,
  "number-input": numberInput,
  pay,
  player,
  session,
  "sign-in": signIn,
  sync,
  transfers,
};

/**
 * The app mix: five fixtures that persist and call their own servers, run in one Runtime.
 */
export const mix = [transfers, pay, lanes, palette, session];

/**
 * The fixed seeds the gate runs per fixture: ten usual and twenty stress (Testing O6).
 * `FLOW_SEEDS` adds that many more of each, outside the gate.
 */
export const seeds = (profile: "usual" | "stress") => {
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a test reads its seed count once, at the edge where it runs
  const extra = Effect.runSync(Config.Int("FLOW_SEEDS").pipe(Config.withDefault(0)));
  const count = (profile === "usual" ? 10 : 20) + extra;

  return Array.from({ length: count }, (_, n) => n + 1);
};
