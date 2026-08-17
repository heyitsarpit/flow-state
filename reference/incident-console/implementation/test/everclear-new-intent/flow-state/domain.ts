export type Network = "evm" | "svm" | "tvm";

export type Chain = Readonly<{
  id: number;
  name: string;
  network: Network;
}>;

export type Asset = Readonly<{
  id: string;
  symbol: string;
  decimals: number;
  chainId: number;
}>;

export type RouteConfig = Readonly<{
  chains: readonly Chain[];
  assets: readonly Asset[];
}>;

export type WalletAccounts = Readonly<{
  evm?: string;
  svm?: string;
  tvm?: string;
}>;
export type WalletChange =
  | Readonly<{ kind: "connected"; accounts: WalletAccounts }>
  | Readonly<{ kind: "disconnected" }>;
export type WalletMemory = Readonly<{
  accounts: WalletAccounts;
  lastError: ExplorerFailure | null;
}>;
export type AssetPrices = Readonly<Record<string, number>>;
export type AddressLabels = Readonly<Record<string, string>>;
export type AssetBalance = Readonly<{ amount: string; amountUsd: number }>;

export type OrderLookup = Readonly<{ orderId: string }>;
export type AssetBalanceLookup = Readonly<{ account: string; assetId: string }>;
export type WalletDialogInput = Readonly<{ network: Network }>;
export type SubmissionProgressInput = Readonly<{ submissionId: string }>;

export type QuoteInput = Readonly<{
  originChainId: number;
  destinationChainIds: readonly number[];
  inputAssetId: string;
  outputAssetId: string | null;
  amountAtomic: string;
  from: string;
  to: string;
  orderId: string | null;
  fastPath: boolean;
}>;

export type RouteQuote = Readonly<{
  quoteId: string;
  amountReceived: string;
  feeUsd: number;
  etaSeconds: number;
}>;

export type CompetitorEstimate = Readonly<{
  provider: string;
  feeUsd: number;
  etaSeconds: number;
}>;

export type Order = Readonly<{
  orderId: string;
  status: "open" | "expired" | "filled";
}>;

export type QuoteFailure = Readonly<{
  _tag: "QuoteFailure";
  code: "unsupported-route" | "insufficient-liquidity" | "transport";
  message: string;
}>;

export type SubmitIntent = Readonly<{
  submissionId: string;
  quoteId: string;
  quoteInput: QuoteInput;
  inputAsset: Asset;
  originNetwork: Network;
  signer: string;
  recipient: string;
  invoice: InvoiceOverride | null;
}>;

export type SubmitReceipt = Readonly<{
  intentId: string;
  transactionHash: string;
}>;

export type SubmitAcknowledgement = Readonly<{ intentId: string }>;

export type SubmitFailure = Readonly<{
  _tag: "SubmitFailure";
  stage: "build" | "wallet" | "broadcast" | "register";
  retryable: boolean;
  message: string;
}>;

export type SubmissionStep = Readonly<{
  id: string;
  label: string;
  status: "preparing" | "awaiting-wallet" | "broadcasting" | "registering" | "success" | "failure";
}>;

export type SubmissionOutcome =
  | Readonly<{ kind: "success"; receipt: SubmitReceipt }>
  | Readonly<{ kind: "failure"; error: SubmitFailure }>
  | Readonly<{ kind: "defect" }>
  | Readonly<{ kind: "interrupt" }>;

export type InvoiceOverride = Readonly<{
  invoiceId: string;
  originChainId: number;
  destinationChainIds: readonly number[];
  inputAssetId: string;
  amount: string;
}>;

export type IntentFilters = Readonly<{
  search: string;
  status: "all" | "pending" | "settled";
  userAddress: string | null;
}>;

export type IntentListQuery = Readonly<{
  filters: IntentFilters;
  cursor: string | null;
  limit: number;
}>;

