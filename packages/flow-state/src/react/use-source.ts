import { useRef, useSyncExternalStore } from "react";

import type { SelectionSource } from "../public/types.js";

type SourceRecord<T> = Readonly<{
  readonly source: SelectionSource<T>;
  readonly getSnapshot: () => T;
  readonly getServerSnapshot: () => T;
}>;

export function useSource<T>(source: SelectionSource<T>): T {
  const current = useRef<SourceRecord<T>>({
    source,
    getSnapshot: () => source.getSnapshot(),
    getServerSnapshot: () => source.getServerSnapshot?.() ?? source.getSnapshot(),
  });

  if (current.current.source !== source) {
    current.current = {
      source,
      getSnapshot: () => source.getSnapshot(),
      getServerSnapshot: () => source.getServerSnapshot?.() ?? source.getSnapshot(),
    };
  }

  return useSyncExternalStore(
    current.current.source.subscribe,
    current.current.getSnapshot,
    current.current.getServerSnapshot,
  );
}
