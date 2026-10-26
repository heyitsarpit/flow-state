import { Schema, Effect } from "effect"
import {
  entity, resource, transaction, stream, read, write, listen, domain, definition, invalidate,
  eq, oneOf, between, overlaps, and, serverMatches, principal, asc, desc,
} from "./lib.js"

const S = Schema.String, N = Schema.Number, B = Schema.Boolean
const ok = <T>(v: T) => () => Effect.succeed(v as any)
const commit = () => Effect.succeed({} as any)

// ---------------- notes (section 3) ----------------
export const User = entity({ id: "users/User", fields: { userId: S, name: S }, primaryKey: ["userId"] })
export const Note = entity({
  id: "notes/Note",
  fields: { noteId: S, workspaceId: S, folderId: S, title: S, body: S, pinned: B, author: User, revision: N },
  primaryKey: ["noteId"], version: "revision",
})
const NoteRow = Schema.Struct({ noteId: S, folderId: S, title: S, pinned: B, author: Schema.Struct({ userId: S, name: S }), revision: N })
const NoteKey = Schema.Struct({ noteId: S })

export const notesInFolder = resource({ id: "notes/in-folder", key: (input: { folderId: string; cursor?: string }) => input,
  lookup: ok(0), result: Schema.Struct({ notes: Schema.Array(NoteRow), next: Schema.optional(S) }) })
export const noteById = resource({ id: "notes/by-id", key: (i: { noteId: string }) => i, lookup: ok(0), result: NoteRow })
export const pinnedCount = resource({ id: "notes/pinned-count", key: () => ({}), lookup: ok(0), result: N })
export const searchNotes = resource({ id: "notes/search", key: (i: { workspaceId: string; q: string }) => i, lookup: ok(0),
  result: Schema.Struct({ hits: Schema.Array(Schema.Struct({ score: N, highlight: S, note: Schema.Struct({ noteId: S, title: S, body: S, workspaceId: S }) })) }) })
export const renameNote = transaction({ id: "notes/rename", input: Schema.Struct({ key: NoteKey, title: S }), result: NoteRow, commit })
export const moveNote = transaction({ id: "notes/move", input: Schema.Struct({ key: NoteKey, to: S }), result: NoteRow, commit })
export const createNote = transaction({ id: "notes/create", input: Schema.Struct({ folderId: S, title: S }), result: NoteRow, commit })
export const deleteNote = transaction({ id: "notes/delete", input: Schema.Struct({ key: NoteKey }), result: Schema.Struct({}), commit })
export const noteEvents = stream({ id: "notes/events", key: (i: { workspaceId: string }) => i,
  event: Schema.Union([Schema.Struct({ type: Schema.Literal("noteSaved"), note: NoteRow }),
                       Schema.Struct({ type: Schema.Literal("noteDeleted"), noteId: S, revision: N })]) })

export const NotesDomain = domain("notes", {
  noteById: read(noteById).one(Note).byKey(({ input }) => ({ noteId: input.noteId })),
  inFolder: read(notesInFolder)
    .list(Note, ({ result }) => result.notes)
    .where(({ input, record }) => eq(record.folderId, input.folderId))
    .orderBy(({ record }) => [desc(record.pinned), asc(record.title), asc(record.noteId)])
    .pagedBy(({ input }) => input.cursor, ({ result }) => result.next),
  pinnedCount: read(pinnedCount)
    .derivedFrom(Note, ({ record }) => [record.pinned])
    .where(({ record }) => eq(record.pinned, true)),
  search: read(searchNotes)
    .list(Note, ({ result }) => result.hits.note)
    .where(({ input, record }) => and(
      eq(record.workspaceId, input.workspaceId),
      serverMatches(input.q, record.title, record.body),
    )),
  ranked: read(notesInFolder)
    .list(Note, ({ result }) => result.notes)
    .where(({ input, record }) => eq(record.folderId, input.folderId))
    .ignoring(({ input }) => [input.cursor])
    .unaffectedBy("pinned", "author"),
  create: write(createNote).one(Note),
  rename: write(renameNote).one(Note).predicts(({ input }) => Note.patch(input.key, { title: input.title })),
  move: write(moveNote).one(Note).predicts(({ input }) => Note.patch(input.key, { folderId: input.to })),
  remove: write(deleteNote).predicts(({ input }) => Note.delete(input.key)),
  events: listen(noteEvents).as([Note], (event) =>
    event.type === "noteSaved" ? Note.save(event.note) : Note.delete({ noteId: event.noteId }, { version: event.revision })),
})

