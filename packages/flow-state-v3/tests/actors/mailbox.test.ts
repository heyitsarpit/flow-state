import { describe, expect, it } from "vite-plus/test";
import { account, savings } from "../../fixtures/transfers/app.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { checked } from "../rules/rules.ts";

const send = (transferId: string) => ({ _tag: "Send" as const, transferId, cents: 100 });

// Two accounts each owe two endings at the reload's start, so their mail is queued together.
const owedTwiceEach = bankStory("mailbox/rotation")
  .ensure(account)
  .ensure(savings)
  .world(Bank.transfer.hold({ at: "response" }))
  .send(account, send("a1"))
  .world(Bank.transfer.hold({ at: "response" }))
  .send(account, send("a2"))
  .world(Bank.transfer.hold({ at: "response" }))
  .send(savings, send("s1"))
  .world(Bank.transfer.hold({ at: "response" }))
  .send(savings, send("s2"))
  .advance("1 second")
  .reload()
  .checkpoint("reloaded");

describe("mailboxes (Actors R12, R13)", () => {
  it("Actors R13, I21: actors with queued mail are served in rotation, one event each, oldest first within an actor", async () => {
    const run = checked(await owedTwiceEach.run());

    const served = run.evidence.flatMap((e) =>
      e._tag === "Turn" && e.event === "Unsure" ? [e.actor.name] : [],
    );

    expect(served).toEqual(["acct-1", "acct-2", "acct-1", "acct-2"]);
  });
});
