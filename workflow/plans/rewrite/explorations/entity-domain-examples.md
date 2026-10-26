# Entity domain examples: five apps in both styles

Status: worked examples for comparing two tier-1 surfaces, not a design. Each app is written in:

- **Coordinator style** (`entity-coordinator.md` draft 1): operations build their results from
  entity picks; a domain declares `reads`, `writes` and `feeds` with `answer`, `change`, `load`,
  `when` closures and `ignoreChanges` lists.
- **Domain style** (`entity-domain.md` draft 2): operations are plain; a domain reads as sentences
  with `read`, `write`, `listen`, `.one`, `.list`, `.where`, `.unaffectedBy`, `.predicts`.

Both are tier 1 (`entities.md` section 3.3): fields change at once, lists change when their
refetch lands, and nothing predicts list membership. Operation bodies (`lookup`, `commit`) are
elided; only what differs between the styles is shown.

---

## 1. Chat

Channels, messages and users. Messages are pushed live; reactions change constantly and must not
refetch the channel; a sent message appears when the server confirms it.

### Coordinator style

```ts
// chat/operations.ts
export const channelMessages = resource({
  id: "chat/channel-messages",
  key: (input: { channelId: string }) => input,
  result: Schema.Struct({
    messages: Schema.Array(Message.pick("channelId", "body", "author", "reactions", "sentAt")),
    hasMore: Schema.Boolean,
  }),
  …
});
export const unreadCount = resource({
  id: "chat/unread",
  key: (input: { channelId: string }) => input,
  result: Schema.Struct({ count: Schema.Number }),
  …
});
export const editMessage = transaction({ id: "chat/edit", input: EditInput, result: Message, … });
export const react = transaction({ id: "chat/react", input: ReactInput, result: Message, … });
export const messageEvents = stream({ id: "chat/events", … }); // emits EntityChange<Message>

// chat/domain.ts
export const ChatDomain = domain({
  id: "chat",
  entities: [Channel, Message, User],
  owns: [ChatApi],
  reads: {
    messages: answer(channelMessages, {
      Message: {
        when: (message, input) => message.channelId === input.channelId,
        ignoreChanges: ["body", "author", "reactions"],
      },
    }),
    unread: answer(unreadCount, {
      Message: { when: (message, input) => message.channelId === input.channelId },
    }),
  },
  writes: {
    edit: change(editMessage, {
      optimistic: (input) => [Message.patch(input.key, () => ({ body: input.body }))],
    }),
    react: change(react, {
      optimistic: (input) => [Message.patch(input.key, (m) => ({
        reactions: addReaction(m.reactions, input.emoji),
      }))],
    }),
  },
  feeds: { events: feed(messageEvents, [Message]) },
});
```

### Domain style

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

### Coordinator style

```ts
export const myAccounts = resource({ id: "bank/my-accounts", key: () => ({}),
  result: Schema.Array(Account.pick("ownerId", "name", "balance")), … });
export const statement = resource({
  id: "bank/statement",
  key: (input: { accountId: string; from: string; to: string }) => input,
  result: Schema.Struct({
    txns: Schema.Array(Txn.pick("accountId", "amount", "postedAt", "memo")),
  }),
  …
});
export const transfer = transaction({ id: "bank/transfer", input: TransferInput,
  result: Schema.Struct({ from: Account, to: Account }), concurrency: "reject", … });

export const BankDomain = domain({
  id: "bank",
  entities: [Account, Txn],
  owns: [BankApi],
  reads: {
    accounts: answer(myAccounts, {
      Account: { when: (account, _input, principal) => account.ownerId === principal.userId,
                 ignoreChanges: ["name", "balance"] },
    }),
    statement: answer(statement, {
      Txn: { when: (txn, input) => txn.accountId === input.accountId &&
                                   txn.postedAt >= input.from && txn.postedAt < input.to,
             ignoreChanges: ["memo"] },
    }),
  },
  writes: {
    transfer: change(transfer, {
      optimistic: (input) => [
        Account.patch(input.from, (a) => ({ balance: a.balance - input.amount })),
        Account.patch(input.to, (a) => ({ balance: a.balance + input.amount })),
      ],
      affects: () => [Txn.all],
      order: "perRecord",
    }),
  },
});
```

### Domain style

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
transfer. The coordinator style's `when` needs a third argument for the principal and writes the
range as JavaScript, which the runtime can call but tools cannot index.

---

## 3. Calendar

Recurring events expanded into occurrences, keyed by their original start so a drag never changes
the key. A week view is a time range.

### Coordinator style

