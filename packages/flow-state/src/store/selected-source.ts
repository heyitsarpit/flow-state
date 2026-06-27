import type { SelectionSource } from "../phase0-design.js";

export function selectSource<T, Selected>(
  source: SelectionSource<T>,
  selector: (value: T) => Selected,
  equal: (previous: Selected, next: Selected) => boolean = Object.is,
): SelectionSource<Selected> {
  let current = selector(source.getSnapshot());
  return {
    getSnapshot: () => current,
    ...(source.getServerSnapshot === undefined
      ? {}
      : {
          getServerSnapshot: () => selector(source.getServerSnapshot!()),
        }),
    subscribe: (listener) =>
      source.subscribe(() => {
        const next = selector(source.getSnapshot());
        if (!equal(current, next)) {
          current = next;
          listener();
        }
      }),
  };
}
