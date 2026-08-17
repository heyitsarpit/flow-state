import { Context, Stream, type Effect } from "effect";
import type {
  AddressLabels,
  AssetBalance,
  AssetPrices,
  CompetitorEstimate,
  ExplorerFailure,
  FiltersUrlQuery,
  IntentUrlQuery,
  IntentListQuery,
  IntentPage,
  Network,
  Order,
  QuoteFailure,
  QuoteInput,
  RouteConfig,
  RouteQuote,
  SubmitFailure,
  SubmitIntent,
  SubmitReceipt,
  SubmissionStep,
  WalletAccounts,
  WalletChange,
} from "./domain";

export type RequestOptions = Readonly<{ readonly signal: AbortSignal }>;

export class ExplorerApi extends Context.Service<
  ExplorerApi,
  {
    readonly routeConfig: (options: RequestOptions) => Effect.Effect<RouteConfig, ExplorerFailure>;
    readonly assetPrices: (options: RequestOptions) => Effect.Effect<AssetPrices, ExplorerFailure>;
    readonly orderById: (
      id: string,
      options: RequestOptions,
    ) => Effect.Effect<Order, ExplorerFailure>;
    readonly routeQuote: (
      input: QuoteInput,
      options: RequestOptions,
    ) => Effect.Effect<RouteQuote, QuoteFailure>;
    readonly competitorFees: (
      input: QuoteInput,
      options: RequestOptions,
    ) => Effect.Effect<readonly CompetitorEstimate[], ExplorerFailure>;
    readonly assetBalance: (
      account: string,
      assetId: string,
      options: RequestOptions,
    ) => Effect.Effect<AssetBalance, ExplorerFailure>;
    readonly intents: (
      query: IntentListQuery,
      options: RequestOptions,
    ) => Effect.Effect<IntentPage, ExplorerFailure>;
  }
>()("Everclear/ExplorerApi") {}

export class BrowserBridge extends Context.Service<
  BrowserBridge,
  {
    readonly currentWalletAccounts: (
      options: RequestOptions,
    ) => Effect.Effect<WalletAccounts, ExplorerFailure>;
    readonly walletChanges: Stream.Stream<WalletChange, ExplorerFailure>;
    readonly openWalletDialog: (
      network: Network,
      options: RequestOptions,
    ) => Effect.Effect<void, ExplorerFailure>;
    readonly miniAppMode: () => Effect.Effect<boolean>;
    readonly addressLabels: (
      options: RequestOptions,
    ) => Effect.Effect<AddressLabels, ExplorerFailure>;
    readonly replaceIntentUrl: (
      query: IntentUrlQuery,
      options: RequestOptions,
    ) => Effect.Effect<void, ExplorerFailure>;
    readonly replaceFiltersUrl: (
      query: FiltersUrlQuery,
      options: RequestOptions,
    ) => Effect.Effect<void, ExplorerFailure>;
  }
>()("Everclear/BrowserBridge") {}

export class IntentSubmitter extends Context.Service<
  IntentSubmitter,
  {
    readonly submit: (
      input: SubmitIntent,
      options: RequestOptions,
    ) => Effect.Effect<SubmitReceipt, SubmitFailure>;
    readonly progress: (
      submissionId: string,
      options: RequestOptions,
    ) => Stream.Stream<SubmissionStep, SubmitFailure>;
  }
>()("Everclear/IntentSubmitter") {}

// Layers provide these services at the runtime boundary; definitions and machines only see O.
