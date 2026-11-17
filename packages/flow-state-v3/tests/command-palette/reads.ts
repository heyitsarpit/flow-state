import { Option } from "effect";
import { shownCommands } from "../../fixtures/command-palette/machines/commands.ts";
import {
  highlightOf,
  PaletteMachine,
  type PaletteMemory,
  resultsOf,
} from "../../fixtures/command-palette/machines/palette.ts";
import { palette } from "../../fixtures/command-palette/app.ts";
import { Commands } from "../../fixtures/command-palette/server/commands.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";

const EVERY = ["calendar", "emoji", "calculator", "profile", "theme", "light", "dark", "settings"];

/**
 * A palette memory record as the Runtime shows it.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a snapshot's or evidence record's memory is erased to Values.
export const asPalette = (memory: unknown) =>
  // SAFETY: the palette's memory is the PaletteMemory record its definition declares.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a snapshot's memory is erased to Values
  memory as PaletteMemory;

/**
 * The palette's memory at a cut.
 */
export const memoryAt = (cut: Cut) => asPalette(cut.read(palette)?.memory);

/**
 * The entries the palette shows at a cut.
 */
export const resultsAt = (cut: Cut) => resultsOf(memoryAt(cut));

/**
 * The values of the commands the palette shows at a cut, in order.
 */
export const shownAt = (cut: Cut) => shownCommands(resultsAt(cut)).map((c) => c.value);

/**
 * The highlighted command at a cut.
 */
export const highlightAt = (cut: Cut) => highlightOf(memoryAt(cut));

const rowOf = (cut: Cut, command: string) =>
  Option.flatMap(Option.fromUndefinedOr(cut.read(palette)), (s) =>
    PaletteMachine.definition.O.run.get(s.operations, { command }),
  );

/**
 * The commands pending at a cut, in the fixture's list order.
 */
export const pendingAt = (cut: Cut) =>
  EVERY.filter((c) => Option.exists(rowOf(cut, c), (r) => r.pending));

/**
 * The commands the actions server was asked to run by a cut, in order.
 */
export const callsAt = (cut: Cut) => cut.read(Commands.run).map((c) => c.input.command);

/**
 * Each denial of the run as its event and reasons.
 */
export const denials = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Denied" ? [`${e.event} ${e.reasons.join(",")}`] : []));
