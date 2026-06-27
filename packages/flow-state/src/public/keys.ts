import type { FlowKey, FlowTag } from "./types.js";

export function createKey(...parts: ReadonlyArray<unknown>): FlowKey {
  return Object.freeze([...parts]) as FlowKey;
}

export function createTag<const Id extends string>(id: Id): FlowTag<Id> {
  return Object.freeze({
    kind: "tag",
    id,
  }) as FlowTag<Id>;
}