export type IntentRow = Readonly<{
  id: string;
  user: string;
  status: "pending" | "settled";
  originChainId: number;
  destinationChainIds: readonly number[];
}>;

export type IntentPage = Readonly<{
  rows: readonly IntentRow[];
  nextCursor: string | null;
}>;

export type IntentsMemory = Readonly<{
  filters: IntentFilters;
  cursor: string | null;
  cursorHistory: readonly (string | null)[];
  previousQuery: IntentListQuery | null;
  refreshError: ExplorerFailure | null;
}>;

export const emptyIntentsMemory = (): IntentsMemory => ({
  filters: { search: "", status: "all", userAddress: null },
  cursor: null,
  cursorHistory: [],
  previousQuery: null,
  refreshError: null,
});

export const listQueryFrom = (memory: IntentsMemory): IntentListQuery => ({
  filters: memory.filters,
  cursor: memory.cursor,
  limit: 25,
});

export type ExplorerFailure = Readonly<{
  _tag: "ExplorerFailure";
  code: "transport" | "invalid-data";
  message: string;
}>;

export type NewIntentMemory = Readonly<{
  hydration: "pending" | "host" | "user";
  invoice: InvoiceOverride | null;
  originChainId: number | null;
  destinationChainIds: readonly number[];
  inputAssetId: string | null;
  outputAssetId: string | null;
  amount: string;
  recipient: string;
  useRecipient: boolean;
  fastPath: boolean;
  orderIdFromUrl: string | null;
  submissionInput: SubmitIntent | null;
  lastSubmissionSteps: readonly SubmissionStep[];
  quoteError: QuoteFailure | null;
  submitError: SubmitFailure | null;
  submittedIntentId: string | null;
}>;

export type NewIntentInput = Readonly<{
  originChainId: number | null;
  destinationChainIds: readonly number[];
  inputAssetId: string | null;
  outputAssetId: string | null;
  amount: string;
  recipient: string;
  orderId: string | null;
  fastPath: boolean;
}>;

type IntentUrlQueryDraft = {
  input?: string;
  output?: string;
  origin?: string;
  destinations?: string;
  amount?: string;
  toAddress?: string;
  order_id?: string;
};

export type IntentUrlQuery = Readonly<IntentUrlQueryDraft>;
export type FiltersUrlQuery = Readonly<{
  search: string;
  status: IntentFilters["status"];
  userAddress: string;
}>;
export type IntentUrlWriteInput = Readonly<{ query: IntentUrlQuery }>;
export type FiltersUrlWriteInput = Readonly<{ query: FiltersUrlQuery }>;

export const emptyNewIntentMemory = (): NewIntentMemory => ({
  hydration: "pending",
  invoice: null,
  originChainId: null,
  destinationChainIds: [],
  inputAssetId: null,
  outputAssetId: null,
  amount: "",
  recipient: "",
  useRecipient: false,
  fastPath: false,
  orderIdFromUrl: null,
  submissionInput: null,
  lastSubmissionSteps: [],
  quoteError: null,
  submitError: null,
  submittedIntentId: null,
});

export const emptyWalletMemory = (): WalletMemory => ({
  accounts: {},
  lastError: null,
});

export const newIntentMemoryFrom = (input: NewIntentInput): NewIntentMemory => ({
  ...emptyNewIntentMemory(),
  hydration: "host",
  originChainId: input.originChainId,
  destinationChainIds: normalizeDestinations(input.destinationChainIds),
  inputAssetId: input.inputAssetId,
  outputAssetId: input.outputAssetId,
  amount: input.amount,
  recipient: input.recipient,
  useRecipient: input.recipient !== "",
  orderIdFromUrl: input.orderId,
  fastPath: input.fastPath,
});

export const normalizeDestinations = (chainIds: readonly number[]): readonly number[] =>
  [...new Set(chainIds)].sort((left, right) => left - right);

