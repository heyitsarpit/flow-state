import { invalidResourceKeyDiagnostic } from "../../shared/diagnostics.js";

type KeyObjectEntry = readonly [key: PropertyKey, descriptor: PropertyDescriptor];

export type KeyObjectInspection =
  | Readonly<{
      readonly kind: "array";
      readonly entries: ReadonlyMap<PropertyKey, PropertyDescriptor>;
      readonly length: number;
    }>
  | Readonly<{
      readonly kind: "record";
      readonly entries: ReadonlyArray<KeyObjectEntry>;
      readonly nullPrototype: boolean;
    }>
  | Readonly<{
      readonly kind: "runtime-local";
    }>;

function inspectOwnEntries(value: object): ReadonlyArray<KeyObjectEntry> {
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(value);
  const entries: Array<KeyObjectEntry> = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined) {
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: "uninspectable-object",
      });
    }
    entries.push([key, descriptor]);
  }
  return entries;
}

export function inspectKeyObject(value: object): KeyObjectInspection {
  try {
    if (Array.isArray(value)) {
      const entries = new Map(inspectOwnEntries(value));
      const lengthDescriptor = entries.get("length");
      if (
        lengthDescriptor === undefined ||
        !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number"
      ) {
        throw invalidResourceKeyDiagnostic({
          field: "key",
          reason: "uninspectable-object",
        });
      }
      return {
        kind: "array",
        entries,
        length: lengthDescriptor.value,
      };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { kind: "runtime-local" };
    }

    return {
      kind: "record",
      entries: inspectOwnEntries(value),
      nullPrototype: prototype === null,
    };
  } catch {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "uninspectable-object",
    });
  }
}
