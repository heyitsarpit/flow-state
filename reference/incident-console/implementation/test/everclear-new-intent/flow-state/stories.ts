import { Effect, Layer } from "effect";
import { control, fixture, story } from "flow-state/testing";
import type {
  Asset,
  ExplorerFailure,
  IntentFilters,
  IntentListQuery,
  IntentPage,
  Network,
  NewIntentInput,
  QuoteFailure,
  QuoteInput,
  RouteConfig,
  RouteQuote,
  SubmissionStep,
  SubmitFailure,
  SubmitIntent,
  SubmitReceipt,
  WalletAccounts,
} from "./domain";
import { EverclearIntentsRef, EverclearWalletRef } from "./app";
import { Intents, NewIntent, Wallet, newIntentMachine } from "./machines";
import {
  addressLabels,
  assetPrices,
  miniAppMode,
  routeConfig,
  runtimeInput,
  walletAccounts,
} from "./primitives";
import { BrowserBridge, ExplorerApi, IntentSubmitter } from "./services";
import { createEverclearRuntime } from "./runtime-boundary";

const quoteOperation = control.effect<readonly [QuoteInput], RouteQuote, QuoteFailure>({
  id: "EverclearApi.routeQuote",
});
const submitOperation = control.effect<readonly [SubmitIntent], SubmitReceipt, SubmitFailure>({
  id: "EverclearApi.submitIntent",
});
const intentPageOperation = control.effect<readonly [IntentListQuery], IntentPage, ExplorerFailure>(
  {
    id: "EverclearApi.intents",
  },
);
const walletAccountsOperation = control.effect<readonly [], WalletAccounts, ExplorerFailure>({
  id: "EverclearHost.currentWalletAccounts",
});
const walletChangesStream = control.stream<void, ExplorerFailure>({
  id: "EverclearHost.walletChanges",
});
const openWalletOperation = control.effect<readonly [Network], void, ExplorerFailure>({
  id: "EverclearHost.openWalletDialog",
});
const submissionProgressStream = control.stream<SubmissionStep, SubmitFailure>({
  id: "EverclearSubmitter.progress",
});

type SuccessObservation<Value> = Readonly<{
  occurrence: number;
  type: "success";
  value: Value;
}>;

type ValueObservation<Value> = Readonly<{
  occurrence: number;
  type: "value";
  value: Value;
}>;

type EmissionObservation<Value> = Readonly<{
  occurrence: number;
  type: "emission";
  value: Value;
}>;

const ethereumUsdc = {
  id: "eth-usdc",
  symbol: "USDC",
  decimals: 6,
  chainId: 1,
} satisfies Asset;

const solanaUsdc = {
  id: "sol-usdc",
  symbol: "USDC",
  decimals: 6,
  chainId: 1399811149,
} satisfies Asset;

const routes = {
  chains: [
    { id: 1, name: "Ethereum", network: "evm" },
    { id: 10, name: "Optimism", network: "evm" },
    { id: 1399811149, name: "Solana", network: "svm" },
  ],
  assets: [ethereumUsdc, solanaUsdc],
} satisfies RouteConfig;

const connectedWallets = {
  evm: "0x1111111111111111111111111111111111111111",
  svm: "11111111111111111111111111111111",
} satisfies WalletAccounts;

const quoteForAmount10: QuoteInput = {
  originChainId: 1,
  destinationChainIds: [1399811149],
  inputAssetId: "eth-usdc",
  outputAssetId: null,
  amountAtomic: "10000000",
  from: connectedWallets.evm,
  to: connectedWallets.svm,
  orderId: null,
  fastPath: false,
};

const quoteForAmount12: QuoteInput = {
  ...quoteForAmount10,
  amountAtomic: "12000000",
};

const submitForQuote12: SubmitIntent = {
  submissionId: "quote-12",
  quoteId: "quote-12",
  quoteInput: quoteForAmount12,
  inputAsset: ethereumUsdc,
  originNetwork: "evm",
  signer: connectedWallets.evm,
  recipient: connectedWallets.svm,
  invoice: null,
};

const initialIntentFilters = {
  search: "",
  status: "all",
  userAddress: "0xabc",
} satisfies IntentFilters;

const filteredIntentFilters = {
  search: "0xintenthash",
  status: "all",
  userAddress: "0xabc",
} satisfies IntentFilters;

const initialIntentQuery: IntentListQuery = {
  filters: initialIntentFilters,
  cursor: null,
  limit: 25,
};

const secondIntentPageQuery: IntentListQuery = {
  filters: initialIntentFilters,
  cursor: "page-2",
  limit: 25,
};

const filteredIntentQuery: IntentListQuery = {
  filters: filteredIntentFilters,
  cursor: null,
  limit: 25,
};

const staleQuoteObservation: ValueObservation<RouteQuote> = {
  occurrence: 1,
  type: "value",
  value: {
    quoteId: "quote-10-late",
    amountReceived: "9.98",
    feeUsd: 0.02,
    etaSeconds: 90,
  },
};

