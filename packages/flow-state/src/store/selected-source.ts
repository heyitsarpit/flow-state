import type { SelectionSource } from "../phase0-design.js";

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
      return source.subscribe(() => {
        const next = readSelection(source.getSnapshot());
        if (!equal(current, next)) {
          current = next;
          listener();
        }
      });
    },
  };
}
