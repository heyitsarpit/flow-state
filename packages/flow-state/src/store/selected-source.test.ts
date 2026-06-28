import { describe, expect, it } from "vite-plus/test";

import { selectSource } from "./selected-source.js";
import { createSelectionSource } from "./selection-source.js";

describe("selected source bridge", () => {
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
    expect(listeners.size).toBe(0);
  });
});
