// Round 14 (OD29 F; rules 1, 9, 51, 56): a `resetOn` returning `null` or `undefined` means "not placed": no incarnation, no subject part. Becoming
// absent ends the incarnation as removal does; becoming present starts one; the filling's parts receive `key`, the present reset value. Every
// expectation is rule 1's text as merged, worked by hand.
import { previewerFixture } from "../typed/comments.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const Q = { actor: "Desk/Previewer", id: "q" };
const post = (c: Ctx, clientId: string) => c.into(["comments"], "Post", { clientId, text: clientId });

export const absorbScenarios: readonly Scenario[] = [
  {
    id: "R14-F-01",
    kind: "example",
    fixtures: [previewerFixture],
    actor: Q,
    cites: ["OD:29", "rule:1", "rule:9", "rule:51", "rule:56"],
    variants: {
      // M8 impossible: with no preview the trait is not placed, so a post has nowhere to go (Unhandled, as at any inactive trait) and nothing is
      // sent to ticket "" on path [""].
      "not-placed-while-absent-so-a-post-goes-nowhere"(c0) {
        const c = new Ctx(c0.fresh([previewerFixture]), Q);
        c.ensure(Q);
        c.eq("not placed", c.inner(["comments"]), undefined);
        post(c, "c1");
        c.eq("unhandled, nothing sent", [c.r.evidence("Unhandled").length, c.reqs("post").length], [1, 0]);
      },
      // The filling's `key` is the present reset value; becoming present starts an incarnation.
      "present-it-is-placed-with-key"(c0) {
        const c = new Ctx(c0.fresh([previewerFixture]), Q);
        c.ensure(Q);
        c.send("Preview", { id: "T-1" });
        c.eq("placed, its input from key", c.inner(["comments"])?.memory.ticketId, "T-1");
        post(c, "c1");
        c.eq("posted to T-1", c.reqs("post").map((r) => (r.input as { ticketId: string }).ticketId), ["T-1"]);
      },
      // Rule 56's walk "A, none, A adopts A's save": the post's lane outlives the absent value, its ending is parked for path [T-1], and the next
      // T-1 incarnation adopts it.
      "a-none-a-adopts-as-save"(c0) {
        const c = new Ctx(c0.fresh([previewerFixture]), Q);
        c.ensure(Q);
        c.send("Preview", { id: "T-1" });
        post(c, "c1");
        c.send("Preview", { id: null });
        c.eq("ended by the absent value", c.inner(["comments"]), undefined);
        c.answer("post", { apply: true });
        c.eq("parked for T-1", c.r.evidence("parked").length, 1);
        c.send("Preview", { id: "T-1" });
        c.eq("adopted by T-1", c.inner(["comments"])?.memory.drafts, [{ clientId: "c1", text: "c1", sent: true, problem: null }]);
      },
    },
  },
];
