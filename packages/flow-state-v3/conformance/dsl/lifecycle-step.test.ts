/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Cancel, Serialize } from "../fixtures/one-lane.ts";
import { Pay } from "../fixtures/pay.ts";
import { type ActorRef, type Member, MemberTarget, Observation } from "../port.ts";
import { type Request, RequestPhase } from "../world/network.ts";
import { empty, type Model } from "./lifecycle-model.ts";
import type { Known } from "./lifecycle-owed.ts";
import { perturbationsOf } from "./lifecycle-perturbations.ts";
import { step } from "./lifecycle-step.ts";
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

type Step = typeof step;

const using = (run: Step) => ({
  run,
  refused: (
    model: Model,
    facts: ReadonlyArray<Fact>,
    requests: ReadonlyArray<Request> = [],
    under: Known = known,
  ) =>
    run(model, under, facts, requests).applied.flatMap((a) => a.refusals.map((r) => r.invariant)),
  after: (model: Model, facts: ReadonlyArray<Fact>, requests: ReadonlyArray<Request> = []) =>
    run(model, known, facts, requests).after,
});

const phaseOf = (model: Model, attempt: string) =>
  model.attempts.find((a) => a.id === attempt)?.phase._tag;

const wl = (n: number) => `WriteLanes I${n}` as const;

const leave = [
  turn(shopper, "Leave", "CARD", "LEFT", [keyed("void", "commit")]),
  minted(shopper, "void", "v1"),
  sent("void", "v1"),
];

const voidSent = using(step).after(empty, leave);

const unsure = [
  ended("void", "v1", "unknown", "Lost"),
  delivered(shopper, "void", "v1", "VoidUnsure"),
];

const voidUnsure = (kind: Member["kind"]) => [
  ...unsure,
  turn(shopper, "VoidUnsure", "LEFT", "LEFT", [keyed("void", kind)]),
];

const sends = (n: number) => Array.from({ length: n }, (_, i) => request(i + 1, "void", "v1"));

type Example = { readonly name: string; readonly run: (s: ReturnType<typeof using>) => void };

