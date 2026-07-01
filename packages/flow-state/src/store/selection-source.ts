import { createStore } from "@tanstack/store";

import type { SelectionSource } from "../shared/contracts.js";

export interface WritableSelectionSource<T> extends SelectionSource<T> {
  readonly update: (updater: (previous: T) => T) => void;
}

type SnapshotOf<Source> = Source extends SelectionSource<infer Snapshot> ? Snapshot : never;

type SnapshotsOf<Sources extends ReadonlyArray<SelectionSource<unknown>>> = Readonly<{
  [Index in keyof Sources]: SnapshotOf<Sources[Index]>;
}>;

export function createSelectionSource<T>(
  initialValue: T,
  options?: Readonly<{
    readonly schedule?: (callback: () => void) => () => void;
  }>,
): WritableSelectionSource<T> {
  const store = createStore(initialValue);
  const schedule =
    options?.schedule ??
    ((callback: () => void) => {
      callback();
      return () => undefined;
    });

  return {
    getSnapshot: () => store.state,
    subscribe: (listener) => {
      const pending = new Set<() => void>();
      const subscription = store.subscribe(() => {
        let cancelPending = () => undefined;
        const cancelScheduled = schedule(() => {
          pending.delete(cancelPending);
          listener();
        });
        cancelPending = () => {
          pending.delete(cancelPending);
          cancelScheduled();
        };
        pending.add(cancelPending);
      });

      return () => {
        subscription.unsubscribe();
        for (const cancelPending of pending) {
          cancelPending();
        }
        pending.clear();
      };
    },
    update: (updater) => {
      store.setState(updater);
    },
  };
}

export function selectSource<T, Selected>(
  source: SelectionSource<T>,
  selector: (value: T) => Selected,
  equal: (previous: Selected, next: Selected) => boolean = Object.is,
): SelectionSource<Selected> {
  let currentSnapshot = source.getSnapshot();
  let currentSelection = selector(currentSnapshot);

  const readSelection = (snapshot: T): Selected => {
    if (Object.is(snapshot, currentSnapshot)) {
      return currentSelection;
    }

    const nextSelection = selector(snapshot);
    currentSnapshot = snapshot;
    if (!equal(currentSelection, nextSelection)) {
      currentSelection = nextSelection;
    }

    return currentSelection;
  };

  return {
    getSnapshot: () => readSelection(source.getSnapshot()),
    ...(source.getServerSnapshot === undefined
      ? {}
      : {
          getServerSnapshot: () => selector(source.getServerSnapshot!()),
        }),
    subscribe: (listener) => {
      let current = readSelection(source.getSnapshot());
      const unsubscribe = source.subscribe(() => {
        const next = readSelection(source.getSnapshot());
        if (!equal(current, next)) {
          current = next;
          listener();
        }
      });

      const next = readSelection(source.getSnapshot());
      if (!equal(current, next)) {
        current = next;
        listener();
      }

      return unsubscribe;
    },
  };
}

export function deriveSource<
  const Sources extends ReadonlyArray<SelectionSource<unknown>>,
  Selected,
>(
  sources: Sources,
  selector: (snapshots: SnapshotsOf<Sources>) => Selected,
  equal: (previous: Selected, next: Selected) => boolean = Object.is,
): SelectionSource<Selected> {
  let currentSnapshots = sources.map((source) => source.getSnapshot()) as SnapshotsOf<Sources>;
  let currentSelection = selector(currentSnapshots);

  const sameSnapshots = (nextSnapshots: SnapshotsOf<Sources>): boolean =>
    nextSnapshots.every((snapshot, index) => Object.is(snapshot, currentSnapshots[index]));

  const readSnapshots = (): SnapshotsOf<Sources> =>
    sources.map((source) => source.getSnapshot()) as SnapshotsOf<Sources>;

  const readSelection = (nextSnapshots: SnapshotsOf<Sources>): Selected => {
    if (sameSnapshots(nextSnapshots)) {
      return currentSelection;
    }

    const nextSelection = selector(nextSnapshots);
    currentSnapshots = nextSnapshots;
    if (!equal(currentSelection, nextSelection)) {
      currentSelection = nextSelection;
    }

    return currentSelection;
  };

  return {
    getSnapshot: () => readSelection(readSnapshots()),
    ...(sources.every((source) => source.getServerSnapshot !== undefined)
      ? {
          getServerSnapshot: () =>
            selector(sources.map((source) => source.getServerSnapshot!()) as SnapshotsOf<Sources>),
        }
      : {}),
    subscribe: (listener) => {
      let current = readSelection(readSnapshots());
      let active = true;
      const unsubscriptions = sources.map((source) =>
        source.subscribe(() => {
          const next = readSelection(readSnapshots());
          if (!equal(current, next)) {
            current = next;
            listener();
          }
        }),
      );

      const next = readSelection(readSnapshots());
      if (!equal(current, next)) {
        current = next;
        listener();
      }

      return () => {
        if (!active) {
          return;
        }

        active = false;
        for (const unsubscribe of unsubscriptions) {
          unsubscribe();
        }
      };
    },
  };
}
