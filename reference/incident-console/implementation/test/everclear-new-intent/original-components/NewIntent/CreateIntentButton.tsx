import { useAppKit } from "@reown/appkit/react";
import { otcIntentCreated } from "@repo/api/services";
import type { GetRouteQuotesResponse } from "@repo/api/types";
import { Button } from "@repo/design/Button";
import * as Dialog from "@repo/design/Dialog";
import { Loader } from "@repo/design/icons/Loader";
import { Text } from "@repo/design/Text";
import type { Network } from "@repo/lib/Chains";
import { executeTransaction as executeEVMTransaction } from "@repo/lib/EVM/executeTransaction";
import { getDisplaySymbol } from "@repo/lib/Assets";
import { printNumber } from "@repo/lib/print";
import { repeatedInterval } from "@repo/lib/repeatedInterval";
import { executeTransaction as executeSVMTransaction } from "@repo/lib/SVM/executeTransaction";
import type { SVMWallet } from "@repo/lib/SVM/useSVMWallet";
import { useSVMConnection, useSVMWallet } from "@repo/lib/SVM/useSVMWallet";
import { executeTransaction as executeTVMTransaction } from "@repo/lib/TVM/executeTransaction";
import { useTVMWallet } from "@repo/lib/TVM/useTVMWallet";
import { TrxProgress } from "@repo/design/transactions/TransactionProgress";
import type { Step } from "@repo/lib/transactions/types";
import { useTransactionStatus } from "@repo/design/transactions/useTransactionStatus";
import type { PublicKey } from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import { produce } from "immer";
import { usePostHog } from "posthog-js/react";
import { useState } from "react";
import { parseUnits } from "viem";
import { useShallow } from "zustand/react/shallow";
import { buildTransaction as buildEVMTransaction } from "~/components/NewIntent/buildTransaction";
import { buildTransaction as buildTVMTransaction } from "~/components/NewIntent/buildTVMTransaction";
import { wagmiConfig } from "~/config/wagmi";
import { Telemetry } from "~/utils/Telemetry";
import { useAssetBalances } from "~/utils/useAssetBalances";
import { useOrder } from "../Orders/useOrder";
import { useNetwork } from "../Wallets/useNetwork";
import { useSVMWalletDialog, useTVMWalletDialog } from "../Wallets/useWalletDialogs";
import * as SVM from "./buildSVMTransaction";
import { toUserMessage } from "./apiErrors";
import { isFastPathAvailable } from "./isFastPathAvailable";
import { useInputState } from "./useInputState";
import { useIntentNotification } from "./useIntentNotification";
import type { State as InputState } from "./useInputState";

type CreateIntentButtonProps = {
  routeFees: GetRouteQuotesResponse | null | undefined;
  amount: InputState["amount"];
  inputAsset: InputState["inputAsset"];
  originChain: InputState["origin"];
  originNetwork: InputState["originNetwork"];
  destinations: InputState["destinations"];
  toAddress: InputState["toAddress"];
  useToAddress: InputState["useToAddress"];
  validation: InputState["validation"];
  orderIdURL: InputState["orderIdURL"];
  requestFastPath: InputState["requestFastPath"];
  isSwap: boolean;
  outputAssetAddress: string | undefined;
  userAddress: string | undefined;
  invoice: InputState["invoice"];
  isMiniAppMode: boolean;
};

