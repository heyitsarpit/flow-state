import * as flow from "flow-state";
import {
  accountForChain,
  buildActiveQuoteInput,
  buildSubmissionCandidate,
  emptyNewIntentMemory,
  effectiveNewIntentMemory,
  isDestinationSelectionAllowed,
  isOriginSelectionAllowed,
  makeIntentQuery,
  newIntentMemoryFrom,
  normalizeDestinations,
  requiresRecipient,
  type NewIntentInput,
  type NewIntentMemory,
  type InvoiceOverride,
  type QuoteFailure,
  type SubmitAcknowledgement,
  type SubmitFailure,
  type SubmissionStep,
  type WalletAccounts,
} from "../domain";
import {
  assetBalance,
  assetPrices,
  competitorFees,
  intentsTag,
  intentPage,
  miniAppMode,
  orderById,
  routeConfig,
  routeQuote,
  runtimeInput,
  submissionProgress,
  submitIntent,
  writeIntentUrl,
} from "../primitives";
import { Wallet } from "./wallet.machine";

export type UrlIntentInput = NewIntentInput;
type NewIntentDefinitionInput = Readonly<{ input: UrlIntentInput }>;

export const NewIntent = flow.definition({
  id: "Everclear/NewIntent",
  states: [
    "INACTIVE",
    {
      ACTIVE: [
        "EDITING",
        "DEBOUNCING",
        "QUOTE_ACTIVE",
        "SUBMITTING",
        "SUBMISSION_FAILED",
        "SUBMITTED",
      ],
    },
  ],
  context: {
    walletAccounts: Wallet.select(({ memory }) => memory.accounts),
  },
  events: {
    RouteEntered: (value: UrlIntentInput) => ({ value }),
    RouteLeft: null,
    OriginSelected: (chainId: number, assetId: string) => ({ chainId, assetId }),
    DestinationSelectionSaved: (chainIds: readonly number[], outputAssetId: string | null) => ({
      chainIds,
      outputAssetId,
    }),
    AmountChanged: (amount: string) => ({ amount }),
    RecipientChanged: (recipient: string) => ({ recipient }),
    RecipientModeChanged: (enabled: boolean) => ({ enabled }),
    FastPathChanged: (enabled: boolean) => ({ enabled }),
    InvoiceApplied: (invoice: InvoiceOverride) => ({ invoice }),
    InvoiceCleared: null,
    ResetRequested: null,
    SubmitRequested: null,
    WalletChanged: (accounts: WalletAccounts) => ({ accounts }),
    QuoteChanged: null,
    QuoteFailed: (error: QuoteFailure) => ({ error }),
    ProgressChanged: (step: SubmissionStep) => ({ step }),
    SubmitSucceeded: (receipt: SubmitAcknowledgement) => ({ receipt }),
    SubmitFailed: (error: SubmitFailure) => ({ error }),
    SubmitDefected: null,
    SubmitInterrupted: null,
  },
  memory: ({ input }: NewIntentDefinitionInput) => newIntentMemoryFrom(input),
  operations: {
    routeConfig,
    assetPrices,
    competitorFees,
    miniAppMode,
    orderById,
    assetBalance,
    routeQuote,
    intentPage,
    submitIntent,
    submissionProgress,
    writeIntentUrl,
  },
});

