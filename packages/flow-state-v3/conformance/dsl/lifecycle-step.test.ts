/// <reference types="node" />
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Formatter, Option } from "effect";
import { handlersFor, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import type { Folded } from "../fixtures/folds.ts";
import { FRESH, keyOf } from "../turn/anchor.ts";
import { Phase } from "../turn/phases.ts";
import { type Anchor, anchorOf, judgedStep } from "../turn/selection.ts";
import { possible } from "../fixtures/handlers.ts";
import { Cancel, Serialize } from "../fixtures/one-lane.ts";
import { Pay } from "../fixtures/pay.ts";
import { type ActorRef, type Member, MemberTarget, Observation } from "../port.ts";
import { type Request, RequestPhase } from "../world/network.ts";
import { empty, type Model } from "./lifecycle-model.ts";
import type { Known } from "./lifecycle-owed.ts";
import { rules } from "./lifecycle-rules.ts";
import { step } from "./lifecycle-step.ts";
import { Fact } from "./oracle.ts";
import type { Script } from "./script.ts";
import { killedBy, pilots } from "../parts/model-mutation.ts";
import { playPart } from "../parts/play.ts";
import { oracles } from "../suite.ts";

const FIXTURES = [Pay, Serialize, Cancel];

const known: Known = {
  reference: referenceFor(FIXTURES),
  local: [],
  rows: rowsFor(FIXTURES),
  timed: {},
  captureMs: 0,
};

const shopper: ActorRef = { machine: "Checkout/Pay", id: "s1" };

const putter: ActorRef = { machine: "Lab/P1All", id: "p1" };

const searcher: ActorRef = { machine: "Lab/R15Switch", id: "r1" };

const KEY = { intentId: "pi1" };

const said = (observation: Observation) => Fact.Reported({ observation });

/**
 * A turn as a runtime reports it: its root part names the alternative of the machine's table that
 * leads from `from` to `to` (the first such, or `at`).
 */
const turn = (
  actor: ActorRef,
  event: string,
  from: string,
  to: string,
  members: ReadonlyArray<Member>,
  at: Option.Option<string> = Option.none(),
) => {
  const handlers = handlersFor(FIXTURES)[actor.machine];

  const ran = Option.getOrUndefined(
    Option.orElse(at, () =>
      Option.fromUndefinedOr(
        handlers === undefined
          ? undefined
          : possible(handlers, from, event, "either").alternatives.find((a) => a.to === to)?.at,
      ),
    ),
  );

  const parts =
    ran === undefined
      ? []
      : [{ part: [], definition: actor.machine, at: ran, node: "", target: "" }];

  return said(Observation.Turn({ actor, event, from, to, parts, members }));
};

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

const reportedSent = (operation: string, attempt: string) =>
  said(Observation.Sent({ operation, attempt }));

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

const sent = (operation: string, attempt: string) => [
  reportedSent(operation, attempt),
  Fact.Requested({ request: request(100, operation, attempt) }),
];

type Step = typeof step;

/**
 * The turn anchor each model was reached with, so a step that starts from it is predicted from
 * the same anchor (selection carries it between steps, as the Case does).
 */
const anchors = new WeakMap<Model, Anchor>();

/**
 * Selection's own predictions of a step's turns (`turn/selection.ts` `judgedStep`) from the anchor
 * that reached `model`, over the fixtures' handler tables: the step never sees a prediction
 * copied from the report (T45 S5).
 */
/**
 * The anchor a test starts from: the shopper's record holds the cart the examples' keys name
 * (`KEY`), at a leaf each test's first turn gives, as an actor restored from an earlier page is.
 */
const seeded = (under: Known) => {
  const start = anchorOf(handlersFor(FIXTURES), under.reference, under.rows);

  return {
    ...start,
    actors: new Map([
      [
        keyOf(shopper),
        {
          ...FRESH,
          phase: Phase.Unanchored(),
          fields: Option.some({
            intentId: KEY.intentId,
            cartId: "c1",
            authorized: true,
            receipt: null,
          }),
        },
      ],
    ]),
  };
};

/**
 * The shopper's record now names another intent, as a new cart would: its next commit's key.
 */
const recarted = (model: Model, intentId: string) => refielded(model, { intentId });

/**
 * The shopper's record with `patch` folded into its fields.
 */
const refielded = (model: Model, patch: Folded) => {
  const anchor = anchors.get(model);

  if (anchor === undefined) return;

  anchors.set(model, {
    ...anchor,
    actors: new Map(
      [...anchor.actors].map(([key, a]) => [
        key,
        key === keyOf(shopper)
          ? { ...a, fields: Option.map(a.fields, (f) => ({ ...f, ...patch })) }
          : a,
      ]),
    ),
  });
};

const predicted = (model: Model, under: Known, facts: ReadonlyArray<Fact>) =>
  judgedStep(anchors.get(model) ?? seeded(under), facts);

const using = (run: Step) => {
  const stepped = (
    model: Model,
    under: Known,
    facts: ReadonlyArray<Fact>,
    requests: ReadonlyArray<Request>,
  ) => {
    const judged = predicted(model, under, facts);
    const life = run(model, under, facts, requests, rules, judged.turns);
    anchors.set(life.after, judged.state);

    return life;
  };

  return {
    run: stepped,
    refused: (
      model: Model,
      facts: ReadonlyArray<Fact>,
      requests: ReadonlyArray<Request> = [],
      under: Known = known,
    ) =>
      stepped(model, under, facts, requests).applied.flatMap((a) =>
        a.refusals.map((r) => r.invariant),
      ),
    after: (model: Model, facts: ReadonlyArray<Fact>, requests: ReadonlyArray<Request> = []) =>
      stepped(model, known, facts, requests).after,
  };
};

const phaseOf = (model: Model, attempt: string) =>
  model.attempts.find((a) => a.id === attempt)?.phase._tag;

const wl = (n: number) => `WriteLanes I${n}` as const;

const leave = [
  turn(shopper, "Leave", "CARD", "LEFT", [keyed("void", "commit")]),
  minted(shopper, "void", "v1"),
  ...sent("void", "v1"),
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
          turn(
            shopper,
            "Leave",
            "CARD",
            "LEFT",
            [keyed("pay", "commit")],
            Option.some("on.Leave[1]"),
          ),
          minted(shopper, "pay", "p1"),
        ]),
        [wl(1)],
      );
    },
  },

  {
    name: "a cancel the chosen row owes is owed though the report drops it (step 4 review H1)",
    run: ({ refused, after }) => {
      const dropped = [...unsure, turn(shopper, "VoidUnsure", "LEFT", "LEFT", [])];

      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(4)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("cancel"), sends(4)), "v1"), "Gone");
      assert.deepStrictEqual(refused(voidSent, dropped, sends(4)), []);
      assert.equal(phaseOf(after(voidSent, dropped, sends(4)), "v1"), "Gone");
    },
  },

  {
    name: "an alternative's row is not owed when the fallthrough ran",
    run: ({ refused }) => {
      assert.deepStrictEqual(
        refused(empty, [turn(shopper, "Leave", "CARD", "LEFT", [], Option.some("on.Leave[1]"))]),
        [],
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
    name: "retryable picks the retry row while the head has retries left, whatever was reported",
    run: ({ refused, after }) => {
      assert.deepStrictEqual(refused(voidSent, voidUnsure("retry"), sends(3)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(3)), "v1"), "Resending");
      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(3)), []);
      assert.equal(phaseOf(after(voidSent, voidUnsure("cancel"), sends(3)), "v1"), "Resending");
    },
  },

  {
    name: "a key-less member names the heard ending's lane, whatever key the turn predicts (WriteLanes R9)",
    run: ({ after }) => {
      const elsewhere = turn(shopper, "VoidUnsure", "LEFT", "LEFT", [
        {
          operation: "void",
          kind: "retry",
          target: MemberTarget.Key({ key: { intentId: "elsewhere" } }),
        },
      ]);

      const moved = after(empty, leave);
      recarted(moved, "elsewhere");

      assert.equal(phaseOf(after(moved, [...unsure, elsewhere], sends(1)), "v1"), "Resending");
    },
  },

  {
    name: "an alternative's row is owed only when its own alternative ran",
    run: ({ refused }) => {
      const fallthrough = turn(shopper, "Leave", "CARD", "LEFT", [], Option.some("on.Leave[1]"));
      const unauthorized = using(step).after(empty, []);
      refielded(unauthorized, { authorized: false });

      assert.deepStrictEqual(refused(unauthorized, [fallthrough]), []);
    },
  },

  {
    name: "retryable picks the cancel row once the retries are spent",
    run: ({ refused, after }) => {
      assert.equal(phaseOf(after(voidSent, voidUnsure("retry"), sends(4)), "v1"), "Gone");
      assert.deepStrictEqual(refused(voidSent, voidUnsure("cancel"), sends(4)), []);
    },
  },

  {
    name: "a step's own sends are its server log's requests, matched to its Sent reports and counted once",
    run: ({ refused, after }) => {
      const resending = after(voidSent, voidUnsure("retry"), sends(1));
      const fresh = request(9, "void", "v1");

      const facts = [
        reportedSent("void", "v1"),
        ...voidUnsure("retry"),
        Fact.Requested({ request: fresh }),
      ];

      assert.equal(phaseOf(resending, "v1"), "Resending");
      assert.deepStrictEqual(refused(resending, facts, [...sends(3), fresh]), []);
      assert.equal(phaseOf(after(resending, facts, [...sends(3), fresh]), "v1"), "Gone");
      assert.equal(phaseOf(after(resending, facts, [...sends(2), fresh]), "v1"), "Resending");
    },
  },

  {
    name: "an unknown under cancel is not retained (a turn with no member), and a retry in its own turn keeps it",
    run: ({ refused, after }) => {
      const sentSearch = after(empty, [
        turn(searcher, "Go", "A", "W", [only("search", "commit")]),
        minted(searcher, "search", "s1", Option.none()),
        ...sent("search", "s1"),
      ]);

      const lost = [
        ended("search", "s1", "unknown", "Lost"),
        delivered(searcher, "search", "s1", "Unsure"),
      ];

      const retried = turn(searcher, "Unsure", "W", "W", [only("search", "retry")]);

      assert.deepStrictEqual(
        refused(sentSearch, [...lost, turn(searcher, "Unsure", "W", "A", [])]),
        [wl(5)],
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
      assert.equal(after(empty, [ensured, incarnated]).actors[0]?.record, "bound");
    },
  },

  {
    name: "a second Incarnated of one actor in a step opens nothing",
    run: ({ after }) => {
      const incarnated = said(Observation.Incarnated({ actor: shopper }));

      const twice = after(empty, [
        Fact.Ensured({ actor: shopper, use: "host" }),
        incarnated,
        Fact.Released({ actor: shopper, use: "host" }),
        Fact.Advanced({ ms: 200 }),
        said(Observation.Finished({ actor: shopper })),
        incarnated,
      ]);

      assert.notEqual(twice.actors[0]?.record, "bound");
    },
  },
  {
    name: "an Ensured of an unbound actor adopts it",
    run: ({ after }) => {
      const graced = after(empty, [
        Fact.Ensured({ actor: shopper, use: "host" }),
        said(Observation.Incarnated({ actor: shopper })),
        Fact.Released({ actor: shopper, use: "host" }),
        Fact.Advanced({ ms: 200 }),
        said(Observation.Finished({ actor: shopper })),
      ]);

      const adopted = after(graced, [
        Fact.Ensured({ actor: shopper, use: "host" }),
        said(Observation.Incarnated({ actor: shopper })),
      ]);

      assert.deepStrictEqual(adopted.actors, [{ actor: shopper, record: "bound" }]);
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
        assert.ok(refusedWith(releasing(other)).includes(wl(12)), Formatter.format(other));
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
    name: "a keyed cancel reported with target Nothing is owed on the actor's lanes (step 6 review PD)",
    run: ({ refused, after }) => {
      const pay = [
        turn(shopper, "PayRequested", "CARD", "PAYING", [keyed("pay", "commit")]),
        minted(shopper, "pay", "p1"),
        ...sent("pay", "p1"),
        ended("pay", "p1", "unknown", "Lost"),
        delivered(shopper, "pay", "p1", "PayUnsure"),
        turn(shopper, "PayUnsure", "PAYING", "UNSURE", []),
      ];

      const held = using(step).after(empty, pay);

      const seen = (target: MemberTarget) =>
        phaseOf(
          after(held, [
            turn(shopper, "OrderSeen", "UNSURE", "PAID", [
              { operation: "pay", kind: "cancel", target },
            ]),
          ]),
          "p1",
        );

      assert.equal(phaseOf(held, "p1"), "Held");
      assert.equal(seen(MemberTarget.Nothing()), "Gone");
      assert.equal(seen(MemberTarget.Key({ key: { intentId: "elsewhere" } })), "Gone");
      assert.equal(seen(MemberTarget.Key({ key: KEY })), "Gone");

      const moved = using(step).after(empty, pay);
      recarted(moved, "elsewhere");

      assert.deepStrictEqual(
        refused(moved, [turn(shopper, "OrderSeen", "UNSURE", "PAID", [])]),
        [],
        "a folded key naming no lane the actor holds owes nothing: cancel(k) acts on lane k alone",
      );
    },
  },
  {
    name: "a keyed cancel owes only its own lane when the actor holds two",
    run: ({ refused, after }) => {
      const two = { intentId: "pi2" };

      const unsure = (attempt: string) => [
        ended("pay", attempt, "unknown", "Lost"),
        delivered(shopper, "pay", attempt, "PayUnsure"),
        turn(shopper, "PayUnsure", "PAYING", "UNSURE", []),
      ];

      const first = using(step).after(empty, [
        turn(shopper, "PayRequested", "CARD", "PAYING", [keyed("pay", "commit")]),
        minted(shopper, "pay", "p1"),
        ...sent("pay", "p1"),
      ]);

      recarted(first, two.intentId);

      const held = using(step).after(first, [
        turn(shopper, "PayRequested", "PAYING", "PAYING", [
          { operation: "pay", kind: "commit", target: MemberTarget.Key({ key: two }) },
        ]),
        minted(shopper, "pay", "p2", Option.some(two)),
        ...sent("pay", "p2"),
        ...unsure("p1"),
        ...unsure("p2"),
      ]);

      recarted(held, KEY.intentId);

      const seen = turn(shopper, "OrderSeen", "UNSURE", "PAID", [keyed("pay", "cancel")]);

      const released = said(
        Observation.Evidence({ kind: "Released", operation: "pay", attempt: Option.some("p1") }),
      );

      assert.deepStrictEqual(refused(held, [seen, released]), []);
      assert.deepStrictEqual(refused(held, [seen]), []);
      assert.equal(phaseOf(after(held, [seen]), "p1"), "Gone");
      assert.equal(phaseOf(after(held, [seen]), "p2"), "Held");
    },
  },
  {
    name: "an alternative's row is confirmed by its members whatever else the report names (step 6 review M2)",
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
  readonly file: "lifecycle-owed.ts" | "compare.ts";
  readonly find: string;
  readonly replace: string;
}> = [
  {
    name: "a predicted key retargets a key-less member",
    file: "lifecycle-owed.ts",
    find: "  if (!member.keyed) return keylessTarget(model, known, turn, hearing, member);",
    replace:
      "  if (!member.keyed)\n    return Option.match(said, { onNone: () => keylessTarget(model, known, turn, hearing, member), onSome: (key) => MemberTarget.Key({ key }) });",
  },
  {
    name: "a commit ignores its reported key",
    file: "lifecycle-owed.ts",
    find: '  if (member.kind === "commit")\n    return Option.match(said, {',
    replace: '  if (member.kind === "commit")\n    return Option.match(Option.none<Json>(), {',
  },
  {
    name: "an alternative's row is owed whichever alternative ran",
    file: "lifecycle-owed.ts",
    find: "(Option.isNone(row.at) || Option.exists(row.at, (at) => Option.contains(turn.at, at))) &&",
    replace: "(Option.isNone(row.at) || Option.isSome(turn.at)) &&",
  },
  {
    name: "an alternative's row is owed whatever alternative ran",
    file: "lifecycle-owed.ts",
    find: "      (Option.isNone(row.at) || Option.exists(row.at, (at) => Option.contains(turn.at, at))) &&\n",
    replace: "",
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
    name: "a keyed member always names every lane",
    file: "lifecycle-owed.ts",
    find: "  return Option.match(said, {\n    onNone: () => MemberTarget.Every(),\n    onSome: (key) => MemberTarget.Key({ key }),",
    replace:
      "  return Option.match(said, {\n    onNone: () => MemberTarget.Every(),\n    onSome: () => MemberTarget.Every(),",
  },
  {
    name: "a turn hears no ending",
    file: "compare.ts",
    find: "onSome: (ending) => pushed(walk, LifeMove.Heard({ ending }), given),",
    replace: "onSome: () => walk,",
  },
  {
    name: "retention inverted",
    file: "compare.ts",
    find: "onSome: (o) => retains(o, said.reason),",
    replace: "onSome: (o) => !retains(o, said.reason),",
  },
  {
    name: "a turn hears another actor's ending",
    file: "compare.ts",
    find: "onSome: (a) => sameActor(a, e.actor)",
    replace: "onSome: () => true",
  },
  {
    name: "a Delivered closes no turn",
    file: "compare.ts",
    find: "const open = closedTurn(walk, given);",
    replace: "const open = walk;",
  },
];

const exampleKill = (run: Step) =>
  examples.find((example) => {
    try {
      example.run(using(run));

      return false;
    } catch (failure) {
      if (failure instanceof assert.AssertionError) return true;
      throw failure;
    }
  });

const searchKill = (scripts: ReadonlyArray<Script>, run: Step) =>
  scripts.find((script) =>
    Option.isSome(
      killedBy(playPart(script, "production", rules, [], Option.none(), oracles, run).verdict),
    ),
  );

const killerOf = (scripts: ReadonlyArray<Script>, run: Step) => {
  const searched = searchKill(scripts, run);

  if (searched !== undefined) return `search ${searched.id}`;

  const example = exampleKill(run);

  return example === undefined ? "survived" : `example ${example.name}`;
};

/**
 * Who kills each step mutant: the search (a pilot script played on production under the mutated
 * step) first, then a kept example. The three that narrow a release's transition need a non-empty
 * `releasesOnLeave`, which no real machine has, so only an example kills them; so do the key-less
 * retarget, another actor's ending and an unclosed turn, which no pilot's run reaches.
 */
const KILLERS: ReadonlyArray<string> = [
  "a predicted key retargets a key-less member: example a key-less member names the heard ending's lane, whatever key the turn predicts (WriteLanes R9)",
  "a commit ignores its reported key: search PART-sync-usual-1",
  "an alternative's row is owed whichever alternative ran: search PART-sync-usual-1",
  "an alternative's row is owed whatever alternative ran: search PART-sync-usual-1",
  "a release is owed on any operation: search PART-sync-usual-1",
  "a release is owed on a leaving transition of another event: example a release member anchors in a turn that leaves a releasing state, and only there",
  "a release is owed on a leaving transition from another state: example a release member anchors in a turn that leaves a releasing state, and only there",
  "a release is owed on a leaving transition to another state: example a release member anchors in a turn that leaves a releasing state, and only there",
  "retryable counts one retry more: search PART-transfers-stress-1",
  "a keyed member always names every lane: search PART-transfers-stress-1",
  "a turn hears no ending: search PART-sync-usual-1",
  "retention inverted: search PART-sync-stress-1",
  "a turn hears another actor's ending: example another actor's turn of the same event does not hear the ending",
  "a Delivered closes no turn: example a Delivered closes the open turn, so a later mint is outside it",
];

describe("lifecycle step", () => {
  for (const example of examples) it(example.name, () => example.run(using(step)));

  it("every step mutant is killed, by the search first, then by a kept example", async () => {
    const scripts = pilots().filter(
      (script) => playPart(script, "production", rules, []).verdict._tag === "Pass",
    );

    const killers: Array<string> = [];

    for (const [index, mutant] of STEP_MUTANTS.entries()) {
      const source = readFileSync(join(HERE, mutant.file), "utf8");

      assert.equal(source.split(mutant.find).length - 1, 1, `${mutant.name}: applies once`);
      const copy = join(HERE, "..", `dsl-mutant-${process.pid}-${index}`);
      cpSync(HERE, copy, { recursive: true });
      writeFileSync(
        join(copy, mutant.file),
        source.replace(mutant.find, () => mutant.replace),
      );

      try {
        const imported: { readonly step: Step } = await import(join(copy, "lifecycle-step.ts"));
        killers.push(`${mutant.name}: ${killerOf(scripts, imported.step)}`);
      } finally {
        rmSync(copy, { recursive: true, force: true });
      }
    }

    assert.deepEqual(killers, KILLERS);
  }, 280_000);
});
