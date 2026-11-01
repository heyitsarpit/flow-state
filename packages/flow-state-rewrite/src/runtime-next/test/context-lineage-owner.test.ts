import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { planContextLineage, type ContextLineageNode } from "../context/context-participant.js";
import type { ContextCapturedProvider } from "../context/context-coordinator.js";
import { reconcileContextEdgeDebt } from "../context/context-debt.js";
import {
  reconcileContextLineage,
  type ContextCut,
  type ContextLineage,
} from "../context/lineage.js";
import type { ActorSnapshot } from "../runtime.js";

const Definition = definition({
  id: "runtime-next/context-lineage-owner",
  states: ["idle"],
  events: {},
});

const Base = Result.getOrThrow(Definition);

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const identity = (id: string) => {
  const directory = makeActorDirectory<void>({ machines: [Machine] });

  const admission = Result.getOrThrow(
    directory.reserve({ kind: "stable", ref: { machine: Machine, id, persist: false } }),
  );

  if (admission._tag !== "create") throw new Error("Expected new actor admission");

  return admission.reservation.identity;
};

const cut = (actor: ReturnType<typeof identity>, revision: number) => ({
  identity: actor,
  revision,
});

const recycledIdentities = (id: string) => {
  const directory = makeActorDirectory<void>({ machines: [Machine] });
  const ref = { machine: Machine, id, persist: false } as const;
  const first = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

  if (first._tag !== "create") throw new Error("Expected new actor admission");

  Effect.runSync(
    directory.rollback(
      first.reservation,
      Failure({
        code: "SchemaValidation",
        path: [],
        details: {},
        summary: "Preparation failed",
        help: "Retry actor admission.",
      }),
    ),
  );
  const second = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));

  if (second._tag !== "create") throw new Error("Expected recycled actor admission");

  return [first.reservation.identity, second.reservation.identity] as const;
};

