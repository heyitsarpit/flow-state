import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PayMachine } from "../../fixtures/pay/machine.ts";
import { shopServer } from "../../fixtures/pay/server.ts";
import { checkout, lostConfirm } from "../../fixtures/pay/stories.ts";
import { type Cut, Story, type StoryRun } from "../../src/host/testing/index.ts";
import { at, reached } from "../stories/read.ts";

const payment = (cut: Cut) =>
  Option.flatMap(Story.actorIn(cut, checkout), (s) =>
    PayMachine.definition.O.pay.get(s.operations, { intentId: "pi1" }),
  );

const state = (cut: Cut) => Option.map(Story.actorIn(cut, checkout), (s) => s.state);

const confirms = (cut: Cut) =>
  reached(shopServer.received(cut)).filter((c) => c.method === "confirm");

const payEndings = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Ended" && e.operation === "pay" ? [`${e.channel} ${e.reason}`] : [],
  );

describe("Pay across a reload", () => {
  it("reads a confirm whose answer was lost past its deadline as unknown after a reload, sent once (Restore R3, I6; WriteLanes R2, I15)", async () => {
    const run = await lostConfirm.run();
    const reloaded = at(run, "reloaded");

    expect(payment(at(run, "before deadline"))).toEqual(
      Option.some({ pending: true, uncertain: false, waiting: false, retryCount: 0 }),
    );
    expect(state(at(run, "late"))).toEqual(Option.some("UNSURE"));
    expect(reloaded.now).toBe(61_000);
    expect(state(reloaded)).toEqual(Option.some("UNSURE"));
    expect(payment(reloaded)).toEqual(
      Option.some({ pending: false, uncertain: true, waiting: false, retryCount: 0 }),
    );
    expect(reloaded.runtime.lanes.map((l) => [l.operation, l.phase])).toEqual([["pay", "Held"]]);
    expect(payEndings(run)).toEqual(["unknown TimedOut", "unknown Restored"]);
    expect(confirms(reloaded)).toHaveLength(1);
    expect(confirms(at(run, "after"))).toHaveLength(1);
  });
});
