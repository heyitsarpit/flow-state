# Example: Notify

Invented, not taken from a real codebase. Read the complete compiled Spec first; annotations follow it instead of interrupting it with phase-by-phase fragments.

## Complete Spec

```spec
slice Notify
status       accepted
implements   R1 R2 R3
depends      "../preferences/preference-store.spec.md", "../messaging/sender.spec.md"
provides     notify broadcast

requirement R1 { source "Each (recipient, message) pair is delivered at most once."
                 establishes { I1 } }
requirement R2 { source "Delivery respects the recipient's preferred channel."
                 establishes { T1 lookupPreferences } }
requirement R3 { source "A rejected or interrupted send can be retried without duplicate delivery."
                 establishes { T2 resumeDelivery releaseDelivery } }

entity Delivery { recipientId: RecipientId, messageId: MessageId, state: DeliveryState }

value RecipientId { invariant self != "" }
value MessageId   { invariant self != "" }
value DeliveryKey { invariant deterministically derived from (RecipientId, MessageId) }
value Ticket      { invariant only constructible by claimDelivery or resumeDelivery;
                    carries that pair's DeliveryKey }
value DeliveryResult { recipientId: RecipientId, outcome: Receipt | NotifyError }

error AlreadyClaimed      { the pair is already Claimed or Sent }
error NotClaimed          { the pair is not Claimed }
error TicketExpired       { current state no longer accepts this Ticket }
error PreferencesNotFound { no delivery preference exists for the recipient }
error SendRejected        { Sender definitely did not accept the message }
error SendOutcomeUnknown  { Sender acceptance cannot be determined }
error NotifyError         { one-of PreferencesNotFound | AlreadyClaimed | NotClaimed | SendRejected | SendOutcomeUnknown | TicketExpired }

state DeliveryState closed { Unclaimed Claimed Sent }
transition claim   { from Unclaimed to Claimed }
transition resume  { from Claimed to Claimed }
transition confirm { from Claimed to Sent }
transition release { from Claimed to Unclaimed }

operation claimDelivery(recipientId, messageId) -> Ticket {
  errors  { AlreadyClaimed }
  owner   Ledger
  commit  reject unless Unclaimed; otherwise mark Claimed and issue its Ticket
}
operation resumeDelivery(recipientId, messageId) -> Ticket {
  errors  { NotClaimed }
  owner   Ledger
  commit  reject unless Claimed; otherwise reissue the Ticket with its existing DeliveryKey
}
operation confirmDelivery(ticket) -> Unit {
  errors  { TicketExpired }
  owner   Ledger
  commit  reject unless Claimed; otherwise mark Sent
}
operation releaseDelivery(ticket) -> Unit {
  errors  { TicketExpired }
  owner   Ledger
  commit  reject unless Claimed; otherwise mark Unclaimed
}

invariant I1 { every Ticket for one (recipientId, messageId) carries the same DeliveryKey }
temporal T1  { always: notify sends with preferences looked up for that recipient }
temporal T2  { always: a retry for one pair uses that pair's original DeliveryKey }

existing PreferenceStore {
  kind      owner
  found-in  "../preferences/preference-store.spec.md"
  covers    RecipientId -> Preferences
  reuse     reuse-as-is
}
existing Sender {
  kind      concern
  form      capability
  found-in  "../messaging/sender.spec.md"
  covers    idempotent delivery by DeliveryKey; repeating a key returns one Receipt
  reuse     reuse-as-is
}

owner Ledger {
  state  one DeliveryState and stable DeliveryKey per (recipientId, messageId)
}

algorithm Ledger {
  representation  a map from (recipientId, messageId) to { DeliveryState, DeliveryKey }
  argument        claim creates the pair's deterministic key; resume reissues only
                  that key, so every retry reaches Sender under one identity
}

rule Ledger {
  commit  claim, resume, confirm, and release each re-check and publish their
          whole state change as one indivisible decision
}

concern lookupPreferences {
  kind      capability
  input     RecipientId
  returns   Preferences
  fails     PreferencesNotFound
  needs     PreferenceStore
}
concern renderMessage {
  kind      transformer
  input     (Command, Preferences)
  returns   RenderedMessage
}
concern send {
  kind      capability
  input     (DeliveryKey, RenderedMessage)
  returns   Receipt
  fails     SendRejected | SendOutcomeUnknown
  needs     Sender
}
concern notify {
  kind      capability
  input     Command
  returns   Receipt
  fails     NotifyError
  needs     PreferenceStore, Ledger, Sender
  policy    lookup preferences; claim or resume; render; send;
            confirm success, release rejection, keep unknown outcome Claimed for resume
}
concern broadcast {
  kind      capability
  input     (Command, RecipientId[])
  returns   DeliveryResult[]
  needs     PreferenceStore, Ledger, Sender
  policy    run notify for every recipient and collect every outcome
}

protocol Ticket          { facts proof of a Claimed delivery slot; carries its stable DeliveryKey }
protocol RenderedMessage { facts rendered for the Preferences supplied to renderMessage }

boundary renderMessage -> send {
  protocol  RenderedMessage
  hides     preference-specific rendering details
}

guarantee R1 { mechanism "I1 plus Sender idempotency by DeliveryKey"                   class GUARANTEED }
guarantee R2 { mechanism "notify passes freshly looked-up Preferences into rendering" class GUARANTEED }
guarantee R3 { mechanism "rejection releases; unknown outcome resumes the same key"   class GUARANTEED }
guarantee I1 { mechanism "Ledger creates one key and resume only reissues it"          class GUARANTEED }
guarantee T1 { mechanism "notify looks up Preferences before every send"               class GUARANTEED }
guarantee T2 { mechanism "claim and resume expose only the pair's stable DeliveryKey"  class GUARANTEED }

attack "confirm a ticket that was never claimed"       { class REJECTED }
attack "two retries submit the same pair concurrently" { class GUARANTEED }
attack "sender accepts, then notify is interrupted"    { class GUARANTEED }

verify R1 { test "model test plus Sender crash points: retries retain one key and deliver at most once" }
verify R2 { test "each channel renders and sends with its recipient's current preferences" }

order { values -> state and transitions -> Ledger -> concerns -> executable proofs }
```

## Annotations

- In a real repository, `notify.spec.md` sits beside the module containing `Ledger`, its primary owner.
- `PreferenceStore` and `Sender` remain separate Specs beside their own code; this Spec links them instead of embedding them.
- `input` / `returns` / `fails` / `needs` are target-neutral. An Effect realization maps them to `Effect<A, E, R>`.
- `commit` states the indivisible semantic decision. It does not prescribe a lock, `Ref`, database transaction, or other primitive.
- `broadcast` owns the batch policy: collect every recipient result rather than aborting the batch after one failure.
