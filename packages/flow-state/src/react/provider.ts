import { createElement } from "react";
import type { ReactElement, ReactNode } from "react";

import type { FlowRuntime } from "../public/types.js";
import { FlowRuntimeContext } from "./context.js";

export interface FlowProviderProps {
  readonly runtime: FlowRuntime<any, any>;
  readonly children?: ReactNode;
}

export function FlowProvider(props: FlowProviderProps): ReactElement {
  return createElement(FlowRuntimeContext.Provider, {
    value: props.runtime,
    children: props.children,
  });
}
