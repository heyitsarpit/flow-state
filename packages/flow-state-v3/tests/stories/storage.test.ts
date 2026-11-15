import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { bankServer } from "../../fixtures/transfers/server.ts";
import { config, send } from "../../fixtures/transfers/stories.ts";
import { Fake, Story } from "../../src/host/testing/index.ts";
import { at, callsOf, endings, memoryIn } from "./read.ts";

describe("Fake store words", () => {
  it("hold keeps the acknowledging write out, and no call is made until release lands it (Stories R7, I9; WriteAhead R13)", async () => {
    const run = await Story.app(
      config,
      [bankServer],
      [
        Story.attach(account),
        Fake.store.hold(),
        send(account, "t1", 500),
        Story.checkpoint("acknowledging"),
        Fake.store.release(),
        Story.checkpoint("sent"),
      ],
    ).run();

    const acknowledging = at(run, "acknowledging");
    const minted = run.evidence.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : []));
    const held = acknowledging.batches.filter((b) => b.status === "held");

    expect(acknowledging.received).toEqual([]);
    expect(held.map((b) => [b.purpose, b.acknowledges])).toEqual([["acknowledge", minted]]);
    expect(callsOf(at(run, "sent").received)).toEqual(["transfer landed 0"]);
    expect(at(run, "sent").batches.filter((b) => b.status === "held")).toEqual([]);
    expect(endings(run)).toEqual(["transfer success success"]);
  });

  it("refuse fails the acknowledging write, so the transfer ends NotSent unsent (Stories R7, I9; WriteAhead R13)", async () => {
    const run = await Story.app(
      config,
      [bankServer],
      [
        Story.attach(account),
        Fake.store.refuse(),
        send(account, "t1", 500),
        Story.checkpoint("refused"),
      ],
    ).run();

    const refused = at(run, "refused");

    expect(refused.received).toEqual([]);
    expect(refused.batches.filter((b) => b.status === "refused").map((b) => b.purpose)).toEqual([
      "acknowledge",
    ]);
    expect(endings(run)).toEqual(["transfer notSent StorageRefused"]);
    expect(memoryIn(refused, account)).toEqual(Option.some({ notice: "not sent StorageRefused" }));
    expect(
      run.evidence.filter((e) => e._tag === "Lane" && e.kind === "StorageFailure"),
    ).toHaveLength(1);
  });
});
