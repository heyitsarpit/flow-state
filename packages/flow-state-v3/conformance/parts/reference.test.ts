import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Equal, HashSet, Option, Predicate } from "effect";
import { parts } from "../../fixtures/index.ts";
import { part } from "../../fixtures/part.ts";
import { implemented as production } from "../adapters/production.ts";
import { handlersFor, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { CellsMachine, PayMachine } from "../machines/pay.ts";
import { Answer } from "../world/network.ts";
import { mixOf } from "./generate.ts";
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

/**
 * The rows as a set: equal by value whatever their order or their fields' order.
 */
const rowsOf = (f: Partial<Derived>) =>
  HashSet.fromIterable(
    (f.rows ?? []).map((r) => ({
      ...r,
      guard: Option.getOrNull(r.guard),
      at: Option.getOrNull(r.at),
    })),
  );

describe("referenceOf(compiled) (Q3: phase-out step 3, Conformance R15, I46, T30)", () => {
  it("derives Pay's reference equal to its hand rows wherever both exist", () => {
    assert.deepEqual(comparable(referenceOf(PayMachine.compiled)), comparable(Pay));
    assert.ok(Equal.equals(rowsOf(referenceOf(PayMachine.compiled)), rowsOf(Pay)));
  });

  it("derives Cells' reference equal to its hand rows", () => {
    assert.deepEqual(comparable(referenceOf(CellsMachine.compiled)), comparable(Cells));
    assert.ok(Equal.equals(rowsOf(referenceOf(CellsMachine.compiled)), rowsOf(Cells)));
  });

  it("a part holds no hand-written rows or handler table", () => {
    assert.equal(parts.length, 3);

    // @ts-expect-error -- a part's reference comes from its Compiled; a hand row does not type-check.
    part({ ...parts[0]!, rows: [] });

    for (const part of parts) assert.ok(!("rows" in part) && !("handlers" in part));
  });
});

describe("Pay and Cells as parts (Conformance R15; phase-out step 4)", () => {
  it("are parts of their own machine, with a user action at every leaf and a classify per write", () => {
    for (const name of ["pay", "cells"]) {
      const part = parts.find((p) => p.name === name);
      assert.ok(part !== undefined, `no part ${name}`);
      assert.equal(part.machine.compiled.id, PayMachine.compiled.id);

      for (const leaf of part.machine.compiled.states.keys())
        assert.ok((part.user[leaf] ?? []).length > 0, `${name}: leaf ${leaf} has no user action`);

      const fixture = partFixture(part);

      for (const [operation, o] of part.machine.compiled.operations)
        if (o._tag === "Write")
          assert.ok(Predicate.isFunction(fixture.operations[operation]?.reference.classify));
    }
  });
});

describe("one machine id per App (Compile I14)", () => {
  it("a mix of two parts with one machine id is a defect", () => {
    const [first] = parts;
    assert.ok(first !== undefined);

    assert.throws(() => mixOf([first, { ...first, name: "twin" }], "usual", 1, production));
  });

  it("a case's reference, handler table and rows refuse two fixtures with one machine id", () => {
    assert.throws(() => referenceFor([Pay, Cells]));
    assert.throws(() => handlersFor([Pay, Cells]));
    assert.throws(() => rowsFor([Pay, Cells]));
  });
});

describe("parts' fixtures (Q2, Q4, Q5: Conformance R15, R20; F3)", () => {
  it("each part's machine is its own but Cells', which is Pay's, and every leaf has a user model", () => {
    const own = parts.filter((p) => p.name !== "cells");
    assert.equal(new Set(own.map((p) => p.machine.compiled.id)).size, own.length);

    for (const part of parts) {
      if (!["pay", "cells"].includes(part.name))
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
