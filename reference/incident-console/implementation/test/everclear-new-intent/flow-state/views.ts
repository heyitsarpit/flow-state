import type {
  AddressLabels,
  Asset,
  AssetBalance,
  AssetPrices,
  Chain,
  CompetitorEstimate,
  ExplorerFailure,
  IntentListQuery,
  IntentPage,
  IntentRow,
  IntentsMemory,
  NewIntentMemory,
  Order,
  OrderLookup,
  QuoteFailure,
  QuoteInput,
  RouteConfig,
  RouteQuote,
  SubmitFailure,
  SubmitIntent,
  SubmitReceipt,
  SubmissionStep,
  Network,
  WalletAccounts,
  WalletMemory,
} from "./domain";
import {
  accountForChain,
  buildActiveQuoteInput,
  effectiveNewIntentMemory,
  listQueryFrom,
  requiresRecipient,
} from "./domain";
import { Intents, NewIntent, Wallet } from "./machines";
import { intentPage, routeQuote, runtimeInput, type RuntimeInput } from "./primitives";

export type Lifecycle = "prepared" | "active" | "suspended" | "disposed";
export type OperationIssue = Readonly<{ readonly _tag: string; readonly message: string }>;
type OperationError = ExplorerFailure | QuoteFailure | SubmitFailure;

export type PassiveResourceState<A, E = OperationError> = Readonly<{
  availability: "empty" | "placeholder" | "value";
  status: "idle" | "loading" | "success" | "stale" | "failure";
  activity: "idle" | "fetching";
  value?: A;
  error?: E;
}>;

export type PassiveTransactionState<A, E = OperationError> = Readonly<{
  status: "idle" | "queued" | "pending" | "success" | "failure" | "defect" | "interrupt";
  value?: A;
  error?: E;
}>;

export type PassiveStreamState<E = OperationError> = Readonly<{
  status: "idle" | "running" | "complete" | "failure" | "defect" | "interrupt";
  error?: E;
}>;

type ResourceFamily<P, K, A, E = OperationError> = Readonly<{
  key: (params: P) => K;
  getData: (key: K) => A | undefined;
  getState: (key: K) => PassiveResourceState<A, E>;
}>;

type TransactionFamily<P, K, A, E = OperationError> = Readonly<{
  key: (params: P) => K;
  getState: (key: K) => PassiveTransactionState<A, E>;
}>;

type StreamFamily<P, K, E = OperationError> = Readonly<{
  key: (params: P) => K;
  getState: (key: K) => PassiveStreamState<E>;
}>;

export type SelectorInput<Memory, Context, Operations, CanEvent> = Readonly<{
  readonly state: string;
  readonly memory: Memory;
  readonly context: Context;
  readonly lifecycle: Lifecycle;
  readonly issues: readonly OperationIssue[];
  readonly can: (event: CanEvent) => boolean;
  readonly O: Operations;
}>;

type AssetBalanceInput = Readonly<{ account: string; assetId: string }>;
type SubmissionProgressInput = Readonly<{ readonly submissionId: string }>;
type OrderInput = OrderLookup;
type QuoteKey = ReturnType<typeof routeQuote.key>;
type IntentPageKey = ReturnType<typeof intentPage.key>;
type OpenWalletDialogInput = Readonly<{ readonly network: Network }>;
type WalletCanEvent = ReturnType<typeof Wallet.E.ConnectRequested>;
type NewIntentCanEvent = ReturnType<typeof NewIntent.E.SubmitRequested>;

type NewIntentOperations = Readonly<{
  routeConfig: ResourceFamily<RuntimeInput, readonly [], RouteConfig, ExplorerFailure>;
  assetPrices: ResourceFamily<RuntimeInput, readonly [], AssetPrices, ExplorerFailure>;
  miniAppMode: ResourceFamily<RuntimeInput, readonly [], boolean, OperationError>;
  orderById: ResourceFamily<OrderInput, readonly [string], Order, ExplorerFailure>;
  assetBalance: ResourceFamily<
    AssetBalanceInput,
    readonly [string, string],
    AssetBalance,
    ExplorerFailure
  >;
  routeQuote: ResourceFamily<QuoteInput, QuoteKey, RouteQuote, QuoteFailure>;
  competitorFees: ResourceFamily<
    QuoteInput,
    QuoteKey,
    readonly CompetitorEstimate[],
    ExplorerFailure
  >;
  submitIntent: TransactionFamily<SubmitIntent, readonly [string], SubmitReceipt, SubmitFailure>;
  submissionProgress: StreamFamily<SubmissionProgressInput, readonly [string], SubmitFailure>;
}>;

