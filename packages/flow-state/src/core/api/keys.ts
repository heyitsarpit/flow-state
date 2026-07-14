import type { FlowKey, FlowTag } from "../../core/api/types.js";
import { inspectKeyObject } from "./key-object-inspection.js";

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
  entries: ReadonlyMap<PropertyKey, PropertyDescriptor>,
  length: number,
  seen: WeakSet<object>,
): ReadonlyArray<unknown> {
  const copied: Array<unknown> = [];
  copied.length = length;
  for (let index = 0; index < length; index += 1) {
    const descriptor = entries.get(String(index));
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
    const inspection = inspectKeyObject(value);
    if (inspection.kind === "array") {
      return snapshotArray(inspection.entries, inspection.length, seen);
    }
    if (inspection.kind === "runtime-local") {
      return value;
    }

    const copied: object = inspection.nullPrototype ? Object.create(null) : {};
    for (const [key, descriptor] of inspection.entries) {
      Object.defineProperty(copied, key, snapshotPropertyDescriptor(descriptor, seen));
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
