import { createElement } from "react";
import type { ReactElement } from "react";

import { app, runtimeSetup } from "flow-state-rewrite";
import * as reactRoute from "flow-state-rewrite/react";

// @ts-expect-error Deferred runtime exports remain unpublished.
import { can } from "flow-state-rewrite";
// @ts-expect-error The React route is intentionally empty during this phase.
import { FlowProvider } from "flow-state-rewrite/react";

type Expect<Value extends true> = Value;

export type _ReactRouteIsEmpty = Expect<keyof typeof reactRoute extends never ? true : false>;

const rootApp = app({
  id: "packed-react-app",
  persistenceVersion: "1",
  modules: [],
});
const rootSetup = runtimeSetup({ app: rootApp });

export const rootElement: ReactElement = createElement("div", null, rootSetup.app.id);

void rootSetup;
void can;
void FlowProvider;