// a nested path in a condition
export const byAuthor = resource({ id: "notes/by-author", key: (i: { userId: string }) => i, lookup: ok(0), result: Schema.Array(NoteRow) })
export const AuthorDomain = domain("author", {
  notes: read(byAuthor).list(Note, ({ result }) => result)
    .where(({ input, record }) => eq(record.author.userId, input.userId))
    .orderBy(({ record }) => [asc(record.noteId)]),
})

// ---------------- todos (section 3.5) ----------------
const TodoRow = Schema.Struct({ todoId: S, text: S, done: B })
export const Todo = entity({ id: "todos/Todo", fields: TodoRow.fields, primaryKey: ["todoId"] })
export const todos = resource({ id: "todos/list", key: () => ({}), lookup: ok(0), result: Schema.Array(TodoRow) })
export const addTodo = transaction({ id: "todos/add", input: Schema.Struct({ text: S }), result: TodoRow, commit })
export const toggleTodo = transaction({ id: "todos/toggle", input: Schema.Struct({ key: Schema.Struct({ todoId: S }), done: B }), result: TodoRow, commit })
export const removeTodo = transaction({ id: "todos/remove", input: Schema.Struct({ key: Schema.Struct({ todoId: S }) }), result: Schema.Struct({}), commit })
export const TodosDomain = domain("todos", {
  list: read(todos).list(Todo, ({ result }) => result),
  add: write(addTodo).one(Todo),
  toggle: write(toggleTodo).one(Todo).predicts(({ input }) => Todo.patch(input.key, { done: input.done })),
  remove: write(removeTodo).predicts(({ input }) => Todo.delete(input.key)),
})

// ---------------- banking (example 2): two places, per-field functions, targets ----------------
export const Account = entity({ id: "bank/Account", fields: { accountId: S, ownerId: S, name: S, balance: N, version: N }, primaryKey: ["accountId"], version: "version" })
export const Txn = entity({ id: "bank/Txn", fields: { txnId: S, accountId: S, postedAt: N, amount: N }, primaryKey: ["txnId"] })
const AccountRow = Schema.Struct({ accountId: S, ownerId: S, name: S, balance: N, version: N })
const AccountKey = Schema.Struct({ accountId: S })
export const myAccounts = resource({ id: "bank/accounts", key: () => ({}), lookup: ok(0), result: Schema.Array(AccountRow) })
export const statement = resource({ id: "bank/statement", key: (i: { accountId: string; from?: number; to?: number }) => i, lookup: ok(0),
  result: Schema.Struct({ txns: Schema.Array(Schema.Struct({ txnId: S, accountId: S, postedAt: N, amount: N })) }) })
export const transfer = transaction({ id: "bank/transfer", input: Schema.Struct({ from: AccountKey, to: AccountKey, amount: N }),
  result: Schema.Struct({ from: AccountRow, to: AccountRow }), commit })
export const BankDomain = domain("bank", {
  accounts: read(myAccounts).list(Account, ({ result }) => result)
    .where(({ record }) => eq(record.ownerId, principal()))
    .orderBy(({ record }) => [asc(record.name), asc(record.accountId)]),
  statement: read(statement).list(Txn, ({ result }) => result.txns)
    .where(({ input, record }) => and(eq(record.accountId, input.accountId), between(record.postedAt, input.from, input.to)))
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
})

