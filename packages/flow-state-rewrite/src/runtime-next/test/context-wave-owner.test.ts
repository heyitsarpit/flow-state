import { assert, describe, it } from "@effect/vitest";
import { Option, Result } from "effect";

import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makePassiveObserver } from "../context/context-observer.js";
import {
  applyContextWave,
  buildContextGraph,
  installContextBaseline,
  planContextWave,
  type ContextGraphNode,
  type ContextSelectionBatch,
} from "../context/context-wave.js";

const ProviderResult = definition({
  id: "context-wave-owner/provider",
  states: ["ready", "changed"],
  events: {},
});

const Provider = Result.getOrThrow(ProviderResult);

const Consumer = Result.getOrThrow(
  definition({
    id: "context-wave-owner/consumer",
    states: ["idle"],
    events: {},
    context: {
      left: Provider.select(({ state }) => state),
      right: Provider.select(({ state }) => state),
    },
  }),
);

const Machine = Result.getOrThrow(
  machine(ProviderResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {}, changed: {} },
  })),
);

const identity = (name: string) => {
  const directory = makeActorDirectory<string>({ machines: [Machine] });

  const reservation = Result.getOrThrow(
    directory.reserve({ kind: "stable", ref: { machine: Machine, id: name, persist: false } }),
  );

  if (reservation._tag !== "create") throw new Error("Expected a new local identity");

  return reservation.reservation.identity;
};

