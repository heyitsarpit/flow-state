import { createStore } from "@tanstack/store";

import type { SelectionSource } from "../phase0-design.js";

export interface WritableSelectionSource<T> extends SelectionSource<T> {
  readonly update: (updater: (previous: T) => T) => void;
}

export function createSelectionSource<T>(initialValue: T): WritableSelectionSource<T> {
  const store = createStore(initialValue);

  return {
    getSnapshot: () => store.state,
    subscribe: (listener) => {
      const subscription = store.subscribe(() => {
        listener();
      });

      return () => {
        subscription.unsubscribe();
      };
    },
    update: (updater) => {
      store.setState(updater);
    },
  };
}
