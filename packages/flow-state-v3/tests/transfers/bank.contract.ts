import { Effect, Exit, type Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BankApi, Declined } from "../../fixtures/transfers/contracts.ts";

const runOn = <A, E>(bank: Layer.Layer<BankApi>, program: Effect.Effect<A, E, BankApi>) =>
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a contract test is the program's boundary
  Effect.runPromise(Effect.exit(Effect.provide(program, bank)));

/**
 * The bank's contract, run against any Layer of `BankApi`: the port fake and a real sandbox alike.
 * It arranges state only through inputs both accept.
 */
export const bankContract = (name: string, bank: Layer.Layer<BankApi>) =>
  describe(`BankApi contract: ${name}`, () => {
    it("one idempotency key gives one receipt", async () => {
      const exit = await runOn(
        bank,
        BankApi.use((api) =>
          Effect.all(
            [
              api.transfer({ transferId: "c1", cents: 100 }, { idempotencyKey: "k1" }),
              api.transfer({ transferId: "c1", cents: 100 }, { idempotencyKey: "k1" }),
            ],
            { concurrency: 1 },
          ),
        ),
      );

      expect(Exit.isSuccess(exit) && exit.value[0].receipt === exit.value[1].receipt).toBe(true);
    });

    it("over the limit is Declined, never NoResponse", async () => {
      const exit = await runOn(
        bank,
        BankApi.use((api) =>
          api.transfer({ transferId: "c2", cents: 1_000_000 }, { idempotencyKey: "k2" }),
        ),
      );

      expect(exit).toEqual(Exit.fail(new Declined({ code: "limit" })));
    });
  });
