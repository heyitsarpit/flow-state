import type { FlowKey, FlowTag } from "../../core/api/types.js";

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshotKeyPart(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          return value;
        }
      }
      return Object.freeze(value.map((entry) => snapshotKeyPart(entry, seen)));
    }

    if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
      return value;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const copied = (Object.getPrototypeOf(value) === null ? Object.create(null) : {}) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        key === "__proto__" ||
        key === "prototype" ||
        key === "constructor"
      ) {
        return value;
      }
      Object.defineProperty(copied, key, {
        enumerable: true,
        configurable: false,
        writable: false,
        value: snapshotKeyPart(descriptor.value, seen),
      });
    }

    return Object.freeze(copied);
  } finally {
    seen.delete(value);
  }
}

export function createKey(...parts: ReadonlyArray<unknown>): FlowKey {
  const seen = new WeakSet<object>();
  return Object.freeze(parts.map((part) => snapshotKeyPart(part, seen))) as FlowKey;
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
