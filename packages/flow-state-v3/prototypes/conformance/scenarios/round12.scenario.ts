// Round 12: round 11's final review, pinned where a case is the right pin (review M5, Q1, L2). Each says what it would see without its fix.
import { payFixture } from "../typed/pay.ts";
import { datesFixture, diesFixture, inputFixture, keyReleaseTypedFixture, memReleaseFixture, type Release } from "../typed/round6.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { resourceErrno } from "../verdicts/core.ts";

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
  c.ack(); // so a second Attempt, if one were minted, would leave
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
      // Round 13 (D221): a release that changes the key's fields is a new version of the op. The hold is never renamed; the commit declines beside it.
      // Without D221: a second Attempt beside the hold, two requests.
      "a-typed-release-that-changes-the-key-keeps-the-old-version-hold-and-does-not-mint"(c0) {
        const c = heldThenRelease(c0, 2);
        c.eq("the request count stays", c.reqs("charge").length, 1);
        c.eq("no second Attempt", c.keys("charge").length, 1);
        c.eq("not renamed", c.r.evidence("LaneRekeyed").length, 0);
        c.eq("an old-version hold, said", c.r.evidence("OldVersionLane").length, 1);
        c.eq("declined beside it", c.r.evidence("BesideOldVersion").length, 1);
      },
      // Mid review M2, D217 (proposed): a release adds a key field, and the new commit supplies it. The held lane's stored input lacks the field, so it
      // cannot be rekeyed (D78 has no new name to move it to), and the new key, projected onto the old key's fields, names it. D217: the commit declines
      // (`NotSent { why: "Rejected" }`, rule 16), as beside a hold on its own key; never a second send beside an unsure write (D78, rule 16).
      "a-release-that-adds-a-key-field-declines-beside-the-older-lane"(c0) {
        const c = heldThenRelease(c0, 3);
        c.eq("the request count stays", c.reqs("charge").length, 1);
        c.eq("no second Attempt", c.keys("charge").length, 1);
        c.eq("not rekeyed", c.r.evidence("LaneRekeyed").length, 0);
        c.eq("declined beside the old version", c.r.evidence("BesideOldVersion").length, 1); // round 13 (D221): renamed from BesideOlderKey
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
    // Mid review M3: memory's doors through the Runtime, each from a recorded decision.
    id: "R12-DOORS",
    kind: "fault",
    fixtures: [memReleaseFixture({ v: 1 })],
    actor: { actor: "Lab/MemDoors", id: "a" },
    cites: ["D82", "D46", "rule:44"],
    namedIssues: ["InvalidTurn", "RecordQuarantined"],
    variants: {
      // 2.2.2 and D214: creation checks the input by its Schema; a refusal makes no actor, and the turn's issue names the cause.
      "an-input-its-schema-refuses-makes-no-actor"(c0) {
        const A = { actor: "Lab/Input", id: "a" };
        const c = new Ctx(c0.fresh([inputFixture], { captureMs: 0 }), A);
        c.ensure(A, { who: 5 });
        c.eq("no actor", c.r.state(A), undefined);
        c.yes("the cause is named", c.r.issues().some((i) => i.code === "InvalidTurn" && String((i as { cause?: unknown }).cause).includes("InputRefused")));
        c.ensure({ actor: "Lab/Input", id: "b" });
        c.eq("a missing required input makes none either", c.r.state({ actor: "Lab/Input", id: "b" }), undefined);
        c.yes("and says so", c.r.issues().some((i) => i.code === "InvalidTurn" && String((i as { cause?: unknown }).cause).includes("InputMissing")));
      },
      // D214: a computed field a release adds is computed once from the restored fields.
      "a-computed-field-a-release-adds-is-computed-from-the-restored-fields"(c0) {
        const rel: Release = { v: 1 };
        const c = on(c0, [memReleaseFixture(rel)], { actor: "Lab/MemDoors", id: "a" });
        c.send("Bump");
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("restored, and computed", c.mem(), { n: 3, twice: 6 });
      },
      // D214, D46: a required input a release adds cannot be made up, so the record is quarantined and its bytes are kept, never overwritten unread.
      "a-required-input-a-release-adds-quarantines-the-record"(c0) {
        const rel: Release = { v: 1 };
        const c = on(c0, [memReleaseFixture(rel)], { actor: "Lab/MemDoors", id: "a" });
        c.send("Bump");
        const before = c.record();
        c.h.release(() => void (rel.v = 3), () => void (rel.v = 1));
        c.reload();
        c.yes("quarantined", c.r.issues().some((i) => i.code === "RecordQuarantined"));
        c.eq("the bytes are kept", c.record(), before);
      },
    },
  },
  {
    // D213, rule 57: a boot that does not give a machine's service is refused by name, before anything runs.
    id: "R12-BOOT",
    kind: "fault",
    fixtures: [payFixture],
    actor: { actor: "Checkout/Pay", id: "shopper-1" },
    cites: ["rule:57"],
    run(c0) {
      const { services: _s, ...bare } = payFixture;
      let threw = "";
      try {
        c0.fresh([bare as Fixture]);
      } catch (e) {
        if (resourceErrno(e) !== undefined) throw e;
        threw = String(e);
      }
      c0.yes("refused at the seal", threw.includes("SealMissingService"));
      c0.yes("by the service's name", threw.includes("ShopApi"));
      // The control, and a harness for D130's per-case oracles: given its service, the same machine boots and runs.
      const c = on(c0, [payFixture], { actor: "Checkout/Pay", id: "shopper-1" });
      c.send("Start", { cartId: "c1", intentId: "pi_1" });
      c.state("CARD");
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
