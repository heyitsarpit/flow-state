import type { Intent } from "@repo/api/types";
import { Copy } from "@repo/design/Copy";
import type { PaginationProps } from "@repo/design/Table";
import * as Table from "@repo/design/Table";
import { cn } from "@repo/design/utils";
import { Chain } from "@repo/design/utils/Chain";
import { ChainList } from "@repo/design/utils/ChainList";
import { truncate } from "@repo/lib/truncate";
import { useCursorPagination } from "@repo/lib/useCursorPagination";
import { DateTime } from "luxon";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { AssetAmount } from "~/components/explorer/AssetAmount";
import { useBatchedIntents } from "~/components/explorer/useBatchedIntents";
import { BatchProgress, Progress } from "~/components/Utils/Progress";
import { useNetwork } from "~/components/Wallets/useNetwork";
import { getSearchType } from "~/utils/getSearchType";
import { Filters } from "./Filters";
import { useFilters } from "./Filters/useFilters";
import { useHighlightedAddress } from "../useHighlightedAddress";
import { getOutputAsset } from "../../../utils/getOutputAsset";
import { create } from "zustand";

type Props = {
  setIsFetching: (b: boolean) => void;
  refetchIndex?: symbol;
};
export function Intents({ setIsFetching, refetchIndex }: Props) {
  const [destinations, origins, search, statuses, startDate, endDate, tickerHash, isFastPath] =
    useFilters(
      useShallow((s) => [
        s.destinations,
        s.origins,
        s.search || "",
        s.statuses,
        s.startDate,
        s.endDate,
        s.tickerHash,
        s.isFastPath,
      ]),
    );

  const hasFilters =
    !!destinations?.length ||
    !!origins?.length ||
    !!search.length ||
    !!statuses?.length ||
    isFastPath !== undefined;

  const searchType = useMemo(() => getSearchType(search), [search]);

  const { currentCursor, isNextDisabled, isPrevDisabled, nextPage, prevPage } = useCursorPagination(
    { defaultCursor: "" },
  );

  const { data, isLoading, isFetching, refetch } = useBatchedIntents(
    {
      limit: 50,
      cursor: currentCursor,
      destinations,
      origins,
      statuses,
      tickerHash,
      txHash: searchType === "tx-hash/intent-id" ? search.trim() : undefined,
      userAddress: searchType === "user-address" ? search.trim() : undefined,
      startDate: startDate ? startDate.toString() : undefined,
      endDate: endDate ? endDate.toString() : undefined,
      isFastPath: isFastPath !== undefined ? String(isFastPath) : undefined,
    },
    { initialData: undefined, refetchInterval: 60_000 },
  );

  useEffect(() => {
    setIsFetching(isFetching);
  }, [isFetching, setIsFetching]);

  useEffect(() => {
    if (refetchIndex) refetch();
  }, [refetch, refetchIndex]);

  const hasData = !!data?.items?.length;

  let pagination: PaginationProps["pagination"];
  let message: React.ReactElement | "loading" | null;

  if (hasData) {
    pagination = {
      isNextDisabled: isNextDisabled(data?.nextCursor),
      isPrevDisabled: isPrevDisabled(),
      nextPage: () => {
        nextPage(data?.nextCursor);
        setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
      },
      prevPage: () => {
        prevPage();
        setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
      },
    };
  } else {
    pagination = undefined;
  }

  if (isLoading) {
    message = "loading";
  } else if (!hasData) {
    if (hasFilters) {
      message = (
        <div className="text-center">
          Sorry, there's no available Intents with your current filter selection. <br /> Please try
          a different one.
        </div>
      );
    } else {
      message = (
        <div className="text-center">
          No available Intents at the moment. <br /> Please check back later.
        </div>
      );
    }
  } else {
    message = null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Filters />

      <Table.Root pagination={pagination} message={message}>
        <Table.Head>
          <Table.Th>Status</Table.Th>
          <Table.Th className="pl-1">ID</Table.Th>
          <Table.Th className="min-w-[10rem]">Amount</Table.Th>
          <Table.Th>Origin</Table.Th>
          <Table.Th>Destination</Table.Th>
          <Table.Th>Sender</Table.Th>
          <Table.Th className="text-right">Time Created</Table.Th>
        </Table.Head>
        <Table.Body>
          {data?.items?.map((item) =>
            item.type === "intent" ? (
              <IntentRow key={item.intent.intent_id} intent={item.intent} />
            ) : (
              <BatchRow key={item.batchId} batch={item} />
            ),
          )}
        </Table.Body>
      </Table.Root>
    </div>
  );
}

