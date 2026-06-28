import type { SelectionSource } from "../phase0-design.js";
import type { FlowResourceRef, FlowResourceSnapshot } from "../public/types.js";

import type { FlowRuntimeTransport } from "./context.js";
import { createSubscribedSource } from "./subscribed-source.js";

type ResourceValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

type ResourceSnapshot<Ref extends FlowResourceRef> = FlowResourceSnapshot<
  ResourceValue<Ref>
> | null;

function sameResourceSnapshot<Ref extends FlowResourceRef>(
  left: ResourceSnapshot<Ref>,
  right: ResourceSnapshot<Ref>,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.status === right.status &&
    left.availability === right.availability &&
    left.activity === right.activity &&
    left.freshness === right.freshness &&
    Object.is(left.value, right.value) &&
    Object.is(left.previousValue, right.previousValue) &&
    Object.is(left.placeholder, right.placeholder) &&
    Object.is(left.error, right.error) &&
    left.updatedAt === right.updatedAt &&
    left.invalidatedAt === right.invalidatedAt &&
    left.expiresAt === right.expiresAt &&
    left.requestId === right.requestId &&
    left.isPlaceholderData === right.isPlaceholderData
  );
}

export function createResourceSource<Ref extends FlowResourceRef>(
  runtime: FlowRuntimeTransport,
  ref: Ref,
): SelectionSource<ResourceSnapshot<Ref>> {
  return createSubscribedSource({
    getCurrent: () => runtime.resources.get(ref),
    subscribeToCurrent: (listener) =>
      runtime.resources.subscribe(ref, (snapshot) => {
        listener(snapshot);
      }),
    equal: sameResourceSnapshot,
  });
}
