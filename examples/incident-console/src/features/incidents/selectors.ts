import { Schema } from "effect";

import type { FlowResourceSnapshot } from "flow-state";

export const matchingResourceSnapshot = (
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  descriptorId: string,
): FlowResourceSnapshot | undefined => resources[descriptorId];

export const resourceValue = <Value>(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  descriptorId: string,
  schema: Schema.Schema<Value>,
): Value | undefined => {
  const snapshot = matchingResourceSnapshot(resources, descriptorId);
  const candidate = snapshot?.availability === "value" ? snapshot.value : snapshot?.previousValue;
  return Schema.is(schema)(candidate) ? candidate : undefined;
};

