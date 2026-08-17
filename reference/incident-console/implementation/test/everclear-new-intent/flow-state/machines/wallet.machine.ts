import * as flow from "flow-state";
import {
  emptyWalletMemory,
  type ExplorerFailure,
  type Network,
  type WalletAccounts,
} from "../domain";
import { openWalletDialog, runtimeInput, walletAccounts, walletChanges } from "../primitives";

export const Wallet = flow.definition({
  id: "Everclear/Wallet",
  states: ["WATCHING"],
  events: {
    ConnectRequested: (network: Network) => ({ network }),
    ProviderChanged: (accounts: WalletAccounts) => ({ accounts }),
    ProviderDisconnected: null,
    WalletStreamFailed: (error: ExplorerFailure) => ({ error }),
  },
  memory: emptyWalletMemory,
  operations: { walletAccounts, walletChanges, openWalletDialog },
});

export const walletMachine = flow.machine(Wallet, ({ S, E, O, clear }) => ({
  default: S.WATCHING,
  states: {
    WATCHING: {
      activities: [
        O.walletChanges.subscribe(runtimeInput, {
          outcomes: {
            value: (change) =>
              change.kind === "connected"
                ? E.ProviderChanged(change.accounts)
                : E.ProviderDisconnected(),
            failure: (error) => E.WalletStreamFailed(error),
          },
        }),
      ],
      on: {
        ConnectRequested: {
          target: S.WATCHING,
          actions: ({ event }) => [O.openWalletDialog.commit({ network: event.network })],
        },
        ProviderChanged: {
          target: S.WATCHING,
          updateMemory: ({ event }) => ({ accounts: event.accounts, lastError: null }),
          actions: ({ event }) => [O.walletAccounts.setData([], event.accounts)],
        },
        ProviderDisconnected: {
          target: S.WATCHING,
          updateMemory: emptyWalletMemory,
          actions: () => [clear([O.walletAccounts])],
        },
        WalletStreamFailed: {
          target: S.WATCHING,
          updateMemory: ({ event }) => ({ lastError: event.error }),
        },
      },
    },
  },
}));
