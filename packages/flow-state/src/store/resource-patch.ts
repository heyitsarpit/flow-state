function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyResourcePatch<Value>(current: Value | undefined, patch: unknown): Value {
  if (isPlainObject(current) && isPlainObject(patch)) {
    return {
      ...current,
      ...patch,
    } as Value;
  }

  if (current === undefined && isPlainObject(patch)) {
    return patch as Value;
  }

  return patch as Value;
}
