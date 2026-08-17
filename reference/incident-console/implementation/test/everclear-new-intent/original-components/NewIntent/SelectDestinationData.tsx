import type { Asset, AssetOnChain } from "@repo/lib/Assets";
import type { Chain as TChain } from "@repo/lib/Chains";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronUpIcon } from "@radix-ui/react-icons";
import { Button } from "@repo/design/Button";
import { CheckboxDummy } from "@repo/design/Checkbox";
import * as Dialog from "@repo/design/Dialog";
import { Placeholder } from "@repo/design/Placeholder";
import { Text } from "@repo/design/Text";
import { cn } from "@repo/design/utils";
import { Asset as AssetView } from "@repo/design/utils/Asset";
import { Chain } from "@repo/design/utils/Chain";
import { ChainList } from "@repo/design/utils/ChainList";
import * as Tooltip from "@repo/design/Tooltip";
import { findAsset, getDisplaySymbol } from "@repo/lib/Assets";
import { Chains, HubChain, findChain } from "@repo/lib/Chains";
import { useRouteConfig } from "./useRouteConfig";
import { ExplorerENV } from "@repo/lib/ENV";
import { Voltage } from "@repo/design/icons/Voltage";

import { useMemo, useState } from "react";
import { gnosis } from "viem/chains";

type SelectDestinationDataProps = {
  onSelect: (destinations: number[], outputAsset?: Asset) => void;
  destinations: undefined | number[];
  inputAsset: AssetOnChain | undefined;
  origin: undefined | number;
  isDisabled?: boolean;
  outputAsset: Asset | undefined;
};

export function SelectDestinationData({
  onSelect,
  inputAsset,
  origin,
  destinations,
  isDisabled,
  outputAsset,
}: SelectDestinationDataProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger disabled={isDisabled || !inputAsset || !origin}>
        {!destinations || !destinations.length ? (
          <Placeholder text="Select Destination" />
        ) : (
          <Placeholder
            text={
              <div className="flex flex-row items-center gap-1">
                {outputAsset ? (
                  <>
                    <AssetView assetId={outputAsset.id} imageClassName="h-8 w-8" />
                    <Text className="text-theme-text-placeholder" variant={"body-3"}>
                      on
                    </Text>
                  </>
                ) : null}

                <ChainList
                  chainIds={destinations}
                  imageClassName="w-8 h-8"
                  countClassName="h-8 w-8"
                  showCount={true}
                  visibleCount={8}
                  collapse={15}
                />
              </div>
            }
            showIcon={false}
          />
        )}
      </Dialog.Trigger>

      <Dialog.Content title="Destination Asset & Chains" wrapperClassName="p-0">
        <DestinationSelector
          onSelect={(...params) => {
            onSelect(...params);
            setOpen(false);
          }}
          selectedDestinations={destinations}
          inputAsset={inputAsset}
          selectedOrigin={origin}
          selectedOutputAsset={outputAsset}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}

const ChainsToHide: Set<number> =
  ExplorerENV.NEXT_PUBLIC_NETWORK === "mainnet-prod"
    ? new Set([HubChain.chain_id, gnosis.id])
    : new Set([HubChain.chain_id]);

const ChainsToDisable: Set<number> =
  ExplorerENV.NEXT_PUBLIC_NETWORK === "mainnet-prod" ? new Set() : new Set();

type DestinationSelectorProps = {
  selectedDestinations: SelectDestinationDataProps["destinations"];
  inputAsset: SelectDestinationDataProps["inputAsset"];
  selectedOrigin: SelectDestinationDataProps["origin"];
  onSelect: SelectDestinationDataProps["onSelect"];
  selectedOutputAsset?: SelectDestinationDataProps["outputAsset"];
};