type IntentsOperations = Readonly<{
  intentPage: ResourceFamily<IntentListQuery, IntentPageKey, IntentPage, ExplorerFailure>;
  addressLabels: ResourceFamily<RuntimeInput, readonly [], AddressLabels, ExplorerFailure>;
}>;

type WalletOperations = Readonly<{
  walletAccounts: ResourceFamily<RuntimeInput, readonly [], WalletAccounts, ExplorerFailure>;
  openWalletDialog: TransactionFamily<
    OpenWalletDialogInput,
    readonly [string],
    void,
    ExplorerFailure
  >;
}>;

type EmptyContext = Readonly<Record<never, never>>;
type ActorRuntimeRead = Readonly<{ lifecycle: Lifecycle; issues: readonly OperationIssue[] }>;
export type WalletSelectorInput = SelectorInput<
  WalletMemory,
  EmptyContext,
  WalletOperations,
  WalletCanEvent
>;
export type NewIntentContext = Readonly<{ walletAccounts: WalletAccounts }>;
export type NewIntentSelectorInput = SelectorInput<
  NewIntentMemory,
  NewIntentContext,
  NewIntentOperations,
  NewIntentCanEvent
>;
export type IntentsSelectorInput = SelectorInput<
  IntentsMemory,
  EmptyContext,
  IntentsOperations,
  never
>;

const networks: readonly Network[] = ["evm", "svm", "tvm"];
const emptyNetworks: readonly Network[] = [];
const emptyChains: readonly Chain[] = [];
const emptyAssets: readonly Asset[] = [];
const emptyEstimates: readonly CompetitorEstimate[] = [];
const emptyIntentRows: readonly IntentRow[] = [];
const emptyLabels: AddressLabels = {};
const effectiveMemoryCache = new WeakMap<NewIntentMemory, NewIntentMemory>();
const estimateRowsCache = new WeakMap<
  RouteQuote,
  WeakMap<readonly CompetitorEstimate[], readonly CompetitorEstimate[]>
>();

const effectiveMemoryFrom = (memory: NewIntentMemory): NewIntentMemory => {
  if (memory.invoice === null) return memory;
  const cached = effectiveMemoryCache.get(memory);
  if (cached !== undefined) return cached;
  const effective = effectiveNewIntentMemory(memory);
  effectiveMemoryCache.set(memory, effective);
  return effective;
};

const estimateRowsFrom = (
  quoteValue: RouteQuote | undefined,
  comparisonValues: readonly CompetitorEstimate[],
): readonly CompetitorEstimate[] => {
  if (quoteValue === undefined) return emptyEstimates;
  let rowsForComparison = estimateRowsCache.get(quoteValue);
  if (rowsForComparison === undefined) {
    rowsForComparison = new WeakMap();
    estimateRowsCache.set(quoteValue, rowsForComparison);
  }
  const cached = rowsForComparison.get(comparisonValues);
  if (cached !== undefined) return cached;
  const rows = [
    { provider: "Everclear", feeUsd: quoteValue.feeUsd, etaSeconds: quoteValue.etaSeconds },
    ...comparisonValues,
  ];
  rowsForComparison.set(comparisonValues, rows);
  return rows;
};

// These are ordinary selectors, not registered view objects. The only operation capability they
// receive is the actor-revision-bound passive O projection, so key/getData/getState cannot acquire
// work, subscribe, commit, write, invalidate, or clear.

export const selectActorLifecycle = ({ lifecycle }: ActorRuntimeRead) => lifecycle;
export const selectActorIssues = ({ issues }: ActorRuntimeRead) => issues;

const walletAccountsFrom = ({ O }: WalletSelectorInput) =>
  O.walletAccounts.getData(O.walletAccounts.key(runtimeInput));

export const selectWalletAccounts = (input: WalletSelectorInput) => walletAccountsFrom(input);

