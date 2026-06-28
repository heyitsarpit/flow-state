import { useRef } from "react";

import type { FlowResourceRef, FlowResourceSnapshot, SelectionSource } from "../public/types.js";

import type { FlowRuntimeTransport } from "./context.js";
import { createResourceSource } from "./resource-source.js";
import { useFlowRuntime } from "./use-runtime.js";
import { useSource } from "./use-source.js";

type ResourceValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

type ResourceSnapshot<Ref extends FlowResourceRef> = FlowResourceSnapshot<
  ResourceValue<Ref>
> | null;

function sameResourceRef(left: FlowResourceRef, right: FlowResourceRef): boolean {
  if (left === right) {
    return true;
  }

  if (left.id !== right.id || left.key.length !== right.key.length) {
    return false;
  }

  for (let index = 0; index < left.key.length; index += 1) {
    if (!Object.is(left.key[index], right.key[index])) {
      return false;
    }
  }

  return true;
}

export function useResource<Ref extends FlowResourceRef>(ref: Ref): ResourceSnapshot<Ref> {
  const runtime = useFlowRuntime() as unknown as FlowRuntimeTransport;
  const current = useRef<Readonly<{
    readonly runtime: typeof runtime;
    readonly ref: Ref;
    readonly source: SelectionSource<ResourceSnapshot<Ref>>;
  }> | null>(null);

  if (
    current.current === null ||
    current.current.runtime !== runtime ||
    !sameResourceRef(current.current.ref, ref)
  ) {
    current.current = {
      runtime,
      ref,
      source: createResourceSource(runtime, ref),
    };
  }

  return useSource(current.current.source);
}

export { useResource as useFlowResource };
