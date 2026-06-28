import type { SelectionSource } from "../shared-contracts.js";

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
      let updatedDuringSubscribe = false;
      const unsubscribe = config.subscribeToCurrent((next) => {
        updatedDuringSubscribe = true;
        current = next;
        listener();
      });

      if (!updatedDuringSubscribe) {
        const next = config.getCurrent();
        if (!equal(current, next)) {
          current = next;
        }
      }

      return unsubscribe;
    },
  };
}
