import { useSyncExternalStore } from "react";

import type { SelectionSource } from "../public/types.js";

export function useSource<T>(source: SelectionSource<T>): T {
  const getSnapshot = source.getSnapshot;
  const getServerSnapshot = source.getServerSnapshot ?? source.getSnapshot;

  return useSyncExternalStore(source.subscribe, getSnapshot, getServerSnapshot);
}