const quoteForAmount12Observation: ValueObservation<RouteQuote> = {
  occurrence: 1,
  type: "value",
  value: {
    quoteId: "quote-12",
    amountReceived: "11.98",
    feeUsd: 0.02,
    etaSeconds: 90,
  },
};

const quoteForAmount10Observation: ValueObservation<RouteQuote> = {
  occurrence: 1,
  type: "value",
  value: {
    quoteId: "quote-10",
    amountReceived: "9.98",
    feeUsd: 0.02,
    etaSeconds: 90,
  },
};

const walletConfirmationObservation: EmissionObservation<SubmissionStep> = {
  occurrence: 1,
  type: "emission",
  value: {
    id: "wallet",
    label: "Confirm in wallet",
    status: "awaiting-wallet",
  },
};

const submittedReceiptObservation: SuccessObservation<SubmitReceipt> = {
  occurrence: 1,
  type: "success",
  value: {
    intentId: "intent-1",
    transactionHash: "0xtransaction",
  },
};

const walletDialogOpenedObservation: SuccessObservation<void> = {
  occurrence: 1,
  type: "success",
  value: undefined,
};

const initialIntentPageObservation: ValueObservation<IntentPage> = {
  occurrence: 1,
  type: "value",
  value: {
    rows: [
      {
        id: "intent-1",
        user: "0xabc",
        status: "pending",
        originChainId: 1,
        destinationChainIds: [10],
      },
    ],
    nextCursor: "page-2",
  },
};

const emptyIntentPageObservation: ValueObservation<IntentPage> = {
  occurrence: 1,
  type: "value",
  value: { rows: [], nextCursor: null },
};

const exampleFixture = fixture({
  id: "everclear.example.fixture",
  controls: [
    quoteOperation,
    submitOperation,
    intentPageOperation,
    walletAccountsOperation,
    walletChangesStream,
    openWalletOperation,
    submissionProgressStream,
  ],
  seeds: [
    { resource: routeConfig, key: routeConfig.key(runtimeInput), value: routes },
    {
      resource: assetPrices,
      key: assetPrices.key(runtimeInput),
      value: { "eth-usdc": 1, "sol-usdc": 1 },
    },
    { resource: miniAppMode, key: miniAppMode.key(runtimeInput), value: false },
    {
      resource: addressLabels,
      key: addressLabels.key(runtimeInput),
      value: { "0xabc": "My wallet" },
    },
    { resource: walletAccounts, key: walletAccounts.key(runtimeInput), value: connectedWallets },
  ],
  layer: ({ control }) =>
    Layer.mergeAll(
      Layer.succeed(ExplorerApi, {
        routeConfig: () => Effect.succeed(routes),
        assetPrices: () => Effect.succeed({ "eth-usdc": 1, "sol-usdc": 1 }),
        orderById: (orderId) => Effect.succeed({ orderId, status: "open" }),
        routeQuote: control.effect(quoteOperation),
        competitorFees: () => Effect.succeed([]),
        assetBalance: () => Effect.succeed({ amount: "1000", amountUsd: 1000 }),
        intents: control.effect(intentPageOperation),
      }),
      Layer.succeed(BrowserBridge, {
        currentWalletAccounts: control.effect(walletAccountsOperation),
        walletChanges: control.stream(walletChangesStream),
        openWalletDialog: control.effect(openWalletOperation),
        miniAppMode: () => Effect.succeed(false),
        addressLabels: () => Effect.succeed({ "0xabc": "My wallet" }),
        replaceIntentUrl: () => Effect.void,
        replaceFiltersUrl: () => Effect.void,
      }),
      Layer.succeed(IntentSubmitter, {
        submit: control.effect(submitOperation),
        progress: () => control.stream(submissionProgressStream),
      }),
    ),
});

const walletRef = EverclearWalletRef;
const intentsRef = EverclearIntentsRef;

const initialNewIntentInput = {
  originChainId: 1,
  destinationChainIds: [1399811149],
  inputAssetId: "eth-usdc",
  outputAssetId: null,
  amount: "",
  recipient: connectedWallets.svm,
  orderId: null,
  fastPath: false,
} satisfies NewIntentInput;

const quotedNewIntentInput = {
  ...initialNewIntentInput,
  amount: "10",
} satisfies NewIntentInput;

// This recipe is inert until a Story run materializes it through the production runtime.
const newIntentRecipe = story.actor(newIntentMachine, {
  input: initialNewIntentInput,
  contextBindings: { walletAccounts: walletRef },
});

export const walletConnectStory = story
  .app(createEverclearRuntime, {
    fixtures: [exampleFixture],
    maxTurns: 100,
    title: "wallet actor observes providers and opens the requested connector",
  })
  .send(walletRef, Wallet.E.ConnectRequested("svm"))
  .process()
  .simulate(
    walletRef,
    Wallet.O.openWalletDialog.commit({ network: "svm" }),
    walletDialogOpenedObservation,
  )
  .process()
  .checkpoint("connector-opened");

