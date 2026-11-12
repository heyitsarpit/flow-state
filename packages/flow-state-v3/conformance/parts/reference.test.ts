import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option, Predicate } from "effect";
import { parts } from "../../fixtures/index.ts";
import { part } from "../../fixtures/part.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { CellsMachine, PayMachine } from "../machines/pay.ts";
import { Answer } from "../world/network.ts";
import { type Derived, NoClassify, partFixture, referenceOf } from "./reference.ts";

/**
 * What the derived and the hand fixture must agree on, rendered so a difference names its place:
 * every operation of either side (never filtered by one side's names), the states, the rows and
 * the handler table's targets, state guards and idle guards.
 */
const comparable = (f: Partial<Derived>) => ({
  machine: f.machine,
  states: (f.states ?? []).toSorted(),
  operations: Object.fromEntries(
    Object.entries(f.operations ?? {})
      .map(
        ([name, { reference: r }]) =>
          [
            name,
            {
              concurrency: r.concurrency,
              success: r.success,
              failure: r.failure,
              unknown: r.unknown,
              keyFields: r.keyFields,
            },
          ] as const,
      )
      .toSorted(([a], [b]) => a.localeCompare(b)),
  ),
  rows: (f.rows ?? [])
    .map((r) =>
      JSON.stringify({ ...r, guard: Option.getOrNull(r.guard), at: Option.getOrNull(r.at) }),
    )
    .toSorted(),
  handlers:
    f.handlers === undefined
      ? undefined
      : {
          initial: f.handlers.initial,
          levels: [["(root)", f.handlers.root] as const, ...Object.entries(f.handlers.states)].map(
            ([leaf, level]) => [
              leaf,
              Object.entries(level ?? {}).map(([event, alternatives]) => [
                event,
                alternatives.map((a) => ({
                  target: a.target,
                  when: a.when,
                  idle: Option.getOrNull(a.idle),
                  updates: a.updates,
                })),
              ]),
            ],
          ),
        },
});

describe("referenceOf(compiled) (Q3: phase-out step 3, Conformance R15, I46, T30)", () => {
  it("derives Pay's reference equal to its hand rows wherever both exist", () => {
    assert.deepEqual(comparable(referenceOf(PayMachine.compiled)), comparable(Pay));
  });

  it("derives Cells' reference equal to its hand rows", () => {
    assert.deepEqual(comparable(referenceOf(CellsMachine.compiled)), comparable(Cells));
  });

  it("a part holds no hand-written rows or handler table", () => {
    assert.equal(parts.length, 3);

    // @ts-expect-error -- a part's reference comes from its Compiled; a hand row does not type-check.
    part({ ...parts[0]!, rows: [] });

    for (const part of parts) assert.ok(!("rows" in part) && !("handlers" in part));
  });
});

describe("parts' fixtures (Q2, Q4, Q5: Conformance R15, R20; F3)", () => {
  it("each pilot's machine is its own, and every leaf has a user model", () => {
    assert.equal(parts.length, 3);
    assert.equal(new Set(parts.map((p) => p.machine.compiled.id)).size, 3);

    for (const part of parts) {
      assert.ok(
        ![PayMachine.compiled.id, CellsMachine.compiled.id].includes(part.machine.compiled.id),
      );

      for (const leaf of part.machine.compiled.states.keys())
        assert.ok(
          (part.user[leaf] ?? []).length > 0,
          `${part.name}: leaf ${leaf} has no user action`,
        );
    }
  });

  it("every operation has a server model, and every write a classify carried into the fixture", () => {
    assert.equal(parts.length, 3);

    for (const part of parts) {
      const fixture = partFixture(part);

      for (const [name, operation] of part.machine.compiled.operations) {
        assert.ok(
          (part.server[name]?.answers.length ?? 0) > 0,
          `${part.name}.${name} has no answer`,
        );

        if (operation._tag === "Write")
          assert.ok(Predicate.isFunction(fixture.operations[name]?.reference.classify));
      }
    }

    const transfers = parts.find((p) => p.name === "transfers");
    assert.ok(transfers !== undefined);

    const classify = partFixture(transfers).operations["transfer"]?.reference.classify;
    const done = Answer.Fail({ tag: "AlreadyDone", fields: {} });

    assert.equal(classify?.(done, true), "success");
    assert.notEqual(classify(done, false), "success");
    assert.throws(
      () => partFixture({ ...transfers, server: {} }),
      (e) => e instanceof NoClassify,
    );
  });

  it("every guard of a part is computed from its own source: each guarded place has a fold", () => {
    assert.equal(parts.length, 3);

    for (const part of parts) {
      const { handlers } = partFixture(part);

      const levels = [
        { prefix: "", level: handlers.root },
        ...Object.entries(handlers.states).map(([leaf, level]) => ({
          prefix: `states.${leaf}.`,
          level: level ?? {},
        })),
      ];

      const guarded = levels.flatMap(({ prefix, level }) =>
        Object.entries(level).flatMap(([event, alternatives]) =>
          alternatives.flatMap((a, position) =>
            a.opaque ? [`${prefix}on.${event}[${Option.getOrElse(a.index, () => position)}]`] : [],
          ),
        ),
      );

      assert.ok(guarded.length > 0, part.name);
      assert.deepEqual(
        guarded.filter((at) => handlers.folds.guards[at] === undefined),
        [],
        part.name,
      );
    }
  });
});