const examples: ReadonlyArray<Example> = [
  {
    name: "a turn a row matches anchors its members",
    run: ({ refused }) => {
      assert.deepStrictEqual(refused(empty, leave), []);
      assert.equal(phaseOf(voidSent, "v1"), "OnWire");
    },
  },

  {
    name: "a mint in a turn no row matches is WriteLanes I1",
    run: ({ refused }) => {
      assert.deepStrictEqual(
        refused(empty, [
          turn(shopper, "Leave", "CARD", "PAID", [keyed("void", "commit")]),
          minted(shopper, "void", "v1"),
        ]),
        [wl(1)],
      );
    },
  },

  {
    name: "reported members that differ from the row's anchor nothing",
    run: ({ refused }) => {
      assert.deepStrictEqual(
        refused(empty, [
          turn(shopper, "Leave", "CARD", "LEFT", [keyed("pay", "commit")]),
          minted(shopper, "pay", "p1"),
        ]),
        [wl(1)],
      );
    },
  },

  {
    name: "a cancel the chosen row owes is owed though the report drops it (step 4 review H1)",
    run: ({ refused }) => {
      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(4)), [wl(12)]);
      assert.deepStrictEqual(
        refused(voidSent, [...unsure, turn(shopper, "VoidUnsure", "LEFT", "LEFT", [])], sends(4)),
        [wl(12)],
      );
    },
  },

  {
    name: "a claimed row is owed only when the report names its members",
    run: ({ refused }) => {
      assert.deepStrictEqual(refused(empty, [turn(shopper, "Leave", "CARD", "LEFT", [])]), []);
    },
  },

  {
    name: "a root row with `same` matches a turn that stays",
    run: ({ refused }) => {
      const go = turn(putter, "Go", "A", "A", [only("put", "commit")]);

      assert.deepStrictEqual(refused(empty, [go, minted(putter, "put", "u1", Option.none())]), []);
    },
  },

  {
    name: "retryable picks the retry row while the head has retries left, whatever was reported",
    run: ({ refused, after }) => {
      assert.deepStrictEqual(refused(voidSent, voidUnsure("retry"), sends(3)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(3)), "v1"), "Resending");
      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(3)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("cancel"), sends(3)), "v1"), "Resending");
    },
  },

  {
    name: "retryable picks the cancel row once the retries are spent",
    run: ({ refused, after }) => {
      assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(4)), "v1"), "Held");
      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(4)), [wl(12)]);
    },
  },

  {
    name: "a step's own accepted sends are counted from its Sent reports, not its server log",
    run: ({ refused, after }) => {
      const resending = after(voidSent, voidUnsure("retry"), sends(1));
      const fresh = request(9, "void", "v1");

      const facts = [
        sent("void", "v1"),
        ...voidUnsure("retry"),
        Fact.Requested({ request: fresh }),
      ];

      assert.equal(phaseOf(resending, "v1"), "Resending");
      assert.deepStrictEqual(refused(resending, facts, [...sends(3), fresh]), [wl(12)]);
      assert.equal(phaseOf(after(resending, facts, [...sends(3), fresh]), "v1"), "Held");
      assert.equal(phaseOf(after(resending, facts, [...sends(2), fresh]), "v1"), "Resending");
    },
  },

  {
    name: "an unknown under cancel is not retained (a turn with no member), and a retry in its own turn keeps it",
    run: ({ refused, after }) => {
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

      assert.deepStrictEqual(
        refused(sentSearch, [...lost, turn(searcher, "Unsure", "W", "A", [])]),
        [wl(12)],
      );
      assert.deepStrictEqual(refused(sentSearch, [...lost, retried]), []);
    },
  },

  {
    name: "the delivering ending's turn is heard, and its life closes",
    run: ({ refused, after }) => {
      const heard = after(voidSent, voidUnsure("retry"), sends(1));

      assert.deepStrictEqual(
        heard.endings.map((e) => e.life._tag),
        ["Closed"],
      );
      assert.deepStrictEqual(refused(voidSent, unsure, sends(1)), [wl(15)]);
    },
  },

  {
    name: "an Incarnated with no suite use of its actor in the step opens nothing",
    run: ({ after }) => {
      const incarnated = said(Observation.Incarnated({ actor: shopper }));
      const ensured = Fact.Ensured({ actor: shopper, use: "host" });

      assert.equal(after(empty, [incarnated]).actors.length, 0);
      assert.equal(after(empty, [ensured, incarnated]).actors[0]?.incarnation, 1);
      assert.equal(
        after(empty, [Fact.Reloaded(), incarnated, incarnated]).actors[0]?.incarnation,
        1,
      );
    },
  },

  {
    name: "an Ensured of an unbound actor adopts it",
    run: ({ after }) => {
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
    },
  },
  {
    name: "a release member on an operation that leaving does not release anchors nothing",
    run: ({ refused }) => {
      const released = said(
        Observation.Evidence({ kind: "Released", operation: "void", attempt: Option.some("v1") }),
      );

      assert.ok(refused(voidSent, [...voidUnsure("release"), released], sends(1)).includes(wl(12)));
    },
  },
  {
    name: "a Delivered closes the open turn, so a later mint is outside it",
    run: ({ refused }) => {
      const [leaving] = leave;
      const late = minted(shopper, "void", "v1");
      const delivery = delivered(shopper, "pay", "p0", "Placed");

      assert.ok(leaving !== undefined);
      assert.ok(refused(empty, [leaving, delivery, late]).includes(wl(1)));
      assert.deepStrictEqual(refused(empty, [leaving, late]), []);
    },
  },
  {
    name: "a release member anchors in a turn that leaves a releasing state, and only there",
    run: ({ refused }) => {
      const releasing = (t: { event: string; from: string; to: string }) => ({
        ...known,
        reference: {
          ...known.reference,
          [shopper.machine]: Object.fromEntries(
            Object.entries(known.reference[shopper.machine] ?? {}).map(([name, o]) => [
              name,
              name === "void" ? { ...o, releasesOnLeave: [t] } : o,
            ]),
          ),
        },
      });

      const released = said(
        Observation.Evidence({ kind: "Released", operation: "void", attempt: Option.some("v1") }),
      );

      const facts = [...voidUnsure("release"), released];

      const refusedWith = (k: Known) => refused(voidSent, facts, sends(1), k);

      const leaving = releasing({ event: "VoidUnsure", from: "LEFT", to: "LEFT" });

      assert.deepStrictEqual(refusedWith(leaving), []);
      assert.deepStrictEqual(
        refused(voidSent, [...voidUnsure("retry"), released], sends(1), leaving),
        [],
        "a release on leave is owed though the report omits it",
      );

      for (const other of [
        { event: "VoidUnsure", from: "LEFT", to: "CARD" },
        { event: "VoidUnsure", from: "CARD", to: "LEFT" },
        { event: "IntentRead", from: "LEFT", to: "LEFT" },
      ])
        assert.ok(refusedWith(releasing(other)).includes(wl(12)), JSON.stringify(other));
    },
  },
  {
    name: "another actor's turn of the same event does not hear the ending",
    run: ({ after }) => {
      const other: ActorRef = { machine: "Checkout/Pay", id: "s2" };

      const heardByOther = after(
        voidSent,
        [...unsure, turn(other, "VoidUnsure", "LEFT", "LEFT", [])],
        sends(1),
      );

      assert.deepStrictEqual(
        heardByOther.endings.map((e) => e.life._tag),
        ["Delivering"],
      );
    },
  },
  {
    name: "every perturbation of a reference row's report, header and actor facts leaves what the turn owes",
    run: ({ run }) => {
      const { failures, limits, caught } = perturbationsOf(run);

      assert.deepStrictEqual(failures, []);
      assert.equal(limits.length, 4, limits.join("; "));
      assert.deepStrictEqual(caught, [
        "dropped",
        "duplicated",
        "extra",
        "header-from",
        "header-to",
        "parked-while-held",
        "release",
        "reordered",
        "retargeted",
        "unknown",
      ]);
    },
  },
  {
    name: "a keyed cancel reported with target Nothing is owed on the actor's lanes (step 6 review PD)",
    run: ({ refused }) => {
      const pay = [
        turn(shopper, "PayRequested", "CARD", "PAYING", [keyed("pay", "commit")]),
        minted(shopper, "pay", "p1"),
        sent("pay", "p1"),
        ended("pay", "p1", "unknown", "Lost"),
        delivered(shopper, "pay", "p1", "PayUnsure"),
        turn(shopper, "PayUnsure", "PAYING", "UNSURE", []),
      ];

      const held = using(step).after(empty, pay);

      const seen = (target: MemberTarget) =>
        refused(held, [
          turn(shopper, "OrderSeen", "UNSURE", "PAID", [
            { operation: "pay", kind: "cancel", target },
          ]),
        ]);

      assert.deepStrictEqual(seen(MemberTarget.Nothing()), [wl(12)]);
      assert.deepStrictEqual(seen(MemberTarget.Key({ key: { intentId: "elsewhere" } })), [wl(12)]);
      assert.deepStrictEqual(seen(MemberTarget.Key({ key: KEY })), [wl(12)]);
    },
  },
  {
    name: "a keyed cancel owes only its own lane when the actor holds two",
    run: ({ refused }) => {
      const two = { intentId: "pi2" };

      const unsure = (attempt: string) => [
        ended("pay", attempt, "unknown", "Lost"),
        delivered(shopper, "pay", attempt, "PayUnsure"),
        turn(shopper, "PayUnsure", "PAYING", "UNSURE", []),
      ];

      const held = using(step).after(empty, [
        turn(shopper, "PayRequested", "CARD", "PAYING", [keyed("pay", "commit")]),
        minted(shopper, "pay", "p1"),
        sent("pay", "p1"),
        turn(shopper, "PayRequested", "PAYING", "PAYING", [
          { operation: "pay", kind: "commit", target: MemberTarget.Key({ key: two }) },
        ]),
        minted(shopper, "pay", "p2", Option.some(two)),
        sent("pay", "p2"),
        ...unsure("p1"),
        ...unsure("p2"),
      ]);

      const seen = turn(shopper, "OrderSeen", "UNSURE", "PAID", [keyed("pay", "cancel")]);

      const released = said(
        Observation.Evidence({ kind: "Released", operation: "pay", attempt: Option.some("p1") }),
      );

      assert.deepStrictEqual(refused(held, [seen, released]), []);
      assert.deepStrictEqual(refused(held, [seen]), [wl(12)]);

      const twice = turn(shopper, "OrderSeen", "UNSURE", "PAID", [
        { operation: "pay", kind: "cancel", target: MemberTarget.Key({ key: two }) },
        keyed("pay", "cancel"),
      ]);

      assert.deepStrictEqual(refused(held, [twice]), [wl(12), wl(12)], "two keys name no one lane");
    },
  },
  {
    name: "a claimed row is confirmed by its members whatever else the report names (step 6 review M2)",
    run: ({ refused }) => {
      const ghost = { operation: "ghost", kind: "commit" as const, target: MemberTarget.Only() };

      assert.deepStrictEqual(
        refused(empty, [turn(shopper, "Leave", "CARD", "LEFT", [ghost, keyed("void", "commit")])]),
        [wl(15)],
      );
    },
  },
];