export const selectWalletConnectedNetworks = (input: WalletSelectorInput): readonly Network[] => {
  const accounts = walletAccountsFrom(input);
  return accounts === undefined ? emptyNetworks : networks.filter((network) => accounts[network]);
};

export const selectWalletDialogState =
  (network: Network) =>
  ({ O }: WalletSelectorInput) =>
    O.openWalletDialog.getState(O.openWalletDialog.key({ network }));

export const selectWalletCanConnect =
  (network: Network) =>
  ({ can }: WalletSelectorInput) =>
    can(Wallet.E.ConnectRequested(network));

type NewIntentDerived = Readonly<{
  effective: NewIntentMemory;
  routes: RouteConfig | undefined;
  prices: AssetPrices | undefined;
  miniAppMode: boolean;
  walletAccounts: WalletAccounts;
  selectedAsset: Asset | null;
  recipientRequired: boolean;
  walletAddress: string | null;
  balance: PassiveResourceState<AssetBalance, ExplorerFailure> | null;
  order: PassiveResourceState<Order, ExplorerFailure> | null;
  resolvedOrder: Order | null;
  quoteInput: QuoteInput | null;
  quote: PassiveResourceState<RouteQuote, QuoteFailure> | null;
  comparison: PassiveResourceState<readonly CompetitorEstimate[], ExplorerFailure> | null;
  quoteValue: RouteQuote | undefined;
  comparisonValues: readonly CompetitorEstimate[];
  submissionState: PassiveTransactionState<SubmitReceipt, SubmitFailure> | null;
  progressState: PassiveStreamState<SubmitFailure> | null;
  orderBlocker: string | null;
}>;

const deriveNewIntent = ({ memory, context, O }: NewIntentSelectorInput): NewIntentDerived => {
  const effective = effectiveMemoryFrom(memory);
  const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
  const prices = O.assetPrices.getData(O.assetPrices.key(runtimeInput));
  const walletAccounts = context.walletAccounts;
  const selectedAsset = routes?.assets.find((asset) => asset.id === effective.inputAssetId) ?? null;
  const recipientRequired =
    routes !== undefined &&
    requiresRecipient(routes, effective.originChainId, effective.destinationChainIds);
  const walletAddress =
    routes === undefined ? null : accountForChain(routes, walletAccounts, effective.originChainId);
  const balance =
    walletAddress === null || effective.inputAssetId === null
      ? null
      : O.assetBalance.getState(
          O.assetBalance.key({ account: walletAddress, assetId: effective.inputAssetId }),
        );
  const order =
    effective.orderIdFromUrl === null
      ? null
      : O.orderById.getState(O.orderById.key({ orderId: effective.orderIdFromUrl }));
  const resolvedOrder =
    effective.orderIdFromUrl === null
      ? null
      : (O.orderById.getData(O.orderById.key({ orderId: effective.orderIdFromUrl })) ?? null);
  const quoteInput =
    routes === undefined || (effective.orderIdFromUrl !== null && resolvedOrder === null)
      ? null
      : buildActiveQuoteInput(effective, routes, walletAccounts, resolvedOrder);
  const quote = quoteInput === null ? null : O.routeQuote.getState(O.routeQuote.key(quoteInput));
  const comparison =
    quoteInput === null || quoteInput.outputAssetId !== null
      ? null
      : O.competitorFees.getState(O.competitorFees.key(quoteInput));
  const quoteValue =
    quoteInput === null ? undefined : O.routeQuote.getData(O.routeQuote.key(quoteInput));
  const comparisonValues =
    quoteInput === null || quoteInput.outputAssetId !== null
      ? emptyEstimates
      : (O.competitorFees.getData(O.competitorFees.key(quoteInput)) ?? []);
  const submissionInput = effective.submissionInput;
  const submissionState =
    submissionInput === null ? null : O.submitIntent.getState(O.submitIntent.key(submissionInput));
  const progressState =
    submissionInput === null
      ? null
      : O.submissionProgress.getState(
          O.submissionProgress.key({ submissionId: submissionInput.submissionId }),
        );
  const orderBlocker =
    order !== null && order.status === "failure"
      ? "Order not found."
      : effective.orderIdFromUrl !== null && resolvedOrder === null
        ? "Loading order…"
        : resolvedOrder?.status === "expired"
          ? "Order expired. Please request a new order."
          : resolvedOrder?.status === "filled"
            ? "Order already filled. Please request a new order."
            : null;

  return {
    effective,
    routes,
    prices,
    miniAppMode: O.miniAppMode.getData(O.miniAppMode.key(runtimeInput)) ?? false,
    walletAccounts,
    selectedAsset,
    recipientRequired,
    walletAddress,
    balance,
    order,
    resolvedOrder,
    quoteInput,
    quote,
    comparison,
    quoteValue,
    comparisonValues,
    submissionState,
    progressState,
    orderBlocker,
  };
};

