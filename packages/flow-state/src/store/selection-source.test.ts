import { describe, expect, it } from "vite-plus/test";

import { createSelectionSource, deriveSource, selectSource } from "./selection-source.js";

describe("selection source helpers", () => {
  it("keeps selected sources readonly", () => {
    const source = createSelectionSource({ count: 0 });
    const parity = selectSource(source, (snapshot) => snapshot.count % 2);

    expect(parity.getSnapshot()).toBe(0);

    const assertReadonly = (_source: typeof parity) => {
      // @ts-expect-error selected sources are readonly projections over a writable source
      _source.update(() => 1);
    };

    void assertReadonly;
  });

  it("keeps equal selections stable and computes later changes from the latest source snapshot", () => {
    const source = createSelectionSource({ count: 0 });
    const selected = selectSource(
      source,
      (snapshot) => ({
        parity: snapshot.count % 2,
        count: snapshot.count,
      }),
      (previous, next) => previous.parity === next.parity,
    );
    const notifications: Array<Readonly<{ readonly parity: number; readonly count: number }>> = [];

    const unsubscribe = selected.subscribe(() => {
      notifications.push(selected.getSnapshot());
    });

    const initial = selected.getSnapshot();
    source.update((snapshot) => ({ count: snapshot.count + 2 }));

    expect(notifications).toEqual([]);
    expect(selected.getSnapshot()).toBe(initial);

    source.update((snapshot) => ({ count: snapshot.count + 1 }));

    expect(notifications).toEqual([{ parity: 1, count: 3 }]);
    expect(selected.getSnapshot()).toEqual({ parity: 1, count: 3 });

    unsubscribe();
  });

  it("unsubscribes from the base source exactly once", () => {
    let subscriptions = 0;
    let unsubscriptions = 0;
    let current = 0;
    const listeners = new Set<() => void>();

    const source = {
      getSnapshot: () => current,
      subscribe: (listener: () => void) => {
        subscriptions += 1;
        listeners.add(listener);

        return () => {
          unsubscriptions += 1;
          listeners.delete(listener);
        };
      },
    };

    const selected = selectSource(source, (value) => value % 2);
    const unsubscribe = selected.subscribe(() => undefined);

    expect(subscriptions).toBe(1);
    expect(unsubscriptions).toBe(0);

    current = 1;
    for (const listener of listeners) {
      listener();
    }
    expect(selected.getSnapshot()).toBe(1);

    unsubscribe();
    expect(unsubscriptions).toBe(1);
  });

  it("supports server snapshots without reading client state", () => {
    const source = {
      getSnapshot: () => 1,
      getServerSnapshot: () => 2,
      subscribe: () => () => undefined,
    };

    const selected = selectSource(source, (value) => value * 10);

    expect(selected.getSnapshot()).toBe(10);
    expect(selected.getServerSnapshot?.()).toBe(20);
  });

  it("derives from multiple sources and preserves equality short-circuits", () => {
    const sourceA = createSelectionSource({ count: 1 });
    const sourceB = createSelectionSource({ count: 2 });
    const derived = deriveSource(
      [sourceA, sourceB] as const,
      ([left, right]) => ({
        total: left.count + right.count,
        parity: (left.count + right.count) % 2,
      }),
      (previous, next) => previous.parity === next.parity,
    );

    const initial = derived.getSnapshot();
    const notifications: Array<Readonly<{ readonly total: number; readonly parity: number }>> = [];
    const unsubscribe = derived.subscribe(() => {
      notifications.push(derived.getSnapshot());
    });

    sourceA.update((current) => ({ count: current.count + 2 }));

    expect(notifications).toEqual([]);
    expect(derived.getSnapshot()).toBe(initial);

    sourceB.update((current) => ({ count: current.count + 1 }));

    expect(notifications).toEqual([{ total: 6, parity: 0 }]);
    expect(derived.getSnapshot()).toEqual({ total: 6, parity: 0 });

    unsubscribe();
  });

  it("replays a fresh derived snapshot immediately when a source changes before subscription settles", () => {
    const source = createSelectionSource(1);
    const selected = selectSource(source, (value) => value * 10);
    const notifications: number[] = [];

    const unsubscribe = selected.subscribe(() => {
      notifications.push(selected.getSnapshot());
    });

    source.update((value) => value + 1);

    expect(notifications).toEqual([20]);

    unsubscribe();
  });

  it("reads multi-source server snapshots when every source provides one", () => {
    const atomA = createSelectionSource(1);
    const atomB = createSelectionSource(2);
    const atomC = {
      getSnapshot: () => 3,
      getServerSnapshot: () => 30,
      subscribe: () => () => undefined,
    };
    const atomD = createSelectionSource(1);

    const derivedWithoutServer = deriveSource(
      [atomA, atomB, atomD] as const,
      ([left, center, right]) => left + center + right,
    );
    const derivedWithServer = deriveSource(
      [
        {
          getSnapshot: atomA.getSnapshot,
          getServerSnapshot: () => 10,
          subscribe: atomA.subscribe,
        },
        {
          getSnapshot: atomB.getSnapshot,
          getServerSnapshot: () => 20,
          subscribe: atomB.subscribe,
        },
        atomC,
      ] as const,
      ([left, center, right]) => left + center + right,
    );

    expect(derivedWithoutServer.getServerSnapshot).toBeUndefined();
    expect(derivedWithServer.getSnapshot()).toBe(6);
    expect(derivedWithServer.getServerSnapshot?.()).toBe(60);
  });
});
