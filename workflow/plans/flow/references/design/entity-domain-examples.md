# Entity domain examples: seven apps

Status: worked examples of `entity-domain.md` (final), the tier-1 proposal, across seven very
different apps. They are not a design. Each shows the domain declaration and what happens at
runtime: fields change at once, lists change when their refetch lands, and nothing predicts list
membership. Operation bodies (`lookup`, `commit`) are elided, and "what happens" describes a write
that succeeds unless it says otherwise.

Every example relies on section 2.3 of the proposal: a field a list only displays never repairs it,
because the record store keeps every copy right. Only condition fields, order fields, derived
fields and `.alsoChanges` targets do.

---

## 1. Chat

Channels, messages and users. Messages are pushed live and paged backwards; reactions change
constantly and must not refetch the channel; a sent message appears when the server confirms it.

```ts
// chat/operations.ts: plain structs, no entity imports
export const channelMessages = resource({
  id: "chat/channel-messages",
  key: (input: { channelId: string; before?: string }) => input,
  result: Schema.Struct({
    messages: Schema.Array(MessageRow),
    older: Schema.optional(Schema.String), // the cursor of the next, older page
  }),
  …
});
export const messageEvents = stream({ id: "chat/events", … });
// emits { type: "posted" | "edited", message } | { type: "removed", messageId, revision }

// chat/domain.ts
export const ChatDomain = domain("chat", {
  messages: read(channelMessages)
    .list(Message, ({ result }) => result.messages)
    .where(({ input, record }) => eq(record.channelId, input.channelId))
    .orderBy(({ record }) => [desc(record.sentAt), asc(record.messageId)])
    .pagedBy(({ input }) => input.before, ({ result }) => result.older),

  unread: read(unreadCount)
    .derivedFrom(Message, ({ record }) => [record.readByMe])
    .where(({ input, record }) => eq(record.channelId, input.channelId)),

  edit: write(editMessage)
    .one(Message)
    .predicts(({ input }) => Message.patch(input.key, { body: input.body })),

  react: write(react)
    .one(Message)
    .predicts(({ input }) => Message.patch(input.key, {
      reactions: (m) => addReaction(m.reactions, input.emoji),
    })),

  remove: write(deleteMessage).predicts(({ input }) => Message.delete(input.key)),

  events: listen(messageEvents).as([Message], (event) =>
    event.type === "removed"
      ? Message.delete({ messageId: event.messageId }, { version: event.revision })
      : Message.save(event.message)),
});
```

**What happens.** An edit or a reaction shows at once wherever the message appears, and a
successful one never refetches the channel: `body` and `reactions` are neither condition nor order
fields. Two quick reactions to one message queue, and each prediction is replayed over the server's
reaction list when it changes, so neither is lost. A pushed new message enters the channel's
condition, so `messages` rebuilds its loaded pages from the newest, taking each older cursor from
the page just fetched, and publishes them together. A message being sent is shown from the composer
machine's memory until it appears. A deleted message disappears at once and returns only if the
delete fails. Removals carry a version, so a late `edited` push cannot bring a deleted message back.

---

## 2. Banking

Accounts and transactions. A transfer changes two balances; the server creates transaction rows the
response does not return; statements are date ranges.

```ts
export const BankDomain = domain("bank", {
  accounts: read(myAccounts)
    .list(Account, ({ result }) => result)
    .where(({ record, input }) => eq(record.ownerId, input.ownerId))
    .orderBy(({ record }) => [asc(record.name), asc(record.accountId)]),

  statement: read(statement)
    .list(Txn, ({ result }) => result.txns)
    .where(({ input, record }) =>
      and(eq(record.accountId, input.accountId), between(record.postedAt, input.from, input.to)),
    )
    .orderBy(({ record }) => [desc(record.postedAt), asc(record.txnId)]),

  transfer: write(transfer)
    .one(Account, ({ result }) => result.from)
    .one(Account, ({ result }) => result.to)
    .predicts(({ input }) => [
      Account.patch(input.from, { balance: (a) => a.balance - input.amount }),
      Account.patch(input.to, { balance: (a) => a.balance + input.amount }),
    ])
    .alsoChanges(({ input }) => [
      Txn.where(({ record }) => eq(record.accountId, input.from.accountId)),
      Txn.where(({ record }) => eq(record.accountId, input.to.accountId)),
    ]),
});
```

**What happens.** Both balances move at once and are confirmed by the response. Transfers touching
an account queue on it; a second transfer's prediction shows at once, stacked on the first, and is
replayed over the first's confirmed balance when that lands. Its `commit` receives `basedOn`, the
balance versions it was predicted over, so a server that checks them rejects a transfer computed on
a stale balance. The new transaction rows are not in the response, so `.alsoChanges` makes the two
accounts' open statements stale; statements of other accounts stay fresh. The accounts list is
ordered by name, so a balance change never refetches it.

