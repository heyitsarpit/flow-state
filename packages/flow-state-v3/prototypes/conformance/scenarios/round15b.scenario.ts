import { BareId } from "../typed/round7.ts";
import { serialBareFixture } from "../typed/round8.ts";
import { R15KeyedId, R15NumId, R15RejectId, r15KeyedFixture, r15NumFixture, r15RejectFixture } from "../typed/round15b.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const KA = { actor: R15KeyedId, id: "a" };
const RJ = { actor: R15RejectId, id: "a" };
const SB = { actor: BareId, id: "a" };
const NA = { actor: R15NumId, id: "a" };
const NB = { actor: R15NumId, id: "b" };

export const round15bScenarios: readonly Scenario[] = [
  {
    id: "R15-02",
    kind: "fault",
    fixtures: [r15KeyedFixture(), r15RejectFixture(), serialBareFixture()],
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
      // Rule 43: "In a `NotSent` ending there is no Attempt (rule 16), so a key-less member does nothing."
      "a-key-less-cancel-in-a-not-sent-handler-does-nothing"(c0) {
        const c = new Ctx(c0.fresh([r15RejectFixture()]), RJ);
        c.ensure(RJ);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.eq("the second commit ended NotSent { Rejected }", c.endings("rej").filter((e) => e["channel"] === "failure").map((e) => e["reason"]), ["Rejected"]);
        c.answer("rej", { ok: {} });
        c.state("B");
      },
      // Rule 44 (U3): "on a reload `NotSent { Restored }` for each queued commit `W` first ..., then a held head's `unknown { Restored }`".
      "on-a-reload-each-queued-commit-is-heard-before-the-held-head"(c0) {
        const c = new Ctx(c0.fresh([serialBareFixture()]), SB);
        c.ensure(SB);
        c.send("Go");
        c.ack();
        c.send("Go");
        c.send("Go");
        const before = c.r.evidence("turn").length;
        c.reload();
        c.eq("each queued commit, then the head", c.r.evidence("turn").slice(before).map((t) => t["event"]), ["No", "No", "Unsure"]);
      },
    },
  },
  {
    id: "R15-03",
    kind: "fault",
    fixtures: [r15NumFixture()],
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
    },
  },
];
