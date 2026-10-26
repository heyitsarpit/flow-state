# Entity domain examples: five apps

Status: worked examples of `entity-domain.md` (draft 7), the tier-1 proposal, across five very
different apps. They are not a design. Each shows the domain declaration and what happens at
runtime: fields change at once, lists change when their refetch lands, and nothing predicts list
membership. Operation bodies (`lookup`, `commit`) are elided. A side-by-side comparison with the
coordinator style is in git history at commit `ad129cc4`.

Every example relies on section 2.2 of the proposal: a field a list only displays never repairs
it, because the record store keeps every copy right. Only condition fields, order fields and
`.alsoChanges` targets do.

---

## 1. Chat

Channels, messages and users. Messages are pushed live and paged backwards; reactions change
constantly and must not refetch the channel; a sent message appears when the server confirms it.

```ts
// chat/operations.ts: plain structs, no entity imports
export const channelMessages = resource({
  id: "chat/channel-messages",
  key: (input: { channelId: string; before?: string }) => input,
  result: Schema.Struct({ messages: Schema.Array(MessageRow), hasMore: Schema.Boolean }),
  …
});
export const messageEvents = stream({ id: "chat/events", … });
// emits { type: "posted" | "edited", message } | { type: "removed", messageId }

// chat/domain.ts
export const ChatDomain = domain("chat", { api: ChatApi }, {
  messages: read(channelMessages)
    .list(Message, ({ result }) => result.messages)
    .where(({ input, record }) => eq(record.channelId, input.channelId))
    .orderBy(({ record }) => [desc(record.sentAt), asc(record.messageId)])
    .pagedBy(({ input }) => input.before),

  unread: read(unreadCount)
    .derivedFrom(Message)
    .where(({ input, record }) => eq(record.channelId, input.channelId)),

  edit: write(editMessage)
    .one(Message)
    .predicts(({ input }) => Message.patch(input.key, { body: input.body })),

  react: write(react)
    .one(Message)
    .predicts(({ input }) =>
      Message.patch(input.key, (m) => ({ reactions: addReaction(m.reactions, input.emoji) }))),

  remove: write(deleteMessage).predicts(({ input }) => Message.delete(input.key)),

  events: listen(messageEvents).as((event) =>
    event.type === "removed" ? Message.delete({ messageId: event.messageId })
                             : Message.save(event.message)),
});
```

**What happens.** An edit or a reaction shows at once wherever the message appears and never
refetches the channel: `body` and `reactions` are neither condition nor order fields, so no
`.unaffectedBy` is needed. Two quick reactions to one message queue, and each prediction is
replayed over the server's reaction list when it changes, so neither is lost. A pushed new message
enters the channel's condition, so `messages` refetches every loaded page and the newest page
returns it. A message being sent is shown from the composer machine's memory until it appears. A
deleted message disappears at once and returns only if the delete fails.

---

## 2. Banking

Accounts and transactions. A transfer changes two balances; the server creates transaction rows the
response does not return; statements are date ranges.

```ts
export const BankDomain = domain("bank", { api: BankApi }, {
  accounts: read(myAccounts)
    .list(Account, ({ result }) => result)
    .where(({ record }) => eq(record.ownerId, principal()))
    .orderBy(({ record }) => [asc(record.name), asc(record.accountId)]),

  statement: read(statement)
    .list(Txn, ({ result }) => result.txns)
    .where(({ input, record }) => and(
      eq(record.accountId, input.accountId),
      between(record.postedAt, input.from, input.to),
    ))
    .orderBy(({ record }) => [desc(record.postedAt), asc(record.txnId)]),

  transfer: write(transfer)
    .one(Account, ({ result }) => result.from)
    .one(Account, ({ result }) => result.to)
    .predicts(({ input }) => [
      Account.patch(input.from, (a) => ({ balance: a.balance - input.amount })),
      Account.patch(input.to, (a) => ({ balance: a.balance + input.amount })),
    ])
    .alsoChanges(({ input }) => [
      Txn.where(({ record }) => eq(record.accountId, input.from.accountId)),
      Txn.where(({ record }) => eq(record.accountId, input.to.accountId)),
    ]),
});
```

**What happens.** Both balances move at once and are confirmed by the response. Transfers touching
one account queue, so a second transfer's prediction is computed over the first's confirmed
balance. The new transaction rows are not in the response, so `.alsoChanges` makes the two
accounts' open statements stale; statements of other accounts stay fresh. The accounts list is
ordered by name, so a balance change never refetches it. The principal and the date range are
conditions as data, so the repair join can index them.

---

## 3. Calendar

Recurring events expanded into occurrences, keyed by their original start so a drag never changes
the key. A week view is a time range.

```ts
export const CalendarDomain = domain("calendar", { api: CalendarApi }, {
  week: read(week)
    .list(Occurrence, ({ result }) => result.occurrences)
    .where(({ input, record }) => and(
      eq(record.calendarId, input.calendarId),
      overlaps(record.startsAt, record.endsAt, input.from, input.to),
    ))
    .orderBy(({ record }) => [asc(record.startsAt), asc(record.occurrenceId)]),

  move: write(moveOccurrence)
    .one(Occurrence)
    .predicts(({ input }) =>
      Occurrence.patch(input.key, { startsAt: input.startsAt, endsAt: input.endsAt })),

  editSeries: write(editSeries)
    .alsoChanges(({ input }) =>
      Occurrence.where(({ record }) => and(
        eq(record.calendarId, input.calendarId),
        eq(record.seriesId, input.seriesId),
      ))),
});
```