export const isOriginSelectionAllowed = (
  memory: NewIntentMemory,
  routes: RouteConfig,
  chainId: number,
  assetId: string,
): boolean =>
  memory.invoice === null &&
  routes.assets.some((asset) => asset.id === assetId && asset.chainId === chainId);

export const isDestinationSelectionAllowed = (
  memory: NewIntentMemory,
  routes: RouteConfig,
  chainIds: readonly number[],
  outputAssetId: string | null,
): boolean => {
  if (memory.invoice !== null || chainIds.length === 0) return false;

  const selectedChains = chainIds.map((id) => routes.chains.find((chain) => chain.id === id));
  if (selectedChains.some((chain) => chain === undefined)) return false;

  if (outputAssetId !== null) {
    const outputAsset = routes.assets.find((asset) => asset.id === outputAssetId);
    if (chainIds.length !== 1 || outputAsset === undefined || outputAsset.chainId !== chainIds[0]) {
      return false;
    }
  }

  return new Set(selectedChains.map((chain) => chain?.network)).size === 1;
};

export const requiresRecipient = (
  routes: RouteConfig,
  originChainId: number | null,
  destinationChainIds: readonly number[],
): boolean => {
  const originNetwork = routes.chains.find((chain) => chain.id === originChainId)?.network;
  return (
    originNetwork !== undefined &&
    destinationChainIds.some(
      (chainId) => routes.chains.find((chain) => chain.id === chainId)?.network !== originNetwork,
    )
  );
};

export const effectiveNewIntentMemory = (memory: NewIntentMemory): NewIntentMemory =>
  memory.invoice === null
    ? memory
    : {
        ...memory,
        originChainId: memory.invoice.originChainId,
        destinationChainIds: normalizeDestinations(memory.invoice.destinationChainIds),
        inputAssetId: memory.invoice.inputAssetId,
        outputAssetId: null,
        amount: memory.invoice.amount,
      };

export const accountForChain = (
  routes: RouteConfig,
  wallets: WalletAccounts,
  chainId: number | null,
): string | null => {
  const network = routes.chains.find((chain) => chain.id === chainId)?.network;
  return network === undefined ? null : (wallets[network] ?? null);
};

export const buildQuoteInput = (
  memory: NewIntentMemory,
  routes: RouteConfig,
  wallets: WalletAccounts,
  resolvedOrder: Order | null,
): QuoteInput | null => {
  const effective = effectiveNewIntentMemory(memory);
  if (
    effective.originChainId === null ||
    effective.destinationChainIds.length === 0 ||
    effective.inputAssetId === null ||
    effective.amount.trim() === ""
  ) {
    return null;
  }

  const asset = routes.assets.find((candidate) => candidate.id === effective.inputAssetId);
  const from = accountForChain(routes, wallets, effective.originChainId);
  if (
    asset === undefined ||
    asset.chainId !== effective.originChainId ||
    from === null ||
    !/^\d+(\.\d+)?$/.test(effective.amount)
  )
    return null;

  if (effective.outputAssetId !== null) {
    const outputAsset = routes.assets.find((candidate) => candidate.id === effective.outputAssetId);
    if (
      effective.destinationChainIds.length !== 1 ||
      outputAsset === undefined ||
      outputAsset.chainId !== effective.destinationChainIds[0]
    )
      return null;
  }

  const [whole = "0", fraction = ""] = effective.amount.split(".");
  if (fraction.length > asset.decimals) return null;
  const amountAtomic = `${whole}${fraction.padEnd(asset.decimals, "0")}`.replace(/^0+(?=\d)/, "");
  if (amountAtomic === "0") return null;

  const to = effective.useRecipient ? effective.recipient.trim() : from;
  if (to === "") return null;

  const originNetwork = routes.chains.find(
    (chain) => chain.id === effective.originChainId,
  )?.network;
  const destinationNetworks = effective.destinationChainIds.map(
    (chainId) => routes.chains.find((chain) => chain.id === chainId)?.network,
  );
  if (
    originNetwork === undefined ||
    !destinationNetworks.every((network): network is Network => network !== undefined)
  ) {
    return null;
  }
  const crossNetwork = destinationNetworks.some((network) => network !== originNetwork);
  if (crossNetwork && !effective.useRecipient) return null;
  if (
    effective.useRecipient &&
    !destinationNetworks.every((network) => isValidAddress(network, to))
  ) {
    return null;
  }

  return {
    originChainId: effective.originChainId,
    destinationChainIds: normalizeDestinations(effective.destinationChainIds),
    inputAssetId: effective.inputAssetId,
    outputAssetId: effective.outputAssetId,
    amountAtomic,
    from,
    to,
    orderId: resolvedOrder?.orderId ?? null,
    fastPath: effective.outputAssetId !== null ? true : effective.fastPath,
  };
};