```ts
export const week = resource({
  id: "cal/week",
  key: (input: { calendarId: string; from: string; to: string }) => input,
  result: Schema.Struct({
    occurrences: Schema.Array(Occurrence.pick("calendarId", "startsAt", "endsAt", "title")),
  }),
  …
});

export const CalendarDomain = domain({
  id: "calendar",
  entities: [Event, Occurrence],
  owns: [CalendarApi],
  reads: {
    week: answer(week, {
      Occurrence: {
        when: (o, input) => o.calendarId === input.calendarId &&
                            o.startsAt < input.to && o.endsAt > input.from,
        ignoreChanges: ["title", "startsAt", "endsAt"], // a drag inside the week moves nothing
      },
    }),
  },
  writes: {
    move: change(moveOccurrence, {
      optimistic: (input) => [Occurrence.patch(input.key, () => ({
        startsAt: input.startsAt, endsAt: input.endsAt,
      }))],
    }),
    editSeries: change(editSeries, { affects: () => [Occurrence.all] }),
  },
});
```

### Domain style

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
changes occurrences the client cannot list, so every open week refetches. Domain style needs an
`overlaps` operator, one more than the vocabulary in `entity-domain.md` section 4.2.

---

## 4. Admin back-office

Users with roles, a filterable and searchable table, a count badge, and a bulk archive that writes
audit entries.

### Coordinator style

```ts
export const usersTable = resource({
  id: "admin/users",
  key: (input: { statuses?: Array<Status>; roleId?: string; q?: string; page: number }) => input,
  result: Schema.Struct({ users: Schema.Array(User.pick("name", "email", "status", "roleId")),
                          total: Schema.Number }),
  …
});

export const AdminDomain = domain({
  id: "admin",
  entities: [User, Role, AuditEntry],
  owns: [AdminApi],
  reads: {
    users: answer(usersTable, {
      User: {
        when: (user, input) =>
          (!input.statuses || input.statuses.includes(user.status)) &&
          (!input.roleId || user.roleId === input.roleId),
        ignoreChanges: ["name", "email"],
      },
    }),
    activeCount: answer(activeUserCount, { User: { when: (user) => user.status === "active" } }),
  },
  writes: {
    archive: change(archiveUsers, {
      optimistic: (input) => [User.patch(input.keys, () => ({ status: "archived" }))],
      affects: () => [AuditEntry.all],
    }),
  },
});
```

### Domain style

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

**A semantic question both styles must answer.** An optional input (`statuses` absent) means "no
filter". In domain style, `oneOf(record.status, input.statuses)` with `statuses` absent must mean
"any": operators must define absent inputs as no constraint. The coordinator style writes that
logic by hand in the closure.

---

## 5. File manager

Folders contain files and folders. A folder's listing returns both kinds in one array; folder sizes
are computed by the server.

### Coordinator style

```ts
export const folderContents = resource({
  id: "files/contents",
  key: (input: { folderId: string }) => input,
  result: Schema.Struct({
    items: Schema.Array(Schema.Union(File.pick("parentId", "name", "size"),
                                     Folder.pick("parentId", "name"))),
  }),
  …
});

export const FilesDomain = domain({
  id: "files",
  entities: [File, Folder],
  owns: [FilesApi],
  reads: {
    contents: answer(folderContents, {
      File: { when: (file, input) => file.parentId === input.folderId, ignoreChanges: ["name"] },
      Folder: { when: (folder, input) => folder.parentId === input.folderId,
                ignoreChanges: ["name"] },
    }),
    folderSize: answer(folderSize, {
      File: { when: () => true }, // any file anywhere below may change it
    }),
  },
  writes: {
    moveFile: change(moveFile, {
      optimistic: (input) => [File.patch(input.key, () => ({ parentId: input.to }))],
    }),
  },
});
```

### Domain style

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

| | Coordinator style | Domain style |
| --- | --- | --- |
| reading it cold | closures and lists inside nested objects; the entity and its policy are keyed by name | one sentence per entry; library words are verbs |
| conditions | JavaScript in `when`: anything goes, but tools cannot index it and mistakes in it are silent | operators: indexable, checked, but limited to what the operators can say |
| optional inputs | written by hand (`!input.statuses \|\|`) | must be defined by the operators (absent means no constraint) |
| ranges and principals | JavaScript and an extra `when` argument | `between`, `overlaps`, `principal()` |
| result shapes | picks written in every operation's result | inferred from plain structs at `.one` and `.list` |
| two results in one response (a transfer) | the response Schema names both picks | two `.one` places |
| a mixed list (files and folders) | a union of picks in the operation | two `.list`s at one place; needs a discriminator rule |
| operation modules | import entities | import nothing from the entity layer |

**Gaps the examples found in domain style:** an `overlaps` operator for intervals; a defined meaning
for absent inputs in operators; a rule for two entity types in one array. None of them changes the
model; each is a decision to record.