export const newIntentMachine = flow.machine(
  NewIntent,
  ({ S, E, O, onMemory, onContext, invalidate }) => {
    type NewIntentContext = Readonly<{ walletAccounts: WalletAccounts }>;
    type NewIntentUpdate = Partial<NewIntentMemory>;
    const userHydration = "user";
    const userEdit = (update: NewIntentUpdate = {}): NewIntentUpdate => ({
      hydration: userHydration,
      submissionInput: null,
      quoteError: null,
      submitError: null,
      ...update,
    });

    const quoteInputFrom = (memory: NewIntentMemory, context: NewIntentContext) => {
      const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
      const order =
        memory.orderIdFromUrl === null
          ? null
          : (O.orderById.getData(O.orderById.key({ orderId: memory.orderIdFromUrl })) ?? null);
      return routes === undefined
        ? null
        : buildActiveQuoteInput(memory, routes, context.walletAccounts, order);
    };

    onContext.select(
      ({ context }) => context.walletAccounts,
      ({ value, previous }) => (value === previous ? null : E.WalletChanged(value)),
    );

    const backgroundActivities = [
      O.routeConfig.subscribe(runtimeInput),
      O.assetPrices.subscribe(runtimeInput),
      O.miniAppMode.subscribe(runtimeInput),
      onMemory.select(
        ({ memory }) => memory.orderIdFromUrl,
        (orderId) => (orderId === null ? null : O.orderById.subscribe({ orderId })),
      ),
      onMemory(({ memory, context }) => {
        const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
        const effective = effectiveNewIntentMemory(memory);
        if (
          routes === undefined ||
          effective.originChainId === null ||
          effective.inputAssetId === null
        )
          return null;
        const account = accountForChain(routes, context.walletAccounts, effective.originChainId);
        return account === null
          ? null
          : O.assetBalance.subscribe({ account, assetId: effective.inputAssetId });
      }),
    ];

    const quoteActivities = [
      onMemory(({ memory, context }) => {
        const input = quoteInputFrom(memory, context);
        return input === null
          ? null
          : O.routeQuote.subscribe(input, {
              outcomes: {
                value: () => E.QuoteChanged(),
                failure: (error) => E.QuoteFailed(error),
              },
            });
      }),
      onMemory(({ memory, context }) => {
        const input = quoteInputFrom(memory, context);
        return input === null || input.outputAssetId !== null
          ? null
          : O.competitorFees.subscribe(input);
      }),
    ];

    const editTransitions = {
      OriginSelected: {
        target: S.ACTIVE.S.DEBOUNCING,
        guard: ({ memory, event }) => {
          const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
          return (
            routes !== undefined &&
            isOriginSelectionAllowed(memory, routes, event.chainId, event.assetId)
          );
        },
        updateMemory: ({ event }) =>
          userEdit({
            originChainId: event.chainId,
            inputAssetId: event.assetId,
            destinationChainIds: [],
            outputAssetId: null,
            recipient: "",
            useRecipient: false,
          }),
      },
      DestinationSelectionSaved: {
        target: S.ACTIVE.S.DEBOUNCING,
        guard: ({ memory, event }) => {
          const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
          return (
            routes !== undefined &&
            isDestinationSelectionAllowed(memory, routes, event.chainIds, event.outputAssetId)
          );
        },
        updateMemory: ({ memory, event }) => {
          const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
          const crossNetwork =
            routes !== undefined && requiresRecipient(routes, memory.originChainId, event.chainIds);
          return userEdit({
            destinationChainIds: normalizeDestinations(event.chainIds),
            outputAssetId: event.outputAssetId,
            useRecipient: crossNetwork ? true : memory.useRecipient,
          });
        },
      },
      AmountChanged: {
        target: S.ACTIVE.S.DEBOUNCING,
        guard: ({ memory }) => memory.invoice === null,
        updateMemory: ({ event }) => userEdit({ amount: event.amount }),
      },
      RecipientChanged: {
        target: S.ACTIVE.S.DEBOUNCING,
        updateMemory: ({ memory, event }) =>
          userEdit({
            recipient: event.recipient,
            useRecipient: memory.useRecipient || event.recipient.trim() !== "",
          }),
      },
      RecipientModeChanged: {
        target: S.ACTIVE.S.DEBOUNCING,
        updateMemory: ({ event }) =>
          event.enabled
            ? userEdit({ useRecipient: true })
            : userEdit({ useRecipient: false, recipient: "" }),
      },
      FastPathChanged: {
        target: S.ACTIVE.S.DEBOUNCING,
        updateMemory: ({ event }) => userEdit({ fastPath: event.enabled }),
      },
      InvoiceApplied: {
        target: S.ACTIVE.S.DEBOUNCING,
        updateMemory: ({ event }) => userEdit({ invoice: event.invoice }),
      },
      InvoiceCleared: {
        target: S.ACTIVE.S.DEBOUNCING,
        updateMemory: () => userEdit({ invoice: null }),
      },
      ResetRequested: {
        target: S.ACTIVE.S.DEBOUNCING,
        updateMemory: ({ memory }) => ({
          ...emptyNewIntentMemory(),
          hydration: memory.hydration === "pending" ? "user" : memory.hydration,
        }),
      },
    };

    const submitTransition = {
      target: S.ACTIVE.S.SUBMITTING,
      guard: ({ memory, context }) => {
        const input = quoteInputFrom(memory, context);
        if (input === null) return false;
        const quote = O.routeQuote.getData(O.routeQuote.key(input));
        return (
          quote !== undefined &&
          O.routeQuote.getState(O.routeQuote.key(input)).freshness === "fresh"
        );
      },
      updateMemory: ({ memory, context }) => {
        const input = quoteInputFrom(memory, context);
        const quote = input === null ? null : O.routeQuote.getData(O.routeQuote.key(input));
        const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
        return input === null || quote === undefined || routes === undefined
          ? { submissionInput: null }
          : {
              submissionInput: buildSubmissionCandidate(
                memory,
                routes,
                context.walletAccounts,
                null,
                () => quote,
              ),
              lastSubmissionSteps: [],
              submitError: null,
            };
      },
      actions: ({ memory, context }) => {
        const input = quoteInputFrom(memory, context);
        const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
        const quote = input === null ? null : O.routeQuote.getData(O.routeQuote.key(input));
        const submission =
          input === null || quote === undefined || routes === undefined
            ? null
            : buildSubmissionCandidate(memory, routes, context.walletAccounts, null, () => quote);
        return submission === null
          ? []
          : [
              O.submitIntent.commit(submission, {
                outcomes: {
                  success: (receipt) => E.SubmitSucceeded(receipt),
                  failure: (error) => E.SubmitFailed(error),
                  defect: () => E.SubmitDefected(),
                  interrupt: () => E.SubmitInterrupted(),
                },
              }),
            ];
      },
    };

    return {
      default: S.INACTIVE,
      states: {
        INACTIVE: {
          on: {
            RouteEntered: {
              target: S.ACTIVE.S.DEBOUNCING,
              updateMemory: ({ event }) => newIntentMemoryFrom(event.value),
            },
          },
        },
        ACTIVE: {
          default: S.ACTIVE.S.EDITING,
          activities: backgroundActivities,
          on: {
            RouteLeft: { target: S.INACTIVE },
            WalletChanged: {
              target: S.ACTIVE.S.DEBOUNCING,
              updateMemory: () => ({ submissionInput: null, quoteError: null, submitError: null }),
            },
          },
          states: {
            EDITING: { on: editTransitions },
            DEBOUNCING: {
              on: editTransitions,
              timers: { quote: { delay: "300 millis", target: S.ACTIVE.S.QUOTE_ACTIVE } },
            },
            QUOTE_ACTIVE: {
              activities: quoteActivities,
              on: {
                ...editTransitions,
                SubmitRequested: submitTransition,
                QuoteChanged: {
                  target: S.ACTIVE.S.QUOTE_ACTIVE,
                  updateMemory: () => ({ quoteError: null, submissionInput: null }),
                  actions: ({ memory }) => {
                    const routes = O.routeConfig.getData(O.routeConfig.key(runtimeInput));
                    return routes === undefined
                      ? []
                      : [O.writeIntentUrl.commit({ query: makeIntentQuery(memory, routes) })];
                  },
                },
                QuoteFailed: {
                  target: S.ACTIVE.S.QUOTE_ACTIVE,
                  updateMemory: ({ event }) => ({ quoteError: event.error }),
                },
              },
            },
            SUBMITTING: {
              activities: [
                onMemory.select(
                  ({ memory }) => memory.submissionInput?.submissionId ?? null,
                  (submissionId) =>
                    submissionId === null
                      ? null
                      : O.submissionProgress.subscribe(
                          { submissionId },
                          { outcomes: { value: (step) => E.ProgressChanged(step) } },
                        ),
                ),
              ],
              on: {
                ProgressChanged: {
                  target: S.ACTIVE.S.SUBMITTING,
                  updateMemory: ({ memory, event }) => ({
                    lastSubmissionSteps: [
                      ...memory.lastSubmissionSteps.filter((step) => step.id !== event.step.id),
                      event.step,
                    ],
                  }),
                },
                SubmitSucceeded: {
                  target: S.ACTIVE.S.SUBMITTED,
                  updateMemory: ({ event }) => ({
                    submittedIntentId: event.receipt.intentId,
                    submitError: null,
                  }),
                  actions: ({ memory }) =>
                    memory.submissionInput === null
                      ? []
                      : [
                          invalidate([
                            intentsTag,
                            [
                              O.assetBalance,
                              O.assetBalance.key({
                                account: memory.submissionInput.signer,
                                assetId: memory.submissionInput.inputAsset.id,
                              }),
                            ],
                          ]),
                        ],
                },
                SubmitFailed: {
                  target: S.ACTIVE.S.SUBMISSION_FAILED,
                  updateMemory: ({ event }) => ({
                    submissionInput: null,
                    submitError: event.error,
                  }),
                },
                SubmitDefected: {
                  target: S.ACTIVE.S.SUBMISSION_FAILED,
                  updateMemory: () => ({
                    submissionInput: null,
                    submitError: {
                      _tag: "SubmitFailure",
                      stage: "build",
                      retryable: false,
                      message: "Submission adapter defected.",
                    },
                  }),
                },
                SubmitInterrupted: {
                  target: S.ACTIVE.S.SUBMISSION_FAILED,
                  updateMemory: () => ({
                    submissionInput: null,
                    submitError: {
                      _tag: "SubmitFailure",
                      stage: "wallet",
                      retryable: true,
                      message: "Submission was interrupted.",
                    },
                  }),
                },
              },
            },
            SUBMISSION_FAILED: {
              activities: quoteActivities,
              on: { ...editTransitions, SubmitRequested: submitTransition },
              timers: {
                clearError: {
                  delay: "2500 millis",
                  target: S.ACTIVE.S.QUOTE_ACTIVE,
                  updateMemory: () => ({ submitError: null }),
                },
              },
            },
            SUBMITTED: { on: { ResetRequested: editTransitions.ResetRequested } },
          },
        },
      },
    };
  },
);
