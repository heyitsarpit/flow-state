import {
  useWalletCommands,
  useWalletConnectedNetworks,
  type NewIntentAmount,
  type NewIntentRoute,
  type NewIntentSubmission,
  type NewIntentSubmit,
} from "../../flow-state/react";

const networkLabels = { evm: "Ethereum", svm: "Solana", tvm: "Tron" };

type CreateIntentButtonProps = Readonly<{
  route: NewIntentRoute;
  amount: NewIntentAmount;
  submission: NewIntentSubmission;
  submit: NewIntentSubmit;
  onReset: () => void;
  onSubmit: () => void;
}>;

export function CreateIntentButton({
  route,
  amount,
  submission,
  submit,
  onReset,
  onSubmit,
}: CreateIntentButtonProps) {
  const connectedNetworks = useWalletConnectedNetworks();
  const walletCommands = useWalletCommands();
  const dialogOpen = submit.isSubmitting || submission.submittedIntentId !== null;
  const showSurvey = submission.submittedIntentId !== null;
  const originNetwork = route.availableChains.find(
    (chain) => chain.id === route.originChainId,
  )?.network;
  const connected = originNetwork
    ? connectedNetworks.includes(originNetwork)
    : connectedNetworks.length > 0;

  const closeDialog = () => {
    if (submit.isSubmitting) return;
    if (submission.submittedIntentId !== null) onReset();
  };

  if (!connected) {
    return (
      <button
        className="w-full"
        disabled={originNetwork === undefined}
        onClick={() => originNetwork !== undefined && walletCommands.connect(originNetwork)}
      >
        Connect {originNetwork === undefined ? "" : networkLabels[originNetwork]} Wallet
      </button>
    );
  }

  const label =
    submission.error?.message ??
    submit.orderBlocker ??
    (submit.isSubmitting
      ? "Building Transaction…"
      : submit.miniAppMode
        ? "Bridge Funds"
        : "Create Intent");

  return (
    <div className="w-full">
      {showSurvey && <div id="survey-container" />}
      <button
        className="w-full"
        disabled={!submit.canSubmit || submit.isSubmitting || submit.orderBlocker !== null}
        onClick={onSubmit}
      >
        {label}
      </button>

      {dialogOpen && (
        <section aria-label="Confirmation Steps" role="dialog">
          <h3>Confirmation Steps</h3>
          <p>
            Netting {amount.amount} {route.selectedAsset?.symbol ?? ""} for{" "}
            {route.destinationChainIds.length} chain
            {route.destinationChainIds.length === 1 ? "" : "s"}
          </p>
          <ol>
            {submission.steps.map((step) => (
              <li key={step.id}>
                {step.label}: {step.status}
              </li>
            ))}
          </ol>
          {submission.submittedIntentId !== null && <p>Intent Created</p>}
          <button disabled={submit.isSubmitting} onClick={closeDialog}>
            Close
          </button>
        </section>
      )}

      {/* The submission workflow owns side effects; this component only renders its progress. */}
    </div>
  );
}
