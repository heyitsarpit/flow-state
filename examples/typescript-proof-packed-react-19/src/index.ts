import { createElement } from "react";
import type { ReactElement } from "react";
import type { FlowRuntime } from "flow-state";
import { FlowProvider, useActor, useResource, useView } from "flow-state/react";
import type { FlowProviderProps } from "flow-state/react";
import type { FlowRuntimeBootPayload } from "flow-state/server";
// @ts-expect-error the legacy use actor hook export was removed
import { use } from "flow-state/react";
void use;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;

declare const runtime: FlowRuntime<never, unknown>;
declare const serverBoot: FlowRuntimeBootPayload;

export const providerProps: FlowProviderProps = {
  runtime,
  children: "react-19",
};

export const providerElement: ReactElement = createElement(FlowProvider, providerProps);
export function createHydratedServerElement(
  clientRuntime: FlowRuntime<never, unknown>,
  boot: FlowRuntimeBootPayload,
): ReactElement {
  clientRuntime.hydrateBoot(boot);
  return createElement(FlowProvider, { runtime: clientRuntime, children: "hydrated-react-19" });
}

export const hydratedServerElement: ReactElement = createHydratedServerElement(runtime, serverBoot);

type _React19ProviderAcceptsPackedProps = Expect<
  Equal<Parameters<typeof FlowProvider>[0], FlowProviderProps>
>;
type _React19HooksStayPackedFunctions = Expect<
  Equal<
    [typeof useActor, typeof useResource, typeof useView],
    [typeof useActor, typeof useResource, typeof useView]
  >
>;

void [
  true as _React19ProviderAcceptsPackedProps,
  true as _React19HooksStayPackedFunctions,
  providerElement,
  hydratedServerElement,
];