const HERE = dirname(fileURLToPath(import.meta.url));

const STEP_MUTANTS: ReadonlyArray<{
  readonly name: string;
  readonly file: "lifecycle-owed.ts" | "lifecycle-step.ts";
  readonly find: string;
  readonly replace: string;
}> = [
  {
    name: "a reported key retargets a key-less member",
    file: "lifecycle-owed.ts",
    find: "  if (!member.keyed) return keylessTarget(model, hearing, member);",
    replace:
      "  if (!member.keyed)\n    return Option.match(said, { onNone: () => keylessTarget(model, hearing, member), onSome: (key) => MemberTarget.Key({ key }) });",
  },
  {
    name: "a keyed member takes any reported key",
    file: "lifecycle-owed.ts",
    find: "    lanesOfOperation(model, turn.actor, member.operation).some((l) =>",
    replace: "    true || lanesOfOperation(model, turn.actor, member.operation).some((l) =>",
  },
  {
    name: "a keyed member whose key is not reported names nothing",
    file: "lifecycle-owed.ts",
    find: "  return Option.match(held, {\n    onNone: () => MemberTarget.Every(),",
    replace: "  return Option.match(held, {\n    onNone: () => MemberTarget.Nothing(),",
  },
  {
    name: "an unkeyed member takes the reported target",
    file: "lifecycle-owed.ts",
    find: "  if (!keyed) return MemberTarget.Only();",
    replace: "  if (!keyed) return confirmed(turn, member)?.target ?? MemberTarget.Only();",
  },
  {
    name: "a commit ignores its reported key",
    file: "lifecycle-owed.ts",
    find: '  if (member.kind === "commit")\n    return Option.match(said, {',
    replace: '  if (member.kind === "commit")\n    return Option.match(Option.none<Json>(), {',
  },
  {
    name: "a guard reads the reported members (step 6 review H1)",
    file: "lifecycle-owed.ts",
    find: "guardHolds(model, row, turn.actor, resolved(model, known, turn, hearing, row), sends),",
    replace: "guardHolds(model, row, turn.actor, turn.members, sends),",
  },
  {
    name: "a claimed row needs the report to name exactly its members (step 6 review M2)",
    file: "lifecycle-owed.ts",
    find: "(!row.claimed || row.members.every((m) => confirmed(turn, m) !== undefined)) &&",
    replace:
      "(!row.claimed || (turn.members.length === row.members.length && row.members.every((m) => confirmed(turn, m) !== undefined))) &&",
  },
  {
    name: "a claimed row is owed whatever was reported",
    file: "lifecycle-owed.ts",
    find: "      (!row.claimed || row.members.every((m) => confirmed(turn, m) !== undefined)) &&\n",
    replace: "",
  },
  {
    name: "releases come from the report (step 6 review L6)",
    file: "lifecycle-owed.ts",
    find: "  return [...lane, ...releasesOwed(known, turn)].flatMap((m) =>",
    replace:
      '  return [...lane, ...turn.members.filter((m) => m.kind === "release")].flatMap((m) =>',
  },
  {
    name: "a release is owed on any operation",
    file: "lifecycle-owed.ts",
    find: "o.releasesOnLeave.some(",
    replace: "true || o.releasesOnLeave.some(",
  },
  {
    name: "a release is owed on a leaving transition of another event",
    file: "lifecycle-owed.ts",
    find: "(t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,",
    replace: "(t) => t.from === turn.from && t.to === turn.to,",
  },
  {
    name: "a release is owed on a leaving transition from another state",
    file: "lifecycle-owed.ts",
    find: "(t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,",
    replace: "(t) => t.event === turn.event && t.to === turn.to,",
  },
  {
    name: "a release is owed on a leaving transition to another state",
    file: "lifecycle-owed.ts",
    find: "(t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,",
    replace: "(t) => t.event === turn.event && t.from === turn.from,",
  },
  {
    name: "retryable counts one retry more",
    file: "lifecycle-owed.ts",
    find: "sends(h.id) - 1 < guard.times",
    replace: "sends(h.id) - 1 <= guard.times",
  },
  {
    name: "a reported key counts from its first copy",
    file: "lifecycle-owed.ts",
    find: "keys.every((other) => sameJson(other, k))",
    replace: "true",
  },
  {
    name: "a keyed member always names every lane",
    file: "lifecycle-owed.ts",
    find: "  return Option.match(held, {\n    onNone: () => MemberTarget.Every(),\n    onSome: (key) => MemberTarget.Key({ key }),",
    replace:
      "  return Option.match(held, {\n    onNone: () => MemberTarget.Every(),\n    onSome: () => MemberTarget.Every(),",
  },
  {
    name: "a turn hears no ending",
    file: "lifecycle-step.ts",
    find: "onSome: (ending) => pushed(walk, LifeMove.Heard({ ending }), given),",
    replace: "onSome: () => walk,",
  },
  {
    name: "retention inverted",
    file: "lifecycle-step.ts",
    find: "onSome: (o) => retains(o, reason),",
    replace: "onSome: (o) => !retains(o, reason),",
  },
  {
    name: "a turn hears another actor's ending",
    file: "lifecycle-step.ts",
    find: "onSome: (a) => sameActor(a, e.actor)",
    replace: "onSome: () => true",
  },
  {
    name: "a Delivered closes no turn",
    file: "lifecycle-step.ts",
    find: "const open = closedTurn(walk, given);",
    replace: "const open = walk;",
  },
];

