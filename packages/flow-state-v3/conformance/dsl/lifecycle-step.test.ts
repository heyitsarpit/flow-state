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

type Step = typeof step;

const using = (run: Step) => ({
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
    name: "a root row with `same` matches a turn that stays",
    run: ({ refused }) => {
      const go = turn(putter, "Go", "A", "A", [only("put", "commit")]);

      assert.deepStrictEqual(refused(empty, [go, minted(putter, "put", "u1", Option.none())]), []);
    },
  },

  {
    name: "retryable picks the retry row while the head has retries left",
    run: ({ refused, after }) => {
      assert.deepStrictEqual(refused(voidSent, voidUnsure("retry"), sends(3)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(3)), "v1"), "Resending");
      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(3)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("cancel"), sends(3)), "v1"), "Held");
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
      assert.deepStrictEqual(refused(resending, facts, [...sends(3), fresh]), []);
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

      assert.deepStrictEqual(
        refusedWith(releasing({ event: "VoidUnsure", from: "LEFT", to: "LEFT" })),
        [],
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
];

const HERE = dirname(fileURLToPath(import.meta.url));

const STEP_MUTANTS: ReadonlyArray<{
  readonly name: string;
  readonly find: string;
  readonly replace: string;
}> = [
  {
    name: "a release member anchors on any operation",
    find: "o.releasesOnLeave.some(",
    replace: "true || o.releasesOnLeave.some(",
  },
  {
    name: "a release member anchors on a leaving transition of another event",
    find: "(t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,",
    replace: "(t) => t.from === turn.from && t.to === turn.to,",
  },
  {
    name: "a release member anchors on a leaving transition from another state",
    find: "(t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,",
    replace: "(t) => t.event === turn.event && t.to === turn.to,",
  },
  {
    name: "a release member anchors on a leaving transition to another state",
    find: "(t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,",
    replace: "(t) => t.event === turn.event && t.from === turn.from,",
  },
  {
    name: "a turn hears no ending",
    find: "onSome: (ending) => pushed(walk, LifeMove.Heard({ ending }), given),",
    replace: "onSome: () => walk,",
  },
  {
    name: "retryable counts one retry more",
    find: "sendsOf(walk, h.id, earlier) - 1 < guard.times",
    replace: "sendsOf(walk, h.id, earlier) - 1 <= guard.times",
  },
  {
    name: "retention inverted",
    find: "onSome: (o) => retains(o, reason),",
    replace: "onSome: (o) => !retains(o, reason),",
  },
  {
    name: "a turn hears another actor's ending",
    find: "onSome: (a) => sameActor(a, e.actor)",
    replace: "onSome: () => true",
  },
  {
    name: "a Delivered closes no turn",
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
    const source = readFileSync(join(HERE, "lifecycle-step.ts"), "utf8");

    for (const [index, mutant] of STEP_MUTANTS.entries()) {
      assert.equal(source.split(mutant.find).length - 1, 1, `${mutant.name}: applies once`);
      const file = join(HERE, `lifecycle-step.mutant-${process.pid}-${index}.ts`);
      writeFileSync(
        file,
        source.replace(mutant.find, () => mutant.replace),
      );

      try {
        const mutated: { readonly step: Step } = await import(file);
        assert.ok(killed(mutated.step), `${mutant.name}: survived`);
      } finally {
        rmSync(file, { force: true });
      }
    }
  });
});
