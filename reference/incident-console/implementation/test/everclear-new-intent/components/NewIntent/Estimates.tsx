import type { CompetitorEstimate } from "../../flow-state/domain";

type EstimatesProps = Readonly<{
  open: boolean;
  rows: readonly CompetitorEstimate[];
  loading: boolean;
}>;

export function Estimates({ open, rows, loading }: EstimatesProps) {
  if (!open) return null;
  return (
    <section aria-label="Route estimates">
      {rows.length === 0 ? (
        <p>{loading ? "Calculating…" : "Complete the form to estimate this route."}</p>
      ) : (
        <ul>
          {rows.map((estimate) => (
            <li key={estimate.provider}>
              {estimate.provider}: ${estimate.feeUsd.toFixed(2)}, about {estimate.etaSeconds}s
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
