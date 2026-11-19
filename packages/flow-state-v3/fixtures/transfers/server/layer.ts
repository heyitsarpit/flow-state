import { Effect, Layer } from "effect";
import { AccountsApi, BankApi, NoResponse } from "../services.ts";
import { Accounts } from "./accounts.ts";
import { Bank } from "./bank.ts";

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

const bankApi = (cleanupThrows: boolean) =>
  Effect.map(Bank, (bank) =>
    BankApi.of({
      transfer: (input, { idempotencyKey }) => {
        const sent = bank
          .transfer({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", () => Effect.fail(new NoResponse())));

        return cleanupThrows
          ? Effect.onInterrupt(sent, () => Effect.die("the request's abort hook threw"))
          : sent;
      },
    }),
  );

/**
 * The port fake: `BankApi` over the bank's server, a lost answer read as the port's NoResponse.
 */
export const BankFake = Layer.effect(BankApi, bankApi(false));

/**
 * The port fake over a bank client whose cleanup of an interrupted transfer request throws, as a
 * client whose abort hook throws does.
 */
export const BankFakeCleanupThrows = Layer.effect(BankApi, bankApi(true));
