type ToAddressProps = Readonly<{
  required: boolean;
  recipient: string;
  useRecipient: boolean;
  onRecipientChanged: (recipient: string) => void;
  onRecipientModeChanged: (enabled: boolean) => void;
}>;

export function ToAddress({
  required,
  recipient,
  useRecipient,
  onRecipientChanged,
  onRecipientModeChanged,
}: ToAddressProps) {
  return (
    <div className="flex flex-col gap-2">
      <label>
        <input
          checked={required || useRecipient}
          disabled={required}
          type="checkbox"
          onChange={(event) => onRecipientModeChanged(event.currentTarget.checked)}
        />
        Send to another address
      </label>
      {(required || useRecipient) && (
        <input
          aria-label="Recipient address"
          placeholder="Destination address"
          value={recipient}
          onChange={(event) => onRecipientChanged(event.currentTarget.value)}
        />
      )}
    </div>
  );
}
