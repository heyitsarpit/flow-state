import type { FlowKey, FlowTag } from "../../core/api/types.js";

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cycleMarker(): object {
  const marker: Record<string, unknown> = {};
  Object.defineProperty(marker, "cycle", {
    configurable: false,
    enumerable: true,
    writable: false,
    value: marker,
  });
  return Object.freeze(marker);
}

function snapshotArray(
  value: ReadonlyArray<unknown>,
  seen: WeakSet<object>,
): ReadonlyArray<unknown> {
  const copied: Array<unknown> = [];
  copied.length = value.length;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor !== undefined) {
      Object.defineProperty(copied, index, snapshotPropertyDescriptor(descriptor, seen));
    }
  }

  return Object.freeze(copied);
}

function snapshotPropertyDescriptor(
  descriptor: PropertyDescriptor,
  seen: WeakSet<object>,
): PropertyDescriptor {
  if ("value" in descriptor) {
    return {
      configurable: false,
      enumerable: descriptor.enumerable === true,
      writable: false,
      value: snapshotKeyPart(descriptor.value, seen),
    };
  }

  return {
    ...descriptor,
    configurable: false,
    enumerable: descriptor.enumerable === true,
  };
}

function snapshotKeyPart(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return cycleMarker();
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return snapshotArray(value, seen);
    }

    if (!isPlainRecord(value)) {
      return value;
    }

    const copied: object = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined) {
        Object.defineProperty(copied, key, snapshotPropertyDescriptor(descriptor, seen));
      }
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
