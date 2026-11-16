import { Config, Effect } from "effect";
import { manifests } from "../../fixtures/index.ts";

/**
 * Every samples set of every fixture's manifest.
 */
export const samples = manifests.flatMap((m) => m.samples);

/**
 * Every stress samples set, with the edge values at and past the codec's byte and node bounds, for
 * the stress runs only: values that size take the default suite from seconds to minutes.
 */
export const stressSamples = manifests.flatMap((m) => m.stressSamples);

/**
 * The app mix: the samples of every fixture whose manifest joins it, run in one Runtime.
 */
export const mix = manifests.filter((m) => m.mix).flatMap((m) => m.samples);

/**
 * The app mix over the stress samples, edge values included.
 */
export const stressMix = manifests.filter((m) => m.mix).flatMap((m) => m.stressSamples);

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