export const buildActiveQuoteInput = (
  memory: NewIntentMemory,
  routes: RouteConfig,
  wallets: WalletAccounts,
  resolvedOrder: Order | null,
): QuoteInput | null =>
  resolvedOrder !== null && resolvedOrder.status !== "open"
    ? null
    : buildQuoteInput(memory, routes, wallets, resolvedOrder);

export const buildSubmitIntent = (
  memory: NewIntentMemory,
  routes: RouteConfig,
  input: QuoteInput,
  quote: RouteQuote,
): SubmitIntent | null => {
  const inputAsset = routes.assets.find((asset) => asset.id === input.inputAssetId);
  const originNetwork = routes.chains.find((chain) => chain.id === input.originChainId)?.network;
  if (inputAsset === undefined || originNetwork === undefined) return null;

  return {
    submissionId: quote.quoteId,
    quoteId: quote.quoteId,
    quoteInput: input,
    inputAsset,
    originNetwork,
    signer: input.from,
    recipient: input.to,
    invoice: memory.invoice,
  };
};

export const buildSubmissionCandidate = (
  memory: NewIntentMemory,
  routes: RouteConfig,
  wallets: WalletAccounts,
  resolvedOrder: Order | null,
  resolveFreshQuote: (input: QuoteInput) => RouteQuote | null,
): SubmitIntent | null => {
  const input = buildActiveQuoteInput(memory, routes, wallets, resolvedOrder);
  if (input === null) return null;
  const quote = resolveFreshQuote(input);
  return quote === null ? null : buildSubmitIntent(memory, routes, input, quote);
};

export const isValidAddress = (network: Network, address: string): boolean => {
  switch (network) {
    case "evm":
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    case "svm":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    case "tvm":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  }
};

export const makeIntentQuery = (memory: NewIntentMemory, routes: RouteConfig): IntentUrlQuery => {
  const effective = effectiveNewIntentMemory(memory);
  const input = routes.assets.find((asset) => asset.id === effective.inputAssetId)?.symbol;
  const output = routes.assets.find((asset) => asset.id === effective.outputAssetId)?.symbol;
  const query: IntentUrlQueryDraft = {};
  const setQueryValue = (
    key: keyof IntentUrlQueryDraft,
    value: string | null | undefined,
  ): void => {
    if (value !== undefined && value !== null && value !== "") query[key] = value;
  };

  setQueryValue("input", input);
  setQueryValue("output", output);
  setQueryValue("origin", effective.originChainId?.toString());
  setQueryValue("destinations", effective.destinationChainIds.join(" "));
  setQueryValue("amount", effective.amount);
  setQueryValue("toAddress", effective.recipient);
  setQueryValue("order_id", effective.orderIdFromUrl);
  return query;
};

export const makeFiltersUrlQuery = (filters: IntentFilters): FiltersUrlQuery => ({
  search: filters.search,
  status: filters.status,
  userAddress: filters.userAddress ?? "",
});

// Destination order is normalized before resource keys are built; preserve order only if product
// semantics make it meaningful.