export const crossNetworkIntentStory = story
  .app(createEverclearRuntime, {
    fixtures: [exampleFixture],
    maxTurns: 100,
    title: "cross-network amount debounce, quote replacement, and managed submission",
  })
  .send(walletRef, Wallet.E.ProviderChanged(connectedWallets))
  .process()
  .send(newIntentRecipe, NewIntent.E.RouteEntered(initialNewIntentInput))
  .process()
  .send(newIntentRecipe, NewIntent.E.AmountChanged("9"))
  .advance("299 millis")
  .checkpoint("before-debounce")
  .send(newIntentRecipe, NewIntent.E.AmountChanged("10"))
  .advanceToNextTimer()
  .process()
  .send(newIntentRecipe, NewIntent.E.AmountChanged("12"))
  .advance("300 millis")
  .process()
  .simulate(
    newIntentRecipe,
    NewIntent.O.routeQuote.subscribe(quoteForAmount10),
    staleQuoteObservation,
  )
  .process()
  .checkpoint("stale-quote-ignored")
  .simulate(
    newIntentRecipe,
    NewIntent.O.routeQuote.subscribe(quoteForAmount12),
    quoteForAmount12Observation,
  )
  .process()
  .checkpoint("quote-ready")
  .send(newIntentRecipe, NewIntent.E.SubmitRequested())
  .process()
  .simulate(
    newIntentRecipe,
    NewIntent.O.submissionProgress.subscribe({ submissionId: "quote-12" }),
    walletConfirmationObservation,
  )
  .process()
  .checkpoint("wallet-confirmation")
  .simulate(
    newIntentRecipe,
    NewIntent.O.submitIntent.commit(submitForQuote12),
    submittedReceiptObservation,
  )
  .process()
  .checkpoint("submitted");

export const filteredIntentsStory = story
  .app(createEverclearRuntime, {
    fixtures: [exampleFixture],
    maxTurns: 100,
    title: "filter changes replace the cursor-bound intent subscription",
  })
  .send(intentsRef, Intents.E.RouteEntered(initialIntentFilters))
  .process()
  .simulate(
    intentsRef,
    Intents.O.intentPage.subscribe(initialIntentQuery),
    initialIntentPageObservation,
  )
  .process()
  .send(intentsRef, Intents.E.NextPageRequested("page-2"))
  .process()
  .simulate(
    intentsRef,
    Intents.O.intentPage.subscribe(secondIntentPageQuery),
    emptyIntentPageObservation,
  )
  .process()
  .send(intentsRef, Intents.E.FiltersChanged(filteredIntentFilters))
  .process()
  .simulate(
    intentsRef,
    Intents.O.intentPage.subscribe(filteredIntentQuery),
    emptyIntentPageObservation,
  )
  .process()
  .checkpoint("filtered-first-page");

export const focusedNewIntentStory = story
  .machine(newIntentMachine, {
    input: quotedNewIntentInput,
    context: { walletAccounts: connectedWallets },
    fixtures: [exampleFixture],
    maxTurns: 100,
    title: "focused new-intent actor reaches a quote through production operations",
  })
  .send(NewIntent.E.RouteEntered(quotedNewIntentInput))
  .process()
  .advanceToNextTimer()
  .process()
  .simulate(NewIntent.O.routeQuote.subscribe(quoteForAmount10), quoteForAmount10Observation)
  .process()
  .checkpoint("quote-ready");

// Pure model discovery may consume only this command-empty, fresh machine plan. It must not accept
// an app Story because app Stories prove actual production orchestration across exact actors.
export const pureNewIntentModelPlan = story.machine(newIntentMachine, {
  input: initialNewIntentInput,
  context: { walletAccounts: connectedWallets },
  fixtures: [exampleFixture],
  maxTurns: 100,
  title: "fresh new-intent plan reserved for pure transition model discovery",
});

// Evidence reads are intentionally post-run reads of frozen atomic captures, never live actor
// handles. `run.end` is automatic and does not assert that the actor reached a terminal state.
export const readCrossNetworkIntentEvidence = async () => {
  const run = await crossNetworkIntentStory.run();

  return {
    quoteReady: run.checkpoints["quote-ready"].actor(newIntentRecipe).snapshot,
    submitted: run.checkpoints.submitted.actor(newIntentRecipe).snapshot,
    end: {
      actor: run.end.actor(newIntentRecipe).snapshot,
      now: run.end.runtime.now,
      pendingWork: run.end.runtime.pendingWork,
    },
  };
};

export const readWalletConnectEvidence = async () => {
  const run = await walletConnectStory.run();

  return {
    checkpoint: run.checkpoints["connector-opened"].actor(walletRef).snapshot,
    end: run.end.actor(walletRef).snapshot,
    runtime: run.end.runtime,
  };
};