describe("runtime-next context wave owner", () => {
  it("plans one complete diamond in provider order independent of node insertion", () => {
    const root = identity("root");
    const left = identity("left");
    const right = identity("right");
    const leaf = identity("leaf");

    const nodes: ContextGraphNode[] = [
      { identity: root, providers: [] },
      { identity: left, providers: [{ slot: "source", provider: root }] },
      { identity: right, providers: [{ slot: "source", provider: root }] },
      {
        identity: leaf,
        providers: [
          { slot: "left", provider: left },
          { slot: "right", provider: right },
        ],
      },
    ];

    const forward = Result.getOrThrow(
      planContextWave(Result.getOrThrow(buildContextGraph(nodes)), root),
    );

    const reversed = Result.getOrThrow(
      planContextWave(Result.getOrThrow(buildContextGraph([...nodes].reverse())), root),
    );

    assert.deepStrictEqual(
      forward.order.map((node) => node.key),
      reversed.order.map((node) => node.key),
    );
    assert.strictEqual(forward.order.length, 4);
    assert.strictEqual(forward.order[0], root);
    assert.strictEqual(forward.order[3], leaf);
    assert.deepStrictEqual(
      forward.layers.map((layer) => layer.map((node) => node.key)),
      [[left.key, right.key].sort(), [leaf.key]],
    );
    assert.ok(Result.isFailure(buildContextGraph([...nodes, nodes[0]!])));
  });

  it("counts one provider dependency when it fills multiple consumer slots", () => {
    const provider = identity("shared-provider");
    const consumer = identity("shared-consumer");

    const graph = Result.getOrThrow(
      buildContextGraph([
        {
          identity: consumer,
          providers: [
            { slot: "left", provider },
            { slot: "right", provider },
          ],
        },
        { identity: provider, providers: [] },
      ]),
    );

    assert.strictEqual(graph.providersByConsumer.get(consumer.key)?.length, 2);
    assert.deepStrictEqual(Result.getOrThrow(planContextWave(graph, provider)).order, [
      provider,
      consumer,
    ]);
  });

  it("builds high-degree edges with linear input work and no comparison sort", () => {
    const root = identity("degree-root");
    const consumer = identity("degree-consumer");
    const providers = Array.from({ length: 1_024 }, (_, index) => identity(`degree-${index}`));
    let slotReads = 0;

    const edges = providers.map((provider, index) => ({
      get slot() {
        slotReads += 1;

        return `slot-${index}`;
      },
      provider,
    }));

    const originalSort = Array.prototype.sort;
    Array.prototype.sort = () => {
      throw new Error("Comparison sorting is outside the graph cost bound");
    };

    try {
      const joined = Result.getOrThrow(
        buildContextGraph([
          { identity: consumer, providers: edges },
          ...providers.map((identity) => ({ identity, providers: [] })),
        ]),
      );

      assert.strictEqual(joined.providersByConsumer.get(consumer.key)?.length, providers.length);
      assert.ok(slotReads <= providers.length * 4);

      const fanout = [
        { identity: root, providers: [] },
        ...providers.map((identity) => ({
          identity,
          providers: [{ slot: "source", provider: root }],
        })),
      ];

      const forward = Result.getOrThrow(
        planContextWave(Result.getOrThrow(buildContextGraph(fanout)), root),
      );

      const reverse = Result.getOrThrow(
        planContextWave(Result.getOrThrow(buildContextGraph([...fanout].reverse())), root),
      );

      assert.strictEqual(forward.order.length, providers.length + 1);
      assert.deepStrictEqual(forward.order, reverse.order);
    } finally {
      Array.prototype.sort = originalSort;
    }
  });

  it("owns complete selections, retains an issue-only cut, and recovers siblings", () => {
    const provider = identity("selection");
    const input = { state: Provider.S.ready, memory: {}, context: {} };

    const request = (
      revision: number,
      state: typeof Provider.S.ready | typeof Provider.S.changed,
    ) =>
      ({
        slots: ["left", "right"],
        requests: [
          {
            slot: "left",
            provider,
            cut: { identity: provider, revision },
            input: { ...input, state },
            select: ({ state: selected }) => selected,
            opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          },
          {
            slot: "right",
            provider,
            cut: { identity: provider, revision },
            input: { ...input, state },
            select: ({ state: selected }) => selected,
            opaqueIdentities: [Provider.S.ready, Provider.S.changed],
          },
        ],
      }) satisfies ContextSelectionBatch<typeof Consumer>;

    const baseline = Result.getOrThrow(
      installContextBaseline<typeof Consumer>(request(1, Provider.S.ready)),
    );

    const defective = request(2, Provider.S.changed);
    const left = defective.requests[0];

    if (left === undefined) throw new Error("Expected a left slot");

    const issue = Result.getOrThrow(
      applyContextWave<typeof Consumer>(baseline, {
        slots: defective.slots,
        requests: [
          left,
          {
            ...defective.requests[1]!,
            select: () => {
              throw new Error("selector defect");
            },
          },
        ],
      }),
    );

    assert.strictEqual(issue.publication, "issue-only");
    assert.strictEqual(issue.projection.values.get("left"), Provider.S.ready);
    const pending = issue.ledger.get("left")?.pending;

    if (pending === undefined || Option.isNone(pending))
      throw new Error("Expected pending sibling");

    assert.strictEqual(pending.value.value, Provider.S.changed);
    assert.strictEqual(issue.selectorDefects.length, 1);

    let repeatedCalls = 0;

    const repeated = Result.getOrThrow(
      applyContextWave<typeof Consumer>(issue, {
        slots: defective.slots,
        requests: [
          left,
          {
            ...defective.requests[1]!,
            select: () => {
              repeatedCalls += 1;
              throw new Error("same cut must not retry");
            },
          },
        ],
      }),
    );

    assert.strictEqual(repeatedCalls, 0);
    assert.strictEqual(repeated.publication, "unchanged");
    assert.strictEqual(repeated.selectorDefects.length, 0);
    const stillPending = repeated.ledger.get("left")?.pending;

    assert.ok(stillPending !== undefined && Option.isSome(stillPending));
    assert.strictEqual(stillPending.value.value, Provider.S.changed);

    const recovered = Result.getOrThrow(
      applyContextWave<typeof Consumer>(repeated, request(3, Provider.S.changed)),
    );

    assert.strictEqual(recovered.publication, "changed");
    assert.strictEqual(recovered.projection.values.get("left"), Provider.S.changed);
    assert.strictEqual(recovered.projection.values.get("right"), Provider.S.changed);
    assert.deepStrictEqual([...recovered.changedSlots].sort(), ["left", "right"]);
    assert.ok(
      Result.isFailure(applyContextWave<typeof Consumer>(recovered, request(2, Provider.S.ready))),
    );
    assert.ok(
      Result.isFailure(
        installContextBaseline<typeof Consumer>({
          slots: ["left", "right"],
          requests: [request(1, Provider.S.ready).requests[0]!],
        }),
      ),
    );
  });

  it("preserves dependencies after a passive selector defect", () => {
    const observer = makePassiveObserver<string>();
    const successful = observer.evaluate((read) => read("a", 1));

    assert.ok(Result.isSuccess(successful));
    assert.deepStrictEqual(observer.dependencies(), ["a"]);
    assert.ok(
      Result.isFailure(
        observer.observe((read) => {
          read("b", 2);
          throw new Error("bad observation");
        }),
      ),
    );
    assert.deepStrictEqual(observer.dependencies(), ["a"]);
  });
});