describe("runtime-next context lineage owner", () => {
  it("merges shared ancestry only when all providers attest one exact cut", () => {
    const consumer = identity("consumer");
    const ancestor = identity("ancestor");
    const left = identity("left");
    const right = identity("right");
    const leftLineage: ContextLineage = new Map([[ancestor.key, cut(ancestor, 3)]]);
    const rightLineage = new Map([[ancestor.key, cut(ancestor, 3)]]);

    const providers = [
      { slot: "left", cut: cut(left, 1), lineage: leftLineage },
      { slot: "right", cut: cut(right, 2), lineage: rightLineage },
    ];

    const merged = Result.getOrThrow(reconcileContextLineage(consumer, new Map(), providers));

    assert.deepStrictEqual([...merged.keys()], [ancestor.key, left.key, right.key]);
    assert.strictEqual(merged.get(ancestor.key)?.identity, ancestor);
    assert.strictEqual(merged.get(right.key)?.revision, 2);

    const unchanged = Result.getOrThrow(reconcileContextLineage(consumer, merged, providers));

    assert.strictEqual(unchanged, merged);

    rightLineage.set(ancestor.key, cut(ancestor, 4));
    const conflicting = reconcileContextLineage(consumer, merged, providers);

    assert.ok(Result.isFailure(conflicting));
    assert.strictEqual(merged.get(ancestor.key)?.revision, 3);
  });

  it("rejects recycled actors, consumer cycles, and invalid revisions before changing inputs", () => {
    const consumer = identity("consumer");
    const [ancestor, recycled] = recycledIdentities("ancestor");
    const provider = identity("provider");
    const previous: ContextLineage = new Map([[ancestor.key, cut(ancestor, 1)]]);
    const lineage = new Map([[ancestor.key, cut(ancestor, 1)]]);

    const providers = [
      { slot: "source", cut: cut(provider, 1), lineage },
      { slot: "recycled", cut: cut(recycled, 1), lineage: new Map() },
    ];

    assert.ok(Result.isFailure(reconcileContextLineage(consumer, previous, providers)));
    assert.strictEqual(previous.get(ancestor.key)?.identity, ancestor);

    providers.pop();
    lineage.set(consumer.key, cut(consumer, 1));
    assert.ok(Result.isFailure(reconcileContextLineage(consumer, previous, providers)));

    lineage.delete(consumer.key);
    providers[0]!.cut.revision = Number.MAX_SAFE_INTEGER + 1;
    assert.ok(Result.isFailure(reconcileContextLineage(consumer, previous, providers)));
    assert.strictEqual(previous.size, 1);
  });

  it("P055-CONTEXT-CUT: retains debt until an exact covering revision arrives and owns returned cuts", () => {
    const ancestor = identity("ancestor");
    const edge = identity("edge").key;
    const requirement = cut(ancestor, 4);
    const required: ContextLineage = new Map([[ancestor.key, requirement]]);
    const previous = new Map();

    const pending = Result.getOrThrow(
      reconcileContextEdgeDebt(
        previous,
        edge,
        required,
        new Map([[ancestor.key, cut(ancestor, 3)]]),
      ),
    );

    assert.strictEqual(previous.size, 0);
    assert.strictEqual(pending.get(edge)?.get(ancestor.key)?.revision, 4);
    const publishedCut = pending.get(edge)?.get(ancestor.key);
    assert.ok(publishedCut !== undefined);
    assert.strictEqual(Reflect.set(publishedCut, "revision", 7), false);
    requirement.revision = 99;
    assert.strictEqual(pending.get(edge)?.get(ancestor.key)?.revision, 4);

    const settled = Result.getOrThrow(
      reconcileContextEdgeDebt(
        pending,
        edge,
        new Map(),
        new Map([[ancestor.key, cut(ancestor, 4)]]),
      ),
    );

    assert.strictEqual(settled.has(edge), false);
    assert.strictEqual(pending.has(edge), true);
  });

  it("rejects incompatible debt and invalid coverage without losing earlier requirements", () => {
    const [ancestor, recycled] = recycledIdentities("ancestor");
    const edge = identity("edge").key;
    const priorLineage: ContextLineage = new Map([[ancestor.key, cut(ancestor, 5)]]);
    const previous = new Map([[edge, priorLineage]]);
    const incompatible = new Map([[ancestor.key, cut(recycled, 6)]]);

    assert.ok(Result.isFailure(reconcileContextEdgeDebt(previous, edge, incompatible, new Map())));
    assert.ok(Result.isFailure(reconcileContextEdgeDebt(previous, edge, new Map(), incompatible)));
    assert.ok(
      Result.isFailure(
        reconcileContextEdgeDebt(
          previous,
          edge,
          new Map(),
          new Map([[ancestor.key, cut(ancestor, Number.NaN)]]),
        ),
      ),
    );
    assert.strictEqual(previous.get(edge)?.get(ancestor.key)?.revision, 5);
  });

  it("plans a deep production lineage path without revisiting every ancestor", () => {
    let keyReads = 0;

    const actors = Array.from(
      { length: 1_024 },
      (_, index) =>
        new Proxy(identity(`chain-${index}`), {
          get(target, property) {
            if (property === "key") {
              keyReads += 1;

              return target.key;
            }

            return Object.getOwnPropertyDescriptor(target, property)?.value;
          },
        }),
    );

    // RETURN_TYPE: Captured snapshots retain the concrete owner definition.
    const snapshot = (): ActorSnapshot<typeof Base> => ({
      state: Base.S.idle,
      memory: {},
      context: {},
      lifecycle: "active",
      O: {},
      timers: [],
      issues: [],
      revision: 1,
      observedStoreRevision: 0,
    });

    const captured = new Map<string, ContextCapturedProvider>();
    const nodes = new Map<string, ContextLineageNode>();

    for (let index = 0; index < actors.length; index += 1) {
      const actor = actors[index]!;
      const parent = actors[index - 1];
      captured.set(actor.key, { identity: actor, snapshot: snapshot() });
      nodes.set(actor.key, {
        identity: actor,
        providers: parent === undefined ? [] : [{ slot: "source", provider: parent }],
        lineage: new Map(),
        debt: new Map(),
      });
    }

    keyReads = 0;

    for (const actor of actors) {
      const node = nodes.get(actor.key)!;

      const planned = Result.getOrThrow(
        planContextLineage(node, captured, (key) => nodes.get(key)),
      );

      node.lineage = planned.lineage;
      node.debt = planned.debt;
    }

    assert.ok(keyReads <= actors.length * 20);
    const deepest = nodes.get(actors.at(-1)!.key)!.lineage;

    assert.strictEqual(deepest.size, actors.length - 1);
    assert.strictEqual(deepest.get(actors[0]!.key)?.revision, 1);
    assert.strictEqual([...deepest].length, actors.length - 1);
  });

  it("merges a repeated diamond ladder with bounded ancestry work and exact debt", () => {
    let keyReads = 0;

    const measured = (name: string) =>
      new Proxy(identity(name), {
        get(target, property) {
          if (property === "key") {
            keyReads += 1;

            return target.key;
          }

          return Object.getOwnPropertyDescriptor(target, property)?.value;
        },
      });

    // RETURN_TYPE: Every captured cut carries a concrete owner snapshot.
    const snapshot = (): ActorSnapshot<typeof Base> => ({
      state: Base.S.idle,
      memory: {},
      context: {},
      lifecycle: "active",
      O: {},
      timers: [],
      issues: [],
      revision: 1,
      observedStoreRevision: 0,
    });

    const captured = new Map<string, ContextCapturedProvider>();
    const nodes = new Map<string, ContextLineageNode>();
    const order: ReturnType<typeof measured>[] = [];

    const add = (
      actor: ReturnType<typeof measured>,
      providers: ContextLineageNode["providers"],
    ) => {
      captured.set(actor.key, { identity: actor, snapshot: snapshot() });
      nodes.set(actor.key, { identity: actor, providers, lineage: new Map(), debt: new Map() });
      order.push(actor);
    };

    const root = measured("ladder-root");
    add(root, []);
    let parent = root;
    let finalLeft = root;
    let finalRight = root;

    for (let index = 0; index < 256; index += 1) {
      const left = measured(`ladder-left-${index}`);
      const right = measured(`ladder-right-${index}`);
      const join = measured(`ladder-join-${index}`);
      add(left, [{ slot: "source", provider: parent }]);
      add(right, [{ slot: "source", provider: parent }]);
      add(join, [
        { slot: "left", provider: left },
        { slot: "right", provider: right },
      ]);
      parent = join;
      finalLeft = left;
      finalRight = right;
    }

    const finalNode = nodes.get(parent.key)!;
    finalNode.debt = new Map([[finalLeft.key, new Map([[root.key, cut(root, 1)]])]]);
    keyReads = 0;
    let mapReads = 0;
    const originalGet = Object.getOwnPropertyDescriptor(Map.prototype, "get");

    if (originalGet === undefined) throw new Error("Map.get descriptor is unavailable");
    Object.defineProperty(Map.prototype, "get", {
      ...originalGet,
      value: function (this: Map<string, ContextCut>, key: string) {
        mapReads += 1;

        return originalGet.value.call(this, key);
      },
    });

    try {
      for (const actor of order) {
        const node = nodes.get(actor.key)!;

        const planned = Result.getOrThrow(
          planContextLineage(node, captured, (key) => nodes.get(key)),
        );

        node.lineage = planned.lineage;
        node.debt = planned.debt;
      }
    } finally {
      Object.defineProperty(Map.prototype, "get", originalGet);
    }

    assert.ok(keyReads <= order.length * 40);
    assert.ok(mapReads <= order.length * 600, `${mapReads} indexed reads`);
    assert.strictEqual(finalNode.lineage.size, order.length - 1);
    assert.strictEqual(finalNode.lineage.get(root.key)?.revision, 1);
    assert.strictEqual(finalNode.debt.size, 0);
    const rightNode = nodes.get(finalRight.key)!;
    const original = rightNode.lineage;
    rightNode.lineage = new Map(original).set(root.key, cut(root, 2));
    assert.ok(Result.isFailure(planContextLineage(finalNode, captured, (key) => nodes.get(key))));
    rightNode.lineage = original;
    assert.strictEqual(finalNode.lineage.get(root.key)?.revision, 1);
  });
});
