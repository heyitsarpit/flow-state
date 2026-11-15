import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { bankServer } from "../../fixtures/transfers/server.ts";
import { config, send } from "../../fixtures/transfers/stories.ts";
import { Fake, Story } from "../../src/host/testing/index.ts";
import { at, callsOf, endings, memoryIn } from "./read.ts";

describe("A dead page", () => {
  it("writes nothing after a reload: its held write is aborted (Stories R9, I9, I10; Restore R3)", async () => {
    const run = await Story.app(
      config,
      [bankServer],
      [
        Story.attach(account),
        send(account, "t1", 500),
        Fake.store.hold(),
        send(account, "t2", 500),
        Story.reload(),
        Story.checkpoint("reloaded"),
        Fake.store.release(),
        Story.checkpoint("released"),
      ],
    ).run();

    const reloaded = at(run, "reloaded");
    const released = at(run, "released");

    expect(released.batches.filter((b) => b.page === 0).map((b) => b.status)).toContain("aborted");
    expect(released.batches.filter((b) => b.status === "landed" && b.page === 0)).toEqual(
      reloaded.batches.filter((b) => b.status === "landed" && b.page === 0),
    );
    expect(released.store).toEqual(reloaded.store);
    expect(released.evidence).toBe(reloaded.evidence);
    expect(released.runtime).toEqual(reloaded.runtime);
    expect(callsOf(released.received)).toEqual(["transfer landed 0"]);
    expect(endings(run)).toEqual(["transfer success success"]);
    expect(memoryIn(released, account)).toEqual(Option.some({ notice: "sent r1" }));
  });

  it("is answered nothing: its held call lands at the server, and nothing is delivered (Stories R9, I8, I10; Restore R3)", async () => {
    const run = await Story.app(
      config,
      [bankServer],
      [
        Story.attach(account),
        bankServer.hold("transfer"),
        send(account, "t1", 500),
        Story.reload(),
        Story.checkpoint("reloaded"),
        bankServer.release("transfer"),
        Story.checkpoint("released"),
        Story.advance("31 seconds"),
        Story.checkpoint("later"),
      ],
    ).run();

    const reloaded = at(run, "reloaded");
    const released = at(run, "released");

    expect(released.evidence).toBe(reloaded.evidence);
    expect(released.runtime).toEqual(reloaded.runtime);
    expect(released.store).toEqual(reloaded.store);
    expect(callsOf(at(run, "later").received)).toEqual(["transfer landed 0"]);
    expect(endings(run)).toEqual(["transfer unknown Restored"]);
    expect(memoryIn(at(run, "reloaded"), account)).toEqual(
      Option.some({ notice: "check your statement" }),
    );
    expect(memoryIn(at(run, "later"), account)).toEqual(
      Option.some({ notice: "check your statement, nudged" }),
    );
  });

  it("never moves its clock again, so its deadline never fires (Stories R9, I5, I10)", async () => {
    const run = await Story.app(
      config,
      [bankServer],
      [
        Story.attach(account),
        bankServer.hold("transfer"),
        send(account, "t1", 500),
        Story.advance("10 seconds"),
        Story.reload(),
        Story.checkpoint("reloaded"),
        Story.advance("31 seconds"),
        Story.checkpoint("later"),
      ],
    ).run();

    expect(at(run, "reloaded").now).toBe(10_000);
    expect(at(run, "later").now).toBe(41_000);
    expect(endings(run)).toEqual(["transfer unknown Restored"]);
    expect(callsOf(at(run, "later").received)).toEqual(["transfer held 0"]);
  });
});
