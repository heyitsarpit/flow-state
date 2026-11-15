import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "../../src/index.ts";

/**
 * The app's action refused a command, with its reason.
 */
export class ActionFailed extends Schema.TaggedError<ActionFailed>()("ActionFailed", {
  reason: Schema.String,
}) {}

/**
 * The action's answer did not come back.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * A command that failed, naming the command, since an ending's mapper sees only the ending.
 */
export class CommandFailed extends Schema.TaggedError<CommandFailed>()("CommandFailed", {
  command: Schema.String,
  reason: Schema.String,
}) {}

/**
 * The app's commands: where a command's work happens. Each send carries its Attempt's id as the
 * idempotency key.
 */
export class CommandsApi extends Context.Service<
  CommandsApi,
  {
    readonly run: (
      input: { readonly command: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<void, ActionFailed | NoResponse>;
  }
>()("palette/CommandsApi") {}

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
    Effect.flatMap(Effect.service(CommandsApi), (api) =>
      api.run(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
      Effect.catchTag("ActionFailed", (e) =>
        Effect.fail(new CommandFailed({ command: input.command, reason: e.reason })),
      ),
    ),
});
