# Example: Notify

Invented, not taken from a real codebase. A Notify slice added to an app that already sends digest emails; Composition discovers one dependent slice. Chosen to exercise `E`/`R` composition and the Composition→Correctness loop-back.

```text
Command ──► Ticket ──► RenderedMessage ──► Receipt
           (claim/resume)   (idempotent send)   or: release on definite rejection
```

## Extract (given, unchanged)

```spec
requirement R1 { source "Each (recipient, message) pair is delivered at most once."
                  establishes { I1 } }
requirement R2 { source "Delivery respects the recipient's preferred channel."
                  establishes { T1 lookupPreferences } }
requirement R3 { source "A rejected or interrupted send can be retried without duplicate delivery."
                  establishes { T2 resumeDelivery releaseDelivery } }

entity Delivery { recipientId: RecipientId, messageId: MessageId, state: DeliveryState }

value RecipientId { invariant self != "" }
value MessageId    { invariant self != "" }
value DeliveryKey   { invariant deterministically derived from (RecipientId, MessageId) }
value Ticket        { invariant only constructible by claimDelivery or resumeDelivery;
                      carries that pair's DeliveryKey }

state DeliveryState closed { Unclaimed  Claimed  Sent }
transition claim   { from Unclaimed to Claimed }
transition resume  { from Claimed to Claimed }
transition confirm { from Claimed to Sent }
transition release { from Claimed to Unclaimed }

operation claimDelivery(recipientId, messageId) -> Ticket   { errors { AlreadyClaimed } }
operation resumeDelivery(recipientId, messageId) -> Ticket  { errors { NotClaimed } }
operation confirmDelivery(ticket) -> Unit                    { errors { TicketExpired } }
operation releaseDelivery(ticket) -> Unit                    { errors { TicketExpired } }

invariant I1 { every Ticket for one (recipientId, messageId) carries the same DeliveryKey }
temporal T1  { always: notify sends with preferences looked up for that recipient }
temporal T2  { always: a retry for one pair uses that pair's original DeliveryKey }
```

## Survey

```text
new requirements touch:  recipient preferences · sending · delivery uniqueness
      │
      ▼
walk outward one hop from each
```

```spec
existing PreferenceStore {
  kind      owner
  found-in  digest-email feature
  covers    RecipientId -> Preferences, keyed by channel
  reuse     reuse-as-is
}

existing Sender {
  kind      concern
  form      capability
  found-in  digest-email feature
  covers    idempotent submit by DeliveryKey; repeating a key returns one Receipt
            without delivering twice
  reuse     reuse-as-is
}
```

No existing owner coordinates the local delivery state — nothing to reuse there.

## Correctness — first pass

**Cut.** `Delivery`/`DeliveryState`/`I1` share mutable state across `claim`/`confirm`/`release` → one owner. Not found by Survey → new.

```spec
slice Notify
status       accepted
implements   R1 R2 R3
depends      TemplateAccess, PreferenceStore, Sender
provides     notify, broadcast
```

```spec
owner Ledger {
  state  one DeliveryState and stable DeliveryKey per (recipientId, messageId)
}

algorithm Ledger {
  representation  a map from (recipientId, messageId) to { DeliveryState, DeliveryKey }
  argument        claim creates the pair's deterministic DeliveryKey;
                  resume reissues only that key, so every retry reaches
                  Sender under the same idempotency identity
}

rule Ledger {
  commit  claim/resume/confirm/release each apply their whole state change
          in one step; nothing observes a partially-applied transition
}

operation claimDelivery(recipientId, messageId) -> Ticket {
  owner   Ledger
  commit  reject unless the pair is Unclaimed; otherwise mark it
          Claimed and issue a Ticket for it, as one step
}
operation resumeDelivery(recipientId, messageId) -> Ticket {
  owner   Ledger
  commit  reject unless the pair is Claimed; otherwise reissue a Ticket
          carrying the pair's existing DeliveryKey, without changing state
}
operation confirmDelivery(ticket) -> Unit {
  owner   Ledger
  commit  reject unless the ticket's pair is Claimed; otherwise mark
          it Sent, as one step
}
operation releaseDelivery(ticket) -> Unit {
  owner   Ledger
  commit  reject unless the ticket's pair is Claimed; otherwise mark
          it Unclaimed again, as one step                              -- [R3]
}
```

## Composition

```text
Command ──► render ──► RenderedMessage ──┐
                                           ├──► send ──► Receipt
              prefs = lookupPreferences ──┘
    ticket = claimDelivery, or resumeDelivery if already Claimed
    on success: confirmDelivery(ticket)
    on definite rejection: releaseDelivery(ticket)
    on interruption or unknown outcome: keep Claimed; retry the same DeliveryKey
```

Naming `render`: it needs a message template. Templates are hot-swappable by an admin elsewhere in the app — mid-render, a swap must never hand back half of one template and half of the next.

```text
naming `render` as a concern
        │
        ▼
does it own state 2+ operations could leave inconsistent?
   (a template swap, mid-read, could hand back a mixed template)
        │ yes
        ▼
STOP — Correctness starts a dependent Spec for this owner
```