**Uncertain.** If the transfer's response is lost, both accounts' loaders and every answer holding
them refetch, and both accounts are marked `uncertain` until the machine reconciles the attempt (the
transfer API deduplicates by `attempt.id`, so the machine can ask) or a later transfer succeeds.

---

## 3. Calendar

Recurring events expanded into occurrences, keyed so a drag never changes the key. A week view is a
time range, and the view places occurrences by their times, not by list order.

```ts
export const CalendarDomain = domain("calendar", {
  week: read(week)
    .list(Occurrence, ({ result }) => result.occurrences)
    .where(({ input, record }) =>
      and(
        eq(record.calendarId, input.calendarId),
        overlaps(record.startsAt, record.endsAt, input.from, input.to),
      ),
    )
    .unordered(),

  move: write(moveOccurrence)
    .one(Occurrence)
    .predicts(({ input }) =>
      Occurrence.patch(input.key, { startsAt: input.startsAt, endsAt: input.endsAt }),
    ),

  editSeries: write(editSeries).alsoChanges(({ input }) =>
    Occurrence.where(({ record }) =>
      and(eq(record.calendarId, input.calendarId), eq(record.seriesId, input.seriesId)),
    ),
  ),
});
```

**What happens.** A drag shows at once, because the view places the occurrence by its predicted
times. The week is `.unordered()`, so it refetches only when the occurrence crosses its edge (enters
or leaves the range); a title change never refetches it. Editing a series can add, move or remove
occurrences in any week, so every open week of that calendar refetches; weeks of other calendars
stay fresh, because the target and the week share the `calendarId` condition.

---

## 4. Admin back-office

Users with roles, a filterable, paged table, a count badge, and a bulk archive that writes audit
entries.

```ts
export const AdminDomain = domain("admin", {
  users: read(usersTable)
    .list(User, ({ result }) => result.users)
    .where(({ input, record }) => oneOf(record.status, input.statuses))
    .where(({ input, record }) => eq(record.roleId, input.roleId))
    .orderBy(({ record }) => [asc(record.name), asc(record.userId)])
    .pagedBy(
      ({ input }) => input.page,
      ({ result }) => result.nextPage,
    ),

  activeCount: read(activeUserCount)
    .derivedFrom(User, ({ record }) => [record.status])
    .where(({ record }) => eq(record.status, "active")),

  archive: write(archiveUsers)
    .list(User, ({ result }) => result.archived)
    .predicts(({ input }) => User.patch(input.keys, { status: "archived" }))
    .alsoChanges(() => AuditEntry.all),
});
```

**What happens.** Archived rows show "archived" at once. A table filtered to active users loses them
when the archive settles: they leave its condition, so it rebuilds its loaded pages. The count
refetches too. An email change refetches nothing. A user the server failed to archive is not in
`result.archived`, so its predicted status stays unconfirmed until the table's refetch, which
started after the archive settled, confirms the truth.

**Absent inputs.** With `statuses` absent, `oneOf(record.status, input.statuses)` means any status,
so an archive changes neither membership nor order and the unfiltered table does not refetch; the
archived users stay, showing their new status.

**A hidden filter.** If the server also hides deactivated users and the domain does not say so, a
deactivation repairs nothing: `deactivated` is in neither the condition nor the order. Audit mode
reports `HiddenFilter`; the fix is `eq(record.deactivated, false)`.

---

## 5. File manager

Folders contain files and folders. A folder's listing returns both kinds in one array, as a tagged
union; folder sizes are computed by the server over a subtree.

```ts
export const FilesDomain = domain("files", {
  contents: read(folderContents)
    .list(File, ({ result }) => result.items, { kind: "file" })
    .list(Folder, ({ result }) => result.items, { kind: "folder" })
    .where(({ input, record }) => eq(record.parentId, input.folderId))
    .orderBy(({ record }) => [asc(record.name), asc(record.kind), asc(record.id)]),

  folderSize: read(folderSize)
    .derivedFrom(
      File,
      ({ record }) => [record.size],
      ({ input, record }) => serverMatches(input.folderId, record.parentId),
    )
    .derivedFrom(
      Folder,
      ({ record }) => [record.parentId],
      ({ input, record }) => serverMatches(input.folderId, record.parentId),
    ),

  moveFile: write(moveFile)
    .one(File)
    .predicts(({ input }) => File.patch(input.key, { parentId: input.to })),
});
```

