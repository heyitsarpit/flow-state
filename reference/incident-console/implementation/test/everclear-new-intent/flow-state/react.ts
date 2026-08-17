import { useMemo } from "react";
import { useActor, useActorByRef, useShallow, useView } from "flow-state/react";
import type { IntentFilters, InvoiceOverride, Network } from "./domain";
import {
  EverclearExampleApp,
  EverclearIntentsRef,
  EverclearNewIntentRef,
  EverclearWalletRef,
} from "./app";
import { Intents, NewIntent, Wallet } from "./machines";
import type { UrlIntentInput } from "./machines/new-intent.machine";
import {
  selectActorIssues,
  selectActorLifecycle,
  selectIntentsFailure,
  selectIntentsFilters,
  selectIntentsLabels,
  selectIntentsLoading,
  selectIntentsPagination,
  selectIntentsRefreshing,
  selectIntentsRows,
  selectIntentsShowingPreviousRows,
  selectNewIntentAmount,
  selectNewIntentComparisonState,
  selectNewIntentEstimates,
  selectNewIntentFastPath,
  selectNewIntentForm,
  selectNewIntentInvoice,
  selectNewIntentMiniAppMode,
  selectNewIntentOrderState,
  selectNewIntentPrices,
  selectNewIntentQuoteState,
  selectNewIntentRecipient,
  selectNewIntentRoute,
  selectNewIntentSubmission,
  selectNewIntentSubmit,
  selectWalletAccounts,
  selectWalletCanConnect,
  selectWalletConnectedNetworks,
  selectWalletDialogState,
} from "./views";

/**
 * Runtime attachment state is separate from domain projections so components can subscribe to it
 * only when they render diagnostics or loading boundaries.
 */
export const useNewIntentRuntime = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  const lifecycle = useView(actor, selectActorLifecycle);
  const issues = useView(actor, selectActorIssues);
  return useMemo(() => ({ lifecycle, issues }), [lifecycle, issues]);
};

export const useNewIntentRoute = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentRoute));
};
export type NewIntentRoute = ReturnType<typeof useNewIntentRoute>;

export const useNewIntentAmount = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentAmount));
};
export type NewIntentAmount = ReturnType<typeof useNewIntentAmount>;

export const useNewIntentRecipient = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentRecipient));
};
export type NewIntentRecipient = ReturnType<typeof useNewIntentRecipient>;

export const useNewIntentInvoice = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentInvoice));
};
export type NewIntentInvoice = ReturnType<typeof useNewIntentInvoice>;

export const useNewIntentFastPath = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, selectNewIntentFastPath);
};

export const useNewIntentForm = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentForm));
};
export type NewIntentForm = ReturnType<typeof useNewIntentForm>;

export const useNewIntentPrices = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, selectNewIntentPrices);
};

export const useNewIntentMiniAppMode = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, selectNewIntentMiniAppMode);
};

export const useNewIntentQuoteState = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, selectNewIntentQuoteState);
};

export const useNewIntentComparisonState = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, selectNewIntentComparisonState);
};

export const useNewIntentOrderState = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, selectNewIntentOrderState);
};

export const useNewIntentEstimates = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentEstimates));
};
export type NewIntentEstimates = ReturnType<typeof useNewIntentEstimates>;

export const useNewIntentSubmission = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentSubmission));
};
export type NewIntentSubmission = ReturnType<typeof useNewIntentSubmission>;

export const useNewIntentSubmit = () => {
  const actor = useActorByRef(EverclearNewIntentRef);
  return useView(actor, useShallow(selectNewIntentSubmit));
};
export type NewIntentSubmit = ReturnType<typeof useNewIntentSubmit>;

export const useNewIntentCommands = () => {
  const actor = useActorByRef(EverclearNewIntentRef);

  return useMemo(
    () => ({
      enterRoute: (value: UrlIntentInput) => actor.send(NewIntent.E.RouteEntered(value)),
      leaveRoute: () => actor.send(NewIntent.E.RouteLeft()),
      selectOrigin: (chainId: number, assetId: string) =>
        actor.send(NewIntent.E.OriginSelected(chainId, assetId)),
      saveDestinations: (chainIds: readonly number[], outputAssetId: string | null) =>
        actor.send(NewIntent.E.DestinationSelectionSaved(chainIds, outputAssetId)),
      changeAmount: (amount: string) => actor.send(NewIntent.E.AmountChanged(amount)),
      changeRecipient: (recipient: string) => actor.send(NewIntent.E.RecipientChanged(recipient)),
      useRecipient: (enabled: boolean) => actor.send(NewIntent.E.RecipientModeChanged(enabled)),
      requestFastPath: (enabled: boolean) => actor.send(NewIntent.E.FastPathChanged(enabled)),
      applyInvoice: (invoice: InvoiceOverride) => actor.send(NewIntent.E.InvoiceApplied(invoice)),
      clearInvoice: () => actor.send(NewIntent.E.InvoiceCleared()),
      reset: () => actor.send(NewIntent.E.ResetRequested()),
      submit: () => actor.send(NewIntent.E.SubmitRequested()),
    }),
    [actor],
  );
};

