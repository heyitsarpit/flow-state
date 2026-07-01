import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";

import type { FlowRuntime } from "../core/api/types.js";
import { FlowRuntimeContext } from "./context.js";

export interface FlowProviderProps {
  readonly runtime: FlowRuntime<never, unknown>;
  readonly children?: ReactNode;
}

export function FlowProvider(props: FlowProviderProps): ReactElement {
  return createElement(FlowRuntimeContext.Provider, {
    value: props.runtime,
    children: props.children,
  });
}
