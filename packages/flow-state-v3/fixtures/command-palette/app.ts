import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { AppCommands } from "./adapters/commands.ts";
import { PaletteMachine } from "./machines/palette.ts";

/**
 * The palette app: one palette machine.
 */
export const paletteApp = app({ id: "palette", machines: { palette: PaletteMachine } });

/**
 * The palette app's real setup: persisted, each capture written at once.
 */
export const paletteSetup = runtimeSetup({
  app: paletteApp,
  services: AppCommands,
  scope: "palette",
  persistence: { captureMs: 0 },
});

/**
 * The palette most stories use.
 */
export const palette = actorRef(PaletteMachine, "palette-1");
