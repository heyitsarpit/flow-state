import { Option } from "effect";
import type { Samples, Story } from "../src/host/testing/index.ts";
import type { ActorRef, App, RuntimeSetup } from "../src/index.ts";

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
  // Whether another identity of the samples saves a record while a local write is out, so a storage
  // refusal can meet it.
  readonly storesBeside: boolean;
};

/**
 * How a sized Story's cost may grow with its size: `flat` per turn whatever the size (a world, a
 * queue), or `linear` in it (a value's length or depth).
 */
export type Growth = "flat" | "linear";

/**
 * A Story the bench times beside the fixture's long and saved stress Stories, built on call.
 *
 * **Details**
 *
 * With `size`, it is one point of a growth series: Stories sharing a series name, each at its `n`
 * in `unit`, whose per-turn cost may grow as `growth` says, or at most `maxSlope` (the log-log
 * slope of cost over size) when the fixture claims its own bound. Without, it is one more turn
 * bench. A `stress` entry is one of the fixture's stress Stories, too long for the quick tier: only
 * the stress and full tiers time it.
 */
export type BenchStory = {
  readonly story: () => Story<string>;
  readonly stress: boolean;
  readonly size: Option.Option<{
    readonly series: string;
    readonly n: number;
    readonly unit: string;
    readonly growth: Growth;
    readonly maxSlope: Option.Option<number>;
  }>;
};

/**
 * A Story the bench times per turn, beside the long and saved stress Stories.
 */
export const benchTurn = (story: () => Story<string>) => {
  const entry: BenchStory = { story, stress: false, size: Option.none() };

  return entry;
};

/**
 * A Story the bench times as one point of a growth series, with the series' default bound for its
 * growth unless `maxSlope` is given.
 */
export const benchPoint = (
  story: () => Story<string>,
  size: {
    readonly series: string;
    readonly n: number;
    readonly unit: string;
    readonly growth: Growth;
  },
  maxSlope: Option.Option<number> = Option.none(),
) => {
  const entry: BenchStory = { story, stress: false, size: Option.some({ ...size, maxSlope }) };

  return entry;
};

/**
 * Marks a bench entry as a stress Story, at the large end of its series: the stress and full tiers
 * time it, the quick tier does not.
 */
export const benchStress = (entry: BenchStory) => {
  const marked: BenchStory = { ...entry, stress: true };

  return marked;
};

/**
 * A growth series: one point per size, each the Story `story(n)`; the points from `stressFrom` up
 * are the fixture's stress Stories, which only the stress and full tiers time.
 */
export const benchSeries = (
  declared: {
    readonly series: string;
    readonly unit: string;
    readonly growth: Growth;
    readonly sizes: ReadonlyArray<number>;
    readonly stressFrom: Option.Option<number>;
  },
  story: (n: number) => Story<string>,
) =>
  declared.sizes.map((n) => {
    const { series, unit, growth } = declared;
    const point = benchPoint(() => story(n), { series, n, unit, growth });
    const stress = Option.exists(declared.stressFrom, (from) => n >= from);

    return stress ? benchStress(point) : point;
  });

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
 * machine once. `setup` is the app's own Runtime setup. `bench` names
 * the actor the bench fills a Runtime with (`probe(n)` is the nth, each a distinct identity), the Story whose writes the
 * `persist` bench times (some exactly when a machine of the app persists), and
 * the Stories it times beyond `long` and `savedStress`.
 */
export type Manifest = {
  readonly name: string;
  // FLOW_STATE_ALLOW_UNKNOWN: each app's setup requires its own services.
  readonly setup: RuntimeSetup<unknown>;
  readonly app: App;
  readonly stories: Readonly<Record<string, Story<string>>>;
  readonly samples: ReadonlyArray<Samples>;
  readonly stressSamples: ReadonlyArray<Samples>;
  readonly long: Option.Option<Story<string>>;
  readonly savedStress: { readonly story: Story<string>; readonly seed: number };
  readonly mix: Option.Option<{ readonly usual: Samples; readonly stress: Samples }>;
  readonly pairs: ReadonlyArray<{ readonly samples: Samples; readonly reach: Reach }>;
  readonly bench: {
    readonly probe: (n: number) => ActorRef;
    readonly persist: Option.Option<() => Story<string>>;
    readonly stories: ReadonlyArray<BenchStory>;
  };
};

/**
 * Declares a fixture's manifest.
 */
// RETURN_TYPE: the manifest as written, checked against the Manifest contract.
export const manifest = (m: Manifest): Manifest => m;
