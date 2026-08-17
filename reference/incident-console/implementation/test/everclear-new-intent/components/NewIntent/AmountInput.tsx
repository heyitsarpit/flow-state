import type { Asset } from "../../flow-state/domain";

type AmountInputProps = Readonly<{
  amount: string;
  asset: Asset | null;
  balance: string | null;
  isDebouncing: boolean;
  isQuoteLoading: boolean;
  onChange: (amount: string) => void;
}>;

export function AmountInput({
  amount,
  asset,
  balance,
  isDebouncing,
  isQuoteLoading,
  onChange,
}: AmountInputProps) {
  return (
    <label className="flex flex-col gap-2">
      <span>Amount {asset === null ? "" : `(${asset.symbol})`}</span>
      <span className="flex gap-2">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button
          disabled={balance === null}
          type="button"
          onClick={() => balance && onChange(balance)}
        >
          Max
        </button>
      </span>
      {isDebouncing && <small>Waiting for the amount to settle…</small>}
      {!isDebouncing && isQuoteLoading && <small>Refreshing the matching quote…</small>}
    </label>
  );
}
