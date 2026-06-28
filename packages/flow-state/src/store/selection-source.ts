import { createStore } from "@tanstack/store";

import type { SelectionSource } from "../shared-contracts.js";

export interface WritableSelectionSource<T> extends SelectionSource<T> {
  readonly update: (updater: (previous: T) => T) => void;
}

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
