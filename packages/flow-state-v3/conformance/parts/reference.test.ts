import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option, Predicate } from "effect";
import { parts } from "../../fixtures/index.ts";
import { part } from "../../fixtures/part.ts";
import { implemented as production } from "../adapters/production.ts";
import { handlersFor, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Cells, Pay, Pay as TypedPay } from "../fixtures/pay.ts";
import { CellsMachine, PayMachine } from "../../fixtures/pay/machine.ts";
import { Answer } from "../world/network.ts";
import { mixOf } from "./generate.ts";
import { NoClassify, partFixture, PolicyMismatch, referenceOf, typedPart } from "./reference.ts";

describe("referenceOf(compiled) (Q3: phase-out step 3, Conformance R15, I46, T30)", () => {
  it("derives a part's reference whole but its classify, which only the part declares", () => {
    const part = parts.find((p) => p.name === "pay");
    assert.ok(part !== undefined, "no part pay");

    const derived = referenceOf(part.machine.compiled);

    assert.deepEqual(derived.rows, partFixture(part).rows);
    assert.deepEqual(derived.states, partFixture(part).states);
    assert.ok(Object.values(derived.operations).every((o) => !("classify" in o.reference)));
  });

  it("a part holds no hand-written rows or handler table", () => {
    assert.equal(parts.length, 5);

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

describe("the actor view is typed by the definition's Schemas (phase-out step 4)", () => {
  it("names Pay's events, payloads and memory as its definition does; a wrong one is a type error", () => {
    type Events = keyof typeof TypedPay.events;

    type Payload = (typeof TypedPay.events)["PayRequested"]["Type"];

    type Memory = (typeof TypedPay.memory)["Type"];

    const event: Events = "PayRequested";
    // @ts-expect-error -- Pay has no such event.
    const unknownEvent: Events = "Nope";
    const payload: Payload = { paymentMethodId: "visa" };
    // @ts-expect-error -- a payment method is a string.
    const wrongPayload: Payload = { paymentMethodId: 1 };
    const intent: Memory["intentId"] = "pi1";
    // @ts-expect-error -- an intent id is a string.
    const wrongIntent: Memory["intentId"] = 1;

    assert.deepEqual([event, unknownEvent, payload, wrongPayload, intent, wrongIntent].length, 6);
    assert.throws(
      () => typedPart(parts[3]!, { pay: "serialize" }),
      (e) => e instanceof PolicyMismatch,
    );
  });
});

describe("derived key folds (WriteLanes R7: a commit's key is its select's)", () => {
  it("a commit whose event lacks another alternative's field still computes its key", () => {
    const part = parts.find((p) => p.name === "pay");
    assert.ok(part !== undefined, "no part pay");

    const key = partFixture(part).handlers.folds.keys["pay"];
    assert.ok(key !== undefined);

    const fields = { ...partFixture(part).handlers.folds.initial, intentId: "pi1" };

    const pi1 = Option.some({ intentId: "pi1" });

    assert.deepEqual(key({}, fields, Option.some("states.WAITING.on.RetryNow[0]")), pi1);
    assert.deepEqual(key({}, fields, Option.some("on.PayRequested[1]")), pi1);
    assert.deepEqual(key({}, fields, Option.none()), pi1);
    assert.deepEqual(
      key({}, { ...fields, intentId: { unknownToTheSuite: true } }, Option.none()),
      Option.none(),
    );
  });

  it("a delay that reads a field the suite does not know computes nothing", () => {
    const part = parts.find((p) => p.name === "pay");
    assert.ok(part !== undefined, "no part pay");

    const { folds } = partFixture(part).handlers;
    const delay = folds.delays["retry"];
    assert.ok(delay !== undefined);

    assert.deepEqual(delay({ ...folds.initial, retryInMs: 1500 }), Option.some(1500));
    assert.deepEqual(
      delay({ ...folds.initial, retryInMs: { unknownToTheSuite: true } }),
      Option.none(),
    );
  });
});

describe("derived update folds (Conformance R19: an unknown input allows every outcome)", () => {
  const folds = () => {
    const part = parts.find((p) => p.name === "pay");
    assert.ok(part !== undefined, "no part pay");

    return partFixture(part).handlers.folds;
  };

  it("an update sets the fields that do not read an unknown label, and no others", () => {
    const f = folds();
    const update = f.updates["states.PAYING.on.Confirmed[1]"];
    assert.ok(update !== undefined);

    const after = { ...f.initial, ...update({ status: "requires_capture" }, f.initial) };

    assert.equal(after["authorized"], true);
    assert.deepEqual(f.guards["on.Leave[0]"]?.({}, after), Option.some(true));
    assert.notEqual(after["afterUnsure"], f.initial["afterUnsure"]);
  });

  it("a guard that reads a field an update could not compute is opaque", () => {
    const f = folds();
    const update = f.updates["on.Placed[0]"];
    assert.ok(update !== undefined);

    const leave = f.guards["on.Leave[0]"];
    assert.ok(leave !== undefined);

    const authorized = { ...f.initial, authorized: true };
    const after = { ...authorized, ...update({}, authorized) };

    assert.equal(after["authorized"], false);
    assert.deepEqual(leave({}, authorized), Option.some(true));
    assert.deepEqual(leave({}, after), Option.some(false));
    assert.ok(Option.isNone(leave({}, { ...after, authorized: true })));
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
    assert.equal(parts.length, 5);

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
    assert.equal(parts.length, 5);

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
