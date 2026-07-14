import { useRef } from "react";

import type { FlowResourceRef, FlowResourceSnapshot, SelectionSource } from "../core/api/types.js";

import { createResourceSource } from "./resource-source.js";
import { useFlowRuntime } from "./use-runtime.js";
import { useSource } from "./use-source.js";

type ResourceValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

type ResourceSnapshot<Ref extends FlowResourceRef> = FlowResourceSnapshot<
  ResourceValue<Ref>
> | null;

export function useResource<Ref extends FlowResourceRef>(ref: Ref): ResourceSnapshot<Ref> {
  const runtime = useFlowRuntime();
  const current = useRef<Readonly<{
    readonly runtime: typeof runtime;
    readonly ref: Ref;
    readonly source: SelectionSource<ResourceSnapshot<Ref>>;
  }> | null>(null);

  if (
    current.current === null ||
    current.current.runtime !== runtime ||
    current.current.ref !== ref
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
