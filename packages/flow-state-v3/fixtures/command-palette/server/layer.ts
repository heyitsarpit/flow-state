import { Effect, Layer } from "effect";
import { CommandsApi, NoResponse } from "../services.ts";
import { Commands } from "./commands.ts";

/**
 * The port fake: `CommandsApi` over the commands server, a lost answer read as the port's
 * NoResponse.
 */
export const CommandsFake = Layer.effect(
  CommandsApi,
  Effect.map(Commands, (server) =>
    CommandsApi.of({
      run: (input, { idempotencyKey }) =>
        server.run({ ...input, key: idempotencyKey }).pipe(
          Effect.asVoid,
          Effect.catchTag("FakeLost", () => Effect.fail(new NoResponse())),
        ),
    }),
  ),
);
