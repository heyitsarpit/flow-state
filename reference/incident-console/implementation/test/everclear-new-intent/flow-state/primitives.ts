import { Effect, Stream } from "effect";
import * as flow from "flow-state";
import { BrowserBridge, ExplorerApi, IntentSubmitter } from "./services";
import type {
  AssetBalanceLookup,
  FiltersUrlWriteInput,
  FiltersUrlQuery,
  IntentUrlQuery,
  IntentUrlWriteInput,
  IntentListQuery,
  Network,
  OrderLookup,
  QuoteInput,
  SubmitIntent,
  SubmissionProgressInput,
  WalletDialogInput,
} from "./domain";
import type { RequestOptions } from "./services";

export type RuntimeInput = Readonly<{ readonly scope: "runtime" }>;
export const runtimeInput: RuntimeInput = { scope: "runtime" };
export const intentsTag = flow.tag("everclear.intents");
type EmptyKey = readonly [];
const emptyKey = (_: RuntimeInput): EmptyKey => [];

export const routeConfig = flow.resource({
  id: "everclear.routes",
  key: emptyKey,
  lookup: (_: RuntimeInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).routeConfig(request);
    }),
  staleTime: "10 minutes",
  gcTime: "30 minutes",
});

export const assetPrices = flow.resource({
  id: "everclear.asset-prices",
  key: emptyKey,
  lookup: (_: RuntimeInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).assetPrices(request);
    }),
  staleTime: "1 minute",
  gcTime: "5 minutes",
});

export const orderById = flow.resource({
  id: "everclear.order",
  key: ({ orderId }: OrderLookup): readonly [string] => [orderId],
  lookup: ({ orderId }: OrderLookup, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).orderById(orderId, request);
    }),
  staleTime: "10 minutes",
});

type QuoteKey = readonly [
  number,
  readonly number[],
  string,
  string | null,
  string,
  string,
  string,
  string | null,
  boolean,
];

const quoteKey = (input: QuoteInput): QuoteKey => [
  input.originChainId,
  input.destinationChainIds,
  input.inputAssetId,
  input.outputAssetId,
  input.amountAtomic,
  input.from,
  input.to,
  input.orderId,
  input.fastPath,
];

export const routeQuote = flow.resource({
  id: "everclear.route-quote",
  key: quoteKey,
  lookup: (input: QuoteInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).routeQuote(input, request);
    }),
  staleTime: "5 minutes",
  gcTime: "5 minutes",
});

export const competitorFees = flow.resource({
  id: "everclear.competitor-fees",
  key: quoteKey,
  lookup: (input: QuoteInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).competitorFees(input, request);
    }),
  staleTime: "5 minutes",
});

export const assetBalance = flow.resource({
  id: "everclear.asset-balance",
  key: ({ account, assetId }: AssetBalanceLookup): readonly [string, string] => [account, assetId],
  lookup: (input: AssetBalanceLookup, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).assetBalance(input.account, input.assetId, request);
    }),
  staleTime: "15 seconds",
});

export const miniAppMode = flow.resource({
  id: "everclear.mini-app-mode",
  key: emptyKey,
  lookup: () =>
    Effect.gen(function* () {
      return yield* (yield* BrowserBridge).miniAppMode();
    }),
  staleTime: "24 hours",
  gcTime: Infinity,
});

export const addressLabels = flow.resource({
  id: "everclear.address-labels",
  key: emptyKey,
  lookup: (_: RuntimeInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* BrowserBridge).addressLabels(request);
    }),
  staleTime: "24 hours",
  gcTime: Infinity,
});

export const intentPage = flow.resource({
  id: "everclear.intent-page",
  key: (query: IntentListQuery): readonly [IntentListQuery["filters"], string | null, number] => [
    query.filters,
    query.cursor,
    query.limit,
  ],
  lookup: (query: IntentListQuery, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* ExplorerApi).intents(query, request);
    }),
  tags: () => [intentsTag],
  staleTime: "20 seconds",
  gcTime: "5 minutes",
});

export const walletAccounts = flow.resource({
  id: "everclear.wallet-accounts",
  key: emptyKey,
  lookup: (_: RuntimeInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* BrowserBridge).currentWalletAccounts(request);
    }),
  staleTime: "24 hours",
  gcTime: Infinity,
});

export const walletChanges = flow.stream({
  id: "everclear.wallet-changes",
  key: emptyKey,
  subscribe: (_: RuntimeInput, _request: RequestOptions) =>
    Stream.unwrap(Effect.map(BrowserBridge, (service) => service.walletChanges)),
});

export const openWalletDialog = flow.transaction({
  id: "everclear.open-wallet-dialog",
  key: ({ network }: WalletDialogInput): readonly [Network] => [network],
  commit: (input: WalletDialogInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* BrowserBridge).openWalletDialog(input.network, request);
    }),
  concurrency: "reject",
});

export const submitIntent = flow.transaction({
  id: "everclear.submit-intent",
  key: ({ submissionId }: SubmitIntent): readonly [string] => [submissionId],
  commit: (input: SubmitIntent, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* IntentSubmitter).submit(input, request);
    }),
  concurrency: "reject",
});

export const submissionProgress = flow.stream({
  id: "everclear.submission-progress",
  key: ({ submissionId }: SubmissionProgressInput): readonly [string] => [submissionId],
  subscribe: (input: SubmissionProgressInput, request: RequestOptions) =>
    Stream.unwrap(
      Effect.gen(function* () {
        return (yield* IntentSubmitter).progress(input.submissionId, request);
      }),
    ),
});

export const writeIntentUrl = flow.transaction({
  id: "everclear.write-intent-url",
  key: ({ query }: IntentUrlWriteInput): readonly [IntentUrlQuery] => [query],
  commit: (input: IntentUrlWriteInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* BrowserBridge).replaceIntentUrl(input.query, request);
    }),
  concurrency: "cancel",
});

export const writeFiltersUrl = flow.transaction({
  id: "everclear.write-filters-url",
  key: ({ query }: FiltersUrlWriteInput): readonly [FiltersUrlQuery] => [query],
  commit: (input: FiltersUrlWriteInput, request: RequestOptions) =>
    Effect.gen(function* () {
      return yield* (yield* BrowserBridge).replaceFiltersUrl(input.query, request);
    }),
  concurrency: "cancel",
});
