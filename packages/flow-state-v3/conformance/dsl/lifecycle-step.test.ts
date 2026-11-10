import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Cancel, Serialize } from "../fixtures/one-lane.ts";
import { Pay } from "../fixtures/pay.ts";
import { type ActorRef, type Member, MemberTarget, Observation } from "../port.ts";
import { type Request, RequestPhase } from "../world/network.ts";
import { empty, type Model } from "./lifecycle-model.ts";
import { type Known, step } from "./lifecycle-step.ts";
import { Fact } from "./oracle.ts";

const known: Known = {
  reference: referenceFor([Pay, Serialize, Cancel]),
  rows: rowsFor([Pay, Serialize, Cancel]),
};

const shopper: ActorRef = { machine: "Checkout/Pay", id: "s1" };

const putter: ActorRef = { machine: "Lab/P1All", id: "p1" };

const searcher: ActorRef = { machine: "Lab/R15Switch", id: "r1" };

const KEY = { intentId: "pi1" };

const said = (observation: Observation) => Fact.Reported({ observation });

const turn = (
  actor: ActorRef,
  event: string,
  from: string,
  to: string,
  members: ReadonlyArray<Member>,
) => said(Observation.Turn({ actor, event, from, to, parts: [], members }));

const keyed = (operation: string, kind: Member["kind"]) => ({
  operation,
  kind,
  target: MemberTarget.Key({ key: KEY }),
});

const only = (operation: string, kind: Member["kind"]) => ({
  operation,
  kind,
  target: MemberTarget.Only(),
});

const minted = (actor: ActorRef, operation: string, attempt: string, key = Option.some(KEY)) =>
  said(Observation.Minted({ operation, attempt, actor: Option.some(actor), key }));

const sent = (operation: string, attempt: string) => said(Observation.Sent({ operation, attempt }));

const ended = (
  operation: string,
  attempt: string,
  channel: "unknown" | "success",
  reason: string,
) =>
  said(
    Observation.Ended({
      operation,
      attempt: Option.some(attempt),
      channel,
      reason,
      actor: Option.none(),
      failure: Option.none(),
    }),
  );

const delivered = (actor: ActorRef, operation: string, attempt: string, event: string) =>
  said(
    Observation.Delivered({
      operation,
      attempt: Option.some(attempt),
      event,
      actor: Option.some(actor),
    }),
  );

const request = (seq: number, operation: string, attempt: string) => ({
  seq,
  operation,
  input: KEY,
  key: Option.some(attempt),
  phase: RequestPhase.Open(),
});

const refused = (model: Model, facts: ReadonlyArray<Fact>, requests: ReadonlyArray<Request> = []) =>
  step(model, known, facts, requests).applied.flatMap((a) => a.refusals.map((r) => r.invariant));

const after = (model: Model, facts: ReadonlyArray<Fact>, requests: ReadonlyArray<Request> = []) =>
  step(model, known, facts, requests).after;

const phaseOf = (model: Model, attempt: string) =>
  model.attempts.find((a) => a.id === attempt)?.phase._tag;

const wl = (n: number) => `WriteLanes I${n}` as const;

const leave = [
  turn(shopper, "Leave", "CARD", "LEFT", [keyed("void", "commit")]),
  minted(shopper, "void", "v1"),
  sent("void", "v1"),
];

const voidSent = after(empty, leave);

const unsure = [
  ended("void", "v1", "unknown", "Lost"),
  delivered(shopper, "void", "v1", "VoidUnsure"),
];

const voidUnsure = (kind: Member["kind"]) => [
  ...unsure,
  turn(shopper, "VoidUnsure", "LEFT", "LEFT", [keyed("void", kind)]),
];

const sends = (n: number) => Array.from({ length: n }, (_, i) => request(i + 1, "void", "v1"));

