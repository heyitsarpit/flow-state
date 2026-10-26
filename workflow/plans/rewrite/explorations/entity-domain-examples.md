# Entity domain examples: five apps in both styles

Status: worked examples of `entity-domain.md`, the tier-1 proposal, across five very different
apps. They are not a design. Each shows the domain declaration and what happens at runtime: fields
change at once, lists change when their refetch lands, and nothing predicts list membership.
Operation bodies (`lookup`, `commit`) are elided. A side-by-side comparison with the coordinator
style is in git history at commit `ad129cc4`.

---

## 1. Chat

Channels, messages and users. Messages are pushed live; reactions change constantly and must not
refetch the channel; a sent message appears when the server confirms it.

```ts
// chat/operations.ts: plain structs, no entity imports
export const channelMessages = resource({
  id: "chat/channel-messages",
  key: (input: { channelId: string }) => input,
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
    .unaffectedBy("body", "author", "reactions"),

  unread: read(unreadCount)
    .count(Message)
    .where(({ input, record }) => eq(record.channelId, input.channelId)),

  edit: write(editMessage)
    .one(Message)
    .predicts(({ input }) => Message.patch(input.key, { body: input.body })),

  react: write(react)
    .one(Message)
    .predicts(({ input }) =>
      Message.patch(input.key, (m) => ({ reactions: addReaction(m.reactions, input.emoji) }))),

  events: listen(messageEvents).as((event) =>
    event.type === "removed" ? Message.delete({ messageId: event.messageId })
                             : Message.save(event.message)),
});
```

**What happens.** An edit or a reaction shows at once in every place the message appears and never
refetches the channel. A pushed new message is not in any list yet, so `messages` for its channel
refetches (a `posted` event changes `channelId` from nothing to the channel); the newest page
returns it. A message being sent is shown from the composer machine's memory until it appears.

---

## 2. Banking

Accounts and transactions. A transfer changes two balances; the server creates transaction rows the
response does not return; statements are date ranges.

```ts
export const BankDomain = domain("bank", { api: BankApi }, {
  accounts: read(myAccounts)
    .list(Account, ({ result }) => result)
    .where(({ record }) => eq(record.ownerId, principal()))
    .unaffectedBy("name", "balance"),

  statement: read(statement)
    .list(Txn, ({ result }) => result.txns)
    .where(({ input, record }) => and(
      eq(record.accountId, input.accountId),
      between(record.postedAt, input.from, input.to),
    ))
    .unaffectedBy("memo"),

  transfer: write(transfer)
    .one(Account, ({ result }) => result.from)
    .one(Account, ({ result }) => result.to)
    .predicts(({ input }) => [
      Account.patch(input.from, (a) => ({ balance: a.balance - input.amount })),
      Account.patch(input.to, (a) => ({ balance: a.balance + input.amount })),
    ])
    .alsoChanges(() => Txn.all)
    .oneAtATimePerRecord(),
});
```

**What happens.** Both balances move at once; the response replaces them with the server's values.
The new transaction rows are not in the response, so `alsoChanges` makes every open statement
stale, and they refetch. The accounts list ignores balance changes, so it does not refetch on every
transfer. The principal and the date range are conditions as data, so the repair join can index
them.

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
    .unaffectedBy("title", "startsAt", "endsAt"),

  move: write(moveOccurrence)
    .one(Occurrence)
    .predicts(({ input }) =>
      Occurrence.patch(input.key, { startsAt: input.startsAt, endsAt: input.endsAt })),

  editSeries: write(editSeries).alsoChanges(() => Occurrence.all),
});
```

**What happens.** A drag shows at once. Because the times are in `unaffectedBy`, the week refetches
only when the occurrence crosses its edge (enters or leaves the condition). Editing a series
changes occurrences the client cannot list, so every open week refetches. Domain style uses the
`overlaps` operator, added to `entity-domain.md` section 4.2 after this example.

---

## 4. Admin back-office

Users with roles, a filterable and searchable table, a count badge, and a bulk archive that writes
audit entries.

```ts
export const AdminDomain = domain("admin", { api: AdminApi }, {
  users: read(usersTable)
    .list(User, ({ result }) => result.users)
    .where(({ input, record }) => oneOf(record.status, input.statuses))
    .where(({ input, record }) => eq(record.roleId, input.roleId))
    .unaffectedBy("name", "email"),

  activeCount: read(activeUserCount)
    .count(User)
    .where(({ record }) => eq(record.status, "active")),

  archive: write(archiveUsers)
    .list(User, ({ result }) => result.archived)
    .predicts(({ input }) => User.patch(input.keys, { status: "archived" }))
    .alsoChanges(() => AuditEntry.all),
});
```

**What happens.** Archived rows show "archived" at once, and the table refetches when the archive
settles, because `status` is a condition field. The count refetches too. A user the server failed
to archive is not in `result.archived`, so its predicted status is held and the refetch shows the
truth.

**Absent inputs.** With `statuses` absent, `oneOf(record.status, input.statuses)` means any status,
so a table opened with no status filter keeps archived users after an archive: they still meet the
condition.

---

## 5. File manager

Folders contain files and folders. A folder's listing returns both kinds in one array; folder sizes
are computed by the server.

```ts
export const FilesDomain = domain("files", { api: FilesApi }, {
  contents: read(folderContents)
    .list(File, ({ result }) => result.items)
    .list(Folder, ({ result }) => result.items)
    .where(({ input, record }) => eq(record.parentId, input.folderId))
    .unaffectedBy("name"),

  folderSize: read(folderSize).count(File), // no condition: any file change may matter

  moveFile: write(moveFile)
    .one(File)
    .predicts(({ input }) => File.patch(input.key, { parentId: input.to })),
});
```

**What happens.** A moved file shows its new folder at once; both folders' listings refetch when
the move settles. A rename never refetches a listing. `folderSize` has no condition the client can
evaluate (it sums a subtree), so it depends on every file change: correct, chatty, and honest.

**A question this app raises.** `.list(File, …)` and `.list(Folder, …)` at the same place need the
union's members to be told apart. Inference must pick, per element, the entity whose key fields it
carries, or the author names a discriminator. The type spike decides which.

---

## 6. What the examples show

- **Conditions stay data in every app**: equality (chat, files), `oneOf` with absent inputs (admin),
  ranges and intervals (banking, calendar), and `principal()` (banking). None needed a closure.
- **Writes that change other records the response does not carry** (banking's transaction rows,
  calendar series edits) use `.alsoChanges`; the cost is a refetch, never a stale screen.
- **Two records in one response** (a transfer) are two `.one` places; **two entity types in one
  array** (files and folders) are two `.list`s at one place.
- **Answers the client cannot evaluate** (a folder's size over a subtree, a search) have no
  condition and depend on every change to the entity: correct, chatty and honest.
- **The examples settled three rules** now in `entity-domain.md` section 4: the `overlaps` operator,
  absent inputs meaning "no constraint", and matching two entity types at one place by key fields or
  a tagged union.
