/// <reference types="node" />
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
import { type Anchor, anchorOf, judgedStep } from "../turn/selection.ts";
import { captureMsOf } from "../actors/lifetime.scenarios.ts";
import { openCase } from "./case.ts";
import { empty, type Model } from "./lifecycle-model.ts";
import { rules } from "./lifecycle-rules.ts";
import { step } from "./lifecycle-step.ts";
import { Fact } from "./oracle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

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

/**
 * The anchor as expect state: every field but the fixture's inputs (`machines`, `reference`,
 * `rows`), which a run never changes.
 */
const anchorView = ({ machines: _m, reference: _r, rows: _w, ...rest }: Anchor) => rest;

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
const expectStates = (
  fixtures: Parameters<typeof handlersFor>[0],
  facts: ReadonlyArray<Fact>,
  run: typeof step = step,
) => {
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
      const life = run(acc.model, known, judged.facts, [], rules, judged.turns, leaves);

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

const factsOf = (port: ReturnType<typeof prototypePort>, id: string) => {
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

  return { fixtures: scenario.fixtures, facts: opened.facts() };
};

/**
 * The report kinds lied about one at a time as well as all at once, since the first refused lie
 * ends the comparison: a kind whose lie is never refused is still compared to the end.
 */
const KINDS: ReadonlyArray<string> = ["all", "Turn", "Minted", "Ended"];

const ofKind = (fact: Fact, kind: string) =>
  kind === "all" || (Fact.$is("Reported")(fact) && fact.observation._tag === kind);

const leakIn = (
  { fixtures, facts }: ReturnType<typeof factsOf>,
  header: boolean,
  kind: string,
  run: typeof step = step,
) =>
  leakAt(
    expectStates(fixtures, facts, run),
    expectStates(
      fixtures,
      facts.map((f) => (ofKind(f, kind) ? lied(f, header) : f)),
      run,
    ),
  );

/**
 * A leak planted in the expect code itself: the step dispatch moves the model's clock by a
 * reported ending's channel, as an obligation that read `Ended.channel` would. That lie alone is
 * not refused before the leak, so the check must see it.
 */
const PLANTED = {
  find: "    return reported(marked, known, fact.observation, earlier, given);",
  replace:
    '    return reported(fact.observation._tag === "Ended" && fact.observation.channel === "success" ? { ...marked, model: { ...marked.model, clock: marked.model.clock + 1 } } : marked, known, fact.observation, earlier, given);',
};

describe("no report value reaches expect state (Conformance R20, T45 K2)", () => {
  it("the expect state of each case is unchanged when every report value lies", async () => {
    const port = prototypePort(await Effect.runPromise(loadPrototype(RUNTIME)));

    for (const id of CASES) {
      const run = factsOf(port, id);

      for (const header of [false, true])
        for (const kind of KINDS)
          assert.deepStrictEqual(
            leakIn(run, header, kind),
            Option.none(),
            `${id}: a ${header ? "turn's from" : "member, key or ending"} lie (${kind}) reaches expect state before any check refuses it`,
          );
    }
  });

  it("the check sees a leak planted in the expect code", async () => {
    const port = prototypePort(await Effect.runPromise(loadPrototype(RUNTIME)));
    const source = readFileSync(join(HERE, "lifecycle-step.ts"), "utf8");
    assert.equal(source.split(PLANTED.find).length - 1, 1, "the plant applies once");

    const copy = join(HERE, "..", `dsl-leak-${process.pid}`);

    try {
      cpSync(HERE, copy, { recursive: true });
      writeFileSync(
        join(copy, "lifecycle-step.ts"),
        source.replace(PLANTED.find, () => PLANTED.replace),
      );

      const planted: { readonly step: typeof step } = await import(join(copy, "lifecycle-step.ts"));

      const { fixtures, facts } = factsOf(port, "PAY-01");
      const endingLied = facts.map((f) => (ofKind(f, "Ended") ? lied(f) : f));

      assert.deepStrictEqual(
        leakAt(expectStates(fixtures, facts), expectStates(fixtures, endingLied)),
        Option.none(),
        "the unplanted code ignores an ending's lie",
      );
      assert.ok(
        Option.isSome(
          leakAt(
            expectStates(fixtures, facts, planted.step),
            expectStates(fixtures, endingLied, planted.step),
          ),
        ),
        "the planted read of an ending's channel reaches expect state",
      );
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
