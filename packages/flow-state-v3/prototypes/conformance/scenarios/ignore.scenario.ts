// Round 14 (OD28, 2.7.18; rules 13, 17, 20, 40, 45): `Flow.ignore`. An ignored ending is admitted with no turn, applies its 2.7.13 cell's lane effect,
// publishes as a Runtime step, and is never parked; an ignored unknown also releases the Attempt, as `cancel` does in Held. One case per changed
// 2.7.13 cell this runtime has. Every expectation is 2.7.18's text, worked by hand.
import { IgnoreId, ignoreFixture } from "../typed/ignore.ts";
import { issueRef, issuesIgnoring } from "../typed/issues.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const X = { actor: IgnoreId, id: "a" };
const L = { actor: "Issues/List", id: "a" };
const I1 = issueRef("i1");
const log = (c: Ctx) => (c.r.memory(X) as { log?: readonly string[] } | undefined)?.log;
const ign = (c: Ctx) => c.r.evidence("ignored").map((e) => `${e["op"]}:${e["channel"]}:${e["reason"]}`);
const on = (c0: Ctx, persisted = false) => {
  const c = new Ctx(c0.fresh([ignoreFixture({ persisted })]), X);
  c.ensure(X);
  return c;
};

export const ignoreScenarios: readonly Scenario[] = [
  {
    id: "R14-IGN-01",
    kind: "example",
    fixtures: [ignoreFixture()],
    actor: X,
    cites: ["OD:28", "sec:2.7.18", "rule:13", "rule:40"],
    variants: {
      // InFlight success, ignored: the lane resolves (its cell), no turn runs.
      "a-success-resolves-with-no-turn"(c0) {
        const c = on(c0);
        c.send("Send");
        c.answer("send", { ok: {} });
        c.eq("ignored", ign(c), ["send:success:success"]);
        c.eq("no turn, no event", [log(c), c.r.state(X)], [[], "B"]);
        c.eq("the lane is idle", c.r.row(X, "send", {}), undefined);
      },
      // InFlight failure (an author's tag), ignored: resolves; a tag mapped to an event in the same operation still runs.
      "a-failure-tag-resolves-with-no-turn"(c0) {
        const c = on(c0);
        c.send("Send");
        c.answer("send", { fail: { tag: "Refused" } });
        c.eq("ignored", ign(c), ["send:failure:Refused"]);
        c.eq("no turn", log(c), []);
        c.eq("idle", c.r.row(X, "send", {}), undefined);
        c.to(X, "Send");
        c.answer("send", { fail: { tag: "Kept" } });
        c.eq("a mapped tag runs", log(c), ["kept"]);
      },
      // InFlight unknown, ignored: released at admission (rule 40, P1), so nothing holds.
      "an-unknown-is-released"(c0) {
        const c = on(c0);
        c.send("Send");
        c.answer("send", { lost: true });
        c.eq("ignored", ign(c), ["send:unknown:NoResponse"]);
        c.eq("released", c.r.evidence("Released").length, 1);
        c.eq("no hold", [c.r.row(X, "send", {}), c.r.quiet().waits.filter((w) => w.kind === "held").length], [undefined, 0]);
      },
      // Under serialize, the release promotes the commit waiting behind it.
      "a-released-unknown-promotes-the-waiting-commit"(c0) {
        const c = on(c0);
        c.send("Put", { n: 1 });
        c.send("Put", { n: 2 });
        c.eq("one out, one waiting", c.reqs("put").length, 1);
        c.answer("put", { lost: true });
        c.eq("released and promoted", [ign(c), c.reqs("put").length, c.r.row(X, "put", {})?.pending], [["put:unknown:NoResponse"], 2, true]);
        c.answer("put", { ok: {} });
        c.eq("the second is heard", log(c), ["putOk"]);
      },
      // An interrupt (a cancel of the wire) ends unknown { Cancelled }: ignored, released.
      "an-interrupt-is-released"(c0) {
        const c = on(c0);
        c.send("Send");
        c.send("CancelSend");
        c.eq("ignored as Cancelled", ign(c), ["send:unknown:Cancelled"]);
        c.eq("no hold, no turn", [c.r.row(X, "send", {}), log(c)], [undefined, []]);
      },
      // Every NotSent is ignored: a second commit under reject declines with no turn.
      "a-decline-is-ignored"(c0) {
        const c = on(c0);
        c.send("Send");
        c.to(X, "Send");
        c.eq("declined, ignored", ign(c), ["send:failure:Rejected"]); // 2.7.13: a commit under reject while InFlight ends NotSent { Rejected }
        c.eq("one request, no turn", [c.reqs("send").length, log(c)], [1, []]);
      },
      // An ending with no binding incarnation is applied and not parked (a persisted identity's would be).
      "with-no-incarnation-it-is-applied-not-parked"(c0) {
        const c = on(c0, true);
        c.send("Send");
        c.ack();
        c.dispose(X);
        c.answer("send", { ok: {} });
        c.eq("ignored, not parked", [ign(c), c.r.evidence("parked").length], [["send:success:success"], 0]);
        c.eq("the lane is gone", c.r.row(X, "send", {}), undefined);
      },
    },
  },
  {
    // A restore's Restored, ignored, releases: at a return after an end and at a reload (2.7.18's 2.7.13 cells). The hold that NoResponse made is
    // let go with no second turn.
    id: "R14-IGN-02",
    kind: "example",
    fixtures: [ignoreFixture({ persisted: true })],
    actor: X,
    cites: ["OD:28", "sec:2.7.18", "rule:44"],
    variants: {
      "a-returns-restored-is-released"(c0) {
        const c = on(c0, true);
        c.send("Hold");
        c.ack();
        c.answer("hold", { lost: true });
        c.eq("held", [log(c), c.r.quiet().waits.filter((w) => w.kind === "held").length], [["unsure"], 1]);
        c.detach(X);
        c.advance(GRACE);
        c.ensure(X);
        c.eq("Restored ignored", ign(c), ["hold:unknown:Restored"]);
        c.eq("released, no second turn", [c.r.quiet().waits.filter((w) => w.kind === "held").length, log(c)], [0, ["unsure"]]);
      },
      "a-reloads-restored-is-released-at-ready"(c0) {
        const c = on(c0, true);
        c.send("Hold");
        c.ack();
        c.reload();
        c.eq("Restored ignored", ign(c), ["hold:unknown:Restored"]);
        c.eq("released, no turn", [c.r.quiet().waits.filter((w) => w.kind === "held").length, log(c), c.r.row(X, "hold", {})], [0, [], undefined]);
      },
    },
  },
  {
    // P1 (OD28, rule 40, 2.8.6's `Released` row): an ignored unknown on a domain write is released. The record's uncertain mark, set at settlement,
    // stays until a later write's success, which clears it because its Attempt was released (rule 32); nothing holds meanwhile.
    id: "R14-IGN-03",
    kind: "example",
    fixtures: [issuesIgnoring],
    actor: L,
    cites: ["OD:28", "rule:40", "rule:32", "sec:2.8.6"],
    run(c0) {
      const c = new Ctx(c0.fresh([issuesIgnoring]), L);
      c.ensure(L);
      c.to(L, "Toggle", { id: "i1", liked: true });
      c.answer("like", { lost: true });
      c.eq("ignored and released, no hold", [ign(c), c.r.evidence("Released").length, c.r.quiet().waits.filter((w) => w.kind === "held").length], [["like:unknown:NoResponse"], 1, 0]);
      c.answer("repair", { truth: true });
      c.eq("the mark stays after the repair", c.rec(I1)?.uncertain, true);
      c.to(L, "Toggle", { id: "i1", liked: false });
      c.answer("like", { apply: true });
      c.eq("a later write's success clears the released Attempt's mark", c.rec(I1)?.uncertain, false);
    },
  },
];
