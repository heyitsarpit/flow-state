import { Config, Effect } from "effect";
import { samples as cells } from "../../fixtures/cells/stories.ts";
import {
  samples as palette,
  stressSamples as paletteStress,
} from "../../fixtures/command-palette/stories.ts";
import { samples as lanes, stressSamples as lanesStress } from "../../fixtures/lanes/stories.ts";
import { samples as numberInput } from "../../fixtures/number-input/stories.ts";
import { samples as pay } from "../../fixtures/pay/stories.ts";
import { samples as player } from "../../fixtures/player/stories.ts";
import {
  samples as session,
  stressSamples as sessionStress,
} from "../../fixtures/session/stories.ts";
import { samples as signIn } from "../../fixtures/sign-in/stories.ts";
import { samples as sync } from "../../fixtures/sync/stories.ts";
import {
  samples as transfers,
  stressSamples as transfersStress,
} from "../../fixtures/transfers/stories.ts";

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
 * Every fixture's samples with the edge values at and past the codec's byte and node bounds, for
 * the stress runs only: values that size takes the default suite from seconds to minutes.
 */
export const stressSamples = {
  ...samples,
  "command-palette": paletteStress,
  lanes: lanesStress,
  session: sessionStress,
  transfers: transfersStress,
};

/**
 * The app mix: five fixtures that persist and call their own servers, run in one Runtime.
 */
export const mix = [transfers, pay, lanes, palette, session];

/**
 * The app mix over the stress samples, edge values included.
 */
export const stressMix = [transfersStress, pay, lanesStress, paletteStress, sessionStress];

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
