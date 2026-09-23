import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";

import {
  planContextLineage,
  retainBlockedContextDebt,
  type ContextLineageNode,
} from "../context/context-participant.js";
import type { ContextCapturedProvider } from "../context/context-coordinator.js";
import { makeContextWaveChanges } from "../context/context-debt.js";
import type { ActorSnapshot } from "../runtime.js";
import { identity, Provider } from "./context-fixture.js";

describe("runtime-next context debt owner", () => {
  it("shares exact changed cuts without aliasing callers or sibling edge debt", () => {
    const root = identity("shared-debt-root");
    const left = identity("shared-debt-left");
    const right = identity("shared-debt-right");
    const consumer = identity("shared-debt-consumer");
    const requiredCut = { identity: root, revision: 2 };
    const oldCut = { identity: root, revision: 1 };
    const changed = new Map([[root.key, requiredCut]]);
    const covered = new Map([[root.key, oldCut]]);
    const priorCut = { identity: root, revision: 1 };
    const prior = new Map([[root.key, priorCut]]);

    const state: ContextLineageNode = {
      identity: consumer,
      providers: [
        { slot: "left", provider: left },
        { slot: "right", provider: right },
      ],
      lineage: new Map(),
      debt: new Map([[left.key, prior]]),
    };

    const parents = new Map([
      [left.key, { identity: left, providers: [], lineage: covered, debt: new Map() }],
      [right.key, { identity: right, providers: [], lineage: covered, debt: new Map() }],
    ]);

    const changes = new Map([
      [left.key, changed],
      [right.key, changed],
    ]);

    const debt = Result.getOrThrow(
      retainBlockedContextDebt(state, changes, (key) => parents.get(key)),
    );

    assert.strictEqual(debt.get(left.key)?.get(root.key)?.revision, 2);
    assert.strictEqual(debt.get(right.key)?.get(root.key)?.revision, 2);
    assert.strictEqual(state.debt.get(left.key)?.get(root.key)?.revision, 1);

    requiredCut.revision = 9;
    oldCut.revision = 9;
    priorCut.revision = 9;
    assert.strictEqual(debt.get(left.key)?.get(root.key)?.revision, 2);
    assert.strictEqual(debt.get(right.key)?.get(root.key)?.revision, 2);
    const leftDebt = debt.get(left.key)!;

    assert.strictEqual("root" in leftDebt, false);
    assert.strictEqual(Reflect.set(leftDebt, "root", new Map()), false);
    assert.strictEqual(Reflect.set(leftDebt, "size", 0), false);
    assert.strictEqual(Reflect.defineProperty(leftDebt, "size", { value: 0 }), false);
    assert.strictEqual(Reflect.set(leftDebt.get(root.key)!, "revision", 10), false);
    assert.strictEqual(debt.get(right.key)?.get(root.key)?.revision, 2);

    state.debt = debt;
    const covering = new Map([[root.key, { identity: root, revision: 2 }]]);
    parents.get(left.key)!.lineage = covering;
    parents.get(right.key)!.lineage = covering;

    const snapshot: ActorSnapshot<typeof Provider> = {
      state: Provider.S.ready,
      memory: {},
      context: {},
      lifecycle: "active",
      operations: [],
      timers: [],
      issues: [],
      revision: 1,
      observedStoreRevision: 0,
    };

    const captured = new Map<string, ContextCapturedProvider>([
      [left.key, { identity: left, snapshot }],
      [right.key, { identity: right, snapshot }],
    ]);

    const cleared = Result.getOrThrow(
      planContextLineage(state, captured, (key) => parents.get(key)),
    );

    assert.strictEqual(cleared.debt.size, 0);
    assert.strictEqual(cleared.lineage.get(root.key)?.revision, 2);
    assert.strictEqual("root" in cleared.lineage, false);
    assert.strictEqual(Reflect.set(cleared.lineage, "root", new Map()), false);
    assert.strictEqual(Reflect.set(cleared.lineage, "size", 0), false);
    assert.strictEqual(cleared.lineage.size, 3);
    assert.strictEqual(cleared.lineage.get(root.key)?.revision, 2);
    assert.strictEqual(leftDebt.get(root.key)?.revision, 2);
    assert.strictEqual(state.debt.size, 2);
  });

  it("retains exact prefix and newly captured direct cuts through a blocked suffix", () => {
    const root = identity("debt-direct-root");
    const prefix = [identity("debt-direct-prefix-0"), identity("debt-direct-prefix-1")];
    const rejected = identity("debt-direct-rejected");
    const blocked = identity("debt-direct-blocked");
    const deep = identity("debt-direct-deep");
    const changedActors = [root, ...prefix, rejected];

    const oldLineage = new Map(
      changedActors.map((actor) => [actor.key, { identity: actor, revision: 1 }] as const),
    );

    const captured = new Map(
      changedActors.map(
        (actor) => [actor.key, { identity: actor, snapshot: { revision: 2 } }] as const,
      ),
    );

    const wave = Result.getOrThrow(makeContextWaveChanges(root, 2));
    let provider = root;

    for (const actor of prefix) {
      Result.getOrThrow(
        wave.inherit(actor, { providers: [{ provider }], lineage: oldLineage }, captured),
      );
      Result.getOrThrow(wave.published(actor, 1, 2));
      provider = actor;
    }

    Result.getOrThrow(
      wave.inherit(rejected, { providers: [{ provider }], lineage: oldLineage }, captured),
    );
    Result.getOrThrow(
      wave.inherit(blocked, { providers: [{ provider: rejected }], lineage: oldLineage }, captured),
    );

    const state: ContextLineageNode = {
      identity: deep,
      providers: [{ slot: "source", provider: blocked }],
      lineage: new Map(),
      debt: new Map(),
    };

    const parent: ContextLineageNode = {
      identity: blocked,
      providers: [{ slot: "source", provider: rejected }],
      lineage: oldLineage,
      debt: new Map(),
    };

    const debt = Result.getOrThrow(
      retainBlockedContextDebt(state, wave.cuts, (key) =>
        key === blocked.key ? parent : undefined,
      ),
    );

    const pending = debt.get(blocked.key);

    if (pending === undefined) throw new Error("Expected deep blocked edge debt");

    assert.strictEqual(pending.size, changedActors.length);

    for (const actor of changedActors) {
      assert.strictEqual(pending.get(actor.key)?.identity, actor);
      assert.strictEqual(pending.get(actor.key)?.revision, 2);
    }

    state.debt = debt;
    parent.lineage = new Map(
      changedActors.map((actor) => [actor.key, { identity: actor, revision: 2 }] as const),
    );

    const snapshot: ActorSnapshot<typeof Provider> = {
      state: Provider.S.ready,
      memory: {},
      context: {},
      lifecycle: "active",
      operations: [],
      timers: [],
      issues: [],
      revision: 2,
      observedStoreRevision: 0,
    };

    const deepCaptured = new Map<string, ContextCapturedProvider>([
      [blocked.key, { identity: blocked, snapshot }],
    ]);

    const covered = Result.getOrThrow(
      planContextLineage(state, deepCaptured, (key) => (key === blocked.key ? parent : undefined)),
    );

    assert.strictEqual(covered.debt.size, 0);
    assert.strictEqual(debt.get(blocked.key)?.size, changedActors.length);

    for (const actor of changedActors) {
      assert.strictEqual(covered.lineage.get(actor.key)?.identity, actor);
      assert.strictEqual(covered.lineage.get(actor.key)?.revision, 2);
    }
  });

  it("updates a blocked high-fan-in participant once per edge and clears exact coverage", () => {
    const root = identity("debt-fan-root");
    const consumer = identity("debt-fan-consumer");
    const parentCount = 512;

    const parents = Array.from({ length: parentCount }, (_, index) =>
      identity(`debt-fan-parent-${index}`),
    );

    const oldRoot = new Map([[root.key, { identity: root, revision: 1 }]]);
    const newRoot = new Map([[root.key, { identity: root, revision: 2 }]]);

    const nodes = new Map<string, ContextLineageNode>();
    const changes = new Map(parents.map((parent) => [parent.key, newRoot]));

    const state: ContextLineageNode = {
      identity: consumer,
      providers: parents.map((provider, index) => ({ slot: `source-${index}`, provider })),
      lineage: new Map(),
      debt: new Map(),
    };

    for (const parent of parents)
      nodes.set(parent.key, {
        identity: parent,
        providers: [],
        lineage: oldRoot,
        debt: new Map(),
      });

    let writes = 0;
    const setDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "set");

    if (setDescriptor === undefined) throw new Error("Map.set descriptor is unavailable");
    Object.defineProperty(Map.prototype, "set", {
      ...setDescriptor,
      value: function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
        writes += 1;

        return setDescriptor.value.call(this, key, value);
      },
    });

    let debt;

    try {
      debt = Result.getOrThrow(retainBlockedContextDebt(state, changes, (key) => nodes.get(key)));
    } finally {
      Object.defineProperty(Map.prototype, "set", setDescriptor);
    }

    assert.ok(writes <= parentCount * 20, `${writes} map writes`);
    assert.strictEqual(debt.size, parentCount);
    assert.strictEqual(state.debt.size, 0);

    for (const parent of parents) {
      const pending = debt.get(parent.key);

      if (pending === undefined) throw new Error("Expected pending edge debt");

      assert.strictEqual(pending.size, 1);
      assert.strictEqual(pending.get(root.key)?.identity, root);
      assert.strictEqual(pending.get(root.key)?.revision, 2);
      nodes.get(parent.key)!.lineage = newRoot;
    }

    state.debt = debt;

    const snapshot: ActorSnapshot<typeof Provider> = {
      state: Provider.S.ready,
      memory: {},
      context: {},
      lifecycle: "active",
      operations: [],
      timers: [],
      issues: [],
      revision: 1,
      observedStoreRevision: 0,
    };

    const captured = new Map<string, ContextCapturedProvider>(
      parents.map((parent) => [parent.key, { identity: parent, snapshot }]),
    );

    const covered = Result.getOrThrow(planContextLineage(state, captured, (key) => nodes.get(key)));

    assert.strictEqual(covered.debt.size, 0);
    assert.strictEqual(covered.lineage.get(root.key)?.revision, 2);
    assert.strictEqual(covered.lineage.size, parentCount + 1);
  });
});
