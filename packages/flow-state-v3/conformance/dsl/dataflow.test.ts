/// <reference types="node" />
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, it } from "vite-plus/test";
import { Effect, Option } from "effect";
import { loadPrototype, prototypePort } from "../adapters/prototype.ts";
import { handlersFor, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { timedOf } from "../fixtures/handlers.ts";
import { MemberTarget, Observation } from "../port.ts";
import { scenarios } from "../suite.ts";
import { leavesOf } from "../turn/anchor.ts";
import { leafOf } from "../turn/phases.ts";
import { type Anchor, anchorOf, judgedStep } from "../turn/selection.ts";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { openCase } from "./case.ts";
import { empty, type Model } from "./lifecycle-model.ts";
import { rules } from "./lifecycle-rules.ts";
import { step } from "./lifecycle-step.ts";
import { Fact } from "./oracle.ts";

const RUNTIME = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prototypes",
  "round-14",
);

/**
 * The cases whose facts the check walks: payments, keyed lanes, a retry, a kill and an adoption.
 */
const CASES = ["PAY-01", "PAY-02", "PAY-04", "PAY-05", "DISP-02", "DISP-06", "LANE-07"];

/**
 * Every report value the expect half must not read (Conformance R20, T45 K2): a turn's `from` and
 * members, a mint's key, an ending's channel and reason. Positions and ids stay, since the
 * compare half matches by them, and so do a turn's `to` and parts: where a guard the suite cannot
 * compute leaves several alternatives allowed, the one that ran is the runtime's choice (design
 * section 3).
 */
// RETURN_TYPE: the Fact union; each branch would infer one variant.
const lied = (fact: Fact, header = false): Fact => {
  if (!Fact.$is("Reported")(fact)) return fact;

  const observation = Observation.$match(fact.observation, {
    Turn: (t) =>
      Observation.Turn({
        ...t,
        from: header ? `${t.from}-lie` : t.from,
        members: t.members.map((m) => ({ ...m, target: MemberTarget.Nothing() })),
      }),
    Minted: (m) => Observation.Minted({ ...m, key: Option.some({ lie: true }) }),
    Ended: (e) =>
      Observation.Ended({
        ...e,
        channel: e.channel === "success" ? "failure" : "success",
        reason: "Lie",
      }),
    Unhandled: (o) => o,
    Denied: (o) => o,
    Sent: (o) => o,
    Delivered: (o) => o,
    Parked: (o) => o,
    Unparked: (o) => o,
    Recorded: (o) => o,
    Evidence: (o) => o,
    Issue: (o) => o,
    Incarnated: (o) => o,
    Finished: (o) => o,
    Published: (o) => o,
  });

  return Fact.Reported({ observation });
};

const anchorView = (anchor: Anchor) => ({
  actors: [...anchor.actors].map(([key, a]) => ({
    key,
    leaf: leafOf(a.phase),
    turns: a.turns,
    entry: a.entry,
    fields: a.fields,
    trail: a.trail,
    allowed: a.allowed,
  })),
  calls: [...anchor.calls.values()].map((c) => ({
    ...c,
  })),
});

/**
 * Where a lying run first differs from the truthful one before anything refused it: `None` when
 * every lie was refused before it reached expect state, or reached none.
 */
const leakAt = (
  truth: ReadonlyArray<{ readonly view: unknown }>,
  lying: ReadonlyArray<{ readonly view: unknown; readonly refused: boolean }>,
) => {
  const caught = lying.findIndex((v) => v.refused);
  const upTo = caught < 0 ? lying.length : caught;

  return Option.fromUndefinedOr(
    lying.slice(0, upTo).findIndex((v, i) => !isDeepStrictEqual(v.view, truth[i]?.view)),
  ).pipe(Option.filter((i) => i >= 0));
};

/**
 * The expect state after each step of a fact list: selection's predictions, the anchor, and the
 * lifecycle's own facts-derived fields.
 */
const expectStates = (fixtures: Parameters<typeof handlersFor>[0], facts: ReadonlyArray<Fact>) => {
  const machines = handlersFor(fixtures);
  const reference = referenceFor(fixtures);
  const known = { reference, rows: rowsFor(fixtures), timed: timedOf(machines), captureMs: 0 };

  const cuts = facts.reduce<ReadonlyArray<ReadonlyArray<Fact>>>(
    (all, f) =>
      Fact.$is("Stepped")(f) ? [...all, [f]] : [...all.slice(0, -1), [...(all.at(-1) ?? []), f]],
    [],
  );

  return cuts.reduce<{
    readonly anchor: Anchor;
    readonly model: Model;
    readonly views: ReadonlyArray<{ readonly view: unknown; readonly refused: boolean }>;
  }>(
    (acc, cut) => {
      const leaves = leavesOf(acc.anchor);
      const judged = judgedStep(acc.anchor, cut);
      const life = step(acc.model, known, judged.facts, [], rules, judged.turns, leaves);

      return {
        anchor: judged.state,
        model: life.after,
        views: [
          ...acc.views,
          {
            view: {
              turns: judged.turns,
              anchor: anchorView(judged.state),
              model: life.after,
            },
            refused:
              judged.violations.length > 0 || life.applied.some((a) => a.refusals.length > 0),
          },
        ],
      };
    },
    { anchor: anchorOf(machines, reference, known.rows), model: empty, views: [] },
  ).views;
};

describe("no report value reaches expect state (Conformance R20, T45 K2)", () => {
  it("the expect state of each case is unchanged when every report value lies", async () => {
    const port = prototypePort(await Effect.runPromise(loadPrototype(RUNTIME)));

    for (const id of CASES) {
      const scenario = scenarios.find((s) => s.id === id);
      assert.ok(scenario !== undefined, id);

      const opened = openCase({
        port,
        fixtures: scenario.fixtures,
        captureMs: captureMsOf(scenario.id),
        oracles: [],
        seed: 1,
        graphs: [],
        overdue: () => false,
        crashAt: Option.none(),
        replay: Option.none(),
      });

      scenario.run(opened.driven);
      opened.end();
      const facts = opened.facts();

      const truth = expectStates(scenario.fixtures, facts);

      for (const header of [false, true])
        assert.deepStrictEqual(
          leakAt(
            truth,
            expectStates(
              scenario.fixtures,
              facts.map((f) => lied(f, header)),
            ),
          ),
          Option.none(),
          `${id}: a ${header ? "turn's from" : "member, key or ending"} lie reaches expect state before any check refuses it`,
        );
    }
  });

  it("the check sees a lied value that reaches any part of the expect state", () => {
    const fact = Fact.Reported({
      observation: Observation.Ended({
        operation: "pay",
        attempt: Option.some("a1"),
        channel: "unknown",
        reason: "NoResponse",
        actor: Option.none(),
        failure: Option.none(),
      }),
    });

    const told = lied(fact);
    assert.ok(Fact.$is("Reported")(told) && Observation.$is("Ended")(told.observation));

    const leaking = (channel: string, reason: string, refused: boolean) => [
      { view: { endings: [], obligations: [], attempts: [] }, refused: false },
      {
        view: { endings: [{ channel, reason }], obligations: [reason], attempts: [channel] },
        refused,
      },
    ];

    const truth = leaking("unknown", "NoResponse", false);

    assert.deepStrictEqual(
      leakAt(truth, leaking(told.observation.channel, told.observation.reason, false)),
      Option.some(1),
    );
    assert.deepStrictEqual(
      leakAt(truth, leaking(told.observation.channel, told.observation.reason, true)),
      Option.none(),
    );
  });
});
