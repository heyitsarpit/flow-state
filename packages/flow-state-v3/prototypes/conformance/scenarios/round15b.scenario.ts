import { BareId } from "../typed/round7.ts";
import { serialBareFixture } from "../typed/round8.ts";
import {
  R15FailId,
  R15HeldId,
  R15KeyedId,
  R15NonEmptyId,
  R15NumId,
  R15RejectId,
  r15FailFixture,
  r15HeldFixture,
  r15KeyedFixture,
  r15NonEmptyFixture,
  r15NumFixture,
  r15RejectFixture,
} from "../typed/round15b.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const KA = { actor: R15KeyedId, id: "a" };
const RJ = { actor: R15RejectId, id: "a" };
const FA = { actor: R15FailId, id: "a" };
const HA = { actor: R15HeldId, id: "a" };
const SB = { actor: BareId, id: "a" };
const NA = { actor: R15NumId, id: "a" };
const NB = { actor: R15NumId, id: "b" };
const EA = { actor: R15NonEmptyId, id: "a" };
const EB = { actor: R15NonEmptyId, id: "b" };

export const round15bScenarios: readonly Scenario[] = [
  {
    id: "R15-02",
    kind: "fault",
    fixtures: [r15KeyedFixture(), r15RejectFixture(), serialBareFixture(), r15FailFixture(), r15HeldFixture()],
    actor: KA,
    cites: ["rule:43", "rule:16", "rule:44"],
    variants: {
      // Rule 43 (U2): "In a success or failure handler of a keyed operation, the ending's Attempt is already resolved, so a key-less `cancel` there does nothing."
      "a-key-less-cancel-in-a-keyed-success-handler-does-nothing"(c0) {
        const c = new Ctx(c0.fresh([r15KeyedFixture()]), KA);
        c.ensure(KA);
        c.send("Go", { k: "a" });
        c.ack();
        c.send("Go", { k: "a" });
        c.answer("keyed", { ok: {} });
        c.ack();
        c.eq("the promoted commit is sent", c.reqs("keyed").length, 2);
        c.eq("no Released", c.r.evidence("Released").length, 0);
        c.state("W");
      },
      // Rule 43 (U2): "In a success or failure handler of a keyed operation, the ending's Attempt is already resolved, so a key-less `cancel` there does nothing."
      "a-key-less-cancel-in-a-failure-handler-does-nothing-and-the-queue-goes-on"(c0) {
        const c = new Ctx(c0.fresh([r15FailFixture()]), FA);
        c.ensure(FA);
        c.send("Go", { k: "a" });
        c.ack();
        c.send("Go", { k: "a" });
        c.answer("declining", { fail: { tag: "Declined" } });
        c.ack();
        c.eq("the sent commit ended with a failure, Declined", c.endings("declining").filter((e) => e["channel"] === "failure").map((e) => e["reason"]), ["Declined"]);
        c.eq("the queued commit is promoted and sent", c.reqs("declining").length, 2);
        c.eq("no Released", c.r.evidence("Released").length, 0);
        c.eq("the key-less cancel touched no lane", c.cells("declining").some((x) => String(x).startsWith("lane.cancel.")), false);
        c.answer("declining", { ok: {} });
        c.ack();
        c.state("A", FA);
      },
      // Rule 43: "In a `NotSent` ending there is no Attempt (rule 16), so a key-less member does nothing."
      "a-key-less-cancel-in-a-not-sent-handler-does-nothing"(c0) {
        const c = new Ctx(c0.fresh([r15RejectFixture()]), RJ);
        c.ensure(RJ);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.eq("the second commit ended NotSent { Rejected }", c.endings("rej").filter((e) => e["channel"] === "failure").map((e) => e["reason"]), ["Rejected"]);
        c.eq("no Released", c.r.evidence("Released").length, 0);
        c.eq("no Superseded", c.r.evidence("Superseded").length, 0);
        c.eq("no cancel of the in-flight head", c.hitCell("lane.cancel.InFlight"), false);
        c.answer("rej", { ok: {} });
        c.state("B");
      },
      // Rule 43: "In a `NotSent` ending there is no Attempt (rule 16), so a key-less member does nothing." The NotSent is an unencodable commit (D108: the door
      // declines it before any lane is read) on the same key as the held head, so the handler's key-less `cancel` runs beside a Held lane and must not reach it.
      "a-key-less-cancel-in-a-not-sent-handler-leaves-a-held-head-and-its-queue"(c0) {
        const c = new Ctx(c0.fresh([r15HeldFixture()]), HA);
        c.namedIssues = ["UnencodableValue"];
        c.ensure(HA);
        c.send("Go", { k: "a" });
        c.ack();
        c.answer("holding", { lost: true });
        c.send("Go", { k: "a" });
        c.yes("the second commit queued behind a Held head", c.hitCell("lane.commit.Held"));
        c.send("GoBad", { k: "a" });
        c.eq("the unencodable commit ended NotSent { Unencodable }", c.endings("holding").filter((e) => e["channel"] === "failure").map((e) => e["reason"]), ["Unencodable"]);
        c.eq("the held head is the only request", c.reqs("holding").length, 1);
        c.eq("no Released", c.r.evidence("Released").length, 0);
        c.eq("no lane.cancel.Held", c.hitCell("lane.cancel.Held"), false);
        c.eq(
          "the queued commit is still in W",
          c.r.quiet().waits.filter((w) => "op" in w && w.op === "holding" && (w.kind === "queue" || w.kind === "W")).length,
          1,
        );
        c.state("W", HA);
      },
      // Rule 44 (U3): "on a reload `NotSent { Restored }` for each queued commit `W` first ..., then a held head's `unknown { Restored }`".
      "on-a-reload-each-queued-commit-is-heard-before-the-held-head"(c0) {
        const c = new Ctx(c0.fresh([serialBareFixture()]), SB);
        c.ensure(SB);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.send("Go");
        c.send("Go");
        c.yes("the queued commits wait behind a Held head", c.hitCell("lane.commit.Held"));
        const before = c.r.evidence("turn").length;
        c.reload();
        c.eq("each queued commit, then the head", c.r.evidence("turn").slice(before).map((t) => t["event"]), ["No", "No", "Unsure"]);
        c.eq(
          "each queued commit ends NotSent { Restored }, then the head unknown { Restored }",
          c.endings("charge").slice(1).map((e) => [e["channel"], e["reason"]]),
          [
            ["failure", "Restored"],
            ["failure", "Restored"],
            ["unknown", "Restored"],
          ],
        );
      },
    },
  },
  {
    id: "R15-03",
    kind: "fault",
    fixtures: [r15NumFixture(), r15NonEmptyFixture()],
    actor: NA,
    cites: ["sec:2.2.2"],
    namedIssues: ["InvalidTurn"],
    variants: {
      // 2.2.2 (U9): "creation checks a present input by its Schema's type side and runs no transforming decode ... a `NumberFromString` field given
      // `\"3\"` is refused."
      "creation-checks-an-input-by-its-type-side-and-refuses-a-transforming-decode"(c0) {
        const c = new Ctx(c0.fresh([r15NumFixture()]), NA);
        c.ensure(NA, { n: "3" });
        c.eq("no actor", c.mem(NA), undefined);
        c.yes("the cause is named", c.r.issues().some((i) => i.code === "InvalidTurn" && String((i as { cause?: unknown }).cause).includes("InputRefused")));
        c.ensure(NB, { n: 3 });
        c.eq("made, with its input", c.mem(NB)?.n, 3);
      },
      // 2.2.2 (U9): "creation checks a present input by its Schema's type side (refinements kept, no transforming decode)."
      "creation-checks-a-present-input-by-its-type-side-and-keeps-its-refinements"(c0) {
        const c = new Ctx(c0.fresh([r15NonEmptyFixture()]), EA);
        c.ensure(EA, { s: "" });
        c.eq("no actor", c.mem(EA), undefined);
        c.yes("the cause is named", c.r.issues().some((i) => i.code === "InvalidTurn" && String((i as { cause?: unknown }).cause).includes("InputRefused")));
        c.ensure(EB, { s: "x" });
        c.eq("made, with its input", c.mem(EB)?.s, "x");
      },
    },
  },
];