// ---------------- calendar (example 3): overlaps, unordered ----------------
export const Occurrence = entity({ id: "cal/Occurrence", fields: { occurrenceId: S, calendarId: S, seriesId: S, title: S, startsAt: N, endsAt: N }, primaryKey: ["occurrenceId"] })
const OccRow = Schema.Struct({ occurrenceId: S, calendarId: S, seriesId: S, title: S, startsAt: N, endsAt: N })
export const week = resource({ id: "cal/week", key: (i: { calendarId: string; from: number; to: number }) => i, lookup: ok(0), result: Schema.Struct({ occurrences: Schema.Array(OccRow) }) })
export const moveOcc = transaction({ id: "cal/move", input: Schema.Struct({ key: Schema.Struct({ occurrenceId: S }), startsAt: N, endsAt: N }), result: OccRow, commit })
export const editSeries = transaction({ id: "cal/edit-series", input: Schema.Struct({ calendarId: S, seriesId: S, title: S }), result: Schema.Struct({}), commit })
export const CalendarDomain = domain("calendar", {
  week: read(week).list(Occurrence, ({ result }) => result.occurrences)
    .where(({ input, record }) => and(eq(record.calendarId, input.calendarId), overlaps(record.startsAt, record.endsAt, input.from, input.to)))
    .unordered(),
  move: write(moveOcc).one(Occurrence).predicts(({ input }) => Occurrence.patch(input.key, { startsAt: input.startsAt, endsAt: input.endsAt })),
  editSeries: write(editSeries).alsoChanges(({ input }) =>
    Occurrence.where(({ record }) => and(eq(record.calendarId, input.calendarId), eq(record.seriesId, input.seriesId)))),
})

// ---------------- admin (example 4): oneOf with absent input, array keys, constants ----------------
export const AdminUser = entity({ id: "admin/User", fields: { userId: S, name: S, email: S, status: S, roleId: S }, primaryKey: ["userId"] })
export const AuditEntry = entity({ id: "admin/Audit", fields: { auditId: S }, primaryKey: ["auditId"] })
const AdminRow = Schema.Struct({ userId: S, name: S, email: S, status: S, roleId: S })
export const usersTable = resource({ id: "admin/users", key: (i: { statuses?: readonly string[]; roleId: string; page?: number }) => i, lookup: ok(0),
  result: Schema.Struct({ users: Schema.Array(AdminRow), nextPage: Schema.optional(N) }) })
export const activeCount = resource({ id: "admin/active-count", key: () => ({}), lookup: ok(0), result: N })
export const archiveUsers = transaction({ id: "admin/archive", input: Schema.Struct({ keys: Schema.Array(Schema.Struct({ userId: S })) }),
  result: Schema.Struct({ archived: Schema.Array(AdminRow) }), commit })
export const AdminDomain = domain("admin", {
  users: read(usersTable).list(AdminUser, ({ result }) => result.users)
    .where(({ input, record }) => oneOf(record.status, input.statuses))
    .where(({ input, record }) => eq(record.roleId, input.roleId))
    .orderBy(({ record }) => [asc(record.name), asc(record.userId)])
    .pagedBy(({ input }) => input.page, ({ result }) => result.nextPage),
  activeCount: read(activeCount).derivedFrom(AdminUser, ({ record }) => [record.status]).where(({ record }) => eq(record.status, "active")),
  archive: write(archiveUsers).list(AdminUser, ({ result }) => result.archived)
    .predicts(({ input }) => AdminUser.patch(input.keys, { status: "archived" }))
    .alsoChanges(() => AuditEntry.all),
})

// ---------------- files (example 5): tagged union at one place, several derivedFrom ----------------
export const File = entity({ id: "files/File", fields: { id: S, kind: Schema.Literal("file"), parentId: S, name: S, size: N }, primaryKey: ["id"] })
export const Folder = entity({ id: "files/Folder", fields: { id: S, kind: Schema.Literal("folder"), parentId: S, name: S }, primaryKey: ["id"] })
const FileRow = Schema.Struct({ id: S, kind: Schema.Literal("file"), parentId: S, name: S, size: N })
const FolderRow = Schema.Struct({ id: S, kind: Schema.Literal("folder"), parentId: S, name: S })
export const folderContents = resource({ id: "files/contents", key: (i: { folderId: string }) => i, lookup: ok(0),
  result: Schema.Struct({ items: Schema.Array(Schema.Union([FileRow, FolderRow])) }) })
