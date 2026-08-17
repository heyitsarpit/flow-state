import { useDebounce } from "@react-hooks-library/core";
import { NumberInput } from "@repo/design/NumberInput";
import { textStyles } from "@repo/design/Text";
import { Text } from "@repo/design/Text";
import { Wallet } from "@repo/design/icons/Wallet";
import { printDollar, printNumber } from "@repo/lib/print";
import { useAssetPrices } from "@repo/lib/useAssetPrices";
import { useEffect } from "react";
import { formatUnits } from "viem";
import { useShallow } from "zustand/react/shallow";

import { useAssetBalances } from "~/utils/useAssetBalances";
import { useDebounceSync } from "./useDebounceSync";
import { useInputState } from "./useInputState";

type AmountInputProps = {
  isDisabled?: boolean;
};
export function AmountInput({ isDisabled }: AmountInputProps) {
  const [amount, inputAsset] = useInputState(useShallow((s) => [s.amount, s.inputAsset]));
  const { getPrice } = useAssetPrices();
  const getBalance = useAssetBalances().getBalance;

  const syncToURL = useDebounceSync(500);

  function updateText(value: string) {
    useInputState.setState({ amount: value });
    syncToURL();
  }

  const price = inputAsset ? getPrice?.(inputAsset.id) : undefined;
  const dollarAmount = price && amount ? Number(amount) * price : undefined;

  const _dollarAmount = useDebounce(dollarAmount, 200);

  useEffect(() => {
    useInputState.setState({ dollarAmount: _dollarAmount });
    useInputState.getState().validateDollarAmount(_dollarAmount);
  }, [_dollarAmount]);

  const balance = inputAsset
    ? getBalance(inputAsset.contract.network)?.(
        inputAsset.contract.chain_id,
        inputAsset.contract.contract_address,
      )
    : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <NumberInput
          className={`w-full p-0 ${textStyles({ variant: "title-5" })}`}
          onValueChange={(v) => updateText(v.value)}
          value={amount || ""}
          placeholder="0.00"
          disabled={isDisabled}
        />
        <button
          type="button"
          onClick={() =>
            balance && inputAsset
              ? updateText(formatUnits(balance, inputAsset.contract.decimals))
              : updateText("0")
          }
          className="text-theme-button-primary bg-theme-surface-card hover:bg-theme-surface-page rounded-md px-2 py-0"
        >
          <Text variant={"body-3"}>Max</Text>
        </button>
      </div>

      <Text className="text-theme-text-placeholder flex justify-between" variant={"body-2"}>
        <div>{dollarAmount !== undefined ? printDollar(dollarAmount) : ""}</div>
        <div>
          {balance && inputAsset ? (
            <div className="flex items-center gap-1">
              <Wallet className="text-theme-button-primary" />
              {printNumber(formatUnits(balance, inputAsset.contract.decimals))}
            </div>
          ) : null}
        </div>
      </Text>
    </div>
  );
}
