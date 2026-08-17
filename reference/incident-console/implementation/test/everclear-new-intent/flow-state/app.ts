import * as flow from "flow-state";
import { intentsMachine, newIntentMachine, walletMachine } from "./machines";

// The module is the example's admission boundary, not a React-component boundary. These actors
// share one Explorer runtime and are admitted together so route composition stays explicit.
export const ExplorerModule = flow.module({
  id: "EverclearExplorer",
  machines: {
    wallet: walletMachine,
    newIntent: newIntentMachine,
    intents: intentsMachine,
  },
});

export const EverclearExampleApp = flow.app({
  id: "everclear-explorer-example",
  persistenceVersion: "1",
  modules: [ExplorerModule],
});

export const EverclearAppPlan = EverclearExampleApp.plan;

// App.M is the complete admission catalogue. Compilation creates no actors, and a running
// runtime cannot acquire a machine that is absent from this plan.
export const EverclearWalletRef = flow.actorRef(EverclearExampleApp.M.wallet, "everclear-wallet");
export const EverclearNewIntentRef = flow.actorRef(
  EverclearExampleApp.M.newIntent,
  "everclear-new-intent",
);
export const EverclearIntentsRef = flow.actorRef(
  EverclearExampleApp.M.intents,
  "everclear-intents",
);