## Correctness — dependent slice (loop-back)

Not traceable to R1/R2/R3 — Extract never mentioned templates. Composition therefore starts a separate `TemplateAccess` Spec, shown inline here only to demonstrate the handoff.

```spec
slice TemplateAccess
status       accepted
implements   I2 (design)
depends      none
provides     getTemplate

invariant I2 { design: a render always sees one single template version, start to finish }

owner TemplateCache {
  state  the current template version, swapped by an admin action outside this slice
}

algorithm TemplateCache {
  representation  a version pointer, swapped atomically
  argument        a reader takes a snapshot of the pointer once, at the
                  start of a render, and reads only that snapshot —
                  a concurrent swap changes the pointer, never the
                  snapshot already taken
}

rule TemplateCache {
  commit  the swap replaces the pointer in one step; no lock is held
          while a render is in progress, because renders never touch
          the live pointer after their snapshot
}

operation getTemplate(templateId) -> Template {
  owner   TemplateCache
  commit  take a snapshot of the current version for this render
}
```

## Composition, resumed

```spec
concern renderMessage {
  kind      transformer
  contract  (Command, Template) -> RenderedMessage
}
concern lookupPreferences {
  kind      capability
  contract  RecipientId -> Effect<Preferences, PrefsNotFound, PreferenceStore>
}
concern send {
  kind      capability
  contract  (DeliveryKey, Preferences, RenderedMessage) -> Effect<Receipt, SendRejected | SendOutcomeUnknown, Sender>
}

protocol RenderedMessage { facts  built from exactly one template version }
protocol Ticket          { facts  proof of a Claimed delivery slot; carries its stable DeliveryKey }

boundary renderMessage -> send { protocol RenderedMessage  hides  the template version used }
```

```spec
concern notify {
  kind      capability                -- composite; contains Ledger's operations
  contract  Command -> Effect<Receipt, NotifyError, TemplateCache | PreferenceStore | Ledger | Sender>
}
```

```text
NotifyError = TemplateNotFound | PrefsNotFound | DeliveryClaimFailed
            | SendRejected | SendOutcomeUnknown | TicketExpired
              (each concern's own error, unioned — none silently dropped)

notify:
  template = getTemplate(...)
  prefs    = lookupPreferences(recipientId)
  ticket   = claimDelivery(recipientId, messageId)
             or resumeDelivery(recipientId, messageId) if already Claimed
  result   = send(ticket.deliveryKey, prefs, renderMessage(command, template))
  result is success → confirmDelivery(ticket)
  result is SendRejected → releaseDelivery(ticket)       -- definitely not accepted
  result is SendOutcomeUnknown or interruption → keep Claimed;
                                                   retry resumes the same key
```

**Closure test.** `notify : Command -> Effect<Receipt, NotifyError, ...>` — same shape as any primitive concern. Reused (called per recipient below) and owns a guarantee (R1) → promote.

```spec
concern broadcast {
  kind      capability
  contract  (Command, RecipientId[]) -> Effect<Receipt[], BroadcastError, TemplateCache | PreferenceStore | Ledger | Sender>
}
```

```text
broadcast = notify applied to each recipient
policy, visible here: collect every result; one recipient's SendFailed
does not abort the batch                          -- workflow policy, not
                                                       buried in notify
```

## Verify

```spec
guarantee R1 { mechanism "I1 gives every retry one DeliveryKey; Sender is idempotent by that key" class GUARANTEED }
guarantee R2 { mechanism "send always takes Preferences from lookupPreferences"                    class GUARANTEED }
guarantee R3 { mechanism "definite rejection releases; unknown outcome resumes the same key"       class GUARANTEED }
guarantee I1 { mechanism "Ledger creates one deterministic key and resume only reissues it"         class GUARANTEED }
guarantee T1 { mechanism "notify obtains Preferences immediately before send"                       class GUARANTEED }
guarantee T2 { mechanism "claim and resume expose only the pair's stable DeliveryKey"                class GUARANTEED }
guarantee I2 { mechanism "getTemplate's snapshot-once read; swap never touches an in-flight render" class GUARANTEED }

attack "confirm a ticket that was never claimed"        { class REJECTED   -- TicketExpired }
attack "two retries submit the same pair concurrently"   { class GUARANTEED -- same DeliveryKey; Sender deduplicates }
attack "sender accepts, then notify is interrupted"      { class GUARANTEED -- retry resumes and resubmits the same key }
attack "read mid-swap and get a mixed template"          { class GUARANTEED -- snapshot-once algorithm }

verify R1 { test "model test plus fake Sender crash points: every retry keeps one key and produces at most one delivery" }
verify I2 { test "concurrency test: swap the template mid-render; assert the render's output matches one version, never a mix" }

order {
  RecipientId, MessageId, DeliveryKey, Ticket
  -> DeliveryState + transitions
  -> Ledger (owner)
  -> TemplateAccess Spec -> TemplateCache (owner)
  -> renderMessage
  -> notify (composed)
  -> broadcast (promoted)
  -> boundary adapters to PreferenceStore, Sender
  -> tests
}
```
