import { useSyncExternalStore } from "react";

import type { SelectionSource } from "../public/types.js";

export function useSource<T>(source: SelectionSource<T>): T {
  const getSnapshot = source.getSnapshot;
  const readServerSnapshot = source.getServerSnapshot;
  let hasServerSnapshot = false;
  let cachedServerSnapshot: T | undefined;
  const getServerSnapshot =
    readServerSnapshot === undefined
      ? source.getSnapshot
      : () => {
          if (!hasServerSnapshot) {
            cachedServerSnapshot = readServerSnapshot();
            hasServerSnapshot = true;
          }

          return cachedServerSnapshot as T;
        };

  return useSyncExternalStore(source.subscribe, getSnapshot, getServerSnapshot);
}