export const selectNewIntentPrices = (input: NewIntentSelectorInput) =>
  deriveNewIntent(input).prices;

export const selectNewIntentMiniAppMode = (input: NewIntentSelectorInput) =>
  deriveNewIntent(input).miniAppMode;

export const selectNewIntentQuoteState = (input: NewIntentSelectorInput) =>
  deriveNewIntent(input).quote;

export const selectNewIntentComparisonState = (input: NewIntentSelectorInput) =>
  deriveNewIntent(input).comparison;

export const selectNewIntentOrderState = (input: NewIntentSelectorInput) =>
  deriveNewIntent(input).order;

export type NewIntentRouteProjection = Readonly<{
  originChainId: number | null;
  destinationChainIds: readonly number[];
  selectedAsset: Asset | null;
  availableChains: readonly Chain[];
  availableAssets: readonly Asset[];
  recipientRequired: boolean;
  walletAddress: string | null;
}>;

export const selectNewIntentRoute = (input: NewIntentSelectorInput): NewIntentRouteProjection => {
  const { effective, routes, selectedAsset, recipientRequired, walletAddress } =
    deriveNewIntent(input);
  return {
    originChainId: effective.originChainId,
    destinationChainIds: effective.destinationChainIds,
    selectedAsset,
    availableChains: routes?.chains ?? emptyChains,
    availableAssets: routes?.assets ?? emptyAssets,
    recipientRequired,
    walletAddress,
  };
};

export type NewIntentAmountProjection = Readonly<{
  amount: string;
  balance: PassiveResourceState<AssetBalance, ExplorerFailure> | null;
  isDebouncing: boolean;
  isQuoteLoading: boolean;
}>;

export const selectNewIntentAmount = ({
  state,
  ...input
}: NewIntentSelectorInput): NewIntentAmountProjection => {
  const { effective, balance, quote } = deriveNewIntent({ state, ...input });
  return {
    amount: effective.amount,
    balance,
    isDebouncing: state === NewIntent.S.DEBOUNCING,
    isQuoteLoading: quote?.activity === "fetching",
  };
};

export type NewIntentRecipientProjection = Readonly<{
  recipient: string;
  useRecipient: boolean;
  recipientRequired: boolean;
}>;

export const selectNewIntentRecipient = (
  input: NewIntentSelectorInput,
): NewIntentRecipientProjection => {
  const { effective, recipientRequired } = deriveNewIntent(input);
  return {
    recipient: effective.recipient,
    useRecipient: effective.useRecipient,
    recipientRequired,
  };
};

export const selectNewIntentInvoice = ({ memory }: NewIntentSelectorInput) => ({
  invoice: memory.invoice,
  lockedByInvoice: memory.invoice !== null,
});

export const selectNewIntentFastPath = ({ memory }: NewIntentSelectorInput) => {
  const effective = effectiveMemoryFrom(memory);
  return effective.outputAssetId !== null ? true : effective.fastPath;
};

export type NewIntentEstimateProjection = Readonly<{
  rows: readonly CompetitorEstimate[];
  loading: boolean;
  error: QuoteFailure | null;
}>;

export const selectNewIntentEstimates = ({
  state,
  ...input
}: NewIntentSelectorInput): NewIntentEstimateProjection => {
  const { quote, quoteValue, comparisonValues } = deriveNewIntent({ state, ...input });
  return {
    rows: estimateRowsFrom(quoteValue, comparisonValues),
    loading: state === NewIntent.S.DEBOUNCING || quote?.activity === "fetching",
    error: quote?.status === "failure" ? (quote.error ?? null) : null,
  };
};

