import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  hiddenRefusing,
  hideEdges,
  hideFlush,
  hideManyOrders,
  hideWhileHeld,
} from "../../fixtures/transfers/stories/visibility.ts";
import { workspaceHide } from "../../fixtures/session/stories/visibility.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

// The fields of a standing order's record these tests read (Codec R5).
const OrderRecord = Schema.fromJsonString(
  Schema.Struct({
    body: Schema.Struct({
      memory: Schema.Struct({ cents: Schema.Number, pausedUntil: Schema.NullOr(Schema.Unknown) }),
    }),
  }),
);

const rentAt = (cut: Cut) =>
  Option.flatMap(
    Option.fromUndefinedOr(
      [...cut.records.stored].find(
        ([key]) => key.startsWith("actor/Bank/StandingOrder/") && key.includes("rent"),
      ),
    ),
    ([, text]) => Option.map(Schema.decodeUnknownOption(OrderRecord)(text), (r) => r.body),
  );

// The batches issued after `from` up to `to`.
const since = (from: Cut, to: Cut) => to.records.batches.slice(from.records.batches.length);

describe("the flush on hide in the bank app (WriteAhead R10, I12, T5)", () => {
  it("WriteAhead I12: a plan waiting for the capture interval is written at once when the page hides; shown again, the next change waits; a reload restores it", async () => {
    const { opened, waiting, hidden, shown, reloaded } = checked(await hideFlush.run()).checkpoints;

    expect(since(opened, waiting)).toEqual([]);
    expect(Option.map(rentAt(hidden), (r) => r.memory.cents)).toEqual(Option.some(9500));
    expect(since(hidden, shown)).toEqual([]);
    expect(Option.map(rentAt(shown), (r) => r.memory.pausedUntil)).toEqual(Option.some(null));
    expect(Option.map(rentAt(reloaded), (r) => r.memory.cents)).toEqual(Option.some(9500));
  });

  it("WriteAhead I23: 32 planned orders go in the one batch the hide issues", async () => {
    const { planned, hidden } = checked(await hideManyOrders.run()).checkpoints;
    const batches = since(planned, hidden);

    expect(batches.map((b) => b.status)).toEqual(["landed"]);
    expect(batches[0]?.keys.filter((k) => k.startsWith("actor/Bank/StandingOrder/"))).toHaveLength(
      32,
    );
  });

  it("WriteAhead R10: a show with no hide and a hide with nothing marked write nothing; once hidden a plan goes at once; a second hide writes nothing more", async () => {
    const cuts = checked(await hideEdges.run()).checkpoints;

    expect(since(cuts.opened, cuts["shown unhidden"])).toEqual([]);
    expect(since(cuts["shown unhidden"], cuts["hidden idle"])).toEqual([]);
    expect(since(cuts["hidden idle"], cuts["planned hidden"]).map((b) => b.status)).toEqual([
      "landed",
    ]);
    expect(since(cuts["planned hidden"], cuts["hidden twice"])).toEqual([]);
  });

  it("WriteAhead I12, R12: a hide while a batch is held issues nothing until it answers, then the pause goes at once", async () => {
    const cuts = checked(await hideWhileHeld.run()).checkpoints;

    expect(since(cuts.opened, cuts.held).map((b) => b.status)).toEqual(["held"]);
    expect(since(cuts.held, cuts["hidden while held"])).toEqual([]);
    expect(since(cuts.opened, cuts.released).map((b) => b.status)).toEqual(["landed", "landed"]);
    expect(
      Option.isSome(
        Option.flatMap(rentAt(cuts.released), (r) => Option.fromNullOr(r.memory.pausedUntil)),
      ),
    ).toBe(true);
  });

  it("WriteAhead R10: on a hidden page a refused batch is tried again one capture interval later, not in a loop", async () => {
    const cuts = checked(await hiddenRefusing.run()).checkpoints;

    expect(since(cuts.opened, cuts["refused once"]).map((b) => b.status)).toEqual(["refused"]);
    expect(since(cuts["refused once"], cuts["before the retry"])).toEqual([]);
    expect(since(cuts.opened, cuts.retried).map((b) => b.status)).toEqual(["refused", "landed"]);
  });

  it("WriteAhead I12: a rename at 4,999 ms waits; a hide writes it at once; shown, the next rename waits for the interval; a second hide writes nothing", async () => {
    const cuts = checked(await workspaceHide.run()).checkpoints;

    expect(since(cuts.opened, cuts["just before the interval"])).toEqual([]);
    expect(since(cuts.opened, cuts.hidden).map((b) => b.status)).toEqual(["landed"]);
    expect(since(cuts.hidden, cuts.shown)).toEqual([]);
    expect(since(cuts.shown, cuts.interval).map((b) => b.status)).toEqual(["landed"]);
    expect(since(cuts.interval, cuts["hidden twice"])).toEqual([]);
  });
});
