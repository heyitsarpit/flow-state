import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Box } from "@repo/design/Box";
import { Button } from "@repo/design/Button";
import { CrossV2 } from "@repo/design/icons/CrossV2";
import { Text } from "@repo/design/Text";
import { findChain } from "@repo/lib/Chains";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { HiWallet } from "react-icons/hi2";
import { useShallow } from "zustand/react/shallow";
import { AmountInput } from "./AmountInput";
import { CreateIntentButton } from "./CreateIntentButton";
import { Errors } from "./Errors";
import { Estimates } from "./Estimates";
import { FastPathToggle } from "./FastPathToggle";
import { SelectDestinationData } from "./SelectDestinationData";
import { SelectOriginData } from "./SelectOriginData";
import { ToAddress } from "./ToAddress";
import { useInputState } from "./useInputState";
import { useDebounce } from "@react-hooks-library/core";
import { findAssetOnChain } from "@repo/lib/Assets";
import { parseUnits } from "viem";
import { useRouteFees } from "./Fees/useRouteFees";
import { useCompetitorFees } from "./Fees/useCompetitorFees";
import { useOrder } from "../Orders/useOrder";
import { useNetwork } from "../Wallets/useNetwork";
import { InvoicePurchaseOverride } from "./InvoicePurchaseOverride";
import { PiReceipt } from "react-icons/pi";
import { useIsMiniAppMode } from "~/utils/useIsMiniAppMode";
import { useFilters } from "../explorer/Intents/Filters/useFilters";
import { getApiErrorResponse, getFastPathQuoteError } from "./apiErrors";

