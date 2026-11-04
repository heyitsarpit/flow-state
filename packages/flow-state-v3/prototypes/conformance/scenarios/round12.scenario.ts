// Round 12: round 11's final review, pinned where a case is the right pin (review M5, Q1, L2). Each says what it would see without its fix.
import { payFixture } from "../typed/pay.ts";
import { datesFixture, diesFixture, keyReleaseTypedFixture, type Release } from "../typed/round6.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const K = { actor: "Lab/KeyReleaseTyped", id: "a" };
const on = (c0: Ctx, fs: readonly Fixture[], a: { actor: string; id: string }, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh(fs, { captureMs: 0, ...bounds }), a);
  c.ensure();
  return c;
};
// A held write under release 1, then a boot under `next`.
const heldThenRelease = (c0: Ctx, next: number) => {
  const rel: Release = { v: 1 };
  const c = on(c0, [keyReleaseTypedFixture(rel)], K);
  c.send("Go");
  c.ack();
  c.answer("charge", { lost: true });
  c.eq("held", c.mem().unsure, 1);
  c.h.release(() => void (rel.v = next), () => void (rel.v = 1));
  c.reload();
  c.send("Go");
  return c;
};

export const round12Scenarios: readonly Scenario[] = [
  {
    // Review M5: D78 was pinned only on a hand key closure. A typed release changes the contract's `key` field list, and the seal makes the key from it (D215).
    id: "R12-KEYS",
    kind: "fault",
    fixtures: [keyReleaseTypedFixture({ v: 1 })],
    actor: K,
    cites: ["D78", "rule:39", "rule:46"],
    variants: {
      // Without the rekey (or with the key still from the old release's data): a second Attempt beside the hold, two requests.
      "a-typed-release-that-changes-the-key-rekeys-and-does-not-mint"(c0) {
        const c = heldThenRelease(c0, 2);
        c.eq("the request count stays", c.reqs("charge").length, 1);
        c.eq("no second Attempt", c.keys("charge").length, 1);
        c.eq("said", c.r.evidence("LaneRekeyed").length, 1);
      },
      // The edge only a typed fixture shows: a release adds a key field the stored input lacks. The key's canonical form drops the absent field, so it is
      // the same lane, and nothing is rekeyed or minted beside it.
      "a-release-that-adds-a-key-field-the-stored-input-lacks-keeps-the-lane"(c0) {
        const c = heldThenRelease(c0, 3);
        c.eq("the request count stays", c.reqs("charge").length, 1);
        c.eq("no second Attempt", c.keys("charge").length, 1);
        c.eq("not rekeyed", c.r.evidence("LaneRekeyed").length, 0);
      },
    },
  },
  {
    // Review Q1: a restore that skips the decode, or an encode that skips the codec, passed all 742 cases. A Date, a NaN and a bigint through a reload.
    id: "R12-MEMORY",
    kind: "fault",
    fixtures: [datesFixture],
    actor: { actor: "Lab/Dates", id: "a" },
    cites: ["D82", "D89"],
    run(c0) {
      const c = on(c0, [datesFixture], { actor: "Lab/Dates", id: "a" });
      c.send("Touch");
      c.reload();
      const m = c.mem() as { at: unknown; n: unknown; big: unknown };
      c.yes("a Date comes back a Date", m.at instanceof Date && m.at.getTime() === 86_400_000);
      c.yes("a NaN comes back a NaN", Number.isNaN(m.n));
      c.eq("a bigint comes back a bigint", m.big, 2n);
    },
  },
  {
    // Review L2 (`drive.services-last-only`): two machines whose commits need different services, booted together. With one machine's services only, the
    // seal refuses the other's operation by name (D213); before it, that commit died as an unnamed Defect and its write was marked unknown.
    id: "R12-SERVICES",
    kind: "fault",
    fixtures: [payFixture, keyReleaseTypedFixture({ v: 1 })],
    actor: K,
    cites: ["rule:57"],
    run(c0) {
      const c = on(c0, [payFixture, keyReleaseTypedFixture({ v: 1 })], K);
      c.send("Go");
      const pay = new Ctx(c.h, { actor: "Checkout/Pay", id: "shopper-1" });
      pay.ensure();
      pay.send("Start", { cartId: "c1", intentId: "pi_1" });
      pay.send("PayRequested", { paymentMethodId: "pm_1" });
      c.ack();
      c.eq("the fake's write left", c.reqs("charge").length, 1);
      c.eq("the shop's write left", c.reqs("pay").length, 1);
      c.eq("no Defect", c.r.issues().filter((i) => i.code === "Defect").length, 0);
    },
  },
  {
    // Review H1: a `Defect` issue carries what died (`step.ts`). Without it, "Service not found" or any other cause is lost.
    id: "R12-DEFECT",
    kind: "fault",
    fixtures: [diesFixture],
    actor: { actor: "Lab/Dies", id: "a" },
    cites: ["rule:13"],
    namedIssues: ["Defect"],
    run(c0) {
      const c = on(c0, [diesFixture], { actor: "Lab/Dies", id: "a" });
      c.send("Go");
      const d = c.r.issues().find((i) => i.code === "Defect") as { readonly cause?: unknown } | undefined;
      c.yes("a Defect", d !== undefined);
      c.eq("that names its cause", d?.cause, "the cause of the death");
    },
  },
];