export const useIntentsRuntime = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  const lifecycle = useView(actor, selectActorLifecycle);
  const issues = useView(actor, selectActorIssues);
  return useMemo(() => ({ lifecycle, issues }), [lifecycle, issues]);
};

export const useIntentsFilters = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsFilters);
};

export const useIntentsRows = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsRows);
};

export const useIntentsShowingPreviousRows = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsShowingPreviousRows);
};

export const useIntentsPagination = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, useShallow(selectIntentsPagination));
};

export const useIntentsLabels = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsLabels);
};

export const useIntentsLoading = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsLoading);
};

export const useIntentsRefreshing = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsRefreshing);
};

export const useIntentsFailure = () => {
  const actor = useActorByRef(EverclearIntentsRef);
  return useView(actor, selectIntentsFailure);
};

export const useIntentsCommands = () => {
  const actor = useActorByRef(EverclearIntentsRef);

  return useMemo(
    () => ({
      enterRoute: (filters: IntentFilters) => actor.send(Intents.E.RouteEntered(filters)),
      leaveRoute: () => actor.send(Intents.E.RouteLeft()),
      changeFilters: (filters: IntentFilters) => actor.send(Intents.E.FiltersChanged(filters)),
      nextPage: (cursor: string) => actor.send(Intents.E.NextPageRequested(cursor)),
      previousPage: () => actor.send(Intents.E.PreviousPageRequested()),
      refresh: () => actor.send(Intents.E.RefreshRequested()),
    }),
    [actor],
  );
};

export const useWalletRuntime = () => {
  const actor = useActorByRef(EverclearWalletRef);
  const lifecycle = useView(actor, selectActorLifecycle);
  const issues = useView(actor, selectActorIssues);
  return useMemo(() => ({ lifecycle, issues }), [lifecycle, issues]);
};

export const useWalletAccounts = () => {
  const actor = useActorByRef(EverclearWalletRef);
  return useView(actor, selectWalletAccounts);
};

export const useWalletConnectedNetworks = () => {
  const actor = useActorByRef(EverclearWalletRef);
  return useView(actor, useShallow(selectWalletConnectedNetworks));
};

export const useWalletDialogState = (network: Network) => {
  const actor = useActorByRef(EverclearWalletRef);
  const selector = useMemo(() => selectWalletDialogState(network), [network]);
  return useView(actor, useShallow(selector));
};

export const useWalletCanConnect = (network: Network) => {
  const actor = useActorByRef(EverclearWalletRef);
  const selector = useMemo(() => selectWalletCanConnect(network), [network]);
  return useView(actor, selector);
};

export const useWalletConnection = () => {
  const accounts = useWalletAccounts();
  const connectedNetworks = useWalletConnectedNetworks();
  return useMemo(() => ({ accounts, connectedNetworks }), [accounts, connectedNetworks]);
};
export type WalletConnection = ReturnType<typeof useWalletConnection>;

export const useWalletCommands = () => {
  const actor = useActorByRef(EverclearWalletRef);
  return useMemo(
    () => ({
      connect: (network: Network) => actor.send(Wallet.E.ConnectRequested(network)),
    }),
    [actor],
  );
};

// A draft is local even though the routed screens use durable shared refs. useActor prepares this
// actor during render with its final ref, handle, and command buffer; commit attaches that same
// actor, while effect cleanup suspends it and a later setup resumes it without replaying input.
export const useNewIntentDraft = (input: UrlIntentInput) => {
  const actor = useActor(EverclearExampleApp.M.newIntent, {
    input,
    contextBindings: { walletAccounts: EverclearWalletRef },
  });
  const lifecycle = useView(actor, selectActorLifecycle);
  const issues = useView(actor, selectActorIssues);
  return {
    actor,
    runtime: useMemo(() => ({ lifecycle, issues }), [lifecycle, issues]),
  };
};