export function DestinationSelector({
  onSelect,
  inputAsset,
  selectedOrigin,
  selectedDestinations,
  selectedOutputAsset,
}: DestinationSelectorProps) {
  const [outputTickerHash, setOutputTickerHash] = useState(
    selectedOutputAsset?.tickerHash ?? inputAsset?.tickerHash,
  );
  const [destinations, setDestinations] = useState(selectedDestinations || []);
  const { data: routeConfig } = useRouteConfig();

  // Get available target assets (origin asset for bridge + swappable assets)
  const availableOutputAssets = useMemo(() => {
    if (!inputAsset || !selectedOrigin) return [];

    // Use the wrapped token's tickerHash for route lookups (e.g., ETH -> WETH)
    const actualAsset = inputAsset.wrappedToken
      ? findAsset({ symbol: inputAsset.wrappedToken })
      : inputAsset;
    const originTickerHash = actualAsset?.tickerHash ?? inputAsset.tickerHash;

    const outputAssets = [inputAsset.tickerHash]; // Include origin asset for bridge

    const swapConfig = routeConfig?.fastSwapRoutes[originTickerHash]?.[selectedOrigin.toString()];
    if (swapConfig) {
      Object.keys(swapConfig).forEach((assetTickerHash) => {
        if (!outputAssets.includes(assetTickerHash)) {
          outputAssets.push(assetTickerHash);
        }
      });
    }

    return outputAssets;
  }, [inputAsset, selectedOrigin, routeConfig]);

  // Get available destination chains based on selected target asset
  const availableDestinationChains = useMemo(() => {
    if (!inputAsset || !selectedOrigin || !outputTickerHash) return [];

    // Use the wrapped token's tickerHash for route lookups (e.g., ETH -> WETH)
    const actualAsset = inputAsset.wrappedToken
      ? findAsset({ symbol: inputAsset.wrappedToken })
      : inputAsset;
    const originTickerHash = actualAsset?.tickerHash ?? inputAsset.tickerHash;

    // If same asset selected, show bridge destinations (same as SelectDestinations.tsx logic)
    if (outputTickerHash === inputAsset.tickerHash) {
      const token = findAsset({
        symbol: inputAsset?.wrappedToken ?? inputAsset.symbol,
      });

      const supportedChains: Set<number> = new Set(token?.contracts.map((c) => c.chain_id) || []);

      return Chains.filter((c) => {
        const isSameChain = c.chain_id === selectedOrigin;
        const isSupportedChain = supportedChains.has(c.chain_id);
        const isHiddenChain = ChainsToHide.has(c.chain_id);

        return !isSameChain && isSupportedChain && !isHiddenChain;
      });
    }

    // If different asset selected, show swap destinations from config
    const swapConfig =
      routeConfig?.fastSwapRoutes[originTickerHash]?.[selectedOrigin]?.[outputTickerHash];

    if (swapConfig) {
      return Chains.filter(
        (chain) =>
          swapConfig.includes(chain.chain_id.toString()) && !ChainsToHide.has(chain.chain_id),
      );
    }

    return [];
  }, [inputAsset, selectedOrigin, outputTickerHash, routeConfig]);

  const handleAssetSelect = (assetTickerHash: string) => {
    setOutputTickerHash(assetTickerHash);
    setDestinations([]); // Reset destinations when changing target asset
  };

  const toggleChain = (chain: (typeof Chains)[number]) => {
    const isSwap = outputTickerHash !== inputAsset?.tickerHash;

    if (isSwap) {
      // For swaps, only allow single selection
      if (destinations.includes(chain.chain_id)) {
        setDestinations([]); // Deselect if already selected
      } else {
        setDestinations([chain.chain_id]); // Select only this chain
      }
    } else {
      // For bridges, use the same logic as SelectDestinations.tsx
      // If chain is already selected, remove it.
      if (destinations.includes(chain.chain_id)) {
        setDestinations((prev) => prev.filter((d) => d !== chain.chain_id));
        return;
      }

      // If there's already a selection, enforce network consistency.
      const selectedNetwork =
        destinations.length > 0 ? findChain({ chainId: destinations[0] })?.network : undefined;

      if (selectedNetwork && chain.network !== selectedNetwork) {
        return;
      }

      // Add the new chain (no limit for now, but can be added if needed)
      setDestinations((prev) => [...prev, chain.chain_id]);
    }
  };

  const handleSave = () => {
    const _asset = outputTickerHash ? findAsset({ tickerHash: outputTickerHash }) : undefined;

    const asset = _asset?.wrappedToken ? findAsset({ symbol: _asset?.wrappedToken }) : _asset;

    onSelect(destinations, asset);
  };

  return (
    <div>
      {availableOutputAssets.length > 1 ? (
        <>
          <div className="px-4 pt-4 pb-2">
            <Text className="text-theme-text-placeholder" variant={"body-2"}>
              Output Asset
            </Text>
            <div className="bg-theme-surface-border mt-1 h-[1px] w-full" />
          </div>

          <div className="px-4">
            <div className="flex flex-wrap gap-2">
              {availableOutputAssets.map((assetTickerHash) => {
                const asset = findAsset({ tickerHash: assetTickerHash });
                const isSelected = outputTickerHash === assetTickerHash;

                return (
                  <button
                    key={assetTickerHash}
                    type="button"
                    onClick={() => handleAssetSelect(assetTickerHash)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                      isSelected
                        ? "bg-theme-surface-input border-theme-button-primary"
                        : "bg-theme-surface-card border-theme-surface-border hover:bg-theme-surface-input",
                    )}
                  >
                    <img
                      className="h-6 w-6 rounded-full"
                      src={asset?.image || "/placeholder.png"}
                      alt={asset?.name || asset?.symbol}
                    />
                    <Text
                      className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-theme-text-headings" : "text-theme-text-muted",
                      )}
                      variant={"body-2"}
                    >
                      {asset ? getDisplaySymbol(asset.symbol) : ""}
                    </Text>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {/* Destination Chains */}
      <ChainDestinationSelector
        availableChains={availableDestinationChains}
        destinations={destinations}
        onToggleChain={toggleChain}
        onSave={handleSave}
        isSwap={outputTickerHash !== inputAsset?.tickerHash}
        routeConfig={routeConfig}
        inputAsset={inputAsset}
        selectedOrigin={selectedOrigin}
      />
    </div>
  );
}

type ChainDestinationSelectorProps = {
  availableChains: TChain[];
  destinations: number[];
  onToggleChain: (chain: TChain) => void;
  onSave: () => void;
  isSwap?: boolean;
  routeConfig: ReturnType<typeof useRouteConfig>["data"];
  inputAsset: SelectDestinationDataProps["inputAsset"];
  selectedOrigin: SelectDestinationDataProps["origin"];
};

function ChainDestinationSelector({
  availableChains,
  destinations,
  onToggleChain,
  onSave,
  isSwap = false,
  routeConfig,
  inputAsset,
  selectedOrigin,
}: ChainDestinationSelectorProps) {
  const selectedNetwork = useMemo(() => {
    if (destinations.length === 0) return undefined;

    const firstChain = findChain({ chainId: destinations[0] });

    return firstChain?.network;
  }, [destinations]);

  // Get fast bridge routes for the current origin/asset
  const fastBridgeRoutes = useMemo(() => {
    if (!inputAsset || !selectedOrigin || !routeConfig || isSwap) return [];
    // Use the wrapped token's tickerHash for route lookups (e.g., ETH -> WETH)
    const actualAsset = inputAsset.wrappedToken
      ? findAsset({ symbol: inputAsset.wrappedToken })
      : inputAsset;
    const originTickerHash = actualAsset?.tickerHash ?? inputAsset.tickerHash;
    return routeConfig.fastBridgeRoutes[originTickerHash]?.[selectedOrigin] ?? [];
  }, [inputAsset, selectedOrigin, routeConfig, isSwap]);

  const ChainsPerNetwork = useMemo(
    () => Object.entries(Object.groupBy(availableChains, (c) => c.network)),
    [availableChains],
  );

  return (
    <div>
      <div className="pb-2 px-4 pt-4">
        <Text className="text-theme-text-placeholder" variant={"body-2"}>
          {isSwap
            ? "You can select one chain."
            : `You can select multiple chains. ${destinations.length} selected.`}
        </Text>
        <div className="bg-theme-surface-border mt-1 h-[1px] w-full" />
      </div>

      <div className="flex h-[28rem] px-4 flex-col gap-1 overflow-y-scroll">
        {ChainsPerNetwork.map(([network, chains]) => {
          const isAnyChainSelected = destinations.length > 0;
          const isNetworkSelected = chains.some((c) => destinations.includes(c.chain_id));

          return (
            <Collapsible.Root defaultOpen={true} key={network} className="w-full group">
              <Collapsible.Trigger
                className={cn(
                  "mb-1 flex w-full items-center justify-between rounded-lg border border-theme-surface-border px-2 py-2",
                  "bg-theme-surface-card-nested-2x hover:bg-theme-surface-input transition-colors duration-200",
                )}
              >
                <Text className="text-theme-text-muted" variant={"body-2"}>
                  {network.toUpperCase()} Chains
                  {isAnyChainSelected ? (
                    !isNetworkSelected ? (
                      <Text
                        as="span"
                        variant={"body-3"}
                        className="text-theme-text-placeholder my-0 leading-3"
                      >
                        {" — "} Disabled because {selectedNetwork?.toUpperCase()} chains are
                        selected
                      </Text>
                    ) : null
                  ) : null}
                </Text>

                <ChevronUpIcon className="w-4 h-4 text-theme-text-muted transition-transform duration-100 group-data-[state=open]:rotate-180" />
              </Collapsible.Trigger>

              <Collapsible.Content className="space-y-[2px]">
                {chains.map((chain) => {
                  const isSelected = destinations.includes(chain.chain_id);

                  const isConfigDisabled = ChainsToDisable.has(chain.chain_id);
                  const isNetworkMismatch = !!selectedNetwork && chain.network !== selectedNetwork;
                  const isDisabled = isNetworkMismatch || isConfigDisabled;

                  const showVoltageIcon =
                    fastBridgeRoutes.includes(chain.chain_id.toString()) &&
                    destinations.length <= 1;

                  return (
                    <OptionButton
                      key={chain.chain_id}
                      isDisabled={isDisabled}
                      isSelected={isSelected}
                      onClick={() => onToggleChain(chain)}
                    >
                      <div className="flex items-center gap-2">
                        <Chain imageClassName="h-8 w-8" chainId={chain.chain_id} />

                        {showVoltageIcon && (
                          <Tooltip.Root>
                            <Tooltip.Trigger className="text-theme-text-waiting">
                              <Voltage className="w-4 h-4" fill="currentColor" />
                            </Tooltip.Trigger>
                            <Tooltip.Content className="w-80 text-center">
                              <Text variant={"body-2"}>
                                Priority settlement is available for this chain.
                              </Text>
                            </Tooltip.Content>
                          </Tooltip.Root>
                        )}
                      </div>
                      <CheckboxDummy checked={isSelected} />
                    </OptionButton>
                  );
                })}
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </div>

      <div className="p-4 pt-2">
        <Button onClick={onSave} className="w-full">
          Save
        </Button>
      </div>
    </div>
  );
}

type OptionButtonProps = {
  children: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
  isDisabled?: boolean;
};

const OptionButton = ({ isSelected, onClick, children, isDisabled }: OptionButtonProps) => (
  <button
    type="button"
    disabled={isDisabled}
    className={cn(
      "hover:bg-theme-surface-input flex w-full flex-row items-center justify-between rounded-lg border border-transparent p-2",
      "last-of-type:mb-2",
      isSelected && "bg-theme-surface-input border-theme-button-primary",
      isDisabled && "opacity-60 cursor-not-allowed",
    )}
    onClick={onClick}
  >
    {children}
  </button>
);
