import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { CommandFailed, CommandsApi } from "../services.ts";

/**
 * Runs one command, keyed by its value: a command already running cannot run again, others run
 * meanwhile; a lost answer is unknown.
 */
export const runCommand = transaction({
  id: "Palette/run",
  input: { command: Schema.String },
  key: ["command"],
  concurrency: "reject",
  services: [CommandsApi],
  commit: (input, { attempt }) =>
    CommandsApi.use((api) => api.run(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
      Effect.catchTag("ActionFailed", (e) =>
        Effect.fail(new CommandFailed({ command: input.command, reason: e.reason })),
      ),
    ),
});