export type NewIntentSubmissionProjection = Readonly<{
  state: PassiveTransactionState<SubmitReceipt, SubmitFailure> | null;
  progress: PassiveStreamState<SubmitFailure> | null;
  steps: readonly SubmissionStep[];
  error: SubmitFailure | null;
  submittedIntentId: string | null;
  isSubmitting: boolean;
}>;

export const selectNewIntentSubmission = ({
  state,
  ...input
}: NewIntentSelectorInput): NewIntentSubmissionProjection => {
  const { effective, submissionState, progressState } = deriveNewIntent({ state, ...input });
  return {
    state: submissionState,
    progress: progressState,
    steps: effective.lastSubmissionSteps,
    error: effective.submitError,
    submittedIntentId: effective.submittedIntentId,
    isSubmitting: state === NewIntent.S.SUBMITTING,
  };
};

export type NewIntentSubmitProjection = Readonly<{
  canSubmit: boolean;
  miniAppMode: boolean;
  orderBlocker: string | null;
  isSubmitting: boolean;
}>;

export const selectNewIntentSubmit = ({
  state,
  can,
  ...input
}: NewIntentSelectorInput): NewIntentSubmitProjection => {
  const { miniAppMode, orderBlocker } = deriveNewIntent({ state, can, ...input });
  return {
    canSubmit: can(NewIntent.E.SubmitRequested()),
    miniAppMode,
    orderBlocker,
    isSubmitting: state === NewIntent.S.SUBMITTING,
  };
};

export const selectNewIntentForm = ({ memory }: NewIntentSelectorInput) => {
  const effective = effectiveMemoryFrom(memory);
  return {
    originChainId: effective.originChainId,
    destinationChainIds: effective.destinationChainIds,
    inputAssetId: effective.inputAssetId,
    outputAssetId: effective.outputAssetId,
    amount: effective.amount,
    recipient: effective.recipient,
    useRecipient: effective.useRecipient,
    fastPath: effective.outputAssetId !== null ? true : effective.fastPath,
  };
};

export const selectIntentsFilters = ({ memory }: IntentsSelectorInput) => memory.filters;

const intentsPageFrom = ({ memory, O }: IntentsSelectorInput) => {
  const query = listQueryFrom(memory);
  const pageKey = O.intentPage.key(query);
  const page = O.intentPage.getState(pageKey);
  const previousKey = memory.previousQuery === null ? null : O.intentPage.key(memory.previousQuery);
  const previousPage = previousKey === null ? undefined : O.intentPage.getData(previousKey);
  const pageValue = O.intentPage.getData(pageKey);
  return { page, pageValue, previousPage };
};

export const selectIntentsRows = (input: IntentsSelectorInput) => {
  const { pageValue, previousPage } = intentsPageFrom(input);
  return pageValue?.rows ?? previousPage?.rows ?? emptyIntentRows;
};

export const selectIntentsShowingPreviousRows = (input: IntentsSelectorInput) => {
  const { pageValue, previousPage } = intentsPageFrom(input);
  return pageValue === undefined && previousPage !== undefined;
};

export const selectIntentsPagination = ({ memory, ...input }: IntentsSelectorInput) => {
  const { pageValue } = intentsPageFrom({ memory, ...input });
  return {
    nextCursor: pageValue?.nextCursor ?? null,
    canGoBack: memory.cursorHistory.length > 0,
  };
};

export const selectIntentsLabels = ({ O }: IntentsSelectorInput) =>
  O.addressLabels.getData(O.addressLabels.key(runtimeInput)) ?? emptyLabels;

export const selectIntentsLoading = (input: IntentsSelectorInput) =>
  intentsPageFrom(input).page.status === "loading";

export const selectIntentsRefreshing = ({ state, ...input }: IntentsSelectorInput) => {
  const { page } = intentsPageFrom({ state, ...input });
  return page.activity === "fetching" || state === Intents.S.REFRESHING;
};

export const selectIntentsFailure = (input: IntentsSelectorInput) => {
  const { page } = intentsPageFrom(input);
  return page.status === "failure" ? page.error : input.memory.refreshError;
};