export const folderSize = resource({ id: "files/size", key: (i: { folderId: string }) => i, lookup: ok(0), result: N })
export const moveFile = transaction({ id: "files/move", input: Schema.Struct({ key: Schema.Struct({ id: S }), to: S }), result: FileRow, commit })
export const FilesDomain = domain("files", {
  contents: read(folderContents)
    .list(File, ({ result }) => result.items, { kind: "file" })
    .list(Folder, ({ result }) => result.items, { kind: "folder" })
    .where(({ input, record }) => eq(record.parentId, input.folderId))
    .orderBy(({ record }) => [asc(record.name), asc(record.kind), asc(record.id)]),
  folderSize: read(folderSize)
    .derivedFrom(File, ({ record }) => [record.size], ({ input, record }) => serverMatches(input.folderId, record.parentId))
    .derivedFrom(Folder, ({ record }) => [record.parentId], ({ input, record }) => serverMatches(input.folderId, record.parentId)),
  moveFile: write(moveFile).one(File).predicts(({ input }) => File.patch(input.key, { parentId: input.to })),
})

// ---------------- social (cross-entity prediction, Entity.fields target) ----------------
export const Post = entity({ id: "social/Post", fields: { postId: S, commentCount: N, likedByMe: B }, primaryKey: ["postId"] })
export const Comment = entity({ id: "social/Comment", fields: { commentId: S, postId: S, text: S }, primaryKey: ["commentId"] })
export const addComment = transaction({ id: "social/comment", input: Schema.Struct({ post: Schema.Struct({ postId: S }), text: S }),
  result: Schema.Struct({ commentId: S, postId: S, text: S }), commit })
export const SocialDomain = domain("social", {
  comment: write(addComment).one(Comment)
    .alsoChanges(({ input }) => Post.fields(input.post, ({ record }) => [record.commentCount]))
    .predicts(({ input }) => Post.patch(input.post, { commentCount: (p) => p.commentCount + 1 })),
})

// ---------------- shop (example 7): singleton, pick ----------------
export const Cart = entity({ id: "shop/Cart", fields: { cartId: S, itemCount: N }, primaryKey: ["cartId"] })
export const CartLine = entity({ id: "shop/CartLine", fields: { lineId: S, cartId: S, productId: S, quantity: N, price: N }, primaryKey: ["lineId"] })
export const myCart = resource({ id: "shop/cart", key: () => ({}), lookup: ok(0), result: Schema.Struct({ cartId: S, itemCount: N }) })
export const cartLines = resource({ id: "shop/lines", key: (i: { cartId: string }) => i, lookup: ok(0),
  result: Schema.Struct({ lines: Schema.Array(Schema.Struct({ lineId: S, cartId: S, productId: S, quantity: N, price: N })) }) })
export const ShopDomain = domain("shop", {
  cart: read(myCart).one(Cart),
  lines: read(cartLines).list(CartLine.pick("cartId", "productId", "quantity"), ({ result }) => result.lines)
    .where(({ input, record }) => eq(record.cartId, input.cartId))
    .orderBy(({ record }) => [asc(record.lineId)]),
})

// ---------------- a machine (decision 6, paged handle) ----------------
export const Editor = definition({
  id: "notes/Editor",
  memory: Schema.Struct({ noteId: S, folderId: S, draft: S, noteKey: NoteKey }),
  operations: { Notes: NotesDomain },
  setup: (O) => [
    O.Notes.noteById.subscribe(({ memory }) => ({ noteId: memory.noteId })),
    O.Notes.inFolder.subscribe(({ memory }) => ({ folderId: memory.folderId })),
    O.Notes.inFolder.more(({ memory }) => ({ folderId: memory.folderId })),
    O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }), { writes: [invalidate(Note.all)] }),
  ],
})
