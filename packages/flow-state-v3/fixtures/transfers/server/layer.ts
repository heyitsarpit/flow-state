import { Effect, Layer } from "effect";
import { AccountsApi } from "../services.ts";
import { Accounts } from "./accounts.ts";

/**
 * The accounts service's port fake: `AccountsApi` over the accounts server, a lost answer read as
 * the port's NoAnswer.
 */
export const AccountsFake = Layer.effect(
  AccountsApi,
  Effect.map(Accounts, (accounts) =>
    AccountsApi.of({
      balance: (input) =>
        accounts
          .balance(input)
          .pipe(Effect.catchTag("FakeLost", () => Effect.fail({ _tag: "NoAnswer" } as const))),
    }),
  ),
);
