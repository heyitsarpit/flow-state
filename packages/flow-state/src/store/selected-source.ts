import type { SelectionSource } from "../shared-contracts.js";

type SnapshotOf<Source> = Source extends SelectionSource<infer Snapshot> ? Snapshot : never;

type SnapshotsOf<Sources extends ReadonlyArray<SelectionSource<any>>> = Readonly<{
  [Index in keyof Sources]: SnapshotOf<Sources[Index]>;
}>;

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

export function deriveSource<const Sources extends ReadonlyArray<SelectionSource<any>>, Selected>(
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
