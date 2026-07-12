import { createElement } from "react";
import type { ReactElement } from "react";
import type { FlowRuntime } from "flow-state";
import { FlowProvider, use, useResource, useView } from "flow-state/react";
import type { FlowProviderProps } from "flow-state/react";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;

declare const runtime: FlowRuntime<never, unknown>;

export const providerProps: FlowProviderProps = {
  runtime,
  children: "react-18",
};

export const providerElement: ReactElement = createElement(FlowProvider, providerProps);

type _React18ProviderAcceptsPackedProps = Expect<
  Equal<Parameters<typeof FlowProvider>[0], FlowProviderProps>
>;
type _React18HooksStayPackedFunctions = Expect<
  Equal<
    [typeof use, typeof useResource, typeof useView],
    [typeof use, typeof useResource, typeof useView]
  >
>;

void [
  true as _React18ProviderAcceptsPackedProps,
  true as _React18HooksStayPackedFunctions,
  providerElement,
];