export function NewIntent() {
  const router = useRouter();
  const query = router.query;
  const { data: isMiniAppMode = false } = useIsMiniAppMode();

  useEffect(() => {
    if (!query || Object.keys(query).length === 0) return;

    useInputState.getState().syncFromURL(query as Record<string, string>);
  }, [query]);

  const [isEstimatesOpen, setIsEstimatesOpen] = useState(false);

  const [
    _inputAsset,
    _origin,
    _destinations,
    toAddress,
    useToAddress,
    _amount,
    dollarAmount,
    validation,
    _originNetwork,
    destinationNetwork,
    orderIdURL,
    outputAsset,
    invoicePurchaseOverride,
    requestFastPath,
  ] = useInputState(
    useShallow((s) => [
      s.inputAsset,
      s.origin,
      s.destinations,
      s.toAddress,
      s.useToAddress,
      s.amount,
      s.dollarAmount,
      s.validation,
      s.originNetwork,
      s.destinationNetwork,
      s.orderIdURL,
      s.outputAsset,
      s.invoice,
      s.requestFastPath,
    ]),
  );

  // this ceremony is to keep typescript happy
  // which makes the rest of the code a lot simpler
  const invoice = invoicePurchaseOverride;
  const amount = invoice ? invoice.totalPurchaseAmount : _amount;
  const inputAsset = invoice ? invoice.asset : _inputAsset;
  const origin = invoice ? invoice.origin : _origin;
  const originNetwork = invoice ? invoice.asset.contract.network : _originNetwork;
  const destinations = invoice ? invoice.destinations.map((d) => d.chainId) : _destinations;

  const debouncedAmount = useDebounce(amount, 300);

  /** the token which will be sent after wrapping */
  const actualAsset = inputAsset?.wrappedToken
    ? findAssetOnChain({
        chainId: Number(origin || -1),
        symbol: inputAsset.wrappedToken,
      })
    : inputAsset;

  const originContractAddress = actualAsset?.contract.contract_address;

  const amountBigInt =
    debouncedAmount && actualAsset
      ? parseUnits(debouncedAmount, actualAsset.contract.decimals)
      : undefined;

  const network = useNetwork();
  const walletAddress = originNetwork && network[originNetwork].address;

  const orderId = useOrder(orderIdURL).data?.order_id;

  const isSwap = actualAsset && outputAsset ? actualAsset.symbol !== outputAsset.symbol : false;

  const outputAssetAddress =
    isSwap && outputAsset && destinations && destinations.length === 1
      ? findAssetOnChain({
          symbol: outputAsset.symbol,
          chainId: Number(destinations[0]),
        })?.contract.contract_address
      : undefined;

  const {
    data: routeFees,
    error: routeFeesError,
    isLoading: isQuoteLoading,
  } = useRouteFees({
    origin,
    destinations,
    asset: originContractAddress,
    amount: amountBigInt?.toString(),
    orderId: orderId,
    to: toAddress || walletAddress || undefined,
    from: walletAddress || undefined,
    outputAsset: outputAssetAddress,
  });

  const topLevelRouteQuoteError = getApiErrorResponse(routeFeesError);
  const fastPathQuoteError = getFastPathQuoteError(routeFees);
  const relevantQuoteError =
    topLevelRouteQuoteError || (requestFastPath || isSwap ? fastPathQuoteError : undefined);
  const displayQuoteError = relevantQuoteError ?? routeFeesError;

  const { data: competitorFees } = useCompetitorFees(
    {
      origin,
      destinations,
      asset: originContractAddress,
      amount: amountBigInt?.toString(),
      outputAsset: outputAssetAddress,
    },
    { enabled: !isSwap },
  );

  useEffect(() => {
    const inputState = useInputState.getState();

    inputState.setHasQuoteError(!!displayQuoteError);
  }, [displayQuoteError]);

  /**
   * when creating a cross network intent svm <-> evm, the toAddress must be specified
   * cause the current address does not exist on the destination
   */
  const isCrossNetwork =
    originNetwork && destinationNetwork && originNetwork !== destinationNetwork;

  const hasData = !!inputAsset || !!origin || !!destinations?.length || !!toAddress || !!amount;

  const isValidState = !validation.isAboveMaxCap && !validation.isBelowMinCap;

  useEffect(() => {
    isValidState ? setIsEstimatesOpen(!!dollarAmount) : setIsEstimatesOpen(false);
  }, [dollarAmount, isValidState]);

  const isOrderTransaction = !!orderIdURL;

  if (invoicePurchaseOverride) {
    return (
      <Box className="flex w-full flex-col gap-4 p-3 sm:w-[30rem] md:p-6">
        <InvoicePurchaseOverride
          invoice={invoicePurchaseOverride}
          onClear={() => {
            useInputState.setState({ invoice: undefined });
          }}
        />
        <Box className="rounded-xl border-none" intent={"input"}>
          <Estimates
            isSwap={isSwap}
            isVisible={!!invoicePurchaseOverride}
            routeFees={routeFees}
            routeQuoteError={displayQuoteError}
            competitorFees={competitorFees}
            actualAsset={actualAsset}
            amount={debouncedAmount}
          />
        </Box>

        <Errors routeQuoteError={displayQuoteError} />

        <CreateIntentButton
          routeFees={routeFees}
          amount={amount}
          inputAsset={inputAsset}
          originChain={origin}
          originNetwork={originNetwork}
          destinations={destinations}
          toAddress={toAddress}
          useToAddress={useToAddress}
          validation={validation}
          orderIdURL={orderIdURL}
          requestFastPath={requestFastPath}
          isSwap={isSwap}
          outputAssetAddress={outputAssetAddress}
          userAddress={walletAddress || undefined}
          invoice={invoice}
          isMiniAppMode={isMiniAppMode}
        />
      </Box>
    );
  }

  return (
    <Box className="flex w-full flex-col gap-4 p-3 sm:w-[30rem] md:p-6">
      <div className="flex flex-col gap-2 pb-2">
        <div className="flex items-center justify-between">
          <Text className="text-theme-text-headings" variant={"title-5"}>
            Bridge
          </Text>

          <div className="flex items-center gap-2">
            {isMiniAppMode && network.evm.address ? (
              <button
                onClick={() => {
                  useFilters.setState({ search: network.evm.address || "" });
                  router.push(`/intents?search=${network.evm.address}`);
                }}
                type="button"
                className="text-theme-text-placeholder hover:text-theme-text-muted rounded p-[2px] transition-colors"
                title="History"
              >
                <PiReceipt className="h-5 w-5" />
              </button>
            ) : null}

            {hasData ? (
              <button
                type="button"
                onClick={() => {
                  useInputState.getState().resetState();
                  setIsEstimatesOpen(false);
                }}
                className="text-theme-text-placeholder hover:text-theme-text-muted rounded p-[2px] transition-colors"
                title="Reset"
              >
                <CrossV2 className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
        <Text className="text-theme-text-placeholder" variant={"body-2"}>
          Your bridge will be optimized for the lowest, and most efficient settlement.
        </Text>
      </div>

      <div>
        <Box
          className="mb-2 flex items-center justify-between rounded-xl border-none"
          intent={"input"}
        >
          <Text className="text-theme-text-placeholder" variant={"body-2"}>
            From
          </Text>

          <SelectOriginData
            onSelect={(o, a) => {
              useInputState.setState({
                origin: o,
                inputAsset: a,
                originNetwork: a.contract.network,
                destinations: undefined,
                destinationNetwork: undefined,
                outputAsset: undefined,
              });

              syncToAddress();

              useInputState.getState().syncToURL();
            }}
            selectedDestinations={destinations}
            selectedOrigin={origin}
            selectedAsset={inputAsset}
            isDisabled={isOrderTransaction}
          />
        </Box>

        <Box
          className="mb-2 flex items-center justify-between rounded-xl border-none"
          intent={"input"}
        >
          <Text className="text-theme-text-placeholder" variant={"body-2"}>
            To
          </Text>

          <SelectDestinationData
            onSelect={(d, outputAsset) => {
              // assumes all destinations are same network
              const _destinationNetwork = d?.length
                ? findChain({ chainId: d[0] })?.network
                : undefined;

              useInputState.setState({
                destinations: d,
                destinationNetwork: _destinationNetwork,
                outputAsset: outputAsset,
              });

              syncToAddress();

              useInputState.getState().syncToURL();
            }}
            outputAsset={outputAsset}
            destinations={destinations}
            origin={origin}
            inputAsset={inputAsset}
            isDisabled={isOrderTransaction}
          />
        </Box>

        <Box className="mb-2 space-y-2 rounded-xl border-none" intent={"input"}>
          <Text className="text-theme-text-placeholder" variant={"body-2"}>
            Amount
          </Text>

          <AmountInput isDisabled={isOrderTransaction} />
        </Box>

        <FastPathToggle routeFees={routeFees} isQuoteLoading={isQuoteLoading} isSwap={isSwap} />

        <Box className="space-y-2 rounded-xl border-none" intent={"input"}>
          <button
            type="button"
            className="flex w-full justify-between disabled:cursor-not-allowed"
            onClick={() => setIsEstimatesOpen((s) => !s)}
            disabled={!isValidState}
          >
            <Text
              className="text-theme-text-placeholder underline decoration-dashed underline-offset-4"
              variant={"body-2"}
            >
              Estimates
            </Text>

            <ChevronDownIcon className="text-theme-text-placeholder hover:text-theme-text-headings h-4 w-4 transition-colors duration-500" />
          </button>

          <Estimates
            isSwap={isSwap}
            isVisible={isEstimatesOpen}
            routeFees={routeFees}
            routeQuoteError={displayQuoteError}
            competitorFees={competitorFees}
            actualAsset={actualAsset}
            amount={amount}
          />
        </Box>

        <ToAddress network={destinationNetwork || "evm"} />

        <Errors routeQuoteError={displayQuoteError} />
      </div>

      <div className="flex gap-1">
        <CreateIntentButton
          routeFees={routeFees}
          amount={amount}
          inputAsset={inputAsset}
          originChain={origin}
          originNetwork={originNetwork}
          destinations={destinations}
          toAddress={toAddress}
          useToAddress={useToAddress}
          validation={validation}
          orderIdURL={orderIdURL}
          requestFastPath={requestFastPath}
          isSwap={isSwap}
          outputAssetAddress={outputAssetAddress ?? undefined}
          userAddress={walletAddress || undefined}
          invoice={invoice}
          isMiniAppMode={isMiniAppMode}
        />

        <Button
          disabled={isCrossNetwork}
          onClick={() => {
            useInputState.setState({ useToAddress: !useToAddress });
          }}
          className="px-3 py-1"
        >
          <HiWallet className="h-6 w-6" />
        </Button>
      </div>
    </Box>
  );
}

function syncToAddress() {
  const { originNetwork, destinationNetwork } = useInputState.getState();

  const isCrossNetworkIntent =
    originNetwork && destinationNetwork && originNetwork !== destinationNetwork;

  if (isCrossNetworkIntent) {
    useInputState.setState({ useToAddress: true });
  } else {
    useInputState.setState({ useToAddress: false, toAddress: undefined });
  }
}