**What happens.** A drag shows at once. The start time is both a condition field and the order, so
the week refetches when the move settles; a title change never refetches it. Editing a series
can add, move or remove occurrences in any week, so every open week of that calendar refetches.
Weeks of other calendars stay fresh, because the target and the week share the `calendarId`
condition; the week has no `seriesId` condition, so the series alone cannot narrow it further.

---

## 4. Admin back-office

Users with roles, a filterable, paged table, a count badge, and a bulk archive that writes audit
entries.

```ts
export const AdminDomain = domain("admin", { api: AdminApi }, {
  users: read(usersTable)
    .list(User, ({ result }) => result.users)
    .where(({ input, record }) => oneOf(record.status, input.statuses))
    .where(({ input, record }) => eq(record.roleId, input.roleId))
    .orderBy(({ record }) => [asc(record.name), asc(record.userId)])
    .pagedBy(({ input }) => input.page),

  activeCount: read(activeUserCount)
    .derivedFrom(User)
    .where(({ record }) => eq(record.status, "active")),

  archive: write(archiveUsers)
    .list(User, ({ result }) => result.archived)
    .predicts(({ input }) => User.patch(input.keys, { status: "archived" }))
    .alsoChanges(() => AuditEntry.all),
});
```

**What happens.** Archived rows show "archived" at once. When the archive settles, the table
refetches every loaded page, because `status` is a condition field, and the count refetches too. An
email change refetches nothing. A user the server failed to archive is not in `result.archived`, so
its predicted status stays unconfirmed until the table's refetch, which started after the archive
settled, confirms the truth.

**Absent inputs.** With `statuses` absent, `oneOf(record.status, input.statuses)` means any status,
so a table opened with no status filter keeps archived users after an archive: they still meet the
condition.

**A hidden filter.** If the server also hides deactivated users and the domain does not say so, a
deactivation repairs nothing: `deactivated` is in neither the condition nor the order. The skip
audit reports `HiddenFilter` in development; the fix is `eq(record.deactivated, false)`.

---

## 5. File manager

Folders contain files and folders. A folder's listing returns both kinds in one array; folder sizes
are computed by the server.

```ts
export const FilesDomain = domain("files", { api: FilesApi }, {
  contents: read(folderContents)
    .list(File, ({ result }) => result.items, { kind: "file" })
    .list(Folder, ({ result }) => result.items, { kind: "folder" })
    .where(({ input, record }) => eq(record.parentId, input.folderId))
    .orderBy(({ record }) => [asc(record.name), asc(record.id)]),

  folderSize: read(folderSize)
    .derivedFrom(File, ({ record }) => [record.size])
    .where(({ input, record }) => serverMatches(input.folderId, record.parentId)),

  moveFile: write(moveFile)
    .one(File)
    .predicts(({ input }) => File.patch(input.key, { parentId: input.to })),
});
```

**What happens.** A moved file shows its new folder at once; both folders' listings refetch when
the move settles. A rename refetches the listing it is in, because the listing is ordered by name.
`folderSize` sums a subtree the client cannot compute, so `serverMatches(input.folderId,
record.parentId)` says the server decides membership from `parentId`: every open size refetches
when a file moves anywhere, or when any file's size changes. Correct, chatty and honest; leaving the
condition out would be a `flow check` error, because `input.folderId` would be unused. Files and
folders share the key field name `id`, so the listing is a tagged union and each `.list` names its
member (proposal section 4.1); `record` in `contents` has the fields both share (`id`, `parentId`,
`name`).

---

## 6. What the examples show

- **No example lists unaffected fields.** Declaring the condition and the order is enough, because
  displayed fields are kept right by the store. `.unaffectedBy` is left for server-ranked results
  such as search (proposal section 3.3).
- **Conditions stay data in every app**: equality (chat, files), `oneOf` with absent inputs (admin),
  ranges and intervals (banking, calendar), and `principal()` (banking). None needed a closure.
- **Writes that change records the response does not carry** (banking's transaction rows, calendar
  series edits, audit entries) use `.alsoChanges`, narrowed with `Entity.where` where the input
  says which records; the cost is a refetch of the matching answers, never a stale screen.
- **Paged lists** (chat, admin) refetch all loaded pages together on a repair.
- **Deletes** (chat) are predictions: the record hides at once and returns on failure.
- **Queues are the default** for predicting writes, which is what makes two quick reactions or two
  transfers on one account safe without a word in the domain.
- **Two records in one response** (a transfer) are two `.one` places; **two entity types in one
  array** (files and folders) are two `.list`s at one place.
- **Answers the client cannot evaluate** (a folder's size over a subtree, a search) declare what the
  server reads with `serverMatches`; a change to those fields repairs them. Leaving it out is a
  `flow check` error, since the input that drives it would be unused.
- **Every order ends with the key**, so a sort key the server uses and the domain omits is caught on
  the first response.
