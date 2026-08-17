import { LoadingDots } from "@repo/design/icons/LoadingDots";
import { Pill } from "@repo/design/Pill";
import { Text } from "@repo/design/Text";
import { cn } from "@repo/design/utils";
import type { AssetOnChain } from "@repo/lib/Assets";
import { printNumber } from "@repo/lib/print";
import type { Variants } from "framer-motion";
import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import maxBy from "lodash/maxBy";
import { formatUnits } from "viem";
import { useShallow } from "zustand/react/shallow";
import type { Response as CompetitorFeesResponse } from "./Fees/useCompetitorFees";
import { useInputState } from "./useInputState";
import { findAssetOnChain, getDisplaySymbol } from "@repo/lib/Assets";
import { PiSealWarningDuotone } from "react-icons/pi";
import * as Tooltip from "@repo/design/Tooltip";
import { isNumeric } from "@repo/lib/isNumeric";
import type { GetRouteQuotesResponse } from "@repo/api/types";
import { isFastPathAvailable } from "./isFastPathAvailable";

type EstimatesProps = {
  isVisible: boolean;
  isSwap: boolean;
  routeFees: GetRouteQuotesResponse | null | undefined;
  routeQuoteError?: unknown;
  competitorFees: CompetitorFeesResponse | null | undefined;
  actualAsset: AssetOnChain | undefined;
  amount: string | undefined;
};
export function Estimates({
  isVisible,
  isSwap,
  routeFees,
  routeQuoteError,
  competitorFees,
  actualAsset,
  amount,
}: EstimatesProps) {
  const [dollarAmount, requestFastPath, outputAsset, destinations] = useInputState(
    useShallow((s) => [s.dollarAmount, s.requestFastPath, s.outputAsset, s.destinations]),
  );

  const expectedAsset =
    outputAsset && destinations && destinations.length === 1
      ? findAssetOnChain({
          symbol: outputAsset.symbol,
          chainId: Number(destinations[0]),
        })
      : undefined;

  const competitorFee = competitorFees?.data?.length
    ? maxBy(competitorFees.data, "competitor_fee_bps")
    : undefined;

  /** is the current quote for the fast path */
  const isFastPath = isSwap ? true : isFastPathAvailable(routeFees) && requestFastPath;

  // Get the appropriate fees based on whether fast path is enabled
  const activeFees =
    isFastPath && routeFees?.fastPathQuote && "expectedAmount" in routeFees.fastPathQuote
      ? routeFees.fastPathQuote
      : routeFees;

  const percentageSaved =
    activeFees && competitorFee && competitorFee?.competitor_fee_bps
      ? ((competitorFee.competitor_fee_bps - activeFees.variableFeeBps) /
          competitorFee.competitor_fee_bps) *
        100
      : 0;

  const percentageSavedText =
    isNumeric(percentageSaved) &&
    percentageSaved > 0 &&
    percentageSaved !== Number.POSITIVE_INFINITY
      ? `${printNumber(percentageSaved, {
          maximumFractionDigits: 0,
        })}%`
      : "";

  const hasError = !!routeQuoteError;

  const competitorFeesInfo = {
    label: "Lowest Competitor Fee",
    value: isNumeric(competitorFee?.competitor_fee_bps) ? (
      <Pill color="yellow">
        {printNumber(competitorFee.competitor_fee_bps, {
          maximumFractionDigits: 1,
        })}{" "}
        BPS
      </Pill>
    ) : (
      <Loader />
    ),
    className: "",
  };

  const info = [
    {
      label: "Our Fee",
      value: isNumeric(activeFees?.variableFeeBps) ? (
        <Pill color="green">
          {printNumber(activeFees.variableFeeBps, { maximumFractionDigits: 2 })} BPS{" "}
          {percentageSavedText ? `(Save ${percentageSavedText})` : ""}
        </Pill>
      ) : hasError ? (
        "-"
      ) : (
        <Loader />
      ),
      className: "",
    },
    {
      label: "Gas Fee",
      value:
        activeFees?.fixedFeeUnits && actualAsset ? (
          <div className="flex flex-row items-center gap-1">
            <img
              className="border-theme-surface-border bg-theme-surface-page h-5 w-5 rounded-full border"
              alt={actualAsset.symbol}
              src={actualAsset.image}
            />

            <div>
              {printNumber(
                formatUnits(BigInt(activeFees.fixedFeeUnits), actualAsset.contract.decimals),
                {
                  maximumFractionDigits: 6,
                },
              )}{" "}
              {getDisplaySymbol(actualAsset.symbol)}
            </div>
          </div>
        ) : hasError ? (
          "-"
        ) : (
          <Loader />
        ),
      className: "",
    },
    {
      label: "Amount Received",
      value:
        isNumeric(activeFees?.expectedAmount) && amount && expectedAsset ? (
          <div className="flex flex-row items-center gap-1">
            <img
              className="border-theme-surface-border bg-theme-surface-page h-5 w-5 rounded-full border"
              alt={expectedAsset.symbol}
              src={expectedAsset.image}
            />

            <div>
              {printNumber(
                formatUnits(BigInt(activeFees.expectedAmount), expectedAsset.contract.decimals),
                {
                  maximumFractionDigits: 6,
                },
              )}{" "}
              {getDisplaySymbol(expectedAsset.symbol)}
            </div>
          </div>
        ) : hasError ? (
          "-"
        ) : (
          <Loader />
        ),
      className: "",
    },
    {
      label: "Avg Settlement Time",
      value: hasError ? (
        "-"
      ) : isNumeric(dollarAmount) ? (
        <GetDurationEstimate amountUSD={dollarAmount || 0} useFastPath={isFastPath} />
      ) : (
        "-"
      ),
    },
  ];

  if (
    isNumeric(competitorFee?.competitor_fee_bps) &&
    isNumeric(activeFees?.variableFeeBps) &&
    competitorFee?.competitor_fee_bps >= activeFees?.variableFeeBps
  ) {
    info.unshift(competitorFeesInfo);
  }

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {isVisible ? (
          <m.div
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col gap-3"
            variants={variants}
            initial="initial"
            animate="animate"
            key="to-address"
            exit="exit"
          >
            {info.map((i) => {
              return (
                <div className="flex justify-between" key={i.label}>
                  <Text
                    className="text-theme-text-placeholder underline decoration-dashed underline-offset-4"
                    variant={"body-2"}
                  >
                    {i.label}
                  </Text>
                  <Text className={cn("text-theme-text-headings", i.className)} variant={"body-2"}>
                    {i.value}
                  </Text>
                </div>
              );
            })}

            {routeFees && routeFees.splitCount > 1 && <SplitAmounts count={routeFees.splitCount} />}
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}

function SplitAmounts({ count }: { count: number }) {
  return (
    <Pill color="gray" className="flex items-center justify-center gap-1 w-full">
      <Tooltip.Root>
        <Tooltip.Trigger className="text-theme-text-muted">
          <PiSealWarningDuotone fill={"currentColor"} className="h-4 w-4" />
        </Tooltip.Trigger>
        <Tooltip.Content className="w-[360px]">
          <Text variant={"body-3"}>
            Dividing your funds into multiple chunks will reduce the risk of your funds being stuck
            for a long time.
          </Text>
        </Tooltip.Content>
      </Tooltip.Root>
      This intent will be split into {count} chunks.
    </Pill>
  );
}

const variants: Variants = {
  animate: { opacity: 1, height: "auto", marginTop: 18 },
  initial: { opacity: 0, height: 0, marginTop: 0 },
  exit: { opacity: 0, height: 0, marginTop: 0 },
};

type GetDurationEstimateProps = {
  amountUSD: number;
  useFastPath: boolean;
};
function GetDurationEstimate({
  amountUSD,
  useFastPath,
}: GetDurationEstimateProps): React.ReactNode {
  if (useFastPath)
    return (
      <div className="flex gap-1 items-center">
        <img src="/images/voltage.avif" alt="Fast Fill" className="w-4 h-4" />
        {"<60sec"}
      </div>
    );

  if (amountUSD > 0 && amountUSD <= 100_000) {
    return "5min - 30min";
  }
  if (amountUSD > 100_000 && amountUSD <= 400_000) {
    return "10min - 1.5hrs";
  }
  if (amountUSD > 400_000 && amountUSD <= 1_000_000) {
    return "1hr - 2hrs";
  }

  if (amountUSD > 1_000_000 && amountUSD <= 2_000_000) {
    return "2hr - 3hrs";
  }

  return "2hrs - 4hrs";
}

function Loader() {
  return <LoadingDots className="w-5 h-5 text-theme-text-warning" />;
}
