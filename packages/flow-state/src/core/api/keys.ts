import type { FlowKey, FlowTag } from "../../core/api/types.js";

export function createKey(...parts: ReadonlyArray<unknown>): FlowKey {
  return Object.freeze([...parts]) as FlowKey;
}

export function createTag<const Id extends string>(id: Id): FlowTag<Id>;
export function createTag<const Id extends string, const Schema>(
  id: Id,
  options: Readonly<{ readonly schema: Schema }>,
): FlowTag<Id, Schema>;
export function createTag<const Id extends string, const Schema>(
  id: Id,
  options?: Readonly<{ readonly schema: Schema }>,
): FlowTag<Id, Schema> {
  return Object.freeze({
    kind: "tag",
    id,
    ...(options === undefined ? {} : { schema: options.schema }),
  }) as FlowTag<Id, Schema>;
}