describe("lifecycle step", () => {
  it("a turn a row matches anchors its members", () => {
    assert.deepStrictEqual(refused(empty, leave), []);
    assert.equal(phaseOf(voidSent, "v1"), "OnWire");
  });

  it("a mint in a turn no row matches is WriteLanes I1", () => {
    assert.deepStrictEqual(
      refused(empty, [
        turn(shopper, "Leave", "CARD", "PAID", [keyed("void", "commit")]),
        minted(shopper, "void", "v1"),
      ]),
      [wl(1)],
    );
  });

  it("reported members that differ from the row's anchor nothing", () => {
    assert.deepStrictEqual(
      refused(empty, [
        turn(shopper, "Leave", "CARD", "LEFT", [keyed("pay", "commit")]),
        minted(shopper, "pay", "p1"),
      ]),
      [wl(1)],
    );
  });

  it("a root row with `same` matches a turn that stays", () => {
    const go = turn(putter, "Go", "A", "A", [only("put", "commit")]);

    assert.deepStrictEqual(refused(empty, [go, minted(putter, "put", "u1", Option.none())]), []);
  });

  it("retryable picks the retry row while the head has retries left", () => {
    assert.deepStrictEqual(refused(voidSent, voidUnsure("retry"), sends(3)), []);
    assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(3)), "v1"), "Resending");
    assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(3)), []);
    assert.equal(phaseOf(after(voidSent, voidUnsure("cancel"), sends(3)), "v1"), "Held");
  });

  it("retryable picks the cancel row once the retries are spent", () => {
    assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(4)), "v1"), "Held");
    assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(4)), [wl(12)]);
  });

  it("a step's own accepted sends are counted from its Sent reports, not its server log", () => {
    const resending = after(voidSent, voidUnsure("retry"), sends(1));
    const fresh = request(9, "void", "v1");
    const facts = [sent("void", "v1"), ...voidUnsure("retry"), Fact.Requested({ request: fresh })];

    assert.equal(phaseOf(resending, "v1"), "Resending");
    assert.deepStrictEqual(refused(resending, facts, [...sends(3), fresh]), []);
    assert.equal(phaseOf(after(resending, facts, [...sends(3), fresh]), "v1"), "Held");
    assert.equal(phaseOf(after(resending, facts, [...sends(2), fresh]), "v1"), "Resending");
  });

  it("an unknown under cancel is not retained (a turn with no member), and a retry in its own turn keeps it", () => {
    const sentSearch = after(empty, [
      turn(searcher, "Go", "A", "W", [only("search", "commit")]),
      minted(searcher, "search", "s1", Option.none()),
      sent("search", "s1"),
    ]);

    const lost = [
      ended("search", "s1", "unknown", "Lost"),
      delivered(searcher, "search", "s1", "Unsure"),
    ];

    const retried = turn(searcher, "Unsure", "W", "W", [only("search", "retry")]);

    assert.deepStrictEqual(refused(sentSearch, [...lost, turn(searcher, "Unsure", "W", "A", [])]), [
      wl(12),
    ]);
    assert.deepStrictEqual(refused(sentSearch, [...lost, retried]), []);
  });

  it("the delivering ending's turn is heard, and its life closes", () => {
    const heard = after(voidSent, voidUnsure("retry"), sends(1));

    assert.deepStrictEqual(
      heard.endings.map((e) => e.life._tag),
      ["Closed"],
    );
    assert.deepStrictEqual(refused(voidSent, unsure, sends(1)), [wl(15)]);
  });

  it("an Incarnated with no suite use of its actor in the step opens nothing", () => {
    const incarnated = said(Observation.Incarnated({ actor: shopper }));
    const ensured = Fact.Ensured({ actor: shopper, use: "host" });

    assert.equal(after(empty, [incarnated]).actors.length, 0);
    assert.equal(after(empty, [ensured, incarnated]).actors[0]?.incarnation, 1);
    assert.equal(after(empty, [Fact.Reloaded(), incarnated, incarnated]).actors[0]?.incarnation, 1);
  });

  it("an Ensured of an unbound actor adopts it", () => {
    const graced = after(empty, [
      Fact.Ensured({ actor: shopper, use: "host" }),
      said(Observation.Incarnated({ actor: shopper })),
      said(Observation.Finished({ actor: shopper })),
    ]);

    const adopted = after(graced, [
      Fact.Ensured({ actor: shopper, use: "host" }),
      said(Observation.Incarnated({ actor: shopper })),
    ]);

    assert.deepStrictEqual(adopted.actors, [{ actor: shopper, record: "bound", incarnation: 2 }]);
  });
});