**What happens.** A moved file shows its new folder at once; both folders' listings refetch when the
move settles. A rename refetches the listing it is in, because the listing is ordered by name.
`folderSize` sums a subtree the client cannot compute, so `serverMatches` says the server decides
membership from `parentId`: every open size refetches when a file or a folder moves anywhere, or
when any file's size changes. Correct, chatty and honest; leaving the condition out would be a `flow
check` error, because `input.folderId` would be unused. Files and folders share the key field `id`,
so the order puts the union's tag before it and stays total.

---

## 6. Kanban board

Boards, columns and cards. Dragging a card between columns must move it at once; each column shows a
card count.

```ts
export const BoardDomain = domain("board", {
  columns: read(columnsOfBoard)
    .list(Column, ({ result }) => result.columns)
    .where(({ input, record }) => eq(record.boardId, input.boardId))
    .orderBy(({ record }) => [asc(record.position), asc(record.columnId)]),

  cards: read(cardsOfBoard) // one board-level read; the view groups by column and sorts by position
    .list(Card, ({ result }) => result.cards)
    .where(({ input, record }) => eq(record.boardId, input.boardId))
    .unordered(),

  counts: read(cardCounts) // result: { counts: [{ columnId, count }] }
    .derivedFrom(Card, ({ record }) => [record.columnId])
    .where(({ input, record }) => eq(record.boardId, input.boardId)),

  moveCard: write(moveCard)
    .one(Card)
    .predicts(({ input }) =>
      Card.patch(input.key, {
        columnId: input.toColumn,
        position: input.position, // computed by the machine from its neighbours
      }),
    )
    .alsoChanges(({ input }) =>
      Card.where(({ record }) =>
        and(eq(record.boardId, input.boardId), eq(record.columnId, input.toColumn)),
      ),
    ),
});
```

**What happens.** The card moves at once: the board's `cards` holds every card, and the view groups
them by the predicted `columnId` and sorts by `position` (proposal section 5.5, Moves). `cards` is
`.unordered()` and its condition is the board, so the move's own fields would not refetch it; the
counts refetch because they are derived from `columnId`. But the server renumbers the destination
column's positions, which the response does not carry, so `.alsoChanges` names them, and `cards`,
which overlaps that target, refetches once when the move settles. Per-column reads would show the
move only after their refetch, which is why the board reads cards at board level.

---

## 7. Cart and checkout

A cart singleton with lines, product prices that change on the server, and checkout creating an
order.

```ts
export const ShopDomain = domain("shop", {
  cart: read(myCart).one(Cart), // a singleton: the key comes from the response

  lines: read(cartLines)
    .list(CartLine, ({ result }) => result.lines)
    .where(({ input, record }) => eq(record.cartId, input.cartId))
    .orderBy(({ record }) => [asc(record.lineId)]),

  quote: read(cartQuote)
    .derivedFrom(
      CartLine,
      ({ record }) => [record.productId, record.quantity],
      ({ input, record }) => eq(record.cartId, input.cartId),
    )
    .derivedFrom(
      Product,
      ({ record }) => [record.price],
      ({ input, record }) => serverMatches(input.cartId, record.productId),
    ),

  setQuantity: write(setQuantity)
    .one(CartLine)
    .predicts(({ input }) => CartLine.patch(input.key, { quantity: input.quantity })),

  checkout: write(placeOrder)
    .one(Order)
    .alsoChanges(({ input }) => [
      Cart.all,
      CartLine.where(({ record }) => eq(record.cartId, input.cartId)),
    ]),

  orders: read(orderHistory)
    .list(Order, ({ result }) => result.orders)
    .where(({ record, input }) => eq(record.customerId, input.customerId))
    .orderBy(({ record }) => [desc(record.placedAt), asc(record.orderId)])
    .pagedBy(
      ({ input }) => input.page,
      ({ result }) => result.nextPage,
    ),

  prices: listen(priceEvents).as([Product], (event) => Product.save(event.product)),
});
```

**What happens.** A quantity change shows at once and the quote refetches when it settles, because
it is derived from `quantity`. A pushed price change refetches the quote of every cart, since the
client cannot tell which carts hold the product. A line's `price` is a `CartLine` field, the price
when it was added, so it never overwrites the live `Product.price`. Checkout creates an order, which
enters the order history's condition, and empties the cart, which the `.alsoChanges` targets
refetch. If checkout's response is lost, the cart is `uncertain`; whether the order was placed is
the machine's question to the API, using `attempt.id`, never a retry the library makes.

---

## 8. What the examples show

- **No example lists unaffected fields.** Declaring the condition and the order, or saying the order
  does not matter, is enough, because displayed fields are kept right by the store. `.unaffectedBy`
  is for server-ranked results such as search (proposal section 3.3).
- **Conditions stay data**: equality, `oneOf` with absent inputs, ranges and intervals,
  the signed-in account as an input field, and `serverMatches` where only the server can decide (a subtree, a cart's
  products).
- **Writes that change records the response does not carry** use `.alsoChanges`, narrowed with
  `Entity.where` where the input says which records.
- **Paged lists** declare where the next page's input is, and a repair rebuilds every loaded page.
- **Instant moves** come from reading the parent-level list and grouping in the view.
- **Deletes** are predictions: the record hides at once and returns on failure; versioned deletes
  cannot be undone by a late save.
- **Queues are the default** for predicting writes, which makes two quick reactions or two transfers
  on one account safe without a word in the domain.
- **Uncertain writes** end in an honest `uncertain` status and a question the machine asks the API.
- **Every order is total**, ending with the key, and a union's tag comes before a shared key.
