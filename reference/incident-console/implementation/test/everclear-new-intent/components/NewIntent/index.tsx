import { useState } from "react";
import { AmountInput } from "./AmountInput";
import { Estimates } from "./Estimates";
import { SelectDestinationData } from "./SelectDestinationData";
import { ToAddress } from "./ToAddress";
import { CreateIntentButton } from "./CreateIntentButton";
import {
  useNewIntentAmount,
  useNewIntentCommands,
  useNewIntentEstimates,
  useNewIntentFastPath,
  useNewIntentInvoice,
  useNewIntentRecipient,
  useNewIntentRoute,
  useNewIntentSubmission,
  useNewIntentSubmit,
} from "../../flow-state/react";

export function NewIntent() {
  const route = useNewIntentRoute();
  const amount = useNewIntentAmount();
  const recipient = useNewIntentRecipient();
  const invoice = useNewIntentInvoice();
  const fastPath = useNewIntentFastPath();
  const estimates = useNewIntentEstimates();
  const submission = useNewIntentSubmission();
  const submit = useNewIntentSubmit();
  const commands = useNewIntentCommands();
  const [estimatesOpen, setEstimatesOpen] = useState(false);

  return (
    <section className="flex w-full flex-col gap-4 p-6 sm:w-[30rem]">
      <header className="flex items-center justify-between">
        <h2>New Intent</h2>
        <button type="button" onClick={commands.reset}>
          Clear
        </button>
      </header>

      {invoice.invoice !== null && (
        <p>
          Invoice {invoice.invoice.invoiceId} controls the route.{" "}
          <button type="button" onClick={commands.clearInvoice}>
            Clear invoice
          </button>
        </p>
      )}

      <fieldset disabled={submission.isSubmitting || invoice.lockedByInvoice}>
        <legend>From</legend>
        {route.availableChains.map((chain) => {
          const asset = route.availableAssets.find((candidate) => candidate.chainId === chain.id);
          if (asset === undefined) return null;
          return (
            <button
              aria-pressed={route.originChainId === chain.id}
              key={chain.id}
              type="button"
              onClick={() => commands.selectOrigin(chain.id, asset.id)}
            >
              {chain.name} · {asset.symbol}
            </button>
          );
        })}
      </fieldset>

      <SelectDestinationData
        chains={route.availableChains}
        originChainId={route.originChainId}
        selected={route.destinationChainIds}
        onSave={(chainIds) => commands.saveDestinations(chainIds, null)}
      />
      <AmountInput
        amount={amount.amount}
        asset={route.selectedAsset}
        balance={amount.balance?.availability === "value" ? amount.balance.value.amount : null}
        isDebouncing={amount.isDebouncing}
        isQuoteLoading={amount.isQuoteLoading}
        onChange={commands.changeAmount}
      />
      <ToAddress
        required={recipient.recipientRequired}
        recipient={recipient.recipient}
        useRecipient={recipient.useRecipient}
        onRecipientChanged={commands.changeRecipient}
        onRecipientModeChanged={commands.useRecipient}
      />

      <label>
        <input
          checked={fastPath}
          type="checkbox"
          onChange={(event) => commands.requestFastPath(event.currentTarget.checked)}
        />
        Fast path
      </label>

      <button type="button" onClick={() => setEstimatesOpen((open) => !open)}>
        {estimatesOpen ? "Hide" : "Show"} estimates
      </button>
      <Estimates open={estimatesOpen} rows={estimates.rows} loading={estimates.loading} />

      {estimates.error !== null && <p role="alert">{estimates.error.message}</p>}
      {submission.error !== null && <p role="alert">{submission.error.message}</p>}

      <CreateIntentButton
        route={route}
        amount={amount}
        submission={submission}
        submit={submit}
        onReset={commands.reset}
        onSubmit={commands.submit}
      />

      {submission.submittedIntentId !== null && (
        <a href={`/intents/${submission.submittedIntentId}`}>View {submission.submittedIntentId}</a>
      )}

      {/* Disclosure state stays local because it changes no actor or resource identity. */}
    </section>
  );
}
