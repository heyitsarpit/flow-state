import { useState } from "react";
import type { Chain } from "../../flow-state/domain";

type SelectDestinationDataProps = Readonly<{
  chains: readonly Chain[];
  originChainId: number | null;
  selected: readonly number[];
  onSave: (chainIds: readonly number[]) => void;
}>;

export function SelectDestinationData({
  chains,
  originChainId,
  selected,
  onSave,
}: SelectDestinationDataProps) {
  const [open, setOpen] = useState(false);
  const [draftChains, setDraftChains] = useState<readonly number[]>([]);

  const toggle = (chainId: number) =>
    setDraftChains((current) =>
      current.includes(chainId)
        ? current.filter((candidate) => candidate !== chainId)
        : [...current, chainId],
    );

  return (
    <section>
      <button
        type="button"
        onClick={() => {
          setDraftChains(selected);
          setOpen(true);
        }}
      >
        {selected.length === 0 ? "Select destinations" : `${selected.length} destination(s)`}
      </button>
      {open && (
        <div role="dialog" aria-label="Select destinations">
          {chains
            .filter((chain) => chain.id !== originChainId)
            .map((chain) => (
              <label key={chain.id}>
                <input
                  checked={draftChains.includes(chain.id)}
                  type="checkbox"
                  onChange={() => toggle(chain.id)}
                />
                {chain.name}
              </label>
            ))}
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draftChains);
              setOpen(false);
            }}
          >
            Save
          </button>
        </div>
      )}
    </section>
  );
}
