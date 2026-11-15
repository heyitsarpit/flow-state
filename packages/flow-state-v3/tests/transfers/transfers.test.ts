import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account, TransfersMachine } from "../../fixtures/transfers/machine.ts";
import { declined, long, lostThenReload } from "../../fixtures/transfers/stories.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { Story } from "../../src/host/testing/index.ts";
import { at, callsOf, endings, memoryIn, reached } from "../stories/read.ts";

const row = (cut: Cut, transferId: string) =>
  Option.flatMap(Story.actorIn(cut, account), (s) =>
    TransfersMachine.definition.O.transfer.get(s.operations, { transferId }),
  );

const Request = Schema.Tuple([
  Schema.Struct({ transferId: Schema.String }),
  Schema.Struct({ idempotencyKey: Schema.String }),
]);

describe("transfers", () => {
  it("delivers the bank's decline as a failure (WriteLanes R4)", async () => {
    const run = await declined.run();

    expect(endings(run)).toEqual(["transfer failure Declined"]);
    expect(memoryIn(at(run, "declined"), account)).toEqual(
      Option.some({ notice: "declined limit" }),
    );
  });

  it("reads a write whose answer was lost as unknown after a reload, sent once (Restore R3, I6)", async () => {
    const run = await lostThenReload.run();
    const sending = at(run, "sending");
    const reloaded = at(run, "reloaded");

    expect(row(sending, "t1")).toEqual(
      Option.some({ pending: true, uncertain: false, waiting: false, retryCount: 0 }),
    );
    expect(reloaded.now).toBe(5000);
    expect(callsOf(reloaded.received)).toEqual(["transfer responseDropped 0"]);
    expect(row(reloaded, "t1")).toEqual(
      Option.some({ pending: false, uncertain: true, waiting: false, retryCount: 0 }),
    );
    expect(endings(run)).toEqual(["transfer unknown Restored"]);
    expect(memoryIn(reloaded, account)).toEqual(Option.some({ notice: "check your statement" }));
  });

  it("runs the long Story, every send of one transfer carrying one idempotency key (WriteLanes R5, I6)", async () => {
    const run = await long.run();
    const keys = new Map<string, Set<string>>();

    for (const call of reached(run.end.received)) {
      const [input, options] = Schema.decodeUnknownSync(Request)(call.args);
      keys.set(
        input.transferId,
        (keys.get(input.transferId) ?? new Set()).add(options.idempotencyKey),
      );
    }

    expect(long.steps.length).toBeGreaterThanOrEqual(90);
    expect(110 - long.steps.length).toBeGreaterThanOrEqual(0);
    expect(keys.size).toBe(36);
    expect([...keys.values()].every((k) => k.size === 1)).toBe(true);
    expect(
      run.end.received.filter(
        (c) => Schema.decodeUnknownSync(Request)(c.args)[0].transferId === "d0",
      ),
    ).toHaveLength(2);
  });
});
