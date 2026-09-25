# Example: Notify

Invented, not taken from a real codebase. One slice, added to an app that already sends digest emails. Chosen to exercise `E`/`R` composition, not just data — and to show the Composition→Correctness loop-back for real, not just diagrammed.

```text
Command ──► Ticket ──► RenderedMessage ──► Receipt
              (claim)      (render+send)      or: release, on failure (retry)
```

## Extract (given, unchanged)

```spec
requirement R1 { source "Each (recipient, message) pair is delivered at most once."
                  establishes { I1 } }
requirement R2 { source "Delivery respects the recipient's preferred channel."
                  establishes { lookupPreferences } }
requirement R3 { source "A failed send does not consume the delivery slot; it can be retried."
                  establishes { releaseDelivery } }

entity Delivery { recipientId: RecipientId, messageId: MessageId, state: DeliveryState }

value RecipientId { invariant self != "" }
value MessageId    { invariant self != "" }
value Ticket        { invariant only constructible by claimDelivery }

state DeliveryState closed { Unclaimed  Claimed  Sent }
transition claim   { from Unclaimed to Claimed }
transition confirm { from Claimed to Sent }
transition release { from Claimed to Unclaimed }

operation claimDelivery(recipientId, messageId) -> Ticket   { errors { AlreadyClaimed } }
operation confirmDelivery(ticket) -> Unit                    { errors { TicketExpired } }
operation releaseDelivery(ticket) -> Unit                    { errors { TicketExpired } }

invariant I1 { at most one Delivery reaches Sent per (recipientId, messageId) }
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
  kind      capability
  found-in  digest-email feature
  covers    submits a rendered message over the recipient's channel
  reuse     reuse-as-is
}
```

No existing owner covers delivery uniqueness (R1) — nothing to reuse there.

## Correctness — first pass

**Cut.** `Delivery`/`DeliveryState`/`I1` share mutable state across `claim`/`confirm`/`release` → one owner. Not found by Survey → new.

```spec
slice Notify
status       accepted
implements   R1 R2 R3
depends      PreferenceStore, Sender      -- existing, from Survey
provides     notify, broadcast
```

```spec
owner Ledger {
  state  one DeliveryState per (recipientId, messageId)
}

algorithm Ledger {
  representation  a map from (recipientId, messageId) to DeliveryState
  argument        claim only succeeds from Unclaimed, so two concurrent
                  claims on the same pair can't both succeed — the
                  second sees Claimed and is rejected, inside the
                  same commit as the first's write
}

rule Ledger {
  commit  claim/confirm/release each apply their whole state change
          in one step; nothing observes a partially-applied transition
}

operation claimDelivery(recipientId, messageId) -> Ticket {
  owner   Ledger
  commit  reject unless the pair is Unclaimed; otherwise mark it
          Claimed and issue a Ticket for it, as one step
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
    ticket = claimDelivery  (before send)
    on success: confirmDelivery(ticket)
    on failure: releaseDelivery(ticket)        -- R3, policy stays visible here
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
STOP — back to Correctness for this concern only
```

## Correctness — second pass (loop-back)

Not traceable to R1/R2/R3 — Extract never mentioned templates. Tagged `design`, but HARD once specced.

```spec
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
  contract  (Preferences, RenderedMessage) -> Effect<Receipt, SendFailed, Sender>
}

protocol RenderedMessage { facts  built from exactly one template version }
protocol Ticket          { facts  proof of a Claimed delivery slot, expires on confirm/release }

boundary renderMessage -> send { protocol RenderedMessage  hides  the template version used }
```

```spec
concern notify {
  kind      capability                -- composite; contains Ledger's operations
  contract  Command -> Effect<Receipt, NotifyError, TemplateCache & PreferenceStore & Ledger & Sender>
}
```

```text
NotifyError = TemplateNotFound | PrefsNotFound | AlreadyClaimed | SendFailed | TicketExpired
              (each concern's own error, unioned — none silently dropped)

notify:
  template = getTemplate(...)
  prefs    = lookupPreferences(recipientId)
  ticket   = claimDelivery(recipientId, messageId)     -- before send, so a
                                                           concurrent notify
                                                           can't double-send
  result   = send(prefs, renderMessage(command, template))
  result is success → confirmDelivery(ticket)
  result is failure → releaseDelivery(ticket)            -- R3, visible here,
                                                             not buried in Ledger
```

**Closure test.** `notify : Command -> Effect<Receipt, NotifyError, ...>` — same shape as any primitive concern. Reused (called per recipient below) and owns a guarantee (R1) → promote.

```spec
concern broadcast {
  kind      capability
  contract  (Command, RecipientId[]) -> Effect<Receipt[], BroadcastError, TemplateCache & PreferenceStore & Ledger & Sender>
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
guarantee R1 { mechanism "Ledger.claim only succeeds from Unclaimed, checked inside one commit"   class GUARANTEED }
guarantee R2 { mechanism "send always takes Preferences from lookupPreferences"                    class GUARANTEED }
guarantee R3 { mechanism "notify calls releaseDelivery on send failure, before returning"           class GUARANTEED }
guarantee I2 { mechanism "getTemplate's snapshot-once read; swap never touches an in-flight render" class GUARANTEED }

attack "confirm a ticket that was never claimed"        { class REJECTED   -- TicketExpired }
attack "claim the same (recipient, message) pair twice"  { class GUARANTEED -- second sees Claimed, same commit }
attack "read mid-swap and get a mixed template"           { class IMPOSSIBLE -- snapshot taken once, before the swap could interleave }
attack "retry after a send failure without releasing"      { class REJECTED   -- next claim on that pair is rejected until released }

verify R1 { test "model test: random claim/confirm/release sequences; assert at most one Sent per pair" }
verify I2 { test "concurrency test: swap the template mid-render; assert the render's output matches one version, never a mix" }

order {
  RecipientId, MessageId, Ticket
  -> DeliveryState + transitions
  -> Ledger (owner)
  -> TemplateCache (owner)
  -> renderMessage
  -> notify (composed)
  -> broadcast (promoted)
  -> boundary adapters to PreferenceStore, Sender
  -> tests
}
```
