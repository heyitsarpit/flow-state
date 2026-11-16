import type { Option } from "effect";
import type { Samples, Story } from "../src/host/testing/index.ts";
import type { App } from "../src/index.ts";

/**
 * What a fixture's Specs and machines let its writes reach, for the pair sweep: whether it has
 * write operations, whether its identities persist, whether a cancel can meet a head still
 * Acknowledging, and whether an unknown ending keeps a Held lane.
 */
export type Reach = {
  readonly writes: boolean;
  readonly persisted: boolean;
  readonly cancelsAcknowledging: boolean;
  readonly retainsUnknown: boolean;
};

/**
 * One fixture as every runner reads it: the generator, profiles, app mix, saved stress Stories,
 * reload sweep, pair sweeps, bench and CLI.
 *
 * **Details**
 *
 * `samples` and `stressSamples` are lists, one set per part of the app, so an app grows a new set
 * without changing the seeds an older set's saved stress Story replays. `savedStress.story` is the
 * stress Story its seed prints from one of `stressSamples`. `pairs` names each samples set the pair
 * sweep drives, with what its writes can reach. `mix` is the samples set, usual and stress, that an
 * app which persists or calls a server brings to the app mix: one set, since a mix holds each
 * machine once.
 */
export type Manifest = {
  readonly name: string;
  readonly app: App;
  readonly stories: Readonly<Record<string, Story<string>>>;
  readonly samples: ReadonlyArray<Samples>;
  readonly stressSamples: ReadonlyArray<Samples>;
  readonly long: Option.Option<Story<string>>;
  readonly savedStress: { readonly story: Story<string>; readonly seed: number };
  readonly mix: Option.Option<{ readonly usual: Samples; readonly stress: Samples }>;
  readonly pairs: ReadonlyArray<{ readonly samples: Samples; readonly reach: Reach }>;
};

/**
 * Declares a fixture's manifest.
 */
// RETURN_TYPE: the manifest as written, checked against the Manifest contract.
export const manifest = (m: Manifest): Manifest => m;
