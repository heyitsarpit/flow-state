import assert from "node:assert/strict";
import { Result } from "effect";
import { describe, it } from "vite-plus/test";
import { actorRef, observationsOf } from "./prototype-observations.ts";

const identify = () => 1;

describe("prototype observations", () => {
  it("an unreadable report is a failure in its place, and the reports around it are kept", () => {
    const read = observationsOf(
      [
        { kind: "Unhandled", event: "Go" },
        { kind: "turn", actor: "M/a" },
        { event: "no kind" },
        { kind: "Denied", event: "Go", reasons: ["No"] },
      ],
      identify,
    );

    assert.deepStrictEqual(
      read.map((r) => (Result.isFailure(r) ? `unreadable ${r.failure.report}` : r.success._tag)),
      ["Unhandled", "unreadable turn", "unreadable (no kind)", "Denied"],
    );
  });

  it("a report of a kind the Port does not carry is dropped, not a failure", () => {
    assert.deepStrictEqual(observationsOf([{ kind: "internal", x: 1 }], identify), []);
  });

  it("an actor key with no machine or a malformed escape is unreadable, a good one reads", () => {
    assert.equal(Result.isFailure(actorRef("no-machine")), true);
    assert.equal(Result.isFailure(actorRef("M/%E0%A4%A")), true);
    assert.deepStrictEqual(
      actorRef("Checkout/Pay/a%2Fb"),
      Result.succeed({ machine: "Checkout/Pay", id: "a/b" }),
    );
  });

  it("a report naming an unreadable actor is a failure in its place", () => {
    const [read] = observationsOf([{ kind: "incarnation", actor: "M/%zz" }], identify);

    assert.equal(read !== undefined && Result.isFailure(read), true);
  });
});