const killed = (run: Step) =>
  examples.some((example) => {
    try {
      example.run(using(run));

      return false;
    } catch (failure) {
      if (failure instanceof assert.AssertionError) return true;
      throw failure;
    }
  });

describe("lifecycle step", () => {
  for (const example of examples) it(example.name, () => example.run(using(step)));

  it("every step mutant is killed by an example (review M3)", async () => {
    const sources = {
      "lifecycle-owed.ts": readFileSync(join(HERE, "lifecycle-owed.ts"), "utf8"),
      "lifecycle-step.ts": readFileSync(join(HERE, "lifecycle-step.ts"), "utf8"),
    };

    for (const [index, mutant] of STEP_MUTANTS.entries()) {
      const source = sources[mutant.file];

      assert.equal(source.split(mutant.find).length - 1, 1, `${mutant.name}: applies once`);
      const tag = `mutant-${process.pid}-${index}`;
      const owed = join(HERE, `lifecycle-owed.${tag}.ts`);
      const stepped = join(HERE, `lifecycle-step.${tag}.ts`);
      const mutated = source.replace(mutant.find, () => mutant.replace);

      if (mutant.file === "lifecycle-owed.ts") writeFileSync(owed, mutated);
      writeFileSync(
        stepped,
        mutant.file === "lifecycle-step.ts"
          ? mutated
          : sources["lifecycle-step.ts"].replace(
              "./lifecycle-owed.ts",
              `./lifecycle-owed.${tag}.ts`,
            ),
      );

      try {
        const imported: { readonly step: Step } = await import(stepped);
        assert.ok(killed(imported.step), `${mutant.name}: survived`);
      } finally {
        rmSync(owed, { force: true });
        rmSync(stepped, { force: true });
      }
    }
  });
});
