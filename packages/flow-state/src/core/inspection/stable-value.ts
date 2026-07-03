function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

export function stableKey(value: unknown): string {
  const serialized = JSON.stringify(stableValue(value));
  return serialized ?? String(value);
}

export function formatStableValue(value: unknown): string {
  return JSON.stringify(stableValue(value)) ?? String(value);
}
