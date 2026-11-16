import { cells } from "./cells/index.ts";
import { commandPalette } from "./command-palette/index.ts";
import { lanes } from "./lanes/index.ts";
import type { Manifest } from "./manifest.ts";
import { numberInput } from "./number-input/index.ts";
import { pay } from "./pay/index.ts";
import { player } from "./player/index.ts";
import { session } from "./session/index.ts";
import { signIn } from "./sign-in/index.ts";
import { sync } from "./sync/index.ts";
import { transfers } from "./transfers/index.ts";

export type { Manifest, Reach } from "./manifest.ts";

/**
 * Every fixture's manifest, by folder name: the one list the generator, profiles, app mix, saved
 * stress Stories, reload sweep, pair sweeps, bench and CLI read.
 */
export const manifests: ReadonlyArray<Manifest> = [
  cells,
  commandPalette,
  lanes,
  numberInput,
  pay,
  player,
  session,
  signIn,
  sync,
  transfers,
];