type IntentProps = {
  intent: Intent;
};
function IntentRow({ intent }: IntentProps) {
  const sender = intent.initiator;
  const highlight = useHighlightedAddress(sender || "");
  const destination = intent.is_fast_path ? intent.fill_domain : intent.hub_settlement_domain;

  return (
    <Table.Tr
      className={cn(
        highlight
          ? highlight.isInternal
            ? "bg-theme-text-success/10"
            : "bg-theme-surface-warning-1"
          : "",
      )}
    >
      <Table.Td>
        <Progress intent={intent} />
      </Table.Td>

      <Table.Td className="pl-1">
        <span className="flex items-center gap-0">
          {intent.is_fast_path ? (
            <img src="/images/voltage.avif" alt="Fast Fill" className="w-4 h-4" />
          ) : null}
          <Link
            className="hover:text-theme-text-placeholder pl-1 underline decoration-dashed underline-offset-4 transition-colors duration-300"
            href={`/intents/${intent.intent_id}`}
          >
            {truncate(intent.intent_id, 6, 6)}
          </Link>
        </span>
      </Table.Td>

      <Table.Td className="min-w-[10rem]">
        <AssetAmount
          asset={{
            address: intent.input_asset,
            chainId: Number(intent.origin),
          }}
          outputAsset={getOutputAsset(intent)}
          amount={intent.origin_amount}
        />
      </Table.Td>

      <Table.Td>
        <Chain chainId={intent.origin} />
      </Table.Td>

      <Table.Td>
        <ChainList
          chainIds={destination ? [destination] : intent.destinations}
          visibleCount={4}
          collapse={6}
        />
      </Table.Td>

      <Sender sender={sender || ""} />

      <CreatedAt timestamp={intent.intent_created_timestamp} />
    </Table.Tr>
  );
}

type BatchProps = {
  batch: {
    type: "batch";
    batchId: string;
    token_fee: string;
    native_fee: string;
    intents: Array<Intent>;
  };
};
function BatchRow({ batch }: BatchProps) {
  const batchId = batch.batchId;
  const intents = batch.intents;

  const first = intents[0];
  const sender = first?.initiator;
  const highlight = useHighlightedAddress(sender || "");

  const totalAmount = (
    intents.reduce((acc, i) => acc + BigInt(i.origin_amount), 0n) + BigInt(batch.token_fee)
  ).toString();

  const settlementDomains = Array.from(
    new Set(
      intents
        .map((i) => (i.is_fast_path ? i.fill_domain : i.hub_settlement_domain))
        .filter((v): v is string => !!v),
    ),
  );
  const destinations = Array.from(new Set(intents.flatMap((i) => i.destinations)));

  return (
    <Table.Tr className={cn(highlight && "bg-theme-text-success/10")}>
      <Table.Td>
        <BatchProgress intents={intents} />
      </Table.Td>

      <Table.Td className="pl-1">
        <span className="flex items-center gap-1">
          <img
            src={first.is_fast_path ? "/images/voltage_box.avif" : "/images/box_emoji.png"}
            alt="Batch Emoji"
            className={first.is_fast_path ? "w-5 h-5" : "w-4 h-4"}
          />
          <Link
            className="hover:text-theme-text-placeholder underline decoration-dashed underline-offset-4 transition-colors duration-300"
            href={`/intents/batch/${batchId}`}
          >
            {truncate(batchId, 6, 6)}
          </Link>
        </span>
      </Table.Td>

      <Table.Td className="min-w-[10rem]">
        <AssetAmount
          asset={{
            address: first.input_asset,
            chainId: Number(first.origin),
          }}
          outputAsset={getOutputAsset(first)}
          amount={totalAmount}
        />
      </Table.Td>

      <Table.Td>
        <Chain chainId={first.origin} />
      </Table.Td>

      <Table.Td>
        <ChainList
          chainIds={settlementDomains.length > 0 ? settlementDomains : destinations}
          visibleCount={4}
          collapse={6}
        />
      </Table.Td>

      <Sender sender={sender || ""} />

      <CreatedAt timestamp={first.intent_created_timestamp} />
    </Table.Tr>
  );
}

function Sender({ sender }: { sender: string }) {
  const network = useNetwork();

  const highlight = useHighlightedAddress(sender || "");
  const hoveredAddress = useIntentHover((s) => s.hoveredAddress);

  const isMine = useMemo(() => {
    const a = (sender || "").toLowerCase();

    return (
      a === network.evm.address?.toLowerCase() ||
      a === network.svm.address?.toLowerCase() ||
      a === network.tvm.address?.toLowerCase()
    );
  }, [sender, network.evm.address, network.svm.address, network.tvm.address]);

  const isInitiatorHovered = hoveredAddress === sender;

  return (
    <Table.Td className={isMine ? "text-theme-text-success font-bold" : ""}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            useFilters.setState({ search: sender || "" });
            useFilters.getState().syncToURL();
          }}
          onMouseEnter={() => useIntentHover.setState({ hoveredAddress: sender || "" })}
          onMouseLeave={() => useIntentHover.setState({ hoveredAddress: "" })}
          className={cn(
            "rounded-md px-1",
            isInitiatorHovered && "outline-dashed outline-theme-text-success",
          )}
        >
          {highlight ? (
            <span className="capitalize">{highlight.name}</span>
          ) : (
            truncate(sender, 6, 6)
          )}
        </button>
        <Copy text={sender || ""} />
      </div>
    </Table.Td>
  );
}

function CreatedAt({ timestamp }: { timestamp: number }) {
  const isOlderThan24Hrs = DateTime.now().diff(DateTime.fromSeconds(timestamp)).as("hours") > 24;

  return (
    <Table.Td className="text-right w-[11rem]">
      {isOlderThan24Hrs
        ? DateTime.fromSeconds(timestamp).toLocaleString(DateTime.DATETIME_MED)
        : DateTime.fromSeconds(timestamp).toRelative()}
    </Table.Td>
  );
}

const useIntentHover = create<{ hoveredAddress: string }>(() => ({
  hoveredAddress: "",
}));
