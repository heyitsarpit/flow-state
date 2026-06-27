import { createElement, Fragment } from "react";
import type { ReactElement, ReactNode } from "react";

export function FlowProvider(props: { readonly children?: ReactNode }): ReactElement {
  return createElement(Fragment, null, props.children);
}
