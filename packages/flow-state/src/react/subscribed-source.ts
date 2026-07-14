import type { SelectionSource } from "../shared/contracts.js";

export function createSubscribedSource<T>(
  config: Readonly<{
    readonly getCurrent: () => T;
    readonly subscribeToCurrent: (listener: (snapshot: T) => void) => () => void;
    readonly equal?: (left: T, right: T) => boolean;
  }>,
): SelectionSource<T> {
  const equal = config.equal ?? Object.is;
  let current = config.getCurrent();

  return {
    getSnapshot: () => current,
    getServerSnapshot: () => current,
    subscribe: (listener) => {
      let active = true;
      let updatedDuringSubscribe = false;
      const unsubscribe = config.subscribeToCurrent((next) => {
        if (!active) {
          return;
        }

        updatedDuringSubscribe = true;
        if (equal(current, next)) {
          return;
        }

        current = next;
        listener();
      });

      if (!updatedDuringSubscribe) {
        const next = config.getCurrent();
        if (!equal(current, next)) {
          current = next;
        }
      }

      return () => {
        if (!active) {
          return;
        }

        active = false;
        unsubscribe();
      };
    },
  };
}
