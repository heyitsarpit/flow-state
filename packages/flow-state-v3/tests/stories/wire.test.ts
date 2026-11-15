import { Exit, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BankApi } from "../../fixtures/transfers/contracts.ts";
import { account } from "../../fixtures/transfers/machine.ts";
import { bankServer } from "../../fixtures/transfers/server.ts";
import { config, send } from "../../fixtures/transfers/stories.ts";
import { Fake, Story, type Step } from "../../src/host/testing/index.ts";
import { at, callsOf, endings, memoryIn } from "./read.ts";

const heldThen = (...after: ReadonlyArray<Step>) =>
  Story.app(
    config,
    [bankServer],
    [
      Story.attach(account),
      bankServer.hold("transfer"),
      send(account, "t1", 500),
      Story.checkpoint("held"),
      ...after,
      send(account, "t2", 500),
      Story.checkpoint("next"),
    ],
  ).run();

const notice = (cut: Parameters<typeof memoryIn>[0]) =>
  Option.map(memoryIn(cut, account), (m) => m["notice"]);

describe("Fake wire words", () => {
  it("hold keeps the call waiting; release lands it once and answers (Stories R6, I7, I8)", async () => {
    const run = await heldThen(bankServer.release("transfer"));

    expect(callsOf(at(run, "held").received)).toEqual(["transfer held 0"]);
    expect(at(run, "held").runtime.lanes.map((l) => l.phase)).toEqual(["OnWire"]);
    expect(callsOf(at(run, "next").received)).toEqual(["transfer landed 0", "transfer landed 0"]);
    expect(endings(run)).toEqual(["transfer success success", "transfer success success"]);
    expect(notice(at(run, "next"))).toEqual(Option.some("sent r2"));
  });

  it("dropRequest never reaches the server; the commit's deadline ends it unknown (Stories R6; WriteLanes R2)", async () => {
    const run = await heldThen(bankServer.dropRequest("transfer"), Story.advance("30 seconds"));

    expect(callsOf(at(run, "next").received)).toEqual([
      "transfer requestDropped 0",
      "transfer landed 0",
    ]);
    expect(endings(run)).toEqual(["transfer unknown TimedOut", "transfer success success"]);
    expect(notice(at(run, "next"))).toEqual(Option.some("sent r1"));
  });

  it("dropResponse lands the call and loses its answer; the deadline ends it unknown (Stories R6; WriteLanes R2)", async () => {
    const run = await heldThen(bankServer.dropResponse("transfer"), Story.advance("30 seconds"));

    expect(callsOf(at(run, "next").received)).toEqual([
      "transfer responseDropped 0",
      "transfer landed 0",
    ]);
    expect(endings(run)).toEqual(["transfer unknown TimedOut", "transfer success success"]);
    expect(notice(at(run, "next"))).toEqual(Option.some("sent r2"));
  });

  it("answer gives the method's own failure through the commit's mapping and leaves the server alone (Stories R6; WriteLanes R4)", async () => {
    const declined = bankServer.answer("transfer", Exit.fail({ _tag: "Declined", code: "manual" }));

    // @ts-expect-error an unknown method is a type error
    bankServer.hold("wire");
    // @ts-expect-error another method's success is a type error
    bankServer.answer("transfer", Exit.succeed({ cents: 1 }));
    // @ts-expect-error a failure the method cannot fail with is a type error
    // @effect-diagnostics-next-line missingEffectError:off
    bankServer.answer("balance", Exit.fail({ _tag: "Declined", code: "x" }));
    // @ts-expect-error an event the definition does not declare is a type error
    Story.send(account, { _tag: "Bogus" });
    Fake.server(BankApi, () => ({
      // @ts-expect-error a handler takes its method's own arguments
      transfer: (input: { readonly cents: string }) => Exit.succeed({ receipt: input.cents }),
      balance: () => Exit.succeed({ cents: 0 }),
    }));

    const run = await heldThen(declined);

    expect(callsOf(at(run, "next").received)).toEqual(["transfer answered 0", "transfer landed 0"]);
    expect(endings(run)).toEqual(["transfer failure Declined", "transfer success success"]);
    expect(notice(at(run, "held"))).toEqual(Option.some(""));
    expect(notice(at(run, "next"))).toEqual(Option.some("sent r1"));
  });
});
