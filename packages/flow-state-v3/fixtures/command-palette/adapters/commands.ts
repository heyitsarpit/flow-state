import { Effect, Layer } from "effect";
import { CommandsApi } from "../services.ts";

/**
 * The app's own command actions, as its production Layer: every command does nothing here. A
 * Story never builds it.
 */
export const AppCommands = Layer.succeed(CommandsApi, CommandsApi.of({ run: () => Effect.void }));
