import { accountOf } from "../app.ts";
import { Bank } from "../server.ts";
import { grownStory } from "./usual.ts";

const ACCOUNTS = Array.from({ length: 64 }, (_, n) => n);

const send = (n: number) => ({ _tag: "Send", transferId: `t${String(n)}`, cents: 1 }) as const;

/**
 * 64 accounts each send a transfer; the sixth is forgotten; the tab reloads twice.
 */
export const manyAccounts = ACCOUNTS.reduce(
  (story, n) => story.ensure(accountOf(n)).send(accountOf(n), send(n)),
  grownStory("transfers/stress-many-accounts"),
)
  .dispose(accountOf(5), { how: "forget" })
  .reload()
  .reload()
  .checkpoint("end");

/**
 * 64 accounts each send a transfer whose answer is held when the tab reloads; it reloads again.
 */
export const owedAtBoot = ACCOUNTS.reduce(
  (story, n) =>
    story
      .ensure(accountOf(n))
      .world(Bank.transfer.hold({ at: "response" }))
      .send(accountOf(n), send(n)),
  grownStory("transfers/stress-owed-at-boot"),
)
  .reload()
  .checkpoint("first boot")
  .reload()
  .checkpoint("end");