export function CreateIntentButton({
  routeFees,
  amount,
  inputAsset,
  originChain,
  originNetwork,
  destinations,
  toAddress,
  useToAddress,
  validation,
  orderIdURL,
  requestFastPath,
  isSwap,
  outputAssetAddress,
  userAddress,
  invoice,
  isMiniAppMode,
}: CreateIntentButtonProps) {
  const networks = useNetwork();
  const [showSurvey, setShowSurvey] = useState(false);
  const posthog = usePostHog();
  const { connection } = useSVMConnection();
  const svmWallet = useSVMWallet();
  const tvmWallet = useTVMWallet();

  const openEVMDialog = useAppKit().open;
  const openTVMDialog = useTVMWalletDialog(useShallow((s) => s.open));
  const openSVMDialog = useSVMWalletDialog(useShallow((s) => s.open));

  const refetchBalances = useAssetBalances().refetchBalances;

  const { data: order, error: orderError, isLoading: isOrderLoading } = useOrder(orderIdURL);

  const isOrderExpired = order?.expires_at ? order.expires_at < Date.now() : false;
  const isOrderFilled = !!order?.transaction_hash;

  const notEnoughData =
    !amount ||
    Number(amount) === 0 ||
    !destinations ||
    !originChain ||
    !originNetwork ||
    !inputAsset ||
    (useToAddress ? !toAddress : !userAddress);

  const [isDialogOpen, setDialogOpen] = useState(false);

  const createIntent = useMutation({
    mutationFn: async () => {
      if (notEnoughData) throw new Error("data not found");
      if (!originNetwork) throw new Error("network not found");
      if (orderError) throw new Error("Order not found");
      if (isOrderExpired) throw new Error("Order expired");
      if (isOrderFilled) throw new Error("Order already filled");

      posthog.capture(Telemetry.CreateIntent.Started);

      const store = useTransactionStatus;

      const startUI = (steps: Step[]) => {
        if (store.getState().isPending) throw new Error("transaction already pending");

        setDialogOpen(true);

        store.getState().startTransaction({
          steps,
          onTransactionSuccess: (txHash) => {
            setShowSurvey(true);
            posthog.capture(Telemetry.CreateIntent.Success);

            if (txHash) {
              useIntentNotification.getState().addTransaction(txHash);
            }

            if (order && txHash) {
              otcIntentCreated({
                body: {
                  order_id: order.order_id,
                  transaction_hash: txHash,
                },
              });
            }
          },
          onTransactionError: () => {
            posthog.capture(Telemetry.CreateIntent.Error);
          },
          onTransactionComplete: () => {
            refetchBalances();
          },
        });
      };

      switch (originNetwork) {
        case "evm": {
          const steps = await buildEVMTransaction({
            amount: parseUnits(amount, inputAsset.contract.decimals),
            toAddress: (toAddress ?? userAddress) as `0x${string}`,
            asset: inputAsset,
            destinations,
            origin: Number(originChain),
            callData: "",
            orderId: order?.order_id,
            isFastPath: isSwap ? true : isFastPathAvailable(routeFees) && requestFastPath,
            outputAsset: outputAssetAddress,
            invoicePurchaseOverride: invoice,
          });

          startUI(steps);

          return executeEVMTransaction({
            steps,
            notify: store.getState().updateStep,
            wagmiConfig,
          });
        }

        case "svm": {
          if (!svmWallet.publicKey || !connection) throw new Error("SVM wallet not connected");

          const args: SVM.BuildIntentArgs = {
            connection,
            wallet: svmWallet as SVMWallet & { publicKey: PublicKey },
            amount: parseUnits(amount, inputAsset.contract.decimals),
            toAddress: (toAddress ?? userAddress) as `0x${string}`,
            asset: inputAsset,
            destinations,
            origin: Number(originChain),
            callData: "",
            orderId: order?.order_id,
            isFastPath: isSwap ? true : isFastPathAvailable(routeFees) && requestFastPath,
            outputAsset: outputAssetAddress,
          };

          const { exists, data: newIntentCalldata } = await SVM.checkLookupTableExists(args);

          if (exists && newIntentCalldata) {
            const steps = [await SVM.buildNewIntentStep(args, newIntentCalldata)];
            startUI(steps);

            return executeSVMTransaction({
              steps: steps,
              notify: store.getState().updateStep,
              connection,
              wallet: svmWallet,
            });
          }

          const lktStep = await SVM.buildLookupTableStep(args);
          const newIntentStep = SVM.buildNewIntentDummyStep(args);

          startUI([lktStep, newIntentStep]);

          executeSVMTransaction({
            steps: [lktStep],
            notify: store.getState().updateStep,
            connection,
            wallet: svmWallet,
          });

          function startNewIntentTrxFlow() {
            const prepStep = store.getState().patchStep(
              newIntentStep.id,
              produce(newIntentStep, (d) => {
                d.meta.status = "preparing";
              }),
            );

            const poller = repeatedInterval({
              fn: async () => {
                try {
                  const { data } = await SVM.buildNewIntentStep(args);

                  const finalStep = store.getState().patchStep(
                    prepStep.id,
                    produce(prepStep, (d) => {
                      d.data = data;
                    }),
                  );

                  await executeSVMTransaction({
                    steps: [finalStep],
                    notify: store.getState().updateStep,
                    connection,
                    wallet: svmWallet,
                  });

                  poller.cancel(); // done
                } catch (err) {
                  console.log("LUT not ready, retrying …", err);
                }
              },
              times: 40, // maxAttempts
              seconds: 5, // intervalSeconds
            });
          }

          const unsubscribe = store.subscribe((state) => {
            const updatedLktStep = state.steps.find((s) => s.id === lktStep.id);

            if (!updatedLktStep) {
              unsubscribe();
              throw new Error("lktStepStatus not found");
            }

            switch (updatedLktStep.meta.status) {
              case "success": {
                unsubscribe();
                startNewIntentTrxFlow();
                break;
              }

              case "failed": {
                unsubscribe();
                break;
              }
            }
          });

          return;
        }

        case "tvm": {
          const steps = await buildTVMTransaction({
            amount: parseUnits(amount, inputAsset.contract.decimals),
            toAddress: (toAddress ?? userAddress) as `0x${string}`,
            asset: inputAsset,
            destinations,
            origin: Number(originChain),
            callData: "",
            wallet: tvmWallet,
            orderId: order?.order_id,
          });

          startUI(steps);

          return executeTVMTransaction({
            steps,
            notify: store.getState().updateStep,
            wallet: tvmWallet,
          });
        }

        default: {
          originNetwork satisfies never;
          throw new Error("network not supported yet");
        }
      }
    },

    onError: (err) => {
      console.error("Failed to build transaction:", err);
      const errorMessage = toUserMessage(err, "Build transaction failed. Please try again.");

      useInputState.getState().setBuildTrxError(true, errorMessage);
      setTimeout(() => {
        useInputState.getState().setBuildTrxError(false, undefined);
      }, 2500);
    },
  });

  const [isTransactionPending, isTransactionSuccess] = useTransactionStatus(
    useShallow((s) => [s.isPending, s.isSuccess]),
  );

  const isCreateIntentDisabled =
    createIntent.isPending ||
    notEnoughData ||
    validation.isAboveMaxCap ||
    validation.isBelowMinCap ||
    !validation.isValidToAddress ||
    validation.hasQuoteError ||
    isOrderLoading ||
    isOrderExpired ||
    isOrderFilled;

  const buildErrorMessage =
    validation.errorMessage ?? "Build transaction failed. Please try again.";

  const createIntentButtonLabel = validation.isBuildTrxError ? (
    buildErrorMessage
  ) : createIntent.isPending ? (
    <div className="flex items-center justify-center gap-1">
      Building Transaction <Loader fill="currentColor" className="h-4 w-4" />
    </div>
  ) : isOrderExpired ? (
    "Order Expired. Please request a new order."
  ) : isOrderFilled ? (
    "Order Already Filled. Please request a new order."
  ) : isMiniAppMode ? (
    "Bridge Funds"
  ) : (
    "Create Intent"
  );

  /** Is Connected To Correct Network */
  const isConnected = originNetwork
    ? networks[originNetwork].isConnected
    : Object.values(networks).some((n) => n.isConnected);

  function openWalletDialog() {
    if (!originNetwork) throw new Error("network not found");

    const open: Record<Network, () => void> = {
      evm: openEVMDialog,
      svm: openSVMDialog,
      tvm: openTVMDialog,
    };

    open[originNetwork]();
  }

  return (
    <div className="w-full">
      {showSurvey ? <div id="survey-container" className="display-none" /> : null}

      {isConnected ? (
        <Button
          disabled={isCreateIntentDisabled}
          intent={validation.isBuildTrxError ? "destructive" : "primary"}
          onClick={() => createIntent.mutate()}
          className="w-full"
        >
          {createIntentButtonLabel}
        </Button>
      ) : (
        <Button className="w-full" onClick={openWalletDialog}>
          Connect {originNetwork ? NetworkLabels[originNetwork] : ""} Wallet
        </Button>
      )}

      <Dialog.Root
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open && isTransactionSuccess) useInputState.getState().resetState();
        }}
        open={isDialogOpen}
      >
        <Dialog.Content allowClosing={!isTransactionPending} title="Confirmation Steps">
          <TrxProgress
            summary={
              notEnoughData ? null : (
                <div>
                  <Text className="flex items-center gap-1" variant="body-1">
                    <span className="text-theme-text-placeholder">Netting</span>
                    {printNumber(amount)} {getDisplaySymbol(inputAsset.symbol)}
                    <span className="text-theme-text-placeholder">for</span> {destinations.length}{" "}
                    chain
                    {destinations.length > 1 ? "s" : ""}
                  </Text>
                </div>
              )
            }
            successMessage="Intent Created"
            chainId={originChain}
          />
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}

const NetworkLabels: Record<Network, string> = {
  evm: "Ethereum",
  svm: "Solana",
  tvm: "Tron",
};
